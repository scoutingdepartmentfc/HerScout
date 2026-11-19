"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, BookmarkCheck, Clock, Users, X } from "lucide-react";
import { EscudoEquipo } from "@/components/scouting/EscudoEquipo";
import { LogoLiga } from "@/components/scouting/LogoLiga";
import { Bandera } from "@/components/scouting/Bandera";

export interface CalendarMatch {
  id: string;
  date: string;
  status: string;
  timeConfirmed: boolean;
  competition?: string;
  competitionId?: string;
  competitionCountry?: string;
  competitionLogoUrl?: string | null;
  home: { id?: string; name?: string; badgeUrl?: string | null; score?: number | null };
  away: { id?: string; name?: string; badgeUrl?: string | null; score?: number | null };
}

/** Local calendar day "YYYY-MM-DD" of a date (matches are grouped by the viewer's day, not the UTC one). */
export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Intensity by number of matches: the busier the day, the warmer the colour
const LEVELS = [
  { min: 25, label: "25+", cell: "from-fuchsia-500/45 via-violet-600/30 to-indigo-700/25 border-fuchsia-300/45", glow: "bg-fuchsia-400", text: "text-fuchsia-50", swatch: "bg-fuchsia-500" },
  { min: 10, label: "10–24", cell: "from-violet-500/40 via-indigo-600/25 to-blue-800/20 border-violet-300/35", glow: "bg-violet-400", text: "text-violet-50", swatch: "bg-violet-500" },
  { min: 3, label: "3–9", cell: "from-cyan-400/30 via-sky-600/20 to-blue-900/20 border-cyan-300/30", glow: "bg-cyan-300", text: "text-cyan-50", swatch: "bg-cyan-400" },
  { min: 1, label: "1–2", cell: "from-sky-500/20 via-sky-700/10 to-navy-950/40 border-sky-400/20", glow: "bg-sky-400", text: "text-sky-100", swatch: "bg-sky-500/70" },
];
const levelOf = (n: number) => LEVELS.find((l) => n >= l.min)!;

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function MatchCalendar({
  year,
  month,
  matchesByDay,
  tzShort,
  agenda,
  canOpen,
  onOpenMatch,
  onToggleAgenda,
}: {
  year: number;
  month: number; // 0-11
  matchesByDay: Record<string, CalendarMatch[]>;
  tzShort?: string;
  agenda: Record<string, unknown>;
  canOpen: (m: CalendarMatch) => boolean;
  onOpenMatch: (m: CalendarMatch) => void;
  onToggleAgenda: (m: CalendarMatch, e: React.MouseEvent) => void;
}) {
  // Hover opens the day (desktop); a click pins it open (also the way to open it on touch screens)
  const [hoverDay, setHoverDay] = useState<string | null>(null);
  const [pinnedDay, setPinnedDay] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const openDay = pinnedDay ?? hoverDay;

  useEffect(() => {
    setHoverDay(null);
    setPinnedDay(null);
  }, [year, month]);

  useEffect(() => {
    if (!pinnedDay) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPinnedDay(null);
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setPinnedDay(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [pinnedDay]);

  const cells = useMemo(() => {
    const offset = (new Date(year, month, 1).getDay() + 6) % 7; // Monday first
    const total = new Date(year, month + 1, 0).getDate();
    const out: Array<string | null> = Array(offset).fill(null);
    for (let d = 1; d <= total; d++) out.push(localDayKey(new Date(year, month, d)));
    while (out.length % 7) out.push(null);
    return out;
  }, [year, month]);
  const rows = cells.length / 7;
  const today = localDayKey(new Date());
  const monthTotal = Object.entries(matchesByDay)
    .filter(([k]) => k.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`))
    .reduce((n, [, v]) => n + v.length, 0);

  const enter = (day: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setHoverDay(day);
  };
  const leave = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setHoverDay(null), 120);
  };

  return (
    <div
      ref={rootRef}
      className="relative rounded-3xl border border-white/10 bg-[radial-gradient(ellipse_at_top_left,rgba(56,189,248,0.10),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(217,70,239,0.10),transparent_55%)] bg-navy-950/80 p-3 sm:p-5 shadow-2xl backdrop-blur-md"
    >
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5 mb-2">
        {WEEKDAYS.map((d, i) => (
          <div
            key={d}
            className={`text-center text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.18em] py-1 ${
              i >= 5 ? "text-fuchsia-300/80" : "text-slate-400"
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5">
        {cells.map((day, idx) => {
          if (!day) return <div key={`e-${idx}`} className="h-16 sm:h-24 rounded-2xl" />;
          const list = matchesByDay[day] || [];
          const n = list.length;
          const lvl = n ? levelOf(n) : null;
          const isToday = day === today;
          const isPast = day < today;
          const isOpen = openDay === day;
          const col = idx % 7;
          const row = Math.floor(idx / 7);
          return (
            <div
              key={day}
              className={`relative ${isOpen ? "z-40" : "z-0"}`}
              onMouseEnter={n ? () => enter(day) : undefined}
              onMouseLeave={n ? leave : undefined}
            >
              <button
                type="button"
                disabled={!n}
                onClick={() => setPinnedDay(pinnedDay === day ? null : day)}
                className={`group relative w-full h-16 sm:h-24 overflow-hidden rounded-2xl border text-left transition-all duration-200 ${
                  lvl
                    ? `bg-gradient-to-br ${lvl.cell} hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 cursor-pointer`
                    : "bg-white/[0.02] border-white/[0.04] cursor-default"
                } ${isOpen ? "ring-2 ring-white/70 -translate-y-0.5" : ""} ${
                  isToday ? "ring-2 ring-primary ring-offset-2 ring-offset-navy-950" : ""
                } ${isPast && !isOpen ? "opacity-70 hover:opacity-100" : ""}`}
              >
                {lvl && (
                  <span
                    className={`pointer-events-none absolute -bottom-6 -right-6 h-16 w-16 rounded-full blur-2xl opacity-60 transition-opacity group-hover:opacity-90 ${lvl.glow}`}
                  />
                )}
                <span
                  className={`absolute left-2 top-1.5 text-[11px] sm:text-xs font-mono font-bold ${
                    isToday
                      ? "rounded-md bg-primary px-1.5 text-slate-950"
                      : n
                      ? "text-white/80"
                      : "text-slate-600"
                  }`}
                >
                  {Number(day.slice(8))}
                </span>
                {lvl && (
                  <span className="absolute inset-0 flex flex-col items-center justify-center pt-3">
                    <span className={`text-xl sm:text-3xl font-black leading-none tracking-tight drop-shadow ${lvl.text}`}>
                      {n}
                    </span>
                    <span className="hidden sm:block mt-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-white/60">
                      {n === 1 ? "match" : "matches"}
                    </span>
                  </span>
                )}
              </button>

              {isOpen && n > 0 && (
                <DayPopover
                  day={day}
                  matches={list}
                  tzShort={tzShort}
                  agenda={agenda}
                  canOpen={canOpen}
                  onOpenMatch={onOpenMatch}
                  onToggleAgenda={onToggleAgenda}
                  onClose={() => {
                    setPinnedDay(null);
                    setHoverDay(null);
                  }}
                  pinned={pinnedDay === day}
                  alignRight={col >= 4}
                  above={row >= rows - 2 && rows > 3}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-1 text-[10px] text-slate-400">
        <div className="flex items-center gap-3">
          {[...LEVELS].reverse().map((l) => (
            <span key={l.label} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${l.swatch}`} />
              {l.label}
            </span>
          ))}
        </div>
        <span className="font-mono">
          <span className="font-bold text-white">{monthTotal}</span> matches this month · hover or tap a day
        </span>
      </div>
    </div>
  );
}

function DayPopover({
  day,
  matches,
  tzShort,
  agenda,
  canOpen,
  onOpenMatch,
  onToggleAgenda,
  onClose,
  pinned,
  alignRight,
  above,
}: {
  day: string;
  matches: CalendarMatch[];
  tzShort?: string;
  agenda: Record<string, unknown>;
  canOpen: (m: CalendarMatch) => boolean;
  onOpenMatch: (m: CalendarMatch) => void;
  onToggleAgenda: (m: CalendarMatch, e: React.MouseEvent) => void;
  onClose: () => void;
  pinned: boolean;
  alignRight: boolean;
  above: boolean;
}) {
  // Grouped by league, leagues in order of their first kick-off; matches by time
  const groups = useMemo(() => {
    const map = new Map<string, CalendarMatch[]>();
    for (const m of [...matches].sort((a, b) => a.date.localeCompare(b.date))) {
      const k = m.competition || "Other";
      map.set(k, [...(map.get(k) || []), m]);
    }
    return Array.from(map.entries());
  }, [matches]);

  const title = new Date(day + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <>
      {/* Phones: bottom sheet over a dimmed page */}
      {pinned && <div className="sm:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />}
      <div
        className={`z-50 flex flex-col overflow-hidden rounded-2xl border border-white/15 bg-navy-950/95 shadow-2xl shadow-black/60 backdrop-blur-xl
          fixed inset-x-3 bottom-3 max-h-[75vh]
          sm:absolute sm:inset-x-auto sm:w-[380px] sm:max-h-[440px]
          ${alignRight ? "sm:right-0" : "sm:left-0"}
          ${above ? "sm:top-auto sm:bottom-full sm:mb-2" : "sm:bottom-auto sm:top-full sm:mt-2"}
          ${pinned ? "" : "max-sm:hidden"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex items-center justify-between gap-2 border-b border-white/10 bg-gradient-to-r from-sky-500/20 via-violet-500/20 to-fuchsia-500/20 px-4 py-3">
          <div>
            <div className="text-sm font-bold capitalize text-white">{title}</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/60">
              {matches.length} {matches.length === 1 ? "match" : "matches"} · {groups.length}{" "}
              {groups.length === 1 ? "league" : "leagues"}
            </div>
          </div>
          {pinned && (
            <button onClick={onClose} className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white" title="Close">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="overflow-y-auto p-2 space-y-2">
          {groups.map(([league, list]) => (
            <div key={league} className="rounded-xl border border-white/[0.07] bg-white/[0.03]">
              <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
                <LogoLiga
                  competitionId={list[0].competitionId}
                  competitionName={league}
                  logoUrl={list[0].competitionLogoUrl}
                  size={22}
                  className="shrink-0"
                />
                {list[0].competitionCountry && (
                  <Bandera country={list[0].competitionCountry} size="xs" className="rounded-sm shrink-0" />
                )}
                <span className="truncate text-xs font-bold text-white">{league}</span>
                <span className="ml-auto rounded-full bg-white/10 px-1.5 text-[10px] font-mono font-bold text-white/80">
                  {list.length}
                </span>
              </div>
              <div className="divide-y divide-white/[0.05]">
                {list.map((m) => (
                  <MatchLine
                    key={m.id}
                    m={m}
                    tzShort={tzShort}
                    bookmarked={!!agenda[m.id]}
                    openable={canOpen(m)}
                    onOpen={() => onOpenMatch(m)}
                    onToggleAgenda={(e) => onToggleAgenda(m, e)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function MatchLine({
  m,
  tzShort,
  bookmarked,
  openable,
  onOpen,
  onToggleAgenda,
}: {
  m: CalendarMatch;
  tzShort?: string;
  bookmarked: boolean;
  openable: boolean;
  onOpen: () => void;
  onToggleAgenda: (e: React.MouseEvent) => void;
}) {
  const played = m.status === "Played";
  const live = m.status === "Playing";
  const d = new Date(m.date);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const homeWon = played && (m.home.score ?? 0) > (m.away.score ?? 0);
  const awayWon = played && (m.away.score ?? 0) > (m.home.score ?? 0);

  return (
    <div
      onClick={openable ? onOpen : undefined}
      className={`group flex items-center gap-3 px-3 py-2 transition-colors ${openable ? "cursor-pointer hover:bg-white/[0.06]" : ""}`}
    >
      <div className="w-12 shrink-0 text-center">
        {played ? (
          <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white/70">FT</span>
        ) : live ? (
          <span className="rounded-md bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-300 animate-pulse">Live</span>
        ) : m.timeConfirmed ? (
          <span className="block font-mono text-[13px] font-bold text-white leading-tight">
            {time}
            {tzShort && <span className="block text-[8px] font-semibold text-white/40">{tzShort}</span>}
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-white/50">
            <Clock className="h-3 w-3" /> TBC
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        {[
          { side: m.home, won: homeWon },
          { side: m.away, won: awayWon },
        ].map(({ side, won }, i) => (
          <div key={i} className="flex items-center gap-2">
            <EscudoEquipo teamId={side.id} badgeUrl={side.badgeUrl} name={side.name} size={18} />
            <span className={`truncate text-xs ${played && !won ? "text-white/60" : "text-white font-semibold"}`}>
              {side.name}
            </span>
            {(played || live) && (
              <span className={`ml-auto font-mono text-sm font-black ${won ? "text-white" : "text-white/60"}`}>
                {side.score ?? 0}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="flex shrink-0 flex-col items-center gap-1">
        {openable && (
          <span title="Lineups" className="text-emerald-300/80 group-hover:text-emerald-300">
            <Users className="h-3.5 w-3.5" />
          </span>
        )}
        <button
          onClick={onToggleAgenda}
          className={`rounded-md p-1 transition-colors ${
            bookmarked ? "text-amber-400 bg-amber-400/15" : "text-white/40 hover:text-amber-300 hover:bg-white/10"
          }`}
          title={bookmarked ? "Remove from Scouting Agenda" : "Add to Scouting Agenda"}
        >
          {bookmarked ? <BookmarkCheck className="h-3.5 w-3.5 fill-amber-400" /> : <Bookmark className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
