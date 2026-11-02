#!/usr/bin/env python3
"""
pipeline/ea_fc.py
Importa Pace y Physicality de EA SPORTS FC (escala 1-99) y sus atributos (aceleración, velocidad punta, salto,
resistencia, fuerza, agresividad) desde el dataset público de Kaggle mikedpad/ea-sports-fc27-player-ratings
(public.player_ea_ratings). Solo el fútbol femenino.

Licencia del dataset: los datos y nombres pertenecen a Electronic Arts; es una instantánea no oficial y
no comercial (ver su README).

Emparejamiento: el mismo que pipeline/fm_fisico.py (misma fecha de nacimiento y nombre parecido, o nombre casi
igual y mismo club o edad). EA da la fecha de nacimiento de todas. Las filas sin pareja se guardan en
.cache/ea_fc_sin_pareja.csv.

Uso:  python -m pipeline.ea_fc [--csv players.csv] [--dataset mikedpad/ea-sports-fc27-player-ratings] [--dry-run]
      Sin --csv descarga la última versión del dataset con kagglehub.
"""

import argparse
import csv
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import pandas as pd

from .config import LOCAL_CACHE_DIR
from .fm_fisico import emparejar
from .storage import Store, get_supabase_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ea_fc")

DATASET = "mikedpad/ea-sports-fc27-player-ratings"
FEMENINO = "Women's Football"

# Columna del CSV de EA → columna de player_ea_ratings
ATRIBUTOS = {
    "pace": "pace", "movement_acceleration": "acceleration", "movement_sprint_speed": "sprint_speed",
    "physicality": "physicality", "power_jumping": "jumping", "power_stamina": "stamina",
    "power_strength": "strength", "mentality_aggression": "aggression", "overall_rating": "overall_rating",
}


def descargar(dataset: str) -> Path:
    try:
        import kagglehub
    except ImportError:
        sys.exit("Falta kagglehub: pip install kagglehub (o pasa el fichero con --csv)")
    return Path(kagglehub.dataset_download(dataset)) / "players.csv"


def _int(v: Any):
    return int(v) if pd.notna(v) else None


def leer_jugadoras(ruta: Path) -> List[Dict[str, Any]]:
    """Filas del CSV de EA (solo fútbol femenino) en el formato que espera fm_fisico.emparejar."""
    df = pd.read_csv(ruta)
    df = df[df["gender"] == FEMENINO]
    filas = []
    for r in df.itertuples(index=False):
        r = r._asdict()
        completo = f"{r.get('first_name') or ''} {r.get('last_name') or ''}".strip()
        filas.append({
            # common_name ("Alexia Putellas") es el nombre conocido; si no hay, nombre y apellidos
            "fm_name": r["common_name"] if pd.notna(r.get("common_name")) else completo,
            "fm_club": r.get("club"),
            "fm_birth_date": str(r["birthdate"])[:10] if pd.notna(r.get("birthdate")) else None,
            "fm_age": None,
            "ea_league": r.get("league"),
            "ea_player_id": _int(r.get("player_id")),
            "edition": str(r.get("edition") or ""),
            "snapshot_date": str(r["snapshot_date"])[:10] if pd.notna(r.get("snapshot_date")) else None,
            **{dst: _int(r.get(src)) for src, dst in ATRIBUTOS.items()},
        })
    return filas


def main():
    parser = argparse.ArgumentParser(description="Importa Pace y Physicality de EA SPORTS FC (Kaggle)")
    parser.add_argument("--csv", help="players.csv ya descargado (si no, se descarga de Kaggle)")
    parser.add_argument("--dataset", default=DATASET, help=f"Dataset de Kaggle (por defecto {DATASET})")
    parser.add_argument("--dry-run", action="store_true", help="Solo emparejar y mostrar el resultado, sin guardar")
    args = parser.parse_args()

    ruta = Path(args.csv) if args.csv else descargar(args.dataset)
    filas = leer_jugadoras(ruta)
    logger.info(f"{ruta.name}: {len(filas)} jugadoras de EA SPORTS FC")
    if not filas:
        sys.exit("No hay jugadoras que importar")

    store = Store(get_supabase_client())
    query = store.client.table("players").select(
        "id, name, first_name, last_name, match_name, birth_date, fm_team_name, teams ( name )")
    jugadoras, desde = [], 0
    while True:
        lote = query.range(desde, desde + 999).execute().data or []
        jugadoras += lote
        if len(lote) < 1000:
            break
        desde += 1000
    logger.info(f"Jugadoras en HerScout: {len(jugadoras)}")
    por_fecha: Dict[str, List[Dict[str, Any]]] = {}
    for j in jugadoras:
        if j.get("birth_date"):
            por_fecha.setdefault(str(j["birth_date"])[:10], []).append(j)

    ahora = datetime.now(timezone.utc).isoformat()
    elegidas: Dict[str, Dict[str, Any]] = {}
    sin_pareja = []
    for fila in filas:
        j, score, metodo = emparejar(fila, jugadoras, por_fecha)
        if not j:
            sin_pareja.append({**fila, "mejor_parecido": round(score)})
            continue
        previa = elegidas.get(j["id"])
        if previa and previa["match_score"] >= score:
            continue
        elegidas[j["id"]] = {
            "player_id": j["id"], **{k: fila[k] for k in ATRIBUTOS.values()},
            "ea_player_id": fila["ea_player_id"], "ea_name": fila["fm_name"], "ea_club": fila["fm_club"],
            "ea_league": fila["ea_league"], "ea_birth_date": fila["fm_birth_date"], "edition": fila["edition"],
            "snapshot_date": fila["snapshot_date"], "match_method": metodo, "match_score": round(score, 1),
            "updated_at": ahora, "_jugadora": j["name"]}

    for r in sorted(elegidas.values(), key=lambda r: r["_jugadora"])[:15]:
        logger.info(f"  {r['ea_name']!r} → {r['_jugadora']!r} ({r['match_method']}, {r['match_score']})")
    logger.info(f"Emparejadas: {len(elegidas)} · sin pareja: {len(sin_pareja)}")

    if sin_pareja:
        os.makedirs(LOCAL_CACHE_DIR, exist_ok=True)
        salida = Path(LOCAL_CACHE_DIR) / "ea_fc_sin_pareja.csv"
        with salida.open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=list(sin_pareja[0].keys()))
            w.writeheader()
            w.writerows(sin_pareja)
        logger.info(f"Revisa las filas sin pareja en {salida}")

    if args.dry_run:
        logger.info("--dry-run: no se guarda nada")
        return
    store.upsert("player_ea_ratings", [{k: v for k, v in r.items() if k != "_jugadora"} for r in elegidas.values()],
                 on_conflict="player_id")
    logger.info(f"✓ Guardadas las valoraciones EA de {len(elegidas)} jugadoras")


if __name__ == "__main__":
    main()
