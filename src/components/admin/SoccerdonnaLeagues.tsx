"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Bandera } from "@/components/scouting/Bandera";
import { OptaLogo } from "@/components/scouting/OptaLogo";
import { Check, CheckCircle2, Download, Filter, RefreshCw, Globe2, Layers, Search, Shield, Sparkles, Trash2, Trophy, Users, X } from "lucide-react";

interface SdLeague {
  code: string;
  name: string;
  country: string | null;
  level: string | null;
  teams: number | null;
  players: number | null;
  enabled: boolean;
  opta_competition_id: string | null;
  opta_season_ids: string[] | null;
  last_download_at: string | null;
}

// Soccerdonna country → Opta catalog country, when they differ (same map as pipeline/traducciones.py)
const PAISES_OPTA: Record<string, string> = {
  "United States": "USA", "Turkey": "Türkiye", "Czech Republic": "Czechia", "China": "China PR",
  "Chinese Taipei (Taiwan)": "Chinese Taipei", "Färöer": "Faroe Islands", "Republik Korea (Südkorea)": "Korea Republic",
  "South Korea": "Korea Republic", "Saudi Arabien": "Saudi Arabia", "Indonesien": "Indonesia",
  "Bosnia-Herzegovina": "Bosnia and Herzegovina", "Ireland": "Republic of Ireland",
};

interface OptaCompetition {
  competition_id: string;
  competition_name: string;
  country: string | null;
  season_name: string | null;
  has_eventing: boolean;
  played_matches: number;
}

const HEADERS = { "Content-Type": "application/json" };

export function SoccerdonnaLeagues() {
  const [leagues, setLeagues] = useState<SdLeague[]>([]);
  const [opta, setOpta] = useState<OptaCompetition[]>([]);
  const [downloaded, setDownloaded] = useState<Record<string, number>>({});
  const [optaSeasons, setOptaSeasons] = useState<Record<string, any[]>>({});
  const [selectedSeasons, setSelectedSeasons] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [tab, setTab] = useState<"all" | "selected" | "tier1" | "cups">("all");
  const [displayLimit, setDisplayLimit] = useState<number>(24);
  const [deleting, setDeleting] = useState<SdLeague | null>(null);
  // true = after deleting, re-download the league from scratch (Soccerdonna + Opta, every season)
  const [rebuildAfter, setRebuildAfter] = useState(false);
  const [password, setPassword] = useState("");
  const [countryMenuOpen, setCountryMenuOpen] = useState(false);
  const countryMenuRef = React.useRef<HTMLDivElement>(null);

  // Close country dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (countryMenuRef.current && !countryMenuRef.current.contains(event.target as Node)) {
        setCountryMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/sd-leagues", { headers: HEADERS });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLeagues(data.leagues || []);
      setOpta(data.optaCompetitions || []);
      setDownloaded(data.downloaded || {});
      setOptaSeasons(data.optaSeasons || {});
      setSelectedSeasons(new Set(data.selectedSeasons || []));
      setError(null);
    } catch (err: any) {
      setError(err.message || "Could not load Soccerdonna leagues");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const send = async (key: string, body: Record<string, any>) => {
    setSaving(key);
    try {
      const res = await fetch("/api/admin/sd-leagues", { method: "POST", headers: HEADERS, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
      return data || {};
    } catch (err: any) {
      setError(err.message || "Could not save");
      return null;
    } finally {
      setSaving(null);
    }
  };

  // Temporadas Opta a descargar: se guardan en ingestion_targets
  const toggleSeason = async (seasonId: string) => {
    setSaving(`s-${seasonId}`);
    try {
      const on = selectedSeasons.has(seasonId);
      const res = await fetch("/api/admin/ingestion", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify(on ? { action: "remove", seasonId } : { action: "add", seasonIds: [seasonId] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
    } catch (err: any) {
      setError(err.message || "Could not save");
    } finally {
      setSaving(null);
    }
  };

  const selectedCount = useMemo(() => leagues.filter((l) => l.enabled).length, [leagues]);

  // Countries extracted and sorted with league counts
  const countryData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of leagues) {
      if (l.country) counts[l.country] = (counts[l.country] || 0) + 1;
    }
    const list = Object.keys(counts).sort((a, b) => a.localeCompare(b));
    return { list, counts };
  }, [leagues]);

  // Filtered leagues
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return leagues.filter((l) => {
      // Exclude already selected leagues from the main table so they don't duplicate
      if (l.enabled) return false;
      // Tab filter
      if (tab === "tier1" && l.level !== "Tier 1") return false;
      if (tab === "cups" && !((l.level || "").toLowerCase().includes("pokal") || (l.level || "").toLowerCase().includes("cup"))) {
        return false;
      }

      // Country filter
      if (countryFilter !== "all" && l.country !== countryFilter) return false;

      // Text query
      if (text.length > 0) {
        const full = `${l.name} ${l.country || ""} ${l.code} ${l.level || ""}`.toLowerCase();
        if (!full.includes(text)) return false;
      }

      return true;
    }).sort((a, b) => {
      const regions = new Set(["africa", "asia", "europe", "north america", "south america", "oceania", "world", "international", "internacional"]);
      const isGroupA = !a.country || regions.has(a.country.toLowerCase()) || (a.level || "").toLowerCase().includes("national");
      const isGroupB = !b.country || regions.has(b.country.toLowerCase()) || (b.level || "").toLowerCase().includes("national");
      if (isGroupA !== isGroupB) return isGroupA ? 1 : -1;
      const cA = (a.country || "zzz").toLowerCase();
      const cB = (b.country || "zzz").toLowerCase();
      if (cA !== cB) return cA.localeCompare(cB);
      return a.name.localeCompare(b.name);
    });
  }, [leagues, query, countryFilter, tab]);

  const displayed = useMemo(() => filtered.slice(0, displayLimit), [filtered, displayLimit]);

  // Opta and Soccerdonna spell some countries differently ("USA" vs "United States")
  const optaFor = (country: string | null) => {
    const target = (PAISES_OPTA[country || ""] || country || "").toLowerCase();
    return opta.filter((c) => !target || (c.country || "").toLowerCase() === target);
  };

  return (
    <Card className="border-border/80 bg-[#070c18] shadow-2xl">
      <CardHeader className="border-b border-border/40 pb-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Trophy className="w-4 h-4" />
              </div>
              <CardTitle className="text-xl font-black text-white">Catálogo de Ligas Femeninas</CardTitle>
              <Badge variant="default" size="sm" className="bg-primary/20 text-sky-300 border-primary/40">
                {leagues.length} ligas disponibles
              </Badge>
              {selectedCount > 0 && (
                <Badge variant="success" size="sm">
                  {selectedCount} activas para descarga
                </Badge>
              )}
            </div>
            <CardDescription className="mt-1.5 text-xs text-muted-foreground">
              Explora y activa las competiciones a sincronizar. Soccerdonna provee historial, fichas de jugadoras y valores;
              Opta enlaza métricas detalladas de partido y eventing.
            </CardDescription>
          </div>

          {/* Automático: Opta cada martes (última temporada + calendario), Soccerdonna el día 1 de cada mes */}
          <div className="flex flex-col items-stretch sm:items-end gap-1.5 shrink-0">
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={selectedCount === 0}
                isLoading={saving === "run-opta"}
                leftIcon={<Download className="w-3.5 h-3.5" />}
                onClick={async () => {
                  setNotice(null);
                  if (await send("run-opta", { action: "run", modo: "opta" }))
                    setNotice("Actualización de la API Opta (última temporada y calendario) iniciada en GitHub Actions.");
                }}
                className="shadow-lg shadow-primary/20"
              >
                Actualizar Opta
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={selectedCount === 0}
                isLoading={saving === "run-soccerdonna"}
                leftIcon={<Download className="w-3.5 h-3.5" />}
                onClick={async () => {
                  setNotice(null);
                  if (await send("run-soccerdonna", { action: "run", modo: "soccerdonna" }))
                    setNotice("Actualización de Soccerdonna iniciada en GitHub Actions.");
                }}
              >
                Actualizar Soccerdonna
              </Button>
            </div>
            <span className="text-[10px] text-muted-foreground">
              Automático: Opta cada martes · Soccerdonna el día 1 de cada mes
            </span>
          </div>
        </div>

        {/* Global Notifications */}
        {error && (
          <div className="mt-3 p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs text-rose-300">
            {error}
          </div>
        )}
        {notice && (
          <div className="mt-3 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            {notice}
          </div>
        )}

        {/* Search & Navigation Bar */}
        <div className="mt-5 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setDisplayLimit(24);
                }}
                placeholder="Buscar por liga, país o código (ej. Liga F, WSL, NWSL, España)..."
                leftIcon={<Search className="w-4 h-4 text-muted-foreground" />}
                className="h-10 bg-navy-950/80 border-border text-sm"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Custom Country Selector with Flag icons */}
            <div className="relative" ref={countryMenuRef}>
              <button
                type="button"
                onClick={() => setCountryMenuOpen(!countryMenuOpen)}
                className="h-10 text-xs rounded-lg border border-border bg-navy-950 px-3 text-white focus:outline-none focus:ring-1 focus:ring-primary min-w-[210px] flex items-center justify-between gap-2.5 hover:border-slate-500 transition-colors"
              >
                <div className="flex items-center gap-2 truncate">
                  {countryFilter === "all" ? (
                    <>
                      <Globe2 className="w-4 h-4 text-sky-400 shrink-0" />
                      <span className="font-medium text-white truncate">Todos los países</span>
                    </>
                  ) : (
                    <>
                      <Bandera country={countryFilter} size="sm" />
                      <span className="font-semibold text-white truncate">{countryFilter}</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                    {countryFilter === "all" ? countryData.list.length : countryData.counts[countryFilter] || 0}
                  </span>
                  <span className="text-[10px]">▼</span>
                </div>
              </button>

              {/* Dropdown Menu with all Country Flags */}
              {countryMenuOpen && (
                <div className="absolute right-0 top-12 z-50 w-72 max-h-80 overflow-y-auto rounded-xl border border-border/80 bg-[#070e1e] p-2 shadow-2xl backdrop-blur-md space-y-1">
                  <div className="sticky top-0 pb-1.5 pt-0.5 bg-[#070e1e] border-b border-border/40 mb-1 z-10 flex items-center justify-between text-[11px] text-muted-foreground font-semibold px-2">
                    <span>Seleccionar país</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCountryFilter("all");
                        setCountryMenuOpen(false);
                      }}
                      className="text-primary hover:underline text-[10px]"
                    >
                      Restablecer
                    </button>
                  </div>

                  {/* All option */}
                  <button
                    type="button"
                    onClick={() => {
                      setCountryFilter("all");
                      setCountryMenuOpen(false);
                      setDisplayLimit(24);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors ${
                      countryFilter === "all"
                        ? "bg-primary text-white font-semibold"
                        : "text-slate-300 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Globe2 className="w-4 h-4 text-sky-400" />
                      <span>Todos los países</span>
                    </div>
                    <span className="text-[10px] opacity-75 font-mono">{leagues.length}</span>
                  </button>

                  {/* Each country with its Flag and Count */}
                  {countryData.list.map((c) => {
                    const active = countryFilter === c;
                    const count = countryData.counts[c] || 0;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setCountryFilter(c);
                          setCountryMenuOpen(false);
                          setDisplayLimit(24);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                          active
                            ? "bg-primary text-white font-semibold"
                            : "text-slate-300 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <Bandera country={c} size="sm" />
                          <span className="truncate">{c}</span>
                        </div>
                        <span className="text-[10px] opacity-75 font-mono shrink-0 ml-2">
                          {count} {count === 1 ? "liga" : "ligas"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Quick Filter Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/30 text-xs">
            <div className="flex items-center gap-1.5">
              {[
                { id: "all", label: "Todas", count: leagues.length, icon: Globe2 },
                { id: "selected", label: "Seleccionadas", count: selectedCount, icon: CheckCircle2 },
                { id: "tier1", label: "Primeras Divisiones (Tier 1)", count: leagues.filter((l) => l.level === "Tier 1").length, icon: Trophy },
                { id: "cups", label: "Copas Nacionales", count: leagues.filter((l) => (l.level || "").toLowerCase().includes("pokal") || (l.level || "").toLowerCase().includes("cup")).length, icon: Layers },
              ].map((t) => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setTab(t.id as any);
                      setDisplayLimit(24);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      active
                        ? "bg-primary text-white border-primary shadow-sm"
                        : "bg-navy-950/60 border-border/60 text-muted-foreground hover:text-white hover:border-border"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{t.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${active ? "bg-white/20 text-white" : "bg-white/5 text-muted-foreground"}`}>
                      {t.count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="text-[11px] text-muted-foreground">
              Mostrando <span className="font-semibold text-white">{Math.min(displayed.length, filtered.length)}</span> de {filtered.length} ligas
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* Selected Leagues Progress Bar */}
        {leagues.some((l) => l.enabled) && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/10 p-3 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
              Ligas seleccionadas ({leagues.filter((l) => l.enabled).length})
            </div>
            <div className="space-y-1.5">
              {leagues
                .filter((l) => l.enabled)
                .map((l) => {
                  const count = downloaded[l.code] || 0;
                  const total = l.players || 0;
                  const pct = l.last_download_at
                    ? 100
                    : count > 0 && total > 0
                    ? Math.min(99, Math.round((count / total) * 100))
                    : 0;
                  const seasonNames = (l.opta_competition_id ? optaSeasons[l.opta_competition_id] || [] : [])
                    .filter((s: any) => (l.opta_season_ids || []).includes(s.season_id))
                    .map((s: any) => s.season_name)
                    .join(", ");
                  return (
                    <div key={l.code} className="flex flex-wrap items-center gap-3 text-xs">
                      <div className="flex items-center gap-1.5 min-w-[220px] shrink-0">
                        <Bandera country={l.country} size="sm" />
                        <span className="font-medium text-white">{l.name}</span>
                        <span className="text-[10px] font-mono text-slate-400">({l.code})</span>
                        {seasonNames && (
                          <span className="text-[10px] text-sky-300 bg-sky-950/50 border border-sky-500/30 rounded px-1.5 py-0.5">
                            {seasonNames}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 h-2 rounded-full bg-navy-950 border border-border/60 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            pct === 100 ? "bg-emerald-500" : "bg-sky-500/50"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="w-28 text-right text-[11px] shrink-0">
                        <span className={pct === 100 ? "text-emerald-300 font-semibold" : "text-muted-foreground"}>
                          {pct}% {count > 0 ? `(${count} jug.)` : ""}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
            {error && (
              <div className="text-[11px] text-rose-400 bg-rose-950/30 border border-rose-500/30 rounded-lg px-2.5 py-1.5">
                Error: {error}
              </div>
            )}
          </div>
        )}

        {/* Interactive League Table */}
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border/60 bg-navy-950/80 text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2.5 px-3">Activa</th>
                <th className="py-2.5 px-3">Liga Soccerdonna</th>
                <th className="py-2.5 px-3 min-w-[260px]">Competición Opta</th>
                <th className="py-2.5 px-3 min-w-[220px]">Temporadas Opta</th>
                <th className="py-2.5 px-3 text-right">Estado / Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {displayed.map((l) => {
                const isSaving = saving === `en-${l.code}`;
                const optaMatch = opta.find((c) => c.competition_id === l.opta_competition_id);
                const optaOptions = optaFor(l.country);

                return (
                  <tr
                    key={l.code}
                    className={`transition-colors ${
                      l.enabled
                        ? "bg-emerald-950/15 hover:bg-emerald-950/25"
                        : "bg-navy-950/30 hover:bg-navy-950/60"
                    }`}
                  >
                    <td className="py-2.5 px-3 align-top">
                      <Button
                        size="xs"
                        variant={l.enabled ? "outline" : "primary"}
                        isLoading={isSaving}
                        leftIcon={l.enabled ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Check className="w-3 h-3" />}
                        onClick={async () => {
                          setNotice(null);
                          await send(`en-${l.code}`, {
                            action: "update",
                            code: l.code,
                            enabled: !l.enabled,
                          });
                        }}
                      >
                        {l.enabled ? "Activa" : "Activar"}
                      </Button>
                    </td>

                    <td className="py-2.5 px-3 align-top">
                      <div className="flex items-center gap-2">
                        <Bandera country={l.country} size="sm" />
                        <span className="font-medium text-white">{l.name}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-slate-400 border border-white/10">
                          {l.code}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {l.country || "Internacional"} {l.level ? `· ${l.level}` : ""}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 align-top">
                      <select
                        value={l.opta_competition_id || ""}
                        onChange={(e) =>
                          send(`opta-${l.code}`, {
                            action: "update",
                            code: l.code,
                            optaCompetitionId: e.target.value,
                          })
                        }
                        className="w-full h-8 text-[11px] rounded-lg border border-border/80 bg-navy-950 px-2 text-white focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="">Sin vinculación a Opta</option>
                        {optaOptions.map((c) => (
                          <option key={c.competition_id} value={c.competition_id}>
                            [{c.competition_id}] {c.competition_name} ({c.season_name}
                            {c.has_eventing ? " · Eventing" : ""})
                          </option>
                        ))}
                      </select>
                      {optaMatch?.has_eventing && (
                        <span className="mt-1 inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-400">
                          <Sparkles className="w-2.5 h-2.5" /> Eventing disponible
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 align-top">
                      {l.opta_competition_id && (optaSeasons[l.opta_competition_id] || []).length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {(optaSeasons[l.opta_competition_id] || []).map((season: any) => {
                            const currentIds = l.opta_season_ids || [];
                            const on = currentIds.includes(season.season_id);
                            return (
                              <button
                                key={season.season_id}
                                type="button"
                                disabled={saving === `s-${l.code}-${season.season_id}`}
                                onClick={() => {
                                  const next = on
                                    ? currentIds.filter((id) => id !== season.season_id)
                                    : [...currentIds, season.season_id];
                                  send(`s-${l.code}-${season.season_id}`, {
                                    action: "update",
                                    code: l.code,
                                    optaSeasonIds: next,
                                  });
                                }}
                                title={`${season.played_matches} partidos jugados · ${season.has_eventing ? "eventing + matchstats" : "solo matchstats"}`}
                                className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                                  on
                                    ? "border-primary bg-primary/20 text-white"
                                    : "border-border/60 text-muted-foreground hover:text-white"
                                }`}
                              >
                                {season.season_name}
                                {season.has_eventing ? " ●" : ""}
                                {on ? " ✓" : ""}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 align-top text-right">
                      <div className="flex flex-col items-end gap-1.5">
                        <div className="text-[10px] text-muted-foreground">
                          {downloaded[l.code] ? (
                            <span className="text-sky-300 font-medium">✓ {downloaded[l.code]} jugadoras</span>
                          ) : (
                            <span>Pendiente</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {l.enabled && (
                            <Button
                              size="xs"
                              variant="outline"
                              isLoading={saving === `upd-${l.code}`}
                              leftIcon={<RefreshCw className="w-3 h-3" />}
                              onClick={async () => {
                                setNotice(null);
                                if (await send(`upd-${l.code}`, { action: "run", modo: "todo", code: l.code }))
                                  setNotice(`${l.name}: actualización iniciada en GitHub Actions.`);
                              }}
                            >
                              Descargar
                            </Button>
                          )}
                          {downloaded[l.code] ? (
                            <Button
                              size="xs"
                              variant="outline"
                              className="border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
                              onClick={() => {
                                setDeleting(l);
                                setRebuildAfter(false);
                                setPassword("");
                                setError(null);
                              }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Load More Button */}
        {filtered.length > displayLimit && (
          <div className="flex items-center justify-center gap-3 pt-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDisplayLimit((prev) => prev + 24)}
              className="bg-navy-950"
            >
              Cargar más ligas ({filtered.length - displayLimit} restantes)
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDisplayLimit(filtered.length)}
            >
              Mostrar todas las {filtered.length}
            </Button>
          </div>
        )}

        {deleting && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <form
              className="w-full max-w-sm rounded-xl border border-rose-500/40 bg-card p-5 space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await send("delete", { action: "deleteData", code: deleting.code, password });
                if (ok) {
                  if (rebuildAfter) {
                    const started = await send("delete", { action: "run", modo: "todo", code: deleting.code });
                    setNotice(
                      started
                        ? `${deleting.name}: datos borrados y descarga desde cero iniciada en GitHub Actions.`
                        : `${deleting.name}: datos borrados, pero no se pudo iniciar la descarga.`
                    );
                  } else {
                    setNotice(`Datos de ${deleting.name} borrados.`);
                  }
                  setDeleting(null);
                }
              }}
            >
              <p className="text-sm font-bold text-white">{rebuildAfter ? "Procesar de 0" : "Borrar"} {deleting.name}</p>
              <p className="text-xs text-muted-foreground">
                Se borran definitivamente de Supabase sus {downloaded[deleting.code] || 0} jugadoras, clubes, partidos,
                estadísticas y datos de Soccerdonna. {rebuildAfter
                  ? "Después se vuelve a descargar entera (todas las temporadas) en GitHub Actions."
                  : "La liga sigue en el catálogo y se puede volver a descargar."}
              </p>
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="Contraseña de administrador"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={error || undefined}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setDeleting(null)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="destructive" size="sm" disabled={!password} isLoading={saving === "delete"}>
                  {rebuildAfter ? "Borrar y descargar de 0" : "Borrar definitivamente"}
                </Button>
              </div>
            </form>
          </div>
        )}

        {filtered.length === 0 && (
          <div className="text-center py-12 border border-dashed border-border/60 rounded-xl">
            <Trophy className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-sm font-semibold text-white">No se han encontrado ligas</p>
            <p className="text-xs text-muted-foreground mt-1">
              Prueba a cambiar los filtros de búsqueda o el país seleccionado.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

