"""
pipeline/cz_ligas.py
Ligas sin Soccerdonna descargadas de ceroacero.es (p. ej. la Primera A femenina de Argentina).

Se eligen en /admin igual que las de Soccerdonna (tabla sd_leagues): la fila lleva en `url` la página de la
competición en ceroacero (https://www.ceroacero.es/competicion/<slug>/<id>). sd_ligas.descargar() las manda aquí
y el resto del flujo estándar (Opta → vincular → completar → escudos → fotos → coche escoba) es el mismo.

Formato idéntico al de Soccerdonna para que todo lo demás funcione sin cambios:
  jugadora  players.id = "sd-cz<id ceroacero>" (las "sd-" son las fichas que vincular une con Opta y borra)
  club      teams.id   = "sd-cz<id ceroacero>", con sd_league_code de la liga
  traspasos player_transfers (mismo id que el coche escoba de ceroacero: no se duplican)
Las fichas ya unidas a una jugadora Opta (cz_id en su fila) solo rellenan huecos: Opta manda.

Uso suelto (normalmente va dentro de sd_ligas):
    python -m pipeline.sd_ligas descargar --liga ARG1 [--limit 10]
"""

import logging
import re
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from . import traducciones as en
from .ceroacero import CZ_BASE, CZClient, _id_traspaso, _temporada
from .config import BUCKET_PLAYER_PHOTOS
from .photos import normalizar_club
from .soccerdonna import _homogeneo, fecha_relleno, now_iso
from .storage import Store

logger = logging.getLogger("cz_ligas")

# Posición de ceroacero (español) → la de Soccerdonna, que es la que muestra la web
POSICIONES = (
    (r"porter|guardamet", "Goalkeeper"),
    (r"lateral derech|carrilero derech", "Defence - Fullback, right"),
    (r"lateral izquierd|carrilero izquierd", "Defence - Fullback, left"),
    (r"defensa central|central", "Defence - Centre Back"),
    (r"defens", "Defence"),
    (r"pivote|defensivo", "Midfield - Defensive Midfield"),
    (r"mediapunta|enganche", "Midfield - Attacking Midfield"),
    (r"(interior|volante|medio) derech", "Midfield - Midfield, right"),
    (r"(interior|volante|medio) izquierd", "Midfield - Midfield, left"),
    (r"extremo derech", "Striker - Right Wing"),
    (r"extremo izquierd", "Striker - Left Wing"),
    (r"segundo delantero", "Striker - Second Striker"),
    (r"delantero|ariete|punta", "Striker - Centre Forward"),
    (r"mediocentro|centrocampista|medio", "Midfield - Central Midfield"),
)


def es_ceroacero(liga: Dict[str, Any]) -> bool:
    return (liga.get("url") or "").startswith(CZ_BASE)


def ligas_ceroacero(store: Store) -> Tuple[set, set]:
    """(códigos sd_leagues, competiciones Opta) de las ligas que van por ceroacero. Sus jugadoras no se buscan
    en Soccerdonna (completar, retiradas): Soccerdonna no tiene esas ligas y solo daría falsos positivos."""
    ligas = [l for l in store.select_all("sd_leagues", "code,url,opta_competition_id") if es_ceroacero(l)]
    return {l["code"] for l in ligas}, {l["opta_competition_id"] for l in ligas if l.get("opta_competition_id")}


def posicion(valores: List[str]) -> Optional[str]:
    for v in valores or []:
        for patron, pos in POSICIONES:
            if re.search(patron, v.lower()):
                return pos
    return None


def _ruta(url: str) -> str:
    return url[len(CZ_BASE):] if url.startswith(CZ_BASE) else url


def edicion_actual(cz: CZClient, url_competicion: str) -> Optional[str]:
    """La edición más reciente de la competición (la de id más alto)."""
    html = cz.get(_ruta(url_competicion)) or ""
    ediciones = {int(i): f"/edicion/{s}/{i}" for s, i in re.findall(r'href="/edicion/([^"/?]+)/(\d+)"', html)}
    return ediciones[max(ediciones)] if ediciones else None


def clubes(cz: CZClient, edicion: str) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    """[{cz_id, slug, name, badge}] de la edición y su temporada (epoca_id de ceroacero)."""
    html = cz.get(edicion) or ""
    vistos: Dict[int, Dict[str, Any]] = {}
    epoca = None
    for slug, cid, ep in re.findall(r'href="/equipo/([^"/?]+)/(\d+)\?epoca_id=(\d+)"', html):
        vistos.setdefault(int(cid), {"cz_id": int(cid), "slug": slug})
        epoca = epoca or ep
    for c in vistos.values():
        pag = cz.get(f"/equipo/{c['slug']}/{c['cz_id']}?epoca_id={epoca}") or ""
        titulo = re.search(r"<title>([^<]+)", pag)
        nombre = (titulo.group(1).split(" - ")[0] if titulo else c["slug"].replace("-", " ").title())
        c["name"] = re.sub(r"\s*\((Femenino|Feminino|Fem\.?)\)\s*$", "", nombre.strip(), flags=re.I)
        escudo = re.search(r'src="(https://cdn-img\.staticzz\.com/img/logos/equipas/[^"]+)"', pag)
        c["badge"] = escudo.group(1) if escudo else None
    return list(vistos.values()), epoca


def plantilla(cz: CZClient, club: Dict[str, Any], epoca: Optional[str]) -> List[Dict[str, Any]]:
    """Jugadoras del club en la temporada: [{cz_id, slug, name}]."""
    html = cz.get(f"/equipo/{club['slug']}/{club['cz_id']}/jugadores?epoca_stats_id={epoca}") or ""
    res: Dict[int, Dict[str, Any]] = {}
    for slug, jid, nombre in re.findall(r'href="/jugador/([^"/]+)/(\d+)"><span[^>]*>([^<]+)</span>', html):
        res.setdefault(int(jid), {"cz_id": int(jid), "slug": slug, "name": nombre.strip()})
    # Por si alguna no trae el nombre en el enlace (se saca del slug)
    for slug, jid in re.findall(r'href="/jugador/([^"/]+)/(\d+)"', html):
        res.setdefault(int(jid), {"cz_id": int(jid), "slug": slug, "name": slug.replace("-", " ").title()})
    return list(res.values())


def filas(p: Dict[str, Any], previa: Optional[Dict[str, Any]], j: Dict[str, Any], prof: Dict[str, Any],
          club: Dict[str, Any], liga: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    """Fila de players + traspasos. Si ya es una jugadora Opta (unida), solo los campos vacíos."""
    unida = not p["id"].startswith("sd-")
    previa = previa or {}
    hueco = lambda k: not unida or not previa.get(k)
    row: Dict[str, Any] = {"id": p["id"], "name": p["name"], "cz_id": j["cz_id"], "cz_updated_at": now_iso(),
                           "cz_url": f"{CZ_BASE}/jugador/{j['slug']}/{j['cz_id']}", "sd_league_code": liga["code"]}
    nac = str(previa.get("birth_date") or "")[:10]
    if prof["birth_date"] and not fecha_relleno(prof["birth_date"]) and (not unida or not nac or fecha_relleno(nac)):
        row["birth_date"] = prof["birth_date"]
    for k in ("place_of_birth", "height", "weight", "preferred_foot", "contract_expires"):
        if prof.get(k) and hueco(k):
            row[k] = prof[k]
    if prof["nacionalidades"]:
        if hueco("citizenship"):
            row["citizenship"] = prof["nacionalidades"]
        if hueco("country"):
            row["country"] = en.pais_opta(prof["nacionalidades"][0])
    pos = posicion((next((d for k, d in prof["datos"].items() if k.lower().startswith("posici")), {}) or {})
                   .get("valores", []))
    if pos and hueco("tm_position_main"):
        row["tm_position_main"] = pos
    # Club y liga de hoy: los de la plantilla que se está leyendo (como Soccerdonna)
    row.update(fm_team_name=club["name"], fm_team_badge_url=club.get("badge"), current_league_name=liga["name"],
               current_league_logo_url=liga.get("logo_url"))
    if not unida:
        row["current_team_id"] = f"sd-cz{club['cz_id']}"
    traspasos = [{
        "tm_transfer_id": _id_traspaso(j["cz_id"], t["date"], t["club_from"], t["club_to"]),
        "player_id": p["id"], "date": t["date"], "season": _temporada(t["date"]),
        "club_from": en.club(t["club_from"]), "club_to": en.club(t["club_to"]),
        "club_from_badge_url": t["badge_from"], "club_to_badge_url": t["badge_to"],
        "fee": None, "fee_text": en.traspaso(t["fee_text"]), "loan": t["loan"], "upcoming": False,
    } for t in prof["traspasos"]]
    return {"players": [{k: v for k, v in row.items() if v is not None}], "player_transfers": traspasos}


def foto(store: Store, cz: CZClient, pid: str, url: Optional[str]) -> Optional[str]:
    img = cz.image(url) if url else None
    if not img:
        return None
    contenido, ct = img
    try:  # sin fondo, como el resto de fotos de la app
        from .fotos_365 import sin_fondo
        contenido, ct = sin_fondo(contenido), "image/png"
    except Exception as e:
        logger.warning(f"  ceroacero: no se pudo quitar el fondo a la foto ({e})")
    subida = store.upload(BUCKET_PLAYER_PHOTOS, f"{pid}_cz.{'png' if 'png' in ct else 'jpg'}", contenido, ct)
    return f"{subida}?v={int(time.time())}" if subida else None


def descargar_liga(store: Store, liga: Dict[str, Any], limit: Optional[int], refresco_dias: int):
    """Clubes de la edición actual → plantilla de cada uno → ficha de cada jugadora → Supabase."""
    cz = CZClient(cache_days=1)  # las fichas se refrescan según refresco_dias, no por la caché
    edicion = edicion_actual(cz, liga["url"])
    if not edicion:
        logger.warning(f"▶ {liga['name']}: no se encuentra la edición actual en {liga['url']}")
        return
    lista, epoca = clubes(cz, edicion)
    logger.info(f"▶ {liga['name']} ({liga['country']}) desde ceroacero {edicion}: {len(lista)} clubes")
    store.upsert("teams", [{"id": f"sd-cz{c['cz_id']}", "name": c["name"], "country": liga["country"],
                            "badge_url": c.get("badge"), "sd_league_code": liga["code"], "league_name": liga["name"],
                            "league_logo_url": liga.get("logo_url"), "updated_at": now_iso()} for c in lista])
    cols = ("id,name,cz_id,cz_updated_at,fm_team_name,photo_url,birth_date,place_of_birth,height,weight,"
            "preferred_foot,contract_expires,citizenship,country,tm_position_main")
    guardadas = {p["cz_id"]: p for p in store.select_all("players", cols) if p.get("cz_id")}
    limite = time.time() - refresco_dias * 86400
    tot = {"jugadoras": 0, "nuevas": 0, "al_dia": 0, "fotos": 0, "sin_ficha": 0}
    hechas = 0
    for club in lista:
        pendiente: Dict[str, List[Dict[str, Any]]] = {}
        for j in plantilla(cz, club, epoca):
            if limit and hechas >= limit:
                break
            previa = guardadas.get(j["cz_id"])
            if previa and previa.get("cz_updated_at"):
                hecha = datetime.fromisoformat(previa["cz_updated_at"].replace("Z", "+00:00")).timestamp()
                if hecha > limite and normalizar_club(previa.get("fm_team_name")) == normalizar_club(club["name"]):
                    tot["al_dia"] += 1
                    continue
            prof = cz.perfil(j["slug"], j["cz_id"])
            if not prof:
                tot["sin_ficha"] += 1
                continue
            p = {"id": previa["id"] if previa else f"sd-cz{j['cz_id']}", "name": previa["name"] if previa else j["name"]}
            f = filas(p, previa, j, prof, club, liga)
            if not (previa or {}).get("photo_url"):
                url = foto(store, cz, p["id"], prof.get("foto"))
                if url:
                    f["players"][0].update(photo_url=url, photo_updated_at=now_iso())
                    tot["fotos"] += 1
            for k, v in f.items():
                pendiente.setdefault(k, []).extend(v)
            hechas += 1
            tot["jugadoras"] += 1
            tot["nuevas"] += 0 if previa else 1
        for grupo in _homogeneo(pendiente.get("players", [])):
            store.upsert("players", grupo)
        traspasos = list({t["tm_transfer_id"]: t for t in pendiente.get("player_transfers", [])}.values())
        for grupo in _homogeneo(traspasos):
            store.upsert("player_transfers", grupo, on_conflict="tm_transfer_id")
        logger.info(f"  {club['name']}: {tot} ({cz.peticiones} peticiones)")
        if limit and hechas >= limit:
            break
    store.update("sd_leagues", {"last_download_at": now_iso()}, code=liga["code"])
    logger.info(f"ceroacero {liga['name']} completado: {tot}")
