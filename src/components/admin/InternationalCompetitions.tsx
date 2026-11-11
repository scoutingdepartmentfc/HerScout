"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { OptaLogo } from "@/components/scouting/OptaLogo";
import { Globe2, RefreshCw, Sparkles, Trash2 } from "lucide-react";

interface IntlSeason {
  season_id: string;
  season_name: string;
  has_eventing: boolean;
  played_matches: number;
}
interface IntlCompetition {
  id: string;
  name: string;
  region: string;
  seasons: IntlSeason[];
  matchesInDb: number;
}

const HEADERS = { "Content-Type": "application/json" };

/** International club competitions (Champions League, Libertadores...). Their matches add up to each player's
 *  profile and rating; they never change the player's club or league. */
export function InternationalCompetitions() {
  const [comps, setComps] = useState<IntlCompetition[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<IntlCompetition | null>(null);
  const [password, setPassword] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/international", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setComps(data.competitions || []);
      setSelected(new Set(data.selectedSeasons || []));
    } catch (err: any) {
      setError(err.message || "Could not load");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const post = async (key: string, url: string, body: Record<string, any>) => {
    setSaving(key);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST", headers: HEADERS, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
      return true;
    } catch (err: any) {
      setError(err.message || "Could not save");
      return false;
    } finally {
      setSaving(null);
    }
  };

  const toggleSeason = (seasonId: string) =>
    post(
      `s-${seasonId}`,
      "/api/admin/ingestion",
      selected.has(seasonId) ? { action: "remove", seasonId } : { action: "add", seasonIds: [seasonId] }
    );

  const run = async (c: IntlCompetition, rebuild: boolean) => {
    setNotice(null);
    if (await post(`run-${c.id}`, "/api/admin/international", { action: "run", competitionId: c.id, rebuild }))
      setNotice(`${c.name}: ${rebuild ? "reprocesado desde 0" : "actualización"} iniciado en GitHub Actions.`);
  };

  return (
    <Card className="border-border/80 bg-[#070c18] shadow-2xl">
      <CardHeader className="border-b border-border/40 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <Globe2 className="w-4 h-4" />
          </div>
          <CardTitle className="text-xl font-black text-white">Competiciones internacionales</CardTitle>
          <Badge variant="default" size="sm" className="bg-primary/20 text-sky-300 border-primary/40">
            {comps.length} de clubes
          </Badge>
        </div>
        <CardDescription className="mt-1.5 text-xs text-muted-foreground">
          Marca las temporadas a descargar. Sus partidos se suman al perfil y a la nota de cada jugadora, pero no
          cambian su club ni su liga. Las marcadas se actualizan también en la descarga semanal.
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-5 space-y-3">
        {error && <div className="text-xs text-rose-400">{error}</div>}
        {notice && <div className="text-xs text-emerald-400">{notice}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {comps.map((c) => {
            const anySelected = c.seasons.some((s) => selected.has(s.season_id));
            return (
              <div
                key={c.id}
                className={`rounded-xl border p-4 space-y-3 ${
                  anySelected ? "border-primary/50 bg-primary/5" : "border-border/60 bg-card/40"
                }`}
              >
                <div>
                  <div className="text-sm font-bold text-white">{c.name}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.region}</div>
                </div>

                {/* Opta data level: eventing (xG, actions, heatmaps) or matchstats only */}
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <OptaLogo variant="icon" size="xs" />
                    <span>Datos Opta</span>
                  </span>
                  {c.seasons.some((s) => s.has_eventing) ? (
                    <span className="text-amber-400 flex items-center gap-0.5 text-[9px] font-bold">
                      <Sparkles className="w-2.5 h-2.5" /> Eventing
                    </span>
                  ) : c.seasons.length > 0 ? (
                    <span className="text-sky-300 text-[9px] font-bold">Solo matchstats</span>
                  ) : (
                    <span className="text-rose-400 text-[9px] font-bold">Sin datos</span>
                  )}
                </div>

                {c.seasons.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {c.seasons.map((s) => {
                      const on = selected.has(s.season_id);
                      return (
                        <button
                          key={s.season_id}
                          type="button"
                          disabled={saving === `s-${s.season_id}`}
                          onClick={() => toggleSeason(s.season_id)}
                          title={`${s.played_matches} partidos jugados · ${s.has_eventing ? "eventing + matchstats" : "solo matchstats"}`}
                          className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                            on ? "border-primary bg-primary/20 text-white" : "border-border/60 text-muted-foreground hover:text-white"
                          }`}
                        >
                          {s.season_name}
                          {s.has_eventing ? " ●" : ""}
                          {on ? " ✓" : ""}
                        </button>
                      );
                    })}
                    <div className="w-full text-[9px] text-muted-foreground pt-0.5">
                      ● eventing + matchstats · sin ● = solo matchstats
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-muted-foreground">Sin temporadas con datos por jugadora en Opta</div>
                )}

                <div className="pt-3 border-t border-border/40 flex items-center justify-between gap-2">
                  <div className="text-[10px] text-muted-foreground truncate">
                    {c.matchesInDb > 0 ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-sky-300 font-medium">✓ {c.matchesInDb} partidos en BD</span>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleting(c);
                            setPassword("");
                            setError(null);
                          }}
                          className="text-rose-400 hover:text-rose-300 inline-flex items-center gap-0.5"
                          title="Borrar partidos y estadísticas de esta competición (las jugadoras se conservan)"
                        >
                          <Trash2 className="w-3 h-3" /> Borrar
                        </button>
                      </span>
                    ) : (
                      <span>{anySelected ? "Pendiente de descarga" : "Sin descargar"}</span>
                    )}
                  </div>
                  {anySelected && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="xs"
                        variant="outline"
                        isLoading={saving === `run-${c.id}`}
                        leftIcon={<RefreshCw className="w-3 h-3" />}
                        title="Descarga solo los partidos nuevos"
                        onClick={() => run(c, false)}
                      >
                        Actualizar
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                        title="Vuelve a procesar todos los partidos de las temporadas marcadas"
                        onClick={() => run(c, true)}
                      >
                        De 0
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {deleting && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <form
              className="w-full max-w-sm rounded-xl border border-rose-500/40 bg-card p-5 space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await post("delete", "/api/admin/international", {
                  action: "deleteData",
                  competitionId: deleting.id,
                  password,
                });
                if (ok) {
                  setNotice(`Datos de ${deleting.name} borrados.`);
                  setDeleting(null);
                }
              }}
            >
              <p className="text-sm font-bold text-white">Borrar {deleting.name}</p>
              <p className="text-xs text-muted-foreground">
                Se borran sus {deleting.matchesInDb} partidos y las estadísticas de esta competición. Las jugadoras y
                los clubes se conservan (son de sus ligas).
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
