"""
pipeline/escudos.py
Escudos de club verificados (nunca por parecido de nombre).

1. Equipo Opta ↔ equipo FotMob: candidatos del buscador de FotMob, y solo se acepta el que comparte con el
   equipo Opta >= MIN_PARTIDOS_COMUNES partidos con la misma fecha (±1 día) y el mismo resultado. Si ninguno
   (o más de uno) lo cumple, el equipo se queda sin escudo de FotMob. Se guarda teams.fotmob_id.
2. Club de Soccerdonna (teams "sd-<id>"): hereda el escudo verificado del equipo Opta del mismo país con
   EXACTAMENTE el mismo nombre normalizado ("Levante UD" = "Levante", pero no "Levante Badalona"). Si no hay,
   su propio escudo de Soccerdonna (va por el ID del club: siempre es el suyo).
3. Club actual de cada jugadora (fm_team_name): el escudo del equipo con ese mismo nombre normalizado (primero
   su current_team_id). Si los candidatos no coinciden en el escudo, sin escudo: mejor vacío que equivocado.
"""

import logging
import re
import time
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple

from .config import BUCKET_TEAM_BADGES, FOTMOB_TEAM_IMG
from .photos import FotMobClient, normalizar
from .storage import Store

logger = logging.getLogger(__name__)

MIN_PARTIDOS_COMUNES = 3
# Siglas y palabras genéricas que no distinguen un club de otro
_GENERICAS = (r"fc|cf|lfc|wfc|afc|sc|cd|ud|sd|cp|ad|club|de|del|la|el|women|womens|w|ladies|femenino|femenina|"
              r"femenil|feminin|feminine|frauen|dames|donne|ssd|asd|ac|as|us|ss|sv|vfl|tsg|rcd|ca|fk|ff|if|bk|ik|"
              r"sk|nk|hnk|gnk|ks|kks|mks|jk|fc\.|calcio|futebol|futbol|football|soccer")
_FILIAL = r"\s+(b|ii|iii|c|u\d{2}|sub\s?\d{2})$"


def norm_club(nombre: Optional[str]) -> str:
    """Nombre de club comparable: sin '(W)', acentos, siglas ni palabras genéricas."""
    n = normalizar(re.sub(r"\s*\(W\)\s*$", "", nombre or ""))
    n = re.sub(rf"\b({_GENERICAS})\b", " ", n)
    return re.sub(r"\s+", " ", n).strip()


def _resultados_opta(store: Store, desde: str) -> Dict[str, Set[Tuple[str, int, int]]]:
    """{team_id: {(fecha, goles a favor, goles en contra)}} de los partidos jugados desde `desde`."""
    out: Dict[str, Set[Tuple[str, int, int]]] = {}
    inicio = 0
    while True:
        filas = (store.client.table("matches").select("home_team_id,away_team_id,match_date,home_score,away_score")
                 .eq("status", "Played").gte("match_date", desde).range(inicio, inicio + 999).execute().data or [])
        for m in filas:
            if m.get("home_score") is None or m.get("away_score") is None:
                continue
            f = str(m["match_date"])[:10]
            out.setdefault(m["home_team_id"], set()).add((f, m["home_score"], m["away_score"]))
            out.setdefault(m["away_team_id"], set()).add((f, m["away_score"], m["home_score"]))
        if len(filas) < 1000:
            break
        inicio += 1000
    return out


class Verificador:
    def __init__(self, fotmob: FotMobClient):
        self.fm = fotmob
        self._fixtures: Dict[int, Set[Tuple[str, int, int]]] = {}

    def resultados_fotmob(self, fm_id: int) -> Set[Tuple[str, int, int]]:
        if fm_id not in self._fixtures:
            d = self.fm._json("teams", id=fm_id) or {}
            fx = ((d.get("fixtures") or {}).get("allFixtures") or {}).get("fixtures") or []
            res = set()
            for x in fx:
                st, h, a = x.get("status") or {}, x.get("home") or {}, x.get("away") or {}
                if not st.get("finished") or h.get("score") is None or a.get("score") is None:
                    continue
                f = (st.get("utcTime") or "")[:10]
                propio, rival = (h, a) if int(h.get("id", 0)) == fm_id else (a, h)
                res.add((f, int(propio["score"]), int(rival["score"])))
            self._fixtures[fm_id] = res
            time.sleep(0.3)
        return self._fixtures[fm_id]

    def candidatos(self, nombre: str) -> List[int]:
        ids: List[int] = []
        for termino in dict.fromkeys([nombre, re.sub(r"\s*\(W\)$", "", nombre), norm_club(nombre)]):
            if not termino:
                continue
            for g in self.fm._json("search/suggest", term=termino, lang="en") or []:
                for x in g.get("suggestions") or []:
                    if x.get("type") == "team" and str(x.get("name", "")).endswith("(W)") and int(x["id"]) not in ids:
                        ids.append(int(x["id"]))
        return ids

    @staticmethod
    def comunes(opta: Set[Tuple[str, int, int]], fm: Set[Tuple[str, int, int]]) -> int:
        """Partidos con el mismo resultado y fecha a ±1 día (zonas horarias)."""
        fm_por = {}
        for f, gf, gc in fm:
            fm_por.setdefault((gf, gc), set()).add(f)
        n = 0
        for f, gf, gc in opta:
            fechas = fm_por.get((gf, gc), set())
            d = date.fromisoformat(f)
            if any((d + timedelta(days=k)).isoformat() in fechas for k in (-1, 0, 1)):
                n += 1
        return n

    def verificar(self, nombre: str, opta: Set[Tuple[str, int, int]], extra: List[int]) -> Optional[Tuple[int, int]]:
        """(fotmob_id, partidos comunes) del único candidato que cumple MIN_PARTIDOS_COMUNES; si no, None."""
        ok = []
        for fm_id in dict.fromkeys(extra + self.candidatos(nombre)):
            n = self.comunes(opta, self.resultados_fotmob(fm_id))
            if n >= MIN_PARTIDOS_COMUNES:
                ok.append((fm_id, n))
        ok.sort(key=lambda t: -t[1])
        # Dos equipos FotMob con los mismos partidos (duplicados de FotMob): gana el de más coincidencias si
        # supera claramente al segundo; si empatan, no se puede saber cuál es
        if not ok or (len(ok) > 1 and ok[1][1] == ok[0][1]):
            return None
        return ok[0]


def _fm_id_de_url(url: Optional[str]) -> Optional[int]:
    m = re.search(r"/fotmob/(\d+)\.png", url or "")
    return int(m.group(1)) if m else None


def coherencia_liga(store: Store) -> int:
    """Liga actual de cada jugadora en un solo bloque: si current_league_name es una liga del catálogo de
    Soccerdonna, su código (bandera) y logo son los de esa liga, no los de la liga desde la que se descargó."""
    ligas = {l["name"]: l for l in store.select_all("sd_leagues", "code,name,level,logo_url")
             if (l.get("level") or "").startswith("Tier")}
    n = 0
    for p in store.select_all("players", "id,current_league_name,current_league_logo_url,sd_league_code"):
        l = ligas.get(p.get("current_league_name") or "")
        if l and (p.get("sd_league_code") != l["code"] or p.get("current_league_logo_url") != l.get("logo_url")):
            store.update("players", {"sd_league_code": l["code"], "current_league_logo_url": l.get("logo_url")}, id=p["id"])
            n += 1
    logger.info(f"Liga actual: {n} jugadoras con código/logo de otra liga corregidas")
    return n


def escudos(store: Store, liga_code: Optional[str] = None, sd=None):
    """Escudos verificados de equipos Opta, clubes de Soccerdonna y club actual de las jugadoras."""
    from .sd_ligas import SD_MEDIUM, imagen_sd
    from .soccerdonna import SDClient
    sd = sd or SDClient()
    fotmob = FotMobClient()
    ver = Verificador(fotmob)
    subidos: Dict[int, Optional[str]] = {}

    def logo(fm_id: int) -> Optional[str]:
        if fm_id not in subidos:
            img = fotmob.image(FOTMOB_TEAM_IMG.format(id=fm_id))
            url = store.upload(BUCKET_TEAM_BADGES, f"fotmob/{fm_id}.png", img, "image/png") if img else None
            subidos[fm_id] = f"{url}?v={int(time.time())}" if url else None
        return subidos[fm_id]

    if not liga_code:
        coherencia_liga(store)
    ligas = store.select_all("sd_leagues", "code,name,country,opta_competition_id")
    liga = next((l for l in ligas if l["code"] == liga_code), None) if liga_code else None
    equipos = store.select_all("teams", "id,name,country,badge_url,fotmob_id,competition_id,sd_league_code")
    resultados = _resultados_opta(store, (date.today() - timedelta(days=540)).isoformat())

    # 1. Equipos Opta
    opta = [t for t in equipos if not t["id"].startswith("sd-") and t["id"] in resultados
            and (not liga or t.get("competition_id") == liga.get("opta_competition_id"))]
    verificados = sin = 0
    for t in opta:
        previo = [x for x in (t.get("fotmob_id"), _fm_id_de_url(t.get("badge_url"))) if x]
        r = ver.verificar(t["name"], resultados[t["id"]], [int(x) for x in previo])
        if r:
            fm_id, n = r
            url = logo(fm_id)
            store.update("teams", {"fotmob_id": fm_id, **({"badge_url": url} if url else {})}, id=t["id"])
            t.update(fotmob_id=fm_id, badge_url=url or t.get("badge_url"))
            verificados += 1
            logger.info(f"  {t['name']} → FotMob {fm_id} ({n} partidos en común)")
        else:
            sin += 1
            if _fm_id_de_url(t.get("badge_url")):  # escudo FotMob puesto antes por nombre: no está verificado
                store.update("teams", {"fotmob_id": None, "badge_url": None}, id=t["id"])
                t.update(fotmob_id=None, badge_url=None)
            logger.info(f"  {t['name']}: sin equipo FotMob verificado")
    logger.info(f"Escudos Opta: {verificados} verificados, {sin} sin verificar")

    # 2. Clubes de Soccerdonna: mismo nombre exacto (normalizado) y país que un equipo Opta verificado
    opta_por_nombre: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
    for t in equipos:
        if not t["id"].startswith("sd-") and t.get("fotmob_id"):
            opta_por_nombre.setdefault((norm_club(t["name"]), t.get("country") or ""), []).append(t)
    for t in [t for t in equipos if t["id"].startswith("sd-") and (not liga or t.get("sd_league_code") == liga_code)]:
        cands = opta_por_nombre.get((norm_club(t["name"]), t.get("country") or ""), [])
        escudos_c = {c["badge_url"] for c in cands if c.get("badge_url")}
        if len(escudos_c) == 1:
            nuevo = escudos_c.pop()
        else:  # el suyo de Soccerdonna (por ID de club)
            nuevo = imagen_sd(store, sd, SD_MEDIUM.format(id=t["id"][3:]), f"sd/{t['id'][3:]}.jpg") \
                if _fm_id_de_url(t.get("badge_url")) else t.get("badge_url")
        if nuevo != t.get("badge_url"):
            store.update("teams", {"badge_url": nuevo}, id=t["id"])
            t["badge_url"] = nuevo

    # 3. Club actual de cada jugadora
    por_nombre: Dict[str, List[Dict[str, Any]]] = {}
    por_id = {t["id"]: t for t in equipos}
    for t in equipos:
        por_nombre.setdefault(norm_club(t["name"]), []).append(t)
    cambios = vacias = 0
    for p in store.select_all("players", "id,fm_team_name,fm_team_badge_url,current_team_id,sd_league_code"):
        if not p.get("fm_team_name") or (liga_code and p.get("sd_league_code") != liga_code):
            continue
        n = norm_club(p["fm_team_name"])
        propio = por_id.get(p.get("current_team_id"))
        if propio and norm_club(propio["name"]) == n and propio.get("badge_url"):
            nuevo = propio["badge_url"]
        else:
            escudos_c = {t["badge_url"] for t in por_nombre.get(n, []) if t.get("badge_url")}
            if len(escudos_c) == 1:
                nuevo = escudos_c.pop()
            elif _fm_id_de_url(p.get("fm_team_badge_url")):
                nuevo = None  # escudo FotMob puesto por nombre y sin club que lo confirme
            else:
                continue  # el de Soccerdonna (por ID de club) se conserva
        if nuevo != p.get("fm_team_badge_url"):
            store.update("players", {"fm_team_badge_url": nuevo}, id=p["id"])
            cambios += 1
            vacias += nuevo is None
    logger.info(f"Escudos de jugadoras: {cambios} cambiados ({vacias} sin escudo por no poder verificarlo)")
