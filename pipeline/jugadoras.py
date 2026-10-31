"""
pipeline/jugadoras.py
Descarga de jugadoras de las ligas y temporadas marcadas en /admin (nada si no hay ninguna marcada):
1. opta         Plantillas (nombre, nacimiento, lugar, nacionalidad, altura, peso, dorsal), calendario completo
                (jugados y por jugar) y, de cada partido jugado, eventing + matchstats → estadísticas y
                valoración por partido de cada jugadora y agregados de temporada
2. soccerdonna  Perfil emparejado por parecido (nombre + club + edad, confirmado con fecha/lugar de nacimiento,
                dorsal o club): altura, pie, nacionalidades, valor de mercado y su evolución, traspasos,
                selección nacional y lesiones (páginas /en/: textos en inglés)
3. fotos        FotMob (buscador por nombre + club); sin foto en FotMob se queda sin foto

Uso:
    python -m pipeline.jugadoras                      Los tres pasos, todas las jugadoras pendientes
    python -m pipeline.jugadoras --max-matches 5 --limit 10   Prueba: 5 partidos por temporada, 10 jugadoras
    python -m pipeline.jugadoras --paso soccerdonna   Un solo paso (opta | soccerdonna | fotos)
    python -m pipeline.jugadoras --prueba --limit 8   Sin base de datos: descarga y empareja, imprime el resultado
"""

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from .config import LOCAL_CACHE_DIR
from .fotos_jugadoras import jugadoras_objetivo, sincronizar_fotos_jugadoras
from .ingest import IngestionPipeline
from .photos import FotMobClient
from .soccerdonna import (MAX_CANDIDATAS, SDClient, SoccerdonnaSync, candidatas_jugadora, confirmar_perfil,
                          filas_jugadora, now_iso)
from .storage import Store, competiciones_objetivo, get_supabase_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("jugadoras")
PASOS = ("opta", "soccerdonna", "fotos")


def objetivos(store: Store, comp_id: Optional[str]) -> List[Dict[str, Any]]:
    comps = [c for c in competiciones_objetivo(store, solo_admin=True) if not comp_id or c["id"] == comp_id]
    if not comps:
        raise SystemExit("No hay ligas marcadas en /admin (Leagues & Seasons to Download): nada que descargar")
    return comps


def paso_opta(comp_id: Optional[str], max_matches: Optional[int]):
    # Las fotos las pone después FotMob (paso fotos); aquí solo datos Opta
    pipe = IngestionPipeline(skip_photos=True, max_matches_per_comp=max_matches)
    comps = objetivos(pipe.store, comp_id)
    logger.info(f"▶ Opta: {len(comps)} temporadas marcadas en /admin")
    for comp in comps:
        logger.info(f"  {comp['name']} ({comp['country']}) — temporada {comp['season_id']}")
        pipe.procesar_competicion(comp)
    if pipe.totales["matches"]:
        pipe.actualizar_similares()
    logger.info(f"  Opta: {pipe.totales}")


def paso_soccerdonna(comp_id: Optional[str], limit: Optional[int]) -> List[str]:
    logger.info("▶ Soccerdonna")
    sync = SoccerdonnaSync(limit=limit, fotos=False)
    objetivos(sync.store, comp_id)
    sync.run(comp_id)
    return getattr(sync, "procesadas", [])


def paso_fotos(comp_id: Optional[str], limit: Optional[int], solo: Optional[List[str]] = None):
    logger.info("▶ Fotos FotMob")
    store = Store(get_supabase_client())
    comps = objetivos(store, comp_id)
    jugadoras, clubes = jugadoras_objetivo(store, comps)
    if solo:
        # Mismas jugadoras que el paso de Soccerdonna, para comparar la prueba
        jugadoras = [p for p in jugadoras if p["id"] in set(solo)]
    if limit:
        jugadoras = jugadoras[:limit]
    liga = next((c.get("fotmob_id") for c in reversed(comps) if c.get("fotmob_id")), None)
    res = sincronizar_fotos_jugadoras(store, FotMobClient(), None, jugadoras, clubes, liga_fotmob=liga, solo_fotmob=True)
    logger.info(f"  Fotos: {res}")


def informe(ids: List[str]):
    """Qué se ha sacado de cada jugadora de la prueba."""
    if not ids:
        return
    store = Store(get_supabase_client())
    cols = "id,name,birth_date,place_of_birth,country,citizenship,height,weight,preferred_foot,market_value,sd_url,photo_url"
    jugadoras = [p for p in store.select_all("players", cols) if p["id"] in set(ids)]
    cuenta = {}
    for tabla in ("player_market_values", "player_transfers", "player_national_teams", "player_injuries"):
        n: Dict[str, int] = {}
        for r in store.select_all(tabla, "player_id"):
            n[r["player_id"]] = n.get(r["player_id"], 0) + 1
        cuenta[tabla] = n
    print("\nJugadora | Soccerdonna | Nacimiento | Altura | Valor | Valores/Traspasos/Selección/Lesiones | Foto")
    for p in jugadoras:
        c = [cuenta[t].get(p["id"], 0) for t in cuenta]
        print(f"{p['name']} | {'sí' if p.get('sd_url') else 'NO'} | {p.get('birth_date')} {p.get('place_of_birth') or ''} | "
              f"{p.get('height') or '-'} | {p.get('market_value') or '-'} | {'/'.join(map(str, c))} | "
              f"{'FotMob' if p.get('photo_url') else 'sin foto'}")


def prueba_sin_bd(comp_id: Optional[str], limit: int):
    """Descarga plantillas de Opta y empareja `limit` jugadoras con Soccerdonna y FotMob sin escribir en BD."""
    pipe = IngestionPipeline(dry_run=True, skip_photos=True)
    comps = [c for c in competiciones_objetivo(pipe.store) if not comp_id or c["id"] == comp_id]
    comp = next((c for c in comps if c.get("active")), comps[-1])
    clubes = {sq.get("contestantId"): sq.get("contestantName") for sq in pipe.adapter.get_squads(comp["season_id"])}
    perfiles = pipe.sync_squads(comp)
    # Una jugadora de cada equipo, por turnos, para probar clubes distintos
    por_equipo: Dict[str, List[Dict[str, Any]]] = {}
    for p in perfiles.values():
        if p.get("current_team_id"):
            por_equipo.setdefault(p["current_team_id"], []).append(p)
    muestra = []
    while len(muestra) < limit and any(por_equipo.values()):
        for lista in por_equipo.values():
            if lista and len(muestra) < limit:
                muestra.append(lista.pop(0))

    sd, fotmob = SDClient(), FotMobClient()
    resultados = []
    for p in muestra:
        club = clubes.get(p["current_team_id"])
        r: Dict[str, Any] = {"opta": {k: p.get(k) for k in ("name", "match_name", "birth_date", "place_of_birth",
                                                            "country", "height", "weight", "shirt_number")},
                             "club": club}
        for n, cand in enumerate(candidatas_jugadora(sd, p, club)):
            if n >= MAX_CANDIDATAS:
                break
            ficha = sd.perfil(cand["slug"], cand["sd_id"])
            if ficha and confirmar_perfil(p, cand, ficha, club):
                filas = filas_jugadora(p, cand, ficha, sd.traspasos(cand["slug"], cand["sd_id"]), now_iso())
                r["soccerdonna"] = {"perfil": filas["players"][0], "datos": ficha["datos"],
                                    **{k: v for k, v in filas.items() if k != "players"}}
                break
        m = fotmob.buscar_jugador(p, club, comp.get("fotmob_id"))
        r["fotmob"] = {"id": m["id"], "name": m.get("name")} if m else None
        resultados.append(r)
        sdr = r.get("soccerdonna")
        print(f"\n■ {p['name']} ({club}) · Opta: {p.get('birth_date')} {p.get('place_of_birth') or ''}, "
              f"{p.get('height') or '-'} cm, {p.get('weight') or '-'} kg")
        if sdr:
            d = sdr["datos"]
            print(f"  Soccerdonna: {sdr['perfil']['sd_url']}")
            print(f"    Born {d.get('Date of birth')} in {d.get('Place of birth')} · Height {d.get('Height')} · "
                  f"Foot {d.get('Foot')} · Nationality {', '.join(sdr['perfil'].get('citizenship') or [])}")
            print(f"    Position {d.get('Position')} · Market value {d.get('Market value')} · "
                  f"{len(sdr['player_market_values'])} values · {len(sdr['player_transfers'])} transfers · "
                  f"{len(sdr['player_national_teams'])} national teams · {len(sdr['player_injuries'])} injuries")
            for t in sdr["player_transfers"][:3]:
                print(f"      {t['date']}: {t['club_from']} → {t['club_to']} ({t['fee_text']})")
            for s in sdr["player_national_teams"]:
                print(f"      {s['team_name']}: {s['caps']} caps, {s['goals']} goals")
            for l in sdr["player_injuries"][:3]:
                print(f"      Injury {l['from_date']}: {l['injury']}")
        else:
            print("  Soccerdonna: NOT MATCHED")
        print(f"  FotMob: {'https://www.fotmob.com/players/' + str(m['id']) if m else 'NOT FOUND'}")

    salida = Path(LOCAL_CACHE_DIR) / "prueba_jugadoras.json"
    salida.parent.mkdir(parents=True, exist_ok=True)
    salida.write_text(json.dumps(resultados, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    ok_sd = sum(1 for r in resultados if r.get("soccerdonna"))
    ok_fm = sum(1 for r in resultados if r.get("fotmob"))
    print(f"\nSoccerdonna {ok_sd}/{len(resultados)} · FotMob {ok_fm}/{len(resultados)} · detalle en {salida}")


def main():
    parser = argparse.ArgumentParser(description="Descargar jugadoras de las ligas de /admin + Soccerdonna + fotos FotMob")
    parser.add_argument("--paso", choices=PASOS + ("todo",), default="todo")
    parser.add_argument("--comp-id", type=str, default=None)
    parser.add_argument("--limit", type=int, default=None, help="Soccerdonna y fotos solo para N jugadoras (pruebas)")
    parser.add_argument("--max-matches", type=int, default=None, help="Máximo de partidos nuevos por temporada (pruebas)")
    parser.add_argument("--prueba", action="store_true", help="Sin base de datos: muestra cómo se emparejan")
    args = parser.parse_args()

    if args.prueba:
        prueba_sin_bd(args.comp_id, args.limit or 8)
        return
    procesadas: List[str] = []
    if args.paso in ("todo", "opta"):
        paso_opta(args.comp_id, args.max_matches)
    if args.paso in ("todo", "soccerdonna"):
        procesadas = paso_soccerdonna(args.comp_id, args.limit)
    if args.paso in ("todo", "fotos"):
        paso_fotos(args.comp_id, args.limit, procesadas if args.limit else None)
    if args.limit:
        informe(procesadas)
    sys.exit(0)


if __name__ == "__main__":
    main()
