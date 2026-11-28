"use client";

import React from "react";
import { ExpandableCard } from "./ExpandableCard";
import { scoreColor, SCORE_ON_TEXT } from "@/lib/scorePalette";
import { Stars } from "@/components/matchReport/controls";

// S1 block 13 — Scouting history (SPEC §2, §6.10): who · when · where · context.

export interface ScoutingHistoryData {
  views: number;
  scouts: number;
  since: string | null;
  whoHasSeen: {
    scoutId: string;
    scoutName: string;
    times: number;
    live: number;
    video: number;
    last: string;
    avgRating: number | null;
    stars: { now: number | null; potential: number | null } | null;
  }[];
  lastMatches: {
    id: string;
    matchId: string;
    date: string;
    home: string;
    away: string;
    venue: string | null;
    mode: "live" | "video";
    ownTier: string | null;
    opponentTier: string | null;
    tierDiff: number | null;
    scoutName: string;
    matchRating: number | null;
  }[];
  context: { bucket: "stronger" | "same" | "weaker"; count: number; avgScout: number | null; avgOpta: number | null }[];
  positionsSeen: { key: string; count: number }[];
  systemsSeen: { key: string; count: number }[];
}

const d2 = (s?: string | null, year = false) =>
  s ? new Date(s).toLocaleDateString("en-GB", year ? { day: "2-digit", month: "2-digit", year: "2-digit" } : { day: "2-digit", month: "2-digit" }) : "—";

function Chip({ v }: { v: number | null }) {
  if (v == null) return <span className="text-[#5a6884]">—</span>;
  return (
    <span className="rounded-[4px] px-1 font-extrabold tabular-nums" style={{ backgroundColor: scoreColor(v, 10), color: SCORE_ON_TEXT }}>
      {v.toFixed(1)}
    </span>
  );
}

/** Same layout as the header mini-pitch: x along the pitch, y across. */
const PITCH_XY: Record<string, { x: number; y: number }> = {
  GK: { x: 8, y: 50 },
  CB: { x: 22, y: 50 },
  LCB: { x: 22, y: 36 },
  RCB: { x: 22, y: 64 },
  LB: { x: 26, y: 15 },
  LWB: { x: 34, y: 12 },
  RB: { x: 26, y: 85 },
  RWB: { x: 34, y: 88 },
  CDM: { x: 38, y: 50 },
  CM: { x: 50, y: 50 },
  LM: { x: 52, y: 15 },
  RM: { x: 52, y: 85 },
  CAM: { x: 64, y: 50 },
  LW: { x: 74, y: 16 },
  RW: { x: 74, y: 84 },
  CF: { x: 78, y: 50 },
  ST: { x: 86, y: 50 },
};

function PositionsPitch({ items }: { items: { key: string; count: number }[] }) {
  const best = items[0]?.key;
  return (
    <div
      className="relative w-full aspect-[3/2] max-h-[120px] rounded-[6px] border border-white/15 overflow-hidden"
      style={{ background: "repeating-linear-gradient(90deg, #14532d 0 15px, #166534 15px 30px)" }}
    >
      <div className="absolute inset-y-0 left-1/2 w-px bg-white/30" />
      {items.map((it) => {
        const xy = PITCH_XY[it.key.toUpperCase()];
        if (!xy) return null;
        const primary = it.key === best;
        return (
          <span
            key={it.key}
            title={`${it.key} ×${it.count}`}
            className={`absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full border font-bold text-white ${
              primary ? "w-6 h-6 text-[10px] bg-[#7166F2] border-white" : "w-[18px] h-[18px] text-[9px] bg-[#55B862] border-white/80"
            }`}
            style={{ left: `${xy.x}%`, top: `${xy.y}%` }}
          >
            {it.count}
          </span>
        );
      })}
    </div>
  );
}

export const ScoutingHistoryBlock: React.FC<{ data: ScoutingHistoryData | null; loading?: boolean }> = ({ data, loading }) => {
  const ctx = (b: "stronger" | "same" | "weaker") => data?.context.find((c) => c.bucket === b);
  const stronger = ctx("stronger");
  const summary = data && data.views > 0 ? `${data.views} views · ${data.scouts} scout${data.scouts === 1 ? "" : "s"} · since ${d2(data.since, true)}` : undefined;

  const contextTiles = (big: boolean) => (
    <div className={`grid grid-cols-3 ${big ? "gap-2.5" : "gap-1.5"}`}>
      {(
        [
          ["stronger", "vs stronger ▲"],
          ["same", "vs same tier"],
          ["weaker", "vs weaker ▼"],
        ] as const
      ).map(([b, label]) => {
        const c = ctx(b);
        const pct = c?.avgScout != null ? Math.min(100, c.avgScout * 10) : 0;
        return (
          <div key={b} className={`rounded-[8px] border border-[#1c2a45] bg-[#0b1426] ${big ? "p-3" : "px-2 py-1.5"}`}>
            <div className="flex items-center justify-between text-[10px] text-[#8796b3]">
              <span className="truncate">{label}</span>
              <span>{c?.count ?? 0}</span>
            </div>
            <div className={`${big ? "text-[22px]" : "text-[15px]"} font-extrabold leading-tight`} style={{ color: c?.avgScout != null ? scoreColor(c.avgScout, 10) : "#5a6884" }}>
              {c?.avgScout != null ? c.avgScout.toFixed(1) : "—"}
            </div>
            <div className="h-[4px] rounded-full bg-[#1a2640] overflow-hidden">
              <div className="h-full bg-[#7166F2]" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );

  const whoTable = (limit?: number) => (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="text-[9px] uppercase tracking-[0.08em] text-[#5a6884] text-left">
          <th className="py-1 font-semibold">Scout</th>
          <th className="py-1 font-semibold text-center">Times</th>
          <th className="py-1 font-semibold text-center">Live · video</th>
          <th className="py-1 font-semibold">Last</th>
          <th className="py-1 font-semibold">Avg</th>
          <th className="py-1 font-semibold">Stars</th>
        </tr>
      </thead>
      <tbody>
        {(limit ? data!.whoHasSeen.slice(0, limit) : data!.whoHasSeen).map((s) => (
          <tr key={s.scoutId} className="border-t border-[#1c2a45]">
            <td className="py-1 font-semibold text-[#e6edf7] truncate max-w-[110px]">{s.scoutName}</td>
            <td className="py-1 text-center text-[#e6edf7]">{s.times}</td>
            <td className="py-1 text-center text-[#c8d3e6]">
              {s.live} · {s.video}
            </td>
            <td className="py-1 text-[#c8d3e6]">{d2(s.last, true)}</td>
            <td className="py-1">
              <Chip v={s.avgRating} />
            </td>
            <td className="py-1">{s.stars?.now != null ? <Stars value={s.stars.now} tone="now" size={11} /> : <span className="text-[#5a6884]">—</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const lastTable = (
    <table className="w-full text-[11.5px]">
      <thead>
        <tr className="text-[9px] uppercase tracking-[0.08em] text-[#5a6884] text-left">
          <th className="py-1 font-semibold">Date</th>
          <th className="py-1 font-semibold">Match · where</th>
          <th className="py-1 font-semibold">Context</th>
          <th className="py-1 font-semibold">Scout</th>
          <th className="py-1 font-semibold text-right">Rating</th>
        </tr>
      </thead>
      <tbody>
        {data?.lastMatches.map((m) => (
          <tr key={m.id} className="border-t border-[#1c2a45]">
            <td className="py-1 text-[#8796b3]">{d2(m.date)}</td>
            <td className="py-1 text-[#e6edf7]">
              <b>
                {m.home} – {m.away}
              </b>
              <span className="text-[#8796b3]">
                {m.venue ? ` · ${m.venue}` : ""} · {m.mode === "video" ? "Video" : "Live"}
              </span>
            </td>
            <td className="py-1 text-[#c8d3e6] whitespace-nowrap">
              {m.ownTier || "T?"} v {m.opponentTier || "T?"} {m.tierDiff == null ? "" : m.tierDiff > 0 ? "▲" : m.tierDiff < 0 ? "▼" : "="}
            </td>
            <td className="py-1 text-[#c8d3e6]">{m.scoutName}</td>
            <td className="py-1 text-right">
              <Chip v={m.matchRating} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const seen = (items: { key: string; count: number }[]) =>
    items.length ? items.map((i) => `${i.key} ×${i.count}`).join(" · ") : "—";

  const expanded = data && (
    <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">
      <div className="flex flex-col gap-4 min-w-0">
        <div>
          <div className="mb-1 text-[10.5px] uppercase tracking-[0.1em] text-[#8796b3]">Who has seen her</div>
          {whoTable()}
        </div>
        <div>
          <div className="mb-1 text-[10.5px] uppercase tracking-[0.1em] text-[#8796b3]">Last matches seen</div>
          {lastTable}
        </div>
      </div>
      <div className="flex flex-col gap-4 min-w-0">
        <div>
          <div className="mb-1 text-[10.5px] uppercase tracking-[0.1em] text-[#8796b3]">Match context (difficulty)</div>
          {contextTiles(true)}
          {(stronger?.count ?? 0) === 0 && <p className="mt-1.5 text-[11px] text-[#f4c35e]">Never seen vs a stronger side · assign one</p>}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 items-start">
          <PositionsPitch items={data.positionsSeen} />
          <div className="text-[12px]">
            <div className="text-[10px] uppercase tracking-[0.1em] text-[#8796b3]">Positions seen</div>
            <div className="text-[#e6edf7]">{seen(data.positionsSeen)}</div>
            <div className="mt-2 text-[10px] uppercase tracking-[0.1em] text-[#8796b3]">Systems seen</div>
            <div className="text-[#e6edf7]">{seen(data.systemsSeen)}</div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <ExpandableCard title="Scouting History" tag="Who · when · context" tagTone="purple" subtitle={summary} className="flex-1" expandedContent={expanded || undefined} hideExpand={!data || data.views === 0}>
      {loading && !data ? (
        <div className="flex-1 flex items-center justify-center text-xs text-[#8796b3] animate-pulse">Loading history…</div>
      ) : !data || data.views === 0 ? (
        <p className="flex-1 flex items-center justify-center text-center text-xs text-[#8796b3] py-4">
          Nobody has seen her yet. Assign a scout to one of her upcoming matches.
        </p>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto s1-scroll-fade pr-1 flex flex-col gap-2">
          {contextTiles(false)}
          {(stronger?.count ?? 0) === 0 && <p className="text-[10.5px] text-[#f4c35e]">Never seen vs a stronger side</p>}
          {whoTable(3)}
          <div className="text-[10.5px] text-[#8796b3]">
            <span className="text-[#5a6884]">Positions</span> <span className="text-[#e6edf7]">{seen(data.positionsSeen.slice(0, 3))}</span>
            <span className="text-[#5a6884]"> · Systems</span> <span className="text-[#e6edf7]">{seen(data.systemsSeen.slice(0, 2))}</span>
          </div>
        </div>
      )}
    </ExpandableCard>
  );
};
