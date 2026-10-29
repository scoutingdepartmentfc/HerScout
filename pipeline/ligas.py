"""
pipeline/ligas.py
Liga del equipo ACTUAL de cada jugadora (FotMob) y su logo → Supabase Storage.
1. ID FotMob de la jugadora (se guarda en players.fotmob_id; si falta, buscador nombre + club)
2. playerData → primaryTeam (equipo actual, aunque ya no esté en Liga F) → liga de ese equipo
3. Sin club actual en FotMob: la liga de `mainLeague`; sin FotMob: la de Opta si sigue en su plantilla actual
Nunca una copa internacional (Champions, Libertadores): mejor sin liga que con una equivocada.

Uso suelto:
    python -m pipeline.ligas [--comp-id ID] [--refresh]
"""

import argparse
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from .config import BUCKET_TEAM_BADGES, COMPETITIONS_CONFIG, FOTMOB_LEAGUE_IMG, FOTMOB_TEAM_IMG
from .photos import FotMobClient
from .storage import Store, get_supabase_client

logger = logging.getLogger("ligas")
LOTE = 25


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def subir_ligas(store: Store, fotmob: FotMobClient, ligas: Dict[int, Optional[str]], ya: set) -> int:
    """Upsert en `leagues` con el logo en Storage (team-badges/ligas/{id}.png). Solo las que falten."""
    catalogo = fotmob.catalogo_ligas()
    filas = []
    for lid, nombre in ligas.items():
        if lid in ya:
            continue
        img = fotmob.image(FOTMOB_LEAGUE_IMG.format(id=lid))
        url = store.upload(BUCKET_TEAM_BADGES, f"ligas/{lid}.png", img, "image/png") if img else None
        info = catalogo.get(lid, {})
        filas.append({"id": lid, "name": info.get("name") or nombre or f"Liga {lid}",
                      "country_code": info.get("ccode"),
                      "logo_url": f"{url}?v={int(time.time())}" if url else FOTMOB_LEAGUE_IMG.format(id=lid),
                      "updated_at": now_iso()})
    if filas:
        store.upsert("leagues", filas)
    return len(filas)


_escudos_fm: Dict[int, Optional[str]] = {}


def escudo_fotmob(store: Store, fotmob: FotMobClient, team_id: int) -> Optional[str]:
    """Escudo del club actual en FotMob (nítido; los de Soccerdonna son de 25 px) → team-badges/fotmob/{id}.png"""
    if team_id not in _escudos_fm:
        img = fotmob.image(FOTMOB_TEAM_IMG.format(id=team_id))
        url = store.upload(BUCKET_TEAM_BADGES, f"fotmob/{team_id}.png", img, "image/png") if img else None
        _escudos_fm[team_id] = f"{url}?v={int(time.time())}" if url else None
    return _escudos_fm[team_id]


def sincronizar_ligas(store: Store, fotmob: FotMobClient, jugadoras: List[Dict[str, Any]], clubes: Dict[str, str],
                      liga_fotmob: Optional[int] = None, refrescar: bool = False) -> Dict[str, int]:
    """`jugadoras`: filas de players (id, name, ..., current_team_id, fotmob_id, league_id).
    `clubes`: {team_id Opta: nombre}. Sin `refrescar` solo se revisan las que no tienen liga."""
    totales = {"equipo": 0, "main_league": 0, "opta": 0, "sin_liga": 0}
    ligas: Dict[int, Optional[str]] = {}
    filas: List[Dict[str, Any]] = []
    ts = now_iso()
    for n, p in enumerate(jugadoras, 1):
        if p.get("league_id") and not refrescar:
            continue
        club = clubes.get(p.get("current_team_id"))
        fm_id = p.get("fotmob_id")
        if not fm_id:
            m = fotmob.buscar_jugador(p, club, liga_fotmob)
            fm_id = m["id"] if m else None
        liga, fuente, equipo = None, None, None
        if fm_id:
            d = fotmob.jugador(fm_id)
            equipo = d.get("primaryTeam") or {}
            if equipo.get("teamId"):
                liga, fuente = fotmob.liga_equipo(int(equipo["teamId"])), "equipo"
            # `mainLeague` es donde más ha jugado (puede ser el club anterior): solo si FotMob no da club actual
            ml = d.get("mainLeague") or {}
            if not equipo.get("teamId") and ml.get("leagueId") and not fotmob.es_internacional(int(ml["leagueId"])):
                liga, fuente = {"id": int(ml["leagueId"]), "name": ml.get("leagueName")}, "main_league"
        # Sin FotMob: Liga F solo si sigue en la plantilla actual de Opta (si se fue, no sabemos dónde juega)
        if not liga and not fm_id and liga_fotmob and club and p.get("en_plantilla", True):
            liga, fuente = {"id": liga_fotmob, "name": None}, "opta"

        fila = {"id": p["id"], "name": p["name"], "league_updated_at": ts}
        if fm_id:
            fila["fotmob_id"] = int(fm_id)
        if equipo and equipo.get("teamName"):
            fila["fm_team_name"] = equipo["teamName"]
        if equipo and equipo.get("teamId"):
            fila["fm_team_id"] = int(equipo["teamId"])
            fila["fm_team_badge_url"] = escudo_fotmob(store, fotmob, int(equipo["teamId"]))
        # Sin liga se guarda NULL: borra la que tuviera (traspaso o una copa asignada antes por error)
        fila["league_id"] = liga["id"] if liga else None
        if liga:
            ligas.setdefault(liga["id"], liga.get("name"))
            totales[fuente] += 1
        else:
            totales["sin_liga"] += 1
        filas.append(fila)
        if len(filas) >= LOTE:
            _guardar(store, fotmob, ligas, filas)
            filas = []
            logger.info(f"    Ligas: {n}/{len(jugadoras)} revisadas {totales}")
    if filas:
        _guardar(store, fotmob, ligas, filas)
    return totales


def _guardar(store: Store, fotmob: FotMobClient, ligas: Dict[int, Optional[str]], filas: List[Dict[str, Any]]):
    # Primero las ligas: players.league_id es FK a leagues
    ya = {l["id"] for l in store.select_all("leagues", "id")}
    subir_ligas(store, fotmob, ligas, ya)
    store.upsert("players", filas)


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    parser = argparse.ArgumentParser(description="Liga (y logo) del equipo actual de cada jugadora, desde FotMob")
    parser.add_argument("--comp-id", type=str, default=None)
    parser.add_argument("--refresh", action="store_true", help="Volver a revisar todas (traspasos)")
    args = parser.parse_args()
    store = Store(get_supabase_client())
    comps = [c for c in COMPETITIONS_CONFIG if not args.comp_id or c["id"] == args.comp_id]
    comp_ids = {c["id"] for c in comps}
    clubes = {t["id"]: t["name"] for t in store.select_all("teams", "id,name,competition_id")
              if t.get("competition_id") in comp_ids}
    # Sin equipo actual en Opta: el club de su última temporada (ayuda al buscador de FotMob)
    ultimo = {}
    orden = {c["season_id"]: i for i, c in enumerate(COMPETITIONS_CONFIG)}  # config: de antigua a activa
    filas = store.select_all("squad_members", "player_id,team_id,season_id") + \
        store.select_all("player_season_stats", "player_id,team_id,season_id")
    for r in sorted(filas, key=lambda r: orden.get(r["season_id"], -1)):
        if r.get("team_id"):
            ultimo[r["player_id"]] = r["team_id"]
    jugadoras = []
    for p in store.select_all("players", "id,name,match_name,first_name,last_name,birth_date,current_team_id,"
                                         "fotmob_id,league_id"):
        p["en_plantilla"] = p.get("current_team_id") in clubes
        p["current_team_id"] = p.get("current_team_id") if p["en_plantilla"] else ultimo.get(p["id"])
        if p["current_team_id"] in clubes:
            jugadoras.append(p)
    logger.info(f"Ligas: {len(jugadoras)} jugadoras")
    res = sincronizar_ligas(store, FotMobClient(), jugadoras, clubes, comps[-1]["fotmob_id"], args.refresh)
    logger.info(f"Ligas completado: {res}")


if __name__ == "__main__":
    main()
