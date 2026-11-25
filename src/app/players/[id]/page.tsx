"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useThemeContext } from "@/context/ThemeContext";
import { CromoJugador } from "@/components/scouting/CromoJugador";
import { MarcadorEstadio } from "@/components/scouting/MarcadorEstadio";
import { MetricsAccordion } from "@/components/scouting/MetricsAccordion";
import { NotasResumen } from "@/components/scouting/NotasResumen";
import { FisicoFM } from "@/components/scouting/FisicoFM";
import { TemporadasOpta, CoberturaBadges, claveTemporada } from "@/components/scouting/TemporadasOpta";
import { notaClases } from "@/lib/notaColor";
import { Bandera } from "@/components/scouting/Bandera";
import { EscudoEquipo } from "@/components/scouting/EscudoEquipo";
import { LogoLiga } from "@/components/scouting/LogoLiga";
import { CamisetaDorsal } from "@/components/scouting/CamisetaDorsal";
import { MarketValueChart } from "@/components/scouting/MarketValueChart";
import { TransferTimeline } from "@/components/scouting/TransferTimeline";
import { NationalTeamGrid } from "@/components/scouting/NationalTeamGrid";
import { InjuryAnatomy } from "@/components/scouting/InjuryAnatomy";
import { RatingEvolutionChart } from "@/components/scouting/RatingEvolutionChart";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { LoadingState, ErrorState } from "@/components/ui/StatusStates";
import { ArrowLeft, Bookmark, FileText, Calendar, Plus, ExternalLink, Shield, Pencil, Trophy, ChevronDown, Check } from "lucide-react";
import { EditPlayerModal } from "@/components/scouting/EditPlayerModal";
import { computeRatingTrend } from "@/lib/ratingTrend";
import { PositionRadar } from "@/components/scouting/PositionRadar";

// Position English translation and coordinates helper
const translatePosition = (pos?: string | null) => {
  if (!pos) return "—";
  const pLower = pos.toLowerCase();
  if (pLower.includes("porter") || pLower.includes("goalkeeper") || pLower === "gk") return "Goalkeeper";
  if (pLower.includes("central derecho") || pLower === "rcb") return "Right Centre-Back";
  if (pLower.includes("central izquierdo") || pLower === "lcb") return "Left Centre-Back";
  if (pLower.includes("central") || pLower.includes("centre-back") || pLower === "cb") return "Centre-Back";
  if (pLower.includes("lateral derecho") || pLower.includes("right-back") || pLower === "rb") return "Right-Back";
  if (pLower.includes("lateral izquierdo") || pLower.includes("left-back") || pLower === "lb") return "Left-Back";
  if (pLower.includes("defensivo") || pLower.includes("defensive midfield") || pLower === "cdm") return "Defensive Midfielder";
  if (pLower.includes("mediocentro") || pLower.includes("central midfield") || pLower === "cm") return "Central Midfielder";
  if (pLower.includes("mediapunta") || pLower.includes("attacking midfield") || pLower === "cam") return "Attacking Midfielder";
  if (pLower.includes("extremo derecho") || pLower.includes("right winger") || pLower === "rw") return "Right Winger";
  if (pLower.includes("extremo izquierdo") || pLower.includes("left winger") || pLower === "lw") return "Left Winger";
  if (pLower.includes("delanter") || pLower.includes("striker") || pLower.includes("forward") || pLower === "st" || pLower === "cf") return "Centre-Forward";
  return pos;
};

export default function PlayerProfilePage() {
  const params = useParams();
  const router = useRouter();
  // Opened from a match lineup (Matches page): Back returns there with the lineup open
  const [fromLineup, setFromLineup] = useState(false);
  useEffect(() => {
    setFromLineup(new URLSearchParams(window.location.search).get("from") === "lineup");
  }, []);
  const { currentClub } = useThemeContext();
  const playerId = params?.id as string;

  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seasonKey, setSeasonKey] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    async function loadPlayer() {
      if (!playerId) return;
      // Reloads after an edit keep the current page on screen
      if (reloadKey === 0) setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/players/${playerId}`);
        const json = await res.json();
        if (!res.ok || json.error) {
          throw new Error(json.error || `HTTP error ${res.status}`);
        }
        setData(json);
      } catch (err: any) {
        setError(err.message || "Failed to load player dossier");
      } finally {
        setIsLoading(false);
      }
    }
    loadPlayer();
  }, [playerId, reloadKey]);

  if (isLoading) return <LoadingState message="Loading professional player card and metrics..." />;
  if (error || !data?.player) return <ErrorState title="Player Not Found" message={error || "Profile unavailable"} onRetry={() => window.location.reload()} />;

  const p = data.player;
  // Seasons with Opta data (latest first); the selected one drives ratings, metrics and match log
  // Default: all seasons accumulated (allSeasons) when available, or the first season
  const seasons: any[] = data.seasonStats || [];
  // Default: the current season with all her competitions together (general rating = minutes-weighted average)
  const options: any[] = [data.currentSeason, data.allSeasons, ...seasons].filter(Boolean);
  const selected =
    (seasonKey ? options.find((s) => claveTemporada(s) === seasonKey) : data.currentSeason || seasons[0] || options[0]) ||
    null;
  const selectedKey = selected ? claveTemporada(selected) : null;
  const stats = selected && !selected.sinNotas ? selected : null;
  const metricas = stats?.radar_data?.metricas || {};
  // Match Ratings, by default: every match of the CURRENT season in every competition (domestic league, cups,
  // international club cups, national teams). Current = the competition's active season, unless it ended over
  // 150 days ago (stale "active" seasons of leagues no longer downloaded); 150 days keeps calendar-year leagues
  // (NWSL, Damallsvenskan) in their off-season. Picking a season in the selector shows only that one.
  const seasonInfo = new Map<string, any>(seasons.map((s: any) => [s.season_id, s.seasons]));
  const currentCutoff = Date.now() - 150 * 24 * 3600 * 1000;
  const isCurrentSeason = (seasonId: string) => {
    const si = seasonInfo.get(seasonId);
    return !!si?.is_active && (!si.end_date || new Date(si.end_date).getTime() >= currentCutoff);
  };
  const allMatches: any[] = data.matchLog || [];
  const currentMatches = allMatches.filter((m: any) => isCurrentSeason(m.seasonId));
  const showCurrent = !!selected?.esActual || (!seasonKey && !data.currentSeason && currentMatches.length > 0);
  const matchLog = showCurrent
    ? currentMatches
    : allMatches.filter(
        (m: any) =>
          !selected || selected.esTotal || (m.seasonId === selected.season_id && m.competitionId === selected.competition_id)
      );
  const marketValues = data.marketValues || [];
  const transfers = data.transfers || [];
  const nationalTeams = data.nationalTeams || [];
  const injuries = data.injuries || [];

  // Calculate age
  const age = p.birthDate
    ? Math.floor((Date.now() - new Date(p.birthDate).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;
  const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("en-GB") : "—");
  const fmtValue = (v: number | null | undefined) =>
    v ? (v >= 1_000_000 ? `€${(v / 1_000_000).toFixed(2)}m` : `€${Math.round(v / 1000)}k`) : "—";
  const peakValue = Math.max(0, ...(data.marketValues || []).map((m: any) => m.market_value || 0)) || p.marketValue;

  // Marcador de estadio cells (0-100 scale exact match from Scouting_jugadores)
  const marcadorCeldas = [
    {
      label: "General OVR",
      valor: stats?.nota_global ?? 0,
      principal: true,
      subs: [
        { label: "Consistency", valor: 82 },
        { label: "Versatility", valor: 75 },
      ],
    },
    {
      label: "Attack",
      valor: stats?.nota_ataque ?? 0,
      subs: [
        { label: "Goals p90", valor: 88 },
        { label: "Key Passes", valor: 80 },
      ],
    },
    {
      label: "Build-Up",
      valor: stats?.nota_construccion ?? 0,
      subs: [
        { label: "Pass %", valor: 83 },
        { label: "Prog Carries", valor: 76 },
      ],
    },
    {
      label: "Defense",
      valor: stats?.nota_defensa ?? 0,
      subs: [
        { label: "Tackles", valor: 68 },
        { label: "Recoveries", valor: 62 },
      ],
    },
    {
      label: "Set Pieces",
      valor: stats?.nota_balon_parado ?? 0,
      subs: [
        { label: "Corners", valor: 75 },
        { label: "Direct FK", valor: 70 },
      ],
    },
    {
      label: "Availability",
      valor: stats?.nota_disponibilidad ?? 0,
      subs: [
        { label: "Start %", valor: 94 },
        { label: "Discipline", valor: 88 },
      ],
    },
  ];

  const getPitchCoords = (pos?: string | null): { x: number; y: number } => {
    if (!pos) return { x: 50, y: 50 };
    const pLower = pos.toLowerCase();
    // Pitch is oriented horizontally (0% left = own goal, 100% right = opponent goal, Y is top to bottom)
    if (pLower.includes("porter") || pLower.includes("goalkeeper") || pLower === "gk") return { x: 10, y: 50 };
    if (pLower.includes("lateral derecho") || pLower.includes("right-back") || pLower === "rb") return { x: 28, y: 82 };
    if (pLower.includes("central derecho") || pLower === "rcb") return { x: 25, y: 62 };
    if (pLower.includes("central izquierdo") || pLower === "lcb") return { x: 25, y: 38 };
    if (pLower.includes("central") || pLower.includes("centre-back") || pLower === "cb") return { x: 25, y: 50 };
    if (pLower.includes("lateral izquierdo") || pLower.includes("left-back") || pLower === "lb") return { x: 28, y: 18 };
    if (pLower.includes("defensivo") || pLower.includes("defensive") || pLower === "cdm") return { x: 42, y: 50 };
    if (pLower.includes("mediocentro") || pLower.includes("central midfield") || pLower === "cm") return { x: 54, y: 50 };
    if (pLower.includes("mediapunta") || pLower.includes("attacking") || pLower === "cam") return { x: 68, y: 50 };
    if (pLower.includes("extremo derecho") || pLower.includes("right winger") || pLower === "rw") return { x: 78, y: 82 };
    if (pLower.includes("extremo izquierdo") || pLower.includes("left winger") || pLower === "lw") return { x: 78, y: 18 };
    if (pLower.includes("delanter") || pLower.includes("striker") || pLower.includes("forward") || pLower === "st" || pLower === "cf") return { x: 88, y: 50 };
    return { x: 55, y: 50 };
  };

  const primaryEnglishPos = translatePosition(p.primaryPosition);
  // "-" marks "no secondary positions" set by hand. Manual lists are shown in full, scraped ones capped at 2.
  const secondaryPositionsList = (p.otherPositions || [])
    .filter((x: string) => x && x !== "-" && x !== p.primaryPosition)
    .slice(0, p.manualOverrides?.otherPositions ? undefined : 2);

  // Evolución en los últimos 3 meses desde la FECHA ACTUAL (Rating Evolution Chart)
  const rawMatches = data.matchLog || [];
  const validMatches = rawMatches
    .filter((m: any) => m.rating != null && !isNaN(Number(m.rating)) && m.date)
    .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let playerTrend: "up" | "neutral" | "down" | null = null;
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const recent3mMatches = validMatches.filter((m: any) => new Date(m.date) >= threeMonthsAgo);
  const targetMatches = recent3mMatches.length > 0 ? recent3mMatches : validMatches.slice(-8);

  if (targetMatches.length > 0) {
    playerTrend = computeRatingTrend(targetMatches.map((m: any) => Number(m.rating)));
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <EditPlayerModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        player={p}
        scraped={data.scraped || p}
        translatePosition={translatePosition}
        onSaved={() => setReloadKey((k) => k + 1)}
      />
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border border-white/10 bg-navy-900/60 hover:bg-navy-800 text-slate-200 hover:text-white transition-all shadow-sm"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {fromLineup ? "Back to lineup" : "Back to Player Directory"}
        </button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" leftIcon={<Pencil className="w-3.5 h-3.5" />} onClick={() => setEditOpen(true)}>
            Edit
          </Button>
          <Button variant="outline" size="sm" leftIcon={<Bookmark className="w-3.5 h-3.5" />}>
            Add to Watchlist
          </Button>
          <Link href="/reports">
            <Button size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />}>
              Create Scouting Report
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Dossier Header: Scouting Liga F Design (Image 2) */}
      <section className="space-y-6">
        {/* Top Header Block: Card + Identity + Personal Data */}
        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-8 p-6 rounded-2xl border border-border/60 bg-[#070e1e]/90 shadow-2xl items-start">
          {/* Pure White Ultimate Team Card + Tactical Profiles */}
          <div className="mx-auto lg:mx-0 shrink-0 flex flex-col items-center gap-3.5 w-full max-w-[250px]">
            <CromoJugador
              j={{
                player_id: p.id,
                photo_url: p.photoUrl,
                name: p.matchName || p.name,
                team_id: p.teamId,
                team_name: p.teamName,
                badge_url: p.badgeUrl,
                league_name: p.leagueName,
                league_logo_url: p.leagueLogoUrl,
                country: p.country,
                demarcacion: primaryEnglishPos,
                score_general: stats?.nota_global != null ? Math.round(stats.nota_global) : (stats?.score_general ? Math.round(stats.score_general * 10) : 75),
                demarcacionesSecundarias: secondaryPositionsList,
                trend: playerTrend,
              }}
              size="md"
            />

            {p.perfiles && Object.keys(p.perfiles).length > 0 && (
              <div className="w-full rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-md p-3.5 shadow-xl space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">
                      Tactical Profiles
                    </span>
                  </div>
                  {primaryEnglishPos && (
                    <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-white/[0.07] text-slate-400 border border-white/5 truncate max-w-[95px]">
                      {primaryEnglishPos}
                    </span>
                  )}
                </div>

                <div className="space-y-2.5">
                  {Object.entries<number>(p.perfiles)
                    .sort((a, b) => Number(b[1]) - Number(a[1]))
                    .map(([profName, score], idx) => {
                      const val = Number(score);
                      const isTop = idx === 0;
                      return (
                        <div
                          key={profName}
                          className={`rounded-xl px-2.5 py-2 border transition-colors ${
                            isTop
                              ? "bg-emerald-500/[0.08] border-emerald-400/30 shadow-[0_0_16px_rgba(16,185,129,0.08)]"
                              : "bg-white/[0.02] border-white/[0.05]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {isTop && (
                                <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 shrink-0">
                                  TOP
                                </span>
                              )}
                              <span
                                className={`text-xs truncate ${
                                  isTop ? "font-bold text-emerald-200" : "font-medium text-slate-300"
                                }`}
                                title={profName}
                              >
                                {profName}
                              </span>
                            </div>
                            <span
                              className={`font-mono text-xs font-black shrink-0 ${
                                isTop ? "text-emerald-300" : "text-white"
                              }`}
                            >
                              {val.toFixed(1)}
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-white/[0.07] overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                isTop
                                  ? "bg-gradient-to-r from-emerald-400 to-teal-300 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
                                  : "bg-gradient-to-r from-sky-500/80 to-indigo-400/80"
                              }`}
                              style={{ width: `${Math.max(2, Math.min(100, val))}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Name + Club line + Stats Summary + Datos Personales */}
          <div className="space-y-6 w-full">
            {/* Player Name and Club/League Header with Modern Hero Jersey */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white">
                  {p.matchName || p.name}
                </h1>
                {p.matchName && p.matchName !== p.name && (
                  <p className="text-sm font-medium text-slate-400 mt-1 tracking-wide">
                    {p.name}
                  </p>
                )}
                <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs sm:text-sm">
                  <span className="inline-flex items-center gap-2 font-semibold text-white">
                    <EscudoEquipo teamId={p.teamId} badgeUrl={p.badgeUrl} name={p.teamName} size={22} />
                    <span>{p.teamName}</span>
                  </span>
                  <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-sky-500/10 text-sky-300 font-semibold border border-sky-400/20 text-xs shadow-sm">
                    {p.leagueLogoUrl && (
                      <img
                        src={p.leagueLogoUrl}
                        alt=""
                        className="h-4.5 w-auto max-w-[20px] rounded-sm object-contain"
                      />
                    )}
                    <span>{p.leagueName || "No current league"}</span>
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-400/10 text-amber-300 border border-amber-400/30">
                    {selected?.seasons?.name || "No Opta season"}
                  </span>
                  {selected && <CoberturaBadges c={selected.coverage} />}
                </div>
              </div>

              {/* Camiseta con dorsal: formato moderno grande que abarca desde la línea del club hasta la parte superior del nombre */}
              {p.shirtNumber && (
                <div className="shrink-0 flex flex-col items-center justify-center -mt-1 sm:-mt-2">
                  <CamisetaDorsal
                    number={p.shirtNumber}
                    teamName={p.teamName}
                    size="hero"
                  />
                </div>
              )}
            </div>
            <div>

              {/* Competition Filter & Quick Stats Row */}
              <div className="mt-4 pt-4 border-t border-border/40 text-xs space-y-3">
                {/* Competition Filter Pills (if player has competitions for current season or across seasons) */}
                {(() => {
                  const availableComps: { id: string; name: string; logoUrl?: string }[] = [];
                  const seen = new Set<string>();
                  seasons.forEach((s) => {
                    const cId = s.competition_id;
                    const cName = s.competitions?.name;
                    if (cId && cName && !seen.has(cId)) {
                      seen.add(cId);
                      availableComps.push({ id: cId, name: cName, logoUrl: s.competitions?.logo_url });
                    }
                  });

                  if (availableComps.length <= 1) return null;

                  return (
                    <div className="flex flex-wrap items-center gap-1.5 pb-1">
                      <span className="text-[11px] text-muted-foreground mr-1 flex items-center gap-1 font-medium">
                        <Trophy className="w-3 h-3 text-amber-400" /> Competition:
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          // Select allSeasons if available, or first season
                          if (data.allSeasons) setSeasonKey(claveTemporada(data.allSeasons));
                        }}
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold transition-all border ${
                          selected?.esTotal
                            ? "bg-amber-400/20 text-amber-300 border-amber-400/50 shadow-sm"
                            : "bg-navy-950/60 text-slate-400 border-white/10 hover:text-white hover:border-white/20"
                        }`}
                      >
                        All Competitions
                      </button>
                      {availableComps.map((comp) => {
                        const isCompActive = selected?.competition_id === comp.id;
                        return (
                          <button
                            key={comp.id}
                            type="button"
                            onClick={() => {
                              // Find matching season entry for this competition (prefer active/latest)
                              const match = seasons.find((s) => s.competition_id === comp.id);
                              if (match) setSeasonKey(claveTemporada(match));
                            }}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all border ${
                              isCompActive
                                ? "bg-sky-500/20 text-sky-200 border-sky-400/60 shadow-sm font-bold"
                                : "bg-navy-950/60 text-slate-400 border-white/10 hover:text-white hover:border-white/20"
                            }`}
                          >
                            {comp.logoUrl && (
                              <img src={comp.logoUrl} alt="" className="w-3.5 h-3.5 object-contain rounded-full" />
                            )}
                            <span>{comp.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Quick Stats Grid: Pos, Nat, Age, Matches, Minutes, Goals, Assists */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                  <div className="p-2 rounded-lg bg-navy-950/50 border border-white/5">
                    <div className="text-[10px] text-muted-foreground uppercase font-semibold">Position</div>
                    <div className="font-semibold text-white text-xs mt-0.5 truncate">{primaryEnglishPos}</div>
                    {p.perfil && (
                      <div className="mt-1 inline-block rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                        {p.perfil}
                      </div>
                    )}
                  </div>
                  <div className="p-2 rounded-lg bg-navy-950/50 border border-white/5">
                    <div className="text-[10px] text-muted-foreground uppercase font-semibold">Nationality</div>
                    <div className="flex items-center gap-1.5 font-semibold text-white text-xs mt-0.5 truncate">
                      <Bandera country={p.country} size="xs" />
                      <span>{p.country || "—"}</span>
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-navy-950/50 border border-white/5">
                    <div className="text-[10px] text-muted-foreground uppercase font-semibold">Age</div>
                    <div className="font-semibold text-white text-xs mt-0.5">{age ?? "—"}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-navy-950/50 border border-white/5">
                    <div className="text-[10px] text-muted-foreground uppercase font-semibold">Matches</div>
                    <div className="font-semibold text-white text-xs mt-0.5">{selected?.matches_played ?? "—"}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-navy-950/50 border border-white/5">
                    <div className="text-[10px] text-muted-foreground uppercase font-semibold">Minutes</div>
                    <div className="font-semibold text-white text-xs mt-0.5 font-mono">
                      {selected?.minutes_played ? `${selected.minutes_played}'` : "—"}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 shadow-sm">
                    <div className="text-[10px] text-emerald-400 uppercase font-semibold flex items-center gap-1">
                      <span>⚽ Goals</span>
                    </div>
                    <div className="font-mono font-black text-emerald-300 text-sm mt-0.5">
                      {selected?.goals ?? 0}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/25 shadow-sm">
                    <div className="text-[10px] text-sky-400 uppercase font-semibold flex items-center gap-1">
                      <span>🎯 Assists</span>
                    </div>
                    <div className="font-mono font-black text-sky-300 text-sm mt-0.5">
                      {selected?.assists ?? 0}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Datos Personales Box (with Soccerdonna link & Pitch mini-view) */}
            <div className="space-y-3 pt-2 border-t border-border/40">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                  Personal data
                </span>
                {p.sdUrl ? (
                  <a
                    href={p.sdUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-amber-400 transition-colors"
                  >
                    View on Soccerdonna <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-[11px] text-muted-foreground">Soccerdonna Data</span>
                )}
              </div>

              {/* Grid of demographic cards (sin weight) with mini soccer pitch */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5 text-xs">
                <div className="p-2.5 rounded-lg bg-navy-950/70 border border-border/40">
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    📈 Market value
                  </div>
                  <div className="font-bold text-amber-400 text-sm mt-1">
                    {fmtValue(p.marketValue)}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-navy-950/70 border border-border/40">
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    🏅 Peak value
                  </div>
                  <div className="font-bold text-amber-400 text-sm mt-1">
                    {fmtValue(peakValue)}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-navy-950/70 border border-border/40">
                  <div className="text-[10px] text-muted-foreground">Preferred foot</div>
                  <div className="font-medium text-white text-xs mt-1">
                    {p.preferredFoot || "—"}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-navy-950/70 border border-border/40">
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    📏 Height
                  </div>
                  <div className="font-medium text-white text-xs mt-1">
                    {p.height ? `${p.height} cm` : "—"}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-navy-950/70 border border-border/40">
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    📅 Date of birth
                  </div>
                  <div className="font-medium text-white text-xs mt-1 font-mono">
                    {fmtDate(p.birthDate)}
                  </div>
                </div>

                {/* Second Row */}
                <div className="p-2.5 rounded-lg bg-navy-950/70 border border-border/40">
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    📍 Place of birth
                  </div>
                  <div className="font-medium text-white text-xs mt-1 truncate">
                    {p.placeOfBirth || "—"}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-navy-950/70 border border-border/40">
                  <div className="text-[10px] text-muted-foreground">Nationality</div>
                  <div className="flex items-center gap-1 font-medium text-white text-xs mt-1 truncate">
                    <Bandera country={p.country} size="xs" />
                    <span>{(p.citizenship?.length ? p.citizenship.join(", ") : p.country) || "—"}</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-navy-950/70 border border-border/40">
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    📝 Contract until
                  </div>
                  <div className="font-medium text-white text-xs mt-1 font-mono">
                    {fmtDate(p.contractUntil)}
                  </div>
                </div>

                {/* Posición con mini campito táctico SVG y coordenadas exactas (takes 2 cols to complete row 2) */}
                <div className="col-span-2 p-2.5 rounded-lg bg-navy-950/70 border border-border/40 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] text-muted-foreground">Played positions</div>
                    <div className="font-bold text-white text-xs mt-0.5 leading-tight truncate">
                      {primaryEnglishPos}
                    </div>
                    {secondaryPositionsList.length > 0 && (
                      <div className="text-[10px] text-amber-300/90 font-medium truncate mt-0.5">
                        Also: {secondaryPositionsList.map(translatePosition).join(", ")}
                      </div>
                    )}
                  </div>

                  {/* Mini-campo de fútbol vectorial con coordenadas reales */}
                  {(() => {
                    const coords = getPitchCoords(p.primaryPosition);
                    const secCoords = secondaryPositionsList.map(getPitchCoords);

                    return (
                      <div className="w-20 h-11 rounded border border-emerald-500/30 bg-[#0a1829] relative shrink-0 overflow-hidden shadow-inner">
                        {/* Grass pattern */}
                        <div className="absolute inset-0 bg-gradient-to-r from-emerald-950/40 to-slate-950/60" />
                        {/* Pitch Lines */}
                        <div className="absolute inset-y-0 left-1/2 w-[1px] bg-white/20" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full border border-white/20" />
                        {/* Penalty boxes */}
                        <div className="absolute inset-y-1.5 left-0 w-3 border-r border-y border-white/20" />
                        <div className="absolute inset-y-1.5 right-0 w-3 border-l border-y border-white/20" />

                        {/* Secondary Positions (translucent amber dots) */}
                        {secCoords.map((sc: { x: number; y: number }, sIdx: number) => (
                          <div
                            key={`sec-${sIdx}`}
                            style={{ left: `${sc.x}%`, top: `${sc.y}%` }}
                            className="absolute -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-amber-400/60 border border-amber-300/80"
                            title={translatePosition(secondaryPositionsList[sIdx])}
                          />
                        ))}

                        {/* Primary Position Hotspot (glowing golden pulse) */}
                        <div
                          style={{ left: `${coords.x}%`, top: `${coords.y}%` }}
                          className="absolute -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-amber-400 border border-white shadow-[0_0_8px_rgba(251,191,36,0.9)] animate-pulse"
                          title={`Primary: ${primaryEnglishPos}`}
                        />
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Performance Rating Evolution Chart (Last 3 Months / Range Filterable) */}
        <RatingEvolutionChart
          matches={data.matchLog || []}
          playerName={p.matchName || p.name}
        />

        {/* Seasons with Opta data and what data each one has */}
        <TemporadasOpta seasons={options} selected={selectedKey} onSelect={setSeasonKey} />

        {/* Section 2: Overall + category ratings (comparable across leagues) */}
        {selected?.sinNotas ? (
          <div className="rounded-xl border border-border/60 bg-[#070e1e] p-4 text-xs text-muted-foreground">
            Not enough minutes this season for a season rating ({selected.minutes_played}&apos; played).
          </div>
        ) : (
          <NotasResumen
            stats={stats}
            metricas={metricas}
            position={p.primaryPosition}
            physical={data.physical || null}
            ea={data.eaRatings || null}
          />
        )}
        {/* Full Hierarchical Metrics Accordion (Categories • Subcategories • Metrics + Physical) */}
        <Card className="bg-[#070c18] border-border/80 p-5">
          <MetricsAccordion
            stats={stats}
            metricas={metricas}
            leagueAverages={data?.leagueAverages || {}}
            grupo={stats?.grupo_demarcacion ?? p.grupoDemarcacion}
            position={p.primaryPosition}
            physical={data.physical || null}
            ea={data.eaRatings || null}
          />
        </Card>
      </section>

      {/* Position radar: department key metrics vs. league average (+ another league) and league / overall ranking */}
      <PositionRadar
        playerId={playerId}
        competitionId={selected && !selected.esTotal && !selected.sinNotas ? selected.competition_id : null}
        seasonId={selected && !selected.esTotal && !selected.sinNotas ? selected.season_id : null}
        position={p.primaryPosition}
      />

      {/* Match-by-match ratings (FotMob-like scale: average 6.5, vs. same position group; pipeline/scoring.py) */}
      <Card className="bg-[#0b1329] border-border/60 shadow-xl overflow-hidden">
        <CardHeader className="py-3 px-5 border-b border-border/40">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                <span>Match Ratings</span>
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {showCurrent
                  ? "Current season · all competitions · "
                  : selected ? `${selected.competitions?.name || ""} ${selected.seasons?.name || ""} · ` : ""}
                Rating for every match played (0–10), latest first
              </CardDescription>
            </div>
            {matchLog.length > 0 && (
              <span className="text-[11px] font-medium text-slate-400 bg-white/5 border border-white/10 px-2.5 py-0.5 rounded-full">
                {matchLog.length} {matchLog.length === 1 ? "match" : "matches"}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {matchLog.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted-foreground">No matches played yet in this period.</p>
          ) : (
            <div className="max-h-[460px] overflow-y-auto divide-y divide-border/30 text-xs scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20">
              {matchLog.map((m: any) => {
                const posEnglish = translatePosition(m.position);
                const scoreColor = notaClases(Math.round(Number(m.rating || 0) * 10));

                return (
                  <div
                    key={m.matchId}
                    className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-white/[0.03] transition-colors"
                  >
                    {/* Left: Date, Competition Logo, Venue (Home/Away), Opponent badge + Name & Score */}
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                      {/* Date */}
                      <span className="font-mono text-[11px] text-slate-400 w-[74px] shrink-0 font-medium">
                        {fmtDate(m.date)}
                      </span>

                      {/* Competition Badge/Logo */}
                      <div className="shrink-0" title={m.competition || "Competition"}>
                        <LogoLiga
                          competitionId={m.competitionId}
                          competitionName={m.competition}
                          logoUrl={m.competitionLogoUrl}
                          size={19}
                        />
                      </div>

                      {/* Venue badge: H (Home) / A (Away) */}
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded text-center shrink-0 border ${
                          m.isHome
                            ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                            : "bg-slate-800 text-slate-300 border-slate-700"
                        }`}
                        title={m.isHome ? "Home match" : "Away match"}
                      >
                        {m.isHome ? "H" : "A"}
                      </span>

                      {/* Opponent Crest & Name */}
                      <div className="flex items-center gap-2 min-w-0">
                        <EscudoEquipo
                          teamId={m.opponent?.id}
                          badgeUrl={m.opponent?.badgeUrl}
                          name={m.opponent?.name}
                          size={19}
                        />
                        <span className="truncate text-white font-medium max-w-[120px] sm:max-w-[190px] md:max-w-[240px]">
                          {m.opponent?.name || "—"}
                        </span>
                      </div>

                      {/* Match Score */}
                      <span className="font-mono text-xs font-semibold text-slate-300 bg-white/[0.04] px-1.5 py-0.5 rounded shrink-0 border border-white/5">
                        {m.goalsFor ?? "-"}–{m.goalsAgainst ?? "-"}
                      </span>
                    </div>

                    {/* Right: English Position, Minutes played, Goal/Assist Icons, Rating score */}
                    <div className="flex items-center gap-2.5 sm:gap-4 shrink-0 text-right">
                      {/* Demarcation in English */}
                      <span
                        className="hidden md:inline-block text-[11px] text-slate-400 font-medium max-w-[130px] truncate text-right"
                        title={posEnglish}
                      >
                        {posEnglish}
                      </span>

                      {/* Minutes played */}
                      <span className="font-mono text-slate-200 w-9 text-right font-semibold">
                        {m.minutes ?? 0}&apos;
                      </span>

                      {/* Goals & Assists visual icons */}
                      <div className="flex items-center justify-end gap-1.5 min-w-[58px]">
                        {m.goals > 0 && (
                          <span
                            className="inline-flex items-center gap-0.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-1.5 py-0.5 rounded text-[11px] font-bold"
                            title={`${m.goals} ${m.goals === 1 ? "Goal" : "Goals"}`}
                          >
                            <span className="text-[12px] leading-none">⚽</span>
                            {m.goals > 1 && <span>{m.goals}</span>}
                          </span>
                        )}
                        {m.assists > 0 && (
                          <span
                            className="inline-flex items-center gap-0.5 bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 px-1.5 py-0.5 rounded text-[11px] font-bold"
                            title={`${m.assists} ${m.assists === 1 ? "Assist" : "Assists"}`}
                          >
                            <span className="text-[11px] leading-none">👟</span>
                            {m.assists > 1 && <span>{m.assists}</span>}
                          </span>
                        )}
                        {!m.goals && !m.assists && (
                          <span className="text-slate-600 text-xs select-none">—</span>
                        )}
                      </div>

                      {/* Score Badge (maintains exact rating color scale) */}
                      <span
                        className={`w-10 rounded-md border px-1.5 py-0.5 text-center font-bold font-mono text-[11.5px] shadow-sm ${
                          m.rating == null
                            ? "text-muted-foreground border-transparent bg-white/5"
                            : `${scoreColor.box} ${scoreColor.text}`
                        }`}
                        title={m.rating == null ? "Not rated" : `Match rating: ${Number(m.rating).toFixed(1)}`}
                      >
                        {m.rating == null ? "—" : Number(m.rating).toFixed(1)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Career Data from Soccerdonna: Market Value, Transfers, National Team & Injury Anatomy */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <MarketValueChart
          data={marketValues}
          peakValue={peakValue}
          currentValue={p.marketValue}
        />

        <TransferTimeline
          transfers={transfers}
        />

        <NationalTeamGrid
          nationalTeams={nationalTeams}
          playerCountry={p.country}
        />

        <InjuryAnatomy
          injuries={injuries}
        />
      </div>
    </div>
  );
}
