"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useThemeContext } from "@/context/ThemeContext";
import { CromoJugador } from "@/components/scouting/CromoJugador";
import { MetricsAccordion } from "@/components/scouting/MetricsAccordion";
import { NotasResumen } from "@/components/scouting/NotasResumen";
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
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { LoadingState, ErrorState } from "@/components/ui/StatusStates";
import { ArrowLeft, Bookmark, Plus, ExternalLink, Pencil, Trophy } from "lucide-react";
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

/** Panel of the profile grid: same dark card for every block, optional title bar and inner scroll. */
function Panel({ title, right, className = "", bodyClassName = "", children }: {
  title?: React.ReactNode; right?: React.ReactNode; className?: string; bodyClassName?: string; children: React.ReactNode;
}) {
  return (
    <section className={`min-w-0 flex flex-col rounded-xl border border-border/60 bg-[#070e1e]/90 shadow-xl overflow-hidden ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/40 shrink-0">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-amber-400">{title}</h2>
          {right}
        </header>
      )}
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/** One label/value line of the personal data table. */
function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-[5px] odd:bg-white/[0.025]">
      <span className="text-[11px] text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs font-semibold text-white text-right truncate min-w-0">{children}</span>
    </div>
  );
}

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

  const seasonLabel = showCurrent
    ? "Current season · all competitions"
    : selected ? `${selected.competitions?.name || ""} ${selected.seasons?.name || ""}`.trim() : "";

  // Competitions she has Opta data in (filter pills, only when there is more than one)
  const availableComps: { id: string; name: string; logoUrl?: string }[] = [];
  {
    const seen = new Set<string>();
    for (const s of seasons) {
      const cId = s.competition_id;
      const cName = s.competitions?.name;
      if (cId && cName && !seen.has(cId)) {
        seen.add(cId);
        availableComps.push({ id: cId, name: cName, logoUrl: s.competitions?.logo_url });
      }
    }
  }

  const SCROLL = "overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20";

  return (
    <div className="w-full space-y-3">
      <EditPlayerModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        player={p}
        scraped={data.scraped || p}
        translatePosition={translatePosition}
        onSaved={() => setReloadKey((k) => k + 1)}
      />

      {/* ── Title bar: back · identity line · actions ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border/60 bg-[#070e1e]/90 px-3 py-2 shadow-xl">
        <button
          type="button"
          onClick={() => window.history.back()}
          title={fromLineup ? "Back to lineup" : "Back to Player Directory"}
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-white/10 bg-navy-900/60 hover:bg-navy-800 text-slate-200 hover:text-white transition-all shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <EscudoEquipo teamId={p.teamId} badgeUrl={p.badgeUrl} name={p.teamName} size={30} />
        <div className="min-w-0">
          <h1 className="text-xl font-black tracking-tight text-white leading-tight truncate">
            {p.shirtNumber ? `${p.shirtNumber}. ` : ""}{p.matchName || p.name}
            {p.matchName && p.matchName !== p.name && (
              <span className="ml-2 text-xs font-medium text-slate-400 tracking-wide">{p.name}</span>
            )}
          </h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
            <span className="text-slate-200 font-semibold">{primaryEnglishPos}</span>
            {secondaryPositionsList.length > 0 && <span>/ {secondaryPositionsList.map(translatePosition).join(", ")}</span>}
            <span>·</span>
            <span className="text-white font-semibold">{p.teamName}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              {p.leagueLogoUrl && <img src={p.leagueLogoUrl} alt="" className="h-3.5 w-auto max-w-[16px] object-contain" />}
              {p.leagueName || "No current league"}
            </span>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-400/10 text-amber-300 border border-amber-400/30">
          {selected?.seasons?.name || "No Opta season"}
        </span>
        {selected && <CoberturaBadges c={selected.coverage} />}
        <div className="ml-auto flex items-center gap-2">
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

      {/* ── Top band: personal data · card · season numbers & ratings · profiles & positions ── */}
      <div className="grid gap-3 grid-cols-1 md:grid-cols-[auto_1fr] xl:grid-cols-[minmax(250px,1fr)_auto_minmax(0,2.4fr)_minmax(240px,1fr)] items-stretch">
        <Panel
          title="Personal data"
          className="md:col-span-2 xl:col-span-1 xl:order-none"
          right={
            p.sdUrl ? (
              <a href={p.sdUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-amber-400 transition-colors">
                Soccerdonna <ExternalLink className="w-3 h-3" />
              </a>
            ) : undefined
          }
        >
          <DataRow label="Nationality">
            <span className="inline-flex items-center gap-1.5">
              <Bandera country={p.country} size="xs" />
              {(p.citizenship?.length ? p.citizenship.join(", ") : p.country) || "—"}
            </span>
          </DataRow>
          <DataRow label="Age">{p.birthDate ? `${fmtDate(p.birthDate)} (${age} years)` : "—"}</DataRow>
          <DataRow label="Place of birth">{p.placeOfBirth || "—"}</DataRow>
          <DataRow label="Height">{p.height ? `${p.height} cm` : "—"}</DataRow>
          <DataRow label="Preferred foot">{p.preferredFoot || "—"}</DataRow>
          <DataRow label="Shirt number">{p.shirtNumber || "—"}</DataRow>
          <DataRow label="Market value"><span className="text-amber-400">{fmtValue(p.marketValue)}</span></DataRow>
          <DataRow label="Peak value"><span className="text-amber-400">{fmtValue(peakValue)}</span></DataRow>
          <DataRow label="Contract until"><span className="font-mono">{fmtDate(p.contractUntil)}</span></DataRow>
        </Panel>

        <div className="flex justify-center items-start">
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
        </div>

        {/* Season numbers, season selector and category ratings */}
        <div className="min-w-0 space-y-2.5">
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Matches", value: selected?.matches_played ?? "—", cls: "text-white" },
              { label: "Minutes", value: selected?.minutes_played ? `${selected.minutes_played}'` : "—", cls: "text-white font-mono" },
              { label: "⚽ Goals", value: selected?.goals ?? 0, cls: "text-emerald-300 font-mono", box: "bg-emerald-500/10 border-emerald-500/25" },
              { label: "🎯 Assists", value: selected?.assists ?? 0, cls: "text-sky-300 font-mono", box: "bg-sky-500/10 border-sky-500/25" },
            ].map((t) => (
              <div key={t.label} className={`px-3 py-2 rounded-xl border ${t.box || "bg-[#070e1e]/90 border-border/60"}`}>
                <div className="text-[10px] text-muted-foreground uppercase font-semibold">{t.label}</div>
                <div className={`text-lg font-black leading-tight ${t.cls}`}>{t.value}</div>
              </div>
            ))}
          </div>

          {availableComps.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground mr-1 flex items-center gap-1 font-medium">
                <Trophy className="w-3 h-3 text-amber-400" /> Competition:
              </span>
              <button
                type="button"
                onClick={() => data.allSeasons && setSeasonKey(claveTemporada(data.allSeasons))}
                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold transition-all border ${
                  selected?.esTotal
                    ? "bg-amber-400/20 text-amber-300 border-amber-400/50 shadow-sm"
                    : "bg-navy-950/60 text-slate-400 border-white/10 hover:text-white hover:border-white/20"
                }`}
              >
                All Competitions
              </button>
              {availableComps.map((comp) => (
                <button
                  key={comp.id}
                  type="button"
                  onClick={() => {
                    const match = seasons.find((s) => s.competition_id === comp.id);
                    if (match) setSeasonKey(claveTemporada(match));
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all border ${
                    selected?.competition_id === comp.id
                      ? "bg-sky-500/20 text-sky-200 border-sky-400/60 shadow-sm font-bold"
                      : "bg-navy-950/60 text-slate-400 border-white/10 hover:text-white hover:border-white/20"
                  }`}
                >
                  {comp.logoUrl && <img src={comp.logoUrl} alt="" className="w-3.5 h-3.5 object-contain rounded-full" />}
                  <span>{comp.name}</span>
                </button>
              ))}
            </div>
          )}

          <TemporadasOpta seasons={options} selected={selectedKey} onSelect={setSeasonKey} />
          {selected?.sinNotas ? (
            <div className="rounded-xl border border-border/60 bg-[#070e1e] p-3 text-xs text-muted-foreground">
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
        </div>

        {/* Tactical profiles + played positions */}
        <div className="min-w-0 md:col-span-2 xl:col-span-1 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 content-start">
          <Panel
            title="Positions"
            right={<span className="text-[10px] font-semibold text-slate-300 truncate max-w-[140px]">{primaryEnglishPos}</span>}
          >
            {(() => {
              const coords = getPitchCoords(p.primaryPosition);
              const secCoords = secondaryPositionsList.map(getPitchCoords);
              return (
                <div className="p-3">
                  <div className="relative w-full aspect-[105/68] rounded-md border border-emerald-500/30 bg-[#0a1829] overflow-hidden shadow-inner">
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-950/40 to-slate-950/60" />
                    <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[18%] aspect-square rounded-full border border-white/20" />
                    <div className="absolute inset-y-[22%] left-0 w-[15%] border-r border-y border-white/20" />
                    <div className="absolute inset-y-[22%] right-0 w-[15%] border-l border-y border-white/20" />
                    {secCoords.map((sc: { x: number; y: number }, i: number) => (
                      <div
                        key={`sec-${i}`}
                        style={{ left: `${sc.x}%`, top: `${sc.y}%` }}
                        className="absolute -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-amber-400/60 border border-amber-300/80"
                        title={translatePosition(secondaryPositionsList[i])}
                      />
                    ))}
                    <div
                      style={{ left: `${coords.x}%`, top: `${coords.y}%` }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-amber-400 border border-white shadow-[0_0_8px_rgba(251,191,36,0.9)] animate-pulse"
                      title={`Primary: ${primaryEnglishPos}`}
                    />
                  </div>
                  {secondaryPositionsList.length > 0 && (
                    <div className="text-[10px] text-amber-300/90 font-medium mt-1.5 truncate">
                      Also: {secondaryPositionsList.map(translatePosition).join(", ")}
                    </div>
                  )}
                  {p.perfil && (
                    <div className="mt-1.5 inline-block rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                      {p.perfil}
                    </div>
                  )}
                </div>
              );
            })()}
          </Panel>

          {p.perfiles && Object.keys(p.perfiles).length > 0 && (
            <Panel title="Tactical profiles" bodyClassName="p-2 space-y-1.5">
              {Object.entries<number>(p.perfiles)
                .sort((a, b) => Number(b[1]) - Number(a[1]))
                .map(([profName, score], idx) => {
                  const val = Number(score);
                  const isTop = idx === 0;
                  return (
                    <div
                      key={profName}
                      className={`rounded-lg px-2 py-1.5 border ${
                        isTop ? "bg-emerald-500/[0.08] border-emerald-400/30" : "bg-white/[0.02] border-white/[0.05]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className={`text-[11px] truncate ${isTop ? "font-bold text-emerald-200" : "font-medium text-slate-300"}`} title={profName}>
                          {profName}
                        </span>
                        <span className={`font-mono text-[11px] font-black shrink-0 ${isTop ? "text-emerald-300" : "text-white"}`}>
                          {val.toFixed(1)}
                        </span>
                      </div>
                      <div className="h-1 w-full rounded-full bg-white/[0.07] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            isTop ? "bg-gradient-to-r from-emerald-400 to-teal-300" : "bg-gradient-to-r from-sky-500/80 to-indigo-400/80"
                          }`}
                          style={{ width: `${Math.max(2, Math.min(100, val))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </Panel>
          )}
        </div>
      </div>

      {/* ── Middle band: rating evolution · position radar · detailed metrics ── */}
      <div className="grid gap-3 grid-cols-1 lg:grid-cols-2 xl:grid-cols-12 items-start">
        <div className="min-w-0 xl:col-span-4">
          <RatingEvolutionChart matches={data.matchLog || []} playerName={p.matchName || p.name} />
        </div>
        <div className="min-w-0 xl:col-span-5">
          <PositionRadar
            playerId={playerId}
            competitionId={selected && !selected.esTotal && !selected.sinNotas ? selected.competition_id : null}
            seasonId={selected && !selected.esTotal && !selected.sinNotas ? selected.season_id : null}
            position={p.primaryPosition}
          />
        </div>
        <Card className={`min-w-0 lg:col-span-2 xl:col-span-3 bg-[#070c18] border-border/80 p-3 max-h-[520px] ${SCROLL}`}>
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
      </div>

      {/* ── Bottom band: match ratings · market value · transfers & national team · injuries ── */}
      <div className="grid gap-3 grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 items-start">
        {/* Match-by-match ratings (FotMob-like scale: average 6.5, vs. same position group; pipeline/scoring.py) */}
        <Panel
          title="Match ratings"
          right={
            matchLog.length > 0 ? (
              <span className="text-[10px] font-medium text-slate-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                {matchLog.length} {matchLog.length === 1 ? "match" : "matches"}
              </span>
            ) : undefined
          }
        >
          <p className="px-3 pt-1.5 text-[10px] text-muted-foreground truncate" title={seasonLabel}>
            {seasonLabel ? `${seasonLabel} · ` : ""}0–10, latest first
          </p>
          {matchLog.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted-foreground">No matches played yet in this period.</p>
          ) : (
            <div className={`max-h-[440px] divide-y divide-border/30 text-xs ${SCROLL}`}>
              {matchLog.map((m: any) => {
                const scoreColor = notaClases(Math.round(Number(m.rating || 0) * 10));
                return (
                  <div key={m.matchId} className="px-3 py-1.5 flex items-center justify-between gap-2 hover:bg-white/[0.03] transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[10.5px] text-slate-400 w-[66px] shrink-0">{fmtDate(m.date)}</span>
                      <span className="shrink-0" title={m.competition || "Competition"}>
                        <LogoLiga competitionId={m.competitionId} competitionName={m.competition} logoUrl={m.competitionLogoUrl} size={16} />
                      </span>
                      <span
                        className={`text-[9px] font-semibold px-1 rounded shrink-0 border ${
                          m.isHome ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" : "bg-slate-800 text-slate-300 border-slate-700"
                        }`}
                        title={m.isHome ? "Home match" : "Away match"}
                      >
                        {m.isHome ? "H" : "A"}
                      </span>
                      <EscudoEquipo teamId={m.opponent?.id} badgeUrl={m.opponent?.badgeUrl} name={m.opponent?.name} size={16} />
                      <span className="truncate text-white font-medium min-w-0" title={`${m.opponent?.name || ""} · ${translatePosition(m.position)}`}>
                        {m.opponent?.name || "—"}
                      </span>
                      <span className="font-mono text-[11px] text-slate-300 shrink-0">
                        {m.goalsFor ?? "-"}–{m.goalsAgainst ?? "-"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-slate-300 w-8 text-right">{m.minutes ?? 0}&apos;</span>
                      <span className="w-9 text-right text-[11px] whitespace-nowrap" title={`${m.goals || 0} goals · ${m.assists || 0} assists`}>
                        {m.goals > 0 && <span className="text-emerald-300">⚽{m.goals > 1 ? m.goals : ""}</span>}
                        {m.assists > 0 && <span className="text-cyan-300">👟{m.assists > 1 ? m.assists : ""}</span>}
                        {!m.goals && !m.assists && <span className="text-slate-600">—</span>}
                      </span>
                      <span
                        className={`w-9 rounded-md border px-1 py-0.5 text-center font-bold font-mono text-[11px] ${
                          m.rating == null ? "text-muted-foreground border-transparent bg-white/5" : `${scoreColor.box} ${scoreColor.text}`
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
        </Panel>

        <div className="min-w-0">
          <MarketValueChart data={marketValues} peakValue={peakValue} currentValue={p.marketValue} />
        </div>

        <div className="min-w-0 space-y-3">
          <TransferTimeline transfers={transfers} />
          <NationalTeamGrid nationalTeams={nationalTeams} playerCountry={p.country} />
        </div>

        <div className="min-w-0">
          <InjuryAnatomy injuries={injuries} />
        </div>
      </div>
    </div>
  );
}
