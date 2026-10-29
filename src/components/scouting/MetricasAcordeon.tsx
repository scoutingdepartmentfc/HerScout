"use client";

import React, { useState } from "react";
import { JERARQUIA, ETIQUETAS } from "@/lib/metricasJerarquia";
import { ChevronDown, ChevronRight, Activity } from "lucide-react";

export const MetricasAcordeon: React.FC<{
  metricas?: Record<string, [number, number]>; // clave -> [valor_p90, score_0_100]
  notasGenerales?: Record<string, number | null>;
}> = ({ metricas = {}, notasGenerales = {} }) => {
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({
    Ataque: true,
    Construcción: true,
    Defensa: true,
  });

  const toggleCat = (cat: string) => {
    setOpenCats((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const colorNota = (v: number | null | undefined) => {
    if (v == null) return "text-muted-foreground";
    if (v >= 80) return "text-emerald-400";
    if (v >= 65) return "text-sky-400";
    if (v >= 50) return "text-amber-300";
    return "text-destructive";
  };

  const bgBarra = (v: number | null | undefined) => {
    if (v == null) return "bg-muted";
    if (v >= 80) return "bg-emerald-400";
    if (v >= 65) return "bg-sky-400";
    if (v >= 50) return "bg-amber-300";
    return "bg-destructive";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Activity className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-white">
          Performance Metrics Breakdown (6 Categories • 15 Subcategories • 150+ Metrics)
        </h3>
      </div>

      <div className="space-y-3">
        {JERARQUIA.map((cat) => {
          const isOpen = !!openCats[cat.categoria];
          const notaCat = notasGenerales[cat.notaKey] ?? null;

          return (
            <div
              key={cat.categoria}
              className="rounded-lg border border-border/80 bg-[#0b1329] overflow-hidden"
            >
              {/* Category Header */}
              <button
                onClick={() => toggleCat(cat.categoria)}
                className="w-full flex items-center justify-between p-3.5 bg-navy-900/60 hover:bg-secondary/40 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className="font-bold text-sm text-white">{cat.categoria}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-muted-foreground">Category Score:</span>
                  <span className={`text-base font-black tabular-nums ${colorNota(notaCat)}`}>
                    {notaCat !== null ? Math.round(notaCat) : "—"}
                  </span>
                </div>
              </button>

              {/* Subcategories & Metrics Body */}
              {isOpen && (
                <div className="p-4 space-y-4 divide-y divide-border/40">
                  {cat.subcategorias.map((sub, idx) => (
                    <div key={sub.subcategoria} className={idx > 0 ? "pt-3 space-y-2" : "space-y-2"}>
                      <span className="text-xs font-semibold text-primary/90 uppercase tracking-wide block">
                        {sub.subcategoria}
                      </span>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                        {sub.metricas.map((mKey) => {
                          const pair = metricas[mKey];
                          const valorP90 = pair ? pair[0] : null;
                          const notaScore = pair ? pair[1] : null;
                          const label = ETIQUETAS[mKey] || mKey;

                          return (
                            <div
                              key={mKey}
                              className="flex items-center justify-between py-1 text-xs hover:bg-secondary/20 px-2 rounded transition-colors"
                            >
                              <span className="text-muted-foreground truncate max-w-[220px]" title={label}>
                                {label}
                              </span>

                              <div className="flex items-center gap-3 shrink-0">
                                {/* Value per 90 */}
                                <span className="font-mono text-white text-[11px] w-12 text-right">
                                  {valorP90 !== null ? Number(valorP90).toFixed(2) : "—"}
                                </span>

                                {/* Score Bar 0-100 */}
                                <div className="w-14 h-1.5 bg-navy-950 rounded-full overflow-hidden hidden sm:block">
                                  <div
                                    className={`h-full rounded-full ${bgBarra(notaScore)}`}
                                    style={{
                                      width: notaScore !== null ? `${Math.min(100, Math.max(0, notaScore))}%` : "0%",
                                    }}
                                  />
                                </div>

                                {/* Score 0-100 number */}
                                <span
                                  className={`font-bold tabular-nums text-right w-6 ${colorNota(
                                    notaScore
                                  )}`}
                                >
                                  {notaScore !== null ? Math.round(notaScore) : "—"}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

