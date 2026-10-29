"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { ErrorState } from "@/components/ui/StatusStates";
import { Database, Plus, Search, Star, Trash2 } from "lucide-react";

interface CatalogRow {
  season_id: string;
  competition_id: string;
  competition_name: string;
  country: string | null;
  format: string | null;
  season_name: string | null;
  start_date: string | null;
  played_matches: number;
  data_level: string;
  has_eventing: boolean;
}

interface TargetRow {
  season_id: string;
  competition_id: string;
  competition_name: string;
  country: string | null;
  season_name: string | null;
  fuente: "eventing" | "matchstats";
  is_active: boolean;
  enabled: boolean;
  fotmob_id: number | null;
}

interface RunRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  matches_processed: number;
  players_updated: number;
}

const HEADERS = { "Content-Type": "application/json", "x-is-platform-admin": "true" };

export function IngestionTargets() {
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ingestion", { headers: HEADERS });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCatalog(data.catalog);
      setTargets(data.targets);
      setRuns(data.runs);
      setLoaded(true);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Could not load the Opta catalog");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const send = async (key: string, body: Record<string, any>) => {
    setSaving(key);
    try {
      const res = await fetch("/api/admin/ingestion", { method: "POST", headers: HEADERS, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
    } catch (err: any) {
      setError(err.message || "Could not save");
    } finally {
      setSaving(null);
    }
  };

  const selected = useMemo(() => new Set(targets.map((t) => t.season_id)), [targets]);

  // Selected seasons grouped by league, current season first
  const leagues = useMemo(() => {
    const groups = new Map<string, TargetRow[]>();
    for (const t of targets) groups.set(t.competition_id, [...(groups.get(t.competition_id) || []), t]);
    return Array.from(groups.values()).map((ts) =>
      ts.sort((a, b) => Number(b.is_active) - Number(a.is_active) || (b.season_name || "").localeCompare(a.season_name || ""))
    );
  }, [targets]);

  // Catalog search: competitions matching country or name, newest seasons first
  const results = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (text.length < 2) return [];
    const groups = new Map<string, CatalogRow[]>();
    for (const r of catalog) {
      if (!`${r.country} ${r.competition_name}`.toLowerCase().includes(text)) continue;
      groups.set(r.competition_id, [...(groups.get(r.competition_id) || []), r]);
    }
    return Array.from(groups.values())
      .map((rs) => rs.sort((a, b) => (b.start_date || "").localeCompare(a.start_date || "")))
      .slice(0, 12);
  }, [catalog, query]);

  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-xs text-muted-foreground">Loading Opta catalog…</CardContent>
      </Card>
    );
  }

  // Without a first successful load the lists would wrongly say "no leagues selected"
  if (!loaded) {
    return <ErrorState title="Data pipeline" message={error || "Could not load the Opta catalog"} onRetry={load} />;
  }

  return (
    <div className="space-y-6">
      {error && <ErrorState title="Data pipeline" message={error} onRetry={load} />}

      <Card>
        <CardHeader>
          <CardTitle>Leagues & Seasons to Download</CardTitle>
          <CardDescription>
            Downloaded every Tuesday (03:00 UTC) by the data pipeline: Opta squads and stats, FotMob photos and
            Soccerdonna profiles. The current season gives each player&apos;s team and shirt number.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {leagues.length === 0 && (
            <p className="text-xs text-muted-foreground">No leagues selected yet. Search the Opta catalog below.</p>
          )}
          {leagues.map((seasons) => {
            const league = seasons[0];
            return (
              <div key={league.competition_id} className="rounded-md border border-border bg-navy-900/60 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">{league.competition_name}</p>
                    <p className="text-[11px] text-muted-foreground">{league.country}</p>
                  </div>
                  <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    FotMob league ID
                    <Input
                      key={`${league.competition_id}-${league.fotmob_id ?? ""}`}
                      type="number"
                      defaultValue={league.fotmob_id ?? ""}
                      placeholder="e.g. 9907"
                      className="h-7 w-24 text-xs"
                      onBlur={(e) => {
                        const value = e.target.value.trim();
                        if (value !== String(league.fotmob_id ?? "")) {
                          send(`fm-${league.competition_id}`, { action: "update", seasonId: league.season_id, fotmobId: value || null });
                        }
                      }}
                    />
                  </label>
                </div>
                {seasons.map((t) => (
                  <div key={t.season_id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className={t.enabled ? "text-white" : "text-muted-foreground line-through"}>
                        {t.season_name || t.season_id}
                      </span>
                      {t.is_active && <Badge variant="success" size="sm">Current</Badge>}
                      <Badge variant="outline" size="sm">{t.fuente === "eventing" ? "Eventing" : "Matchstats only"}</Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      {!t.is_active && (
                        <Button
                          variant="ghost"
                          size="xs"
                          isLoading={saving === `act-${t.season_id}`}
                          leftIcon={<Star className="w-3 h-3" />}
                          onClick={() => send(`act-${t.season_id}`, { action: "update", seasonId: t.season_id, isActive: true })}
                        >
                          Set current
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="xs"
                        isLoading={saving === `en-${t.season_id}`}
                        onClick={() => send(`en-${t.season_id}`, { action: "update", seasonId: t.season_id, enabled: !t.enabled })}
                      >
                        {t.enabled ? "Pause" : "Resume"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        aria-label={`Remove ${t.season_name}`}
                        isLoading={saving === `rm-${t.season_id}`}
                        onClick={() => send(`rm-${t.season_id}`, { action: "remove", seasonId: t.season_id })}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Opta Catalog</CardTitle>
          <CardDescription>
            {catalog.length
              ? `${catalog.length} women's seasons with per-player stats. Eventing seasons also get xG, xA and progressive actions.`
              : "Empty catalog: run `python -m pipeline.catalogo` once to fill it."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by country or competition (e.g. Spain, Super League)"
              leftIcon={<Search className="w-3.5 h-3.5" />}
            />
            <Button
              size="sm"
              disabled={picked.size === 0}
              isLoading={saving === "add"}
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={async () => {
                await send("add", { action: "add", seasonIds: Array.from(picked) });
                setPicked(new Set());
              }}
            >
              Add {picked.size || ""} season{picked.size === 1 ? "" : "s"}
            </Button>
          </div>
          {results.map((seasons) => (
            <div key={seasons[0].competition_id} className="rounded-md border border-border p-3">
              <p className="text-xs font-semibold text-white">
                {seasons[0].competition_name}
                <span className="font-normal text-muted-foreground"> · {seasons[0].country} · {seasons[0].format}</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {seasons.map((s) => {
                  const already = selected.has(s.season_id);
                  const isPicked = picked.has(s.season_id);
                  return (
                    <button
                      key={s.season_id}
                      type="button"
                      disabled={already}
                      onClick={() => togglePick(s.season_id)}
                      className={`rounded border px-2 py-1 text-[11px] transition-colors ${
                        already
                          ? "border-emerald-500/40 text-emerald-400 cursor-default"
                          : isPicked
                          ? "border-primary bg-primary/20 text-white"
                          : "border-border text-muted-foreground hover:text-white"
                      }`}
                      title={`${s.played_matches} matches played · ${s.has_eventing ? "eventing" : "matchstats only"}`}
                    >
                      {s.season_name}
                      {s.has_eventing ? " ●" : ""}
                      {already ? " ✓" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {query.trim().length >= 2 && results.length === 0 && (
            <p className="text-xs text-muted-foreground">No competitions match “{query}”.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Pipeline Runs</CardTitle>
          <CardDescription>Last automatic and manual downloads (GitHub Actions)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {runs.length === 0 && <p className="text-xs text-muted-foreground">No runs yet.</p>}
          {runs.map((r) => (
            <div key={r.id} className="p-3 rounded-md bg-navy-900/80 border border-border flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-muted-foreground" />
                <div>
                  <p className="font-semibold text-white">{new Date(r.started_at).toLocaleString()}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {r.matches_processed} matches · {r.players_updated} players
                  </p>
                </div>
              </div>
              <Badge variant={r.status === "completed" ? "success" : r.status === "running" ? "warning" : "destructive"} size="sm">
                {r.status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
