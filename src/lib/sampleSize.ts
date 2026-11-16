/**
 * Low sample: the season rating is per-90 only (minutes don't score), so with very few minutes it is
 * shown with a warning and kept out of rankings. Same thresholds as pipeline/config.py
 * (MIN_MINUTOS_NOTA, MIN_PARTIDOS_NOTA).
 */
export const MIN_MINUTES_RATING = 270;
export const MIN_MATCHES_RATING = 3;

export function isLowSample(minutes?: number | null, matches?: number | null): boolean {
  return (Number(minutes) || 0) < MIN_MINUTES_RATING || (Number(matches) || 0) < MIN_MATCHES_RATING;
}

export const LOW_SAMPLE_LABEL = `Low sample (<${MIN_MINUTES_RATING}' or <${MIN_MATCHES_RATING} matches): rating per 90 with little data, not ranked`;

/** Sort comparator helper for ratings: players with low sample always go after the rest. */
export function lowSampleLast(a: { lowSample?: boolean }, b: { lowSample?: boolean }): number {
  return (a.lowSample ? 1 : 0) - (b.lowSample ? 1 : 0);
}
