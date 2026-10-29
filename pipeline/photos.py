"""
pipeline/photos.py
Fotos de jugadores y escudos desde FotMob → Supabase Storage.

Generaliza el enfoque de Debrecen_app (scraping por equipo + emparejar por dorsal y nombre)
a las 16 ligas sin URLs a mano:
1. API de la liga en FotMob → lista de equipos (incluye ligas con grupos: Serie C, 1ª RFEF).
2. Cada equipo Opta se empareja con su equipo FotMob por nombre normalizado (rapidfuzz).
3. Cada jugador Opta se empareja con la plantilla FotMob por fecha de nacimiento + nombre,
   dorsal + nombre, o nombre muy parecido.
4. Se descarga la imagen y se sube a los buckets públicos `player-photos` / `team-badges`.

Además aprovecha la plantilla FotMob para completar altura y valor de mercado.

Prioridad de fotos: Opta (misma fuente que los datos) > FotMob > Transfermarkt > SoccerWiki.
Las fotos Opta se guardan como `{player_id}_opta.jpg` para saber cuáles ya vienen de Opta.
"""

import logging
import re
import time
import unicodedata
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

import requests
from rapidfuzz import fuzz, process

from .config import (BUCKET_PLAYER_PHOTOS, BUCKET_TEAM_BADGES, FOTMOB_BASE_URL, FOTMOB_PLAYER_IMG,
                     FOTMOB_TEAM_IMG, OPTA_PLAYER_IMG, OPTA_TEAM_IMG)

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
}
PAUSA = 0.4  # respetar el servidor
# Palabras que no ayudan a distinguir clubes ("FC Ingolstadt 04" vs "Ingolstadt")
RUIDO_CLUB = re.compile(r"\b(fc|cf|sc|sv|ac|as|afc|cd|ud|sd|fk|nk|hnk|gnk|ks|sk|bsc|vfl|vfb|tsv|ssv|spvgg|"
                        r"1\.|calcio|club|de|city|united|town|football|futbol|kv|krc|rsc|royal|us|ss|asd|"
                        r"\d+)\b")


def es_foto_opta(photo_url: Any) -> bool:
    return bool(photo_url) and "_opta." in str(photo_url)


def es_foto_fotmob(photo_url: Any) -> bool:
    return bool(photo_url) and re.search(r"/[^/_]+\.png(\?|$)", str(photo_url)) is not None



def _edad(dob: Optional[str]) -> Optional[int]:
    try:
        d = date.fromisoformat(str(dob)[:10])
    except (TypeError, ValueError):
        return None
    hoy = date.today()
    return hoy.year - d.year - ((hoy.month, hoy.day) < (d.month, d.day))


def misma_fecha(a: str, b: str) -> bool:
    """Tolera erratas de una de las webs: mismo año y mes o día iguales,
    día y mes invertidos (2001-08-04 vs 2001-04-08), pocos días de diferencia (<= 15 días)
    o mismo día con un año de diferencia (2003-08-30 vs 2002-08-30)."""
    if not a or not b or len(str(a)) < 10 or len(str(b)) < 10:
        return False
    a_str, b_str = str(a)[:10], str(b)[:10]
    try:
        ya, ma, da = a_str.split("-")
        yb, mb, db = b_str.split("-")
    except ValueError:
        return False
    if ya == yb:
        if ma == mb or da == db:
            return True
        if (ma, da) == (db, mb):
            return True
    try:
        da_obj = date.fromisoformat(a_str)
        db_obj = date.fromisoformat(b_str)
        if abs((da_obj - db_obj).days) <= 15:
            return True
    except (ValueError, TypeError):
        pass
    return (ma, da) == (mb, db) and abs(int(ya) - int(yb)) <= 1


def fecha_relleno(f: str) -> bool:
    """Fecha de relleno cuando no se conoce la real (11-11 o 01-01)."""
    s = str(f or "")
    return len(s) >= 10 and s[5:10] in ("11-11", "01-01")


def normalizar(texto: Any) -> str:
    """'Đ. Gordić' → 'd gordic'. Fundamental para el matching entre fuentes."""
    if not texto:
        return ""
    texto = unicodedata.normalize("NFC", str(texto))
    texto = texto.replace("Đ", "D").replace("đ", "d").replace("ø", "o").replace("Ø", "O").replace("ß", "ss")\
        .replace("Ł", "L").replace("ł", "l").replace("æ", "ae").replace("Æ", "AE").replace("œ", "oe").replace("ı", "i")
    texto = unicodedata.normalize("NFD", texto)
    texto = "".join(c for c in texto if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", texto.lower())).strip()


def normalizar_club(nombre: Any) -> str:
    return re.sub(r"\s+", " ", RUIDO_CLUB.sub(" ", normalizar(nombre))).strip()


def extraer_apellidos(last_name: str) -> List[str]:
    """Extrae los apellidos significativos respetando partículas compuestas ('de Lope', 'de la Villa', 'Le Loc\'h')."""
    if not last_name:
        return []
    palabras = unicodedata.normalize("NFC", last_name).strip().split()
    tokens = []
    i = 0
    while i < len(palabras):
        w_low = palabras[i].lower()
        if i + 2 < len(palabras) and f"{palabras[i]} {palabras[i+1]}".lower() in ("de la", "de las", "de los", "van de", "van der"):
            tokens.append(f"{palabras[i]} {palabras[i+1]} {palabras[i+2]}")
            i += 3
        elif i + 1 < len(palabras) and w_low in ("de", "del", "da", "do", "di", "san", "santa", "von", "van", "le", "la"):
            tokens.append(f"{palabras[i]} {palabras[i+1]}")
            i += 2
        else:
            tokens.append(palabras[i])
            i += 1
    return tokens


def variantes_nombre(player: Dict[str, Any], busqueda: bool = False) -> List[str]:
    """Formas del nombre con que puede aparecer en otras webs: 'Paula Sancho González', 'Pauleta',
    'Paula Sancho', 'Pauleta Sancho', 'Ewa Pajor' (sin segundo nombre). Opta da segundos nombres,
    apellidos compuestos y apodos (match_name), a veces con inicial ('E. Pajor', que no sirve).
    `busqueda`: añade el apellido solo al final, útil para buscar pero no para comparar."""
    name = unicodedata.normalize("NFC", str(player.get("name") or "")).strip()
    first_name = unicodedata.normalize("NFC", str(player.get("first_name") or "")).strip()
    last_name = unicodedata.normalize("NFC", str(player.get("last_name") or "")).strip()
    nombres = first_name.split()
    apellidos = extraer_apellidos(last_name)
    ap1 = apellidos[0] if apellidos else ""
    ap2 = apellidos[1] if len(apellidos) > 1 else ""

    # Limpiar y normalizar match_name (evitar iniciales tipo 'E. Pajor')
    mn = (player.get("match_name") or "").strip()
    if re.match(r"^\w\.", mn):
        mn = ""
    mn = unicodedata.normalize("NFC", mn)

    # Prioridad:
    # 1. match_name (si existe y no es inicial, es el apodo o nombre deportivo de competición)
    # 2. last_name y name por separado
    # 3. combinaciones de nombre + apellidos
    formas = []
    if mn:
        formas.append(mn)
    if name and name != mn:
        formas.append(name)
    if last_name and last_name != name and last_name != mn:
        formas.append(last_name)
    if first_name and first_name != name:
        formas.append(first_name)

    if first_name and ap1:
        formas.append(f"{first_name} {ap1}".strip())
    if nombres and ap1:
        formas.append(f"{nombres[0]} {ap1}")
    if nombres and ap2:
        formas.append(f"{nombres[0]} {ap2}")
    if mn and ap1 and " " not in mn and normalizar(ap1) not in normalizar(mn):
        formas.append(f"{mn} {ap1}")
    if mn and ap2 and " " not in mn and normalizar(ap2) not in normalizar(mn):
        formas.append(f"{mn} {ap2}")

    # Hipocorísticos comunes (ej: Lucia -> Lucy Bronze, Victoria -> Vicky, Alexandra -> Alex)
    APODOS_NOMBRE = {
        "lucia": ["lucy"], "lucy": ["lucia"],
        "victoria": ["vicky", "tori"], "vicky": ["victoria"],
        "alexandra": ["alex", "alexa"], "alex": ["alexandra", "alexis"],
        "elizabeth": ["beth", "ellie", "eliza"], "beth": ["elizabeth"],
        "jennifer": ["jen", "jenny", "jenni"], "jenni": ["jennifer"],
        "patricia": ["patri"], "patri": ["patricia"],
        "cristina": ["cris"], "cris": ["cristina"],
        "maria": ["mari"], "mari": ["maria"],
    }
    if nombres:
        n0_low = nombres[0].lower()
        if n0_low in APODOS_NOMBRE:
            for hipo in APODOS_NOMBRE[n0_low]:
                if ap1:
                    formas.append(f"{hipo.title()} {ap1}")
                if ap2:
                    formas.append(f"{hipo.title()} {ap2}")
                if busqueda:
                    formas.append(f"{hipo.title()}")

    # Sub-apellidos con guión (ej: Padilla-Bidas -> Natalia Padilla, Natalia Bidas)
    sub_apellidos = []
    for ap in apellidos:
        if "-" in ap:
            for part in ap.split("-"):
                part = part.strip()
                if len(part) > 2 and normalizar(part) not in ("de", "la", "el", "los", "las", "le"):
                    sub_apellidos.append(part)
                    if nombres:
                        formas.append(f"{nombres[0]} {part}")

    if busqueda:
        # Añade apellidos individuales para búsquedas en APIs externas
        if ap1 and normalizar(ap1) not in ("de", "la", "el", "los", "las", "le"):
            formas.append(ap1)
        if ap2 and normalizar(ap2) not in ("de", "la", "el", "los", "las", "le"):
            formas.append(ap2)
        for sub in sub_apellidos:
            formas.append(sub)
        if len(apellidos) > 2 and apellidos[-1]:
            formas.append(apellidos[-1])
            if nombres:
                formas.append(f"{nombres[0]} {apellidos[-1]}")

    return list(dict.fromkeys(f for f in formas if f and normalizar(f)))



def sim_nombre(player: Dict[str, Any], nombre: Any) -> float:
    """Mejor parecido entre cualquier variante del nombre y el de la otra web."""
    n = normalizar(nombre)
    return max((fuzz.token_set_ratio(normalizar(v), n) for v in variantes_nombre(player)), default=0)


class FotMobClient:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
        self._liga: Dict[int, List[Dict[str, Any]]] = {}
        self._ligas_equipo: Dict[int, Optional[Dict[str, Any]]] = {}
        self._catalogo: Optional[Dict[int, Dict[str, Any]]] = None
        self._fichas: Dict[int, Dict[str, Any]] = {}

    def _json(self, path: str, **params) -> Optional[Dict[str, Any]]:
        for attempt in range(3):
            try:
                r = self.session.get(f"{FOTMOB_BASE_URL}/{path}", params=params, timeout=20)
                if r.status_code == 200:
                    return r.json()
                logger.debug(f"FotMob {path} {params} → HTTP {r.status_code}")
            except (requests.RequestException, ValueError) as e:
                logger.debug(f"FotMob {path}: {e}")
            time.sleep(1.5 * (attempt + 1))
        return None

    def league_teams(self, league_id: int) -> List[Dict[str, Any]]:
        data = self._json("leagues", id=league_id) or {}
        teams = {}
        for t in data.get("table", []) or []:
            d = t.get("data", {})
            tablas = [d["table"]] if "table" in d else [x.get("table", {}) for x in d.get("tables", [])]
            for tabla in tablas:
                for row in tabla.get("all", []) or []:
                    teams[row["id"]] = {"id": row["id"], "name": row.get("name"), "shortName": row.get("shortName")}
        return list(teams.values())

    def jugadores_liga(self, league_id: int, temporadas: int = 2) -> List[Dict[str, Any]]:
        """Jugadores con minutos en las últimas temporadas de la liga (fútbol femenino: FotMob no da plantilla)."""
        if league_id in self._liga:
            return self._liga[league_id]
        data = self._json("leagues", id=league_id) or {}
        enlaces = ((data.get("stats") or {}).get("seasonStatLinks") or [])[:temporadas]
        vistos: Dict[int, Dict[str, Any]] = {}
        for e in enlaces:
            ruta = (e.get("RelativePath") or "").replace("topstats.json", "mins_played.json")
            try:
                r = self.session.get(f"https://data.fotmob.com/{ruta}", timeout=20)
                lista = r.json()["TopLists"][0]["StatList"] if r.status_code == 200 else []
            except (requests.RequestException, ValueError, KeyError, IndexError):
                lista = []
            for x in lista:
                vistos.setdefault(x["ParticiantId"], {"id": x["ParticiantId"], "name": x.get("ParticipantName"),
                                                      "teamName": x.get("TeamName")})
        self._liga[league_id] = list(vistos.values())
        return self._liga[league_id]

    def buscar(self, termino: str) -> List[Dict[str, Any]]:
        """Buscador de FotMob: [{id, name, teamName}] de jugadores (sin entrenadores)."""
        data = self._json("search/suggest", term=termino, lang="en") or []
        res = {}
        for grupo in data if isinstance(data, list) else []:
            for x in grupo.get("suggestions") or []:
                if x.get("type") == "player" and not x.get("isCoach"):
                    res[x["id"]] = {"id": int(x["id"]), "name": x.get("name"), "teamName": x.get("teamName")}
        return list(res.values())

    def buscar_jugador(self, player: Dict[str, Any], club: Optional[str],
                       liga_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
        """Busca por nombre (matchName primero; jugadores de la liga y buscador general) y confirma con la
        ficha de FotMob:
        - fecha de nacimiento (misma_fecha tolerando DD/MM vs MM/DD o diferencias menores)
        - dorsal (Opta `shirtNumber` vs `Shirt` en FotMob)
        - edad (+/- 1 año)
        - nacionalidad (país Opta vs Country en FotMob)
        - club actual o reciente
        Evita fotos de homónimas de otros equipos sin perder a jugadoras con nombres compuestos o apodos."""
        club_n = normalizar_club(club)
        dob = str(player.get("birth_date") or "")[:10]
        edad = _edad(dob)
        pais_opta = normalizar(player.get("country") or player.get("citizenship") or "")
        dorsal = player.get("shirt_number")

        def extraer_info(ficha: Dict[str, Any]) -> Dict[str, Any]:
            info: Dict[str, Any] = {
                "birth_date": None, "age": None, "country": None, "shirt": None,
                "team": (ficha.get("primaryTeam") or {}).get("teamName"),
            }
            bdate = (ficha.get("birthDate") or {}).get("utcTime")
            if bdate:
                info["birth_date"] = str(bdate)[:10]
            for item in ficha.get("playerInformation") or []:
                title = item.get("title")
                val = item.get("value") or {}
                if title == "Country":
                    info["country"] = val.get("fallback") or item.get("countryCode")
                elif title == "Age":
                    info["age"] = val.get("numberValue")
                elif title == "Height":
                    info["height"] = val.get("numberValue")
                elif title == "Shirt":
                    info["shirt"] = val.get("numberValue")
            return info

        def puntuar(cands):
            out = []
            for c in cands:
                sim = sim_nombre(player, c.get("name"))
                sim_club = fuzz.token_set_ratio(club_n, normalizar_club(c.get("teamName"))) if club_n else 0
                if sim >= 65 or (sim >= 50 and sim_club >= 70):
                    out.append((sim + sim_club, sim, sim_club, c))
            return sorted(out, key=lambda t: -t[0])[:8]

        def confirmar(sim, sim_club, c) -> bool:
            ficha = self.jugador(int(c["id"]))
            if not ficha:
                return sim_club >= 70 and sim >= 80
            info = extraer_info(ficha)
            fm_dob = info["birth_date"]
            fm_age = info["age"]
            fm_country = normalizar(info["country"] or "")
            equipo = info["team"] or c.get("teamName")
            sim_club = max(sim_club, fuzz.token_set_ratio(club_n, normalizar_club(equipo)) if club_n else 0)

            # Coincidencia de nacionalidad
            misma_nacion = bool(pais_opta and fm_country and (pais_opta in fm_country or fm_country in pais_opta))

            # Coincidencia de edad
            misma_edad = False
            if edad is not None and fm_age is not None:
                try:
                    misma_edad = abs(edad - int(fm_age)) <= 1
                except (ValueError, TypeError):
                    pass

            # Coincidencia de dorsal (no descarta si difiere: cambia entre temporadas y clubes)
            mismo_dorsal = False
            if dorsal is not None and info["shirt"] is not None:
                try:
                    mismo_dorsal = int(dorsal) == int(info["shirt"])
                except (ValueError, TypeError):
                    pass

            # 1. Con fecha de nacimiento real (no de relleno)
            if dob and fm_dob and not fecha_relleno(dob) and not fecha_relleno(fm_dob):
                if misma_fecha(dob, fm_dob):
                    return (sim_club >= 50 or sim >= 80 or (misma_nacion and sim >= 65)
                            or (mismo_dorsal and sim >= 50))
                else:
                    return False

            # 2. Con fecha de relleno en Opta o FotMob: nos apoyamos en dorsal + edad + nacionalidad + club
            if (fecha_relleno(dob) or (fm_dob and fecha_relleno(fm_dob))) or (dob and not fm_dob):
                if sim_club >= 70 and (misma_nacion or misma_edad or mismo_dorsal or sim >= 80):
                    return True
                if misma_edad and misma_nacion and (sim_club >= 50 or sim >= 80):
                    return True
                if mismo_dorsal and misma_edad and sim >= 65:
                    return True

            # 3. Sin fecha: club, dorsal y nombre
            if sim_club >= 70 and (sim >= 70 or misma_nacion or mismo_dorsal):
                return True
            if not club_n and sim >= 90:
                return True

            return False

        def elegir(cands):
            for _, sim, sim_club, c in puntuar(cands):
                if confirmar(sim, sim_club, c):
                    return c
            return None

        if liga_id:
            m = elegir(self.jugadores_liga(liga_id))
            if m:
                return m
        for q in variantes_nombre(player, busqueda=True):
            m = elegir(self.buscar(q))
            if m:
                return m
        return None

    def squad(self, team_id: int) -> List[Dict[str, Any]]:
        data = self._json("teams", id=team_id) or {}
        members = []
        for grupo in (data.get("squad", {}) or {}).get("squad", []) or []:
            if grupo.get("title") == "coach":
                continue
            members.extend(grupo.get("members", []) or [])
        return members

    def jugador(self, player_id: int) -> Dict[str, Any]:
        # Caché: la ficha se pide al confirmar la foto y otra vez al sacar club y liga
        if player_id not in self._fichas:
            self._fichas[player_id] = self._json("playerData", id=player_id) or {}
        return self._fichas[player_id]

    def es_internacional(self, league_id: int) -> bool:
        return (self.catalogo_ligas().get(league_id) or {}).get("ccode") == "INT"

    def liga_equipo(self, team_id: int) -> Optional[Dict[str, Any]]:
        """Liga nacional actual del equipo: {id, name}. En femenino `primaryLeagueId` suele venir a 0: manda la
        clasificación. Las copas internacionales (Champions, Libertadores) no cuentan: si FotMob no tiene la liga
        del país (Suiza, Brasil...), None antes que una liga equivocada."""
        if team_id not in self._ligas_equipo:
            data = self._json("teams", id=team_id) or {}
            det = data.get("details") or {}
            cands = [{"id": int(d["leagueId"]), "name": d.get("leagueName")}
                     for d in ((t.get("data") or {}) for t in data.get("table") or []) if d.get("leagueId")]
            if det.get("primaryLeagueId"):
                cands.append({"id": int(det["primaryLeagueId"]), "name": det.get("primaryLeagueName")})
            cands = [c for c in cands if not self.es_internacional(c["id"])]
            # Preferencia: la del país del club
            pais = [c for c in cands if (self.catalogo_ligas().get(c["id"]) or {}).get("ccode") == det.get("country")]
            self._ligas_equipo[team_id] = (pais or cands or [None])[0]
        return self._ligas_equipo[team_id]

    def catalogo_ligas(self) -> Dict[int, Dict[str, Any]]:
        """Todas las competiciones de FotMob: {id: {name, ccode}}."""
        if self._catalogo is None:
            data = self._json("allLeagues") or {}
            self._catalogo = {}
            for grupo in (data.get("international") or []) + (data.get("countries") or []):
                for l in grupo.get("leagues") or []:
                    self._catalogo[int(l["id"])] = {"name": l.get("name"), "ccode": grupo.get("ccode")}
        return self._catalogo

    def image(self, url: str) -> Optional[bytes]:
        try:
            r = self.session.get(url, timeout=20)
            ctype = r.headers.get("content-type", "")
            if r.status_code == 200 and ctype.startswith("image/") and len(r.content) > 500:
                return r.content
        except requests.RequestException:
            pass
        return None

    def opta_image(self, player_id: str, team_ids) -> Optional[bytes]:
        """Foto oficial Opta. Se prueba con cada equipo del jugador (la URL exige el equipo correcto)."""
        for team_id in dict.fromkeys(t for t in team_ids if t):
            try:
                r = self.session.get(OPTA_PLAYER_IMG.format(team_id=team_id, player_id=player_id),
                                     timeout=20, allow_redirects=False)
                if r.status_code == 200 and r.headers.get("content-type", "").startswith("image/") \
                        and len(r.content) > 500:
                    return r.content
            except requests.RequestException:
                pass
        return None

    def opta_badge(self, team_id: str) -> Optional[bytes]:
        try:
            r = self.session.get(OPTA_TEAM_IMG.format(team_id=team_id), timeout=20, allow_redirects=False)
            if r.status_code == 200 and r.headers.get("content-type", "").startswith("image/") and len(r.content) > 500:
                return r.content
        except requests.RequestException:
            pass
        return None

    def subir_foto_opta(self, store, player_id: str, team_ids) -> Optional[str]:
        img = self.opta_image(player_id, team_ids)
        return store.upload(BUCKET_PLAYER_PHOTOS, f"{player_id}_opta.jpg", img, "image/jpeg") if img else None


def emparejar_equipos(opta_teams: List[Dict[str, Any]], fm_teams: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """{opta_team_id: equipo_fotmob}. Emparejamiento 1 a 1 de mayor a menor similitud."""
    candidatos = []
    for ot in opta_teams:
        nombres_o = {normalizar_club(ot.get("name")), normalizar_club(ot.get("short_name"))} - {""}
        for ft in fm_teams:
            nombres_f = {normalizar_club(ft.get("name")), normalizar_club(ft.get("shortName"))} - {""}
            score = max((fuzz.token_set_ratio(a, b) for a in nombres_o for b in nombres_f), default=0)
            candidatos.append((score, ot["id"], ft))
    candidatos.sort(key=lambda c: -c[0])
    usados_o, usados_f, out = set(), set(), {}
    for score, oid, ft in candidatos:
        if score < 70 or oid in usados_o or ft["id"] in usados_f:
            continue
        out[oid] = ft
        usados_o.add(oid)
        usados_f.add(ft["id"])
    return out


def emparejar_jugador(player: Dict[str, Any], squad: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Busca al jugador Opta en la plantilla FotMob usando coincidencia multi-criterio:
    variantes de nombre, fecha de nacimiento (misma_fecha con tolerancia), edad (+/-1 año),
    nacionalidad y dorsal."""
    if not squad:
        return None

    dob = str(player.get("birth_date") or "")[:10]
    edad = _edad(dob)
    pais_opta = normalizar(player.get("country") or player.get("citizenship") or "")
    dorsal = player.get("shirt_number")

    def sim_nombre(m: Dict[str, Any]) -> int:
        nombre_m = normalizar(m.get("name"))
        if not nombre_m:
            return 0
        mejores = [fuzz.token_set_ratio(v, nombre_m) for v in variantes_nombre(player)]
        return max(mejores) if mejores else 0

    puntuados = []
    for m in squad:
        s_nom = sim_nombre(m)
        m_dob = misma_fecha(dob, m.get("dateOfBirth")) if dob else False
        
        m_edad = False
        if edad and m.get("age"):
            try:
                m_edad = abs(int(m["age"]) - edad) <= 1
            except (ValueError, TypeError):
                m_edad = False

        m_pais = False
        if pais_opta:
            cname = normalizar(m.get("cname") or "")
            ccode = normalizar(m.get("ccode") or "")
            m_pais = bool((cname and (cname in pais_opta or pais_opta in cname)) or
                          (ccode and ccode in pais_opta))

        m_dorsal = False
        if dorsal is not None and m.get("shirtNumber") is not None:
            try:
                m_dorsal = int(m["shirtNumber"]) == int(dorsal)
            except (ValueError, TypeError):
                m_dorsal = False

        score = s_nom
        if m_dob:
            score += 35
        if m_edad:
            score += 15
        if m_pais:
            score += 15
        if m_dorsal:
            score += 20

        # Validación mínima para evitar falsos positivos
        valido = False
        if m_dob and (s_nom >= 40 or m_dorsal or m_pais):
            valido = True
        elif m_dorsal and (s_nom >= 60 or m_edad or m_pais):
            valido = True
        elif s_nom >= 80:
            valido = True
        elif s_nom >= 60 and m_edad and m_pais:
            valido = True

        if valido:
            puntuados.append((score, s_nom, m))

    if not puntuados:
        return None

    puntuados.sort(key=lambda x: (x[0], x[1]), reverse=True)
    return puntuados[0][2]



def sincronizar_fotos(store, fotmob: FotMobClient, league_fotmob_id: int,
                      opta_teams: List[Dict[str, Any]], players_by_team: Dict[str, List[Dict[str, Any]]],
                      ya_con_foto: set, now_iso: str, refrescar: bool = False,
                      con_foto_opta: Optional[set] = None, solo_escudos: bool = False) -> Tuple[int, int]:
    """
    Sube escudos y fotos que falten. Devuelve (escudos_subidos, fotos_subidas).
    `players_by_team`: {opta_team_id: [jugador con id, name, birth_date, shirt_number]}.
    Primero se intenta la foto Opta; FotMob solo pone foto a quien Opta no tenga.
    `solo_escudos`: las fotos se buscan por nombre aparte (pipeline/fotos_jugadoras.py).
    """
    if solo_escudos:
        players_by_team = {}
    con_foto_opta = con_foto_opta or set()
    fm_teams = fotmob.league_teams(league_fotmob_id) if league_fotmob_id else []
    if not fm_teams:
        logger.warning(f"  FotMob: sin equipos para la liga {league_fotmob_id}")
        return 0, 0
    mapa = emparejar_equipos(opta_teams, fm_teams)
    logger.info(f"  FotMob: {len(mapa)}/{len(opta_teams)} equipos emparejados")

    team_rows, player_rows = [], []
    escudos = fotos = 0
    foto_opta: Dict[str, str] = {}
    for ot in opta_teams:
        for p in players_by_team.get(ot["id"], []):
            if p["id"] in foto_opta or (p["id"] in con_foto_opta and not refrescar):
                continue
            url = fotmob.subir_foto_opta(store, p["id"], (ot["id"], p.get("current_team_id")))
            if url:
                foto_opta[p["id"]] = url
                player_rows.append({"id": p["id"], "name": p["name"], "photo_url": url, "photo_updated_at": now_iso})
                fotos += 1
    logger.info(f"  Opta: {len(foto_opta)} fotos oficiales")

    for ot in opta_teams:
        ft = mapa.get(ot["id"])
        team_row = {"id": ot["id"], "name": ot["name"], "updated_at": now_iso}
        if ft:
            team_row["fotmob_id"] = ft["id"]
        if refrescar or not ot.get("badge_url"):
            # Escudo oficial Opta por ID (sin emparejar nombres); FotMob solo si Opta no lo tiene
            img, nombre = fotmob.opta_badge(ot["id"]), f"{ot['id']}_opta.png"
            if not img and ft:
                img, nombre = fotmob.image(FOTMOB_TEAM_IMG.format(id=ft["id"])), f"{ot['id']}.png"
            url = store.upload(BUCKET_TEAM_BADGES, nombre, img, "image/png") if img else None
            if url:
                # ?v= evita que el navegador muestre el escudo anterior guardado en la misma ruta
                team_row["badge_url"] = f"{url}?v={int(time.time())}"
                escudos += 1
        team_rows.append(team_row)
        if not ft:
            logger.info(f"    Sin equivalente FotMob para {ot.get('name')}")
            continue

        jugadores = players_by_team.get(ot["id"], [])
        if not jugadores:
            continue
        squad = fotmob.squad(ft["id"])
        time.sleep(PAUSA)
        if not squad:  # sin plantilla en FotMob: jugadores con minutos en la liga (por equipo si se reconoce)
            liga = fotmob.jugadores_liga(league_fotmob_id)
            club = normalizar_club(ft.get("name"))
            squad = [m for m in liga if fuzz.token_set_ratio(club, normalizar_club(m.get("teamName"))) >= 80] or liga
        for p in jugadores:
            m = emparejar_jugador(p, squad)
            if not m:
                continue
            row = {"id": p["id"], "name": p["name"], "fotmob_id": m["id"], "updated_at": now_iso}
            if m.get("height") and not p.get("height"):
                row["height"] = int(m["height"])
            if m.get("transferValue"):
                row["market_value"] = int(m["transferValue"])
            tiene_opta = p["id"] in foto_opta or p["id"] in con_foto_opta
            if not tiene_opta and (refrescar or p["id"] not in ya_con_foto):
                img = fotmob.image(FOTMOB_PLAYER_IMG.format(id=m["id"]))
                url = store.upload(BUCKET_PLAYER_PHOTOS, f"{p['id']}.png", img, "image/png") if img else None
                if url:
                    row["photo_url"] = url
                    row["photo_updated_at"] = now_iso
                    fotos += 1
            player_rows.append(row)

    # Upserts parciales: agrupar por conjunto de columnas (PostgREST exige claves homogéneas por lote)
    for rows, table in ((team_rows, "teams"), (player_rows, "players")):
        por_claves: Dict[tuple, List[Dict[str, Any]]] = {}
        for r in rows:
            por_claves.setdefault(tuple(sorted(r)), []).append(r)
        for grupo in por_claves.values():
            store.upsert(table, grupo)
    return escudos, fotos
