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

    let statsQuery = db
      .from("player_season_stats")
      .select(`
        player_id,
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

    if (validScores.includes(sortBy) && sortBy !== "nota_fisico") {
      statsQuery = statsQuery.order(sortBy, { ascending: order === "asc" });
    }
    statsQuery = statsQuery.limit(300);

    const res = await statsQuery;
    if (res.error) throw res.error;

    let list = (res.data || [])
      .filter((row: any) => row.players)
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

    // Custom sorting if sorting by physical or if needed
    if (sortBy === "nota_fisico") {
      list.sort((a: any, b: any) => {
        const valA = a.notaFisico ?? -1;
        const valB = b.notaFisico ?? -1;
        return order === "asc" ? valA - valB : valB - valA;
      });
    }

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

