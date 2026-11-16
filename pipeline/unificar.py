#!/usr/bin/env python3
"""
pipeline/unificar.py

Unificador Golden Record:
  1. Lee `raw_opta_teams`, `raw_soccerdonna_teams` y `team_links`.
  2. Lee `raw_opta_players`, `raw_soccerdonna_players` y `player_links`.
  3. Empareja automáticamente nuevos registros sin vínculo y los guarda en `team_links` / `player_links`.
  4. Actualiza las tablas maestras `teams` y `players` combinando ambas fuentes con prioridad:
     - Opta manda en estadísticas, dorsal, posición Opta y club oficial.
     - Soccerdonna aporta valor de mercado, altura/pie/fecha si faltan y foto si falta.

Uso:
  .venv/bin/python -m pipeline.unificar
"""

from typing import Any, Dict, List

from .limpiar_duplicados import emparejar_clubes, emparejar_jugadoras
from .storage import Store, get_supabase_client


def unificar_todo(store: Store):
    print("[*] Cargando tablas de staging y vínculos...")
    opta_teams = store.select_all("raw_opta_teams", "*")
    sd_teams = store.select_all("raw_soccerdonna_teams", "*")
    existing_tlinks = store.select_all("team_links", "opta_team_id,sd_team_id")
    linked_sd_teams = {r["sd_team_id"]: r["opta_team_id"] for r in existing_tlinks}

    # 1. Detectar nuevos vínculos de clubes
    unlinked_sd_teams = [t for t in sd_teams if t["id"] not in linked_sd_teams]
    if unlinked_sd_teams:
        nuevos_tlinks = emparejar_clubes(opta_teams + unlinked_sd_teams)
        if nuevos_tlinks:
            rows = [
                {
                    "opta_team_id": op["id"],
                    "sd_team_id": sd["id"],
                    "confidence": float(sc),
                    "method": "auto_unifier",
                    "verified": sc == 100.0,
                }
                for sd, op, sc in nuevos_tlinks
            ]
            store.upsert("team_links", rows, on_conflict="opta_team_id,sd_team_id")
            for r in rows:
                linked_sd_teams[r["sd_team_id"]] = r["opta_team_id"]
            print(f"  + {len(rows)} nuevos team_links detectados")

    # 2. Detectar nuevos vínculos de jugadoras
    opta_players = store.select_all("raw_opta_players", "*")
    sd_players = store.select_all("raw_soccerdonna_players", "*")
    existing_plinks = store.select_all("player_links", "opta_player_id,sd_player_id")
    linked_sd_players = {r["sd_player_id"]: r["opta_player_id"] for r in existing_plinks}

    unlinked_sd_players = [p for p in sd_players if p["id"] not in linked_sd_players]
    if unlinked_sd_players:
        nuevos_plinks = emparejar_jugadoras(opta_players + unlinked_sd_players, linked_sd_teams)
        if nuevos_plinks:
            rows = [
                {
                    "opta_player_id": op["id"],
                    "sd_player_id": sd["id"],
                    "confidence": 95.0,
                    "method": mot,
                    "verified": False,
                }
                for sd, op, mot in nuevos_plinks
            ]
            store.upsert("player_links", rows, on_conflict="opta_player_id,sd_player_id")
            for r in rows:
                linked_sd_players[r["sd_player_id"]] = r["opta_player_id"]
            print(f"  + {len(rows)} nuevos player_links detectados")

    # 3. Consolidar `teams` (Opta + SD no vinculados)
    sd_by_opta_team: Dict[str, Dict[str, Any]] = {}
    sd_team_map = {t["id"]: t for t in sd_teams}
    for sd_id, op_id in linked_sd_teams.items():
        if sd_id in sd_team_map:
            sd_by_opta_team[op_id] = sd_team_map[sd_id]

    teams_out: List[Dict[str, Any]] = []
    for ot in opta_teams:
        sd = sd_by_opta_team.get(ot["id"], {})
        teams_out.append({
            "id": ot["id"],
            "name": ot["name"],
            "short_name": ot.get("short_name"),
            "country": ot.get("country") or sd.get("country"),
            "competition_id": ot.get("competition_id"),
            "badge_url": ot.get("badge_url") or sd.get("badge_url"),
        })
    for st in sd_teams:
        if st["id"] not in linked_sd_teams:
            teams_out.append({
                "id": st["id"],
                "name": st["name"],
                "country": st.get("country"),
                "badge_url": st.get("badge_url"),
            })

    store.upsert("teams", [{k: v for k, v in r.items() if v is not None} for r in teams_out])

    # 4. Consolidar `players` (Opta + SD vinculados + SD no vinculados)
    sd_by_opta_player: Dict[str, Dict[str, Any]] = {}
    sd_player_map = {p["id"]: p for p in sd_players}
    for sd_id, op_id in linked_sd_players.items():
        if sd_id in sd_player_map:
            sd_by_opta_player[op_id] = sd_player_map[sd_id]

    valid_team_ids = {t["id"] for t in teams_out}

    players_out: List[Dict[str, Any]] = []
    for op in opta_players:
        sd = sd_by_opta_player.get(op["id"], {})
        raw_tid = op.get("current_team_id")
        resolved_tid = linked_sd_teams.get(raw_tid or "", raw_tid)
        if resolved_tid and resolved_tid not in valid_team_ids:
            resolved_tid = None
        merged = {
            "id": op["id"],
            "name": op["name"],
            "first_name": op.get("first_name"),
            "last_name": op.get("last_name"),
            "match_name": op.get("match_name"),
            "country": op.get("country") or sd.get("country"),
            "birth_date": op.get("birth_date") or sd.get("birth_date"),
            "place_of_birth": op.get("place_of_birth") or sd.get("place_of_birth"),
            "height": op.get("height") or sd.get("height"),
            "weight": op.get("weight"),
            "preferred_foot": op.get("preferred_foot") or sd.get("preferred_foot"),
            "shirt_number": op.get("shirt_number"),
            "opta_position": op.get("opta_position"),
            "current_team_id": resolved_tid,
            "photo_url": op.get("photo_url") or sd.get("photo_url"),
            "market_value": sd.get("market_value"),
        }
        players_out.append({k: v for k, v in merged.items() if v is not None})

    for sp in sd_players:
        if sp["id"] not in linked_sd_players:
            tid = linked_sd_teams.get(sp.get("current_team_id") or "", sp.get("current_team_id"))
            row = {
                "id": sp["id"],
                "name": sp["name"],
                "country": sp.get("country"),
                "birth_date": sp.get("birth_date"),
                "place_of_birth": sp.get("place_of_birth"),
                "height": sp.get("height"),
                "preferred_foot": sp.get("preferred_foot"),
                "current_team_id": tid,
                "photo_url": sp.get("photo_url"),
                "market_value": sp.get("market_value"),
            }
            players_out.append({k: v for k, v in row.items() if v is not None})

    store.upsert("players", players_out, batch=200)
    print(f"[✓] Unificación completada: {len(teams_out)} clubes y {len(players_out)} jugadoras en tablas maestras.")


def main():
    client = get_supabase_client()
    store = Store(client)
    unificar_todo(store)


if __name__ == "__main__":
    main()
