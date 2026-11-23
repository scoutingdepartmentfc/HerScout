"""
pipeline/sidearm.py
Scraper de plantillas oficiales NCAA en plataforma SIDEARM Sports:
  https://<dominio-deportivo>/sports/womens-soccer/roster

Extrae nombre completo, dorsal y foto oficial en alta calidad (NextGen `.s-person-card`
y Classic `.sidearm-roster-player`) para cruzarlo con jugadoras importadas desde Wyscout.
"""

import logging
import re
import unicodedata
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from rapidfuzz import fuzz

logger = logging.getLogger("sidearm")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Mapa extensible de equipos NCAA -> dominio deportivo SIDEARM
NCAA_SIDEARM_DOMAINS: Dict[str, str] = {
    # Ivy League
    "brown": "brownbears.com",
    "brown bears": "brownbears.com",
    "columbia": "gocolumbialions.com",
    "columbia lions": "gocolumbialions.com",
    "cornell": "cornellbigred.com",
    "cornell big red": "cornellbigred.com",
    "dartmouth": "dartmouthsports.com",
    "dartmouth big green": "dartmouthsports.com",
    "harvard": "gocrimson.com",
    "harvard crimson": "gocrimson.com",
    "penn": "pennathletics.com",
    "penn quakers": "pennathletics.com",
    "pennsylvania": "pennathletics.com",
    "pennsylvania quakers": "pennathletics.com",
    "princeton": "goprincetontigers.com",
    "princeton tigers": "goprincetontigers.com",
    "yale": "yalebulldogs.com",
    "yale bulldogs": "yalebulldogs.com",
    # Ejemplos y principales programas D1 (ACC / Big Ten / SEC / Big 12)
    "north carolina": "goheels.com",
    "north carolina tar heels": "goheels.com",
    "ucla": "uclabruins.com",
    "ucla bruins": "uclabruins.com",
    "wake forest": "godeacs.com",
    "wake forest demon deacons": "godeacs.com",
    "washington": "gohuskies.com",
    "washington huskies": "gohuskies.com",
    "stanford": "gostanford.com",
    "stanford cardinal": "gostanford.com",
    "florida state": "seminoles.com",
    "fsu": "seminoles.com",
    "duke": "goduke.com",
    "duke blue devils": "goduke.com",
    "virginia": "virginiasports.com",
    "virginia cavaliers": "virginiasports.com",
    "notre dame": "fightingirish.com",
    "penn state": "gopsusports.com",
    "usc": "usctrojans.com",
    "michigan": "mgoblue.com",
    "ohio state": "ohiostatebuckeyes.com",
    "texas": "texassports.com",
    "texas longhorns": "texassports.com",
    "alabama": "rolltide.com",
    "arkansas": "arkansasrazorbacks.com",
    "auburn": "auburntigers.com",
    "georgia": "georgiadogs.com",
    "lsu": "lsusports.net",
    "south carolina": "gamecocksonline.com",
    "tennessee": "utsports.com",
    "texas a&m": "12thman.com",
    "texas a m": "12thman.com",
    "clemson": "clemsontigers.com",
    "pittsburgh": "pittsburghpanthers.com",
    "california": "calbears.com",
    "byu": "byucougars.com",
    "tcu": "gofrogs.com",
    "georgetown": "guhoyas.com",
    "santa clara": "santaclarabroncos.com",
    "pepperdine": "pepperdinewaves.com",
    "portland": "portlandpilots.com",
    # Sun Belt Conference
    "app state": "appstatesports.com",
    "appalachian state": "appstatesports.com",
    "arkansas state": "astateredwolves.com",
    "coastal carolina": "goccusports.com",
    "georgia southern": "gseagles.com",
    "georgia state": "georgiastatesports.com",
    "jmu": "jmusports.com",
    "jmu dukes": "jmusports.com",
    "james madison": "jmusports.com",
    "louisiana": "ragincajuns.com",
    "louisiana ragin cajuns": "ragincajuns.com",
    "louisiana tech": "latechsports.com",
    "marshall": "herdzone.com",
    "old dominion": "odusports.com",
    "south alabama": "usajaguars.com",
    "southern miss": "southernmiss.com",
    "troy": "troytrojans.com",
    "ul monroe": "ulmwarhawks.com",
    "ulm": "ulmwarhawks.com",
    "texas state": "txst.com",
    # Big 12 Conference
    "arizona state": "thesundevils.com",
    "arizona": "arizonawildcats.com",
    "baylor": "baylorbears.com",
    "cincinnati": "gobearcats.com",
    "colorado": "cubuffs.com",
    "houston": "uhcougars.com",
    "iowa state": "cyclones.com",
    "kansas state": "kstatesports.com",
    "kansas": "kuathletics.com",
    "oklahoma state": "okstate.com",
    "texas tech": "texastech.com",
    "ucf": "ucfknights.com",
    "utah": "utahutes.com",
    "west virginia": "wvusports.com",
    # SEC (los que faltaban)
    "florida": "floridagators.com",
    "florida gators": "floridagators.com",
    "kentucky": "ukathletics.com",
    "mississippi state": "hailstate.com",
    "missouri": "mutigers.com",
    "oklahoma": "soonersports.com",
    "ole miss": "olemisssports.com",
    "vanderbilt": "vucommodores.com",
    # ACC / Big Ten (para próximas importaciones)
    "boston college": "bceagles.com",
    "clemson tigers": "clemsontigers.com",
    "louisville": "gocards.com",
    "miami": "miamihurricanes.com",
    "nc state": "gopack.com",
    "smu": "smumustangs.com",
    "syracuse": "cuse.com",
    "virginia tech": "hokiesports.com",
    "illinois": "fightingillini.com",
    "indiana": "iuhoosiers.com",
    "iowa": "hawkeyesports.com",
    "maryland": "umterps.com",
    "michigan state": "msuspartans.com",
    "minnesota": "gophersports.com",
    "nebraska": "huskers.com",
    "northwestern": "nusports.com",
    "oregon": "goducks.com",
    "purdue": "purduesports.com",
    "rutgers": "scarletknights.com",
    "wisconsin": "uwbadgers.com",
}


def _norm(text: str) -> str:
    s = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def resolve_sidearm_domain(team_name: str) -> Optional[str]:
    key = _norm(team_name)
    if key in NCAA_SIDEARM_DOMAINS:
        return NCAA_SIDEARM_DOMAINS[key]
    # Claves más largas primero con límites de palabra para evitar colisiones
    # (ej. "south alabama" antes que "alabama", "georgia state" antes que "georgia", "jmu dukes" antes que "duke")
    for k, dom in sorted(NCAA_SIDEARM_DOMAINS.items(), key=lambda kv: len(kv[0]), reverse=True):
        if re.search(rf"(?:^|\s){re.escape(k)}(?:\s|$)", key):
            return dom
    # Autodescubrimiento vía DuckDuckGo para conferencias no listadas aún
    try:
        q = requests.utils.quote(f'"{team_name}" "womens-soccer/roster"')
        r = requests.get(f"https://html.duckduckgo.com/html/?q={q}", headers=HEADERS, timeout=10)
        if r.status_code == 200:
            m = re.search(r"https?://(?:www\.)?([a-z0-9-]+\.(?:com|net|org))/sports/womens-soccer/roster", r.text, re.I)
            if m:
                dom = m.group(1).lower()
                NCAA_SIDEARM_DOMAINS[key] = dom
                return dom
    except Exception:
        pass
    return None


def _clean_name(raw: str) -> str:
    s = re.sub(r"\s+", " ", str(raw or "")).strip()
    return re.sub(r"^\d+\s+", "", s).strip()


def _clean_photo_url(raw: str, base_url: str) -> Optional[str]:
    u = str(raw or "").strip()
    if not u or u.startswith("data:") or "default" in u.lower() or "placeholder" in u.lower():
        return None
    if u.startswith("//"):
        u = "https:" + u
    elif u.startswith("/"):
        u = urljoin(base_url, u)
    # Quitar parámetros de recorte extremo si viene de sidearmdev, o mantener URL válida
    return u if u.startswith("http") else None


def fetch_sidearm_roster(domain: str) -> List[Dict[str, Any]]:
    """Descarga y parsea la plantilla femenina de un dominio SIDEARM."""
    base_url = f"https://{domain.strip('/')}"
    url = f"{base_url}/sports/womens-soccer/roster"
    try:
        r = requests.get(url, headers=HEADERS, timeout=20, allow_redirects=True)
        if r.status_code != 200 or len(r.text) < 2000:
            return []
    except Exception as e:
        logger.warning(f"SIDEARM {domain}: {e}")
        return []

    soup = BeautifulSoup(r.text, "html.parser")
    players: List[Dict[str, Any]] = []
    seen = set()

    # 1. SIDEARM NextGen (.s-person-card)
    for card in soup.select(".s-person-card"):
        name = ""
        shirt: Optional[int] = None
        link = card.select_one("a[aria-label]")
        if link and link.get("aria-label"):
            lbl = link["aria-label"]
            m_name = re.match(r"^(.*?)\s+jersey number\s+(\d+)", lbl, re.I)
            if m_name:
                name = m_name.group(1).strip()
                shirt = int(m_name.group(2))
        if not name:
            name_el = card.select_one("h3, .s-person-details__personal-single-line a, a[href*='/roster/']")
            if name_el:
                name = name_el.get_text(" ", strip=True)
        name = _clean_name(name)
        if not name or name.lower() in seen:
            continue

        if shirt is None:
            j_el = card.select_one(".s-person-card__header__jersey-number, [data-test-id*='jersey']")
            if j_el:
                m_j = re.search(r"\d+", j_el.get_text())
                if m_j:
                    shirt = int(m_j.group(0))

        photo_url = None
        for tag in card.select("img, source"):
            cand = tag.get("src") or tag.get("data-src") or ""
            if not cand and tag.get("srcset"):
                cand = tag["srcset"].split(",")[0].strip().split(" ")[0]
            photo_url = _clean_photo_url(cand, base_url)
            if photo_url:
                break

        seen.add(name.lower())
        players.append({"name": name, "shirt": shirt, "photo_url": photo_url})

    # 2. SIDEARM Classic (.sidearm-roster-player)
    if not players:
        for card in soup.select(".sidearm-roster-player"):
            name_el = card.select_one(".sidearm-roster-player-name a, .sidearm-roster-player-name")
            name = _clean_name(name_el.get_text(" ", strip=True) if name_el else "")
            if not name or name.lower() in seen:
                continue

            shirt = None
            j_el = card.select_one(".sidearm-roster-player-jersey-number")
            if j_el:
                m_j = re.search(r"\d+", j_el.get_text())
                if m_j:
                    shirt = int(m_j.group(0))

            photo_url = None
            img = card.select_one(".sidearm-roster-player-image img, img")
            if img:
                cand = img.get("data-src") or img.get("src") or ""
                photo_url = _clean_photo_url(cand, base_url)

            seen.add(name.lower())
            players.append({"name": name, "shirt": shirt, "photo_url": photo_url})

    # 3. WMT Digital (UCLA, Penn State, LSU, Auburn, etc.): Nuxt SSR con imgproxy URLs en el JSON embebido
    if not players:
        unescaped = r.text.replace("\\u002F", "/")
        for a in soup.select("a[href*='/roster/player/']"):
            img = a.find("img")
            if not img:
                continue
            name = _clean_name(img.get("alt") or "")
            if not name or name.lower() in seen:
                continue
            title = (img.get("title") or "").strip()
            photo_url = _clean_photo_url(img.get("data-src") or img.get("src") or "", base_url)
            if not photo_url and title:
                m_url = re.search(re.escape(title) + r'"[^\n]{0,120}?"(https?://[^"]+)"', unescaped)
                if m_url:
                    photo_url = _clean_photo_url(m_url.group(1), base_url)
            shirt = None
            parent = a.parent
            if parent:
                j_el = parent.select_one("[class*='jersey-number']")
                if j_el:
                    m_j = re.search(r"\d+", j_el.get_text())
                    if m_j:
                        shirt = int(m_j.group(0))
            seen.add(name.lower())
            players.append({"name": name, "shirt": shirt, "photo_url": photo_url})

    logger.info(f"SIDEARM {domain}: {len(players)} jugadoras ({sum(1 for p in players if p['photo_url'])} con foto)")
    return players


def match_sidearm_player(wyscout_name: str, roster: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Cruza nombres completos ('Emily Burnham') o abreviados de Wyscout ('B. Birtwistle') con el roster."""
    if not roster or not wyscout_name:
        return None
    w_norm = _norm(wyscout_name)
    w_parts = w_norm.split()
    if not w_parts:
        return None

    # Abreviatura tipo "B. Birtwistle" -> inicial "b", apellido "birtwistle"
    is_abbrev = len(w_parts) >= 2 and len(w_parts[0]) == 1
    initial = w_parts[0] if is_abbrev else w_parts[0][0]
    w_last = " ".join(w_parts[1:]) if len(w_parts) > 1 else w_parts[0]

    best: Optional[Dict[str, Any]] = None
    best_score = 0.0

    for cand in roster:
        c_norm = _norm(cand["name"])
        if c_norm == w_norm:
            return cand
        c_parts = c_norm.split()
        if not c_parts:
            continue
        if is_abbrev:
            c_last = " ".join(c_parts[1:]) if len(c_parts) > 1 else c_parts[0]
            if c_parts[0].startswith(initial) and (c_last == w_last or fuzz.ratio(c_last, w_last) >= 88):
                return cand
        score = fuzz.token_sort_ratio(w_norm, c_norm)
        if score > best_score:
            best_score = score
            best = cand

    return best if best_score >= 86 else None
