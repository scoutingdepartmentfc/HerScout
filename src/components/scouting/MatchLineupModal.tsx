"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { EscudoEquipo } from "@/components/scouting/EscudoEquipo";
import { PlayerSilhouette } from "@/components/scouting/PlayerSilhouette";
import { LoadingState } from "@/components/ui/StatusStates";
import { ArrowLeftRight } from "lucide-react";

// Lineups stored by the `match-live` Edge Function in matches.lineups
interface LineupPlayer {
  id: string;
  name: string;
  shirt?: number | null;
  pos: string;
  side?: string | null;
  place?: number | null;
  captain?: boolean;
}
interface TeamLineup {
  formation?: string | null;
  starters: LineupPlayer[];
  subs: LineupPlayer[];
}
interface MatchEvent {
  team: "home" | "away" | null;
  min: number;
  playerId?: string;
  name?: string;
  type?: string;
  onId?: string;
  onName?: string;
  offId?: string;
  offName?: string;
}
interface Lineups {
  home: TeamLineup | null;
  away: TeamLineup | null;
  goals: MatchEvent[];
  cards: MatchEvent[];
  substitutions: MatchEvent[];
}

interface TeamInfo {
  id?: string;
  name?: string;
  badgeUrl?: string | null;
  score?: number | null;
}

export interface LineupMatch {
  id: string;
  status: string;
  competition?: string;
  home: TeamInfo;
  away: TeamInfo;
}

// Session cache: reopening a match costs nothing
type LineupData = { lineups: Lineups | null; photos: Record<string, string>; known: Set<string> };
const cache = new Map<string, LineupData>();

// ---- placement on the pitch ----
const DEPTH: Record<string, number> = {
  Goalkeeper: 0,
  Defender: 1,
  "Wing Back": 1.5,
  "Defensive Midfielder": 2,
  Midfielder: 3,
  "Attacking Midfielder": 4,
  Forward: 5,
  Striker: 5,
};
const SIDE: Record<string, number> = {
  Left: 0,
  "Left/Centre": 1,
  Centre: 2,
  "Centre/Right": 3,
  "Right/Centre": 3,
  Right: 4,
};

/** Rows from back to front ([GK], [defence], ...), each ordered left → right from the team's view. */
function toRows(team: TeamLineup): LineupPlayer[][] {
  const gk = team.starters.filter((p) => p.pos === "Goalkeeper");
  const outfield = team.starters
    .filter((p) => p.pos !== "Goalkeeper")
    .sort((a, b) => (DEPTH[a.pos] ?? 3) - (DEPTH[b.pos] ?? 3) || (a.place ?? 99) - (b.place ?? 99));

  const digits = (team.formation || "").replace(/\D/g, "").split("").map(Number).filter((n) => n > 0);
  const sizes = digits.reduce((a, b) => a + b, 0) === outfield.length ? digits : null;

  const rows: LineupPlayer[][] = [gk];
  if (sizes) {
    let i = 0;
    for (const n of sizes) {
      rows.push(outfield.slice(i, i + n));
      i += n;
    }
  } else {
    // Unknown formation: group by position depth
    const byDepth = new Map<number, LineupPlayer[]>();
    for (const p of outfield) {
      const d = DEPTH[p.pos] ?? 3;
      byDepth.set(d, [...(byDepth.get(d) || []), p]);
    }
    Array.from(byDepth.keys())
      .sort((a, b) => a - b)
      .forEach((d) => rows.push(byDepth.get(d)!));
  }
  return rows.map((r) =>
    [...r].sort((a, b) => (SIDE[a.side || "Centre"] ?? 2) - (SIDE[b.side || "Centre"] ?? 2) || (a.place ?? 0) - (b.place ?? 0))
  );
}

/** % coordinates on a vertical pitch: home defends the bottom, away the top (mirrored). */
function positions(team: TeamLineup, isHome: boolean) {
  const rows = toRows(team);
  const out: { p: LineupPlayer; x: number; y: number }[] = [];
  const lines = rows.length - 1;
  rows.forEach((row, i) => {
    // GK at 93%, outfield lines spread between 80% and 57% of the pitch height
    const y = i === 0 ? 93 : lines <= 1 ? 70 : 80 - ((i - 1) * 23) / (lines - 1);
    row.forEach((p, j) => {
      const x = ((j + 1) / (row.length + 1)) * 100;
      out.push(isHome ? { p, x, y } : { p, x: 100 - x, y: 100 - y });
    });
  });
  return out;
}

function PlayerToken({
  p,
  photo,
  goals,
  card,
  subbedOff,
  onClick,
}: {
  p: LineupPlayer;
  photo?: string;
  goals: number;
  card?: string;
  subbedOff?: number;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick, title: `View ${p.name}'s profile` } : {})}
      className={`group/token flex w-16 flex-col items-center gap-0.5 sm:w-20 ${
        onClick ? "cursor-pointer transition-transform hover:scale-110 focus:outline-none focus-visible:scale-110" : ""
      }`}
    >
      <div className="relative">
        <div className="h-9 w-9 overflow-hidden rounded-full border-2 border-white/80 bg-slate-800 shadow-lg shadow-black/50 group-hover/token:border-primary sm:h-11 sm:w-11">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover object-top" />
          ) : (
            <PlayerSilhouette className="h-full w-full p-1 text-slate-500" />
          )}
        </div>
        {p.shirt != null && (
          <span className="absolute -bottom-1 -left-1 rounded-sm bg-slate-950/90 px-1 font-mono text-[9px] font-bold text-white">
            {p.shirt}
          </span>
        )}
        {goals > 0 && (
          <span className="absolute -right-1.5 -top-1 flex items-center rounded-full bg-white px-1 text-[9px] font-black text-slate-950 shadow">
            ⚽{goals > 1 ? goals : ""}
          </span>
        )}
        {card && (
          <span
            className={`absolute -right-1 bottom-0 h-3 w-2 rounded-[1px] shadow ${
              card === "YC" ? "bg-yellow-400" : "bg-red-500"
            }`}
          />
        )}
        {subbedOff != null && (
          <span className="absolute -left-2 -top-1 rounded-full bg-rose-500/90 px-1 text-[8px] font-bold text-white">
            {subbedOff}&apos;
          </span>
        )}
      </div>
      <span className="max-w-full truncate rounded bg-black/55 px-1 text-[10px] font-semibold leading-tight text-white sm:text-[11px]">
        {p.name}
        {p.captain ? " (C)" : ""}
      </span>
    </Tag>
  );
}

export function MatchLineupModal({
  match,
  onClose,
  onPlayerClick,
}: {
  match: LineupMatch | null;
  onClose: () => void;
  /** Open the player's profile (only players we have in the Player Database) */
  onPlayerClick?: (playerId: string) => void;
}) {
  const [data, setData] = useState<LineupData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!match) return;
    setError(null);
    const hit = cache.get(match.id);
    if (hit) {
      setData(hit);
      return;
    }
    setData(null);
    let cancelled = false;
    fetch(`/api/matches/${encodeURIComponent(match.id)}/lineups`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "Lineups unavailable");
        const value: LineupData = {
          lineups: json.lineups as Lineups | null,
          photos: (json.photos || {}) as Record<string, string>,
          known: new Set<string>(json.known || []),
        };
        if (match.status === "Played") cache.set(match.id, value);
        if (!cancelled) setData(value);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [match]);

  const l = data?.lineups;
  const events = useMemo(() => {
    const goalsBy = new Map<string, number>();
    const cardBy = new Map<string, string>();
    const offBy = new Map<string, number>();
    for (const g of l?.goals || []) if (g.playerId && g.type !== "OG") goalsBy.set(g.playerId, (goalsBy.get(g.playerId) || 0) + 1);
    for (const c of l?.cards || []) if (c.playerId) cardBy.set(c.playerId, c.type === "YC" && !cardBy.has(c.playerId) ? "YC" : "RC");
    for (const s of l?.substitutions || []) if (s.offId) offBy.set(s.offId, s.min);
    return { goalsBy, cardBy, offBy };
  }, [l]);

  if (!match) return null;
  const played = match.status === "Played";
  const title = `${match.home.name ?? "Home"} ${played ? `${match.home.score ?? 0} – ${match.away.score ?? 0}` : "vs"} ${
    match.away.name ?? "Away"
  }`;

  const timeline = [
    ...(l?.goals || []).map((e) => ({ ...e, kind: "goal" as const })),
    ...(l?.cards || []).map((e) => ({ ...e, kind: "card" as const })),
    ...(l?.substitutions || []).map((e) => ({ ...e, kind: "sub" as const })),
  ].sort((a, b) => a.min - b.min);

  return (
    <Modal isOpen onClose={onClose} title={title} description={match.competition} size="xl">
      {error ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{error}</p>
      ) : !data ? (
        <LoadingState message="Loading lineups..." />
      ) : !l || (!l.home && !l.away) ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Lineups are not available yet. They appear about an hour before kick-off.
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
          {/* Pitch */}
          <div className="mx-auto w-full max-w-[520px]">
            <TeamHeader team={match.away} formation={l.away?.formation} />
            <div className="relative my-2 aspect-[68/100] w-full overflow-hidden rounded-lg border border-white/20 bg-gradient-to-b from-emerald-800 via-emerald-700 to-emerald-800 shadow-inner">
              {/* stripes */}
              <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.04)_0,rgba(255,255,255,0.04)_7.14%,transparent_7.14%,transparent_14.28%)]" />
              {/* markings */}
              <div className="absolute inset-[3%] rounded-sm border-2 border-white/40" />
              <div className="absolute left-[3%] right-[3%] top-1/2 border-t-2 border-white/40" />
              <div className="absolute left-1/2 top-1/2 h-[18%] w-[26%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/40" />
              <div className="absolute left-1/2 top-[3%] h-[15%] w-[46%] -translate-x-1/2 border-2 border-t-0 border-white/40" />
              <div className="absolute bottom-[3%] left-1/2 h-[15%] w-[46%] -translate-x-1/2 border-2 border-b-0 border-white/40" />
              <div className="absolute left-1/2 top-[3%] h-[6%] w-[20%] -translate-x-1/2 border-2 border-t-0 border-white/40" />
              <div className="absolute bottom-[3%] left-1/2 h-[6%] w-[20%] -translate-x-1/2 border-2 border-b-0 border-white/40" />

              {(["home", "away"] as const).map((side) =>
                l[side]
                  ? positions(l[side]!, side === "home").map(({ p, x, y }) => (
                      <div
                        key={`${side}-${p.id}`}
                        className="absolute -translate-x-1/2 -translate-y-1/2"
                        style={{ left: `${x}%`, top: `${y}%` }}
                      >
                        <PlayerToken
                          p={p}
                          onClick={onPlayerClick && data.known.has(p.id) ? () => onPlayerClick(p.id) : undefined}
                          photo={data.photos[p.id]}
                          goals={events.goalsBy.get(p.id) || 0}
                          card={events.cardBy.get(p.id)}
                          subbedOff={events.offBy.get(p.id)}
                        />
                      </div>
                    ))
                  : null
              )}
            </div>
            <TeamHeader team={match.home} formation={l.home?.formation} />
          </div>

          {/* Events + benches */}
          <div className="space-y-4 text-xs">
            {timeline.length > 0 && (
              <section>
                <h4 className="mb-2 font-bold uppercase tracking-wider text-slate-400">Match events</h4>
                <ul className="space-y-1.5">
                  {timeline.map((e, i) => (
                    <li
                      key={i}
                      className={`flex items-center gap-2 ${e.team === "away" ? "flex-row-reverse text-right" : ""}`}
                    >
                      <span className="w-8 shrink-0 font-mono text-slate-400">{e.min}&apos;</span>
                      {e.kind === "goal" ? (
                        <span>⚽</span>
                      ) : e.kind === "card" ? (
                        <span className={`h-3 w-2 rounded-[1px] ${e.type === "YC" ? "bg-yellow-400" : "bg-red-500"}`} />
                      ) : (
                        <ArrowLeftRight className="h-3 w-3 text-sky-400" />
                      )}
                      <span className="min-w-0 truncate text-white">
                        {e.kind === "sub" ? (
                          <>
                            {e.onName} <span className="text-slate-500">for {e.offName}</span>
                          </>
                        ) : (
                          <>
                            {e.name}
                            {e.type === "PG" ? " (pen.)" : e.type === "OG" ? " (o.g.)" : ""}
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {(["home", "away"] as const).map((side) =>
              l[side]?.subs?.length ? (
                <section key={side}>
                  <h4 className="mb-2 flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-400">
                    <EscudoEquipo teamId={match[side].id} badgeUrl={match[side].badgeUrl} name={match[side].name} size={14} />
                    Bench
                  </h4>
                  <ul className="grid grid-cols-1 gap-1">
                    {l[side]!.subs.map((p) => {
                      const clickable = !!onPlayerClick && data.known.has(p.id);
                      return (
                      <li
                        key={p.id}
                        onClick={clickable ? () => onPlayerClick!(p.id) : undefined}
                        title={clickable ? `View ${p.name}'s profile` : undefined}
                        className={`flex items-center gap-2 rounded px-1 text-slate-200 ${
                          clickable ? "cursor-pointer hover:bg-white/[0.06] hover:text-white" : ""
                        }`}
                      >
                        <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-slate-800">
                          {data.photos[p.id] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={data.photos[p.id]} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
                          ) : (
                            <PlayerSilhouette className="h-full w-full p-0.5 text-slate-500" />
                          )}
                        </div>
                        <span className="w-5 font-mono text-slate-500">{p.shirt ?? ""}</span>
                        <span className="truncate">{p.name}</span>
                      </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function TeamHeader({ team, formation }: { team: TeamInfo; formation?: string | null }) {
  const f = (formation || "").replace(/\D/g, "").split("").join("-");
  return (
    <div className="flex items-center justify-between px-1 text-sm font-semibold text-white">
      <span className="flex min-w-0 items-center gap-2">
        <EscudoEquipo teamId={team.id} badgeUrl={team.badgeUrl} name={team.name} size={20} />
        <span className="truncate">{team.name}</span>
      </span>
      {f && <span className="font-mono text-xs text-slate-400">{f}</span>}
    </div>
  );
}
