"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";

export interface RangeSliderProps {
  label: string;
  /** Límites del dato (extremos de la barra) */
  min: number;
  max: number;
  step?: number;
  /** Rango elegido; null = sin filtrar (barra completa) */
  value: [number, number] | null;
  onChange: (value: [number, number] | null) => void;
  format?: (v: number) => string;
  color?: string;
  hint?: string;
  onRemove?: () => void;
  compact?: boolean;
}

/**
 * Slider de rango con dos tiradores sobre una misma barra. Cuando el rango cubre todo el dato se considera
 * "sin filtro" (value = null) y la barra se muestra apagada.
 */
export const RangeSlider: React.FC<RangeSliderProps> = ({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
  format = (v) => String(v),
  color = "#10b981",
  hint,
  onRemove,
  compact = false,
}) => {
  const lo = value ? Math.max(min, value[0]) : min;
  const hi = value ? Math.min(max, value[1]) : max;
  const active = value != null && (lo > min || hi < max);
  const span = max - min || 1;
  const left = ((lo - min) / span) * 100;
  const right = ((hi - min) / span) * 100;

  // Inputs numéricos editables (se confirman al salir o con Enter)
  const [loText, setLoText] = useState(String(lo));
  const [hiText, setHiText] = useState(String(hi));
  useEffect(() => setLoText(String(lo)), [lo]);
  useEffect(() => setHiText(String(hi)), [hi]);

  const emit = (a: number, b: number) => {
    const na = Math.max(min, Math.min(a, b));
    const nb = Math.min(max, Math.max(a, b));
    onChange(na <= min && nb >= max ? null : [na, nb]);
  };

  const commit = () => {
    const a = Number(loText.replace(",", "."));
    const b = Number(hiText.replace(",", "."));
    if (Number.isFinite(a) && Number.isFinite(b)) emit(a, b);
    else {
      setLoText(String(lo));
      setHiText(String(hi));
    }
  };

  return (
    <div
      className={`group rounded-xl border transition-all ${
        active ? "border-white/20 bg-white/[0.04]" : "border-white/5 bg-black/20 hover:border-white/10"
      } ${compact ? "px-3 py-2" : "px-3.5 py-2.5"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: active ? color : "rgba(255,255,255,0.2)" }} />
          <span className={`text-[11px] font-semibold truncate ${active ? "text-white" : "text-slate-400"}`} title={hint || label}>
            {label}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <input
            value={loText}
            onChange={(e) => setLoText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
            className="w-11 h-5 rounded bg-black/40 border border-white/10 text-[10px] text-center tabular-nums text-slate-200 focus:outline-none focus:border-white/30"
            aria-label={`${label} mínimo`}
          />
          <span className="text-[10px] text-slate-600">–</span>
          <input
            value={hiText}
            onChange={(e) => setHiText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
            className="w-11 h-5 rounded bg-black/40 border border-white/10 text-[10px] text-center tabular-nums text-slate-200 focus:outline-none focus:border-white/30"
            aria-label={`${label} máximo`}
          />
          {(active || onRemove) && (
            <button
              type="button"
              onClick={() => (onRemove ? onRemove() : onChange(null))}
              className="ml-0.5 p-0.5 rounded text-slate-500 hover:text-white hover:bg-white/10"
              title={onRemove ? "Quitar filtro" : "Restablecer"}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="relative h-5 mt-1 range-dual">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-white/10" />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full transition-[background] duration-150"
          style={{
            left: `${left}%`,
            right: `${100 - right}%`,
            background: active ? `linear-gradient(90deg, ${color}aa, ${color})` : "rgba(255,255,255,0.25)",
            boxShadow: active ? `0 0 10px ${color}55` : undefined,
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          onChange={(e) => emit(Math.min(Number(e.target.value), hi), hi)}
          style={{ ["--thumb" as any]: active ? color : "#94a3b8", zIndex: lo > max - span * 0.1 ? 5 : 3 }}
          aria-label={`${label} mínimo`}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={hi}
          onChange={(e) => emit(lo, Math.max(Number(e.target.value), lo))}
          style={{ ["--thumb" as any]: active ? color : "#94a3b8", zIndex: 4 }}
          aria-label={`${label} máximo`}
        />
      </div>

      {!compact && (
        <div className="flex justify-between text-[9px] text-slate-600 tabular-nums -mt-0.5">
          <span>{format(min)}</span>
          <span>{format(max)}</span>
        </div>
      )}
    </div>
  );
};
