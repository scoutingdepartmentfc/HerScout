"use client";

import React, { useState } from "react";
import { TrendingUp, Award, Calendar, Shield } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";

export interface MarketValuePoint {
  date: string;
  market_value: number;
  club_name?: string | null;
  club_badge_url?: string | null;
  age?: number | null;
}

interface MarketValueChartProps {
  data: MarketValuePoint[];
  peakValue?: number;
  currentValue?: number;
}

export const MarketValueChart: React.FC<MarketValueChartProps> = ({
  data,
  peakValue,
  currentValue,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <Card className="bg-[#0b1329] border-border/70 shadow-xl overflow-hidden">
        <CardHeader className="py-3.5 px-5 border-b border-border/40">
          <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            Market Value Evolution
          </CardTitle>
          <CardDescription className="text-xs">
            Historical valuation curve (Soccerdonna)
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 text-center text-muted-foreground text-xs">
          No market value history recorded yet.
        </CardContent>
      </Card>
    );
  }

  // Sort ascending by date
  const sorted = [...data].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const values = sorted.map((d) => d.market_value || 0);
  const minVal = 0;
  const maxVal = Math.max(...values, peakValue || 0, 10000) * 1.15; // 15% headroom for badges

  // SVG dimensions & padding
  const width = 640;
  const height = 260;
  const padLeft = 52;
  const padRight = 36;
  const padTop = 44; // Room for club badges on top of peaks
  const padBottom = 42;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const points = sorted.map((d, i) => {
    const x =
      sorted.length === 1
        ? padLeft + chartW / 2
        : padLeft + (i / (sorted.length - 1)) * chartW;
    const y = padTop + chartH - ((d.market_value || 0) - minVal) / (maxVal - minVal) * chartH;
    return { ...d, x, y };
  });

  // Build smooth curve path (Bézier spline)
  const linePath = points.reduce((acc, pt, i, arr) => {
    if (i === 0) return `M ${pt.x},${pt.y}`;
    const prev = arr[i - 1];
    const cpX = (prev.x + pt.x) / 2;
    return `${acc} C ${cpX},${prev.y} ${cpX},${pt.y} ${pt.x},${pt.y}`;
  }, "");

  // Area path closing at the bottom baseline
  const areaPath = `${linePath} L ${points[points.length - 1].x},${padTop + chartH} L ${points[0].x},${padTop + chartH} Z`;

  const fmtVal = (val: number) => {
    if (val >= 1_000_000) {
      return `€${(val / 1_000_000).toFixed(2).replace(/\.00$/, "")}m`;
    }
    if (val >= 1_000) {
      return `€${Math.round(val / 1_000)}k`;
    }
    return `€${val}`;
  };

  const fmtDateShort = (dStr: string) => {
    if (!dStr) return "";
    const [y, m] = dStr.split("-");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const mIdx = parseInt(m, 10) - 1;
    return `${months[mIdx] || m} '${y ? y.slice(2) : ""}`;
  };

  const fmtDateFull = (dStr: string) => {
    try {
      const d = new Date(dStr);
      return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    } catch {
      return dStr;
    }
  };

  const highest = Math.max(...values);
  const activePt = hoveredIdx !== null ? points[hoveredIdx] : points[points.length - 1];

  return (
    <Card className="bg-[#070c18] border-border/80 shadow-2xl overflow-hidden">
      <CardHeader className="py-3 px-5 border-b border-border/40 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            Market Value Evolution
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Historical valuation curve (Soccerdonna verified)
          </CardDescription>
        </div>

        {/* Quick summary stats pills */}
        <div className="flex items-center gap-3">
          {highest > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-400/10 border border-amber-400/30 text-[11px]">
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-muted-foreground">Peak:</span>
              <span className="font-bold font-mono text-amber-300">{fmtVal(highest)}</span>
            </div>
          )}
          {currentValue !== undefined && currentValue > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 border border-primary/30 text-[11px]">
              <span className="text-muted-foreground">Current:</span>
              <span className="font-bold font-mono text-sky-300">{fmtVal(currentValue)}</span>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5">
        {/* SVG Interactive Chart Container */}
        <div className="relative w-full aspect-[2.4/1] min-h-[220px]">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-full overflow-visible select-none"
          >
            <defs>
              {/* Golden amber linear glow gradient for area under curve */}
              <linearGradient id="mvGlowArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.38" />
                <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
              </linearGradient>

              {/* Stroke line gradient */}
              <linearGradient id="mvLineGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#eab308" />
                <stop offset="70%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#fbbf24" />
              </linearGradient>

              {/* Grid line filter */}
              <filter id="shadowFilter" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.5" />
              </filter>
            </defs>

            {/* Horizontal Grid Lines */}
            {[0, 0.33, 0.66, 1].map((pct, idx) => {
              const yVal = padTop + chartH * (1 - pct);
              const gridVal = minVal + (maxVal - minVal) * pct;
              return (
                <g key={`grid-${idx}`}>
                  <line
                    x1={padLeft}
                    y1={yVal}
                    x2={padLeft + chartW}
                    y2={yVal}
                    stroke="rgba(255,255,255,0.07)"
                    strokeDasharray={pct === 0 ? "none" : "3,3"}
                    strokeWidth="1"
                  />
                  <text
                    x={padLeft - 8}
                    y={yVal + 3.5}
                    textAnchor="end"
                    className="text-[9px] fill-muted-foreground/60 font-mono"
                  >
                    {fmtVal(gridVal)}
                  </text>
                </g>
              );
            })}

            {/* Area Fill */}
            <path d={areaPath} fill="url(#mvGlowArea)" />

            {/* Main Spline Curve */}
            <path
              d={linePath}
              fill="none"
              stroke="url(#mvLineGrad)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="filter drop-shadow-[0_2px_8px_rgba(245,158,11,0.45)]"
            />

            {/* Vertical Guide Line on Hover */}
            {hoveredIdx !== null && (
              <line
                x1={points[hoveredIdx].x}
                y1={padTop}
                x2={points[hoveredIdx].x}
                y2={padTop + chartH}
                stroke="rgba(245, 158, 11, 0.45)"
                strokeDasharray="3,3"
                strokeWidth="1.5"
              />
            )}

            {/* Data Points, Badges & Labels */}
            {points.map((pt, i) => {
              const isPeak = pt.market_value === highest && highest > 0;
              const isHovered = hoveredIdx === i;
              const hasBadge = !!pt.club_badge_url;

              return (
                <g
                  key={`pt-${i}`}
                  className="cursor-pointer transition-all duration-150"
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  {/* Subtle date tick at baseline */}
                  <text
                    x={pt.x}
                    y={padTop + chartH + 16}
                    textAnchor="middle"
                    className={`text-[9px] font-mono transition-colors ${
                      isHovered ? "fill-amber-300 font-bold" : "fill-muted-foreground/70"
                    }`}
                  >
                    {fmtDateShort(pt.date)}
                  </text>

                  {/* Club Badge floating right above the data point */}
                  {hasBadge && (
                    <g transform={`translate(${pt.x - 11}, ${pt.y - 28})`} filter="url(#shadowFilter)">
                      <circle
                        cx="11"
                        cy="11"
                        r="11"
                        className={`${
                          isHovered
                            ? "fill-navy-900 stroke-amber-400 stroke-2"
                            : "fill-navy-950 stroke-white/20 stroke-1"
                        } transition-colors`}
                      />
                      <image
                        href={pt.club_badge_url!}
                        x="2"
                        y="2"
                        width="18"
                        height="18"
                        preserveAspectRatio="xMidYMid meet"
                        className="pointer-events-none"
                      />
                    </g>
                  )}

                  {/* Highlight Ring around Peak */}
                  {isPeak && !hasBadge && (
                    <circle
                      cx={pt.x}
                      y={pt.y}
                      r="10"
                      className="fill-amber-400/20 animate-pulse"
                    />
                  )}

                  {/* Central Glow Point */}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isHovered ? "6" : isPeak ? "4.5" : "3.5"}
                    className={`${
                      isHovered
                        ? "fill-white stroke-amber-400 stroke-2"
                        : isPeak
                        ? "fill-amber-400 stroke-white stroke-1"
                        : "fill-amber-400 stroke-navy-950 stroke-1"
                    } transition-all`}
                  />

                  {/* Hit Target Area */}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="16"
                    fill="transparent"
                  />
                </g>
              );
            })}
          </svg>
        </div>

        {/* Dynamic Detail Card Below Chart for the Selected/Latest Point */}
        <div className="mt-3 pt-3 border-t border-border/40 flex flex-wrap items-center justify-between gap-3 text-xs bg-navy-950/60 p-2.5 rounded-lg">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-navy-900 border border-white/20 flex items-center justify-center p-1 shrink-0 overflow-hidden">
              {activePt?.club_badge_url ? (
                <img
                  src={activePt.club_badge_url}
                  alt={activePt.club_name || "Club"}
                  className="w-full h-full object-contain"
                />
              ) : (
                <Shield className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
            <div>
              <div className="font-semibold text-white text-xs leading-none">
                {activePt?.club_name || "Club"}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {fmtDateFull(activePt?.date || "")}
                </span>
                {activePt?.age && <span>· {activePt.age} years old</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Valuation:</span>
            <span className="text-base font-black font-mono text-amber-400 tracking-tight">
              {fmtVal(activePt?.market_value || 0)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
