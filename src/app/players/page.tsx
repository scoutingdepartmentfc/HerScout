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
import { Search, SlidersHorizontal, Bookmark, Eye, X, Check, ChevronDown, TrendingUp, TrendingDown, Minus } from "lucide-react";
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
  birthDate?: string | null;
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
  leagueCountry?: string | null;
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
  trend?: "up" | "neutral" | "down" | null;
}

function guessLeagueCountry(leagueName?: string | null): string | null {
  if (!leagueName) return null;
  const lower = leagueName.toLowerCase();
  if (lower.includes("liga f") || lower.includes("primera división") || lower.includes("copa de la reina") || lower.includes("spain") || lower.includes("españa")) return "Spain";
  if (lower.includes("super league") || lower.includes("wsl") || lower.includes("england") || lower.includes("inglaterra") || lower.includes("championship")) return "England";
  if (lower.includes("bundesliga") || lower.includes("germany") || lower.includes("alemania") || lower.includes("dfb")) return "Germany";
  if (lower.includes("première ligue") || lower.includes("premiere ligue") || lower.includes("division 1") || lower.includes("france") || lower.includes("francia")) return "France";
  if (lower.includes("serie a") || lower.includes("italy") || lower.includes("italia") || lower.includes("coppa italia")) return "Italy";
  if (lower.includes("liga mx") || lower.includes("mexico") || lower.includes("méxico")) return "Mexico";
  if (lower.includes("nwsl") || lower.includes("usa") || lower.includes("united states") || lower.includes("estados unidos") || lower.includes("usl")) return "USA";
  if (lower.includes("a-league") || lower.includes("australia")) return "Australia";
  if (lower.includes("swpl") || lower.includes("scotland") || lower.includes("escocia")) return "Scotland";
  if (lower.includes("damallsvenskan") || lower.includes("sweden") || lower.includes("suecia")) return "Sweden";
  if (lower.includes("toppserien") || lower.includes("norway") || lower.includes("noruega")) return "Norway";
  if (lower.includes("eredivisie") || lower.includes("netherlands") || lower.includes("holanda") || lower.includes("holland")) return "Netherlands";
  if (lower.includes("northern super league") || lower.includes("canada") || lower.includes("canadá")) return "Canada";
  if (lower.includes("brasileir") || lower.includes("brazil") || lower.includes("brasil")) return "Brazil";
  if (lower.includes("we league") || lower.includes("nadeshiko") || lower.includes("japan") || lower.includes("japón")) return "Japan";
  if (lower.includes("superliga") || lower.includes("portugal")) return "Portugal";
  return null;
}

function MultiSelectDropdown<T extends { id: string; name: string; badgeUrl?: string | null; country?: string | null; teamId?: string | null }>({
  label,
  options,
  selectedIds,
  onChange,
  placeholder = "Select...",
  renderIcon,
}: {
  label: string;
  options: T[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  renderIcon?: (item: T) => React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = React.useMemo(() => {
    if (!search.trim()) return options;
    const s = search.toLowerCase();
    return options.filter((o) => o.name.toLowerCase().includes(s));
  }, [options, search]);

  const toggleOption = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((item) => item !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider block mb-1">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-9 px-3 rounded-lg border border-white/10 bg-navy-950/90 text-xs flex items-center justify-between gap-2 hover:border-emerald-500/50 hover:bg-navy-900 transition-all text-left shadow-sm"
      >
        <div className="flex items-center gap-1.5 truncate">
          {selectedIds.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : (
            <span className="font-semibold text-emerald-400">
              {selectedIds.length === 1 ? selectedIds[0] : `${selectedIds.length} seleccionados`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {selectedIds.length > 0 && (
            <span
              onClick={clearAll}
              className="p-1 rounded-full hover:bg-white/20 text-muted-foreground hover:text-white transition-colors"
              title="Limpiar filtro"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
        </div>
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-72 rounded-xl border border-white/15 bg-[#0a1224]/95 backdrop-blur-xl shadow-2xl z-50 flex flex-col overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
          <div className="p-2.5 border-b border-white/10 bg-navy-950/60">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="w-full h-8 pl-8 pr-2.5 rounded-lg bg-navy-900/90 text-xs text-white border border-white/10 focus:outline-none focus:border-emerald-500 placeholder:text-muted-foreground/60 transition-colors"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto p-1.5 space-y-0.5 divide-y divide-white/5">
            {filteredOptions.length === 0 ? (
              <div className="py-5 text-center text-xs text-muted-foreground">
                No se encontraron resultados
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = selectedIds.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggleOption(opt.id)}
                    className={`w-full py-2 px-2.5 rounded-lg flex items-center justify-between text-left text-xs transition-colors ${
                      isSelected
                        ? "bg-emerald-500/15 text-emerald-300 font-semibold border border-emerald-500/30"
                        : "text-slate-300 hover:bg-white/5 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate pr-2">
                      {renderIcon && renderIcon(opt)}
                      <span className="truncate">{opt.name}</span>
                    </div>
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? "bg-emerald-500 border-emerald-400 text-gray-950 font-black"
                          : "border-white/20 bg-navy-950"
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
          {selectedIds.length > 0 && (
            <div className="p-2 border-t border-white/10 bg-navy-950/90 flex justify-between items-center text-[11px] px-3">
              <span className="text-muted-foreground">{selectedIds.length} seleccionados</span>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-emerald-400 hover:text-emerald-300 font-semibold transition-colors"
              >
                Deseleccionar todos
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PlayersDirectoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read initial states from URL search parameters, fallback to sessionStorage to remember filters across page visits
  const getSaved = (key: string) => {
    if (typeof window === "undefined") return null;
    try {
      return sessionStorage.getItem(`players_filter_${key}`);
    } catch {
      return null;
    }
  };

  const [searchTerm, setSearchTerm] = useState(() => searchParams.get("search") ?? getSaved("search") ?? "");
  const [positionFilter, setPositionFilter] = useState(() => searchParams.get("position") ?? getSaved("position") ?? "all");
  const [selectedTeams, setSelectedTeams] = useState<string[]>(() => {
    const teams = searchParams.get("teams") || searchParams.get("team") || getSaved("teams");
    return teams && teams !== "all" ? teams.split(",").map((t) => t.trim()).filter(Boolean) : [];
  });
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>(() => {
    const leagues = searchParams.get("leagues") || searchParams.get("league") || getSaved("leagues");
    return leagues && leagues !== "all" ? leagues.split(",").map((l) => l.trim()).filter(Boolean) : [];
  });
  const [seasonFilter, setSeasonFilter] = useState(() => searchParams.get("season") ?? getSaved("season") ?? "all");
  const [minRatingFilter, setMinRatingFilter] = useState<string>(() => searchParams.get("minRating") ?? getSaved("minRating") ?? "all");
  const [minAge, setMinAge] = useState<number>(() => {
    const a = searchParams.get("minAge") || getSaved("minAge");
    return a ? Number(a) : 15;
  });
  const [maxAge, setMaxAge] = useState<number>(() => {
    const a = searchParams.get("maxAge") || getSaved("maxAge");
    return a ? Number(a) : 42;
  });
  const [sortBy, setSortBy] = useState<string>(() => searchParams.get("sortBy") ?? getSaved("sortBy") ?? "nota_global");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(() => (searchParams.get("order") as "asc" | "desc") ?? (getSaved("order") as "asc" | "desc") ?? "desc");

  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [evaluatedPeriod, setEvaluatedPeriod] = useState<string>("TREND (LAST 3M)");
  const [availableTeams, setAvailableTeams] = useState<{ id: string; name: string; teamId?: string | null; badgeUrl?: string | null }[]>([]);
  const [availableLeagues, setAvailableLeagues] = useState<{ id: string; name: string; logoUrl?: string | null; country?: string | null }[]>([]);
  const [availableSeasons, setAvailableSeasons] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(() => {
    return (
      Boolean(searchParams.get("teams") || (searchParams.get("team") && searchParams.get("team") !== "all")) ||
      Boolean(searchParams.get("leagues") || (searchParams.get("league") && searchParams.get("league") !== "all")) ||
      (searchParams.get("season") && searchParams.get("season") !== "all") ||
      (searchParams.get("minRating") && searchParams.get("minRating") !== "all") ||
      Boolean(searchParams.get("minAge") || searchParams.get("maxAge")) ||
      false
    );
  });
  const [savedWatchlist, setSavedWatchlist] = useState<Record<string, boolean>>({});

  // Synchronize filter states whenever URL searchParams change
  useEffect(() => {
    setSearchTerm(searchParams.get("search") || "");
    setPositionFilter(searchParams.get("position") || "all");
    const teams = searchParams.get("teams") || searchParams.get("team");
    setSelectedTeams(teams && teams !== "all" ? teams.split(",").map((t) => t.trim()).filter(Boolean) : []);
    const leagues = searchParams.get("leagues") || searchParams.get("league");
    setSelectedLeagues(leagues && leagues !== "all" ? leagues.split(",").map((l) => l.trim()).filter(Boolean) : []);
    setSeasonFilter(searchParams.get("season") || "all");
    setMinRatingFilter(searchParams.get("minRating") || "all");
    const pMinAge = searchParams.get("minAge");
    const pMaxAge = searchParams.get("maxAge");
    setMinAge(pMinAge ? Number(pMinAge) : 15);
    setMaxAge(pMaxAge ? Number(pMaxAge) : 42);
    setSortBy(searchParams.get("sortBy") || "nota_global");
    setSortOrder((searchParams.get("order") as "asc" | "desc") || "desc");
  }, [searchParams]);

  // Update browser URL query string and persist in sessionStorage
  const updateUrlParams = (newParams: Record<string, string>) => {
    const params = new URLSearchParams(window.location.search);
    Object.entries(newParams).forEach(([k, v]) => {
      if (!v || v === "all" || (k === "sortBy" && v === "nota_global") || (k === "order" && v === "desc")) {
        params.delete(k);
        try { sessionStorage.removeItem(`players_filter_${k}`); } catch {}
      } else {
        params.set(k, v);
        try { sessionStorage.setItem(`players_filter_${k}`, v); } catch {}
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
          teams: selectedTeams.join(","),
          leagues: selectedLeagues.join(","),
          season: seasonFilter,
          sortBy,
          order: sortOrder,
        });
        if (minRatingFilter !== "all") {
          params.append("minRating", minRatingFilter);
        }
        if (minAge > 15) {
          params.append("minAge", String(minAge));
        }
        if (maxAge < 42) {
          params.append("maxAge", String(maxAge));
        }

        const res = await fetch(`/api/players?${params.toString()}`);
        const json = await res.json();
        setPlayers(json.players || []);
        if (json.evaluatedPeriod) {
          setEvaluatedPeriod(json.evaluatedPeriod);
        }
        if (json.filters) {
          if (json.filters.teamsDetailed?.length) {
            setAvailableTeams(json.filters.teamsDetailed.map((t: any) => ({ id: t.name, name: t.name, teamId: t.teamId, badgeUrl: t.badgeUrl })));
          } else if (json.filters.teams?.length) {
            setAvailableTeams(json.filters.teams.map((t: string) => ({ id: t, name: t })));
          }

          if (json.filters.leaguesDetailed?.length) {
            setAvailableLeagues(
              json.filters.leaguesDetailed.map((l: any) => ({
                id: l.name,
                name: l.name,
                logoUrl: l.logoUrl,
                country: l.country || guessLeagueCountry(l.name),
              }))
            );
          } else if (json.filters.leagues?.length) {
            setAvailableLeagues(
              json.filters.leagues.map((l: string) => ({
                id: l,
                name: l,
                country: guessLeagueCountry(l),
              }))
            );
          }

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
        teams: selectedTeams.join(","),
        leagues: selectedLeagues.join(","),
        season: seasonFilter,
        minRating: minRatingFilter,
        minAge: minAge > 15 ? String(minAge) : "",
        maxAge: maxAge < 42 ? String(maxAge) : "",
        sortBy,
        order: sortOrder,
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [searchTerm, positionFilter, selectedTeams, selectedLeagues, seasonFilter, minRatingFilter, minAge, maxAge, sortBy, sortOrder]);

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
    try {
      ["search", "position", "teams", "leagues", "season", "minRating", "minAge", "maxAge", "sortBy", "order"].forEach((k) => {
        sessionStorage.removeItem(`players_filter_${k}`);
      });
    } catch {}
    setSearchTerm("");
    setPositionFilter("all");
    setSelectedTeams([]);
    setSelectedLeagues([]);
    setSeasonFilter("all");
    setMinRatingFilter("all");
    setMinAge(15);
    setMaxAge(42);
    setSortBy("nota_global");
    setSortOrder("desc");
    updateUrlParams({
      search: "",
      position: "all",
      teams: "",
      leagues: "",
      season: "all",
      minRating: "all",
      minAge: "",
      maxAge: "",
      sortBy: "nota_global",
      order: "desc",
    });
  };

  const activeFiltersCount =
    (positionFilter !== "all" ? 1 : 0) +
    (selectedTeams.length > 0 ? 1 : 0) +
    (selectedLeagues.length > 0 ? 1 : 0) +
    (seasonFilter !== "all" ? 1 : 0) +
    (minRatingFilter !== "all" ? 1 : 0) +
    (minAge > 15 || maxAge < 42 ? 1 : 0) +
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
      <Card className="bg-[#070c18] border-border/80 shadow-xl relative z-30 overflow-visible">
        <CardContent className="p-3 space-y-3 overflow-visible">
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
            <div className="pt-2.5 pb-1 border-t border-border/40 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
              {/* Season Filter (Default: All seasons / Acumulado) */}
              <div>
                <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider block mb-1">
                  Season / Temporada
                </label>
                <Select
                  value={seasonFilter}
                  onChange={(e) => setSeasonFilter(e.target.value)}
                  className="bg-navy-950/90 border-white/10 h-9 text-xs font-semibold rounded-lg"
                >
                  <option value="all">⚡ All Seasons (Acumulado)</option>
                  {availableSeasons.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Club / Team (Multi-select with Badge) */}
              <div>
                <MultiSelectDropdown
                  label="Clubs / Equipos"
                  options={availableTeams}
                  selectedIds={selectedTeams}
                  onChange={setSelectedTeams}
                  placeholder="Todos los equipos"
                  renderIcon={(opt) => (
                    <EscudoEquipo
                      teamId={opt.teamId}
                      badgeUrl={opt.badgeUrl}
                      name={opt.name}
                      size={18}
                      className="shrink-0"
                    />
                  )}
                />
              </div>

              {/* Competition / League (Multi-select with Flag/Logo) */}
              <div>
                <MultiSelectDropdown
                  label="Ligas / Competiciones"
                  options={availableLeagues}
                  selectedIds={selectedLeagues}
                  onChange={setSelectedLeagues}
                  placeholder="Todas las ligas"
                  renderIcon={(opt) => (
                    <div className="flex items-center gap-1 shrink-0">
                      {opt.country ? (
                        <Bandera country={opt.country} size="xs" />
                      ) : (
                        <span className="text-[10px]">🏆</span>
                      )}
                    </div>
                  )}
                />
              </div>

              {/* Rating Threshold (Min OVR) */}
              <div>
                <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider block mb-1">
                  Min Rating (OVR)
                </label>
                <Select
                  value={minRatingFilter}
                  onChange={(e) => setMinRatingFilter(e.target.value)}
                  className="bg-navy-950/90 border-white/10 h-9 text-xs rounded-lg"
                >
                  <option value="all">All Ratings (0+)</option>
                  <option value="85">⭐ Elite 85+ OVR</option>
                  <option value="80">Top 80+ OVR</option>
                  <option value="75">75+ OVR</option>
                  <option value="70">70+ OVR</option>
                  <option value="60">60+ OVR</option>
                </Select>
              </div>

              {/* Age Range Slider / Barra de Edad con Mayor y Menor */}
              <div className="space-y-1.5 bg-navy-950/60 p-2 rounded-lg border border-white/10">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-300 uppercase tracking-wider text-[10px]">
                    Rango Edad
                  </span>
                  <div className="flex items-center gap-1.5 font-mono text-[11px]">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                      ≥ {minAge}
                    </span>
                    <span className="text-slate-500">–</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                      ≤ {maxAge}
                    </span>
                  </div>
                </div>

                {/* Modern Dual-Thumb Range Track */}
                <div className="relative flex items-center h-6 select-none">
                  {/* Background Track */}
                  <div className="absolute w-full h-1.5 bg-slate-800 rounded-full overflow-hidden pointer-events-none">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                      style={{
                        left: `${((minAge - 15) / (42 - 15)) * 100}%`,
                        width: `${((maxAge - minAge) / (42 - 15)) * 100}%`,
                        position: "absolute",
                      }}
                    />
                  </div>
                  {/* Slider Min (Menor) */}
                  <input
                    type="range"
                    min={15}
                    max={42}
                    value={minAge}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (v <= maxAge) setMinAge(v);
                    }}
                    className="range-slider-thumb absolute w-full h-1.5 appearance-none bg-transparent pointer-events-none accent-emerald-400"
                    style={{ zIndex: minAge > 35 ? 20 : 10 }}
                  />
                  {/* Slider Max (Mayor) */}
                  <input
                    type="range"
                    min={15}
                    max={42}
                    value={maxAge}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (v >= minAge) setMaxAge(v);
                    }}
                    className="range-slider-thumb absolute w-full h-1.5 appearance-none bg-transparent pointer-events-none accent-teal-400"
                    style={{ zIndex: 15 }}
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card className="bg-[#070c18] border-border/80 shadow-2xl overflow-hidden relative z-10">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3 px-4 border-b border-border/40">
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

        {/* Selected Assigned Filters Bar (Badges con Escudos y Banderas) */}
        {(selectedTeams.length > 0 || selectedLeagues.length > 0) && (
          <div className="px-4 py-2 border-b border-white/10 bg-navy-950/70 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[11px] font-semibold text-muted-foreground">Filtros asignados:</span>

            {/* Assigned Teams Pills */}
            {selectedTeams.map((teamName) => {
              const teamInfo = availableTeams.find((t) => t.name.toLowerCase() === teamName.toLowerCase());
              return (
                <span
                  key={teamName}
                  className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full bg-navy-900 border border-white/15 text-white text-xs shadow-sm hover:border-rose-500/40 transition-colors"
                >
                  <EscudoEquipo
                    teamId={teamInfo?.teamId}
                    badgeUrl={teamInfo?.badgeUrl}
                    name={teamName}
                    size={16}
                    className="shrink-0"
                  />
                  <span className="font-medium truncate max-w-[150px]">{teamName}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedTeams(selectedTeams.filter((t) => t.toLowerCase() !== teamName.toLowerCase()))}
                    className="text-slate-400 hover:text-white rounded-full p-0.5 hover:bg-white/10 transition-colors"
                    title={`Quitar ${teamName}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}

            {/* Assigned Leagues Pills */}
            {selectedLeagues.map((leagueName) => {
              const leagueInfo = availableLeagues.find((l) => l.name.toLowerCase() === leagueName.toLowerCase());
              const country = leagueInfo?.country || guessLeagueCountry(leagueName);
              return (
                <span
                  key={leagueName}
                  className="inline-flex items-center gap-1.5 pl-2 pr-2 py-1 rounded-full bg-navy-900 border border-white/15 text-white text-xs shadow-sm hover:border-rose-500/40 transition-colors"
                >
                  {country ? (
                    <Bandera country={country} size="xs" className="shrink-0" />
                  ) : (
                    <span className="text-[10px]">🏆</span>
                  )}
                  <span className="font-medium truncate max-w-[160px]">{leagueName}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedLeagues(selectedLeagues.filter((l) => l.toLowerCase() !== leagueName.toLowerCase()))}
                    className="text-slate-400 hover:text-white rounded-full p-0.5 hover:bg-white/10 transition-colors"
                    title={`Quitar ${leagueName}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}

            <button
              type="button"
              onClick={() => {
                setSelectedTeams([]);
                setSelectedLeagues([]);
              }}
              className="text-[11px] text-muted-foreground hover:text-rose-400 ml-1 transition-colors underline"
            >
              Borrar todos
            </button>
          </div>
        )}
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
                  <TableHead className="text-center font-semibold text-emerald-400 select-none whitespace-nowrap px-2" title="Performance trend over the last 3 months">
                    LAST 3M
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort("age")}
                    className="cursor-pointer text-center font-semibold text-slate-300 hover:text-white select-none whitespace-nowrap"
                    title="Sort by Age"
                  >
                    Age {sortBy === "age" && (sortOrder === "desc" ? "↓" : "↑")}
                  </TableHead>
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

                    {/* Evolución / Trend Arrow Column (Last 3 Months) matching CromoJugador badge style */}
                    <TableCell className="text-center whitespace-nowrap px-2">
                      {player.trend === "up" && (
                        <div
                          className="inline-flex items-center justify-center w-6 h-6 rounded-full shadow-md border transition-transform duration-150 hover:scale-110"
                          style={{
                            background: "linear-gradient(135deg, rgba(16, 185, 129, 0.95) 0%, rgba(5, 150, 105, 0.95) 100%)",
                            borderColor: "rgba(110, 231, 183, 0.8)",
                            boxShadow: "0 2px 8px rgba(16, 185, 129, 0.45)",
                          }}
                          title="Ascending trend (Last 3 months)"
                        >
                          <svg
                            className="w-3.5 h-3.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            viewBox="0 0 24 24"
                          >
                            <polyline points="18 15 12 9 6 15" />
                          </svg>
                        </div>
                      )}
                      {player.trend === "neutral" && (
                        <div
                          className="inline-flex items-center justify-center w-6 h-6 rounded-full shadow-md border transition-transform duration-150 hover:scale-110"
                          style={{
                            background: "linear-gradient(135deg, rgba(234, 179, 8, 0.95) 0%, rgba(202, 138, 4, 0.95) 100%)",
                            borderColor: "rgba(253, 224, 71, 0.8)",
                            boxShadow: "0 2px 8px rgba(234, 179, 8, 0.45)",
                          }}
                          title="Steady performance (Last 3 months)"
                        >
                          <svg
                            className="w-3.5 h-3.5 text-gray-950 drop-shadow-[0_1px_1px_rgba(255,255,255,0.4)]"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            viewBox="0 0 24 24"
                          >
                            <line x1="5" y1="12" x2="19" y2="12" />
                            <polyline points="14 7 19 12 14 17" />
                          </svg>
                        </div>
                      )}
                      {player.trend === "down" && (
                        <div
                          className="inline-flex items-center justify-center w-6 h-6 rounded-full shadow-md border transition-transform duration-150 hover:scale-110"
                          style={{
                            background: "linear-gradient(135deg, rgba(239, 68, 68, 0.95) 0%, rgba(185, 28, 28, 0.95) 100%)",
                            borderColor: "rgba(252, 165, 165, 0.8)",
                            boxShadow: "0 2px 8px rgba(239, 68, 68, 0.45)",
                          }}
                          title="Descending trend (Last 3 months)"
                        >
                          <svg
                            className="w-3.5 h-3.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            viewBox="0 0 24 24"
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </div>
                      )}
                      {player.trend == null && (
                        <span className="text-muted-foreground/30 font-mono text-xs">—</span>
                      )}
                    </TableCell>

                    {/* Age Column */}
                    <TableCell className="text-center whitespace-nowrap">
                      {player.birthDate ? (
                        <span className="font-mono text-xs font-semibold text-slate-200">
                          {Math.floor((Date.now() - new Date(player.birthDate).getTime()) / (365.25 * 24 * 3600 * 1000))}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40 font-mono text-xs">—</span>
                      )}
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
                              {guessLeagueCountry(player.leagueName) && (
                                <Bandera country={guessLeagueCountry(player.leagueName)} size="xs" className="shrink-0 ml-0.5" />
                              )}
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
