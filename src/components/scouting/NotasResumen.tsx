import React from "react";
import { Metricas, hierarchyFor, subcategoryNote } from "@/lib/metricsHierarchy";
import { notaClases } from "@/lib/notaColor";

const ARCO = "M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831";

function Anillo({ valor, size, grosor }: { valor: number | null; size: "lg" | "md"; grosor: number }) {
  const dim = size === "lg" ? "w-24 h-24" : "w-14 h-14";
  return (
    <svg className={`${dim} -rotate-90`} viewBox="0 0 36 36">
      <path className="text-slate-800" strokeWidth={grosor} stroke="currentColor" fill="none" d={ARCO} />
      {valor != null && (
        <path
          className={notaClases(valor).text}
          strokeDasharray={`${Math.max(0, Math.min(100, valor))}, 100`}
          strokeWidth={grosor}
          strokeLinecap="round"
          stroke="currentColor"
          fill="none"
          d={ARCO}
        />
      )}
    </svg>
  );
}

const fmt = (v: number | null | undefined) => (v == null ? "—" : Math.round(v));

/** Overall rating + one card per category (with its real sub-category notes). Goalkeepers get their own
 *  categories (Goalkeeping, Distribution, Availability). Colours: >= 70 green, 50-70 orange, < 50 red. */
export function NotasResumen({
  stats,
  metricas,
  position,
}: {
  stats: Record<string, any> | null;
  metricas: Metricas;
  position?: string | null;
}) {
  const hierarchy = hierarchyFor(stats?.grupo_demarcacion, position);
  const global = stats?.nota_global ?? null;
  const cols = hierarchy.length + 1 >= 5 ? "lg:grid-cols-5" : "lg:grid-cols-4";

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${cols} gap-4`}>
      <div className="p-4 rounded-xl border border-border/60 bg-[#070e1e] flex flex-col items-center justify-center text-center">
        <div className="relative w-24 h-24 flex items-center justify-center">
          <Anillo valor={global} size="lg" grosor={3.2} />
          <div className="absolute flex flex-col items-center leading-none">
            <span className={`font-black text-2xl ${notaClases(global).text}`}>{fmt(global)}</span>
            <span className="text-[9px] text-muted-foreground mt-0.5">of 100</span>
          </div>
        </div>
        <div className="mt-3 font-bold text-white text-sm">Overall rating</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          Better than <span className="font-bold text-white">{stats?.percentile_general != null ? Math.round(stats.percentile_general) : "—"}%</span> of the league
        </div>
      </div>

      {hierarchy.map((cat) => {
        const valor: number | null = stats?.[cat.noteKey] ?? null;
        return (
          <div key={cat.id} className="p-4 rounded-xl border border-border/60 bg-[#070e1e] flex flex-col justify-between">
            <div className="flex items-center gap-3">
              <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
                <Anillo valor={valor} size="md" grosor={3.5} />
                <span className={`absolute font-black text-lg ${notaClases(valor).text}`}>{fmt(valor)}</span>
              </div>
              <div className="font-bold text-white text-sm leading-tight">{cat.name}</div>
            </div>
            <div className="space-y-1.5 mt-3 pt-3 border-t border-border/40 text-[11px]">
              {cat.subcategories.map((sub) => {
                const n = subcategoryNote(sub, metricas);
                return (
                  <div key={sub.id} className="flex justify-between gap-2 text-muted-foreground">
                    <span className="truncate" title={sub.name}>{sub.name}</span>
                    <span className={`font-bold tabular-nums ${notaClases(n).text}`}>{fmt(n)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
