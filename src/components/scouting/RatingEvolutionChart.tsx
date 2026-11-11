"use client";

import React, { useMemo, useState } from "react";
import { TrendingUp, Calendar, Activity, SlidersHorizontal, Sparkles } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EscudoEquipo } from "./EscudoEquipo";
import { notaTono, type NotaTono } from "@/lib/notaColor";
import { computeRatingTrend } from "@/lib/ratingTrend";

export interface MatchRatingPoint {
  matchId: string;
  date: string;
  opponent?: {
    id?: string;
    name?: string;
    badgeUrl?: string | null;
  };
  competition?: string;
  rating: number | null;
  minutes?: number;
  goals?: number;
  assists?: number;
  isHome?: boolean;
  goalsFor?: number | null;
  goalsAgainst?: number | null;
}

interface RatingEvolutionChartProps {
  matches: MatchRatingPoint[];
  playerName?: string;
}

type TimeRangeOption = "1m" | "3m" | "6m" | "1y" | "all";

export const RatingEvolutionChart: React.FC<RatingEvolutionChartProps> = ({
  matches,
  playerName = "Player",
}) => {
  // Default range: last 3 months as requested
  const [timeRange, setTimeRange] = useState<TimeRangeOption>("3m");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Filter only matches that have a valid rating score
  const matchesWithRating = useMemo(() => {
    return (matches || [])
      .filter((m) => m.rating != null && !isNaN(Number(m.rating)) && m.date)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [matches]);

  // Filter based on selected time range (evaluated from CURRENT DATE: November 2026 / latest date in system)
  const filteredPoints = useMemo(() => {
    if (matchesWithRating.length === 0) return [];
    if (timeRange === "all") return matchesWithRating;

    // Anchor from CURRENT DATE in the system (~ November 2026, or Date.now())
    const anchorDate = new Date(); // Current date
    const cutoffDate = new Date(anchorDate);

    if (timeRange === "1m") cutoffDate.setMonth(cutoffDate.getMonth() - 1);
    else if (timeRange === "3m") cutoffDate.setMonth(cutoffDate.getMonth() - 3);
    else if (timeRange === "6m") cutoffDate.setMonth(cutoffDate.getMonth() - 6);
    else if (timeRange === "1y") cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);

    const result = matchesWithRating.filter((m) => new Date(m.date) >= cutoffDate);
    return result;
  }, [matchesWithRating, timeRange]);

  // Calculate statistics for the filtered range
  const stats = useMemo(() => {
    if (filteredPoints.length === 0) return { avg: null, min: null, max: null, trend: 0 };
    const ratings = filteredPoints.map((p) => Number(p.rating));
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    const min = Math.min(...ratings);
    const max = Math.max(...ratings);

    // Trend: difference between last 3 matches avg and first 3 matches avg
    const head = ratings.slice(0, Math.min(3, ratings.length));
    const tail = ratings.slice(-Math.min(3, ratings.length));
    const headAvg = head.reduce((a, b) => a + b, 0) / head.length;
    const tailAvg = tail.reduce((a, b) => a + b, 0) / tail.length;
    const trend = tailAvg - headAvg;

    return { avg, min, max, trend };
  }, [filteredPoints]);

  if (matchesWithRating.length === 0) {
    return (
      <Card className="bg-[#070e1e]/90 border border-border/60 shadow-xl overflow-hidden">
        <CardHeader className="py-3 px-5 border-b border-border/40">
          <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            Performance Rating Evolution
          </CardTitle>
          <CardDescription className="text-xs">
            Match-by-match Opta performance ratings
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 text-center text-muted-foreground text-xs">
          No match ratings recorded yet for this player.
        </CardContent>
      </Card>
    );
  }

  // SVG dimensions & viewbox
  const width = 800;
  const height = 230;
  const padLeft = 46;
  const padRight = 36;
  const padTop = 32;
  const padBottom = 40;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Scale: rating is 0 to 10. We frame it between 4.0 and 10.0 (or min - 0.5 and 10)
  const minVal = Math.max(0, Math.min(4.5, (stats.min ?? 5) - 0.5));
  const maxVal = 10.0;

  if (filteredPoints.length === 0) {
    return (
      <Card className="bg-[#070e1e]/90 border border-border/60 shadow-2xl overflow-hidden backdrop-blur-md">
        <CardHeader className="py-3 px-5 border-b border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                  Rating Evolution
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-semibold">
                    Match-by-Match
                  </span>
                </CardTitle>
                <CardDescription className="text-[11px] text-muted-foreground mt-0.5">
                  Dynamic Opta ratings curve (scale 0–10) across official appearances
                </CardDescription>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Time Range Pills: 1M, 3M (Default), 6M, 1Y, All */}
            <div className="inline-flex items-center p-0.5 rounded-lg bg-navy-950/80 border border-white/10 text-xs">
              {(
                [
                  { id: "1m", label: "1M" },
                  { id: "3m", label: "3M" },
                  { id: "6m", label: "6M" },
                  { id: "1y", label: "1Y" },
                  { id: "all", label: "All" },
                ] as { id: TimeRangeOption; label: string }[]
              ).map((t) => {
                const active = timeRange === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTimeRange(t.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                      active
                        ? "bg-emerald-500 text-black shadow-sm font-bold"
                        : "text-muted-foreground hover:text-white"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-8 text-center text-muted-foreground text-xs">
          No matches played in the selected time range ({timeRange.toUpperCase()} from current date).
        </CardContent>
      </Card>
    );
  }

  const points = filteredPoints.map((d, i) => {
    const x =
      filteredPoints.length === 1
        ? padLeft + chartW / 2
        : padLeft + (i / (filteredPoints.length - 1)) * chartW;
    const r = Number(d.rating);
    const y = padTop + chartH - ((r - minVal) / (maxVal - minVal)) * chartH;
    return { ...d, ratingNum: r, x, y };
  });

  // Spline Bézier path
  const linePath = points.reduce((acc, pt, i, arr) => {
    if (i === 0) return `M ${pt.x},${pt.y}`;
    const prev = arr[i - 1];
    const cpX = (prev.x + pt.x) / 2;
    return `${acc} C ${cpX},${prev.y} ${cpX},${pt.y} ${pt.x},${pt.y}`;
  }, "");

  // Gradient area fill
  const areaPath = `${linePath} L ${points[points.length - 1].x},${padTop + chartH} L ${points[0].x},${padTop + chartH} Z`;

  // Rating color helper
  // Misma paleta que las notas 0-100 (lib/notaColor), con la nota del partido x10
  const PALETA: Record<NotaTono, [number, number, number]> = {
    purple: [112, 104, 255], mint: [0, 230, 118], green: [0, 200, 83], amber: [255, 179, 0],
    white: [255, 255, 255], nulo: [148, 163, 184],
  };
  const getRatingColor = (val: number) => {
    const [r, g, b] = PALETA[notaTono(Math.round(val * 10))];
    return { stroke: `rgb(${r}, ${g}, ${b})`, fill: `rgba(${r}, ${g}, ${b}, 0.2)`, glow: `rgba(${r}, ${g}, ${b}, 0.6)` };
  };

  const hoveredPoint = hoveredIdx != null ? points[hoveredIdx] : null;

  return (
    <Card className="bg-[#070e1e]/90 border border-border/60 shadow-2xl overflow-hidden backdrop-blur-md">
      {/* Header with Title, Stats and Time Range Selector */}
      <CardHeader className="py-3 px-5 border-b border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                Rating Evolution
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-semibold">
                  Match-by-Match
                </span>
              </CardTitle>
              <CardDescription className="text-[11px] text-muted-foreground mt-0.5">
                Dynamic Opta ratings curve (scale 0–10) across official appearances
              </CardDescription>
            </div>
          </div>
        </div>

        {/* Right side: Summary Badges + Time Range Pills */}
        <div className="flex flex-wrap items-center gap-3">
          {stats.avg != null && (() => {
            const rangeTrend = computeRatingTrend(filteredPoints.map((p) => Number(p.rating)));
            const trendBadgeStyle =
              rangeTrend === "up"
                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                : rangeTrend === "neutral"
                ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                : "bg-rose-500/10 text-rose-300 border-rose-500/20";
            const trendArrow = rangeTrend === "up" ? "↑" : rangeTrend === "neutral" ? "→" : "↓";
            const trendSign = stats.trend >= 0 ? `+${stats.trend.toFixed(1)}` : `${stats.trend.toFixed(1)}`;

            return (
              <div className="flex items-center gap-2 text-xs border-r border-border/50 pr-3 hidden md:flex">
                <span className="text-[11px] text-muted-foreground">Range Avg:</span>
                <span className="font-mono font-black text-emerald-400 text-sm">
                  {stats.avg.toFixed(2)}
                </span>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-1 ${trendBadgeStyle}`}
                >
                  {trendSign} {trendArrow}
                </span>
              </div>
            );
          })()}

          {/* Time Range Pills: 1M, 3M (Default), 6M, 1Y, All */}
          <div className="inline-flex items-center p-0.5 rounded-lg bg-navy-950/80 border border-white/10 text-xs">
            {(
              [
                { id: "1m", label: "1M" },
                { id: "3m", label: "3M" },
                { id: "6m", label: "6M" },
                { id: "1y", label: "1Y" },
                { id: "all", label: "All" },
              ] as { id: TimeRangeOption; label: string }[]
            ).map((t) => {
              const active = timeRange === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTimeRange(t.id)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                    active
                      ? "bg-emerald-500 text-black shadow-sm font-bold"
                      : "text-muted-foreground hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 relative overflow-visible">
        {/* Interactive Hover Card (Floating HUD) */}
        {hoveredPoint && (() => {
          const xPct = (hoveredPoint.x / width) * 100;
          // Si está a la derecha del 80%, alinear hacia la izquierda para que nunca se desborde o corte
          // Si está a la izquierda del 20%, alinear hacia la derecha
          // En medio, centrado normal
          let transformClass = "-translate-x-1/2 -translate-y-full";
          let styleLeft = `${xPct}%`;

          if (xPct > 80) {
            transformClass = "-translate-x-full -translate-y-full";
            styleLeft = `min(${xPct}%, 98%)`;
          } else if (xPct < 20) {
            transformClass = "translate-x-0 -translate-y-full";
            styleLeft = `max(${xPct}%, 2%)`;
          }

          return (
            <div
              className={`absolute z-50 pointer-events-none ${transformClass} transition-all duration-75`}
              style={{
                left: styleLeft,
                top: `${(hoveredPoint.y / height) * 100 - 12}px`,
              }}
            >
              <div className="bg-[#0b1329]/95 border border-emerald-500/50 rounded-xl p-2.5 shadow-[0_12px_28px_rgba(0,0,0,0.85)] backdrop-blur-md min-w-[175px] max-w-[220px] text-xs space-y-1">
                <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1">
                  <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                    {new Date(hoveredPoint.date).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  <span className="font-mono font-black text-emerald-400 text-sm px-1.5 py-0.2 rounded bg-emerald-500/15 shrink-0">
                    {hoveredPoint.ratingNum.toFixed(1)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <EscudoEquipo
                    teamId={hoveredPoint.opponent?.id}
                    badgeUrl={hoveredPoint.opponent?.badgeUrl}
                    name={hoveredPoint.opponent?.name}
                    size={16}
                  />
                  <span className="font-medium text-white truncate text-[11px]" title={hoveredPoint.opponent?.name}>
                    {hoveredPoint.isHome ? "vs" : "@"} {hoveredPoint.opponent?.name || "Opponent"}
                  </span>
                </div>
                {(hoveredPoint.goalsFor != null || hoveredPoint.minutes != null) && (
                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5 font-mono">
                    <span>
                      Score: {hoveredPoint.goalsFor ?? 0} - {hoveredPoint.goalsAgainst ?? 0}
                    </span>
                    <span>{hoveredPoint.minutes ?? 0}&apos; played</span>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Modern Vector SVG Curve */}
        <div className="w-full overflow-hidden">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto overflow-visible select-none"
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <defs>
              {/* Emerald neon gradient for the area */}
              <linearGradient id="ratingAreaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                <stop offset="60%" stopColor="#065f46" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#064e3b" stopOpacity="0.0" />
              </linearGradient>

              {/* Stroke gradient */}
              <linearGradient id="ratingLineGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="50%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#34d399" />
              </linearGradient>

              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Horizontal Grid lines (ratings 5, 6, 7, 8, 9, 10) */}
            {[5, 6, 7, 8, 9, 10].map((val) => {
              const y = padTop + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;
              return (
                <g key={val}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={width - padRight}
                    y2={y}
                    stroke="rgba(255, 255, 255, 0.07)"
                    strokeDasharray={val === 7 ? "4 4" : undefined}
                    strokeWidth="1"
                  />
                  <text
                    x={padLeft - 10}
                    y={y + 3.5}
                    textAnchor="end"
                    fill={val >= 8 ? "#34d399" : val >= 7 ? "#94a3b8" : "#64748b"}
                    fontSize="10"
                    fontFamily="monospace"
                    fontWeight="600"
                  >
                    {val.toFixed(1)}
                  </text>
                </g>
              );
            })}

            {/* Benchmark Reference Line (7.0 = Good performance threshold) */}
            {(() => {
              const yBenchmark = padTop + chartH - ((7.0 - minVal) / (maxVal - minVal)) * chartH;
              return (
                <line
                  x1={padLeft}
                  y1={yBenchmark}
                  x2={width - padRight}
                  y2={yBenchmark}
                  stroke="#10b981"
                  strokeOpacity="0.25"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
              );
            })()}

            {/* Area Fill */}
            <path d={areaPath} fill="url(#ratingAreaGradient)" />

            {/* Main Glowing Curve */}
            <path
              d={linePath}
              fill="none"
              stroke="url(#ratingLineGradient)"
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#glow)"
            />

            {/* Vertical Cursor on Hover */}
            {hoveredPoint && (
              <line
                x1={hoveredPoint.x}
                y1={padTop}
                x2={hoveredPoint.x}
                y2={padTop + chartH}
                stroke="#10b981"
                strokeWidth="1.5"
                strokeDasharray="3 3"
                strokeOpacity="0.6"
              />
            )}

            {/* Interactive Data Points */}
            {points.map((pt, i) => {
              const isHovered = hoveredIdx === i;
              const col = getRatingColor(pt.ratingNum);

              return (
                <g
                  key={pt.matchId}
                  className="cursor-pointer transition-transform"
                  onMouseEnter={() => setHoveredIdx(i)}
                >
                  {/* Invisible Hitbox for smooth hover */}
                  <circle cx={pt.x} cy={pt.y} r="14" fill="transparent" />

                  {/* Pulsing ring on hover */}
                  {isHovered && (
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="8"
                      fill={col.fill}
                      stroke={col.stroke}
                      strokeWidth="1.5"
                      className="animate-ping"
                    />
                  )}

                  {/* Core Point Circle */}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isHovered ? 5.5 : 3.5}
                    fill="#0b1329"
                    stroke={col.stroke}
                    strokeWidth={isHovered ? "2.5" : "2"}
                    filter="drop-shadow(0 2px 4px rgba(0,0,0,0.8))"
                  />

                  {/* Opponent Crest on hover or for notable matches */}
                  {isHovered && pt.opponent?.badgeUrl && (
                    <image
                      href={pt.opponent.badgeUrl}
                      x={pt.x - 7}
                      y={pt.y - 24}
                      width="14"
                      height="14"
                      className="pointer-events-none"
                    />
                  )}
                </g>
              );
            })}

            {/* X-Axis Dates Labels */}
            {points.map((pt, i) => {
              // Show label every N items depending on total points so they do not overlap
              const step = points.length > 20 ? 4 : points.length > 14 ? 3 : points.length > 7 ? 2 : 1;
              const isFirst = i === 0;
              const isLast = i === points.length - 1;
              const shouldShow = isFirst || isLast || i % step === 0;

              if (!shouldShow) return null;

              const d = new Date(pt.date);
              // When "all" or range spans a long time, show both month and year (e.g. "Sep '25", "Feb '26")
              const label =
                timeRange === "all" || timeRange === "1y"
                  ? `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} '${String(d.getFullYear()).slice(-2)}`
                  : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

              return (
                <text
                  key={`label-${i}`}
                  x={pt.x}
                  y={height - padBottom + 18}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="9.5"
                  fontFamily="system-ui, sans-serif"
                  fontWeight="500"
                >
                  {label}
                </text>
              );
            })}
          </svg>
        </div>
      </CardContent>
    </Card>
  );
};

