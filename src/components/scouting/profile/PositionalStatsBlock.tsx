"use client";

import React, { useState } from "react";
import { X } from "lucide-react";
import { ExpandableCard } from "./ExpandableCard";
import { LEAGUE_AVG_COLOR, SCORE_BANDS, SCORE_ON_TEXT, scoreColor } from "@/lib/scorePalette";

export interface PositionalStatItem {
  key: string;
  label: string;
  shortLabel: string;
  isPct?: boolean;
  invert?: boolean;
  value: number | null;
  playerMinutes: number;
  leagueRank: number | null;
  leagueTotal: number;
  leagueAvg: number | null;
  leagueAvgPercentile: number;
  leaguePercentile: number | null;
  distribution: {
    playerId: string;
    name: string;
    teamName: string;
    value: number;
    percentile: number;
  }[];
}

interface PositionalStatsBlockProps {
  playerId: string;
  playerName: string;
  shortCode: string;
  leagueName: string | null;
  stats: PositionalStatItem[];
  metricMode: "per90" | "totals";
  loading?: boolean;
}

export const PositionalStatsBlock: React.FC<PositionalStatsBlockProps> = ({
  playerId,
  playerName,
  shortCode,
  leagueName,
  stats,
  metricMode,
  loading = false,
}) => {
  const [selectedMetric, setSelectedMetric] = useState<PositionalStatItem | null>(null);

  const displayValue = (v: number | null, isPct?: boolean, mins = 0) => {
    if (v == null) return "—";
    if (isPct) return `${Math.round(v)}%`;
    const scaled = metricMode === "totals" && mins > 0 ? (v * mins) / 90 : v;
    if (metricMode === "totals") return Math.abs(scaled) >= 10 ? Math.round(scaled).toString() : scaled.toFixed(1);
    return Math.abs(scaled) >= 10 ? scaled.toFixed(1) : scaled.toFixed(2);
  };

  const displayLabel = (label: string, isPct?: boolean) => {
    if (metricMode === "totals" && !isPct) {
      return label.replace(/\s*\/90/gi, "");
    }
    return label;
  };

  const renderRows = (compact = true) => (
    <div className="flex flex-col gap-[5px]">
      {stats.map((st) => {
        const pct = st.leaguePercentile ?? 0;
        const col = st.leaguePercentile != null ? scoreColor(pct, 100) : "#5a6884";
        const valText = displayValue(st.value, st.isPct, st.playerMinutes);
        const avgText = displayValue(st.leagueAvg, st.isPct, st.playerMinutes);
        const avgPos = Math.max(4, Math.min(92, st.leagueAvgPercentile ?? 50));

        return (
          <button
            key={st.key}
            type="button"
            onClick={() => setSelectedMetric(st)}
            title="Click to inspect league distribution"
            className="grid grid-cols-[38px_1fr] gap-[9px] items-center text-left group rounded-md hover:bg-white/[0.03] transition-colors p-[1px]"
          >
            {/* 0-100 Score Box */}
            <div
              className="h-[31px] rounded-[7px] flex items-center justify-center font-extrabold text-[15.5px] tabular-nums shrink-0 transition-transform group-hover:scale-[1.03]"
              style={{ backgroundColor: col, color: SCORE_ON_TEXT }}
            >
              {st.leaguePercentile != null ? pct : "—"}
            </div>

            {/* Label + Rank + Bar */}
            <div className="min-w-0">
              <div className="flex justify-between items-baseline text-[11px] mb-[2px]">
                <span className="font-semibold text-[#e6edf7] truncate pr-2 group-hover:text-white">
                  {displayLabel(st.label, st.isPct)}
                </span>
                <span className="text-[#8796b3] text-[10.5px] whitespace-nowrap shrink-0">
                  Rank{" "}
                  <strong className="text-[#e6edf7] font-bold">
                    {st.leagueRank != null ? `#${st.leagueRank}` : "—"}
                  </strong>{" "}
                  / {st.leagueTotal || "—"}
                </span>
              </div>

              <div className="h-[17px] bg-[#1a2640] rounded-[4px] relative">
                {st.leaguePercentile != null && (
                  <div
                    className="absolute inset-y-0 left-0 rounded-[4px] flex items-center pl-[7px] font-bold text-[11px] tabular-nums transition-all duration-300"
                    style={{
                      width: `${Math.max(8, Math.min(100, pct))}%`,
                      backgroundColor: col,
                      color: pct >= 22 ? "#04121f" : "#ffffff",
                    }}
                  >
                    {pct >= 22 ? valText : ""}
                  </div>
                )}
                {st.leaguePercentile != null && pct < 22 && (
                  <span
                    className="absolute inset-y-0 flex items-center font-bold text-[10.5px] text-[#e6edf7] tabular-nums"
                    style={{ left: `calc(${Math.max(8, pct)}% + 6px)` }}
                  >
                    {valText}
                  </span>
                )}

                {/* Pink League Average Marker */}
                {st.leagueAvg != null && (
                  <div
                    className="absolute -top-[3px] -bottom-[3px] w-[3px] shadow-[0_0_0_1px_rgba(0,0,0,0.65)] z-10"
                    style={{ left: `${avgPos}%`, backgroundColor: LEAGUE_AVG_COLOR }}
                  >
                    <span
                      className="absolute -top-[1px] left-[5px] text-[8.5px] font-semibold text-white px-[3px] rounded-[2px] whitespace-nowrap leading-tight"
                      style={{ backgroundColor: `${LEAGUE_AVG_COLOR}dd` }}
                    >
                      Ø {avgText}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </button>
        );
      })}

      {/* Palette Legend */}
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[#8796b3] ${compact ? "mt-1" : "mt-3"}`}>
        {SCORE_BANDS.map((b) => (
          <span key={b.label} className="inline-flex items-center gap-1">
            <i className="w-2.5 h-2.5 rounded-[2px] inline-block" style={{ backgroundColor: b.color }} />
            {b.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <i className="w-[3px] h-2.5 rounded-[1px] inline-block" style={{ backgroundColor: LEAGUE_AVG_COLOR }} />
          League avg
        </span>
      </div>
    </div>
  );

  return (
    <>
      <ExpandableCard
        title="Positional Stats"
        tag={`vs ${shortCode} · ${leagueName || "League"}`}
        tagTone="amber"
        className="flex-none"
        expandedContent={renderRows(false)}
      >
        {loading && stats.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#8796b3] animate-pulse">
            Computing positional percentiles...
          </div>
        ) : stats.length === 0 ? (
          <div className="py-10 text-center text-xs text-[#8796b3]">
            No positional Opta metrics available for this filter.
          </div>
        ) : (
          renderRows(true)
        )}
      </ExpandableCard>

      {/* Distribution Modal on Row Click (SPEC §2 Block 3) */}
      {selectedMetric && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedMetric(null)}
        >
          <div
            className="s1-card w-full max-w-2xl max-h-[82vh] flex flex-col p-5 shadow-2xl border-[#3b6ff5]/40"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#1c2a45] mb-3">
              <div>
                <div className="s1-title text-sm text-[#e6edf7]">
                  {displayLabel(selectedMetric.label, selectedMetric.isPct)} — League Distribution
                </div>
                <div className="text-[11px] text-[#8796b3] mt-0.5">
                  {shortCode} pool in {leagueName || "League"} ({selectedMetric.leagueTotal} players) ·{" "}
                  {playerName}:{" "}
                  <strong className="text-white">
                    {displayValue(selectedMetric.value, selectedMetric.isPct, selectedMetric.playerMinutes)}
                  </strong>{" "}
                  (P{selectedMetric.leaguePercentile ?? "—"}, Rank #{selectedMetric.leagueRank ?? "—"})
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMetric(null)}
                className="w-7 h-7 rounded-md border border-[#1c2a45] bg-[#0b1426] hover:bg-[#1c2a45] text-[#8796b3] hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-1.5 pr-1">
              {selectedMetric.distribution.map((row, idx) => {
                const isMe = row.playerId === playerId;
                const col = scoreColor(row.percentile, 100);
                return (
                  <div
                    key={row.playerId}
                    className={`grid grid-cols-[32px_1fr_70px_38px] items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs ${
                      isMe
                        ? "bg-[#3b6ff5]/20 border border-[#5b8cff]/60"
                        : "bg-[#0b1426]/60 border border-[#1c2a45]/60"
                    }`}
                  >
                    <span className="font-mono text-[11px] text-[#8796b3]">#{idx + 1}</span>
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`truncate ${isMe ? "font-bold text-white" : "font-medium text-[#e6edf7]"}`}>
                          {row.name}
                        </span>
                        <span className="text-[10.5px] text-[#8796b3] truncate">{row.teamName}</span>
                      </div>
                      <div className="h-1.5 w-full bg-[#1a2640] rounded-full mt-1 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.max(4, row.percentile)}%`, backgroundColor: col }}
                        />
                      </div>
                    </div>
                    <span className="font-mono font-bold text-right text-[#e6edf7]">
                      {displayValue(row.value, selectedMetric.isPct, selectedMetric.playerMinutes)}
                    </span>
                    <span
                      className="text-center rounded px-1 py-0.5 font-extrabold text-[11px]"
                      style={{ backgroundColor: col, color: SCORE_ON_TEXT }}
                    >
                      {row.percentile}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
