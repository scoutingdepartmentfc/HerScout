"use client";

import React from "react";
import { Star } from "lucide-react";
import { scoreColor, SCORE_ON_TEXT } from "@/lib/scorePalette";
import { clampStars, tapRatingBlock } from "@/lib/matchReportLogic";
import type { Tri } from "./types";

/** 10-block bar: tap = whole point, tap again = .5 (SPEC §5.3). */
export function RatingBar({
  value,
  onChange,
  size = "lg",
}: {
  value: number | null;
  onChange: (v: number) => void;
  size?: "lg" | "sm";
}) {
  const color = value != null ? scoreColor(value, 10) : "#1a2640";
  const lg = size === "lg";
  return (
    <div className={`flex ${lg ? "gap-1.5" : "gap-[3px]"}`} role="group" aria-label="Match rating">
      {Array.from({ length: 10 }, (_, i) => {
        const block = i + 1;
        const full = value != null && value >= block;
        const half = value != null && value === block - 0.5;
        return (
          <button
            key={block}
            type="button"
            tabIndex={-1}
            onClick={() => onChange(tapRatingBlock(value, block))}
            className={`relative overflow-hidden ${lg ? "h-10 flex-1 min-w-[26px] rounded-[6px] text-[12px] font-bold" : "h-[18px] w-[11px] rounded-[2px]"} border border-[#1c2a45] bg-[#111b30] text-[#5a6884] transition-colors hover:border-[#5b8cff]`}
            title={`${block}`}
          >
            {(full || half) && (
              <span className="absolute inset-y-0 left-0" style={{ width: full ? "100%" : "50%", backgroundColor: color }} />
            )}
            {lg && <span className="relative" style={{ color: full ? SCORE_ON_TEXT : undefined }}>{block}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Score chip for /10 values. */
export function ScoreChip({ value, className = "" }: { value: number | null | undefined; className?: string }) {
  if (value == null) return <span className={`text-[#5a6884] ${className}`}>—</span>;
  return (
    <span
      className={`inline-block rounded-[4px] px-1.5 font-extrabold tabular-nums ${className}`}
      style={{ backgroundColor: scoreColor(value, 10), color: SCORE_ON_TEXT }}
    >
      {Number(value).toFixed(1)}
    </span>
  );
}

/** Read-only or interactive 0.5–5 stars. */
export function Stars({
  value,
  onChange,
  tone = "now",
  size = 18,
}: {
  value: number | null;
  onChange?: (v: number) => void;
  tone?: "now" | "potential";
  size?: number;
}) {
  const fill = tone === "now" ? "#F4C35E" : "#8f87ff";
  return (
    <span className="inline-flex items-center gap-[2px]">
      {Array.from({ length: 5 }, (_, i) => {
        const n = i + 1;
        const portion = value == null ? 0 : value >= n ? 1 : value >= n - 0.5 ? 0.5 : 0;
        const Comp = onChange ? "button" : "span";
        return (
          <Comp
            key={n}
            {...(onChange
              ? {
                  type: "button" as const,
                  tabIndex: -1,
                  title: `${n - 0.5} / ${n}`,
                  onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const leftHalf = e.clientX - rect.left < rect.width / 2;
                    onChange(clampStars(leftHalf ? n - 0.5 : n));
                  },
                }
              : {})}
            className="relative inline-block"
            style={{ width: size, height: size }}
          >
            <Star className="absolute inset-0 text-[#2a3756]" style={{ width: size, height: size }} fill="#2a3756" />
            {portion > 0 && (
              <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: portion === 1 ? size : size / 2 }}>
                <Star style={{ width: size, height: size, color: fill }} fill={fill} />
              </span>
            )}
          </Comp>
        );
      })}
    </span>
  );
}

export function StarsAdjust({
  value,
  onChange,
  tone,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  tone: "now" | "potential";
}) {
  const step = (d: number) => onChange(clampStars((value ?? 2.5) + d));
  const btn =
    "h-6 min-w-[30px] px-1 rounded-[5px] border border-[#22304d] bg-[#0b1426] text-[11px] font-bold text-[#c8d3e6] hover:border-[#5b8cff]";
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Stars value={value} onChange={onChange} tone={tone} size={20} />
      <button type="button" tabIndex={-1} className={btn} onClick={() => step(-0.5)}>
        −½
      </button>
      <button type="button" tabIndex={-1} className={btn} onClick={() => step(0.5)}>
        +½
      </button>
    </div>
  );
}

/** ▲ Better / = Same / ▼ Worse */
export function TriToggle({
  value,
  onChange,
  compact = false,
}: {
  value: Tri | undefined;
  onChange: (v: Tri | undefined) => void;
  compact?: boolean;
}) {
  const opts: { v: Tri; label: string; on: string }[] = [
    { v: 1, label: compact ? "▲" : "▲ Better", on: "border-[#34d399] bg-[#34d399]/15 text-[#6BE88F]" },
    { v: 0, label: compact ? "=" : "= Same", on: "border-[#c8d3e6] bg-white/10 text-white" },
    { v: -1, label: compact ? "▼" : "▼ Worse", on: "border-[#f05252] bg-[#f05252]/15 text-[#ff8a8a]" },
  ];
  return (
    <div className={`grid grid-cols-3 ${compact ? "gap-1" : "gap-1.5"}`}>
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          tabIndex={-1}
          onClick={() => onChange(value === o.v ? undefined : o.v)}
          className={`rounded-[6px] border font-semibold transition-colors ${compact ? "h-6 w-7 text-[10px]" : "h-8 text-[11.5px]"} ${
            value === o.v ? o.on : "border-[#22304d] text-[#5a6884] hover:text-[#c8d3e6]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Section({
  title,
  hint,
  right,
  children,
  accent = false,
  className = "",
}: {
  title: string;
  hint?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[10px] border px-3.5 py-3 ${accent ? "border-[#f5b942]/40 bg-[#14182a]" : "border-[#1c2a45] bg-[#0d1628]"} ${className}`}
    >
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <b className={`s1-title text-[11.5px] ${accent ? "text-[#f5b942]" : "text-[#e6edf7]"}`}>{title}</b>
        {hint && <span className="text-[10.5px] text-[#5a6884]">{hint}</span>}
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </section>
  );
}

export function AutoBadge({ label = "AUTO" }: { label?: string }) {
  return (
    <span className="text-[9px] font-extrabold tracking-[0.06em] text-[#5b8cff] border border-[#5b8cff44] rounded-[4px] px-[5px] py-[1px]">
      {label}
    </span>
  );
}
