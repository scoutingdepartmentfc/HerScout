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
  fotos      Jugadoras de la liga sin foto (también las que solo están en Opta): FotMob y, si no, la oficial de Opta
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

Uso:
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
        nombre = unescape(m.group(3)).strip()
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
    # La clasificación (style="s10") lista solo los clubes de la liga; el resto de enlaces son de otras ligas
    vistos = {}
    for slug, cid, nombre in re.findall(r'href="/en/([^/]+)/startseite/verein_(\d+)\.html" style="s10" alt="([^"]+)"', html):
        vistos.setdefault(int(cid), {"slug": slug, "sd_id": int(cid), "name": unescape(nombre)})
    return list(vistos.values())


def plantilla(sd: SDClient, club: Dict[str, Any]) -> List[Dict[str, Any]]:
    html = sd.get(f"/en/{club['slug']}/kader/verein_{club['sd_id']}.html", FRESCO_DIAS) or ""
    vistas = {}
    for slug, pid, nombre in re.findall(r'href="/en/([^/]+)/profil/spieler_(\d+)\.html" class="fb s10" title="([^"]+)"', html):
        vistas.setdefault(int(pid), {"slug": slug, "sd_id": int(pid), "name": unescape(nombre)})
    return list(vistas.values())


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
              refresco_dias: int = REFRESCO_DIAS):
    ligas = [l for l in store.select_all("sd_leagues", "code,name,country,url,enabled")
             if (l["code"] == liga_code if liga_code else l["enabled"])]
    if not ligas:
        raise SystemExit("No hay ligas de Soccerdonna marcadas en /admin")
    # Ligas solo de Opta (sin página en Soccerdonna, p. ej. Brasil y Argentina): sus jugadoras salen de las
    # plantillas Opta en el paso opta() y aquí no hay nada que leer
    for l in [l for l in ligas if not l.get("url")]:
        logger.info(f"▶ {l['name']} ({l['country']}): solo Opta, sin Soccerdonna")
    # Ligas que Soccerdonna no tiene, leídas de ceroacero.es (url de la competición allí): mismo formato "sd-"
    from .cz_ligas import descargar_liga as descargar_ceroacero, es_ceroacero
    for l in [l for l in ligas if es_ceroacero(l)]:
        try:
            descargar_ceroacero(store, {**l, **catalogo_logo(store, l["code"])}, limit, refresco_dias)
        except Exception as e:  # una web caída no tumba las demás ligas
            logger.warning(f"▶ {l['name']}: fallo en ceroacero ({e})")
    ligas = [l for l in ligas if l.get("url") and not es_ceroacero(l)]
    if not ligas:
        return
    fotmob = FotMobClient()
    fotmob.cargar_asignados(store)
    tot = {"jugadoras": 0, "nuevas": 0, "al_dia": 0, "fotos": 0, "sin_ficha": 0}
    # Jugadoras ya guardadas (también las unidas a su ficha Opta: se actualiza esa fila, no se crea otra "sd-")
    guardadas = {p["sd_id"]: p for p in store.select_all("players", "id,sd_id,sd_updated_at,photo_url,fm_team_name")
                 if p.get("sd_id")}
    ids = {k: p["id"] for k, p in guardadas.items()}
    catalogo_sd = {l["code"]: l for l in store.select_all("sd_leagues", "code,name,level,logo_url")}
    limite = time.time() - refresco_dias * 86400
    for liga in ligas:
        clubes = clubes_liga(sd, liga["url"])
        logger.info(f"▶ {liga['name']} ({liga['country']}): {len(clubes)} clubes")
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
        store.upsert("teams", [{"id": r["id"], "name": r["name"], "country": r["country"],
                                "badge_url": r["badge_url"],
                                "sd_league_code": liga["code"], "league_name": liga["name"], "league_logo_url": logo,
                                "updated_at": r["updated_at"]} for r in raw_sd_teams])
        hechas = 0
        for club in clubes:
            pendiente: Dict[str, List[Dict[str, Any]]] = {}
            for j in plantilla(sd, club):
                if limit and hechas >= limit:
                    break
                previa = guardadas.get(j["sd_id"])
                if previa and previa.get("sd_updated_at"):
                    hecha = datetime.fromisoformat(previa["sd_updated_at"].replace("Z", "+00:00")).timestamp()
                    # Ficha reciente, pero si aparece en la plantilla de otro club (fichaje, o era agente libre)
                    # se vuelve a leer ya: el cambio de club no espera al refresco de `refresco_dias`
                    mismo_club = normalizar_club(previa.get("fm_team_name")) == normalizar_club(club["name"])
                    if hecha > limite and mismo_club:
                        tot["al_dia"] += 1
                        # Sigue en la liga (o ha llegado de otra elegida): solo se actualiza su club
                        store.update("players", {"sd_league_code": liga["code"]}, id=previa["id"])
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
                row.update(sd_league_code=liga["code"], country=(prof["nacionalidades"] or [None])[0],
                           shirt_number=prof.get("dorsal"))
                # Club actual y su liga según Soccerdonna (puede haber fichado por otra liga)
                if prof.get("club_actual_id"):
                    row["fm_team_badge_url"] = imagen_sd(store, sd, SD_MEDIUM.format(id=prof["club_actual_id"]),
                                                         f"sd/{prof['club_actual_id']}.jpg")
                if prof.get("liga_actual_nombre"):
                    # Nombre oficial del catálogo ("Serie A Women", no el texto corto del enlace "Serie A");
                    # una copa ("Serie A Women's Cup") no es su liga: se queda la que se está descargando
                    cod = (prof.get("liga_actual_codigo") or "").upper()
                    cat = catalogo_sd.get(cod)
                    if not cat or not (cat.get("level") or "").startswith("Tier"):
                        cat = liga
                    row["current_league_name"] = liga["name"]
                    row["sd_league_code"] = liga["code"]
                    row["current_league_logo_url"] = (catalogo_sd.get(liga["code"]) or {}).get("logo_url") or \
                        imagen_sd(store, sd, prof.get("liga_actual_logo"), f"ligas/sd-{liga['code']}.jpg")
                if p["id"].startswith("sd-"):  # las unidas a Opta conservan el equipo Opta (estadísticas)
                    row["current_team_id"] = f"sd-{club['sd_id']}"
                foto = None if previa and previa.get("photo_url") else \
                    foto_fotmob(store, fotmob, {**p, "birth_date": row.get("birth_date")}, club["name"])
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
            logger.info(f"  {club['name']}: {tot} ({sd.peticiones} peticiones)")
            if limit and hechas >= limit:
                break
        store.update("sd_leagues", {"last_download_at": now_iso()}, code=liga["code"])
    logger.info(f"Soccerdonna completado: {tot}")


def ligas_opta(store: Store, liga_code: Optional[str]) -> List[Dict[str, Any]]:
    return [l for l in store.select_all("sd_leagues", "code,name,country,enabled,opta_competition_id")
            if l.get("opta_competition_id") and (l["code"] == liga_code if liga_code else l["enabled"])]


def opta(store: Store, liga_code: Optional[str], max_matches: Optional[int], solo_ultima: bool = False, modo: str = "todo"):
    """Temporadas Opta elegidas en /admin de cada competición enlazada (o la última con datos) → pipeline.
    `solo_ultima`: de cada competición solo su temporada más reciente (y las elegidas que nunca se descargaron)."""
    from .ingest import IngestionPipeline
    from .storage import competiciones_objetivo
    from .config import COMPETICIONES_INTERNACIONALES
    ligas = ligas_opta(store, liga_code)
    comp_ids = {l["opta_competition_id"] for l in ligas}
    # Competiciones internacionales activadas en /admin (Champions...): entran en la descarga general
    intl = set()
    if not comp_ids and not intl:
        logger.info("Opta: ninguna liga elegida tiene competición Opta enlazada")
        return
    catalogo = store.select_all("opta_catalog", "*")
    ultima = {}
    for c in catalogo:
        if c["competition_id"] in comp_ids and (c.get("data_level") or "").startswith("jugadora"):
            if (c.get("start_date") or "") > (ultima.get(c["competition_id"], {}).get("start_date") or ""):
                ultima[c["competition_id"]] = c
    # Temporadas elegidas en /admin (sd_leagues.opta_season_ids); si no hay ninguna, la última de opta_catalog
    cat_by_season = {c["season_id"]: c for c in catalogo}
    elegidas_por_comp = {
        l["opta_competition_id"]: list(l.get("opta_season_ids") or [])
        for l in ligas
        if l.get("opta_competition_id")
    }
    comps = []
    for cid in list(comp_ids) + [c for c in intl if c not in comp_ids]:
        sids = elegidas_por_comp.get(cid) or ([ultima[cid]["season_id"]] if cid in ultima else [])
        if solo_ultima and cid in ultima:
            sids = [ultima[cid]["season_id"]]
        for sid in sids:
            c = cat_by_season.get(sid)
            if c:
                comps.append({
                    "id": c["competition_id"],
                    "name": c["competition_name"],
                    "season_id": c["season_id"],
                    "season_name": c["season_name"],
                    "country": c.get("country"),
                    "has_eventing": bool(c.get("has_eventing")),
                })
    pipe = IngestionPipeline(skip_photos=True, max_matches_per_comp=max_matches)
    for comp in comps:
        logger.info(f"▶ Opta ({modo}) {comp['name']} {comp['season_id']}")
        if modo == "todo":
            pipe.procesar_competicion(comp)
        elif modo == "jugadoras":
            perfiles = pipe.sync_squads(comp)
            cache = pipe.store.load_match_cache(comp["season_id"])
            pipe.guardar_plantilla(comp, cache)
            if not cache.empty:
                pipe.procesar_temporada(comp, perfiles, cache)
        elif modo == "partidos":
            perfiles = pipe.sync_squads(comp)
            cache = pipe.store.load_match_cache(comp["season_id"])
            hechos = set(cache["match_id"].unique()) if not cache.empty else set()
            fixtures = pipe.adapter.get_fixtures(comp["season_id"])
            pipe.guardar_calendario(comp, fixtures, hechos)
            pipe.procesar_partidos(comp, fixtures, hechos, perfiles)
    if pipe.totales["matches"]:
        try:  # extra: si falla, los datos de la liga ya están guardados y la descarga sigue
            pipe.actualizar_similares()
        except Exception as e:
            logger.warning(f"Similares: omitido ({e})")
    logger.info(f"Opta completado: {pipe.totales}")


def temporada_nueva(store: Store, catalogo: List[Dict[str, Any]], targets: List[Dict[str, Any]], comp_ids: set,
                    margen_dias: int = 14):
    """Competiciones activadas cuya temporada más nueva del catálogo ya ha empezado (o empieza en `margen_dias`)
    y aún no está elegida: se activa y pasa a ser la actual (como al marcarla en /admin). Sin esto, una liga con
    la 2025/26 elegida nunca descargaría la 2026/27. No se exige nivel "jugadora" en el catálogo: es una foto
    fija del CSV y la temporada que empieza figura como "sin jugados"; se hereda la fuente de la anterior."""
    limite = (datetime.now(timezone.utc) + timedelta(days=margen_dias)).date().isoformat()
    inicio = {c["season_id"]: c.get("start_date") or "" for c in catalogo}
    altas, desactivar = [], set()
    for cid in comp_ids:
        mias = [t for t in targets if t["competition_id"] == cid]
        if not mias:
            continue
        actual = max(mias, key=lambda t: inicio.get(t["season_id"], ""))
        candidatas = [c for c in catalogo if c["competition_id"] == cid and c.get("start_date")
                      and inicio.get(actual["season_id"], "") < c["start_date"] <= limite]
        if not candidatas:
            continue
        c = max(candidatas, key=lambda c: c["start_date"])
        logger.info(f"Opta {c['competition_name']}: temporada nueva {c['season_name']} ({c['start_date']}) "
                    f"→ se activa (antes {actual.get('season_name')})")
        altas.append({
            "season_id": c["season_id"], "competition_id": cid, "competition_name": c["competition_name"],
            "country": c.get("country") or actual.get("country"), "season_name": c["season_name"],
            "is_active": True, "enabled": True, "fuente": actual.get("fuente") or "matchstats",
            "fotmob_id": actual.get("fotmob_id"), "updated_at": now_iso()})
        desactivar.add(cid)
    for cid in desactivar:
        store.client.table("ingestion_targets").update({"is_active": False}).eq("competition_id", cid).execute()
    if altas:
        store.upsert("ingestion_targets", altas, on_conflict="season_id")


def temporadas_semanales(store: Store, comps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """De cada competición, la temporada más reciente (fecha de inicio en opta_catalog) y las que aún no tienen
    ningún partido en BD (recién elegidas). Las antiguas ya descargadas no cambian: no se vuelven a pedir."""
    inicio = {c["season_id"]: c.get("start_date") or "" for c in store.select_all("opta_catalog", "season_id,start_date")}
    ultima: Dict[str, Dict[str, Any]] = {}
    for c in comps:
        clave = (inicio.get(c["season_id"], ""), c.get("active", False))
        prev = ultima.get(c["id"])
        if not prev or clave >= (inicio.get(prev["season_id"], ""), prev.get("active", False)):
            ultima[c["id"]] = c
    con_partidos = {m["season_id"] for m in store.select_all("matches", "season_id")}
    elegidas = [c for c in comps if c is ultima[c["id"]] or c["season_id"] not in con_partidos]
    for c in comps:
        if c not in elegidas:
            logger.info(f"  Opta {c['name']} {c['season_id']}: temporada anterior ya descargada, se omite")
    return elegidas


def ligas_nuevas(store: Store, liga_code: Optional[str]) -> List[str]:
    """Ligas activadas en /admin que nunca se han descargado de Soccerdonna (o cuyos datos se borraron)."""
    return [l["code"] for l in store.select_all("sd_leagues", "code,enabled,last_download_at")
            if not l.get("last_download_at") and (l["code"] == liga_code if liga_code else l["enabled"])]


def recalcular(store: Store, liga_code: Optional[str]):
    """Vuelve a puntuar todas las temporadas elegidas en /admin con los partidos ya procesados (caché)."""
    from .ingest import IngestionPipeline
    from .storage import competiciones_objetivo
    comp_ids = {l["opta_competition_id"] for l in ligas_opta(store, liga_code)} if liga_code else None
    pipe = IngestionPipeline(skip_photos=True)
    for comp in competiciones_objetivo(store, solo_admin=True):
        if comp_ids is not None and comp["id"] not in comp_ids:
            continue
        cache = store.load_match_cache(comp["season_id"])
        if cache.empty:
            continue
        logger.info(f"▶ Recalcular {comp['name']} {comp['season_id']}: {cache['match_id'].nunique()} partidos")
        pipe.recalcular_temporada(comp, cache, {}, actualizar_jugadoras=False)
    if pipe.totales["season_rows"]:
        pipe.actualizar_similares()
    logger.info(f"Recalcular completado: {pipe.totales}")


SD_CAMPOS = ("sd_id", "sd_url", "sd_updated_at", "sd_league_code", "market_value", "market_value_updated_at",
             "contract_expires", "citizenship", "tm_position_main", "outfitter", "photo_url", "photo_updated_at",
             "height", "preferred_foot", "place_of_birth", "fm_team_name", "fm_team_badge_url",
             "current_league_name", "current_league_logo_url")


def vincular(store: Store, liga_code: Optional[str]):
    """Une la ficha "sd-" con la jugadora Opta del mismo club/liga: los datos de Soccerdonna pasan a la fila Opta
    (que tiene las estadísticas) y la "sd-" se borra."""
    ligas = ligas_opta(store, liga_code)
    equipos = {t["id"]: t for t in store.select_all("teams", "id,name,competition_id,sd_league_code,badge_url,"
                                                              "league_name,league_logo_url")}
    jugadoras = store.select_all("players", "id,name,first_name,last_name,match_name,birth_date,current_team_id,"
                                            "sd_league_code,opta_id," + ",".join(SD_CAMPOS))
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
        libres = {p["id"]: p for p in op}
        for s_ in sd:
            club_sd = normalizar_club(equipos.get(s_.get("current_team_id"), {}).get("name"))
            mejor, puntos = None, 0
            for o in libres.values():
                sim = sim_nombre(o, s_["name"])
                fecha = bool(o.get("birth_date") and s_.get("birth_date")) and \
                    misma_fecha(str(o["birth_date"])[:10], str(s_["birth_date"])[:10])
                club = fuzz.token_set_ratio(club_sd, normalizar_club(equipos.get(o.get("current_team_id"), {}).get("name")))
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
    for p in store.select_all("players", "id,name,current_team_id,fm_team_name,current_league_name,sd_league_code"):
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


def _unir(store: Store, s_: Dict[str, Any], mejor: Dict[str, Any], club_de_soccerdonna: bool = False):
    """Pasa los datos de la ficha "sd-" a la fila Opta (que tiene las estadísticas) y borra la "sd-"."""
    club = ("fm_team_name", "fm_team_badge_url", "current_league_name", "current_league_logo_url")
    # El club y la liga de Soccerdonna solo si Opta no la tiene en una plantilla actual: aunque la fila Opta no
    # tenga esos campos, el club de Opta (con el que juega) manda sobre una plantilla de Soccerdonna desfasada
    datos = {k: s_[k] for k in SD_CAMPOS if s_.get(k) is not None and (k.startswith(("sd_", "market", "photo"))
                                                                      or (k in club and club_de_soccerdonna)
                                                                      or (k not in club and not mejor.get(k)))}
    if club_de_soccerdonna and s_.get("current_team_id"):
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


def completar(store: Store, comp_id: Optional[str] = None, limit: Optional[int] = None):
    """Jugadoras con datos de la API que no llegaron por ninguna plantilla de Soccerdonna: se buscan a la inversa."""
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


def fotos(store: Store, liga_code: Optional[str], limit: Optional[int] = None):
    ligas = [l for l in store.select_all("sd_leagues", "code,name,enabled,opta_competition_id")
             if (l["code"] == liga_code if liga_code else l["enabled"])]
    equipos = store.select_all("teams", "id,name,competition_id,sd_league_code")
    fotmob = FotMobClient()
    fotmob.cargar_asignados(store)
    for liga in ligas:
        clubes = {t["id"]: t["name"] for t in equipos if t.get("sd_league_code") == liga["code"]
                  or (liga.get("opta_competition_id") and t.get("competition_id") == liga["opta_competition_id"])}
        # FotMob reconoce mejor a la jugadora buscando dentro de su liga
        comp = store.select_all("competitions", "id,fotmob_id", id=liga["opta_competition_id"]) if liga.get("opta_competition_id") else []
        liga_fm = comp[0].get("fotmob_id") if comp else None
        sin_foto = [p for p in store.select_all("players", "id,name,first_name,last_name,match_name,birth_date,"
                                                            "current_team_id,photo_url")
                    if p.get("current_team_id") in clubes and not p.get("photo_url")]
        if limit:
            sin_foto = sin_foto[:limit]
        tot = {"fotmob": 0, "365scores": 0, "opta": 0, "sin_foto": 0}
        for n, p in enumerate(sin_foto, 1):
            club = clubes[p["current_team_id"]]
            m = fotmob.buscar_jugador(p, club, liga_fm)
            img = fotmob.image(FOTMOB_PLAYER_IMG.format(id=m["id"])) if m else None
            url = store.upload(BUCKET_PLAYER_PHOTOS, f"{p['id']}.png", img, "image/png") if img else None
            fuente = "fotmob"
            if not url:
                url, fuente = fotos_365.subir_foto(store, p, club), "365scores"
            if not url and not p["id"].startswith("sd-"):
                url, fuente = fotmob.subir_foto_opta(store, p["id"], (p["current_team_id"],)), "opta"
            if url:
                store.update("players", {"photo_url": f"{url}?v={int(time.time())}", "photo_updated_at": now_iso(),
                                     "fotmob_id": int(m["id"]) if fuente == "fotmob" else None}, id=p["id"])
                tot[fuente] += 1
            else:
                tot["sin_foto"] += 1
            if n % 25 == 0:
                logger.info(f"  Fotos {liga['name']}: {n}/{len(sin_foto)} {tot}")
        logger.info(f"Fotos {liga['name']}: {len(sin_foto)} sin foto → {tot}")


def main():
    parser = argparse.ArgumentParser(description="Jugadoras desde las ligas de Soccerdonna elegidas en /admin")
    parser.add_argument("accion", choices=["catalogo", "descargar", "opta", "opta-jugadoras", "opta-partidos",
                                           "vincular", "escudos", "fotos", "todo",
                                           "actualizar-opta", "actualizar-soccerdonna", "recalcular", "retiradas", "completar",
                                           "corregir-clubes"])
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
    escoba = None if args.sin_coche_escoba else args.max_minutos_escoba
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
        descargar(store, sd, args.liga, args.limit, args.refresco_dias)
        fotos(store, args.liga, args.limit)
    if args.accion == "opta":
        opta(store, args.liga, args.max_matches, modo="todo")
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
    """Proceso estándar de descarga, en este orden:

    Ligas (elegidas en /admin con su liga de Soccerdonna):
      1. Soccerdonna: plantillas de la liga → ficha de cada jugadora (nuevas, y las guardadas hace más de
         `refresco_dias`). Así entran también los fichajes recientes.
      2. Opta de esa misma liga (plantillas, partidos, eventing/matchstats, ratings).
      3. Vincular Soccerdonna ↔ Opta: dentro de la liga (nombre + fecha o club) y entre ligas (la jugadora de Opta
         que Soccerdonna tiene ahora en otra liga elegida).
    Competiciones entre clubes de distintas ligas o copas sin liga propia (Champions...): van en el paso 2,
      después de las ligas. Opta identifica a cada jugadora con el mismo ID en todas sus competiciones, así que
      las que ya estaban en Supabase se enlazan solas; las nuevas siguen el paso 4.
      4. Jugadoras con datos de Opta que siguen sin ficha: se buscan en Soccerdonna FUERA de su liga (buscador por
         nombre, confirmando fecha/lugar de nacimiento, dorsal o club) y se enlazan.
      5. Club según el último partido oficial (una plantilla desfasada no se lleva a una jugadora a otra liga).
      6. (mensual) Retiradas. 7. Escudos. 8. Fotos de FotMob (y si no, 365scores / Opta).
      9. Coche escoba ceroacero.es: rellena solo lo que siga vacío.
    """
    descargar(store, sd, liga_code, limit, refresco_dias)
    if con_opta:
        opta(store, liga_code, max_matches, solo_ultima=solo_ultima)
    vincular(store, liga_code)
    completar(store, limit=limit)
    corregir_clubes(store)
    # Demarcación de las que no tienen partidos Opta: Soccerdonna/ceroacero → FotMob → genérica
    try:
        from .demarcaciones import rellenar as demarcaciones
        demarcaciones(store)
    except Exception as e:  # extra: no tumba la descarga
        logger.warning(f"Demarcaciones: {e}")
    if retiradas:
        marcar_retiradas(store, sd, refresco_dias)
    for code in (escudos_ligas if escudos_ligas is not None else [liga_code]):
        escudos(store, code)
    # Fichas de Soccerdonna que acabaron en la jugadora equivocada (la misma ficha en dos jugadoras con distinto
    # nombre): se deshacen y esas jugadoras se quedan sin el club, los datos y la foto que venían de ella
    from .auditar_vinculos import revisar_fichas_sd
    revisar_fichas_sd(store)
    fotos(store, liga_code, limit)
    # Agentes libres y jugadoras solo en plantillas antiguas: no salen en las plantillas de las ligas de arriba
    from .fotos_jugadoras import fotos_sin_club
    fotos_sin_club(store, limit)
    if coche_escoba:
        from .ceroacero import CeroaceroSync
        try:  # si falla, lo descargado ya está guardado
            CeroaceroSync(refresh_days=30, limit=limit, max_minutos=coche_escoba).run()
        except Exception as e:
            logger.warning(f"Coche escoba: omitido ({e})")

if __name__ == "__main__":
    main()
