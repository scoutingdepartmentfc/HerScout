"""
pipeline/ceroacero.py
"Coche escoba" de ceroacero.es: se ejecuta al final del pipeline y SOLO rellena lo que falte en cada jugadora
(foto, fecha y lugar de nacimiento, nacionalidad, pie, altura, peso, contrato y, si no tiene ninguno,
el historial de fichajes). Nunca pisa datos de Opta, Soccerdonna o FotMob.

Uso:
    python -m pipeline.ceroacero [--limit N] [--refresh-days 30] [--max-minutos 60] [--prueba]

Emparejamiento: buscador de ceroacero (nombre → candidatas con edad y club), confirmado con la ficha:
si las dos webs tienen fecha de nacimiento real tienen que coincidir; si no, hace falta nombre muy parecido + club.
Reanudable: cz_updated_at marca las jugadoras revisadas (emparejadas o no) y se reintentan pasados N días.
"""

import argparse
import hashlib
import logging
import os
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone
from html import unescape
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import requests
from rapidfuzz import fuzz

from .config import BUCKET_PLAYER_PHOTOS, LOCAL_CACHE_DIR
from .photos import normalizar_club, sim_nombre, variantes_nombre
from .soccerdonna import _edad, _homogeneo, candidatas_validas, fecha_relleno, misma_fecha, now_iso
from .storage import Store, get_supabase_client
from . import traducciones as en

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ceroacero")
logging.getLogger("httpx").setLevel(logging.WARNING)  # sin una línea por cada petición a Supabase

CZ_BASE = "https://www.ceroacero.es"
CZ_CACHE_DIR = Path(LOCAL_CACHE_DIR) / "ceroacero"
PAUSA = float(os.environ.get("CZ_PAUSA", "1.5"))  # segundos entre peticiones reales
MAX_CANDIDATAS = 3
LOTE = 25
HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                         "(KHTML, like Gecko) Chrome/130.0 Safari/537.36",
           "Accept-Language": "es-ES,es;q=0.9,en;q=0.8"}
PIE = {"derecho": "right", "izquierdo": "left", "ambidiestro": "both", "ambos": "both", "ambidextro": "both"}

# Bandera de ceroacero (class="flag:ES") → nombre en inglés, como el resto de la app
ISO2 = {
    "ES": "Spain", "PT": "Portugal", "FR": "France", "DE": "Germany", "IT": "Italy", "GB": "England",
    "EN": "England", "SC": "Scotland", "WL": "Wales", "NI": "Northern Ireland", "IE": "Republic of Ireland",
    "NL": "Netherlands", "BE": "Belgium", "CH": "Switzerland", "AT": "Austria", "DK": "Denmark", "SE": "Sweden",
    "NO": "Norway", "FI": "Finland", "IS": "Iceland", "PL": "Poland", "CZ": "Czech Republic", "SK": "Slovakia",
    "SI": "Slovenia", "HU": "Hungary", "HR": "Croatia", "RS": "Serbia", "BA": "Bosnia-Herzegovina",
    "ME": "Montenegro", "AL": "Albania", "MK": "North Macedonia", "XK": "Kosovo", "RO": "Romania",
    "BG": "Bulgaria", "GR": "Greece", "TR": "Turkey", "CY": "Cyprus", "RU": "Russia", "UA": "Ukraine",
    "BY": "Belarus", "LT": "Lithuania", "LV": "Latvia", "EE": "Estonia", "LU": "Luxembourg", "IL": "Israel",
    "MT": "Malta", "AD": "Andorra", "FO": "Faroe Islands", "MD": "Moldova", "GE": "Georgia", "AM": "Armenia",
    "AZ": "Azerbaijan", "KZ": "Kazakhstan", "UZ": "Uzbekistan",
    "BR": "Brazil", "AR": "Argentina", "CO": "Colombia", "MX": "Mexico", "CA": "Canada", "US": "United States",
    "JM": "Jamaica", "TT": "Trinidad and Tobago", "PE": "Peru", "CL": "Chile", "UY": "Uruguay", "PY": "Paraguay",
    "VE": "Venezuela", "EC": "Ecuador", "BO": "Bolivia", "CR": "Costa Rica", "PA": "Panama",
    "DO": "Dominican Republic", "PR": "Puerto Rico", "HT": "Haiti", "CU": "Cuba", "GT": "Guatemala",
    "HN": "Honduras", "SV": "El Salvador", "NI_": "Nicaragua",
    "JP": "Japan", "KR": "South Korea", "KP": "North Korea", "CN": "China", "TW": "Chinese Taipei",
    "AU": "Australia", "NZ": "New Zealand", "PH": "Philippines", "VN": "Vietnam", "TH": "Thailand",
    "IN": "India", "IR": "Iran",
    "NG": "Nigeria", "ZA": "South Africa", "MA": "Morocco", "CM": "Cameroon", "GH": "Ghana", "CI": "Ivory Coast",
    "ZM": "Zambia", "SN": "Senegal", "TN": "Tunisia", "DZ": "Algeria", "EG": "Egypt", "GQ": "Equatorial Guinea",
    "MW": "Malawi", "KE": "Kenya", "TZ": "Tanzania", "ML": "Mali", "CV": "Cape Verde", "AO": "Angola",
    "MZ": "Mozambique", "GW": "Guinea-Bissau", "CD": "DR Congo", "CG": "Congo",
}


def _texto(html: str) -> str:
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", html or ""))).strip()


def _int(v: Any) -> Optional[int]:
    m = re.search(r"\d+", str(v or ""))
    return int(m.group()) if m else None


def _es_placeholder(url: Optional[str]) -> bool:
    return not url or bool(re.search(r"no_?photo|nophoto|No_Team", url, re.I))


def _abs(url: str) -> str:
    return url if url.startswith("http") else CZ_BASE + url


def _id_traspaso(cz_id: int, fecha: Optional[str], desde: Any, hasta: Any) -> int:
    """Hash estable (cabe en BIGINT) con prefijo propio para no chocar con Soccerdonna."""
    return int(hashlib.md5(f"cz:{cz_id}:{fecha}:{desde}:{hasta}".encode()).hexdigest()[:15], 16)


class BloqueadoError(RuntimeError):
    """Cloudflare ha puesto el reto JS: no tiene sentido seguir en esta ejecución."""


class CZClient:
    def __init__(self, cache_days: int = 30):
        self.s = requests.Session()
        self.s.headers.update(HEADERS)
        self.cache_days = cache_days
        self.peticiones = 0
        CZ_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    def get(self, path: str) -> Optional[str]:
        f = CZ_CACHE_DIR / (hashlib.md5(path.encode()).hexdigest() + ".html")
        if f.exists() and time.time() - f.stat().st_mtime < self.cache_days * 86400:
            return f.read_text(encoding="utf-8", errors="ignore")
        for intento in range(3):
            try:
                time.sleep(PAUSA)
                self.peticiones += 1
                r = self.s.get(CZ_BASE + path, timeout=30)
                if "Just a moment..." in r.text[:2000] or "_cf_chl_opt" in r.text[:5000]:
                    raise BloqueadoError(f"Cloudflare bloquea {path}")
                if r.status_code == 200:
                    f.write_text(r.text, encoding="utf-8")
                    return r.text
                if r.status_code == 404:
                    return None
                # El buscador de ceroacero responde 500 cuando no hay resultados: no es un fallo, no se reintenta
                if r.status_code == 500 and path.startswith("/jqc_search_search.php"):
                    f.write_text("", encoding="utf-8")
                    return ""
                logger.warning(f"  ceroacero HTTP {r.status_code} en {path}")
            except requests.RequestException as e:
                logger.warning(f"  ceroacero fallo de conexión ({e})")
            time.sleep(5 * (intento + 1))
        return None

    def image(self, url: str) -> Optional[Tuple[bytes, str]]:
        try:
            r = self.s.get(url, timeout=30)
            ct = r.headers.get("content-type", "")
            if r.status_code == 200 and ct.startswith("image") and len(r.content) > 1500:
                return r.content, ct.split(";")[0]
        except requests.RequestException:
            pass
        return None

    # ── Búsqueda ─────────────────────────────────────────────
    def buscar(self, nombre: str) -> List[Dict[str, Any]]:
        """Autocompletado: solo resultados de jugadores (data-type="4") con edad y club."""
        html = self.get(f"/jqc_search_search.php?queryString={quote(nombre)}") or ""
        res = []
        for m in re.finditer(r'<a href="(/jugador/([^/"]+)/(\d+))[^"]*"\s+data-type="4"[^>]*>(.*?)</a>', html, re.S):
            cuerpo = m.group(4)
            nombre_cz = re.search(r'class="text">([^<]+)<', cuerpo)
            info = re.search(r"<span>([^<]+)</span>", cuerpo)
            partes = [x.strip() for x in unescape(info.group(1)).split("|")] if info else []
            edad = next((_int(x) for x in partes if re.search(r"\d+\s*años", x)), None)
            # Último campo = club (si no es la edad ni la posición)
            club = partes[-1] if len(partes) >= 3 and not re.search(r"\d+\s*años", partes[-1]) else None
            res.append({"slug": m.group(2), "cz_id": int(m.group(3)),
                        "name": unescape(nombre_cz.group(1)).strip() if nombre_cz else m.group(2).replace("-", " "),
                        "age": edad, "club": club})
        return res

    # ── Ficha ────────────────────────────────────────────────
    def perfil(self, slug: str, cz_id: int) -> Optional[Dict[str, Any]]:
        html = self.get(f"/jugador/{slug}/{cz_id}")
        if not html:
            return None

        foto = re.search(r'<img fetchpriority="high"[^>]*src="([^"]+)"', html)
        foto_url = _abs(foto.group(1)) if foto and not _es_placeholder(foto.group(1)) else None

        datos: Dict[str, Dict[str, Any]] = {}
        i = html.find('class="card-data bio"')
        bio = html[i:html.find('card-data__footer', i)] if i >= 0 else ""
        for fila in re.split(r'<div class="card-data__row', bio)[1:]:
            lab = re.search(r'card-data__label">([^<]+)<', fila)
            if not lab:
                continue
            resto = fila[lab.end():]
            valores = [_texto(v) for v in re.findall(r'class="(?:card-data__value|text)">(.*?)</(?:span|div)>', resto, re.S)]
            valores = [v for v in valores if v]
            datos[lab.group(1).strip()] = {"valores": valores, "flags": re.findall(r'flag:([A-Z_]{2,3})', resto)}

        def valor(*claves: str) -> Optional[str]:
            for k, d in datos.items():
                if any(k.lower().startswith(c.lower()) for c in claves) and d["valores"]:
                    return d["valores"][0]
            return None

        nac = re.search(r"(\d{4})-(\d{2})-(\d{2})", valor("Fecha de nacimiento") or "")
        lugar = re.search(r"\(([^)]+)\)", valor("País de Nacimiento") or "")
        nacionalidades = []
        d_nac = next((d for k, d in datos.items() if k.lower().startswith("nacionalidad")), None)
        if d_nac:
            for j, v in enumerate(d_nac["valores"]):
                code = d_nac["flags"][j] if j < len(d_nac["flags"]) else None
                nombre = ISO2.get(code or "", v)
                if nombre and nombre not in nacionalidades:
                    nacionalidades.append(nombre)
        alt_peso = valor("Altura") or ""
        altura = re.search(r"(\d{3})\s*cm", alt_peso)
        peso = re.search(r"(\d{2,3})\s*kg", alt_peso)
        contrato = re.search(r"(\d{4})/(\d{2})", valor("Contrato") or "")
        pie = PIE.get((valor("Pie") or "").strip().lower())

        traspasos = []
        for linea in re.findall(r'<div class="transfer-line transfer-line--player">(.*?)</div>\s*</div>\s*</div>',
                                html, re.S):
            equipos = re.findall(r'<span class="team"><img src="([^"]*)"[^>]*>(.*?)</span>', linea, re.S)
            fecha = re.search(r'class="date">(\d{2})/(\d{2})/(\d{4})<', linea)
            if len(equipos) != 2 or not fecha:
                continue
            # Filial → primer equipo: ceroacero pone el mismo nombre y escudo a los dos ("Deportivo → Deportivo")
            if _texto(equipos[0][1]) == _texto(equipos[1][1]):
                continue
            importe = _texto((re.search(r'class="amount">(.*?)</div>', linea, re.S) or [None, ""])[1]
                             if re.search(r'class="amount">', linea) else "")
            (img_desde, desde), (img_hasta, hasta) = equipos
            traspasos.append({
                "date": f"{fecha.group(3)}-{fecha.group(2)}-{fecha.group(1)}",
                "club_from": _texto(desde) or None, "club_to": _texto(hasta) or None,
                "badge_from": None if _es_placeholder(img_desde) else _abs(img_desde),
                "badge_to": None if _es_placeholder(img_hasta) else _abs(img_hasta),
                "loan": bool(re.search(r"cedid|préstamo|prestamo|loan", linea, re.I)),
                "fee_text": importe if importe and importe != "-" else None,
            })

        birth_date = f"{nac.group(1)}-{nac.group(2)}-{nac.group(3)}" if nac else None
        try:  # ceroacero pone '2006-00-00' cuando solo sabe el año
            date.fromisoformat(birth_date or "")
        except ValueError:
            birth_date = None

        return {"foto": foto_url, "datos": datos,
                "birth_date": birth_date,
                "place_of_birth": lugar.group(1).strip() if lugar else None,
                "nacionalidades": nacionalidades,
                "height": int(altura.group(1)) if altura and 140 <= int(altura.group(1)) <= 200 else None,
                "weight": int(peso.group(1)) if peso and 40 <= int(peso.group(1)) <= 110 else None,
                "preferred_foot": pie,
                "contract_expires": f"{contrato.group(1)}-{contrato.group(2)}-{'30' if contrato.group(2) in ('04', '06', '09', '11') else ('28' if contrato.group(2) == '02' else '31')}" if contrato else None,
                "club": valor("Club actual"),
                "traspasos": traspasos}


def confirmar(p: Dict[str, Any], c: Dict[str, Any], prof: Dict[str, Any], club: Optional[str]) -> bool:
    """Más estricto que Soccerdonna: el coche escoba no debe meter datos de otra persona."""
    dob, nac = prof.get("birth_date") or "", str(p.get("birth_date") or "")[:10]
    if dob and nac and not fecha_relleno(dob) and not fecha_relleno(nac):
        return misma_fecha(dob, nac)
    sim = sim_nombre(p, c["name"])
    club_cz = prof.get("club") or c.get("club")
    mismo_club = bool(club and club_cz) and fuzz.token_set_ratio(normalizar_club(club), normalizar_club(club_cz)) >= 70
    mismo_ano = len(dob) >= 4 and len(nac) >= 4 and abs(int(dob[:4]) - int(nac[:4])) <= 1
    return sim >= 85 and (mismo_club or mismo_ano)


def _temporada(fecha: str) -> str:
    y, m = int(fecha[:4]), int(fecha[5:7])
    ini = y if m >= 7 else y - 1
    return f"{ini % 100:02d}/{(ini + 1) % 100:02d}"


def filas_huecos(p: Dict[str, Any], c: Dict[str, Any], prof: Dict[str, Any], con_traspasos: bool,
                 ts: str) -> Dict[str, List[Dict[str, Any]]]:
    """Solo los campos vacíos en la BD (o fecha de nacimiento de relleno)."""
    pid = p["id"]
    row: Dict[str, Any] = {"id": pid, "name": p["name"], "cz_id": c["cz_id"], "cz_updated_at": ts,
                           "cz_url": f"{CZ_BASE}/jugador/{c['slug']}/{c['cz_id']}"}
    nac = str(p.get("birth_date") or "")[:10]
    if prof["birth_date"] and not fecha_relleno(prof["birth_date"]) and (not nac or fecha_relleno(nac)):
        row["birth_date"] = prof["birth_date"]
    for campo in ("place_of_birth", "height", "weight", "preferred_foot", "contract_expires"):
        if not p.get(campo) and prof.get(campo):
            row[campo] = prof[campo]
    if prof["nacionalidades"]:
        if not p.get("citizenship"):
            row["citizenship"] = prof["nacionalidades"]
        if not p.get("country"):
            row["country"] = en.pais_opta(prof["nacionalidades"][0])

    traspasos = []
    if con_traspasos:
        for t in prof["traspasos"]:
            traspasos.append({
                "tm_transfer_id": _id_traspaso(c["cz_id"], t["date"], t["club_from"], t["club_to"]),
                "player_id": pid, "date": t["date"], "season": _temporada(t["date"]),
                "club_from": en.club(t["club_from"]), "club_to": en.club(t["club_to"]),
                "club_from_badge_url": t["badge_from"], "club_to_badge_url": t["badge_to"],
                "fee": None, "fee_text": en.traspaso(t["fee_text"]), "loan": t["loan"], "upcoming": False,
            })
    return {"players": [row], "player_transfers": traspasos}


def _faltan(p: Dict[str, Any], con_traspasos: set) -> List[str]:
    nac = str(p.get("birth_date") or "")[:10]
    faltan = [k for k in ("photo_url", "place_of_birth", "height", "weight", "preferred_foot",
                          "contract_expires", "country", "citizenship") if not p.get(k)]
    if not nac or fecha_relleno(nac):
        faltan.append("birth_date")
    if p["id"] not in con_traspasos:
        faltan.append("transfers")
    return faltan


class CeroaceroSync:
    def __init__(self, refresh_days: int = 30, limit: Optional[int] = None, max_minutos: Optional[float] = None,
                 prueba: bool = False, league: Optional[str] = None, country: Optional[str] = None):
        self.prueba = prueba
        self.store = Store(get_supabase_client())  # en prueba se lee la BD pero no se escribe (_flush/upload)
        self.cz = CZClient(cache_days=refresh_days)
        self.refresh_days = refresh_days
        self.limit = limit
        self.league = league
        self.country = country
        self.fin = time.time() + max_minutos * 60 if max_minutos else None
        self.pendiente: Dict[str, List[Dict[str, Any]]] = {}
        self.asignadas: Dict[int, str] = {}
        self.totales = {"revisadas": 0, "emparejadas": 0, "sin_emparejar": 0, "fotos": 0, "campos": 0, "traspasos": 0}

    def _flush(self):
        if self.prueba:
            for k, v in self.pendiente.items():
                for r in v[:50]:
                    logger.info(f"  [prueba] {k}: {r}")
            self.pendiente.clear()
            return
        for grupo in _homogeneo(self.pendiente.pop("players", [])):
            self.store.upsert("players", grupo)
        rows = list({r["tm_transfer_id"]: r for r in self.pendiente.pop("player_transfers", [])}.values())
        for grupo in _homogeneo(rows):
            self.store.upsert("player_transfers", grupo, on_conflict="tm_transfer_id")

    def _procesar(self, p: Dict[str, Any], club: Optional[str], faltan: List[str]):
        self.totales["revisadas"] += 1
        c = prof = None
        vistas = set()
        for q in variantes_nombre(p, busqueda=True):
            for cand in candidatas_validas(p, club, self.cz.buscar(q)):
                if cand["cz_id"] in vistas:
                    continue
                vistas.add(cand["cz_id"])
                if len(vistas) > MAX_CANDIDATAS:
                    break
                ficha = self.cz.perfil(cand["slug"], cand["cz_id"])
                if ficha and confirmar(p, cand, ficha, club):
                    c, prof = cand, ficha
                    break
            if c or len(vistas) > MAX_CANDIDATAS:
                break

        if not c:
            self.totales["sin_emparejar"] += 1
            logger.info(f"  Sin emparejar: {p['name']} ({club})")
            # Se marca igualmente para no repetir la búsqueda hasta dentro de refresh_days
            self.pendiente.setdefault("players", []).append(
                {"id": p["id"], "name": p["name"], "cz_updated_at": now_iso()})
            return

        filas = filas_huecos(p, c, prof, "transfers" in faltan, now_iso())
        row = filas["players"][0]
        otra = self.asignadas.get(c["cz_id"])
        if otra and otra != p["id"]:
            row.pop("cz_id", None)  # duplicado Opta: rellena huecos pero no repite el ID
        else:
            self.asignadas[c["cz_id"]] = p["id"]

        if "photo_url" in faltan and prof["foto"]:
            img = self.cz.image(prof["foto"])
            if img:
                contenido, ct = img
                # Quitar el fondo con rembg para guardarla siempre con fondo transparente
                try:
                    from .fotos_365 import sin_fondo
                    contenido = sin_fondo(contenido)
                    ct = "image/png"
                    ext = "png"
                except Exception as e:
                    logger.warning(f"  ceroacero: no se pudo quitar el fondo a la foto ({e})")
                    ext = "png" if "png" in ct else "jpg"

                url = None if self.prueba else self.store.upload(
                    BUCKET_PLAYER_PHOTOS, f"{p['id']}_cz.{ext}", contenido, ct)
                if url or self.prueba:
                    row.update(photo_url=url or prof["foto"], photo_updated_at=now_iso())
                    self.totales["fotos"] += 1

        rellenados = [k for k in row if k not in ("id", "name", "cz_id", "cz_url", "cz_updated_at", "photo_updated_at")]
        self.totales["campos"] += len(rellenados)
        self.totales["traspasos"] += len(filas["player_transfers"])
        self.totales["emparejadas"] += 1
        n_fichajes = len(filas["player_transfers"])
        logger.info(f"  {p['name']} → ceroacero {c['cz_id']}: {', '.join(rellenados) or 'nada nuevo'}"
                    + (f" + {n_fichajes} fichajes" if n_fichajes else ""))
        for k, v in filas.items():
            self.pendiente.setdefault(k, []).extend(v)
        if self.totales["revisadas"] % LOTE == 0:
            self._flush()
            logger.info(f"  {self.totales} ({self.cz.peticiones} peticiones)")

    def run(self):
        equipos = {t["id"]: t["name"] for t in self.store.select_all("teams", "id,name")}
        stats = self.store.select_all("player_season_stats", "player_id,team_id,season_id")
        con_stats = {r["player_id"] for r in stats}
        # Club de respaldo: el de su temporada más reciente
        inicio = {t["id"]: str(t.get("start_date") or "") for t in self.store.select_all("seasons", "id,start_date")}
        ultimo_equipo = {r["player_id"]: r["team_id"]
                         for r in sorted(stats, key=lambda r: inicio.get(r.get("season_id"), "")) if r.get("team_id")}
        con_traspasos = {r["player_id"] for r in self.store.select_all("player_transfers", "player_id")}
        jugadoras = self.store.select_all(
            "players", "id,name,first_name,last_name,match_name,birth_date,place_of_birth,height,weight,"
                       "preferred_foot,contract_expires,country,citizenship,photo_url,current_team_id,"
                       "fm_team_name,current_league_name,sd_league_code,cz_id,cz_updated_at")
        limite = datetime.now(timezone.utc) - timedelta(days=self.refresh_days)

        # Si se especificó una liga o país, obtener también los IDs de equipos como respaldo
        target_team_ids = set()
        league_countries = {}
        for l in self.store.select_all("sd_leagues", "code,name,country"):
            if l.get("code") and l.get("country"):
                league_countries[l["code"].lower()] = l["country"].lower()
            if l.get("name") and l.get("country"):
                league_countries[l["name"].lower()] = l["country"].lower()

        if self.league or self.country:
            l_lower = (self.league or "").lower()
            c_lower = (self.country or "").lower()
            for t in self.store.select_all("teams", "id,name,league_name,sd_league_code,country"):
                t_league = (t.get("league_name") or "").lower()
                t_sd = (t.get("sd_league_code") or "").lower()
                t_country = (t.get("country") or league_countries.get(t_sd) or league_countries.get(t_league) or "").lower()
                
                match_l = bool(self.league and ((l_lower in t_league) or (l_lower == t_sd)))
                match_c = bool(self.country and (c_lower in t_country))
                if match_l or match_c:
                    target_team_ids.add(t["id"])

        pendientes = []
        for p in jugadoras:
            if self.league or self.country:
                p_league = (p.get("current_league_name") or "").lower()
                p_sd = (p.get("sd_league_code") or "").lower()
                p_country = (p.get("country") or p.get("citizenship") or league_countries.get(p_sd) or league_countries.get(p_league) or "").lower()

                match_l = bool(self.league and ((self.league.lower() in p_league) or (self.league.lower() == p_sd) or (p.get("current_team_id") in target_team_ids)))
                match_c = bool(self.country and ((self.country.lower() in p_country) or (p.get("current_team_id") in target_team_ids)))

                if self.league and not match_l:
                    continue
                if self.country and not match_c:
                    continue

            if p.get("cz_id"):
                self.asignadas[p["cz_id"]] = p["id"]
            if p["id"] not in con_stats:
                continue
            if p.get("fm_team_name") == en.RETIRADA or re.search(r"\btrialist\b", p.get("name") or "", re.I):
                continue
            hecho = p.get("cz_updated_at")
            if hecho and datetime.fromisoformat(hecho.replace("Z", "+00:00")) >= limite:
                continue
            faltan = _faltan(p, con_traspasos)
            # Solo merece la pena si falta algo importante (los fichajes solos no justifican la visita)
            if faltan and faltan != ["transfers"]:
                pendientes.append((p, faltan))
        # Primero las que no tienen foto
        pendientes.sort(key=lambda t: ("photo_url" not in t[1], -len(t[1])))
        if self.limit:
            pendientes = pendientes[:self.limit]
        logger.info(f"ceroacero (coche escoba): {len(pendientes)} jugadoras con huecos")

        try:
            for p, faltan in pendientes:
                if self.fin and time.time() > self.fin:
                    logger.info("  Tiempo máximo alcanzado: se continúa en la próxima ejecución")
                    break
                club = (p.get("fm_team_name") or equipos.get(p.get("current_team_id"))
                        or equipos.get(ultimo_equipo.get(p["id"])))
                try:
                    self._procesar(p, club, faltan)
                except BloqueadoError:
                    raise
                except Exception as e:
                    logger.exception(f"  Error con {p['name']}: {e}")
        except BloqueadoError as e:
            logger.warning(f"  {e}: se para aquí y se continúa en la próxima ejecución")
        finally:
            self._flush()
        logger.info(f"ceroacero completado: {self.totales} ({self.cz.peticiones} peticiones)")


def main():
    parser = argparse.ArgumentParser(description="Coche escoba: rellena huecos de las jugadoras con ceroacero.es")
    parser.add_argument("--league", type=str, default=None, help="Filtrar por nombre o código de liga")
    parser.add_argument("--country", type=str, default=None, help="Filtrar por país de la liga, equipo o jugadora")
    parser.add_argument("--limit", type=int, default=None, help="Máximo de jugadoras a revisar")
    parser.add_argument("--refresh-days", type=int, default=30,
                        help="No volver a revisar una jugadora hasta pasados N días (por defecto 30)")
    parser.add_argument("--max-minutos", type=float, default=None, help="Parar tras N minutos (reanudable)")
    parser.add_argument("--prueba", action="store_true", help="Lee la BD pero no escribe: muestra lo que rellenaría")
    args = parser.parse_args()
    CeroaceroSync(args.refresh_days, args.limit, args.max_minutos, args.prueba, args.league, args.country).run()
    sys.exit(0)


if __name__ == "__main__":
    main()
