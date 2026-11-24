"""
pipeline/sd_ligas.py
Jugadoras desde Soccerdonna, por ligas elegidas en /admin (tabla sd_leagues):
  catalogo   Lee https://www.soccerdonna.de/en/2010/startseite/wettbewerbeDE.html → sd_leagues
             y sugiere la competición Opta de cada liga (nombre + país contra opta_catalog)
  descargar  Ligas con enabled: clubes → plantillas → ficha de cada jugadora (datos, valor de mercado y su
             evolución, traspasos, selección, lesiones; en inglés) → foto de FotMob
  opta       Ligas con competición Opta: última temporada con datos por jugadora → plantillas, partidos
             (jugados y por jugar), eventing + matchstats, valoración por partido
  vincular   Une cada jugadora de Soccerdonna con la de Opta (nombre + fecha de nacimiento o club): una sola ficha
  escudos    Escudos PNG transparentes de FotMob para los clubes de la liga y el club actual de cada jugadora
  fotos      Jugadoras de la liga sin foto (también las que solo están en Opta): FotMob y, si no, ceroacero (ligas de
             ceroacero), Soccerdonna, 365scores o la oficial de Opta
  todo       Flujo estándar completo (todas las temporadas elegidas), ver flujo():
             Soccerdonna (plantillas de la liga) → Opta de esa liga (+ Champions/copas al final) → vincular
             (en la liga y entre ligas) → completar (las de Opta sin ficha: Soccerdonna fuera de su liga) →
             club según último partido → escudos → fotos FotMob → coche escoba (ceroacero)

Descargas automáticas (GitHub Action), mismo flujo:
  actualizar-opta         Martes. Flujo estándar con la última temporada Opta de cada liga (y las elegidas sin
                          partidos). Soccerdonna solo lee fichas nuevas (fichajes) o guardadas hace > --refresco-dias.
  actualizar-soccerdonna  Mensual. Flujo estándar sin Opta + revisión de retiradas
  completar               Inverso: jugadoras de la API sin ficha → busca en Soccerdonna y foto (FotMob, luego 365scores)
  retiradas               Revisa si se han retirado las jugadoras con estadísticas que no están en ninguna plantilla
  recalcular              Ratings por partido y notas de temporada desde la caché de partidos (sin descargar nada):
                          tras cambiar la fórmula en pipeline/scoring.py

Por partes (panel /admin y GitHub Action .github/workflows/pipeline.yml):
  pasos --pasos todo|soccerdonna,opta,fotmob [--liga ESP1] [--todas-temporadas]
  cola                    Las descargas pedidas desde /admin (ingestion_runs 'queued'), una tras otra hasta vaciarla

Uso:
    python -m pipeline.sd_ligas pasos --pasos opta --liga ESP1
    python -m pipeline.sd_ligas catalogo
    python -m pipeline.sd_ligas todo [--liga ESP1] [--limit 10] [--max-matches 5]
    python -m pipeline.sd_ligas actualizar-opta [--liga ESP1] [--todas-temporadas]
    python -m pipeline.sd_ligas actualizar-soccerdonna [--liga ESP1] [--refresco-dias 25]
"""

import argparse
import logging
import re
import time
from datetime import datetime, timedelta, timezone
from html import unescape
from typing import Any, Dict, List, Optional

from rapidfuzz import fuzz

from . import traducciones as en
from . import fotos_365
from .config import BUCKET_PLAYER_PHOTOS, BUCKET_TEAM_BADGES, FOTMOB_PLAYER_IMG, FOTMOB_TEAM_IMG
from .photos import FotMobClient, misma_fecha, normalizar, normalizar_club, sim_nombre, variantes_nombre
from .soccerdonna import (MAX_CANDIDATAS, SD_BASE, SDClient, SoccerdonnaSync, _fecha, _homogeneo, candidatas_jugadora,
                          fecha_relleno, filas_jugadora, now_iso)
from .storage import Store, get_supabase_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("sd_ligas")

CATALOGO = "/en/2010/startseite/wettbewerbeDE.html"
PK = (("player_market_values", "player_id,date"), ("player_transfers", "tm_transfer_id"),
      ("player_injuries", "player_id,from_date,injury"), ("player_national_teams", "player_id,sd_team_id"))


def _txt(html: str) -> str:
    return unescape(re.sub(r"<[^>]+>", " ", html)).replace("\xa0", " ").strip()


SECCIONES_INT = {"Internationaler Vereinspokal": "International club cup", "Nationalmannschaft": "National team",
                 "Juniorennationalmannschaft": "Youth national team", "Nationalmannschaft Quali": "National team qualifiers"}


def region_internacional(nombre: str) -> str:
    """Región del catálogo Opta ("Europe", "Asia"...) de una competición internacional de Soccerdonna."""
    n = nombre.lower()
    for claves, region in ((("uefa", " em ", "europa", "europameister", "em qualifikation", "all island"), "Europe"),
                           (("afc", "asia", "asien"), "Asia"), (("caf", "africa"), "Africa"),
                           (("concacaf", "shebelieves"), "N/C America"), (("conmebol",), "South America")):
        if any(c in f" {n} " for c in claves):
            return region
    return "World"


def parecido_liga(sd_nombre: str, opta_nombre: str) -> float:
    """Parecido entre el nombre de Soccerdonna y el de Opta; reconoce las siglas
    ("National Women's Soccer League" ↔ "NWSL")."""
    a, b = normalizar(sd_nombre), normalizar(opta_nombre)
    siglas = "".join(w[0] for w in re.split(r"[\s'’-]+", a) if w and w not in {"s"})
    if b.replace(" ", "") and b.replace(" ", "") == siglas:
        return 100.0
    return fuzz.token_set_ratio(a, b)


def nombre_liga(nombre: str) -> str:
    """Soccerdonna parte algunas ligas en torneos cortos (México: "Liga Femenil Apertura" / "Liga Femenil Clausura")
    que Opta engloba en una sola competición: se guarda el nombre de la liga, sin Apertura/Clausura."""
    return re.sub(r"\s+\b(Apertura|Clausura)\b", "", nombre).strip()


def catalogo(store: Store, sd: SDClient):
    html = sd.get(CATALOGO) or ""
    ligas, pais, seccion = {}, None, None
    for fila in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S):
        cab = re.search(r'<td class="al fb" colspan="2">.*?title="([^"]+)"', fila, re.S)
        if cab:
            pais, seccion = en.PAISES.get(cab.group(1), cab.group(1)), None
            continue
        # Secciones internacionales (sin bandera): no tienen columna de nivel
        sec = re.search(r'<td class="al fb" colspan="2">\s*([^<]+?)\s*</td>', fila)
        if sec and "wettbewerb_" not in fila:
            seccion = SECCIONES_INT.get(sec.group(1), sec.group(1))
            continue
        m = re.search(r'href="/(?:de|en)/([^/]+)/startseite/wettbewerb_([A-Z0-9]+)\.html"[^>]*title="([^"]+)"', fila)
        if not m or m.group(2) in ligas:
            continue
        celdas = [_txt(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", fila, re.S)]
        num = lambda i: int(re.sub(r"\D", "", celdas[i]) or 0) if len(celdas) > i else None
        nombre = nombre_liga(unescape(m.group(3)).strip())
        if seccion:
            nivel, equipos, jugadoras = seccion, num(2), num(3)
            pais_liga = region_internacional(nombre)
        else:
            nivel = re.sub(r"^(\d)\. Liga$", r"Tier \1", celdas[2]) if len(celdas) > 2 else None
            equipos, jugadoras, pais_liga = num(3), num(4), pais
        ligas[m.group(2)] = {"code": m.group(2), "name": nombre, "country": pais_liga,
                             "level": nivel, "teams": equipos, "players": jugadoras,
                             "url": f"/en/{m.group(1)}/startseite/wettbewerb_{m.group(2)}.html", "updated_at": now_iso()}
    # Competición Opta sugerida: mismo país y nombre parecido (solo si aún no tiene una)
    actuales = {l["code"]: l for l in store.select_all("sd_leagues", "code,opta_competition_id")}
    opta = {}
    for c in store.select_all("opta_catalog", "competition_id,competition_name,country,data_level"):
        if (c.get("data_level") or "").startswith("jugadora"):
            opta.setdefault(c["competition_id"], c)
    for l in ligas.values():
        if actuales.get(l["code"], {}).get("opta_competition_id"):
            continue
        pais = normalizar(en.pais_opta(l["country"]))
        # Empate (p. ej. "NWSL" y "NWSL Challenge Cup" para la Challenge Cup): gana el nombre más parecido entero
        mejor = max(((parecido_liga(l["name"], c["competition_name"]), c)
                     for c in opta.values() if normalizar(c["country"]) == pais),
                    key=lambda t: (t[0], fuzz.ratio(normalizar(l["name"]), normalizar(t[1]["competition_name"]))),
                    default=(0, None))
        if mejor[1] and mejor[0] >= 60:
            l["opta_competition_id"] = mejor[1]["competition_id"]
    for grupo in _homogeneo(list(ligas.values())):
        store.upsert("sd_leagues", grupo, on_conflict="code")
    logger.info(f"Catálogo Soccerdonna: {len(ligas)} ligas, "
                f"{sum(1 for l in ligas.values() if l.get('opta_competition_id'))} enlazadas con Opta")


SD_MEDIUM = SD_BASE + "/static/bilder_sd/mediumfotos/{id}.jpg"  # escudos y logos de liga nítidos
_imagenes: Dict[str, Optional[str]] = {}


def imagen_sd(store: Store, sd: SDClient, url: Optional[str], ruta: str) -> Optional[str]:
    """Escudo/logo de Soccerdonna → Storage team-badges (una vez por ejecución). Sin imagen: None."""
    if not url:
        return None
    if url not in _imagenes:
        img = sd.image(url)
        subida = store.upload(BUCKET_TEAM_BADGES, ruta, img, "image/jpeg") if img else None
        _imagenes[url] = f"{subida}?v={int(time.time())}" if subida else None
    return _imagenes[url]


# Descargas semanales: clasificación y plantillas siempre frescas (fichajes); fichas ya guardadas solo cada
# REFRESCO_DIAS (valor de mercado, traspasos, lesiones); las jugadoras nuevas, siempre
FRESCO_DIAS = 0.5
REFRESCO_DIAS = 30


def clubes_liga(sd: SDClient, url: str) -> List[Dict[str, Any]]:
    html = sd.get(url, FRESCO_DIAS) or ""
    vistos = {}
    # Tabla principal de clubes (Vereine / Clubs): <table class="standard_tabelle" ...>
    m_tab = re.search(r'<table class="standard_tabelle"[^>]*>.*?</table>', html, re.S)
    if m_tab:
        for slug, cid, nombre in re.findall(r'href="/(?:en|de)/([^/]+)/startseite/verein_(\d+)\.html" title="([^"]+)"', m_tab.group(0)):
            vistos.setdefault(int(cid), {"slug": slug, "sd_id": int(cid), "name": unescape(nombre)})
    # Fallback: clasificación (style="s10")
    if not vistos:
        for slug, cid, nombre in re.findall(r'href="/(?:en|de)/([^/]+)/startseite/verein_(\d+)\.html" style="s10" alt="([^"]+)"', html):
            vistos.setdefault(int(cid), {"slug": slug, "sd_id": int(cid), "name": unescape(nombre)})
    return list(vistos.values())


COPA_INTERNACIONAL = "International club cup"
SELECCIONES = {"National team", "Youth national team", "National team qualifiers"}


def es_copa_internacional(liga: Dict[str, Any]) -> bool:
    """Champions League, Europa Cup, AFC... (sección "Internationaler Vereinspokal" del catálogo) y torneos de
    selecciones (Mundial Sub-17, Sub-20...): sus equipos ya tienen liga (o son selecciones), así que la competición
    nunca es la liga ni el club de una jugadora."""
    return (liga.get("level") or "") == COPA_INTERNACIONAL or es_selecciones_sd(liga)


def es_selecciones_sd(liga: Dict[str, Any]) -> bool:
    """Torneo de selecciones de Soccerdonna (Mundial Sub-17...): sus "clubes" son selecciones; el club de cada
    jugadora es el de su ficha."""
    return (liga.get("level") or "") in SELECCIONES


def clubes_copa(sd: SDClient, url: str) -> List[Dict[str, Any]]:
    """Clubes de una copa internacional desde su página de participantes (teilnehmer/pokalwettbewerb_X), con el
    nombre de la liga de cada club ("FC Barcelona" → "Primera División Femenina")."""
    ruta = re.sub(r"/startseite/(?:pokal)?wettbewerb_", "/teilnehmer/pokalwettbewerb_", url)
    html = sd.get(ruta, FRESCO_DIAS) or ""
    vistos = {}
    for slug, cid, nombre, liga in re.findall(r'href="/(?:en|de)/([^/]+)/startseite/verein_(\d+)\.html" class="[^"]*">'
                                              r'([^<]+)</a>(?:\s*<br\s*/?>\s*([^<]*))?', html):
        vistos.setdefault(int(cid), {"slug": slug, "sd_id": int(cid), "name": unescape(nombre).strip(),
                                     "liga": unescape(liga or "").strip() or None})
    if not vistos:  # sin página de participantes: los clubes de la portada (clasificación, últimos partidos)
        for slug, cid, nombre in re.findall(r'href="/(?:en|de)/([^/]+)/startseite/verein_(\d+)\.html" '
                                            r'(?:class|style)="s10" (?:alt|title)="([^"]+)"', sd.get(url, FRESCO_DIAS) or ""):
            vistos.setdefault(int(cid), {"slug": slug, "sd_id": int(cid), "name": unescape(nombre).strip(), "liga": None})
    return list(vistos.values())


def sin_pagina_sd(liga: Dict[str, Any]) -> bool:
    """Copa internacional que Soccerdonna no tiene (Libertadores, CAF Champions League): sus clubes salen de Opta."""
    return es_copa_internacional(liga) and not liga.get("url")


MIN_COMUNES_CLUB = 2  # jugadoras del equipo Opta que tienen que estar en la plantilla de Soccerdonna


def equipos_de_competicion(store: Store, comp_id: str) -> Dict[str, List[str]]:
    """Equipo Opta → jugadoras que jugaron con él en la competición (todas las temporadas descargadas)."""
    out: Dict[str, List[str]] = {}
    for r in store.select_all("player_season_stats", "player_id,team_id", competition_id=comp_id):
        if r.get("team_id"):
            out.setdefault(r["team_id"], []).append(r["player_id"])
    for t in store.select_all("teams", "id", competition_id=comp_id):
        out.setdefault(t["id"], [])
    return out


# Palabras que no distinguen a un club: sin ellas el buscador de Soccerdonna sí encuentra los nombres largos de Opta
# ("SC Corinthians Paulista" → "Corinthians", "US des Forces Armées et de Sécurité de Bamako" → "Forces Armées")
_GENERICAS = {"sc", "ca", "csd", "cfp", "cd", "cf", "fc", "ec", "se", "sd", "ac", "as", "us", "ad", "afc", "ldu", "club",
              "asociacion", "associacao", "deportivo", "deportiva", "deportes", "esportes", "sport", "sporting", "football",
              "futbol", "futebol", "de", "del", "la", "el", "do", "da", "des", "et", "y", "e", "paulista", "femenino",
              "feminino", "women", "ladies", "queens", "united", "atletico", "athletic", "liga", "universitaria"}


def variantes_club(nombre: str) -> List[str]:
    """Búsquedas para un equipo Opta: el nombre entero, sin las siglas de los extremos ("Gaborone United FC" →
    "Gaborone United"), sin palabras genéricas, con iniciales ("AS Forces Armées Royales" → "AS FAR") y cada
    palabra propia, de la más larga a la más corta."""
    palabras = [w for w in re.split(r"[\s\-]+", nombre) if w]
    sigla = lambda w: len(w) <= 4 and normalizar(w) in _GENERICAS
    recorte = palabras[:]
    while recorte and sigla(recorte[0]):
        recorte = recorte[1:]
    while recorte and sigla(recorte[-1]):
        recorte = recorte[:-1]
    propias = [w for w in palabras if normalizar(w) not in _GENERICAS and len(w) > 2]
    iniciales = "".join(w[0] for w in propias).upper()
    out = [nombre, " ".join(recorte), " ".join(propias)]
    if len(propias) >= 3:
        out += [f"{palabras[0]} {iniciales}" if sigla(palabras[0]) else iniciales]
    out += sorted(propias, key=len, reverse=True)[:4]
    return list(dict.fromkeys(v for v in out if v.strip()))


def club_verificado(sd: SDClient, nombre: str, jugadoras: List[Dict[str, Any]]):
    """(club de Soccerdonna, jugadoras en común) del equipo Opta `nombre`: el primero que encuentre alguna variante
    del nombre y tenga en su plantilla actual MIN_COMUNES_CLUB de `jugadoras` (o se llame casi igual)."""
    vistos = set()
    for q in variantes_club(nombre):
        c = sd.buscar_club(q)
        if not c or c["id"] in vistos:
            continue
        vistos.add(c["id"])
        plantel = plantilla(sd, {"slug": c.get("slug") or "x", "sd_id": c["id"]})
        comunes = sum(1 for j in plantel if any(sim_nombre(o, j["name"]) >= 85 for o in jugadoras))
        parecido = fuzz.ratio(normalizar_club(nombre), normalizar_club(c["name"]))
        if comunes >= MIN_COMUNES_CLUB or parecido >= 95:
            return c, comunes
        logger.info(f"  {nombre}: descartado {c['name']} de Soccerdonna ({comunes} jugadoras en común, "
                    f"nombre {parecido:.0f}%)")
    return None, 0


def clubes_desde_opta(store: Store, sd: SDClient, liga: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Clubes de Soccerdonna de una copa sin página allí: cada equipo Opta de la competición se busca por nombre y
    vale si en su plantilla actual están al menos MIN_COMUNES_CLUB de las jugadoras que jugaron con él en Opta
    (o el nombre es prácticamente el mismo). El vínculo queda en teams.sd_team_id / sd_name (partidos y vincular)
    y el equipo Opta toma el escudo del club. Sin club en Soccerdonna, el equipo Opta sigue siendo el de sus
    jugadoras. Formato de clubes_copa: {slug, sd_id, name, liga}."""
    comp = liga.get("opta_competition_id")
    if not comp:
        return []
    por_equipo = equipos_de_competicion(store, comp)
    if not por_equipo:
        logger.info(f"  {liga['name']}: aún sin equipos de Opta (se descarga Opta primero)")
        return []
    equipos = {t["id"]: t for t in store.select_all("teams", "id,name,sd_team_id,sd_name,badge_url")
               if t["id"] in por_equipo}
    ids = {pid for ps in por_equipo.values() for pid in ps}
    jugadoras = {p["id"]: p for p in store.select_all("players", "id,name,first_name,last_name,match_name")
                 if p["id"] in ids}
    clubes, sin = [], []
    for tid, t in equipos.items():
        nombres = [jugadoras[pid] for pid in set(por_equipo[tid]) if pid in jugadoras]
        conocido = str(t.get("sd_team_id") or "")
        if conocido.startswith("sd-") and conocido[3:].isdigit():
            c = {"id": int(conocido[3:]), "name": t.get("sd_name") or t["name"], "slug": "x"}
        else:
            c, comunes = club_verificado(sd, t["name"], nombres)
        if not c:
            sin.append(t["name"])
            continue
        club = {"slug": c.get("slug") or "x", "sd_id": c["id"], "name": c["name"], "liga": None, "opta": nombres}
        if not conocido:
            badge = imagen_sd(store, sd, SD_MEDIUM.format(id=c["id"]), f"sd/{c['id']}.jpg")
            cambios = {"sd_team_id": f"sd-{c['id']}", "sd_name": _nombre_club(c["name"])}
            if badge and not t.get("badge_url"):
                cambios["badge_url"] = badge
            store.update("teams", cambios, id=tid)
            logger.info(f"  {t['name']} → {c['name']} (verein_{c['id']}, {comunes} jugadoras en común)")
        clubes.append(club)
    logger.info(f"  {liga['name']}: {len(clubes)}/{len(equipos)} equipos Opta con club en Soccerdonna"
                f"{f'; sin club (quedan con el equipo Opta): ' + ', '.join(sorted(sin)) if sin else ''}")
    # Dos equipos Opta con el mismo club (nombres parecidos): una sola vez, con las jugadoras Opta de los dos
    unicos: Dict[int, Dict[str, Any]] = {}
    for c in clubes:
        if c["sd_id"] in unicos:
            unicos[c["sd_id"]]["opta"] = unicos[c["sd_id"]]["opta"] + c["opta"]
        else:
            unicos[c["sd_id"]] = c
    return list(unicos.values())


def liga_de_club(catalogo: Dict[str, Dict[str, Any]], prof: Optional[Dict[str, Any]],
                 club: Dict[str, Any]) -> Dict[str, Any]:
    """Liga nacional de una jugadora que llega por una copa internacional: la de su ficha de Soccerdonna (código del
    catálogo) o, si no, la que dice la página de participantes, cuando ese nombre es de una sola liga (hay dos
    "Women's Super League": Inglaterra y Suiza)."""
    codigo = ((prof or {}).get("liga_actual_codigo") or "").upper()
    liga = catalogo.get(codigo)
    if not liga or es_copa_internacional(liga):
        mismas = [l for l in catalogo.values() if not es_copa_internacional(l)
                  and club.get("liga") and normalizar(l.get("name") or "") == normalizar(club["liga"])]
        liga = mismas[0] if len(mismas) == 1 else None
    if liga:
        return {"code": liga["code"], "name": liga["name"], "logo_url": liga.get("logo_url"), "country": liga.get("country")}
    # El nombre de la ficha, salvo si es otra competición internacional ("U-17 World Cup", "Freundschaftsspiele")
    nombre = (prof or {}).get("liga_actual_nombre") if not (codigo in catalogo and es_copa_internacional(catalogo[codigo])) else None
    return {"code": None, "name": club.get("liga") or nombre, "logo_url": None, "country": None}


def plantilla(sd: SDClient, club: Dict[str, Any]) -> List[Dict[str, Any]]:
    html = sd.get(f"/en/{club['slug']}/kader/verein_{club['sd_id']}.html", FRESCO_DIAS) or ""
    vistas = {}
    for slug, pid, nombre in re.findall(r'href="/en/([^/]+)/profil/spieler_(\d+)\.html"\s+class="fb s10" title="([^"]+)"', html):
        vistas.setdefault(int(pid), {"slug": slug, "sd_id": int(pid), "name": unescape(nombre)})
    return list(vistas.values())


def club_preferido(store: Store, sd: SDClient, ligas: List[Dict[str, Any]]) -> Dict[int, int]:
    """sd_id de jugadora → club de Soccerdonna que le corresponde cuando sale en varias plantillas (las canteranas
    del filial convocadas con el primer equipo están en las dos): el de la liga de más nivel ("Tier 1" antes que
    "Tier 2"). Se miran todas las ligas activas de los países que se descargan, también si solo se baja una (el
    filial solo no puede quitarle el primer equipo). Las plantillas quedan en caché para la descarga."""
    from .cz_ligas import es_ceroacero
    paises = {l["country"] for l in ligas if not es_copa_internacional(l)}
    todas = [l for l in store.select_all("sd_leagues", "code,country,url,enabled,level")
             if l.get("url") and not es_ceroacero(l) and not es_copa_internacional(l) and l["country"] in paises
             and (l["enabled"] or l["code"] in {x["code"] for x in ligas})]
    nivel = lambda l: (l.get("level") or "Z") if (l.get("level") or "").startswith("Tier") else "Z"
    vistas: Dict[int, Dict[int, str]] = {}
    for liga in sorted(todas, key=nivel):
        for club in clubes_liga(sd, liga["url"]):
            for j in plantilla(sd, club):
                vistas.setdefault(j["sd_id"], {}).setdefault(club["sd_id"], nivel(liga))
    elegido = {}
    for pid, clubes in vistas.items():
        if len(clubes) > 1:
            # mismo nivel (fichaje con la plantilla vieja sin actualizar): sin preferencia, como hasta ahora
            orden = sorted(clubes.items(), key=lambda kv: kv[1])
            if orden[0][1] < orden[1][1]:
                elegido[pid] = orden[0][0]
    if elegido:
        logger.info(f"Soccerdonna: {len(elegido)} jugadoras en dos plantillas → club de la liga de más nivel")
    return elegido


def foto_fotmob(store: Store, fotmob: FotMobClient, p: Dict[str, Any], club: str) -> Optional[str]:
    partes = p["name"].split()
    jugadora = {"id": p["id"], "name": p["name"], "match_name": p["name"], "first_name": partes[0] if partes else None,
                "last_name": " ".join(partes[1:]) or None, "birth_date": p.get("birth_date")}
    m = fotmob.buscar_jugador(jugadora, club, None)
    img = fotmob.image(FOTMOB_PLAYER_IMG.format(id=m["id"])) if m else None
    url = store.upload(BUCKET_PLAYER_PHOTOS, f"{p['id']}.png", img, "image/png") if img else None
    return f"{url}?v={int(time.time())}" if url else None


def catalogo_logo(store: Store, code: str) -> Dict[str, Any]:
    fila = store.select_all("sd_leagues", "logo_url", code=code)
    return {"logo_url": fila[0].get("logo_url")} if fila else {}


def descargar(store: Store, sd: SDClient, liga_code: Optional[str], limit: Optional[int],
              refresco_dias: int = REFRESCO_DIAS, con_fotos: bool = True, fase: str = "todas"):
    """`fase`: "antes_de_opta" (ligas con página en Soccerdonna), "desde_opta" (copas que Soccerdonna no tiene:
    sus clubes salen de los equipos Opta, así que van después del paso opta) o "todas"."""
    ligas = [l for l in store.select_all("sd_leagues", "code,name,country,url,enabled,level,opta_competition_id")
             if (l["code"] == liga_code if liga_code else l["enabled"])]
    if not ligas:
        raise SystemExit("No hay ligas de Soccerdonna marcadas en /admin")
    if fase == "antes_de_opta":
        ligas = [l for l in ligas if not sin_pagina_sd(l)]
    elif fase == "desde_opta":
        ligas = [l for l in ligas if sin_pagina_sd(l)]
    if not ligas:
        return
    # Copas internacionales (Champions...) al final: las jugadoras de los clubes de ligas activas ya están al día
    ligas.sort(key=es_copa_internacional)
    # Ligas solo de Opta (sin página en Soccerdonna ni copa internacional): sus jugadoras salen de las
    # plantillas Opta en el paso opta() y aquí no hay nada que leer
    for l in [l for l in ligas if not l.get("url") and not sin_pagina_sd(l)]:
        logger.info(f"▶ {l['name']} ({l['country']}): solo Opta, sin Soccerdonna")
    # Ligas que Soccerdonna no tiene, leídas de ceroacero.es (url de la competición allí): mismo formato "sd-"
    from .cz_ligas import descargar_liga as descargar_ceroacero, es_ceroacero
    for l in [l for l in ligas if es_ceroacero(l)]:
        try:
            descargar_ceroacero(store, {**l, **catalogo_logo(store, l["code"])}, limit, refresco_dias)
        except Exception as e:  # una web caída no tumba las demás ligas
            logger.warning(f"▶ {l['name']}: fallo en ceroacero ({e})")
    ligas = [l for l in ligas if (l.get("url") and not es_ceroacero(l)) or sin_pagina_sd(l)]
    if not ligas:
        return
    fotmob = FotMobClient()
    fotmob.cargar_asignados(store)
    tot = {"jugadoras": 0, "nuevas": 0, "al_dia": 0, "fotos": 0, "sin_ficha": 0, "otro_club": 0}
    # Jugadoras ya guardadas (también las unidas a su ficha Opta: se actualiza esa fila, no se crea otra "sd-")
    guardadas = {p["sd_id"]: p for p in store.select_all("players", "id,sd_id,sd_updated_at,photo_url,fm_team_name,"
                                                                    "sd_league_code") if p.get("sd_id")}
    ids = {k: p["id"] for k, p in guardadas.items()}
    catalogo_sd = {l["code"]: l for l in store.select_all("sd_leagues", "code,name,country,level,logo_url,enabled")}
    # Ligas nacionales que se descargan: sus jugadoras no las toca una copa internacional
    activas = {c for c, l in catalogo_sd.items() if l.get("enabled") and not es_copa_internacional(l)} | \
              {l["code"] for l in ligas if not es_copa_internacional(l)}
    limite = time.time() - refresco_dias * 86400
    club_de = club_preferido(store, sd, ligas)
    equipos_sd = {t["id"] for t in store.select_all("teams", "id")} if any(map(es_selecciones_sd, ligas)) else set()
    desde_opta: set = set()  # fichas leídas de las copas sin página en Soccerdonna (ver copas_desde_opta)
    for liga in ligas:
        copa = es_copa_internacional(liga)
        selec = es_selecciones_sd(liga)  # el club de la jugadora sale de su ficha, nunca la selección
        if sin_pagina_sd(liga):
            logger.info(f"▶ {liga['name']} ({liga['country']}): sin página en Soccerdonna, clubes desde Opta")
            clubes = clubes_desde_opta(store, sd, liga)
        else:
            clubes = clubes_copa(sd, liga["url"]) if copa else clubes_liga(sd, liga["url"])
        # Liga añadida en /admin por URL: aún no tiene nombre (se guarda el código); se lee del <h1>
        if liga["name"] == liga["code"] and liga.get("url"):
            h1 = re.search(r"<h1[^>]*>(.*?)</h1>", sd.get(liga["url"], FRESCO_DIAS) or "", re.S)
            if h1 and _txt(h1.group(1)):
                liga["name"] = nombre_liga(_txt(h1.group(1)))
                store.update("sd_leagues", {"name": liga["name"]}, code=liga["code"])
        logger.info(f"▶ {liga['name']} ({liga['country']}): {len(clubes)} clubes")
        logo = None
        if liga.get("url"):  # sin página en Soccerdonna tampoco hay logo allí: se queda el que tenga
            logo = imagen_sd(store, sd, SD_MEDIUM.format(id=liga["code"].lower()), f"ligas/sd-{liga['code']}.jpg")
            store.update("sd_leagues", {"logo_url": logo}, code=liga["code"])
        raw_sd_teams = [{
            "id": f"sd-{c['sd_id']}",
            "name": c["name"],
            "league_code": liga["code"],
            "country": liga["country"],
            "sd_url": c.get("url"),
            "badge_url": imagen_sd(store, sd, SD_MEDIUM.format(id=c["sd_id"]), f"sd/{c['sd_id']}.jpg"),
            "updated_at": now_iso(),
        } for c in clubes]
    # raw_soccerdonna_teams removed in clean_start_schema
        if selec:
            nuevos_ids: set = set()
            logger.info(f"  Selecciones: {len(clubes)} (el club de cada jugadora, el de su ficha)")
        elif copa:
            # Los clubes que ya tenemos siguen en su liga; los nuevos entran con la liga de la página de
            # participantes (se corrige con la ficha de sus jugadoras al leer su plantilla)
            existentes = {t["id"] for t in store.select_all("teams", "id")}
            nuevos = []
            for r, c in zip(raw_sd_teams, clubes):
                if r["id"] in existentes:
                    continue
                l = liga_de_club(catalogo_sd, None, c)
                nuevos.append({"id": r["id"], "name": r["name"], "country": l["country"], "badge_url": r["badge_url"],
                               "sd_league_code": l["code"], "league_name": l["name"], "league_logo_url": l["logo_url"],
                               "updated_at": r["updated_at"]})
            for grupo in _homogeneo(nuevos):
                store.upsert("teams", grupo)
            nuevos_ids = {r["id"] for r in nuevos}
            logger.info(f"  Copa internacional: {len(clubes) - len(nuevos)} clubes ya conocidos, {len(nuevos)} nuevos")
        else:
            store.upsert("teams", [{"id": r["id"], "name": r["name"], "country": r["country"],
                                    "badge_url": r["badge_url"],
                                    "sd_league_code": liga["code"], "league_name": liga["name"], "league_logo_url": logo,
                                    "updated_at": r["updated_at"]} for r in raw_sd_teams])
        hechas = 0
        for club in clubes:
            club_badge = imagen_sd(store, sd, SD_MEDIUM.format(id=club["sd_id"]), f"sd/{club['sd_id']}.jpg")
            pendiente: Dict[str, List[Dict[str, Any]]] = {}
            votos_liga: Dict[str, int] = {}
            for j in plantilla(sd, club):
                if limit and hechas >= limit:
                    break
                # También en la plantilla de otro club de más nivel (canterana del filial convocada con el primer
                # equipo): su club es ese, y se guarda al leer aquella plantilla
                if club_de.get(j["sd_id"], club["sd_id"]) != club["sd_id"]:
                    tot["otro_club"] += 1
                    continue
                # Copa sin página en Soccerdonna: solo las que jugaron la copa con este equipo en Opta (las demás de
                # la plantilla no tienen datos de esa competición)
                if club.get("opta") is not None and not any(sim_nombre(o, j["name"]) >= 80 for o in club["opta"]):
                    tot["sin_opta"] = tot.get("sin_opta", 0) + 1
                    continue
                previa = guardadas.get(j["sd_id"])
                # (las de una liga que ya se descarga son de esa liga: nunca se borran desde aquí)
                if club.get("opta") is not None and not (previa and previa.get("sd_league_code") in activas):
                    desde_opta.add(ids.get(j["sd_id"], f"sd-{j['sd_id']}"))
                # Copa internacional: la jugadora de un club de una liga que ya se descarga es de esa liga (allí se
                # actualiza su ficha); aquí solo entran las que no tenemos y las que solo llegaron por la copa
                if copa and previa and previa.get("sd_league_code") in activas:
                    tot["en_su_liga"] = tot.get("en_su_liga", 0) + 1
                    continue
                if previa and previa.get("sd_updated_at"):
                    hecha = datetime.fromisoformat(previa["sd_updated_at"].replace("Z", "+00:00")).timestamp()
                    # Ficha reciente, pero si aparece en la plantilla de otro club (fichaje, o era agente libre)
                    # se vuelve a leer ya: el cambio de club no espera al refresco de `refresco_dias`
                    mismo_club = normalizar_club(previa.get("fm_team_name")) == normalizar_club(club["name"])
                    if hecha > limite and (mismo_club or selec):
                        tot["al_dia"] += 1
                        if copa:  # su liga es la de su ficha, no la copa: se deja como está
                            continue
                        # Asegura que el club y liga de Soccerdonna estén siempre rellenos e inamovibles
                        store.update("players", {
                            "sd_league_code": liga["code"],
                            "current_league_name": liga["name"],
                            "current_league_logo_url": logo,
                            "fm_team_name": club["name"],
                            "fm_team_badge_url": club_badge,
                        }, id=previa["id"])
                        continue
                # Nueva: ficha completa; ya guardada pero antigua: ficha fresca (valor, traspasos, lesiones)
                frescura = None if not previa else 1
                prof = sd.perfil(j["slug"], j["sd_id"], frescura)
                if not prof:
                    tot["sin_ficha"] += 1
                    continue
                p = {"id": ids.get(j["sd_id"], f"sd-{j['sd_id']}"), "name": j["name"]}
                filas = filas_jugadora(p, j, prof, sd.traspasos(j["slug"], j["sd_id"], frescura), now_iso())
                row = filas["players"][0]
                if not row.get("primary_position") or row.get("primary_position") == "Desconocida":
                    from .demarcaciones import GENERICA, _central, por_texto
                    from .positions import get_grupo_demarcacion
                    pos_txt = row.get("tm_position_main") or (prof.get("datos") or {}).get("Position") or j.get("position")
                    dem, _ = por_texto(pos_txt)
                    if not dem and pos_txt:
                        dem = GENERICA.get(str(pos_txt).split(" - ", 1)[0].strip().lower())
                    dem = _central(dem, row.get("preferred_foot"))
                    if dem:
                        row["primary_position"] = dem
                        row["grupo_demarcacion"] = get_grupo_demarcacion(dem)
                # Club y liga siempre inamovibles desde la plantilla y liga de Soccerdonna que se descarga (con una
                # copa internacional, la liga nacional de su ficha)
                l = liga_de_club(catalogo_sd, prof, club) if copa else \
                    {"code": liga["code"], "name": liga["name"], "logo_url": logo}
                if copa and l["code"]:
                    votos_liga[l["code"]] = votos_liga.get(l["code"], 0) + 1
                # Selecciones: club de su ficha (sin dorsal: el de la selección no es el del club)
                cid = prof.get("club_actual_id") if selec else club["sd_id"]
                nombre_club = (prof.get("club_actual_nombre") if selec else club["name"]) or None
                badge = club_badge if not selec else \
                    (imagen_sd(store, sd, SD_MEDIUM.format(id=cid), f"sd/{cid}.jpg") if cid else None)
                row.update(
                    sd_league_code=l["code"],
                    current_league_name=l["name"],
                    current_league_logo_url=l["logo_url"],
                    fm_team_name=nombre_club,
                    fm_team_badge_url=badge,
                    country=(prof["nacionalidades"] or [None])[0],
                    shirt_number=None if selec else prof.get("dorsal"),
                )
                # Las unidas a Opta conservan el equipo Opta (estadísticas); con selecciones, solo un club que tengamos
                if p["id"].startswith("sd-") and cid and (not selec or f"sd-{cid}" in equipos_sd):
                    row["current_team_id"] = f"sd-{cid}"
                foto = None if not con_fotos or (previa and previa.get("photo_url")) else \
                    foto_fotmob(store, fotmob, {**p, "birth_date": row.get("birth_date")}, nombre_club or club["name"])
                if foto:
                    row.update(photo_url=foto, photo_updated_at=now_iso())
                    tot["fotos"] += 1
                for k, v in filas.items():
                    pendiente.setdefault(k, []).extend(v)
                hechas += 1
                tot["jugadoras"] += 1
                tot["nuevas"] += 0 if previa else 1
            for grupo in _homogeneo(pendiente.pop("players", [])):
                limpios = [{k: v for k, v in r.items() if v is not None} for r in grupo]
                raw_sd_players = []
                for r in limpios:
                    sd_pid = r.get("id")
                    if r.get("sd_url"):
                        m_sd = re.search(r"/spieler/(\d+)", str(r["sd_url"]))
                        if m_sd:
                            sd_pid = f"sd_{m_sd.group(1)}"
                    if not sd_pid:
                        continue
                    raw_row = {
                        k: r[k] for k in (
                            "name", "country", "birth_date", "place_of_birth",
                            "height", "preferred_foot", "current_team_id", "sd_url",
                            "market_value", "photo_url", "updated_at",
                        ) if k in r
                    }
                    raw_row["id"] = sd_pid
                    raw_sd_players.append(raw_row)
                # raw_soccerdonna_players removed in clean_start_schema
                store.upsert("players", limpios)
            for tabla, pk in PK:
                claves = pk.split(",")
                filas_t = list({tuple(r.get(c) for c in claves): r for r in pendiente.get(tabla, [])}.values())
                for grupo in _homogeneo(filas_t):
                    store.upsert(tabla, grupo, on_conflict=pk)
            # Club nuevo de una copa internacional: su liga, la que dicen las fichas de sus jugadoras
            if copa and votos_liga and f"sd-{club['sd_id']}" in nuevos_ids:
                l = catalogo_sd[max(votos_liga, key=votos_liga.get)]
                store.update("teams", {"sd_league_code": l["code"], "league_name": l["name"],
                                       "league_logo_url": l.get("logo_url"), "country": l.get("country")},
                             id=f"sd-{club['sd_id']}")
            logger.info(f"  {club['name']}: {tot} ({sd.peticiones} peticiones)")
            if limit and hechas >= limit:
                break
        store.update("sd_leagues", {"last_download_at": now_iso()}, code=liga["code"])
    logger.info(f"Soccerdonna completado: {tot}")
    return desde_opta


def ligas_opta(store: Store, liga_code: Optional[str]) -> List[Dict[str, Any]]:
    return [l for l in store.select_all("sd_leagues", "code,name,country,enabled,opta_competition_id,opta_season_ids,"
                                                      "level,url")
            if l.get("opta_competition_id") and (l["code"] == liga_code if liga_code else l["enabled"])]


def opta(store: Store, liga_code: Optional[str], max_matches: Optional[int], solo_ultima: bool = False, modo: str = "todo"):
    """Temporadas Opta de cada liga de /admin con ID Opta: las elegidas + la última del catálogo (ver
    storage.competiciones_objetivo). `solo_ultima`: la más reciente y las elegidas aún sin descargar."""
    from .ingest import IngestionPipeline
    from .storage import competiciones_calendario, competiciones_objetivo
    comps = competiciones_objetivo(store, solo_admin=True, liga_code=liga_code, solo_ultima=solo_ultima)
    # Ligas sin datos por jugadora en Opta (Dinamarca...): solo calendario con horarios y resultados
    calendario = competiciones_calendario(store, liga_code) if modo in ("todo", "partidos") else []
    if not comps and not calendario:
        logger.info("Opta: ninguna liga elegida tiene un ID de Opta con temporadas en el catálogo")
        return
    pipe = IngestionPipeline(skip_photos=True, max_matches_per_comp=max_matches)
    fallidas: List[str] = []
    if modo == "partidos":  # diario: solo la temporada en curso de cada liga (las pasadas ya no cambian)
        comps = [c for c in comps if c.get("active")]
    for comp in calendario:
        logger.info(f"▶ Opta (solo calendario) {comp['name']} {comp['season_name']} ({comp['season_id']})")
        try:
            pipe.procesar_calendario(comp, ventana_diaria() if modo == "partidos" else None)
        except Exception as e:
            fallidas.append(comp["name"])
            logger.exception(f"  {comp['name']}: fallo en el calendario ({e})")
    if calendario and modo != "partidos":  # con "partidos" se vincula al final
        vincular_equipos(store, liga_code)
    for comp in comps:
        logger.info(f"▶ Opta ({modo}) {comp['name']} {comp['season_name']} ({comp['season_id']})"
                    f"{' [actual]' if comp['active'] else ''}")
        if modo == "todo":
            pipe.procesar_competicion(comp)
        elif modo == "jugadoras":
            perfiles = pipe.sync_squads(comp)
            cache = pipe.store.load_match_cache(comp["season_id"])
            pipe.guardar_plantilla(comp, cache)
            if not cache.empty:
                pipe.recalcular_temporada(comp, cache, perfiles)
        elif modo == "partidos":
            try:  # una liga que falle (API, Storage) no deja sin partidos a las demás
                partidos_del_dia(store, pipe, comp, max_matches)
            except Exception as e:
                fallidas.append(comp["name"])
                logger.exception(f"  {comp['name']}: fallo en los partidos del día ({e})")
    if modo == "partidos":
        vincular_equipos(store, liga_code)  # equipos Opta nuevos del calendario (ascendidos, otra temporada)
    if pipe.totales["matches"]:
        try:  # extra: si falla, los datos de la liga ya están guardados y la descarga sigue
            pipe.actualizar_similares()
        except Exception as e:
            logger.warning(f"Similares: omitido ({e})")
    logger.info(f"Opta completado: {pipe.totales}")
    if fallidas:  # el resto ya está guardado; la ejecución se marca como fallida para que se vea
        raise SystemExit(f"Opta: fallaron {len(fallidas)} ligas: {', '.join(fallidas)}")


# Descarga diaria: partidos jugados desde ayer y calendario hasta dentro de una semana. Lo que se escape (un día
# sin ejecución, un partido que Opta publica tarde) lo recoge la descarga semanal completa.
DIAS_ATRAS_PARTIDOS = 1
DIAS_CALENDARIO = 7


def _fecha_partido(f: Dict[str, Any]) -> str:
    return str((f.get("matchInfo") or {}).get("date") or "")[:10]


def ventana_diaria() -> tuple:
    """(desde, hasta) en ISO: de ayer a dentro de DIAS_CALENDARIO días."""
    hoy = datetime.now(timezone.utc).date()
    return (hoy - timedelta(days=DIAS_ATRAS_PARTIDOS)).isoformat(), (hoy + timedelta(days=DIAS_CALENDARIO)).isoformat()


def partidos_del_dia(store: Store, pipe, comp: Dict[str, Any], max_matches: Optional[int]):
    """Una temporada en el modo diario: procesa los partidos jugados desde ayer aún sin procesar y guarda el
    calendario (horarios, resultados) de ayer a dentro de DIAS_CALENDARIO días."""
    sid = comp["season_id"]
    hoy = datetime.now(timezone.utc).date()
    desde, hasta = ventana_diaria()
    fixtures = pipe.adapter.get_fixtures(sid) or []
    ventana = [f for f in fixtures if desde <= _fecha_partido(f) <= hasta]
    en_stats = lambda: {r["match_id"] for r in store.select_all("player_match_stats", "match_id", season_id=sid)}
    procesados = en_stats()
    nuevos = sorted((m for m in ventana
                     if m.get("liveData", {}).get("matchDetails", {}).get("matchStatus") == "Played"
                     and _fecha_partido(m) <= hoy.isoformat() and m["matchInfo"]["id"] not in procesados),
                    key=_fecha_partido)
    if max_matches:
        nuevos = nuevos[:max_matches]
    logger.info(f"  Partidos {desde} → {hasta}: {len(ventana)} en el calendario, {len(nuevos)} jugados por procesar")
    if nuevos:  # plantillas y caché (Storage) solo si hay algo que procesar
        perfiles = pipe.sync_squads(comp)
        cache = pipe.store.load_match_cache(sid)
        cache = pipe.procesar_partidos(comp, nuevos, perfiles, cache)
        procesados = en_stats()
        if not cache.empty:
            pipe.recalcular_temporada(comp, cache, perfiles)
    pipe.guardar_calendario(comp, ventana, procesados)


def ligas_nuevas(store: Store, liga_code: Optional[str]) -> List[str]:
    """Ligas activadas en /admin que nunca se han descargado de Soccerdonna (o cuyos datos se borraron)."""
    return [l["code"] for l in store.select_all("sd_leagues", "code,enabled,last_download_at")
            if not l.get("last_download_at") and (l["code"] == liga_code if liga_code else l["enabled"])]


def recalcular(store: Store, liga_code: Optional[str]):
    """Vuelve a puntuar todas las temporadas elegidas en /admin con los partidos ya procesados (caché)."""
    from .ingest import IngestionPipeline
    from .storage import competiciones_objetivo
    pipe = IngestionPipeline(skip_photos=True)
    for comp in competiciones_objetivo(store, solo_admin=True, liga_code=liga_code):
        cache = store.load_match_cache(comp["season_id"])
        if cache.empty:
            continue
        logger.info(f"▶ Recalcular {comp['name']} {comp['season_id']}: {cache['match_id'].nunique()} partidos")
        pipe.recalcular_temporada(comp, cache, {}, actualizar_jugadoras=False)
    if pipe.totales["season_rows"]:
        pipe.actualizar_similares()
    logger.info(f"Recalcular completado: {pipe.totales}")


SD_CAMPOS = ("sd_id", "sd_url", "sd_updated_at", "sd_league_code", "market_value", "market_value_updated_at",
             "contract_expires", "joined_on", "citizenship", "tm_position_main", "tm_positions_other", "outfitter",
             "photo_url", "photo_updated_at", "fotmob_id", "fotmob_photo_url", "shirt_number",
             "height", "preferred_foot", "place_of_birth", "fm_team_name", "fm_team_badge_url",
             "current_league_name", "current_league_logo_url")


def vincular(store: Store, liga_code: Optional[str]):
    """Une la ficha "sd-" con la jugadora Opta del mismo club/liga: los datos de Soccerdonna pasan a la fila Opta
    (que tiene las estadísticas) y la "sd-" se borra."""
    ligas = ligas_opta(store, liga_code)
    equipos = {t["id"]: t for t in store.select_all("teams", "id,name,competition_id,sd_league_code,badge_url,"
                                                              "league_name,league_logo_url,sd_team_id")}
    jugadoras = store.select_all("players", "id,name,first_name,last_name,match_name,birth_date,current_team_id,"
                                            "primary_position,grupo_demarcacion,sd_league_code,opta_id," + ",".join(SD_CAMPOS))
    # Uniones que se quedaron a medias (fallo entre mover sd_id y borrar la "sd-"): se terminan
    por_sd = {p["sd_id"]: p for p in jugadoras if p.get("sd_id") and not p["id"].startswith("sd-")}
    for p in [p for p in jugadoras if p["id"].startswith("sd-") and not p.get("sd_id")]:
        o = por_sd.get(int(p["id"][3:])) if p["id"][3:].isdigit() else None
        if o:
            _unir(store, p, o)
            jugadoras.remove(p)
            logger.info(f"Vincular: terminada la unión a medias de {p['name']} ({p['id']} → {o['id']})")
    unidas, unidas_ids, opta_unidas = 0, set(), set()
    for liga in ligas:
        # Equipos Opta de la liga: escudo y liga del club de Soccerdonna con el MISMO nombre normalizado
        # (no el más parecido: "Levante" no es "Levante Badalona"); si hay dos, ninguno
        from .escudos import norm_club
        sd_eq: Dict[str, List[Dict[str, Any]]] = {}
        for x in equipos.values():
            if x.get("sd_league_code") == liga["code"] and x["id"].startswith("sd-"):
                sd_eq.setdefault(norm_club(x["name"]), []).append(x)
        for t in [t for t in equipos.values() if t.get("competition_id") == liga["opta_competition_id"]]:
            pares_sd = sd_eq.get(norm_club(t["name"]), [])
            par = pares_sd[0] if len(pares_sd) == 1 else None
            if par:
                cambios = {k: par[k] for k in ("league_name", "league_logo_url") if par.get(k)}
                if par.get("badge_url") and "/fotmob/" not in (t.get("badge_url") or ""):
                    cambios["badge_url"] = par["badge_url"]
                store.update("teams", cambios, id=t["id"])
        sd = [p for p in jugadoras if p["id"].startswith("sd-") and p.get("sd_league_code") == liga["code"]]
        op = [p for p in jugadoras if not p["id"].startswith("sd-") and not p.get("sd_id")
              and equipos.get(p.get("current_team_id"), {}).get("competition_id") == liga["opta_competition_id"]]
        # Copa sin página en Soccerdonna: fichas "sd-" de los clubes vinculados a sus equipos Opta, y jugadoras Opta
        # con el equipo con el que jugaron la copa (cualquier temporada; puede que ya no estén en él)
        equipo_copa: Dict[str, str] = {}
        if sin_pagina_sd(liga):
            for tid, ps in equipos_de_competicion(store, liga["opta_competition_id"]).items():
                equipo_copa.update({pid: tid for pid in ps})
            clubes_sd = {equipos.get(tid, {}).get("sd_team_id") for tid in equipo_copa.values()} - {None}
            sd = [p for p in jugadoras if p["id"].startswith("sd-") and p.get("current_team_id") in clubes_sd]
            op = [p for p in jugadoras if not p["id"].startswith("sd-") and not p.get("sd_id") and p["id"] in equipo_copa]
        libres = {p["id"]: p for p in op}
        for s_ in sd:
            club_sd = normalizar_club(equipos.get(s_.get("current_team_id"), {}).get("name"))
            mejor, puntos = None, 0
            for o in libres.values():
                sim = sim_nombre(o, s_["name"])
                fecha = bool(o.get("birth_date") and s_.get("birth_date")) and \
                    misma_fecha(str(o["birth_date"])[:10], str(s_["birth_date"])[:10])
                eq_o = equipos.get(equipo_copa.get(o["id"]) or o.get("current_team_id"), {})
                club = 100 if eq_o.get("sd_team_id") and eq_o["sd_team_id"] == s_.get("current_team_id") else \
                    fuzz.token_set_ratio(club_sd, normalizar_club(eq_o.get("name")))
                ok = (sim >= 60 and fecha) or (sim >= 85 and club >= 70)
                if ok and sim + (50 if fecha else 0) + club / 2 > puntos:
                    mejor, puntos = o, sim + (50 if fecha else 0) + club / 2
            if not mejor:
                continue
            _unir(store, s_, mejor)
            unidas_ids.add(s_["id"])
            opta_unidas.add(mejor["id"])
            libres.pop(mejor["id"])
            unidas += 1
        logger.info(f"Vincular {liga['name']}: {unidas} jugadoras unidas con Opta ({len(sd)} de Soccerdonna sin unir antes)")

    # Entre ligas: la jugadora de Opta de una temporada antigua (o que salió de la plantilla) que Soccerdonna
    # tiene ahora en otra liga. Se une solo con nombre parecido y la misma fecha de nacimiento.
    sd = [p for p in jugadoras if p["id"].startswith("sd-") and p["id"] not in unidas_ids]
    op = [p for p in jugadoras if not p["id"].startswith("sd-") and not p.get("sd_id")
          and p["id"] not in opta_unidas]
    activas = jugadoras_activas(store)
    from .config import es_internacional
    # Clubes que solo conocemos por una competición internacional (Champions...): su liga la dice Soccerdonna
    eq_intl = {t["id"] for t in equipos.values() if t.get("competition_id") and es_internacional({"id": t["competition_id"]})}
    pares = emparejar_entre_ligas(sd, op)
    for s_, o in pares:
        # Si ya no está en ninguna plantilla Opta actual (o solo en la de una competición internacional),
        # el club de hoy es el de Soccerdonna
        _unir(store, s_, o, club_de_soccerdonna=o["id"] not in activas or o.get("current_team_id") in eq_intl)
    logger.info(f"Vincular entre ligas: {len(pares)} jugadoras unidas con su ficha Opta de otra liga o temporada")
    vincular_equipos(store, liga_code)


MIN_VOTOS_EQUIPO = 5  # jugadoras unidas que coinciden en el club de Soccerdonna de un equipo Opta
# Equipos Opta que se quedan con su nombre de Opta: Soccerdonna tiene mal el nombre de su club
EQUIPOS_SIN_VINCULO = {
    "69tjuryaqmkgb4gd6707s87op",  # Partick Thistle: Soccerdonna llama a su club "Heart of Midlothian WFC" (verein_7112)
}
# Erratas de Soccerdonna en el nombre del club
NOMBRE_CLUB_SD = {"Real Socieadad": "Real Sociedad"}


def _nombre_club(nombre: str) -> str:
    """Nombre de club de Soccerdonna para mostrar: sin espacios sobrantes, erratas ni todo en mayúsculas."""
    n = re.sub(r"\s+", " ", nombre or "").strip()
    n = NOMBRE_CLUB_SD.get(n, n)
    return n.title() if n.isupper() else n


def vincular_equipos(store: Store, liga_code: Optional[str] = None):
    """Equipo Opta → club de Soccerdonna (teams.sd_team_id, teams.sd_name), para mostrar los partidos con el nombre
    del club de las fichas. El vínculo se vota con las jugadoras ya unidas: el club de Soccerdonna (fm_team_name)
    que tienen al menos MIN_VOTOS_EQUIPO de las jugadoras del equipo Opta y 2/3 de los votos. Si no hay votos
    suficientes, el club de Soccerdonna de su liga con EXACTAMENTE el mismo nombre normalizado (si es uno solo)."""
    from .escudos import norm_club
    ligas = ligas_opta(store, liga_code)
    comps = {l["opta_competition_id"] for l in ligas}
    codigos_de = {}
    for l in ligas:
        codigos_de.setdefault(l["opta_competition_id"], set()).add(l["code"])
    try:
        equipos = store.select_all("teams", "id,name,competition_id,sd_league_code,sd_team_id,sd_name")
    except Exception as e:  # falta la migración 20261119180000_team_sd_link.sql
        logger.warning(f"Vincular equipos: omitido ({e})")
        return
    clubes_sd = [t for t in equipos if t["id"].startswith("sd-")]
    por_nombre: Dict[str, List[Dict[str, Any]]] = {}
    for t in clubes_sd:
        por_nombre.setdefault(t["name"], []).append(t)
    votos: Dict[str, Dict[str, int]] = {}
    for p in store.select_all("players", "current_team_id,fm_team_name,sd_id"):
        if p.get("sd_id") and p.get("current_team_id") and p.get("fm_team_name"):
            v = votos.setdefault(p["current_team_id"], {})
            v[p["fm_team_name"]] = v.get(p["fm_team_name"], 0) + 1
    hechos, sin = 0, []
    for t in [t for t in equipos if t.get("competition_id") in comps and not t["id"].startswith("sd-")]:
        codigos = codigos_de[t["competition_id"]]
        if t["id"] in EQUIPOS_SIN_VINCULO:
            if t.get("sd_team_id") or t.get("sd_name"):
                store.update("teams", {"sd_team_id": None, "sd_name": None}, id=t["id"])
            continue
        club = None
        v = votos.get(t["id"], {})
        if v:
            nombre, n = max(v.items(), key=lambda x: x[1])
            if n >= MIN_VOTOS_EQUIPO and n * 3 >= sum(v.values()) * 2:
                cands = por_nombre.get(nombre, [])
                # El mismo nombre en otra liga (filial con el nombre del primer equipo): primero el de su liga
                club = next((c for c in cands if c.get("sd_league_code") in codigos), cands[0] if len(cands) == 1 else None)
        if not club:
            mismos = [c for c in clubes_sd if c.get("sd_league_code") in codigos and norm_club(c["name"]) == norm_club(t["name"])]
            club = mismos[0] if len(mismos) == 1 else None
        if not club:
            sin.append(t["name"])
            continue
        fila = {"sd_team_id": club["id"], "sd_name": _nombre_club(club["name"])}
        if (t.get("sd_team_id"), t.get("sd_name")) != (fila["sd_team_id"], fila["sd_name"]):
            store.update("teams", fila, id=t["id"])
        hechos += 1
    logger.info(f"Vincular equipos: {hechos} equipos Opta con su club de Soccerdonna"
                f"{f'; sin vincular ({len(sin)}): ' + ', '.join(sorted(sin)) if sin else ''}")


def _norm_club(nombre: Optional[str]) -> str:
    n = normalizar(nombre or "")
    return re.sub(r"\b(fc|cf|lfc|wfc|afc|sc|cd|club|de|women|w|ladies|femenino|femenil|frauen|ii|b)\b", " ", n).strip()


def corregir_clubes(store: Store, dias: int = 60, prueba: bool = False) -> List[Dict[str, Any]]:
    """El club con el que jugó su último partido oficial (últimos `dias`) manda sobre el guardado (Soccerdonna,
    FotMob): una plantilla desfasada de Soccerdonna no puede llevarla a otra liga mientras juega en la suya.
    Las competiciones internacionales no cuentan (allí juega con su club, pero no dicen su liga)."""
    from .config import es_internacional
    desde = (datetime.now(timezone.utc) - timedelta(days=dias)).date().isoformat()
    ultimo: Dict[str, Dict[str, Any]] = {}
    inicio = 0
    while True:
        filas = (store.client.table("player_match_stats").select("player_id,team_id,competition_id,match_date")
                 .gte("match_date", desde).range(inicio, inicio + 999).execute().data or [])
        for r in filas:
            if (r["match_date"] or "") > (ultimo.get(r["player_id"], {}).get("match_date") or ""):
                ultimo[r["player_id"]] = r
        if len(filas) < 1000:
            break
        inicio += 1000
    comps = {c["id"]: c for c in store.select_all("competitions", "id,country")}
    equipos = {t["id"]: t for t in store.select_all("teams", "id,name,badge_url,competition_id,league_name,league_logo_url")}
    # Liga de cada competición Opta según Soccerdonna (nombre y logo que usa el listado); la liga primero, no la copa
    ligas: Dict[str, Dict[str, Any]] = {}
    sd_todas = store.select_all("sd_leagues", "code,name,level,logo_url,opta_competition_id")
    por_codigo = {l["code"]: l for l in sd_todas}
    # Varias ligas de Soccerdonna pueden apuntar a la misma competición Opta (BL1 y BL2, SWPL 1 y 2):
    # gana la de nivel más alto ("Tier 1" antes que "Tier 2", y antes que copas)
    nivel = lambda l: (l.get("level") or "Z") if (l.get("level") or "").startswith("Tier") else "Z"
    for l in sd_todas:
        cid = l.get("opta_competition_id")
        if cid and (cid not in ligas or nivel(l) < nivel(ligas[cid])):
            ligas[cid] = l
    cambios = []
    for p in store.select_all("players", "id,name,sd_id,current_team_id,fm_team_name,current_league_name,sd_league_code"):
        if p.get("sd_id"):
            continue
        r = ultimo.get(p["id"])
        if not r or es_internacional({"id": r["competition_id"], "country": (comps.get(r["competition_id"]) or {}).get("country")}):
            continue
        eq = equipos.get(r["team_id"]) or {}
        guardado = p.get("fm_team_name") or (equipos.get(p.get("current_team_id")) or {}).get("name")
        a, b = _norm_club(eq.get("name")), _norm_club(guardado)
        # Mismo club con otro nombre ("Köln" / "1. FC Köln", "Hearts" / "Heart of Midlothian")
        if not eq.get("name") or (guardado and (fuzz.token_set_ratio(a, b) >= 70
                                                or (min(len(a), len(b)) >= 5 and fuzz.partial_ratio(a, b) >= 90))):
            continue
        # Su liga guardada ya es la de esa competición (Apertura/Clausura, SWPL 1...): se conserva
        actual = por_codigo.get(p.get("sd_league_code") or "")
        cid_eq = eq.get("competition_id") or r["competition_id"]
        liga = ligas.get(cid_eq) or ligas.get(r["competition_id"]) or {}
        if actual and actual.get("opta_competition_id") == cid_eq and nivel(actual) == nivel(liga):
            liga = actual
        fila = {"id": p["id"], "current_team_id": r["team_id"], "fm_team_name": eq["name"],
                "fm_team_badge_url": eq.get("badge_url"),
                "current_league_name": liga.get("name") or eq.get("league_name"),
                "current_league_logo_url": liga.get("logo_url") or eq.get("league_logo_url"),
                "sd_league_code": liga.get("code") or p.get("sd_league_code")}
        cambios.append({**fila, "_nombre": p["name"], "_antes": f"{guardado} / {p.get('current_league_name')}",
                        "_fecha": r["match_date"]})
    # Nombre de liga no oficial o de una copa ("Serie A", "Serie A Women's Cup") → la liga de su sd_league_code
    oficiales = {l["name"] for l in sd_todas if (l.get("level") or "").startswith("Tier")}
    oficial_liga = {l["name"]: l for l in sd_todas if (l.get("level") or "").startswith("Tier")}
    oficial_norm = {normalizar(n): n for n in oficial_liga}
    ya = {c["id"] for c in cambios}
    for p in store.select_all("players", "id,name,current_league_name,sd_league_code"):
        liga = por_codigo.get(p.get("sd_league_code") or "")
        nombre = p.get("current_league_name")
        if p["id"] in ya or not nombre or nombre in oficiales:
            continue
        # Misma liga oficial escrita de otra forma (apóstrofo recto, espacios): solo se corrige la escritura
        igual = oficial_norm.get(normalizar(nombre))
        if igual:
            l = oficial_liga[igual]
            cambios.append({"id": p["id"], "current_league_name": igual, "current_league_logo_url": l.get("logo_url"),
                            "_nombre": p["name"], "_antes": nombre, "_fecha": "-"})
            continue
        if not liga or not (liga.get("level") or "").startswith("Tier"):
            continue
        # Solo si el nombre guardado es una variante de esa liga (no otra liga de otro país sin catalogar)
        if fuzz.partial_ratio(normalizar(nombre), normalizar(liga["name"])) < 90:
            continue
        cambios.append({"id": p["id"], "current_league_name": liga["name"], "current_league_logo_url": liga.get("logo_url"),
                        "_nombre": p["name"], "_antes": nombre, "_fecha": "-"})
    for c in cambios:
        logger.info(f"  {c['_nombre']}: {c['_antes']} → {c.get('fm_team_name', '(mismo club)')} / {c['current_league_name']} "
                    f"(último partido {str(c['_fecha'])[:10]})")
    if not prueba:
        for c in cambios:
            store.update("players", {k: v for k, v in c.items() if not k.startswith("_") and k != "id"}, id=c["id"])
    logger.info(f"Club según el último partido: {len(cambios)} jugadoras {'por corregir (prueba)' if prueba else 'corregidas'}")
    return cambios


def _unir(store: Store, s_: Dict[str, Any], mejor: Dict[str, Any], club_de_soccerdonna: bool = True):
    """Pasa los datos de la ficha "sd-" a la fila Opta (que tiene las estadísticas) y borra la "sd-".
    El club (fm_team_name) y la liga (current_league_name, sd_league_code) de Soccerdonna son SIEMPRE inamovibles."""
    siempre_sd = ("sd_id", "sd_url", "sd_updated_at", "sd_league_code", "market_value", "market_value_updated_at",
                  "contract_expires", "joined_on", "citizenship", "tm_position_main", "tm_positions_other", "outfitter",
                  "photo_url", "photo_updated_at", "fotmob_id", "fotmob_photo_url",
                  "fm_team_name", "fm_team_badge_url", "current_league_name", "current_league_logo_url")
    datos = {k: s_[k] for k in SD_CAMPOS if s_.get(k) is not None and (k in siempre_sd or not mejor.get(k))}
    # La fila Opta ya tiene la foto de FotMob (su fotmob_id no se puede repetir, así que la "sd-" se quedó con una
    # de respaldo: ceroacero, Soccerdonna...): se conserva la de FotMob
    if mejor.get("fotmob_id") and mejor.get("photo_url") and not s_.get("fotmob_id"):
        for k in ("photo_url", "photo_updated_at"):
            datos.pop(k, None)
    if s_.get("primary_position") and mejor.get("primary_position") in (None, "", "Desconocida"):
        datos["primary_position"] = s_["primary_position"]
        if s_.get("grupo_demarcacion"):
            datos["grupo_demarcacion"] = s_["grupo_demarcacion"]
    if club_de_soccerdonna and s_.get("current_team_id") and not mejor.get("current_team_id"):
        datos["current_team_id"] = s_["current_team_id"]
    # Ficha que vino de ceroacero (ligas sin Soccerdonna): su id pasa a la fila Opta (el coche escoba ya no la busca)
    cz = (store.select_all("players", "cz_id,cz_url,cz_updated_at,weight,country", id=s_["id"]) or [{}])[0]
    if cz.get("cz_id"):
        datos.update({k: cz[k] for k in ("cz_id", "cz_url", "cz_updated_at")})
        datos.update({k: cz[k] for k in ("weight", "country") if cz.get(k) and not mejor.get(k)})
    store.update("players", {"sd_id": None, "cz_id": None}, id=s_["id"])  # únicos: se liberan antes de moverlos
    store.update("players", {**datos, "opta_id": mejor["id"]}, id=mejor["id"])
    # La fila Opta puede tener ya algunas de estas filas (de una unión anterior): se mueven con upsert por la
    # clave primaria (gana la de Soccerdonna, la más reciente) en vez de un UPDATE que chocaría con ella
    for tabla, clave in PK:
        filas = store.select_all(tabla, "*", player_id=s_["id"])
        if filas:
            store.upsert(tabla, [{**f, "player_id": mejor["id"]} for f in filas], on_conflict=clave)
            store.delete(tabla, player_id=s_["id"])
    store.delete("players", id=s_["id"])


def fichas_por_nombre(store: Store, comp_id: Optional[str] = None, limit: Optional[int] = None):
    """Jugadoras Opta sin ficha de Soccerdonna (de `comp_id` o de todas): se buscan por nombre en Soccerdonna y se
    confirman con fecha/lugar de nacimiento, dorsal y club (SoccerdonnaSync)."""
    sync = SoccerdonnaSync(limit=limit, fotos=False)
    sync.run(comp_id, solo_fichas=True)
    # Ficha "sd-" (de la plantilla de su liga) que vincular no unió (fechas de nacimiento distintas o sin fecha en
    # Opta) y que la búsqueda ha confirmado como la misma jugadora: se unen para no tener dos fichas
    if sync.pares_sd:
        activas = jugadoras_activas(store)
        cols = "id,name,current_team_id," + ",".join(SD_CAMPOS)
        for sd_pid, opta_pid in sync.pares_sd:
            s_ = (store.select_all("players", cols, id=sd_pid) or [None])[0]
            o = (store.select_all("players", cols, id=opta_pid) or [None])[0]
            if not s_ or not o or o.get("sd_id"):
                continue
            _unir(store, s_, o, club_de_soccerdonna=opta_pid not in activas)
            logger.info(f"  Unidas: {s_['name']} ({sd_pid} → {opta_pid})")
        logger.info(f"Completar: {len(sync.pares_sd)} fichas de Soccerdonna unidas con su jugadora de Opta")


def copas_desde_opta(store: Store, sd: SDClient, liga_code: Optional[str], limit: Optional[int], refresco_dias: int):
    """Copas internacionales que Soccerdonna no tiene (Libertadores, CAF...), después del paso opta. En la base de
    datos solo quedan las jugadoras que HOY tienen equipo y se unen con sus datos de Opta:
      1. Equipos Opta de la copa → club de Soccerdonna (verificado) → de su plantilla actual, las que jugaron la
         copa con ese equipo (ficha con su club y liga de hoy).
      2. vincular las une con su jugadora Opta.
      3. Las fichas que no se han podido unir se borran (sin datos de Opta no pintan nada aquí). Las jugadoras Opta
         sin ficha (ya no están en ese club, o el club no está en Soccerdonna) no salen en la base de datos."""
    ligas = [l for l in ligas_opta(store, liga_code) if sin_pagina_sd(l)]
    if not ligas:
        return
    leidas = descargar(store, sd, liga_code, limit, refresco_dias, con_fotos=False, fase="desde_opta") or set()
    vincular(store, liga_code)
    # Solo las "sd-" leídas aquí que siguen sin unir (las unidas ya tienen el id de Opta)
    sueltas = [p for p in store.select_all("players", "id,name") if p["id"] in leidas and p["id"].startswith("sd-")]
    for p in sueltas:
        for tabla, _ in PK:
            store.delete(tabla, player_id=p["id"])
        store.delete("players", id=p["id"])
        logger.info(f"  Sin unir con Opta, fuera: {p['name']} ({p['id']})")
    logger.info(f"Copas sin Soccerdonna: {len(leidas) - len(sueltas)} jugadoras con equipo y datos de Opta, "
                f"{len(sueltas)} fichas sin unir borradas")


def completar(store: Store, comp_id: Optional[str] = None, limit: Optional[int] = None):
    """Jugadoras con datos de la API que no llegaron por ninguna plantilla de Soccerdonna: se buscan a la inversa."""
    fichas_por_nombre(store, comp_id, limit)
    equipos = {t["id"]: t["name"] for t in store.select_all("teams", "id,name")}
    clubes = {r["player_id"]: equipos.get(r["team_id"]) for r in store.select_all("player_season_stats", "player_id,team_id")}
    sin_foto = [p for p in store.select_all("players", "id,name,first_name,last_name,match_name,birth_date,country,photo_url")
                if p["id"] in clubes and not p.get("photo_url")][:limit]
    fotmob, tot = FotMobClient(), {"fotmob": 0, "365scores": 0, "sin_foto": 0}
    fotmob.cargar_asignados(store)
    for n, p in enumerate(sin_foto, 1):
        club = clubes[p["id"]]
        m = fotmob.buscar_jugador(p, club)
        img = fotmob.image(FOTMOB_PLAYER_IMG.format(id=m["id"])) if m else None
        url = store.upload(BUCKET_PLAYER_PHOTOS, f"{p['id']}.png", img, "image/png") if img else None
        fuente = "fotmob"
        if not url:
            url, fuente = fotos_365.subir_foto(store, p, club), "365scores"
        if url:
            store.update("players", {"photo_url": f"{url}?v={int(time.time())}", "photo_updated_at": now_iso(),
                                     "fotmob_id": int(m["id"]) if fuente == "fotmob" else None}, id=p["id"])
        tot[fuente if url else "sin_foto"] += 1
        if n % 25 == 0:
            logger.info(f"  Fotos sin plantilla: {n}/{len(sin_foto)} {tot}")
    logger.info(f"Completar: {len(sin_foto)} sin foto → {tot}")


def ficha_de_retiro(sd: SDClient, p: Dict[str, Any], club: Optional[str], refresco_dias: int) -> Optional[Dict[str, Any]]:
    """Ficha de Soccerdonna de una jugadora de Opta. Sin vincular se busca por nombre y solo vale con la misma fecha
    de nacimiento real: ocultar por error a una jugadora en activo es peor que dejar a una retirada."""
    m = re.search(r"/en/([^/]+)/profil/spieler_(\d+)", p.get("sd_url") or "")
    if m:
        return sd.perfil(m.group(1), int(m.group(2)), refresco_dias)
    nacida = str(p.get("birth_date") or "")[:10]
    if not nacida or fecha_relleno(nacida):
        return None
    for n, c in enumerate(candidatas_jugadora(sd, p, club)):
        if n >= MAX_CANDIDATAS:
            break
        ficha = sd.perfil(c["slug"], c["sd_id"])
        if ficha and _fechas_iguales(_fecha(ficha["datos"].get("Date of birth")), nacida):
            return ficha
    return None


def marcar_retiradas(store: Store, sd: SDClient, refresco_dias: int = REFRESCO_DIAS) -> int:
    """Una retirada sale de las plantillas, así que `descargar` deja de leer su ficha: aquí se revisan las jugadoras
    con estadísticas sin ficha reciente. El club pasa a "Retired" (o vuelve al suyo si reaparece)."""
    equipos = {t["id"]: t["name"] for t in store.select_all("teams", "id,name")}
    clubes = {r["player_id"]: equipos.get(r["team_id"]) for r in store.select_all("player_season_stats", "player_id,team_id")}
    limite = (datetime.now(timezone.utc) - timedelta(days=refresco_dias)).isoformat()
    from .cz_ligas import ligas_ceroacero
    cz_codigos = ligas_ceroacero(store)[0]  # Brasil, Argentina...: Soccerdonna no las tiene
    jugadoras = [p for p in store.select_all("players", "id,name,first_name,last_name,match_name,birth_date,sd_url,"
                                                         "sd_updated_at,fm_team_name,sd_league_code")
                 if p["id"] in clubes and (p.get("fm_team_name") == en.RETIRADA or (p.get("sd_updated_at") or "") < limite)
                 and p.get("sd_league_code") not in cz_codigos]
    logger.info(f"Retiradas: {len(jugadoras)} jugadoras por revisar")
    cambios = 0
    for n, p in enumerate(jugadoras, 1):
        try:
            ficha = ficha_de_retiro(sd, p, clubes[p["id"]], refresco_dias)
            era_retirada = p.get("fm_team_name") == en.RETIRADA
            if ficha and ficha["retirada"] != era_retirada and ficha.get("club_actual_nombre"):
                store.update("players", {"fm_team_name": ficha["club_actual_nombre"],
                                         "fm_team_badge_url": ficha.get("club_actual_badge")}, id=p["id"])
                cambios += 1
                logger.info(f"  {p['name']}: {'retirada' if ficha['retirada'] else 'vuelve a ' + ficha['club_actual_nombre']}")
        except Exception as e:
            logger.warning(f"  Retiradas, error con {p['name']}: {e}")
        if n % 100 == 0:
            logger.info(f"  Retiradas: {n}/{len(jugadoras)} revisadas, {cambios} cambios")
    logger.info(f"Retiradas: {cambios} cambios en {len(jugadoras)} jugadoras")
    return cambios


def _fechas_iguales(a: Any, b: Any) -> bool:
    """Misma fecha de nacimiento, o con día y mes invertidos (errata típica). Más estricta que misma_fecha:
    entre ligas no hay club que confirme."""
    a, b = str(a or "")[:10], str(b or "")[:10]
    if len(a) < 10 or len(b) < 10:
        return False
    return a == b or (a[:4] == b[:4] and a[5:7] == b[8:10] and a[8:10] == b[5:7])


def _sim_estricta(o: Dict[str, Any], nombre: Any) -> float:
    """Parecido de nombre exigiendo al menos dos palabras en común (nombre y apellido): con la misma fecha,
    coincidir solo en el nombre de pila no basta."""
    n = normalizar(nombre)
    palabras = set(n.split())
    return max((fuzz.token_set_ratio(normalizar(v), n) for v in variantes_nombre(o)
                if len(palabras & set(normalizar(v).split())) >= 2), default=0)


def emparejar_entre_ligas(sd: List[Dict[str, Any]], op: List[Dict[str, Any]], min_sim: int = 80):
    """[(ficha sd-, jugadora Opta)] con la misma fecha de nacimiento y nombre parecido, sin mirar liga ni club.
    Si dos jugadoras Opta encajan igual de bien con una ficha, no se une (mejor separadas que mal unidas)."""
    por_anyo: Dict[str, List[Dict[str, Any]]] = {}
    for o in op:
        if o.get("birth_date"):
            por_anyo.setdefault(str(o["birth_date"])[:4], []).append(o)
    pares, usadas = [], set()
    for s_ in sd:
        if not s_.get("birth_date"):
            continue
        cands = sorted(((_sim_estricta(o, s_["name"]), o) for o in por_anyo.get(str(s_["birth_date"])[:4], [])
                        if o["id"] not in usadas and _fechas_iguales(o["birth_date"], s_["birth_date"])),
                       key=lambda t: -t[0])
        cands = [c for c in cands if c[0] >= min_sim]
        if not cands or (len(cands) > 1 and cands[1][0] == cands[0][0]):
            continue
        pares.append((s_, cands[0][1]))
        usadas.add(cands[0][1]["id"])
    return pares


def jugadoras_activas(store: Store) -> set:
    """Jugadoras en la plantilla (activa) de alguna temporada actual de Opta."""
    actuales = {s["id"] for s in store.select_all("seasons", "id,is_active") if s.get("is_active")}
    return {m["player_id"] for m in store.select_all("squad_members", "player_id,season_id,active")
            if m["season_id"] in actuales and m.get("active")}


def escudos(store: Store, liga_code: Optional[str]):
    """Escudos verificados por partidos en común (pipeline/escudos.py), nunca por parecido de nombre."""
    from .escudos import escudos as escudos_verificados
    escudos_verificados(store, liga_code)


def fotos(store: Store, liga_code: Optional[str], limit: Optional[int] = None, fase: str = "todas"):
    """`fase` como en descargar: las copas sin página en Soccerdonna ("desde_opta") van al final, con sus
    jugadoras ya creadas desde Opta y unidas a su ficha (que da el club de hoy y la foto de respaldo)."""
    ligas = [l for l in store.select_all("sd_leagues", "code,name,enabled,opta_competition_id,level,url")
             if (l["code"] == liga_code if liga_code else l["enabled"])
             and (fase == "todas" or sin_pagina_sd(l) == (fase == "desde_opta"))]
    if not ligas:
        return
    equipos = store.select_all("teams", "id,name,competition_id,sd_league_code")
    fotmob = FotMobClient()
    fotmob.cargar_asignados(store)
    sd = SDClient()
    cz = None  # cliente de ceroacero, solo si alguna jugadora lo necesita
    for liga in ligas:
        clubes = {t["id"]: t["name"] for t in equipos if t.get("sd_league_code") == liga["code"]
                  or (liga.get("opta_competition_id") and t.get("competition_id") == liga["opta_competition_id"])}
        if es_copa_internacional(liga) and liga.get("url"):  # sus clubes son de otras ligas
            nombres = {t["id"]: t["name"] for t in equipos}
            clubes.update({f"sd-{c['sd_id']}": c["name"] for c in clubes_copa(sd, liga["url"])
                           if f"sd-{c['sd_id']}" in nombres})
        # FotMob reconoce mejor a la jugadora buscando dentro de su liga
        comp = store.select_all("competitions", "id,fotmob_id", id=liga["opta_competition_id"]) if liga.get("opta_competition_id") else []
        liga_fm = comp[0].get("fotmob_id") if comp else None
        sin_foto = [p for p in store.select_all("players", "id,name,first_name,last_name,match_name,birth_date,"
                                                            "current_team_id,fm_team_name,sd_league_code,sd_id,sd_url,cz_url,photo_url")
                    if (p.get("sd_league_code") == liga["code"] or p.get("current_team_id") in clubes) and not p.get("photo_url")]
        if limit:
            sin_foto = sin_foto[:limit]
        tot = {"fotmob": 0, "ceroacero": 0, "soccerdonna": 0, "365scores": 0, "opta": 0, "sin_foto": 0}
        for n, p in enumerate(sin_foto, 1):
            club = p.get("fm_team_name") or clubes.get(p.get("current_team_id")) or ""
            m = fotmob.buscar_jugador(p, club, liga_fm)
            img = fotmob.image(FOTMOB_PLAYER_IMG.format(id=m["id"])) if m else None
            url = store.upload(BUCKET_PLAYER_PHOTOS, f"{p['id']}.png", img, "image/png") if img else None
            fuente = "fotmob"
            if not url and p.get("cz_url"):  # ligas de ceroacero (Argentina...): la foto de su ficha allí
                from .ceroacero import CZClient
                from .cz_ligas import foto_respaldo
                cz = cz or CZClient(cache_days=7)
                url, fuente = (foto_respaldo(store, cz, p["id"], p["cz_url"]) or "").split("?v=")[0] or None, "ceroacero"
            if not url and p.get("sd_url"):
                m_sd = re.search(r"/en/([^/]+)/profil/spieler_(\d+)\.html", str(p["sd_url"]))
                prof = sd.perfil(m_sd.group(1), int(m_sd.group(2)), 365) if m_sd else None
                if prof and prof.get("foto"):
                    raw_img = sd.image(prof["foto"])
                    if raw_img:
                        try:
                            from .recortar_fotos import procesar_recorte, tiene_fondo_solido
                            if tiene_fondo_solido(raw_img):
                                raw_img = procesar_recorte(raw_img)
                        except Exception:
                            pass
                        url = store.upload(BUCKET_PLAYER_PHOTOS, f"{p['id']}_sd.png", raw_img, "image/png")
                        fuente = "soccerdonna"
            if not url:
                url, fuente = fotos_365.subir_foto(store, p, club), "365scores"
            if not url and not p["id"].startswith("sd-") and p.get("current_team_id"):
                url, fuente = fotmob.subir_foto_opta(store, p["id"], (p["current_team_id"],)), "opta"
            if url:
                final_url = f"{url}?v={int(time.time())}"
                upd = {"photo_url": final_url, "photo_updated_at": now_iso(),
                       "fotmob_id": int(m["id"]) if fuente == "fotmob" and m else None}
                if fuente == "fotmob":
                    upd["fotmob_photo_url"] = final_url
                store.update("players", upd, id=p["id"])
                tot[fuente] += 1
            else:
                tot["sin_foto"] += 1
            if n % 25 == 0:
                logger.info(f"  Fotos {liga['name']}: {n}/{len(sin_foto)} {tot}")
        logger.info(f"Fotos {liga['name']}: {len(sin_foto)} sin foto → {tot}")
    marcar(store, liga_code, "last_fotmob_at")


def cola(store: Store, sd: SDClient, refresco_dias: int):
    """Descargas pedidas desde /admin (filas de `ingestion_runs` con status 'queued'), una detrás de otra y de la
    más antigua a la más nueva, hasta vaciar la cola. GitHub solo guarda UNA ejecución en espera por grupo de
    concurrencia (las demás se cancelan), así que cada botón deja su petición aquí y la ejecución que esté en
    marcha recoge también las que lleguen mientras tanto. Si una falla, se apunta el error y se sigue."""
    # Las que se quedaron 'running' de una ejecución cortada (timeout, cancelada): no la bloquean para siempre
    limite = (datetime.now(timezone.utc) - timedelta(hours=6)).isoformat()
    store.client.table("ingestion_runs").update(
        {"status": "failed", "finished_at": now_iso(), "error_summary": "Ejecución cortada (timeout o cancelada)"}
    ).eq("status", "running").eq("trigger_type", "admin").lt("started_at", limite).execute()
    hechas = 0
    while True:
        pendientes = (store.client.table("ingestion_runs").select("id,details").eq("status", "queued")
                      .order("started_at").limit(1).execute().data)
        if not pendientes:
            break
        fila = pendientes[0]
        # Reservarla solo si sigue en cola (otra ejecución podría haberla cogido)
        cogida = (store.client.table("ingestion_runs").update({"status": "running", "started_at": now_iso()})
                  .eq("id", fila["id"]).eq("status", "queued").execute().data)
        if not cogida:
            continue
        d = fila.get("details") or {}
        texto = str(d.get("pasos") or "todo").strip()
        lista = PASOS if texto == "todo" else tuple(p.strip() for p in texto.split(",") if p.strip() in PASOS)
        liga = d.get("liga") or None
        logger.info(f"══ Cola: {texto} {liga or '(todas las ligas activas)'}"
                    f"{' · todas las temporadas' if d.get('todas_temporadas') else ''} ══")
        estado, error = "completed", None
        try:
            if not lista:
                raise ValueError(f"Pasos no válidos: {texto}")
            pasos(store, sd, lista, liga, None, refresco_dias, None, solo_ultima=not d.get("todas_temporadas"))
        except Exception as e:
            logger.exception(f"Cola: falló {texto} {liga or ''}: {e}")
            estado, error = "failed", str(e)[:500]
        store.update("ingestion_runs", {"status": estado, "finished_at": now_iso(), "error_summary": error},
                     id=fila["id"])
        hechas += 1
    logger.info(f"Cola vacía ({hechas} descargas hechas)")


def main():
    parser = argparse.ArgumentParser(description="Jugadoras desde las ligas de Soccerdonna elegidas en /admin")
    parser.add_argument("accion", choices=["pasos", "catalogo", "descargar", "opta", "opta-jugadoras", "opta-partidos",
                                           "vincular", "escudos", "fotos", "todo",
                                           "actualizar-opta", "actualizar-soccerdonna", "recalcular", "retiradas", "completar",
                                           "corregir-clubes", "cola"])
    parser.add_argument("--pasos", default="todo",
                        help="pasos: 'todo' o lista separada por comas de soccerdonna,opta,fotmob")
    parser.add_argument("--retiradas", action="store_true", help="pasos: revisar también las retiradas (Soccerdonna)")
    parser.add_argument("--prueba", action="store_true", help="corregir-clubes: solo mostrar los cambios")
    parser.add_argument("--max-matches", type=int, help="Opta: máximo de partidos nuevos por temporada (pruebas)")
    parser.add_argument("--refresco-dias", type=int, default=REFRESCO_DIAS,
                        help="Volver a leer la ficha de las ya guardadas cada N días (0 = todas)")
    parser.add_argument("--liga", help="Código Soccerdonna (ESP1...), aunque no esté marcada")
    parser.add_argument("--limit", type=int, help="Máximo de jugadoras por liga (pruebas)")
    parser.add_argument("--todas-temporadas", action="store_true",
                        help="actualizar-opta: todas las temporadas elegidas, no solo la última")
    parser.add_argument("--max-minutos-escoba", type=float, default=60,
                        help="Coche escoba (ceroacero) al final del flujo: máximo de minutos (reanudable)")
    parser.add_argument("--sin-coche-escoba", action="store_true",
                        help="No pasar el coche escoba (el GitHub Action lo lanza en su propio paso)")
    args = parser.parse_args()
    store, sd = Store(get_supabase_client()), SDClient()
    if args.accion == "corregir-clubes":
        return corregir_clubes(store, prueba=args.prueba)
    if args.accion == "catalogo":
        return catalogo(store, sd)
    if args.accion == "recalcular":
        return recalcular(store, args.liga)
    if args.accion == "completar":
        return completar(store, limit=args.limit)
    if args.accion == "retiradas":
        return marcar_retiradas(store, sd, args.refresco_dias)
    if args.accion == "cola":
        return cola(store, sd, args.refresco_dias)
    escoba = None if args.sin_coche_escoba else args.max_minutos_escoba
    if args.accion == "pasos":
        lista = PASOS if args.pasos.strip() == "todo" else tuple(p.strip() for p in args.pasos.split(",") if p.strip())
        desconocidos = set(lista) - set(PASOS)
        if desconocidos or not lista:
            raise SystemExit(f"Pasos no válidos: {', '.join(desconocidos) or args.pasos} (usa {', '.join(PASOS)} o todo)")
        return pasos(store, sd, lista, args.liga, args.limit, args.refresco_dias, args.max_matches,
                     solo_ultima=not args.todas_temporadas, retiradas=args.retiradas, coche_escoba=escoba)
    if args.accion == "actualizar-opta":
        # Semanal: plantillas de Soccerdonna (solo fichas nuevas o antiguas) → última temporada Opta → ...
        return flujo(store, sd, args.liga, args.limit, args.refresco_dias, args.max_matches,
                     solo_ultima=not args.todas_temporadas, escudos_ligas=ligas_nuevas(store, args.liga),
                     coche_escoba=escoba)
    if args.accion == "actualizar-soccerdonna":
        # Mensual: fichas de Soccerdonna al día (Opta ya va cada semana) y revisión de retiradas
        return flujo(store, sd, args.liga, args.limit, args.refresco_dias, args.max_matches, con_opta=False,
                     retiradas=True, coche_escoba=escoba)
    if args.accion == "todo":
        return flujo(store, sd, args.liga, args.limit, args.refresco_dias, args.max_matches, coche_escoba=escoba)
    # Pasos sueltos
    if args.accion == "descargar":
        descargar(store, sd, args.liga, args.limit, args.refresco_dias, con_fotos=False)
    if args.accion == "opta":
        opta(store, args.liga, args.max_matches, modo="todo", solo_ultima=not args.todas_temporadas)
        vincular(store, args.liga)
        marcar(store, args.liga, "last_opta_at")
    if args.accion == "opta-jugadoras":
        opta(store, args.liga, args.max_matches, modo="jugadoras")
    if args.accion == "opta-partidos":
        opta(store, args.liga, args.max_matches, modo="partidos")
    if args.accion == "vincular":
        vincular(store, args.liga)
        corregir_clubes(store)
    if args.accion == "escudos":
        escudos(store, args.liga)
    if args.accion == "fotos":
        fotos(store, args.liga, args.limit)


def flujo(store: Store, sd: SDClient, liga_code: Optional[str], limit: Optional[int], refresco_dias: int,
          max_matches: Optional[int], solo_ultima: bool = False, con_opta: bool = True, retiradas: bool = False,
          escudos_ligas: Optional[List[str]] = None, coche_escoba: Optional[float] = None):
    """Proceso limpio en 3 pasos:
      1. Soccerdonna: clubes y plantillas de las ligas activas en /admin → ficha de cada jugadora, con fm_team_name
         y current_league_name inamovibles.
      2. FotMob: fotos de las jugadoras (con fallback a la foto de Soccerdonna recortada sin fondo blanco).
      3. Opta: partidos, métricas (8 por demarcación + extras), ratings (porteras aisladas) y vinculación con las
         jugadoras de Soccerdonna sin tocar su club ni su liga.
    """
    descargar(store, sd, liga_code, limit, refresco_dias, con_fotos=False, fase="antes_de_opta" if con_opta else "todas")
    if retiradas:
        marcar_retiradas(store, sd, refresco_dias)
    fotos(store, liga_code, limit, fase="antes_de_opta" if con_opta else "todas")
    if con_opta:
        opta(store, liga_code, max_matches, solo_ultima=solo_ultima)
        vincular(store, liga_code)
        # Copas que Soccerdonna no tiene (Libertadores...): sus clubes salen de los equipos Opta recién descargados
        copas_desde_opta(store, sd, liga_code, limit, refresco_dias)
        fotos(store, liga_code, limit, fase="desde_opta")
        marcar(store, liga_code, "last_opta_at")


# Partes que se pueden lanzar por separado desde /admin (en este orden si van juntas)
PASOS = ("soccerdonna", "fotmob", "opta")


def marcar(store: Store, liga_code: Optional[str], campo: str):
    """Fecha de la última descarga de una parte (sd_leagues.last_opta_at / last_fotmob_at) para /admin."""
    try:
        codigos = [liga_code] if liga_code else [l["code"] for l in store.select_all("sd_leagues", "code", enabled=True)]
        for code in codigos:
            store.update("sd_leagues", {campo: now_iso()}, code=code)
    except Exception as e:  # sin la migración 20261117120000 no hay columna: no tumba la descarga
        logger.warning(f"No se pudo guardar sd_leagues.{campo}: {e}")


def pasos(store: Store, sd: SDClient, lista, liga_code: Optional[str], limit: Optional[int], refresco_dias: int,
          max_matches: Optional[int], solo_ultima: bool = True, retiradas: bool = False,
          coche_escoba: Optional[float] = None):
    """Descarga por partes (botones de /admin y GitHub Action). Las tres juntas = flujo limpio completo.
      soccerdonna  Liga → clubes (nombre, escudo) → plantillas → ficha de cada jugadora con club y liga inamovibles.
      fotmob       Fotos de las jugadoras (FotMob; fallback Soccerdonna sin fondo blanco).
      opta         Temporadas Opta de la liga → vincular con las jugadoras de Soccerdonna y calcular ratings."""
    if set(lista) == set(PASOS):
        return flujo(store, sd, liga_code, limit, refresco_dias, max_matches, solo_ultima=solo_ultima,
                     retiradas=retiradas)
    con_opta = "opta" in lista
    if "soccerdonna" in lista:
        descargar(store, sd, liga_code, limit, refresco_dias, con_fotos=False, fase="antes_de_opta")
        if not con_opta:  # copas sin página en Soccerdonna: con los equipos Opta que ya hay
            copas_desde_opta(store, sd, liga_code, limit, refresco_dias)
        if retiradas:
            marcar_retiradas(store, sd, refresco_dias)
    if "fotmob" in lista:
        fotos(store, liga_code, limit, fase="antes_de_opta" if con_opta else "todas")
    if con_opta:
        opta(store, liga_code, max_matches, solo_ultima=solo_ultima)
        vincular(store, liga_code)
        if "soccerdonna" in lista:
            copas_desde_opta(store, sd, liga_code, limit, refresco_dias)
        if "fotmob" in lista:
            fotos(store, liga_code, limit, fase="desde_opta")
        marcar(store, liga_code, "last_opta_at")


if __name__ == "__main__":
    main()
