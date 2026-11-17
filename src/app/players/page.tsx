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
import { LOW_SAMPLE_LABEL, lowSampleLast } from "@/lib/sampleSize";

// Normaliza nombres de liga: minúsculas, apóstrofos tipográficos → rectos, espacios.
const normLeague = (s: string) => s.toLowerCase().replace(/[\u2018\u2019\u00b4`]/g, "'").replace(/\s+/g, " ").trim();
function dedupeLeagues<T extends { name: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  return arr.filter((l) => { const k = normLeague(l.name); if (seen.has(k)) return false; seen.add(k); return true; });
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
              {selectedIds.length === 1 ? selectedIds[0] : `${selectedIds.length} selected`}
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
  const [positionFilter, setPositionFilter] = useState("all");
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
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
    setPositionFilter(pos);
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
          id: l.name,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, positionFilter, selectedTeams, selectedLeagues, seasonFilter, minRatingFilter, minAge, maxAge, sortBy, sortOrder]);

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

    if (positionFilter !== "all") {
      const pos = positionFilter.toLowerCase();
      list = list.filter(
        (p) => (p.position || "").toLowerCase().includes(pos) || (p.grupoDemarcacion || "").toLowerCase().includes(pos)
      );
    }

    if (selectedTeams.length > 0) {
      const teams = selectedTeams.map((t) => t.toLowerCase());
      list = list.filter((p) => teams.includes((p.teamName || "").toLowerCase()));
    }

    if (selectedLeagues.length > 0) {
      const leagues = selectedLeagues.map(normLeague);
      list = list.filter((p) => {
        // Current league or an international competition she played (Champions League...)
        const own = [p.leagueName, ...(p.competitions || [])].filter(Boolean).map((l) => normLeague(l as string));
        return own.some((l) => leagues.includes(l));
      });
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
        if (minMinutes !== "" && (p.minutesPlayed || 0) < Number(minMinutes)) return false;
        if (maxMinutes !== "" && (p.minutesPlayed || 0) > Number(maxMinutes)) return false;
        if (minGoals !== "" && (p.goals || 0) < Number(minGoals)) return false;
        if (maxGoals !== "" && (p.goals || 0) > Number(maxGoals)) return false;
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
  }, [allPlayers, deferredSearch, positionFilter, selectedTeams, selectedLeagues, minAge, maxAge, minRatingFilter, minValue, maxValue, minMinutes, maxMinutes, minGoals, maxGoals, sortBy, sortOrder]);

  // Dynamically adapt available teams based on selected leagues, and available leagues based on selected teams
  const filteredAvailableTeams = useMemo(() => {
    if (selectedLeagues.length === 0) return availableTeams;
    const leaguesNorm = selectedLeagues.map(normLeague);

    // 1. Calculate each team's definitive league:
    // If availableTeams has a leagueName for the team (from teams table or API), use that.
    // Otherwise, calculate the majority league among players of that team to avoid transfer anomalies.
    const teamLeagueCounts = new Map<string, Map<string, number>>();
    allPlayers.forEach((p) => {
      if (!p.teamName || !p.leagueName) return;
      const tKey = p.teamName.toLowerCase();
      let m = teamLeagueCounts.get(tKey);
      if (!m) {
        m = new Map<string, number>();
        teamLeagueCounts.set(tKey, m);
      }
      const lNorm = normLeague(p.leagueName);
      m.set(lNorm, (m.get(lNorm) || 0) + 1);
    });

    const getTeamLeague = (teamName: string, explicitLeague?: string | null): string | null => {
      if (explicitLeague) return normLeague(explicitLeague);
      const m = teamLeagueCounts.get(teamName.toLowerCase());
      if (!m || m.size === 0) return null;
      let bestLeague = "";
      let maxCount = -1;
      m.forEach((count, l) => {
        if (count > maxCount) {
          maxCount = count;
          bestLeague = l;
        }
      });
      return bestLeague || null;
    };

    return availableTeams.filter((t) => {
      const tLeague = getTeamLeague(t.name, (t as any).leagueName);
      return tLeague != null && leaguesNorm.includes(tLeague);
    });
  }, [availableTeams, selectedLeagues, allPlayers]);

  const filteredAvailableLeagues = useMemo(() => {
    if (selectedTeams.length === 0) return availableLeagues;
    const teamsNorm = selectedTeams.map((t) => t.toLowerCase());

    // Find the primary league belonging to the selected teams
    const leaguesOfSelectedTeams = new Set<string>();

    // Map each team in availableTeams to its league
    const teamToLeague = new Map<string, string>();
    availableTeams.forEach((t) => {
      if ((t as any).leagueName) {
        teamToLeague.set(t.name.toLowerCase(), normLeague((t as any).leagueName));
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
      const lNorm = normLeague(p.leagueName);
      m.set(lNorm, (m.get(lNorm) || 0) + 1);
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

    return availableLeagues.filter((l) => leaguesOfSelectedTeams.has(normLeague(l.name)));
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

          {/* Position Select */}
          <div>
            <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider block mb-1">
              Position
            </label>
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

          {/* Advanced Filters */}
          {(
            <div className="space-y-4">
              {/* Season Filter */}
              <div>
                <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider block mb-1">
                  Season
                </label>
                <Select
                  value={seasonFilter}
                  onChange={(e) => setSeasonFilter(e.target.value)}
                  className="bg-navy-950/90 border-white/10 h-9 text-xs font-semibold rounded-lg"
                >
                  <option value="all">⚡ All Seasons (Accumulated)</option>
                  {availableSeasons.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Competition / League (Multi-select with Flag/Logo) */}
              <div>
                <MultiSelectDropdown
                  label="Leagues / Competitions"
                  options={filteredAvailableLeagues}
                  selectedIds={selectedLeagues}
                  onChange={setSelectedLeagues}
                  placeholder="All leagues"
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

              {/* Club / Team (Multi-select with Badge) */}
              <div>
                <MultiSelectDropdown
                  label="Clubs / Teams"
                  options={filteredAvailableTeams}
                  selectedIds={selectedTeams}
                  onChange={setSelectedTeams}
                  placeholder="All teams"
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
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Market Value (€)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={0}
                    placeholder="Min €"
                    value={minValue}
                    onChange={(e) => setMinValue(e.target.value)}
                    className="h-8 w-full rounded-lg border border-border/80 bg-navy-950/90 px-2.5 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <input
                    type="number"
                    min={0}
                    placeholder="Max €"
                    value={maxValue}
                    onChange={(e) => setMaxValue(e.target.value)}
                    className="h-8 w-full rounded-lg border border-border/80 bg-navy-950/90 px-2.5 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Minutes Played Range */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Minutes Played
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={0}
                    placeholder="Min min"
                    value={minMinutes}
                    onChange={(e) => setMinMinutes(e.target.value)}
                    className="h-8 w-full rounded-lg border border-border/80 bg-navy-950/90 px-2.5 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <input
                    type="number"
                    min={0}
                    placeholder="Max min"
                    value={maxMinutes}
                    onChange={(e) => setMaxMinutes(e.target.value)}
                    className="h-8 w-full rounded-lg border border-border/80 bg-navy-950/90 px-2.5 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Goals Range */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Goals
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={0}
                    placeholder="Min"
                    value={minGoals}
                    onChange={(e) => setMinGoals(e.target.value)}
                    className="h-8 w-full rounded-lg border border-border/80 bg-navy-950/90 px-2.5 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <input
                    type="number"
                    min={0}
                    placeholder="Max"
                    value={maxGoals}
                    onChange={(e) => setMaxGoals(e.target.value)}
                    className="h-8 w-full rounded-lg border border-border/80 bg-navy-950/90 px-2.5 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
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
                  <TableHead className="text-right font-semibold text-white">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/30">
                {visiblePlayers.map((player) => (
                  <TableRow key={player.id} className="h-14 hover:bg-navy-900/50 transition-colors">
                    <TableCell className="p-0 pl-3">
                      <Link href={`/players/${player.id}`} className="flex items-center gap-3 group h-14">
                        <div className="w-14 h-14 bg-navy-950/80 border-r border-white/10 flex items-center justify-center overflow-hidden shrink-0 group-hover:border-primary/50 transition-colors">
                          {player.photoUrl ? (
                            <img
                              src={player.photoUrl}
                              alt={player.name}
                              className="w-full h-full object-contain object-bottom group-hover:scale-105 transition-transform duration-200"
                              loading="lazy"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="w-full h-full p-1.5 flex items-center justify-center text-slate-500 group-hover:text-slate-300 transition-colors">
                              <PlayerSilhouette className="w-full h-full scale-125 object-contain" />
                            </div>
                          )}
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
