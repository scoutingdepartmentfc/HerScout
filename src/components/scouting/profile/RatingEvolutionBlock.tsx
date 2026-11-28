"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExpandableCard } from "./ExpandableCard";
import { EscudoEquipo } from "@/components/scouting/EscudoEquipo";
import { scoreColor } from "@/lib/scorePalette";

export interface RatingMatchPoint {
  matchId: string;
  competitionId?: string;
  date: string;
  opponent?: { id?: string; name?: string; badgeUrl?: string | null };
  competition?: string;
  rating: number | null;
  minutes?: number;
  isHome?: boolean;
  goalsFor?: number | null;
  goalsAgainst?: number | null;
}

interface RatingEvolutionBlockProps {
  matches: RatingMatchPoint[];
  selectedCompetition: string;
}

type RangeKey = "1m" | "3m" | "6m" | "1y" | "all";

export const RatingEvolutionBlock: React.FC<RatingEvolutionBlockProps> = ({
  matches,
  selectedCompetition,
}) => {
  const router = useRouter();
  const [range, setRange] = useState<RangeKey>("3m");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const validMatches = useMemo(() => {
    return (matches || [])
      .filter((m) => {
        if (m.rating == null || isNaN(Number(m.rating)) || !m.date) return false;
        if (selectedCompetition !== "all" && m.competitionId && m.competitionId !== selectedCompetition) {
          return false;
        }
        return true;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [matches, selectedCompetition]);

  const { filtered, prevAvg } = useMemo(() => {
    if (!validMatches.length) return { filtered: [], prevAvg: null as number | null };
    if (range === "all") return { filtered: validMatches, prevAvg: null as number | null };

    const now = new Date();
    const cutoff = new Date(now);
    const prevCutoff = new Date(now);
    if (range === "1m") {
      cutoff.setMonth(cutoff.getMonth() - 1);
      prevCutoff.setMonth(prevCutoff.getMonth() - 2);
    } else if (range === "3m") {
      cutoff.setMonth(cutoff.getMonth() - 3);
      prevCutoff.setMonth(prevCutoff.getMonth() - 6);
    } else if (range === "6m") {
      cutoff.setMonth(cutoff.getMonth() - 6);
      prevCutoff.setFullYear(prevCutoff.getFullYear() - 1);
    } else if (range === "1y") {
      cutoff.setFullYear(cutoff.getFullYear() - 1);
      prevCutoff.setFullYear(prevCutoff.getFullYear() - 2);
    }

    const cur = validMatches.filter((m) => new Date(m.date) >= cutoff);
    const prev = validMatches.filter((m) => {
      const d = new Date(m.date);
      return d >= prevCutoff && d < cutoff;
    });

    const pAvg =
      prev.length > 0
        ? prev.reduce((acc, m) => acc + Number(m.rating), 0) / prev.length
        : null;

    return { filtered: cur, prevAvg: pAvg };
  }, [validMatches, range]);

  const rangeAvg = useMemo(() => {
    if (!filtered.length) return null;
    return filtered.reduce((acc, m) => acc + Number(m.rating), 0) / filtered.length;
  }, [filtered]);

  const delta = rangeAvg != null && prevAvg != null ? rangeAvg - prevAvg : null;

  const renderChart = (W = 900, H = 152) => {
    if (filtered.length === 0) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-xs text-[#8796b3]">
          <span>No rated matches in the last {range.toUpperCase()}.</span>
          {validMatches.length > 0 && range !== "all" && (
            <button
              type="button"
              onClick={() => setRange("all")}
              className="text-[11px] font-semibold text-[#5b8cff] hover:underline"
            >
              Show all {validMatches.length} matches
            </button>
          )}
        </div>
      );
    }

    const pl = 34;
    const pr = 12;
    const pt = 10;
    const pb = 22;
    const cw = W - pl - pr;
    const ch = H - pt - pb;

    const minY = Math.max(0, Math.min(5, Math.floor(Math.min(...filtered.map((m) => Number(m.rating))) - 0.5)));
    const maxY = 10;

    const pts = filtered.map((m, i) => {
      const x = filtered.length === 1 ? pl + cw / 2 : pl + (i / (filtered.length - 1)) * cw;
      const r = Number(m.rating);
      const y = pt + ((maxY - r) / (maxY - minY)) * ch;
      return { ...m, r, x, y };
    });

    let path = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const cx = (pts[i - 1].x + pts[i].x) / 2;
      path += ` C${cx},${pts[i - 1].y} ${cx},${pts[i].y} ${pts[i].x},${pts[i].y}`;
    }
    const areaPath = `${path} L${pts[pts.length - 1].x},${pt + ch} L${pts[0].x},${pt + ch} Z`;
    const avgY = rangeAvg != null ? pt + ((maxY - rangeAvg) / (maxY - minY)) * ch : null;
    const hovered = hoveredIdx != null ? pts[hoveredIdx] : null;

    const gridTicks = [10, 9, 8, 7, 6, 5].filter((v) => v >= minY);
    const labelStep = pts.length > 18 ? 4 : pts.length > 10 ? 2 : 1;

    return (
      <div className="relative flex-1 min-h-0 w-full">
        {hovered && (
          <div
            className="absolute z-30 pointer-events-none -translate-x-1/2 -translate-y-full bg-[#0b1329]/95 border border-[#34d399]/50 rounded-lg px-2.5 py-1.5 shadow-xl text-[11px] min-w-[165px]"
            style={{
              left: `${Math.max(12, Math.min(88, (hovered.x / W) * 100))}%`,
              top: `${Math.max(20, (hovered.y / H) * 100)}%`,
            }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-0.5 mb-1">
              <span className="text-[10px] text-[#8796b3] font-mono">
                {new Date(hovered.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" })}
              </span>
              <span className="font-mono font-extrabold text-xs" style={{ color: scoreColor(hovered.r, 10) }}>
                {hovered.r.toFixed(1)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-white font-medium truncate">
              <EscudoEquipo teamId={hovered.opponent?.id} badgeUrl={hovered.opponent?.badgeUrl} name={hovered.opponent?.name} size={14} />
              <span className="truncate">{hovered.isHome ? "vs" : "@"} {hovered.opponent?.name || "Opponent"}</span>
            </div>
            <div className="text-[10px] text-[#8796b3] font-mono mt-0.5">
              {hovered.goalsFor ?? "-"}–{hovered.goalsAgainst ?? "-"} · {hovered.minutes ?? 0}&apos;
            </div>
          </div>
        )}

        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-full select-none overflow-visible"
          onMouseLeave={() => setHoveredIdx(null)}
        >
          <defs>
            <linearGradient id="s1RatingGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
            </linearGradient>
          </defs>

          {gridTicks.map((v) => {
            const y = pt + ((maxY - v) / (maxY - minY)) * ch;
            return (
              <g key={v}>
                <line x1={pl} x2={W - pr} y1={y} y2={y} stroke="#1c2a45" strokeDasharray="3 4" />
                <text x={4} y={y + 3.5} fill="#8796b3" fontSize={10} fontFamily="monospace">
                  {v.toFixed(1)}
                </text>
              </g>
            );
          })}

          {avgY != null && rangeAvg != null && (
            <>
              <line x1={pl} x2={W - pr} y1={avgY} y2={avgY} stroke="#34d399" strokeDasharray="6 4" opacity={0.65} />
              <text x={W - pr - 52} y={avgY - 4} fill="#34d399" fontSize={10} fontWeight={600}>
                avg {rangeAvg.toFixed(2)}
              </text>
            </>
          )}

          <path d={areaPath} fill="url(#s1RatingGrad)" />
          <path d={path} fill="none" stroke="#34d399" strokeWidth={2.2} strokeLinecap="round" />

          {pts.map((p, i) => (
            <g
              key={p.matchId}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredIdx(i)}
              onClick={() => router.push(`/matches?matchId=${p.matchId}`)}
            >
              <circle cx={p.x} cy={p.y} r={10} fill="transparent" />
              <circle
                cx={p.x}
                cy={p.y}
                r={hoveredIdx === i ? 5.5 : 4}
                fill="#0d172a"
                stroke={scoreColor(p.r, 10)}
                strokeWidth={2.2}
              />
            </g>
          ))}

          {pts.map((p, i) => {
            const isFirst = i === 0;
            const isLast = i === pts.length - 1;
            if (!isFirst && !isLast && i % labelStep !== 0) return null;
            return (
              <text
                key={`dt-${p.matchId}`}
                x={p.x}
                y={H - 4}
                fill="#8796b3"
                fontSize={10}
                textAnchor={isFirst ? "start" : isLast ? "end" : "middle"}
              >
                {new Date(p.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </text>
            );
          })}
        </svg>
      </div>
    );
  };

  const controls = (
    <div className="flex items-center gap-2.5">
      {rangeAvg != null && (
        <span className="text-[11px] text-[#8796b3] hidden sm:inline">
          Range avg:{" "}
          <strong className="font-mono text-[12.5px]" style={{ color: scoreColor(rangeAvg, 10) }}>
            {rangeAvg.toFixed(2)}
          </strong>
          {delta != null && (
            <span
              className="ml-1 text-[10.5px] font-semibold"
              style={{ color: delta >= 0 ? "#34d399" : "#f05252" }}
            >
              {delta >= 0 ? `+${delta.toFixed(1)} ↑` : `${delta.toFixed(1)} ↓`}
            </span>
          )}
        </span>
      )}
      <div className="inline-flex border border-[#1c2a45] rounded-[6px] overflow-hidden text-[10.5px]">
        {(["1m", "3m", "6m", "1y", "all"] as RangeKey[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setRange(k)}
            className={`px-2 py-[2px] uppercase font-semibold transition-colors ${
              range === k ? "bg-[#34d399] text-[#04210f] font-bold" : "text-[#8796b3] hover:text-white"
            }`}
          >
            {k === "all" ? "All" : k}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <ExpandableCard
      title="Rating Evolution"
      tag="Match-by-match"
      tagTone="green"
      headerRight={controls}
      className="flex-none fit:h-[205px] land:h-auto land:flex-1 land:min-h-[150px]"
      expandedContent={<div className="h-[360px] flex flex-col">{renderChart(900, 320)}</div>}
    >
      {renderChart(900, 148)}
    </ExpandableCard>
  );
};
