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
    // GK at 93%, outfield lines spread between 83% and 56% of the pitch height (keeps strikers 12% apart across halfway)
    const y = i === 0 ? 93 : lines <= 1 ? 70 : 83 - ((i - 1) * 27) / (lines - 1);
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
        <div className="h-8 w-8 overflow-hidden rounded-full border-2 border-white/80 bg-slate-800 shadow-lg shadow-black/50 group-hover/token:border-primary sm:h-10 sm:w-10">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover object-top" />
          ) : (
            <PlayerSilhouette className="h-full w-full p-1 text-slate-500" />
          )}
        </div>
        {p.shirt != null && (
          <span
            style={{ fontFamily: "var(--font-barlow-condensed), ui-sans-serif, system-ui" }}
            className="absolute -bottom-0.5 -left-4 min-w-[20px] text-center rounded bg-slate-950/95 border border-white/30 px-1 py-[1px] text-[12px] font-black leading-none tracking-tight text-white shadow-[0_2px_6px_rgba(0,0,0,0.8)]"
          >
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
      <span
        style={{ fontFamily: "var(--font-barlow-condensed), ui-sans-serif, system-ui" }}
        className="max-w-[74px] sm:max-w-[84px] text-center break-words rounded bg-black/70 px-1 py-[1px] text-[10px] font-black uppercase tracking-wide leading-[1.05] text-white sm:text-[11px]"
      >
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

  const hasFormation = Boolean(l?.home?.formation?.trim() || l?.away?.formation?.trim());
  const onBy = new Map<string, number>();
  for (const s of l?.substitutions || []) {
    if (s.onId) onBy.set(s.onId, s.min);
  }

  return (
    <Modal isOpen onClose={onClose} title={title} description={match.competition} size="2xl">
      {error ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{error}</p>
      ) : !data ? (
        <LoadingState message="Loading lineups..." />
      ) : !l || (!l.home && !l.away) ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Lineups are not available yet. They appear about an hour before kick-off.
        </p>
      ) : (
        <div className={hasFormation
          ? "grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)_265px] items-start"
          : "grid gap-4 lg:grid-cols-[minmax(0,1fr)_290px_minmax(0,1fr)] items-start"
        }>
          {/* Match Events: left when pitch is shown, center when tables are shown */}
          <div className={`rounded-xl border border-white/10 bg-navy-950/60 p-3.5 max-h-[calc(100vh-12rem)] overflow-y-auto ${hasFormation ? "" : "lg:order-2"}`}>
            <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-400">Match events</h4>
            {timeline.length > 0 ? (
              <ul className="space-y-2 text-[13px] leading-snug">
                {timeline.map((e, i) => (
                  <li
                    key={i}
                    className={`flex items-center gap-2 ${e.team === "away" ? "flex-row-reverse text-right" : ""}`}
                  >
                    <span className="w-8 shrink-0 font-mono text-xs font-semibold text-slate-400">{e.min}&apos;</span>
                    {e.kind === "goal" ? (
                      <span>⚽</span>
                    ) : e.kind === "card" ? (
                      <span className={`h-3.5 w-2.5 rounded-[2px] shrink-0 ${e.type === "YC" ? "bg-yellow-400" : "bg-red-500"}`} />
                    ) : (
                      <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                    )}
                    <span className="min-w-0 flex-1 break-words text-white font-medium">
                      {e.kind === "sub" ? (
                        <>
                          {e.onName} <span className="text-slate-400 font-normal">for {e.offName}</span>
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
            ) : (
              <p className="text-xs text-slate-500">No events recorded.</p>
            )}
          </div>

          {/* Center: Pitch or Tables */}
          {hasFormation ? (
          <div className="mx-auto w-full max-w-[540px]">
            <TeamHeader team={match.away} formation={l.away?.formation} />
            <div className="relative my-1.5 aspect-[68/102] max-h-[calc(100vh-11rem)] w-full overflow-hidden rounded-xl border border-white/20 bg-gradient-to-b from-emerald-800 via-emerald-700 to-emerald-800 shadow-inner">
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
          ) : (
            <>
              {([
                { side: "home" as const, team: match.home, lineup: l.home, orderClass: "lg:order-1" },
                { side: "away" as const, team: match.away, lineup: l.away, orderClass: "lg:order-3" },
              ]).map(({ side, team, lineup, orderClass }) => (
                <div key={side} className={`rounded-xl border border-white/10 bg-navy-950/60 overflow-hidden flex flex-col max-h-[calc(100vh-12rem)] overflow-y-auto ${orderClass}`}>
                  <div className="px-3.5 py-2.5 border-b border-white/10 bg-white/[0.03] sticky top-0 z-10 backdrop-blur-sm">
                    <TeamHeader team={team} />
                  </div>
                  <div className="divide-y divide-white/5 text-xs">
                    <div className="grid grid-cols-[36px_1fr_auto] gap-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-black/20">
                      <span>#</span>
                      <span>Starting XI</span>
                      <span className="text-right">Events</span>
                    </div>
                    {(lineup?.starters || []).map((p) => {
                      const g = events.goalsBy.get(p.id) || 0;
                      const card = events.cardBy.get(p.id);
                      const offMin = events.offBy.get(p.id);
                      const photo = data.photos[p.id];
                      const clickable = Boolean(onPlayerClick && data.known.has(p.id));
                      return (
                        <div
                          key={p.id}
                          onClick={clickable ? () => onPlayerClick!(p.id) : undefined}
                          className={`grid grid-cols-[36px_1fr_auto] items-center gap-2 px-3 py-1.5 ${
                            clickable ? "cursor-pointer hover:bg-white/[0.04]" : ""
                          }`}
                        >
                          <span
                            style={{ fontFamily: "var(--font-barlow-condensed), ui-sans-serif, system-ui" }}
                            className="text-center rounded bg-white/5 py-0.5 text-[14px] font-black leading-none text-white"
                          >
                            {p.shirt ?? "—"}
                          </span>
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="h-7 w-7 rounded-full overflow-hidden bg-slate-800 border border-white/15 shrink-0">
                              {photo ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={photo} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
                              ) : (
                                <PlayerSilhouette className="h-full w-full p-1 text-slate-500" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div
                                style={{ fontFamily: "var(--font-barlow-condensed), ui-sans-serif, system-ui" }}
                                className="text-[14px] font-black uppercase tracking-wider text-white break-words leading-tight flex items-center gap-1.5"
                              >
                                <span>{p.name}</span>
                                {p.captain && <span className="text-[11px] font-bold text-amber-400">(C)</span>}
                              </div>
                              <div className="text-[10px] text-slate-400">{p.pos}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {g > 0 && <span className="text-[11px]">{g > 1 ? `⚽×${g}` : "⚽"}</span>}
                            {card && (
                              <span className={`h-3 w-2 rounded-[1px] ${card === "YC" ? "bg-yellow-400" : "bg-red-500"}`} />
                            )}
                            {offMin != null && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 font-mono text-[10px]">
                                ↓ {offMin}&apos;
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {(lineup?.subs || []).length > 0 && (
                      <>
                        <div className="grid grid-cols-[36px_1fr_auto] gap-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-black/20">
                          <span>#</span>
                          <span>Substitutes</span>
                          <span className="text-right">In</span>
                        </div>
                        {(lineup?.subs || []).map((p) => {
                          const g = events.goalsBy.get(p.id) || 0;
                          const card = events.cardBy.get(p.id);
                          const onMin = onBy.get(p.id);
                          const photo = data.photos[p.id];
                          const clickable = Boolean(onPlayerClick && data.known.has(p.id));
                          return (
                            <div
                              key={p.id}
                              onClick={clickable ? () => onPlayerClick!(p.id) : undefined}
                              className={`grid grid-cols-[36px_1fr_auto] items-center gap-2 px-3 py-1.5 opacity-90 ${
                                clickable ? "cursor-pointer hover:bg-white/[0.04]" : ""
                              }`}
                            >
                              <span
                                style={{ fontFamily: "var(--font-barlow-condensed), ui-sans-serif, system-ui" }}
                                className="text-center rounded bg-white/5 py-0.5 text-[13px] font-bold leading-none text-slate-300"
                              >
                                {p.shirt ?? "—"}
                              </span>
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="h-6 w-6 rounded-full overflow-hidden bg-slate-800 border border-white/10 shrink-0">
                                  {photo ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={photo} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
                                  ) : (
                                    <PlayerSilhouette className="h-full w-full p-0.5 text-slate-500" />
                                  )}
                                </div>
                                <span
                                  style={{ fontFamily: "var(--font-barlow-condensed), ui-sans-serif, system-ui" }}
                                  className="text-[13px] font-medium uppercase tracking-wider text-slate-200 break-words leading-tight"
                                >
                                  {p.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {g > 0 && <span className="text-[11px]">{g > 1 ? `⚽×${g}` : "⚽"}</span>}
                                {card && (
                                  <span className={`h-3 w-2 rounded-[1px] ${card === "YC" ? "bg-yellow-400" : "bg-red-500"}`} />
                                )}
                                {onMin != null && (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono text-[10px]">
                                    ↑ {onMin}&apos;
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Right: Benches (only when pitch is shown; when tables are shown, subs are already under each team) */}
          {hasFormation && (
          <div className="rounded-xl border border-white/10 bg-navy-950/60 p-3.5 space-y-4 text-xs max-h-[calc(100vh-12rem)] overflow-y-auto">
            {(["away", "home"] as const).map((side) =>
              l[side]?.subs?.length ? (
                <section key={side}>
                  <h4 className="mb-2 flex items-center gap-2 font-bold uppercase tracking-wider text-slate-400">
                    <EscudoEquipo teamId={match[side].id} badgeUrl={match[side].badgeUrl} name={match[side].name} size={20} />
                    <span className="truncate">{match[side].name} · Bench</span>
                  </h4>
                  <ul className="grid grid-cols-1 gap-1">
                    {l[side]!.subs.map((p) => {
                      const clickable = !!onPlayerClick && data.known.has(p.id);
                      const onMin = onBy.get(p.id);
                      return (
                      <li
                        key={p.id}
                        onClick={clickable ? () => onPlayerClick!(p.id) : undefined}
                        title={clickable ? `View ${p.name}'s profile` : undefined}
                        className={`flex items-center gap-2 rounded-md px-1.5 py-1 text-slate-200 ${
                          clickable ? "cursor-pointer hover:bg-white/[0.06] hover:text-white" : ""
                        }`}
                      >
                        <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-slate-800 border border-white/10">
                          {data.photos[p.id] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={data.photos[p.id]} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
                          ) : (
                            <PlayerSilhouette className="h-full w-full p-0.5 text-slate-500" />
                          )}
                        </div>
                        <span className="w-5 font-mono text-slate-400 text-center">{p.shirt ?? ""}</span>
                        <span
                          style={{ fontFamily: "var(--font-barlow-condensed), ui-sans-serif, system-ui" }}
                          className="flex-1 break-words text-[13px] font-medium uppercase tracking-wider leading-tight text-slate-200"
                        >
                          {p.name}
                        </span>
                        {onMin != null && (
                          <span className="px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono text-[10px]">
                            ↑ {onMin}&apos;
                          </span>
                        )}
                      </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null
            )}
          </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function TeamHeader({ team, formation }: { team: TeamInfo; formation?: string | null }) {
  const f = (formation || "").replace(/\D/g, "").split("").join("-");
  return (
    <div className="flex items-center justify-between px-1 text-sm font-semibold text-white">
      <span className="flex min-w-0 items-center gap-2.5">
        <EscudoEquipo teamId={team.id} badgeUrl={team.badgeUrl} name={team.name} size={30} />
        <span className="truncate">{team.name}</span>
      </span>
      {f && <span className="font-mono text-xs text-slate-400">{f}</span>}
    </div>
  );
}
