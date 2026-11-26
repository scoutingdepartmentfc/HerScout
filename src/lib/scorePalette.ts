/**
 * Single score palette & color tokens from SPEC.md (§1 & design-tokens.json).
 * Every score (0-100 or 0-10) uses scoreColor(); text on top of it is always #0A0A14.
 */

export const SCORE_ON_TEXT = "#0A0A14";
export const LEAGUE_AVG_COLOR = "#FF3D7F";
export const ALERT_COLOR = "#F05252";
export const PRIMARY_BLUE = "#3B6FF5";
export const PRIMARY_BLUE_LIGHT = "#5B8CFF";
export const DECISION_SIGN_COLOR = "#6BE88F";
export const DECISION_MONITOR_COLOR = "#F4C35E";
export const DECISION_DECLINE_COLOR = "#F05252";

export const SCORE_BANDS = [
  { min: 90, max: 100, label: "90–100", color: "#7166F2", name: "Purple" },
  { min: 80, max: 89, label: "80–89", color: "#6BE88F", name: "Light green" },
  { min: 72, max: 79, label: "72–79", color: "#55B862", name: "Green" },
  { min: 60, max: 71, label: "60–71", color: "#F4C35E", name: "Amber" },
  { min: 0, max: 59, label: "0–59", color: "#FFFFFF", name: "White" },
] as const;

export function scoreColor(v: number | null | undefined, scale: 100 | 10 = 100): string {
  if (v == null || !Number.isFinite(Number(v))) return "#8796B3";
  const p = scale === 10 ? Number(v) * 10 : Number(v);
  if (p >= 90) return "#7166F2";
  if (p >= 80) return "#6BE88F";
  if (p >= 72) return "#55B862";
  if (p >= 60) return "#F4C35E";
  return "#FFFFFF";
}

/** Contract-until colour per SPEC §1.7: amber if < 24 months left, red if < 12 months. */
export function getContractStatus(contractUntil?: string | null): {
  monthsLeft: number | null;
  color: string;
  label: string;
} {
  if (!contractUntil) return { monthsLeft: null, color: "#E6EDF7", label: "" };
  const target = new Date(contractUntil);
  if (isNaN(target.getTime())) return { monthsLeft: null, color: "#E6EDF7", label: "" };
  const now = new Date();
  const monthsLeft = Math.round(
    (target.getTime() - now.getTime()) / (30.4375 * 24 * 3600 * 1000)
  );
  if (monthsLeft < 0) {
    return { monthsLeft, color: "#F05252", label: "· expired" };
  }
  if (monthsLeft < 12) {
    return { monthsLeft, color: "#F05252", label: `· ${monthsLeft} months` };
  }
  if (monthsLeft < 24) {
    return { monthsLeft, color: "#F4C35E", label: `· ${monthsLeft} months` };
  }
  return { monthsLeft, color: "#E6EDF7", label: `· ${monthsLeft} months` };
}

/** Pillar bar (1-10) -> score (0-100) per SPEC §6.1 */
export const PILLAR_BLOCKS_TO_SCORE: Record<number, number> = {
  1: 15,
  2: 30,
  3: 42,
  4: 52,
  5: 62,
  6: 70,
  7: 78,
  8: 85,
  9: 92,
  10: 98,
};
