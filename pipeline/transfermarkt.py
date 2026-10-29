#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pipeline/transfermarkt.py
Enriquecimiento de jugadores con Transfermarkt (API no oficial felipeall/transfermarkt-api).

La API se levanta en local (repo ../transfermarkt-api):
    cd ../transfermarkt-api && python3 -m uvicorn app.main:app --port 8000
y este paso se ejecuta aparte del pipeline semanal:
    python -m pipeline.transfermarkt [--comp-id X] [--limit N] [--refresh-days 30]

1. Cada equipo de BD se empareja con su club Transfermarkt (búsqueda por nombre + país de la liga).
2. Cada jugador se empareja con la plantilla del club por fecha de nacimiento + nombre
   (mismo criterio que las fotos FotMob). Sin equipo emparejado: búsqueda por nombre + edad.
3. Por jugador emparejado: perfil, evolución del valor de mercado, traspasos y lesiones.
4. Supabase: completa players (pie, altura, nacimiento, contrato, agente, valor) sin pisar Opta,
   sube la foto si no tenía y rellena player_market_values / player_transfers / player_injuries.

Las respuestas se guardan en .cache/transfermarkt (JSON) para no repetir peticiones; los no
emparejados quedan en .cache/transfermarkt/sin_emparejar.csv para revisarlos a mano.
"""

import argparse
import csv
import hashlib
import json
import logging
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import quote

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / '.env')
except ImportError:
    pass

import requests
from rapidfuzz import fuzz

from .config import BUCKET_PLAYER_PHOTOS, COMPETITIONS_CONFIG, LOCAL_CACHE_DIR
from .photos import HEADERS, emparejar_jugador, normalizar, normalizar_club
from .storage import Store, get_supabase_client

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger("Transfermarkt")

TM_API_URL = os.environ.get("TM_API_URL", "http://localhost:8000").rstrip("/")
TM_CACHE_DIR = Path(LOCAL_CACHE_DIR) / "transfermarkt"
PAUSA = float(os.environ.get("TM_PAUSA", "2.5"))  # segundos entre peticiones reales (Transfermarkt bloquea ráfagas)
LOTE = 25  # se persiste en BD cada N jugadores (reanudable: tm_updated_at marca los hechos)
RESERVAS = (" ii", " b", " u17", " u18", " u19", " u20", " u21", " u23", " youth", " reserves", " juvenil")
# Países de config → nombre que usa Transfermarkt
PAIS_TM = {"USA": "United States", "England": "England"}
FOOT = {"left": "left", "right": "right", "both": "both"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class TMClient:
    """Cliente de la API local con caché JSON en disco y pausa entre peticiones reales."""

    def __init__(self, cache_days: int = 30):
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
        self.cache_days = cache_days
        self.peticiones = 0
        self.bloqueos = 0  # 403/405 seguidos
        self.bloqueado = False  # CAPTCHA de AWS WAF: no se vuelve a llamar en esta ejecución
        TM_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    def _cache_file(self, path: str) -> Path:
        return TM_CACHE_DIR / (hashlib.md5(path.encode()).hexdigest() + ".json")

    def get(self, path: str, max_age_days: Optional[int] = None) -> Optional[Dict[str, Any]]:
        f = self._cache_file(path)
        max_age = self.cache_days if max_age_days is None else max_age_days
        if f.exists() and time.time() - f.stat().st_mtime < max_age * 86400:
            return json.loads(f.read_text())
        if self.bloqueado:
            return None
        for intento in range(2):
            try:
                r = self.session.get(TM_API_URL + path, timeout=60)
                self.peticiones += 1
                time.sleep(PAUSA)
                if r.status_code in (403, 405, 429):
                    self.bloqueos += 1
                    if self.bloqueos >= 5:
                        logger.warning("  Transfermarkt ha bloqueado la IP (CAPTCHA). Se sigue solo con el dataset; "
                                       "lo que falte se reintentará en la próxima ejecución (espera unas horas)")
                        self.bloqueado = True
                    else:
                        logger.warning(f"  TM 403 en {path}: se salta")
                    return None
                self.bloqueos = 0
                if r.status_code == 200:
                    data = r.json()
                    f.write_text(json.dumps(data))
                    return data
                if r.status_code < 500 or intento >= 1:  # 4xx o 5xx repetido: se salta
                    logger.warning(f"  TM {r.status_code} en {path}: se salta")
                    return None
                logger.warning(f"  TM {r.status_code} en {path}: reintento")
            except requests.RequestException as e:
                logger.warning(f"  TM error en {path}: {e}")
            time.sleep(10)
        return None

    def image(self, url: str) -> Optional[bytes]:
        try:
            r = self.session.get(url, timeout=30)
            if r.status_code == 200 and r.headers.get("content-type", "").startswith("image"):
                return r.content
        except requests.RequestException:
            pass
        return None

    def ping(self) -> bool:
        try:
            return self.session.get(TM_API_URL + "/openapi.json", timeout=10).status_code == 200
        except requests.RequestException:
            return False


# ── Emparejamiento ─────────────────────────────────────────
def emparejar_club(tm: TMClient, team: Dict[str, Any], pais: Optional[str]) -> Optional[Dict[str, Any]]:
    """Mejor club Transfermarkt para un equipo de BD: mismo país, sin filiales, nombre parecido."""
    nombres = {normalizar_club(team.get("name")), normalizar_club(team.get("short_name"))} - {""}
    candidatos = []
    # También sin diacríticos: Transfermarkt indexa "Zaglebie Lubin", no "Zagłębie Lubin"
    for q in {team.get("name"), team.get("short_name"), normalizar(team.get("name"))} - {None, ""}:
        res = tm.get(f"/clubs/search/{quote(q)}") or {}
        for c in res.get("results", []):
            nom = " " + normalizar(c.get("name"))
            if any(nom.endswith(s) for s in RESERVAS) and not any(normalizar(team["name"]).endswith(s.strip()) for s in RESERVAS):
                continue
            if (c.get("squad") or 0) < 11:  # equipos fantasma / sin plantilla
                continue
            if pais and c.get("country") and c["country"] != PAIS_TM.get(pais, pais):
                continue
            score = max((fuzz.token_set_ratio(n, normalizar_club(c.get("name"))) for n in nombres), default=0)
            # Desempate: nombre completo parecido ("Hertha BSC" ≠ "Hertha 03 Zehlendorf") y mayor valor de plantilla
            exacto = fuzz.ratio(normalizar(team.get("name")), normalizar(c.get("name")))
            candidatos.append((score, exacto, c.get("marketValue") or 0, c))
    if not candidatos:
        return None
    score, _, _, mejor = max(candidatos, key=lambda x: x[:3])
    return mejor if score >= 70 else None


def _edad(dob: Optional[str]) -> Optional[int]:
    if not dob:
        return None
    try:
        d = date.fromisoformat(str(dob)[:10])
    except ValueError:
        return None
    hoy = date.today()
    return hoy.year - d.year - ((hoy.month, hoy.day) < (d.month, d.day))


def buscar_jugador(tm: TMClient, player: Dict[str, Any]) -> Optional[str]:
    """Respaldo sin club: búsqueda por nombre; solo se acepta con nombre casi igual y misma edad (±1)."""
    edad = _edad(player.get("birth_date"))
    if edad is None:
        return None
    res = tm.get(f"/players/search/{quote(player['name'])}") or {}
    nombre = normalizar(player["name"])
    validos = [r for r in res.get("results", [])
               if fuzz.token_set_ratio(nombre, normalizar(r.get("name"))) >= 90
               and r.get("age") is not None and abs(int(r["age"]) - edad) <= 1]
    return validos[0]["id"] if len(validos) == 1 else None


# ── Detalle por jugador ────────────────────────────────────
def _fecha(v: Any) -> Optional[str]:
    if not v:
        return None
    try:
        return date.fromisoformat(str(v)[:10]).isoformat()
    except ValueError:
        return None


def detalle_jugador(tm: TMClient, tm_id: str, squad_row: Optional[Dict[str, Any]], max_age: int) -> Dict[str, Any]:
    profile = tm.get(f"/players/{tm_id}/profile", max_age) or {}
    mv = tm.get(f"/players/{tm_id}/market_value", max_age) or {}
    transfers = tm.get(f"/players/{tm_id}/transfers", max_age) or {}
    injuries = lesiones_api(tm, tm_id, max_age)
    return {"profile": profile, "market_value": mv, "transfers": transfers.get("transfers", []),
            "injuries": injuries, "squad": squad_row or {}}


def filas_jugador(p: Dict[str, Any], tm_id: str, d: Dict[str, Any], ts: str) -> Dict[str, List[Dict[str, Any]]]:
    prof, sq, mv = d["profile"], d["squad"], d["market_value"]
    pos = prof.get("position") or {}
    club = prof.get("club") or {}
    row: Dict[str, Any] = {
        "id": p["id"], "name": p["name"], "tm_id": int(tm_id), "tm_updated_at": ts,
        "tm_url": prof.get("url"),
        "tm_position_main": pos.get("main"),
        "tm_positions_other": pos.get("other") or None,
        "citizenship": prof.get("citizenship") or sq.get("nationality") or None,
        "contract_expires": _fecha(club.get("contractExpires") or sq.get("contract")),
        "joined_on": _fecha(club.get("joined") or sq.get("joinedOn")),
        "agent": (prof.get("agent") or {}).get("name"),
    }
    valor = mv.get("marketValue") or prof.get("marketValue") or sq.get("marketValue")
    if valor:
        row["market_value"] = int(valor)
        hist = mv.get("marketValueHistory") or []
        if hist:
            row["market_value_updated_at"] = _fecha(hist[-1].get("date"))
    # Opta manda: solo se completan los huecos
    if not p.get("height") and (prof.get("height") or sq.get("height")):
        row["height"] = int(prof.get("height") or sq.get("height"))
    if not p.get("preferred_foot") and FOOT.get(str(prof.get("foot") or sq.get("foot") or "").lower()):
        row["preferred_foot"] = FOOT[str(prof.get("foot") or sq.get("foot")).lower()]
    if not p.get("birth_date") and _fecha(prof.get("dateOfBirth") or sq.get("dateOfBirth")):
        row["birth_date"] = _fecha(prof.get("dateOfBirth") or sq.get("dateOfBirth"))
    lugar = prof.get("placeOfBirth") or {}
    if not p.get("place_of_birth") and lugar.get("city"):
        row["place_of_birth"] = ", ".join(x for x in (lugar.get("city"), lugar.get("country")) if x)
    row = {k: v for k, v in row.items() if v is not None}

    valores = {}
    for h in mv.get("marketValueHistory") or []:
        f = _fecha(h.get("date"))
        if f:
            valores[f] = {"player_id": p["id"], "date": f, "market_value": h.get("marketValue"),
                          "club_name": h.get("clubName"), "tm_club_id": int(h["clubId"]) if h.get("clubId") else None,
                          "age": h.get("age")}
    traspasos = [{
        "tm_transfer_id": int(t["id"]), "player_id": p["id"], "date": _fecha(t.get("date")), "season": t.get("season"),
        "club_from": (t.get("clubFrom") or {}).get("name"),
        "tm_club_from_id": int(t["clubFrom"]["id"]) if (t.get("clubFrom") or {}).get("id") else None,
        "club_to": (t.get("clubTo") or {}).get("name"),
        "tm_club_to_id": int(t["clubTo"]["id"]) if (t.get("clubTo") or {}).get("id") else None,
        "fee": t.get("fee"), "market_value": t.get("marketValue"), "upcoming": bool(t.get("upcoming")),
    } for t in d["transfers"] if t.get("id")]
    lesiones = {}
    for i in d["injuries"]:
        f = _fecha(i.get("fromDate"))
        if f and i.get("injury"):
            lesiones[(f, i["injury"])] = {
                "player_id": p["id"], "from_date": f, "injury": i["injury"][:150], "season": i.get("season"),
                "until_date": _fecha(i.get("untilDate")), "days": i.get("days"), "games_missed": i.get("gamesMissed"),
            }
    return {"players": [row], "player_market_values": list(valores.values()),
            "player_transfers": traspasos, "player_injuries": list(lesiones.values())}


# ── Dataset dcaribou/transfermarkt-datasets (CSV semanal, sin peticiones a Transfermarkt) ──
DATASET_URL = "https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/{}.csv.gz"
DATASET_DIR = Path(LOCAL_CACHE_DIR) / "tm_dataset"


class TMDataset:
    """Jugadores, valoraciones y traspasos de las ligas que cubre el dataset (~primeras divisiones)."""

    def __init__(self, max_age_days: int = 7):
        import pandas as pd
        DATASET_DIR.mkdir(parents=True, exist_ok=True)
        for nombre in ("players", "player_valuations", "transfers"):
            f = DATASET_DIR / f"{nombre}.csv.gz"
            if not f.exists() or time.time() - f.stat().st_mtime > max_age_days * 86400:
                logger.info(f"Descargando dataset {nombre}…")
                r = requests.get(DATASET_URL.format(nombre), timeout=300)
                r.raise_for_status()
                f.write_bytes(r.content)
        self.players = pd.read_csv(DATASET_DIR / "players.csv.gz", dtype={"player_id": str, "current_club_id": str})
        self.players["dob"] = self.players["date_of_birth"].astype(str).str[:10]
        self.players["norm"] = self.players["name"].map(normalizar)
        self.por_dob = {k: g for k, g in self.players.groupby("dob")}
        self.por_id = self.players.set_index("player_id")
        self.valores = {k: g for k, g in pd.read_csv(DATASET_DIR / "player_valuations.csv.gz",
                                                    dtype={"player_id": str, "current_club_id": str}).groupby("player_id")}
        self.traspasos = {k: g for k, g in pd.read_csv(DATASET_DIR / "transfers.csv.gz",
                                                      dtype={"player_id": str, "from_club_id": str, "to_club_id": str}).groupby("player_id")}
        logger.info(f"Dataset Transfermarkt: {len(self.players)} jugadores")

    def emparejar(self, player: Dict[str, Any]) -> Optional[str]:
        """Misma fecha de nacimiento + nombre parecido, sin empates."""
        g = self.por_dob.get(str(player.get("birth_date") or ""))
        if g is None:
            return None
        nombre = normalizar(player.get("name"))
        sims = sorted(((fuzz.token_set_ratio(nombre, n), pid) for n, pid in zip(g["norm"], g["player_id"])), reverse=True)
        if not sims or sims[0][0] < 70 or (len(sims) > 1 and sims[1][0] == sims[0][0]):
            return None
        return sims[0][1]

    def detalle(self, tm_id: str) -> Optional[Dict[str, Any]]:
        """Mismo formato que la API (profile / market_value / transfers) para reutilizar filas_jugador."""
        if tm_id not in self.por_id.index:
            return None
        r = self.por_id.loc[tm_id]
        v = lambda k: None if pd_isna(r.get(k)) else r.get(k)
        profile = {
            "url": v("url"), "imageUrl": v("image_url"), "height": v("height_in_cm"), "foot": v("foot"),
            "dateOfBirth": v("dob"), "citizenship": [v("country_of_citizenship")] if v("country_of_citizenship") else None,
            "placeOfBirth": {"city": (v("city_of_birth") or "").strip() or None, "country": v("country_of_birth")},
            "position": {"main": v("sub_position") or v("position")}, "agent": {"name": v("agent_name")},
            "club": {"contractExpires": v("contract_expiration_date")}, "marketValue": v("market_value_in_eur"),
        }
        hist = []
        if tm_id in self.valores:
            for h in self.valores[tm_id].sort_values("date").itertuples():
                hist.append({"date": h.date, "marketValue": int(h.market_value_in_eur), "clubName": h.current_club_name,
                             "clubId": h.current_club_id})
        traspasos = []
        if tm_id in self.traspasos:
            hoy = date.today().isoformat()
            for t in self.traspasos[tm_id].itertuples():
                # El dataset no trae ID de traspaso: ID negativo estable para no chocar con los de la API
                clave = f"{tm_id}|{t.transfer_date}|{t.from_club_id}|{t.to_club_id}"
                tid = -int(hashlib.md5(clave.encode()).hexdigest()[:15], 16)
                fee = None if pd_isna(t.transfer_fee) or not t.transfer_fee else int(t.transfer_fee)
                mv = None if pd_isna(t.market_value_in_eur) else int(t.market_value_in_eur)
                traspasos.append({"id": str(tid), "date": t.transfer_date, "season": t.transfer_season,
                                  "clubFrom": {"id": t.from_club_id, "name": t.from_club_name},
                                  "clubTo": {"id": t.to_club_id, "name": t.to_club_name},
                                  "fee": fee, "marketValue": mv, "upcoming": str(t.transfer_date) > hoy})
        return {"profile": profile, "market_value": {"marketValue": v("market_value_in_eur"), "marketValueHistory": hist},
                "transfers": traspasos}


def pd_isna(x: Any) -> bool:
    try:
        return x is None or bool(x != x)
    except (TypeError, ValueError):
        return False


def lesiones_api(tm: TMClient, tm_id: str, max_age: int) -> Optional[List[Dict[str, Any]]]:
    """None si alguna página falla (bloqueo): así el jugador se reintenta en la próxima ejecución."""
    injuries: List[Dict[str, Any]] = []
    page, last = 1, 1
    while page <= last:
        inj = tm.get(f"/players/{tm_id}/injuries?page_number={page}", max_age)
        if inj is None:
            return None
        injuries += inj.get("injuries", [])
        last = int(inj.get("lastPageNumber") or 1)
        page += 1
    return injuries


# ── Orquestación ───────────────────────────────────────────
class TransfermarktSync:
    def __init__(self, refresh_days: Optional[int] = None, limit: Optional[int] = None, refresh_photos: bool = False):
        self.store = Store(get_supabase_client())
        self.tm = TMClient(cache_days=refresh_days or 30)
        self.dataset = TMDataset()
        self.refresh_days = refresh_days
        self.limit = limit
        self.refresh_photos = refresh_photos
        self.pendiente: Dict[str, List[Dict[str, Any]]] = {}
        self.sin_emparejar: List[Dict[str, Any]] = []
        self.totales = {"dataset": 0, "emparejados": 0, "detalle": 0, "fotos": 0, "sin_emparejar": 0}

    def _flush(self):
        players = self.pendiente.pop("players", [])
        por_claves: Dict[tuple, List[Dict[str, Any]]] = {}
        for r in players:
            por_claves.setdefault(tuple(sorted(r)), []).append(r)
        for grupo in por_claves.values():
            self.store.upsert("players", grupo)
        for table, pk in (("player_market_values", "player_id,date"), ("player_transfers", "tm_transfer_id"),
                          ("player_injuries", "player_id,from_date,injury")):
            rows = self.pendiente.pop(table, [])
            if rows:
                self.store.upsert(table, rows, on_conflict=pk)

    def _foto(self, p: Dict[str, Any], prof: Dict[str, Any]) -> Optional[str]:
        url = prof.get("imageUrl")
        if not url or "default" in url or (p.get("photo_url") and not self.refresh_photos):
            return None
        img = self.tm.image(url)
        return self.store.upload(BUCKET_PLAYER_PHOTOS, f"{p['id']}.jpg", img, "image/jpeg") if img else None

    def _procesar_jugador(self, p: Dict[str, Any], tm_id: str, squad_row: Optional[Dict[str, Any]]):
        max_age = self.refresh_days or 30
        d = self.dataset.detalle(tm_id)
        if d:  # dataset: solo las lesiones salen de la API
            d.update(injuries=lesiones_api(self.tm, tm_id, max_age), squad=squad_row or {})
            # Sin foto en el dataset (puede estar desfasado): se mira el perfil actual
            if "default" in str(d["profile"].get("imageUrl")) and not p.get("photo_url"):
                prof = self.tm.get(f"/players/{tm_id}/profile", max_age) or {}
                if prof.get("imageUrl"):
                    d["profile"]["imageUrl"] = prof["imageUrl"]
            self.totales["dataset"] += 1
        else:
            d = detalle_jugador(self.tm, tm_id, squad_row, max_age)
        if not d["profile"]:  # bloqueado o sin respuesta: se salta y se reintenta en la próxima ejecución
            logger.info(f"  Sin perfil para {p['name']} (TM {tm_id}): se salta")
            return
        sin_lesiones = d["injuries"] is None
        d["injuries"] = d["injuries"] or []
        filas = filas_jugador(p, tm_id, d, now_iso())
        if sin_lesiones:  # se guarda el resto, pero sin marcar como hecho
            filas["players"][0].pop("tm_updated_at", None)
        foto = self._foto(p, d["profile"])
        if foto:
            filas["players"][0].update(photo_url=foto, photo_updated_at=now_iso())
            self.totales["fotos"] += 1
        for k, v in filas.items():
            self.pendiente.setdefault(k, []).extend(v)
        self.totales["detalle"] += 1
        if self.totales["detalle"] % LOTE == 0:
            self._flush()
            logger.info(f"  {self.totales['detalle']} jugadores guardados ({self.tm.peticiones} peticiones TM)")

    def _al_dia(self, p: Dict[str, Any]) -> bool:
        ts = p.get("tm_updated_at")
        if not ts:
            return False
        if self.refresh_days is None:  # por defecto, un jugador ya procesado no se repite nunca
            return True
        return datetime.fromisoformat(ts.replace("Z", "+00:00")) > datetime.now(timezone.utc) - timedelta(days=self.refresh_days)

    def run(self, target_comp_id: Optional[str] = None) -> bool:
        if not self.tm.ping():
            logger.error(f"La API de Transfermarkt no responde en {TM_API_URL}. Arráncala con:\n"
                         "  cd ../transfermarkt-api && python3 -m uvicorn app.main:app --port 8000")
            return False
        self.store.ensure_bucket(BUCKET_PLAYER_PHOTOS)
        paises = {c["id"]: c["country"] for c in COMPETITIONS_CONFIG}
        teams = self.store.select_all("teams", "id,name,short_name,competition_id,tm_id")
        if target_comp_id:
            teams = [t for t in teams if t.get("competition_id") == target_comp_id]
        players = self.store.select_all(
            "players", "id,name,birth_date,current_team_id,photo_url,height,preferred_foot,place_of_birth,tm_id,tm_updated_at")
        tm_usados = {str(p["tm_id"]) for p in players if p.get("tm_id")}
        por_equipo: Dict[str, List[Dict[str, Any]]] = {}
        for p in players:
            por_equipo.setdefault(p.get("current_team_id") or "", []).append(p)
        team_ids = {t["id"] for t in teams}
        logger.info(f"{len(teams)} equipos y {sum(len(por_equipo.get(t, [])) for t in team_ids)} jugadores a revisar")

        procesados = 0
        for n, team in enumerate(teams, 1):
            jugadores = [p for p in por_equipo.get(team["id"], []) if not self._al_dia(p)]
            if not jugadores:
                continue
            if self.limit and procesados >= self.limit:
                break
            # 1º el dataset; el club y su plantilla solo se piden para los que no estén
            previos = {p["id"]: (str(p["tm_id"]) if p.get("tm_id") else self.dataset.emparejar(p)) for p in jugadores}
            tm_club_id = team.get("tm_id")
            if not tm_club_id and not all(previos.values()):
                club = emparejar_club(self.tm, team, paises.get(team.get("competition_id")))
                if club:
                    tm_club_id = int(club["id"])
                    self.store.upsert("teams", [{"id": team["id"], "name": team["name"], "tm_id": tm_club_id}])
            logger.info(f"[{n}/{len(teams)}] {team['name']} → TM {tm_club_id or 'sin emparejar'} ({len(jugadores)} jugadores)")
            faltan = not all(previos.values())
            squad = (self.tm.get(f"/clubs/{tm_club_id}/players", 7) or {}).get("players", []) if tm_club_id and faltan else []
            usados = set()
            for p in jugadores:
                if self.limit and procesados >= self.limit:
                    break
                tm_id, squad_row = previos[p["id"]], None
                if not tm_id:
                    m = emparejar_jugador(p, [s for s in squad if s["id"] not in usados])
                    if m:
                        tm_id, squad_row = m["id"], m
                    else:
                        tm_id = buscar_jugador(self.tm, p)
                else:
                    squad_row = next((s for s in squad if s["id"] == tm_id), None)
                if tm_id and not p.get("tm_id") and tm_id in tm_usados:  # ya asignado a otro jugador (duplicado)
                    tm_id = None
                if not tm_id:
                    self.sin_emparejar.append({"player_id": p["id"], "name": p["name"], "birth_date": p.get("birth_date"),
                                               "team": team["name"], "tm_club_id": tm_club_id})
                    continue
                usados.add(tm_id)
                tm_usados.add(tm_id)
                self.totales["emparejados"] += 1
                try:
                    self._procesar_jugador(p, tm_id, squad_row)
                except Exception as e:
                    logger.warning(f"  Error con {p['name']} (TM {tm_id}): {e}")
                procesados += 1
        self._flush()
        self._guardar_sin_emparejar()
        self.totales["sin_emparejar"] = len(self.sin_emparejar)
        logger.info(f"Transfermarkt OK: {self.totales} · {self.tm.peticiones} peticiones")
        return True

    def _guardar_sin_emparejar(self):
        if not self.sin_emparejar:
            return
        f = TM_CACHE_DIR / "sin_emparejar.csv"
        with open(f, "w", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=list(self.sin_emparejar[0]))
            w.writeheader()
            w.writerows(self.sin_emparejar)
        logger.info(f"{len(self.sin_emparejar)} jugadores sin emparejar → {f}")


def main():
    parser = argparse.ArgumentParser(description="Enriquecer jugadores con Transfermarkt")
    parser.add_argument("--comp-id", type=str, default=None, help="Solo los equipos de esta competición")
    parser.add_argument("--limit", type=int, default=None, help="Máximo de jugadores a procesar (pruebas)")
    parser.add_argument("--refresh-days", type=int, default=None,
                        help="Repetir jugadores actualizados hace más de N días (por defecto no se repiten nunca)")
    parser.add_argument("--refresh-photos", action="store_true", help="Sustituir también fotos ya existentes")
    args = parser.parse_args()
    ok = TransfermarktSync(refresh_days=args.refresh_days, limit=args.limit,
                           refresh_photos=args.refresh_photos).run(args.comp_id)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
