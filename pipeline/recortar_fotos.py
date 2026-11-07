"""
pipeline/recortar_fotos.py
Herramienta para detectar fotos de jugadoras con fondo sólido (blanco/estudio)
y recortarlas automáticamente con rembg (u2net_human_seg) dejándolas con fondo
transparente (PNG) y subiéndolas de nuevo a Supabase Storage.

Uso:
    .venv/bin/python -m pipeline.recortar_fotos [--limit N] [--revisar-todas]
"""

import argparse
import io
import logging
import os
import sys
import time
from typing import Dict, Any, List

import requests
from PIL import Image
from rembg import new_session, remove

from .config import BUCKET_PLAYER_PHOTOS
from .storage import Store, get_supabase_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("recortar_fotos")

_session = None


def get_rembg_session():
    global _session
    if _session is None:
        logger.info("Cargando modelo de segmentación humana u2net_human_seg...")
        _session = new_session("u2net_human_seg")
    return _session


def tiene_fondo_solido(img_bytes: bytes) -> bool:
    """Comprueba si la imagen tiene esquinas opacas y blanquecinas/claras."""
    try:
        im = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
        width, height = im.size
        # Muestrear esquinas y bordes superiores
        samples = [
            im.getpixel((0, 0)),
            im.getpixel((width - 1, 0)),
            im.getpixel((0, min(10, height - 1))),
            im.getpixel((width - 1, min(10, height - 1))),
        ]
        for r, g, b, a in samples:
            # Si el píxel es opaco (alpha > 40) y de fondo muy claro (r,g,b > 210)
            if a > 40 and r > 210 and g > 210 and b > 210:
                return True
        return False
    except Exception:
        return False


def procesar_recorte(img_bytes: bytes) -> bytes:
    session = get_rembg_session()
    return remove(img_bytes, session=session, post_process_mask=True)


def main():
    parser = argparse.ArgumentParser(description="Quita el fondo a las fotos de jugadoras en Supabase")
    parser.add_argument("--limit", type=int, default=0, help="Límite de fotos a procesar (0 = sin límite)")
    parser.add_argument("--revisar-todas", action="store_true", help="Revisar todas las fotos")
    args = parser.parse_args()

    client = get_supabase_client()
    store = Store(client)

    logger.info("Obteniendo lista de jugadoras con foto...")
    rows = store.select_all("players", "id, name, photo_url")
    con_foto = [r for r in rows if r.get("photo_url")]
    logger.info(f"Total jugadoras con foto: {len(con_foto)}")

    recortadas = 0
    errores = 0

    for idx, p in enumerate(con_foto, 1):
        if args.limit and recortadas >= args.limit:
            break

        url = p.get("photo_url")
        if not url:
            continue

        # Priorizar fotos que no sean PNG nativo o que tengan sufijo sospechoso
        # o si se pide revisar todas
        es_sospechosa = (
            args.revisar_todas
            or "_opta." in url
            or "_cz." in url
            or "_sd." in url
            or ".jpg" in url
            or "jpeg" in url
        )

        try:
            r = requests.get(url, timeout=12)
            if r.status_code != 200:
                continue

            orig_bytes = r.content

            if tiene_fondo_solido(orig_bytes):
                logger.info(f"[{idx}/{len(con_foto)}] Detectado fondo blanco en {p['name']} -> Recortando silueta...")
                t0 = time.time()
                trans_bytes = procesar_recorte(orig_bytes)
                dur = time.time() - t0

                # Subir PNG transparente
                file_name = f"{p['id']}_nobg.png"
                new_url = store.upload(BUCKET_PLAYER_PHOTOS, file_name, trans_bytes, "image/png")
                if new_url:
                    ts = int(time.time())
                    final_url = f"{new_url}?v={ts}"
                    store.update("players", {"photo_url": final_url}, id=p["id"])
                    recortadas += 1
                    logger.info(f"  ✓ Subida y actualizada ({dur:.1f}s): {p['name']}")
        except Exception as e:
            logger.warning(f"Error procesando foto de {p.get('name')}: {e}")
            errores += 1

    logger.info(f"Finalizado: {recortadas} fotos recortadas y actualizadas (errores: {errores})")


if __name__ == "__main__":
    main()

