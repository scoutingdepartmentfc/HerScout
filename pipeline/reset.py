#!/usr/bin/env python3
"""
pipeline/reset.py
Borra TODO lo descargado (jugadoras, equipos, partidos, estadísticas, Soccerdonna, ligas FotMob, ejecuciones)
para volver a descargar desde cero. Conserva:
 - opta_catalog y sd_leagues (las ligas elegidas en /admin, su ID Opta y temporadas); sus fechas de descarga
   se ponen a cero para que el panel muestre "nunca"
 - organizations, watchlists e informes de los clubes (pero sus jugadoras vinculadas se borran en cascada)
También vacía la caché de partidos del pipeline (Storage `pipeline-cache` y .cache/ local, salvo Soccerdonna
si se pasa --mantener-cache-soccerdonna: así no se vuelven a pedir miles de fichas a la web).

Uso:  python -m pipeline.reset --confirmar [--mantener-cache-soccerdonna]
"""

import argparse
import logging
import shutil
import sys
from pathlib import Path

from .config import BUCKET_PIPELINE_CACHE, LOCAL_CACHE_DIR
from .storage import get_supabase_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("reset")

# Orden: primero las tablas que apuntan a otras (las FK en cascada harían lo mismo, pero así cada DELETE es corto)
TABLAS = [
    ("player_match_scores", "match_id"),
    ("player_match_stats", "match_id"),
    ("player_season_stats", "player_id"),
    ("squad_members", "player_id"),
    ("player_market_values", "player_id"),
    ("player_transfers", "player_id"),
    ("player_injuries", "player_id"),
    ("player_national_teams", "player_id"),
    ("player_physical", "player_id"),
    ("player_ea_ratings", "player_id"),
    ("matches", "id"),
    ("players", "id"),
    ("teams", "id"),
    ("ingestion_checkpoints", "competition_id"),
    ("seasons", "id"),
    ("competitions", "id"),
    ("leagues", "id"),
    ("ingestion_runs", "id"),
]


def vaciar_bucket(client, bucket: str, carpeta: str = "") -> int:
    """Borra recursivamente los ficheros de un bucket de Storage."""
    borrados = 0
    for item in client.storage.from_(bucket).list(carpeta, {"limit": 1000}) or []:
        ruta = f"{carpeta}/{item['name']}" if carpeta else item["name"]
        if item.get("id") is None:  # carpeta
            borrados += vaciar_bucket(client, bucket, ruta)
        else:
            client.storage.from_(bucket).remove([ruta])
            borrados += 1
    return borrados


def main():
    parser = argparse.ArgumentParser(description="Borrar los datos descargados para empezar de cero")
    parser.add_argument("--confirmar", action="store_true", help="Necesario: confirma el borrado")
    parser.add_argument("--mantener-cache-soccerdonna", action="store_true",
                        help="No borrar las fichas de Soccerdonna guardadas en .cache/soccerdonna")
    args = parser.parse_args()
    if not args.confirmar:
        print("Esto borra todas las jugadoras, partidos y estadísticas descargados. Repite con --confirmar.")
        sys.exit(1)

    client = get_supabase_client()
    for tabla, columna in TABLAS:
        try:
            # PostgREST exige un filtro en los DELETE: "columna no nula" abarca todas las filas
            client.table(tabla).delete().not_.is_(columna, "null").execute()
            logger.info(f"  {tabla}: vaciada")
        except Exception as e:
            logger.warning(f"  {tabla}: no se pudo vaciar ({e})")

    # Configuración de /admin intacta; solo las fechas de la última descarga de cada parte
    for col in ("last_download_at", "last_opta_at", "last_fotmob_at"):
        try:
            client.table("sd_leagues").update({col: None}).not_.is_("code", "null").execute()
        except Exception as e:  # last_opta_at / last_fotmob_at no existen sin la migración 20261117120000
            logger.warning(f"  sd_leagues.{col}: no se pudo poner a cero ({e})")
    logger.info("  sd_leagues: fechas de descarga a cero (ligas, ID Opta y temporadas se conservan)")

    try:
        logger.info(f"  Storage {BUCKET_PIPELINE_CACHE}: {vaciar_bucket(client, BUCKET_PIPELINE_CACHE)} ficheros borrados")
    except Exception as e:
        logger.warning(f"  Storage {BUCKET_PIPELINE_CACHE}: no se pudo vaciar ({e})")

    cache = Path(LOCAL_CACHE_DIR)
    if cache.exists():
        for hijo in cache.iterdir():
            if args.mantener_cache_soccerdonna and hijo.name == "soccerdonna":
                continue
            shutil.rmtree(hijo) if hijo.is_dir() else hijo.unlink()
        logger.info(f"  Caché local {cache}: vaciada" + (" (salvo Soccerdonna)" if args.mantener_cache_soccerdonna else ""))
    logger.info("Listo: los datos descargados están borrados. Las ligas elegidas en /admin se conservan.")


if __name__ == "__main__":
    main()
