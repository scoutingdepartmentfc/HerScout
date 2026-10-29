#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pipeline/fotos_soccerwiki.py
Fotos para jugadores que siguen sin foto, desde un volcado XML de SoccerWiki (data/fotos_soccerwiki.xml).

El XML solo trae nombre, apellido y URL de la foto (sin club ni fecha de nacimiento), así que el
emparejamiento es estricto: nombre completo normalizado idéntico y único en todo el XML.
Las fotos se suben como `{player_id}_sw.{ext}` para poder identificarlas (y borrarlas) si hiciera falta.

    python -m pipeline.fotos_soccerwiki [--xml ruta] [--limit N]
"""

import argparse
import html
import re
import sys
from collections import defaultdict
from pathlib import Path

from . import transfermarkt  # noqa: F401  (carga .env y logging)
from .config import BUCKET_PLAYER_PHOTOS
from .photos import FotMobClient, normalizar
from .storage import Store, get_supabase_client
from .transfermarkt import logger, now_iso

XML_DEFAULT = Path(__file__).parent.parent / "data" / "fotos_soccerwiki.xml"
# El XML trae alguna línea mal formada: se lee con regex en vez de con un parser estricto
RE_PLAYER = re.compile(r'<P id="\d+" f="([^"]*)" s="([^"]*)" i="([^"]*)"')


def indice_xml(ruta: Path):
    idx = defaultdict(list)
    for f, s, url in RE_PLAYER.findall(ruta.read_text(encoding="utf-8", errors="ignore")):
        if url and "default" not in url:
            idx[normalizar(html.unescape(f"{f} {s}"))].append(url)
    return idx


def main():
    parser = argparse.ArgumentParser(description="Fotos de SoccerWiki para jugadores sin foto")
    parser.add_argument("--xml", type=Path, default=XML_DEFAULT)
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()
    if not args.xml.exists():
        logger.error(f"No existe {args.xml}")
        sys.exit(1)

    idx = indice_xml(args.xml)
    store = Store(get_supabase_client())
    store.ensure_bucket(BUCKET_PLAYER_PHOTOS)
    cliente = FotMobClient()  # solo para descargar imágenes con cabeceras de navegador
    sin_foto = [p for p in store.select_all("players", "id,name,first_name,last_name,photo_url") if not p.get("photo_url")]
    logger.info(f"{sum(map(len, idx.values()))} fotos en el XML · {len(sin_foto)} jugadores sin foto")

    filas, ambiguos = [], 0
    for p in sin_foto:
        if args.limit and len(filas) >= args.limit:
            break
        nombres = {normalizar(p["name"]), normalizar(f"{p.get('first_name') or ''} {p.get('last_name') or ''}")} - {""}
        urls = [idx[n] for n in nombres if n in idx]
        unica = next((u[0] for u in urls if len(u) == 1), None)
        if not unica:
            ambiguos += bool(urls)
            continue
        img = cliente.image(unica)
        if not img or len(img) < 1500:  # placeholders vacíos
            continue
        ext = "png" if unica.lower().endswith(".png") else "jpg"
        url = store.upload(BUCKET_PLAYER_PHOTOS, f"{p['id']}_sw.{ext}", img, f"image/{'png' if ext == 'png' else 'jpeg'}")
        if url:
            filas.append({"id": p["id"], "name": p["name"], "photo_url": url, "photo_updated_at": now_iso()})
            if len(filas) % 100 == 0:
                logger.info(f"  {len(filas)} fotos subidas")
    store.upsert("players", filas)
    logger.info(f"SoccerWiki OK: {len(filas)} fotos subidas · {ambiguos} descartados por nombre repetido")


if __name__ == "__main__":
    main()
