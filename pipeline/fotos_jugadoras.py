"""
pipeline/fotos_jugadoras.py
Fotos de jugadoras buscando por nombre (no por plantilla), por orden de preferencia:
1. FotMob (jugadoras de la liga y buscador: nombre + club) → {id}.png
2. Soccerdonna (buscador: nombre + club + edad)            → {id}_sd.jpg
3. Opta (foto oficial por equipo)                 → {id}_opta.jpg

Uso suelto:
    python -m pipeline.fotos_jugadoras [--comp-id ID] [--refresh-photos]
"""

import argparse
import logging
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from . import fotos_365
from .config import BUCKET_PLAYER_PHOTOS, COMPETITIONS_CONFIG, FOTMOB_PLAYER_IMG
from .photos import FotMobClient
from .soccerdonna import SDClient, buscar_jugadora
from .storage import Store, get_supabase_client

logger = logging.getLogger("fotos_jugadoras")
LOTE = 25


def es_foto_fotmob(photo_url: Any) -> bool:
    return bool(photo_url) and re.search(r"/[^/_]+\.png(\?|$)", str(photo_url)) is not None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def sincronizar_fotos_jugadoras(store: Store, fotmob: FotMobClient, sd: SDClient,
                                jugadoras: List[Dict[str, Any]], clubes: Dict[str, str],
                                refrescar: bool = False, liga_fotmob: Optional[int] = None,
                                solo_fotmob: bool = False) -> Dict[str, int]:
    """`jugadoras`: filas de players (id, name, match_name, first_name, last_name, birth_date, photo_url, current_team_id).
    `clubes`: {team_id: nombre}. Sin `refrescar` solo se buscan las que no tienen foto de FotMob.
    `solo_fotmob`: sin foto en FotMob la jugadora se queda sin foto (no se usa Soccerdonna ni Opta)."""
    totales = {"soccerdonna": 0, "fotmob": 0, "365scores": 0, "opta": 0, "sin_foto": 0}
    filas: List[Dict[str, Any]] = []
    for n, p in enumerate(jugadoras, 1):
        actual = p.get("photo_url")
        if es_foto_fotmob(actual) and not refrescar:
            continue
        club = clubes.get(p.get("current_team_id"))
        url, fuente = None, None

        m = fotmob.buscar_jugador(p, club, liga_fotmob)
        if m:
            img = fotmob.image(FOTMOB_PLAYER_IMG.format(id=m["id"]))
            url = store.upload(BUCKET_PLAYER_PHOTOS, f"{p['id']}.png", img, "image/png") if img else None
            fuente = "fotmob"

        # Sin FotMob: se conserva la de Soccerdonna/Opta que ya tuviera
        if not url and actual and not refrescar:
            continue
        if not url:
            url, fuente = fotos_365.subir_foto(store, p, club), "365scores"
        if not url and solo_fotmob:
            totales["sin_foto"] += 1
            continue

        if not url:
            c = buscar_jugadora(sd, p, club)
            if c and c.get("foto"):
                img = sd.image(c["foto"])
                url = store.upload(BUCKET_PLAYER_PHOTOS, f"{p['id']}_sd.jpg", img, "image/jpeg") if img else None
                fuente = "soccerdonna"
        if not url:
            url = fotmob.subir_foto_opta(store, p["id"], (p.get("current_team_id"),))
            fuente = "opta"

        if url:
            # ?v= evita que el navegador muestre la foto anterior guardada en la misma ruta
            filas.append({"id": p["id"], "name": p["name"], "photo_url": f"{url}?v={int(time.time())}",
                          "photo_updated_at": now_iso()})
            totales[fuente] += 1
        else:
            totales["sin_foto"] += 1
        if len(filas) >= LOTE:
            store.upsert("players", filas)
            filas = []
            logger.info(f"    Fotos: {n}/{len(jugadoras)} revisadas {totales}")
    if filas:
        store.upsert("players", filas)
    return totales


def jugadoras_objetivo(store: Store, comps: List[Dict[str, Any]]):
    """Jugadoras de los equipos de `comps` (sin equipo actual: el de su última temporada) y {team_id: nombre}."""
    from .storage import dorsales_actuales
    comp_ids = {c["id"] for c in comps}
    clubes = {t["id"]: t["name"] for t in store.select_all("teams", "id,name,competition_id")
              if t.get("competition_id") in comp_ids}
    ultimo = {}
    orden = {c["season_id"]: i for i, c in enumerate(comps)}
    filas = store.select_all("squad_members", "player_id,team_id,season_id") + \
        store.select_all("player_season_stats", "player_id,team_id,season_id")
    for r in sorted(filas, key=lambda r: orden.get(r["season_id"], -1)):
        if r.get("team_id"):
            ultimo[r["player_id"]] = r["team_id"]
    dorsales = dorsales_actuales(store, comps)
    jugadoras = []
    for p in store.select_all("players", "id,name,match_name,first_name,last_name,birth_date,place_of_birth,photo_url,"
                                  "current_team_id,country,citizenship"):
        p["shirt_number"] = dorsales.get(p["id"])
        p["current_team_id"] = p.get("current_team_id") if p.get("current_team_id") in clubes else ultimo.get(p["id"])
        if p["current_team_id"] in clubes:
            jugadoras.append(p)
    return jugadoras, clubes


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    parser = argparse.ArgumentParser(description="Fotos de jugadoras por nombre: FotMob > Soccerdonna > Opta")
    parser.add_argument("--comp-id", type=str, default=None)
    parser.add_argument("--refresh-photos", action="store_true", help="Volver a buscar todas las fotos")
    args = parser.parse_args()
    from .storage import competiciones_objetivo
    store = Store(get_supabase_client())
    comps = [c for c in competiciones_objetivo(store) if not args.comp_id or c["id"] == args.comp_id]
    jugadoras, clubes = jugadoras_objetivo(store, comps)
    logger.info(f"Fotos: {len(jugadoras)} jugadoras")
    logger.info(f"Fotos completado: {sincronizar_fotos_jugadoras(store, FotMobClient(), SDClient(), jugadoras, clubes, args.refresh_photos, comps[-1]['fotmob_id'])}")


if __name__ == "__main__":
    main()
