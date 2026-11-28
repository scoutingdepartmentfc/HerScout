import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  contextBucket,
  countSeen,
  groupByContext,
  starsConsensus,
  whoHasSeen,
  type AttendanceRow,
  type HistoryReport,
  type StarRatingRow,
} from "@/lib/matchReportLogic";

/**
 * GET /api/players/[id]/scouting[?matchId=…]
 * Scouting history of a player (SPEC §2 block 13, §6.5, §6.9, §6.10):
 * stars consensus, match reports, who has seen her, last matches seen, context, positions & systems seen.
 * With matchId, also returns the match reports of that match (S5 popup).
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const db = supabaseAdmin as any;
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  const playerId = params.id;
  const matchId = req.nextUrl.searchParams.get("matchId");

  const [repRes, starsRes, playedRes] = await Promise.all([
    db
      .from("match_reports")
      .select(
        `id, match_id, scout_id, team_id, status, mode, match_date, position_start, position_end, system_start, system_end,
         minutes, events, eventing, own_tier, opponent_tier, tier_diff, opta_rating, match_rating, adjusted_rating,
         rating_now, rating_potential, vs_last, watch_for, tags_seen, player_note, created_at,
         scouts ( name ),
         matches ( match_date, venue_name, home_score, away_score,
                   home_team:teams!home_team_id ( id, name, badge_url ), away_team:teams!away_team_id ( id, name, badge_url ) )`
      )
      .eq("player_id", playerId)
      .eq("status", "published")
      .order("match_date", { ascending: false }),
    db
      .from("player_star_ratings")
      .select("scout_id, rating_now, rating_potential, created_at, source, scouts ( name )")
      .eq("player_id", playerId),
    db.from("player_match_stats").select("match_id").eq("player_id", playerId).gt("minutes_played", 0),
  ]);
  const [fullRes, playerRes] = await Promise.all([
    db
      .from("scouting_reports")
      .select("id, created_at, status, scout_name, rating, recommendation, tactical_notes, sponda_data")
      .eq("player_id", playerId)
      .order("created_at", { ascending: false })
      .limit(10),
    db.from("players").select("team_id, teams ( tier )").eq("id", playerId).maybeSingle(),
  ]);
  const full = (fullRes.data || []).find((r: any) => !r.sponda_data?.starsOnly) || null;
  const latestFullReport = full
    ? {
        id: full.id,
        date: full.created_at,
        status: full.status,
        scoutName: full.scout_name || "Scout",
        decision: full.sponda_data?.scoutDecision || full.recommendation || null,
        score: full.sponda_data?.scoutScore ?? (full.rating != null ? Math.round(Number(full.rating) * 10) : null),
        opinion: full.sponda_data?.scoutOpinion || full.tactical_notes || "",
        pros: full.sponda_data?.pros || "",
        cons: full.sponda_data?.cons || "",
      }
    : null;
  if (repRes.error) return NextResponse.json({ error: repRes.error.message }, { status: 500 });

  const reports = (repRes.data || []).map((r: any) => {
    const h = r.matches?.home_team;
    const a = r.matches?.away_team;
    const isHome = r.team_id ? h?.id === r.team_id : true;
    return {
      id: r.id,
      matchId: r.match_id,
      date: r.match_date || r.matches?.match_date || r.created_at,
      home: h?.name || "Home",
      away: a?.name || "Away",
      score: r.matches ? `${r.matches.home_score ?? "–"}–${r.matches.away_score ?? "–"}` : null,
      opponent: isHome ? a?.name : h?.name,
      venue: r.matches?.venue_name || null,
      mode: r.mode,
      scoutId: r.scout_id,
      scoutName: r.scouts?.name || "Scout",
      ownTier: r.own_tier,
      opponentTier: r.opponent_tier,
      tierDiff: r.tier_diff,
      context: contextBucket(r.tier_diff),
      matchRating: r.match_rating != null ? Number(r.match_rating) : null,
      optaRating: r.opta_rating != null ? Number(r.opta_rating) : null,
      adjustedRating: r.adjusted_rating != null ? Number(r.adjusted_rating) : null,
      positionStart: r.position_start,
      positionEnd: r.position_end,
      systemStart: r.system_start,
      systemEnd: r.system_end,
      minutes: r.minutes,
      events: r.events || [],
      eventing: r.eventing || {},
      vsLast: r.vs_last,
      watchFor: r.watch_for || [],
      tagsSeen: r.tags_seen || [],
      playerNote: r.player_note,
      ratingNow: r.rating_now != null ? Number(r.rating_now) : null,
      ratingPotential: r.rating_potential != null ? Number(r.rating_potential) : null,
    };
  });

  // Attendance at matches she played (scouts who opened the match without rating her still count as "seen")
  const playedIds: string[] = Array.from(new Set<string>((playedRes.data || []).map((r: any) => r.match_id)));
  let attendance: AttendanceRow[] = [];
  if (playedIds.length) {
    const { data: att } = await db
      .from("scout_attendance")
      .select("match_id, scout_id, mode, opened_at, scouts ( name ), matches ( match_date )")
      .in("match_id", playedIds.slice(0, 400));
    attendance = (att || []).map((a: any) => ({
      scoutId: a.scout_id,
      scoutName: a.scouts?.name || "Scout",
      matchId: a.match_id,
      mode: a.mode,
      openedAt: a.matches?.match_date || a.opened_at,
    }));
  }

  const hist: HistoryReport[] = reports.map((r: any) => ({
    scoutId: r.scoutId,
    scoutName: r.scoutName,
    matchId: r.matchId,
    matchDate: r.date,
    mode: r.mode,
    matchRating: r.matchRating,
    optaRating: r.optaRating,
    tierDiff: r.tierDiff,
    positionStart: r.positionStart,
    positionEnd: r.positionEnd,
    systemStart: r.systemStart,
    systemEnd: r.systemEnd,
  }));

  const starRows: (StarRatingRow & { scoutName: string })[] = (starsRes.data || []).map((s: any) => ({
    scoutId: s.scout_id,
    scoutName: s.scouts?.name || "Scout",
    ratingNow: s.rating_now != null ? Number(s.rating_now) : null,
    ratingPotential: s.rating_potential != null ? Number(s.rating_potential) : null,
    createdAt: s.created_at,
  }));
  const consensus = starsConsensus(starRows);
  const latestStarsBy = new Map<string, { now: number | null; potential: number | null }>();
  for (const s of [...starRows].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) {
    latestStarsBy.set(s.scoutId, { now: s.ratingNow, potential: s.ratingPotential });
  }

  const seenBy = whoHasSeen(hist, attendance).map((s) => ({ ...s, stars: latestStarsBy.get(s.scoutId) || null }));
  const allDates = [...hist.map((h) => h.matchDate), ...attendance.map((a) => a.openedAt)].filter(Boolean).sort();

  return NextResponse.json({
    teamTier: playerRes.error ? null : playerRes.data?.teams?.tier ?? null,
    latestFullReport,
    stars: consensus,
    matchReports: reports,
    history: {
      views: seenBy.reduce((n, s) => n + s.times, 0),
      scouts: seenBy.length,
      since: allDates[0] || null,
      whoHasSeen: seenBy,
      lastMatches: reports.slice(0, 8),
      context: groupByContext(hist),
      positionsSeen: countSeen(hist, "position"),
      systemsSeen: countSeen(hist, "system"),
    },
    thisMatch: matchId ? reports.filter((r: any) => r.matchId === matchId) : undefined,
  });
}
