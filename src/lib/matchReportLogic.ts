/**
 * Match Report v2 business rules (SPEC v1.5 §6.4, §6.9, §6.10).
 * Pure functions with no imports so they can be unit-tested with `node --test` directly.
 */

// ───────────────────────────── §6.4 Match rating & adjustment ─────────────────────────────

export const TIER_ADJUST_FACTOR = 0.3;
export const OPTA_CONSISTENCY_THRESHOLD = 1.5;

/** "T4" → 4, 4 → 4, anything else → null */
export function tierNumber(tier: string | number | null | undefined): number | null {
  if (tier == null) return null;
  const n = typeof tier === "number" ? tier : Number(String(tier).replace(/^T/i, ""));
  return Number.isInteger(n) && n >= 1 && n <= 7 ? n : null;
}

/** tierDiff = ownTeamTier − opponentTier (T4 vs T2 → +2 = stronger opponent). null if a tier is unknown. */
export function tierDiff(ownTier: string | number | null | undefined, opponentTier: string | number | null | undefined): number | null {
  const own = tierNumber(ownTier);
  const opp = tierNumber(opponentTier);
  return own == null || opp == null ? null : own - opp;
}

/** Snap to the 0.5 grid and keep within 0–10. */
export function snapMatchRating(v: number): number {
  return Math.min(10, Math.max(0, Math.round(v * 2) / 2));
}

/** adjustedRating = clamp(matchRating + factor × tierDiff, 0, 10). Unknown tier → no adjustment. */
export function adjustedRating(matchRating: number, diff: number | null, factor = TIER_ADJUST_FACTOR): number {
  const v = matchRating + factor * (diff ?? 0);
  return Math.round(Math.min(10, Math.max(0, v)) * 10) / 10;
}

/** |matchRating − optaRating| ≤ threshold → consistent. No Opta rating → consistent (nothing to compare). */
export function isOptaConsistent(
  matchRating: number,
  optaRating: number | null | undefined,
  threshold = OPTA_CONSISTENCY_THRESHOLD
): boolean {
  if (optaRating == null) return true;
  return Math.abs(matchRating - optaRating) <= threshold + 1e-9;
}

/** Context bucket from tierDiff: stronger opponent (▲), same (=), weaker (▼). */
export type ContextBucket = "stronger" | "same" | "weaker" | "unknown";
export function contextBucket(diff: number | null | undefined): ContextBucket {
  if (diff == null) return "unknown";
  return diff > 0 ? "stronger" : diff < 0 ? "weaker" : "same";
}

/** Tap logic of the 10-block bar: tap a new block = whole point, tap the same block again = +0.5 (toggle). */
export function tapRatingBlock(current: number | null, block: number): number {
  if (current === block) return block - 0.5;
  if (current === block - 0.5) return block;
  return block;
}

// ───────────────────────────── §6.9 Star ratings consensus ─────────────────────────────

export interface StarRatingRow {
  scoutId: string;
  ratingNow: number | null;
  ratingPotential: number | null;
  createdAt: string | Date;
}

export const STARS_MAX_AGE_MONTHS = 18;

export function roundToHalf(v: number): number {
  return Math.round(v * 2) / 2;
}

/** Clamp stars to the 0.5–5 grid. */
export function clampStars(v: number): number {
  return Math.min(5, Math.max(0.5, roundToHalf(v)));
}

function monthsAgo(now: Date, months: number): Date {
  const d = new Date(now.getTime());
  d.setMonth(d.getMonth() - months);
  return d;
}

/** Latest row per scout (ignores rows older than the cut-off). */
export function latestPerScout(rows: StarRatingRow[], now = new Date(), maxAgeMonths = STARS_MAX_AGE_MONTHS): StarRatingRow[] {
  const cutoff = monthsAgo(now, maxAgeMonths).getTime();
  const latest = new Map<string, StarRatingRow>();
  for (const r of rows) {
    const t = new Date(r.createdAt).getTime();
    if (!Number.isFinite(t) || t < cutoff) continue;
    const prev = latest.get(r.scoutId);
    if (!prev || t > new Date(prev.createdAt).getTime()) latest.set(r.scoutId, r);
  }
  return Array.from(latest.values());
}

export interface StarsConsensus {
  now: number | null;
  potential: number | null;
  scouts: number; // scouts contributing
  ratings: number; // star ratings in the window
}

/** Player stars = average of each scout's latest value, rounded to the nearest 0.5. */
export function starsConsensus(rows: StarRatingRow[], now = new Date(), maxAgeMonths = STARS_MAX_AGE_MONTHS): StarsConsensus {
  const cutoff = monthsAgo(now, maxAgeMonths).getTime();
  const inWindow = rows.filter((r) => new Date(r.createdAt).getTime() >= cutoff);
  const latest = latestPerScout(rows, now, maxAgeMonths);
  const avg = (vals: (number | null)[]) => {
    const v = vals.filter((x): x is number => x != null && Number.isFinite(x));
    return v.length ? roundToHalf(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  return {
    now: avg(latest.map((r) => r.ratingNow)),
    potential: avg(latest.map((r) => r.ratingPotential)),
    scouts: latest.length,
    ratings: inWindow.length,
  };
}

/** Pre-fill for a scout (§5.3): their latest values, else the all-scouts average, else empty. */
export function prefillStars(
  rows: StarRatingRow[],
  scoutId: string,
  now = new Date()
): { now: number | null; potential: number | null; source: "mine" | "average" | "none" } {
  const latest = latestPerScout(rows, now);
  const mine = latest.find((r) => r.scoutId === scoutId);
  if (mine && (mine.ratingNow != null || mine.ratingPotential != null)) {
    return { now: mine.ratingNow, potential: mine.ratingPotential, source: "mine" };
  }
  const c = starsConsensus(rows, now);
  if (c.now != null || c.potential != null) return { now: c.now, potential: c.potential, source: "average" };
  return { now: null, potential: null, source: "none" };
}

// ───────────────────────────── §6.10 Scouting history ─────────────────────────────

export interface HistoryReport {
  scoutId: string;
  scoutName: string;
  matchId: string;
  matchDate: string;
  mode: "live" | "video";
  matchRating: number | null;
  optaRating: number | null;
  tierDiff: number | null;
  positionStart?: string | null;
  positionEnd?: string | null;
  systemStart?: string | null;
  systemEnd?: string | null;
}

export interface ContextGroup {
  bucket: Exclude<ContextBucket, "unknown">;
  count: number;
  avgScout: number | null;
  avgOpta: number | null;
}

const mean = (vals: (number | null | undefined)[]) => {
  const v = vals.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};

/** Group match reports by sign(tier_diff): stronger / same / weaker (unknown tiers are left out). */
export function groupByContext(reports: HistoryReport[]): ContextGroup[] {
  return (["stronger", "same", "weaker"] as const).map((bucket) => {
    const rs = reports.filter((r) => contextBucket(r.tierDiff) === bucket);
    return { bucket, count: rs.length, avgScout: mean(rs.map((r) => r.matchRating)), avgOpta: mean(rs.map((r) => r.optaRating)) };
  });
}

/** Counts of positions or systems seen (start and end both count; an unchanged value counts once). */
export function countSeen(reports: HistoryReport[], kind: "position" | "system"): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of reports) {
    const a = kind === "position" ? r.positionStart : r.systemStart;
    const b = kind === "position" ? r.positionEnd : r.systemEnd;
    const keys = new Set([a, b].filter((x): x is string => !!x));
    for (const k of Array.from(keys)) counts.set(k, (counts.get(k) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((x, y) => y.count - x.count || x.key.localeCompare(y.key));
}

export interface AttendanceRow {
  scoutId: string;
  scoutName: string;
  matchId: string;
  mode: "live" | "video";
  openedAt: string;
}

export interface ScoutSeenRow {
  scoutId: string;
  scoutName: string;
  times: number;
  live: number;
  video: number;
  first: string;
  last: string;
  avgRating: number | null;
}

/**
 * Who has seen the player: attendance (matches the scout opened where she played) + match reports,
 * counted once per (scout, match).
 */
export function whoHasSeen(reports: HistoryReport[], attendance: AttendanceRow[]): ScoutSeenRow[] {
  const byScout = new Map<string, { name: string; matches: Map<string, { mode: string; date: string }>; ratings: number[] }>();
  const touch = (scoutId: string, name: string) => {
    if (!byScout.has(scoutId)) byScout.set(scoutId, { name, matches: new Map(), ratings: [] });
    return byScout.get(scoutId)!;
  };
  for (const a of attendance) {
    touch(a.scoutId, a.scoutName).matches.set(a.matchId, { mode: a.mode, date: a.openedAt });
  }
  for (const r of reports) {
    const s = touch(r.scoutId, r.scoutName);
    s.matches.set(r.matchId, { mode: r.mode, date: r.matchDate });
    if (r.matchRating != null) s.ratings.push(r.matchRating);
  }
  return Array.from(byScout.entries())
    .map(([scoutId, s]) => {
      const ms = Array.from(s.matches.values());
      const dates = ms.map((m) => m.date).sort();
      return {
        scoutId,
        scoutName: s.name,
        times: ms.length,
        live: ms.filter((m) => m.mode === "live").length,
        video: ms.filter((m) => m.mode === "video").length,
        first: dates[0],
        last: dates[dates.length - 1],
        avgRating: mean(s.ratings),
      };
    })
    .sort((a, b) => b.times - a.times || b.last.localeCompare(a.last));
}

/** "her avg" = mean match rating of previous match reports of the player. */
export function previousAverage(ratings: (number | null)[]): number | null {
  return mean(ratings);
}
