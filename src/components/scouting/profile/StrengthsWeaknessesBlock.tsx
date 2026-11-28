"use client";

import React from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { ExpandableCard } from "./ExpandableCard";
import { PositionalStatItem } from "./PositionalStatsBlock";
import { scoreColor, SCORE_ON_TEXT } from "@/lib/scorePalette";

interface Props {
  stats: PositionalStatItem[];
  metricMode: "per90" | "totals";
  loading?: boolean;
  /** How many metrics per side */
  count?: number;
}

/** Top and bottom positional metrics by league percentile, as two columns of chips. */
export const StrengthsWeaknessesBlock: React.FC<Props> = ({ stats, metricMode, loading = false, count = 3 }) => {
  const ranked = stats
    .filter((s) => s.leaguePercentile != null)
    .sort((a, b) => (b.leaguePercentile as number) - (a.leaguePercentile as number));

  const n = Math.min(count, Math.floor(ranked.length / 2));
  const strengths = ranked.slice(0, n);
  const weaknesses = ranked.slice(-n).reverse();

  const label = (st: PositionalStatItem) =>
    metricMode === "totals" && !st.isPct ? st.label.replace(/\s*\/90/gi, "") : st.label;

  const renderList = (items: PositionalStatItem[], tone: "good" | "bad", full: boolean) => (
    <div className="flex flex-col gap-1 min-w-0">
      <div
        className={`flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.08em] ${
          tone === "good" ? "text-[#34d399]" : "text-[#ff8a8a]"
        }`}
      >
        {tone === "good" ? <ThumbsUp className="w-3 h-3" /> : <ThumbsDown className="w-3 h-3" />}
        {tone === "good" ? "Strengths" : "Weaknesses"}
      </div>
      {items.map((st) => {
        const pct = st.leaguePercentile as number;
        return (
          <div
            key={st.key}
            title={`${st.label}: percentile ${pct} · rank #${st.leagueRank ?? "—"} / ${st.leagueTotal || "—"}`}
            className={`flex items-center gap-1.5 min-w-0 rounded-[6px] border px-1.5 py-[3px] ${
              tone === "good" ? "border-[#34d399]/30 bg-[#34d399]/[0.07]" : "border-[#f05252]/30 bg-[#f05252]/[0.07]"
            }`}
          >
            <span
              className="shrink-0 min-w-[26px] text-center rounded-[4px] text-[11px] font-extrabold tabular-nums px-1 leading-[18px]"
              style={{ backgroundColor: scoreColor(pct, 100), color: SCORE_ON_TEXT }}
            >
              {pct}
            </span>
            <span className={`text-[10.5px] font-semibold text-[#e6edf7] leading-tight ${full ? "" : "truncate"}`}>
              {label(st)}
            </span>
          </div>
        );
      })}
    </div>
  );

  const body = (full: boolean) =>
    loading && stats.length === 0 ? (
      <div className="py-4 text-center text-xs text-[#8796b3] animate-pulse">Computing...</div>
    ) : n === 0 ? (
      <div className="py-4 text-center text-xs text-[#8796b3]">Not enough positional metrics for this filter.</div>
    ) : (
      <div className="grid grid-cols-2 gap-2">
        {renderList(strengths, "good", full)}
        {renderList(weaknesses, "bad", full)}
      </div>
    );

  return (
    <ExpandableCard
      title="Strengths & Weaknesses"
      tag="vs league"
      tagTone="purple"
      className="flex-none"
      hideExpand
    >
      {body(false)}
    </ExpandableCard>
  );
};
