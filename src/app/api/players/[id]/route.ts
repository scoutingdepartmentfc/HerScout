import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const playerId = params.id;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  try {
    // 1. Player Demographics
    const playerRes = await (supabaseAdmin as any)
      .from("players")
      .select(`
        id,
        name,
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
        preferred_foot,
        place_of_birth,
        market_value,
        contract_expires,
        joined_on,
        sd_url,
        tm_positions_other,
        tm_position_main,
        citizenship,
        fm_team_name,
        fm_team_badge_url,
        current_league_name,
        current_league_logo_url,
        teams ( id, name, badge_url, league_name, league_logo_url )
      `)
      .eq("id", playerId)
      .single();

    if (playerRes.error || !playerRes.data) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const p = playerRes.data;

    // 2. Player Season Stats with raw metric breakdown
    const statsRes = await (supabaseAdmin as any)
      .from("player_season_stats")
      .select(`
        *,
        seasons ( name ),
        competitions ( name, logo_url ),
        teams ( name, badge_url, league_name, league_logo_url )
      `)
      .eq("player_id", playerId)
      .order("updated_at", { ascending: false });

    // 3. Match log: every match played with its 0-9.9 rating, and the Soccerdonna career data
    const db = supabaseAdmin as any;
    const [matchStats, matchScores, marketValues, transfers, nationalTeams, injuries] = await Promise.all([
      db.from("player_match_stats")
        .select(`
          match_id, team_id, match_date, minutes_played, is_starter, goals, assists, demarcacion,
          matches ( home_score, away_score, home_team_id, away_team_id,
            home_team:teams!home_team_id ( id, name, badge_url ),
            away_team:teams!away_team_id ( id, name, badge_url ),
            competitions ( name ) )
        `)
        .eq("player_id", playerId)
        .order("match_date", { ascending: false })
        .limit(60),
      db.from("player_match_scores")
        .select("match_id, score_general, score_ofensivo, score_defensivo, score_comportamiento, score_abp")
        .eq("player_id", playerId),
      db.from("player_market_values").select("date, market_value, club_name, club_badge_url")
        .eq("player_id", playerId).order("date", { ascending: true }),
      db.from("player_transfers").select("date, season, club_from, club_to, club_from_badge_url, club_to_badge_url, fee_text, loan")
        .eq("player_id", playerId).order("date", { ascending: false }),
      db.from("player_national_teams").select("team_name, debut_date, caps, goals")
        .eq("player_id", playerId).order("caps", { ascending: false }),
      db.from("player_injuries").select("season, from_date, until_date, days, injury")
        .eq("player_id", playerId).order("from_date", { ascending: false }),
    ]);
    const scoreByMatch = new Map<string, any>((matchScores.data || []).map((r: any) => [r.match_id, r]));
    const matchLog = (matchStats.data || []).map((r: any) => {
      const m = r.matches || {};
      const isHome = m.home_team_id === r.team_id;
      const opponent = isHome ? m.away_team : m.home_team;
      const sc = scoreByMatch.get(r.match_id);
      return {
        matchId: r.match_id,
        date: r.match_date,
        competition: m.competitions?.name,
        isHome,
        opponent: { id: opponent?.id, name: opponent?.name, badgeUrl: opponent?.badge_url },
        goalsFor: isHome ? m.home_score : m.away_score,
        goalsAgainst: isHome ? m.away_score : m.home_score,
        minutes: r.minutes_played,
        starter: r.is_starter,
        goals: r.goals,
        assists: r.assists,
        position: r.demarcacion,
        rating: sc?.score_general ?? null,
        ratings: sc
          ? { attack: sc.score_ofensivo, defence: sc.score_defensivo, behaviour: sc.score_comportamiento, setPieces: sc.score_abp }
          : null,
      };
    });

    // Extract detailed metric map from stats row / radar_data
    const seasonRow = statsRes.data?.[0] || null;
    let metricasMap: Record<string, [number, number]> = {};

    if (seasonRow) {
      // 1. If radar_data has raw metric breakdown from Opta
      if (seasonRow.radar_data?.metricas) {
        metricasMap = seasonRow.radar_data.metricas;
      } else {
        // Fallback from columns
        Object.keys(seasonRow).forEach((k) => {
          if (
            k.startsWith("of_") ||
            k.startsWith("def_") ||
            k.startsWith("abp_") ||
            k.startsWith("comp_")
          ) {
            const valP90 = Number(seasonRow[k]) || 0;
            const score = Math.min(99, Math.max(45, Math.round(50 + valP90 * 6.5)));
            metricasMap[k] = [valP90, score];
          }
        });
      }
    }

    // Calculate played positions from matchLog to know all positions she actually plays
    const posCounts: Record<string, { min: number; pj: number }> = {};
    (matchStats.data || []).forEach((m: any) => {
      const pos = m.demarcacion || p.primary_position;
      if (pos) {
        if (!posCounts[pos]) posCounts[pos] = { min: 0, pj: 0 };
        posCounts[pos].min += Number(m.minutes_played) || 0;
        posCounts[pos].pj += 1;
      }
    });

    // Positions sorted by most minutes played
    const sortedPlayedPositions = Object.entries(posCounts)
      .sort((a, b) => b[1].min - a[1].min)
      .map(([pos]) => pos);

    return NextResponse.json({
      player: {
        id: p.id,
        name: p.name,
        country: p.country,
        birthDate: p.birth_date,
        photoUrl: p.photoUrl || p.photo_url,
        primaryPosition: sortedPlayedPositions[0] || p.primary_position || "Midfielder",
        playedPositions: sortedPlayedPositions,
        positionsMap: posCounts,
        grupoDemarcacion: p.grupo_demarcacion,
        shirtNumber: p.shirt_number,
        height: p.height,
        weight: p.weight,
        preferredFoot: p.preferred_foot,
        placeOfBirth: p.place_of_birth,
        marketValue: p.market_value,
        contractUntil: p.contract_expires,
        joinedOn: p.joined_on,
        sdUrl: p.sd_url,
        otherPositions: sortedPlayedPositions.slice(1).length ? sortedPlayedPositions.slice(1) : p.tm_positions_other || [],
        sdPosition: p.tm_position_main,
        citizenship: p.citizenship || [],
        teamId: p.teams?.id,
        // Club actual y su liga según Soccerdonna; si no, el equipo Opta
        teamName: p.fm_team_name || p.teams?.name || "Unattached",
        badgeUrl: (p.fm_team_name ? p.fm_team_badge_url : null) || p.teams?.badge_url,
        leagueName: p.current_league_name || p.teams?.league_name || seasonRow?.competitions?.name || seasonRow?.teams?.league_name,
        leagueLogoUrl: p.current_league_logo_url || p.teams?.league_logo_url || seasonRow?.competitions?.logo_url || seasonRow?.teams?.league_logo_url,
      },
      seasonStats: statsRes.data || [],
      matchLog,
      marketValues: marketValues.data || [],
      transfers: transfers.data || [],
      nationalTeams: nationalTeams.data || [],
      injuries: injuries.data || [],
      metricas: metricasMap,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
