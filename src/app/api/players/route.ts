import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const search = url.searchParams.get("search") || "";
  const position = url.searchParams.get("position") || "all";
  const sortBy = url.searchParams.get("sortBy") || "nota_global";
  const order = url.searchParams.get("order") === "asc" ? "asc" : "desc";

  if (!supabaseAdmin) {
    return NextResponse.json({ players: [] });
  }

  try {
    const db = supabaseAdmin as any;

    // Si ordenamos por una columna de notas de temporada
    const validScores = [
      "nota_global",
      "nota_ataque",
      "nota_construccion",
      "nota_defensa",
      "nota_balon_parado",
      "nota_disponibilidad",
    ];

    if (validScores.includes(sortBy)) {
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
            teams:current_team_id ( id, name, badge_url, league_name, league_logo_url )
          )
        `)
        .order(sortBy, { ascending: order === "asc" })
        .limit(100);

      const res = await statsQuery;
      if (res.error) throw res.error;

      let list = (res.data || [])
        .filter((row: any) => row.players) // Jugadoras vinculadas
        .map((row: any) => {
          const p = row.players;
          return {
            id: p.id,
            name: p.name,
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
            // Club actual y su liga según Soccerdonna; si no, el equipo Opta
            teamName: p.fm_team_name || p.teams?.name || "Unattached",
            badgeUrl: (p.fm_team_name ? p.fm_team_badge_url : null) || p.teams?.badge_url,
            leagueName: p.current_league_name || p.teams?.league_name,
            leagueLogoUrl: p.current_league_logo_url || p.teams?.league_logo_url,
            minutesPlayed: row.minutes_played,
            matchesPlayed: row.matches_played,
            notaGlobal: row.nota_global,
            notaAtaque: row.nota_ataque,
            notaConstruccion: row.nota_construccion,
            notaDefensa: row.nota_defensa,
            notaBalonParado: row.nota_balon_parado,
            notaDisponibilidad: row.nota_disponibilidad,
          };
        });

      if (search) {
        const s = search.toLowerCase();
        list = list.filter((p: any) => p.name.toLowerCase().includes(s));
      }

      if (position !== "all") {
        const pos = position.toLowerCase();
        list = list.filter((p: any) => p.position.toLowerCase().includes(pos));
      }

      return NextResponse.json({ players: list });
    }

    // Consulta estándar por nombre o datos personales
    let query = db
      .from("players")
      .select(`
        id,
        name,
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
        player_season_stats (
          nota_global,
          nota_ataque,
          nota_construccion,
          nota_defensa,
          nota_balon_parado,
          nota_disponibilidad,
          matches_played,
          minutes_played
        )
      `)
      .order("name", { ascending: true })
      .limit(60);

    if (search) {
      query = query.ilike("name", `%${search}%`);
    }

    const res = await query;
    if (res.error) throw res.error;

    const formatted = (res.data || []).map((p: any) => {
      const stats = p.player_season_stats?.[0] || null;
      return {
        id: p.id,
        name: p.name,
        country: p.country,
        birthDate: p.birth_date,
        photoUrl: p.photo_url,
        position: p.primary_position || "Field Player",
        grupoDemarcacion: p.grupo_demarcacion || "General",
        shirtNumber: p.shirt_number,
        height: p.height,
        weight: p.weight,
        marketValue: p.market_value,
        teamId: p.teams?.id,
        // Club actual y su liga según Soccerdonna; si no, el equipo Opta
        teamName: p.fm_team_name || p.teams?.name || "Unattached",
        badgeUrl: (p.fm_team_name ? p.fm_team_badge_url : null) || p.teams?.badge_url,
        leagueName: p.current_league_name || p.teams?.league_name,
        leagueLogoUrl: p.current_league_logo_url || p.teams?.league_logo_url,
        minutesPlayed: stats?.minutes_played,
        matchesPlayed: stats?.matches_played,
        notaGlobal: stats?.nota_global,
        notaAtaque: stats?.nota_ataque,
        notaConstruccion: stats?.nota_construccion,
        notaDefensa: stats?.nota_defensa,
        notaBalonParado: stats?.nota_balon_parado,
        notaDisponibilidad: stats?.nota_disponibilidad,
      };
    });

    return NextResponse.json({ players: formatted });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

