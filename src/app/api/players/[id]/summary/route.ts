import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Light player summary for the quick-view popup (lineups). A few KB instead of the full profile payload.
// Manual edits from the profile (players.manual_overrides) take precedence, like in /api/players/[id].
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = supabaseAdmin as any;
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const [playerRes, statsRes, manualRes] = await Promise.all([
    db
      .from("players")
      .select(
        `id, name, match_name, country, birth_date, photo_url, primary_position, tm_position_main, shirt_number,
         height, preferred_foot, market_value, contract_expires, current_league_name, current_league_logo_url,
         teams ( id, name, badge_url, league_name, league_logo_url )`
      )
      .eq("id", params.id)
      .maybeSingle(),
    db
      .from("player_season_stats")
      .select(
        `season_id, competition_id, matches_played, starts, minutes_played, goals_p90, assists_p90, demarcacion,
         nota_global, nota_ataque, nota_construccion, nota_defensa, score_general,
         seasons ( name, start_date ), competitions ( name, logo_url )`
      )
      .eq("player_id", params.id),
    // Separate query: still works if the manual_overrides migration isn't applied
    db.from("players").select("manual_overrides").eq("id", params.id).maybeSingle(),
  ]);

  const p = playerRes.data;
  if (playerRes.error || !p) return NextResponse.json({ error: "Player not found" }, { status: 404 });
  const o: Record<string, any> = manualRes.data?.manual_overrides || {};

  // Current season = competitions starting up to ~9 months before the latest one (league, cup and UWCL
  // of the same season start on different dates); among them, the one with most minutes (usually the league)
  const rows = (statsRes.data || []) as any[];
  const startOf = (r: any) => new Date(r.seasons?.start_date || 0).getTime();
  const latest = Math.max(0, ...rows.map(startOf));
  const season = rows
    .filter((r) => latest - startOf(r) < 270 * 24 * 60 * 60 * 1000)
    .sort((a, b) => (b.minutes_played || 0) - (a.minutes_played || 0))[0];

  const goals = (r: any) => (r?.goals_p90 != null && r?.minutes_played ? Math.round((r.goals_p90 * r.minutes_played) / 90) : null);
  const assists = (r: any) =>
    r?.assists_p90 != null && r?.minutes_played ? Math.round((r.assists_p90 * r.minutes_played) / 90) : null;

  const team = p.teams || {};
  return NextResponse.json(
    {
      id: p.id,
      name: o.name ?? p.name,
      matchName: o.matchName ?? p.match_name,
      photoUrl: o.photoUrl ?? p.photo_url,
      country: o.country ?? p.country,
      birthDate: o.birthDate ?? p.birth_date,
      height: o.height ?? p.height,
      preferredFoot: o.preferredFoot ?? p.preferred_foot,
      shirtNumber: o.shirtNumber ?? p.shirt_number,
      marketValue: o.marketValue ?? p.market_value,
      contractUntil: o.contractUntil ?? p.contract_expires,
      position: o.primaryPosition ?? p.tm_position_main ?? p.primary_position ?? season?.demarcacion ?? null,
      teamId: team.id ?? null,
      teamName: team.name ?? null,
      badgeUrl: team.badge_url ?? null,
      leagueName: team.league_name ?? p.current_league_name ?? null,
      leagueLogoUrl: team.league_logo_url ?? p.current_league_logo_url ?? null,
      season: season
        ? {
            name: season.seasons?.name ?? null,
            competition: season.competitions?.name ?? null,
            competitionLogoUrl: season.competitions?.logo_url ?? null,
            matches: season.matches_played ?? null,
            starts: season.starts ?? null,
            minutes: season.minutes_played ?? null,
            goals: goals(season),
            assists: assists(season),
            rating: season.nota_global ?? (season.score_general != null ? season.score_general * 10 : null),
            attack: season.nota_ataque ?? null,
            buildUp: season.nota_construccion ?? null,
            defence: season.nota_defensa ?? null,
          }
        : null,
    },
    { headers: { "Cache-Control": "private, max-age=600" } }
  );
}
