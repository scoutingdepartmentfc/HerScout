import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const search = url.searchParams.get("search") || "";
  const position = url.searchParams.get("position") || "all";
  const team = url.searchParams.get("team") || "all";
  const league = url.searchParams.get("league") || "all";
  // season: "all" (accumulated by default) | season name e.g. "2026/2027", "2025/2026"
  const season = url.searchParams.get("season") || "all";
  const minRating = url.searchParams.get("minRating") ? Number(url.searchParams.get("minRating")) : null;
  const sortBy = url.searchParams.get("sortBy") || "nota_global";
  const order = url.searchParams.get("order") === "asc" ? "asc" : "desc";

  if (!supabaseAdmin) {
    return NextResponse.json({ players: [], filters: { teams: [], leagues: [], seasons: [] } });
  }

  try {
    const db = supabaseAdmin as any;

    const validScores = [
      "nota_global",
      "nota_ataque",
      "nota_construccion",
      "nota_defensa",
      "nota_balon_parado",
      "nota_disponibilidad",
      "nota_fisico",
    ];

    // Read all rows from player_season_stats
    const selectStats = () =>
      db.from("player_season_stats").select(`
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

    // Extract available season names from all rows for the filter dropdown
    const availableSeasons = Array.from(
      new Set(rows.map((r: any) => r.seasons?.name).filter(Boolean))
    ).sort().reverse();

    // Group rows by player
    const rowsByPlayer = new Map<string, any[]>();
    for (const r of rows) {
      if (!r.players) continue;
      const arr = rowsByPlayer.get(r.player_id) || [];
      arr.push(r);
      rowsByPlayer.set(r.player_id, arr);
    }

    let list: any[] = [];

    if (season === "all") {
      // ACCUMULATED MODE (Default): Weighted average across all seasons
      Array.from(rowsByPlayer.entries()).forEach(([playerId, playerRows]) => {
        const latestRow = [...playerRows].sort((a, b) =>
          String(b.seasons?.start_date || "").localeCompare(String(a.seasons?.start_date || "")) ||
          (b.minutes_played || 0) - (a.minutes_played || 0)
        )[0];
        const p = latestRow.players;

        const ea = Array.isArray(p.player_ea_ratings) ? p.player_ea_ratings[0] : p.player_ea_ratings;
        const notaFisico = (() => {
          if (ea?.pace != null && ea?.physicality != null) {
            return Math.round(Number(ea.pace) * 0.45 + Number(ea.physicality) * 0.55);
          }
          return ea?.pace != null ? Number(ea.pace) : ea?.physicality != null ? Number(ea.physicality) : null;
        })();

        // Calculate weighted averages across all seasons with stats
        let totalMins = 0;
        let totalMatches = 0;
        const sumWeighted: Record<string, { sum: number; mins: number }> = {
          nota_global: { sum: 0, mins: 0 },
          nota_ataque: { sum: 0, mins: 0 },
          nota_construccion: { sum: 0, mins: 0 },
          nota_defensa: { sum: 0, mins: 0 },
          nota_balon_parado: { sum: 0, mins: 0 },
          nota_disponibilidad: { sum: 0, mins: 0 },
        };

        for (const r of playerRows) {
          const m = Number(r.minutes_played) || 0;
          totalMins += m;
          totalMatches += Number(r.matches_played) || 0;
          for (const k of Object.keys(sumWeighted)) {
            if (r[k] != null) {
              sumWeighted[k].sum += Number(r[k]) * m;
              sumWeighted[k].mins += m;
            }
          }
        }

        const getWeightedVal = (k: string) => {
          const item = sumWeighted[k];
          return item.mins > 0 ? item.sum / item.mins : null;
        };

        list.push({
          id: p.id,
          name: p.name,
          matchName: p.match_name || p.name,
          country: p.country,
          birthDate: p.birth_date,
          photoUrl: p.photo_url,
          position: latestRow.demarcacion || p.primary_position || "Centrocampista",
          grupoDemarcacion: latestRow.grupo_demarcacion || p.grupo_demarcacion || "General",
          shirtNumber: p.shirt_number,
          height: p.height,
          weight: p.weight,
          marketValue: p.market_value,
          teamId: p.teams?.id,
          teamName: p.fm_team_name || p.teams?.name || "Unattached",
          badgeUrl: (p.fm_team_name ? p.fm_team_badge_url : null) || p.teams?.badge_url,
          leagueName: p.current_league_name || p.teams?.league_name || "Primera División Femenina",
          leagueLogoUrl: p.current_league_logo_url || p.teams?.league_logo_url,
          seasonName: playerRows.length > 1 ? `All seasons (${playerRows.length})` : playerRows[0]?.seasons?.name || null,
          isAccumulated: playerRows.length > 1,
          minutesPlayed: totalMins,
          matchesPlayed: totalMatches,
          notaGlobal: getWeightedVal("nota_global"),
          notaAtaque: getWeightedVal("nota_ataque"),
          notaConstruccion: getWeightedVal("nota_construccion"),
          notaDefensa: getWeightedVal("nota_defensa"),
          notaBalonParado: getWeightedVal("nota_balon_parado"),
          notaDisponibilidad: getWeightedVal("nota_disponibilidad"),
          notaFisico,
        });
      });
    } else {
      // SPECIFIC SEASON FILTER: Only show stats for the selected season
      Array.from(rowsByPlayer.entries()).forEach(([playerId, playerRows]) => {
        const matchingRow = playerRows.find((r: any) => r.seasons?.name === season);
        if (!matchingRow) return;

        const p = matchingRow.players;
        const ea = Array.isArray(p.player_ea_ratings) ? p.player_ea_ratings[0] : p.player_ea_ratings;
        const notaFisico = (() => {
          if (ea?.pace != null && ea?.physicality != null) {
            return Math.round(Number(ea.pace) * 0.45 + Number(ea.physicality) * 0.55);
          }
          return ea?.pace != null ? Number(ea.pace) : ea?.physicality != null ? Number(ea.physicality) : null;
        })();

        list.push({
          id: p.id,
          name: p.name,
          matchName: p.match_name || p.name,
          country: p.country,
          birthDate: p.birth_date,
          photoUrl: p.photo_url,
          position: matchingRow.demarcacion || p.primary_position || "Centrocampista",
          grupoDemarcacion: matchingRow.grupo_demarcacion || p.grupo_demarcacion || "General",
          shirtNumber: p.shirt_number,
          height: p.height,
          weight: p.weight,
          marketValue: p.market_value,
          teamId: p.teams?.id,
          teamName: p.fm_team_name || p.teams?.name || "Unattached",
          badgeUrl: (p.fm_team_name ? p.fm_team_badge_url : null) || p.teams?.badge_url,
          leagueName: p.current_league_name || p.teams?.league_name || "Primera División Femenina",
          leagueLogoUrl: p.current_league_logo_url || p.teams?.league_logo_url,
          seasonName: matchingRow.seasons?.name || null,
          isAccumulated: false,
          minutesPlayed: matchingRow.minutes_played,
          matchesPlayed: matchingRow.matches_played,
          notaGlobal: matchingRow.nota_global,
          notaAtaque: matchingRow.nota_ataque,
          notaConstruccion: matchingRow.nota_construccion,
          notaDefensa: matchingRow.nota_defensa,
          notaBalonParado: matchingRow.nota_balon_parado,
          notaDisponibilidad: matchingRow.nota_disponibilidad,
          notaFisico,
        });
      });
    }

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
      nota_global: "notaGlobal",
      nota_ataque: "notaAtaque",
      notaConstruccion: "notaConstruccion",
      notaDefensa: "notaDefensa",
      nota_balon_parado: "notaBalonParado",
      notaDisponibilidad: "notaDisponibilidad",
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
        seasons: availableSeasons,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
