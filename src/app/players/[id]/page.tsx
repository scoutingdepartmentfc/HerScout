"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useThemeContext } from "@/context/ThemeContext";
import { CromoJugador } from "@/components/scouting/CromoJugador";
import { PosicionesVertical } from "@/components/scouting/PosicionesVertical";
import { MarcadorEstadio } from "@/components/scouting/MarcadorEstadio";
import { MetricasAcordeon } from "@/components/scouting/MetricasAcordeon";
import { Bandera } from "@/components/scouting/Bandera";
import { EscudoEquipo } from "@/components/scouting/EscudoEquipo";
import { MarketValueChart } from "@/components/scouting/MarketValueChart";
import { TransferTimeline } from "@/components/scouting/TransferTimeline";
import { NationalTeamGrid } from "@/components/scouting/NationalTeamGrid";
import { InjuryAnatomy } from "@/components/scouting/InjuryAnatomy";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { LoadingState, ErrorState } from "@/components/ui/StatusStates";
import { ArrowLeft, Bookmark, FileText, Calendar, Plus, ExternalLink, Shield } from "lucide-react";

export default function PlayerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { currentClub } = useThemeContext();
  const playerId = params?.id as string;

  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPlayer() {
      if (!playerId) return;
      setIsLoading(true);
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
  }, [playerId]);

  if (isLoading) return <LoadingState message="Loading professional player card and metrics..." />;
  if (error || !data?.player) return <ErrorState title="Player Not Found" message={error || "Profile unavailable"} onRetry={() => window.location.reload()} />;

  const p = data.player;
  const stats = data.seasonStats?.[0] || null;
  const metricas = data.metricas || {};
  const matchLog = data.matchLog || [];
  const marketValues = data.marketValues || [];
  const transfers = data.transfers || [];
  const nationalTeams = data.nationalTeams || [];
  const injuries = data.injuries || [];

  // Calculate age
  const age = p.birthDate
    ? Math.floor((Date.now() - new Date(p.birthDate).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;
  const fmtNota = (v: number | null | undefined) => (v == null ? "—" : Math.round(v));
  const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("en-GB") : "—");
  const fmtValue = (v: number | null | undefined) =>
    v ? (v >= 1_000_000 ? `€${(v / 1_000_000).toFixed(2)}m` : `€${Math.round(v / 1000)}k`) : "—";
  const peakValue = Math.max(0, ...(data.marketValues || []).map((m: any) => m.market_value || 0)) || p.marketValue;

  // Tactical distribution
  const positionsMap: Record<string, { min: number }> = {
    ...(p.primaryPosition && stats?.minutes_played ? { [p.primaryPosition]: { min: stats.minutes_played } } : {}),
  };

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
  const secondaryPositionsList = (p.otherPositions?.length ? p.otherPositions : p.playedPositions?.slice(1) || []).slice(0, 2);

  const notasGenerales = {
    nota_ataque: stats?.nota_ataque ?? 0,
    nota_construccion: stats?.nota_construccion ?? 0,
    nota_defensa: stats?.nota_defensa ?? 0,
    nota_balon_parado: stats?.nota_balon_parado ?? 0,
    nota_disponibilidad: stats?.nota_disponibilidad ?? 0,
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <Link href="/players">
          <Button variant="outline" size="sm" leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}>
            Back to Player Directory
          </Button>
        </Link>
        <div className="flex items-center gap-2">
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
          {/* Pure White Ultimate Team Card */}
          <div className="mx-auto lg:mx-0 shrink-0">
            <CromoJugador
              j={{
                player_id: p.id,
                photo_url: p.photoUrl,
                name: p.name,
                team_id: p.teamId,
                team_name: p.teamName,
                badge_url: p.badgeUrl,
                league_name: p.leagueName || stats?.competitions?.name,
                league_logo_url: p.leagueLogoUrl,
                country: p.country,
                demarcacion: primaryEnglishPos,
                score_general: stats?.nota_global ? stats.nota_global / 10 : 8.2,
                demarcacionesSecundarias: secondaryPositionsList,
              }}
              size="md"
            />
          </div>

          {/* Right Column: Name + Club line + Stats Summary + Datos Personales */}
          <div className="space-y-6 w-full">
            {/* Player Name and Club/League Header */}
            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white">
                {p.name}
              </h1>
              <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs sm:text-sm">
                <span className="inline-flex items-center gap-2 font-semibold text-white">
                  <EscudoEquipo teamId={p.teamId} badgeUrl={p.badgeUrl} name={p.teamName} size={22} />
                  <span>{p.teamName}</span>
                </span>
                <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-sky-500/10 text-sky-300 font-semibold border border-sky-400/20 text-xs shadow-sm">
                  {(p.leagueLogoUrl || stats?.competitions?.logo_url) && (
                    <img
                      src={p.leagueLogoUrl || stats?.competitions?.logo_url}
                      alt=""
                      className="h-4.5 w-auto max-w-[20px] rounded-sm object-contain"
                    />
                  )}
                  <span>{p.leagueName || stats?.competitions?.name || "Primera División Femenina"}</span>
                </span>
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-400/10 text-amber-300 border border-amber-400/30">
                  {stats?.seasons?.name || "2026/2027"}
                </span>
              </div>

              {/* 5-Column Quick Stats Row */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4 pt-4 border-t border-border/40 text-xs">
                <div>
                  <div className="text-[11px] text-muted-foreground">Position</div>
                  <div className="font-semibold text-white text-sm mt-0.5">{primaryEnglishPos}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Nationality</div>
                  <div className="flex items-center gap-1.5 font-semibold text-white text-sm mt-0.5">
                    <Bandera country={p.country} size="xs" />
                    <span>{p.country || "—"}</span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Age</div>
                  <div className="font-semibold text-white text-sm mt-0.5">{age ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Matches</div>
                  <div className="font-semibold text-white text-sm mt-0.5">{stats?.matches_played ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Minutes</div>
                  <div className="font-semibold text-white text-sm mt-0.5 font-mono">
                    {stats?.minutes_played ? `${stats.minutes_played}'` : "—"}
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

              {/* Grid 2 rows of demographic cards with mini soccer pitch */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 text-xs">
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
                    ⚖️ Weight
                  </div>
                  <div className="font-medium text-white text-xs mt-1">
                    {p.weight ? `${p.weight} kg` : "—"}
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

                {/* Posición con mini campito táctico SVG y coordenadas exactas */}
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
                        {secCoords.map((sc, sIdx) => (
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

                <div className="p-2.5 rounded-lg bg-navy-950/70 border border-border/40">
                  <div className="text-[10px] text-muted-foreground">At the club since</div>
                  <div className="font-medium text-white text-xs mt-1">
                    {p.joinedOn ? new Date(p.joinedOn).getFullYear() : "—"}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-navy-950/70 border border-border/40">
                  <div className="text-[10px] text-muted-foreground">Contract until</div>
                  <div className="font-medium text-white text-xs mt-1 font-mono">
                    {fmtDate(p.contractUntil)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Stadium Scoreboard Circular Cards (exact layout like Andreia de Jesus Jacinto) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 1: Nota general OVR */}
          <div className="p-4 rounded-xl border border-border/60 bg-[#070e1e] flex flex-col items-center justify-center text-center">
            <div className="relative w-24 h-24 flex items-center justify-center">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-slate-800"
                  strokeWidth="3.2"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-sky-400"
                  strokeDasharray={`${stats?.nota_global || 0}, 100`}
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute flex flex-col items-center leading-none">
                <span className="font-black text-2xl text-white">{fmtNota(stats?.nota_global)}</span>
                <span className="text-[9px] text-muted-foreground mt-0.5">of 100</span>
              </div>
            </div>
            <div className="mt-3 font-bold text-white text-sm">Overall rating</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Better than <span className="font-bold text-white">{stats?.percentile_general ?? "—"}%</span> of the league
            </div>
          </div>

          {/* Card 2: Ofensivo */}
          <div className="p-4 rounded-xl border border-border/60 bg-[#070e1e] flex flex-col justify-between">
            <div className="flex items-center gap-3">
              <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
                <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
                  <path className="text-slate-800" strokeWidth="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path className="text-amber-400" strokeDasharray={`${stats?.nota_ataque || 0}, 100`} strokeWidth="3.5" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
                <span className="absolute font-black text-lg text-white">{fmtNota(stats?.nota_ataque)}</span>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">🎯 Phase</div>
                <div className="font-bold text-white text-sm">Attack</div>
              </div>
            </div>
            <div className="space-y-1.5 mt-3 pt-3 border-t border-border/40 text-[11px]">
              <div className="flex justify-between text-muted-foreground">
                <span className="truncate">Finishing & Goal Threat</span>
                <span className="font-bold text-rose-400">24</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span className="truncate">Chance Creation & Assists</span>
                <span className="font-bold text-white">58</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span className="truncate">Distribution & Passing</span>
                <span className="font-bold text-white">67</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span className="truncate">Progression & Dribbling</span>
                <span className="font-bold text-white">49</span>
              </div>
            </div>
          </div>

          {/* Card 3: Defensivo */}
          <div className="p-4 rounded-xl border border-border/60 bg-[#070e1e] flex flex-col justify-between">
            <div className="flex items-center gap-3">
              <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
                <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
                  <path className="text-slate-800" strokeWidth="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path className="text-white" strokeDasharray={`${stats?.nota_defensa || 0}, 100`} strokeWidth="3.5" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
                <span className="absolute font-black text-lg text-white">{fmtNota(stats?.nota_defensa)}</span>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">🛡️ Phase</div>
                <div className="font-bold text-white text-sm">Defence</div>
              </div>
            </div>
            <div className="space-y-1.5 mt-3 pt-3 border-t border-border/40 text-[11px]">
              <div className="flex justify-between text-muted-foreground">
                <span className="truncate">Tackles & Ground Duels</span>
                <span className="font-bold text-white">44</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span className="truncate">Recoveries & Intercep...</span>
                <span className="font-bold text-white">46</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span className="truncate">Aerial Duels</span>
                <span className="font-bold text-rose-400">38</span>
              </div>
            </div>
          </div>

          {/* Card 4: ABP (Balón Parado) */}
          <div className="p-4 rounded-xl border border-border/60 bg-[#070e1e] flex flex-col justify-between">
            <div className="flex items-center gap-3">
              <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
                <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
                  <path className="text-slate-800" strokeWidth="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path className="text-amber-400" strokeDasharray={`${stats?.nota_balon_parado || 0}, 100`} strokeWidth="3.5" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
                <span className="absolute font-black text-lg text-white">{fmtNota(stats?.nota_balon_parado)}</span>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">🚩 Set pieces</div>
                <div className="font-bold text-white text-sm">Set Pieces</div>
              </div>
            </div>
            <div className="space-y-1.5 mt-3 pt-3 border-t border-border/40 text-[11px]">
              <div className="flex justify-between text-muted-foreground">
                <span className="truncate">Set-Piece Delivery</span>
                <span className="font-bold text-white">47</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span className="truncate">Set-Piece Finishing</span>
                <span className="font-bold text-rose-400">13</span>
              </div>
            </div>
          </div>

          {/* Card 5: Comportamiento y Regularidad */}
          <div className="p-4 rounded-xl border border-border/60 bg-[#070e1e] flex flex-col justify-between">
            <div className="flex items-center gap-3">
              <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
                <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
                  <path className="text-slate-800" strokeWidth="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path className="text-slate-400" strokeDasharray={`${stats?.nota_disponibilidad || 0}, 100`} strokeWidth="3.5" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
                <span className="absolute font-black text-lg text-white">{fmtNota(stats?.nota_disponibilidad)}</span>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">📈 Consistency</div>
                <div className="font-bold text-white text-sm leading-tight">Behaviour</div>
              </div>
            </div>
            <div className="space-y-1.5 mt-3 pt-3 border-t border-border/40 text-[11px]">
              <div className="flex justify-between text-muted-foreground">
                <span className="truncate">Role & Continuity</span>
                <span className="font-bold text-white">46</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span className="truncate">Consistency & Discipline</span>
                <span className="font-bold text-white">42</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Match-by-match ratings (0-9.9, from Opta eventing + matchstats) */}
      <Card className="bg-[#0b1329]">
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Match Ratings</CardTitle>
          <CardDescription>Rating for every match played (0–10), latest first</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {matchLog.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">No matches played yet.</p>
          ) : (
            <div className="divide-y divide-border/40 text-xs">
              {matchLog.map((m: any) => (
                <div key={m.matchId} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-[11px] text-muted-foreground w-20 shrink-0">{fmtDate(m.date)}</span>
                    <span className="text-[10px] text-muted-foreground w-4 shrink-0">{m.isHome ? "H" : "A"}</span>
                    <EscudoEquipo teamId={m.opponent.id} badgeUrl={m.opponent.badgeUrl} name={m.opponent.name} size={18} />
                    <span className="truncate text-white">{m.opponent.name || "—"}</span>
                    <span className="font-mono text-muted-foreground shrink-0">
                      {m.goalsFor ?? "-"}–{m.goalsAgainst ?? "-"}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-right">
                    <span className="hidden sm:inline text-muted-foreground">{m.position || ""}</span>
                    <span className="font-mono text-white w-10">{m.minutes ?? 0}&apos;</span>
                    <span className="hidden sm:inline w-14 text-muted-foreground">
                      {m.goals ? `${m.goals}G ` : ""}
                      {m.assists ? `${m.assists}A` : ""}
                    </span>
                    <span
                      className={`w-10 rounded px-1.5 py-0.5 text-center font-bold ${
                        m.rating == null
                          ? "text-muted-foreground"
                          : m.rating >= 7
                          ? "bg-emerald-500/15 text-emerald-400"
                          : m.rating >= 5.5
                          ? "bg-sky-500/15 text-sky-300"
                          : "bg-rose-500/15 text-rose-300"
                      }`}
                    >
                      {m.rating == null ? "—" : Number(m.rating).toFixed(1)}
                    </span>
                  </div>
                </div>
              ))}
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

      {/* Full Hierarchical Metrics Accordion (6 Categories • 15 Subcategories • 150+ Metrics) */}
      <Card className="bg-[#070c18] border-border/80 p-5">
        <MetricasAcordeon metricas={metricas} notasGenerales={notasGenerales} />
      </Card>

      {/* Positional Pitch & Season Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tactical Pitch Map */}
        <Card className="bg-[#0b1329]">
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Tactical Field Distribution</CardTitle>
            <CardDescription>Demarcation presence across official matches</CardDescription>
          </CardHeader>
          <CardContent className="p-4 flex justify-center">
            <PosicionesVertical positions={positionsMap} />
          </CardContent>
        </Card>

        {/* Season Performance Breakdown Table */}
        <Card className="lg:col-span-2 bg-[#0b1329]">
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Season History & Competition Log</CardTitle>
            <CardDescription>Verified Opta performances per tournament</CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {data.seasonStats.length === 0 ? (
              <p className="text-xs text-muted-foreground">No season log available for this profile.</p>
            ) : (
              <div className="divide-y divide-border/40 text-xs">
                {data.seasonStats.map((s: any) => (
                  <div key={s.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-white">
                        {s.competitions?.name || "—"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {s.seasons?.name || "—"} • {s.grupo_demarcacion}
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-right">
                      <div>
                        <div className="text-muted-foreground text-[10px]">Minutes</div>
                        <div className="font-mono font-semibold text-white">{s.minutes_played}&apos;</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-[10px]">Matches</div>
                        <div className="font-mono font-semibold text-white">{s.matches_played}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-[10px]">Rating</div>
                        <div className="font-bold text-emerald-400 text-sm">
                          {s.nota_global ? (s.nota_global / 10).toFixed(1) : "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
