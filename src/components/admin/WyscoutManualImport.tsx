"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Trash2, RefreshCw, Sparkles } from "lucide-react";

interface ManualLeague {
  id: string;
  name: string;
  country: string;
  active_season_id: string | null;
  teams: number;
  crests: number;
  players: number;
  photos: number;
  updated_at: string;
}

interface ImportSummary {
  competition_id: string;
  league_name: string;
  players: number;
  teams: number;
  crests_matched: number;
  photos_found: number;
  top_sample: { name: string; rating: number }[];
}

export function WyscoutManualImport() {
  const [leagues, setLeagues] = useState<ManualLeague[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [leagueName, setLeagueName] = useState("NCAA");
  const [conference, setConference] = useState("");
  const [country, setCountry] = useState("United States");
  const [seasonName, setSeasonName] = useState("2026");
  const [espnUrl, setEspnUrl] = useState("https://www.espn.com/soccer/teams/_/league/usa.ncaa.w.1");
  const [fetchPhotos, setFetchPhotos] = useState(true);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ pct: number; step: string; detail?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/wyscout-import");
      const data = await res.json();
      if (res.ok) setLeagues(data.leagues || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pickFile = (f: File | null) => {
    if (!f) return;
    setFile(f);
    setError(null);
    setResult(null);
    const raw = f.name.replace(/\.(xlsx?|csv)$/i, "").replace(/[_-]+/g, " ").trim();
    // Quitar sufijo de fecha tipo "NOV 16TH 2026" o "2026"
    const clean = raw.replace(/\b(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b.*$/i, "").trim();
    const ncaaMatch = clean.match(/^NCAA\s+(.+)$/i);
    if (ncaaMatch) {
      setLeagueName("NCAA");
      const conf = ncaaMatch[1].trim().replace(/\b\w+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
      setConference(conf);
      setCountry("United States");
    } else if (!leagueName.trim()) {
      setLeagueName(clean || raw);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) pickFile(f);
  };

  const submit = async () => {
    if (!file) return;
    setImporting(true);
    setProgress({ pct: 2, step: "Subiendo archivo...", detail: file.name });
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("leagueName", leagueName.trim() || "NCAA");
      form.append("conference", conference.trim());
      form.append("country", country.trim() || "USA");
      form.append("seasonName", seasonName.trim() || "2026");
      form.append("espnUrl", espnUrl.trim());
      form.append("fetchPhotos", fetchPhotos ? "true" : "false");

      const res = await fetch("/api/admin/wyscout-import", { method: "POST", body: form });
      if (!res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error importando Excel");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalSummary: ImportSummary | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const evt = JSON.parse(trimmed);
          if (evt.type === "progress") {
            setProgress({ pct: evt.pct ?? 0, step: evt.step ?? "", detail: evt.detail ?? "" });
          } else if (evt.type === "done") {
            finalSummary = evt.summary;
          } else if (evt.type === "error") {
            throw new Error(evt.error || "Error importando Excel");
          }
        }
      }

      if (!res.ok && !finalSummary) throw new Error("Error importando Excel");
      if (finalSummary) setResult(finalSummary);
      setFile(null);
      await load();
    } catch (e: any) {
      setError(e?.message || "Error importando Excel");
    } finally {
      setImporting(false);
    }
  };

  const remove = async (competitionId: string) => {
    const res = await fetch("/api/admin/wyscout-import", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ competitionId }),
    });
    if (res.ok) await load();
  };

  return (
    <Card className="border-white/10 bg-[#0d111a]">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg text-white">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            Importar Liga Manual (Excel Wyscout)
          </CardTitle>
          <CardDescription>
            Arrastra un Excel de Wyscout para importar jugadoras, calcular el rating tipo Opta, obtener escudos desde ESPN y buscar fotos (FotMob, 365scores y ceroacero).
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />}>
          Actualizar
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition ${
            dragging
              ? "border-emerald-400 bg-emerald-500/10"
              : file
                ? "border-emerald-500/50 bg-emerald-500/5"
                : "border-white/15 bg-white/[0.02] hover:border-white/30"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] || null)}
          />
          <Upload className="w-7 h-7 mx-auto mb-2 text-emerald-400" />
          {file ? (
            <div className="text-sm text-white font-medium">
              {file.name} <span className="text-xs text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Arrastra aquí el archivo <span className="text-white font-medium">.xlsx</span> de Wyscout o haz clic para seleccionarlo
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground block mb-1">Liga</label>
            <Input value={leagueName} onChange={(e) => setLeagueName(e.target.value)} placeholder="Ej. NCAA" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground block mb-1">Conferencia</label>
            <Input value={conference} onChange={(e) => setConference(e.target.value)} placeholder="Ej. Ivy League" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground block mb-1">País</label>
            <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="USA" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground block mb-1">Temporada</label>
            <Input value={seasonName} onChange={(e) => setSeasonName(e.target.value)} placeholder="2026" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground block mb-1">URL equipos ESPN (escudos)</label>
            <Input value={espnUrl} onChange={(e) => setEspnUrl(e.target.value)} placeholder="https://www.espn.com/soccer/teams/_/league/usa.ncaa.w.1" />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={fetchPhotos}
              onChange={(e) => setFetchPhotos(e.target.checked)}
              className="rounded border-white/20 bg-black/40 text-emerald-500"
            />
            Buscar fotos de jugadoras en SIDEARM Sports (NCAA), FotMob, 365scores y ceroacero
          </label>
          <Button
            onClick={submit}
            disabled={!file || importing}
            leftIcon={<Sparkles className="w-3.5 h-3.5" />}
          >
            {importing ? "Importando y calculando ratings..." : "Importar Liga"}
          </Button>
        </div>

        {importing && progress && (
          <div className="rounded-md border border-emerald-500/30 bg-black/30 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-white">{progress.step}</span>
              <span className="font-mono font-semibold text-emerald-400">{progress.pct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${Math.max(2, Math.min(100, progress.pct))}%` }}
              />
            </div>
            {progress.detail && (
              <div className="text-[11px] text-muted-foreground">{progress.detail}</div>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-100 space-y-1">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              {result.league_name} importada correctamente
            </div>
            <div className="text-emerald-200/90">
              {result.players} jugadoras · {result.teams} equipos ({result.crests_matched} escudos ESPN) · {result.photos_found} fotos encontradas
            </div>
            {result.top_sample?.length > 0 && (
              <div className="text-[11px] text-emerald-200/80 pt-1">
                Top rating Wyscout→Opta: {result.top_sample.map((s) => `${s.name} (${s.rating.toFixed(1)})`).join(" · ")}
              </div>
            )}
          </div>
        )}

        {leagues.length > 0 && (
          <div className="border-t border-white/10 pt-4 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Ligas manuales importadas ({leagues.length})
            </div>
            <div className="divide-y divide-white/5 rounded-md border border-white/10 bg-black/20">
              {leagues.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-white truncate">{l.name}</span>
                    <Badge variant="outline" size="sm">{l.country}</Badge>
                    <span className="text-muted-foreground">
                      {l.players} jugadoras · {l.teams} equipos ({l.crests} escudos) · {l.photos} fotos
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => remove(l.id)} title="Eliminar liga manual">
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
