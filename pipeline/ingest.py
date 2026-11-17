#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pipeline/ingest.py
Pipeline principal de ingesta incremental y sincronización con Supabase.
Se ejecuta en GitHub Actions cada martes a las 03:00 UTC (05:00 Europe/Madrid).

Por competición:
 1. Plantillas Opta → equipos y perfil de jugadores (altura, peso, pie, dorsal, equipo actual).
 2. Calendario → solo partidos jugados que aún no están en la caché de la temporada.
 3. matchevent + matchstats (en paralelo) → demarcación real y +100 métricas por jugador.
 4. Supabase: matches, player_match_stats (por lotes; reanudable si se corta).
 5. Recalcula la temporada: scores 0-9.9 por partido y de temporada, percentiles y radar.
 6. Fotos de jugadores (Opta, si no FotMob) y escudos (FotMob) → Supabase Storage (solo los que falten).
 7. Liga del equipo actual de cada jugadora (FotMob) y su logo → leagues + Storage.
"""

import argparse
import json
import logging
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# Cargar automáticamente variables de .env si existe
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / '.env')
    load_dotenv(Path(__file__).parent.parent / '.env.local')
except ImportError:
    for env_file in (Path(__file__).parent.parent / '.env', Path(__file__).parent.parent / '.env.local'):
        if env_file.exists():
            with open(env_file, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        k, v = line.split('=', 1)
                        os.environ.setdefault(k.strip(), v.strip())

import pandas as pd

from .adapter import OptaSDAPIAdapter
from .config import BUCKET_PIPELINE_CACHE, MAX_WORKERS_DESCARGA, NIVEL_LIGA, NIVEL_LIGA_DEFECTO, es_internacional, es_selecciones
from .events import match_metadata
from .metrics_engine import MetricsEngine
from .fotos_jugadoras import sincronizar_fotos_jugadoras
from .photos import FotMobClient, sincronizar_fotos
from .ligas import sincronizar_ligas
from .soccerdonna import SDClient
from .scoring import SCORE_COLS, calcular_similares, calcular_temporada, filas_season_stats, sumar_acumulados
from .storage import Store, chunked, competiciones_objetivo, get_supabase_client

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger("ScoutingIngest")

LOTE_PARTIDOS = 25  # se persiste en BD y caché cada N partidos

# Columnas nativas de player_match_stats (el resto de métricas va a la caché parquet)
STAT_COLS = [
    'formation', 'slot', 'demarcacion', 'grupo_demarcacion', 'minutes_played', 'is_starter', 'is_captain',
    'goals', 'assists', 'xg', 'xa', 'xca', 'passes_completed', 'passes_total', 'passes_pct',
    'progressive_passes', 'tackles_won', 'tackles_total', 'interceptions', 'recoveries',
    'aerials_won', 'aerials_total', 'takeons_successful', 'takeons_total', 'fouls',
    'yellow_cards', 'red_cards',
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _foot(val: Optional[str]) -> Optional[str]:
    return {'left': 'left', 'right': 'right', 'both': 'both'}.get(str(val or '').lower())


def _homogeneo(rows: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    """PostgREST exige las mismas claves en todas las filas de un upsert."""
    grupos: Dict[tuple, List[Dict[str, Any]]] = {}
    for r in rows:
        grupos.setdefault(tuple(sorted(r)), []).append(r)
    return list(grupos.values())


class IngestionPipeline:
    def __init__(self, dry_run: bool = False, max_matches_per_comp: Optional[int] = None,
                 skip_photos: bool = False, refresh_photos: bool = False, rebuild: bool = False):
        self.dry_run = dry_run
        self.max_matches_per_comp = max_matches_per_comp
        self.skip_photos = skip_photos
        self.refresh_photos = refresh_photos
        self.rebuild = rebuild
        self.adapter = OptaSDAPIAdapter()
        self.fotmob = FotMobClient()
        self.sd = SDClient()
        client = None
        if not dry_run:
            client = get_supabase_client()  # sin credenciales válidas mejor fallar que simular
        self.store = Store(client)
        self.totales = {'matches': 0, 'player_rows': 0, 'season_rows': 0, 'photos': 0, 'badges': 0}

    # ── Plantillas ───────────────────────────────────────────
    def sync_squads(self, comp: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
        """Upsert de equipos y perfil de jugadores. Devuelve {player_id: perfil}."""
        squads = self.adapter.get_squads(comp['season_id'])
        teams, players, staff, miembros = [], {}, set(), {}
        ts = now_iso()
        for sq in squads:
            tid = sq.get('contestantId')
            if not tid:
                continue
            teams.append({
                'id': tid,
                'name': sq.get('contestantName') or sq.get('contestantClubName') or 'Equipo',
                'short_name': sq.get('contestantShortName'),
                'country': comp['country'],
                'competition_id': comp['id'],
                'updated_at': ts,
            })
            for pers in sq.get('person', []) or []:
                pid = pers.get('id')
                if pid and pers.get('type') != 'player':
                    staff.add(pid)
                if not pid or pers.get('type') != 'player':
                    continue
                activo = pers.get('active') == 'yes'
                # Un jugador puede salir en dos plantillas (traspaso): manda la activa
                if pid in players and not activo:
                    continue
                first, last = pers.get('firstName') or '', pers.get('lastName') or ''
                players[pid] = {
                    'id': pid,
                    'name': f"{first} {last}".strip() or pers.get('matchName') or 'Jugador',
                    'first_name': first or None,
                    'last_name': last or None,
                    'match_name': pers.get('matchName'),
                    'country': pers.get('nationality'),
                    'birth_date': pers.get('dateOfBirth'),
                    'place_of_birth': pers.get('placeOfBirth'),
                    'height': pers.get('height'),
                    'weight': pers.get('weight'),
                    'preferred_foot': _foot(pers.get('foot')),
                    'shirt_number': pers.get('shirtNumber'),
                    'opta_position': pers.get('position'),
                    'current_team_id': tid if activo else None,
                    'updated_at': ts,
                }
                miembros[pid] = {'season_id': comp['season_id'], 'player_id': pid, 'competition_id': comp['id'],
                                 'team_id': tid, 'active': activo, 'shirt_number': pers.get('shirtNumber'),
                                 'updated_at': ts}
        # Temporada antigua o competición internacional (Champions...): el equipo y el dorsal de ahí no pisan
        # los actuales; solo se ponen a las jugadoras nuevas, como último club conocido
        intl = es_internacional(comp)
        if (not comp.get('active', True) or intl) and self.store.online:
            existentes = {p['id'] for p in self.store.select_all('players', 'id')}
            for pid in players.keys() & existentes:
                players[pid].pop('current_team_id', None)
                players[pid].pop('shirt_number', None)
        # Selecciones: la selección nunca es el equipo actual, ni siquiera de las jugadoras nuevas
        if es_selecciones(comp):
            for p in players.values():
                p.pop('current_team_id', None)
                p.pop('shirt_number', None)
        # Internacional: el club sigue siendo de su liga (competition_id y país); solo los clubes nuevos se crean
        if intl and self.store.online:
            existentes_t = {t['id'] for t in self.store.select_all('teams', 'id')}
            for t in teams:
                if t['id'] in existentes_t:
                    t.pop('competition_id', None)
                    t.pop('country', None)
        # Sin NULLs: no pisar datos ya guardados (equipo actual, altura de FotMob...) con huecos de Opta
        filas = [{k: v for k, v in p.items() if v is not None} for p in players.values()]
        for grupo in _homogeneo(teams):
            self.store.upsert('teams', grupo)
        # La v1 del pipeline insertaba entrenadores y asistentes como jugadores
        self.store.delete_in('players', 'id', sorted(staff - set(players)))
        existentes = {r['id'] for r in self.store.select_all('players', 'id')}
        filas_existentes = [r for r in filas if r.get('id') in existentes]
        for grupo in _homogeneo(filas_existentes):
            self.store.upsert('players', grupo)
        self.miembros = miembros
        logger.info(f"  Plantillas: {len(teams)} equipos, {len(players)} jugadores")
        return players

    def guardar_plantilla(self, comp: Dict[str, Any], cache: pd.DataFrame):
        """squad_members de la temporada: plantilla Opta + quien haya jugado sin figurar en ella.
        En la temporada activa, sin equipo actual quien no esté (activa) en la plantilla."""
        miembros = dict(self.miembros)
        if not cache.empty:
            ultimos = cache.sort_values('match_date').drop_duplicates('player_id', keep='last')
            for r in ultimos.itertuples():
                if r.player_id not in miembros:
                    miembros[r.player_id] = {'season_id': comp['season_id'], 'player_id': r.player_id,
                                             'competition_id': comp['id'], 'team_id': r.team_id, 'active': False,
                                             'shirt_number': None, 'updated_at': now_iso()}
        for grupo in _homogeneo(list(miembros.values())):
            self.store.upsert('squad_members', grupo, on_conflict='season_id,player_id')
        if comp.get('active', True) and not es_internacional(comp) and self.store.online:
            activas = {pid for pid, m in miembros.items() if m['active']}
            # Solo se borra el equipo si pertenecía a uno de los equipos de esta competición
            comp_team_ids_set = {t['id'] for t in self.store.select_all('teams', 'id', competition_id=comp['id'])}
            sueltas = [{'id': p['id'], 'name': p['name'], 'current_team_id': None, 'updated_at': now_iso()}
                       for p in self.store.select_all('players', 'id,name,current_team_id')
                       if p.get('current_team_id') in comp_team_ids_set and p['id'] not in activas]
            if sueltas:
                self.store.upsert('players', sueltas)
                logger.info(f"  Sin equipo en la temporada activa ({comp.get('name')}): {len(sueltas)} jugadoras")

    # ── Partidos ─────────────────────────────────────────────
    def _descargar(self, fixture: Dict[str, Any], con_eventing: bool = True):
        mid = fixture['matchInfo']['id']
        events = self.adapter.get_match_events(mid) if con_eventing else None
        return fixture, events, self.adapter.get_match_stats(mid)

    def guardar_calendario(self, comp: Dict[str, Any], fixtures: List[Dict[str, Any]], hechos: set):
        """Todos los partidos de la temporada (también los pendientes) para el calendario: fecha, hora,
        jornada, equipos y estadio. Los ya procesados no se tocan (los escribe procesar_partidos)."""
        ts = now_iso()
        teams, matches = {}, []
        for f in fixtures:
            mi, md = f.get('matchInfo', {}), f.get('liveData', {}).get('matchDetails', {})
            if not mi.get('id') or mi['id'] in hechos:
                continue
            meta = match_metadata(f, None)
            if not meta['home'].get('id') or not meta['away'].get('id'):
                continue
            for side in ('home', 'away'):
                c = meta[side]
                teams[c['id']] = {'id': c['id'], 'name': c.get('name') or c.get('officialName') or 'Equipo',
                                  'short_name': c.get('shortName'), 'updated_at': ts}
            venue = mi.get('venue') or {}
            matches.append({
                'id': mi['id'], 'competition_id': comp['id'], 'season_id': comp['season_id'],
                'home_team_id': meta['home']['id'], 'away_team_id': meta['away']['id'],
                'match_date': meta['match_date'], 'status': md.get('matchStatus') or 'Fixture',
                'home_score': meta['home_score'], 'away_score': meta['away_score'], 'week': mi.get('week'),
                'venue_id': venue.get('id'), 'venue_name': venue.get('longName') or venue.get('shortName'),
                'time_confirmed': bool(mi.get('time')), 'updated_at': ts,
            })
        self.store.upsert('teams', list(teams.values()))
        self.store.upsert('matches', matches)
        logger.info(f"  Calendario: {len(matches)} partidos pendientes o sin procesar guardados")

    def procesar_partidos(self, comp: Dict[str, Any], nuevos: List[Dict[str, Any]],
                          perfiles: Dict[str, Dict[str, Any]], cache: pd.DataFrame) -> pd.DataFrame:
        cid, sid = comp['id'], comp['season_id']
        with ThreadPoolExecutor(max_workers=MAX_WORKERS_DESCARGA) as pool:
            for n_lote, lote in enumerate(chunked(nuevos, LOTE_PARTIDOS), 1):
                teams, matches, players, stats, cache_rows = {}, [], {}, [], []
                ts = now_iso()
                con_eventing = comp.get('fuente', 'eventing') == 'eventing'
                for fixture, events, mstats in pool.map(lambda f: self._descargar(f, con_eventing), lote):
                    mid = fixture['matchInfo']['id']
                    # Ligas con fuente 'matchstats' no tienen eventing: basta con matchstats
                    if not mstats or (not events and con_eventing):
                        logger.warning(f"    {mid}: sin eventos/estadísticas en la API, se reintentará")
                        continue
                    rows = MetricsEngine(events, mstats).process_match()
                    if not rows:
                        logger.warning(f"    {mid}: sin jugadores procesables")
                        continue
                    meta = match_metadata(fixture, mstats)
                    for side in ('home', 'away'):
                        c = meta[side]
                        if c.get('id'):
                            teams[c['id']] = {'id': c['id'], 'name': c.get('name') or c.get('officialName') or 'Equipo',
                                              'short_name': c.get('shortName'), 'updated_at': ts}
                    matches.append({
                        'id': mid, 'competition_id': cid, 'season_id': sid,
                        'home_team_id': meta['home'].get('id'), 'away_team_id': meta['away'].get('id'),
                        'match_date': meta['match_date'], 'status': 'Played',
                        'home_score': meta['home_score'], 'away_score': meta['away_score'],
                        'week': fixture['matchInfo'].get('week'),
                        'venue_id': (fixture['matchInfo'].get('venue') or {}).get('id'),
                        'venue_name': (fixture['matchInfo'].get('venue') or {}).get('longName'),
                        'time_confirmed': bool(fixture['matchInfo'].get('time')),
                        'has_events': bool(events), 'has_stats': True, 'last_processed_at': ts,
                    })
                    for r in rows:
                        pid = r['player_id']
                        if pid not in perfiles and pid not in players:
                            nombre = f"{r['first_name'] or ''} {r['last_name'] or ''}".strip() or r['player_name'] or 'Jugador'
                            players[pid] = {'id': pid, 'name': nombre, 'first_name': r['first_name'],
                                            'last_name': r['last_name'], 'match_name': r['player_name'],
                                            'updated_at': ts}
                        stats.append({'match_id': mid, 'player_id': pid, 'team_id': r['team_id'],
                                      'competition_id': cid, 'season_id': sid, 'match_date': meta['match_date'],
                                      **{c: r[c] for c in STAT_COLS}})
                        cache_rows.append({'match_id': mid, 'player_id': pid, 'team_id': r['team_id'],
                                           'player_name': r['player_name'], 'match_date': meta['match_date'],
                                           **{c: r[c] for c in STAT_COLS}, 'heatmap': r['heatmap'], 'pases_json': r['pases_json'], **r['metrics']})

                # Orden por claves foráneas
                self.store.upsert('teams', list(teams.values()))
                self.store.upsert('players', list(players.values()))
                self.store.upsert('matches', matches)
                self.store.upsert('player_match_stats', stats, on_conflict='match_id,player_id')

                if cache_rows:
                    cache = pd.concat([cache, pd.DataFrame(cache_rows)], ignore_index=True) if not cache.empty \
                        else pd.DataFrame(cache_rows)
                    cache = cache.drop_duplicates(['match_id', 'player_id'], keep='last')
                    self.store.save_match_cache(sid, cache)
                self.totales['matches'] += len(matches)
                self.totales['player_rows'] += len(stats)
                logger.info(f"    Lote {n_lote}: {len(matches)} partidos, {len(stats)} actuaciones")
        return cache

    # ── Temporada ────────────────────────────────────────────
    def _nivel_por_club(self, df_temp: pd.DataFrame, nivel_comp: float, selecciones: bool = False) -> pd.DataFrame:
        """Competición internacional: la base de la nota es el nivel de la liga del CLUB de cada jugadora, no el de
        la competición (una del Häcken no hereda el nivel de la Champions); en selecciones, el de su club actual. Se desplazan las notas 0-100 la
        diferencia entre ambos niveles. Clubes de ligas sin calibrar o no descargadas: NIVEL_LIGA_DEFECTO."""
        from .scoring import NOTA_COLS, CATEGORIAS
        liga_club = {t['id']: t.get('competition_id') for t in self.store.select_all('teams', 'id,competition_id')}
        def nivel_club(tid):
            cid = liga_club.get(tid)
            return NIVEL_LIGA.get(cid, NIVEL_LIGA_DEFECTO) if cid and not es_internacional({'id': cid}) \
                else NIVEL_LIGA_DEFECTO
        if selecciones:
            # El equipo del partido es la selección: cuenta el club actual de cada jugadora
            club = {p['id']: p.get('current_team_id') for p in self.store.select_all('players', 'id,current_team_id')}
            delta = df_temp['player_id'].map(lambda pid: nivel_club(club.get(pid))) - nivel_comp
        else:
            delta = df_temp['team_id'].map(nivel_club) - nivel_comp
        df_temp = df_temp.copy()
        for c in NOTA_COLS:
            if c in df_temp:
                df_temp[c] = (df_temp[c] + delta).clip(1, 99)
        if 'radar_data' in df_temp:
            for i in df_temp.index:
                rd = df_temp.at[i, 'radar_data']
                if isinstance(rd, dict) and isinstance(rd.get('metricas'), dict):
                    rd_m = rd['metricas']
                    for k in CATEGORIAS:
                        if f'_cat_{k}' in rd_m and f'nota_{k}' in df_temp:
                            v = float(df_temp.at[i, f'nota_{k}'])
                            rd_m[f'_cat_{k}'] = [round(v, 1), round(v / 10, 2)]
        logger.info(f"  Nivel por club (internacional): desplazamiento medio {delta.mean():+.1f}")
        return df_temp

    def _ids_jugadoras(self):
        """Ids de public.players (una vez por ejecución). Sin conexión → None (no se filtra)."""
        if not self.store.online:
            return None
        if getattr(self, '_ids_players', None) is None:
            self._ids_players = {r['id'] for r in self.store.select_all('players', 'id')}
        return self._ids_players

    REF_GENERAL = 'referencias/global.json'

    def referencia_general(self) -> Dict[str, Any]:
        """{'partido': {season_id: acumulado}, 'temporada': {...}} guardado en pipeline-cache (scoring.Acumulado)."""
        if getattr(self, '_ref_general', None) is None:
            raw = self.store.download(BUCKET_PIPELINE_CACHE, self.REF_GENERAL) if self.store.online else None
            try:
                self._ref_general = json.loads(raw) if raw else {}
            except ValueError:
                self._ref_general = {}
        return self._ref_general

    def guardar_referencia_general(self, season_id: str, acum: Dict[str, Any]):
        refs = self.referencia_general()
        for k in ('partido', 'temporada'):
            refs.setdefault(k, {})[season_id] = acum.get(k, {})
        if self.store.online:
            self.store.upload(BUCKET_PIPELINE_CACHE, self.REF_GENERAL, json.dumps(refs).encode(), 'application/json')

    def recalcular_temporada(self, comp: Dict[str, Any], cache: pd.DataFrame, perfiles: Dict[str, Dict[str, Any]],
                             actualizar_jugadoras: bool = True):
        """Ratings por partido y tabla de temporada desde la caché. Sin `actualizar_jugadoras` no se tocan las
        fichas (nombre y demarcación principal): para recalcular sin plantillas de Opta."""
        cid, sid = comp['id'], comp['season_id']
        if cid not in NIVEL_LIGA:
            logger.warning(f"  {comp['name']} sin nivel en NIVEL_LIGA: se usa {NIVEL_LIGA_DEFECTO}")
        nivel_comp = NIVEL_LIGA.get(cid, NIVEL_LIGA_DEFECTO)
        # Media general por demarcación: acumulados de las demás temporadas descargadas (todas las ligas)
        refs = self.referencia_general()
        otras = {k: sumar_acumulados(*(a for s_, a in refs.get(k, {}).items() if s_ != sid))
                 for k in ('partido', 'temporada')}
        acum: Dict[str, Any] = {}
        df_sp, df_temp = calcular_temporada(cache, nivel_comp, otras, acum)
        if not es_internacional(comp):  # las internacionales mezclan niveles: no fijan la media general
            self.guardar_referencia_general(sid, acum)
        if es_internacional(comp) and not df_temp.empty:
            df_temp = self._nivel_por_club(df_temp, nivel_comp, selecciones=es_selecciones(comp))
        if df_temp.empty:
            logger.info("  Temporada: sin jugadores con minutos suficientes todavía")
            return
        ts = now_iso()
        fechas = cache.set_index(['match_id', 'player_id'])['match_date']
        # Partidos sin estadísticas (rondas guardadas con todo a 0): sin nota, y fuera las de versiones anteriores
        sin_nota = df_sp['score_general'].isna()
        if sin_nota.any():
            vacios = sorted(set(df_sp.loc[sin_nota, 'match_id']) - set(df_sp.loc[~sin_nota, 'match_id']))
            if vacios:
                self.store.delete_in('player_match_scores', 'match_id', vacios)
                logger.info(f"  {len(vacios)} partidos sin estadísticas: sin nota por partido")
            df_sp = df_sp[~sin_nota]
        score_rows = [{
            'match_id': r.match_id, 'player_id': r.player_id, 'demarcacion': r.demarcacion,
            'grupo_demarcacion': r.grupo_demarcacion, 'competition_id': cid, 'season_id': sid,
            'match_date': fechas.get((r.match_id, r.player_id)),
            **{sc: float(getattr(r, sc)) for sc in SCORE_COLS},
        } for r in df_sp.itertuples()]
        season_rows = filas_season_stats(df_temp, cid, sid, ts)
        if not actualizar_jugadoras:
            # Sin crear fichas: fuera las jugadoras de la caché que ya no están en players (fusionadas o borradas),
            # que romperían la clave foránea. Siguen contando como referencia en el cálculo de la liga.
            existentes = self._ids_jugadoras()
            if existentes is not None:
                faltan = {r['player_id'] for r in score_rows + season_rows} - existentes
                if faltan:
                    logger.warning(f"  {len(faltan)} jugadoras de la caché no están en players: no se guardan")
                    score_rows = [r for r in score_rows if r['player_id'] in existentes]
                    season_rows = [r for r in season_rows if r['player_id'] in existentes]
        valid_matches = {m['id'] for m in self.store.select_all('matches', 'id', season_id=sid)}
        score_rows = [r for r in score_rows if r['match_id'] in valid_matches]
        self.store.upsert('player_match_scores', score_rows, on_conflict='match_id,player_id')

        # Una fila por jugador (antes una por demarcación): se borran las de versiones anteriores
        self.store.delete('player_season_stats', competition_id=cid, season_id=sid)
        self.store.upsert('player_season_stats', season_rows, on_conflict='player_id,season_id,demarcacion', batch=200)
        self.totales['season_rows'] += len(season_rows)
        if not actualizar_jugadoras:
            logger.info(f"  Temporada recalculada: {len(season_rows)} filas, {len(score_rows)} ratings por partido")
            return

        # Demarcación principal = la de más minutos en la temporada
        principal = cache.groupby(['player_id', 'demarcacion'])['minutes_played'].sum().reset_index() \
            .sort_values('minutes_played').drop_duplicates('player_id', keep='last')
        nombres = cache.drop_duplicates('player_id', keep='last').set_index('player_id')['player_name']
        filas = []
        for r in principal.itertuples():
            perfil = perfiles.get(r.player_id, {})
            filas.append({'id': r.player_id, 'name': perfil.get('name') or nombres.get(r.player_id) or 'Jugador',
                          'primary_position': r.demarcacion,
                          'grupo_demarcacion': cache.loc[cache['demarcacion'] == r.demarcacion, 'grupo_demarcacion'].iloc[0],
                          'updated_at': ts})
        self.store.upsert('players', filas)
        top = df_temp.sort_values('score_general', ascending=False).head(3)
        logger.info(f"  Temporada: {len(season_rows)} filas jugador-demarcación, {len(score_rows)} scores por partido. "
                    f"Top: {', '.join(f'{nombres.get(p, p)} ({s:.2f})' for p, s in zip(top.player_id, top.score_general))}")

    # ── Fotos ────────────────────────────────────────────────
    def sincronizar_fotos(self, comp: Dict[str, Any], perfiles: Dict[str, Dict[str, Any]], cache: pd.DataFrame):
        if not self.store.online:
            logger.info("  Fotos: omitidas en dry-run")
            return
        team_ids = set(p['current_team_id'] for p in perfiles.values() if p.get('current_team_id'))
        if not cache.empty:
            team_ids |= set(cache['team_id'].unique())
        equipos = {t['id']: t for t in self.store.select_all('teams', 'id,name,short_name,badge_url')
                   if t['id'] in team_ids}
        fotos_actuales = {p['id']: p.get('photo_url') for p in self.store.select_all('players', 'id,photo_url')}
        con_foto = {pid for pid, url in fotos_actuales.items() if url}
        # Jugadores por equipo: plantilla actual + quien haya jugado con ese equipo esta temporada
        por_equipo: Dict[str, List[Dict[str, Any]]] = {}
        vistos = set()
        for p in perfiles.values():
            if p.get('current_team_id') in equipos:
                por_equipo.setdefault(p['current_team_id'], []).append(p)
                vistos.add(p['id'])
        if not cache.empty:
            ultimos = cache.sort_values('match_date').drop_duplicates('player_id', keep='last')
            for r in ultimos.itertuples():
                if r.player_id not in vistos and r.team_id in equipos:
                    perfil = perfiles.get(r.player_id) or {'id': r.player_id, 'name': r.player_name}
                    por_equipo.setdefault(r.team_id, []).append(perfil)
        escudos, _ = sincronizar_fotos(self.store, self.fotmob, comp.get('fotmob_id'), list(equipos.values()),
                                       por_equipo, con_foto, now_iso(), refrescar=self.refresh_photos,
                                       solo_escudos=True)
        # Fotos por nombre: FotMob > Soccerdonna > Opta
        # El dorsal solo sirve para confirmar si es el de la temporada actual y sigue en la plantilla:
        # FotMob y Soccerdonna muestran el dorsal de hoy, el de otra temporada puede no corresponder
        dorsal_actual = comp.get('active', True)
        clubes, jugadoras = {}, []
        for tid, lista in por_equipo.items():
            for p in lista:
                clubes[tid] = equipos[tid]['name']
                activa = dorsal_actual and (self.miembros.get(p['id']) or {}).get('active')
                jugadoras.append({**p, 'photo_url': fotos_actuales.get(p['id']),
                                  'current_team_id': p.get('current_team_id') or tid,
                                  'shirt_number': p.get('shirt_number') if activa else None})
        res = sincronizar_fotos_jugadoras(self.store, self.fotmob, self.sd, jugadoras, clubes, self.refresh_photos,
                                          comp.get('fotmob_id'))
        fotos = res['soccerdonna'] + res['fotmob'] + res['opta']
        self.totales['photos'] += fotos
        self.totales['badges'] += escudos
        logger.info(f"  Fotos: {res} y {escudos} escudos subidos a Storage")
        # Liga del equipo actual (FotMob) con su logo; requiere la migración de ligas
        try:
            previas = {r['id']: r for r in self.store.select_all('players', 'id,fotmob_id,league_id,fm_team_name')}
            jugadoras = [{**p, **{k: (previas.get(p['id']) or {}).get(k) for k in ('fotmob_id', 'league_id', 'fm_team_name')}}
                         for p in jugadoras]
            logger.info(f"  Ligas: {sincronizar_ligas(self.store, self.fotmob, jugadoras, clubes, comp.get('fotmob_id'))}")
        except Exception as e:
            logger.warning(f"  Ligas: omitido ({e}). ¿Falta la migración 20261024000000_ligas.sql?")

    # ── Orquestación ─────────────────────────────────────────
    def procesar_competicion(self, comp: Dict[str, Any], only_photos: bool = False):
        cid, sid = comp['id'], comp['season_id']
        fixtures = self.adapter.get_fixtures(sid)
        tc = next((f['matchInfo'].get('tournamentCalendar') for f in fixtures
                   if f.get('matchInfo', {}).get('tournamentCalendar')), {}) or {}
        ts = now_iso()
        activa = comp.get('active', True)
        fila_comp = {'id': cid, 'name': comp['name'], 'country': comp['country'],
                     'fotmob_id': comp.get('fotmob_id'), 'updated_at': ts}
        if activa:
            fila_comp['active_season_id'] = sid
        self.store.upsert('competitions', [fila_comp])
        self.store.upsert('seasons', [{'id': sid, 'competition_id': cid, 'name': tc.get('name') or 'Temporada actual',
                                       'start_date': (tc.get('startDate') or '').replace('Z', '') or None,
                                       'end_date': (tc.get('endDate') or '').replace('Z', '') or None,
                                       'is_active': activa, 'updated_at': ts}])

        perfiles = self.sync_squads(comp)
        cache = pd.DataFrame() if self.rebuild else self.store.load_match_cache(sid)

        if not only_photos:
            jugados = [m for m in fixtures if m.get('liveData', {}).get('matchDetails', {}).get('matchStatus') == 'Played']
            if self.rebuild and self.store.online:
                logger.info("  --rebuild: borrando estadísticas y scores previos de la temporada")
                self.store.delete('player_season_stats', season_id=sid)
                self.store.delete('player_match_stats', season_id=sid)
                self.store.delete_in('player_match_scores', 'match_id', [m['matchInfo']['id'] for m in jugados])
            hechos = set(cache['match_id'].unique()) if not cache.empty else set()
            nuevos = sorted((m for m in jugados if m['matchInfo']['id'] not in hechos),
                            key=lambda m: m['matchInfo'].get('date', ''))
            if self.max_matches_per_comp:
                nuevos = nuevos[:self.max_matches_per_comp]
            logger.info(f"  Partidos: {len(jugados)} jugados, {len(hechos)} ya procesados, {len(nuevos)} nuevos a procesar")
            if nuevos:
                cache = self.procesar_partidos(comp, nuevos, perfiles, cache)
            hechos = set(cache['match_id'].unique()) if not cache.empty else set()
            self.guardar_calendario(comp, fixtures, hechos)
            if not cache.empty and (nuevos or self.rebuild):
                self.recalcular_temporada(comp, cache, perfiles)

        self.guardar_plantilla(comp, cache)

        if not self.skip_photos:
            self.sincronizar_fotos(comp, perfiles, cache)

        last_date = cache['match_date'].max() if not cache.empty else None
        self.store.upsert('ingestion_checkpoints', [{
            'competition_id': cid, 'season_id': sid, 'last_match_date': last_date,
            'last_success_run': now_iso(), 'consecutive_errors': 0, 'status': 'idle', 'updated_at': now_iso()}])

    def actualizar_similares(self):
        """Jugadores parecidos entre todas las ligas (se guarda en radar_data.similares)."""
        filas = self.store.select_all('player_season_stats', '*')
        similares = calcular_similares(filas)
        cambiadas = []
        for f in filas:
            nuevas = similares.get(f['player_id'], [])
            # Solo las que cambian: reescribir todas (radar_data completo) agota el statement timeout de Supabase
            if (f.get('radar_data') or {}).get('similares') == nuevas:
                continue
            f['radar_data'] = {**(f.get('radar_data') or {}), 'similares': nuevas}
            f.pop('id', None)
            cambiadas.append(f)
        self.store.upsert('player_season_stats', cambiadas, on_conflict='player_id,season_id,demarcacion', batch=50)
        logger.info(f"Similares: {len(cambiadas)} de {len(filas)} filas actualizadas")

    def cargar_objetivos(self) -> List[Dict[str, Any]]:
        return competiciones_objetivo(self.store)

    def run(self, target_comp_id: Optional[str] = None, only_photos: bool = False, trigger: str = 'manual') -> bool:
        start = now_iso()
        logger.info(f"=== INICIANDO PIPELINE DE SCOUTING ({start}){' [DRY-RUN]' if self.dry_run else ''} ===")
        comps = [c for c in self.cargar_objetivos() if not target_comp_id or c['id'] == target_comp_id]
        if not comps:
            logger.error(f"Competición con ID {target_comp_id} no encontrada en la configuración.")
            return False

        run_row = None
        try:
            run_row = self.store.insert('ingestion_runs', {'status': 'running', 'trigger_type': trigger,
                                                           'total_competitions': len(comps)})
        except Exception as e:
            logger.warning(f"No se pudo registrar ingestion_run: {e}")

        errores = {}
        for comp in comps:
            logger.info(f"\n▶ {comp['name']} ({comp['country']}) — comp {comp['id']} / temporada {comp['season_id']}")
            try:
                self.procesar_competicion(comp, only_photos=only_photos)
            except Exception as e:
                logger.exception(f"Error procesando {comp['name']}: {e}")
                errores[comp['name']] = str(e)[:500]
                try:
                    self.store.upsert('ingestion_checkpoints', [{
                        'competition_id': comp['id'], 'season_id': comp['season_id'],
                        'status': 'error', 'updated_at': now_iso()}])
                except Exception:
                    pass

        if not only_photos and self.store.online:
            try:
                self.actualizar_similares()
            except Exception as e:
                logger.exception(f"Error calculando jugadores similares: {e}")
                errores['similares'] = str(e)[:500]

        estado = 'completed' if not errores else ('failed' if len(errores) == len(comps) else 'completed_with_errors')
        if run_row:
            try:
                self.store.update('ingestion_runs', {
                    'finished_at': now_iso(), 'status': estado, 'matches_processed': self.totales['matches'],
                    'players_updated': self.totales['season_rows'],
                    'error_summary': '; '.join(f"{k}: {v}" for k, v in errores.items()) or None,
                    'details': {**self.totales, 'errores': errores},
                }, id=run_row['id'])
            except Exception as e:
                logger.warning(f"No se pudo cerrar ingestion_run: {e}")

        logger.info("\n=== PIPELINE COMPLETADO ===")
        logger.info(f"Estado: {estado} | {self.totales}")
        return not errores


def main():
    parser = argparse.ArgumentParser(description="Pipeline de Ingesta y Cálculo de Métricas de Scouting")
    parser.add_argument("--comp-id", type=str, default=None, help="Filtrar por ID de competición específica")
    parser.add_argument("--max-matches", type=int, default=None,
                        help="Máximo de partidos NUEVOS por liga (por defecto todos los pendientes)")
    parser.add_argument("--dry-run", action="store_true", help="Ejecutar sin persistir en Supabase (caché en .cache/)")
    parser.add_argument("--skip-photos", action="store_true", help="No sincronizar fotos ni escudos")
    parser.add_argument("--only-photos", action="store_true", help="Solo plantillas, fotos y escudos")
    parser.add_argument("--refresh-photos", action="store_true", help="Volver a descargar todas las fotos")
    parser.add_argument("--rebuild", action="store_true", help="Ignorar la caché y reprocesar todos los partidos jugados")
    parser.add_argument("--solo-similares", action="store_true", help="Solo recalcular jugadores similares con los datos de BD")
    args = parser.parse_args()

    pipeline = IngestionPipeline(dry_run=args.dry_run, max_matches_per_comp=args.max_matches,
                                 skip_photos=args.skip_photos, refresh_photos=args.refresh_photos,
                                 rebuild=args.rebuild)
    if args.solo_similares:
        pipeline.actualizar_similares()
        sys.exit(0)
    trigger = 'scheduled' if os.environ.get('GITHUB_EVENT_NAME') == 'schedule' else 'manual'
    ok = pipeline.run(target_comp_id=args.comp_id, only_photos=args.only_photos, trigger=trigger)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
