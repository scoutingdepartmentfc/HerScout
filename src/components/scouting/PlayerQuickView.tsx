"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, ExternalLink } from "lucide-react";
import { CromoJugador } from "@/components/scouting/CromoJugador";
import { Bandera } from "@/components/scouting/Bandera";
import { LoadingState } from "@/components/ui/StatusStates";
import { Button } from "@/components/ui/Button";
import { notaClases } from "@/lib/notaColor";

// Quick player summary over the lineup (doesn't leave the page). Data: /api/players/[id]/summary.

interface Summary {
  id: string;
  name: string;
  matchName?: string | null;
  photoUrl?: string | null;
  country?: string | null;
  birthDate?: string | null;
  height?: number | null;
  preferredFoot?: string | null;
  shirtNumber?: number | null;
  marketValue?: number | null;
  contractUntil?: string | null;
  position?: string | null;
  teamId?: string | null;
  teamName?: string | null;
  badgeUrl?: string | null;
  leagueName?: string | null;
  leagueLogoUrl?: string | null;
  season: {
    name: string | null;
    competition: string | null;
    matches: number | null;
    starts: number | null;
    minutes: number | null;
    goals: number | null;
    assists: number | null;
    rating: number | null;
    attack: number | null;
    buildUp: number | null;
    defence: number | null;
  } | null;
}

const cache = new Map<string, Summary>();

function age(birth?: string | null) {
  if (!birth) return null;
  const b = new Date(birth);
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) a--;
  return a;
}

function money(v?: number | null) {
  if (!v) return null;
  if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
  if (v >= 1_000) return `€${Math.round(v / 1_000)}K`;
  return `€${v}`;
}

export function PlayerQuickView({
  playerId,
  onClose,
  onOpenProfile,
}: {
  playerId: string | null;
  onClose: () => void;
  onOpenProfile: (id: string) => void;
}) {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playerId) return;
    setError(null);
    const hit = cache.get(playerId);
    if (hit) {
      setData(hit);
      return;
    }
    setData(null);
    let cancelled = false;
    fetch(`/api/players/${encodeURIComponent(playerId)}/summary`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "Player not available");
        cache.set(playerId, json);
        if (!cancelled) setData(json);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  // Escape closes only this popup, not the lineup underneath (capture phase runs first)
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

  const s = data?.season;
  const facts: [string, React.ReactNode][] = data
    ? ([
        ["Age", age(data.birthDate)],
        ["Height", data.height ? `${data.height} cm` : null],
        ["Foot", data.preferredFoot],
        ["Value", money(data.marketValue)],
        ["Contract", data.contractUntil ? new Date(data.contractUntil).getFullYear() : null],
        [
          "Nationality",
          data.country ? (
            <span className="inline-flex items-center gap-1.5">
              <Bandera country={data.country} size="xs" className="rounded-sm" />
              {data.country}
            </span>
          ) : null,
        ],
      ].filter(([, v]) => v != null && v !== "") as [string, React.ReactNode][])
    : [];

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-white/15 border-t-2 border-t-primary bg-card shadow-2xl shadow-black/60">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-2 top-2 z-10 rounded p-1 text-muted-foreground hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        {error ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{error}</p>
        ) : !data ? (
          <div className="p-6">
            <LoadingState message="Loading player..." />
          </div>
        ) : (
          <div className="p-4">
            <div className="flex gap-4">
              <div className="shrink-0">
                <CromoJugador
                  size="sm"
                  j={{
                    player_id: data.id,
                    photo_url: data.photoUrl,
                    name: data.matchName || data.name,
                    team_id: data.teamId,
                    team_name: data.teamName ?? undefined,
                    badge_url: data.badgeUrl,
                    league_name: data.leagueName,
                    league_logo_url: data.leagueLogoUrl,
                    country: data.country,
                    demarcacion: data.position,
                    score_general: s?.rating != null ? Math.round(s.rating) : null,
                  }}
                />
              </div>
              <div className="min-w-0 flex-1 space-y-3 pr-5">
                <div>
                  <h3 className="truncate text-lg font-black leading-tight text-white">{data.matchName || data.name}</h3>
                  {data.matchName && data.matchName !== data.name && (
                    <p className="truncate text-[11px] text-slate-400">{data.name}</p>
                  )}
                  <p className="mt-0.5 truncate text-xs text-slate-300">
                    {data.position}
                    {data.shirtNumber ? ` · #${data.shirtNumber}` : ""}
                  </p>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                  {facts.map(([k, v]) => (
                    <div key={k} className="min-w-0">
                      <dt className="text-slate-500">{k}</dt>
                      <dd className="truncate font-semibold text-white">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            {s && (
              <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <p className="mb-2 truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">
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
                      <div className="font-mono text-base font-bold text-white">{v ?? "—"}</div>
                      <div className="text-[10px] text-slate-500">{k}</div>
                    </div>
                  ))}
                </div>
                {(s.rating != null || s.attack != null || s.buildUp != null || s.defence != null) && (
                  <div className="mt-3 grid grid-cols-4 gap-2 border-t border-white/10 pt-3 text-center">
                    {[
                      ["Rating", s.rating],
                      ["Attack", s.attack],
                      ["Build-up", s.buildUp],
                      ["Defence", s.defence],
                    ].map(([k, v]) => (
                      <div key={k as string}>
                        <div className={`font-mono text-lg font-black ${notaClases(v as number | null).text}`}>
                          {v != null ? Math.round(v as number) : "—"}
                        </div>
                        <div className="text-[10px] text-slate-500">{k}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <Button size="sm" variant="outline" onClick={() => onOpenProfile(data.id)}>
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Full profile
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
