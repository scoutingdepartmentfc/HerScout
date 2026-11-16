import React, { useState } from "react";
import { BarChart3, LayoutGrid } from "lucide-react";
import { notaClases } from "@/lib/notaColor";
import { OptaLogo } from "@/components/scouting/OptaLogo";
import { LogoLiga } from "@/components/scouting/LogoLiga";
import { isLowSample, LOW_SAMPLE_LABEL } from "@/lib/sampleSize";

export interface CoberturaOpta {
  matches: number;
  minutes: number;
  withEvents: number;
  withStats: number;
}

export const claveTemporada = (s: { competition_id: string; season_id: string }) =>
  `${s.competition_id}|${s.season_id}`;

/** Which Opta data a season has: full eventing (event-level metrics) or matchstats only. */
export function CoberturaBadges({ c }: { c?: CoberturaOpta | null }) {
  if (!c || !c.matches) {
    return <span className="text-[10px] text-muted-foreground">No Opta matches</span>;
  }
  const eventingTotal = c.withEvents === c.matches;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {c.withEvents > 0 && (
        <span
          className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300"
          title="Opta event data: every action with coordinates (xG, xA, passes by zone, heatmap…)"
        >
          Eventing {eventingTotal ? "" : `${c.withEvents}/${c.matches}`}
        </span>
      )}
      {c.withStats > 0 && (
        <span
          className="rounded border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300"
          title="Opta matchstats: official per-match totals (passes, tackles, saves…)"
        >
          Matchstats {c.withStats === c.matches ? "" : `${c.withStats}/${c.matches}`}
        </span>
      )}
      {c.withEvents === 0 && (
        <span className="text-[10px] text-muted-foreground" title="Metrics that need event data are not available">
          no eventing
        </span>
      )}
    </span>
  );
}

/** Seasons with Opta data for the player; the selected one drives the whole profile. */
export function TemporadasOpta({
  seasons,
  selected,
  onSelect,
}: {
  seasons: any[];
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  const [viewMode, setViewMode] = useState<"bars" | "cards">("bars");

  if (!seasons.length) {
    return (
      <div className="rounded-xl border border-border/60 bg-[#070e1e] p-4 text-xs text-muted-foreground">
        No Opta data downloaded for this player yet.
      </div>
    );
  }

  // Separate total accumulated vs individual seasons, and sort individual ones by rating (highest to lowest)
  const totalItem = seasons.find((s) => s.esTotal);
  const individualItems = seasons.filter((s) => !s.esTotal);

  const sortedIndividual = [...individualItems].sort((a, b) => {
    const valA = a.nota_global != null ? Number(a.nota_global) : -1;
    const valB = b.nota_global != null ? Number(b.nota_global) : -1;
    if (valB !== valA) return valB - valA;
    return (Number(b.minutes_played) || 0) - (Number(a.minutes_played) || 0);
  });

  // Ordered list for the horizontal bar chart:
  // Total summary first (pinned / distinguished), followed by all competitions from highest to lowest score
  const chartItems = totalItem ? [totalItem, ...sortedIndividual] : sortedIndividual;

  return (
    <div className="rounded-xl border border-border/60 bg-[#070e1e] p-4 space-y-4 shadow-xl">
      {/* Header with Title and View Switcher */}
      <div className="flex items-center justify-between gap-3 border-b border-border/30 pb-3">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white">
          <OptaLogo variant="icon" size="xs" />
          <span className="text-slate-300">
            Data Coverage · {individualItems.length}{" "}
            {individualItems.length === 1 ? "season" : "seasons"}
          </span>
        </div>

        <div className="flex items-center gap-1 bg-navy-950/80 p-0.5 rounded-lg border border-border/40">
          <button
            type="button"
            onClick={() => setViewMode("bars")}
            className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
              viewMode === "bars"
                ? "bg-primary/20 text-primary border border-primary/40 shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
            title="Horizontal bar chart (highest to lowest score)"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ranking</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("cards")}
            className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
              viewMode === "cards"
                ? "bg-primary/20 text-primary border border-primary/40 shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
            title="Card badges grid"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cards</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: Modern Horizontal Bar Chart Ranking */}
      {viewMode === "bars" ? (
        <div className="space-y-2.5 pt-1">
          {chartItems.map((s) => {
            const key = claveTemporada(s);
            const active = key === selected;
            const score = s.nota_global != null ? Math.round(Number(s.nota_global)) : null;
            const scorePct = score != null ? Math.min(100, Math.max(0, score)) : 0;
            const styleColor = notaClases(score);

            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelect(key)}
                aria-pressed={active}
                className={`w-full group text-left rounded-lg p-2.5 transition-all border ${
                  active
                    ? "bg-primary/10 border-primary/60 shadow-[0_0_15px_rgba(56,189,248,0.15)]"
                    : s.esTotal
                    ? "bg-[#0c1833]/70 border-sky-500/30 hover:border-sky-400/50"
                    : "bg-navy-950/40 border-border/40 hover:bg-white/[0.03] hover:border-border/80"
                }`}
              >
                <div className="flex items-center justify-between gap-3 text-xs mb-1.5">
                  {/* Left: Competition Logo + Name + Season / Matches details */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="shrink-0">
                      {s.esTotal ? (
                        <div className="w-5 h-5 rounded bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-300 text-[11px] font-bold">
                          Σ
                        </div>
                      ) : (
                        <LogoLiga
                          competitionId={s.competition_id}
                          competitionName={s.competitions?.name}
                          logoUrl={s.competitions?.logo_url}
                          size={20}
                        />
                      )}
                    </div>

                    <div className="min-w-0 flex flex-wrap items-baseline gap-x-2">
                      <span className="font-semibold text-white truncate text-[13px] group-hover:text-primary transition-colors">
                        {s.competitions?.name || (s.esTotal ? "All Competitions" : "—")}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {s.seasons?.name || "—"}
                        {s.seasons?.is_active ? " · current" : ""}
                        {s.esTotal ? " · accumulated" : ""}
                      </span>
                      <span className="text-[11px] text-slate-500 hidden md:inline">
                        ({s.matches_played ?? 0} matches · {s.minutes_played ?? 0}&apos;)
                      </span>
                    </div>
                  </div>

                  {/* Right: Opta Coverage badges + Numeric Score */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="hidden sm:block">
                      <CoberturaBadges c={s.coverage} />
                    </div>

                    <span
                      className={`min-w-[42px] px-2 py-0.5 rounded text-center text-xs font-black tabular-nums font-mono border ${
                        s.sinNotas || score == null
                          ? "text-muted-foreground border-transparent bg-white/5"
                          : `${styleColor.box} ${styleColor.text}`
                      }`}
                    >
                      {score != null ? score : "—"}
                    </span>
                  </div>
                </div>

                {/* Horizontal Progress Bar */}
                <div className="w-full bg-slate-900/90 rounded-full h-2 overflow-hidden border border-white/5 relative">
                  {score != null ? (
                    <div
                      style={{ width: `${scorePct}%` }}
                      className={`h-full rounded-full transition-all duration-500 ${styleColor.bar}`}
                    />
                  ) : (
                    <div className="w-full h-full bg-slate-800/40" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        /* VIEW 2: Original Card Grid */
        <div className="flex flex-wrap gap-2">
          {seasons.map((s) => {
            const key = claveTemporada(s);
            const active = key === selected;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelect(key)}
                aria-pressed={active}
                className={`min-w-[200px] rounded-lg border px-3 py-2 text-left transition-colors ${
                  active ? "border-primary/70 bg-primary/10" : "border-border/60 bg-navy-950/60 hover:border-border"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <LogoLiga
                      competitionId={s.competition_id}
                      competitionName={s.competitions?.name}
                      logoUrl={s.competitions?.logo_url}
                      size={16}
                    />
                    <span className="truncate text-xs font-semibold text-white">{s.competitions?.name || "—"}</span>
                  </span>
                  {s.sinNotas ? (
                    <span className="text-[10px] text-muted-foreground" title="Too few minutes for a season rating">—</span>
                  ) : (
                    <span
                      className={`text-sm font-black tabular-nums ${notaClases(s.nota_global).text}`}
                      title={isLowSample(s.minutes_played, s.matches_played) ? LOW_SAMPLE_LABEL : undefined}
                    >
                      {s.nota_global != null ? Math.round(s.nota_global) : "—"}
                      {s.nota_global != null && isLowSample(s.minutes_played, s.matches_played) && (
                        <span className="ml-0.5 align-super text-[9px] text-amber-400">*</span>
                      )}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {s.seasons?.name || "—"}
                  {s.seasons?.is_active ? " · current" : ""}
                  {s.esTotal ? " · accumulated" : ""} · {s.matches_played ?? 0} matches · {s.minutes_played ?? 0}&apos;
                </div>
                <div className="mt-1.5">
                  <CoberturaBadges c={s.coverage} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
