"use client";

import React, { useState } from "react";
import { ExpandableCard } from "./ExpandableCard";
import { LogoLiga } from "@/components/scouting/LogoLiga";
import { SCORE_ON_TEXT, scoreColor } from "@/lib/scorePalette";

export interface SeasonCompRow {
  id: string;
  competitionId: string;
  competitionName: string;
  competitionLogoUrl?: string | null;
  apps: number;
  starts: number;
  goals: number;
  assists: number;
  xg: number;
  yellowCards: number;
  passPct: number | null;
  minutes: number;
  rating: number | null;
}

interface SeasonStatsBlockProps {
  seasonLabel: string;
  rows: SeasonCompRow[];
  selectedCompetition: string;
  globalMetricMode: "per90" | "totals";
}

export const SeasonStatsBlock: React.FC<SeasonStatsBlockProps> = ({
  seasonLabel,
  rows,
  selectedCompetition,
  globalMetricMode,
}) => {
  const [localMode, setLocalMode] = useState<"comp" | "per90">(
    globalMetricMode === "per90" ? "comp" : "comp"
  );

  // Sync if user toggles Global Metric to Per 90' / Totals, while allowing local override
  const isPer90 = localMode === "per90";

  const filteredRows =
    selectedCompetition !== "all"
      ? rows.filter((r) => r.competitionId === selectedCompetition)
      : rows;

  const totals = filteredRows.reduce(
    (acc, r) => {
      acc.apps += r.apps;
      acc.starts += r.starts;
      acc.goals += r.goals;
      acc.assists += r.assists;
      acc.xg += r.xg;
      acc.yel += r.yellowCards;
      acc.minutes += r.minutes;
      if (r.passPct != null && r.minutes > 0) {
        acc.passWeighted += r.passPct * r.minutes;
        acc.passMinutes += r.minutes;
      }
      if (r.rating != null && r.minutes > 0) {
        acc.ratingWeighted += r.rating * r.minutes;
        acc.ratingMinutes += r.minutes;
      }
      return acc;
    },
    { apps: 0, starts: 0, goals: 0, assists: 0, xg: 0, yel: 0, minutes: 0, passWeighted: 0, passMinutes: 0, ratingWeighted: 0, ratingMinutes: 0 }
  );

  const totalPassPct = totals.passMinutes > 0 ? Math.round(totals.passWeighted / totals.passMinutes) : null;
  const totalRating = totals.ratingMinutes > 0 ? totals.ratingWeighted / totals.ratingMinutes : null;

  const fmtStat = (val: number, mins: number, decimals = 0) => {
    if (!isPer90) return decimals > 0 ? val.toFixed(decimals) : String(val);
    if (mins <= 0) return "—";
    return ((val * 90) / mins).toFixed(2);
  };

  const renderTable = () => (
    <table className="w-full border-collapse text-[11.5px] tabular-nums">
      <thead>
        <tr className="text-[9.5px] text-[#8796b3] uppercase tracking-[0.05em] border-b border-[#1c2a45]">
          <th className="text-left font-semibold py-1 px-1.5">Competition</th>
          <th className="text-right font-semibold py-1 px-1.5">Apps (sq.)</th>
          <th className="text-right font-semibold py-1 px-1.5">Gls</th>
          <th className="text-right font-semibold py-1 px-1.5">Ast</th>
          <th className="text-right font-semibold py-1 px-1.5">xG</th>
          <th className="text-right font-semibold py-1 px-1.5">Yel</th>
          <th className="text-right font-semibold py-1 px-1.5">Pass %</th>
          <th className="text-right font-semibold py-1 px-1.5">Min</th>
          <th className="text-right font-semibold py-1 px-1.5">Rating</th>
        </tr>
      </thead>
      <tbody>
        {filteredRows.map((r) => {
          const rtColor = r.rating != null ? scoreColor(r.rating, 10) : null;
          return (
            <tr key={r.id} className="border-b border-[#16223a] hover:bg-white/[0.02]">
              <td className="py-[5px] px-1.5 text-left">
                <span className="inline-flex items-center gap-1.5 text-[#e6edf7] font-medium">
                  <LogoLiga
                    competitionId={r.competitionId}
                    competitionName={r.competitionName}
                    logoUrl={r.competitionLogoUrl}
                    size={16}
                    whiteBg={false}
                  />
                  <span className="truncate max-w-[170px]">{r.competitionName}</span>
                </span>
              </td>
              <td className="py-[5px] px-1.5 text-right text-[#e6edf7]">
                {r.apps} <span className="text-[#5a6884]">({r.starts})</span>
              </td>
              <td className="py-[5px] px-1.5 text-right text-[#e6edf7]">
                {fmtStat(r.goals, r.minutes)}
              </td>
              <td className="py-[5px] px-1.5 text-right text-[#e6edf7]">
                {fmtStat(r.assists, r.minutes)}
              </td>
              <td className="py-[5px] px-1.5 text-right text-[#e6edf7]">
                {fmtStat(r.xg, r.minutes, 1)}
              </td>
              <td className="py-[5px] px-1.5 text-right text-[#e6edf7]">
                {fmtStat(r.yellowCards, r.minutes)}
              </td>
              <td className="py-[5px] px-1.5 text-right text-[#e6edf7]">
                {r.passPct != null ? `${r.passPct}%` : "—"}
              </td>
              <td className="py-[5px] px-1.5 text-right text-[#e6edf7]">{r.minutes}&apos;</td>
              <td className="py-[5px] px-1.5 text-right">
                {r.rating != null && rtColor ? (
                  <span
                    className="inline-block min-w-[36px] text-center rounded-[4px] px-1.5 py-[1px] font-extrabold"
                    style={{ backgroundColor: rtColor, color: SCORE_ON_TEXT }}
                  >
                    {r.rating.toFixed(2)}
                  </span>
                ) : (
                  <span className="text-[#5a6884]">—</span>
                )}
              </td>
            </tr>
          );
        })}

        {filteredRows.length > 0 && (
          <tr className="border-t border-[#1c2a45] bg-white/[0.025] font-bold">
            <td className="py-[5px] px-1.5 text-left text-[#e6edf7]">Total</td>
            <td className="py-[5px] px-1.5 text-right text-[#e6edf7]">
              {totals.apps} <span className="text-[#5a6884] font-normal">({totals.starts})</span>
            </td>
            <td className="py-[5px] px-1.5 text-right text-[#e6edf7]">
              {fmtStat(totals.goals, totals.minutes)}
            </td>
            <td className="py-[5px] px-1.5 text-right text-[#e6edf7]">
              {fmtStat(totals.assists, totals.minutes)}
            </td>
            <td className="py-[5px] px-1.5 text-right text-[#e6edf7]">
              {fmtStat(totals.xg, totals.minutes, 1)}
            </td>
            <td className="py-[5px] px-1.5 text-right text-[#e6edf7]">
              {fmtStat(totals.yel, totals.minutes)}
            </td>
            <td className="py-[5px] px-1.5 text-right text-[#e6edf7]">
              {totalPassPct != null ? `${totalPassPct}%` : "—"}
            </td>
            <td className="py-[5px] px-1.5 text-right text-[#e6edf7]">{totals.minutes}&apos;</td>
            <td className="py-[5px] px-1.5 text-right">
              {totalRating != null ? (
                <span
                  className="inline-block min-w-[36px] text-center rounded-[4px] px-1.5 py-[1px] font-extrabold"
                  style={{ backgroundColor: scoreColor(totalRating, 10), color: SCORE_ON_TEXT }}
                >
                  {totalRating.toFixed(2)}
                </span>
              ) : (
                <span className="text-[#5a6884]">—</span>
              )}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );

  const toggle = (
    <div className="inline-flex border border-[#1c2a45] rounded-[6px] overflow-hidden text-[10.5px]">
      <button
        type="button"
        onClick={() => setLocalMode("comp")}
        className={`px-2 py-[2px] font-semibold transition-colors ${
          localMode === "comp" ? "bg-[#34d399] text-[#04210f] font-bold" : "text-[#8796b3] hover:text-white"
        }`}
      >
        By comp.
      </button>
      <button
        type="button"
        onClick={() => setLocalMode("per90")}
        className={`px-2 py-[2px] font-semibold transition-colors ${
          localMode === "per90" ? "bg-[#34d399] text-[#04210f] font-bold" : "text-[#8796b3] hover:text-white"
        }`}
      >
        Per 90&apos;
      </button>
    </div>
  );

  return (
    <ExpandableCard
      title={`Season Stats · ${seasonLabel}`}
      headerRight={toggle}
      className="flex-none"
      expandedContent={renderTable()}
    >
      {filteredRows.length === 0 ? (
        <div className="py-6 text-center text-xs text-[#8796b3]">
          No season stats for the selected filter.
        </div>
      ) : (
        <div className="overflow-x-auto">{renderTable()}</div>
      )}
    </ExpandableCard>
  );
};
