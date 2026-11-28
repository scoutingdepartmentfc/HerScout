/**
 * Server side of Match Report v2 (SPEC v1.5 §5): builds the participants of a match with everything
 * that is filled automatically (position/system, minutes, events, Opta rating, key eventing, tier context,
 * history and star pre-fill). Used by GET (to show) and POST (to snapshot on save) so both agree.
 */
import { fetchMatchstats } from "@/lib/matchLineups";
import { getPositionBadge } from "@/lib/positions";
import {
  adjustedRating,
  prefillStars,
  previousAverage,
  starsConsensus,
  tierDiff,
  type StarRatingRow,
} from "@/lib/matchReportLogic";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const orgFromHeader = (h: string | null) => (h && UUID_RE.test(h) ? h : null);

export type Side = "home" | "away";

export interface Eventing {
  goals: number | null;
  assists: number | null;
  shots: number | null;
  shots_on: number | null;
  key_passes: number | null;
  dribbles_won: number | null;
  dribbles_att: number | null;
  duels_won: number | null;
  duels_total: number | null;
}

export interface MatchEventItem {
  type: "goal" | "own_goal" | "yellow" | "red" | "sub_on" | "sub_off";
  min: number | null;
}

export interface Participant {
  id: string;
  name: string;
  shirt: number | null;
  side: Side;
  teamId: string | null;
  inDatabase: boolean;
  photoUrl: string | null;
  starter: boolean;
  minutes: number | null;
  positionStart: string | null;
  positionEnd: string | null;
  systemStart: string | null;
  systemEnd: string | null;
  events: MatchEventItem[];
  optaRating: number | null;
  eventing: Eventing;
  ownTier: string | null;
  opponentTier: string | null;
  tierDiff: number | null;
  watchlist: boolean;
  history: {
    seenBefore: boolean;
    timesSeen: number;
    avgRating: number | null;
    avgMinutes: number | null;
    lastSeen: { date: string | null; opponent: string | null; rating: number | null } | null;
    fullReport: { id: string; date: string | null; score: number | null; decision: string | null } | null;
    watchFor: string[];
    tags: string[];
  };
  stars: {
    prefillNow: number | null;
    prefillPotential: number | null;
    source: "mine" | "average" | "none";
    mineNow: number | null;
    minePotential: number | null;
    avgNow: number | null;
    avgPotential: number | null;
    scouts: number;
  };
  report: any | null; // this scout's report for this match, if any
}

export interface MatchContext {
  match: {
    id: string;
    date: string | null;
    status: string | null;
    competition: string | null;
    week: string | null;
    venue: string | null;
    seasonId: string | null;
    home: TeamSide;
    away: TeamSide;
  };
  players: Participant[];
  matchNote: string;
  attendance: { mode: "live" | "video"; openedAt: string } | null;
  assignmentMode: "live" | "video" | null;
}

interface TeamSide {
  id: string | null;
  name: string;
  badgeUrl: string | null;
  tier: string | null;
  score: number | null;
  formation: string | null;
}

const num = (v: any): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** Opta lineup position + side → short code (fallback when the DB has no demarcación). */
function codeFromLineup(pos?: string | null, side?: string | null): string | null {
  if (!pos || pos === "Substitute") return null;
  const s = (side || "").toLowerCase();
  const left = s.startsWith("left");
  const right = s.endsWith("right") || s === "right";
  switch (pos) {
    case "Goalkeeper":
      return "GK";
    case "Defender":
    case "Wing Back":
      return left ? "LB" : right ? "RB" : "CB";
    case "Defensive Midfielder":
      return "CDM";
    case "Midfielder":
      return left ? "LM" : right ? "RM" : "CM";
    case "Attacking Midfielder":
      return left ? "LW" : right ? "RW" : "CAM";
    case "Striker":
    case "Forward":
      return left ? "LW" : right ? "RW" : "ST";
    default:
      return null;
  }
}

function codeFromDemarcacion(dem?: string | null): string | null {
  if (!dem) return null;
  const c = getPositionBadge(dem).code;
  return c && c !== "—" ? c : null;
}

/** Per-player Opta stats from matchstats (detailed=yes). */
function optaPlayerStats(data: any): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>();
  for (const team of data?.liveData?.lineUp ?? []) {
    for (const p of team.player ?? []) {
      const stats: Record<string, number> = {};
      for (const s of p.stat ?? []) {
        const v = Number(s.value);
        if (Number.isFinite(v)) stats[s.type] = v;
      }
      out.set(p.playerId, stats);
    }
  }
  return out;
}

// Small in-memory cache: the same match is opened many times while rating 22 players
const optaCache = new Map<string, { at: number; stats: Map<string, Record<string, number>> | null }>();
async function cachedOptaStats(matchId: string) {
  const hit = optaCache.get(matchId);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.stats;
  const data = await fetchMatchstats(matchId);
  const stats = data ? optaPlayerStats(data) : null;
  optaCache.set(matchId, { at: Date.now(), stats });
  if (optaCache.size > 200) optaCache.delete(optaCache.keys().next().value as string);
  return stats;
}

function splitList(v: any): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string")
    return v
      .split(/\r?\n|;|•/)
      .map((x) => x.replace(/^[-–•\s]+/, "").trim())
      .filter(Boolean);
  return [];
}

/**
 * Builds the full match context for one scout. `scoutId` may be null (read-only view).
 */
export async function buildMatchContext(
  db: any,
  matchId: string,
  scoutId: string | null,
  orgId: string | null
): Promise<MatchContext | null> {
  const { data: m, error } = await db
    .from("matches")
    .select(
      `id, match_date, status, week, venue_name, season_id, home_score, away_score, lineups,
       competitions ( name ),
       home_team:teams!home_team_id ( id, name, badge_url, tier ),
       away_team:teams!away_team_id ( id, name, badge_url, tier )`
    )
    .eq("id", matchId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!m) return null;

  const lineups = m.lineups || {};
  const teamSide = (side: Side): TeamSide => {
    const t = side === "home" ? m.home_team : m.away_team;
    return {
      id: t?.id ?? null,
      name: t?.name ?? (side === "home" ? "Home" : "Away"),
      badgeUrl: t?.badge_url ?? null,
      tier: t?.tier ?? null,
      score: side === "home" ? m.home_score : m.away_score,
      formation: lineups[side]?.formation ?? null,
    };
  };
  const home = teamSide("home");
  const away = teamSide("away");

  // Stats rows of this match (minutes, demarcación, native eventing) + Opta ratings
  const [statsRes, scoresRes, optaStats] = await Promise.all([
    db
      .from("player_match_stats")
      .select(
        "player_id, team_id, minutes_played, is_starter, formation, demarcacion, goals, assists, takeons_successful, takeons_total, tackles_won, tackles_total, aerials_won, aerials_total, yellow_cards, red_cards"
      )
      .eq("match_id", matchId),
    db.from("player_match_scores").select("player_id, score_general").eq("match_id", matchId),
    cachedOptaStats(matchId).catch(() => null),
  ]);
  const statsBy = new Map<string, any>((statsRes.data || []).map((r: any) => [r.player_id, r]));
  const optaBy = new Map<string, number>((scoresRes.data || []).map((r: any) => [r.player_id, Number(r.score_general)]));

  // Participants: starters + subs with minutes > 0 (lineups + substitutions, confirmed by stats/Opta minutes)
  const subsOn = new Map<string, number | null>();
  const subsOff = new Map<string, number | null>();
  for (const s of lineups.substitutions || []) {
    if (s.onId) subsOn.set(s.onId, num(s.min));
    if (s.offId) subsOff.set(s.offId, num(s.min));
  }

  type Raw = { id: string; name: string; shirt: number | null; side: Side; starter: boolean; lineupCode: string | null };
  const raw: Raw[] = [];
  const seen = new Set<string>();
  for (const side of ["home", "away"] as Side[]) {
    const t = lineups[side];
    if (!t) continue;
    for (const p of t.starters || []) {
      if (!p.id || seen.has(p.id)) continue;
      seen.add(p.id);
      raw.push({ id: p.id, name: p.name, shirt: num(p.shirt), side, starter: true, lineupCode: codeFromLineup(p.pos, p.side) });
    }
    for (const p of t.subs || []) {
      if (!p.id || seen.has(p.id)) continue;
      const mins = num(statsBy.get(p.id)?.minutes_played) ?? num(optaStats?.get(p.id)?.minsPlayed);
      const cameOn = subsOn.has(p.id) || (mins != null && mins > 0);
      if (!cameOn) continue; // unused subs are excluded
      seen.add(p.id);
      raw.push({ id: p.id, name: p.name, shirt: num(p.shirt), side, starter: false, lineupCode: null });
    }
  }
  // Matches with stats but no stored lineups: fall back to stats rows
  if (!raw.length) {
    for (const r of statsRes.data || []) {
      if (!(Number(r.minutes_played) > 0)) continue;
      const side: Side = r.team_id === home.id ? "home" : "away";
      raw.push({ id: r.player_id, name: r.player_id, shirt: null, side, starter: !!r.is_starter, lineupCode: null });
    }
  }
  const ids = raw.map((r) => r.id);

  // Everything per player, in parallel
  const [playersRes, prevRes, fullRes, starsRes, minsRes, wlRes, mineRes, noteRes, attRes, asgRes] = await Promise.all([
    ids.length ? db.from("players").select("id, name, match_name, photo_url").in("id", ids) : { data: [] },
    ids.length
      ? db
          .from("match_reports")
          .select(
            `player_id, match_id, team_id, match_date, match_rating, minutes,
             matches ( match_date, home_team:teams!home_team_id ( id, name ), away_team:teams!away_team_id ( id, name ) )`
          )
          .in("player_id", ids)
          .eq("status", "published")
          .neq("match_id", matchId)
          .order("match_date", { ascending: false })
      : { data: [] },
    ids.length
      ? db
          .from("scouting_reports")
          .select("id, player_id, created_at, status, rating, recommendation, weaknesses, sponda_data")
          .in("player_id", ids)
          .order("created_at", { ascending: false })
      : { data: [] },
    ids.length
      ? db.from("player_star_ratings").select("player_id, scout_id, rating_now, rating_potential, created_at").in("player_id", ids)
      : { data: [] },
    ids.length && m.season_id
      ? db.from("player_match_stats").select("player_id, minutes_played").in("player_id", ids).eq("season_id", m.season_id).neq("match_id", matchId)
      : { data: [] },
    ids.length && orgId
      ? db.from("watchlist_players").select("player_id").eq("organization_id", orgId).in("player_id", ids)
      : { data: [] },
    scoutId ? db.from("match_reports").select("*").eq("match_id", matchId).eq("scout_id", scoutId) : { data: [] },
    scoutId ? db.from("match_notes").select("text").eq("match_id", matchId).eq("scout_id", scoutId).maybeSingle() : { data: null },
    scoutId
      ? db.from("scout_attendance").select("mode, opened_at").eq("match_id", matchId).eq("scout_id", scoutId).maybeSingle()
      : { data: null },
    scoutId
      ? db.from("scout_assignments").select("mode").eq("match_id", matchId).eq("scout_id", scoutId).limit(1)
      : { data: [] },
  ]);

  const playersBy = new Map<string, any>((playersRes.data || []).map((p: any) => [p.id, p]));
  const group = <T,>(rows: T[] | null | undefined, key: (r: T) => string) => {
    const g = new Map<string, T[]>();
    for (const r of rows || []) {
      const k = key(r);
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push(r);
    }
    return g;
  };
  const prevBy = group<any>(prevRes.data, (r) => r.player_id);
  const fullBy = group<any>(fullRes.data, (r) => r.player_id);
  const starsBy = group<any>(starsRes.data, (r) => r.player_id);
  const minsBy = group<any>(minsRes.data, (r) => r.player_id);
  const watch = new Set<string>((wlRes.data || []).map((r: any) => r.player_id));
  const mineBy = new Map<string, any>((mineRes.data || []).map((r: any) => [r.player_id, r]));

  const eventsFor = (pid: string): MatchEventItem[] => {
    const ev: MatchEventItem[] = [];
    for (const g of lineups.goals || []) {
      if (g.playerId === pid) ev.push({ type: g.type === "OG" ? "own_goal" : "goal", min: num(g.min) });
    }
    for (const c of lineups.cards || []) {
      if (c.playerId === pid) ev.push({ type: c.type === "YC" ? "yellow" : "red", min: num(c.min) });
    }
    if (subsOn.has(pid)) ev.push({ type: "sub_on", min: subsOn.get(pid) ?? null });
    if (subsOff.has(pid)) ev.push({ type: "sub_off", min: subsOff.get(pid) ?? null });
    return ev.sort((a, b) => (a.min ?? 0) - (b.min ?? 0));
  };

  const players: Participant[] = raw.map((r) => {
    const st = statsBy.get(r.id);
    const os = optaStats?.get(r.id);
    const own = r.side === "home" ? home : away;
    const opp = r.side === "home" ? away : home;
    const diff = tierDiff(own.tier, opp.tier);

    const posStart = codeFromDemarcacion(st?.demarcacion) ?? r.lineupCode;
    const minutes = num(st?.minutes_played) ?? num(os?.minsPlayed);
    const duelsWon = os?.duelWon ?? (st ? (num(st.tackles_won) ?? 0) + (num(st.aerials_won) ?? 0) : null);
    const duelsTotal =
      os?.duelWon != null ? (os.duelWon ?? 0) + (os.duelLost ?? 0) : st ? (num(st.tackles_total) ?? 0) + (num(st.aerials_total) ?? 0) : null;
    const eventing: Eventing = {
      goals: num(os?.goals) ?? num(st?.goals),
      assists: num(os?.goalAssist) ?? num(st?.assists),
      shots: num(os?.totalScoringAtt),
      shots_on: num(os?.ontargetScoringAtt),
      key_passes: num(os?.totalAttAssist),
      dribbles_won: num(os?.wonContest) ?? num(st?.takeons_successful),
      dribbles_att: num(os?.totalContest) ?? num(st?.takeons_total),
      duels_won: duelsWon,
      duels_total: duelsTotal,
    };

    // History
    const prev = prevBy.get(r.id) || [];
    const last = prev[0];
    let lastOpponent: string | null = null;
    if (last?.matches) {
      const h = last.matches.home_team;
      const a = last.matches.away_team;
      lastOpponent = last.team_id && h?.id === last.team_id ? a?.name ?? null : h?.name ?? null;
    }
    const fulls = fullBy.get(r.id) || [];
    const latestFull = fulls.find((f: any) => !f.sponda_data?.starsOnly) || null;
    const sd = latestFull?.sponda_data || {};
    const watchFor = Array.from(
      new Set([...splitList(sd.debilities), ...splitList(sd.cons), ...splitList(latestFull?.weaknesses)])
    ).slice(0, 6);
    const tags = splitList(sd.tecTacTags);
    const otherMins = (minsBy.get(r.id) || []).map((x: any) => Number(x.minutes_played) || 0).filter((x: number) => x > 0);

    // Stars
    const starRows: StarRatingRow[] = (starsBy.get(r.id) || []).map((s: any) => ({
      scoutId: s.scout_id,
      ratingNow: num(s.rating_now),
      ratingPotential: num(s.rating_potential),
      createdAt: s.created_at,
    }));
    const pre = scoutId ? prefillStars(starRows, scoutId) : { now: null, potential: null, source: "none" as const };
    const cons = starsConsensus(starRows);
    const mineRow = scoutId
      ? starRows.filter((s) => s.scoutId === scoutId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0]
      : null;

    const dbPlayer = playersBy.get(r.id);
    return {
      id: r.id,
      name: dbPlayer?.match_name || r.name || dbPlayer?.name || r.id,
      shirt: r.shirt,
      side: r.side,
      teamId: st?.team_id ?? own.id,
      inDatabase: !!dbPlayer,
      photoUrl: dbPlayer?.photo_url ?? null,
      starter: r.starter,
      minutes,
      positionStart: posStart,
      positionEnd: posStart,
      systemStart: own.formation ?? st?.formation ?? null,
      systemEnd: own.formation ?? st?.formation ?? null,
      events: eventsFor(r.id),
      optaRating: optaBy.get(r.id) ?? null,
      eventing,
      ownTier: own.tier,
      opponentTier: opp.tier,
      tierDiff: diff,
      watchlist: watch.has(r.id),
      history: {
        seenBefore: prev.length > 0,
        timesSeen: new Set(prev.map((p: any) => p.match_id)).size,
        avgRating: previousAverage(prev.map((p: any) => num(p.match_rating))),
        avgMinutes: otherMins.length ? Math.round(otherMins.reduce((a: number, b: number) => a + b, 0) / otherMins.length) : null,
        lastSeen: last
          ? { date: last.match_date || last.matches?.match_date || null, opponent: lastOpponent, rating: num(last.match_rating) }
          : null,
        fullReport: latestFull
          ? {
              id: latestFull.id,
              date: latestFull.created_at,
              score: num(sd.scoutScore) ?? (num(latestFull.rating) != null ? Math.round(Number(latestFull.rating) * 10) : null),
              decision: sd.scoutDecision || latestFull.recommendation || null,
            }
          : null,
        watchFor: latestFull ? watchFor : [],
        tags,
      },
      stars: {
        prefillNow: pre.now,
        prefillPotential: pre.potential,
        source: pre.source,
        mineNow: mineRow?.ratingNow ?? null,
        minePotential: mineRow?.ratingPotential ?? null,
        avgNow: cons.now,
        avgPotential: cons.potential,
        scouts: cons.scouts,
      },
      report: mineBy.get(r.id) || null,
    };
  });

  return {
    match: {
      id: m.id,
      date: m.match_date,
      status: m.status,
      competition: m.competitions?.name ?? null,
      week: m.week ?? null,
      venue: m.venue_name ?? null,
      seasonId: m.season_id ?? null,
      home,
      away,
    },
    players,
    matchNote: noteRes.data?.text ?? "",
    attendance: attRes.data ? { mode: attRes.data.mode, openedAt: attRes.data.opened_at } : null,
    assignmentMode: asgRes.data?.[0]?.mode ?? null,
  };
}

/** Values stored on the report row at save time (auto snapshot + computed fields). */
export function snapshotFor(p: Participant, matchRating: number) {
  return {
    team_id: p.teamId,
    minutes: p.minutes,
    events: p.events,
    eventing: p.eventing,
    own_tier: p.ownTier,
    opponent_tier: p.opponentTier,
    tier_diff: p.tierDiff,
    opta_rating: p.optaRating,
    adjusted_rating: adjustedRating(matchRating, p.tierDiff),
    minutes_vs_avg: p.minutes != null && p.history.avgMinutes != null ? p.minutes - p.history.avgMinutes : null,
  };
}

/**
 * Full reports also feed the stars consensus (SPEC §6.9): store their stars in player_star_ratings
 * under the scout (resolved by id, else by name). Fail-soft: never blocks saving the report.
 */
export async function recordFullReportStars(db: any, row: any) {
  try {
    const sd = row?.sponda_data || {};
    const now = sd.ratingStars != null ? Number(sd.ratingStars) : null;
    const pot = sd.potentialStars ?? sd.ratingPotentialStars;
    if (now == null && pot == null) return;
    let scoutId: string | null = row.scout_id || null;
    if (!scoutId && row.scout_name) {
      const { data } = await db.from("scouts").select("id").ilike("name", String(row.scout_name).trim()).limit(1);
      scoutId = data?.[0]?.id ?? null;
    }
    if (!scoutId) return;
    await db.from("player_star_ratings").upsert(
      {
        player_id: row.player_id,
        scout_id: scoutId,
        organization_id: UUID_RE.test(row.organization_id || "") ? row.organization_id : null,
        source: "full_report",
        source_id: row.id,
        rating_now: now,
        rating_potential: pot != null ? Number(pot) : null,
        created_at: new Date().toISOString(),
      },
      { onConflict: "source,source_id" }
    );
  } catch {
    /* stars consensus is best-effort for full reports */
  }
}
