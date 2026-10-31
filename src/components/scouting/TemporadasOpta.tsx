import React from "react";
import { Database } from "lucide-react";
import { notaClases } from "@/lib/notaColor";

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
  if (!seasons.length) {
    return (
      <div className="rounded-xl border border-border/60 bg-[#070e1e] p-4 text-xs text-muted-foreground">
        No Opta data downloaded for this player yet.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border/60 bg-[#070e1e] p-4 space-y-3">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white">
        <Database className="w-3.5 h-3.5 text-primary" />
        Opta data · {seasons.filter((s) => !s.esTotal).length}{" "}
        {seasons.filter((s) => !s.esTotal).length === 1 ? "season" : "seasons"}
      </div>
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
                  {s.competitions?.logo_url && (
                    <img src={s.competitions.logo_url} alt="" className="h-4 w-4 object-contain shrink-0" />
                  )}
                  <span className="truncate text-xs font-semibold text-white">{s.competitions?.name || "—"}</span>
                </span>
                {s.sinNotas ? (
                  <span className="text-[10px] text-muted-foreground" title="Too few minutes for a season rating">—</span>
                ) : (
                  <span className={`text-sm font-black tabular-nums ${notaClases(s.nota_global).text}`}>
                    {s.nota_global != null ? Math.round(s.nota_global) : "—"}
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
    </div>
  );
}
