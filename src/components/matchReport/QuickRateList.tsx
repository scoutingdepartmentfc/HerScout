"use client";

import React, { useEffect, useState } from "react";
import { MessageSquare, Plus } from "lucide-react";
import { snapMatchRating } from "@/lib/matchReportLogic";
import { scoreColor } from "@/lib/scorePalette";
import { RatingBar, Stars, TriToggle } from "./controls";
import { rowStatus, type Draft, type MatchContext, type Participant } from "./types";

export type ListFilter = "all" | "targets" | "not_rated";

/** Text input that accepts "7.5", "7,5" or "75" (→ 7.5); commits on blur/Enter, snaps to .5 */
function RatingInput({ value, onCommit }: { value: number | null; onCommit: (v: number | null) => void }) {
  const [text, setText] = useState(value != null ? value.toFixed(1) : "");
  useEffect(() => setText(value != null ? value.toFixed(1) : ""), [value]);
  const commit = () => {
    const t = text.trim().replace(",", ".");
    if (!t) return onCommit(null);
    let n = Number(t);
    if (!Number.isFinite(n)) return setText(value != null ? value.toFixed(1) : "");
    if (n > 10 && n <= 100 && /^\d{2,3}$/.test(t)) n = n / 10; // "75" → 7.5
    const v = snapMatchRating(n);
    onCommit(v);
    setText(v.toFixed(1));
  };
  return (
    <input
      value={text}
      inputMode="decimal"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.stopPropagation()}
      data-rating-input
      placeholder="–"
      className="w-11 rounded-[5px] border border-[#22304d] bg-[#0b1426] px-1 py-0.5 text-center text-[14px] font-extrabold tabular-nums outline-none focus:border-[#5b8cff]"
      style={{ color: value != null ? (scoreColor(value, 10) === "#FFFFFF" ? "#e6edf7" : scoreColor(value, 10)) : "#5a6884" }}
    />
  );
}

const STATUS_STYLE: Record<string, string> = {
  to_rate: "border border-dashed border-[#3a4a6a] text-[#8796b3]",
  rated: "bg-[#34d399]/15 text-[#6BE88F] border border-[#34d399]/40",
  published: "bg-[#3b6ff5]/20 text-[#8fb0ff] border border-[#3b6ff5]/50",
  editing: "bg-[#7166F2] text-white",
};
const STATUS_LABEL: Record<string, string> = { to_rate: "to rate", rated: "✓ rated", published: "✓ published", editing: "editing" };

export function QuickRateList({
  ctx,
  drafts,
  onChange,
  onOpen,
  filter,
  selectedId,
}: {
  ctx: MatchContext;
  drafts: Record<string, Draft>;
  onChange: (playerId: string, patch: Partial<Draft>) => void;
  onOpen: (playerId: string) => void;
  filter: ListFilter;
  selectedId: string | null;
}) {
  const [noteOpen, setNoteOpen] = useState<string | null>(null);

  const visible = (p: Participant) => {
    if (filter === "targets") return p.watchlist;
    if (filter === "not_rated") return !p.report && drafts[p.id]?.matchRating == null;
    return true;
  };

  const teamRows = (side: "home" | "away") => {
    const t = side === "home" ? ctx.match.home : ctx.match.away;
    const ps = ctx.players.filter((p) => p.side === side && visible(p));
    if (!ps.length) return null;
    const first = ps.find((p) => p.starter) || ps[0];
    const d0 = drafts[first.id];
    const sysStart = d0?.systemStart || t.formation;
    const sysEnd = d0?.systemEnd;
    return (
      <React.Fragment key={side}>
        <tr>
          <td colSpan={11} className="bg-[#0b1325] px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#c8d3e6]">
            {t.name} · {t.tier || "T?"} · {sysStart || "—"}
            {sysEnd && sysEnd !== sysStart ? ` → ${sysEnd}` : ""}
          </td>
        </tr>
        {ps.map((p) => {
          const d = drafts[p.id];
          const status = rowStatus(p, d, p.id === selectedId);
          const goals = p.events.filter((e) => e.type === "goal");
          const cards = p.events.filter((e) => e.type === "yellow" || e.type === "red");
          const firstTime = p.stars.source === "none" && d?.ratingNow == null && d?.ratingPotential == null;
          return (
            <React.Fragment key={p.id}>
              <tr
                onClick={() => p.inDatabase && onOpen(p.id)}
                className={`border-b border-[#131d33] text-[13px] ${p.inDatabase ? "cursor-pointer hover:bg-white/[0.02]" : "opacity-50"} ${
                  status === "editing" ? "bg-[#7166F2]/[0.08]" : ""
                }`}
              >
                <td className="px-3 py-1.5 text-[#8796b3] tabular-nums">{p.shirt ?? ""}</td>
                <td className="px-2 py-1.5 font-semibold text-[#e6edf7] whitespace-nowrap">
                  {p.name}
                  {p.watchlist && <span className="text-[#c9c4ff]"> ★</span>}
                  {!p.inDatabase && <span className="ml-1 text-[10px] font-normal text-[#5a6884]">not in database</span>}
                </td>
                <td className="px-2 py-1.5 text-[#c8d3e6] whitespace-nowrap">
                  {d?.positionStart || p.positionStart || "—"}
                  {d?.positionEnd && d.positionEnd !== d.positionStart ? ` → ${d.positionEnd}` : ""}
                  {!p.starter && <span className="text-[#5a6884]"> · sub</span>}
                </td>
                <td className="px-2 py-1.5 text-[#c8d3e6] tabular-nums">{p.minutes != null ? `${p.minutes}'` : "—"}</td>
                <td className="px-2 py-1.5 whitespace-nowrap text-[12px] text-[#e6edf7]">
                  {goals.map((g, i) => (
                    <span key={`g${i}`} className="mr-1">⚽{g.min ?? ""}&apos;</span>
                  ))}
                  {cards.map((c, i) => (
                    <span key={`c${i}`} className="mr-1">{c.type === "yellow" ? "🟨" : "🟥"}</span>
                  ))}
                </td>
                <td className="px-2 py-1.5 font-bold tabular-nums" style={{ color: p.optaRating != null ? (scoreColor(p.optaRating, 10) === "#FFFFFF" ? "#e6edf7" : scoreColor(p.optaRating, 10)) : "#5a6884" }}>
                  {p.optaRating != null ? p.optaRating.toFixed(1) : "–"}
                </td>
                <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                  {p.inDatabase && (
                    <div className="flex items-center gap-2">
                      <div className="flex rounded-[5px] border border-[#22304d] overflow-hidden">
                        {[-0.5, 0.5].map((step) => (
                          <button
                            key={step}
                            type="button"
                            tabIndex={-1}
                            onClick={() => onChange(p.id, { matchRating: snapMatchRating((d?.matchRating ?? 6) + step) })}
                            className="w-6 h-6 text-[12px] text-[#c8d3e6] hover:bg-white/5"
                          >
                            {step < 0 ? "−" : "+"}
                          </button>
                        ))}
                      </div>
                      <RatingBar size="sm" value={d?.matchRating ?? null} onChange={(v) => onChange(p.id, { matchRating: v })} />
                      <RatingInput value={d?.matchRating ?? null} onCommit={(v) => onChange(p.id, { matchRating: v })} />
                    </div>
                  )}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  {firstTime ? (
                    <button type="button" tabIndex={-1} onClick={() => onOpen(p.id)} className="text-[12px] text-[#8796b3] hover:text-white">
                      first time · set stars
                    </button>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Stars value={d?.ratingNow ?? null} tone="now" size={14} onChange={(v) => onChange(p.id, { ratingNow: v })} />
                      <Stars value={d?.ratingPotential ?? null} tone="potential" size={14} onChange={(v) => onChange(p.id, { ratingPotential: v })} />
                    </span>
                  )}
                </td>
                <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                  {p.history.seenBefore ? (
                    <TriToggle
                      compact
                      value={d?.vsLast.overall}
                      onChange={(v) => {
                        const next = { ...(d?.vsLast || {}) };
                        if (v === undefined) delete next.overall;
                        else next.overall = v;
                        onChange(p.id, { vsLast: next });
                      }}
                    />
                  ) : (
                    <span className="text-[#5a6884]">—</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setNoteOpen(noteOpen === p.id ? null : p.id)}
                    className={d?.playerNote ? "text-[#c8d3e6]" : "text-[#5a6884] hover:text-white"}
                    aria-label="Player note"
                    title={d?.playerNote || "Add a note"}
                  >
                    {d?.playerNote ? <MessageSquare className="w-4 h-4" fill="currentColor" /> : <Plus className="w-4 h-4" />}
                  </button>
                </td>
                <td className="px-3 py-1.5">
                  <span className={`inline-block rounded-[5px] px-2 py-[2px] text-[11px] font-semibold whitespace-nowrap ${STATUS_STYLE[status]}`}>
                    {STATUS_LABEL[status]}
                  </span>
                </td>
              </tr>
              {noteOpen === p.id && (
                <tr className="border-b border-[#131d33]">
                  <td />
                  <td colSpan={10} className="px-2 py-1.5">
                    <input
                      autoFocus
                      value={d?.playerNote || ""}
                      onChange={(e) => onChange(p.id, { playerNote: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && setNoteOpen(null)}
                      placeholder={`Note on ${p.name} (Enter to close)`}
                      className="w-full rounded-[6px] border border-[#22304d] bg-[#0b1426] px-2.5 py-1.5 text-[12.5px] text-white outline-none focus:border-[#5b8cff]"
                    />
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </React.Fragment>
    );
  };

  const th = "px-2 py-2 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-[#5a6884] whitespace-nowrap";
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse min-w-[1100px]">
        <thead className="sticky top-0 z-10 bg-[#0b1222]">
          <tr className="border-b border-[#1c2a45]">
            <th className={`${th} pl-3`}>#</th>
            <th className={th}>Player</th>
            <th className={th}>Pos · system</th>
            <th className={th}>Min</th>
            <th className={th}>Events</th>
            <th className={th}>Opta</th>
            <th className={th}>Scout rating /10</th>
            <th className={th}>Rating · pot</th>
            <th className={th}>Vs last time</th>
            <th className={th}>Note</th>
            <th className={`${th} pr-3`}>Status</th>
          </tr>
        </thead>
        <tbody>
          {teamRows("home")}
          {teamRows("away")}
        </tbody>
      </table>
    </div>
  );
}
