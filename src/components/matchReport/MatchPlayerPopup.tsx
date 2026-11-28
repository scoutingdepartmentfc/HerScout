"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ExternalLink, Pencil, X } from "lucide-react";
import { CromoJugador } from "@/components/scouting/CromoJugador";
import { LoadingState } from "@/components/ui/StatusStates";
import { notaClases } from "@/lib/notaColor";
import { scoreColor, SCORE_ON_TEXT } from "@/lib/scorePalette";
import { Stars } from "./controls";
import { VS_DIMENSIONS, fmtDate } from "./types";

// S5 — Match player popup (SPEC §5b): clicking a player in any match/lineup view.

interface Props {
  playerId: string | null;
  matchId: string | null;
  matchLabel?: string;
  onClose: () => void;
  onOpenProfile: (id: string) => void;
}

const money = (v?: number | null) =>
  !v ? "—" : v >= 1_000_000 ? `€${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `€${Math.round(v / 1_000)}K` : `€${v}`;
const ageOf = (b?: string | null) => {
  if (!b) return "—";
  const d = new Date(b);
  if (isNaN(d.getTime())) return "—";
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
};

function Big({ label, v }: { label: string; v: number | null | undefined }) {
  const c = v != null ? scoreColor(v, 10) : "#5a6884";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.1em] text-[#8796b3]">{label}</div>
      <div className="text-[34px] font-extrabold leading-none tabular-nums" style={{ color: c === "#FFFFFF" ? "#e6edf7" : c }}>
        {v != null ? Number(v).toFixed(1) : "—"}
      </div>
    </div>
  );
}

export function MatchPlayerPopup({ playerId, matchId, matchLabel, onClose, onOpenProfile }: Props) {
  const [summary, setSummary] = useState<any>(null);
  const [scouting, setScouting] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "match" | "full">("overview");

  useEffect(() => {
    if (!playerId) return;
    setSummary(null);
    setScouting(null);
    setError(null);
    let cancelled = false;
    const qs = matchId ? `?matchId=${encodeURIComponent(matchId)}` : "";
    Promise.all([
      fetch(`/api/players/${encodeURIComponent(playerId)}/summary`).then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Player not available");
        return j;
      }),
      fetch(`/api/players/${encodeURIComponent(playerId)}/scouting${qs}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([s, sc]) => {
        if (cancelled) return;
        setSummary(s);
        setScouting(sc);
        setTab(sc?.thisMatch?.length ? "match" : "overview");
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [playerId, matchId]);

  // Escape closes only this popup (capture phase, before the lineup modal underneath)
  useEffect(() => {
    if (!playerId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [playerId, onClose]);

  if (!playerId || typeof document === "undefined") return null;

  const s = summary?.season;
  const mr = scouting?.thisMatch?.[0] || null; // latest published report of this match
  const fr = scouting?.latestFullReport || null;
  const stars = scouting?.stars;
  const tabBtn = (k: typeof tab, label: React.ReactNode) => (
    <button
      type="button"
      onClick={() => setTab(k)}
      className={`px-1 pb-2 text-[13.5px] border-b-2 -mb-px transition-colors ${
        tab === k ? "border-[#7166F2] text-white font-semibold" : "border-transparent text-[#8796b3] hover:text-white"
      }`}
    >
      {label}
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-[880px] max-h-[92vh] overflow-y-auto rounded-[14px] border border-[#22304d] bg-[#0b1222] shadow-2xl">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 w-8 h-8 rounded-md border border-[#22304d] text-[#8796b3] hover:text-white flex items-center justify-center"
        >
          <X className="h-4 w-4" />
        </button>

        {error ? (
          <p className="p-10 text-center text-sm text-[#8796b3]">{error}</p>
        ) : !summary ? (
          <div className="p-8">
            <LoadingState message="Loading player..." />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex flex-col sm:flex-row gap-5 p-5 pb-3">
              <div className="shrink-0 self-center sm:self-start">
                <CromoJugador
                  size="sm"
                  j={{
                    player_id: summary.id,
                    photo_url: summary.photoUrl,
                    name: summary.matchName || summary.name,
                    team_id: summary.teamId,
                    team_name: summary.teamName ?? undefined,
                    badge_url: summary.badgeUrl,
                    league_name: summary.leagueName,
                    league_logo_url: summary.leagueLogoUrl,
                    country: summary.country,
                    demarcacion: summary.position,
                    score_general: s?.rating != null ? Math.round(s.rating) : null,
                  }}
                />
              </div>
              <div className="min-w-0 flex-1 pr-8">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h3 className="text-[26px] font-extrabold uppercase leading-none text-white">{summary.matchName || summary.name}</h3>
                  {summary.shirtNumber && <span className="text-[13px] text-[#8796b3]">#{summary.shirtNumber}</span>}
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[13px] text-[#8796b3]">
                  <span className="rounded-full border border-[#7166F2]/60 bg-[#7166F2]/15 px-2 py-[1px] text-[11.5px] font-semibold text-[#c9c4ff]">
                    {summary.position || "—"}
                  </span>
                  <span className="truncate">{summary.teamName || "—"}</span>
                  {scouting?.teamTier && (
                    <span className="rounded-[4px] border border-[#3b6ff5]/50 px-1.5 text-[10.5px] font-extrabold text-[#8fb0ff]">{scouting.teamTier}</span>
                  )}
                </div>
                <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2.5 text-[12px]">
                  {[
                    ["Age", ageOf(summary.birthDate)],
                    ["Height · Foot", `${summary.height ? `${summary.height} cm` : "—"} · ${summary.preferredFoot || "—"}`],
                    ["Value", money(summary.marketValue)],
                    ["Contract", summary.contractUntil ? new Date(summary.contractUntil).getFullYear() : "—"],
                    ["Season", s ? `${s.matches ?? "—"} apps · ${s.minutes ?? "—"}'` : "—"],
                    ["Goals · Assists", s ? `${s.goals ?? 0} · ${s.assists ?? 0}` : "—"],
                    [
                      "Avg rating",
                      s?.rating != null ? (
                        <span className={`font-extrabold ${notaClases(s.rating).text}`}>{Math.round(s.rating)}</span>
                      ) : (
                        "—"
                      ),
                    ],
                    [
                      "Stars now · pot",
                      stars?.now != null || stars?.potential != null ? (
                        <span className="flex items-center gap-1.5" title={`avg of ${stars.scouts} scout${stars.scouts === 1 ? "" : "s"}`}>
                          <Stars value={stars.now} tone="now" size={13} />
                          <Stars value={stars.potential} tone="potential" size={13} />
                        </span>
                      ) : (
                        "—"
                      ),
                    ],
                  ].map(([k, v]) => (
                    <div key={k as string} className="min-w-0">
                      <dt className="text-[9.5px] uppercase tracking-[0.1em] text-[#5a6884]">{k}</dt>
                      <dd className="mt-0.5 truncate text-[14px] font-semibold text-white">{v as React.ReactNode}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex items-end gap-6 border-b border-[#1c2a45] px-5">
              {tabBtn("overview", "Overview")}
              {tabBtn("match", <>Match report{mr ? ` · ${Number(mr.matchRating).toFixed(1)}` : ""}</>)}
              {tabBtn("full", <>Full report{fr?.decision ? ` · ${fr.decision}` : ""}</>)}
              {matchLabel && <span className="ml-auto pb-2 text-[12px] text-[#8796b3] truncate">{matchLabel}</span>}
            </div>

            <div className="p-5">
              {tab === "overview" &&
                (s ? (
                  <div className="rounded-[10px] border border-[#1c2a45] bg-[#0d1628] p-4">
                    <p className="mb-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#8796b3]">
                      {s.competition} · {s.name}
                    </p>
                    <div className="grid grid-cols-5 gap-2 text-center">
                      {[
                        ["Apps", s.matches],
                        ["Starts", s.starts],
                        ["Min", s.minutes],
                        ["Goals", s.goals],
                        ["Assists", s.assists],
                      ].map(([k, v]) => (
                        <div key={k as string}>
                          <div className="text-[18px] font-bold text-white tabular-nums">{v ?? "—"}</div>
                          <div className="text-[10px] text-[#5a6884]">{k}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 grid grid-cols-4 gap-2 border-t border-[#1c2a45] pt-4 text-center">
                      {[
                        ["Rating", s.rating],
                        ["Attack", s.attack],
                        ["Build-up", s.buildUp],
                        ["Defence", s.defence],
                      ].map(([k, v]) => (
                        <div key={k as string}>
                          <div className={`text-[22px] font-black ${notaClases(v as number | null).text}`}>{v != null ? Math.round(v as number) : "—"}</div>
                          <div className="text-[10px] text-[#5a6884]">{k}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="py-6 text-center text-[13px] text-[#8796b3]">No season data yet.</p>
                ))}

              {tab === "match" &&
                (mr ? (
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="rounded-[10px] border border-[#1c2a45] bg-[#0d1628] p-4">
                        <div className="flex flex-wrap items-end gap-6">
                          <Big label="Scout" v={mr.matchRating} />
                          <Big label="Opta" v={mr.optaRating} />
                          <Big label={`Adjusted vs ${mr.opponentTier || "?"}`} v={mr.adjustedRating} />
                          <div className="ml-auto text-right text-[12px] text-[#8796b3]">
                            <div className="text-[#c8d3e6]">
                              {mr.scoutName} · {mr.mode === "video" ? "Video" : "Live"}
                            </div>
                            <div>
                              {mr.positionStart || "—"}
                              {mr.positionEnd && mr.positionEnd !== mr.positionStart ? ` → ${mr.positionEnd}` : ""} · {mr.systemStart || "—"}
                              {mr.systemEnd && mr.systemEnd !== mr.systemStart ? ` → ${mr.systemEnd}` : ""}
                              {mr.minutes != null ? ` · ${mr.minutes}'` : ""}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-[#1c2a45] pt-3 text-[13px] text-[#e6edf7]">
                          {mr.eventing?.goals ? <span>⚽ {mr.eventing.goals}</span> : null}
                          {mr.eventing?.assists ? <span>🅰 {mr.eventing.assists}</span> : null}
                          {mr.eventing?.shots != null && <span>Shots {mr.eventing.shots}{mr.eventing.shots_on != null ? ` (${mr.eventing.shots_on} on)` : ""}</span>}
                          {mr.eventing?.key_passes != null && <span>Key passes {mr.eventing.key_passes}</span>}
                          {mr.eventing?.dribbles_att != null && <span>Dribbles {mr.eventing.dribbles_won ?? 0}/{mr.eventing.dribbles_att}</span>}
                          {mr.eventing?.duels_total != null && <span>Duels {mr.eventing.duels_won ?? 0}/{mr.eventing.duels_total}</span>}
                        </div>
                      </div>
                      <div className="rounded-[10px] border border-[#1c2a45] bg-[#0d1628] p-4">
                        <div className="text-[10.5px] uppercase tracking-[0.1em] text-[#8796b3]">Vs last time</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {VS_DIMENSIONS.filter((d) => mr.vsLast?.[d.key] != null).map((d) => {
                            const v = mr.vsLast[d.key];
                            return (
                              <span
                                key={d.key}
                                className={`rounded-[6px] border px-2 py-1 text-[12px] ${
                                  v > 0 ? "border-[#34d399]/60 text-[#6BE88F]" : v < 0 ? "border-[#f05252]/60 text-[#ff8a8a]" : "border-[#22304d] text-[#c8d3e6]"
                                }`}
                              >
                                {v > 0 ? "▲" : v < 0 ? "▼" : "="} {d.label}
                              </span>
                            );
                          })}
                          {(mr.watchFor || [])
                            .filter((w: any) => w.result && w.result !== "not_seen")
                            .map((w: any) => (
                              <span
                                key={w.item}
                                className={`rounded-[6px] border px-2 py-1 text-[12px] ${
                                  w.result === "better" ? "border-[#34d399]/60 text-[#6BE88F]" : w.result === "worse" ? "border-[#f05252]/60 text-[#ff8a8a]" : "border-[#22304d] text-[#c8d3e6]"
                                }`}
                              >
                                {w.result === "better" ? "▲" : w.result === "worse" ? "▼" : "="} {w.item}
                              </span>
                            ))}
                          {!mr.vsLast && !(mr.watchFor || []).length && <span className="text-[12px] text-[#5a6884]">First time seen.</span>}
                        </div>
                        {mr.tagsSeen?.length > 0 && (
                          <>
                            <div className="mt-3 text-[10.5px] uppercase tracking-[0.1em] text-[#8796b3]">Tags seen</div>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {mr.tagsSeen.map((t: string) => (
                                <span key={t} className="rounded-[6px] border border-[#22304d] px-2 py-1 text-[12px] text-[#c8d3e6]">
                                  {t}
                                </span>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    {mr.playerNote && (
                      <div className="rounded-[10px] border border-[#1c2a45] bg-[#0d1628] p-4">
                        <div className="text-[10.5px] uppercase tracking-[0.1em] text-[#8796b3]">Player note</div>
                        <p className="mt-1.5 text-[14px] text-[#e6edf7]">{mr.playerNote}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-8 text-center">
                    <p className="text-[13px] text-[#8796b3]">No match report for this player in this match yet.</p>
                    {matchId && (
                      <Link
                        href={`/matches/${encodeURIComponent(matchId)}/report?player=${encodeURIComponent(playerId)}`}
                        className="rounded-[7px] bg-[#3B6FF5] px-4 py-2 text-[12px] font-bold uppercase tracking-[0.06em] text-white hover:bg-[#5B8CFF]"
                      >
                        Rate this player
                      </Link>
                    )}
                  </div>
                ))}

              {tab === "full" &&
                (fr ? (
                  <div className="rounded-[10px] border border-[#1c2a45] bg-[#0d1628] p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-[8px] border border-[#34d399]/40 bg-[#34d399]/10 px-3 py-1.5 text-[14px] font-extrabold uppercase text-[#6BE88F]">
                        {fr.decision || "—"}
                      </span>
                      {fr.score != null && (
                        <span className="rounded-[6px] px-2 py-1 text-[14px] font-extrabold" style={{ backgroundColor: scoreColor(fr.score), color: SCORE_ON_TEXT }}>
                          {fr.score}
                        </span>
                      )}
                      <span className="text-[12px] text-[#8796b3]">
                        {fmtDate(fr.date, { day: "2-digit", month: "2-digit", year: "numeric" })} · {fr.scoutName}
                      </span>
                      <Link href={`/reports/${fr.id}`} className="ml-auto text-[12px] text-[#5b8cff] hover:underline">
                        Open full report ↗
                      </Link>
                    </div>
                    {fr.opinion && <p className="mt-3 border-l-2 border-[#7166F2] pl-3 text-[13.5px] italic text-[#e6edf7]">“{fr.opinion}”</p>}
                  </div>
                ) : (
                  <p className="py-6 text-center text-[13px] text-[#8796b3]">No full report yet.</p>
                ))}
            </div>

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#1c2a45] px-5 py-3">
              {matchId && (
                <Link
                  href={`/matches/${encodeURIComponent(matchId)}/report?player=${encodeURIComponent(playerId)}`}
                  className="flex items-center gap-1.5 rounded-[7px] border border-[#22304d] px-3.5 py-2 text-[12px] font-bold uppercase tracking-[0.06em] text-white hover:border-[#5b8cff]"
                >
                  <Pencil className="w-3.5 h-3.5" /> {mr ? "Edit match report" : "Rate this player"}
                </Link>
              )}
              <button
                type="button"
                onClick={() => onOpenProfile(summary.id)}
                className="flex items-center gap-1.5 rounded-[7px] bg-[#3B6FF5] px-3.5 py-2 text-[12px] font-bold uppercase tracking-[0.06em] text-white hover:bg-[#5B8CFF]"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Full profile
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
