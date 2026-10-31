"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Metricas,
  categoryNote,
  hierarchyFor,
  subcategoryNote,
} from "@/lib/metricsHierarchy";
import { notaClases } from "@/lib/notaColor";

// >= 70 green, 50-70 orange, < 50 red (ratings relative to the league average)
const noteColor = (note: number) => notaClases(note);

function NoteBadge({ note, size = "md" }: { note: number | null; size?: "sm" | "md" | "lg" }) {
  if (note === null) {
    return (
      <span className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground" title="No eventing data this season">
        No data
      </span>
    );
  }
  const c = noteColor(note);
  if (size === "sm") {
    return (
      <div className="flex items-center gap-1.5">
        <div className="h-1.5 w-14 rounded-full bg-navy-800 overflow-hidden">
          <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${note}%` }} />
        </div>
        <span className={`w-6 text-right text-[11px] font-bold tabular-nums ${c.text}`}>{note}</span>
      </div>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-md border font-bold tabular-nums ${c.box} ${c.text} ${
        size === "lg" ? "px-3 py-1 text-lg" : "px-2 py-0.5 text-xs"
      }`}
    >
      {note}
    </span>
  );
}

const formatValue = (value: number, isPct?: boolean) => {
  const rounded = Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2);
  return isPct ? `${rounded}%` : rounded;
};

export function MetricsAccordion({
  metricas,
  grupo,
  position,
}: {
  metricas: Metricas;
  grupo?: string | null;
  position?: string | null;
}) {
  const hierarchy = hierarchyFor(grupo, position);
  const [openCat, setOpenCat] = useState<string | null>(hierarchy[0]?.id ?? null);
  const [openSubs, setOpenSubs] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-2.5">
      {hierarchy.map((cat) => {
        const isOpen = openCat === cat.id;
        const metricCount = cat.subcategories.reduce((n, s) => n + s.metrics.length, 0);
        const available = cat.subcategories.reduce((n, s) => n + s.metrics.filter((x) => metricas[x.key]).length, 0);
        return (
          <div key={cat.id} className="rounded-lg border border-border/80 bg-navy-900/60 overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenCat(isOpen ? null : cat.id)}
              className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-white/[0.03] transition-colors"
              aria-expanded={isOpen}
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-black"
                  style={{ backgroundColor: `${cat.color}25`, color: cat.color, border: `1px solid ${cat.color}40` }}
                >
                  {cat.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="text-sm font-bold text-white">
                  {cat.name}
                  <span className="ml-2 text-[11px] font-medium text-muted-foreground" title="Metrics with Opta data for this player and season">
                    {available}/{metricCount} metrics with data
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-3">
                <NoteBadge note={categoryNote(cat, metricas)} size="lg" />
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-border/60 bg-black/20 p-2.5 space-y-2">
                {cat.subcategories.map((sub) => {
                  const subOpen = !!openSubs[sub.id];
                  const withData = sub.metrics.filter((x) => metricas[x.key]);
                  return (
                    <div key={sub.id} className="rounded-md border border-border/60 bg-[#070c18]/70 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setOpenSubs((prev) => ({ ...prev, [sub.id]: !prev[sub.id] }))}
                        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
                        aria-expanded={subOpen}
                      >
                        <span className="flex items-center gap-2 text-xs font-semibold text-white">
                          <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${subOpen ? "rotate-90" : ""}`} />
                          {sub.name}
                          <span className="text-[10px] font-normal text-muted-foreground">({withData.length}/{sub.metrics.length})</span>
                        </span>
                        <NoteBadge note={subcategoryNote(sub, metricas)} />
                      </button>

                      {subOpen && (
                        <div className="border-t border-border/50 px-3 py-2 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
                          {withData.length === 0 && (
                            <p className="py-1 text-[11px] text-muted-foreground sm:col-span-2">
                              No Opta data for these metrics this season (they need eventing).
                            </p>
                          )}
                          {withData.map((metric) => {
                            const data = metricas[metric.key];
                            return (
                              <div key={metric.key} className="flex items-center justify-between gap-2 py-1 text-xs">
                                <span className="truncate text-muted-foreground" title={metric.name}>
                                  {metric.name}
                                </span>
                                <div className="flex items-center gap-3 shrink-0">
                                  <span className="w-14 text-right font-mono tabular-nums text-white/80">
                                    {data ? formatValue(data[0], metric.isPct) : "—"}
                                  </span>
                                  {data ? (
                                    <NoteBadge note={Math.round(Math.min(100, Math.max(0, data[1] * 10)))} size="sm" />
                                  ) : (
                                    <span className="w-[86px] text-right text-[11px] text-muted-foreground">—</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
