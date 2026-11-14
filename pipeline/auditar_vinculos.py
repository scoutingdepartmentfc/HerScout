"""
pipeline/auditar_vinculos.py
Auditoría de los vínculos jugadora ↔ fuentes externas (Soccerdonna y FotMob) hechos con el emparejamiento
antiguo, que daba por buenos nombres que solo compartían el nombre de pila ('Laia Rius' ↔ 'Laia Aleixandri')
y fotos de FotMob de hombres ('Noela Sánchez' ↔ 'Noel Sánchez').

1. Fichas de Soccerdonna mal vinculadas
   a) la ficha ya es de otra jugadora (sd_url apunta al sd_id de otra con otro nombre);
   b) el nombre de la ficha (slug de la URL) no se parece al de la jugadora.
   Se borran los datos que copió Soccerdonna (perfil, valores, traspasos, lesiones, selecciones) y se deja
   sd_updated_at vacío para que el próximo `python -m pipeline.soccerdonna` la vuelva a buscar con las reglas nuevas.
   Si su fecha/lugar de nacimiento son los de la otra jugadora, también se borran (venían de esa ficha).
   Su foto, si salió de esa ficha o de FotMob, también se quita.

2. Fotos de FotMob ({id}.png) y 365scores ({id}_365.png): se vuelve a buscar a la jugadora con las reglas nuevas
   (mujer, nombre con apellido en común, fecha/club, una ficha de FotMob por jugadora).
   - Confirmada → se vuelve a subir la foto y se guarda players.fotmob_id.
   - No confirmada → se quita la foto (mejor sin foto que con la de otra persona).

Sin --apply solo genera el informe (data/auditoria_vinculos.json) y no toca nada.

    python -m pipeline.auditar_vinculos [--solo-sd] [--limit N]            # informe
    python -m pipeline.auditar_vinculos --apply [--desde-informe]          # aplicar
"""

import argparse
import json
import logging
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / ".env.local")
    load_dotenv()
except ImportError:
    pass

from . import fotos_365
from .config import BUCKET_PLAYER_PHOTOS, FOTMOB_PLAYER_IMG
from .photos import FotMobClient, sim_nombre
from .storage import Store, get_supabase_client

logger = logging.getLogger("auditar_vinculos")
INFORME = Path(__file__).parent.parent / "data" / "auditoria_vinculos.json"
RE_SD = re.compile(r"/en/([^/]+)/profil/spieler_(\d+)\.html")
SIM_MIN_SLUG = 60

# Columnas de players que rellena filas_jugadora() desde Soccerdonna
COLS_SD = ["sd_id", "sd_url", "sd_updated_at", "outfitter", "contract_expires", "market_value",
           "market_value_updated_at", "citizenship", "tm_position_main", "fm_team_name", "fm_team_badge_url"]
TABLAS_SD = ["player_market_values", "player_transfers", "player_injuries", "player_national_teams"]


def nombre_archivo(url: Any) -> str:
    return re.sub(r"\?.*", "", str(url or "")).rsplit("/", 1)[-1]


def fuente_foto(url: Any) -> Optional[str]:
    f = nombre_archivo(url)
    if not f:
        return None
    if f.endswith("_365.png"):
        return "365scores"
    if f.endswith("_sd.jpg"):
        return "soccerdonna"
    if f.endswith("_opta.jpg"):
        return "opta"
    if re.fullmatch(r"[^_]+\.png", f):
        return "fotmob"  # {player_id}.png (también las sd-XXXX.png subidas desde FotMob en sd_ligas)
    return "otra"


TRANSLIT = str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "Ä": "Ae", "Ö": "Oe", "Ü": "Ue", "ß": "ss"})


def sim_slug(p: Dict[str, Any], slug: str) -> float:
    """Parecido con el slug de la URL de Soccerdonna, que translitera ('maeaettae') o se come letras ('lrke-str')."""
    def quitar_no_ascii(t):
        return re.sub(r"[^\x00-\x7f]", "", t) if t else t
    campos = ("name", "match_name", "first_name", "last_name")
    variantes = [p,
                 {**p, **{k: (p.get(k) or "").translate(TRANSLIT) or None for k in campos}},
                 {**p, **{k: quitar_no_ascii(p.get(k)) or None for k in campos}}]
    return max(sim_nombre(v, slug.replace("-", " ")) for v in variantes)


def auditar_sd(jugadoras: List[Dict[str, Any]], solo_dueno: bool = False) -> List[Dict[str, Any]]:
    """`solo_dueno`: solo el caso seguro (la ficha es de otra jugadora con otro nombre), sin comparar con el slug,
    que da falsos positivos con transliteraciones ('Xanım Əsədova' / 'khanim-asadova')."""
    por_sd = {p["sd_id"]: p for p in jugadoras if p.get("sd_id")}
    malas = []
    for p in jugadoras:
        m = RE_SD.search(str(p.get("sd_url") or ""))
        if not m:
            continue
        slug, sd_id = m.group(1), int(m.group(2))
        dueno = por_sd.get(sd_id)
        motivo = None
        if dueno and dueno["id"] != p["id"] and sim_nombre(p, dueno["name"]) < 90:
            motivo = f"ficha de {dueno['name']}"
        elif not solo_dueno:
            sim = sim_slug(p, slug)
            if sim < SIM_MIN_SLUG:
                motivo = f"ficha '{slug}' (parecido {sim:.0f})"
        if not motivo:
            continue
        copiados = []
        if dueno and dueno["id"] != p["id"]:
            copiados = [c for c in ("birth_date", "place_of_birth") if p.get(c) and p.get(c) == dueno.get(c)]
        malas.append({"id": p["id"], "name": p["name"], "sd_url": p["sd_url"], "motivo": motivo,
                      "borrar_nacimiento": copiados, "foto": p.get("photo_url"),
                      "quitar_foto": fuente_foto(p.get("photo_url")) in ("soccerdonna", "fotmob", "365scores")})
    return malas


def auditar_fotos(store: Store, jugadoras: List[Dict[str, Any]], clubes: Dict[str, str],
                  limit: Optional[int]) -> List[Dict[str, Any]]:
    fotmob = FotMobClient()
    fotmob.cargar_asignados(store)
    revisar = [p for p in jugadoras if fuente_foto(p.get("photo_url")) in ("fotmob", "365scores")]
    if limit:
        revisar = revisar[:limit]
    logger.info(f"Fotos a verificar: {len(revisar)}")
    res = []
    for n, p in enumerate(revisar, 1):
        club = clubes.get(p.get("current_team_id"))
        try:
            m = fotmob.buscar_jugador(p, club)
        except Exception as e:  # red: no se decide nada sobre esta jugadora
            logger.warning(f"  {p['name']}: error FotMob ({e})")
            continue
        fuente = fuente_foto(p.get("photo_url"))
        ok_365 = False
        if not m and fuente == "365scores":
            try:  # la foto vino de 365scores: se confirma allí con las reglas nuevas
                ok_365 = fotos_365.buscar(p, club) is not None
            except Exception as e:
                logger.warning(f"  {p['name']}: error 365scores ({e})")
                continue
        res.append({"id": p["id"], "name": p["name"], "club": club, "foto": p.get("photo_url"), "fuente": fuente,
                    "fotmob_id": int(m["id"]) if m else None, "fotmob_name": m.get("name") if m else None,
                    "ok_365": ok_365})
        if n % 50 == 0:
            ok = sum(1 for r in res if r["fotmob_id"])
            logger.info(f"  {n}/{len(revisar)} · confirmadas {ok} · sin confirmar {len(res) - ok}")
    return res


def corregir_clubes(store: Store, ids: List[str]) -> int:
    """Club actual de las jugadoras desenlazadas de Soccerdonna. Si no están en ninguna plantilla activa de Opta,
    su club (y liga) venían de la ficha equivocada: se quedan sin equipo (no se usa el de una temporada anterior)."""
    from .sd_ligas import jugadoras_activas
    activas = jugadoras_activas(store)
    sin_club = [pid for pid in set(ids) if pid not in activas]
    for pid in sin_club:
        store.update("players", {"current_team_id": None, "fm_team_name": None, "fm_team_badge_url": None,
                                 "current_league_name": None, "current_league_logo_url": None,
                                 "sd_league_code": None, "league_id": None}, id=pid)
    logger.info(f"Sin equipo (no están en ninguna plantilla Opta activa): {len(sin_club)}")
    return len(sin_club)


def aplicar(store: Store, informe: Dict[str, Any]) -> None:
    ts = datetime.now(timezone.utc).isoformat()
    sd_malas = informe.get("soccerdonna", [])
    for r in sd_malas:
        valores = {c: None for c in COLS_SD + r["borrar_nacimiento"]}
        if r["quitar_foto"]:
            valores.update(photo_url=None, photo_updated_at=ts, fotmob_id=None)
        store.update("players", valores, id=r["id"])
        for t in TABLAS_SD:
            store.delete(t, player_id=r["id"])
    logger.info(f"Soccerdonna: {len(sd_malas)} vínculos deshechos")
    corregir_clubes(store, [r["id"] for r in sd_malas])

    quitadas = {r["id"] for r in sd_malas if r["quitar_foto"]}
    fotmob = FotMobClient()
    tot = {"resubidas": 0, "quitadas": 0}
    for r in informe.get("fotos", []):
        if r["id"] in quitadas or r.get("ok_365"):
            continue
        if r["fotmob_id"]:
            img = fotmob.image(FOTMOB_PLAYER_IMG.format(id=r["fotmob_id"]))
            url = store.upload(BUCKET_PLAYER_PHOTOS, f"{r['id']}.png", img, "image/png") if img else None
            if url:
                store.update("players", {"photo_url": f"{url}?v={int(time.time())}", "photo_updated_at": ts,
                                         "fotmob_id": r["fotmob_id"]}, id=r["id"])
                tot["resubidas"] += 1
                continue
        store.update("players", {"photo_url": None, "photo_updated_at": ts, "fotmob_id": None}, id=r["id"])
        tot["quitadas"] += 1
    logger.info(f"Fotos: {tot}")


def revisar_fichas_sd(store: Store) -> int:
    """Paso del proceso semanal (sd_ligas.flujo): deshace las fichas de Soccerdonna que son de otra jugadora."""
    jugadoras = store.select_all("players", "id,name,match_name,first_name,last_name,birth_date,place_of_birth,"
                                            "current_team_id,photo_url,sd_id,sd_url")
    malas = auditar_sd(jugadoras, solo_dueno=True)
    for r in malas:
        logger.info(f"  Ficha Soccerdonna deshecha: {r['name']} ({r['motivo']})")
    if malas:
        aplicar(store, {"soccerdonna": malas})
    return len(malas)


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    ap = argparse.ArgumentParser(description="Auditoría de vínculos Soccerdonna / FotMob")
    ap.add_argument("--apply", action="store_true", help="Aplicar los cambios (sin esto solo informe)")
    ap.add_argument("--desde-informe", action="store_true", help="Con --apply: usar el informe ya generado")
    ap.add_argument("--solo-sd", action="store_true", help="Solo fichas de Soccerdonna (sin consultar FotMob)")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--solo-clubes", action="store_true", help="Solo corregir el club de las fichas del informe")
    args = ap.parse_args()

    store = Store(get_supabase_client())
    if args.solo_clubes:
        corregir_clubes(store, [r["id"] for r in json.loads(INFORME.read_text())["soccerdonna"]])
        return
    if args.apply and args.desde_informe:
        aplicar(store, json.loads(INFORME.read_text()))
        return

    jugadoras = store.select_all("players", "id,name,match_name,first_name,last_name,birth_date,place_of_birth,"
                                            "country,citizenship,current_team_id,photo_url,sd_id,sd_url,fotmob_id")
    clubes = {t["id"]: t["name"] for t in store.select_all("teams", "id,name")}
    informe: Dict[str, Any] = {"generado": datetime.now(timezone.utc).isoformat(), "soccerdonna": auditar_sd(jugadoras)}
    logger.info(f"Soccerdonna: {len(informe['soccerdonna'])} fichas mal vinculadas")
    for r in informe["soccerdonna"][:40]:
        logger.info(f"  {r['name']}: {r['motivo']}")
    if not args.solo_sd:
        malas = {r["id"] for r in informe["soccerdonna"]}
        informe["fotos"] = auditar_fotos(store, [p for p in jugadoras if p["id"] not in malas], clubes, args.limit)
        sin = [r for r in informe["fotos"] if not r["fotmob_id"] and not r.get("ok_365")]
        logger.info(f"Fotos: {len(informe['fotos']) - len(sin)} confirmadas, {len(sin)} sin confirmar (se quitarían)")
    INFORME.parent.mkdir(exist_ok=True)
    INFORME.write_text(json.dumps(informe, ensure_ascii=False, indent=1))
    logger.info(f"Informe: {INFORME}")
    if args.apply:
        aplicar(store, informe)


if __name__ == "__main__":
    main()
