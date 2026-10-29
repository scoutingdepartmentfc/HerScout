#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pipeline/fotos_opta.py
Foto oficial Opta para todos los jugadores de la base de datos (sustituye a FotMob/Transfermarkt/SoccerWiki).

La URL de Opta exige el ID del equipo además del del jugador, así que se prueba con el equipo actual
y con los equipos de player_season_stats (jugadores traspasados durante la temporada).
Quien no tenga foto en Opta conserva la que ya tuviera.

    python -m pipeline.fotos_opta [--refresh] [--limit N] [--workers 8]
"""

import argparse
import time
from concurrent.futures import ThreadPoolExecutor

from . import transfermarkt  # noqa: F401  (carga .env y logging)
from .config import BUCKET_PLAYER_PHOTOS
from .photos import FotMobClient, es_foto_opta
from .storage import Store, get_supabase_client
from .transfermarkt import logger, now_iso


def main():
    parser = argparse.ArgumentParser(description="Fotos oficiales Opta para todos los jugadores")
    parser.add_argument("--refresh", action="store_true", help="Volver a descargar también las que ya son de Opta")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    store = Store(get_supabase_client())
    store.ensure_bucket(BUCKET_PLAYER_PHOTOS)
    cliente = FotMobClient()  # sesión con cabeceras de navegador

    equipos = {}
    for r in store.select_all("player_season_stats", "player_id,team_id"):
        equipos.setdefault(r["player_id"], []).append(r["team_id"])
    jugadores = [p for p in store.select_all("players", "id,name,current_team_id,photo_url")
                 if args.refresh or not es_foto_opta(p.get("photo_url"))]
    if args.limit:
        jugadores = jugadores[:args.limit]
    logger.info(f"{len(jugadores)} jugadores a consultar en Opta")

    def descargar(p):
        return cliente.opta_image(p["id"], [p.get("current_team_id"), *equipos.get(p["id"], [])])

    def subir(p, img):
        # Las subidas van de una en una: Supabase corta con 429 si se abren demasiadas conexiones
        for intento in range(5):
            try:
                url = store.upload(BUCKET_PLAYER_PHOTOS, f"{p['id']}_opta.jpg", img, "image/jpeg")
                return {"id": p["id"], "name": p["name"], "photo_url": url, "photo_updated_at": now_iso()}
            except Exception as e:
                logger.warning(f"  Subida {p['id']} falló ({e}); reintento {intento + 1}")
                time.sleep(3 * (intento + 1))
        return None

    filas, total, nuevas = [], 0, 0
    with ThreadPoolExecutor(args.workers) as pool:
        for i, (p, img) in enumerate(zip(jugadores, pool.map(descargar, jugadores)), 1):
            fila = subir(p, img) if img else None
            if fila:
                filas.append(fila)
                total += 1
                nuevas += not p.get("photo_url")
            if i % 500 == 0:
                logger.info(f"  {i}/{len(jugadores)} consultados · {total} fotos Opta")
                store.upsert("players", filas)
                filas = []
    store.upsert("players", filas)
    logger.info(f"Opta OK: {total} fotos oficiales subidas ({nuevas} a jugadores que no tenían foto)")


if __name__ == "__main__":
    main()
