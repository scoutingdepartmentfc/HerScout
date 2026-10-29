import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Minimum minutes for the season leaderboard (fewer minutes = notes pulled towards the group average)
const MIN_MINUTES_TRENDING = 450;

export async function GET(req: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }
  const db = supabaseAdmin as any;
  // Club-private reports only for a real organization (uuid); demo club ids get none
  const orgId = req.headers.get("x-user-org-id") || "";
  const isOrgUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgId);
  const now = new Date();
  const in6Months = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate()).toISOString().slice(0, 10);

  const [statsRes, playedRes, upcomingRes, contractsRes, runsRes, reportsRes] = await Promise.all([
    // 1. Top rated players of the downloaded seasons (Opta, notes 0-100)
    db
      .from("player_season_stats")
      .select(`
        player_id,
        nota_global,
        grupo_demarcacion,
        minutes_played,
        teams ( name, badge_url ),
        players ( name, country, photo_url ),
        seasons ( name ),
        competitions ( name )
      `)
      .not("nota_global", "is", null)
      .gte("minutes_played", MIN_MINUTES_TRENDING)
      .order("nota_global", { ascending: false })
      .limit(6),
    // 2. Latest results
    db
      .from("matches")
      .select(`
        id, match_date, status, home_score, away_score, venue_name,
        home_team:teams!home_team_id(name, badge_url),
        away_team:teams!away_team_id(name, badge_url),
        competitions(name)
      `)
      .eq("status", "Played")
      .order("match_date", { ascending: false })
      .limit(8),
    // 3. Next fixtures
    db
      .from("matches")
      .select(`
        id, match_date, status, home_score, away_score, venue_name, time_confirmed,
        home_team:teams!home_team_id(name, badge_url),
        away_team:teams!away_team_id(name, badge_url),
        competitions(name)
      `)
      .neq("status", "Played")
      .gte("match_date", now.toISOString())
      .order("match_date", { ascending: true })
      .limit(8),
    // 4. Contracts ending in the next 6 months (Soccerdonna)
    db
      .from("players")
      .select("id, name, contract_expires, teams ( name )")
      .gte("contract_expires", now.toISOString().slice(0, 10))
      .lte("contract_expires", in6Months)
      .order("contract_expires", { ascending: true })
      .limit(5),
    // 5. Last data pipeline run
    db
      .from("ingestion_runs")
      .select("started_at, finished_at, status, matches_processed, players_updated")
      .order("started_at", { ascending: false })
      .limit(1),
    // 6. Club scouting reports (tenant isolated)
    isOrgUuid
      ? db
          .from("scouting_reports")
          .select("id, rating, recommendation, created_at, players ( name )")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const res of [statsRes, playedRes, upcomingRes, contractsRes, runsRes, reportsRes]) {
    if (res.error) console.error("Hub query failed:", res.error.message);
  }

  const trendingPlayers = (statsRes.data || []).map((item: any) => ({
    id: item.player_id,
    name: item.players?.name,
    country: item.players?.country,
    photoUrl: item.players?.photo_url || null,
    club: item.teams?.name,
    badgeUrl: item.teams?.badge_url || null,
    competition: item.competitions?.name,
    season: item.seasons?.name,
    demarcation: item.grupo_demarcacion,
    minutes: item.minutes_played || 0,
    rating: (item.nota_global / 10).toFixed(1),
    source: "Opta",
  }));

  const toMatch = (m: any) => ({
    id: m.id,
    date: m.match_date,
    competition: m.competitions?.name,
    homeTeam: m.home_team?.name,
    awayTeam: m.away_team?.name,
    homeBadge: m.home_team?.badge_url || null,
    awayBadge: m.away_team?.badge_url || null,
    homeScore: m.status === "Played" ? m.home_score : null,
    awayScore: m.status === "Played" ? m.away_score : null,
    venue: m.venue_name,
    timeConfirmed: m.time_confirmed !== false,
    status: m.status,
  });

  const alerts: any[] = (contractsRes.data || []).map((p: any) => ({
    id: `contract-${p.id}`,
    playerId: p.id,
    title: `Contract ends ${p.contract_expires}`,
    description: `${p.name}${p.teams?.name ? ` (${p.teams.name})` : ""}: final contract window.`,
    timestamp: p.contract_expires,
    type: "warning",
  }));
  const lastRun = runsRes.data?.[0];
  if (lastRun) {
    alerts.push({
      id: "pipeline",
      title: lastRun.status === "completed" ? "Data download completed" : `Data download ${lastRun.status}`,
      description: `${lastRun.matches_processed || 0} matches and ${lastRun.players_updated || 0} players from Opta.`,
      timestamp: new Date(lastRun.finished_at || lastRun.started_at).toLocaleString("en-GB"),
      type: lastRun.status === "completed" ? "success" : "info",
    });
  }

  const reports = (reportsRes.data || []).map((r: any) => ({
    id: r.id,
    player: r.players?.name,
    date: r.created_at?.slice(0, 10),
    rating: r.rating,
    recommendation: r.recommendation,
  }));

  return NextResponse.json({
    trendingPlayers,
    recentMatches: (playedRes.data || []).map(toMatch),
    upcomingMatches: (upcomingRes.data || []).map(toMatch),
    reports,
    alerts,
  });
}
