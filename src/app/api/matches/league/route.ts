import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { formatMatches, matchSelect } from "@/lib/matchesQuery";

// One competition, one matchday: /api/matches/league?competition=<id>[&season=<id>][&week=<n>|other][&scope=played|upcoming]
// Returns the seasons available, the matchdays of the season (with played/total counts) and its matches.
// Default season = the competition's active one; default matchday = the current one (latest that has kicked off).
// Competitions without matchdays (cups) return the whole season.
const NO_WEEK = "other"; // matches without a matchday number

export async function GET(req: NextRequest) {
  const db = supabaseAdmin as any;
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const url = new URL(req.url);
  const competition = url.searchParams.get("competition");
  if (!competition) return NextResponse.json({ error: "competition is required" }, { status: 400 });

  const [{ data: comp }, { data: seasonRows, error: seasonsError }] = await Promise.all([
    db.from("competitions").select("id, active_season_id").eq("id", competition).maybeSingle(),
    db.from("seasons").select("id, name, start_date").eq("competition_id", competition).order("start_date", { ascending: false }),
  ]);
  if (seasonsError) return NextResponse.json({ error: seasonsError.message }, { status: 500 });

  // Seasons the pipeline has stored (it creates them when it downloads their matches)
  const seasons = (seasonRows || []).map((s: any) => ({ id: s.id, name: s.name }));
  if (!seasons.length) return NextResponse.json({ seasons: [], season: null, weeks: [], week: null, matches: [] });

  const requested = url.searchParams.get("season");
  const season =
    seasons.find((s: any) => s.id === requested)?.id ??
    seasons.find((s: any) => s.id === comp?.active_season_id)?.id ??
    seasons[0].id;

  // Light rows of that season only (max ~550 even for big leagues: under the 1000-row API cap)
  const { data: light, error } = await db
    .from("matches")
    .select("week, status, match_date")
    .eq("competition_id", competition)
    .eq("season_id", season)
    .limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // scope: played (Results tab) | upcoming (Upcoming tab) | all
  const scope = url.searchParams.get("scope") || "all";
  const inScope = (status: string) =>
    scope === "played" ? status === "Played" : scope === "upcoming" ? status !== "Played" : true;

  // Matchdays of the season (only those with matches in scope). Rounds without a matchday number
  // (qualifiers, knockouts, cups) are grouped as NO_WEEK ("Other rounds") instead of hiding the filter.
  const now = Date.now();
  const byWeek = new Map<string, { week: string; played: number; total: number; firstDate: string; lastDate: string }>();
  for (const m of light || []) {
    if (!inScope(m.status)) continue;
    const w = m.week == null || m.week === "" ? NO_WEEK : String(m.week);
    const e = byWeek.get(w) || { week: w, played: 0, total: 0, firstDate: m.match_date, lastDate: m.match_date };
    e.total++;
    if (m.status === "Played") e.played++;
    if (m.match_date && m.match_date < e.firstDate) e.firstDate = m.match_date;
    if (m.match_date && m.match_date > e.lastDate) e.lastDate = m.match_date;
    byWeek.set(w, e);
  }
  // Chronological: by first match of each group (qualifiers before the league phase, knockouts after)
  const weeks = Array.from(byWeek.values()).sort(
    (a, b) => a.firstDate.localeCompare(b.firstDate) || Number(a.week) - Number(b.week)
  );
  const onlyNoWeek = weeks.length === 1 && weeks[0].week === NO_WEEK;

  let week: string | null = null;
  if (weeks.length && !onlyNoWeek) {
    const requestedWeek = url.searchParams.get("week");
    week =
      weeks.find((w) => w.week === requestedWeek)?.week ??
      (scope === "played"
        ? weeks[weeks.length - 1].week // latest matchday with results
        : scope === "upcoming"
        ? weeks[0].week // next matchday with pending matches
        : // current matchday: the latest one that has started; before the season, the first one
          [...weeks].reverse().find((w) => new Date(w.firstDate).getTime() <= now)?.week ?? weeks[0].week);
  }

  let query = db.from("matches").select(await matchSelect()).eq("competition_id", competition).eq("season_id", season);
  if (scope === "played") query = query.eq("status", "Played");
  if (scope === "upcoming") query = query.neq("status", "Played");
  if (week === NO_WEEK) query = query.is("week", null);
  else if (week) query = query.eq("week", week);
  const { data, error: matchesError } = await query
    .order("match_date", { ascending: scope !== "played" })
    .limit(500);
  if (matchesError) return NextResponse.json({ error: matchesError.message }, { status: 500 });

  return NextResponse.json({
    seasons,
    season,
    weeks: onlyNoWeek ? [] : weeks.map(({ week, played, total }) => ({ week, played, total })),
    week,
    matches: await formatMatches(data || []),
  });
}
