"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useThemeContext } from "@/context/ThemeContext";
import { LoadingState, ErrorState } from "@/components/ui/StatusStates";
import { EditPlayerModal } from "@/components/scouting/EditPlayerModal";
import { SpondaReportEditorModal } from "@/components/scouting/SpondaReportEditorModal";
import { PlayerHeaderBlock } from "@/components/scouting/profile/PlayerHeaderBlock";
import { GlobalFiltersBar, FilterCompetition } from "@/components/scouting/profile/GlobalFiltersBar";
import { PositionalStatsBlock, PositionalStatItem } from "@/components/scouting/profile/PositionalStatsBlock";
import { SimilarPlayersBlock, SimilarPlayerItem } from "@/components/scouting/profile/SimilarPlayersBlock";
import { PositionalRadarBlock } from "@/components/scouting/profile/PositionalRadarBlock";
import { ScoutReportSummaryBlock } from "@/components/scouting/profile/ScoutReportSummaryBlock";
import { SeasonStatsBlock, SeasonCompRow } from "@/components/scouting/profile/SeasonStatsBlock";
import { CareerStatsBlock, CareerSeasonRow } from "@/components/scouting/profile/CareerStatsBlock";
import { RatingEvolutionBlock } from "@/components/scouting/profile/RatingEvolutionBlock";
import { NationalTeamBlock } from "@/components/scouting/profile/NationalTeamBlock";
import { InjuryMedicalBlock } from "@/components/scouting/profile/InjuryMedicalBlock";
import { UpcomingMatchesBlock } from "@/components/scouting/profile/UpcomingMatchesBlock";
import { StrengthsWeaknessesBlock } from "@/components/scouting/profile/StrengthsWeaknessesBlock";
import { ScoutingHistoryBlock } from "@/components/scouting/profile/ScoutingHistoryBlock";
import { FitToScreenCanvas, FitMode } from "@/components/scouting/profile/FitToScreenCanvas";
import { competitionWeighted } from "@/lib/currentSeason";

const translatePosition = (pos?: string | null) => {
  if (!pos) return "—";
  const pLower = pos.toLowerCase();
  if (pLower.includes("porter") || pLower.includes("goalkeeper") || pLower === "gk") return "Goalkeeper";
  if (pLower.includes("central derecho") || pLower === "rcb") return "Right Centre-Back";
  if (pLower.includes("central izquierdo") || pLower === "lcb") return "Left Centre-Back";
  if (pLower.includes("central") || pLower.includes("centre-back") || pLower === "cb") return "Centre-Back";
  if (pLower.includes("lateral derecho") || pLower.includes("right-back") || pLower === "rb") return "Right-Back";
  if (pLower.includes("lateral izquierdo") || pLower.includes("left-back") || pLower === "lb") return "Left-Back";
  if (pLower.includes("defensivo") || pLower.includes("defensive midfield") || pLower === "cdm" || pLower === "dmf")
    return "Defensive Midfielder";
  if (pLower.includes("mediocentro") || pLower.includes("central midfield") || pLower === "cm") return "Central Midfielder";
  if (pLower.includes("mediapunta") || pLower.includes("attacking midfield") || pLower === "cam")
    return "Attacking Midfielder";
  if (pLower.includes("extremo derecho") || pLower.includes("right winger") || pLower === "rw") return "Right Winger";
  if (pLower.includes("extremo izquierdo") || pLower.includes("left winger") || pLower === "lw") return "Left Winger";
  if (pLower.includes("delanter") || pLower.includes("striker") || pLower.includes("forward") || pLower === "st" || pLower === "cf")
    return "Centre-Forward";
  return pos;
};

interface PositionalApiResponse {
  available: boolean;
  template?: { id: string; shortCode: string; name: string; grupo: string };
  season?: string | null;
  competition?: { id: string; name: string | null };
  stats?: PositionalStatItem[];
  similarPlayers?: SimilarPlayerItem[];
  comparePlayer?: { id: string; name: string; percentiles: (number | null)[] } | null;
  compareCandidates?: { id: string; name: string; teamName: string }[];
}

export default function PlayerProfilePage() {
  const params = useParams();
  const { currentClub, user, userRole } = useThemeContext();
  const playerId = params?.id as string;

  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Global filters (Block 2)
  const [selectedSeasonName, setSelectedSeasonName] = useState<string>("");
  const [selectedCompetition, setSelectedCompetition] = useState<string>("all");
  const [metricMode, setMetricMode] = useState<"per90" | "totals">("per90");

  // Positional / Similar / Radar state (Blocks 3, 4, 5)
  const [posData, setPosData] = useState<PositionalApiResponse | null>(null);
  const [posLoading, setPosLoading] = useState(false);
  const [comparePlayerId, setComparePlayerId] = useState<string>("");

  // Scouting history, match reports & stars consensus (Blocks 6 & 13)
  const [scouting, setScouting] = useState<any>(null);
  useEffect(() => {
    if (!playerId) return;
    let cancel = false;
    fetch(`/api/players/${playerId}/scouting`, { headers: { "x-user-org-id": currentClub.id }, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => !cancel && setScouting(j || { matchReports: [], stars: null, history: null }))
      .catch(() => !cancel && setScouting({ matchReports: [], stars: null, history: null }));
    return () => {
      cancel = true;
    };
  }, [playerId, reloadKey, currentClub.id]);

  // Modals & Watchlist state
  const [editOpen, setEditOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [watchlistBusy, setWatchlistBusy] = useState(false);
  const [isInWatchlist, setIsInWatchlist] = useState(false);

  // 1. Load main player dossier from Supabase
  useEffect(() => {
    async function loadPlayer() {
      if (!playerId) return;
      if (reloadKey === 0) setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/players/${playerId}`, {
          headers: { "x-user-org-id": currentClub.id },
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok || json.error) {
          throw new Error(json.error || `HTTP error ${res.status}`);
        }
        setData(json);
        setIsInWatchlist(Boolean(json.isInWatchlist));

        // Set default season name on initial load (active/latest season)
        if (!selectedSeasonName) {
          const seasonsList: any[] = json.seasonStats || [];
          const activeRow = seasonsList.find((s) => s.seasons?.is_active) || seasonsList[0];
          if (activeRow?.seasons?.name) {
            setSelectedSeasonName(activeRow.seasons.name);
          } else {
            setSelectedSeasonName("all");
          }
        }
      } catch (err: any) {
        setError(err.message || "Failed to load player dossier");
      } finally {
        setIsLoading(false);
      }
    }
    loadPlayer();
  }, [playerId, reloadKey, currentClub.id]);

  const seasonStats: any[] = data?.seasonStats || [];

  // Available season names (sorted newest first)
  const availableSeasons = useMemo(() => {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const s of seasonStats) {
      const nm = s.seasons?.name;
      if (nm && !seen.has(nm)) {
        seen.add(nm);
        names.push(nm);
      }
    }
    return names;
  }, [seasonStats]);

  // Available competitions for the selected season (or across all seasons if "all")
  const availableCompetitions: FilterCompetition[] = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of seasonStats) {
      if (selectedSeasonName && selectedSeasonName !== "all" && s.seasons?.name !== selectedSeasonName) {
        continue;
      }
      if (s.competition_id && s.competitions?.name && !map.has(s.competition_id)) {
        map.set(s.competition_id, s.competitions.name);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [seasonStats, selectedSeasonName]);

  // Ensure selectedCompetition remains valid when switching season
  useEffect(() => {
    if (
      selectedCompetition !== "all" &&
      availableCompetitions.length > 0 &&
      !availableCompetitions.some((c) => c.id === selectedCompetition)
    ) {
      setSelectedCompetition("all");
    }
  }, [availableCompetitions, selectedCompetition]);

  // 2. Load Positional Stats, Similar Players & Positional Radar (Blocks 3, 4, 5)
  useEffect(() => {
    if (!playerId || !data?.player) return;
    const qs = new URLSearchParams();
    if (selectedCompetition && selectedCompetition !== "all") qs.set("competition", selectedCompetition);
    if (selectedSeasonName) qs.set("seasonName", selectedSeasonName);
    if (data.player.primaryPosition) qs.set("position", data.player.primaryPosition);
    if (comparePlayerId) qs.set("comparePlayerId", comparePlayerId);

    let cancel = false;
    setPosLoading(true);
    fetch(`/api/players/${playerId}/radar?${qs.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!cancel && !j.error) setPosData(j);
      })
      .catch(() => {})
      .finally(() => !cancel && setPosLoading(false));

    return () => {
      cancel = true;
    };
  }, [playerId, data?.player?.primaryPosition, selectedCompetition, selectedSeasonName, comparePlayerId]);

  // Filtered season rows driving Header facts (Block 1) and Season Stats table (Block 7)
  const seasonScopeRows = useMemo(() => {
    if (!seasonStats.length) return [];
    if (!selectedSeasonName || selectedSeasonName === "all") return seasonStats;
    return seasonStats.filter((s) => s.seasons?.name === selectedSeasonName);
  }, [seasonStats, selectedSeasonName]);

  const filteredHeaderRows = useMemo(() => {
    if (selectedCompetition === "all") return seasonScopeRows;
    return seasonScopeRows.filter((s) => s.competition_id === selectedCompetition);
  }, [seasonScopeRows, selectedCompetition]);

  // Header aggregated metrics
  const headerAgg = useMemo(() => {
    const rows = filteredHeaderRows;
    const matches = rows.reduce((n, r) => n + (Number(r.matches_played) || 0), 0);
    const minutes = rows.reduce((n, r) => n + (Number(r.minutes_played) || 0), 0);
    const goals = rows.reduce((n, r) => n + (Number(r.goals) || 0), 0);
    const assists = rows.reduce((n, r) => n + (Number(r.assists) || 0), 0);
    const rated = rows.filter((r) => !r.sinNotas && r.nota_global != null);
    const overallScore = competitionWeighted(rated, "nota_global");
    const availNote = competitionWeighted(rated, "nota_disponibilidad");

    let ratingSum = 0;
    let ratingMin = 0;
    for (const r of rows) {
      const m = Number(r.minutes_played) || 0;
      if (r.avgMatchRating != null && m > 0) {
        ratingSum += Number(r.avgMatchRating) * m;
        ratingMin += m;
      }
    }
    const avgRating = ratingMin > 0 ? ratingSum / ratingMin : overallScore != null ? overallScore / 10 : null;

    return { matches, minutes, goals, assists, overallScore, avgRating, availNote };
  }, [filteredHeaderRows]);

  // Block 7: Season Stats rows by competition
  const seasonTableRows: SeasonCompRow[] = useMemo(() => {
    const byComp = new Map<string, SeasonCompRow & { passW: number; passM: number; rtW: number; rtM: number }>();
    for (const s of seasonScopeRows) {
      const cid = s.competition_id || s.competitions?.name || s.id;
      const mins = Number(s.minutes_played) || 0;
      const prev = byComp.get(cid) || {
        id: `${cid}-${s.season_id}`,
        competitionId: cid,
        competitionName: s.competitions?.name || "Competition",
        competitionLogoUrl: s.competitions?.logo_url || null,
        apps: 0,
        starts: 0,
        goals: 0,
        assists: 0,
        xg: 0,
        yellowCards: 0,
        passPct: null,
        minutes: 0,
        rating: null,
        passW: 0,
        passM: 0,
        rtW: 0,
        rtM: 0,
      };
      prev.apps += Number(s.matches_played) || 0;
      prev.starts += Number(s.starts) || 0;
      prev.goals += Number(s.goals) || 0;
      prev.assists += Number(s.assists) || 0;
      prev.xg += Number(s.xg) || 0;
      prev.yellowCards += Number(s.yellowCards) || 0;
      prev.minutes += mins;
      if (s.passPct != null && mins > 0) {
        prev.passW += Number(s.passPct) * mins;
        prev.passM += mins;
      }
      if (s.avgMatchRating != null && mins > 0) {
        prev.rtW += Number(s.avgMatchRating) * mins;
        prev.rtM += mins;
      }
      byComp.set(cid, prev);
    }
    return Array.from(byComp.values()).map((r) => ({
      id: r.id,
      competitionId: r.competitionId,
      competitionName: r.competitionName,
      competitionLogoUrl: r.competitionLogoUrl,
      apps: r.apps,
      starts: r.starts,
      goals: r.goals,
      assists: r.assists,
      xg: Math.round(r.xg * 10) / 10,
      yellowCards: r.yellowCards,
      passPct: r.passM > 0 ? Math.round(r.passW / r.passM) : null,
      minutes: r.minutes,
      rating: r.rtM > 0 ? r.rtW / r.rtM : null,
    }));
  }, [seasonScopeRows]);

  // Block 8: Career Stats grouped by (season, team)
  const careerRows: CareerSeasonRow[] = useMemo(() => {
    const grouped = new Map<
      string,
      CareerSeasonRow & { startDate: string; rtW: number; rtM: number }
    >();
    for (const s of seasonStats) {
      const sName = s.seasons?.name || "Season";
      const tName = s.teams?.name || data?.player?.teamName || "Club";
      const tId = s.team_id || data?.player?.teamId || null;
      const k = `${sName}|${tName}`;
      const mins = Number(s.minutes_played) || 0;
      const prev = grouped.get(k) || {
        key: k,
        seasonName: sName,
        teamId: tId,
        teamName: tName,
        badgeUrl: s.teams?.badge_url || null,
        apps: 0,
        goals: 0,
        assists: 0,
        rating: null,
        startDate: String(s.seasons?.start_date || ""),
        rtW: 0,
        rtM: 0,
      };
      prev.apps += Number(s.matches_played) || 0;
      prev.goals += Number(s.goals) || 0;
      prev.assists += Number(s.assists) || 0;
      if (s.avgMatchRating != null && mins > 0) {
        prev.rtW += Number(s.avgMatchRating) * mins;
        prev.rtM += mins;
      }
      grouped.set(k, prev);
    }
    return Array.from(grouped.values())
      .map((r) => ({
        key: r.key,
        seasonName: r.seasonName,
        teamId: r.teamId,
        teamName: r.teamName,
        badgeUrl: r.badgeUrl,
        apps: r.apps,
        goals: r.goals,
        assists: r.assists,
        rating: r.rtM > 0 ? r.rtW / r.rtM : null,
        startDate: r.startDate,
      }))
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [seasonStats, data?.player?.teamName, data?.player?.teamId]);

  if (isLoading) return <LoadingState message="Loading player profile and Supabase metrics..." />;
  if (error || !data?.player) {
    return (
      <ErrorState
        title="Player Not Found"
        message={error || "Profile unavailable"}
        onRetry={() => window.location.reload()}
      />
    );
  }

  const p = data.player;
  const nationalTeams = data.nationalTeams || [];
  const seniorNt = nationalTeams.find((nt: any) => !/U-?\d+/i.test(nt.team_name));
  const intlCaps = seniorNt
    ? seniorNt.caps ?? 0
    : nationalTeams.reduce((acc: number, n: any) => acc + (n.caps || 0), 0);
  const intlGoals = seniorNt
    ? seniorNt.goals ?? 0
    : nationalTeams.reduce((acc: number, n: any) => acc + (n.goals || 0), 0);

  const handleToggleWatchlist = async () => {
    setWatchlistBusy(true);
    try {
      const res = await fetch(`/api/players/${playerId}/watchlist`, {
        method: isInWatchlist ? "DELETE" : "POST",
        headers: { "x-user-org-id": currentClub.id },
      });
      if (res.ok) {
        const j = await res.json();
        setIsInWatchlist(Boolean(j.inWatchlist));
      }
    } finally {
      setWatchlistBusy(false);
    }
  };

  const seasonDisplayLabel =
    selectedSeasonName === "all" ? "All seasons" : selectedSeasonName || "Current";

  const renderBody = (mode: FitMode) => {
    const positionalBlock = (
      <PositionalStatsBlock
        playerId={playerId}
        playerName={p.matchName || p.name}
        shortCode={posData?.template?.shortCode || p.primaryPosition || "POS"}
        leagueName={posData?.competition?.name || p.leagueName || null}
        stats={posData?.stats || []}
        metricMode={metricMode}
        loading={posLoading}
      />
    );
    const strengthsBlock = (
      <StrengthsWeaknessesBlock stats={posData?.stats || []} metricMode={metricMode} loading={posLoading} />
    );
    const similarBlock = (
      <SimilarPlayersBlock currentPlayerId={playerId} players={posData?.similarPlayers || []} loading={posLoading} />
    );
    const upcomingBlock = (
      <UpcomingMatchesBlock
        playerId={playerId}
        matches={data.upcomingMatches || []}
        defaultScoutName={user.name || "Scout"}
        onUpdated={() => setReloadKey((k) => k + 1)}
      />
    );
    const radarBlock = (
      <PositionalRadarBlock
        playerName={p.matchName || p.name}
        shortCode={posData?.template?.shortCode || p.primaryPosition || "POS"}
        leagueName={posData?.competition?.name || p.leagueName || null}
        stats={posData?.stats || []}
        comparePlayer={posData?.comparePlayer || null}
        compareCandidates={posData?.compareCandidates || []}
        selectedCompareId={comparePlayerId}
        onSelectCompareId={setComparePlayerId}
        loading={posLoading}
      />
    );
    const reportBlock = (
      <ScoutReportSummaryBlock
        reports={data.scoutingReports || []}
        matchReports={scouting?.matchReports || []}
        stars={scouting?.stars || null}
        onCreateReport={() => setReportOpen(true)}
      />
    );
    const historyBlock = <ScoutingHistoryBlock data={scouting?.history || null} loading={!scouting} />;
    const column1 = (
      <div className="flex flex-col gap-2.5 min-h-0">
        {positionalBlock}
        {strengthsBlock}
        {similarBlock}
        {upcomingBlock}
      </div>
    );
    const column2 = (
      <div className="flex flex-col gap-2.5 min-h-0">
        {radarBlock}
        {reportBlock}
        {historyBlock}
      </div>
    );

    const seasonBlock = (
      <SeasonStatsBlock
        seasonLabel={seasonDisplayLabel}
        rows={seasonTableRows}
        selectedCompetition={selectedCompetition}
        globalMetricMode={metricMode}
      />
    );
    const careerBlock = <CareerStatsBlock rows={careerRows} />;
    const ratingBlock = <RatingEvolutionBlock matches={data.matchLog || []} selectedCompetition={selectedCompetition} />;
    const ntInjury = (
      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2.5 flex-1 min-h-0 ${mode === "portrait" ? "min-h-[170px]" : ""} ${mode === "landscape" ? "min-h-[150px]" : ""}`}>
        <NationalTeamBlock nationalTeams={nationalTeams} playerCountry={p.country} />
        <InjuryMedicalBlock
          injuries={data.injuries || []}
          availabilityNote={headerAgg.availNote}
          seasonLabel={seasonDisplayLabel}
        />
      </div>
    );

    return (
      <>
        {/* BLOCK 1: Header */}
        <PlayerHeaderBlock
          player={p}
          overallScore={headerAgg.overallScore}
          matchesCount={headerAgg.matches || null}
          minutesCount={headerAgg.minutes || null}
          goalsCount={headerAgg.goals}
          assistsCount={headerAgg.assists}
          avgRating={headerAgg.avgRating}
          internationalCaps={intlCaps}
          internationalGoals={intlGoals}
          isInWatchlist={isInWatchlist}
          watchlistBusy={watchlistBusy}
          onEdit={() => setEditOpen(true)}
          onToggleWatchlist={handleToggleWatchlist}
          onCreateReport={() => setReportOpen(true)}
        />

        {/* BLOCK 2: Global Filters */}
        <GlobalFiltersBar
          competitions={availableCompetitions}
          selectedCompetition={selectedCompetition}
          onSelectCompetition={setSelectedCompetition}
          seasons={availableSeasons}
          selectedSeason={selectedSeasonName}
          onSelectSeason={setSelectedSeasonName}
          metricMode={metricMode}
          onChangeMetricMode={setMetricMode}
          updatedAt={data.latestUpdatedAt}
          sdUrl={p.sdUrl}
        />

        {mode === "landscape" && (
          /* 4-column bento: everything on one screen; the last block of each column stretches so all columns end level */
          <div className="grid grid-cols-[350px_400px_minmax(0,1.1fr)_minmax(0,0.9fr)] gap-2.5 flex-1 min-h-0">
            <div className="flex flex-col gap-2.5 min-h-0">
              <div className="flex-1 min-h-0 overflow-y-auto rounded-[10px] [&>*]:min-h-full">{positionalBlock}</div>
              {strengthsBlock}
            </div>
            <div className="flex flex-col gap-2.5 min-h-0">
              {radarBlock}
              {similarBlock}
              {upcomingBlock}
            </div>
            <div className="flex flex-col gap-2.5 min-h-0">
              {seasonBlock}
              {careerBlock}
              {ratingBlock}
            </div>
            <div className="flex flex-col gap-2.5 min-h-0">
              {reportBlock}
              {historyBlock}
              {ntInjury}
            </div>
          </div>
        )}

        {mode === "portrait" && (
          /* Portrait tablets: two columns on top, season/career/rating band below */
          <div className="grid grid-cols-2 grid-rows-[minmax(0,1fr)_auto] gap-2.5 flex-1 min-h-0">
            {column1}
            {column2}
            <div className="col-span-2 grid grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-2.5 min-w-0">
                {seasonBlock}
                {careerBlock}
              </div>
              <div className="flex flex-col gap-2.5 min-w-0">
                {ratingBlock}
                {ntInjury}
              </div>
            </div>
          </div>
        )}

        {mode === "mobile" && (
          /* Phones: stacked blocks with normal page scroll */
          <div className="grid grid-cols-1 gap-2.5">
            {column1}
            {column2}
            <div className="flex flex-col gap-2.5">
              {seasonBlock}
              {careerBlock}
              {ratingBlock}
              {ntInjury}
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <>
      {/* Modals */}
      <EditPlayerModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        player={p}
        scraped={data.scraped || p}
        translatePosition={translatePosition}
        onSaved={() => setReloadKey((k) => k + 1)}
      />

      <SpondaReportEditorModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        initialPlayer={{
          id: p.id,
          name: p.matchName || p.name,
          club: p.teamName,
          position: p.primaryPosition,
        }}
        currentUser={{
          name: user.name || "Scout",
          role: userRole,
          orgId: currentClub.id,
        }}
        onSave={async (payload) => {
          const res = await fetch("/api/reports", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-user-org-id": currentClub.id,
              "x-user-name": user.name || "Scout",
              "x-user-role": userRole,
            },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const errJson = await res.json();
            throw new Error(errJson.error || "Failed to save scouting report");
          }
          setReloadKey((k) => k + 1);
        }}
      />


      <FitToScreenCanvas
        className="flex flex-col gap-2"
      >
        {renderBody}
      </FitToScreenCanvas>
    </>
  );
}
