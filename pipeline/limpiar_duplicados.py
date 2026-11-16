#!/usr/bin/env python3
"""
pipeline/limpiar_duplicados.py

Audita y limpia duplicados entre Soccerdonna (id 'sd-*' / 'sd_*') y Opta en Supabase:
  1. Clubes (teams): fusiona clubes 'sd-*' en su club equivalente de Opta,
     respetando filiales (B, II, C) para no mezclar primer equipo con filial.
  2. Jugadoras (players): fusiona jugadoras 'sd_*' en su ficha de Opta cuando
     coinciden por nombre + fecha de nacimiento o nombre + club.

Uso:
  python -m pipeline.limpiar_duplicados            # Modo simulación (--dry-run)
  python -m pipeline.limpiar_duplicados --aplicar  # Aplica los cambios en Supabase
"""

import argparse
import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

from rapidfuzz import fuzz

from .storage import Store, get_supabase_client

STOPWORDS_CLUB = {
    "fc", "cf", "cd", "ud", "sd", "rcd", "ca", "ac", "as", "sc", "sv", "vfl", "vfb",
    "wfc", "lfc", "women", "woman", "femenino", "femeni", "feminas", "feminine",
    "femminile", "frauen", "dames", "club", "futbol", "football", "de", "la", "el", "del",
}

FILIAL_RE = re.compile(r"\b(b|ii|c|iii|u23|u21|u19)\b", re.IGNORECASE)


def norm_texto(s: Optional[str]) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^a-z0-9\s]", " ", s.lower())
    return re.sub(r"\s+", " ", s).strip()


def es_filial(s: Optional[str]) -> str:
    n = norm_texto(s)
    m = FILIAL_RE.search(n)
    return m.group(1).lower() if m else ""


def norm_club(s: Optional[str]) -> str:
    n = norm_texto(s)
    tokens = [t for t in n.split() if t not in STOPWORDS_CLUB]
    return " ".join(tokens)


def emparejar_clubes(teams: List[Dict[str, Any]]) -> List[Tuple[Dict[str, Any], Dict[str, Any], float]]:
    opta_teams = [t for t in teams if not str(t["id"]).startswith("sd-")]
    sd_teams = [t for t in teams if str(t["id"]).startswith("sd-")]

    # Precomputar
    opta_info = [(t, norm_club(t.get("name")), es_filial(t.get("name"))) for t in opta_teams]
    fusiones = []

    for sd in sd_teams:
        sd_norm = norm_club(sd.get("name"))
        sd_filial = es_filial(sd.get("name"))
        if not sd_norm:
            continue

        mejor_t, mejor_score = None, 0.0
        for ot, o_norm, o_filial in opta_info:
            if sd_filial != o_filial:
                continue
            if not o_norm:
                continue
            if sd_norm == o_norm:
                mejor_t, mejor_score = ot, 100.0
                break
            sc = fuzz.token_set_ratio(sd_norm, o_norm)
            if sc > mejor_score:
                mejor_t, mejor_score = ot, sc

        if mejor_t and mejor_score >= 90.0:
            fusiones.append((sd, mejor_t, mejor_score))

    return fusiones


def emparejar_jugadoras(
    players: List[Dict[str, Any]],
    mapa_clubes: Dict[str, str],
) -> List[Tuple[Dict[str, Any], Dict[str, Any], str]]:
    opta_players = [p for p in players if not str(p["id"]).startswith("sd_")]
    sd_players = [p for p in players if str(p["id"]).startswith("sd_")]

    por_fecha: Dict[str, List[Dict[str, Any]]] = {}
    por_club: Dict[str, List[Dict[str, Any]]] = {}
    for p in opta_players:
        bd = str(p.get("birth_date") or "")[:10]
        if bd:
            por_fecha.setdefault(bd, []).append(p)
        tid = p.get("current_team_id")
        if tid:
            por_club.setdefault(tid, []).append(p)

    fusiones = []
    usados_opta = set()

    for sd in sd_players:
        sd_nom = norm_texto(sd.get("name"))
        sd_bd = str(sd.get("birth_date") or "")[:10]
        sd_tid = mapa_clubes.get(sd.get("current_team_id") or "", sd.get("current_team_id") or "")

        match_opta = None
        motivo = ""

        # 1. Por fecha de nacimiento exacta + nombre parecido
        if sd_bd and sd_bd in por_fecha:
            for op in por_fecha[sd_bd]:
                if op["id"] in usados_opta:
                    continue
                sc = max(
                    fuzz.token_sort_ratio(sd_nom, norm_texto(op.get("name"))),
                    fuzz.token_sort_ratio(sd_nom, norm_texto(op.get("match_name"))),
                )
                if sc >= 82:
                    match_opta = op
                    motivo = f"fecha={sd_bd} + nombre({sc:.0f}%)"
                    break

        # 2. Por mismo club (ya unificado) + nombre muy parecido
        if not match_opta and sd_tid and sd_tid in por_club:
            for op in por_club[sd_tid]:
                if op["id"] in usados_opta:
                    continue
                sc = max(
                    fuzz.token_sort_ratio(sd_nom, norm_texto(op.get("name"))),
                    fuzz.token_sort_ratio(sd_nom, norm_texto(op.get("match_name"))),
                )
                if sc >= 90:
                    match_opta = op
                    motivo = f"club + nombre({sc:.0f}%)"
                    break

        if match_opta:
            usados_opta.add(match_opta["id"])
            fusiones.append((sd, match_opta, motivo))

    return fusiones


def main():
    parser = argparse.ArgumentParser(description="Limpiar clubes y jugadoras duplicadas (SD -> Opta)")
    parser.add_argument("--aplicar", action="store_true", help="Ejecuta los cambios reales en Supabase")
    args = parser.parse_args()

    client = get_supabase_client()
    store = Store(client)

    print("[*] Cargando clubes y jugadoras de Supabase...")
    teams = store.select_all("teams", "id,name,short_name,competition_id,badge_url")
    players = store.select_all(
        "players",
        "id,name,match_name,birth_date,current_team_id,photo_url,market_value,height,weight,preferred_foot",
    )

    fusiones_clubes = emparejar_clubes(teams)
    mapa_clubes = {sd["id"]: op["id"] for sd, op, _ in fusiones_clubes}

    fusiones_jugadoras = emparejar_jugadoras(players, mapa_clubes)

    print(f"\n=== RESUMEN ({'APLICANDO' if args.aplicar else 'DRY-RUN / SIMULACIÓN'}) ===")
    print(f"Clubes totales: {len(teams)} | Clubes sd-* fusionables con Opta: {len(fusiones_clubes)}")
    for sd, op, sc in fusiones_clubes[:15]:
        print(f"  [CLUB {sc:.0f}%] {sd['id']} ({sd['name']})  -->  {op['id']} ({op['name']})")
    if len(fusiones_clubes) > 15:
        print(f"  ... y {len(fusiones_clubes) - 15} clubes más.")

    print(f"\nJugadoras totales: {len(players)} | Jugadoras sd_* fusionables con Opta: {len(fusiones_jugadoras)}")
    for sd, op, mot in fusiones_jugadoras[:15]:
        print(f"  [JUGADORA {mot}] {sd['id']} ({sd['name']})  -->  {op['id']} ({op['name']})")
    if len(fusiones_jugadoras) > 15:
        print(f"  ... y {len(fusiones_jugadoras) - 15} jugadoras más.")

    if not args.aplicar:
        print("\n[i] Modo simulación finalizado. No se modificó ningún dato.")
        print("    Para aplicar la limpieza, ejecuta: python -m pipeline.limpiar_duplicados --aplicar")
        return

    # Aplicación real
    print("\n[*] Aplicando fusión de clubes...")
    for sd, op, _ in fusiones_clubes:
        client.table("players").update({"current_team_id": op["id"]}).eq("current_team_id", sd["id"]).execute()
        client.table("squad_members").update({"team_id": op["id"]}).eq("team_id", sd["id"]).execute()
        if not op.get("badge_url") and sd.get("badge_url"):
            client.table("teams").update({"badge_url": sd["badge_url"]}).eq("id", op["id"]).execute()
        client.table("teams").delete().eq("id", sd["id"]).execute()

    print("[*] Aplicando fusión de jugadoras...")
    tablas_hijas = ["player_market_values", "player_transfers", "player_injuries", "player_national_teams", "scouting_reports"]
    for sd, op, _ in fusiones_jugadoras:
        # Completar campos vacíos en Opta con los de Soccerdonna
        patch = {}
        for col in ("birth_date", "photo_url", "market_value", "height", "weight", "preferred_foot", "current_team_id"):
            if not op.get(col) and sd.get(col):
                patch[col] = sd[col]
        if patch:
            client.table("players").update(patch).eq("id", op["id"]).execute()

        for tb in tablas_hijas:
            try:
                client.table(tb).update({"player_id": op["id"]}).eq("player_id", sd["id"]).execute()
            except Exception:
                pass

        client.table("players").delete().eq("id", sd["id"]).execute()

    print("[✓] Limpieza completada.")


if __name__ == "__main__":
    main()

