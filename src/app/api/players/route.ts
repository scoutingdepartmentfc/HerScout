import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const search = url.searchParams.get("search") || "";
  const position = url.searchParams.get("position") || "all";
  const team = url.searchParams.get("team") || "all";
  const league = url.searchParams.get("league") || "all";
  const minRating = url.searchParams.get("minRating") ? Number(url.searchParams.get("minRating")) : null;
  const sortBy = url.searchParams.get("sortBy") || "nota_global";
  const order = url.searchParams.get("order") === "asc" ? "asc" : "desc";

  if (!supabaseAdmin) {
    return NextResponse.json({ players: [], filters: { teams: [], leagues: [] } });
  }

  try {
    const db = supabaseAdmin as any;

    // Si ordenamos por una columna de notas de temporada o físico
    const validScores = [
      "nota_global",
      "nota_ataque",
      "nota_construccion",
      "nota_defensa",
      "nota_balon_parado",
      "nota_disponibilidad",
      "nota_fisico",
    ];

    // One row per player and season in player_season_stats: read them all (PostgREST pages of 1000)
    const selectStats = () => db
      .from("player_season_stats")
      .select(`
        player_id,
        season_id,
        seasons:season_id ( name, is_active, start_date ),
        demarcacion,
        grupo_demarcacion,
        matches_played,
        minutes_played,
        starter_pct,
        nota_global,
        nota_ataque,
        nota_construccion,
        nota_defensa,
        nota_balon_parado,
        nota_disponibilidad,
        score_general,
        players:player_id (
          id,
          name,
          match_name,
          first_name,
          last_name,
          country,
          birth_date,
          photo_url,
          primary_position,
          grupo_demarcacion,
          shirt_number,
          height,
          weight,
          market_value,
          fm_team_name, fm_team_badge_url, current_league_name, current_league_logo_url,
          teams:current_team_id ( id, name, badge_url, league_name, league_logo_url ),
          player_ea_ratings ( pace, physicality )
        )
      `);

    const rows: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await selectStats().order("player_id").order("season_id").range(from, from + 999);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }

    // A player with several seasons appears once: the current season (is_active) or, if she has no stats
    // there yet, her most recent one
    const rank = (r: any) => `${r.seasons?.is_active ? 1 : 0}|${r.seasons?.start_date || ""}`;
    const byPlayer = new Map<string, any>();
    for (const r of rows) {
      if (!r.players) continue;
      const prev = byPlayer.get(r.player_id);
      if (!prev || rank(r) > rank(prev)) byPlayer.set(r.player_id, r);
    }

    let list = Array.from(byPlayer.values())
      .map((row: any) => {
        const p = row.players;
        const ea = Array.isArray(p.player_ea_ratings) ? p.player_ea_ratings[0] : p.player_ea_ratings;
        const notaFisico = (() => {
          if (ea?.pace != null && ea?.physicality != null) {
            return Math.round(Number(ea.pace) * 0.45 + Number(ea.physicality) * 0.55);
          }
          return ea?.pace != null ? Number(ea.pace) : ea?.physicality != null ? Number(ea.physicality) : null;
        })();

        return {
          id: p.id,
          name: p.name,
          matchName: p.match_name || p.name,
          country: p.country,
          birthDate: p.birth_date,
          photoUrl: p.photo_url,
          position: row.demarcacion || p.primary_position || "Centrocampista",
          grupoDemarcacion: row.grupo_demarcacion || p.grupo_demarcacion || "General",
          shirtNumber: p.shirt_number,
          height: p.height,
          weight: p.weight,
          marketValue: p.market_value,
          teamId: p.teams?.id,
          teamName: p.fm_team_name || p.teams?.name || "Unattached",
          badgeUrl: (p.fm_team_name ? p.fm_team_badge_url : null) || p.teams?.badge_url,
          leagueName: p.current_league_name || p.teams?.league_name || "Primera División Femenina",
          leagueLogoUrl: p.current_league_logo_url || p.teams?.league_logo_url,
          seasonId: row.season_id,
          seasonName: row.seasons?.name || null,
          isCurrentSeason: !!row.seasons?.is_active,
          minutesPlayed: row.minutes_played,
          matchesPlayed: row.matches_played,
          notaGlobal: row.nota_global,
          notaAtaque: row.nota_ataque,
          notaConstruccion: row.nota_construccion,
          notaDefensa: row.nota_defensa,
          notaBalonParado: row.nota_balon_parado,
          notaDisponibilidad: row.nota_disponibilidad,
          notaFisico,
        };
      });

    // Available filter options extracted from all data
    const availableTeams = Array.from(new Set(list.map((p: any) => p.teamName).filter(Boolean))).sort();
    const availableLeagues = Array.from(new Set(list.map((p: any) => p.leagueName).filter(Boolean))).sort();

    // Filters
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((p: any) =>
        (p.name && p.name.toLowerCase().includes(s)) ||
        (p.matchName && p.matchName.toLowerCase().includes(s))
      );
    }

    if (position !== "all") {
      const pos = position.toLowerCase();
      list = list.filter((p: any) => p.position.toLowerCase().includes(pos) || p.grupoDemarcacion.toLowerCase().includes(pos));
    }

    if (team !== "all") {
      list = list.filter((p: any) => p.teamName.toLowerCase() === team.toLowerCase());
    }

    if (league !== "all") {
      list = list.filter((p: any) => p.leagueName.toLowerCase() === league.toLowerCase());
    }

    if (minRating != null && !isNaN(minRating)) {
      list = list.filter((p: any) => (p.notaGlobal || 0) >= minRating);
    }

    // Sorting (nulls last)
    const key: Record<string, string> = {
      nota_global: "notaGlobal", nota_ataque: "notaAtaque", nota_construccion: "notaConstruccion",
      nota_defensa: "notaDefensa", nota_balon_parado: "notaBalonParado", nota_disponibilidad: "notaDisponibilidad",
      nota_fisico: "notaFisico",
    };
    const field = key[validScores.includes(sortBy) ? sortBy : "nota_global"];
    list.sort((a: any, b: any) => {
      const valA = a[field];
      const valB = b[field];
      if (valA == null || valB == null) return valA == null ? (valB == null ? 0 : 1) : -1;
      return order === "asc" ? valA - valB : valB - valA;
    });

    return NextResponse.json({
      players: list,
      filters: {
        teams: availableTeams,
        leagues: availableLeagues,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

