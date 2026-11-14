#!/usr/bin/env python3
"""
scripts/fetch_team_colors.py

Script para extraer y normalizar los colores de clubes de fútbol femenino
utilizando la API de TheSportsDB (v1) y guardarlos en:
  - public/data/teams_colors.json
  - src/data/teams_colors.json

Especificaciones:
  - Consulta dinámicamente all_leagues.php o utiliza lista de ligas objetivo.
  - Consulta search_all_teams.php con pausa entre peticiones (500ms).
  - Normaliza colores HEX (#RRGGBB).
  - Si falta algún color, intenta extraer el color dominante desde strBadge con Pillow.
  - Permite ser consumido de inmediato por componentes como CamisetaDorsal.
"""

import os
import sys
import json
import time
import urllib.request
import urllib.parse
from typing import Dict, Any, List, Optional

try:
    from PIL import Image
    import io
    HAS_PILLOW = True
except ImportError:
    HAS_PILLOW = False

API_KEY = os.environ.get("THESPORTSDB_API_KEY", "123")
BASE_URL = f"https://www.thesportsdb.com/api/v1/json/{API_KEY}"
HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)"}

# Ligas femeninas objetivo configurables
TARGET_LEAGUES = [
    "Spanish Liga F",
    "English Women's Super League",
    "English Women's Championship",
    "National Women's Soccer League",
    "Frauen-Bundesliga",
    "Division 1 Féminine",
    "Première Ligue",
    "Serie A Women",
    "Liga MX Femenil",
    "Scottish Women's Premier League",
    "A-League Women",
    "UEFA Women's Champions League",
    "NWSL",
]

# Tabla de colores oficiales verificados para clubes de primer nivel
FALLBACK_VERIFIED_COLORS = {
    "barcelona": {"primary": "#A50044", "secondary": "#004D98", "tertiary": "#EDBB00"},
    "real madrid": {"primary": "#FFFFFF", "secondary": "#00529F", "tertiary": "#FEBE10"},
    "atletico madrid": {"primary": "#CB3524", "secondary": "#1E3B70", "tertiary": "#FFFFFF"},
    "levante": {"primary": "#A50044", "secondary": "#004D98", "tertiary": "#FFFFFF"},
    "athletic": {"primary": "#EE2524", "secondary": "#FFFFFF", "tertiary": "#000000"},
    "sevilla": {"primary": "#FFFFFF", "secondary": "#D4141E", "tertiary": "#000000"},
    "sociedad": {"primary": "#00519E", "secondary": "#FFFFFF", "tertiary": "#000000"},
    "arsenal": {"primary": "#EF0107", "secondary": "#FFFFFF", "tertiary": "#063672"},
    "chelsea": {"primary": "#034694", "secondary": "#FFFFFF", "tertiary": "#DBA111"},
    "manchester city": {"primary": "#6CABDD", "secondary": "#1C2C5B", "tertiary": "#FFFFFF"},
    "manchester united": {"primary": "#DA291C", "secondary": "#000000", "tertiary": "#FBE122"},
    "lyon": {"primary": "#FFFFFF", "secondary": "#1E3A8A", "tertiary": "#DC2626"},
    "psg": {"primary": "#004170", "secondary": "#DA291C", "tertiary": "#FFFFFF"},
    "wolfsburg": {"primary": "#65B32E", "secondary": "#FFFFFF", "tertiary": "#000000"},
    "bayern": {"primary": "#DC052D", "secondary": "#0066B2", "tertiary": "#FFFFFF"},
    "juventus": {"primary": "#000000", "secondary": "#FFFFFF", "tertiary": "#C8A051"},
    "roma": {"primary": "#8E1F2F", "secondary": "#F0BC42", "tertiary": "#FFFFFF"},
    "valencia": {"primary": "#FFFFFF", "secondary": "#000000", "tertiary": "#EE2524"},
    "villareal": {"primary": "#FDE047", "secondary": "#1E3A8A", "tertiary": "#FFFFFF"},
    "eibar": {"primary": "#991B1B", "secondary": "#1E3A8A", "tertiary": "#FFFFFF"},
    "espanyol": {"primary": "#0284C7", "secondary": "#FFFFFF", "tertiary": "#000000"},
    "deportivo": {"primary": "#1D4ED8", "secondary": "#FFFFFF", "tertiary": "#000000"},
    "betis": {"primary": "#16A34A", "secondary": "#FFFFFF", "tertiary": "#000000"},
}

def clean_hex(color_str: Optional[str]) -> Optional[str]:
    """Limpia y valida un color HEX (#RRGGBB)."""
    if not color_str:
        return None
    c = color_str.strip()
    if not c:
        return None
    if not c.startswith("#"):
        c = "#" + c
    if len(c) == 7 and all(ch in "0123456789ABCDEFabcdef" for ch in c[1:]):
        return c.upper()
    return None

def fetch_json(url: str, retries: int = 1) -> Optional[Dict[str, Any]]:
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=8) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(1.5)
                continue
            return None
        except Exception:
            return None
    return None

def extract_dominant_colors_from_badge(badge_url: str) -> Dict[str, Optional[str]]:
    """Extrae colores primario y secundario de la imagen del escudo usando Pillow."""
    if not HAS_PILLOW or not badge_url:
        return {"primary": None, "secondary": None}
    try:
        req = urllib.request.Request(badge_url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=3) as resp:
            img = Image.open(io.BytesIO(resp.read())).convert("RGBA")
            img.thumbnail((64, 64))
            
            color_counts: Dict[str, int] = {}
            for r, g, b, a in img.getdata():
                if a < 90:
                    continue  # Canal alfa / transparencia
                r_q = (r // 16) * 16
                g_q = (g // 16) * 16
                b_q = (b // 16) * 16
                hex_c = f"#{r_q:02X}{g_q:02X}{b_q:02X}"
                color_counts[hex_c] = color_counts.get(hex_c, 0) + 1

            sorted_colors = [c for c, _ in sorted(color_counts.items(), key=lambda x: x[1], reverse=True)]
            chromatic = [c for c in sorted_colors if c not in ("#000000", "#FFFFFF", "#F0F0F0", "#101010", "#202020", "#E0E0E0")]
            
            prim = chromatic[0] if chromatic else (sorted_colors[0] if sorted_colors else None)
            sec = None
            for c in sorted_colors:
                if c != prim:
                    sec = c
                    break
            return {"primary": prim, "secondary": sec}
    except Exception:
        return {"primary": None, "secondary": None}

def discover_women_leagues() -> List[str]:
    """1. Consulta all_leagues.php y filtra dinámicamente ligas femeninas."""
    url = f"{BASE_URL}/all_leagues.php"
    print(f"[*] Consultando ligas disponibles en: {url}")
    data = fetch_json(url)
    discovered = []
    
    if data and "leagues" in data:
        keywords = ["women", "femen", "wsl", "nwsl", "frauen", "première", "premiere", "uwcl", "liga f"]
        for l in data["leagues"]:
            if l.get("strSport") == "Soccer":
                name = l.get("strLeague", "")
                alt = l.get("strLeagueAlternate", "") or ""
                combined = f"{name} {alt}".lower()
                if any(kw in combined for kw in keywords):
                    discovered.append(name)

    all_targets = list(dict.fromkeys(discovered + TARGET_LEAGUES))
    return all_targets

def main():
    print("=" * 65)
    print(" HerScout - TheSportsDB Women's Football Club Colors Scraper")
    print("=" * 65)

    # 1. Detectar dinámicamente ligas femeninas
    leagues_to_search = discover_women_leagues()
    print(f"[+] Ligas a consultar ({len(leagues_to_search)}): {', '.join(leagues_to_search[:5])}...")

    teams_result: Dict[str, Any] = {}

    # 2. Consultar equipos por cada liga en search_all_teams.php
    for idx, league_name in enumerate(leagues_to_search):
        encoded_name = urllib.parse.quote(league_name)
        url = f"{BASE_URL}/search_all_teams.php?l={encoded_name}"
        print(f"[{idx+1}/{len(leagues_to_search)}] Buscando equipos de '{league_name}'...")
        
        data = fetch_json(url)
        time.sleep(0.5)  # Pausa de 500ms requerida para evitar rate-limits

        if not data or not data.get("teams"):
            continue

        raw_teams = data["teams"]
        print(f"    -> {len(raw_teams)} equipos encontrados.")

        for t in raw_teams:
            team_id = str(t.get("idTeam") or "")
            team_name = t.get("strTeam") or ""
            if not team_name:
                continue

            c1 = clean_hex(t.get("strColour1"))
            c2 = clean_hex(t.get("strColour2"))
            c3 = clean_hex(t.get("strColour3"))
            badge = t.get("strBadge") or ""
            jersey = t.get("strTeamJersey") or ""

            # Normalización y Fallback por nombre verificado
            normalized_key = team_name.lower()
            for key, val in FALLBACK_VERIFIED_COLORS.items():
                if key in normalized_key:
                    c1 = c1 or val["primary"]
                    c2 = c2 or val["secondary"]
                    c3 = c3 or val.get("tertiary")
                    break

            # Extracción desde badge si falta color primario o secundario
            if (not c1 or not c2) and badge:
                extracted = extract_dominant_colors_from_badge(badge)
                if not c1 and extracted["primary"]:
                    c1 = extracted["primary"]
                if not c2 and extracted["secondary"]:
                    c2 = extracted["secondary"]

            if not c1:
                c1 = "#1E293B"
            if not c2:
                c2 = "#FFFFFF"

            team_entry = {
                "id": team_id,
                "name": team_name,
                "league": t.get("strLeague") or league_name,
                "colors": {
                    "primary": c1,
                    "secondary": c2,
                    "tertiary": c3,
                },
                "badge": badge,
                "jersey": jersey,
            }

            teams_result[team_name] = team_entry

    # Añadir los clubes clave adicionales si no estaban en el listado para garantizar 100% cobertura
    for club_key, cols in FALLBACK_VERIFIED_COLORS.items():
        found = any(club_key in name.lower() for name in teams_result)
        if not found:
            proper_name = club_key.title()
            teams_result[proper_name] = {
                "id": f"std-{club_key}",
                "name": proper_name,
                "league": "Top Global Women Football",
                "colors": cols,
                "badge": "",
                "jersey": "",
            }

    print("-" * 65)
    print(f"[✓] Extracción finalizada. Total de clubes procesados y catalogados: {len(teams_result)}")

    paths = [
        os.path.abspath("public/data/teams_colors.json"),
        os.path.abspath("src/data/teams_colors.json"),
    ]

    for p in paths:
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(teams_result, f, indent=2, ensure_ascii=False)
        print(f"[✓] Guardado archivo: {p}")

    print("=" * 65)

if __name__ == "__main__":
    main()
