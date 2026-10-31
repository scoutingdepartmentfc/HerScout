import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const LIMIT = 30;

const SELECT = `
  id, match_date, status, home_score, away_score, venue_name, time_confirmed, week,
  home_team:teams!home_team_id(id, name, badge_url),
  away_team:teams!away_team_id(id, name, badge_url),
  competitions(name),
  seasons(name)
`;

// tab = results (latest played) | today | upcoming (next fixtures)
export async function GET(req: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }
  const tab = new URL(req.url).searchParams.get("tab") || "results";
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  let query = (supabaseAdmin as any).from("matches").select(SELECT);
  if (tab === "today") {
    query = query.gte("match_date", startOfDay.toISOString()).lt("match_date", endOfDay.toISOString())
      .order("match_date", { ascending: true });
  } else if (tab === "upcoming") {
    // Next fixtures from right now (today's later kick-offs included)
    query = query.neq("status", "Played").gte("match_date", now.toISOString())
      .order("match_date", { ascending: true });
  } else {
    query = query.eq("status", "Played").order("match_date", { ascending: false });
  }

  const { data, error } = await query.limit(LIMIT);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const matches = (data || []).map((m: any) => ({
    id: m.id,
    date: m.match_date,
    status: m.status,
    week: m.week,
    competition: m.competitions?.name,
    season: m.seasons?.name,
    venue: m.venue_name,
    timeConfirmed: m.time_confirmed !== false,
    home: { id: m.home_team?.id, name: m.home_team?.name, badgeUrl: m.home_team?.badge_url, score: m.home_score },
    away: { id: m.away_team?.id, name: m.away_team?.name, badgeUrl: m.away_team?.badge_url, score: m.away_score },
  }));
  return NextResponse.json({ matches });
}
