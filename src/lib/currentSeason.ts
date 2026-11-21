/**
 * "Current season" of a player across every competition she plays (domestic league, cups, international club
 * cups, national teams), whatever each one calls it ("2026", "2026/2027").
 *
 * A competition's season is current when it is its active season, unless it ended over CURRENT_SEASON_GRACE_DAYS
 * ago: some leagues no longer downloaded keep an old season marked active (Serie B 2024/25), while 150 days keeps
 * calendar-year leagues (NWSL, Damallsvenskan) current through their winter break.
 */
export const CURRENT_SEASON_GRACE_DAYS = 150;

export interface SeasonInfo {
  is_active?: boolean | null;
  end_date?: string | null;
}

export function isCurrentSeason(season: SeasonInfo | null | undefined, now: number = Date.now()): boolean {
  if (!season?.is_active) return false;
  if (!season.end_date) return true;
  return new Date(season.end_date).getTime() >= now - CURRENT_SEASON_GRACE_DAYS * 24 * 3600 * 1000;
}

/** Minutes-weighted average of `key` over the rows that have it (a 10-minute cup cameo weighs less than a league). */
export function minutesWeighted(rows: any[], key: string): number | null {
  let sum = 0;
  let mins = 0;
  for (const r of rows) {
    const v = r?.[key];
    const m = Number(r?.minutes_played) || 0;
    if (v == null || !Number.isFinite(Number(v)) || m <= 0) continue;
    sum += Number(v) * m;
    mins += m;
  }
  return mins > 0 ? sum / mins : null;
}
