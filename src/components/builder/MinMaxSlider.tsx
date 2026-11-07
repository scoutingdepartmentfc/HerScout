"use client";

import React from "react";

interface MinMaxSliderProps {
  label: string;
  min: number;
  max: number;
  step?: number;
  currentMin: number;
  currentMax: number;
  unit?: string;
  onChange: (min: number, max: number) => void;
  accentColor?: "emerald" | "sky" | "amber" | "rose" | "indigo";
}

export const MinMaxSlider: React.FC<MinMaxSliderProps> = ({
  label,
  min,
  max,
  step = 1,
  currentMin,
  currentMax,
  unit = "",
  onChange,
  accentColor = "emerald",
}) => {
  const colorMap = {
    emerald: "text-emerald-400 accent-emerald-500",
    sky: "text-sky-400 accent-sky-500",
    amber: "text-amber-400 accent-amber-500",
    rose: "text-rose-400 accent-rose-500",
    indigo: "text-indigo-400 accent-indigo-500",
  }[accentColor];

  return (
    <div className="bg-navy-950/60 border border-white/10 rounded-xl p-3 flex flex-col justify-between shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">{label}</span>
        <span className={`text-[11px] font-black ${colorMap.split(" ")[0]}`}>
          {currentMin}{unit} — {currentMax}{unit}
        </span>
      </div>

      <div className="space-y-1.5 mt-1">
        {/* Min slider */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-slate-400 w-6">Mín</span>
          <input
            type="range"
            min={min}
            max={currentMax}
            step={step}
            value={currentMin}
            onChange={(e) => onChange(Math.min(Number(e.target.value), currentMax), currentMax)}
            className={`w-full h-1.5 bg-black/50 rounded-lg appearance-none cursor-pointer ${colorMap.split(" ")[1]}`}
          />
          <span className="text-[10px] font-semibold text-slate-200 w-8 text-right">{currentMin}</span>
        </div>

        {/* Max slider */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-slate-400 w-6">Máx</span>
          <input
            type="range"
            min={currentMin}
            max={max}
            step={step}
            value={currentMax}
            onChange={(e) => onChange(currentMin, Math.max(Number(e.target.value), currentMin))}
            className={`w-full h-1.5 bg-black/50 rounded-lg appearance-none cursor-pointer ${colorMap.split(" ")[1]}`}
          />
          <span className="text-[10px] font-semibold text-slate-200 w-8 text-right">{currentMax}</span>
        </div>
      </div>
    </div>
  );
};

