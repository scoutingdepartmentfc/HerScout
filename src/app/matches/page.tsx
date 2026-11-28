"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/StatusStates";
import { EscudoEquipo } from "@/components/scouting/EscudoEquipo";
import { LogoLiga } from "@/components/scouting/LogoLiga";
import { Bandera } from "@/components/scouting/Bandera";
import { OptaLogo } from "@/components/scouting/OptaLogo";
import { MatchLineupModal } from "@/components/scouting/MatchLineupModal";
import { MatchPlayerPopup } from "@/components/matchReport/MatchPlayerPopup";
import { MatchCalendar, localDayKey } from "@/components/matches/MatchCalendar";
import {
  Trophy, Clock, MapPin, Globe, Calendar as CalendarIcon,
  Bookmark, BookmarkCheck, ChevronLeft, ChevronRight,
  Filter, Search, Trash2, ListChecks, CheckCircle2, Users
} from "lucide-react";

type Tab = "today" | "calendar" | "agenda" | "upcoming" | "results";

interface TeamSide {
  id?: string;
  name?: string;
  badgeUrl?: string | null;
  score?: number | null;
}

interface MatchRow {
  id: string;
  date: string;
  status: string;
  week?: string | null;
  competition?: string;
  competitionId?: string;
  competitionCountry?: string;
  competitionLogoUrl?: string | null;
  season?: string;
  venue?: string | null;
  venueImage?: string | null;
  hasLineups?: boolean;
  timeConfirmed: boolean;
  home: TeamSide;
  away: TeamSide;
}

interface LeagueView {
  seasons: { id: string; name: string }[];
  season: string | null;
  weeks: { week: string; played: number; total: number }[];
  week: string | null;
  matches: MatchRow[];
}

interface AgendaItem {
  id: string;
  addedAt: string;
  notes?: string;
  watched?: boolean;
}

const STORAGE_AGENDA_KEY = "herscout_scouting_agenda_v1";

// Venue photo cache
const venueImageCache = new Map<string, Promise<string | null>>();

function fetchVenueImage(name: string): Promise<string | null> {
  let p = venueImageCache.get(name);
  if (!p) {
    p = fetch(`/api/venue-image?v=3&name=${encodeURIComponent(name)}`)
      .then(async (r) => {
        const transient = !r.ok || (r.headers.get("cache-control") || "").includes("no-store");
        const url = r.ok ? (((await r.json())?.url as string) || null) : null;
        if (!url && transient) venueImageCache.delete(name);
        return url;
      })
      .catch(() => {
        venueImageCache.delete(name);
        return null;
      });
    venueImageCache.set(name, p);
  }
  return p;
}

function LeagueHeaderBadge({
  competition,
  competitionId,
  competitionCountry,
  competitionLogoUrl,
}: {
  competition?: string;
  competitionId?: string;
  competitionCountry?: string;
  competitionLogoUrl?: string | null;
}) {
  return (
    <div
      className="flex items-center gap-1.5 min-w-0 bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 px-2 py-1 rounded-lg backdrop-blur-sm transition-all"
      title={`${competition || "Competition"}${competitionCountry ? ` (${competitionCountry})` : ""}`}
    >
      <LogoLiga
        competitionId={competitionId}
        competitionName={competition}
        logoUrl={competitionLogoUrl}
        size={20}
        className="shrink-0"
      />
      {competitionCountry && (
        <Bandera
          country={competitionCountry}
          size="xs"
          className="rounded-sm shrink-0 border border-black/30 shadow-xs"
        />
      )}
      <span className="font-semibold text-white truncate text-[11.5px] tracking-tight">
        {competition}
      </span>
    </div>
  );
}

const DEFAULT_PITCH_IMAGE = "/default-pitch.jpg";

function VenueBackdrop({ venue, known }: { venue?: string | null; known?: string | null }) {
  // If known has a real URL, use it; otherwise immediately use the default pitch image
  const [url, setUrl] = useState<string>(known || DEFAULT_PITCH_IMAGE);

  useEffect(() => {
    let cancelled = false;

    if (known !== undefined) {
      setUrl(known || DEFAULT_PITCH_IMAGE);
      return;
    }

    if (venue) {
      fetchVenueImage(venue).then((u) => {
        if (!cancelled && u) setUrl(u);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [venue, known]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden bg-navy-950">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url || DEFAULT_PITCH_IMAGE}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={(e) => {
          // If a venue image fails to load (e.g. 403 or broken link), fallback to pitch!
          const target = e.currentTarget;
          if (target.src !== window.location.origin + DEFAULT_PITCH_IMAGE) {
            target.src = DEFAULT_PITCH_IMAGE;
          }
        }}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105 opacity-80 group-hover:opacity-95"
      />
      {/* Soft gradient letting the stadium shine vividly while subtly preserving text legibility */}
      <div className="absolute inset-0 bg-gradient-to-r from-navy-950/90 via-navy-950/45 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-navy-950/90 via-transparent to-navy-950/30" />
    </div>
  );
}

function MatchdayBar({
  league,
  onSeason,
  onWeek,
}: {
  league: LeagueView;
  onSeason: (id: string) => void;
  onWeek: (week: string) => void;
}) {
  const idx = league.weeks.findIndex((w) => w.week === league.week);
  const current = idx >= 0 ? league.weeks[idx] : null;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-navy-900/70 p-3 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Season</span>
        <select
          value={league.season ?? ""}
          onChange={(e) => onSeason(e.target.value)}
          className="rounded-lg border border-white/15 bg-navy-950 px-2 py-1 text-xs font-semibold text-white focus:border-primary focus:outline-none"
        >
          {league.seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {league.weeks.length > 0 ? (
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="xs"
            disabled={idx <= 0}
            onClick={() => idx > 0 && onWeek(league.weeks[idx - 1].week)}
            aria-label="Previous matchday"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <select
            value={league.week ?? ""}
            onChange={(e) => onWeek(e.target.value)}
            className="min-w-[150px] rounded-lg border border-white/15 bg-navy-950 px-2 py-1 text-center text-xs font-bold text-white focus:border-primary focus:outline-none"
          >
            {league.weeks.map((w) => (
              <option key={w.week} value={w.week}>
                Matchday {w.week}
                {w.played === w.total ? " ✓" : w.played > 0 ? ` (${w.played}/${w.total})` : ""}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="xs"
            disabled={idx < 0 || idx >= league.weeks.length - 1}
            onClick={() => idx < league.weeks.length - 1 && onWeek(league.weeks[idx + 1].week)}
            aria-label="Next matchday"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <span className="text-xs text-slate-400">All matches of the season</span>
      )}

      {current && (
        <span className="text-[11px] text-slate-400">
          {current.played}/{current.total} played · {league.weeks.length} matchdays
        </span>
      )}
    </div>
  );
}

const MAIN_TABS: { id: Tab; label: string; icon?: React.ReactNode }[] = [
  { id: "today", label: "Today's Matches" },
  { id: "calendar", label: "Calendar", icon: <CalendarIcon className="w-3.5 h-3.5 mr-1.5" /> },
  { id: "upcoming", label: "Upcoming" },
  { id: "results", label: "Results" },
];

const DEFAULT_COMPETITIONS: Array<{ id: string; name: string; country: string }> = [
  { id: "5k620c7y6dlbmcm88dt3eb7t", name: "Primera División Femenina", country: "Spain" },
  { id: "6v78kbs8d4hspxdgcti23a5n8", name: "Primera Federación Femenina", country: "Spain" },
  { id: "2fhhxvyhwkxd6gpgg9nbb2p2i", name: "Segunda Federación Femenina", country: "Spain" },
  { id: "2kfd1pg7ymajwbxlfy1j2dhio", name: "Copa de la Reina", country: "Spain" },
  { id: "6vq8j5p3av14nr3iuyi4okhjt", name: "Women's Super League", country: "England" },
  { id: "2z7257m7hj58zuxcjrsg4erzc", name: "Frauen Bundesliga", country: "Germany" },
  { id: "2aso72utuctat2ecs6nahjss6", name: "Première Ligue", country: "France" },
  { id: "81txfenlgw75nq3u2nfdkj92o", name: "Serie A Women", country: "Italy" },
  { id: "55hcphd1ccc6eai1ms77460on", name: "UEFA Women's Champions League", country: "Europe" },
  { id: "1nwgd1b2d903fvnwgnsdadkb8", name: "UEFA Women's Europa Cup", country: "Europe" },
  { id: "43029a6fvhou87zehkd5u8fyt", name: "UEFA Women's Championship", country: "Europe" },
  { id: "9mr92dlx7ryaxhi07sgt90ish", name: "UEFA U19 Championship Women", country: "Europe" },
  { id: "7ut48s80k421xixh6ev5i6h62", name: "Liga MX Femenil", country: "Mexico" },
  { id: "9p3nnxhdjahfn8qswpzy8oyc3", name: "A-League Women", country: "Australia" },
  { id: "cydr5rltozch9qnzjurt1r7d9", name: "SWPL 1", country: "Scotland" },
  { id: "9q5tcfz0w9ku2xq49c0df48b8", name: "Northern Super League", country: "Canada" },
  { id: "avrpx5lanaaxagr4h4duxj3vc", name: "CONMEBOL Libertadores Femenina", country: "South America" },
  { id: "xu2nd3dkwdun0j71tnqabfo4", name: "CAF Women's Champions League", country: "Africa" },
  { id: "65oi3upjiu4lcukayuq66fhuc", name: "FIFA Women's Champions Cup", country: "World" },
];

export default function MatchesPage() {
  const [tab, setTab] = useState<Tab>("today");
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Match whose lineups (pitch view) are open
  const [lineupMatch, setLineupMatch] = useState<MatchRow | null>(null);
  const router = useRouter();
  const [urlReady, setUrlReady] = useState(false);
  // Player clicked in the lineup → quick summary popup on top of it
  const [quickPlayer, setQuickPlayer] = useState<string | null>(null);
  const pendingLeague = useRef<{ season: string | null; week: string | null } | null>(null);
  // Played / live / starting within 2 h: lineups are stored or fetched from Opta on first open
  const canOpen = (m: MatchRow) =>
    !!m.hasLineups ||
    m.status === "Played" ||
    m.status === "Playing" ||
    (m.status === "Fixture" && new Date(m.date).getTime() - Date.now() < 2 * 60 * 60 * 1000);

  // Time zone handling
  const [userTimeZone, setUserTimeZone] = useState<string>("");
  const [tzShort, setTzShort] = useState<string>("");
  const [isClient, setIsClient] = useState(false);

  // Competitions list from Supabase / data
  const [allCompetitions, setAllCompetitions] = useState<Array<{ id: string; name: string; country?: string }>>(DEFAULT_COMPETITIONS);

  useEffect(() => {
    async function loadComps() {
      try {
        const res = await fetch("/api/admin/clubs");
        const json = await res.json();
        if (json.leagues && Array.isArray(json.leagues)) {
          setAllCompetitions(
            json.leagues.map((l: any) => ({
              id: l.competition_id,
              name: l.competition_name,
              country: l.country,
            }))
          );
        }
      } catch (e) {
        console.warn("Could not load leagues list", e);
      }
    }
    loadComps();
  }, []);

  // Calendar state
  const [calCurrentDate, setCalCurrentDate] = useState(() => new Date());
  // Set of selected league names; empty Set means ALL
  const [selectedLeagues, setSelectedLeagues] = useState<Set<string>>(new Set());
  // One league selected in Results/Upcoming → server-side view by season + matchday
  const [league, setLeague] = useState<LeagueView | null>(null);
  const [leagueLoading, setLeagueLoading] = useState(false);
  const [leagueSeason, setLeagueSeason] = useState<string | null>(null);
  const [leagueWeek, setLeagueWeek] = useState<string | null>(null);

  // Scouting Agenda state (persisted in localStorage)
  const [agenda, setAgenda] = useState<Record<string, AgendaItem>>({});
  const [agendaMatches, setAgendaMatches] = useState<MatchRow[]>([]);
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [agendaSearch, setAgendaSearch] = useState("");

  useEffect(() => {
    setIsClient(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setUserTimeZone(tz);
      const short = new Intl.DateTimeFormat(undefined, {
        timeZoneName: "short",
      })
        .formatToParts(new Date())
        .find((p) => p.type === "timeZoneName")?.value;
      if (short) setTzShort(short);
    } catch {
      setUserTimeZone("Local");
    }

    try {
      const saved = localStorage.getItem(STORAGE_AGENDA_KEY);
      if (saved) setAgenda(JSON.parse(saved));
    } catch (e) {
      console.warn("Error loading scouting agenda:", e);
    }
  }, []);

  // Save agenda changes to localStorage
  const updateAgenda = (newAgenda: Record<string, AgendaItem>) => {
    setAgenda(newAgenda);
    try {
      localStorage.setItem(STORAGE_AGENDA_KEY, JSON.stringify(newAgenda));
    } catch (e) {
      console.warn("Error saving agenda:", e);
    }
  };

  const toggleAgendaMatch = (match: MatchRow, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const copy = { ...agenda };
    if (copy[match.id]) {
      delete copy[match.id];
    } else {
      copy[match.id] = {
        id: match.id,
        addedAt: new Date().toISOString(),
        watched: false,
      };
    }
    updateAgenda(copy);
  };

  const toggleWatched = (matchId: string) => {
    const copy = { ...agenda };
    if (copy[matchId]) {
      copy[matchId] = { ...copy[matchId], watched: !copy[matchId].watched };
      updateAgenda(copy);
    }
  };

  const updateNotes = (matchId: string, notes: string) => {
    const copy = { ...agenda };
    if (copy[matchId]) {
      copy[matchId] = { ...copy[matchId], notes };
      updateAgenda(copy);
    }
  };

  // Fetch matches depending on active tab
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        if (tab === "agenda") {
          setIsLoading(false);
          return;
        }

        let url = `/api/matches?tab=${tab}`;
        if (tab === "calendar") {
          const year = calCurrentDate.getFullYear();
          const month = calCurrentDate.getMonth();
          const start = new Date(year, month, 1).toISOString();
          const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
          url = `/api/matches?tab=calendar&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
        }

        const res = await fetch(url);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        if (!cancelled) {
          setMatches(json.matches || []);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Failed to load matches");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tab, calCurrentDate]);

  // Load matches for the Scouting Agenda
  useEffect(() => {
    const ids = Object.keys(agenda);
    if (ids.length === 0) {
      setAgendaMatches([]);
      return;
    }
    let cancelled = false;
    async function loadAgendaMatches() {
      setAgendaLoading(true);
      try {
        const res = await fetch(`/api/matches?ids=${encodeURIComponent(ids.join(","))}`);
        const json = await res.json();
        if (!cancelled && json.matches) {
          setAgendaMatches(json.matches);
        }
      } catch (e) {
        console.error("Failed to load agenda matches", e);
      } finally {
        if (!cancelled) setAgendaLoading(false);
      }
    }
    loadAgendaMatches();
    return () => {
      cancelled = true;
    };
  }, [agenda]);

  const played = (m: MatchRow) => m.status === "Played";

  const formatMatchDateTime = (dateStr: string, timeConfirmed: boolean, isPlayed: boolean) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { dateLabel: "—", timeLabel: "" };

    const dateLabel = d.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });

    if (isPlayed) {
      return { dateLabel, timeLabel: "" };
    }

    if (!timeConfirmed) {
      return { dateLabel, timeLabel: "Time TBC" };
    }

    const timeFormatted = d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const timeLabel = tzShort ? `${timeFormatted} ${tzShort}` : timeFormatted;
    return { dateLabel, timeLabel };
  };

  // Calendar Helpers
  const { monthName, matchesByDay, availableCompetitions } = useMemo(() => {
    const monthName = calCurrentDate.toLocaleString("en-US", { month: "long", year: "numeric" });

    // Group matches by day "YYYY-MM-DD" applying active selectedLeagues filter if set
    const matchesByDay: Record<string, MatchRow[]> = {};
    const compSet = new Set<string>();

    for (const m of matches) {
      if (m.competition) compSet.add(m.competition);
      // Filter out matches if a league filter is active
      if (selectedLeagues.size > 0 && (!m.competition || !selectedLeagues.has(m.competition))) {
        continue;
      }
      const dayKey = localDayKey(new Date(m.date));
      if (!matchesByDay[dayKey]) matchesByDay[dayKey] = [];
      matchesByDay[dayKey].push(m);
    }

    return {
      monthName,
      matchesByDay,
      availableCompetitions: Array.from(compSet).sort(),
    };
  }, [calCurrentDate, matches, selectedLeagues]);

  // Scouting Agenda Filtered List
  const filteredAgendaMatches = useMemo(() => {
    return agendaMatches.filter((m) => {
      if (selectedLeagues.size > 0 && (!m.competition || !selectedLeagues.has(m.competition))) {
        return false;
      }
      if (!agendaSearch.trim()) return true;
      const q = agendaSearch.toLowerCase();
      return (
        m.home.name?.toLowerCase().includes(q) ||
        m.away.name?.toLowerCase().includes(q) ||
        m.competition?.toLowerCase().includes(q) ||
        m.venue?.toLowerCase().includes(q)
      );
    });
  }, [agendaMatches, agendaSearch, selectedLeagues]);

  // Contextual leagues present in the currently loaded matches (Today / Calendar month / Agenda / etc.)
  const { competitionTree, activeMatchCount } = useMemo(() => {
    const targetMatches = tab === "agenda" ? agendaMatches : matches;
    const countByLeague = new Map<string, number>();
    const compMap = new Map<string, { id?: string; name: string; country: string }>();

    for (const m of targetMatches) {
      if (!m.competition) continue;
      countByLeague.set(m.competition, (countByLeague.get(m.competition) || 0) + 1);

      if (!compMap.has(m.competition)) {
        // Try resolving country from default list or match property
        const found = allCompetitions.find((c) => c.name === m.competition);
        compMap.set(m.competition, {
          id: m.competitionId || found?.id,
          name: m.competition,
          country: m.competitionCountry || found?.country || "International",
        });
      }
    }

    // Results / Upcoming only load the latest matches: list every downloaded league so any can be picked
    if (tab === "results" || tab === "upcoming") {
      for (const c of allCompetitions) {
        if (!compMap.has(c.name)) compMap.set(c.name, { id: c.id, name: c.name, country: c.country || "International" });
      }
    }

    // Group only countries that have at least one match in this view/period
    const groups: Record<string, Array<{ id?: string; name: string; count: number }>> = {};
    for (const [leagueName, info] of Array.from(compMap.entries())) {
      const country = info.country || "International";
      if (!groups[country]) groups[country] = [];
      groups[country].push({
        id: info.id,
        name: leagueName,
        count: countByLeague.get(leagueName) || 0,
      });
    }

    const priorityOrder = [
      "Spain", "England", "Germany", "France", "Italy", "Europe", "World",
      "Mexico", "Australia", "Canada", "Scotland", "South America", "Africa"
    ];
    const sortedCountries = Object.keys(groups).sort((a, b) => {
      const idxA = priorityOrder.indexOf(a);
      const idxB = priorityOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    const tree = sortedCountries.map((country) => {
      const leagues = groups[country].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      const totalCountryMatches = leagues.reduce((acc, l) => acc + l.count, 0);
      return {
        country,
        totalMatches: totalCountryMatches,
        leagues,
      };
    });

    return { competitionTree: tree, activeMatchCount: targetMatches.length };
  }, [tab, matches, agendaMatches, allCompetitions]);

  // General matches filtered by multi-selection
  const filteredMatches = useMemo(() => {
    if (selectedLeagues.size === 0) return matches;
    return matches.filter((m) => m.competition && selectedLeagues.has(m.competition));
  }, [matches, selectedLeagues]);

  // Single league selected in Results/Upcoming: matches come from the server by matchday
  const leagueMode = (tab === "results" || tab === "upcoming") && selectedLeagues.size === 1;
  const leagueId = useMemo(() => {
    if (!leagueMode) return null;
    const name = Array.from(selectedLeagues)[0];
    for (const g of competitionTree) for (const l of g.leagues) if (l.name === name && l.id) return l.id;
    return allCompetitions.find((c) => c.name === name)?.id ?? matches.find((m) => m.competition === name)?.competitionId ?? null;
  }, [leagueMode, selectedLeagues, competitionTree, allCompetitions, matches]);

  // New league → back to its current season / matchday (or the one saved in the URL when coming back)
  useEffect(() => {
    const pending = pendingLeague.current;
    if (leagueId && pending) {
      pendingLeague.current = null;
      setLeagueSeason(pending.season);
      setLeagueWeek(pending.week);
      setLeague(null);
      return;
    }
    setLeagueSeason(null);
    setLeagueWeek(null);
    setLeague(null);
  }, [leagueId]);

  // ---- View state in the URL (?tab&league&season&week&match) ----
  // Going to a player's profile from the lineup and pressing Back returns to the same view with the lineup open.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = q.get("tab") as Tab | null;
    if (t && (MAIN_TABS.some((x) => x.id === t) || t === "agenda")) setTab(t);
    const lg = q.get("league");
    if (lg) {
      setSelectedLeagues(new Set([lg]));
      pendingLeague.current = { season: q.get("season"), week: q.get("week") };
    }
    const mid = q.get("match");
    if (mid) {
      fetch(`/api/matches?ids=${encodeURIComponent(mid)}`)
        .then((r) => r.json())
        .then((j) => j.matches?.[0] && setLineupMatch(j.matches[0]))
        .catch(() => {});
    }
    setUrlReady(true);
  }, []);

  useEffect(() => {
    if (!urlReady) return;
    const q = new URLSearchParams();
    if (tab !== "today") q.set("tab", tab);
    if (selectedLeagues.size === 1) q.set("league", Array.from(selectedLeagues)[0]);
    if (leagueId && league?.season) q.set("season", league.season);
    if (leagueId && league?.week) q.set("week", league.week);
    if (lineupMatch) q.set("match", lineupMatch.id);
    const next = `${window.location.pathname}${q.toString() ? `?${q}` : ""}`;
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [urlReady, tab, selectedLeagues, leagueId, league, lineupMatch]);

  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;
    setLeagueLoading(true);
    const qs = new URLSearchParams({ competition: leagueId });
    if (leagueSeason) qs.set("season", leagueSeason);
    if (leagueWeek) qs.set("week", leagueWeek);
    fetch(`/api/matches/league?${qs}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error);
        if (!cancelled) setLeague(json);
      })
      .catch((e) => !cancelled && setError(e.message || "Failed to load league matches"))
      .finally(() => !cancelled && setLeagueLoading(false));
    return () => {
      cancelled = true;
    };
  }, [leagueId, leagueSeason, leagueWeek]);

  const listMatches = leagueId ? league?.matches ?? [] : filteredMatches;

  // Toggle single league
  const toggleLeagueFilter = (leagueName: string) => {
    const next = new Set(selectedLeagues);
    if (next.has(leagueName)) {
      next.delete(leagueName);
    } else {
      next.add(leagueName);
    }
    setSelectedLeagues(next);
  };

  // Toggle all leagues in a country
  const toggleCountryFilter = (countryLeagues: Array<{ name: string }>) => {
    const names = countryLeagues.map((l) => l.name);
    const allSelected = names.every((n) => selectedLeagues.has(n));
    const next = new Set(selectedLeagues);

    if (allSelected) {
      names.forEach((n) => next.delete(n));
    } else {
      names.forEach((n) => next.add(n));
    }
    setSelectedLeagues(next);
  };

  const clearAllFilters = () => {
    setSelectedLeagues(new Set());
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-white">Matches & Scouting Hub</h1>
            <OptaLogo variant="icon" size="xs" />
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <p className="text-xs text-muted-foreground">
              Official Opta fixtures schedule, interactive calendar overview and personal scouting agenda.
            </p>
            {isClient && userTimeZone && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-slate-300">
                <Globe className="w-2.5 h-2.5 text-primary" />
                <span>Kick-off times in: <strong className="text-white font-medium">{userTimeZone}</strong> {tzShort && `(${tzShort})`}</span>
              </span>
            )}
          </div>
        </div>

        {/* Tab switch and Scouting Agenda */}
        <div className="flex items-center gap-2">
          {/* Main fixtures tabs */}
          <div className="flex items-center gap-1 rounded-xl bg-navy-900/90 border border-border p-1 backdrop-blur-sm">
            {MAIN_TABS.map((t) => (
              <Button
                key={t.id}
                variant={tab === t.id ? "primary" : "ghost"}
                size="xs"
                onClick={() => setTab(t.id)}
                className="relative px-3 py-1.5 font-semibold text-xs"
              >
                {t.icon}
                {t.label}
              </Button>
            ))}
          </div>

          {/* Scouting Agenda Dedicated Button */}
          <button
            onClick={() => setTab("agenda")}
            className={`group relative flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-sm ${
              tab === "agenda"
                ? "bg-amber-400 text-slate-950 border-amber-300 shadow-amber-400/20 ring-1 ring-amber-300"
                : "bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20 hover:border-amber-400/50 hover:text-white"
            }`}
            title="Open personal Scouting Agenda"
          >
            <Bookmark
              className={`w-3.5 h-3.5 transition-transform group-hover:scale-110 ${
                tab === "agenda" ? "fill-slate-950 text-slate-950" : "fill-amber-400 text-amber-400"
              }`}
            />
            <span>Scouting Agenda</span>
            {Object.keys(agenda).length > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-black font-mono shadow-xs ${
                  tab === "agenda"
                    ? "bg-slate-950 text-amber-400"
                    : "bg-amber-400 text-slate-950"
                }`}
              >
                {Object.keys(agenda).length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Layout: Sidebar with Country & League Filters + Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Sidebar: Leagues grouped by Country */}
        <aside className="lg:col-span-3 xl:col-span-2 bg-navy-950/90 border border-white/10 rounded-2xl p-3 shadow-xl sticky top-4 backdrop-blur-md space-y-2.5">
          <div className="flex items-center justify-between pb-2 border-b border-white/10 px-1">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-primary" />
              <span className="font-bold text-xs uppercase tracking-wider text-slate-200">
                Filter by League
              </span>
            </div>
            {selectedLeagues.size > 0 && (
              <button
                onClick={clearAllFilters}
                className="text-[10.5px] font-semibold text-primary hover:underline"
              >
                Reset ({selectedLeagues.size})
              </button>
            )}
          </div>

          {/* All Leagues option */}
          <button
            onClick={clearAllFilters}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              selectedLeagues.size === 0
                ? "bg-primary text-slate-950 shadow-md shadow-primary/20"
                : "bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            <div className="flex items-center gap-2">
              <Globe className={`w-3.5 h-3.5 ${selectedLeagues.size === 0 ? "text-slate-950" : "text-primary"}`} />
              <span>All Competitions</span>
            </div>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                selectedLeagues.size === 0
                  ? "bg-slate-950/20 text-slate-950 font-black"
                  : "bg-white/10 text-slate-400"
              }`}
            >
              {activeMatchCount}
            </span>
          </button>

          {/* Country Groups (Only countries with matches in the current view) */}
          <div className="space-y-2.5 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
            {competitionTree.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground border border-dashed border-white/10 rounded-xl">
                No matches found in this view.
              </div>
            ) : (
              competitionTree.map((grp) => {
                const isAllCountrySelected = grp.leagues.every((l) => selectedLeagues.has(l.name));
                const isSomeCountrySelected = grp.leagues.some((l) => selectedLeagues.has(l.name));

                return (
                  <div key={grp.country} className="space-y-1">
                    {/* Country header with flag & Select All Country shortcut */}
                    <div
                      onClick={() => toggleCountryFilter(grp.leagues)}
                      className={`flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition-colors group select-none ${
                        isAllCountrySelected
                          ? "bg-white/[0.08] text-white"
                          : isSomeCountrySelected
                          ? "bg-white/[0.04] text-slate-200"
                          : "hover:bg-white/[0.04] text-slate-400"
                      }`}
                      title={`Click to select/unselect all ${grp.country} competitions`}
                    >
                      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider min-w-0">
                        <Bandera
                          country={grp.country}
                          size="xs"
                          className="rounded-sm border border-black/40 shrink-0"
                        />
                        <span className="truncate">{grp.country}</span>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-white/10 text-slate-300">
                        {grp.totalMatches}
                      </span>
                    </div>

                    {/* Leagues under country with checkboxes */}
                    <div className="space-y-0.5 pl-2">
                      {grp.leagues.map((l) => {
                        const isSelected = selectedLeagues.has(l.name);
                        return (
                          <button
                            key={l.name}
                            onClick={() => toggleLeagueFilter(l.name)}
                            className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all text-left group ${
                              isSelected
                                ? "bg-primary/20 text-primary border border-primary/40 font-bold shadow-sm"
                                : "text-slate-300 hover:text-white hover:bg-white/[0.06] border border-transparent"
                            }`}
                            title={l.name}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`w-3.5 h-3.5 rounded flex items-center justify-center border text-[9px] font-black transition-colors ${
                                  isSelected
                                    ? "bg-primary text-slate-950 border-primary"
                                    : "border-white/30 group-hover:border-white/60 text-transparent"
                                }`}
                              >
                                ✓
                              </span>
                              <LogoLiga
                                competitionId={l.id}
                                competitionName={l.name}
                                size={18}
                                className="shrink-0"
                              />
                              <span className="truncate">{l.name}</span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-400 shrink-0">
                              {l.count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Right Content Area: Calendar / Today / Agenda / Fixtures */}
        <div className="lg:col-span-9 xl:col-span-10 min-w-0">

      {/* TAB CONTENT: CALENDAR */}
      {tab === "calendar" ? (
        <div className="space-y-4">
          {/* Calendar Month Navigation & Filters */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-navy-900/70 px-4 py-2.5 rounded-2xl border border-white/10 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCalCurrentDate(
                    new Date(calCurrentDate.getFullYear(), calCurrentDate.getMonth() - 1, 1)
                  )
                }
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Prev
              </Button>
              <h2 className="text-lg font-bold text-white min-w-[170px] text-center font-mono">
                {monthName}
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCalCurrentDate(
                    new Date(calCurrentDate.getFullYear(), calCurrentDate.getMonth() + 1, 1)
                  )
                }
              >
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
              <Button
                variant="ghost"
                size="xs"
                className="text-xs text-primary"
                onClick={() => {
                  const today = new Date();
                  setCalCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
                }}
              >
                Today
              </Button>
            </div>

            {/* Selected filters badge indicator */}
            {selectedLeagues.size > 0 && (
              <div className="flex items-center gap-1.5 text-xs bg-primary/10 border border-primary/30 text-primary px-2.5 py-1 rounded-lg">
                <span className="font-bold">Filtering: {selectedLeagues.size} league{selectedLeagues.size > 1 ? "s" : ""}</span>
                <button onClick={clearAllFilters} className="hover:text-white underline text-[10px] ml-1">
                  Clear
                </button>
              </div>
            )}
          </div>

          {isLoading ? (
            <LoadingState message="Loading monthly calendar fixtures..." />
          ) : (
            <MatchCalendar
              year={calCurrentDate.getFullYear()}
              month={calCurrentDate.getMonth()}
              matchesByDay={matchesByDay}
              tzShort={tzShort}
              agenda={agenda}
              canOpen={(m) => canOpen(m as MatchRow)}
              onOpenMatch={(m) => setLineupMatch(m as MatchRow)}
              onToggleAgenda={(m, e) => toggleAgendaMatch(m as MatchRow, e)}
            />
          )}
        </div>
      ) : tab === "agenda" ? (
        /* TAB CONTENT: SCOUTING AGENDA */
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-navy-900/70 p-4 rounded-2xl border border-white/10 backdrop-blur-md">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Bookmark className="w-5 h-5 text-amber-400 fill-amber-400" />
                <span>My Scouting Agenda</span>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Curate your personal watchlist of games to scout, track viewed matches and record scouting notes.
              </p>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter agenda matches..."
                  value={agendaSearch}
                  onChange={(e) => setAgendaSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-navy-950 border border-white/15 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary"
                />
              </div>

              {Object.keys(agenda).length > 0 && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    if (window.confirm("Are you sure you want to clear your scouting agenda?")) {
                      updateAgenda({});
                    }
                  }}
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear All
                </Button>
              )}
            </div>
          </div>

          {agendaLoading ? (
            <LoadingState message="Loading your scouting agenda..." />
          ) : Object.keys(agenda).length === 0 ? (
            <EmptyState
              title="Your Scouting Agenda is empty"
              description="Click the bookmark icon on any match in 'Today's Matches', 'Calendar', or 'Upcoming' to add fixtures you plan to scout."
            />
          ) : filteredAgendaMatches.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-dashed border-white/15 bg-navy-950/40 text-xs text-muted-foreground">
              No matches found matching your search.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAgendaMatches.map((m) => {
                const item = agenda[m.id] || { id: m.id, addedAt: "" };
                const isWatched = !!item.watched;
                const { dateLabel, timeLabel } = formatMatchDateTime(m.date, m.timeConfirmed, played(m));

                return (
                  <Card
                    key={m.id}
                    className={`group relative overflow-hidden transition-all duration-200 ${
                      isWatched ? "border-emerald-500/40 bg-emerald-950/10" : "border-white/15 hover:border-white/30"
                    }`}
                  >
                    <VenueBackdrop venue={m.venue} known={m.venueImage} />
                    <CardContent className="relative p-4 flex flex-col justify-between h-full">
                      <div>
                        {/* Header bar */}
                        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground mb-3">
                          <LeagueHeaderBadge
                            competition={m.competition}
                            competitionId={m.competitionId}
                            competitionCountry={m.competitionCountry}
                            competitionLogoUrl={m.competitionLogoUrl}
                          />
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => toggleWatched(m.id)}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 transition-colors ${
                                isWatched
                                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                  : "bg-white/10 text-slate-300 hover:bg-emerald-500/20 hover:text-emerald-300"
                              }`}
                              title={isWatched ? "Mark as pending" : "Mark as scouted / watched"}
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{isWatched ? "Scouted" : "To Scout"}</span>
                            </button>
                            <button
                              onClick={(e) => toggleAgendaMatch(m, e)}
                              className="text-slate-400 hover:text-red-400 p-1 rounded transition-colors"
                              title="Remove from agenda"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Teams */}
                        <div className="space-y-2 py-2">
                          {[m.home, m.away].map((side, i) => (
                            <div key={i} className="flex items-center justify-between font-bold text-sm text-white drop-shadow-sm">
                              <span className="flex items-center gap-2 min-w-0">
                                <EscudoEquipo teamId={side.id} badgeUrl={side.badgeUrl} name={side.name} size={20} />
                                <span className="truncate">{side.name}</span>
                              </span>
                              <span className={played(m) ? "font-mono font-black text-white text-base" : "text-slate-400 font-mono"}>
                                {played(m) ? side.score ?? 0 : "-"}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Date & Location */}
                        <div className="mt-3 pt-3 border-t border-white/15 flex items-center justify-between text-xs text-slate-200">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Clock className="w-3.5 h-3.5 shrink-0 text-slate-300" />
                            <span className="truncate font-medium text-slate-200">
                              {dateLabel}
                              {timeLabel && (
                                <span className="text-white font-bold ml-1.5">· {timeLabel}</span>
                              )}
                            </span>
                          </div>
                          {played(m) ? (
                            <Badge variant="secondary" size="sm" className="font-bold text-white bg-white/15 border-white/20">Final</Badge>
                          ) : (
                            <Badge variant="outline" size="sm" className="font-semibold text-slate-200 border-white/20 bg-black/40">{m.status === "Fixture" ? "Scheduled" : m.status}</Badge>
                          )}
                        </div>

                        {m.venue && (
                          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-300 truncate">
                            <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                            <span className="truncate font-medium">{m.venue}</span>
                          </div>
                        )}
                      </div>

                      {/* Scouting Notes input */}
                      <div className="mt-4 pt-3 border-t border-white/10">
                        <textarea
                          placeholder="Add scouting notes (e.g. key players to watch, tactical focus)..."
                          value={item.notes || ""}
                          onChange={(e) => updateNotes(m.id, e.target.value)}
                          className="w-full h-16 p-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/60 resize-none"
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* TAB CONTENT: TODAY / UPCOMING / RESULTS LIST VIEW */
        <>
          {leagueId && league && (
            <MatchdayBar
              league={league}
              onSeason={(id) => {
                setLeagueSeason(id);
                setLeagueWeek(null);
              }}
              onWeek={setLeagueWeek}
            />
          )}
          {isLoading || (leagueId && (leagueLoading || !league)) ? (
            <LoadingState message="Loading matches..." />
          ) : error ? (
            <ErrorState title="Matches unavailable" message={error} onRetry={() => window.location.reload()} />
          ) : (leagueId ? listMatches.length === 0 : matches.length === 0) ? (
            <EmptyState
              title={tab === "today" ? "No matches scheduled for today" : "No matches found"}
              description={
                tab === "today"
                  ? "Check the 'Calendar' tab or 'Upcoming' fixtures to see all scheduled matches."
                  : "Matches appear after the next Opta data download of the selected leagues."
              }
            />
          ) : listMatches.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-dashed border-white/15 bg-navy-950/40 text-xs text-muted-foreground">
              No matches found for the selected leagues. Try selecting &quot;All Competitions&quot;.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {listMatches.map((m) => {
                const { dateLabel, timeLabel } = formatMatchDateTime(m.date, m.timeConfirmed, played(m));
                const isBookmarked = !!agenda[m.id];
                return (
                  <Card
                    key={m.id}
                    onClick={canOpen(m) ? () => setLineupMatch(m) : undefined}
                    className={`group relative overflow-hidden transition-all duration-200 hover:border-white/30 ${
                      canOpen(m) ? "cursor-pointer" : ""
                    }`}
                  >
                    <VenueBackdrop venue={m.venue} known={m.venueImage} />
                    <CardContent className="relative p-4">
                      <div className="flex items-center justify-between gap-2 text-[11px] mb-3">
                        <LeagueHeaderBadge
                          competition={m.competition}
                          competitionId={m.competitionId}
                          competitionCountry={m.competitionCountry}
                          competitionLogoUrl={m.competitionLogoUrl}
                        />
                        <div className="flex items-center gap-2">
                          {m.week && <span className="shrink-0 font-semibold text-slate-200 bg-black/40 border border-white/10 px-2 py-0.5 rounded-md">Matchday {m.week}</span>}
                          <button
                            onClick={(e) => toggleAgendaMatch(m, e)}
                            className={`p-1 rounded-md transition-colors ${
                              isBookmarked
                                ? "text-amber-400 bg-amber-400/20"
                                : "text-slate-300 hover:text-amber-400 hover:bg-white/15 bg-black/40 border border-white/10"
                            }`}
                            title={isBookmarked ? "Remove from Scouting Agenda" : "Add to Scouting Agenda"}
                          >
                            {isBookmarked ? (
                              <BookmarkCheck className="w-4 h-4 fill-amber-400" />
                            ) : (
                              <Bookmark className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2 py-2">
                        {[m.home, m.away].map((side, i) => (
                          <div key={i} className="flex items-center justify-between font-bold text-sm text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                            <span className="flex items-center gap-2 min-w-0">
                              <EscudoEquipo teamId={side.id} badgeUrl={side.badgeUrl} name={side.name} size={20} />
                              <span className="truncate">{side.name}</span>
                            </span>
                            <span className={played(m) ? "font-mono font-black text-white text-base drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]" : "text-slate-300 font-mono drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]"}>
                              {played(m) ? side.score ?? 0 : "-"}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 pt-3 border-t border-white/20 flex items-center justify-between gap-2 text-xs text-slate-100">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Clock className="w-3.5 h-3.5 shrink-0 text-slate-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />
                          <span className="truncate font-semibold text-slate-100 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                            {dateLabel}
                            {timeLabel && (
                              <span className="text-white font-bold ml-1.5 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                                · {timeLabel}
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {canOpen(m) && (
                            <span className="inline-flex items-center gap-1 rounded border border-emerald-400/50 bg-emerald-500/25 px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide text-emerald-300 group-hover:bg-emerald-500/35 shadow-xs">
                              <Users className="h-3 w-3" /> Lineups
                            </span>
                          )}
                          {played(m) ? (
                            <Badge variant="secondary" size="sm" className="font-bold text-white bg-white/20 border-white/30 backdrop-blur-xs">Final</Badge>
                          ) : (
                            <Badge variant="outline" size="sm" className="font-bold text-slate-100 border-white/25 bg-black/50 backdrop-blur-xs">{m.status === "Fixture" ? "Scheduled" : m.status}</Badge>
                          )}
                        </div>
                      </div>
                      {m.venue && (
                        <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-200 truncate">
                          <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />
                          <span className="truncate font-medium drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">{m.venue}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
        </div>
      </div>
      <MatchLineupModal
        match={lineupMatch}
        onClose={() => setLineupMatch(null)}
        onPlayerClick={setQuickPlayer}
      />
      <MatchPlayerPopup
        playerId={quickPlayer}
        matchId={lineupMatch?.id ?? null}
        matchLabel={
          lineupMatch
            ? `${lineupMatch.home.name ?? "Home"} ${lineupMatch.home.score ?? "–"}–${lineupMatch.away.score ?? "–"} ${lineupMatch.away.name ?? "Away"}`
            : undefined
        }
        onClose={() => setQuickPlayer(null)}
        // The URL already holds ?match=…: Back on the profile reopens this lineup
        onOpenProfile={(id) => router.push(`/players/${encodeURIComponent(id)}?from=lineup`)}
      />
    </div>
  );
}