"use client";

import React, { useEffect, useState, useMemo, useRef, Suspense } from "react";
import Link from "next/link";
import { StadiumPitch, EmptyPitchSlot } from "@/components/builder/StadiumPitch";
import { PitchCard } from "@/components/builder/PitchCard";
import { MultiSelectFilter } from "@/components/builder/MultiSelectFilter";
import { RangeSlider } from "@/components/builder/RangeSlider";
import { CromoJugador } from "@/components/scouting/CromoJugador";
import { LoadingState } from "@/components/ui/StatusStates";
import {
  SlidersHorizontal, Trophy, X, ChevronRight, ChevronDown, Eye, Plus, Search, Loader2, RotateCcw, Layers, Info,
} from "lucide-react";
import { METRICS_HIERARCHY, GOALKEEPER_HIERARCHY, CategoryDef } from "@/lib/metricsHierarchy";
import { guessLeagueCountry } from "@/lib/leagueCountry";

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
  const [selectedPlayerModal, setSelectedPlayerModal] = useState<any | null>(null);
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);

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
        setLeagueOptions(
          (json.filters?.leaguesDetailed || []).map((l: any) => ({
            id: l.name, name: l.name, country: l.country || guessLeagueCountry(l.name),
          }))
        );
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

  // Mejor 11: 1) demarcación y lado preferidos, 2) misma demarcación, 3) demarcaciones afines
  const bestEleven = useMemo(() => {
    const lines = FORMATIONS[formation];
    const used = new Set<string>();
    const result: (any | null)[][] = lines.map((l) => l.map(() => null));
    const slots = lines.flatMap((line, li) => line.map((role, si) => ({ li, si, role, meta: ROLE_META[role] })));
    const sideOk = (p: any, side?: "L" | "R") =>
      !side || (side === "L" ? /izquierd/i.test(p.position || "") : /derech/i.test(p.position || ""));
    const pick = (pool: any[], filter: (p: any) => boolean) => pool.find((p) => !used.has(p.id) && filter(p)) || null;

    const passesList: ((s: (typeof slots)[number]) => any | null)[] = [
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
    for (const choose of passesList) {
      for (const s of slots) {
        if (result[s.li][s.si]) continue;
        const p = choose(s);
        if (p) {
          used.add(p.id);
          result[s.li][s.si] = p;
        }
      }
    }

    // Banquillo: las 4 siguientes de cada puesto, repartidas por rondas para que no se repitan entre
    // puestos de la misma demarcación (dos centrales → cada una con sus propias suplentes)
    const bench: any[][][] = lines.map((l) => l.map(() => []));
    for (let round = 0; round < BENCH_SIZE; round++) {
      for (const s of slots) {
        for (const choose of passesList) {
          const p = choose(s);
          if (p) {
            used.add(p.id);
            bench[s.li][s.si].push(p);
            break;
          }
        }
      }
    }

    return lines.map((line, li) =>
      line.map((role, si) => ({ role, meta: ROLE_META[role], player: result[li][si], bench: bench[li][si] }))
    );
  }, [formation, candidatesByGroup]);

  const squadOvr = useMemo(() => {
    const vals = bestEleven.flat().map((s) => s.player?.notaGlobal).filter((v) => v != null) as number[];
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : "—";
  }, [bestEleven]);

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
    <div className="bg-[#0b1322]/95 border border-white/10 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[calc(100vh-7rem)]">
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
            <span>Applied to <b className="text-slate-200">all positions</b>. Outfield metrics don't affect goalkeepers.</span>
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

  return (
    <div className="min-h-screen bg-[#070b14] text-white p-4 md:p-6">
      {/* Cabecera */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white flex items-center gap-2">
              11 BUILDER
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">ELITE TACTICAL</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">The best XI for your system, with global and per-position filters.</p>
          </div>
        </div>

        <div className="flex items-stretch gap-0 bg-navy-950/80 border border-white/10 rounded-xl shadow-lg divide-x divide-white/10">
          <Stat label="Formation" value={formation} className="text-emerald-400" />
          <Stat label="Avg rating" value={squadOvr} className="text-amber-400" />
          <Stat label="Candidates" value={globalCount} className="text-sky-400" />
          <Stat label="Filters" value={totalActive} className="text-fuchsia-400" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)] gap-5 items-start">
        {/* Panel de filtros */}
        <aside className="lg:sticky lg:top-4">
          <button
            onClick={() => setShowFiltersMobile((v) => !v)}
            className="lg:hidden w-full mb-3 h-10 rounded-xl border border-white/10 bg-[#0b1322] text-xs font-bold flex items-center justify-center gap-2"
          >
            <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
            {showFiltersMobile ? "Hide filters" : `Show filters${totalActive ? ` (${totalActive})` : ""}`}
          </button>
          <div className={`${showFiltersMobile ? "block" : "hidden"} lg:block`}>{filtersPanel}</div>
        </aside>

        {/* Campo */}
        <section className="space-y-3 min-w-0">
          <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between bg-[#0b1322]/80 border border-white/10 rounded-2xl p-3">
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(FORMATIONS) as FormationKey[]).map((fk) => (
                <button
                  key={fk}
                  onClick={() => setFormation(fk)}
                  className={`h-8 px-3 rounded-lg text-xs font-black tabular-nums border transition-all ${
                    formation === fk
                      ? "bg-emerald-500 text-gray-950 border-emerald-400 shadow-lg shadow-emerald-500/20"
                      : "bg-black/20 text-slate-300 border-white/10 hover:border-emerald-500/40 hover:text-white"
                  }`}
                >
                  {fk}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 md:w-80">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Pick by</span>
              <MetricSelect value={metricSort} onChange={setMetricSort} scope="all" loading={loadingKeys.has(metricSort)} />
            </div>
          </div>

          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1.5 h-6 pl-1 pr-1.5 rounded-full text-[10.5px] bg-white/[0.04] border border-white/10 text-slate-200"
                >
                  <button
                    onClick={() => setActiveScope(c.scope)}
                    className="px-1.5 h-4 rounded-full text-[9px] font-bold text-gray-950"
                    style={{ background: c.color }}
                    title="Go to tab"
                  >
                    {c.tag}
                  </button>
                  {c.text}
                  <button onClick={c.clear} className="text-slate-500 hover:text-white" aria-label="Remove filter">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {isLoading ? (
            <div className="min-h-[500px] flex items-center justify-center">
              <LoadingState message="Building the ideal XI and placing the best players..." />
            </div>
          ) : (
            <StadiumPitch maxPerLine={Math.max(1, ...bestEleven.map((line) => line.length))}>
              {bestEleven.map((line, lineIndex) => (
                <div key={`line-${lineIndex}`} className="w-full flex items-center justify-around sm:px-6 my-1 sm:my-2">
                  {line.map(({ role, meta, player, bench }, slotIndex) => {
                    const g = GROUP_BY_ID[meta.group];
                    if (!player) {
                      return (
                        <EmptyPitchSlot key={`empty-${lineIndex}-${slotIndex}`}>
                        <button
                          onClick={() => { setActiveScope(meta.group); setShowFiltersMobile(true); }}
                          className="flex flex-col items-center justify-center w-24 h-36 rounded-xl border-2 border-dashed bg-black/40 backdrop-blur-sm p-2 text-center hover:bg-black/60 transition-colors"
                          style={{ borderColor: `${g.color}66` }}
                        >
                          <span className="text-[11px] font-black uppercase" style={{ color: g.color }}>{role}</span>
                          <span className="text-[10px] text-slate-400 mt-2">No candidate matches these filters</span>
                          <span className="text-[9px] text-slate-500 mt-1 underline">Adjust {g.label}</span>
                        </button>
                        </EmptyPitchSlot>
                      );
                    }
                    const sortKey = scopes[meta.group].sortBy || metricSort;
                    return (
                      <SlotWithBench
                        key={player.id}
                        role={role}
                        color={g.color}
                        bench={bench}
                        sortLabel={LABELS[sortKey] || sortKey}
                        valueOf={(p) => getVal(p, sortKey)}
                        format={BASIC_BY_KEY[sortKey]?.format}
                        below={lineIndex < bestEleven.length / 2}
                        align={slotIndex === 0 ? "left" : slotIndex === line.length - 1 ? "right" : "center"}
                        onSelect={setSelectedPlayerModal}
                      >
                        <PitchCard assignedRole={role} player={player} onClick={() => setSelectedPlayerModal(player)} />
                      </SlotWithBench>
                    );
                  })}
                </div>
              ))}
            </StadiumPitch>
          )}
        </section>
      </div>

      {/* Ficha rápida */}
      {selectedPlayerModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in-0 duration-150"
          onClick={() => setSelectedPlayerModal(null)}
        >
          <div
            className="relative w-full max-w-lg bg-[#0a1224] border border-white/20 rounded-2xl p-6 shadow-2xl flex flex-col md:flex-row items-center gap-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => setSelectedPlayerModal(null)} className="absolute top-4 right-4 p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10">
              <X className="w-5 h-5" />
            </button>
            <div className="shrink-0">
              <CromoJugador
                j={{
                  name: selectedPlayerModal.name,
                  photo_url: selectedPlayerModal.photoUrl,
                  country: selectedPlayerModal.country,
                  team_id: selectedPlayerModal.teamId,
                  team_name: selectedPlayerModal.teamName,
                  badge_url: selectedPlayerModal.badgeUrl,
                  league_name: selectedPlayerModal.leagueName,
                  league_logo_url: selectedPlayerModal.leagueLogoUrl,
                  demarcacion: selectedPlayerModal.position,
                  score_general: selectedPlayerModal.notaGlobal,
                  trend: selectedPlayerModal.trend,
                }}
                size="md"
              />
            </div>
            <div className="w-full flex-1 space-y-3">
              <div>
                <h3 className="text-xl font-black text-white">{selectedPlayerModal.name}</h3>
                <p className="text-xs text-slate-400">{selectedPlayerModal.teamName} • {selectedPlayerModal.leagueName}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  ["Attack", selectedPlayerModal.notaAtaque, "text-emerald-400"],
                  ["Build-Up", selectedPlayerModal.notaConstruccion, "text-sky-400"],
                  ["Defense", selectedPlayerModal.notaDefensa, "text-indigo-400"],
                  ["Physical EA", selectedPlayerModal.notaFisico, "text-amber-400"],
                ].map(([label, v, cls]) => (
                  <div key={label as string} className="p-2 rounded bg-white/5 border border-white/5">
                    <span className="text-[10px] text-slate-400 block uppercase">{label}</span>
                    <span className={`text-base font-bold ${cls}`}>{v != null ? Number(v).toFixed(1) : "—"}</span>
                  </div>
                ))}
              </div>
              {metricSort !== "nota_global" && (
                <p className="text-[11px] text-slate-400">
                  {LABELS[metricSort] || metricSort}:{" "}
                  <b className="text-white">{getVal(selectedPlayerModal, metricSort)?.toFixed(1) ?? "—"}</b>
                </p>
              )}
              <Link
                href={`/players/${selectedPlayerModal.id}`}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold text-xs transition-colors shadow-lg shadow-emerald-500/20"
              >
                <Eye className="w-4 h-4" />
                <span>View Full Scouting Dossier</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Piezas ─────────────────────────── */

/** Titular del campo; al pasar el ratón muestra las suplentes de ese puesto */
function SlotWithBench({
  children, role, color, bench, sortLabel, valueOf, format, below, align, onSelect,
}: {
  children: React.ReactNode;
  role: string;
  color: string;
  bench: any[];
  sortLabel: string;
  valueOf: (p: any) => number | null;
  format?: (v: number) => string;
  below: boolean;
  align: "left" | "center" | "right";
  onSelect: (p: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = () => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(true), 120); };
  const hide = () => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 120); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const pos =
    align === "left" ? "left-0" : align === "right" ? "right-0" : "left-1/2 -translate-x-1/2";
  const fmt = (v: number | null) => (v == null ? "—" : format ? format(v) : Number.isInteger(v) ? String(v) : v.toFixed(1));

  return (
    <div className={`relative ${open ? "z-50" : "z-10"}`} onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {open && (
        // El padding hace de puente entre la carta y el panel para no perder el hover
        <div className={`absolute ${pos} ${below ? "top-full pt-2" : "bottom-full pb-2"} w-64`}>
          <div
            className="rounded-xl border bg-[#0a1224]/95 backdrop-blur-xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
            style={{ borderColor: `${color}55`, boxShadow: `0 12px 40px rgba(0,0,0,0.6), 0 0 24px ${color}22` }}
          >
            <div className="px-3 py-2 flex items-center justify-between border-b border-white/10" style={{ background: `${color}14` }}>
              <span className="text-[10px] font-black uppercase tracking-wider" style={{ color }}>
                Bench · {role}
              </span>
              <span className="text-[9px] text-slate-400 truncate max-w-[110px]" title={sortLabel}>{sortLabel}</span>
            </div>
            {bench.length === 0 ? (
              <div className="px-3 py-4 text-center text-[11px] text-slate-500">No more candidates match these filters</div>
            ) : (
              <ol className="p-1.5 space-y-0.5">
                {bench.map((p, i) => (
                  <li key={p.id}>
                    <button
                      onClick={() => onSelect(p)}
                      className="w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg hover:bg-white/[0.06] text-left transition-colors"
                    >
                      <span className="w-4 text-[10px] font-bold text-slate-500 tabular-nums text-center">{i + 2}</span>
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-white/5 border border-white/10 shrink-0">
                        {p.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.photoUrl} alt="" className="w-full h-full object-cover object-top" loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-slate-500">
                            {(p.matchName || p.name || "?").slice(0, 1)}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-white truncate">{p.matchName || p.name}</div>
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 truncate">
                          {p.badgeUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.badgeUrl} alt="" className="w-3 h-3 object-contain shrink-0" loading="lazy" />
                          )}
                          <span className="truncate">{p.teamName}</span>
                          {p._age != null && <span className="text-slate-500">· {p._age}</span>}
                        </div>
                      </div>
                      <span className="text-xs font-black tabular-nums" style={{ color }}>{fmt(valueOf(p))}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: React.ReactNode; className: string }) {
  return (
    <div className="text-center px-4 py-2">
      <span className="text-[10px] uppercase font-bold text-slate-400 block">{label}</span>
      <span className={`text-lg font-black tabular-nums ${className}`}>{value}</span>
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
