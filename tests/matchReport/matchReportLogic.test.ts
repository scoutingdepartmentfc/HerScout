// Run: node --test tests/matchReport/
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adjustedRating,
  clampStars,
  contextBucket,
  countSeen,
  groupByContext,
  isOptaConsistent,
  prefillStars,
  snapMatchRating,
  starsConsensus,
  tapRatingBlock,
  tierDiff,
  whoHasSeen,
  type HistoryReport,
  type StarRatingRow,
} from "../../src/lib/matchReportLogic.ts";

const NOW = new Date("2026-11-28T12:00:00Z");

test("tierDiff: own − opponent, unknown → null", () => {
  assert.equal(tierDiff("T4", "T2"), 2);
  assert.equal(tierDiff("T2", "T4"), -2);
  assert.equal(tierDiff("T3", "T3"), 0);
  assert.equal(tierDiff(null, "T2"), null);
  assert.equal(tierDiff("TX", "T2"), null);
});

test("adjusted rating = rating + 0.3 × tierDiff, clamped 0–10", () => {
  assert.equal(adjustedRating(7.5, 2), 8.1); // mockup: 7.5 vs T2 from T4 → 8.1
  assert.equal(adjustedRating(7.0, -2), 6.4);
  assert.equal(adjustedRating(9.5, 6), 10);
  assert.equal(adjustedRating(0.5, -6), 0);
  assert.equal(adjustedRating(6.5, null), 6.5);
  assert.equal(adjustedRating(6, 1, 0.5), 6.5); // configurable factor
});

test("match rating snaps to 0.5 steps within 0–10", () => {
  assert.equal(snapMatchRating(7.3), 7.5);
  assert.equal(snapMatchRating(7.2), 7);
  assert.equal(snapMatchRating(11), 10);
  assert.equal(snapMatchRating(-1), 0);
});

test("10-block bar: tap = point, tap again = .5", () => {
  assert.equal(tapRatingBlock(null, 7), 7);
  assert.equal(tapRatingBlock(7, 7), 6.5);
  assert.equal(tapRatingBlock(6.5, 7), 7);
  assert.equal(tapRatingBlock(6.5, 8), 8);
});

test("Opta consistency: |Δ| ≤ 1.5 → ✓", () => {
  assert.equal(isOptaConsistent(7.5, 7.4), true);
  assert.equal(isOptaConsistent(8.5, 7.0), true); // exactly 1.5
  assert.equal(isOptaConsistent(9.0, 7.4), false);
  assert.equal(isOptaConsistent(4.0, 6.0), false);
  assert.equal(isOptaConsistent(4.0, null), true);
});

test("stars consensus: average of each scout's latest, rounded to 0.5", () => {
  const rows: StarRatingRow[] = [
    { scoutId: "a", ratingNow: 3, ratingPotential: 4, createdAt: "2026-01-01" },
    { scoutId: "a", ratingNow: 3.5, ratingPotential: 4.5, createdAt: "2026-10-01" }, // latest of a
    { scoutId: "b", ratingNow: 4, ratingPotential: 4, createdAt: "2026-09-01" },
    { scoutId: "c", ratingNow: 3.5, ratingPotential: 4, createdAt: "2026-11-01" },
  ];
  const c = starsConsensus(rows, NOW);
  // now: (3.5 + 4 + 3.5) / 3 = 3.667 → 3.5 ; potential: (4.5 + 4 + 4) / 3 = 4.167 → 4
  assert.equal(c.now, 3.5);
  assert.equal(c.potential, 4);
  assert.equal(c.scouts, 3);
  assert.equal(c.ratings, 4);
});

test("stars consensus: 0.5 rounding goes to nearest half", () => {
  const rows: StarRatingRow[] = [
    { scoutId: "a", ratingNow: 4, ratingPotential: 5, createdAt: "2026-10-01" },
    { scoutId: "b", ratingNow: 4.5, ratingPotential: 4.5, createdAt: "2026-10-01" },
  ];
  // 4.25 → 4.5 (Math.round half up), 4.75 → 5
  const c = starsConsensus(rows, NOW);
  assert.equal(c.now, 4.5);
  assert.equal(c.potential, 5);
});

test("stars consensus: values older than 18 months are excluded", () => {
  const rows: StarRatingRow[] = [
    { scoutId: "old", ratingNow: 1, ratingPotential: 1, createdAt: "2025-03-01" }, // > 18 months
    { scoutId: "a", ratingNow: 4, ratingPotential: 4.5, createdAt: "2026-06-01" },
  ];
  const c = starsConsensus(rows, NOW);
  assert.equal(c.now, 4);
  assert.equal(c.scouts, 1);
  // a scout whose latest is old but who has nothing newer is not counted
  assert.equal(starsConsensus([rows[0]], NOW).now, null);
  // an older value never overrides... but a newer old-scout value inside the window counts
  const rows2: StarRatingRow[] = [...rows, { scoutId: "old", ratingNow: 3, ratingPotential: 3, createdAt: "2026-11-01" }];
  assert.equal(starsConsensus(rows2, NOW).now, 3.5);
});

test("prefill: mine → average → none", () => {
  const rows: StarRatingRow[] = [
    { scoutId: "a", ratingNow: 3.5, ratingPotential: 4, createdAt: "2026-10-01" },
    { scoutId: "b", ratingNow: 4.5, ratingPotential: 5, createdAt: "2026-10-01" },
  ];
  assert.deepEqual(prefillStars(rows, "a", NOW), { now: 3.5, potential: 4, source: "mine" });
  assert.deepEqual(prefillStars(rows, "z", NOW), { now: 4, potential: 4.5, source: "average" });
  assert.deepEqual(prefillStars([], "z", NOW), { now: null, potential: null, source: "none" });
});

test("clampStars keeps 0.5–5 grid", () => {
  assert.equal(clampStars(5.5), 5);
  assert.equal(clampStars(0), 0.5);
  assert.equal(clampStars(3.3), 3.5);
});

const rep = (o: Partial<HistoryReport>): HistoryReport => ({
  scoutId: "a",
  scoutName: "A",
  matchId: "m",
  matchDate: "2026-11-01",
  mode: "live",
  matchRating: 7,
  optaRating: 7,
  tierDiff: 0,
  ...o,
});

test("context grouping by sign(tier_diff)", () => {
  assert.equal(contextBucket(2), "stronger");
  assert.equal(contextBucket(0), "same");
  assert.equal(contextBucket(-1), "weaker");
  assert.equal(contextBucket(null), "unknown");

  const groups = groupByContext([
    rep({ matchId: "1", tierDiff: 2, matchRating: 8, optaRating: 7 }),
    rep({ matchId: "2", tierDiff: 1, matchRating: 7, optaRating: 6 }),
    rep({ matchId: "3", tierDiff: 0, matchRating: 6.5, optaRating: 7.2 }),
    rep({ matchId: "4", tierDiff: -3, matchRating: 9, optaRating: null }),
    rep({ matchId: "5", tierDiff: null, matchRating: 5 }),
  ]);
  assert.deepEqual(groups, [
    { bucket: "stronger", count: 2, avgScout: 7.5, avgOpta: 6.5 },
    { bucket: "same", count: 1, avgScout: 6.5, avgOpta: 7.2 },
    { bucket: "weaker", count: 1, avgScout: 9, avgOpta: null },
  ]);
  // never seen vs a stronger side
  assert.equal(groupByContext([rep({ tierDiff: -1 })])[0].count, 0);
});

test("positions / systems seen count start and end", () => {
  const rs = [
    rep({ positionStart: "ST", positionEnd: "LW", systemStart: "4-4-2", systemEnd: "4-5-1" }),
    rep({ positionStart: "ST", positionEnd: "ST", systemStart: "4-4-2", systemEnd: null }),
  ];
  assert.deepEqual(countSeen(rs, "position"), [
    { key: "ST", count: 2 },
    { key: "LW", count: 1 },
  ]);
  assert.deepEqual(countSeen(rs, "system"), [
    { key: "4-4-2", count: 2 },
    { key: "4-5-1", count: 1 },
  ]);
});

test("who has seen her: attendance + reports, once per (scout, match)", () => {
  const rows = whoHasSeen(
    [
      rep({ scoutId: "a", scoutName: "A", matchId: "1", matchDate: "2026-11-16", matchRating: 8.5 }),
      rep({ scoutId: "a", scoutName: "A", matchId: "2", matchDate: "2026-11-12", mode: "video", matchRating: 8 }),
      rep({ scoutId: "b", scoutName: "B", matchId: "1", matchDate: "2026-11-16", matchRating: 7 }),
    ],
    [
      { scoutId: "a", scoutName: "A", matchId: "1", mode: "live", openedAt: "2026-11-16" }, // same match as a report
      { scoutId: "a", scoutName: "A", matchId: "3", mode: "live", openedAt: "2026-10-01" }, // attended, not rated
    ]
  );
  assert.equal(rows[0].scoutId, "a");
  assert.equal(rows[0].times, 3);
  assert.equal(rows[0].live, 2);
  assert.equal(rows[0].video, 1);
  assert.equal(rows[0].avgRating, 8.3); // 8.25 → 8.3
  assert.equal(rows[0].last, "2026-11-16");
  assert.equal(rows[1].times, 1);
});
