"""
pipeline/soccerdonna.py
Enriquecer jugadoras con Soccerdonna (el "Transfermarkt" del fútbol femenino):
perfil (altura, pie, contrato, valor, nacionalidad), foto si no la hay de Opta/FotMob,
selección nacional, evolución del valor de mercado (con escudo del club), traspasos y lesiones.

Uso:
    python -m pipeline.soccerdonna [--comp-id ID] [--limit N] [--refresh-days 30] [--refresh-photos]

Emparejamiento: búsqueda por nombre (quicksearch) y se elige el candidato por nombre + club + edad;
si el perfil tiene fecha de nacimiento y no coincide con la de Opta, se descarta.
Reanudable: sd_updated_at marca las jugadoras hechas.
"""

import argparse
import hashlib
import json
import logging
import os
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone
from html import unescape
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import requests
from rapidfuzz import fuzz

from .config import BUCKET_PLAYER_PHOTOS, BUCKET_TEAM_BADGES, LOCAL_CACHE_DIR
from .photos import es_foto_fotmob, normalizar, normalizar_club, sim_nombre, variantes_nombre
from .storage import Store, competiciones_objetivo, dorsales_actuales, get_supabase_client
from . import traducciones as en

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("soccerdonna")

SD_BASE = "https://www.soccerdonna.de"
SD_BADGE = SD_BASE + "/static/bilder_sd/wappen/{id}.png"
SD_CACHE_DIR = Path(LOCAL_CACHE_DIR) / "soccerdonna"
PAUSA = float(os.environ.get("SD_PAUSA", "1.2"))  # segundos entre peticiones reales
MAX_CANDIDATAS = 3  # fichas que se abren por jugadora hasta confirmar la buena
SD_CLUB_RETIRADA = 440  # "club" de Soccerdonna para las retiradas


def _homogeneo(rows: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    """Filas agrupadas por su conjunto de columnas (mismo criterio que pipeline/ingest.py)."""
    grupos: Dict[tuple, List[Dict[str, Any]]] = {}
    for r in rows:
        grupos.setdefault(tuple(sorted(r)), []).append(r)
    return list(grupos.values())
LOTE = 25
HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                         "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
           "Accept-Language": "en-US,en;q=0.9"}
FOOT = {"left": "left", "right": "right", "both": "both"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _texto(html: str) -> str:
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", html or ""))).strip()


def _fecha(v: Optional[str]) -> Optional[str]:
    """dd.mm.aaaa → aaaa-mm-dd. None si la fecha no existe (Soccerdonna trae a veces 31.11.2027 o 00.00.0000),
    porque Postgres rechazaría el lote entero."""
    m = re.search(r"(\d{2})\.(\d{2})\.(\d{4})", v or "")
    if not m:
        return None
    iso = f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    try:
        date.fromisoformat(iso)
    except ValueError:
        return None
    return iso


def _euros(v: Optional[str]) -> Optional[int]:
    """'120.000 €' → 120000; '1,20 Mio. €' → 1200000."""
    v = v or ""
    m = re.search(r"([\d.,]+)\s*(Mio|Tsd|Th)?", v)
    if not m or not re.search(r"\d", m.group(1)):
        return None
    num = m.group(1)
    if m.group(2) == "Mio":
        return int(float(num.replace(".", "").replace(",", ".")) * 1_000_000)
    if m.group(2) in ("Tsd", "Th"):
        return int(float(num.replace(".", "").replace(",", ".")) * 1_000)
    return int(num.replace(".", "").replace(",", ""))


def _int(v: Any) -> Optional[int]:
    m = re.search(r"\d+", str(v or ""))
    return int(m.group()) if m else None


def _id_traspaso(sd_id: int, fecha: Optional[str], desde: Any, hasta: Any) -> int:
    """Soccerdonna no da ID de traspaso: hash estable (cabe en BIGINT)."""
    return int(hashlib.md5(f"sd:{sd_id}:{fecha}:{desde}:{hasta}".encode()).hexdigest()[:15], 16)


class SDClient:
    def __init__(self, cache_days: int = 30):
        self.s = requests.Session()
        self.s.headers.update(HEADERS)
        self.cache_days = cache_days
        self.peticiones = 0
        SD_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    def get(self, path: str, max_dias: Optional[float] = None) -> Optional[str]:
        """`max_dias`: antigüedad máxima de la caché para esta página (por defecto la del cliente)."""
        f = SD_CACHE_DIR / (hashlib.md5(path.encode()).hexdigest() + ".html")
        dias = self.cache_days if max_dias is None else max_dias
        if f.exists() and time.time() - f.stat().st_mtime < dias * 86400:
            return f.read_text(encoding="utf-8", errors="ignore")
        for intento in range(3):
            try:
                time.sleep(PAUSA)
                self.peticiones += 1
                r = self.s.get(SD_BASE + path, timeout=30)
                if r.status_code == 200:
                    f.write_text(r.text, encoding="utf-8")
                    return r.text
                if r.status_code == 404:
                    return None
                logger.warning(f"  Soccerdonna HTTP {r.status_code} en {path}")
            except requests.RequestException as e:
                logger.warning(f"  Soccerdonna fallo de conexión ({e})")
            time.sleep(5 * (intento + 1))
        return None

    def image(self, url: str) -> Optional[bytes]:
        try:
            r = self.s.get(url, timeout=30)
            if r.status_code == 200 and r.headers.get("content-type", "").startswith("image") and len(r.content) > 1500:
                return r.content
        except requests.RequestException:
            pass
        return None

    # ── Búsqueda ─────────────────────────────────────────────
    def buscar(self, nombre: str) -> List[Dict[str, Any]]:
        html = self.get(f"/en/undefined/suche/ergebnis.html?quicksearch={quote_plus(nombre)}") or ""
        i = html.find('id="player_matches"')
        if i < 0:
            return []
        tabla = html[i:html.find("</table>", i)]
        res = []
        for fila in re.findall(r"<tr class=\"(?:hell|dunkel)\">(.*?)</tr>", tabla, re.S):
            m = re.search(r'href="/en/([^/]+)/profil/spieler_(\d+)\.html"[^>]*>([^<]+)</a>', fila)
            if not m:
                continue
            club = re.search(r'verein_(\d+)\.html"[^>]*>([^<]*)</a>', fila)
            mini = re.search(r'/minifotos/([^"]+\.jpg)', fila)
            celdas = [_texto(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", fila, re.S)]
            res.append({"slug": m.group(1), "sd_id": int(m.group(2)), "name": unescape(m.group(3)),
                        "club": unescape(club.group(2)) if club else None,
                        "age": _int(celdas[3]) if len(celdas) > 3 else None,
                        # La foto grande tiene el mismo nombre que la miniatura; somebody.jpg = sin foto
                        "foto": f"{SD_BASE}/static/bilder_sd/spielerfotos/{mini.group(1)}"
                        if mini and "somebody" not in mini.group(1) else None})
        return res

    # ── Búsqueda de clubes ───────────────────────────────────
    def buscar_club(self, nombre_club: str) -> Optional[Dict[str, Any]]:
        """Busca el club en Soccerdonna y devuelve {id, name, badge_url}."""
        if not nombre_club:
            return None
        html = self.get(f"/en/undefined/suche/ergebnis.html?quicksearch={quote_plus(nombre_club)}") or ""
        i = html.find('id="club_matches"')
        if i < 0:
            return None
        tabla = html[i:html.find("</table>", i)]
        cands = []
        club_norm = normalizar_club(nombre_club)
        for fila in re.findall(r"<tr class=\"(?:hell|dunkel)\">(.*?)</tr>", tabla, re.S):
            m = re.search(r'verein_(\d+)\.html"[^>]*title="([^"]+)"', fila)
            if not m:
                continue
            cid, cname = int(m.group(1)), unescape(m.group(2))
            sim = fuzz.token_set_ratio(club_norm, normalizar_club(cname))
            
            # Bonificación para equipos con competición nacional principal (ej: ESP1, Primera División)
            wett = re.search(r'wettbewerb_([^\.]+)\.html"[^>]*>([^<]*)</a>', fila)
            tiene_comp = bool(wett and wett.group(2).strip())
            es_top_comp = bool(wett and re.search(r"1\b|primera|superleague|serie a|frauen-bundesliga|división", wett.group(2), re.I))

            es_filial = bool(re.search(r"\b(u\d+|b|c|infantil|juvenil|academia|torneo)\b", cname.lower()))
            score = sim
            if es_top_comp:
                score += 30
            elif tiene_comp:
                score += 15
            if es_filial:
                score -= 35

            cands.append((score, sim, cid, cname))
        if not cands:
            return None
        cands.sort(key=lambda x: (x[0], x[1]), reverse=True)
        best = cands[0]
        if best[1] >= 65:
            return {"id": best[2], "name": best[3], "badge_url": SD_BADGE.format(id=best[2])}
        return None

    # ── Perfil ───────────────────────────────────────────────
    def perfil(self, slug: str, sd_id: int, max_dias: Optional[float] = None) -> Optional[Dict[str, Any]]:
        html = self.get(f"/en/{slug}/profil/spieler_{sd_id}.html", max_dias)
        if not html:
            return None
        datos = {}
        for k, v in re.findall(r"<tr>\s*<td[^>]*>([^<:]{2,40}):</td>\s*<td[^>]*>(.*?)</td>\s*</tr>", html, re.S):
            datos.setdefault(k.strip(), v)
        foto = re.search(r'src="(https?://[^"]+/spielerfotos/[^"]+)"', html)
        # El dorsal va delante del nombre en el título: <h1 ...>13 Marina Llàcer</h1>
        dorsal = re.search(r"<h1[^>]*>\s*(\d{1,2})\s+[^<]+</h1>", html)
        nac = re.findall(r'<img[^>]+title="([^"]+)"[^>]*>', datos.get("Nationality", ""))

        # Club actual y escudo desde la ficha de Soccerdonna (prioridad mediumfotos: imagen nítida del club)
        m_club = re.search(r'verein_(\d+)\.html"[^>]*title="([^"]+)"', html)
        club_actual_id = int(m_club.group(1)) if m_club else None
        club_actual_nombre = unescape(m_club.group(2)) if m_club else None
        # Retirada: la ficha pone "End of career" y el club que aparezca es el último, no el actual
        retirada = re.search(r"<td>\s*End of career\s*</td>", html) is not None
        if retirada:
            club_actual_id, club_actual_nombre = SD_CLUB_RETIRADA, en.RETIRADA

        # Escudo del club: primero mediumfotos/{id}.jpg, fallback a wappen/{id}.png
        m_escudo_med = re.search(r'src="([^"]+mediumfotos/(\d+)\.jpg)"', html)
        if m_escudo_med and club_actual_id and int(m_escudo_med.group(2)) == club_actual_id:
            club_actual_badge = m_escudo_med.group(1)
        elif club_actual_id:
            club_actual_badge = f"{SD_BASE}/static/bilder_sd/mediumfotos/{club_actual_id}.jpg"
        else:
            club_actual_badge = None

        # Liga actual e icono de liga desde Soccerdonna
        m_liga = re.search(r'href="([^"]*wettbewerb_([^\.]+)\.html)"[^>]*>([^<]+)</a>', html)
        liga_actual_nombre = unescape(m_liga.group(3)) if m_liga else None
        liga_actual_codigo = m_liga.group(2).lower() if m_liga else None
        liga_actual_logo = None
        if m_liga:
            liga_ruta = m_liga.group(1)
            # Buscar el logo de la liga en caché o consultar la página de la liga
            if liga_ruta not in getattr(self, "_ligas_logos", {}):
                if not hasattr(self, "_ligas_logos"):
                    self._ligas_logos = {}
                html_liga = self.get(liga_ruta)
                m_logo = re.search(r'src="([^"]+mediumfotos/([^\"]+\.jpg))"', html_liga or "")
                if m_logo:
                    self._ligas_logos[liga_ruta] = m_logo.group(1)
                elif liga_actual_codigo:
                    self._ligas_logos[liga_ruta] = f"{SD_BASE}/static/bilder_sd/mediumfotos/{liga_actual_codigo}.jpg"
                else:
                    self._ligas_logos[liga_ruta] = None
            liga_actual_logo = self._ligas_logos.get(liga_ruta)

        selecciones = []
        i = html.find(">National team<")
        if i > 0:
            tabla = html[i:html.find("</table>", i)]
            for fila in re.findall(r"<tr class=\"hell lhg\">(.*?)</tr>", tabla, re.S):
                eq = re.search(r'nationalmannschaft_(\d+)\.html"[^>]*>([^<]+)</a>', fila)
                celdas = [_texto(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", fila, re.S)]
                if eq and len(celdas) >= 5:
                    selecciones.append({"sd_team_id": int(eq.group(1)), "team_name": unescape(eq.group(2)),
                                        "debut_date": _fecha(celdas[2]), "caps": _int(celdas[3]), "goals": _int(celdas[4])})

        def array(nombre):
            m = re.search(rf"const {nombre}\s*=\s*(\[.*?\]);", html, re.S)
            try:
                return json.loads(m.group(1)) if m else []
            except ValueError:
                return []
        valores = [{"date": _fecha(f), "market_value": v, "sd_club_id": c, "club_name": n, "age": _int(a)}
                   for f, v, c, n, a in zip(array("fullDates"), array("mwValues"), array("vereinIds"),
                                            array("vereinsnamen"), array("alterWerte"))]

        lesiones = []
        i = html.find("Injury history")
        if i > 0:
            tabla = html[i:html.find("</table>", i)]
            for fila in re.findall(r"<tr class=\"(?:hell|dunkel)\"[^>]*>(.*?)</tr>", tabla, re.S):
                c = [_texto(x) for x in re.findall(r"<td[^>]*>(.*?)</td>", fila, re.S)]
                if len(c) >= 4 and _fecha(c[1]) and c[3]:
                    lesiones.append({"season": c[0], "from_date": _fecha(c[1]), "until_date": _fecha(c[2]), "injury": c[3]})

        return {"datos": {k: _texto(v) for k, v in datos.items()}, "nacionalidades": nac,
                "dorsal": int(dorsal.group(1)) if dorsal else None,
                # somebody.jpg = silueta genérica de Soccerdonna (sin foto real)
                "foto": foto.group(1) if foto and "somebody" not in foto.group(1) else None,
                "selecciones": selecciones,
                "valores": valores, "lesiones": lesiones,
                "club_actual_id": club_actual_id, "club_actual_nombre": club_actual_nombre,
                "club_actual_badge": club_actual_badge, "retirada": retirada,
                "liga_actual_nombre": liga_actual_nombre, "liga_actual_codigo": liga_actual_codigo,
                "liga_actual_logo": liga_actual_logo}



    def traspasos(self, slug: str, sd_id: int, max_dias: Optional[float] = None) -> List[Dict[str, Any]]:
        html = self.get(f"/en/{slug}/transfers/spieler_{sd_id}.html", max_dias) or ""
        i = html.find("Transfer history")
        if i < 0:
            return []
        tabla = html[i:html.find("</table>", i)]
        res = []
        for fila in re.findall(r"<tr class=\"(?:hell|dunkel)\">(.*?)</tr>", tabla, re.S):
            celdas = re.findall(r"<td[^>]*>(.*?)</td>", fila, re.S)
            if len(celdas) < 6:
                continue
            desde = re.search(r'verein_(\d+)\.html', celdas[2])
            hasta = re.search(r'verein_(\d+)\.html', celdas[3])
            res.append({"season": _texto(celdas[0]), "date": _fecha(_texto(celdas[1])),
                        "club_from": _texto(celdas[2]) or None, "sd_from": int(desde.group(1)) if desde else None,
                        "club_to": _texto(celdas[3]) or None, "sd_to": int(hasta.group(1)) if hasta else None,
                        "loan": bool(_texto(celdas[4])), "fee_text": _texto(celdas[5]) or None})
        return res


def _edad(dob: Optional[str]) -> Optional[int]:
    try:
        d = date.fromisoformat(str(dob)[:10])
    except (TypeError, ValueError):
        return None
    hoy = date.today()
    return hoy.year - d.year - ((hoy.month, hoy.day) < (d.month, d.day))


def candidatas_validas(p: Dict[str, Any], club: Optional[str], cands: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Resultados del buscador que pueden ser la jugadora (nombre + club/edad), de más a menos probable."""
    edad = _edad(p.get("birth_date"))
    club_n = normalizar_club(club)
    validas = []
    for c in cands:
        sim = sim_nombre(p, c["name"])
        sim_club = fuzz.token_set_ratio(club_n, normalizar_club(c.get("club"))) if club_n and c.get("club") else 0
        misma_edad = edad is not None and c.get("age") is not None and abs(edad - c["age"]) <= 1
        ok = (sim >= 60 and sim_club >= 70) or (sim >= 85 and misma_edad) or (sim >= 95 and len(cands) == 1)
        if ok:
            validas.append((sim + sim_club + (30 if misma_edad else 0), c))
    return [c for _, c in sorted(validas, key=lambda t: -t[0])]


def elegir_candidata(p: Dict[str, Any], club: Optional[str], cands: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    validas = candidatas_validas(p, club, cands)
    return validas[0] if validas else None


def candidatas_jugadora(sd: SDClient, p: Dict[str, Any], club: Optional[str]):
    """Candidatas de cada variante del nombre (matchName, completo, con primer apellido...), sin repetir.
    Es un generador: solo se busca la siguiente variante si las anteriores no se confirmaron."""
    vistas = set()
    for q in variantes_nombre(p, busqueda=True):
        for c in candidatas_validas(p, club, sd.buscar(q)):
            if c["sd_id"] not in vistas:
                vistas.add(c["sd_id"])
                yield c


def buscar_jugadora(sd: SDClient, p: Dict[str, Any], club: Optional[str]) -> Optional[Dict[str, Any]]:
    """Prueba cada variante del nombre (completo, apodo Opta, con primer apellido) hasta encontrar candidata."""
    return next(candidatas_jugadora(sd, p, club), None)


def mismo_lugar(a: Any, b: Any) -> Optional[bool]:
    """Lugar de nacimiento Opta vs Soccerdonna ('Altea' vs 'Altea, Alicante'). None si falta alguno."""
    na, nb = normalizar(a), normalizar(b)
    if not na or not nb:
        return None
    return fuzz.token_set_ratio(na, nb) >= 80


def confirmar_perfil(p: Dict[str, Any], c: Dict[str, Any], prof: Dict[str, Any], club: Optional[str]) -> bool:
    """¿La ficha de Soccerdonna es la jugadora de Opta? Fecha de nacimiento, lugar de nacimiento, dorsal y club.
    - Fechas reales en las dos webs: tienen que coincidir.
    - Fecha de relleno o sin fecha: basta lugar, dorsal o club con nombre parecido, o gran parecido y mismo año.
    - Lugar de nacimiento distinto en las dos webs: se descarta salvo que la fecha real coincida."""
    dob = _fecha(prof["datos"].get("Date of birth")) or ""
    nac = str(p.get("birth_date") or "")[:10]
    fechas_reales = bool(dob and nac) and not fecha_relleno(dob) and not fecha_relleno(nac)
    if fechas_reales:
        return misma_fecha(dob, nac)
    lugar = mismo_lugar(p.get("place_of_birth"), prof["datos"].get("Place of birth"))
    if lugar is False:
        return False
    dorsal = p.get("shirt_number")
    mismo_dorsal = dorsal is not None and prof.get("dorsal") is not None and int(dorsal) == prof["dorsal"]
    mismo_club = bool(club and c.get("club")) and \
        fuzz.token_set_ratio(normalizar_club(club), normalizar_club(c["club"])) >= 70
    sim = sim_nombre(p, c["name"])
    mismo_ano = len(dob) >= 4 and len(nac) >= 4 and abs(int(dob[:4]) - int(nac[:4])) <= 1
    return (sim >= 60 and (lugar or mismo_dorsal or mismo_club)) or (sim >= 85 and mismo_ano)


def misma_fecha(a: str, b: str) -> bool:
    """Tolera erratas de una de las webs: mismo año y mes o día iguales (2001-06-23 vs 2001-01-23),
    día y mes invertidos (2001-08-04 vs 2001-04-08), pocos días de diferencia (<= 15 días)
    o mismo día con un año de diferencia (2003-08-30 vs 2002-08-30)."""
    ya, ma, da = a.split("-")
    yb, mb, db = b.split("-")
    if ya == yb:
        if ma == mb or da == db:
            return True
        if (ma, da) == (db, mb):
            return True
    try:
        da_obj = date.fromisoformat(a)
        db_obj = date.fromisoformat(b)
        if abs((da_obj - db_obj).days) <= 15:
            return True
    except (ValueError, TypeError):
        pass
    return (ma, da) == (mb, db) and abs(int(ya) - int(yb)) <= 1


def fecha_relleno(f: str) -> bool:
    """Fecha de relleno cuando no se conoce la real (11-11 o 01-01)."""
    return len(f) >= 10 and f[5:10] in ("11-11", "01-01")


def es_foto_sd(photo_url: Any) -> bool:
    return bool(photo_url) and "_sd.jpg" in str(photo_url)


def _dias_entre(desde: Optional[str], hasta: Optional[str]) -> Optional[int]:
    """Días de baja; None si falta una fecha o Soccerdonna trae una imposible (año 0000)."""
    try:
        return (date.fromisoformat(hasta) - date.fromisoformat(desde)).days if desde and hasta else None
    except (TypeError, ValueError):
        return None


def filas_jugadora(p: Dict[str, Any], c: Dict[str, Any], prof: Dict[str, Any], tras: List[Dict[str, Any]],
                   ts: str) -> Dict[str, List[Dict[str, Any]]]:
    d, pid, sd_id = prof["datos"], p["id"], c["sd_id"]
    row: Dict[str, Any] = {
        "id": pid, "name": p["name"], "sd_id": sd_id, "sd_updated_at": ts,
        "sd_url": f"{SD_BASE}/en/{c['slug']}/profil/spieler_{sd_id}.html",
        "outfitter": d.get("Outfitter") or None,
        "contract_expires": _fecha(d.get("Contract until")),
        "market_value": _euros(d.get("Market value")),
        "citizenship": prof["nacionalidades"] or None,
        "tm_position_main": d.get("Position") or None,
    }
    if prof["valores"] and prof["valores"][-1].get("date"):
        row["market_value_updated_at"] = prof["valores"][-1]["date"]
    # Opta manda: solo se completan los huecos
    altura = re.search(r"(\d)[,.](\d{2})", d.get("Height", ""))
    if not p.get("height") and altura:
        row["height"] = int(altura.group(1)) * 100 + int(altura.group(2))
    pie = FOOT.get(d.get("Foot", "").lower())
    if not p.get("preferred_foot") and pie:
        row["preferred_foot"] = pie
    # También sustituye la fecha de relleno de Opta (11-11) por la real de Soccerdonna
    nac_sd, nac = _fecha(d.get("Date of birth")), str(p.get("birth_date") or "")[:10]
    if nac_sd and not fecha_relleno(nac_sd) and (not nac or fecha_relleno(nac)):
        row["birth_date"] = nac_sd
    if not p.get("place_of_birth") and d.get("Place of birth"):
        row["place_of_birth"] = d["Place of birth"]
    # Club actual y escudo desde Soccerdonna (fuente principal para club actual y escudos)
    if prof.get("club_actual_nombre"):
        row["fm_team_name"] = prof["club_actual_nombre"]
    if prof.get("club_actual_badge"):
        row["fm_team_badge_url"] = prof["club_actual_badge"]
    row = {k: v for k, v in row.items() if v is not None}

    valores = {}
    for v in prof["valores"]:
        if v["date"]:
            valores[v["date"]] = {"player_id": pid, "date": v["date"], "market_value": v["market_value"],
                                  "club_name": en.club(v["club_name"]), "sd_club_id": v["sd_club_id"], "age": v["age"],
                                  "club_badge_url": SD_BADGE.format(id=v["sd_club_id"]) if v["sd_club_id"] else None}
    traspasos = [{
        "tm_transfer_id": _id_traspaso(sd_id, t["date"], t["sd_from"] or t["club_from"], t["sd_to"] or t["club_to"]),
        "player_id": pid, "date": t["date"], "season": t["season"],
        "club_from": en.club(t["club_from"]), "club_to": en.club(t["club_to"]),
        "club_from_badge_url": SD_BADGE.format(id=t["sd_from"]) if t["sd_from"] else None,
        "club_to_badge_url": SD_BADGE.format(id=t["sd_to"]) if t["sd_to"] else None,
        "fee": _euros(t["fee_text"]) if t["fee_text"] and "€" in t["fee_text"] else None,
        "fee_text": en.traspaso(t["fee_text"]), "loan": t["loan"], "upcoming": False,
    } for t in tras]
    valida = lambda f: bool(f) and str(f)[:4] >= "1900"  # Soccerdonna a veces trae 0000-00-00
    lesiones = {(l["from_date"], en.lesion(l["injury"])[:150]): {
        "player_id": pid, "from_date": l["from_date"], "injury": en.lesion(l["injury"])[:150], "season": l["season"],
        "until_date": l["until_date"] if valida(l["until_date"]) else None,
        "days": _dias_entre(l["from_date"], l["until_date"]) if valida(l["until_date"]) else None,
    } for l in prof["lesiones"] if valida(l["from_date"])}
    selecciones = [{"player_id": pid, **s, "team_name": en.seleccion(s["team_name"])} for s in prof["selecciones"]]
    return {"players": [row], "player_market_values": list(valores.values()), "player_transfers": traspasos,
            "player_injuries": list(lesiones.values()), "player_national_teams": selecciones}


class SoccerdonnaSync:
    PK = (("player_market_values", "player_id,date"), ("player_transfers", "tm_transfer_id"),
          ("player_injuries", "player_id,from_date,injury"), ("player_national_teams", "player_id,sd_team_id"))

    def __init__(self, refresh_days: Optional[int] = None, limit: Optional[int] = None, refresh_photos: bool = False,
                 fotos: bool = True):
        self.store = Store(get_supabase_client())
        self.fotos = fotos  # False: las fotos las pone FotMob (pipeline/jugadoras.py)
        self.sd = SDClient(cache_days=refresh_days or 30)
        self.refresh_days = refresh_days
        self.limit = limit
        self.refresh_photos = refresh_photos
        self.pendiente: Dict[str, List[Dict[str, Any]]] = {}
        self.asignadas: Dict[int, str] = {}  # sd_id → player_id
        self.nombres: Dict[str, str] = {}  # player_id → nombre (para distinguir duplicados de Opta de homónimas)
        # (ficha "sd-" de Soccerdonna, jugadora Opta) confirmadas como la misma: sd_ligas.completar las une
        self.pares_sd: List[tuple] = []
        self.totales = {"emparejadas": 0, "sin_emparejar": 0, "fotos": 0}

    def _flush(self):
        # PostgREST exige las mismas claves en todo el upsert: se agrupan las filas por columnas. Rellenar las que
        # faltan con None borraba datos de otras fuentes (foto FotMob, altura, lugar de nacimiento...)
        for grupo in _homogeneo(self.pendiente.pop("players", [])):
            self.store.upsert("players", grupo)
        for table, pk in self.PK:
            rows = self.pendiente.pop(table, [])
            # Sin claves repetidas en el lote (mismo traspaso por jugadora duplicada en Opta, o listado dos
            # veces en Soccerdonna): Postgres rechaza todo el upsert si una fila se actualiza dos veces
            claves = pk.split(",")
            rows = list({tuple(r.get(c) for c in claves): r for r in rows}.values())
            for grupo in _homogeneo(rows):
                self.store.upsert(table, grupo, on_conflict=pk)

    def _procesar(self, p: Dict[str, Any], club: Optional[str]):
        # Hasta MAX_CANDIDATAS fichas: la primera que confirme fecha/lugar de nacimiento, dorsal y club
        c, prof = None, None
        for n, cand in enumerate(candidatas_jugadora(self.sd, p, club)):
            if n >= MAX_CANDIDATAS:
                break
            ficha = self.sd.perfil(cand["slug"], cand["sd_id"])
            if ficha and confirmar_perfil(p, cand, ficha, club):
                c, prof = cand, ficha
                break
            if ficha:
                logger.info(f"  Descartada {cand['name']} para {p['name']}: "
                            f"nacimiento {ficha['datos'].get('Date of birth')} ({ficha['datos'].get('Place of birth')}) "
                            f"≠ {p.get('birth_date')} ({p.get('place_of_birth')})")
        if not c:
            self.totales["sin_emparejar"] += 1
            logger.info(f"  Sin emparejar: {p['name']} ({club})")
            return
        otra = self.asignadas.get(c["sd_id"])
        es_duplicado = False
        if otra and otra != p["id"] and sim_nombre(p, self.nombres.get(otra)) < 90:
            # La ficha ya es de otra jugadora con otro nombre: no es un duplicado de Opta, es un falso positivo
            # (así acabó Laia Rius con la fecha, el lugar de nacimiento y la foto de Laia Aleixandri)
            logger.info(f"  {p['name']}: ficha Soccerdonna {c['sd_id']} ya es de {self.nombres.get(otra)} — descartada")
            self.totales["sin_emparejar"] += 1
            return
        if otra and otra != p["id"]:
            # Opta a veces repite a una jugadora con otro ID: sincronizar perfil y foto pero sin pisar sd_id si es único
            logger.info(f"  {p['name']}: ficha Soccerdonna {c['sd_id']} ya asignada a Opta {otra} (duplicado Opta; sincronizando perfil)")
            es_duplicado = True
            if str(otra).startswith("sd-") and not p["id"].startswith("sd-"):
                self.pares_sd.append((otra, p["id"]))
        else:
            self.asignadas[c["sd_id"]] = p["id"]
        filas = filas_jugadora(p, c, prof, self.sd.traspasos(c["slug"], c["sd_id"]), now_iso())
        if es_duplicado:
            filas["players"][0].pop("sd_id", None)
        # Fotos: FotMob tiene PRIORIDAD. Solo guardamos foto de Soccerdonna si no tiene foto
        # o si la actual no es de FotMob (es_foto_fotmob)
        actual_foto = p.get("photo_url")
        puede_foto_sd = not actual_foto or (self.refresh_photos and not es_foto_fotmob(actual_foto))
        if self.fotos and prof["foto"] and puede_foto_sd:
            img = self.sd.image(prof["foto"])
            url = self.store.upload(BUCKET_PLAYER_PHOTOS, f"{p['id']}_sd.jpg", img, "image/jpeg") if img else None
            if url:
                filas["players"][0].update(photo_url=url, photo_updated_at=now_iso())
                self.totales["fotos"] += 1
        for k, v in filas.items():
            self.pendiente.setdefault(k, []).extend(v)
        self.totales["emparejadas"] += 1
        if self.totales["emparejadas"] % LOTE == 0:
            self._flush()
            logger.info(f"  {self.totales['emparejadas']} jugadoras guardadas ({self.sd.peticiones} peticiones)")

    def run(self, comp_id: Optional[str] = None, solo_fichas: bool = False):
        """`solo_fichas`: busca las jugadoras sin ficha de Soccerdonna, sin sincronizar escudos ni logos."""
        comps = competiciones_objetivo(self.store)
        comp_ids = {c["id"] for c in comps if not comp_id or c["id"] == comp_id}
        equipos = {t["id"]: t["name"] for t in self.store.select_all("teams", "id,name,competition_id")
                   if t.get("competition_id") in comp_ids}
        # Sin equipo actual (ya no están en la plantilla): el club de su última temporada
        orden = {c["season_id"]: i for i, c in enumerate(comps)}
        filas = self.store.select_all("squad_members", "player_id,team_id,season_id") + \
            self.store.select_all("player_season_stats", "player_id,team_id,season_id")
        ultimo = {r["player_id"]: r["team_id"] for r in sorted(filas, key=lambda r: orden.get(r["season_id"], -1))
                  if r.get("team_id")}
        dorsales = dorsales_actuales(self.store, comps)
        jugadoras = []
        for p in self.store.select_all(
                "players", "id,name,first_name,last_name,match_name,birth_date,height,preferred_foot,"
                           "place_of_birth,photo_url,current_team_id,sd_updated_at,sd_id"):
            p["shirt_number"] = dorsales.get(p["id"])
            self.nombres[p["id"]] = p["name"]
            if p.get("sd_id"):
                self.asignadas[p["sd_id"]] = p["id"]
            if p.get("current_team_id") not in equipos:
                p["current_team_id"] = ultimo.get(p["id"])
            if p["current_team_id"] in equipos:
                jugadoras.append(p)
        limite = datetime.now(timezone.utc) - timedelta(days=self.refresh_days or 36500)
        pendientes = [p for p in jugadoras if not p.get("sd_updated_at")
                      or datetime.fromisoformat(p["sd_updated_at"].replace("Z", "+00:00")) < limite]
        if self.limit:
            pendientes = pendientes[:self.limit]
        self.procesadas = [p["id"] for p in pendientes]
        logger.info(f"Soccerdonna: {len(pendientes)}/{len(jugadoras)} jugadoras pendientes")
        for p in pendientes:
            try:
                self._procesar(p, equipos.get(p["current_team_id"]))
            except Exception as e:
                logger.exception(f"  Error con {p['name']}: {e}")
        self._flush()
        if solo_fichas:
            logger.info(f"Soccerdonna (fichas): {self.totales} ({self.sd.peticiones} peticiones)")
            return

        # Sincronización de escudos de equipos desde Soccerdonna
        for tid, tname in equipos.items():
            try:
                club_sd = self.sd.buscar_club(tname)
                if club_sd and club_sd.get("badge_url"):
                    img = self.sd.image(club_sd["badge_url"])
                    if img:
                        url = self.store.upload(BUCKET_TEAM_BADGES, f"{tid}_sd.png", img, "image/png")
                        if url:
                            self.store.upsert("teams", [{"id": tid, "name": tname,
                                                         "badge_url": f"{url}?v={int(time.time())}"}])
            except Exception as e:
                logger.warning(f"  Error sincronizando escudo SD para {tname}: {e}")

        # Sincronización de logos de ligas desde Soccerdonna (ej: mediumfotos/{codigo}.jpg)
        ligas_db = {l["id"]: l for l in self.store.select_all("leagues", "id,name,logo_url")}
        for ruta, logo_sd_url in getattr(self.sd, "_ligas_logos", {}).items():
            if not logo_sd_url:
                continue
            try:
                img = self.sd.image(logo_sd_url)
                if not img:
                    continue
                # Emparejar con ligas en base de datos por nombre
                m_slug = re.search(r'/en/([^/]+)/startseite/wettbewerb_([^\.]+)\.html', ruta)
                slug_norm = normalizar(m_slug.group(1).replace("-", " ")) if m_slug else ""
                for lid, linfo in ligas_db.items():
                    if fuzz.token_set_ratio(slug_norm, normalizar(linfo["name"])) >= 60:
                        url = self.store.upload(BUCKET_TEAM_BADGES, f"ligas/{lid}_sd.jpg", img, "image/jpeg")
                        if url:
                            self.store.upsert("leagues", [{"id": lid, "name": linfo["name"],
                                                           "logo_url": f"{url}?v={int(time.time())}",
                                                           "updated_at": now_iso()}])
            except Exception as e:
                logger.warning(f"  Error sincronizando logo de liga SD ({ruta}): {e}")

        logger.info(f"Soccerdonna completado: {self.totales} ({self.sd.peticiones} peticiones)")


def main():
    parser = argparse.ArgumentParser(description="Enriquecer jugadoras con Soccerdonna")
    parser.add_argument("--comp-id", type=str, default=None, help="Solo los equipos de esta competición")
    parser.add_argument("--limit", type=int, default=None, help="Máximo de jugadoras a procesar (pruebas)")
    parser.add_argument("--refresh-days", type=int, default=None,
                        help="Reprocesar jugadoras actualizadas hace más de N días (por defecto solo las nuevas)")
    parser.add_argument("--refresh-photos", action="store_true", help="Sustituir también fotos ya existentes")
    args = parser.parse_args()
    SoccerdonnaSync(args.refresh_days, args.limit, args.refresh_photos).run(args.comp_id)
    sys.exit(0)


if __name__ == "__main__":
    main()
