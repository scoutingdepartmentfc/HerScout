"""
pipeline/demarcaciones.py
Demarcación de las jugadoras sin partidos de Opta (primary_position = 'Desconocida'), con este orden:
  1. Posición concreta de Soccerdonna o ceroacero (tm_position_main, p. ej. "Defence - Fullback, left")
  2. Si esa posición es genérica ("Midfield") o no hay: la posición principal de su ficha FotMob (fotmob_id)
  3. Si no: la genérica traducida a la demarcación más habitual (Defence → Central, Midfield → Mediocentro...)
Nunca pisa la demarcación calculada con partidos de Opta (ingest la sobrescribe cuando los hay).

Uso:
    python -m pipeline.demarcaciones [--sin-fotmob] [--prueba]
"""

import argparse
import logging
import re
from collections import Counter
from typing import Any, Dict, Optional, Tuple

from .photos import FotMobClient
from .positions import get_grupo_demarcacion
from .storage import Store, get_supabase_client

logger = logging.getLogger("demarcaciones")
SIN_DEMARCACION = (None, "", "Desconocida")

# Soccerdonna (y ceroacero, ya traducida a ese formato): detalle tras " - "
DETALLE = (
    (r"goalkeeper", "Portero"),
    (r"fullback, right|right back|wing ?back, right", "Lateral Derecho"),
    (r"fullback, left|left back|wing ?back, left", "Lateral Izquierdo"),
    (r"centre back|center back", "Central"),
    (r"defensive midfield", "Mediocentro Defensivo"),
    (r"attacking midfield", "Mediapunta"),
    (r"right wing|midfield, right", "Extremo Derecho"),
    (r"left wing|midfield, left", "Extremo Izquierdo"),
    (r"central midfield", "Mediocentro"),
    (r"centre forward|center forward|second striker", "Delantero"),
)
GENERICA = {"goalkeeper": "Portero", "defence": "Central", "midfield": "Mediocentro", "striker": "Delantero"}

FOTMOB = {
    "keeper": "Portero", "centerback": "Central", "leftback": "Lateral Izquierdo", "left_wing_back": "Lateral Izquierdo",
    "rightback": "Lateral Derecho", "right_wing_back": "Lateral Derecho",
    "centerdefensivemidfielder": "Mediocentro Defensivo", "centermidfielder": "Mediocentro",
    "centerattackingmidfielder": "Mediapunta", "leftmidfielder": "Extremo Izquierdo", "leftwinger": "Extremo Izquierdo",
    "rightmidfielder": "Extremo Derecho", "rightwinger": "Extremo Derecho", "striker": "Delantero",
}


def _central(dem: Optional[str], pie: Optional[str]) -> Optional[str]:
    """Las fuentes no dicen el lado del central: la zurda, a la izquierda."""
    if dem == "Central":
        return "Central Izquierdo" if pie == "left" else "Central Derecho"
    return dem


def por_texto(pos: Optional[str]) -> Tuple[Optional[str], bool]:
    """(demarcación, concreta) desde la posición de Soccerdonna/ceroacero."""
    t = (pos or "").lower().strip()
    if not t:
        return None, False
    detalle = t.split(" - ", 1)[1] if " - " in t else ""
    for patron, dem in DETALLE:
        if detalle and re.search(patron, detalle):
            return dem, True
    if t == "goalkeeper":
        return "Portero", True
    return GENERICA.get(t.split(" - ")[0].strip()), False


def por_fotmob(fotmob: FotMobClient, fotmob_id: Any) -> Optional[str]:
    desc = (fotmob.jugador(int(fotmob_id)) or {}).get("positionDescription") or {}
    principal = next((p for p in desc.get("positions") or [] if p.get("isMainPosition")), None)
    clave = ((principal or {}).get("strPos") or {}).get("key") or ((desc.get("primaryPosition") or {}).get("key"))
    return FOTMOB.get(str(clave or "").replace("_long", ""))


def rellenar(store: Store, con_fotmob: bool = True, prueba: bool = False) -> Counter:
    jugadoras = [p for p in store.select_all("players", "id,name,primary_position,tm_position_main,fotmob_id,preferred_foot")
                 if p.get("primary_position") in SIN_DEMARCACION]
    fotmob = FotMobClient() if con_fotmob else None
    tot: Counter = Counter()
    cambios = []
    for n, p in enumerate(jugadoras, 1):
        dem, concreta = por_texto(p.get("tm_position_main"))
        fuente = "soccerdonna/ceroacero" if concreta else None
        if not concreta and fotmob and p.get("fotmob_id"):
            try:
                fm = por_fotmob(fotmob, p["fotmob_id"])
            except Exception as e:
                logger.debug(f"FotMob {p['fotmob_id']}: {e}")
                fm = None
            if fm:
                dem, fuente = fm, "fotmob"
        if dem and not fuente:
            fuente = "genérica"
        dem = _central(dem, p.get("preferred_foot"))
        if not dem:
            tot["sin_datos"] += 1
            continue
        tot[fuente] += 1
        cambios.append({"id": p["id"], "primary_position": dem, "grupo_demarcacion": get_grupo_demarcacion(dem)})
        if n % 500 == 0:
            logger.info(f"  Demarcaciones: {n}/{len(jugadoras)} {dict(tot)}")
    if not prueba:
        for c in cambios:
            store.update("players", {k: v for k, v in c.items() if k != "id"}, id=c["id"])
    logger.info(f"Demarcaciones: {len(jugadoras)} sin demarcación → {dict(tot)}{' (prueba)' if prueba else ''}")
    return tot


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    ap = argparse.ArgumentParser(description="Demarcación de las jugadoras sin partidos de Opta")
    ap.add_argument("--sin-fotmob", action="store_true", help="No consultar FotMob (más rápido)")
    ap.add_argument("--prueba", action="store_true", help="Solo contar, sin guardar")
    a = ap.parse_args()
    rellenar(Store(get_supabase_client()), con_fotmob=not a.sin_fotmob, prueba=a.prueba)


if __name__ == "__main__":
    main()
