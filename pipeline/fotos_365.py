"""
pipeline/fotos_365.py
Foto de respaldo desde 365scores para las jugadoras que FotMob no tiene: búsqueda por nombre, confirmación
(mujer, nombre parecido, club o edad) y recorte del fondo con rembg.
"""

import io
import logging
from datetime import date
from typing import Any, Dict, Optional
from urllib.parse import quote

import requests
from rapidfuzz import fuzz

from .config import BUCKET_PLAYER_PHOTOS
from .photos import normalizar_club, sim_nombre, variantes_nombre

logger = logging.getLogger("fotos_365")
API = "https://webws.365scores.com/web"
IMAGEN = ("https://imagecache.365scores.com/image/upload/f_png,w_320,h_320,c_limit,q_auto:eco,"
          "d_Athletes:default.png,c_thumb,g_face,z_0.65/Athletes/{id}")
HEADERS = {"User-Agent": "Mozilla/5.0", "Accept": "application/json", "Referer": "https://www.365scores.com/"}
MUJER = 2
_modelo, _silueta = None, None


def _json(ruta: str) -> Dict[str, Any]:
    r = requests.get(f"{API}/{ruta}", headers=HEADERS, timeout=20)
    return r.json() if r.status_code == 200 else {}


def es_candidata(p: Dict[str, Any], club: Optional[str], a: Dict[str, Any]) -> bool:
    """Resultado del buscador + detalle: nombre parecido y mujer, con el club o la edad de nuestra jugadora."""
    if sim_nombre(p, a.get("name")) < 85 or a.get("gender") != MUJER:
        return False
    nacida = str(p.get("birth_date") or "")[:4]
    if nacida.isdigit() and a.get("age"):
        return abs(date.today().year - int(nacida) - int(a["age"])) <= 1
    return bool(club) and fuzz.token_set_ratio(normalizar_club(club), normalizar_club(a.get("clubName"))) >= 70


def buscar(p: Dict[str, Any], club: Optional[str]) -> Optional[int]:
    for q in variantes_nombre(p)[:3]:
        res = _json(f"search/?appTypeId=5&langId=1&query={quote(q)}&filter=all&sportId=1&isIncludeAthletes=true")
        for a in res.get("athletes", [])[:5]:
            detalle = (_json(f"athletes/?appTypeId=5&langId=1&athletes={a['id']}").get("athletes") or [{}])[0]
            if es_candidata(p, club, {**a, **detalle}):
                return int(a["id"])
    return None


def _imagen(athlete_id: int) -> Optional[bytes]:
    r = requests.get(IMAGEN.format(id=athlete_id), headers=HEADERS, timeout=20)
    return r.content if r.status_code == 200 else None


def sin_fondo(img: bytes) -> bytes:
    global _modelo
    from rembg import new_session, remove
    _modelo = _modelo or new_session("u2net_human_seg")
    return remove(img, session=_modelo, post_process_mask=True)


def subir_foto(store, p: Dict[str, Any], club: Optional[str]) -> Optional[str]:
    """URL en Storage de la foto de 365scores ya sin fondo, o None si no está (o solo tiene la silueta genérica)."""
    global _silueta
    try:
        athlete_id = buscar(p, club)
        img = _imagen(athlete_id) if athlete_id else None
        _silueta = _silueta or _imagen(0)
        if not img or img == _silueta:
            return None
        return store.upload(BUCKET_PLAYER_PHOTOS, f"{p['id']}_365.png", sin_fondo(img), "image/png")
    except (requests.RequestException, ValueError, OSError) as e:
        logger.warning(f"  365scores: sin foto de {p.get('name')} ({e})")
        return None
