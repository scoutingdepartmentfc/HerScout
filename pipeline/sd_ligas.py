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
  todo       descargar → opta → vincular → escudos → fotos, en cadena (todas las temporadas elegidas)

Descargas automáticas (GitHub Action):
  actualizar-opta         Martes. Ligas nuevas (nunca descargadas): Soccerdonna completo + escudos. Opta: solo la
                          última temporada de cada liga (plantillas, partidos nuevos y calendario con horarios) y las
                          temporadas elegidas que aún no tienen ningún partido en BD → vincular → fotos
  actualizar-soccerdonna  Mensual. descargar (fichas con más de --refresco-dias) → vincular → escudos → fotos
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
from datetime import datetime
from html import unescape
from typing import Any, Dict, List, Optional

from rapidfuzz import fuzz

from . import traducciones as en
from .config import BUCKET_PLAYER_PHOTOS, BUCKET_TEAM_BADGES, FOTMOB_PLAYER_IMG, FOTMOB_TEAM_IMG
from .photos import FotMobClient, misma_fecha, normalizar, normalizar_club, sim_nombre, variantes_nombre
from .soccerdonna import SD_BASE, SDClient, _homogeneo, filas_jugadora, now_iso
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
    jugadora = {"name": p["name"], "match_name": p["name"], "first_name": partes[0] if partes else None,
                "last_name": " ".join(partes[1:]) or None, "birth_date": p.get("birth_date")}
    m = fotmob.buscar_jugador(jugadora, club, None)
    img = fotmob.image(FOTMOB_PLAYER_IMG.format(id=m["id"])) if m else None
    url = store.upload(BUCKET_PLAYER_PHOTOS, f"{p['id']}.png", img, "image/png") if img else None
    return f"{url}?v={int(time.time())}" if url else None


def descargar(store: Store, sd: SDClient, liga_code: Optional[str], limit: Optional[int],
              refresco_dias: int = REFRESCO_DIAS):
    ligas = [l for l in store.select_all("sd_leagues", "code,name,country,url,enabled")
             if (l["code"] == liga_code if liga_code else l["enabled"])]
    if not ligas:
        raise SystemExit("No hay ligas de Soccerdonna marcadas en /admin")
    fotmob = FotMobClient()
    tot = {"jugadoras": 0, "nuevas": 0, "al_dia": 0, "fotos": 0, "sin_ficha": 0}
    # Jugadoras ya guardadas (también las unidas a su ficha Opta: se actualiza esa fila, no se crea otra "sd-")
    guardadas = {p["sd_id"]: p for p in store.select_all("players", "id,sd_id,sd_updated_at,photo_url") if p.get("sd_id")}
    ids = {k: p["id"] for k, p in guardadas.items()}
    limite = time.time() - refresco_dias * 86400
    for liga in ligas:
        clubes = clubes_liga(sd, liga["url"])
        logger.info(f"▶ {liga['name']} ({liga['country']}): {len(clubes)} clubes")
        logo = imagen_sd(store, sd, SD_MEDIUM.format(id=liga["code"].lower()), f"ligas/sd-{liga['code']}.jpg")
        store.update("sd_leagues", {"logo_url": logo}, code=liga["code"])
        store.upsert("teams", [{"id": f"sd-{c['sd_id']}", "name": c["name"], "country": liga["country"],
                                "badge_url": imagen_sd(store, sd, SD_MEDIUM.format(id=c["sd_id"]), f"sd/{c['sd_id']}.jpg"),
                                "sd_league_code": liga["code"], "league_name": liga["name"], "league_logo_url": logo,
                                "updated_at": now_iso()} for c in clubes])
        hechas = 0
        for club in clubes:
            pendiente: Dict[str, List[Dict[str, Any]]] = {}
            for j in plantilla(sd, club):
                if limit and hechas >= limit:
                    break
                previa = guardadas.get(j["sd_id"])
                if previa and previa.get("sd_updated_at"):
                    hecha = datetime.fromisoformat(previa["sd_updated_at"].replace("Z", "+00:00")).timestamp()
                    if hecha > limite:
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
                    row["current_league_name"] = prof["liga_actual_nombre"]
                    cod = prof.get("liga_actual_codigo")
                    row["current_league_logo_url"] = imagen_sd(store, sd, prof.get("liga_actual_logo"),
                                                               f"ligas/sd-{(cod or 'x').upper()}.jpg")
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
                store.upsert("players", [{k: v for k, v in r.items() if v is not None} for r in grupo])
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


def opta(store: Store, liga_code: Optional[str], max_matches: Optional[int], solo_ultima: bool = False):
    """Temporadas Opta elegidas en /admin de cada competición enlazada (o la última con datos) → pipeline.
    `solo_ultima`: de cada competición solo su temporada más reciente (y las elegidas que nunca se descargaron)."""
    from .ingest import IngestionPipeline
    from .storage import competiciones_objetivo
    ligas = ligas_opta(store, liga_code)
    if not ligas:
        logger.info("Opta: ninguna liga elegida tiene competición Opta enlazada")
        return
    comp_ids = {l["opta_competition_id"] for l in ligas}
    ultima = {}
    for c in store.select_all("opta_catalog", "*"):
        if c["competition_id"] in comp_ids and (c.get("data_level") or "").startswith("jugadora"):
            if (c.get("start_date") or "") > (ultima.get(c["competition_id"], {}).get("start_date") or ""):
                ultima[c["competition_id"]] = c
    # Temporadas elegidas en /admin; la liga sin ninguna elegida descarga solo la última
    elegidas = {t["competition_id"] for t in store.select_all("ingestion_targets", "competition_id,enabled") if t["enabled"]}
    nuevas = [c for cid, c in ultima.items() if cid not in elegidas]
    if nuevas:
        store.upsert("ingestion_targets", [{
            "season_id": c["season_id"], "competition_id": c["competition_id"], "competition_name": c["competition_name"],
            "country": c["country"], "season_name": c["season_name"], "is_active": True, "enabled": True,
            "fuente": "eventing" if c.get("has_eventing") else "matchstats", "updated_at": now_iso()}
            for c in nuevas], on_conflict="season_id")
    # competiciones_objetivo ordena de antigua a actual: la temporada activa se procesa la última
    comps = [c for c in competiciones_objetivo(store, solo_admin=True) if c["id"] in comp_ids]
    if solo_ultima:
        comps = temporadas_semanales(store, comps)
    pipe = IngestionPipeline(skip_photos=True, max_matches_per_comp=max_matches)
    for comp in comps:
        logger.info(f"▶ Opta {comp['name']} {comp['season_id']}")
        pipe.procesar_competicion(comp)
    if pipe.totales["matches"]:
        pipe.actualizar_similares()
    logger.info(f"Opta completado: {pipe.totales}")


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
        # Equipos Opta de la liga: escudo y liga del club de Soccerdonna con el nombre más parecido
        sd_eq = [t for t in equipos.values() if t.get("sd_league_code") == liga["code"] and t["id"].startswith("sd-")]
        for t in [t for t in equipos.values() if t.get("competition_id") == liga["opta_competition_id"]]:
            par = max(sd_eq, key=lambda x: fuzz.token_set_ratio(normalizar_club(t["name"]), normalizar_club(x["name"])), default=None)
            if par and fuzz.token_set_ratio(normalizar_club(t["name"]), normalizar_club(par["name"])) >= 60:
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
    pares = emparejar_entre_ligas(sd, op)
    for s_, o in pares:
        # Si ya no está en ninguna plantilla Opta actual, el club de hoy es el de Soccerdonna
        _unir(store, s_, o, club_de_soccerdonna=o["id"] not in activas)
    logger.info(f"Vincular entre ligas: {len(pares)} jugadoras unidas con su ficha Opta de otra liga o temporada")


def _unir(store: Store, s_: Dict[str, Any], mejor: Dict[str, Any], club_de_soccerdonna: bool = False):
    """Pasa los datos de la ficha "sd-" a la fila Opta (que tiene las estadísticas) y borra la "sd-"."""
    club = ("fm_team_name", "fm_team_badge_url", "current_league_name", "current_league_logo_url")
    datos = {k: s_[k] for k in SD_CAMPOS if s_.get(k) is not None and (k.startswith(("sd_", "market", "photo"))
                                                                      or not mejor.get(k)
                                                                      or (club_de_soccerdonna and k in club))}
    if club_de_soccerdonna and s_.get("current_team_id"):
        datos["current_team_id"] = s_["current_team_id"]
    store.update("players", {"sd_id": None}, id=s_["id"])  # sd_id es único: se libera antes de moverlo
    store.update("players", {**datos, "opta_id": mejor["id"]}, id=mejor["id"])
    # La fila Opta puede tener ya algunas de estas filas (de una unión anterior): se mueven con upsert por la
    # clave primaria (gana la de Soccerdonna, la más reciente) en vez de un UPDATE que chocaría con ella
    for tabla, clave in PK:
        filas = store.select_all(tabla, "*", player_id=s_["id"])
        if filas:
            store.upsert(tabla, [{**f, "player_id": mejor["id"]} for f in filas], on_conflict=clave)
            store.delete(tabla, player_id=s_["id"])
    store.delete("players", id=s_["id"])


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


def _sin_w(nombre: Optional[str]) -> str:
    return normalizar_club(re.sub(r"\s*\(W\)$", "", nombre or ""))


def _emparejar(nuestros: Dict[str, str], fotmob: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """{clave: nombre} ↔ equipos FotMob, uno a uno de mejor a peor parecido ('Barcelona' no va al Espanyol)."""
    pares = sorted(((fuzz.token_set_ratio(_sin_w(n), _sin_w(f["name"])) * 2 + fuzz.ratio(_sin_w(n), _sin_w(f["name"])), k, f)
                    for k, n in nuestros.items() for f in fotmob), key=lambda t: -t[0])
    res, usados = {}, set()
    for puntos, k, f in pares:
        if puntos >= 200 and k not in res and f["id"] not in usados:
            res[k] = f
            usados.add(f["id"])
    return res


def escudos(store: Store, liga_code: Optional[str]):
    """Escudos transparentes de FotMob (los de Soccerdonna son JPG con fondo blanco)."""
    fotmob = FotMobClient()
    ligas = [l for l in store.select_all("sd_leagues", "code,name,enabled,opta_competition_id")
             if (l["code"] == liga_code if liga_code else l["enabled"])]
    equipos = store.select_all("teams", "id,name,competition_id,sd_league_code")
    subidos: Dict[int, Optional[str]] = {}

    def logo(fm_id: int) -> Optional[str]:
        if fm_id not in subidos:
            img = fotmob.image(FOTMOB_TEAM_IMG.format(id=fm_id))
            url = store.upload(BUCKET_TEAM_BADGES, f"fotmob/{fm_id}.png", img, "image/png") if img else None
            subidos[fm_id] = f"{url}?v={int(time.time())}" if url else None
        return subidos[fm_id]

    def buscar_equipo(nombre: str) -> Optional[Dict[str, Any]]:
        sugerencias = []
        for termino in {nombre, _sin_w(nombre)}:
            for g in fotmob._json("search/suggest", term=termino, lang="en") or []:
                sugerencias += [{"id": int(x["id"]), "name": x["name"], "leagueId": x.get("leagueId")}
                                for x in g.get("suggestions") or [] if x.get("type") == "team" and x["name"].endswith("(W)")]
        return _emparejar({"x": nombre}, sugerencias).get("x")

    for liga in ligas:
        mios = {t["id"]: t["name"] for t in equipos if t.get("sd_league_code") == liga["code"]
                or (liga.get("opta_competition_id") and t.get("competition_id") == liga["opta_competition_id"])}
        comp = store.select_all("competitions", "id,fotmob_id", id=liga["opta_competition_id"]) if liga.get("opta_competition_id") else []
        liga_fm = comp[0].get("fotmob_id") if comp else None
        if not liga_fm:  # la liga FotMob se deduce del primer club que aparezca en el buscador
            liga_fm = next((m["leagueId"] for n in list(mios.values())[:5] if (m := buscar_equipo(n)) and m.get("leagueId")), None)
        fm_equipos = fotmob.league_teams(int(liga_fm)) if liga_fm else []
        # Clubes de Soccerdonna y equipos Opta por separado: son los mismos 16 clubes dos veces
        pares = {**_emparejar({k: v for k, v in mios.items() if k.startswith("sd-")}, fm_equipos),
                 **_emparejar({k: v for k, v in mios.items() if not k.startswith("sd-")}, fm_equipos)}
        for tid, f in pares.items():
            url = logo(f["id"])
            if url:
                store.update("teams", {"badge_url": url}, id=tid)
                logger.info(f"  {mios[tid]} → {f['name']}")
        logger.info(f"Escudos {liga['name']}: {len(pares)}/{len(mios)} clubes con escudo FotMob (liga FotMob {liga_fm})")

        # Club actual de cada jugadora (puede ser de otra liga). Los filiales (B, II, C...) llevan el escudo del
        # primer equipo; primero se busca entre los clubes de la liga ya emparejados, luego en el buscador
        por_nombre = {mios[t]: subidos.get(f["id"]) for t, f in pares.items()}
        de_liga = [{"id": t, "name": mios[t]} for t in pares]
        jugadoras = [p for p in store.select_all("players", "id,fm_team_name,fm_team_badge_url,sd_league_code")
                     if p.get("sd_league_code") == liga["code"] and p.get("fm_team_name")]
        for nombre in {p["fm_team_name"] for p in jugadoras}:
            base = re.sub(r"\s+(B|II|III|C|Cadete|Juvenil|U\d{2}|Femenino B)$", "", nombre).strip()
            url = por_nombre.get(nombre) or por_nombre.get(base)
            if not url:
                par = _emparejar({"x": base}, de_liga).get("x")
                url = por_nombre.get(mios[par["id"]]) if par else None
            if not url:
                cand = buscar_equipo(base)
                url = logo(cand["id"]) if cand else None
            por_nombre[nombre] = url
            if url:
                for p in jugadoras:
                    if p["fm_team_name"] == nombre and p.get("fm_team_badge_url") != url:
                        store.update("players", {"fm_team_badge_url": url}, id=p["id"])
        logger.info(f"Escudos {liga['name']}: {sum(1 for v in por_nombre.values() if v)} clubes actuales con escudo FotMob")


def fotos(store: Store, liga_code: Optional[str], limit: Optional[int] = None):
    ligas = [l for l in store.select_all("sd_leagues", "code,name,enabled,opta_competition_id")
             if (l["code"] == liga_code if liga_code else l["enabled"])]
    equipos = store.select_all("teams", "id,name,competition_id,sd_league_code")
    fotmob = FotMobClient()
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
        tot = {"fotmob": 0, "opta": 0, "sin_foto": 0}
        for n, p in enumerate(sin_foto, 1):
            club = clubes[p["current_team_id"]]
            m = fotmob.buscar_jugador(p, club, liga_fm)
            img = fotmob.image(FOTMOB_PLAYER_IMG.format(id=m["id"])) if m else None
            url = store.upload(BUCKET_PLAYER_PHOTOS, f"{p['id']}.png", img, "image/png") if img else None
            fuente = "fotmob"
            if not url and not p["id"].startswith("sd-"):
                url, fuente = fotmob.subir_foto_opta(store, p["id"], (p["current_team_id"],)), "opta"
            if url:
                store.update("players", {"photo_url": f"{url}?v={int(time.time())}", "photo_updated_at": now_iso()}, id=p["id"])
                tot[fuente] += 1
            else:
                tot["sin_foto"] += 1
            if n % 25 == 0:
                logger.info(f"  Fotos {liga['name']}: {n}/{len(sin_foto)} {tot}")
        logger.info(f"Fotos {liga['name']}: {len(sin_foto)} sin foto → {tot}")


def main():
    parser = argparse.ArgumentParser(description="Jugadoras desde las ligas de Soccerdonna elegidas en /admin")
    parser.add_argument("accion", choices=["catalogo", "descargar", "opta", "vincular", "escudos", "fotos", "todo",
                                           "actualizar-opta", "actualizar-soccerdonna", "recalcular"])
    parser.add_argument("--max-matches", type=int, help="Opta: máximo de partidos nuevos por temporada (pruebas)")
    parser.add_argument("--refresco-dias", type=int, default=REFRESCO_DIAS,
                        help="Volver a leer la ficha de las ya guardadas cada N días (0 = todas)")
    parser.add_argument("--liga", help="Código Soccerdonna (ESP1...), aunque no esté marcada")
    parser.add_argument("--limit", type=int, help="Máximo de jugadoras por liga (pruebas)")
    parser.add_argument("--todas-temporadas", action="store_true",
                        help="actualizar-opta: todas las temporadas elegidas, no solo la última")
    args = parser.parse_args()
    store, sd = Store(get_supabase_client()), SDClient()
    if args.accion == "catalogo":
        return catalogo(store, sd)
    if args.accion == "recalcular":
        return recalcular(store, args.liga)
    if args.accion == "actualizar-opta":
        # Una liga recién activada se descarga entera (Soccerdonna + todas sus temporadas Opta) en la misma pasada
        nuevas = ligas_nuevas(store, args.liga)
        for code in nuevas:
            logger.info(f"▶ Liga nueva {code}: descarga completa de Soccerdonna")
            descargar(store, sd, code, args.limit, args.refresco_dias)
        opta(store, args.liga, args.max_matches, solo_ultima=not args.todas_temporadas)
        vincular(store, args.liga)
        for code in nuevas:
            escudos(store, code)
        fotos(store, args.liga, args.limit)
        return
    if args.accion == "actualizar-soccerdonna":
        descargar(store, sd, args.liga, args.limit, args.refresco_dias)
        vincular(store, args.liga)
        escudos(store, args.liga)
        fotos(store, args.liga, args.limit)
        return
    if args.accion in ("descargar", "todo"):
        descargar(store, sd, args.liga, args.limit, args.refresco_dias)
    if args.accion in ("opta", "todo"):
        opta(store, args.liga, args.max_matches)
    if args.accion in ("vincular", "todo"):
        vincular(store, args.liga)
    if args.accion in ("escudos", "todo"):
        escudos(store, args.liga)
    if args.accion in ("fotos", "todo"):
        fotos(store, args.liga, args.limit)


if __name__ == "__main__":
    main()
