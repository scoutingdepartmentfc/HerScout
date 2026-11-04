"use client";

import React, { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/Table";
import { EmptyState, LoadingState } from "@/components/ui/StatusStates";
import { EscudoEquipo } from "@/components/scouting/EscudoEquipo";
import { Bandera } from "@/components/scouting/Bandera";
import { Search, SlidersHorizontal, Bookmark, Eye, X, Check } from "lucide-react";
import { notaClases } from "@/lib/notaColor";
import { getPositionBadge } from "@/lib/positions";
import { OptaLogo } from "@/components/scouting/OptaLogo";
import { CamisetaDorsal } from "@/components/scouting/CamisetaDorsal";

interface PlayerRow {
  id: string;
  name: string;
  matchName?: string;
  country?: string;
  photoUrl?: string;
  position: string;
  grupoDemarcacion: string;
  shirtNumber?: number | string | null;
  height?: number;
  weight?: number;
  teamId?: string;
  teamName: string;
  badgeUrl?: string;
  leagueName?: string;
  leagueLogoUrl?: string;
  seasonName?: string | null;
  isCurrentSeason?: boolean;
  isAccumulated?: boolean;
  minutesPlayed?: number;
  matchesPlayed?: number;
  notaGlobal?: number | null;
  notaAtaque?: number | null;
  notaConstruccion?: number | null;
  notaDefensa?: number | null;
  notaBalonParado?: number | null;
  notaDisponibilidad?: number | null;
  notaFisico?: number | null;
}

function PlayersDirectoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read initial states from URL search parameters to preserve them across browser back/forward
  const [searchTerm, setSearchTerm] = useState(searchParams.get("search") || "");
  const [positionFilter, setPositionFilter] = useState(searchParams.get("position") || "all");
  const [teamFilter, setTeamFilter] = useState(searchParams.get("team") || "all");
  const [leagueFilter, setLeagueFilter] = useState(searchParams.get("league") || "all");
  const [seasonFilter, setSeasonFilter] = useState(searchParams.get("season") || "all");
  const [minRatingFilter, setMinRatingFilter] = useState<string>(searchParams.get("minRating") || "all");
  const [sortBy, setSortBy] = useState<string>(searchParams.get("sortBy") || "nota_global");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">((searchParams.get("order") as "asc" | "desc") || "desc");

  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [availableTeams, setAvailableTeams] = useState<string[]>([]);
  const [availableLeagues, setAvailableLeagues] = useState<string[]>([]);
  const [availableSeasons, setAvailableSeasons] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(() => {
    // If any advanced filter is populated, keep drawer open
    return (
      (searchParams.get("team") && searchParams.get("team") !== "all") ||
      (searchParams.get("league") && searchParams.get("league") !== "all") ||
      (searchParams.get("season") && searchParams.get("season") !== "all") ||
      (searchParams.get("minRating") && searchParams.get("minRating") !== "all") ||
      false
    );
  });
  const [savedWatchlist, setSavedWatchlist] = useState<Record<string, boolean>>({});

  // Synchronize filter states whenever URL searchParams change (e.g. back button clicked)
  useEffect(() => {
    setSearchTerm(searchParams.get("search") || "");
    setPositionFilter(searchParams.get("position") || "all");
    setTeamFilter(searchParams.get("team") || "all");
    setLeagueFilter(searchParams.get("league") || "all");
    setSeasonFilter(searchParams.get("season") || "all");
    setMinRatingFilter(searchParams.get("minRating") || "all");
    setSortBy(searchParams.get("sortBy") || "nota_global");
    setSortOrder((searchParams.get("order") as "asc" | "desc") || "desc");
    if (
      (searchParams.get("team") && searchParams.get("team") !== "all") ||
      (searchParams.get("league") && searchParams.get("league") !== "all") ||
      (searchParams.get("season") && searchParams.get("season") !== "all") ||
      (searchParams.get("minRating") && searchParams.get("minRating") !== "all")
    ) {
      setShowAdvancedFilters(true);
    }
  }, [searchParams]);

  // Update browser URL query string without reloading the page
  const updateUrlParams = (newParams: Record<string, string>) => {
    const params = new URLSearchParams(window.location.search);
    Object.entries(newParams).forEach(([k, v]) => {
      if (!v || v === "all" || (k === "sortBy" && v === "nota_global") || (k === "order" && v === "desc")) {
        params.delete(k);
      } else {
        params.set(k, v);
      }
    });
    const qs = params.toString();
    const newPath = qs ? `/players?${qs}` : "/players";
    window.history.replaceState(null, "", newPath);
  };

  useEffect(() => {
    async function fetchPlayers() {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          search: searchTerm,
          position: positionFilter,
          team: teamFilter,
          league: leagueFilter,
          season: seasonFilter,
          sortBy,
          order: sortOrder,
        });
        if (minRatingFilter !== "all") {
          params.append("minRating", minRatingFilter);
        }

        const res = await fetch(`/api/players?${params.toString()}`);
        const json = await res.json();
        setPlayers(json.players || []);
        if (json.filters) {
          if (json.filters.teams?.length) setAvailableTeams(json.filters.teams);
          if (json.filters.leagues?.length) setAvailableLeagues(json.filters.leagues);
          if (json.filters.seasons?.length) setAvailableSeasons(json.filters.seasons);
        }
      } catch (err) {
        console.error("Failed to fetch players:", err);
      } finally {
        setIsLoading(false);
      }
    }

    const timer = setTimeout(() => {
      fetchPlayers();
      updateUrlParams({
        search: searchTerm,
        position: positionFilter,
        team: teamFilter,
        league: leagueFilter,
        season: seasonFilter,
        minRating: minRatingFilter,
        sortBy,
        order: sortOrder,
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [searchTerm, positionFilter, teamFilter, leagueFilter, seasonFilter, minRatingFilter, sortBy, sortOrder]);

  const toggleWatchlist = (id: string) => {
    setSavedWatchlist((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSort = (colKey: string) => {
    if (sortBy === colKey) {
      setSortOrder(sortOrder === "desc" ? "asc" : "desc");
    } else {
      setSortBy(colKey);
      setSortOrder("desc");
    }
  };

  const resetAllFilters = () => {
    setSearchTerm("");
    setPositionFilter("all");
    setTeamFilter("all");
    setLeagueFilter("all");
    setSeasonFilter("all");
    setMinRatingFilter("all");
    setSortBy("nota_global");
    setSortOrder("desc");
    updateUrlParams({
      search: "",
      position: "all",
      team: "all",
      league: "all",
      season: "all",
      minRating: "all",
      sortBy: "nota_global",
      order: "desc",
    });
  };

  const activeFiltersCount =
    (positionFilter !== "all" ? 1 : 0) +
    (teamFilter !== "all" ? 1 : 0) +
    (leagueFilter !== "all" ? 1 : 0) +
    (seasonFilter !== "all" ? 1 : 0) +
    (minRatingFilter !== "all" ? 1 : 0) +
    (searchTerm.trim() ? 1 : 0);

  const getScoreBadge = (score: number | null | undefined, isGeneral: boolean = false) => {
    if (score === null || score === undefined) {
      return <span className="text-muted-foreground/40 font-mono text-xs">—</span>;
    }
    const val = Math.round(score);
    const colorClass = `${notaClases(val).badge} ${isGeneral ? "font-black" : "font-bold"}`;

    return (
      <span className={`inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-md text-xs border tabular-nums font-mono ${colorClass}`}>
        {val}
      </span>
    );
  };

  const getPositionPill = (posName: string) => {
    const badge = getPositionBadge(posName);
    
    let colorClasses = "bg-slate-800/80 text-slate-300 border-slate-700/60";
    if (badge.category === "GK") {
      colorClasses = "bg-amber-950/40 text-amber-300 border-amber-800/50";
    } else if (badge.category === "DEF") {
      colorClasses = "bg-blue-950/40 text-blue-300 border-blue-800/50";
    } else if (badge.category === "MID") {
      colorClasses = "bg-emerald-950/40 text-emerald-300 border-emerald-800/50";
    } else if (badge.category === "ATT") {
      colorClasses = "bg-rose-950/40 text-rose-300 border-rose-800/50";
    }

    return (
      <span
        title={badge.fullEn}
        className={`inline-flex items-center justify-center min-w-[46px] px-2 py-0.5 rounded text-[11px] font-bold font-mono tracking-wider border uppercase shadow-sm cursor-help ${colorClasses}`}
      >
        {badge.code}
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-white">Player Database</h1>
            <OptaLogo size="xs" label="Verified" className="bg-sky-500/10 border-sky-400/30 text-sky-300" />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Searchable registry of professional women's football profiles ranked by advanced performance ratings.
          </p>
        </div>
      </div>

      {/* Modern Compact Filter Bar */}
      <Card className="bg-[#070c18] border-border/80 shadow-xl">
        <CardContent className="p-3 space-y-3">
          {/* Main Search Row */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
            {/* Search Input */}
            <div className="md:col-span-6">
              <Input
                placeholder="Search player name... (Bonmatí, Paralluelo, Guijarro, Weir)"
                leftIcon={<Search className="w-4 h-4 text-muted-foreground" />}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-navy-950 h-9 text-xs"
              />
            </div>

            {/* Position Select */}
            <div className="md:col-span-3">
              <Select
                value={positionFilter}
                onChange={(e) => setPositionFilter(e.target.value)}
                className="bg-navy-950 h-9 text-xs"
              >
                <option value="all">All Positions (GK, DEF, MID, ATT)</option>
                <optgroup label="Goalkeepers">
                  <option value="Portero">GK · Goalkeepers</option>
                </optgroup>
                <optgroup label="Defenders">
                  <option value="Central">CB · Centre-Backs</option>
                  <option value="Lateral">FB · Full-Backs (RB / LB)</option>
                </optgroup>
                <optgroup label="Midfielders">
                  <option value="Mediocentro Defensivo">CDM · Defensive Midfielders</option>
                  <option value="Mediocentro">CM · Central Midfielders</option>
                  <option value="Mediapunta">CAM · Attacking Midfielders</option>
                </optgroup>
                <optgroup label="Attackers">
                  <option value="Extremo">W · Wingers (LW / RW)</option>
                  <option value="Delantero">ST · Centre-Forwards / Strikers</option>
                </optgroup>
              </Select>
            </div>

            {/* Filter Toggle & Quick Reset */}
            <div className="md:col-span-3 flex items-center gap-2">
              <Button
                type="button"
                variant={showAdvancedFilters ? "pitch" : "outline"}
                size="sm"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="h-9 px-3 text-xs w-full justify-between"
                leftIcon={<SlidersHorizontal className="w-3.5 h-3.5" />}
              >
                <span>Filters</span>
                {activeFiltersCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.2 bg-white/20 text-white rounded text-[10px] font-bold">
                    {activeFiltersCount}
                  </span>
                )}
              </Button>

              {activeFiltersCount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetAllFilters}
                  className="h-9 px-2 text-xs text-muted-foreground hover:text-white shrink-0"
                  title="Reset all filters"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Collapsible Advanced Filters Drawer */}
          {showAdvancedFilters && (
            <div className="pt-2.5 pb-1 border-t border-border/40 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
              {/* Season Filter (Default: All seasons / Acumulado) */}
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                  Season / Temporada
                </label>
                <Select
                  value={seasonFilter}
                  onChange={(e) => setSeasonFilter(e.target.value)}
                  className="bg-navy-950 h-8 text-xs font-semibold"
                >
                  <option value="all">⚡ All Seasons (Acumulado)</option>
                  {availableSeasons.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Club / Team */}
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                  Club / Team
                </label>
                <Select
                  value={teamFilter}
                  onChange={(e) => setTeamFilter(e.target.value)}
                  className="bg-navy-950 h-8 text-xs"
                >
                  <option value="all">All Teams</option>
                  {availableTeams.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Competition / League */}
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                  Competition
                </label>
                <Select
                  value={leagueFilter}
                  onChange={(e) => setLeagueFilter(e.target.value)}
                  className="bg-navy-950 h-8 text-xs"
                >
                  <option value="all">All Competitions</option>
                  {availableLeagues.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Rating Threshold (Min OVR) */}
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                  Min Rating (OVR)
                </label>
                <Select
                  value={minRatingFilter}
                  onChange={(e) => setMinRatingFilter(e.target.value)}
                  className="bg-navy-950 h-8 text-xs"
                >
                  <option value="all">All Ratings (0+)</option>
                  <option value="85">⭐ Elite 85+ OVR</option>
                  <option value="80">Top 80+ OVR</option>
                  <option value="75">75+ OVR</option>
                  <option value="70">70+ OVR</option>
                  <option value="60">60+ OVR</option>
                </Select>
              </div>
            </div>
          )}

          {/* Quick Score Ordering Pills */}
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/40 text-xs">
            <span className="text-[11px] font-semibold text-muted-foreground mr-1">Sort metric:</span>
            {[
              { id: "nota_global", label: "Overall (OVR)" },
              { id: "nota_ataque", label: "Attacking (ATT)" },
              { id: "nota_construccion", label: "Build-up (CRE)" },
              { id: "nota_defensa", label: "Defending (DEF)" },
              { id: "nota_balon_parado", label: "Set Pieces (SET)" },
              { id: "nota_disponibilidad", label: "Availability (AVAIL)" },
              { id: "nota_fisico", label: "Physical (PHY)" },
            ].map((col) => {
              const active = sortBy === col.id;
              return (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => handleSort(col.id)}
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs transition-colors border ${
                    active
                      ? "bg-primary text-white border-primary font-semibold shadow-sm"
                      : "bg-navy-950 border-border/60 text-muted-foreground hover:text-white hover:border-border"
                  }`}
                >
                  <span>{col.label}</span>
                  {active && <span className="text-[10px]">{sortOrder === "desc" ? "↓" : "↑"}</span>}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card className="bg-[#070c18] border-border/80 shadow-2xl overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between py-3 px-4 border-b border-border/40">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-bold text-white">Player Registry Results</CardTitle>
            <Badge variant="secondary" size="sm">
              {players.length} profiles
            </Badge>
          </div>
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            Normalized 0–100 Rating vs. League Average
          </span>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <LoadingState message="Loading player database and metrics..." />
          ) : players.length === 0 ? (
            <EmptyState
              title="No players found"
              description="Try adjusting your search criteria, club, position, or rating filter."
              actionLabel="Clear all filters"
              onAction={resetAllFilters}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border/60 bg-navy-950/60 text-xs">
                  <TableHead className="font-semibold text-white">Player</TableHead>
                  <TableHead className="font-semibold text-white text-center">POS</TableHead>
                  <TableHead className="font-semibold text-white">Club</TableHead>
                  <TableHead
                    onClick={() => handleSort("nota_global")}
                    className="cursor-pointer text-center font-bold text-amber-300 hover:text-amber-200 select-none"
                    title="Sort by Overall OVR"
                  >
                    OVR {sortBy === "nota_global" && (sortOrder === "desc" ? "↓" : "↑")}
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort("nota_ataque")}
                    className="cursor-pointer text-center font-semibold text-slate-300 hover:text-white select-none"
                    title="Sort by Attacking"
                  >
                    ATT {sortBy === "nota_ataque" && (sortOrder === "desc" ? "↓" : "↑")}
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort("nota_construccion")}
                    className="cursor-pointer text-center font-semibold text-slate-300 hover:text-white select-none"
                    title="Sort by Build-up"
                  >
                    CRE {sortBy === "nota_construccion" && (sortOrder === "desc" ? "↓" : "↑")}
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort("nota_defensa")}
                    className="cursor-pointer text-center font-semibold text-slate-300 hover:text-white select-none"
                    title="Sort by Defending"
                  >
                    DEF {sortBy === "nota_defensa" && (sortOrder === "desc" ? "↓" : "↑")}
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort("nota_balon_parado")}
                    className="cursor-pointer text-center font-semibold text-slate-300 hover:text-white select-none"
                    title="Sort by Set Pieces"
                  >
                    SET {sortBy === "nota_balon_parado" && (sortOrder === "desc" ? "↓" : "↑")}
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort("nota_disponibilidad")}
                    className="cursor-pointer text-center font-semibold text-slate-300 hover:text-white select-none"
                    title="Sort by Availability"
                  >
                    AVAIL {sortBy === "nota_disponibilidad" && (sortOrder === "desc" ? "↓" : "↑")}
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort("nota_fisico")}
                    className="cursor-pointer text-center font-semibold text-slate-300 hover:text-white select-none"
                    title="Sort by Physical Rating"
                  >
                    PHY {sortBy === "nota_fisico" && (sortOrder === "desc" ? "↓" : "↑")}
                  </TableHead>
                  <TableHead className="text-right font-semibold text-white">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/30">
                {players.map((player) => (
                  <TableRow key={player.id} className="hover:bg-navy-900/50 transition-colors">
                    <TableCell>
                      <Link href={`/players/${player.id}`} className="flex items-center gap-3 group">
                        <div className="w-9 h-9 rounded-full bg-navy-900 border border-white/20 flex items-center justify-center overflow-hidden shrink-0 group-hover:border-primary transition-colors">
                          {player.photoUrl ? (
                            <img
                              src={player.photoUrl}
                              alt={player.name}
                              className="w-full h-full object-cover object-top"
                              loading="lazy"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <span className="text-xs font-bold text-muted-foreground">⚽</span>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            {player.shirtNumber && (
                              <CamisetaDorsal number={player.shirtNumber} size="xs" />
                            )}
                            <span
                              className="font-semibold text-white group-hover:text-primary transition-colors leading-tight"
                              title={player.name !== player.matchName ? player.name : undefined}
                            >
                              {player.matchName || player.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Bandera country={player.country} size="xs" />
                            <span className="text-[10px] text-muted-foreground">{player.country || "—"}</span>
                          </div>
                        </div>
                      </Link>
                    </TableCell>

                    {/* Abbreviated English Position */}
                    <TableCell className="text-center whitespace-nowrap">
                      {getPositionPill(player.position)}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2">
                        <EscudoEquipo
                          teamId={player.teamId}
                          badgeUrl={player.badgeUrl}
                          name={player.teamName}
                          size={18}
                        />
                        <div className="min-w-0">
                          <div className="text-xs text-white font-medium">{player.teamName}</div>
                          {player.leagueName && (
                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                              {player.leagueLogoUrl && (
                                <img
                                  src={player.leagueLogoUrl}
                                  alt=""
                                  className="h-3.5 w-auto max-w-[14px] object-contain bg-transparent shrink-0"
                                  loading="lazy"
                                />
                              )}
                              <span className="truncate">{player.leagueName}</span>
                            </div>
                          )}
                          {/* Season Indicator Pill */}
                          {player.seasonName && (
                            <div
                              className="mt-0.5 inline-flex rounded border border-white/10 bg-white/5 px-1 text-[9px] font-semibold text-slate-300"
                              title={player.isAccumulated ? "Promedio acumulado de todas las temporadas" : `Temporada ${player.seasonName}`}
                            >
                              {player.seasonName}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Scoring Columns */}
                    <TableCell className="text-center font-bold">
                      {getScoreBadge(player.notaGlobal, true)}
                    </TableCell>
                    <TableCell className="text-center">
                      {getScoreBadge(player.notaAtaque)}
                    </TableCell>
                    <TableCell className="text-center">
                      {getScoreBadge(player.notaConstruccion)}
                    </TableCell>
                    <TableCell className="text-center">
                      {getScoreBadge(player.notaDefensa)}
                    </TableCell>
                    <TableCell className="text-center">
                      {getScoreBadge(player.notaBalonParado)}
                    </TableCell>
                    <TableCell className="text-center">
                      {getScoreBadge(player.notaDisponibilidad)}
                    </TableCell>
                    <TableCell className="text-center">
                      {getScoreBadge(player.notaFisico)}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant={savedWatchlist[player.id] ? "pitch" : "ghost"}
                          size="xs"
                          onClick={() => toggleWatchlist(player.id)}
                          leftIcon={
                            savedWatchlist[player.id] ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Bookmark className="w-3 h-3" />
                            )
                          }
                          className="h-7 px-2"
                        >
                          {savedWatchlist[player.id] ? "Saved" : "Track"}
                        </Button>
                        <Link href={`/players/${player.id}`}>
                          <Button size="xs" variant="secondary" leftIcon={<Eye className="w-3 h-3" />} className="h-7 px-2.5">
                            Profile
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PlayersDirectoryPage() {
  return (
    <Suspense fallback={<LoadingState message="Loading player database..." />}>
      <PlayersDirectoryContent />
    </Suspense>
  );
}
