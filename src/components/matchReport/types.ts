import type { MatchContext, Participant } from "@/lib/matchReportServer";

export type { MatchContext, Participant };

export type Tri = -1 | 0 | 1;

export const VS_DIMENSIONS: { key: string; label: string }[] = [
  { key: "overall", label: "Overall" },
  { key: "technical", label: "Technical" },
  { key: "physical", label: "Physical" },
  { key: "decision", label: "Decision making" },
  { key: "tactical", label: "Tactical" },
  { key: "mentality", label: "Mentality" },
];

export const PILLARS: { key: string; label: string }[] = [
  { key: "technique", label: "Technique" },
  { key: "game_vision", label: "Game Vision" },
  { key: "decision_making", label: "Decision Making" },
  { key: "pace", label: "Pace" },
  { key: "strength", label: "Strength" },
];

export const FORMATIONS = ["4-4-2", "4-3-3", "4-2-3-1", "4-1-4-1", "4-5-1", "3-5-2", "3-4-3", "5-3-2", "5-4-1", "4-3-1-2", "4-4-1-1"];
export const POSITION_CODES = ["GK", "RB", "RWB", "CB", "LB", "LWB", "CDM", "CM", "RM", "LM", "CAM", "RW", "LW", "ST", "CF"];

/** What the scout fills in for one player (local state until saved). */
export interface Draft {
  matchRating: number | null;
  ratingNow: number | null;
  ratingPotential: number | null;
  positionStart: string | null;
  positionEnd: string | null;
  systemStart: string | null;
  systemEnd: string | null;
  vsLast: Record<string, Tri>;
  watchFor: Record<string, "better" | "same" | "worse">;
  pillarFlash: Record<string, Tri>;
  tagsSeen: string[];
  playerNote: string;
  consistencyNote: string;
  dirty: boolean;
  skipped?: boolean;
}

export function draftFrom(p: Participant): Draft {
  const r = p.report;
  const watch: Draft["watchFor"] = {};
  for (const w of r?.watch_for || []) if (w?.item && w.result !== "not_seen") watch[w.item] = w.result;
  return {
    matchRating: r?.match_rating != null ? Number(r.match_rating) : null,
    ratingNow: r?.rating_now != null ? Number(r.rating_now) : p.stars.prefillNow,
    ratingPotential: r?.rating_potential != null ? Number(r.rating_potential) : p.stars.prefillPotential,
    positionStart: r?.position_start ?? p.positionStart,
    positionEnd: r?.position_end ?? p.positionEnd,
    systemStart: r?.system_start ?? p.systemStart,
    systemEnd: r?.system_end ?? p.systemEnd,
    vsLast: (r?.vs_last as any) || {},
    watchFor: watch,
    pillarFlash: (r?.pillar_flash as any) || {},
    tagsSeen: Array.isArray(r?.tags_seen) ? r.tags_seen : [],
    playerNote: r?.player_note || "",
    consistencyNote: r?.consistency_note || "",
    dirty: false,
  };
}

export function draftToPayload(p: Participant, d: Draft) {
  return {
    playerId: p.id,
    matchRating: d.matchRating,
    ratingNow: d.ratingNow,
    ratingPotential: d.ratingPotential,
    positionStart: d.positionStart,
    positionEnd: d.positionEnd,
    systemStart: d.systemStart,
    systemEnd: d.systemEnd,
    vsLast: d.vsLast,
    watchFor: p.history.watchFor.map((item) => ({ item, result: d.watchFor[item] || "not_seen" })),
    pillarFlash: d.pillarFlash,
    tagsSeen: d.tagsSeen,
    playerNote: d.playerNote,
    consistencyNote: d.consistencyNote,
  };
}

export type RowStatus = "to_rate" | "editing" | "rated" | "published";

export function rowStatus(p: Participant, d: Draft | undefined, selected: boolean): RowStatus {
  if (d?.dirty) return "editing";
  if (selected && !p.report) return "editing";
  return statusOfReport(p);
}

function statusOfReport(p: Participant): RowStatus {
  if (!p.report) return "to_rate";
  return p.report.status === "published" ? "published" : "rated";
}

export const fmtDate = (d?: string | null, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit" }) =>
  d ? new Date(d).toLocaleDateString("en-GB", opts) : "—";

export const fmtRating = (v: number | null | undefined) => (v == null ? "—" : Number(v).toFixed(1));
