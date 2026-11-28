"use client";

import React from "react";
import { ExpandableCard } from "./ExpandableCard";
import { scoreColor } from "@/lib/scorePalette";
import { PositionalStatItem } from "./PositionalStatsBlock";

interface PositionalRadarBlockProps {
  playerName: string;
  shortCode: string;
  leagueName: string | null;
  stats: PositionalStatItem[];
  comparePlayer: { id: string; name: string; percentiles: (number | null)[] } | null;
  compareCandidates: { id: string; name: string; teamName: string }[];
  selectedCompareId: string;
  onSelectCompareId: (id: string) => void;
  loading?: boolean;
}

export const PositionalRadarBlock: React.FC<PositionalRadarBlockProps> = ({
  playerName,
  shortCode,
  leagueName,
  stats,
  comparePlayer,
  compareCandidates,
  selectedCompareId,
  onSelectCompareId,
  loading = false,
}) => {
  const renderSvg = (width = 476, height = 340, R = 122) => {
    const n = stats.length;
    if (n === 0) return null;
    const cx = width / 2;
    const cy = height / 2 + 4;
    const pt = (i: number, r: number): [number, number] => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    };

    const playerPts = stats
      .map((s, i) => pt(i, (R * (s.leaguePercentile ?? 0)) / 100).join(","))
      .join(" ");

    const avgPts = stats
      .map((s, i) => pt(i, (R * (s.leagueAvgPercentile ?? 50)) / 100).join(","))
      .join(" ");

    const cmpPts =
      comparePlayer && comparePlayer.percentiles.length === n
        ? comparePlayer.percentiles.map((v, i) => pt(i, (R * (v ?? 0)) / 100).join(",")).join(" ")
        : null;

    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full max-h-[340px] select-none"
      >
        {/* Concentric grid polygons */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <polygon
            key={f}
            points={stats.map((_, i) => pt(i, R * f).join(",")).join(" ")}
            fill="none"
            stroke="#1f2e4d"
            strokeWidth={1}
          />
        ))}

        {/* Radial spokes + Axis labels + Pxx */}
        {stats.map((s, i) => {
          const [x, y] = pt(i, R);
          const [tx, ty] = pt(i, R + 26);
          const pct = s.leaguePercentile;
          const pctColor = pct != null ? scoreColor(pct, 100) : "#8796b3";
          return (
            <g key={s.key}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke="#1f2e4d" strokeWidth={1} />
              <text
                x={tx}
                y={ty - 3}
                fill="#c8d3e6"
                fontSize={11}
                fontWeight={600}
                textAnchor="middle"
              >
                {s.shortLabel}
              </text>
              <text
                x={tx}
                y={ty + 10}
                fill={pctColor}
                fontSize={10.5}
                fontWeight={700}
                textAnchor="middle"
              >
                {pct != null ? `P${pct}` : "—"}
              </text>
            </g>
          );
        })}

        {/* Position average in league (dashed white) */}
        <polygon
          points={avgPts}
          fill="none"
          stroke="#ffffff"
          strokeWidth={1.2}
          strokeDasharray="4 3"
          opacity={0.7}
        />

        {/* Optional comparison player (amber) */}
        {cmpPts && (
          <polygon
            points={cmpPts}
            fill="#f5b94218"
            stroke="#f5b942"
            strokeWidth={1.5}
            opacity={0.85}
          />
        )}

        {/* Target Player (blue filled) */}
        <polygon
          points={playerPts}
          fill="#5b8cff33"
          stroke="#5b8cff"
          strokeWidth={2}
        />
        {stats.map((s, i) => {
          const [x, y] = pt(i, (R * (s.leaguePercentile ?? 0)) / 100);
          return (
            <circle
              key={`dot-${s.key}`}
              cx={x}
              cy={y}
              r={3.5}
              fill="#5b8cff"
              stroke="#ffffff"
              strokeWidth={1.2}
            />
          );
        })}
      </svg>
    );
  };

  const legend = (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-[#8796b3] mt-1 shrink-0">
      <span className="inline-flex items-center gap-1.5 text-[#e6edf7]">
        <i className="w-2.5 h-2.5 rounded-[2px] inline-block bg-[#5b8cff]" />
        {playerName}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className="w-2.5 h-2.5 rounded-[2px] inline-block border border-dashed border-white" />
        {shortCode} avg {leagueName ? leagueName.split(" ").slice(0, 2).join(" ") : "League"}
      </span>
      <label className="inline-flex items-center gap-1.5">
        <i className="w-2.5 h-2.5 rounded-[2px] inline-block bg-[#f5b942]" />
        <select
          value={selectedCompareId}
          onChange={(e) => onSelectCompareId(e.target.value)}
          className="bg-[#0b1426] border border-[#1c2a45] rounded px-1.5 py-0.5 text-[10px] text-[#e6edf7] focus:outline-none focus:border-[#f5b942] max-w-[145px]"
        >
          <option value="">Compare with… (optional)</option>
          {compareCandidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.teamName})
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  return (
    <ExpandableCard
      title="Positional radar"
      tag="Percentile"
      tagTone="blue"
      className="flex-none fit:h-[404px] land:h-auto land:flex-1 land:min-h-[300px]"
      expandedContent={
        <div className="flex flex-col items-center justify-center py-4">
          <div className="w-full max-w-[600px]">{renderSvg(560, 420, 155)}</div>
          {legend}
        </div>
      }
    >
      {loading && stats.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-[#8796b3] animate-pulse">
          Loading positional radar...
        </div>
      ) : stats.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-[#8796b3]">
          No percentile radar data available.
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col justify-between items-center">
          <div className="flex-1 min-h-0 w-full flex items-center justify-center">
            {renderSvg(476, 332, 118)}
          </div>
          {legend}
        </div>
      )}
    </ExpandableCard>
  );
};
