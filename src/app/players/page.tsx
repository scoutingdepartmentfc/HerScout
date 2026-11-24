"use client";

import React, { useEffect, useState, useMemo, useDeferredValue, Suspense } from "react";
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
import { PlayerSilhouette } from "@/components/scouting/PlayerSilhouette";
import { Search, SlidersHorizontal, Bookmark, Eye, X, Check, ChevronDown, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { notaClases } from "@/lib/notaColor";
import { getPositionBadge } from "@/lib/positions";
import { OptaLogo } from "@/components/scouting/OptaLogo";
import { guessLeagueCountry, sortLeaguesByCountryAndTier } from "@/lib/leagueCountry";
import { leagueId, leagueMatches, normLeague, parseLeagueId, playerInLeagues } from "@/lib/leagueId";
import { LOW_SAMPLE_LABEL, lowSampleLast } from "@/lib/sampleSize";

// Normaliza nombres de liga: minúsculas, apóstrofos tipográficos → rectos, espacios.
function dedupeLeagues<T extends { name: string; country?: string | null }>(arr: T[]): T[] {
  const seen = new Set<string>();
  return arr.filter((l) => { const k = `${normLeague(l.name)}|${(l.country || "").toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

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
  /** International club competitions she played (Champions League...) */
  competitions?: string[];
  seasonName?: string | null;
  isCurrentSeason?: boolean;
  isAccumulated?: boolean;
  minutesPlayed?: number;
  goals?: number;
  matchesPlayed?: number;
  notaGlobal?: number | null;
  /** Too few minutes/matches: per-90 rating shown with a warning and sorted after the rest */
  lowSample?: boolean;
  notaAtaque?: number | null;
  notaConstruccion?: number | null;
  notaDefensa?: number | null;
  notaBalonParado?: number | null;
  notaDisponibilidad?: number | null;
  notaFisico?: number | null;
  marketValue?: number | null;
  contractUntil?: string | null;
  recentSeason?: string | null;
  recentMatches?: number | null;
  recentMinutes?: number | null;
  recentGoals?: number | null;
  trend?: "up" | "neutral" | "down" | null;
  last5Ratings?: number[];
}

function FormBars({ ratings }: { ratings?: number[] }) {
  if (!ratings || ratings.length === 0) return <span className="text-slate-500 text-xs">—</span>;
  const barColor = (r: number) => {
    if (r >= 7.5) return "bg-emerald-500";
    if (r >= 6.5) return "bg-lime-500";
    if (r >= 5.5) return "bg-slate-400";
    return "bg-rose-500";
  };
  return (
    <div
      className="inline-flex items-end justify-center gap-[3px] h-5 px-1"
      title={`Últimos ${ratings.length} partidos: ${ratings.map((r) => r.toFixed(1)).join(" · ")}`}
    >
      {ratings.map((r, i) => {
        const h = Math.max(4, Math.min(20, Math.round(((r - 3) / 7) * 16 + 4)));
        return (
          <span
            key={i}
            style={{ height: `${h}px` }}
            className={`w-[5px] rounded-t-full ${barColor(r)} transition-all`}
            title={r.toFixed(1)}
          />
        );
      })}
    </div>
  );
}

function fmtMarketValue(v?: number | null) {
  if (!v) return "—";
  return v >= 1_000_000 ? `€${(v / 1_000_000).toFixed(2)}m` : `€${Math.round(v / 1000)}k`;
}

/** Contract expiry with a live countdown of the days left (red < 6 months, amber < 1 year) */
function ContractCell({ until }: { until?: string | null }) {
  if (!until) return <span className="text-slate-500">—</span>;
  const end = new Date(until);
  if (isNaN(end.getTime())) return <span className="text-slate-500">—</span>;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((end.getTime() - today.getTime()) / 86_400_000);
  const color =
    days < 0 ? "text-slate-500" : days <= 182 ? "text-red-400" : days <= 365 ? "text-amber-300" : "text-emerald-400";
  return (
    <div className="leading-tight">
      <div className="font-mono text-xs text-slate-200">{end.toLocaleDateString("en-GB")}</div>
      <div className={`text-[10px] font-semibold ${color}`}>
        {days < 0 ? "Expired" : days === 0 ? "Ends today" : `${days.toLocaleString("en-GB")} days left`}
      </div>
    </div>
  );
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
    return options.filter(
      (o) =>
        o.name.toLowerCase().includes(s) ||
        (o.country && o.country.toLowerCase().includes(s))
    );
  }, [options, search]);

  // Si las opciones tienen país definido (como las ligas), agruparlas ordenadas por país
  const groupedByCountry = React.useMemo(() => {
    const hasAnyCountry = options.some((o) => !!o.country);
    if (!hasAnyCountry) return null;

    const groups: { country: string; items: T[] }[] = [];
    const map = new Map<string, T[]>();

    for (const opt of filteredOptions) {
      const c = opt.country || "Other Competitions";
      if (!map.has(c)) {
        const list: T[] = [];
        map.set(c, list);
        groups.push({ country: c, items: list });
      }
      map.get(c)!.push(opt);
    }
    return groups;
  }, [options, filteredOptions]);

  const toggleOption = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((item) => item !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const toggleCountryGroup = (items: T[]) => {
    const ids = items.map((x) => x.id);
    const allSelected = ids.every((id) => selectedIds.includes(id));
    if (allSelected) {
      onChange(selectedIds.filter((id) => !ids.includes(id)));
    } else {
      const next = new Set([...selectedIds, ...ids]);
      onChange(Array.from(next));
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
              {selectedIds.length === 1 ? (options.find((o) => o.id === selectedIds[0])?.name ?? parseLeagueId(selectedIds[0]).name) : `${selectedIds.length} selected`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {selectedIds.length > 0 && (
            <span
              role="button"
              tabIndex={0}
              onClick={clearAll}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") clearAll(e as any);
              }}
              className="p-1 rounded-full hover:bg-white/20 text-muted-foreground hover:text-white transition-colors"
              title="Clear filter"
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
                placeholder="Search..."
                className="w-full h-8 pl-8 pr-2.5 rounded-lg bg-navy-900/90 text-xs text-white border border-white/10 focus:outline-none focus:border-emerald-500 placeholder:text-muted-foreground/60 transition-colors"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto p-1.5 space-y-1">
            {filteredOptions.length === 0 ? (
              <div className="py-5 text-center text-xs text-muted-foreground">
                No results found
              </div>
            ) : groupedByCountry ? (
              groupedByCountry.map((grp) => {
                const groupIds = grp.items.map((x) => x.id);
                const countSelected = groupIds.filter((id) => selectedIds.includes(id)).length;
                const isAllSelected = countSelected === groupIds.length;
                const isPartiallySelected = countSelected > 0 && !isAllSelected;

                return (
                  <div key={grp.country} className="rounded-lg bg-white/[0.02] border border-white/5 overflow-hidden">
                    {/* Cabecera del país con bandera y selección rápida */}
                    <div className="flex items-center justify-between px-2.5 py-1.5 bg-white/[0.04] border-b border-white/5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {grp.country === "International" ? (
                          <span className="text-[11px] leading-none">🌍</span>
                        ) : (
                          grp.country !== "Other Competitions" && <Bandera country={grp.country} size="xs" />
                        )}
                        <span className="text-[11px] font-bold text-slate-200 tracking-wide uppercase truncate">
                          {grp.country}
                        </span>
                        <span className="text-[10px] text-slate-500 tabular-nums">({grp.items.length})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleCountryGroup(grp.items)}
                        className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 transition-colors px-1"
                        title={isAllSelected ? "Deselect country" : "Select all in country"}
                      >
                        {isAllSelected ? "Deselect" : isPartiallySelected ? `${countSelected}/${groupIds.length}` : "All"}
                      </button>
                    </div>

                    {/* Ligas de este país (ordenadas por importancia) */}
                    <div className="p-1 space-y-0.5">
                      {grp.items.map((opt) => {
                        const isSelected = selectedIds.includes(opt.id);
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => toggleOption(opt.id)}
                            className={`w-full py-1.5 px-2 rounded-md flex items-center justify-between text-left text-xs transition-colors ${isSelected
                                ? "bg-emerald-500/15 text-emerald-300 font-semibold border border-emerald-500/30"
                                : "text-slate-300 hover:bg-white/5 border border-transparent"
                              }`}
                          >
                            <span className="truncate pr-2">{opt.name}</span>
                            <div
                              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${isSelected
                                  ? "bg-emerald-500 border-emerald-400 text-gray-950 font-black"
                                  : "border-white/20 bg-navy-950"
                                }`}
                            >
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = selectedIds.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggleOption(opt.id)}
                    className={`w-full py-2 px-2.5 rounded-lg flex items-center justify-between text-left text-xs transition-colors ${isSelected
                        ? "bg-emerald-500/15 text-emerald-300 font-semibold border border-emerald-500/30"
                        : "text-slate-300 hover:bg-white/5 border border-transparent"
                      }`}
                  >
                    <div className="flex items-center gap-2.5 truncate pr-2">
                      {renderIcon && renderIcon(opt)}
                      <span className="truncate">{opt.name}</span>
                    </div>
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${isSelected
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
              <span className="text-muted-foreground">{selectedIds.length} selected</span>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-emerald-400 hover:text-emerald-300 font-semibold transition-colors"
              >
                Deselect all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Client cache of /api/players responses per season: survives client-side navigation (memory)
// and full reloads within the tab (sessionStorage), so revisits render instantly.
type PlayersResponse = { players: PlayerRow[]; evaluatedPeriod?: string; filters?: any };
// Bump the version whenever the response shape changes, so stale cached rows are not shown
const PLAYERS_CACHE_KEY = "players_data_v4_";
const memoryPlayersCache = new Map<string, PlayersResponse>();

function readPlayersCache(season: string): PlayersResponse | null {
  const mem = memoryPlayersCache.get(season);
  if (mem) return mem;
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PLAYERS_CACHE_KEY + season);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PlayersResponse;
    memoryPlayersCache.set(season, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writePlayersCache(season: string, data: PlayersResponse) {
  memoryPlayersCache.set(season, data);
  try {
    sessionStorage.setItem(PLAYERS_CACHE_KEY + season, JSON.stringify(data));
  } catch {
    // quota exceeded or storage blocked: memory cache still works
  }
}

const PAGE_SIZE = 60;

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

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [positionModalOpen, setPositionModalOpen] = useState(false);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [teamsModalOpen, setTeamsModalOpen] = useState(false);
  const [teamModalSearch, setTeamModalSearch] = useState("");
  const [leaguesModalOpen, setLeaguesModalOpen] = useState(false);
  const [leagueModalSearch, setLeagueModalSearch] = useState("");
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [seasonFilter, setSeasonFilter] = useState("all");
  const [minRatingFilter, setMinRatingFilter] = useState<string>("all");
  const [minAge, setMinAge] = useState<number>(15);
  const [minValue, setMinValue] = useState<string>("");
  const [maxValue, setMaxValue] = useState<string>("");
  const [minMinutes, setMinMinutes] = useState<string>("");
  const [maxMinutes, setMaxMinutes] = useState<string>("");
  const [minGoals, setMinGoals] = useState<string>("");
  const [maxGoals, setMaxGoals] = useState<string>("");
  const [maxAge, setMaxAge] = useState<number>(42);
  const [sortBy, setSortBy] = useState<string>("nota_global");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [allPlayers, setAllPlayers] = useState<PlayerRow[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loadMoreRef = React.useRef<HTMLDivElement>(null);
  const [evaluatedPeriod, setEvaluatedPeriod] = useState<string>("TREND (LAST 3M)");
  const [availableTeams, setAvailableTeams] = useState<{ id: string; name: string; teamId?: string | null; badgeUrl?: string | null }[]>([]);
  const [availableLeagues, setAvailableLeagues] = useState<{ id: string; name: string; logoUrl?: string | null; country?: string | null }[]>([]);
  const [availableSeasons, setAvailableSeasons] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savedWatchlist, setSavedWatchlist] = useState<Record<string, boolean>>({});

  // Synchronize filter states whenever URL searchParams change
  useEffect(() => {
    const sTerm = searchParams.get("search") ?? getSaved("search") ?? "";
    setSearchTerm(sTerm);
    const pos = searchParams.get("position") ?? getSaved("position") ?? "all";
    setSelectedPositions(pos && pos !== "all" ? pos.split(",").map((x) => x.trim()).filter(Boolean) : []);
    const teams = searchParams.get("teams") || searchParams.get("team") || getSaved("teams");
    setSelectedTeams(teams && teams !== "all" ? teams.split(",").map((t) => t.trim()).filter(Boolean) : []);
    const leagues = searchParams.get("leagues") || searchParams.get("league") || getSaved("leagues");
    setSelectedLeagues(leagues && leagues !== "all" ? leagues.split(",").map((l) => l.trim()).filter(Boolean) : []);
    const sSeason = searchParams.get("season") ?? getSaved("season") ?? "all";
    setSeasonFilter(sSeason);
    const sMinR = searchParams.get("minRating") ?? getSaved("minRating") ?? "all";
    setMinRatingFilter(sMinR);
    const pMinAge = searchParams.get("minAge") || getSaved("minAge");
    const pMaxAge = searchParams.get("maxAge") || getSaved("maxAge");
    setMinAge(pMinAge ? Number(pMinAge) : 15);
    setMaxAge(pMaxAge ? Number(pMaxAge) : 42);
    setSortBy(searchParams.get("sortBy") ?? getSaved("sortBy") ?? "nota_global");
    setSortOrder((searchParams.get("order") as "asc" | "desc") ?? (getSaved("order") as "asc" | "desc") ?? "desc");
  }, [searchParams]);

  // Update browser URL query string and persist in sessionStorage
  const updateUrlParams = (newParams: Record<string, string>) => {
    const params = new URLSearchParams(window.location.search);
    Object.entries(newParams).forEach(([k, v]) => {
      if (!v || v === "all" || (k === "sortBy" && v === "nota_global") || (k === "order" && v === "desc")) {
        params.delete(k);
        try { sessionStorage.removeItem(`players_filter_${k}`); } catch { }
      } else {
        params.set(k, v);
        try { sessionStorage.setItem(`players_filter_${k}`, v); } catch { }
      }
    });
    const qs = params.toString();
    const newPath = qs ? `/players?${qs}` : "/players";
    window.history.replaceState(null, "", newPath);
  };

  const applyResponse = (json: PlayersResponse) => {
    setAllPlayers(json.players || []);
    if (json.evaluatedPeriod) {
      setEvaluatedPeriod(json.evaluatedPeriod);
    }
    if (json.filters) {
      if (json.filters.teamsDetailed?.length) {
        setAvailableTeams(
          json.filters.teamsDetailed.map((t: any) => ({
            id: t.name,
            name: t.name,
            teamId: t.teamId,
            badgeUrl: t.badgeUrl,
            leagueName: t.leagueName || null,
          }))
        );
      } else if (json.filters.teams?.length) {
        setAvailableTeams(json.filters.teams.map((t: string) => ({ id: t, name: t, leagueName: null })));
      }

      if (json.filters.leaguesDetailed?.length) {
        const mapped = json.filters.leaguesDetailed.map((l: any) => ({
          id: l.id || l.name,
          name: l.name,
          logoUrl: l.logoUrl,
          country: l.country || guessLeagueCountry(l.name),
        }));
        setAvailableLeagues(sortLeaguesByCountryAndTier(dedupeLeagues(mapped)));
      } else if (json.filters.leagues?.length) {
        const mapped = json.filters.leagues.map((l: string) => ({
          id: l,
          name: l,
          country: guessLeagueCountry(l),
        }));
        setAvailableLeagues(sortLeaguesByCountryAndTier(dedupeLeagues(mapped)));
      }

      if (json.filters.seasons?.length) setAvailableSeasons(json.filters.seasons);
    }
  };

  // Fetch the full dataset once per season. Every other filter/sort runs client-side.
  // Cached data (memory/sessionStorage) is shown instantly and refreshed in the background.
  useEffect(() => {
    let cancelled = false;
    const cached = readPlayersCache(seasonFilter);
    if (cached) {
      applyResponse(cached);
      setIsLoading(false);
    } else {
      setAllPlayers([]);
      setIsLoading(true);
    }

    (async () => {
      try {
        // Si no hay caché previa, pedimos primero 60 perfiles para pintar la tabla al instante
        if (!cached) {
          const quickRes = await fetch(`/api/players?season=${encodeURIComponent(seasonFilter)}&limit=60`);
          if (quickRes.ok) {
            const quickJson = (await quickRes.json()) as PlayersResponse;
            if (!cancelled) {
              applyResponse(quickJson);
              setIsLoading(false);
            }
          }
        }
        const res = await fetch(`/api/players?season=${encodeURIComponent(seasonFilter)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as PlayersResponse;
        if (cancelled) return;
        writePlayersCache(seasonFilter, json);
        applyResponse(json);
      } catch (err) {
        console.error("Failed to fetch players:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonFilter]);

  // Keep URL + sessionStorage in sync with filters (debounced, no network)
  useEffect(() => {
    const timer = setTimeout(() => {
      updateUrlParams({
        search: searchTerm,
        position: selectedPositions.length > 0 ? selectedPositions.join(",") : "all",
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, selectedPositions, selectedTeams, selectedLeagues, seasonFilter, minRatingFilter, minAge, maxAge, sortBy, sortOrder]);

  const deferredSearch = useDeferredValue(searchTerm);

  // Client-side filtering + sorting (same semantics as the API)
  const players = useMemo(() => {
    const now = Date.now();
    let list = allPlayers;

    const s = deferredSearch.trim().toLowerCase();
    if (s) {
      list = list.filter(
        (p) => (p.name && p.name.toLowerCase().includes(s)) || (p.matchName && p.matchName.toLowerCase().includes(s))
      );
    }

    if (selectedPositions.length > 0) {
      const wanted = selectedPositions.map((x) => x.toLowerCase());
      list = list.filter((p) => {
        const pos = (p.position || "").toLowerCase();
        const grp = (p.grupoDemarcacion || "").toLowerCase();
        return wanted.some((w) => pos === w || pos.includes(w) || grp.includes(w));
      });
    }

    if (selectedTeams.length > 0) {
      const teams = selectedTeams.map((t) => t.toLowerCase());
      list = list.filter((p) => teams.includes((p.teamName || "").toLowerCase()));
    }

    if (selectedLeagues.length > 0) {
      // Current league (name + country) or an international competition she played (Champions League...)
      list = list.filter((p) => playerInLeagues(selectedLeagues, p.leagueName, p.leagueCountry, p.competitions));
    }

    const minA = minAge > 15 ? minAge : null;
    const maxA = maxAge < 42 ? maxAge : null;
    if (minA != null || maxA != null) {
      list = list.filter((p) => {
        if (!p.birthDate) return false;
        const age = Math.floor((now - new Date(p.birthDate).getTime()) / (365.25 * 24 * 3600 * 1000));
        if (minA != null && age < minA) return false;
        if (maxA != null && age > maxA) return false;
        return true;
      });
    }

    if (minRatingFilter !== "all") {
      const minR = Number(minRatingFilter);
      if (!isNaN(minR)) list = list.filter((p) => (p.notaGlobal || 0) >= minR);
    }

    const fieldMap: Record<string, keyof PlayerRow> = {
      nota_global: "notaGlobal",
      nota_ataque: "notaAtaque",
      nota_construccion: "notaConstruccion",
      nota_defensa: "notaDefensa",
      nota_balon_parado: "notaBalonParado",
      nota_disponibilidad: "notaDisponibilidad",
      nota_fisico: "notaFisico",
      market_value: "marketValue",
      recent_matches: "recentMatches",
      recent_minutes: "recentMinutes",
      recent_goals: "recentGoals",
    };
    if (minValue !== "" || maxValue !== "" || minMinutes !== "" || maxMinutes !== "" || minGoals !== "" || maxGoals !== "") {
      list = list.filter((p) => {
        if (minValue !== "" && (p.marketValue || 0) < Number(minValue)) return false;
        if (maxValue !== "" && (p.marketValue || 0) > Number(maxValue)) return false;
        if (minMinutes !== "" && (p.recentMinutes ?? p.minutesPlayed ?? 0) < Number(minMinutes)) return false;
        if (maxMinutes !== "" && (p.recentMinutes ?? p.minutesPlayed ?? 0) > Number(maxMinutes)) return false;
        if (minGoals !== "" && (p.recentGoals ?? p.goals ?? 0) < Number(minGoals)) return false;
        if (maxGoals !== "" && (p.recentGoals ?? p.goals ?? 0) > Number(maxGoals)) return false;
        return true;
      });
    }
    const sorted = list === allPlayers ? list.slice() : list;
    if (sortBy === "contract") {
      // desc = longest contract first; players without a contract date always last
      sorted.sort((a, b) => {
        const va = a.contractUntil ? Date.parse(a.contractUntil) : null;
        const vb = b.contractUntil ? Date.parse(b.contractUntil) : null;
        if (va == null || vb == null) return va == null ? (vb == null ? 0 : 1) : -1;
        return sortOrder === "asc" ? va - vb : vb - va;
      });
    } else if (sortBy === "age") {
      sorted.sort((a, b) => {
        const va = a.birthDate ? new Date(a.birthDate).getTime() : null;
        const vb = b.birthDate ? new Date(b.birthDate).getTime() : null;
        if (va == null || vb == null) return va == null ? (vb == null ? 0 : 1) : -1;
        return sortOrder === "desc" ? va - vb : vb - va;
      });
    } else {
      const field = fieldMap[sortBy] || "notaGlobal";
      const byRating = sortBy.startsWith("nota_") && sortBy !== "nota_fisico";
      sorted.sort((a, b) => {
        if (byRating) {
          const ls = lowSampleLast(a, b);
          if (ls) return ls;
        }
        const va = a[field] as number | null | undefined;
        const vb = b[field] as number | null | undefined;
        if (va == null || vb == null) return va == null ? (vb == null ? 0 : 1) : -1;
        return sortOrder === "asc" ? va - vb : vb - va;
      });
    }
    return sorted;
  }, [allPlayers, deferredSearch, selectedPositions, selectedTeams, selectedLeagues, minAge, maxAge, minRatingFilter, minValue, maxValue, minMinutes, maxMinutes, minGoals, maxGoals, sortBy, sortOrder]);

  // Dynamically adapt available teams based on selected leagues, and available leagues based on selected teams
  const filteredAvailableTeams = useMemo(() => {
    const byName = new Map<string, { id: string; name: string; teamId?: string; badgeUrl?: string | null }>();
    allPlayers.forEach((p) => {
      if (!p.teamName || p.teamName === "Without club") return;
      if (selectedLeagues.length > 0 && !selectedLeagues.some((id) => leagueMatches(id, p.leagueName, p.leagueCountry))) return;
      if (!byName.has(p.teamName)) {
        byName.set(p.teamName, {
          id: p.teamName,
          name: p.teamName,
          teamId: p.teamId,
          badgeUrl: p.badgeUrl,
        });
      }
    });
    return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedLeagues, allPlayers]);

  const filteredAvailableLeagues = useMemo(() => {
    if (selectedTeams.length === 0) return availableLeagues;
    const teamsNorm = selectedTeams.map((t) => t.toLowerCase());

    // Find the primary league belonging to the selected teams
    const leaguesOfSelectedTeams = new Set<string>();

    // Map each team in availableTeams to its league
    const teamToLeague = new Map<string, string>();
    availableTeams.forEach((t) => {
      if ((t as any).leagueName) {
        teamToLeague.set(t.name.toLowerCase(), (t as any).leagueName);
      }
    });

    // Check player distribution for teams without explicit leagueName
    const teamLeagueCounts = new Map<string, Map<string, number>>();
    allPlayers.forEach((p) => {
      if (!p.teamName || !p.leagueName) return;
      const tKey = p.teamName.toLowerCase();
      let m = teamLeagueCounts.get(tKey);
      if (!m) {
        m = new Map<string, number>();
        teamLeagueCounts.set(tKey, m);
      }
      const lKey = leagueId(p.leagueName, p.leagueCountry);
      m.set(lKey, (m.get(lKey) || 0) + 1);
    });

    teamsNorm.forEach((tKey) => {
      let l = teamToLeague.get(tKey);
      if (!l) {
        const m = teamLeagueCounts.get(tKey);
        if (m && m.size > 0) {
          let maxCount = -1;
          m.forEach((count, league) => {
            if (count > maxCount) {
              maxCount = count;
              l = league;
            }
          });
        }
      }
      if (l) leaguesOfSelectedTeams.add(l);
    });

    const keys = Array.from(leaguesOfSelectedTeams);
    return availableLeagues.filter((l) => keys.some((k) => leagueMatches(k, l.name, l.country)));
  }, [availableLeagues, selectedTeams, availableTeams, allPlayers]);

  // Progressive rendering: reset window on filter change, grow on scroll
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [players]);

  const visiblePlayers = useMemo(() => players.slice(0, visibleCount), [players, visibleCount]);
  const hasMore = visibleCount < players.length;

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisibleCount((c) => c + PAGE_SIZE * 2);
      },
      { rootMargin: "800px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, visiblePlayers.length]);

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
    } catch { }
    setSearchTerm("");
    setSelectedPositions([]);
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
    (selectedPositions.length > 0 ? 1 : 0) +
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
            <h1 className="text-4xl font-extrabold tracking-tight text-white">Player Database</h1>
            <OptaLogo size="xs" label="Verified" className="bg-sky-500/10 border-sky-400/30 text-sky-300" />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Searchable registry of professional women's football profiles ranked by advanced performance ratings.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[290px_minmax(0,1fr)] gap-5 items-start">
      {/* Filters Sidebar */}
      <Card className="bg-[#070c18] border-border/80 shadow-xl relative z-30 overflow-visible lg:sticky lg:top-0">
        <CardContent className="p-4 space-y-4 overflow-visible">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white">
              <SlidersHorizontal className="w-4 h-4 text-amber-400" />
              <span className="font-display text-base font-bold uppercase tracking-wide">Filters</span>
              {activeFiltersCount > 0 && (
                <span className="px-1.5 py-0.5 bg-amber-400/15 text-amber-300 border border-amber-400/30 rounded text-[10px] font-bold">
                  {activeFiltersCount}
                </span>
              )}
            </div>
            {activeFiltersCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetAllFilters}
                className="h-7 px-2 text-[11px] text-muted-foreground hover:text-white"
                leftIcon={<X className="w-3.5 h-3.5" />}
              >
                Reset
              </Button>
            )}
          </div>

          {/* Search Input */}
          <div>
            <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider block mb-1">
              Player
            </label>
            <Input
              placeholder="Search player name..."
              leftIcon={<Search className="w-4 h-4 text-muted-foreground" />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-navy-950 h-9 text-xs"
            />
          </div>

          {/* Position Filter (Campograma modal) */}
          <div>
            <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider block mb-1">
              Position
            </label>
            <button
              type="button"
              onClick={() => setPositionModalOpen(true)}
              className="w-full h-9 px-3 rounded-lg bg-navy-950/70 border border-border/80 hover:border-primary/60 text-left text-xs text-slate-200 flex items-center justify-between gap-2 transition-colors"
            >
              <span className="truncate">
                {selectedPositions.length === 0
                  ? "All Positions (GK, DEF, MID, ATT)"
                  : selectedPositions.length === 1
                    ? selectedPositions[0]
                    : `${selectedPositions.length} positions selected`}
              </span>
              <span className="text-[10px] text-emerald-400 font-semibold shrink-0">
                Pitch
              </span>
            </button>
          </div>

          {/* Advanced Filters */}
          {(
            <div className="space-y-4">

              {/* Competition / League (Modal with cards, same style as Clubs / Teams) */}
              <div>
                <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider block mb-1">
                  Leagues / Competitions
                </label>
                <button
                  type="button"
                  onClick={() => { setLeagueModalSearch(""); setLeaguesModalOpen(true); }}
                  className="w-full h-9 px-3 rounded-lg bg-navy-950/70 border border-border/80 hover:border-primary/60 text-left text-xs text-slate-200 flex items-center justify-between gap-2 transition-colors"
                >
                  <span className="truncate">
                    {selectedLeagues.length === 0
                      ? "All leagues"
                      : selectedLeagues.length === 1
                        ? (filteredAvailableLeagues.find((l) => l.id === selectedLeagues[0])?.name || selectedLeagues[0])
                        : `${selectedLeagues.length} leagues selected`}
                  </span>
                  <span className="text-[10px] text-slate-400 shrink-0">
                    {filteredAvailableLeagues.length}
                  </span>
                </button>
              </div>

              {/* Club / Team (Modal with large badges) */}
              <div>
                <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider block mb-1">
                  Clubs / Teams
                </label>
                <button
                  type="button"
                  onClick={() => { setTeamModalSearch(""); setTeamsModalOpen(true); }}
                  className="w-full h-9 px-3 rounded-lg bg-navy-950/70 border border-border/80 hover:border-primary/60 text-left text-xs text-slate-200 flex items-center justify-between gap-2 transition-colors"
                >
                  <span className="truncate">
                    {selectedTeams.length === 0
                      ? "All teams"
                      : selectedTeams.length === 1
                        ? selectedTeams[0]
                        : `${selectedTeams.length} teams selected`}
                  </span>
                  <span className="text-[10px] text-slate-400 shrink-0">
                    {filteredAvailableTeams.length}
                  </span>
                </button>
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

              {/* Age Range Slider */}
              <div className="space-y-1.5 bg-navy-950/60 p-2 rounded-lg border border-white/10">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-300 uppercase tracking-wider text-[10px]">
                    Age Range
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

              {/* Market Value Range */}
              <div className="space-y-2 rounded-lg border border-border/80 bg-navy-950/60 p-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Market Value
                  </label>
                  <div className="flex items-center gap-1.5 text-[11px] font-mono">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      ≥ €{Math.round((Number(minValue || 0)) / 1000)}k
                    </span>
                    <span className="text-muted-foreground">–</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      ≤ €{Math.round((Number(maxValue || 2000000)) / 1000)}k
                    </span>
                  </div>
                </div>
                <div className="relative h-6 flex items-center">
                  <div className="w-full h-1.5 bg-navy-900 rounded-full overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400"
                      style={{
                        left: `${(Number(minValue || 0) / 2000000) * 100}%`,
                        right: `${100 - (Number(maxValue || 2000000) / 2000000) * 100}%`,
                        position: "absolute",
                      }}
                    />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={2000000}
                    step={50000}
                    value={Number(minValue || 0)}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (v <= Number(maxValue || 2000000)) setMinValue(v === 0 ? "" : String(v));
                    }}
                    className="range-slider-thumb absolute w-full h-1.5 appearance-none bg-transparent pointer-events-none accent-emerald-400"
                    style={{ zIndex: Number(minValue || 0) > 1500000 ? 20 : 10 }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={2000000}
                    step={50000}
                    value={Number(maxValue || 2000000)}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (v >= Number(minValue || 0)) setMaxValue(v === 2000000 ? "" : String(v));
                    }}
                    className="range-slider-thumb absolute w-full h-1.5 appearance-none bg-transparent pointer-events-none accent-teal-400"
                    style={{ zIndex: 15 }}
                  />
                </div>
              </div>

              {/* Minutes Played Range */}
              <div className="space-y-2 rounded-lg border border-border/80 bg-navy-950/60 p-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Minutes Played
                  </label>
                  <div className="flex items-center gap-1.5 text-[11px] font-mono">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      ≥ {minMinutes || 0}&apos;
                    </span>
                    <span className="text-muted-foreground">–</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      ≤ {maxMinutes || 3500}&apos;
                    </span>
                  </div>
                </div>
                <div className="relative h-6 flex items-center">
                  <div className="w-full h-1.5 bg-navy-900 rounded-full overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400"
                      style={{
                        left: `${(Number(minMinutes || 0) / 3500) * 100}%`,
                        right: `${100 - (Number(maxMinutes || 3500) / 3500) * 100}%`,
                        position: "absolute",
                      }}
                    />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={3500}
                    step={90}
                    value={Number(minMinutes || 0)}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (v <= Number(maxMinutes || 3500)) setMinMinutes(v === 0 ? "" : String(v));
                    }}
                    className="range-slider-thumb absolute w-full h-1.5 appearance-none bg-transparent pointer-events-none accent-emerald-400"
                    style={{ zIndex: Number(minMinutes || 0) > 2500 ? 20 : 10 }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={3500}
                    step={90}
                    value={Number(maxMinutes || 3500)}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (v >= Number(minMinutes || 0)) setMaxMinutes(v === 3500 ? "" : String(v));
                    }}
                    className="range-slider-thumb absolute w-full h-1.5 appearance-none bg-transparent pointer-events-none accent-teal-400"
                    style={{ zIndex: 15 }}
                  />
                </div>
              </div>

              {/* Goals Range */}
              <div className="space-y-2 rounded-lg border border-border/80 bg-navy-950/60 p-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Goals
                  </label>
                  <div className="flex items-center gap-1.5 text-[11px] font-mono">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      ≥ {minGoals || 0}
                    </span>
                    <span className="text-muted-foreground">–</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      ≤ {maxGoals || 40}
                    </span>
                  </div>
                </div>
                <div className="relative h-6 flex items-center">
                  <div className="w-full h-1.5 bg-navy-900 rounded-full overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400"
                      style={{
                        left: `${(Number(minGoals || 0) / 40) * 100}%`,
                        right: `${100 - (Number(maxGoals || 40) / 40) * 100}%`,
                        position: "absolute",
                      }}
                    />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={40}
                    step={1}
                    value={Number(minGoals || 0)}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (v <= Number(maxGoals || 40)) setMinGoals(v === 0 ? "" : String(v));
                    }}
                    className="range-slider-thumb absolute w-full h-1.5 appearance-none bg-transparent pointer-events-none accent-emerald-400"
                    style={{ zIndex: Number(minGoals || 0) > 30 ? 20 : 10 }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={40}
                    step={1}
                    value={Number(maxGoals || 40)}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (v >= Number(minGoals || 0)) setMaxGoals(v === 40 ? "" : String(v));
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
      <div className="min-w-0">
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
            <span className="text-[11px] font-semibold text-muted-foreground">Active filters:</span>

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
                    title={`Remove ${teamName}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}

            {/* Assigned Leagues Pills */}
            {selectedLeagues.map((leagueKey) => {
              const leagueInfo = availableLeagues.find((l) => l.id === leagueKey);
              const leagueName = leagueInfo?.name || parseLeagueId(leagueKey).name;
              const country = leagueInfo?.country || parseLeagueId(leagueKey).country || guessLeagueCountry(leagueName);
              return (
                <span
                  key={leagueKey}
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
                    onClick={() => setSelectedLeagues(selectedLeagues.filter((l) => l !== leagueKey))}
                    className="text-slate-400 hover:text-white rounded-full p-0.5 hover:bg-white/10 transition-colors"
                    title={`Remove ${leagueName}`}
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
              Clear all
            </button>
          </div>
        )}
        <CardContent className="p-0 overflow-x-auto">
          {isLoading && allPlayers.length === 0 ? (
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
                    onClick={() => handleSort("market_value")}
                    className="cursor-pointer text-center font-semibold text-slate-300 hover:text-white select-none whitespace-nowrap"
                    title="Sort by Market value"
                  >
                    Value {sortBy === "market_value" && (sortOrder === "desc" ? "↓" : "↑")}
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort("contract")}
                    className="cursor-pointer text-center font-semibold text-slate-300 hover:text-white select-none whitespace-nowrap"
                    title="Sort by Contract expiry (days left)"
                  >
                    Contract {sortBy === "contract" && (sortOrder === "desc" ? "↓" : "↑")}
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort("recent_matches")}
                    className="cursor-pointer text-center font-semibold text-slate-300 hover:text-white select-none whitespace-nowrap"
                    title="Matches played in the most recent season"
                  >
                    MP {sortBy === "recent_matches" && (sortOrder === "desc" ? "↓" : "↑")}
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort("recent_minutes")}
                    className="cursor-pointer text-center font-semibold text-slate-300 hover:text-white select-none whitespace-nowrap"
                    title="Minutes played in the most recent season"
                  >
                    Min {sortBy === "recent_minutes" && (sortOrder === "desc" ? "↓" : "↑")}
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort("recent_goals")}
                    className="cursor-pointer text-center font-semibold text-slate-300 hover:text-white select-none whitespace-nowrap"
                    title="Goals in the most recent season"
                  >
                    Goals {sortBy === "recent_goals" && (sortOrder === "desc" ? "↓" : "↑")}
                  </TableHead>
                  <TableHead
                    className="text-center font-semibold text-slate-300 select-none whitespace-nowrap"
                    title="Rating de los últimos 5 partidos"
                  >
                    Form
                  </TableHead>
                  <TableHead className="text-right font-semibold text-white">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/30">
                {visiblePlayers.map((player) => (
                  <TableRow key={player.id} className="h-14 hover:bg-navy-900/50 transition-colors">
                    <TableCell className="py-1.5 pl-3 pr-2">
                      <Link href={`/players/${player.id}`} className="flex items-center gap-3 group">
                        <div className="relative w-11 h-11 rounded-xl bg-gradient-to-b from-slate-800/70 via-navy-900/95 to-navy-950 ring-1 ring-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] flex items-end justify-center overflow-hidden shrink-0 group-hover:ring-amber-400/50 group-hover:shadow-[0_0_14px_-3px_rgba(251,191,36,0.35)] transition-all duration-200">
                          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.09),transparent_68%)]" />
                          {player.photoUrl ? (
                            <img
                              src={player.photoUrl}
                              alt={player.name}
                              className="relative z-10 w-full h-full object-contain object-bottom drop-shadow-[0_2px_6px_rgba(0,0,0,0.65)] group-hover:scale-105 transition-transform duration-200"
                              loading="lazy"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="relative z-10 w-full h-full p-1.5 flex items-end justify-center text-slate-500/75 group-hover:text-slate-300/90 transition-colors">
                              <PlayerSilhouette className="w-full h-full scale-110 object-contain" />
                            </div>
                          )}
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2.5 z-20 bg-gradient-to-t from-navy-950/75 to-transparent" />
                        </div>
                        <div className="py-1">
                          <span
                            className="block font-display text-[17px] font-bold uppercase tracking-wide leading-none text-white group-hover:text-amber-300 transition-colors"
                            title={player.name !== player.matchName ? player.name : undefined}
                          >
                            {player.matchName || player.name}
                          </span>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <Bandera country={player.country} size="xs" />
                            <span className="text-[11px] font-medium text-slate-400">{player.country || "—"}</span>
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
                      <div className="flex items-center gap-2.5">
                        <EscudoEquipo
                          teamId={player.teamId}
                          badgeUrl={player.badgeUrl}
                          name={player.teamName}
                          size={28}
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
                              {(player.leagueCountry || guessLeagueCountry(player.leagueName)) && (
                                <Bandera country={player.leagueCountry || guessLeagueCountry(player.leagueName)} size="xs" className="shrink-0 ml-0.5" />
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Scoring Columns */}
                    <TableCell className="text-center font-bold">
                      <div className="inline-flex flex-col items-center" title={player.lowSample ? LOW_SAMPLE_LABEL : undefined}>
                        {getScoreBadge(player.notaGlobal, true)}
                        {player.lowSample && player.notaGlobal != null && (
                          <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-400/80">Low sample</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs font-semibold text-amber-400 whitespace-nowrap">
                      {fmtMarketValue(player.marketValue)}
                    </TableCell>
                    <TableCell className="text-center whitespace-nowrap">
                      <ContractCell until={player.contractUntil} />
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs text-slate-200" title={player.recentSeason || undefined}>
                      {player.recentMatches ?? "—"}
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs text-slate-200 whitespace-nowrap" title={player.recentSeason || undefined}>
                      {player.recentMinutes != null ? `${player.recentMinutes}'` : "—"}
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs font-semibold text-white" title={player.recentSeason || undefined}>
                      {player.recentGoals ?? "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <FormBars ratings={player.last5Ratings} />
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
          {!isLoading && hasMore && (
            <div ref={loadMoreRef} className="py-4 text-center text-[11px] text-muted-foreground">
              Showing {visiblePlayers.length} of {players.length}…
            </div>
          )}
        </CardContent>
      </Card>
      </div>
      </div>
      {positionModalOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-start justify-center pt-24 pb-4 px-4"
          onClick={() => setPositionModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border/80 bg-[#0b1222] shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border/60 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white">Select Positions</h3>
                <p className="text-xs text-slate-400">
                  {selectedPositions.length === 0
                    ? "All positions active · Click nodes on pitch"
                    : `${selectedPositions.length} selected`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedPositions.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedPositions([])}
                    className="text-xs text-slate-300 hover:text-white"
                  >
                    Clear
                  </Button>
                )}
                <Button size="sm" onClick={() => setPositionModalOpen(false)}>
                  Done
                </Button>
              </div>
            </div>

            <div className="p-4 space-y-3">
              {/* Quick tactical family presets */}
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                {[
                  { label: "DEF", ids: ["Lateral Derecho", "Central Derecho", "Central Izquierdo", "Lateral Izquierdo"] },
                  { label: "MID", ids: ["Mediocentro Defensivo", "Mediocentro", "Mediapunta"] },
                  { label: "ATT", ids: ["Extremo Derecho", "Extremo Izquierdo", "Delantero"] },
                ].map((grp) => {
                  const allOn = grp.ids.every((id) => selectedPositions.includes(id));
                  return (
                    <button
                      key={grp.label}
                      type="button"
                      onClick={() =>
                        setSelectedPositions((prev) =>
                          allOn
                            ? prev.filter((id) => !grp.ids.includes(id))
                            : Array.from(new Set([...prev, ...grp.ids]))
                        )
                      }
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-colors ${
                        allOn
                          ? "bg-emerald-500/20 border-emerald-400 text-emerald-300"
                          : "bg-navy-950/70 border-white/10 text-slate-300 hover:border-white/30"
                      }`}
                    >
                      {grp.label}
                    </button>
                  );
                })}
              </div>

              {/* Interactive vertical pitch */}
              <div className="relative w-full aspect-[3/4] max-h-[430px] mx-auto rounded-xl border border-emerald-500/30 bg-gradient-to-b from-emerald-950/60 via-emerald-900/35 to-emerald-950/60 overflow-hidden select-none">
                <svg viewBox="0 0 300 400" className="absolute inset-0 w-full h-full pointer-events-none opacity-35">
                  <rect x="12" y="12" width="276" height="376" fill="none" stroke="#6ee7b7" strokeWidth="1.5" />
                  <line x1="12" y1="200" x2="288" y2="200" stroke="#6ee7b7" strokeWidth="1.5" />
                  <circle cx="150" cy="200" r="38" fill="none" stroke="#6ee7b7" strokeWidth="1.5" />
                  <circle cx="150" cy="200" r="2.5" fill="#6ee7b7" />
                  <rect x="70" y="12" width="160" height="58" fill="none" stroke="#6ee7b7" strokeWidth="1.5" />
                  <rect x="108" y="12" width="84" height="22" fill="none" stroke="#6ee7b7" strokeWidth="1.5" />
                  <rect x="70" y="330" width="160" height="58" fill="none" stroke="#6ee7b7" strokeWidth="1.5" />
                  <rect x="108" y="366" width="84" height="22" fill="none" stroke="#6ee7b7" strokeWidth="1.5" />
                </svg>

                {[
                  { id: "Delantero", short: "ST", x: 50, y: 14 },
                  { id: "Extremo Izquierdo", short: "LW", x: 20, y: 24 },
                  { id: "Extremo Derecho", short: "RW", x: 80, y: 24 },
                  { id: "Mediapunta", short: "CAM", x: 50, y: 36 },
                  { id: "Mediocentro", short: "CM", x: 50, y: 52 },
                  { id: "Mediocentro Defensivo", short: "CDM", x: 50, y: 66 },
                  { id: "Lateral Izquierdo", short: "LB", x: 16, y: 76 },
                  { id: "Central Izquierdo", short: "LCB", x: 38, y: 79 },
                  { id: "Central Derecho", short: "RCB", x: 62, y: 79 },
                  { id: "Lateral Derecho", short: "RB", x: 84, y: 76 },
                  { id: "Portero", short: "GK", x: 50, y: 92 },
                ].map((pos) => {
                  const active = selectedPositions.includes(pos.id);
                  return (
                    <button
                      key={pos.id}
                      type="button"
                      title={pos.id}
                      onClick={() =>
                        setSelectedPositions((prev) =>
                          prev.includes(pos.id) ? prev.filter((x) => x !== pos.id) : [...prev, pos.id]
                        )
                      }
                      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                      className={`-translate-x-1/2 -translate-y-1/2 absolute w-11 h-11 rounded-full border-2 font-bold text-xs flex items-center justify-center transition-all ${
                        active
                          ? "bg-emerald-500 text-navy-950 border-white shadow-[0_0_16px_rgba(16,185,129,0.75)] scale-110"
                          : "bg-navy-950/85 text-slate-200 border-emerald-400/40 hover:border-emerald-300 hover:scale-105"
                      }`}
                    >
                      {pos.short}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {leaguesModalOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-start justify-center pt-24 pb-4 px-4"
          onClick={() => setLeaguesModalOpen(false)}
        >
          <div
            className="w-full max-w-5xl max-h-[calc(100vh-7rem)] rounded-2xl border border-border/80 bg-[#0b1222] shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border/60 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white">Leagues / Competitions</h3>
                <p className="text-xs text-slate-400">
                  {selectedLeagues.length > 0
                    ? `${selectedLeagues.length} selected · ${filteredAvailableLeagues.length} available`
                    : `${filteredAvailableLeagues.length} leagues available`}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-1 max-w-sm">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={leagueModalSearch}
                    onChange={(e) => setLeagueModalSearch(e.target.value)}
                    placeholder="Search league or country..."
                    autoFocus
                    className="w-full h-9 pl-9 pr-3 rounded-lg bg-navy-950 border border-border/80 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                {selectedLeagues.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedLeagues([])}
                    className="text-xs text-slate-300 hover:text-white"
                  >
                    Clear
                  </Button>
                )}
                <Button size="sm" onClick={() => setLeaguesModalOpen(false)}>
                  Done
                </Button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
              {(() => {
                const q = leagueModalSearch.trim().toLowerCase();
                const filtered = filteredAvailableLeagues.filter(
                  (l) => !q || l.name.toLowerCase().includes(q) || (l.country || "").toLowerCase().includes(q)
                );
                const byCountry = new Map<string, typeof filtered>();
                for (const l of filtered) {
                  const c = l.country || "Other";
                  if (!byCountry.has(c)) byCountry.set(c, []);
                  byCountry.get(c)!.push(l);
                }
                const countries = Array.from(byCountry.keys()).sort((a, b) => a.localeCompare(b));
                return countries.map((country) => {
                  const items = byCountry.get(country)!.slice().sort((a, b) => a.name.localeCompare(b.name));
                  const allSelected = items.every((i) => selectedLeagues.includes(i.id));
                  return (
                    <div key={country} className="space-y-2.5">
                      <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                        <div className="flex items-center gap-2">
                          {country !== "Other" && <Bandera country={country} size="sm" />}
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-200">{country}</span>
                          <span className="text-[11px] text-slate-400">({items.length})</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const ids = items.map((i) => i.id);
                            setSelectedLeagues((prev) =>
                              allSelected
                                ? prev.filter((id) => !ids.includes(id))
                                : Array.from(new Set([...prev, ...ids]))
                            );
                          }}
                          className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300"
                        >
                          {allSelected ? "Deselect all" : "All"}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {items.map((opt) => {
                          const selected = selectedLeagues.includes(opt.id);
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() =>
                                setSelectedLeagues((prev) =>
                                  prev.includes(opt.id) ? prev.filter((id) => id !== opt.id) : [...prev, opt.id]
                                )
                              }
                              className={`group flex flex-col items-center text-center gap-2 p-3.5 rounded-xl border transition-all ${
                                selected
                                  ? "bg-emerald-500/15 border-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.2)]"
                                  : "bg-navy-950/60 border-border/60 hover:border-slate-500 hover:bg-navy-900/70"
                              }`}
                            >
                              <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center p-1.5 group-hover:scale-105 transition-transform">
                                {opt.logoUrl ? (
                                  <img src={opt.logoUrl} alt={opt.name} className="w-10 h-10 object-contain" loading="lazy" />
                                ) : opt.country ? (
                                  <Bandera country={opt.country} size="md" />
                                ) : (
                                  <span className="text-xl">🏆</span>
                                )}
                              </div>
                              <span className={`text-sm font-semibold leading-snug line-clamp-2 ${selected ? "text-emerald-300" : "text-white"}`}>
                                {opt.name}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {teamsModalOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-start justify-center pt-24 pb-4 px-4"
          onClick={() => setTeamsModalOpen(false)}
        >
          <div
            className="w-full max-w-4xl max-h-[calc(100vh-7rem)] rounded-2xl border border-border/80 bg-[#0b1222] shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border/60 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white">Clubs / Teams</h3>
                <p className="text-xs text-slate-400">
                  {selectedTeams.length > 0
                    ? `${selectedTeams.length} selected · ${filteredAvailableTeams.length} available`
                    : `${filteredAvailableTeams.length} clubs available`}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-1 max-w-sm">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={teamModalSearch}
                    onChange={(e) => setTeamModalSearch(e.target.value)}
                    placeholder="Search club..."
                    autoFocus
                    className="w-full h-9 pl-9 pr-3 rounded-lg bg-navy-950 border border-border/80 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                {selectedTeams.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedTeams([])}
                    className="text-xs text-slate-300 hover:text-white"
                  >
                    Clear
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => setTeamsModalOpen(false)}
                >
                  Done
                </Button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filteredAvailableTeams
                .filter((t) => !teamModalSearch.trim() || t.name.toLowerCase().includes(teamModalSearch.trim().toLowerCase()))
                .map((opt) => {
                  const selected = selectedTeams.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        setSelectedTeams((prev) =>
                          prev.includes(opt.id) ? prev.filter((id) => id !== opt.id) : [...prev, opt.id]
                        )
                      }
                      className={`group flex flex-col items-center text-center gap-2.5 p-3.5 rounded-xl border transition-all ${
                        selected
                          ? "bg-emerald-500/15 border-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.2)]"
                          : "bg-navy-950/60 border-border/60 hover:border-slate-500 hover:bg-navy-900/70"
                      }`}
                    >
                      <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center p-1.5 group-hover:scale-105 transition-transform">
                        <EscudoEquipo
                          teamId={opt.teamId}
                          badgeUrl={opt.badgeUrl}
                          name={opt.name}
                          size={44}
                          className="shrink-0"
                        />
                      </div>
                      <span className={`text-sm font-semibold leading-snug line-clamp-2 ${selected ? "text-emerald-300" : "text-white"}`}>
                        {opt.name}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}
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
