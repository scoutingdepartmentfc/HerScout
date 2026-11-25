"""
pipeline/scoring.py
Agregación de temporada y escala 0-10 (port de _agregar_metricas_jugador y
_normalizar_y_guardar de Debrecen_app), aplicada por competición-temporada.

- Rating por partido (escala tipo FotMob, media NOTA_PARTIDO_MEDIA): cada actuación frente a las de su
  grupo de demarcación en la liga, con la jerarquía y los pesos por grupo de categorias.py. Las métricas se
  corrigen por minutos (K_MINUTOS_PARTIDO), los minutos jugados no puntúan y el balón parado solo suma.
- Scores de temporada: una fila por jugador; métricas p90 = media ponderada por minutos
  (equivale a total / minutos * 90), con >= MIN_MINUTOS_TEMPORADA, escaladas contra la liga.
- comp_regularidad: regularidad y tendencia de los scores por partido (CV + pendiente).
- Notas 0-100 comparables entre ligas, solo con rendimiento p90 (los minutos no puntúan): desviaciones frente a
  su grupo de demarcación en la liga + nivel de la liga (NIVEL_LIGA), con techo suave. La global pesa sobre todo
  las métricas clave de su posición (PLANTILLAS_POSICION). Con poca muestra, aviso (radar_data.muestra_baja).
- Percentiles 0-99 dentro de la competición.
- radar_data: {metricas: {col: [valor, nota]}, heatmap: {general, por_demarcacion: {dem: rejilla 8x12}},
  pases: {general, por_demarcacion: {zonas: [n, ok, dx, dy] x24, rel: [zona, dem, n, x0, y0, x1, y1],
                                     cuadrado: [dem, n, x0, y0, x1, y1] (top 5 pases al cuadrado)}},
  demarcaciones: {dem: {min, pj}}, similares}.
"""

import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from .categorias import (CATEGORIAS, DIFERENCIAS, JERARQUIA, JERARQUIA_PORTEROS, MALUS, METRICA_SUB, PESOS_GRUPO,
                         PLANTILLAS_POSICION, plantilla_de)
from .perfiles import calcular_perfiles_v4
from .config import (K_MINUTOS_PARTIDO, MIN_ACTUACIONES_GRUPO, MIN_JUGADORAS_GRUPO, MIN_MINUTOS_NOTA,
                     MIN_MINUTOS_REFERENCIA, MIN_MINUTOS_TEMPORADA, MIN_PARTIDOS_NOTA, MIN_REFERENCIA_GLOBAL,
                     MIN_REFERENCIA_GRUPO, NOTA_DESVIACION, NOTA_MEDIA_LIGA, NOTA_PARTIDO_DESVIACION,
                     NOTA_PARTIDO_MEDIA, NOTA_PARTIDO_MIN, NOTA_TECHO, NOTA_TECHO_INICIO, PESO_CLAVE,
                     PESO_MODELO_PARTIDO, PESOS_REFERENCIA, Z_RECORTE)

# Acumulados por demarcación para la media general entre ligas: {grupo: {métrica: [n, suma, suma_cuadrados]}}
Acumulado = Dict[str, Dict[str, List[float]]]

NOTA_COLS = ['nota_global'] + [f'nota_{c}' for c in CATEGORIAS]
SCORE_COLS = ['score_general', 'score_ofensivo', 'score_defensivo', 'score_comportamiento', 'score_abp']

# Agregación: suma (no promediar) / media simple / resto media ponderada por minutos
SUM_METRICS = {'comp_importancia', 'comp_minutos', 'comp_capitan'}
MEAN_METRICS = {'comp_titular_pct', 'comp_regularidad_min90', 'comp_polivalencia_demarcacion', 'def_porteria_cero_pct'}
MALUS_METRICS = set(MALUS)

# Columnas nativas de player_match_stats que se agregan a p90 en player_season_stats
CONTEO_COLS = ['goals', 'assists', 'xg', 'xa', 'xca', 'passes_completed', 'passes_total', 'progressive_passes',
               'takeons_successful', 'takeons_total', 'tackles_won', 'tackles_total', 'interceptions',
               'recoveries', 'aerials_won', 'aerials_total']


def metric_columns(df: pd.DataFrame) -> List[str]:
    return [c for c in df.columns if c.startswith(('comp_', 'of_', 'def_', 'abp_'))]


def scale_0_10(serie: pd.Series, invert: bool = False) -> pd.Series:
    """Escala asimétrica centrada en la media (=5.0): máximo → 10, mínimo → 0. Vectorizada."""
    s = pd.to_numeric(serie, errors='coerce').astype(float)
    mean_v, max_v, min_v = s.mean(), s.max(), s.min()
    if pd.isna(mean_v) or max_v == min_v:
        return pd.Series(5.0, index=s.index)
    arriba = (s >= mean_v) & (max_v > mean_v)
    abajo = (s < mean_v) & (mean_v > min_v)
    up = (s - mean_v) / (max_v - mean_v) if max_v > mean_v else s * 0
    down = (mean_v - s) / (mean_v - min_v) if mean_v > min_v else s * 0
    out = pd.Series(5.0, index=s.index)
    if invert:
        out[arriba] = (5.0 - 5.0 * up[arriba]).clip(lower=0.0)
        out[abajo] = (5.0 + 5.0 * down[abajo]).clip(upper=10.0)
    else:
        out[arriba] = (5.0 + 5.0 * up[arriba]).clip(upper=10.0)
        out[abajo] = (5.0 - 5.0 * down[abajo]).clip(lower=0.0)
    return out.fillna(5.0).round(2)


def _grupos(df: pd.DataFrame, minimo: int) -> pd.Series:
    """Grupo de demarcación de cada fila; los grupos pequeños de campo se comparan con las jugadoras de campo (_liga).
    Las porteras NUNCA se mezclan con jugadoras de campo: siempre se comparan solo entre porteras."""
    g = df['grupo_demarcacion']
    n = g.groupby(g).transform('size')
    return g.where((g == 'Porteros') | (n >= minimo), '_liga').fillna('_liga')


def _categorias(pcts: pd.DataFrame, grupo: pd.Series) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Percentiles por métrica → (subcategorías, categorías) 0-100: media de sus métricas / subcategorías.
    Porteras con JERARQUIA_PORTEROS, el resto con JERARQUIA. Sin datos → NaN."""
    es_portera = grupo == 'Porteros'
    subs: Dict[str, pd.Series] = {}
    cats = {c: pd.Series(np.nan, index=pcts.index) for c in CATEGORIAS}
    for jerarquia, mask in ((JERARQUIA, ~es_portera), (JERARQUIA_PORTEROS, es_portera)):
        if not mask.any():
            continue
        for cat, _, lista in jerarquia:
            cols_sub = []
            for sub, _, ms in lista:
                presentes = [m for m in ms if m in pcts.columns]
                subs.setdefault(sub, pd.Series(np.nan, index=pcts.index))
                if presentes:
                    subs[sub][mask] = pcts.loc[mask, presentes].mean(axis=1)
                cols_sub.append(sub)
            cats[cat][mask] = pd.DataFrame({k: subs[k][mask] for k in cols_sub}).mean(axis=1)
    return pd.DataFrame(subs, index=pcts.index), pd.DataFrame(cats, index=pcts.index)


def _nota_partido(serie: pd.Series, grupos: pd.Series, mins: pd.Series) -> pd.Series:
    """Escala del rating por partido: media del grupo = NOTA_PARTIDO_MEDIA, ± NOTA_PARTIDO_DESVIACION por
    desviación típica. Media y desviación ponderadas por minutos (las actuaciones largas fijan la escala) y la
    distancia a la media se reduce con pocos minutos (K_MINUTOS_PARTIDO). Sin datos → la media."""
    confianza = ((mins / (mins + K_MINUTOS_PARTIDO)) / (90 / (90 + K_MINUTOS_PARTIDO))).clip(upper=1.0)

    def escalar(g: pd.Series) -> pd.Series:
        ok = g.notna()
        w = mins[g.index][ok]
        if ok.sum() < 3 or w.sum() <= 0:
            return pd.Series(0.0, index=g.index)
        media = np.average(g[ok], weights=w)
        std = np.sqrt(np.average((g[ok] - media) ** 2, weights=w))
        return (g - media) / std if std > 1e-9 else pd.Series(0.0, index=g.index)
    z = serie.groupby(grupos, group_keys=False).apply(escalar).reindex(serie.index).fillna(0.0)
    out = NOTA_PARTIDO_MEDIA + NOTA_PARTIDO_DESVIACION * z * confianza
    return out.clip(NOTA_PARTIDO_MIN, 10.0).round(2)


# ── Nota por partido calibrada con FotMob (pipeline/calibrar_nota.py) ──────────────────────────────
MODELO_NOTA_PATH = str(Path(__file__).parent / 'modelos' / 'nota_partido.json')
# Conteos del partido (no p90). 'base' existe en matchstats y eventing; 'completo' añade eventing.
_BASE = ['minutos', 'titular', 'goles', 'asistencias', 'pases_ok', 'pases_fallados', 'entradas_ganadas',
         'entradas_perdidas', 'intercepciones', 'recuperaciones', 'aereos_ganados', 'aereos_perdidos',
         'regates_ok', 'regates_fallados', 'faltas', 'amarillas', 'rojas', 'goles_favor', 'goles_contra',
         'victoria', 'derrota']
_EVENTING = {'xg': None, 'xa': None, 'pases_progresivos': None, 'tiros': 'of_tiros_p90',
             'pases_clave': 'of_asistencias_p90', 'grandes_ocasiones': 'of_grandes_ocasiones_p90',
             'centros_ok': 'of_centros_buenos_p90', 'paradas': 'def_paradas_p90', 'errores': 'def_errores_p90',
             'despejes': 'def_despejes_propio_p90'}
FEATURES_NOTA = {'base': _BASE, 'completo': _BASE + list(_EVENTING)}
_modelo_nota_cache: Dict = {}


def features_nota(df: pd.DataFrame) -> pd.DataFrame:
    """Variables del modelo de nota por partido (mismo índice que df) + _con_stats (el partido tiene
    estadísticas: hay rondas guardadas con todo a 0) y _con_eventing (la fila tiene métricas de eventing)."""
    n = lambda c: (pd.to_numeric(df[c], errors='coerce') if c in df.columns
                   else pd.Series(np.nan, index=df.index)).astype(float)
    mins = n('minutes_played').fillna(0)
    f = pd.DataFrame(index=df.index)
    f['minutos'] = mins
    f['titular'] = df['is_starter'].astype(float) if 'is_starter' in df.columns else 0.0
    f['goles'], f['asistencias'] = n('goals').fillna(0), n('assists').fillna(0)
    f['pases_ok'] = n('passes_completed').fillna(0)
    f['pases_fallados'] = (n('passes_total') - n('passes_completed')).fillna(0).clip(lower=0)
    f['entradas_ganadas'] = n('tackles_won').fillna(0)
    f['entradas_perdidas'] = (n('tackles_total') - n('tackles_won')).fillna(0).clip(lower=0)
    f['intercepciones'], f['recuperaciones'] = n('interceptions').fillna(0), n('recoveries').fillna(0)
    f['aereos_ganados'] = n('aerials_won').fillna(0)
    f['aereos_perdidos'] = (n('aerials_total') - n('aerials_won')).fillna(0).clip(lower=0)
    f['regates_ok'] = n('takeons_successful').fillna(0)
    f['regates_fallados'] = (n('takeons_total') - n('takeons_successful')).fillna(0).clip(lower=0)
    f['faltas'], f['amarillas'], f['rojas'] = n('fouls').fillna(0), n('yellow_cards').fillna(0), n('red_cards').fillna(0)
    # Resultado: goles de su equipo y del rival en el partido (suma de goles de las jugadoras)
    if 'team_id' in df.columns:
        gf = f['goles'].groupby([df['match_id'], df['team_id']]).transform('sum')
        total = f['goles'].groupby(df['match_id']).transform('sum')
        f['goles_favor'], f['goles_contra'] = gf, total - gf
    else:  # sin equipo no se sabe el resultado: neutro
        f['goles_favor'] = f['goles_contra'] = 0.0
    f['victoria'] = (f['goles_favor'] > f['goles_contra']).astype(float)
    f['derrota'] = (f['goles_favor'] < f['goles_contra']).astype(float)
    con_ev = n('of_tiros_p90').notna()
    for k, col in _EVENTING.items():
        v = n({'xg': 'xg', 'xa': 'xa', 'pases_progresivos': 'progressive_passes'}[k]) if col is None else n(col) * mins / 90
        f[k] = v.fillna(0).where(con_ev)
    f['_con_stats'] = (n('passes_total').fillna(0).groupby(df['match_id']).transform('sum') > 0).to_numpy()
    f['_con_eventing'] = con_ev.to_numpy()
    return f


def _modelo_nota() -> Dict:
    if 'm' not in _modelo_nota_cache:
        p = Path(MODELO_NOTA_PATH)
        _modelo_nota_cache['m'] = json.loads(p.read_text()) if p.exists() else None
    return _modelo_nota_cache['m']


def nota_partido_modelo(df: pd.DataFrame) -> pd.Series:
    """Nota 0-10 de cada actuación con el modelo calibrado con FotMob: 'completo' si la fila tiene eventing,
    'base' si no. Partidos sin estadísticas → NaN (sin nota). Sin modelo guardado → None."""
    modelo = _modelo_nota()
    if not modelo or df.empty:
        return None
    f = features_nota(df)
    out = pd.Series(np.nan, index=df.index)
    defecto = modelo['grupos'].get('Medios', {})
    for grupo, idx in df.groupby(df['grupo_demarcacion'].fillna('Medios')).groups.items():
        m = modelo['grupos'].get(grupo) or defecto
        for tipo, mask in (('completo', f.loc[idx, '_con_eventing']), ('base', ~f.loc[idx, '_con_eventing'])):
            params = m.get(tipo) or m.get('base')
            filas = mask[mask].index
            if params is None or filas.empty:
                continue
            X = f.loc[filas, list(params['coef'])].fillna(0)
            out[filas] = params['intercept'] + X.to_numpy() @ np.array(list(params['coef'].values()))
    return out.where(f['_con_stats']).clip(NOTA_PARTIDO_MIN, 10.0).round(2)


def scores_por_partido(df_partidos: pd.DataFrame, calibrada: bool = True, general: Optional[Acumulado] = None,
                       acum: Optional[Acumulado] = None) -> pd.DataFrame:
    """Rating 0-10 de cada actuación (match_id, player_id).
    1. Cada métrica de la jerarquía (sin Disponibilidad: los minutos no puntúan en el partido) → desviaciones frente
       a tres medias de su demarcación (_z_combinada): actuaciones de la liga, de su equipo y de todas las ligas
       (`general`, acumulados de otras temporadas). En balón parado el 0 es "no lanza": sin dato, solo suma.
    2. Global = PESO_CLAVE * métricas clave de su posición (PLANTILLAS_POSICION) + resto: categorías con los pesos
       de su grupo (PESOS_GRUPO) y disciplina 10%.
    3. Escala del partido (_nota_partido), que acerca a la media a quien jugó poco.
    4. Nota general = PESO_MODELO_PARTIDO * modelo calibrado con FotMob + resto escala propia (si hay modelo y
       `calibrada`). Bloques (ofensivo, defensivo...) con la escala propia.
    `acum`: se rellena con los acumulados de estas actuaciones (para la media general de las próximas ligas)."""
    base = df_partidos[['match_id', 'player_id', 'demarcacion', 'grupo_demarcacion']].copy()
    if df_partidos.empty:
        return base.assign(**{c: pd.Series(dtype=float) for c in SCORE_COLS})
    df = df_partidos.copy()
    mins = pd.to_numeric(df['minutes_played'], errors='coerce').fillna(0).clip(lower=1).astype(float)
    grupos = _grupos(df, MIN_ACTUACIONES_GRUPO)
    ref = pd.Series(True, index=df.index)  # todas las actuaciones fijan la media del partido
    cols = []
    for c, (cat, _) in METRICA_SUB.items():
        if c not in df.columns or cat == 'disponibilidad':
            continue
        if cat == 'balon_parado':
            df[c] = pd.to_numeric(df[c], errors='coerce').where(lambda v: v != 0)
        cols.append(c)
    z = _z_metricas(df, cols, grupos, ref, general=general, acum=acum, ceros=False)
    _, cats = _categorias(z, df['grupo_demarcacion'])

    # Disciplina (tarjetas y faltas) por partido: menos es mejor
    if 'comp_disciplina_malus' in df.columns:
        disciplina = -_z_grupo(pd.to_numeric(df['comp_disciplina_malus'], errors='coerce').astype(float), grupos, ref)
    else:
        disciplina = pd.Series(np.nan, index=df.index)

    num = pd.Series(0.0, index=df.index)
    den = pd.Series(0.0, index=df.index)
    for k, col in {**{k: cats[k] for k in cats.columns}, '_disciplina': disciplina}.items():
        w = df['grupo_demarcacion'].map(lambda g: 0.10 if k == '_disciplina' else
                                        PESOS_GRUPO.get(g, PESOS_GRUPO['Medios']).get(k, 0.0) * 0.90).astype(float)
        w = w.where(col.notna(), 0.0)
        num += col.fillna(0) * w
        den += w
    por_cats = (num / den).where(den > 0)
    clave = _nota_clave(z, df)
    glob = PESO_CLAVE * clave.fillna(por_cats) + (1 - PESO_CLAVE) * por_cats.fillna(clave)
    propia = _nota_partido(glob, grupos, mins)

    nota = nota_partido_modelo(df) if calibrada else None
    if nota is not None:
        propia = (PESO_MODELO_PARTIDO * nota + (1 - PESO_MODELO_PARTIDO) * propia).where(nota.notna()).round(2)
    base['score_general'] = propia
    base['score_ofensivo'] = _nota_partido(cats[['ataque', 'construccion']].mean(axis=1), grupos, mins)
    base['score_defensivo'] = _nota_partido(cats['defensa'], grupos, mins)
    base['score_abp'] = _nota_partido(cats['balon_parado'], grupos, mins)
    base['score_comportamiento'] = _nota_partido(disciplina, grupos, mins)
    return base


def calcular_regularidad_scores(scores: np.ndarray) -> float:
    """Regularidad (bajo CV) y progresión (pendiente) de los scores por partido → nota 0-10."""
    scores = scores[~np.isnan(scores)]
    if len(scores) < 3:
        return 5.0
    mean_s = np.mean(scores)
    cv = np.std(scores) / mean_s if mean_s > 0 else 0
    pendiente, _ = np.polyfit(np.arange(len(scores)), scores, 1)
    nota = 6.0 - min(4.0, cv * 8) + float(np.clip(pendiente * 15, -3, 3))
    return round(float(np.clip(nota, 0, 10)), 2)


def _sumar_heatmaps(grp: pd.DataFrame) -> Dict:
    """Campograma de acciones general y por demarcación (suma de rejillas por partido)."""
    if 'heatmap' not in grp:
        return {}
    suma = lambda g: np.sum(np.stack(g['heatmap'].to_numpy()), axis=0).astype(int).tolist()
    return {'general': suma(grp), 'por_demarcacion': {d: suma(g) for d, g in grp.groupby('demarcacion')}}


def _agregar_pases(serie: pd.Series) -> Dict:
    """Suma los pases por zona de varios partidos → dirección media por zona y relaciones
    zona → demarcación receptora con su punto medio de origen y destino (top 40)."""
    zonas, rel, cuadrado = None, {}, {}
    for txt in serie.dropna():
        d = json.loads(txt)
        zonas = d['zonas'] if zonas is None else [[a + b for a, b in zip(za, zb)] for za, zb in zip(zonas, d['zonas'])]
        for k, v in d['rel'].items():
            rel[k] = [a + b for a, b in zip(rel.get(k, [0] * 5), v)]
        for k, v in d.get('cuadrado', {}).items():
            cuadrado[k] = [a + b for a, b in zip(cuadrado.get(k, [0] * 5), v)]
    if zonas is None:
        return {}
    return {
        'zonas': [[int(n), int(ok), round(dx / n, 1) if n else 0, round(dy / n, 1) if n else 0] for n, ok, dx, dy in zonas],
        'rel': [[int(k.split('|')[0]), k.split('|')[1], int(v[0]), *(round(c / v[0], 1) for c in v[1:])]
                for k, v in sorted(rel.items(), key=lambda kv: -kv[1][0])[:40]],
        # Pases al cuadrado (x 60-83, y 25-75) por demarcación receptora: [dem, n, x0, y0, x1, y1] (top 5)
        'cuadrado': [[k, int(v[0]), *(round(c / v[0], 1) for c in v[1:])]
                     for k, v in sorted(cuadrado.items(), key=lambda kv: -kv[1][0])[:5]],
    }


def _sumar_pases(grp: pd.DataFrame) -> Dict:
    if 'pases_json' not in grp:
        return {}
    return {'general': _agregar_pases(grp['pases_json']),
            'por_demarcacion': {d: _agregar_pases(g['pases_json']) for d, g in grp.groupby('demarcacion')}}


def agregar_temporada(df_partidos: pd.DataFrame, df_scores_partido: pd.DataFrame) -> pd.DataFrame:
    """Una fila por jugador con métricas agregadas, conteos p90, campograma y metadatos.
    La demarcación guardada es la principal (la de más minutos)."""
    cols = metric_columns(df_partidos)
    sp = df_scores_partido.merge(df_partidos[['match_id', 'player_id', 'match_date']], on=['match_id', 'player_id'], how='left')
    # Partidos sin estadísticas (score_general NaN) no cuentan para la regularidad
    sp['media_scores'] = sp[SCORE_COLS].mean(axis=1).where(sp['score_general'].notna())
    series_scores = {k: g.sort_values('match_date')['media_scores'].to_numpy(dtype=float)
                     for k, g in sp.groupby('player_id')}

    partidos_equipo = df_partidos.groupby('team_id')['match_id'].nunique().to_dict()
    records = []
    for pid, grp in df_partidos.groupby('player_id'):
        mins = grp['minutes_played'].sum()
        if mins < MIN_MINUTOS_TEMPORADA:
            continue
        grp = grp.sort_values('match_date')
        pesos = grp['minutes_played'].to_numpy(dtype=float)
        dems = grp.groupby('demarcacion')['minutes_played'].sum().sort_values(ascending=False)
        principal = dems.index[0]
        row = {
            'player_id': pid,
            'demarcacion': principal,
            'grupo_demarcacion': grp.loc[grp['demarcacion'] == principal, 'grupo_demarcacion'].iloc[0],
            'team_id': grp['team_id'].iloc[-1],
            'matches_played': int(len(grp)),
            'matches_70m': int((grp['minutes_played'] >= 70).sum()),
            'starts': int(grp['is_starter'].sum()),
            'minutes_played': int(mins),
            '_demarcaciones': {d: {'min': int(m), 'pj': int((grp['demarcacion'] == d).sum())} for d, m in dems.items()},
            '_heatmap': _sumar_heatmaps(grp),
            '_pases': _sumar_pases(grp),
        }
        row['starter_pct'] = round(row['starts'] / row['matches_played'] * 100, 2)
        for col in cols:
            vals = pd.to_numeric(grp[col], errors='coerce').to_numpy(dtype=float)
            ok = ~np.isnan(vals)
            # Sin el dato en ningún partido (métrica solo de eventing en partidos sin eventing): NaN, no 0
            if not ok.any():
                row[col] = np.nan
            elif col in SUM_METRICS:
                row[col] = float(vals[ok].sum())
            elif col in MEAN_METRICS:
                row[col] = float(vals[ok].mean())
            else:
                row[col] = float(np.average(vals[ok], weights=pesos[ok])) if pesos[ok].sum() > 0 else 0.0
        row['comp_polivalencia_demarcacion'] = int(len(dems))
        row['disp_partidos'] = int(len(grp))
        # % de los minutos que ha podido jugar: partidos de sus equipos en la temporada x 90
        disponibles = sum(partidos_equipo.get(t, 0) for t in grp['team_id'].unique()) * 90
        row['disp_minutos_equipo_pct'] = round(mins / disponibles * 100, 2) if disponibles else 0.0
        row['comp_regularidad'] = calcular_regularidad_scores(series_scores.get(pid, np.array([])))
        for c in CONTEO_COLS:
            row[f'_sum_{c}'] = float(grp[c].sum())
        records.append(row)
    return pd.DataFrame(records)


def _percentil_0_100(serie: pd.Series, invert: bool = False, rank_method: str = 'average') -> pd.Series:
    """Percentil 0-100 entre los valores no nulos; rank_method='min' para no inflar empates a 0. NaN se queda NaN."""
    validos = serie.dropna()
    if len(validos) == 0:
        return serie * np.nan
    if len(validos) == 1:
        return serie.where(serie.isna(), 50.0)
    r = validos.rank(method=rank_method, ascending=not invert)
    return ((r - 1) / (len(validos) - 1) * 100).reindex(serie.index)


def _nota_desde_z(z, nivel: float):
    """Desviaciones típicas frente al grupo → nota 0-100: nivel de la liga + NOTA_DESVIACION * z. Por encima de
    NOTA_TECHO_INICIO se comprime hacia NOTA_TECHO, que no se alcanza: cada punto cuesta más que el anterior."""
    nota = nivel + NOTA_DESVIACION * z
    rango = NOTA_TECHO - NOTA_TECHO_INICIO
    exceso = (nota - NOTA_TECHO_INICIO).clip(lower=0)
    return nota.clip(upper=NOTA_TECHO_INICIO).clip(lower=1) + rango * (1 - np.exp(-exceso / rango))


def _referencia(grupos: pd.Series, mins: pd.Series) -> pd.Series:
    """Filas que fijan la media y la desviación de cada grupo: las de >= MIN_MINUTOS_REFERENCIA, si el grupo tiene
    al menos MIN_REFERENCIA_GRUPO; si no, todas las del grupo. Es la vara de medir, no un filtro: se puntúa a todas."""
    fiable = mins >= MIN_MINUTOS_REFERENCIA
    n_fiables = fiable.groupby(grupos).transform('sum')
    return fiable | (n_fiables < MIN_REFERENCIA_GRUPO)


def _z_grupo(serie: pd.Series, grupos: pd.Series, ref: pd.Series) -> pd.Series:
    """Desviaciones típicas de cada fila frente a la media de la referencia de su grupo. Menos de 3 valores de
    referencia o sin varianza → 0 (la media). NaN sigue NaN."""
    out = pd.Series(np.nan, index=serie.index)
    for _, idx in serie.groupby(grupos).groups.items():
        g = serie[idx]
        r = g[ref[idx]].dropna()
        sd = r.std(ddof=0) if len(r) >= 3 else 0.0
        out[idx] = ((g - r.mean()) / sd) if sd > 1e-9 else g.where(g.isna(), 0.0)
    return out


def _relativa_liga(serie: pd.Series, grupos: pd.Series, ref: pd.Series, nivel: float = NOTA_MEDIA_LIGA) -> pd.Series:
    """Nota 0-100 respecto a la referencia de su grupo en la liga, con la jugadora media en el nivel de la liga."""
    return _nota_desde_z(_z_grupo(serie, grupos, ref).clip(-3.5, 3.5), nivel)


def derivar_metricas(df: pd.DataFrame) -> pd.DataFrame:
    """Métricas derivadas de otras columnas (también para cachés antiguas): goles − xG (solo con eventing)."""
    if 'of_goles_p90' in df.columns and 'of_xG_p90' in df.columns:
        xg = pd.to_numeric(df['of_xG_p90'], errors='coerce')
        df = df.assign(of_goles_menos_xg_p90=(pd.to_numeric(df['of_goles_p90'], errors='coerce') - xg).where(xg.notna()))
    return df


def sumar_acumulados(*acums: Optional[Acumulado]) -> Acumulado:
    """Suma acumulados [n, suma, suma²] por demarcación y métrica (de varias temporadas)."""
    out: Acumulado = {}
    for a in acums:
        for g, met in (a or {}).items():
            for c, (n, s1, s2) in met.items():
                t = out.setdefault(g, {}).setdefault(c, [0.0, 0.0, 0.0])
                t[0] += n
                t[1] += s1
                t[2] += s2
    return out


def _acumular(v: pd.Series, grupos_dem: pd.Series, ref: pd.Series, col: str, acum: Acumulado):
    r = v[ref & v.notna()]
    for g, x in r.groupby(grupos_dem[r.index]):
        acum.setdefault(str(g), {})[col] = [float(len(x)), float(x.sum()), float((x ** 2).sum())]


def _z_combinada(v: pd.Series, grupos: pd.Series, grupos_dem: pd.Series, ref: pd.Series, equipos: Optional[pd.Series],
                 general: Acumulado, col: str) -> pd.Series:
    """Desviaciones típicas de cada fila frente a tres medias de su demarcación, ponderadas con PESOS_REFERENCIA:
    liga (referencia de su grupo), equipo (compañeras del mismo grupo, sin contarla a ella; con la desviación de la
    liga) y general (todas las ligas: `general`, ya con esta incluida). Sin alguna, su peso se reparte."""
    z_liga = _z_grupo(v, grupos, ref)
    vr = v.where(ref)
    sd_liga = vr.groupby(grupos).transform(lambda x: x.std(ddof=0) if x.count() >= 3 else np.nan)
    partes = {'liga': z_liga}
    if equipos is not None:
        clave = equipos.astype(str) + '|' + grupos.astype(str)
        suma, n = vr.groupby(clave).transform('sum'), vr.groupby(clave).transform('count')
        propia = vr.notna().astype(float)
        media_eq = (suma - vr.fillna(0)) / (n - propia)  # compañeras, sin ella
        partes['equipo'] = ((v - media_eq) / sd_liga).where((grupos != 'Porteros') & (n - propia >= 1) & (sd_liga > 1e-9))
    g_media, g_sd = {}, {}
    for g, met in general.items():
        t = met.get(col)
        if t and t[0] >= MIN_REFERENCIA_GLOBAL:
            m = t[1] / t[0]
            g_media[g], g_sd[g] = m, np.sqrt(max(t[2] / t[0] - m * m, 0.0))
    if g_media:
        gm, gs = grupos_dem.astype(str).map(g_media), grupos_dem.astype(str).map(g_sd)
        partes['general'] = ((v - gm) / gs).where(gs > 1e-9)
    num = pd.Series(0.0, index=v.index)
    den = pd.Series(0.0, index=v.index)
    for k, z in partes.items():
        ok = z.notna()
        num += z.fillna(0) * PESOS_REFERENCIA[k] * ok
        den += PESOS_REFERENCIA[k] * ok
    return (num / den).where((den > 0) & v.notna())


def _z_metricas(df: pd.DataFrame, cols: List[str], grupos: pd.Series, ref: pd.Series,
                general: Optional[Acumulado] = None, acum: Optional[Acumulado] = None, ceros: bool = True) -> pd.DataFrame:
    """z de cada métrica frente a liga, equipo y media general de su demarcación (_z_combinada), recortado a
    ±Z_RECORTE (malus invertidas). Con `ceros`, un 0 que no informa no cuenta (NaN): en métricas de conteo, si con
    sus minutos la jugadora media de la referencia habría hecho menos de 1 acción; en porcentajes, con menos de
    MIN_MINUTOS_NOTA (las diferencias, como goles − xG, siempre cuentan).
    `general`: acumulados de las demás temporadas; `acum`: se rellena con los de esta (y se suman a la general)."""
    mins = df['minutes_played'].astype(float)
    grupos_dem = df['grupo_demarcacion'].fillna('_sin')
    equipos = df['team_id'] if 'team_id' in df.columns else None
    valores, propio = {}, {}
    for c in cols:
        v = pd.to_numeric(df[c], errors='coerce').astype(float)
        if not v.notna().any():
            continue
        if ceros and c not in DIFERENCIAS:
            if c.endswith('_p90'):
                media_ref = v.where(ref).groupby(grupos).transform('mean').fillna(0)
                v = v.mask((v == 0) & (media_ref * mins / 90 < 1))
            elif c.endswith('_pct'):
                v = v.mask((v == 0) & (mins < MIN_MINUTOS_NOTA))
        valores[c] = v
        _acumular(v, grupos_dem, ref, c, propio)
    if acum is not None:
        acum.update(propio)
    total = sumar_acumulados(general, propio)
    out = {}
    for c, v in valores.items():
        z = _z_combinada(v, grupos, grupos_dem, ref, equipos, total, c).clip(-Z_RECORTE, Z_RECORTE)
        out[c] = -z if c in MALUS else z
    return pd.DataFrame(out, index=df.index)


def _nota_clave(z: pd.DataFrame, df: pd.DataFrame) -> pd.Series:
    """Media ponderada de las métricas clave de su posición (PLANTILLAS_POSICION, demarcación principal)."""
    plantilla = [plantilla_de(d, g) for d, g in zip(df['demarcacion'], df['grupo_demarcacion'])]
    clave = pd.Series(np.nan, index=df.index)
    for i, t in zip(df.index, plantilla):
        w = {k: p for k, p in PLANTILLAS_POSICION[t].items() if k in z.columns and pd.notna(z.at[i, k])}
        if w:
            clave[i] = sum(z.at[i, k] * p for k, p in w.items()) / sum(w.values())
    return clave


def puntuar_categorias(df_temp: pd.DataFrame, nivel: float = NOTA_MEDIA_LIGA, general: Optional[Acumulado] = None,
                       acum: Optional[Acumulado] = None) -> pd.DataFrame:
    """
    Notas 0-100 por métrica, subcategoría, categoría y global (ver pipeline/categorias.py), solo con rendimiento
    p90: los minutos no puntúan (Disponibilidad no entra en la global) ni se corrige hacia la media.
    1. Cada métrica → desviaciones típicas frente a tres medias de su demarcación (_z_metricas): su liga-temporada
       (jugadoras con minutos suficientes, _referencia), sus compañeras de equipo y todas las ligas (`general`).
       Los ceros que no informan no cuentan.
    2. Subcategoría = media de sus métricas; categoría = media de sus subcategorías; sin datos → NaN.
       Porteras con JERARQUIA_PORTEROS, el resto con JERARQUIA.
    3. Global = PESO_CLAVE * métricas clave de su posición (PLANTILLAS_POSICION, demarcación principal)
       + (1 - PESO_CLAVE) * categorías con los pesos de su grupo (PESOS_GRUPO). Si falta una parte, la otra.
    4. Todo se expresa respecto a la referencia de su grupo con la jugadora media en `nivel` (_relativa_liga).
    5. muestra_baja: < MIN_MINUTOS_NOTA minutos o < MIN_PARTIDOS_NOTA partidos (aviso, fuera de rankings).
    """
    df = df_temp.copy()
    mins = df['minutes_played'].astype(float)
    grupos = _grupos(df, MIN_JUGADORAS_GRUPO)
    ref = _referencia(grupos, mins)
    z = _z_metricas(df, [c for c in METRICA_SUB if c in df.columns], grupos, ref, general=general, acum=acum)
    notas_met = _nota_desde_z(z, nivel).where(z.notna())

    subs, cats = _categorias(z, df['grupo_demarcacion'])
    clave = _nota_clave(z, df)  # métricas clave de su posición

    def nota_cats(i):
        pesos = PESOS_GRUPO.get(df.at[i, 'grupo_demarcacion'], PESOS_GRUPO['Medios'])
        validos = {k: w for k, w in pesos.items() if w > 0 and k in cats.columns and pd.notna(cats.at[i, k])}
        total = sum(validos.values())
        return sum(cats.at[i, k] * w for k, w in validos.items()) / total if total else np.nan

    por_cats = pd.Series([nota_cats(i) for i in df.index], index=df.index, dtype=float)
    glob = (PESO_CLAVE * clave.fillna(por_cats) + (1 - PESO_CLAVE) * por_cats.fillna(clave))
    df['nota_global'] = _relativa_liga(glob, grupos, ref, nivel)
    cats = cats.apply(lambda col: _relativa_liga(col, grupos, ref, nivel))
    subs = subs.apply(lambda col: _relativa_liga(col, grupos, ref, nivel))
    for cat in CATEGORIAS:
        df[f'nota_{cat}'] = cats[cat]
    df['_notas_met'] = [notas_met.loc[i].dropna().to_dict() for i in df.index]
    df['_notas_sub'] = [subs.loc[i].to_dict() for i in df.index]
    df['_muestra_baja'] = (mins < MIN_MINUTOS_NOTA) | (df['matches_played'] < MIN_PARTIDOS_NOTA)
    return df


def puntuar_temporada(df_temp: pd.DataFrame, nivel: float = NOTA_MEDIA_LIGA, general: Optional[Acumulado] = None,
                      acum: Optional[Acumulado] = None) -> pd.DataFrame:
    """Añade scores de bloque 0-10, percentiles y notas por métrica (radar) frente a toda la liga."""
    if df_temp.empty:
        return df_temp
    df_temp = puntuar_categorias(df_temp, nivel, general, acum)
    cols = metric_columns(df_temp)
    # Columnas 0-10 de siempre (ranking y listados) a partir de las notas 0-100 por categoría
    a10 = lambda s: (s.fillna(nivel) / 10).round(2)
    df_temp['score_general'] = a10(df_temp['nota_global'])
    df_temp['score_ofensivo'] = a10(df_temp[['nota_ataque', 'nota_construccion']].mean(axis=1))
    df_temp['score_defensivo'] = a10(df_temp['nota_defensa'])
    df_temp['score_abp'] = a10(df_temp['nota_balon_parado'])
    df_temp['score_comportamiento'] = a10(df_temp['nota_disponibilidad'])
    # Percentiles, notas base y top 10 separando siempre Porteros del resto de jugadoras de campo
    es_gk = df_temp['grupo_demarcacion'] == 'Porteros'
    fiables = ~df_temp['_muestra_baja']
    for sc in SCORE_COLS:
        df_temp[sc.replace('score_', 'percentile_')] = 50.0
    notas = pd.DataFrame(5.0, index=df_temp.index, columns=cols)
    puestos = pd.DataFrame(np.nan, index=df_temp.index, columns=cols)
    for mask_pool in (es_gk, ~es_gk):
        if not mask_pool.any():
            continue
        fiables_pool = fiables & mask_pool
        if fiables_pool.sum() < 2:
            fiables_pool = mask_pool
        for sc in SCORE_COLS:
            ref_vals = np.sort(df_temp.loc[fiables_pool, sc].to_numpy(dtype=float))
            if len(ref_vals) > 1:
                vals_pool = df_temp.loc[mask_pool, sc].to_numpy(dtype=float)
                lo = np.searchsorted(ref_vals, vals_pool, side='left')
                hi = np.searchsorted(ref_vals, vals_pool, side='right')
                df_temp.loc[mask_pool, sc.replace('score_', 'percentile_')] = np.round((lo + hi) / 2 / len(ref_vals) * 99, 2)
        for c in cols:
            notas.loc[mask_pool, c] = scale_0_10(df_temp.loc[mask_pool, c], invert=c in MALUS_METRICS)
            puestos.loc[fiables_pool, c] = df_temp.loc[fiables_pool, c].rank(ascending=c in MALUS_METRICS, method='min')
    for i in df_temp.index:
        for c, n in df_temp.at[i, '_notas_met'].items():
            if c in notas.columns and pd.notna(n):
                notas.at[i, c] = round(n / 10, 2)
    def top10(i):
        out = {}
        if df_temp.at[i, '_muestra_baja']:
            return out
        for c in cols:
            v = float(df_temp.at[i, c])
            if pd.notna(v) and puestos.at[i, c] <= 10 and (c in MALUS_METRICS or v > 0):
                out[c] = int(puestos.at[i, c])
        return out

    perfiles_v4 = calcular_perfiles_v4(df_temp)
    df_temp['radar_data'] = [
        {'metricas': {**{c: [round(float(df_temp.at[i, c]), 3), float(notas.at[i, c])] for c in cols
                         if pd.notna(df_temp.at[i, c])},
                      # Notas 0-100 de categoría y subcategoría: [nota, nota/10] (formato de las métricas)
                      **{f'_cat_{k}': [round(float(df_temp.at[i, f'nota_{k}']), 1),
                                       round(float(df_temp.at[i, f'nota_{k}']) / 10, 2)]
                         for k in CATEGORIAS if pd.notna(df_temp.at[i, f'nota_{k}'])},
                      **{f'_sub_{k}': [round(float(v), 1), round(float(v) / 10, 2)]
                         for k, v in df_temp.at[i, '_notas_sub'].items() if pd.notna(v)}},
         'top10': top10(i), 'jugadoras_liga': int(fiables.sum()),
         'muestra_baja': bool(df_temp.at[i, '_muestra_baja']),
         'perfil': perfiles_v4.get(i, {}).get('perfil'),
         'perfiles': perfiles_v4.get(i, {}).get('perfiles'),
         'heatmap': df_temp.at[i, '_heatmap'], 'pases': df_temp.at[i, '_pases'], 'demarcaciones': df_temp.at[i, '_demarcaciones']}
        for i in df_temp.index
    ]
    return df_temp


def filas_season_stats(df_temp: pd.DataFrame, competition_id: str, season_id: str, now_iso: str) -> List[Dict]:
    """Convierte el resultado de puntuar_temporada en filas de public.player_season_stats."""
    def per90(row, c):
        return round(row[f'_sum_{c}'] / row['minutes_played'] * 90, 3) if row['minutes_played'] else 0.0

    def pct(num, den):
        return round(num / den * 100, 2) if den else 0.0

    out = []
    for _, r in df_temp.iterrows():
        out.append({
            'player_id': r['player_id'],
            'season_id': season_id,
            'competition_id': competition_id,
            'team_id': r['team_id'],
            'demarcacion': r['demarcacion'],
            'grupo_demarcacion': r['grupo_demarcacion'],
            'matches_played': int(r['matches_played']),
            'matches_70m': int(r['matches_70m']),
            'starts': int(r['starts']),
            'minutes_played': int(r['minutes_played']),
            'starter_pct': float(r['starter_pct']),
            **{sc: float(r[sc]) for sc in SCORE_COLS},
            **{sc.replace('score_', 'percentile_'): float(r[sc.replace('score_', 'percentile_')]) for sc in SCORE_COLS},
            'goals_p90': per90(r, 'goals'),
            'assists_p90': per90(r, 'assists'),
            'xg_p90': per90(r, 'xg'),
            'xa_p90': per90(r, 'xa'),
            'xca_p90': per90(r, 'xca'),
            'passes_p90': per90(r, 'passes_completed'),
            'passes_pct': pct(r['_sum_passes_completed'], r['_sum_passes_total']),
            'progressive_passes_p90': per90(r, 'progressive_passes'),
            'takeons_p90': per90(r, 'takeons_successful'),
            'takeons_pct': pct(r['_sum_takeons_successful'], r['_sum_takeons_total']),
            'tackles_p90': per90(r, 'tackles_won'),
            'tackles_pct': pct(r['_sum_tackles_won'], r['_sum_tackles_total']),
            'interceptions_p90': per90(r, 'interceptions'),
            'recoveries_p90': per90(r, 'recoveries'),
            'aerials_p90': per90(r, 'aerials_won'),
            'aerials_pct': pct(r['_sum_aerials_won'], r['_sum_aerials_total']),
            **{k: (round(float(r[k]), 1) if pd.notna(r[k]) else None) for k in NOTA_COLS},
            'radar_data': r['radar_data'],
            'updated_at': now_iso,
        })
    return out


def calcular_temporada(df_partidos: pd.DataFrame, nivel: float = NOTA_MEDIA_LIGA,
                       general: Optional[Dict[str, Acumulado]] = None,
                       acum: Optional[Dict[str, Acumulado]] = None) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Punto de entrada: (scores por partido, tabla de temporada puntuada). `nivel`: el de la liga (NIVEL_LIGA).
    `general`: {'partido': acumulado, 'temporada': acumulado} de las DEMÁS temporadas (media general por demarcación
    entre ligas); `acum`: se rellena con los de esta temporada, para guardarlos (ingest.referencia_general)."""
    if df_partidos.empty:
        return pd.DataFrame(), pd.DataFrame()
    general, acum = general or {}, acum if acum is not None else {}
    acum.setdefault('partido', {})
    acum.setdefault('temporada', {})
    df_partidos = derivar_metricas(df_partidos)
    df_sp = scores_por_partido(df_partidos, general=general.get('partido'), acum=acum['partido'])
    df_temp = puntuar_temporada(agregar_temporada(df_partidos, df_sp), nivel, general.get('temporada'), acum['temporada'])
    return df_sp, df_temp


def calcular_similares(filas: List[Dict], top: int = 10) -> Dict[str, List[Dict]]:
    """Similitud coseno entre perfiles de notas (nota - media de la métrica) de todas las filas de temporada,
    de cualquier liga. Devuelve {player_id: [{player_id, sim}]} con los `top` más parecidos."""
    if len(filas) < 2:
        return {}
    cols = sorted({c for f in filas for c in (f.get('radar_data') or {}).get('metricas', {}) if not c.startswith('_')})
    ids = [f['player_id'] for f in filas]
    m = np.array([[((f.get('radar_data') or {}).get('metricas', {}).get(c) or [0, np.nan])[1] for c in cols]
                  for f in filas], dtype=np.float32)
    # Centrado por métrica dentro de cada liga (sin dato = media): las notas de jerarquía y las de escala clásica
    # tienen distinta media, y el nivel de la liga no debe contar como parecido de estilo
    ligas = np.array([str(f.get('competition_id')) for f in filas])
    for liga in np.unique(ligas):
        en_liga = ligas == liga
        m[en_liga] -= np.nanmean(m[en_liga], axis=0, keepdims=True)
    m = np.nan_to_num(m)
    m /= np.maximum(np.linalg.norm(m, axis=1, keepdims=True), 1e-6)
    out = {}
    for i0 in range(0, len(ids), 1000):
        sims = m[i0:i0 + 1000] @ m.T
        for k, fila in enumerate(sims):
            i = i0 + k
            fila[i] = -2
            idx = np.argpartition(-fila, top)[:top]
            idx = idx[np.argsort(-fila[idx])]
            out[ids[i]] = [{'player_id': ids[j], 'sim': round(float((fila[j] + 1) * 50), 1)} for j in idx]
    return out
