#!/usr/bin/env python3
"""
pipeline/migrar_a_staging.py

Migración inicial (idempotente) desde las tablas actuales `teams` y `players`
hacia las tablas de staging (`raw_opta_*`, `raw_soccerdonna_*`) y generación
de los vínculos iniciales en `team_links` y `player_links`.

Uso:
  .venv/bin/python -m pipeline.migrar_a_staging
"""

from typing import Any, Dict, List

from .limpiar_duplicados import emparejar_clubes, emparejar_jugadoras
from .storage import Store, get_supabase_client


def main():
    client = get_supabase_client()
    store = Store(client)

    print("[*] Leyendo `teams` y `players` actuales...")
    teams = store.select_all("teams", "id,name,short_name,country,competition_id,badge_url")
    players = store.select_all(
        "players",
        "id,name,first_name,last_name,match_name,country,birth_date,place_of_birth,height,weight,preferred_foot,shirt_number,opta_position,current_team_id,photo_url,market_value",
    )

    opta_teams: List[Dict[str, Any]] = []
    sd_teams: List[Dict[str, Any]] = []
    for t in teams:
        if str(t["id"]).startswith("sd-"):
            sd_teams.append({
                "id": t["id"],
                "name": t["name"],
                "country": t.get("country"),
                "badge_url": t.get("badge_url"),
            })
        else:
            opta_teams.append({
                "id": t["id"],
                "name": t["name"],
                "short_name": t.get("short_name"),
                "country": t.get("country"),
                "competition_id": t.get("competition_id"),
                "badge_url": t.get("badge_url"),
            })

    opta_players: List[Dict[str, Any]] = []
    sd_players: List[Dict[str, Any]] = []
    for p in players:
        if str(p["id"]).startswith("sd_"):
            sd_players.append({
                "id": p["id"],
                "name": p["name"],
                "country": p.get("country"),
                "birth_date": p.get("birth_date"),
                "place_of_birth": p.get("place_of_birth"),
                "height": p.get("height"),
                "preferred_foot": p.get("preferred_foot"),
                "current_team_id": p.get("current_team_id"),
                "market_value": p.get("market_value"),
                "photo_url": p.get("photo_url"),
            })
        else:
            opta_players.append({
                "id": p["id"],
                "name": p["name"],
                "first_name": p.get("first_name"),
                "last_name": p.get("last_name"),
                "match_name": p.get("match_name"),
                "country": p.get("country"),
                "birth_date": p.get("birth_date"),
                "place_of_birth": p.get("place_of_birth"),
                "height": p.get("height"),
                "weight": p.get("weight"),
                "preferred_foot": p.get("preferred_foot"),
                "shirt_number": p.get("shirt_number"),
                "opta_position": p.get("opta_position"),
                "current_team_id": p.get("current_team_id"),
                "photo_url": p.get("photo_url"),
            })

    print(f"[*] Guardando en staging: {len(opta_teams)} equipos Opta, {len(sd_teams)} equipos SD...")
    store.upsert("raw_opta_teams", opta_teams)
    store.upsert("raw_soccerdonna_teams", sd_teams)

    print(f"[*] Guardando en staging: {len(opta_players)} jugadoras Opta, {len(sd_players)} jugadoras SD...")
    store.upsert("raw_opta_players", opta_players, batch=200)
    store.upsert("raw_soccerdonna_players", sd_players, batch=200)

    # Generar vínculos iniciales
    fusiones_clubes = emparejar_clubes(teams)
    team_links = [
        {
            "opta_team_id": op["id"],
            "sd_team_id": sd["id"],
            "confidence": float(sc),
            "method": "auto_migration",
            "verified": sc == 100.0,
        }
        for sd, op, sc in fusiones_clubes
    ]
    if team_links:
        store.upsert("team_links", team_links, on_conflict="opta_team_id,sd_team_id")

    mapa_clubes = {sd["id"]: op["id"] for sd, op, _ in fusiones_clubes}
    fusiones_jugadoras = emparejar_jugadoras(players, mapa_clubes)
    player_links = [
        {
            "opta_player_id": op["id"],
            "sd_player_id": sd["id"],
            "confidence": 95.0,
            "method": mot,
            "verified": False,
        }
        for sd, op, mot in fusiones_jugadoras
    ]
    if player_links:
        store.upsert("player_links", player_links, on_conflict="opta_player_id,sd_player_id")

    print(f"[✓] Migración a staging completada:")
    print(f"    - team_links creados: {len(team_links)}")
    print(f"    - player_links creados: {len(player_links)}")


if __name__ == "__main__":
    main()

