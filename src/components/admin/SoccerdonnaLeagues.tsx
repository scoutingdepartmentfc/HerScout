"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Bandera } from "@/components/scouting/Bandera";
import {
  AlertTriangle, BarChart3, Camera, CheckCircle2, Database, Download, ExternalLink, Link2, Plus, RefreshCw, Search,
  Trash2, Trophy, X,
} from "lucide-react";

interface SdLeague {
  code: string;
  name: string;
  country: string | null;
  level: string | null;
  teams: number | null;
  players: number | null;
  url: string | null;
  logo_url: string | null;
  enabled: boolean;
  opta_competition_id: string | null;
  opta_season_ids: string[] | null;
  last_download_at: string | null;
  last_opta_at?: string | null;
  last_fotmob_at?: string | null;
}

interface OptaSeason {
  season_id: string;
  competition_id: string;
  competition_name: string;
  country: string | null;
  season_name: string | null;
  start_date: string | null;
  has_eventing: boolean;
  played_matches: number;
}

interface LeagueStats {
  players: number;
  photos: number;
  opta: number;
  teams: number;
}

/** Parts of the download, in pipeline order (pipeline/sd_ligas.py `pasos`). */
type Part = "todo" | "soccerdonna" | "opta" | "fotmob" | "catalogo";
const PART_LABEL: Record<Part, string> = {
  todo: "todo (Soccerdonna → Opta → fotos FotMob)",
  soccerdonna: "Soccerdonna (clubes, plantillas y fichas)",
  opta: "Opta (stats y eventing + vinculación)",
  fotmob: "fotos FotMob",
  catalogo: "catálogos de ligas Soccerdonna y Opta",
};

// Soccerdonna country → Opta catalog country, when they differ (same map as pipeline/traducciones.py)
const PAISES_OPTA: Record<string, string> = {
  "United States": "USA", "Turkey": "Türkiye", "Czech Republic": "Czechia", "China": "China PR",
  "Chinese Taipei (Taiwan)": "Chinese Taipei", "Färöer": "Faroe Islands", "Republik Korea (Südkorea)": "Korea Republic",
  "South Korea": "Korea Republic", "Saudi Arabien": "Saudi Arabia", "Indonesien": "Indonesia",
  "Bosnia-Herzegovina": "Bosnia and Herzegovina", "Ireland": "Republic of Ireland",
};

const HEADERS = { "Content-Type": "application/json" };

function ago(iso?: string | null) {
  if (!iso) return "nunca";
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  if (days < 1) return "hoy";
  if (days < 2) return "ayer";
  return `hace ${Math.floor(days)} d`;
}

const fullDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("es-ES") : "Sin descargar");

/** Status of one part of the download: main figure, detail and date of the last run. */
function StatusCell({ value, detail, date, done }: { value: string; detail?: string; date?: string | null; done: boolean }) {
  return (
    <div className="space-y-0.5" title={`Última descarga: ${fullDate(date)}`}>
      <div className={`text-xs font-semibold ${done ? "text-white" : "text-muted-foreground"}`}>{value}</div>
      {detail && <div className="text-[10px] text-muted-foreground">{detail}</div>}
      <div className={`text-[10px] ${date ? "text-sky-300/80" : "text-amber-300/80"}`}>{ago(date)}</div>
    </div>
  );
}

/** Free-text Opta competition ID, saved on blur/Enter; suggests the catalog competitions of the league's country. */
function OptaIdInput({
  league, competitions, saving, onSave,
}: {
  league: SdLeague;
  competitions: OptaSeason[];
  saving: boolean;
  onSave: (id: string) => void;
}) {
  const [value, setValue] = useState(league.opta_competition_id || "");
  useEffect(() => setValue(league.opta_competition_id || ""), [league.opta_competition_id]);
  const current = (league.opta_competition_id || "").trim();
  const match = competitions.find((c) => c.competition_id === value.trim());
  const target = (PAISES_OPTA[league.country || ""] || league.country || "").toLowerCase();
  const sameCountry = competitions.filter((c) => (c.country || "").toLowerCase() === target);
  const suggestions = sameCountry.length ? sameCountry : competitions;
  const commit = () => {
    if (value.trim() !== current) onSave(value.trim());
  };
  return (
    <div className="space-y-1 min-w-[220px]">
      <div className="relative">
        <input
          value={value}
          list={`opta-${league.code}`}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setValue(current);
          }}
          placeholder="ID de competición Opta"
          spellCheck={false}
          className={`w-full h-8 rounded-lg border bg-navy-950 px-2 pr-7 font-mono text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-primary ${
            value.trim() !== current ? "border-amber-500/60" : "border-border/80"
          }`}
        />
        {saving && <RefreshCw className="absolute right-2 top-2 w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        <datalist id={`opta-${league.code}`}>
          {suggestions.map((c) => (
            <option key={c.competition_id} value={c.competition_id}>
              {c.competition_name} · {c.country}
            </option>
          ))}
        </datalist>
      </div>
      {value.trim() ? (
        match ? (
          <div className="text-[10px] text-emerald-300 truncate">
            {match.competition_name} · {match.country}
            {match.has_eventing ? " · eventing" : " · matchstats"}
          </div>
        ) : (
          <div className="text-[10px] text-amber-300 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> No está en el catálogo Opta (sin temporadas)
          </div>
        )
      ) : (
        <div className="text-[10px] text-muted-foreground">Sin Opta: solo Soccerdonna y fotos</div>
      )}
    </div>
  );
}

export function SoccerdonnaLeagues() {
  const [leagues, setLeagues] = useState<SdLeague[]>([]);
  const [optaCompetitions, setOptaCompetitions] = useState<OptaSeason[]>([]);
  const [optaSeasons, setOptaSeasons] = useState<Record<string, OptaSeason[]>>({});
  const [stats, setStats] = useState<Record<string, LeagueStats>>({});
  const [runsUrl, setRunsUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [allSeasons, setAllSeasons] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  // Table filters: "all" shows the whole Soccerdonna catalog (active leagues first)
  const [view, setView] = useState<"active" | "all">("all");
  const [query, setQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [tierOnly, setTierOnly] = useState(true);
  const [displayLimit, setDisplayLimit] = useState(40);
  const [deleting, setDeleting] = useState<SdLeague | null>(null);
  const [password, setPassword] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/sd-leagues", { headers: HEADERS });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLeagues(data.leagues || []);
      setOptaCompetitions(data.optaCompetitions || []);
      setOptaSeasons(data.optaSeasons || {});
      setStats(data.stats || {});
      setRunsUrl(data.runsUrl || null);
    } catch (err: any) {
      setError(err.message || "No se pudieron cargar las ligas");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const send = async (key: string, body: Record<string, any>) => {
    setSaving(key);
    setError(null);
    try {
      const res = await fetch("/api/admin/sd-leagues", { method: "POST", headers: HEADERS, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
      return data || {};
    } catch (err: any) {
      setError(err.message || "No se pudo guardar");
      return null;
    } finally {
      setSaving(null);
    }
  };

  const run = async (part: Part, league?: SdLeague) => {
    setNotice(null);
    const key = `run-${part}-${league?.code || "all"}`;
    const ok = await send(key, { action: "run", pasos: part, code: league?.code, allSeasons });
    if (ok) {
      const scope = league ? league.name : "todas las ligas activas";
      setNotice(`Descarga iniciada en GitHub Actions: ${PART_LABEL[part]} · ${scope}.`);
    }
  };

  const active = useMemo(
    () => leagues.filter((l) => l.enabled).sort((a, b) => (a.country || "").localeCompare(b.country || "") || a.name.localeCompare(b.name)),
    [leagues]
  );

  const countries = useMemo(
    () => Array.from(new Set(leagues.map((l) => l.country).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b)),
    [leagues]
  );

  const rows = useMemo(() => {
    const text = query.trim().toLowerCase();
    return leagues
      .filter((l) => (view === "active" ? l.enabled : true))
      .filter((l) => l.enabled || !tierOnly || (l.level || "").startsWith("Tier"))
      .filter((l) => countryFilter === "all" || l.country === countryFilter)
      .filter((l) => !text || `${l.name} ${l.country || ""} ${l.code} ${l.level || ""}`.toLowerCase().includes(text))
      .sort((a, b) =>
        Number(b.enabled) - Number(a.enabled) ||
        (a.country || "zzz").localeCompare(b.country || "zzz") ||
        (a.level || "").localeCompare(b.level || "") ||
        a.name.localeCompare(b.name));
  }, [leagues, view, query, countryFilter, tierOnly]);

  const anyActive = active.length > 0;

  return (
    <Card className="border-border/80 bg-[#070c18] shadow-2xl">
      <CardHeader className="border-b border-border/40 pb-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Trophy className="w-4 h-4" />
              </div>
              <CardTitle className="text-xl font-black text-white">Ligas a descargar</CardTitle>
              <Badge variant="default" size="sm">{leagues.length} en el catálogo</Badge>
              <Badge variant="success" size="sm">{active.length} activas</Badge>
            </div>
            <CardDescription className="mt-1.5 text-xs text-muted-foreground max-w-2xl">
              Soccerdonna da clubes, plantillas y fichas; Opta las estadísticas y el eventing (se vincula por el ID de
              competición); FotMob las fotos. Se puede lanzar todo o cada parte por separado, para todas las ligas o
              para una sola. Activar una liga no descarga nada: la descarga empieza solo cuando pulsas un botón.
            </CardDescription>
          </div>

          {/* Global actions: every active league */}
          <div className="flex flex-col items-stretch lg:items-end gap-2 shrink-0">
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button size="sm" disabled={!anyActive} isLoading={saving === "run-todo-all"}
                leftIcon={<Download className="w-3.5 h-3.5" />} onClick={() => run("todo")}>
                Descargar todo
              </Button>
              <Button size="sm" variant="outline" disabled={!anyActive} isLoading={saving === "run-soccerdonna-all"}
                leftIcon={<Database className="w-3.5 h-3.5" />} onClick={() => run("soccerdonna")}>
                Soccerdonna
              </Button>
              <Button size="sm" variant="outline" disabled={!anyActive} isLoading={saving === "run-opta-all"}
                leftIcon={<BarChart3 className="w-3.5 h-3.5" />} onClick={() => run("opta")}>
                Opta
              </Button>
              <Button size="sm" variant="outline" disabled={!anyActive} isLoading={saving === "run-fotmob-all"}
                leftIcon={<Camera className="w-3.5 h-3.5" />} onClick={() => run("fotmob")}>
                Fotos FotMob
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground lg:justify-end">
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input type="checkbox" checked={allSeasons} onChange={(e) => setAllSeasons(e.target.checked)}
                  className="accent-sky-500" />
                Opta: todas las temporadas elegidas (no solo la última)
              </label>
              {runsUrl && (
                <a href={runsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-300 hover:underline">
                  Ver ejecuciones <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground">
              Descarga automática desactivada: solo se descarga lo que lances aquí
            </span>
          </div>
        </div>

        {error && (
          <div className="mt-3 p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs text-rose-300 flex items-start justify-between gap-2">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)}><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        {notice && (
          <div className="mt-3 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="flex-1">{notice}</span>
            {runsUrl && (
              <a href={runsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                Seguir <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        {/* Add a league by its Soccerdonna URL */}
        <form
          className="mt-4 flex flex-col sm:flex-row gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setNotice(null);
            const res = await send("add-url", { action: "addUrl", url: newUrl });
            if (res) {
              setNewUrl("");
              setNotice(res.added
                ? `Liga ${res.code} añadida y activada: pon su ID de Opta y pulsa un botón de descarga.`
                : `Liga ${res.code} activada.`);
            }
          }}
        >
          <Input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="URL de la liga en Soccerdonna (…/startseite/wettbewerb_SLV.html)"
            leftIcon={<Link2 className="w-4 h-4 text-muted-foreground" />}
            className="h-9 bg-navy-950/80 border-border text-xs"
          />
          <Button type="submit" size="sm" variant="outline" disabled={!newUrl.trim()} isLoading={saving === "add-url"}
            leftIcon={<Plus className="w-3.5 h-3.5" />}>
            Añadir liga
          </Button>
        </form>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* Filters: the whole Soccerdonna catalog, active leagues first */}
        <div className="flex flex-col lg:flex-row gap-2">
          <div className="flex gap-1 shrink-0">
            {([["active", `Activas (${active.length})`], ["all", `Todas (${leagues.length})`]] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => { setView(id); setDisplayLimit(40); }}
                className={`px-3 h-9 rounded-lg border text-xs font-medium transition-colors ${
                  view === id ? "bg-primary text-white border-primary" : "bg-navy-950/60 border-border/60 text-muted-foreground hover:text-white"
                }`}>
                {label}
              </button>
            ))}
          </div>
          <Input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setDisplayLimit(40); }}
            placeholder="Buscar por liga, país o código (Liga F, WSL, ESP1…)"
            leftIcon={<Search className="w-4 h-4 text-muted-foreground" />}
            className="h-9 bg-navy-950/80 border-border text-xs"
          />
          <select
            value={countryFilter}
            onChange={(e) => { setCountryFilter(e.target.value); setDisplayLimit(40); }}
            className="h-9 text-xs rounded-lg border border-border bg-navy-950 px-2 text-white min-w-[180px]"
          >
            <option value="all">Todos los países</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground whitespace-nowrap">
            <input type="checkbox" checked={tierOnly} onChange={(e) => setTierOnly(e.target.checked)} className="accent-sky-500" />
            Solo ligas (sin copas)
          </label>
          <Button size="sm" variant="ghost" isLoading={saving === "run-catalogo-all"}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => run("catalogo")}
            title="Vuelve a leer el índice de ligas de Soccerdonna y el catálogo Opta">
            Actualizar catálogos
          </Button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border/60 bg-navy-950/80 text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2.5 px-3">Activa</th>
                <th className="py-2.5 px-3">Liga (Soccerdonna)</th>
                <th className="py-2.5 px-3">ID Opta</th>
                <th className="py-2.5 px-3 min-w-[180px]">Temporadas Opta</th>
                <th className="py-2.5 px-3">Soccerdonna</th>
                <th className="py-2.5 px-3">Opta</th>
                <th className="py-2.5 px-3">Fotos FotMob</th>
                <th className="py-2.5 px-3 text-right">Descargar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rows.slice(0, displayLimit).map((l) => {
                const s = stats[l.code] || { players: 0, photos: 0, opta: 0, teams: 0 };
                const seasons = l.opta_competition_id ? optaSeasons[l.opta_competition_id] || [] : [];
                const chosen = l.opta_season_ids || [];
                const pct = (n: number) => (s.players ? Math.round((n / s.players) * 100) : 0);
                const busy = (part: Part) => saving === `run-${part}-${l.code}`;
                return (
                  <tr key={l.code} className={`align-top transition-colors ${
                    l.enabled ? "bg-emerald-950/15 hover:bg-emerald-950/25" : "bg-navy-950/30 hover:bg-navy-950/60"
                  }`}>
                    <td className="py-3 px-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={l.enabled}
                        disabled={saving === `en-${l.code}`}
                        onClick={() => send(`en-${l.code}`, { action: "update", code: l.code, enabled: !l.enabled })}
                        title={l.enabled ? "Desactivar (los datos se conservan)" : "Activar: no descarga nada hasta que pulses un botón"}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors ${
                          l.enabled ? "bg-emerald-500/80 border-emerald-400" : "bg-navy-950 border-border"
                        }`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                          l.enabled ? "translate-x-4" : "translate-x-0.5"
                        }`} />
                      </button>
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        {l.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={l.logo_url} alt="" className="w-6 h-6 rounded object-contain bg-white/5" />
                        ) : (
                          <Bandera country={l.country} size="sm" />
                        )}
                        <div>
                          <div className="font-semibold text-white">{l.name}</div>
                          <div className="text-[10px] text-muted-foreground">
                            <span className="font-mono">{l.code}</span> · {l.country || "Internacional"}
                            {l.level ? ` · ${l.level}` : ""}
                            {l.teams ? ` · ${l.teams} clubes` : ""}
                            {l.url && (
                              <a href={`https://www.soccerdonna.de${l.url}`} target="_blank" rel="noreferrer"
                                className="ml-1 inline-flex align-middle text-sky-300 hover:text-sky-200">
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <OptaIdInput
                        league={l}
                        competitions={optaCompetitions}
                        saving={saving === `opta-${l.code}`}
                        onSave={(id) => send(`opta-${l.code}`, { action: "update", code: l.code, optaCompetitionId: id })}
                      />
                    </td>

                    <td className="py-3 px-3">
                      {seasons.length ? (
                        <div className="flex flex-wrap gap-1">
                          {seasons.map((season) => {
                            const on = chosen.includes(season.season_id);
                            return (
                              <button
                                key={season.season_id}
                                type="button"
                                disabled={saving === `s-${l.code}`}
                                onClick={() =>
                                  send(`s-${l.code}`, {
                                    action: "update",
                                    code: l.code,
                                    optaSeasonIds: on ? chosen.filter((id) => id !== season.season_id) : [...chosen, season.season_id],
                                  })
                                }
                                title={`${season.played_matches} partidos jugados · ${season.has_eventing ? "eventing + matchstats" : "solo matchstats"}`}
                                className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                                  on ? "border-primary bg-primary/20 text-white" : "border-border/60 text-muted-foreground hover:text-white"
                                }`}
                              >
                                {season.season_name}
                                {season.has_eventing ? " ●" : ""}
                                {on ? " ✓" : ""}
                              </button>
                            );
                          })}
                          <div className="w-full text-[10px] text-muted-foreground mt-0.5">
                            La última siempre se descarga; marca las anteriores que quieras.
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </td>

                    {l.enabled || s.players > 0 ? (
                      <>
                        <td className="py-3 px-3">
                          <StatusCell done={s.players > 0} value={`${s.players} jugadoras`}
                            detail={`${s.teams}${l.teams ? `/${l.teams}` : ""} clubes`} date={l.last_download_at} />
                        </td>
                        <td className="py-3 px-3">
                          {l.opta_competition_id ? (
                            <StatusCell done={s.opta > 0} value={`${s.opta} vinculadas`} detail={`${pct(s.opta)}% de la plantilla`}
                              date={l.last_opta_at} />
                          ) : (
                            <span className="text-[10px] text-muted-foreground">Sin ID Opta</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <StatusCell done={s.photos > 0} value={`${s.photos} con foto`} detail={`${pct(s.photos)}% de la plantilla`}
                            date={l.last_fotmob_at} />
                        </td>
                      </>
                    ) : (
                      <td colSpan={3} className="py-3 px-3 text-[10px] text-muted-foreground">Actívala para descargarla</td>
                    )}

                    <td className="py-3 px-3">
                      {l.enabled ? (
                        <div className="flex flex-col items-end gap-1.5">
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button size="xs" isLoading={busy("todo")} leftIcon={<Download className="w-3 h-3" />}
                              onClick={() => run("todo", l)} title="Soccerdonna → Opta → vincular → fotos FotMob">
                              Todo
                            </Button>
                            <Button size="xs" variant="outline" isLoading={busy("soccerdonna")} onClick={() => run("soccerdonna", l)}
                              title="Clubes, escudos, plantillas y fichas de Soccerdonna">
                              SD
                            </Button>
                            <Button size="xs" variant="outline" isLoading={busy("opta")} disabled={!l.opta_competition_id}
                              onClick={() => run("opta", l)} title="Stats y eventing de Opta + vinculación de equipos y jugadoras">
                              Opta
                            </Button>
                            <Button size="xs" variant="outline" isLoading={busy("fotmob")} onClick={() => run("fotmob", l)}
                              title="Fotos de FotMob de las jugadoras sin foto">
                              Fotos
                            </Button>
                          </div>
                          {s.players > 0 && (
                            <Button size="xs" variant="ghost" className="text-rose-400 hover:bg-rose-500/10"
                              onClick={() => { setDeleting(l); setPassword(""); setError(null); }}
                              title="Borrar todo lo descargado de esta liga" leftIcon={<Trash2 className="w-3 h-3" />}>
                              Borrar datos
                            </Button>
                          )}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-xs text-muted-foreground">
                    {view === "active"
                      ? "No hay ligas activas. Pulsa «Todas» y activa las que quieras descargar."
                      : "No hay ligas con esos filtros."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {rows.length > displayLimit && (
          <div className="flex justify-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setDisplayLimit((n) => n + 40)}>
              Ver más ({rows.length - displayLimit})
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDisplayLimit(rows.length)}>Ver todas</Button>
          </div>
        )}

        {deleting && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <form
              className="w-full max-w-sm rounded-xl border border-rose-500/40 bg-card p-5 space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await send("delete", { action: "deleteData", code: deleting.code, password })) {
                  setNotice(`Datos de ${deleting.name} borrados.`);
                  setDeleting(null);
                }
              }}
            >
              <p className="text-sm font-bold text-white">Borrar {deleting.name}</p>
              <p className="text-xs text-muted-foreground">
                Se borran definitivamente sus {stats[deleting.code]?.players || 0} jugadoras, clubes, partidos, estadísticas
                y datos de Soccerdonna. La liga sigue activa y se puede volver a descargar.
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
                <Button type="button" variant="ghost" size="sm" onClick={() => setDeleting(null)}>Cancelar</Button>
                <Button type="submit" variant="destructive" size="sm" disabled={!password} isLoading={saving === "delete"}>
                  Borrar definitivamente
                </Button>
              </div>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
