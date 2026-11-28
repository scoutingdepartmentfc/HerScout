"use client";

import React from "react";
import { scoreColor } from "@/lib/scorePalette";
import type { Draft, MatchContext, Participant } from "./types";

/** Row (0 = goal line) and lateral anchor of each position code on a vertical half-pitch. */
const POS_LAYOUT: Record<string, { row: number; x?: number }> = {
  GK: { row: 0, x: 50 },
  RB: { row: 1, x: 88 },
  RWB: { row: 1.5, x: 90 },
  LB: { row: 1, x: 12 },
  LWB: { row: 1.5, x: 10 },
  CB: { row: 1 },
  RCB: { row: 1 },
  LCB: { row: 1 },
  CDM: { row: 2 },
  CM: { row: 3 },
  RM: { row: 3, x: 88 },
  LM: { row: 3, x: 12 },
  CAM: { row: 4 },
  RW: { row: 4, x: 86 },
  LW: { row: 4, x: 14 },
  CF: { row: 4.6 },
  ST: { row: 5 },
};
const ROW_Y = (row: number) => 6 + row * 8.2; // % from the team's goal line (half = 50%)

function layoutTeam(players: Participant[], drafts: Record<string, Draft>, top: boolean) {
  const starters = players.filter((p) => p.starter);
  const rows = new Map<number, { p: Participant; x?: number }[]>();
  for (const p of starters) {
    const code = (drafts[p.id]?.positionStart || p.positionStart || "CM").toUpperCase();
    const l = POS_LAYOUT[code] || POS_LAYOUT.CM;
    if (!rows.has(l.row)) rows.set(l.row, []);
    rows.get(l.row)!.push({ p, x: l.x });
  }
  const out: { p: Participant; x: number; y: number }[] = [];
  rows.forEach((items, row) => {
    const free = items.filter((i) => i.x == null);
    const fixed = items.filter((i) => i.x != null);
    // spread central players between the fixed wide ones
    const n = free.length;
    free.forEach((i, idx) => {
      const x = n === 1 ? 50 : 28 + (44 * idx) / (n - 1);
      out.push({ p: i.p, x, y: ROW_Y(row) });
    });
    fixed.forEach((i) => out.push({ p: i.p, x: i.x!, y: ROW_Y(row) }));
  });
  return out.map((o) => ({ ...o, x: top ? 100 - o.x : o.x, y: top ? o.y : 100 - o.y }));
}

export function PitchLineup({
  ctx,
  drafts,
  selectedId,
  onSelect,
}: {
  ctx: MatchContext;
  drafts: Record<string, Draft>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const home = ctx.players.filter((p) => p.side === "home");
  const away = ctx.players.filter((p) => p.side === "away");
  const tokens = [...layoutTeam(home, drafts, true), ...layoutTeam(away, drafts, false)];
  const subs = ctx.players.filter((p) => !p.starter);
  const ratingOf = (p: Participant) => drafts[p.id]?.matchRating ?? (p.report ? Number(p.report.match_rating) : null);
  const sys = (p: Participant[], side: "home" | "away") => {
    const t = side === "home" ? ctx.match.home : ctx.match.away;
    const d = p.find((x) => x.starter);
    const s = d ? drafts[d.id] : undefined;
    const start = s?.systemStart || t.formation;
    const end = s?.systemEnd;
    return `${t.name.toUpperCase()} · ${start || "—"}${end && end !== start ? ` → ${end}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      <div
        className="relative flex-1 min-h-[520px] rounded-[12px] border border-[#1c3a2a] overflow-hidden"
        style={{ background: "linear-gradient(180deg,#0f2a1c,#0c2418)" }}
      >
        {/* pitch lines */}
        <div className="absolute inset-[3%] border border-white/10 rounded-[2px]" />
        <div className="absolute left-[3%] right-[3%] top-1/2 h-px bg-white/10" />
        <div className="absolute left-1/2 top-1/2 w-[22%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
        <div className="absolute left-[27%] right-[27%] top-[3%] h-[9%] border border-t-0 border-white/10" />
        <div className="absolute left-[27%] right-[27%] bottom-[3%] h-[9%] border border-b-0 border-white/10" />
        <span className="absolute left-[5%] top-[4%] text-[10px] font-semibold tracking-wide text-white/45">{sys(home, "home")}</span>
        <span className="absolute left-[5%] bottom-[4%] text-[10px] font-semibold tracking-wide text-white/45">{sys(away, "away")}</span>

        {tokens.map(({ p, x, y }) => {
          const r = ratingOf(p);
          const sel = p.id === selectedId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => p.inDatabase && onSelect(p.id)}
              disabled={!p.inDatabase}
              title={p.inDatabase ? p.name : `${p.name} · not in the Player Database`}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center w-[96px] group disabled:opacity-50"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <span className="relative">
                <span
                  className={`block w-9 h-9 rounded-full border-[1.5px] overflow-hidden bg-gradient-to-br from-[#33456e] to-[#1c2742] transition-shadow ${
                    sel ? "border-[#9d94ff] shadow-[0_0_0_3px_#7166F288]" : "border-white/25 group-hover:border-white/60"
                  }`}
                >
                  {p.photoUrl && <img src={p.photoUrl} alt="" className="w-full h-full object-cover object-top" />}
                </span>
                {p.shirt != null && (
                  <span className="absolute -left-2 -bottom-1 rounded-[4px] bg-[#0a1020] px-1 text-[9.5px] font-bold text-[#c8d3e6]">{p.shirt}</span>
                )}
                {p.watchlist && <span className="absolute -left-3 -top-2 text-[10px] text-[#c9c4ff]">★</span>}
                {r != null && (
                  <span className="absolute left-[30px] -top-2.5 text-[11.5px] font-extrabold" style={{ color: scoreColor(r, 10) === "#FFFFFF" ? "#e6edf7" : scoreColor(r, 10) }}>
                    {r.toFixed(1)}
                  </span>
                )}
              </span>
              <span className={`mt-0.5 text-[10.5px] font-semibold whitespace-nowrap truncate max-w-[96px] ${sel ? "text-[#c9c4ff]" : "text-[#e6edf7]"}`}>
                {p.name}
              </span>
            </button>
          );
        })}
      </div>

      {subs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-[#8796b3]">
          <span className="font-semibold">Subs played:</span>
          {subs.map((p) => {
            const r = ratingOf(p);
            const on = p.events.find((e) => e.type === "sub_on")?.min;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => p.inDatabase && onSelect(p.id)}
                disabled={!p.inDatabase}
                className={`rounded-[6px] border px-2 py-[3px] text-[#c8d3e6] disabled:opacity-50 ${
                  p.id === selectedId ? "border-[#9d94ff] bg-[#7166F2]/20" : "border-[#22304d] hover:border-[#5b8cff]"
                }`}
              >
                {p.shirt != null ? `${p.shirt} ` : ""}
                {p.name}
                {on != null ? ` ${on}'` : ""}
                {r != null && <b className="ml-1" style={{ color: scoreColor(r, 10) === "#FFFFFF" ? "#e6edf7" : scoreColor(r, 10) }}>{r.toFixed(1)}</b>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
