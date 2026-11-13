"use client";

import React, { useEffect, useState, useMemo, useRef, Suspense } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { StadiumPitch, EmptyPitchSlot, PitchScaleContext, usePitchScale } from "@/components/builder/StadiumPitch";
import { PitchCard } from "@/components/builder/PitchCard";
import { MultiSelectFilter } from "@/components/builder/MultiSelectFilter";
import { RangeSlider } from "@/components/builder/RangeSlider";
import { CromoJugador } from "@/components/scouting/CromoJugador";
import { EscudoEquipo } from "@/components/scouting/EscudoEquipo";
import { LoadingState } from "@/components/ui/StatusStates";
import {
  SlidersHorizontal, Trophy, X, ChevronRight, ChevronDown, ChevronLeft, ChevronUp, Eye, Plus, Search, Loader2, RotateCcw,
  Layers, Info, Trash2, StickyNote, Save, FolderOpen, FilePlus2, LayoutGrid, ListOrdered, Replace, Wand2, Crown, Eraser,
} from "lucide-react";
import { METRICS_HIERARCHY, GOALKEEPER_HIERARCHY, CategoryDef } from "@/lib/metricsHierarchy";
import { guessLeagueCountry, sortLeaguesByCountryAndTier } from "@/lib/leagueCountry";

/* ─────────────────────────── Demarcaciones y sistemas ─────────────────────────── */

type GroupId = "Porteros" | "Centrales" | "Laterales" | "Medios" | "Mediapuntas" | "Extremos" | "Delanteros";
type ScopeId = "all" | GroupId;

const GROUPS: { id: GroupId; label: string; short: string; color: string }[] = [
  { id: "Porteros", label: "Goalkeepers", short: "GK", color: "#f59e0b" },
  { id: "Centrales", label: "Centre-backs", short: "CB", color: "#3b82f6" },
  { id: "Laterales", label: "Full-backs", short: "FB", color: "#06b6d4" },
  { id: "Medios", label: "Midfielders", short: "CM", color: "#10b981" },
  { id: "Mediapuntas", label: "Attacking mids", short: "AM", color: "#84cc16" },
  { id: "Extremos", label: "Wingers", short: "W", color: "#f43f5e" },
  { id: "Delanteros", label: "Strikers", short: "ST", color: "#ef4444" },
];
const GROUP_BY_ID = Object.fromEntries(GROUPS.map((g) => [g.id, g])) as Record<GroupId, (typeof GROUPS)[number]>;

type FormationKey = "4-3-3" | "4-4-2" | "4-2-3-1" | "3-5-2" | "3-4-3" | "5-3-2";

// Líneas de arriba (ataque) a abajo (portera)
const FORMATIONS: Record<FormationKey, string[][]> = {
  "4-3-3": [["LW", "ST", "RW"], ["LCM", "CDM", "RCM"], ["LB", "LCB", "RCB", "RB"], ["GK"]],
  "4-4-2": [["LS", "RS"], ["LM", "LCM", "RCM", "RM"], ["LB", "LCB", "RCB", "RB"], ["GK"]],
  "4-2-3-1": [["ST"], ["LAM", "CAM", "RAM"], ["LDM", "RDM"], ["LB", "LCB", "RCB", "RB"], ["GK"]],
  "3-5-2": [["LS", "RS"], ["LWB", "LCM", "CDM", "RCM", "RWB"], ["LCB", "CB", "RCB"], ["GK"]],
  "3-4-3": [["LW", "ST", "RW"], ["LM", "LCM", "RCM", "RM"], ["LCB", "CB", "RCB"], ["GK"]],
  "5-3-2": [["LS", "RS"], ["LCM", "CDM", "RCM"], ["LWB", "LCB", "CB", "RCB", "RWB"], ["GK"]],
};

interface RoleMeta { group: GroupId; side?: "L" | "R"; fallback: GroupId[] }
const ROLE_META: Record<string, RoleMeta> = {
  GK: { group: "Porteros", fallback: [] },
  CB: { group: "Centrales", fallback: ["Medios"] },
  LCB: { group: "Centrales", fallback: ["Laterales", "Medios"] },
  RCB: { group: "Centrales", fallback: ["Laterales", "Medios"] },
  LB: { group: "Laterales", side: "L", fallback: ["Centrales"] },
  RB: { group: "Laterales", side: "R", fallback: ["Centrales"] },
  LWB: { group: "Laterales", side: "L", fallback: ["Extremos"] },
  RWB: { group: "Laterales", side: "R", fallback: ["Extremos"] },
  CDM: { group: "Medios", fallback: ["Centrales", "Mediapuntas"] },
  LDM: { group: "Medios", fallback: ["Mediapuntas"] },
  RDM: { group: "Medios", fallback: ["Mediapuntas"] },
  LCM: { group: "Medios", fallback: ["Mediapuntas"] },
  RCM: { group: "Medios", fallback: ["Mediapuntas"] },
  CAM: { group: "Mediapuntas", fallback: ["Medios", "Extremos"] },
  LM: { group: "Extremos", side: "L", fallback: ["Mediapuntas", "Medios"] },
  RM: { group: "Extremos", side: "R", fallback: ["Mediapuntas", "Medios"] },
  LW: { group: "Extremos", side: "L", fallback: ["Delanteros", "Mediapuntas"] },
  RW: { group: "Extremos", side: "R", fallback: ["Delanteros", "Mediapuntas"] },
  LAM: { group: "Extremos", side: "L", fallback: ["Mediapuntas"] },
  RAM: { group: "Extremos", side: "R", fallback: ["Mediapuntas"] },
  ST: { group: "Delanteros", fallback: ["Extremos", "Mediapuntas"] },
  LS: { group: "Delanteros", fallback: ["Extremos", "Mediapuntas"] },
  RS: { group: "Delanteros", fallback: ["Extremos", "Mediapuntas"] },
};

/* ─────────────────────────── Mi 11 ─────────────────────────── */

/** Jugadoras por posición (la primera es la titular) */
const TEAM_SLOT_MAX = 5;
const TEAM_STORAGE_KEY = "herscout.builder.myTeam.v1";
const NOTES_STORAGE_KEY = "herscout.builder.notes.v1";
const SAVES_STORAGE_KEY = "herscout.builder.saves.v1";
const UI_STORAGE_KEY = "herscout.builder.ui.v1";
/** Arrastrar una jugadora del 11: reordenar o llevarla a otra posición */
const TEAM_DRAG_TYPE = "application/x-herscout-team";

// Tamaño de diseño de cada posición (se escala para que el campo se vea entero)
const STARTER_W = 136;
const STARTER_H = 194;
const LIST_W = 280;
const LIST_ROW_H = 48;
const LIST_H = TEAM_SLOT_MAX * LIST_ROW_H + 12;

type ViewMode = "starters" | "lists";
type ZoneId = "all" | "def" | "mid" | "att" | GroupId;
const ZONES: { id: ZoneId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "def", label: "Defence" },
  { id: "mid", label: "Midfield" },
  { id: "att", label: "Attack" },
];
/** Zona de una línea del sistema (las líneas van de ataque a portería) */
const lineZone = (li: number, n: number): "gk" | "def" | "mid" | "att" =>
  li === n - 1 ? "gk" : li === n - 2 ? "def" : li === 0 ? "att" : "mid";

/** 11 Builder guardado: sistema, las 5 de cada posición y anotaciones */
interface SavedTeam {
  id: string;
  name: string;
  savedAt: string;
  formation: FormationKey;
  team: MyTeam;
  notes: Record<string, string>;
}

const readStore = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const writeStore = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};
const fmtSaveDate = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

interface TeamPlayer {
  id: string;
  name: string;
  matchName?: string;
  photoUrl?: string | null;
  teamName?: string;
  teamId?: string | null;
  badgeUrl?: string | null;
  country?: string | null;
  position?: string;
  leagueName?: string | null;
  leagueLogoUrl?: string | null;
  notaGlobal?: number | null;
}
/**
 * Por rol ("LCB", "ST"...). Un rol sin clave sigue a los filtros (se rellena solo);
 * en cuanto se edita, su lista pasa a ser tuya. Se conserva al cambiar de sistema si el rol sigue existiendo.
 */
type MyTeam = Record<string, TeamPlayer[]>;

const toTeamPlayer = (p: any): TeamPlayer => ({
  id: p.id, name: p.name, matchName: p.matchName, photoUrl: p.photoUrl, teamName: p.teamName, teamId: p.teamId ?? null,
  badgeUrl: p.badgeUrl, country: p.country ?? null, position: p.position, leagueName: p.leagueName ?? null,
  leagueLogoUrl: p.leagueLogoUrl ?? null, notaGlobal: p.notaGlobal ?? null,
});

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fmtRating = (v: number | null | undefined) => (v == null ? "—" : String(Math.round(v)));

/** Añadir a una posición, o sustituir a la jugadora en `replaceIndex` */
type AddTarget = { role: string; replaceIndex?: number };

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

/* ─────────────────────────── Filtros ─────────────────────────── */

type Range = [number, number];

interface FilterSet {
  leagues: string[];
  teams: string[];
  countries: string[];
  feet: string[];
  ranges: Record<string, Range>;
  /** Métricas añadidas a mano (se muestran como slider aunque no estén activas) */
  extraMetrics: string[];
  /** Orden propio de esta demarcación ("" = el global) */
  sortBy: string;
}

const emptyFilters = (): FilterSet => ({ leagues: [], teams: [], countries: [], feet: [], ranges: {}, extraMetrics: [], sortBy: "" });

const SCOPES: ScopeId[] = ["all", ...GROUPS.map((g) => g.id)];
const emptyScopes = (): Record<ScopeId, FilterSet> =>
  Object.fromEntries(SCOPES.map((s) => [s, emptyFilters()])) as Record<ScopeId, FilterSet>;

const FEET = [
  { id: "right", label: "Right" },
  { id: "left", label: "Left" },
  { id: "both", label: "Both" },
];

// Campos básicos (límites calculados a partir de los datos)
interface BasicField { key: string; label: string; unit?: string; step: number; get: (p: any) => number | null; color: string; format?: (v: number) => string }
const fmtMoney = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}M€` : `${v}k€`);
const BASIC_FIELDS: BasicField[] = [
  { key: "age", label: "Age", unit: "years", step: 1, get: (p) => p._age, color: "#38bdf8" },
  { key: "height", label: "Height", unit: "cm", step: 1, get: (p) => p.height || null, color: "#a78bfa" },
  { key: "weight", label: "Weight", unit: "kg", step: 1, get: (p) => p.weight || null, color: "#a78bfa" },
  { key: "minutes", label: "Minutes played", step: 50, get: (p) => p.minutesPlayed ?? null, color: "#22d3ee" },
  { key: "matches", label: "Matches played", step: 1, get: (p) => p.matchesPlayed ?? null, color: "#22d3ee" },
  { key: "marketValue", label: "Market value", step: 5, get: (p) => p._mv, color: "#facc15", format: fmtMoney },
];
const BASIC_BY_KEY = Object.fromEntries(BASIC_FIELDS.map((f) => [f.key, f]));

// Notas 0-100 que vienen en /api/players
const NOTE_FIELD: Record<string, string> = {
  nota_global: "notaGlobal",
  nota_ataque: "notaAtaque",
  nota_construccion: "notaConstruccion",
  nota_defensa: "notaDefensa",
  nota_balon_parado: "notaBalonParado",
  nota_disponibilidad: "notaDisponibilidad",
  nota_fisico: "notaFisico",
};
const isRemoteKey = (k: string) => !BASIC_BY_KEY[k] && !NOTE_FIELD[k];

// Lo que sí se aplica a porteras desde la pestaña "Todas" (el resto son métricas de campo)
const AVAILABILITY = METRICS_HIERARCHY.find((c) => c.id === "disponibilidad")!;
const GK_SAFE_KEYS = new Set<string>([
  ...BASIC_FIELDS.map((f) => f.key), "nota_global", "nota_disponibilidad", "nota_fisico",
  ...AVAILABILITY.subcategories.flatMap((s) => [`_sub_${s.id}`, ...s.metrics.map((m) => m.key)]),
]);

const hierarchyForScope = (scope: ScopeId): CategoryDef[] => (scope === "Porteros" ? GOALKEEPER_HIERARCHY : METRICS_HIERARCHY);

// Etiqueta de cualquier clave (para chips y selects)
const LABELS: Record<string, string> = (() => {
  const out: Record<string, string> = { nota_global: "Overall rating", nota_fisico: "Physical (EA)" };
  BASIC_FIELDS.forEach((f) => (out[f.key] = f.label));
  for (const [h, gk] of [[METRICS_HIERARCHY, false], [GOALKEEPER_HIERARCHY, true]] as const) {
    for (const c of h) {
      if (!gk || !out[c.noteKey]) out[c.noteKey] = c.name;
      for (const s of c.subcategories) {
        out[`_sub_${s.id}`] = s.name;
        for (const m of s.metrics) out[m.key] = m.name;
      }
    }
  }
  return out;
})();

const STORAGE_KEY = "builder_filters_v2";
const BENCH_SIZE = 4;

function activeCount(f: FilterSet): number {
  return (
    (f.leagues.length ? 1 : 0) + (f.teams.length ? 1 : 0) + (f.countries.length ? 1 : 0) + (f.feet.length ? 1 : 0) +
    Object.keys(f.ranges).length + (f.sortBy ? 1 : 0)
  );
}

/* ─────────────────────────── Página ─────────────────────────── */

function BuilderContent() {
  const [formation, setFormation] = useState<FormationKey>("4-3-3");
  const [metricSort, setMetricSort] = useState<string>("nota_global");
  const [scopes, setScopes] = useState<Record<ScopeId, FilterSet>>(emptyScopes);
  const [activeScope, setActiveScope] = useState<ScopeId>("all");
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  const [leagueOptions, setLeagueOptions] = useState<{ id: string; name: string; country?: string | null }[]>([]);
  const [teamOptions, setTeamOptions] = useState<{ id: string; name: string; badgeUrl?: string | null }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  /** Ficha rápida (con `role` si se abre desde una posición del 11) */
  const [selected, setSelected] = useState<{ player: any; role?: string } | null>(null);
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [view, setView] = useState<ViewMode>("starters");
  const [zone, setZone] = useState<ZoneId>("all");
  const [myTeam, setMyTeam] = useState<MyTeam>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saves, setSaves] = useState<SavedTeam[]>([]);
  const [currentSaveId, setCurrentSaveId] = useState<string | null>(null);
  const [saveDialog, setSaveDialog] = useState(false);
  const [gamesOpen, setGamesOpen] = useState(false);
  const [roleDialog, setRoleDialog] = useState<string | null>(null);
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);
  const isWide = useMediaQuery("(min-width: 1024px)");
  const teamLoaded = useRef(false);

  // Equipo en curso, anotaciones, 11 guardados y vista se guardan en este navegador
  useEffect(() => {
    setMyTeam(readStore<MyTeam>(TEAM_STORAGE_KEY, {}));
    setNotes(readStore<Record<string, string>>(NOTES_STORAGE_KEY, {}));
    setSaves(readStore<SavedTeam[]>(SAVES_STORAGE_KEY, []));
    const ui = readStore<{ view?: ViewMode; zone?: ZoneId; filtersOpen?: boolean }>(UI_STORAGE_KEY, {});
    if (ui.view === "starters" || ui.view === "lists") setView(ui.view);
    if (ui.zone) setZone(ui.zone);
    if (ui.filtersOpen === false) setFiltersOpen(false);
    teamLoaded.current = true;
  }, []);
  useEffect(() => {
    if (teamLoaded.current) writeStore(TEAM_STORAGE_KEY, myTeam);
  }, [myTeam]);
  useEffect(() => {
    if (teamLoaded.current) writeStore(NOTES_STORAGE_KEY, notes);
  }, [notes]);
  useEffect(() => {
    if (teamLoaded.current) writeStore(SAVES_STORAGE_KEY, saves);
  }, [saves]);
  useEffect(() => {
    if (teamLoaded.current) writeStore(UI_STORAGE_KEY, { view, zone, filtersOpen });
  }, [view, zone, filtersOpen]);

  const setNote = (id: string, text: string) =>
    setNotes((prev) => {
      const next = { ...prev };
      if (text.trim()) next[id] = text;
      else delete next[id];
      return next;
    });

  // Notas de subcategorías/métricas cargadas bajo demanda: clave → jugadora → nota
  const [remote, setRemote] = useState<Record<string, Record<string, number | null>>>({});
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());
  const requested = useRef<Set<string>>(new Set());

  // Restaurar filtros guardados
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.formation && FORMATIONS[saved.formation as FormationKey]) setFormation(saved.formation);
      if (saved.metricSort) setMetricSort(saved.metricSort);
      if (saved.scopes) setScopes({ ...emptyScopes(), ...saved.scopes });
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ formation, metricSort, scopes }));
    } catch {}
  }, [formation, metricSort, scopes]);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const res = await fetch("/api/players?season=all");
        const json = await res.json();
        const now = Date.now();
        const list = (json.players || []).map((p: any) => ({
          ...p,
          _age: p.birthDate ? Math.floor((now - new Date(p.birthDate).getTime()) / (365.25 * 24 * 3600 * 1000)) : null,
          _mv: p.marketValue ? Math.round(Number(p.marketValue) / 1000) : null,
        }));
        setAllPlayers(list);
        const rawLeagues = (json.filters?.leaguesDetailed || []).map((l: any) => ({
          id: l.name,
          name: l.name,
          country: l.country || guessLeagueCountry(l.name),
        }));
        setLeagueOptions(sortLeaguesByCountryAndTier(rawLeagues));
        setTeamOptions((json.filters?.teamsDetailed || []).map((t: any) => ({ id: t.name, name: t.name, badgeUrl: t.badgeUrl })));
      } catch (err) {
        console.error("Failed to fetch players for 11 Builder", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  // Límites de cada campo básico según los datos
  const bounds = useMemo(() => {
    const out: Record<string, Range> = {};
    for (const f of BASIC_FIELDS) {
      let lo = Infinity, hi = -Infinity;
      for (const p of allPlayers) {
        const v = f.get(p);
        if (v == null || !Number.isFinite(v)) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
      out[f.key] = [Math.floor(lo / f.step) * f.step, Math.ceil(hi / f.step) * f.step];
    }
    return out;
  }, [allPlayers]);

  const boundsFor = (key: string): Range => bounds[key] || [0, 100];

  // Recuento por opción (para los desplegables)
  const counts = useMemo(() => {
    const leagues: Record<string, number> = {}, teams: Record<string, number> = {}, countries: Record<string, number> = {};
    for (const p of allPlayers) {
      if (p.leagueName) leagues[p.leagueName] = (leagues[p.leagueName] || 0) + 1;
      if (p.teamName) teams[p.teamName] = (teams[p.teamName] || 0) + 1;
      if (p.country) countries[p.country] = (countries[p.country] || 0) + 1;
    }
    return { leagues, teams, countries };
  }, [allPlayers]);

  const leagueOpts = useMemo(() => leagueOptions.map((o) => ({ ...o, count: counts.leagues[o.name] || 0 })), [leagueOptions, counts]);
  const teamOpts = useMemo(() => teamOptions.map((o) => ({ ...o, count: counts.teams[o.name] || 0 })), [teamOptions, counts]);
  const countryOpts = useMemo(
    () => Object.keys(counts.countries).sort().map((c) => ({ id: c, name: c, country: c, count: counts.countries[c] })),
    [counts]
  );

  // Claves remotas necesarias (filtros activos + órdenes) → se piden las que falten
  const neededKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const s of SCOPES) {
      Object.keys(scopes[s].ranges).forEach((k) => isRemoteKey(k) && keys.add(k));
      if (scopes[s].sortBy && isRemoteKey(scopes[s].sortBy)) keys.add(scopes[s].sortBy);
    }
    if (isRemoteKey(metricSort)) keys.add(metricSort);
    return Array.from(keys);
  }, [scopes, metricSort]);

  useEffect(() => {
    const missing = neededKeys.filter((k) => !requested.current.has(k));
    if (missing.length === 0) return;
    missing.forEach((k) => requested.current.add(k));
    setLoadingKeys((prev) => new Set([...Array.from(prev), ...missing]));
    (async () => {
      try {
        const res = await fetch(`/api/builder/metrics?keys=${encodeURIComponent(missing.join(","))}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const next: Record<string, Record<string, number | null>> = {};
        (json.keys as string[]).forEach((k, i) => {
          const col: Record<string, number | null> = {};
          for (const [pid, row] of Object.entries(json.players as Record<string, (number | null)[]>)) col[pid] = row[i];
          next[k] = col;
        });
        setRemote((prev) => ({ ...prev, ...next }));
      } catch (err) {
        console.error("Failed to load builder metrics", err);
        missing.forEach((k) => requested.current.delete(k));
      } finally {
        setLoadingKeys((prev) => {
          const n = new Set(prev);
          missing.forEach((k) => n.delete(k));
          return n;
        });
      }
    })();
  }, [neededKeys]);

  const getVal = (p: any, key: string): number | null => {
    const basic = BASIC_BY_KEY[key];
    if (basic) return basic.get(p);
    const nf = NOTE_FIELD[key];
    if (nf) return p[nf] ?? null;
    const col = remote[key];
    return col ? col[p.id] ?? null : null;
  };

  // ¿Pasa la jugadora un conjunto de filtros para un puesto del grupo `slotGroup`?
  const passes = (p: any, f: FilterSet, slotGroup: GroupId, isGlobal: boolean): boolean => {
    if (f.leagues.length) {
      const pl = (p.leagueName || "").toLowerCase();
      if (!f.leagues.some((l) => pl === l.toLowerCase() || pl.includes(l.toLowerCase()))) return false;
    }
    if (f.teams.length && !f.teams.includes(p.teamName)) return false;
    if (f.countries.length && !f.countries.includes(p.country)) return false;
    if (f.feet.length && !f.feet.includes(p.preferredFoot)) return false;
    for (const [key, [lo, hi]] of Object.entries(f.ranges)) {
      // Desde "Todas", las métricas de campo no se aplican a porteras (tienen las suyas)
      if (isGlobal && slotGroup === "Porteros" && !GK_SAFE_KEYS.has(key)) continue;
      if (isRemoteKey(key) && !remote[key]) continue; // aún cargando
      const v = getVal(p, key);
      if (v == null || v < lo || v > hi) return false;
    }
    return true;
  };

  // Candidatas por grupo de puesto, ordenadas por la métrica de ese grupo
  const candidatesByGroup = useMemo(() => {
    const out = {} as Record<GroupId, any[]>;
    for (const g of GROUPS) {
      const sortKey = scopes[g.id].sortBy || metricSort;
      const list = allPlayers.filter((p) => passes(p, scopes.all, g.id, true) && passes(p, scopes[g.id], g.id, false));
      list.sort((a, b) => (getVal(b, sortKey) ?? -Infinity) - (getVal(a, sortKey) ?? -Infinity));
      out[g.id] = list;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPlayers, scopes, metricSort, remote]);

  const globalCount = useMemo(
    () => allPlayers.filter((p) => passes(p, scopes.all, (p.grupoDemarcacion as GroupId) || "Medios", true)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allPlayers, scopes.all, remote]
  );
  /* ───── El 11: 5 jugadoras por posición ───── */
  const roles = useMemo(() => FORMATIONS[formation].flat(), [formation]);
  const playersById = useMemo(() => new Map(allPlayers.map((p) => [p.id, p])), [allPlayers]);
  const allByRating = useMemo(
    () => [...allPlayers].sort((a, b) => (b.notaGlobal ?? -Infinity) - (a.notaGlobal ?? -Infinity)),
    [allPlayers]
  );

  // Posiciones que siguen a los filtros: titular y 4 alternativas. La titular se elige por pasadas
  // (1. demarcación y lado, 2. misma demarcación, 3. afines) y las demás por rondas, para que no se
  // repitan entre posiciones (dos centrales → cada una con las suyas) ni con las listas ya editadas.
  const autoTeam = useMemo(() => {
    const used = new Set<string>();
    roles.forEach((r) => myTeam[r]?.forEach((p) => used.add(p.id)));
    const slots = roles.filter((r) => !myTeam[r]).map((role) => ({ role, meta: ROLE_META[role] }));
    const out: Record<string, any[]> = Object.fromEntries(slots.map((s) => [s.role, []]));
    const sideOk = (p: any, side?: "L" | "R") =>
      !side || (side === "L" ? /izquierd/i.test(p.position || "") : /derech/i.test(p.position || ""));
    const pick = (pool: any[], filter: (p: any) => boolean) => pool.find((p) => !used.has(p.id) && filter(p)) || null;
    const choosers: ((s: (typeof slots)[number]) => any | null)[] = [
      (s) => pick(candidatesByGroup[s.meta.group], (p) => p.grupoDemarcacion === s.meta.group && sideOk(p, s.meta.side)),
      (s) => pick(candidatesByGroup[s.meta.group], (p) => p.grupoDemarcacion === s.meta.group),
      (s) => {
        for (const g of s.meta.fallback) {
          const found = pick(candidatesByGroup[s.meta.group], (p) => p.grupoDemarcacion === g);
          if (found) return found;
        }
        return null;
      },
    ];
    for (const choose of choosers) {
      for (const s of slots) {
        if (out[s.role].length) continue;
        const p = choose(s);
        if (p) {
          used.add(p.id);
          out[s.role].push(p);
        }
      }
    }
    for (let round = 1; round < TEAM_SLOT_MAX; round++) {
      for (const s of slots) {
        if (out[s.role].length !== round) continue;
        for (const choose of choosers) {
          const p = choose(s);
          if (p) {
            used.add(p.id);
            out[s.role].push(p);
            break;
          }
        }
      }
    }
    return out;
  }, [roles, myTeam, candidatesByGroup]);

  // Lo que se ve: tu lista si la has editado, si no la de los filtros (con los datos al día de cada jugadora)
  const team = useMemo(() => {
    const out: Record<string, any[]> = {};
    for (const r of roles) out[r] = myTeam[r] ? myTeam[r].map((p) => playersById.get(p.id) || p) : autoTeam[r] || [];
    return out;
  }, [roles, myTeam, autoTeam, playersById]);

  const squadOvr = useMemo(() => {
    const vals = roles.map((r) => team[r][0]?.notaGlobal).filter((v) => v != null) as number[];
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : "—";
  }, [roles, team]);
  const teamCount = useMemo(() => new Set(roles.flatMap((r) => team[r].map((p) => p.id))).size, [roles, team]);
  const customCount = roles.filter((r) => myTeam[r]).length;
  /** Posiciones del 11 en las que está cada jugadora */
  const rolesOf = useMemo(() => {
    const m = new Map<string, string[]>();
    roles.forEach((r) => team[r].forEach((p) => m.set(p.id, [...(m.get(p.id) || []), r])));
    return m;
  }, [roles, team]);

  /* ───── Editar el 11 ───── */
  // Al tocar una posición que sigue a los filtros, su lista actual pasa a ser tuya
  const baseList = (prev: MyTeam, role: string) => prev[role] ?? (autoTeam[role] || []).map(toTeamPlayer);
  const editRole = (role: string, fn: (list: TeamPlayer[]) => TeamPlayer[]) =>
    setMyTeam((prev) => ({ ...prev, [role]: fn([...baseList(prev, role)]).slice(0, TEAM_SLOT_MAX) }));
  const addToRole = (role: string, p: any) =>
    editRole(role, (list) => (list.some((x) => x.id === p.id) || list.length >= TEAM_SLOT_MAX ? list : [...list, toTeamPlayer(p)]));
  const replaceInRole = (role: string, index: number, p: any) =>
    editRole(role, (list) => {
      if (list.some((x, i) => x.id === p.id && i !== index)) return list;
      list[index] = toTeamPlayer(p);
      return list;
    });
  const removeFromRole = (role: string, id: string) => editRole(role, (list) => list.filter((x) => x.id !== id));
  const moveInRole = (role: string, id: string, toIndex: number) =>
    editRole(role, (list) => {
      const from = list.findIndex((x) => x.id === id);
      if (from < 0) return list;
      const [item] = list.splice(from, 1);
      list.splice(Math.max(0, Math.min(toIndex, list.length)), 0, item);
      return list;
    });
  // Soltar en otra posición: sale de la suya y entra en `index` (si la lista está llena, cae la última)
  const dropInRole = (to: string, from: string, id: string, index: number) => {
    if (from === to) return moveInRole(to, id, index);
    if ((team[to] || []).some((x) => x.id === id)) return;
    const p = (team[from] || []).find((x) => x.id === id);
    if (!p) return;
    setMyTeam((prev) => {
      const toList = [...baseList(prev, to)];
      toList.splice(Math.min(index, toList.length), 0, toTeamPlayer(p));
      return { ...prev, [from]: baseList(prev, from).filter((x) => x.id !== id), [to]: toList.slice(0, TEAM_SLOT_MAX) };
    });
  };
  const resetRole = (role: string) =>
    setMyTeam((prev) => {
      const next = { ...prev };
      delete next[role];
      return next;
    });
  const rebuildFromFilters = () => {
    if (customCount && !window.confirm("Replace every position with the players picked by the filters?")) return;
    setMyTeam((prev) => {
      const next = { ...prev };
      roles.forEach((r) => delete next[r]);
      return next;
    });
  };
  const clearAll = () => {
    if (!window.confirm("Empty every position of the 11?")) return;
    setMyTeam((prev) => ({ ...prev, ...Object.fromEntries(roles.map((r) => [r, []])) }));
  };

  /* ───── 11 guardados ───── */
  const currentSave = saves.find((g) => g.id === currentSaveId) || null;
  const saveGame = (name: string, asNew: boolean) => {
    const snapshot: MyTeam = Object.fromEntries(roles.map((r) => [r, team[r].map(toTeamPlayer)]));
    const game: SavedTeam = {
      id: !asNew && currentSave ? currentSave.id : `g${Date.now()}`,
      name: name.trim() || `Team ${fmtSaveDate(new Date().toISOString())}`,
      savedAt: new Date().toISOString(),
      formation,
      team: snapshot,
      notes,
    };
    setSaves((prev) => [game, ...prev.filter((g) => g.id !== game.id)]);
    // Lo guardado deja de cambiar con los filtros
    setMyTeam((prev) => ({ ...prev, ...snapshot }));
    setCurrentSaveId(game.id);
    setSaveDialog(false);
  };
  const loadGame = (g: SavedTeam) => {
    setFormation(g.formation);
    setMyTeam(g.team);
    setNotes(g.notes || {});
    setCurrentSaveId(g.id);
    setGamesOpen(false);
  };
  const deleteGame = (id: string) => {
    setSaves((prev) => prev.filter((g) => g.id !== id));
    if (currentSaveId === id) setCurrentSaveId(null);
  };
  const newGame = () => {
    if (customCount && !window.confirm("Start a new 11 from the current filters? Unsaved changes will be lost.")) return;
    setMyTeam({});
    setNotes({});
    setCurrentSaveId(null);
  };

  /** Alternativas para una posición: las que pasan los filtros, primero las de su demarcación */
  const suggestedFor = (role: string) => {
    const meta = ROLE_META[role];
    const pool = candidatesByGroup[meta.group] || [];
    return [meta.group, ...meta.fallback].flatMap((g) => pool.filter((p) => p.grupoDemarcacion === g));
  };


  /* ───── Actualizar filtros ───── */
  const updateScope = (scope: ScopeId, patch: Partial<FilterSet>) =>
    setScopes((prev) => ({ ...prev, [scope]: { ...prev[scope], ...patch } }));

  const setRange = (scope: ScopeId, key: string, value: Range | null) =>
    setScopes((prev) => {
      const ranges = { ...prev[scope].ranges };
      if (value) ranges[key] = value;
      else delete ranges[key];
      return { ...prev, [scope]: { ...prev[scope], ranges } };
    });

  const addMetric = (scope: ScopeId, key: string) =>
    setScopes((prev) =>
      prev[scope].extraMetrics.includes(key)
        ? prev
        : { ...prev, [scope]: { ...prev[scope], extraMetrics: [...prev[scope].extraMetrics, key] } }
    );

  const removeMetric = (scope: ScopeId, key: string) =>
    setScopes((prev) => {
      const ranges = { ...prev[scope].ranges };
      delete ranges[key];
      return { ...prev, [scope]: { ...prev[scope], ranges, extraMetrics: prev[scope].extraMetrics.filter((k) => k !== key) } };
    });

  const totalActive = SCOPES.reduce((n, s) => n + activeCount(scopes[s]), 0);
  const f = scopes[activeScope];
  const scopeColor = activeScope === "all" ? "#10b981" : GROUP_BY_ID[activeScope].color;

  // Chips de filtros activos (todas las pestañas)
  const chips = SCOPES.flatMap((s) => {
    const fs = scopes[s];
    const tag = s === "all" ? "All" : GROUP_BY_ID[s].label;
    const color = s === "all" ? "#10b981" : GROUP_BY_ID[s].color;
    const out: { id: string; scope: ScopeId; tag: string; color: string; text: string; clear: () => void }[] = [];
    if (fs.leagues.length) out.push({ id: `${s}-lg`, scope: s, tag, color, text: fs.leagues.length === 1 ? fs.leagues[0] : `${fs.leagues.length} leagues`, clear: () => updateScope(s, { leagues: [] }) });
    if (fs.teams.length) out.push({ id: `${s}-tm`, scope: s, tag, color, text: fs.teams.length === 1 ? fs.teams[0] : `${fs.teams.length} teams`, clear: () => updateScope(s, { teams: [] }) });
    if (fs.countries.length) out.push({ id: `${s}-ct`, scope: s, tag, color, text: fs.countries.length === 1 ? fs.countries[0] : `${fs.countries.length} countries`, clear: () => updateScope(s, { countries: [] }) });
    if (fs.feet.length) out.push({ id: `${s}-ft`, scope: s, tag, color, text: fs.feet.map((x) => FEET.find((y) => y.id === x)?.label).join(" / "), clear: () => updateScope(s, { feet: [] }) });
    for (const [k, [lo, hi]] of Object.entries(fs.ranges)) {
      const basic = BASIC_BY_KEY[k];
      const fmt = basic?.format || ((v: number) => String(v));
      const [bLo, bHi] = basic ? boundsFor(k) : [0, 100];
      const text = lo > bLo && hi < bHi ? `${fmt(lo)}–${fmt(hi)}` : lo > bLo ? `≥ ${fmt(lo)}` : `≤ ${fmt(hi)}`;
      out.push({ id: `${s}-${k}`, scope: s, tag, color, text: `${LABELS[k] || k} ${text}`, clear: () => setRange(s, k, null) });
    }
    if (fs.sortBy) out.push({ id: `${s}-sort`, scope: s, tag, color, text: `Sort: ${LABELS[fs.sortBy] || fs.sortBy}`, clear: () => updateScope(s, { sortBy: "" }) });
    return out;
  });

  /* ───── Render ───── */
  const filtersPanel = (
    <div className="w-full h-full min-h-0 bg-[#0b1322]/95 border border-white/10 rounded-2xl shadow-xl overflow-hidden flex flex-col">
      {/* Pestañas de alcance */}
      <div className="p-3 border-b border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
            <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
            Filters
            {totalActive > 0 && (
              <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 text-[10px] tabular-nums">{totalActive}</span>
            )}
          </div>
          {totalActive > 0 && (
            <button onClick={() => setScopes(emptyScopes())} className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold flex items-center gap-1">
              <RotateCcw className="w-3 h-3" /> Reset all
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SCOPES.map((s) => {
            const g = s === "all" ? null : GROUP_BY_ID[s];
            const n = activeCount(scopes[s]);
            const on = activeScope === s;
            const color = g?.color || "#10b981";
            return (
              <button
                key={s}
                onClick={() => setActiveScope(s)}
                className={`relative h-7 px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border transition-all ${
                  on ? "text-white shadow-lg" : "text-slate-400 border-white/5 bg-black/20 hover:text-slate-200 hover:border-white/15"
                }`}
                style={on ? { borderColor: `${color}80`, background: `${color}22`, boxShadow: `0 0 18px ${color}25` } : undefined}
                title={g ? `Filters for ${g.label} only` : "Filters for all positions"}
              >
                {g ? <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} /> : <Layers className="w-3 h-3" />}
                {g ? g.short : "All"}
                {n > 0 && (
                  <span className="min-w-[16px] h-4 px-1 rounded-full text-[9px] flex items-center justify-center text-gray-950" style={{ background: color }}>
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-2.5 flex items-start gap-1.5 text-[10.5px] text-slate-400 leading-snug">
          <Info className="w-3 h-3 mt-0.5 shrink-0" style={{ color: scopeColor }} />
          {activeScope === "all" ? (
            <span>Applied to <b className="text-slate-200">all positions</b>. Outfield metrics don't affect goalkeepers. <span className="text-slate-300 tabular-nums">{globalCount}</span> candidates.</span>
          ) : (
            <span>
              Only for <b style={{ color: scopeColor }}>{GROUP_BY_ID[activeScope].label}</b>, on top of the “All” filters.{" "}
              <span className="text-slate-300 tabular-nums">{candidatesByGroup[activeScope]?.filter((p) => p.grupoDemarcacion === activeScope).length ?? 0}</span> candidates.
            </span>
          )}
        </div>
      </div>

      <div className="overflow-y-auto p-3 space-y-4 flex-1">
        {/* Orden propio */}
        {activeScope !== "all" && (
          <Section title="Sort this position by">
            <MetricSelect
              value={f.sortBy}
              onChange={(v) => updateScope(activeScope, { sortBy: v })}
              scope={activeScope}
              allowInherit
              loading={loadingKeys.has(f.sortBy)}
            />
          </Section>
        )}

        <Section title="Competition & profile">
          <div className="grid grid-cols-1 gap-2">
            <MultiSelectFilter label="Leagues" placeholder="All leagues" options={leagueOpts} selectedIds={f.leagues} onChange={(v) => updateScope(activeScope, { leagues: v })} showFlag />
            <MultiSelectFilter label="Teams" placeholder="All teams" options={teamOpts} selectedIds={f.teams} onChange={(v) => updateScope(activeScope, { teams: v })} />
            <MultiSelectFilter label="Nationality" placeholder="All nations" options={countryOpts} selectedIds={f.countries} onChange={(v) => updateScope(activeScope, { countries: v })} showFlag />
            <div>
              <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider block mb-1">Preferred foot</span>
              <div className="grid grid-cols-3 gap-1.5">
                {FEET.map((ft) => {
                  const on = f.feet.includes(ft.id);
                  return (
                    <button
                      key={ft.id}
                      onClick={() => updateScope(activeScope, { feet: on ? f.feet.filter((x) => x !== ft.id) : [...f.feet, ft.id] })}
                      className={`h-8 rounded-lg text-[11px] font-semibold border transition-all ${
                        on ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-300" : "bg-black/20 border-white/10 text-slate-400 hover:text-white hover:border-white/20"
                      }`}
                    >
                      {ft.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Section>

        <Section title="Physical & playing data">
          <div className="space-y-1.5">
            {BASIC_FIELDS.map((bf) => {
              const [lo, hi] = boundsFor(bf.key);
              return (
                <RangeSlider
                  key={bf.key}
                  label={bf.unit ? `${bf.label} (${bf.unit})` : bf.label}
                  min={lo}
                  max={hi}
                  step={bf.step}
                  value={f.ranges[bf.key] || null}
                  onChange={(v) => setRange(activeScope, bf.key, v)}
                  format={bf.format}
                  color={bf.color}
                />
              );
            })}
          </div>
        </Section>

        <Section title="Performance (ratings 0–100)">
          <div className="space-y-1.5">
            <RangeSlider label="Overall rating" min={0} max={100} value={f.ranges.nota_global || null} onChange={(v) => setRange(activeScope, "nota_global", v)} color="#fbbf24" />
            <RangeSlider label="Physical (EA)" min={0} max={100} value={f.ranges.nota_fisico || null} onChange={(v) => setRange(activeScope, "nota_fisico", v)} color="#fb923c" />
          </div>
          <div className="mt-2 space-y-2">
            {hierarchyForScope(activeScope).map((cat) => (
              <CategoryBlock
                key={cat.id}
                cat={cat}
                filters={f}
                loadingKeys={loadingKeys}
                onRange={(k, v) => setRange(activeScope, k, v)}
                onAddMetric={(k) => addMetric(activeScope, k)}
                onRemoveMetric={(k) => removeMetric(activeScope, k)}
                dimmed={activeScope === "all" && cat.id !== "disponibilidad" ? "Does not apply to goalkeepers" : undefined}
              />
            ))}
          </div>
        </Section>

        {activeCount(f) > 0 && (
          <button
            onClick={() => setScopes((prev) => ({ ...prev, [activeScope]: emptyFilters() }))}
            className="w-full h-8 rounded-lg border border-white/10 text-[11px] text-slate-300 hover:text-white hover:border-white/25 flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-3 h-3" /> Clear {activeScope === "all" ? "“All”" : GROUP_BY_ID[activeScope].label} filters
          </button>
        )}
      </div>
    </div>
  );

  /* ───── Campo ───── */
  const lines = FORMATIONS[formation];
  const groupsInFormation = GROUPS.filter((g) => roles.some((r) => ROLE_META[r].group === g.id));
  const zoneLines = (z: ZoneId) =>
    lines
      .map((line, li) =>
        line.filter((r) =>
          z === "all" ? true : z === "def" || z === "mid" || z === "att" ? lineZone(li, lines.length) === z : ROLE_META[r].group === z
        )
      )
      .filter((l) => l.length);
  // Si la demarcación elegida no está en este sistema, se ve todo
  const shownZone: ZoneId = zoneLines(zone).length ? zone : "all";
  const visibleLines = zoneLines(shownZone);

  const openFiltersFor = (group: GroupId) => {
    setActiveScope(group);
    setFiltersOpen(true);
    setShowFiltersMobile(true);
  };

  const slotFor = (role: string) => {
    const group = ROLE_META[role].group;
    const common = {
      role,
      color: GROUP_BY_ID[group].color,
      list: team[role] || [],
      auto: !myTeam[role],
      notes,
      onOpenPlayer: (p: any) => setSelected({ player: p, role }),
      onAdd: () => setAddTarget({ role }),
      onNoCandidates: () => openFiltersFor(group),
      onDropPlayer: (from: string, id: string, index: number) => dropInRole(role, from, id, index),
    };
    return view === "starters" ? (
      <EmptyPitchSlot key={role} w={STARTER_W} h={STARTER_H}>
        <StarterSlot {...common} onEdit={() => setRoleDialog(role)} />
      </EmptyPitchSlot>
    ) : (
      <EmptyPitchSlot key={role} w={LIST_W} h={LIST_H}>
        <RoleList
          {...common}
          onMove={(id, i) => moveInRole(role, id, i)}
          onRemove={(id) => removeFromRole(role, id)}
          onReplace={(i) => setAddTarget({ role, replaceIndex: i })}
          onReset={() => resetRole(role)}
        />
      </EmptyPitchSlot>
    );
  };

  const sortKeyFor = (role: string) => scopes[ROLE_META[role].group].sortBy || metricSort;

  return (
    <div className="text-white flex flex-col lg:flex-row gap-3 min-h-full lg:h-full lg:min-h-0">
      {/* Filtros (escritorio): panel lateral que se pliega para ver el campo entero */}
      <aside className={`hidden lg:flex relative shrink-0 min-h-0 ${filtersOpen ? "w-[330px]" : "w-10"}`}>
        {filtersOpen ? (
          <>
            {filtersPanel}
            <button
              onClick={() => setFiltersOpen(false)}
              className="absolute -right-3.5 top-1/2 -translate-y-1/2 z-30 w-7 h-16 rounded-full border border-white/15 bg-[#0b1322] text-slate-300 hover:text-white hover:border-emerald-400/60 flex items-center justify-center shadow-xl"
              title="Hide filters"
              aria-label="Hide filters"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </>
        ) : (
          <button
            onClick={() => setFiltersOpen(true)}
            className="w-10 h-full rounded-2xl border border-white/10 bg-[#0b1322]/90 hover:border-emerald-400/50 flex flex-col items-center gap-3 py-3 text-slate-300 hover:text-white transition-colors"
            title="Show filters"
            aria-label="Show filters"
          >
            <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
            <span className="[writing-mode:vertical-rl] rotate-180 text-[11px] font-bold uppercase tracking-[0.2em]">Filters</span>
            {totalActive > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-gray-950 text-[10px] font-black flex items-center justify-center">
                {totalActive}
              </span>
            )}
            <ChevronRight className="w-4 h-4 mt-auto" />
          </button>
        )}
      </aside>

      {/* Filtros (móvil): cajón lateral */}
      {showFiltersMobile && createPortal(
        <div className="lg:hidden fixed inset-0 z-[60] flex">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowFiltersMobile(false)} />
          <div className="relative w-[86%] max-w-[360px] h-full p-2 flex">
            {filtersPanel}
            <button
              onClick={() => setShowFiltersMobile(false)}
              className="absolute top-3 -right-10 w-8 h-8 rounded-full bg-[#0b1322] border border-white/15 text-slate-200 flex items-center justify-center"
              aria-label="Close filters"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* El campograma: 100×60 en horizontal (pantallas anchas), 60×100 en vertical (móvil) */}
      <section className="flex-1 min-w-0 lg:min-h-0 lg:h-full">
        {/* Móvil: lo justo encima del campo; el resto de controles va debajo */}
        <div className="lg:hidden flex items-center gap-2 mb-2">
          <Trophy className="w-5 h-5 text-emerald-400" />
          <span className="text-base font-extrabold tracking-tight">{formation}</span>
          <div className="flex rounded-lg border border-white/10 bg-black/30 p-0.5 ml-auto">
            {([["starters", "Nº 1"], ["lists", "Top 5"]] as const).map(([id, text]) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`h-7 px-2.5 rounded-md text-[11px] font-bold ${view === id ? "bg-white/15 text-white" : "text-slate-400"}`}
              >
                {text}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowFiltersMobile(true)}
            className="h-8 px-2.5 rounded-lg border border-white/10 bg-black/20 text-[11px] font-bold flex items-center gap-1.5"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" /> Filters{totalActive ? ` (${totalActive})` : ""}
          </button>
        </div>
        {isLoading ? (
          <div className="min-h-[400px] h-full flex items-center justify-center">
            <LoadingState message="Building the ideal XI and placing the best players..." />
          </div>
        ) : (
          <StadiumPitch
            orientation={isWide ? "horizontal" : "vertical"}
            fit={isWide}
            focus={shownZone !== "all"}
            slotW={view === "starters" ? STARTER_W : LIST_W}
            slotH={view === "starters" ? STARTER_H : LIST_H}
            minScale={isWide ? 0.4 : view === "lists" ? 0.8 : 0.42}
            maxScale={1.5}
            lines={visibleLines.map((line) => line.map(slotFor))}
          />
        )}
      </section>

      {/* Columna derecha: sistema, vista, qué parte del 11 se ve, criterio y 11 guardados */}
      <aside className="shrink-0 lg:w-[290px] lg:h-full lg:min-h-0 lg:overflow-y-auto flex flex-col gap-2.5 bg-[#0b1322]/85 border border-white/10 rounded-2xl p-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-emerald-400" />
          <h1 className="text-lg font-extrabold tracking-tight leading-none whitespace-nowrap">11 BUILDER</h1>
          <button
            onClick={() => setShowFiltersMobile(true)}
            className="lg:hidden ml-auto h-8 px-2.5 rounded-lg border border-white/10 bg-black/20 text-[11px] font-bold flex items-center gap-1.5"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" /> Filters{totalActive ? ` (${totalActive})` : ""}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <MiniStat label="Avg rating" value={squadOvr} className="text-amber-400" />
          <MiniStat label="Players" value={teamCount} className="text-sky-400" />
        </div>

        <ColumnSection title="System">
          <div className="grid grid-cols-3 gap-1">
            {(Object.keys(FORMATIONS) as FormationKey[]).map((fk) => (
              <button
                key={fk}
                onClick={() => setFormation(fk)}
                className={`h-8 rounded-lg text-xs font-black tabular-nums border transition-all ${
                  formation === fk
                    ? "bg-emerald-500 text-gray-950 border-emerald-400 shadow-lg shadow-emerald-500/20"
                    : "bg-black/20 text-slate-300 border-white/10 hover:border-emerald-500/40 hover:text-white"
                }`}
              >
                {fk}
              </button>
            ))}
          </div>
        </ColumnSection>

        <ColumnSection title="View">
          <div className="grid grid-cols-2 rounded-lg border border-white/10 bg-black/30 p-0.5" role="tablist" aria-label="View">
            {([
              ["starters", <LayoutGrid key="i" className="w-3.5 h-3.5" />, "Nº 1 only"],
              ["lists", <ListOrdered key="i" className="w-3.5 h-3.5" />, "Top 5 lists"],
            ] as const).map(([id, icon, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={view === id}
                onClick={() => setView(id)}
                title={id === "starters" ? "Only the nº 1 of each position" : "The 5 players of each position"}
                className={`h-7 rounded-md text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors ${
                  view === id ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                {icon} {label}
              </button>
            ))}
          </div>
        </ColumnSection>

        <ColumnSection title="Show">
          <div className="grid grid-cols-4 gap-1">
            {ZONES.map((z) => (
              <ZoneButton key={z.id} on={shownZone === z.id} onClick={() => setZone(z.id)} label={z.label} />
            ))}
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {groupsInFormation.map((g) => (
              <ZoneButton key={g.id} on={shownZone === g.id} onClick={() => setZone(g.id)} label={g.short} color={g.color} title={g.label} />
            ))}
          </div>
        </ColumnSection>

        <ColumnSection title="Pick by">
          <MetricSelect value={metricSort} onChange={setMetricSort} scope="all" loading={loadingKeys.has(metricSort)} />
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {chips.map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1.5 h-6 pl-1 pr-1.5 rounded-full text-[10.5px] bg-white/[0.04] border border-white/10 text-slate-200 max-w-full"
                >
                  <button
                    onClick={() => { setActiveScope(c.scope); setFiltersOpen(true); setShowFiltersMobile(true); }}
                    className="px-1.5 h-4 rounded-full text-[9px] font-bold text-gray-950 shrink-0"
                    style={{ background: c.color }}
                    title="Go to tab"
                  >
                    {c.tag}
                  </button>
                  <span className="truncate">{c.text}</span>
                  <button onClick={c.clear} className="text-slate-500 hover:text-white shrink-0" aria-label="Remove filter">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </ColumnSection>

        <ColumnSection title="My 11">
          <div
            className="text-xs font-bold text-white truncate"
            title={currentSave ? `Saved ${fmtSaveDate(currentSave.savedAt)}` : "Not saved yet"}
          >
            {currentSave ? currentSave.name : "Unsaved 11"}
            <span className="block text-[10px] font-normal text-slate-500">
              {currentSave ? `Saved ${fmtSaveDate(currentSave.savedAt)}` : "Not saved yet"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 mt-1.5">
            <HeaderButton onClick={() => setSaveDialog(true)} icon={<Save className="w-3.5 h-3.5" />} label="Save" primary />
            <HeaderButton
              onClick={() => setGamesOpen((v) => !v)}
              icon={<FolderOpen className="w-3.5 h-3.5" />}
              label={`Saved${saves.length ? ` (${saves.length})` : ""}`}
              active={gamesOpen}
            />
            <HeaderButton onClick={newGame} icon={<FilePlus2 className="w-3.5 h-3.5" />} label="New" />
            <HeaderButton onClick={rebuildFromFilters} icon={<Wand2 className="w-3.5 h-3.5" />} label="From filters" />
            <HeaderButton onClick={clearAll} icon={<Eraser className="w-3.5 h-3.5" />} label="Empty" />
          </div>
          {gamesOpen && (
            <GamesPanel saves={saves} currentId={currentSaveId} onLoad={loadGame} onDelete={deleteGame} onClose={() => setGamesOpen(false)} />
          )}
          <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-snug text-slate-500">
            <span className="px-1 rounded text-[8px] font-black uppercase bg-sky-500/20 text-sky-300 shrink-0">Auto</span>
            Follows the filters. Edit a position (order, replace, remove) to make it yours.
          </p>
        </ColumnSection>
      </aside>

      {/* Posición del 11 (vista de titulares): sus 5 jugadoras */}
      {roleDialog && team[roleDialog] && (
        <Modal onClose={() => setRoleDialog(null)} className="max-w-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-black uppercase" style={{ color: GROUP_BY_ID[ROLE_META[roleDialog].group].color }}>
              {roleDialog}
            </span>
            <span className="text-xs text-slate-400">{GROUP_BY_ID[ROLE_META[roleDialog].group].label}</span>
            <button onClick={() => setRoleDialog(null)} className="ml-auto p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-slate-500 mb-3">
            Nº 1 is the starter. Drag or use the arrows to reorder, click a name to add notes.
          </p>
          <div style={{ height: LIST_H }}>
            <RoleList
              role={roleDialog}
              color={GROUP_BY_ID[ROLE_META[roleDialog].group].color}
              list={team[roleDialog]}
              auto={!myTeam[roleDialog]}
              notes={notes}
              actionsAlways
              onOpenPlayer={(p) => setSelected({ player: p, role: roleDialog })}
              onAdd={() => setAddTarget({ role: roleDialog })}
              onNoCandidates={() => { setRoleDialog(null); openFiltersFor(ROLE_META[roleDialog].group); }}
              onDropPlayer={(from, id, i) => dropInRole(roleDialog, from, id, i)}
              onMove={(id, i) => moveInRole(roleDialog, id, i)}
              onRemove={(id) => removeFromRole(roleDialog, id)}
              onReplace={(i) => setAddTarget({ role: roleDialog, replaceIndex: i })}
              onReset={() => resetRole(roleDialog)}
            />
          </div>
        </Modal>
      )}

      {/* Añadir o sustituir una jugadora */}
      {addTarget && team[addTarget.role] && (
        <AddPlayerDialog
          role={addTarget.role}
          color={GROUP_BY_ID[ROLE_META[addTarget.role].group].color}
          replacing={addTarget.replaceIndex != null ? team[addTarget.role][addTarget.replaceIndex] : undefined}
          current={team[addTarget.role]}
          suggested={suggestedFor(addTarget.role)}
          allPlayers={allByRating}
          rolesOf={rolesOf}
          sortLabel={LABELS[sortKeyFor(addTarget.role)] || sortKeyFor(addTarget.role)}
          valueOf={(p) => getVal(p, sortKeyFor(addTarget.role))}
          format={BASIC_BY_KEY[sortKeyFor(addTarget.role)]?.format}
          onPick={(p) => {
            if (addTarget.replaceIndex != null) replaceInRole(addTarget.role, addTarget.replaceIndex, p);
            else addToRole(addTarget.role, p);
            setAddTarget(null);
          }}
          onClose={() => setAddTarget(null)}
        />
      )}

      {/* Ficha rápida: notas y, si viene de una posición, orden / sustituir / quitar */}
      {selected && (() => {
        const sp = selected.player;
        const role = selected.role;
        const list = role ? team[role] || [] : [];
        const idx = role ? list.findIndex((x) => x.id === sp.id) : -1;
        const roleColor = role ? GROUP_BY_ID[ROLE_META[role].group].color : "#10b981";
        return (
          <Modal onClose={() => setSelected(null)} className="max-w-lg p-5 sm:p-6 flex flex-col sm:flex-row items-center gap-5 max-h-[92dvh] overflow-y-auto">
            <button onClick={() => setSelected(null)} className="absolute top-3 right-3 p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
            <div className="shrink-0">
              <CromoJugador
                j={{
                  name: sp.name,
                  photo_url: sp.photoUrl,
                  country: sp.country,
                  team_id: sp.teamId,
                  team_name: sp.teamName,
                  badge_url: sp.badgeUrl,
                  league_name: sp.leagueName,
                  league_logo_url: sp.leagueLogoUrl,
                  demarcacion: sp.position,
                  score_general: sp.notaGlobal,
                  trend: sp.trend,
                }}
                size="md"
              />
            </div>
            <div className="w-full flex-1 space-y-3">
              <div className="pr-6">
                <h3 className="text-xl font-black text-white">{sp.name}</h3>
                <p className="text-xs text-slate-400">{[sp.teamName, sp.leagueName].filter(Boolean).join(" • ")}</p>
              </div>
              {role && idx >= 0 && (
                <div className="rounded-lg border p-2" style={{ borderColor: `${roleColor}44`, background: `${roleColor}0f` }}>
                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1.5">
                    <span style={{ color: roleColor }}>{role}</span> · {idx === 0 ? "Starter" : `Nº ${idx + 1}`} of {list.length}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {idx > 0 && <SmallButton onClick={() => moveInRole(role, sp.id, 0)} icon={<Crown className="w-3 h-3" />} label="Make starter" />}
                    {idx > 0 && <SmallButton onClick={() => moveInRole(role, sp.id, idx - 1)} icon={<ChevronUp className="w-3 h-3" />} label="Up" />}
                    {idx < list.length - 1 && (
                      <SmallButton onClick={() => moveInRole(role, sp.id, idx + 1)} icon={<ChevronDown className="w-3 h-3" />} label="Down" />
                    )}
                    <SmallButton
                      onClick={() => { setSelected(null); setAddTarget({ role, replaceIndex: idx }); }}
                      icon={<Replace className="w-3 h-3" />}
                      label="Replace"
                    />
                    <SmallButton
                      onClick={() => { removeFromRole(role, sp.id); setSelected(null); }}
                      icon={<Trash2 className="w-3 h-3" />}
                      label="Remove"
                      danger
                    />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  ["Attack", sp.notaAtaque, "text-emerald-400"],
                  ["Build-Up", sp.notaConstruccion, "text-sky-400"],
                  ["Defense", sp.notaDefensa, "text-indigo-400"],
                  ["Physical EA", sp.notaFisico, "text-amber-400"],
                ].map(([label, v, cls]) => (
                  <div key={label as string} className="p-2 rounded bg-white/5 border border-white/5">
                    <span className="text-[10px] text-slate-400 block uppercase">{label}</span>
                    <span className={`text-base font-bold ${cls}`}>{v != null ? Number(v).toFixed(1) : "—"}</span>
                  </div>
                ))}
              </div>
              {metricSort !== "nota_global" && (
                <p className="text-[11px] text-slate-400">
                  {LABELS[metricSort] || metricSort}: <b className="text-white">{getVal(sp, metricSort)?.toFixed(1) ?? "—"}</b>
                </p>
              )}
              <label className="block">
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                  <StickyNote className="w-3 h-3" /> Notes
                </span>
                <textarea
                  value={notes[sp.id] || ""}
                  onChange={(e) => setNote(sp.id, e.target.value)}
                  placeholder="Your notes on this player (saved with the 11)"
                  rows={3}
                  className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 focus:border-amber-400/60 outline-none p-2 text-xs text-slate-100 placeholder:text-slate-500 resize-y"
                />
              </label>
              <Link
                href={`/players/${sp.id}`}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold text-xs transition-colors shadow-lg shadow-emerald-500/20"
              >
                <Eye className="w-4 h-4" />
                <span>View Full Scouting Dossier</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </Modal>
        );
      })()}
      {saveDialog && (
        <SaveDialog
          current={currentSave}
          defaultName={currentSave?.name || `11 ${new Date().toLocaleDateString("en-GB")}`}
          onSave={saveGame}
          onClose={() => setSaveDialog(false)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── Piezas ─────────────────────────── */

function Modal({ onClose, className = "", children }: { onClose: () => void; className?: string; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Portal: por encima de la barra de navegación
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in-0 duration-150"
      onClick={onClose}
    >
      <div
        className={`relative w-full rounded-2xl border border-white/15 bg-[#0a1224] shadow-2xl ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

function HeaderButton({
  onClick, icon, label, active, primary,
}: { onClick: () => void; icon: React.ReactNode; label: string; active?: boolean; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`w-full inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-lg border text-[11px] font-semibold transition-colors ${
        primary
          ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
          : active
          ? "border-emerald-400/50 text-emerald-300 bg-emerald-500/10"
          : "border-white/10 bg-black/20 text-slate-300 hover:text-white hover:border-white/25"
      }`}
    >
      {icon} <span className="truncate">{label}</span>
    </button>
  );
}

function ColumnSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-2.5 border-t border-white/10">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 mb-1.5">{title}</div>
      {children}
    </div>
  );
}

function MiniStat({ label, value, className }: { label: string; value: React.ReactNode; className: string }) {
  return (
    <div className="rounded-lg bg-black/25 border border-white/5 px-2.5 py-1.5">
      <span className="text-[9px] uppercase font-bold text-slate-500 block">{label}</span>
      <span className={`text-lg font-black tabular-nums leading-tight ${className}`}>{value}</span>
    </div>
  );
}

function SmallButton({ onClick, icon, label, danger }: { onClick: () => void; icon: React.ReactNode; label: string; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 h-7 px-2 rounded-md border text-[11px] font-semibold transition-colors ${
        danger
          ? "border-rose-400/30 text-rose-300 hover:bg-rose-500/15"
          : "border-white/10 text-slate-200 hover:text-white hover:border-white/30 bg-black/20"
      }`}
    >
      {icon} {label}
    </button>
  );
}

function ZoneButton({ on, onClick, label, color, title }: { on: boolean; onClick: () => void; label: string; color?: string; title?: string }) {
  const c = color || "#10b981";
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={`h-7 px-2 rounded-lg text-[11px] font-bold border flex items-center justify-center gap-1.5 transition-all ${
        on ? "text-white" : "text-slate-400 border-white/10 bg-black/20 hover:text-white hover:border-white/20"
      }`}
      style={on ? { borderColor: `${c}99`, background: `${c}26` } : undefined}
    >
      {color && <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />}
      {label}
    </button>
  );
}

function Avatar({ p, size }: { p: any; size: number }) {
  return (
    <div
      className="rounded-full overflow-hidden bg-white/5 border border-white/15 shrink-0 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {p.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.photoUrl} alt="" className="w-full h-full object-cover object-top" loading="lazy" />
      ) : (
        <span className="font-bold text-slate-500" style={{ fontSize: size * 0.42 }}>
          {(p.matchName || p.name || "?").slice(0, 1)}
        </span>
      )}
    </div>
  );
}

const readTeamDrag = (e: React.DragEvent): { role: string; id: string } | null => {
  try {
    return JSON.parse(e.dataTransfer.getData(TEAM_DRAG_TYPE));
  } catch {
    return null;
  }
};
const isTeamDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(TEAM_DRAG_TYPE);

interface SlotProps {
  role: string;
  color: string;
  list: any[];
  /** Sigue a los filtros (aún no editada) */
  auto: boolean;
  notes: Record<string, string>;
  onOpenPlayer: (p: any) => void;
  onAdd: () => void;
  onNoCandidates: () => void;
  onDropPlayer: (fromRole: string, id: string, index: number) => void;
}

/** Vista de titulares: la carta del nº 1 y, debajo, la posición con sus alternativas */
function StarterSlot({ role, color, list, auto, notes, onOpenPlayer, onAdd, onNoCandidates, onDropPlayer, onEdit }: SlotProps & { onEdit: () => void }) {
  const scale = usePitchScale();
  const [over, setOver] = useState(false);
  const starter = list[0];
  return (
    <div
      onDragOver={(e) => {
        if (!isTeamDrag(e)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const d = readTeamDrag(e);
        if (d) onDropPlayer(d.role, d.id, 0);
      }}
      className="relative w-full h-full flex flex-col items-center justify-between"
    >
      {starter ? (
        <div className="rounded-xl transition-shadow" style={over ? { boxShadow: `0 0 0 3px ${color}` } : undefined}>
          <PitchScaleContext.Provider value={1}>
            <PitchCard
              player={starter}
              assignedRole={role}
              note={notes[starter.id]}
              textScale={scale}
              onClick={() => onOpenPlayer(starter)}
              onDragStart={(e) => {
                e.dataTransfer.setData(TEAM_DRAG_TYPE, JSON.stringify({ role, id: starter.id }));
                e.dataTransfer.effectAllowed = "move";
              }}
            />
          </PitchScaleContext.Provider>
        </div>
      ) : (
        <button
          onClick={auto ? onNoCandidates : onAdd}
          className="w-[120px] h-[160px] rounded-xl border-2 border-dashed bg-black/45 backdrop-blur-sm p-2 flex flex-col items-center justify-center gap-2 text-center hover:bg-black/65 transition-colors"
          style={{ borderColor: over ? color : `${color}77` }}
        >
          <span className="text-xs font-black uppercase" style={{ color }}>{role}</span>
          <Plus className="w-5 h-5 text-slate-300" />
          <span className="text-[10px] leading-tight text-slate-400">{auto ? "No candidate matches these filters" : "Add player"}</span>
        </button>
      )}
      <button
        onClick={onEdit}
        className="w-[128px] h-[26px] rounded-lg flex items-center gap-1 px-1.5 border backdrop-blur-sm hover:brightness-125 transition"
        style={{ borderColor: `${color}77`, borderStyle: auto ? "dashed" : "solid", background: "rgba(4, 10, 20, 0.82)" }}
        title={`${role}: order, notes, replace${auto ? " · follows the filters" : ""}`}
      >
        <span className="text-[10px] font-black" style={{ color }}>{role}</span>
        <div className="flex-1 flex justify-center -space-x-1.5">
          {list.slice(1).map((p) => (
            <Avatar key={p.id} p={p} size={16} />
          ))}
        </div>
        <span className="text-[9px] font-bold tabular-nums text-slate-400">{list.length}/{TEAM_SLOT_MAX}</span>
        <ListOrdered className="w-3 h-3 text-slate-400" />
      </button>
    </div>
  );
}

/** Vista de listas: las 5 de la posición, en orden (nº 1 = titular) */
function RoleList({
  role, color, list, auto, notes, actionsAlways, onOpenPlayer, onAdd, onNoCandidates, onDropPlayer, onMove, onRemove, onReplace, onReset,
}: SlotProps & {
  actionsAlways?: boolean;
  onMove: (id: string, toIndex: number) => void;
  onRemove: (id: string) => void;
  onReplace: (index: number) => void;
  onReset: () => void;
}) {
  const [over, setOver] = useState(false);
  const full = list.length >= TEAM_SLOT_MAX;
  const drop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    const d = readTeamDrag(e);
    if (d) onDropPlayer(d.role, d.id, index);
  };

  return (
    <div
      onDragOver={(e) => {
        if (!isTeamDrag(e)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => drop(e, list.length)}
      className="w-full h-full rounded-2xl border flex overflow-hidden backdrop-blur-md transition-all duration-200 shadow-[0_18px_40px_-6px_rgba(0,0,0,0.85),0_8px_16px_-4px_rgba(0,0,0,0.7)] hover:shadow-[0_24px_48px_-4px_rgba(0,0,0,0.95)] hover:-translate-y-0.5"
      style={{
        borderColor: over ? color : `${color}66`,
        borderStyle: auto ? "dashed" : "solid",
        background: over ? `${color}2e` : "linear-gradient(180deg, rgba(11, 20, 38, 0.94) 0%, rgba(6, 12, 24, 0.96) 100%)",
      }}
    >
      {/* Lateral Bar: Big Position Label + Auto / Reset / Add status */}
      <div
        className="w-8 shrink-0 flex flex-col items-center justify-between py-2 border-r border-white/10 select-none"
        style={{ background: `${color}22` }}
      >
        <span
          className="text-[13px] font-black uppercase tracking-wider writing-mode-vertical"
          style={{ color, writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          {role}
        </span>

        <div className="flex flex-col items-center gap-1.5 mt-auto">
          {auto ? (
            <span
              className="px-1 py-0.5 rounded text-[8px] font-black uppercase bg-sky-500/25 text-sky-300 border border-sky-400/40"
              title="Auto-filled from filters"
            >
              A
            </span>
          ) : (
            <button
              onClick={onReset}
              className="text-slate-400 hover:text-sky-300 p-0.5"
              title="Back to filter picks"
              aria-label="Back to filter picks"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}

          {!full && (
            <button
              onClick={onAdd}
              className="w-5 h-5 rounded-md flex items-center justify-center text-slate-200 bg-white/10 hover:bg-white/20 border border-white/15"
              title="Add player"
            >
              <Plus className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content: 5 full rows */}
      <div className="flex-1 flex flex-col min-w-0 p-1">
        {list.length === 0 && auto ? (
          <button
            onClick={onNoCandidates}
            className="flex-1 flex flex-col items-center justify-center gap-1.5 px-3 text-center text-xs text-slate-400 hover:text-white"
          >
            <Plus className="w-4 h-4" />
            No candidate matches these filters
          </button>
        ) : (
          <ol className="flex-1 flex flex-col justify-between gap-1">
            {list.map((p, i) => (
              <li
                key={p.id}
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  e.dataTransfer.setData(TEAM_DRAG_TYPE, JSON.stringify({ role, id: p.id }));
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => isTeamDrag(e) && e.preventDefault()}
                onDrop={(e) => drop(e, i)}
                className={`group relative flex items-center gap-2.5 px-2 rounded-xl cursor-grab active:cursor-grabbing transition-all ${
                  i === 0
                    ? "bg-white/[0.14] border border-white/20 shadow-sm"
                    : "hover:bg-white/[0.08] border border-transparent hover:border-white/10"
                }`}
                style={{ height: LIST_ROW_H - 2 }}
              >
                {/* Rank number */}
                <span
                  className="w-4 text-[12px] font-black tabular-nums text-center shrink-0"
                  style={{ color: i === 0 ? color : "#94a3b8" }}
                >
                  {i + 1}
                </span>

                {/* Big face avatar */}
                <div className="relative shrink-0">
                  <Avatar p={p} size={36} />
                  {notes[p.id] && (
                    <StickyNote
                      className="absolute -top-1 -right-1 w-3.5 h-3.5 text-amber-300 drop-shadow"
                      aria-label="Has notes"
                    />
                  )}
                </div>

                {/* Player Name (FULL, uncropped) & Club */}
                <button
                  onClick={() => onOpenPlayer(p)}
                  className="min-w-0 flex-1 text-left leading-tight py-0.5"
                  title={`${p.name}${p.teamName ? ` · ${p.teamName}` : ""}${notes[p.id] ? `\n\n${notes[p.id]}` : ""}`}
                >
                  <div
                    className={`text-[13px] leading-snug ${
                      i === 0 ? "font-bold text-white tracking-tight" : "font-semibold text-slate-100"
                    }`}
                  >
                    {p.name}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10.5px] text-slate-400 min-w-0 mt-0.5">
                    <span className="truncate">{p.teamName}</span>
                  </div>
                </button>

                {/* Big Club Crest on the side */}
                <div className="shrink-0 flex items-center justify-center p-1 rounded-lg bg-white/[0.06] border border-white/10 shadow-sm">
                  <EscudoEquipo
                    badgeUrl={p.badgeUrl}
                    name={p.teamName}
                    size={28}
                  />
                </div>

                {/* Rating score */}
                <span
                  className="text-[14px] font-black tabular-nums shrink-0 min-w-[28px] text-right font-mono"
                  style={{ color }}
                >
                  {fmtRating(p.notaGlobal)}
                </span>

                {/* Quick actions popup */}
                <div
                  className={`${
                    actionsAlways ? "flex" : "hidden group-hover:flex absolute right-1.5 top-1/2 -translate-y-1/2 shadow-xl"
                  } items-center gap-0.5 rounded-lg bg-[#0a1224]/98 border border-white/25 p-0.5 shrink-0 z-30`}
                >
                  <IconButton onClick={() => onMove(p.id, i - 1)} disabled={i === 0} label="Move up">
                    <ChevronUp className="w-3.5 h-3.5" />
                  </IconButton>
                  <IconButton onClick={() => onMove(p.id, i + 1)} disabled={i === list.length - 1} label="Move down">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </IconButton>
                  <IconButton onClick={() => onReplace(i)} label="Replace">
                    <Replace className="w-3.5 h-3.5" />
                  </IconButton>
                  <IconButton onClick={() => onRemove(p.id)} label="Remove" danger>
                    <X className="w-3.5 h-3.5" />
                  </IconButton>
                </div>
              </li>
            ))}

            {/* Empty slots */}
            {Array.from({ length: TEAM_SLOT_MAX - list.length }, (_, k) => (
              <li
                key={`free-${k}`}
                onDragOver={(e) => isTeamDrag(e) && e.preventDefault()}
                onDrop={(e) => drop(e, list.length)}
                style={{ height: LIST_ROW_H - 2 }}
              >
                <button
                  onClick={onAdd}
                  className="w-full h-full flex items-center gap-2.5 px-2 rounded-xl border border-dashed border-white/15 text-xs font-semibold text-slate-400 hover:text-white hover:border-white/40 hover:bg-white/[0.05] transition-all"
                  title="Search and pick a player"
                >
                  <span className="w-4 text-[11px] font-black tabular-nums text-center text-slate-600">
                    {list.length + k + 1}
                  </span>
                  <span className="w-8 h-8 rounded-full border border-dashed border-white/20 flex items-center justify-center shrink-0">
                    <Plus className="w-3.5 h-3.5" />
                  </span>
                  <span>Add player</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function IconButton({
  onClick, label, danger, disabled, children,
}: { onClick: () => void; label: string; danger?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`w-5 h-5 rounded flex items-center justify-center transition-colors disabled:opacity-25 disabled:pointer-events-none ${
        danger ? "text-slate-400 hover:text-rose-300 hover:bg-rose-500/15" : "text-slate-300 hover:text-white hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

/** Ventana para elegir jugadora (añadir o sustituir): por nombre, por tus filtros o por toda la base de datos */
function AddPlayerDialog({
  role, color, replacing, current, suggested, allPlayers, rolesOf, sortLabel, valueOf, format, onPick, onClose,
}: {
  role: string;
  color: string;
  replacing?: any;
  current: any[];
  suggested: any[];
  allPlayers: any[];
  rolesOf: Map<string, string[]>;
  sortLabel: string;
  valueOf: (p: any) => number | null;
  format?: (v: number) => string;
  onPick: (p: any) => void;
  onClose: () => void;
}) {
  const roleGroup = ROLE_META[role].group;
  const [source, setSource] = useState<"suggested" | "all">("suggested");
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string>(roleGroup);
  const [league, setLeague] = useState("");
  const [country, setCountry] = useState("");
  const [foot, setFoot] = useState("");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [minRating, setMinRating] = useState("");
  const [sort, setSort] = useState<"metric" | "rating" | "young" | "value">("metric");
  const inRole = new Set(current.map((p) => p.id));

  // Opciones de los desplegables (de toda la base de datos)
  const options = useMemo(() => {
    const leagues = new Set<string>(), countries = new Set<string>();
    for (const p of allPlayers) {
      if (p.leagueName) leagues.add(p.leagueName);
      if (p.country) countries.add(p.country);
    }
    return { leagues: Array.from(leagues).sort(), countries: Array.from(countries).sort() };
  }, [allPlayers]);

  const filtered = useMemo(() => {
    const nq = normalize(q.trim());
    const aLo = ageMin ? Number(ageMin) : null, aHi = ageMax ? Number(ageMax) : null, rMin = minRating ? Number(minRating) : null;
    const list = (source === "suggested" ? suggested : allPlayers).filter((p) => {
      if (nq && !normalize(`${p.name} ${p.matchName || ""} ${p.teamName || ""} ${p.leagueName || ""} ${p.country || ""}`).includes(nq)) return false;
      if (group && p.grupoDemarcacion !== group) return false;
      if (league && p.leagueName !== league) return false;
      if (country && p.country !== country) return false;
      if (foot && p.preferredFoot !== foot) return false;
      if (aLo != null && (p._age == null || p._age < aLo)) return false;
      if (aHi != null && (p._age == null || p._age > aHi)) return false;
      if (rMin != null && (p.notaGlobal == null || p.notaGlobal < rMin)) return false;
      return true;
    });
    const by: Record<typeof sort, (p: any) => number> = {
      metric: (p) => valueOf(p) ?? -Infinity,
      rating: (p) => p.notaGlobal ?? -Infinity,
      young: (p) => (p._age == null ? -Infinity : -p._age),
      value: (p) => p._mv ?? -Infinity,
    };
    return [...list].sort((a, b) => by[sort](b) - by[sort](a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, q, group, league, country, foot, ageMin, ageMax, minRating, sort, suggested, allPlayers]);
  const shown = filtered.slice(0, 150);
  const fmt = (v: number | null) => (v == null ? "—" : format ? format(v) : Number.isInteger(v) ? String(v) : v.toFixed(1));
  const anyFilter = q || group !== roleGroup || league || country || foot || ageMin || ageMax || minRating;
  const reset = () => {
    setQ(""); setGroup(roleGroup); setLeague(""); setCountry(""); setFoot(""); setAgeMin(""); setAgeMax(""); setMinRating("");
  };

  const field = "h-8 w-full rounded-lg bg-black/30 border border-white/10 focus:border-emerald-400/60 outline-none px-2 text-xs text-white";
  const label = "text-[9px] font-bold uppercase tracking-wider text-slate-500 block mb-0.5";

  return (
    <Modal onClose={onClose} className="max-w-3xl flex flex-col h-[92dvh] sm:h-[86dvh] overflow-hidden">
      <div className="p-4 pb-3 border-b border-white/10 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black uppercase" style={{ color }}>{role}</span>
          <span className="text-sm font-bold text-white truncate">
            {replacing ? `Replace ${replacing.matchName || replacing.name}` : "Pick a player"}
          </span>
          <button onClick={onClose} className="ml-auto p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-2.5 pointer-events-none" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, team, league or nationality…"
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-black/30 border border-white/10 focus:border-emerald-400/60 outline-none text-sm text-white placeholder:text-slate-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {([
            ["suggested", `Matching my filters (${suggested.length})`],
            ["all", `Whole database (${allPlayers.length})`],
          ] as const).map(([id, text]) => (
            <button
              key={id}
              onClick={() => setSource(id)}
              className={`h-7 px-2.5 rounded-md text-[11px] font-bold border ${
                source === id ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200" : "border-white/10 text-slate-400 hover:text-white"
              }`}
            >
              {text}
            </button>
          ))}
          {anyFilter && (
            <button onClick={reset} className="ml-auto text-[10px] font-semibold text-rose-300 hover:text-rose-200 flex items-center gap-1">
              <RotateCcw className="w-3 h-3" /> Reset search
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <label>
            <span className={label}>Position</span>
            <select value={group} onChange={(e) => setGroup(e.target.value)} className={field}>
              <option value="">Any position</option>
              {GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </label>
          <label>
            <span className={label}>League</span>
            <select value={league} onChange={(e) => setLeague(e.target.value)} className={field}>
              <option value="">All leagues</option>
              {options.leagues.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label>
            <span className={label}>Nationality</span>
            <select value={country} onChange={(e) => setCountry(e.target.value)} className={field}>
              <option value="">All nations</option>
              {options.countries.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>
            <span className={label}>Foot</span>
            <select value={foot} onChange={(e) => setFoot(e.target.value)} className={field}>
              <option value="">Any</option>
              {FEET.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </label>
          <label>
            <span className={label}>Age</span>
            <div className="flex items-center gap-1">
              <input inputMode="numeric" value={ageMin} onChange={(e) => setAgeMin(e.target.value.replace(/\D/g, ""))} placeholder="min" className={field} />
              <span className="text-slate-500">–</span>
              <input inputMode="numeric" value={ageMax} onChange={(e) => setAgeMax(e.target.value.replace(/\D/g, ""))} placeholder="max" className={field} />
            </div>
          </label>
          <label>
            <span className={label}>Min. rating</span>
            <input inputMode="numeric" value={minRating} onChange={(e) => setMinRating(e.target.value.replace(/\D/g, ""))} placeholder="0–100" className={field} />
          </label>
          <label className="col-span-2">
            <span className={label}>Sort by</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={field}>
              <option value="metric">{sortLabel}</option>
              <option value="rating">Overall rating</option>
              <option value="young">Youngest first</option>
              <option value="value">Market value</option>
            </select>
          </label>
        </div>
      </div>

      <div className="px-4 py-1.5 text-[10px] text-slate-500 border-b border-white/5">
        {filtered.length} players{filtered.length > shown.length ? ` · showing the first ${shown.length}` : ""} · click one to put her in {role}
      </div>
      <ul className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {shown.length === 0 && <li className="px-3 py-10 text-center text-xs text-slate-500">No players found. Try the whole database or fewer filters.</li>}
        {shown.map((p) => {
          const taken = inRole.has(p.id);
          const elsewhere = (rolesOf.get(p.id) || []).filter((r) => r !== role);
          return (
            <li key={p.id}>
              <button
                disabled={taken}
                onClick={() => onPick(p)}
                className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-left hover:bg-white/[0.06] disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
              >
                <Avatar p={p} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-white truncate">{p.name}</div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-400 min-w-0">
                    {p.badgeUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.badgeUrl} alt="" className="w-3 h-3 object-contain shrink-0" loading="lazy" />
                    )}
                    <span className="truncate">{[p.teamName, p.leagueName].filter(Boolean).join(" · ")}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">
                    {[p.position, p._age != null ? `${p._age} y` : null, p.country, p._mv != null ? fmtMoney(p._mv) : null].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {taken ? (
                  <span className="text-[9px] font-bold uppercase text-slate-400">In {role}</span>
                ) : elsewhere.length ? (
                  <span className="text-[9px] font-bold uppercase text-sky-300">In {elsewhere.join(", ")}</span>
                ) : null}
                <div className="w-14 text-right leading-tight">
                  <div className="text-sm font-black tabular-nums" style={{ color }}>{fmtRating(p.notaGlobal)}</div>
                  {sort === "metric" && sortLabel !== "Overall rating" && (
                    <div className="text-[9px] tabular-nums text-slate-400">{fmt(valueOf(p))}</div>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

/** 11 Builders guardados: cargar o borrar */
function GamesPanel({
  saves, currentId, onLoad, onDelete, onClose,
}: {
  saves: SavedTeam[];
  currentId: string | null;
  onLoad: (g: SavedTeam) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const count = (g: SavedTeam) => new Set(Object.values(g.team).flat().map((p) => p.id)).size;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="relative mt-2 z-50 w-full rounded-xl border border-white/15 bg-[#0a1224]/95 backdrop-blur-xl shadow-2xl overflow-hidden">
        <div className="px-3 py-2 border-b border-white/10 text-[10px] font-black uppercase tracking-wider text-slate-300">Saved 11 Builders</div>
        {saves.length === 0 ? (
          <div className="px-3 py-5 text-center text-[11px] text-slate-500">No saved teams yet. Use “Save”.</div>
        ) : (
          <ul className="max-h-80 overflow-y-auto p-1.5 space-y-1">
            {[...saves].sort((a, b) => b.savedAt.localeCompare(a.savedAt)).map((g) => (
              <li
                key={g.id}
                className={`flex items-center gap-2 p-2 rounded-lg border ${
                  g.id === currentId ? "border-emerald-400/40 bg-emerald-500/10" : "border-transparent hover:bg-white/[0.05]"
                }`}
              >
                <button onClick={() => onLoad(g)} className="min-w-0 flex-1 text-left">
                  <div className="text-xs font-bold text-white truncate">{g.name}</div>
                  <div className="text-[10px] text-slate-400">
                    {fmtSaveDate(g.savedAt)} · {g.formation} · {count(g)} players
                    {Object.keys(g.notes || {}).length ? ` · ${Object.keys(g.notes).length} notes` : ""}
                  </div>
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Delete “${g.name}”?`)) onDelete(g.id);
                  }}
                  className="p-1 text-slate-500 hover:text-rose-300"
                  aria-label="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/** Guardar el equipo en curso: sobrescribir la partida cargada o crear una nueva */
function SaveDialog({
  current, defaultName, onSave, onClose,
}: {
  current: SavedTeam | null;
  defaultName: string;
  onSave: (name: string, asNew: boolean) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaultName);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#0a1224] p-5 shadow-2xl space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
          <Save className="w-4 h-4 text-emerald-400" /> Save team
        </h3>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSave(name, !current)}
          placeholder="Team name"
          className="w-full h-9 rounded-lg bg-black/30 border border-white/10 focus:border-emerald-400/60 outline-none px-3 text-sm text-white"
        />
        <p className="text-[10px] text-slate-500">Saved with today’s date, the system, the players and your notes.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-8 px-3 rounded-lg text-xs text-slate-300 hover:text-white">Cancel</button>
          {current && (
            <button
              onClick={() => onSave(name, true)}
              className="h-8 px-3 rounded-lg border border-white/15 text-xs font-semibold text-slate-200 hover:border-white/30"
            >
              Save as new
            </button>
          )}
          <button
            onClick={() => onSave(name, !current)}
            className="h-8 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-gray-950 text-xs font-bold"
          >
            {current ? `Update “${current.name}”` : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}


function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.12em] mb-2">{title}</h3>
      {children}
    </div>
  );
}

/** Select de métrica de orden: general, categorías, subcategorías y todas las métricas */
function MetricSelect({
  value, onChange, scope, allowInherit, loading,
}: { value: string; onChange: (v: string) => void; scope: ScopeId; allowInherit?: boolean; loading?: boolean }) {
  const hierarchy = hierarchyForScope(scope);
  return (
    <div className="relative w-full">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-8 pl-3 pr-8 rounded-lg border border-white/10 bg-navy-950/90 text-xs text-emerald-300 font-semibold focus:outline-none focus:border-emerald-500 appearance-none"
      >
        {allowInherit && <option value="" className="bg-[#0b1322] text-white">Same as global</option>}
        <optgroup label="General" className="bg-[#0b1322]">
          <option value="nota_global">Overall rating</option>
          <option value="nota_fisico">Physical (EA)</option>
          <option value="minutes">Minutes played</option>
          <option value="matches">Matches played</option>
          <option value="marketValue">Market value</option>
        </optgroup>
        <optgroup label="Categories" className="bg-[#0b1322]">
          {hierarchy.map((c) => (
            <option key={c.noteKey} value={c.noteKey}>{c.name}</option>
          ))}
        </optgroup>
        <optgroup label="Subcategories" className="bg-[#0b1322]">
          {hierarchy.flatMap((c) => c.subcategories.map((s) => (
            <option key={s.id} value={`_sub_${s.id}`}>{c.name} › {s.name}</option>
          )))}
        </optgroup>
        {hierarchy.flatMap((c) => c.subcategories.map((s) => (
          <optgroup key={`m-${c.id}-${s.id}`} label={`Metrics · ${c.name} › ${s.name}`} className="bg-[#0b1322]">
            {s.metrics.map((m) => (
              <option key={m.key} value={m.key}>{m.name}</option>
            ))}
          </optgroup>
        )))}
      </select>
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin absolute right-2.5 top-2.5 pointer-events-none" />
      ) : (
        <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-2.5 pointer-events-none" />
      )}
    </div>
  );
}

/** Bloque de una categoría: su nota, sus subcategorías y las métricas añadidas */
function CategoryBlock({
  cat, filters, loadingKeys, onRange, onAddMetric, onRemoveMetric, dimmed,
}: {
  cat: CategoryDef;
  filters: FilterSet;
  loadingKeys: Set<string>;
  onRange: (key: string, v: Range | null) => void;
  onAddMetric: (key: string) => void;
  onRemoveMetric: (key: string) => void;
  dimmed?: string;
}) {
  const subKeys = cat.subcategories.map((s) => `_sub_${s.id}`);
  const metricKeys = new Set(cat.subcategories.flatMap((s) => s.metrics.map((m) => m.key)));
  const shownMetrics = Array.from(new Set([
    ...filters.extraMetrics.filter((k) => metricKeys.has(k)),
    ...Object.keys(filters.ranges).filter((k) => metricKeys.has(k)),
  ]));
  const active = [cat.noteKey, ...subKeys, ...Array.from(metricKeys)].filter((k) => filters.ranges[k]).length;
  const [open, setOpen] = useState(active > 0);
  const [picker, setPicker] = useState(false);
  const [q, setQ] = useState("");

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 overflow-hidden" style={{ borderLeft: `3px solid ${cat.color}` }}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/[0.03]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white">{cat.name}</span>
          {active > 0 && (
            <span className="px-1.5 h-4 rounded-full text-[9px] font-bold flex items-center text-gray-950" style={{ background: cat.color }}>{active}</span>
          )}
          {dimmed && <span className="text-[9px] text-slate-500" title={dimmed}>· outfield</span>}
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-2.5 pb-2.5 space-y-1.5">
          <RangeSlider label={`${cat.name} (category)`} min={0} max={100} value={filters.ranges[cat.noteKey] || null} onChange={(v) => onRange(cat.noteKey, v)} color={cat.color} compact />
          <div className="pl-2 border-l border-white/10 space-y-1.5">
            {cat.subcategories.map((s) => {
              const key = `_sub_${s.id}`;
              return (
                <RangeSlider
                  key={key}
                  label={`${s.name}${loadingKeys.has(key) ? " …" : ""}`}
                  min={0}
                  max={100}
                  value={filters.ranges[key] || null}
                  onChange={(v) => onRange(key, v)}
                  color={cat.color}
                  compact
                />
              );
            })}
            {shownMetrics.map((k) => (
              <RangeSlider
                key={k}
                label={`${LABELS[k] || k}${loadingKeys.has(k) ? " …" : ""}`}
                hint="Metric rating 0–100 (compared with her position and league)"
                min={0}
                max={100}
                value={filters.ranges[k] || null}
                onChange={(v) => onRange(k, v)}
                onRemove={() => onRemoveMetric(k)}
                color={cat.color}
                compact
              />
            ))}
          </div>

          <div className="relative">
            <button
              onClick={() => setPicker((v) => !v)}
              className="w-full h-7 rounded-lg border border-dashed border-white/15 text-[10.5px] text-slate-400 hover:text-white hover:border-white/30 flex items-center justify-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add {cat.name} metric
            </button>
            {picker && (
              <div className="absolute z-40 left-0 right-0 mt-1 rounded-xl border border-white/15 bg-[#0a1224]/95 backdrop-blur-xl shadow-2xl overflow-hidden">
                <div className="p-2 border-b border-white/10">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2 pointer-events-none" />
                    <input
                      autoFocus
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Search metric…"
                      className="w-full h-7 pl-8 pr-2 bg-black/40 border border-white/10 rounded-md text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto p-1.5">
                  {cat.subcategories.map((s) => {
                    const ms = s.metrics.filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()));
                    if (!ms.length) return null;
                    return (
                      <div key={s.id} className="mb-1">
                        <div className="px-2 pt-1 pb-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">{s.name}</div>
                        {ms.map((m) => {
                          const added = shownMetrics.includes(m.key);
                          return (
                            <button
                              key={m.key}
                              disabled={added}
                              onClick={() => { onAddMetric(m.key); setPicker(false); setQ(""); }}
                              className={`w-full text-left px-2 py-1 rounded-md text-xs ${added ? "text-slate-600" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
                            >
                              {m.name}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BuilderPage() {
  return (
    <Suspense fallback={<LoadingState message="Loading 11 Builder..." />}>
      <BuilderContent />
    </Suspense>
  );
}
