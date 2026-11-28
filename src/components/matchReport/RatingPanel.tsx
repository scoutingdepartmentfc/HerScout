"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Check, AlertTriangle, Pencil, Plus, X } from "lucide-react";
import { adjustedRating, isOptaConsistent } from "@/lib/matchReportLogic";
import { scoreColor } from "@/lib/scorePalette";
import { SPONDA_TEC_TAC_TAGS } from "@/lib/spondaReportOptions";
import { AutoBadge, RatingBar, ScoreChip, Section, StarsAdjust, TriToggle } from "./controls";
import {
  FORMATIONS,
  PILLARS,
  POSITION_CODES,
  VS_DIMENSIONS,
  fmtDate,
  type Draft,
  type MatchContext,
  type Participant,
} from "./types";

/** Common tags for a position when the player has none yet (first-time players). */
function suggestedTags(code: string | null): string[] {
  const all = SPONDA_TEC_TAC_TAGS.flatMap((c) => c.tags);
  const pick = (names: string[]) => names.filter((n) => all.includes(n));
  const c = (code || "").toUpperCase();
  if (c === "GK") return pick(["GK 1V1", "Advanced GK", "Aerial Balls"]);
  if (["CB", "LCB", "RCB"].includes(c)) return pick(["Defensive Duels", "Aerial Balls", "Defensive Anticipation", "Long pass", "Defensive Covering"]);
  if (["LB", "RB", "LWB", "RWB"].includes(c)) return pick(["Overlapping Runs", "Crosser", "Defensive Recovery", "Tracking Back", "1v1"]);
  if (["CDM", "CM"].includes(c)) return pick(["Line-Breaking Pass", "Pressure Reception", "Game Vision", "Defensive Positioning", "Scanning"]);
  if (["CAM", "LM", "RM"].includes(c)) return pick(["Between-Lines Reception", "Magic Pass", "Late Box Arrival", "Tight-Space Dribbling", "Long Shooter"]);
  if (["LW", "RW"].includes(c)) return pick(["1v1", "Crosser", "Width Creation", "Runs in Behind", "Driving Line-Breaker"]);
  return pick(["Goal Hunter", "Runs in Behind", "Header", "Box Arrival", "Ball Protector"]);
}

const ALL_TAGS = Array.from(new Set(SPONDA_TEC_TAC_TAGS.flatMap((c) => c.tags)));

export function RatingPanel({
  ctx,
  player: p,
  draft: d,
  onChange,
  index,
  total,
  onPrev,
  onNext,
  onClose,
  onSkip,
  onSave,
  onSaveNext,
  saving,
  error,
  matchNote,
}: {
  ctx: MatchContext;
  player: Participant;
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onSkip: () => void;
  onSave: () => void;
  onSaveNext: () => void;
  saving: boolean;
  error: string | null;
  matchNote: string;
}) {
  const [editPos, setEditPos] = useState(false);
  const [editSys, setEditSys] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const team = p.side === "home" ? ctx.match.home : ctx.match.away;
  const opp = p.side === "home" ? ctx.match.away : ctx.match.home;
  const h = p.history;
  const rating = d.matchRating;
  const consistent = rating == null || isOptaConsistent(rating, p.optaRating);
  const adjusted = rating != null ? adjustedRating(rating, p.tierDiff) : null;

  const tagOptions = useMemo(() => {
    const base = h.tags.length ? h.tags : suggestedTags(d.positionStart);
    return Array.from(new Set([...base, ...d.tagsSeen]));
  }, [h.tags, d.positionStart, d.tagsSeen]);
  const tagMatches = tagQuery.trim()
    ? ALL_TAGS.filter((t) => t.toLowerCase().includes(tagQuery.toLowerCase()) && !tagOptions.includes(t)).slice(0, 6)
    : [];
  const toggleTag = (t: string) =>
    onChange({ tagsSeen: d.tagsSeen.includes(t) ? d.tagsSeen.filter((x) => x !== t) : [...d.tagsSeen, t] });

  const ev = p.eventing;
  const kv = (v: number | null | undefined) => (v == null ? "—" : v);
  const eventIcons = p.events.filter((e) => e.type !== "sub_off" && e.type !== "sub_on");
  const diffLabel =
    p.tierDiff == null ? "tiers not set" : p.tierDiff > 0 ? `▲ +${p.tierDiff} harder` : p.tierDiff < 0 ? `▼ ${p.tierDiff} easier` : "= same level";

  const sel = "bg-[#0b1426] border border-[#22304d] rounded-[5px] px-1.5 py-0.5 text-[12px] text-white outline-none focus:border-[#5b8cff]";

  return (
    <div className="flex flex-col h-full min-h-0 rounded-[12px] border border-[#2a3a5c] bg-[#0b1222] overflow-hidden">
      {/* Player header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1c2a45]">
        <div className="w-11 h-11 rounded-full overflow-hidden bg-gradient-to-br from-[#33456e] to-[#1c2742] shrink-0">
          {p.photoUrl && <img src={p.photoUrl} alt="" className="w-full h-full object-cover object-top" />}
        </div>
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <h2 className="text-[22px] font-extrabold uppercase leading-none text-[#e6edf7] truncate">{p.name}</h2>
            {p.shirt != null && <span className="text-[12px] font-bold text-[#8796b3]">#{p.shirt}</span>}
          </div>
          <div className="text-[11.5px] text-[#8796b3] mt-1 truncate">
            {team.name}
            {p.watchlist && <span className="text-[#c9c4ff]"> · ★ watchlist</span>}
            {h.seenBefore ? ` · seen ${h.timesSeen}× before` : " · first time"}
            {" · "}
            <Link href={`/players/${p.id}`} target="_blank" className="text-[#5b8cff] hover:underline">
              open profile ↗
            </Link>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-[#8796b3]">
            Player {index + 1} of {total}
          </span>
          <button type="button" onClick={onPrev} className="p-1 text-[#8796b3] hover:text-white" aria-label="Previous player">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button type="button" onClick={onNext} className="p-1 text-[#8796b3] hover:text-white" aria-label="Next player">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-md border border-[#1c2a45] text-[#8796b3] hover:text-white flex items-center justify-center"
            aria-label="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 grid grid-cols-1 2xl:grid-cols-2 gap-3 content-start">
        <div className="flex flex-col gap-3 min-w-0">
          {/* Position / system / minutes / events / context */}
          <section className="rounded-[10px] border border-[#1c2a45] bg-[#0d1628] px-3.5 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <div className="flex items-center gap-1 text-[9.5px] uppercase tracking-[0.08em] text-[#8796b3]">
                  Position <AutoBadge />
                </div>
                {editPos ? (
                  <div className="flex items-center gap-1 mt-1">
                    <select className={sel} value={d.positionStart || ""} onChange={(e) => onChange({ positionStart: e.target.value })}>
                      {POSITION_CODES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                    →
                    <select className={sel} value={d.positionEnd || ""} onChange={(e) => onChange({ positionEnd: e.target.value })}>
                      {POSITION_CODES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                ) : (
                  <button type="button" onClick={() => setEditPos(true)} className="mt-1 text-[15px] font-bold text-white flex items-center gap-1">
                    {d.positionStart || "—"}
                    {d.positionEnd && d.positionEnd !== d.positionStart && <span className="text-[12px] text-[#8796b3]">→ {d.positionEnd}</span>}
                    <Pencil className="w-3 h-3 text-[#5b8cff]" />
                  </button>
                )}
              </div>
              <div>
                <div className="flex items-center gap-1 text-[9.5px] uppercase tracking-[0.08em] text-[#8796b3]">
                  System <AutoBadge />
                </div>
                {editSys ? (
                  <div className="flex items-center gap-1 mt-1">
                    <select className={sel} value={d.systemStart || ""} onChange={(e) => onChange({ systemStart: e.target.value })}>
                      <option value="">—</option>
                      {FORMATIONS.map((c) => <option key={c}>{c}</option>)}
                    </select>
                    →
                    <select className={sel} value={d.systemEnd || ""} onChange={(e) => onChange({ systemEnd: e.target.value })}>
                      <option value="">—</option>
                      {FORMATIONS.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                ) : (
                  <button type="button" onClick={() => setEditSys(true)} className="mt-1 text-[15px] font-bold text-white flex items-center gap-1">
                    {d.systemStart || "—"}
                    {d.systemEnd && d.systemEnd !== d.systemStart && <span className="text-[12px] text-[#8796b3]">→ {d.systemEnd}</span>}
                    <Pencil className="w-3 h-3 text-[#5b8cff]" />
                  </button>
                )}
              </div>
              <div>
                <div className="text-[9.5px] uppercase tracking-[0.08em] text-[#8796b3]">Minutes</div>
                <div className="mt-1 text-[15px] font-bold text-white">{p.minutes != null ? `${p.minutes}'` : "—"}</div>
              </div>
              <div>
                <div className="text-[9.5px] uppercase tracking-[0.08em] text-[#8796b3]">Events</div>
                <div className="mt-1 text-[13px] font-bold text-white flex flex-wrap gap-x-2">
                  {eventIcons.length
                    ? eventIcons.map((e, i) => (
                        <span key={i}>
                          {e.type === "goal" ? "⚽" : e.type === "own_goal" ? "⚽(OG)" : e.type === "yellow" ? "🟨" : "🟥"} {e.min ?? ""}&apos;
                        </span>
                      ))
                    : "—"}
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3 rounded-[8px] border border-[#2a3a5c] bg-[#101a33] px-3 py-2 text-[12px]">
              <span className="text-[9.5px] uppercase tracking-[0.1em] text-[#8796b3]">Context</span>
              <b className="text-white">
                {p.ownTier || "T?"} vs {p.opponentTier || "T?"}
              </b>
              <span className={p.tierDiff != null && p.tierDiff > 0 ? "text-[#6BE88F] font-semibold" : p.tierDiff != null && p.tierDiff < 0 ? "text-[#ff8a8a] font-semibold" : "text-[#8796b3]"}>
                {diffLabel}
              </span>
              <span className="ml-auto text-[10.5px] text-[#5a6884] hidden sm:inline">vs {opp.name} · saved to her history</span>
            </div>
          </section>

          {/* Match data */}
          <Section
            title="Match data"
            hint={<><AutoBadge label="OPTA" /> key eventing, auto</>}
            right={
              <span className="text-[11px] text-[#8796b3]">
                Opta rating <ScoreChip value={p.optaRating} className="text-[13px] ml-1" />
              </span>
            }
          >
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {[
                [kv(ev.goals), "Goals"],
                [kv(ev.assists), "Assists"],
                [kv(ev.shots), ev.shots_on != null ? `Shots · ${ev.shots_on} on` : "Shots"],
                [kv(ev.key_passes), "Key passes"],
                [ev.dribbles_att != null ? `${ev.dribbles_won ?? 0}/${ev.dribbles_att}` : "—", "Dribbles"],
                [ev.duels_total != null ? `${ev.duels_won ?? 0}/${ev.duels_total}` : "—", "Duels won"],
              ].map(([v, l]) => (
                <div key={String(l)} className="rounded-[8px] border border-[#1c2a45] bg-[#0b1426] py-2 text-center">
                  <div className="text-[17px] font-extrabold text-white tabular-nums">{v}</div>
                  <div className="text-[9.5px] text-[#8796b3]">{l}</div>
                </div>
              ))}
            </div>
          </Section>

          {/* Match rating */}
          <Section title="Match rating" hint={<><span className="text-[#f5b942]">required</span> · /10 · tap = point · tap again = .5 · keys 1–0</>} className="border-[#2a4a7c]">
            <div className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <RatingBar value={rating} onChange={(v) => onChange({ matchRating: v })} />
              </div>
              <div className="text-right shrink-0">
                <span className="text-[44px] font-extrabold leading-none tabular-nums" style={{ color: rating != null ? (scoreColor(rating, 10) === "#FFFFFF" ? "#e6edf7" : scoreColor(rating, 10)) : "#2a3756" }}>
                  {rating != null ? rating.toFixed(1) : "–"}
                </span>
                <span className="text-[13px] text-[#5a6884]">/10</span>
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#8796b3]">
              <span>
                Opta <ScoreChip value={p.optaRating} className="ml-1" />
              </span>
              {rating != null && p.optaRating != null && (
                consistent ? (
                  <span className="text-[#6BE88F] flex items-center gap-1"><Check className="w-3.5 h-3.5" /> consistent</span>
                ) : (
                  <span className="text-[#f4c35e] flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> differs from Opta — add a note</span>
                )
              )}
              <span>
                Adjusted vs {p.opponentTier || "?"} <ScoreChip value={adjusted} className="ml-1" />
              </span>
              <span className="ml-auto">
                her avg {h.avgRating != null ? h.avgRating.toFixed(1) : "—"}
                {h.avgRating != null && rating != null && (
                  <b className={rating - h.avgRating >= 0 ? "text-[#6BE88F]" : "text-[#ff8a8a]"}>
                    {" "}
                    {rating - h.avgRating >= 0 ? "▲ +" : "▼ "}
                    {(rating - h.avgRating).toFixed(1)}
                  </b>
                )}
              </span>
            </div>
            {!consistent && (
              <input
                value={d.consistencyNote}
                onChange={(e) => onChange({ consistencyNote: e.target.value })}
                placeholder="Why does your rating differ from Opta? (required to publish)"
                className="mt-2 w-full rounded-[6px] border border-[#f4c35e]/50 bg-[#0b1426] px-2.5 py-1.5 text-[12px] text-white outline-none focus:border-[#f4c35e]"
              />
            )}
          </Section>

          {/* Stars */}
          <Section title="Stars" hint="pre-filled · keep or ±½ · saved to her profile">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(
                [
                  ["Rating now", "ratingNow", "now", p.stars.mineNow, p.stars.avgNow],
                  ["Potential", "ratingPotential", "potential", p.stars.minePotential, p.stars.avgPotential],
                ] as const
              ).map(([label, key, tone, mine, avg]) => (
                <div key={key}>
                  <div className="text-[9.5px] uppercase tracking-[0.08em] text-[#8796b3] mb-1">{label}</div>
                  <StarsAdjust value={d[key]} tone={tone} onChange={(v) => onChange({ [key]: v } as Partial<Draft>)} />
                  <div className="text-[10.5px] text-[#8796b3] mt-1">
                    {d[key] != null ? d[key]!.toFixed(1) : "—"}
                    {" · "}
                    {p.stars.source === "none" && mine == null ? "first time · set stars" : <>your last {mine != null ? mine.toFixed(1) : "—"} · scouts avg {avg != null ? avg.toFixed(1) : "—"} ({p.stars.scouts})</>}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>

        <div className="flex flex-col gap-3 min-w-0">
          {/* Since last time / Pillar flash */}
          {h.seenBefore ? (
            <Section
              title="Since last time"
              accent
              hint={
                <>
                  last seen {fmtDate(h.lastSeen?.date)}
                  {h.lastSeen?.opponent ? ` @ ${h.lastSeen.opponent}` : ""}
                  {h.lastSeen?.rating != null ? ` · ${h.lastSeen.rating.toFixed(1)}` : ""}
                  {h.fullReport?.score != null ? ` · full report ${h.fullReport.score}` : ""}
                </>
              }
            >
              <div className="grid grid-cols-[minmax(110px,0.8fr)_minmax(0,1.6fr)] items-center gap-x-3 gap-y-1.5 text-[12.5px]">
                <span className="text-[#c8d3e6]">Played more?</span>
                <span className="text-[#e6edf7]">
                  {p.minutes != null ? `${p.minutes}'` : "—"} vs avg {h.avgMinutes != null ? `${h.avgMinutes}'` : "—"}
                  {p.minutes != null && h.avgMinutes != null && (
                    <b className={p.minutes >= h.avgMinutes ? "text-[#6BE88F]" : "text-[#ff8a8a]"}> {p.minutes >= h.avgMinutes ? "▲" : "▼"} auto</b>
                  )}
                </span>
                {VS_DIMENSIONS.map((dim) => (
                  <React.Fragment key={dim.key}>
                    <span className="text-[#c8d3e6]">{dim.label}</span>
                    <TriToggle
                      value={d.vsLast[dim.key]}
                      onChange={(v) => {
                        const next = { ...d.vsLast };
                        if (v === undefined) delete next[dim.key];
                        else next[dim.key] = v;
                        onChange({ vsLast: next });
                      }}
                    />
                  </React.Fragment>
                ))}
              </div>
              {h.watchFor.length > 0 && (
                <>
                  <div className="mt-3 mb-1.5 border-t border-[#1c2a45] pt-2 text-[11px] text-[#8796b3]">Watch for (her weaknesses)</div>
                  <div className="grid grid-cols-[minmax(110px,0.8fr)_minmax(0,1.6fr)] items-center gap-x-3 gap-y-1.5 text-[12.5px]">
                    {h.watchFor.map((item) => (
                      <React.Fragment key={item}>
                        <span className="text-[#c8d3e6] truncate" title={item}>{item}</span>
                        <TriToggle
                          value={d.watchFor[item] === "better" ? 1 : d.watchFor[item] === "same" ? 0 : d.watchFor[item] === "worse" ? -1 : undefined}
                          onChange={(v) => {
                            const next = { ...d.watchFor };
                            if (v === undefined) delete next[item];
                            else next[item] = v === 1 ? "better" : v === 0 ? "same" : "worse";
                            onChange({ watchFor: next });
                          }}
                        />
                      </React.Fragment>
                    ))}
                  </div>
                </>
              )}
            </Section>
          ) : (
            <Section title="Pillar flash" hint="first time · optional">
              <div className="grid grid-cols-[minmax(110px,0.8fr)_minmax(0,1.6fr)] items-center gap-x-3 gap-y-1.5 text-[12.5px]">
                {PILLARS.map((pl) => (
                  <React.Fragment key={pl.key}>
                    <span className="text-[#c8d3e6]">{pl.label}</span>
                    <TriToggle
                      value={d.pillarFlash[pl.key]}
                      onChange={(v) => {
                        const next = { ...d.pillarFlash };
                        if (v === undefined) delete next[pl.key];
                        else next[pl.key] = v;
                        onChange({ pillarFlash: next });
                      }}
                    />
                  </React.Fragment>
                ))}
              </div>
            </Section>
          )}

          {/* Tags */}
          <Section title="Tags seen today" hint="optional · counts towards her full report">
            <div className="flex flex-wrap gap-1.5">
              {tagOptions.map((t) => {
                const on = d.tagsSeen.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    tabIndex={-1}
                    onClick={() => toggleTag(t)}
                    className={`rounded-[7px] border px-2.5 py-1 text-[12px] ${on ? "border-[#34d399] bg-[#34d399]/10 text-[#6BE88F]" : "border-[#22304d] text-[#c8d3e6] hover:border-[#5b8cff]"}`}
                  >
                    {on && "✓ "}
                    {t}
                  </button>
                );
              })}
              <div className="relative">
                <span className="flex items-center gap-1 rounded-[7px] border border-dashed border-[#3b6ff5]/60 px-2 py-1 text-[12px] text-[#5b8cff]">
                  <Plus className="w-3 h-3" />
                  <input
                    value={tagQuery}
                    onChange={(e) => setTagQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && tagQuery.trim()) {
                        toggleTag(tagMatches[0] || tagQuery.trim());
                        setTagQuery("");
                      }
                    }}
                    placeholder="tag"
                    className="w-20 bg-transparent outline-none placeholder:text-[#5b8cff]"
                  />
                </span>
                {tagMatches.length > 0 && (
                  <div className="absolute z-20 mt-1 w-52 rounded-[8px] border border-[#22304d] bg-[#0d1628] p-1 shadow-xl">
                    {tagMatches.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          toggleTag(t);
                          setTagQuery("");
                        }}
                        className="block w-full rounded px-2 py-1 text-left text-[12px] text-[#c8d3e6] hover:bg-white/5"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Section>

          {/* Notes */}
          <Section title="Player note" hint="1–2 lines">
            <textarea
              value={d.playerNote}
              onChange={(e) => onChange({ playerNote: e.target.value })}
              rows={2}
              placeholder="What stood out today?"
              className="w-full resize-none rounded-[8px] border border-[#22304d] bg-[#0b1426] px-3 py-2 text-[13px] text-white outline-none focus:border-[#5b8cff]"
            />
          </Section>
          <Section title="Match note" hint="shared · 1 per match · edit in the header">
            <p className="min-h-[40px] rounded-[8px] border border-[#1c2a45] bg-[#0b1426] px-3 py-2 text-[12.5px] text-[#c8d3e6] whitespace-pre-wrap">
              {matchNote || <span className="text-[#5a6884]">No match note yet.</span>}
            </p>
          </Section>
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center gap-2 border-t border-[#1c2a45] px-4 py-2.5">
        <span className="text-[11px] text-[#5a6884]">Required: match rating only · stars pre-filled · N = save &amp; next</span>
        {error && <span className="text-[11.5px] text-[#ff8a8a]">{error}</span>}
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onSkip} className="h-9 px-4 rounded-[7px] border border-[#22304d] text-[12px] font-bold uppercase tracking-[0.06em] text-[#c8d3e6] hover:border-[#5b8cff]">
            Skip
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || rating == null}
            className="h-9 px-4 rounded-[7px] border border-[#22304d] text-[12px] font-bold uppercase tracking-[0.06em] text-white hover:border-[#5b8cff] disabled:opacity-40"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onSaveNext}
            disabled={saving || rating == null}
            className="h-9 px-4 rounded-[7px] bg-[#3B6FF5] hover:bg-[#5B8CFF] text-[12px] font-bold uppercase tracking-[0.06em] text-white flex items-center gap-1.5 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save & next"} <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
