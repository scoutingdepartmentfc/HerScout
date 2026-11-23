"""
pipeline/wyscout_excel.py
Importa una liga manualmente desde un Excel exportado de Wyscout:
1. Lee datos personales y métricas por 90 / totales de cada jugadora.
2. Mapea las columnas de Wyscout a las métricas del sistema y calcula el rating Opta-style
   (nota_global, notas por categoría, score_*, percentile_*, radar_data) con `puntuar_temporada`.
3. Descarga nombres oficiales y escudos de equipos desde ESPN (ej. usa.ncaa.w.1).
4. Busca fotos de jugadoras en FotMob, 365scores y ceroacero (opcional, en paralelo).
5. Guarda competición, temporada, equipos, jugadoras y player_season_stats en Supabase.

Uso:
    python -m pipeline.wyscout_excel --file path.xlsx --league "NCAA Ivy League" \
        --country "USA" --season "2026" --espn-url "https://www.espn.com/soccer/teams/_/league/usa.ncaa.w.1"
"""

import argparse
import hashlib
import io
import json
import logging
import re
import threading
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import openpyxl
import pandas as pd
import requests
from PIL import Image, ImageFilter
from rapidfuzz import fuzz

from .ceroacero import CZClient, confirmar as cz_confirmar, _es_placeholder as cz_es_placeholder
from .config import BUCKET_PLAYER_PHOTOS, NOTA_MEDIA_LIGA
from .fotos_365 import sin_fondo, subir_foto as subir_foto_365
from .photos import FotMobClient, normalizar, normalizar_club, sim_nombre, variantes_nombre
from .positions import get_grupo_demarcacion
from .scoring import puntuar_temporada
from .sidearm import fetch_sidearm_roster, match_sidearm_player, resolve_sidearm_domain
from .storage import Store, get_supabase_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("wyscout_excel")

# Mapeo de códigos de posición de Wyscout -> las 11 demarcaciones estándar de HerScout
WYSCOUT_POS_MAP: Dict[str, str] = {
    "GK": "Portero",
    "RB": "Lateral Derecho",
    "RB5": "Lateral Derecho",
    "RWB": "Lateral Derecho",
    "LB": "Lateral Izquierdo",
    "LB5": "Lateral Izquierdo",
    "LWB": "Lateral Izquierdo",
    "RCB": "Central Derecho",
    "RCB3": "Central Derecho",
    "CB": "Central Derecho",
    "LCB": "Central Izquierdo",
    "LCB3": "Central Izquierdo",
    "DMF": "Mediocentro Defensivo",
    "LDMF": "Mediocentro Defensivo",
    "RDMF": "Mediocentro Defensivo",
    "CMF": "Mediocentro",
    "LCMF": "Mediocentro",
    "RCMF": "Mediocentro",
    "AMF": "Mediapunta",
    "LAMF": "Mediapunta",
    "RAMF": "Mediapunta",
    "RW": "Extremo Derecho",
    "RWF": "Extremo Derecho",
    "LW": "Extremo Izquierdo",
    "LWF": "Extremo Izquierdo",
    "CF": "Delantero",
    "SS": "Delantero",
}


def slugify(text: str) -> str:
    s = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode("ascii").lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "manual"


def _num(val: Any, default: float = 0.0) -> float:
    if val is None or val == "":
        return default
    try:
        v = float(val)
        return default if np.isnan(v) else v
    except (TypeError, ValueError):
        return default


def _int_or_none(val: Any) -> Optional[int]:
    v = _num(val, -1.0)
    return int(round(v)) if v > 0 else None


def map_wyscout_position(raw_pos: Any) -> Tuple[str, str]:
    """Toma la primera posición de Wyscout (ej. 'RCB, RB') -> (demarcacion, grupo_demarcacion)."""
    parts = [p.strip().upper() for p in str(raw_pos or "").split(",") if p.strip()]
    for code in parts:
        if code in WYSCOUT_POS_MAP:
            dem = WYSCOUT_POS_MAP[code]
            return dem, get_grupo_demarcacion(dem)
    return "Mediocentro", "Medios"


def extract_espn_league_slug(url_or_slug: str) -> Optional[str]:
    s = str(url_or_slug or "").strip()
    if not s:
        return None
    m = re.search(r"/league/([a-z0-9._-]+)", s, re.I)
    if m:
        return m.group(1)
    if re.fullmatch(r"[a-z0-9._-]+", s, re.I) and "." in s:
        return s
    return None


def fetch_espn_teams(espn_url: str) -> List[Dict[str, str]]:
    """Obtiene {name, short_name, badge_url} de todos los equipos de la liga en ESPN."""
    slug = extract_espn_league_slug(espn_url)
    if not slug:
        return []
    teams: List[Dict[str, str]] = []
    api_url = f"https://site.api.espn.com/apis/site/v2/sports/soccer/{slug}/teams?limit=500"
    try:
        r = requests.get(api_url, headers={"User-Agent": "Mozilla/5.0"}, timeout=20)
        if r.status_code == 200:
            data = r.json()
            for item in data.get("sports", [{}])[0].get("leagues", [{}])[0].get("teams", []):
                t = item.get("team") or {}
                name = str(t.get("displayName") or t.get("name") or "").strip()
                if not name:
                    continue
                logos = t.get("logos") or []
                badge = logos[0].get("href") if logos else None
                teams.append({
                    "name": name,
                    "short_name": str(t.get("shortDisplayName") or t.get("abbreviation") or name).strip(),
                    "badge_url": badge or "",
                })
            if teams:
                logger.info(f"ESPN API ({slug}): {len(teams)} equipos obtenidos.")
                return teams
    except Exception as e:
        logger.warning(f"ESPN API falló para {slug}: {e}")

    # Fallback HTML scraping de <section class="TeamLinks...">
    try:
        page_url = f"https://www.espn.com/soccer/teams/_/league/{slug}"
        r = requests.get(page_url, headers={"User-Agent": "Mozilla/5.0"}, timeout=20)
        if r.status_code == 200:
            matches = re.findall(
                r'<section class="TeamLinks[^"]*"[^>]*>.*?<img[^>]+alt="([^"]+)"[^>]*>.*?<h2[^>]*>([^<]+)</h2>',
                r.text,
                re.S,
            )
            for alt, h2 in matches:
                name = (h2 or alt).strip()
                if name:
                    teams.append({"name": name, "short_name": name, "badge_url": ""})
    except Exception as e:
        logger.warning(f"ESPN HTML fallback falló: {e}")
    return teams


def match_espn_team(team_name: str, espn_teams: List[Dict[str, str]]) -> Optional[Dict[str, str]]:
    if not espn_teams or not team_name:
        return None
    norm = normalizar_club(team_name)
    best: Optional[Dict[str, str]] = None
    best_score = 0.0
    for et in espn_teams:
        et_norm = normalizar_club(et["name"])
        if norm == et_norm:
            return et
        score = max(
            fuzz.token_set_ratio(norm, et_norm),
            fuzz.ratio(norm, et_norm),
        )
        if score > best_score:
            best_score = score
            best = et
    return best if best_score >= 78 else None


def read_wyscout_excel(path: str) -> List[Dict[str, Any]]:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)
    header = [str(c).strip() if c is not None else "" for c in next(rows_iter)]
    records: List[Dict[str, Any]] = []
    for row in rows_iter:
        if not row or not row[0]:
            continue
        rec = {header[i]: row[i] for i in range(min(len(header), len(row))) if header[i]}
        if str(rec.get("Player") or "").strip():
            records.append(rec)
    wb.close()
    return records


def build_metric_row(rec: Dict[str, Any], player_id: str, team_id: str) -> Dict[str, Any]:
    """Convierte una fila del Excel de Wyscout en el formato de entrada de `puntuar_temporada`."""
    dem, grupo = map_wyscout_position(rec.get("Position"))
    mins = max(_num(rec.get("Minutes played"), 0.0), 0.0)
    pj = int(round(_num(rec.get("Matches played"), 0.0)))
    m90 = mins / 90.0 if mins > 0 else 0.0

    # Totales / porcentajes
    passes_p90 = _num(rec.get("Passes per 90"))
    passes_pct = _num(rec.get("Accurate passes, %"))
    long_p90 = _num(rec.get("Long passes per 90"))
    long_pct = _num(rec.get("Accurate long passes, %"))
    prog_p90 = _num(rec.get("Progressive passes per 90"))
    prog_pct = _num(rec.get("Accurate progressive passes, %"))
    f3_p90 = _num(rec.get("Passes to final third per 90"))
    f3_pct = _num(rec.get("Accurate passes to final third, %"))
    crosses_p90 = _num(rec.get("Crosses per 90"))
    crosses_pct = _num(rec.get("Accurate crosses, %"))
    dribbles_p90 = _num(rec.get("Dribbles per 90"))
    dribbles_pct = _num(rec.get("Successful dribbles, %"))
    duels_p90 = _num(rec.get("Duels per 90"))
    duels_pct = _num(rec.get("Duels won, %"))
    def_duels_p90 = _num(rec.get("Defensive duels per 90"))
    def_duels_pct = _num(rec.get("Defensive duels won, %"))
    aerials_p90 = _num(rec.get("Aerial duels per 90"))
    aerials_pct = _num(rec.get("Aerial duels won, %"))
    through_p90 = _num(rec.get("Through passes per 90"))
    through_pct = _num(rec.get("Accurate through passes, %"))
    box_pass_p90 = _num(rec.get("Passes to penalty area per 90"))
    box_pass_pct = _num(rec.get("Accurate passes to penalty area, %"))

    yellow = _num(rec.get("Yellow cards"))
    red = _num(rec.get("Red cards"))
    pen_taken = _num(rec.get("Penalties taken"))

    row: Dict[str, Any] = {
        "player_id": player_id,
        "team_id": team_id,
        "demarcacion": dem,
        "grupo_demarcacion": grupo,
        "matches_played": pj,
        "minutes_played": int(round(mins)),
        # Ataque
        "of_goles_p90": _num(rec.get("Goals per 90")),
        "of_xG_p90": _num(rec.get("xG per 90")),
        "of_tiros_p90": _num(rec.get("Shots per 90")),
        "of_toques_area_rival_p90": _num(rec.get("Touches in box per 90")),
        "of_remates_cabeza_p90": _num(rec.get("Head goals per 90")),
        "of_goles_menos_xg_p90": _num(rec.get("Goals per 90")) - _num(rec.get("xG per 90")),
        "of_asistencias_p90": _num(rec.get("Assists per 90")),
        "of_xA_p90": _num(rec.get("xA per 90")),
        "of_pases_filtrados_p90": through_p90,
        "of_pases_filtrados_pct": through_pct,
        "of_entradas_area_p90": box_pass_p90,
        "of_entradas_area_pct": box_pass_pct,
        "of_centros_buenos_p90": crosses_p90 * (crosses_pct / 100.0),
        "of_centros_buenos_pct": crosses_pct,
        # Construcción
        "of_pases_buenos_p90": passes_p90 * (passes_pct / 100.0),
        "of_pases_pct": passes_pct,
        "of_pases_largos_p90": long_p90 * (long_pct / 100.0),
        "of_pases_largos_pct": long_pct,
        "of_progresivos_p90": prog_p90 * (prog_pct / 100.0),
        "of_progresivos_pct": prog_pct,
        "of_conducciones_progresivas_p90": _num(rec.get("Progressive runs per 90")),
        "of_pases_ultimo_tercio_p90": f3_p90 * (f3_pct / 100.0),
        "of_pases_ultimo_tercio_pct": f3_pct,
        "of_regates_p90": dribbles_p90 * (dribbles_pct / 100.0),
        "of_regates_pct": dribbles_pct,
        "of_faltas_recibidas_p90": _num(rec.get("Fouls suffered per 90")),
        # Defensa
        "def_intercepciones_p90": _num(rec.get("Interceptions per 90")),
        "def_duelos_ganados_p90": duels_p90 * (duels_pct / 100.0),
        "def_duelos_ganados_pct": duels_pct,
        "def_bloqueos_p90": _num(rec.get("Shots blocked per 90")),
        "def_entradas_p90": def_duels_p90 * (def_duels_pct / 100.0),
        "def_entradas_pct": def_duels_pct,
        "def_aereos_ganados_p90": aerials_p90 * (aerials_pct / 100.0),
        "def_aereos_ganados_pct": aerials_pct,
        # Balón parado
        "abp_lanzador_corner_p90": _num(rec.get("Corners per 90")),
        "abp_lanzador_faltas_dir_p90": _num(rec.get("Direct free kicks per 90")),
        "abp_faltas_lejanas_p90": _num(rec.get("Free kicks per 90")),
        "abp_lanzador_penaltis_p90": (pen_taken / m90) if m90 > 0 else 0.0,
        # Disponibilidad / disciplina
        "comp_minutos": mins,
        "disp_partidos": float(pj),
        "comp_disciplina_malus": ((yellow + 3.0 * red) / m90) if m90 > 0 else 0.0,
        # Columnas nativas player_season_stats
        "_goals_p90": _num(rec.get("Goals per 90")),
        "_assists_p90": _num(rec.get("Assists per 90")),
        "_xg_p90": _num(rec.get("xG per 90")),
        "_xa_p90": _num(rec.get("xA per 90")),
        "_passes_p90": passes_p90,
        "_passes_pct": passes_pct,
        "_progressive_passes_p90": prog_p90,
        "_takeons_p90": dribbles_p90,
        "_takeons_pct": dribbles_pct,
        "_tackles_p90": def_duels_p90,
        "_tackles_pct": def_duels_pct,
        "_interceptions_p90": _num(rec.get("Interceptions per 90")),
        "_aerials_p90": aerials_p90,
        "_aerials_pct": aerials_pct,
        "_heatmap": None,
        "_pases": None,
        "_demarcaciones": {dem: {"min": int(round(mins)), "pj": pj}},
    }

    if grupo == "Porteros":
        row.update({
            "def_goles_encajados_p90": _num(rec.get("Conceded goals per 90")),
            "def_xg_contra_p90": _num(rec.get("xG against per 90")),
            "def_paradas_pct": _num(rec.get("Save rate, %")),
            "def_goles_menos_xgc_p90": _num(rec.get("Prevented goals per 90")),
            "def_salidas_libero_p90": _num(rec.get("Exits per 90")),
        })

    return row


def _buscar_foto_fotmob(fotmob: FotMobClient, p: Dict[str, Any], club: str) -> Optional[Tuple[int, str]]:
    try:
        for q in variantes_nombre(p, busqueda=True)[:2]:
            res = fotmob._json("search/suggest", term=q, lang="en")
            if not res:
                continue
            for grupo in res if isinstance(res, list) else []:
                for item in grupo.get("suggestions", []):
                    if item.get("type") != "player":
                        continue
                    fid = item.get("id")
                    name = item.get("name") or ""
                    team = item.get("teamName") or ""
                    if not fid or sim_nombre(p, name) < 85:
                        continue
                    if club and team and fuzz.token_set_ratio(normalizar_club(club), normalizar_club(team)) < 65:
                        continue
                    url = f"https://images.fotmob.com/image_resources/playerimages/{fid}.png"
                    r = requests.head(url, timeout=10)
                    if r.status_code == 200:
                        return int(fid), url
    except Exception:
        pass
    return None


_REMBG_LOCK = threading.Lock()
_REMBG_SESSION = None


def _quitar_fondo(img: bytes) -> bytes:
    """Quita el fondo con alpha matting + erosión de 1 px para eliminar halos blancos/de color."""
    global _REMBG_SESSION
    try:
        from rembg import new_session, remove
        with _REMBG_LOCK:
            _REMBG_SESSION = _REMBG_SESSION or new_session("u2net_human_seg")
            try:
                out = remove(
                    img,
                    session=_REMBG_SESSION,
                    alpha_matting=True,
                    alpha_matting_foreground_threshold=245,
                    alpha_matting_background_threshold=20,
                    alpha_matting_erode_size=8,
                    post_process_mask=True,
                )
            except Exception:
                out = sin_fondo(img)
        im = Image.open(io.BytesIO(out)).convert("RGBA")
        alpha = im.split()[3].filter(ImageFilter.MinFilter(3))
        arr = np.array(im)
        a = np.array(alpha, dtype=np.uint8)
        a[a < 130] = 0
        arr[..., 3] = a
        buf = io.BytesIO()
        Image.fromarray(arr, "RGBA").save(buf, format="PNG")
        return buf.getvalue()
    except Exception as e:
        logger.warning(f"rembg falló, se sube foto original: {e}")
        return img


def _subir_sidearm_sin_fondo(store: Store, player_id: str, photo_url: str) -> Optional[str]:
    try:
        r = requests.get(photo_url, headers={"User-Agent": "Mozilla/5.0"}, timeout=20)
        if r.status_code != 200 or not r.content:
            return None
        clean_png = _quitar_fondo(r.content)
        return store.upload(BUCKET_PLAYER_PHOTOS, f"{player_id}_sa.png", clean_png, "image/png")
    except Exception as e:
        logger.warning(f"SIDEARM foto {player_id}: {e}")
        return None


def _buscar_foto_ceroacero(cz: CZClient, store: Store, p: Dict[str, Any], club: str) -> Optional[str]:
    try:
        for cand in cz.buscar(p["name"])[:4]:
            if sim_nombre(p, cand.get("nombre")) < 82:
                continue
            prof = cz.perfil(cand["slug"], cand["cz_id"])
            if not prof or not cz_confirmar(p, cand, prof, club):
                continue
            foto = prof.get("foto_url")
            if not foto or cz_es_placeholder(foto):
                continue
            img = cz.image(foto)
            if not img:
                continue
            clean_png = _quitar_fondo(img[0])
            return store.upload(BUCKET_PLAYER_PHOTOS, f"{p['id']}_cz.png", clean_png, "image/png")
    except Exception:
        pass
    return None


def _emit_progress(enabled: bool, pct: int, step: str, detail: str = "") -> None:
    if not enabled:
        return
    print(f"PROGRESS:{json.dumps({'pct': pct, 'step': step, 'detail': detail}, ensure_ascii=False)}", flush=True)


def import_wyscout_excel(
    file_path: str,
    league_name: str,
    conference: str = "",
    country: str = "United States",
    season_name: str = "2026",
    espn_url: str = "https://www.espn.com/soccer/teams/_/league/usa.ncaa.w.1",
    fetch_photos: bool = False,
    dry_run: bool = False,
    progress: bool = False,
) -> Dict[str, Any]:
    _emit_progress(progress, 5, "Leyendo archivo Excel", "Extrayendo jugadoras y métricas...")
    records = read_wyscout_excel(file_path)
    if not records:
        raise ValueError("El archivo Excel no contiene filas válidas de jugadoras.")

    if str(country or "").strip().upper() in ("USA", "US"):
        country = "United States"

    conf_clean = str(conference or "").strip()
    full_name = f"{league_name.strip()} - {conf_clean}" if conf_clean else league_name.strip()
    comp_slug = slugify(full_name)
    comp_id = f"wyscout-{comp_slug}"
    season_id = f"{comp_id}-{slugify(season_name)}"

    # 1. Equipos desde ESPN (escudos + nombres oficiales)
    _emit_progress(progress, 15, "Descargando escudos desde ESPN", f"{len(records)} filas leídas")
    espn_teams = fetch_espn_teams(espn_url) if espn_url else []
    raw_teams = sorted({
        str(r.get("Team within selected timeframe") or r.get("Team") or "").strip()
        for r in records
        if str(r.get("Team within selected timeframe") or r.get("Team") or "").strip()
    })

    team_map: Dict[str, Dict[str, Any]] = {}
    crests_matched = 0
    for tname in raw_teams:
        matched = match_espn_team(tname, espn_teams)
        official_name = matched["name"] if matched else tname
        badge_url = matched["badge_url"] if (matched and matched.get("badge_url")) else None
        if badge_url:
            crests_matched += 1
        tid = f"wyscout-t-{slugify(official_name)}"
        team_map[tname] = {
            "id": tid,
            "name": official_name,
            "short_name": matched["short_name"] if matched else tname,
            "country": country,
            "badge_url": badge_url,
            "competition_id": comp_id,
            "league_name": full_name,
        }

    # 2. Jugadoras y métricas
    now_iso = datetime.now(timezone.utc).isoformat()
    players_rows: List[Dict[str, Any]] = []
    metric_rows: List[Dict[str, Any]] = []
    seen_pids = set()

    for rec in records:
        pname = str(rec.get("Player") or "").strip()
        tname = str(rec.get("Team within selected timeframe") or rec.get("Team") or "").strip()
        tinfo = team_map.get(tname) or {"id": f"wyscout-t-{slugify(tname or 'unknown')}", "name": tname or "Unknown"}
        pid_hash = hashlib.md5(f"{comp_id}:{pname.lower()}:{tinfo['id']}".encode()).hexdigest()[:12]
        pid = f"wyscout-p-{pid_hash}"
        if pid in seen_pids:
            continue
        seen_pids.add(pid)

        dem, grupo = map_wyscout_position(rec.get("Position"))
        age = _int_or_none(rec.get("Age"))
        birth_date = f"{date.today().year - age}-01-01" if age else None
        p_country = str(rec.get("Passport country") or rec.get("Birth country") or country).split(",")[0].strip()

        players_rows.append({
            "id": pid,
            "sd_id": -int(pid_hash, 16),
            "name": pname,
            "match_name": pname,
            "country": p_country or None,
            "birth_date": birth_date,
            "height": _int_or_none(rec.get("Height")),
            "weight": _int_or_none(rec.get("Weight")),
            "primary_position": dem,
            "grupo_demarcacion": grupo,
            "current_team_id": tinfo["id"],
            "current_league_name": full_name,
            "updated_at": now_iso,
        })
        metric_rows.append(build_metric_row(rec, pid, tinfo["id"]))

    # 3. Calcular ratings Opta-style con puntuar_temporada
    _emit_progress(progress, 32, "Calculando ratings tipo Opta", f"{len(players_rows)} jugadoras · {len(team_map)} equipos ({crests_matched} escudos)")
    df_temp = pd.DataFrame(metric_rows)
    df_scored = puntuar_temporada(df_temp, nivel=NOTA_MEDIA_LIGA)

    # 4. Búsqueda opcional de fotos: SIDEARM Sports (NCAA oficial) -> FotMob -> 365scores -> ceroacero
    store = Store(None if dry_run else get_supabase_client())
    photos_found = 0
    if fetch_photos:
        total_p = len(players_rows)
        team_name_by_id = {t["id"]: t["name"] for t in team_map.values()}

        # 4a. SIDEARM Sports (1 petición por equipo, fotos oficiales + nombre completo + dorsal)
        _emit_progress(progress, 38, "Descargando fotos oficiales (SIDEARM Sports)", f"{len(team_map)} equipos")
        rosters_by_tid: Dict[str, List[Dict[str, Any]]] = {}
        dom_by_tid = {
            tid: resolve_sidearm_domain(tname)
            for tid, tname in team_name_by_id.items()
        }
        with ThreadPoolExecutor(max_workers=6) as pool:
            futs_r = {pool.submit(fetch_sidearm_roster, dom): tid for tid, dom in dom_by_tid.items() if dom}
            for fut in as_completed(futs_r):
                tid = futs_r[fut]
                rosters_by_tid[tid] = fut.result()

        sidearm_matched: List[Tuple[Dict[str, Any], str]] = []
        remaining_for_fallback: List[Dict[str, Any]] = []
        for p_row in players_rows:
            roster = rosters_by_tid.get(p_row["current_team_id"], [])
            matched = match_sidearm_player(p_row["name"], roster)
            if matched:
                if matched.get("name"):
                    p_row["name"] = matched["name"]
                if matched.get("shirt") is not None:
                    p_row["shirt_number"] = matched["shirt"]
                if matched.get("photo_url"):
                    if dry_run:
                        p_row["photo_url"] = matched["photo_url"]
                        photos_found += 1
                    else:
                        sidearm_matched.append((p_row, matched["photo_url"]))
                    continue
            remaining_for_fallback.append(p_row)

        if sidearm_matched and not dry_run:
            total_sa = len(sidearm_matched)
            _emit_progress(progress, 45, "Quitando fondo a fotos SIDEARM", f"0/{total_sa} fotos")
            with ThreadPoolExecutor(max_workers=4) as pool:
                futs_sa = {
                    pool.submit(_subir_sidearm_sin_fondo, store, p_row["id"], url): (p_row, url)
                    for p_row, url in sidearm_matched
                }
                done_sa = 0
                for fut in as_completed(futs_sa):
                    done_sa += 1
                    p_row, orig_url = futs_sa[fut]
                    uploaded = fut.result()
                    p_row["photo_url"] = uploaded or orig_url
                    photos_found += 1
                    if done_sa % 5 == 0 or done_sa == total_sa:
                        pct = 45 + int((done_sa / max(total_sa, 1)) * 20)
                        _emit_progress(progress, pct, "Quitando fondo a fotos SIDEARM", f"{done_sa}/{total_sa} fotos")

        _emit_progress(
            progress,
            65,
            "SIDEARM Sports completado",
            f"{photos_found}/{total_p} fotos sin fondo listas",
        )

        # 4b. Respaldo (FotMob -> 365scores -> ceroacero) solo para las que faltan
        if not dry_run and remaining_for_fallback:
            fotmob = FotMobClient()
            cz = CZClient()
            total_fb = len(remaining_for_fallback)

            def resolve_photo(p_row: Dict[str, Any]) -> Tuple[str, Optional[str], Optional[int]]:
                club = team_name_by_id.get(p_row["current_team_id"], "")
                fm = _buscar_foto_fotmob(fotmob, p_row, club)
                if fm:
                    return p_row["id"], fm[1], fm[0]
                url_365 = subir_foto_365(store, p_row, club)
                if url_365:
                    return p_row["id"], url_365, None
                url_cz = _buscar_foto_ceroacero(cz, store, p_row, club)
                if url_cz:
                    return p_row["id"], url_cz, None
                return p_row["id"], None, None

            with ThreadPoolExecutor(max_workers=6) as pool:
                futs = [pool.submit(resolve_photo, p) for p in remaining_for_fallback]
                by_id = {p["id"]: p for p in players_rows}
                done_count = 0
                for fut in as_completed(futs):
                    done_count += 1
                    pid, purl, fid = fut.result()
                    if purl:
                        photos_found += 1
                        by_id[pid]["photo_url"] = purl
                        if fid:
                            by_id[pid]["fotmob_id"] = fid
                            by_id[pid]["fotmob_photo_url"] = purl
                    if done_count % 5 == 0 or done_count == total_fb:
                        pct = 55 + int((done_count / max(total_fb, 1)) * 33)
                        _emit_progress(
                            progress,
                            pct,
                            "Buscando fotos de respaldo (FotMob, 365scores, ceroacero)",
                            f"{done_count}/{total_fb} restantes · {photos_found} fotos totales",
                        )

    # 5. Guardar en Supabase
    _emit_progress(progress, 92, "Guardando datos en Supabase", f"{len(players_rows)} jugadoras y {len(team_map)} equipos")
    pss_rows: List[Dict[str, Any]] = []
    for _, r in df_scored.iterrows():
        mins = int(r["minutes_played"])
        pj = int(r["matches_played"])
        pss_rows.append({
            "player_id": r["player_id"],
            "season_id": season_id,
            "competition_id": comp_id,
            "team_id": r["team_id"],
            "demarcacion": r["demarcacion"],
            "grupo_demarcacion": r["grupo_demarcacion"],
            "matches_played": pj,
            "matches_70m": pj if mins >= pj * 70 else 0,
            "starts": pj,
            "minutes_played": mins,
            "starter_pct": 100.0 if pj > 0 else 0.0,
            "score_general": float(r["score_general"]),
            "score_ofensivo": float(r["score_ofensivo"]),
            "score_defensivo": float(r["score_defensivo"]),
            "score_comportamiento": float(r["score_comportamiento"]),
            "score_abp": float(r["score_abp"]),
            "percentile_general": float(r["percentile_general"]),
            "percentile_ofensivo": float(r["percentile_ofensivo"]),
            "percentile_defensivo": float(r["percentile_defensivo"]),
            "percentile_comportamiento": float(r["percentile_comportamiento"]),
            "percentile_abp": float(r["percentile_abp"]),
            "nota_global": round(float(r["nota_global"]), 2) if pd.notna(r["nota_global"]) else None,
            "nota_ataque": round(float(r["nota_ataque"]), 2) if pd.notna(r["nota_ataque"]) else None,
            "nota_construccion": round(float(r["nota_construccion"]), 2) if pd.notna(r["nota_construccion"]) else None,
            "nota_defensa": round(float(r["nota_defensa"]), 2) if pd.notna(r["nota_defensa"]) else None,
            "nota_balon_parado": round(float(r["nota_balon_parado"]), 2) if pd.notna(r["nota_balon_parado"]) else None,
            "nota_disponibilidad": round(float(r["nota_disponibilidad"]), 2) if pd.notna(r["nota_disponibilidad"]) else None,
            "goals_p90": round(float(r["_goals_p90"]), 3),
            "assists_p90": round(float(r["_assists_p90"]), 3),
            "xg_p90": round(float(r["_xg_p90"]), 3),
            "xa_p90": round(float(r["_xa_p90"]), 3),
            "passes_p90": round(float(r["_passes_p90"]), 3),
            "passes_pct": round(float(r["_passes_pct"]), 2),
            "progressive_passes_p90": round(float(r["_progressive_passes_p90"]), 3),
            "takeons_p90": round(float(r["_takeons_p90"]), 3),
            "takeons_pct": round(float(r["_takeons_pct"]), 2),
            "tackles_p90": round(float(r["_tackles_p90"]), 3),
            "tackles_pct": round(float(r["_tackles_pct"]), 2),
            "interceptions_p90": round(float(r["_interceptions_p90"]), 3),
            "aerials_p90": round(float(r["_aerials_p90"]), 3),
            "aerials_pct": round(float(r["_aerials_pct"]), 2),
            "radar_data": r["radar_data"],
            "updated_at": now_iso,
        })

    if not dry_run:
        store.upsert("competitions", [{
            "id": comp_id,
            "name": full_name,
            "country": country,
            "code": comp_slug.upper()[:16],
            "active_season_id": season_id,
            "updated_at": now_iso,
        }], on_conflict="id")
        store.upsert("seasons", [{
            "id": season_id,
            "competition_id": comp_id,
            "name": season_name,
            "is_active": True,
            "updated_at": now_iso,
        }], on_conflict="id")
        store.upsert("teams", list(team_map.values()), on_conflict="id")
        store.upsert("players", players_rows, on_conflict="id")
        store.upsert("player_season_stats", pss_rows, on_conflict="player_id,season_id,demarcacion")

    top_sample = sorted(
        [{"name": p["name"], "rating": s["nota_global"]} for p, s in zip(players_rows, pss_rows) if s["nota_global"]],
        key=lambda x: x["rating"],
        reverse=True,
    )[:5]

    _emit_progress(progress, 100, "Importación completada", f"{len(players_rows)} jugadoras guardadas")
    return {
        "competition_id": comp_id,
        "season_id": season_id,
        "league_name": full_name,
        "players": len(players_rows),
        "teams": len(team_map),
        "crests_matched": crests_matched,
        "photos_found": photos_found,
        "top_sample": top_sample,
        "dry_run": dry_run,
    }


def main():
    parser = argparse.ArgumentParser(description="Importar liga manual desde Excel Wyscout")
    parser.add_argument("--file", required=True, help="Ruta al archivo .xlsx")
    parser.add_argument("--league", required=True, help="Nombre de la liga (ej. NCAA)")
    parser.add_argument("--conference", default="", help="Conferencia opcional (ej. Ivy League)")
    parser.add_argument("--country", default="USA", help="País de la liga")
    parser.add_argument("--season", default="2026", help="Nombre de la temporada")
    parser.add_argument("--espn-url", default="https://www.espn.com/soccer/teams/_/league/usa.ncaa.w.1")
    parser.add_argument("--photos", action="store_true", help="Buscar fotos (FotMob, 365scores, ceroacero)")
    parser.add_argument("--dry-run", action="store_true", help="No escribir en Supabase")
    parser.add_argument("--progress", action="store_true", help="Emitir progreso por stdout")
    args = parser.parse_args()

    res = import_wyscout_excel(
        file_path=args.file,
        league_name=args.league,
        conference=args.conference,
        country=args.country,
        season_name=args.season,
        espn_url=args.espn_url,
        fetch_photos=args.photos,
        dry_run=args.dry_run,
        progress=args.progress,
    )
    print(json.dumps(res, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
