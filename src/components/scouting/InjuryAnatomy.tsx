"use client";

import React, { useState } from "react";
import { Activity, Calendar, Clock, CheckCircle2, RotateCcw } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";

export interface InjuryItem {
  injury: string;
  from_date: string;
  until_date?: string | null;
  season?: string | null;
  days?: number | null;
  games_missed?: number | null;
}

interface InjuryAnatomyProps {
  injuries: InjuryItem[];
}

export type BodyZone =
  | "head"
  | "shoulder_left"
  | "shoulder_right"
  | "chest"
  | "abdomen"
  | "hip_groin"
  | "thigh_left"
  | "thigh_right"
  | "knee_left"
  | "knee_right"
  | "calf_left"
  | "calf_right"
  | "ankle_foot_left"
  | "ankle_foot_right";

interface ZoneMeta {
  label: string;
  cx: number;
  cy: number;
  group: "head" | "upper" | "core" | "thigh" | "knee" | "calf" | "ankle";
}

const ZONE_METAS: Record<BodyZone, ZoneMeta> = {
  head: { label: "Head & Face", cx: 100, cy: 36, group: "head" },
  shoulder_left: { label: "Left Shoulder", cx: 64, cy: 82, group: "upper" },
  shoulder_right: { label: "Right Shoulder", cx: 136, cy: 82, group: "upper" },
  chest: { label: "Chest & Heart", cx: 100, cy: 104, group: "core" },
  abdomen: { label: "Abdomen & Illness", cx: 100, cy: 140, group: "core" },
  hip_groin: { label: "Groin & Abductor", cx: 100, cy: 174, group: "core" },
  thigh_left: { label: "Left Thigh / Hamstring", cx: 80, cy: 218, group: "thigh" },
  thigh_right: { label: "Right Thigh / Hamstring", cx: 120, cy: 218, group: "thigh" },
  knee_left: { label: "Left Knee & Ligaments", cx: 81, cy: 268, group: "knee" },
  knee_right: { label: "Right Knee & Ligaments", cx: 119, cy: 268, group: "knee" },
  calf_left: { label: "Left Calf & Shin", cx: 82, cy: 312, group: "calf" },
  calf_right: { label: "Right Calf & Shin", cx: 118, cy: 312, group: "calf" },
  ankle_foot_left: { label: "Left Ankle & Foot", cx: 82, cy: 356, group: "ankle" },
  ankle_foot_right: { label: "Right Ankle & Foot", cx: 118, cy: 356, group: "ankle" },
};

function classifyInjury(name: string, index: number = 0): BodyZone[] {
  const s = name.toLowerCase();

  // Head
  if (s.includes("nose") || s.includes("head") || s.includes("concussion") || s.includes("face") || s.includes("eye")) {
    return ["head"];
  }

  // Chest & Internal
  if (s.includes("heart") || s.includes("chest") || s.includes("rib")) {
    return ["chest"];
  }

  // Abdomen / Illness
  if (s.includes("ill") || s.includes("coronavirus") || s.includes("appendectomy") || s.includes("stomach") || s.includes("infection")) {
    return ["abdomen"];
  }

  // Shoulder / Arms
  if (s.includes("shoulder") || s.includes("collarbone") || s.includes("arm") || s.includes("elbow") || s.includes("wrist")) {
    return s.includes("right") ? ["shoulder_right"] : s.includes("left") ? ["shoulder_left"] : ["shoulder_left", "shoulder_right"];
  }

  // Groin / Abductor / Pubis / Hip
  if (s.includes("abductor") || s.includes("groin") || s.includes("pubis") || s.includes("hip") || s.includes("pelvis")) {
    return ["hip_groin"];
  }

  // Knee & Cruciate / Ligaments
  if (s.includes("knee") || s.includes("cruciate") || s.includes("acl") || s.includes("meniscus") || s.includes("ligament")) {
    if (s.includes("right")) return ["knee_right"];
    if (s.includes("left")) return ["knee_left"];
    return index % 2 === 0 ? ["knee_right"] : ["knee_left"];
  }

  // Thigh & Hamstring
  if (s.includes("hamstring") || s.includes("thigh")) {
    if (s.includes("right")) return ["thigh_right"];
    if (s.includes("left")) return ["thigh_left"];
    return index % 2 === 0 ? ["thigh_right"] : ["thigh_left"];
  }

  // Calf / Shin / Tibial / Leg
  if (s.includes("calf") || s.includes("shin") || s.includes("tibial") || s.includes("calfbone") || s.includes("leg")) {
    if (s.includes("right")) return ["calf_right"];
    if (s.includes("left")) return ["calf_left"];
    return index % 2 === 0 ? ["calf_left"] : ["calf_right"];
  }

  // Ankle / Malleolar / Sprain / Foot
  if (s.includes("ankle") || s.includes("malleolar") || s.includes("sprain") || s.includes("foot") || s.includes("achilles") || s.includes("toe")) {
    if (s.includes("right")) return ["ankle_foot_right"];
    if (s.includes("left")) return ["ankle_foot_left"];
    return index % 2 === 0 ? ["ankle_foot_right"] : ["ankle_foot_left"];
  }

  // Muscular problems / Unknown
  if (s.includes("muscular") || s.includes("muscle") || s.includes("unknown") || s.includes("strain")) {
    return ["thigh_right", "thigh_left"];
  }

  return ["abdomen"];
}

export const InjuryAnatomy: React.FC<InjuryAnatomyProps> = ({ injuries }) => {
  const [selectedZone, setSelectedZone] = useState<BodyZone | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const totalDays = injuries.reduce((acc, curr) => acc + (curr.days || 0), 0);

  // Calculate incident counts per anatomical zone
  const zoneCounts: Partial<Record<BodyZone, number>> = {};
  injuries.forEach((inj, idx) => {
    const zones = classifyInjury(inj.injury, idx);
    zones.forEach((z) => {
      zoneCounts[z] = (zoneCounts[z] || 0) + 1;
    });
  });

  const filteredInjuries = selectedZone
    ? injuries.filter((inj, idx) => classifyInjury(inj.injury, idx).includes(selectedZone))
    : injuries;

  const fmtDate = (dStr?: string | null) => {
    if (!dStr) return "—";
    try {
      const d = new Date(dStr);
      return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    } catch {
      return dStr;
    }
  };

  return (
    <Card className="bg-[#070c18] border-border/80 shadow-2xl overflow-hidden h-full flex flex-col">
      <CardHeader className="py-3.5 px-5 border-b border-border/40 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-rose-400" />
            Injury & Medical History
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Anatomical biomechanical mapping & injury timeline
          </CardDescription>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-2.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/30">
            {injuries.length} injuries · {totalDays} days out
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 flex-1 flex flex-col justify-start">
        {injuries.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-400/80" />
            <span>Clean medical record: 0 injuries registered.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-5 items-start">
            {/* Realistic Athletic Biomechanical Body Mannequin */}
            <div className="relative mx-auto flex flex-col items-center bg-gradient-to-b from-navy-950/80 to-[#070d1a] p-3 rounded-2xl border border-border/60 shadow-xl">
              <div className="flex items-center justify-between w-full mb-1 px-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Body Map
                </span>
                {selectedZone && (
                  <button
                    type="button"
                    onClick={() => setSelectedZone(null)}
                    className="inline-flex items-center gap-1 text-[10px] text-sky-400 hover:text-white"
                    title="Reset filter"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    Reset
                  </button>
                )}
              </div>

              <svg
                viewBox="0 0 200 380"
                className="w-[155px] h-[310px] overflow-visible select-none drop-shadow-[0_4px_16px_rgba(0,0,0,0.5)]"
              >
                <defs>
                  {/* Subtle glossy 3D mannequin body gradient */}
                  <linearGradient id="bodySkinGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#334155" />
                    <stop offset="25%" stopColor="#1e293b" />
                    <stop offset="70%" stopColor="#0f172a" />
                    <stop offset="100%" stopColor="#090e17" />
                  </linearGradient>

                  {/* Highlights reflecting light like a mannequin */}
                  <linearGradient id="sheenGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.3" />
                    <stop offset="35%" stopColor="#ffffff" stopOpacity="0.45" />
                    <stop offset="70%" stopColor="#38bdf8" stopOpacity="0.1" />
                    <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
                  </linearGradient>

                  {/* Hotspot radial pulse glow */}
                  <radialGradient id="hotspotRadial">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.9" />
                    <stop offset="45%" stopColor="#f43f5e" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
                  </radialGradient>
                </defs>

                {/* --- REALISTIC FEMALE ATHLETE STANDING POSE MANNEQUIN --- */}
                {/* 1. Base Silhouette with 3D Skin Gradient */}
                <g className="fill-[url(#bodySkinGrad)] stroke-[#475569] stroke-[1.1] transition-colors drop-shadow-md">
                  {/* Head (refined oval cranium & jaw) */}
                  <path
                    d="M 100,14 
                       C 87,14 83,23 83,36 
                       C 83,48 88,57 93,62 
                       L 95,68 
                       L 105,68 
                       L 107,62 
                       C 112,57 117,48 117,36 
                       C 117,23 113,14 100,14 Z"
                  />

                  {/* Slender neck & elegant trapezius slope */}
                  <path d="M 94,66 C 90,75 80,82 72,85 L 128,85 C 120,82 110,75 106,66 Z" />

                  {/* Torso: Natural hourglass waist, feminine athletic ribcage & hips */}
                  <path
                    d="M 72,85 
                       C 63,88 62,98 63,110 
                       C 64,124 71,136 73,150 
                       C 74,160 70,172 68,182 
                       C 78,188 122,188 132,182 
                       C 130,172 126,160 127,150 
                       C 129,136 136,124 137,110 
                       C 138,98 137,88 128,85 Z"
                  />

                  {/* Left Arm: Standing relaxed pose along the body */}
                  <path
                    d="M 64,88 
                       C 56,92 50,102 49,114 
                       C 48,126 50,142 49,158 
                       C 48,172 45,188 44,204 
                       C 43,212 45,217 48,217 
                       C 51,217 53,211 54,202 
                       C 56,186 58,168 59,152 
                       C 60,138 61,122 64,110 Z"
                  />

                  {/* Right Arm: Standing pose with hand lightly poised near thigh/hip */}
                  <path
                    d="M 136,88 
                       C 144,92 150,102 151,114 
                       C 152,126 150,142 151,158 
                       C 152,172 155,188 156,204 
                       C 157,212 155,217 152,217 
                       C 149,217 147,211 146,202 
                       C 144,186 142,168 141,152 
                       C 140,138 139,122 136,110 Z"
                  />

                  {/* Left Leg: Athletic feminine curve - Thigh, Knee, Calf, Ankle */}
                  <path
                    d="M 69,183 
                       C 65,198 64,222 66,244 
                       C 68,256 72,263 72,272 
                       C 72,282 69,298 69,314 
                       C 69,332 72,348 72,358 
                       L 67,364 
                       C 64,368 68,372 75,372 
                       C 83,372 87,366 87,358 
                       C 87,346 89,330 89,314 
                       C 89,298 87,282 87,272 
                       C 87,263 90,256 92,244 
                       C 94,222 93,198 88,184 Z"
                  />

                  {/* Right Leg: Symmetrical athletic posture */}
                  <path
                    d="M 131,183 
                       C 135,198 136,222 134,244 
                       C 132,256 128,263 128,272 
                       C 128,282 131,298 131,314 
                       C 131,332 128,348 128,358 
                       L 133,364 
                       C 136,368 132,372 125,372 
                       C 117,372 113,366 113,358 
                       C 113,346 111,330 111,314 
                       C 111,298 113,282 113,272 
                       C 113,263 110,256 108,244 
                       C 106,222 107,198 112,184 Z"
                  />
                </g>

                {/* 2. Mannequin Gloss / Form Highlights */}
                <g className="fill-none stroke-[url(#sheenGrad)] stroke-[1.2] opacity-80 pointer-events-none">
                  {/* Cranium glossy curve */}
                  <path d="M 87,26 C 90,18 97,16 100,16" />
                  {/* Collarbone / Clavicle elegance */}
                  <path d="M 76,88 Q 100,94 124,88" />
                  {/* Bust contour definition */}
                  <path d="M 73,114 Q 85,124 97,118" />
                  <path d="M 127,114 Q 115,124 103,118" />
                  {/* Torso light reflection */}
                  <path d="M 100,122 L 100,170" strokeDasharray="3,4" opacity="0.4" />
                  {/* Hip / Waist feminine curvature highlight */}
                  <path d="M 72,154 Q 68,168 70,180" />
                  <path d="M 128,154 Q 132,168 130,180" />
                  {/* Left Patella & Quad highlight */}
                  <ellipse cx="80" cy="268" rx="4.5" ry="5" />
                  <path d="M 72,216 Q 74,242 79,262" opacity="0.6" />
                  {/* Right Patella & Quad highlight */}
                  <ellipse cx="120" cy="268" rx="4.5" ry="5" />
                  <path d="M 128,216 Q 126,242 121,262" opacity="0.6" />
                  {/* Calves shine lines */}
                  <path d="M 78,284 Q 75,306 77,336" opacity="0.5" />
                  <path d="M 122,284 Q 125,306 123,336" opacity="0.5" />
                </g>

                {/* --- INTERACTIVE INJURY HOTSPOTS ON PRECISE ANATOMICAL COORDS --- */}
                {(Object.entries(ZONE_METAS) as [BodyZone, ZoneMeta][]).map(([zone, meta]) => {
                  const count = zoneCounts[zone] || 0;
                  if (count === 0) return null;
                  const isSelected = selectedZone === zone;

                  return (
                    <g
                      key={zone}
                      onClick={() => setSelectedZone(isSelected ? null : zone)}
                      className="cursor-pointer group"
                    >
                      {/* Outer Pulse Glow Halo */}
                      <circle
                        cx={meta.cx}
                        cy={meta.cy}
                        r={isSelected ? "18" : "13"}
                        fill="url(#hotspotRadial)"
                        className="animate-pulse"
                      />

                      {/* Animated outer ring */}
                      <circle
                        cx={meta.cx}
                        cy={meta.cy}
                        r={isSelected ? "13" : "9.5"}
                        className={`${
                          isSelected
                            ? "fill-rose-500/40 stroke-white stroke-2"
                            : "fill-rose-500/20 stroke-rose-400 stroke-1 group-hover:fill-rose-500/40"
                        } transition-all`}
                      />

                      {/* Core Dot Badge with Count */}
                      <circle
                        cx={meta.cx}
                        cy={meta.cy}
                        r="6.5"
                        className={`${
                          isSelected ? "fill-white" : "fill-rose-500 group-hover:fill-rose-400"
                        } transition-colors`}
                      />

                      <text
                        x={meta.cx}
                        y={meta.cy + 3}
                        textAnchor="middle"
                        className={`text-[8.5px] font-black pointer-events-none select-none ${
                          isSelected ? "fill-rose-600" : "fill-white"
                        }`}
                      >
                        {count}
                      </text>
                    </g>
                  );
                })}
              </svg>

              <div className="mt-2 text-center">
                {selectedZone ? (
                  <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                    {ZONE_METAS[selectedZone].label} ({zoneCounts[selectedZone] || 0})
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    Click any hotspot to isolate zone
                  </span>
                )}
              </div>
            </div>

            {/* List of Injuries with Severity Bars & Days */}
            <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
              {filteredInjuries.map((inj, idx) => {
                const zones = classifyInjury(inj.injury, idx);
                const isHovered = hoveredIdx === idx;
                const days = inj.days ?? 0;

                const severityClass =
                  days >= 90
                    ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                    : days >= 30
                    ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                    : "bg-sky-500/15 text-sky-300 border-sky-500/30";

                return (
                  <div
                    key={`${inj.from_date}-${idx}`}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    className={`p-3 rounded-xl border transition-all duration-150 ${
                      isHovered
                        ? "bg-navy-900/90 border-rose-400/50 shadow-md shadow-rose-500/5"
                        : "bg-navy-950/60 border-border/40 hover:border-border/80"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white text-xs truncate">
                            {inj.injury}
                          </span>
                          {zones.map((z) => (
                            <span
                              key={z}
                              className="text-[9px] px-1.5 py-0.2 rounded bg-white/5 border border-white/10 text-muted-foreground uppercase font-medium"
                            >
                              {ZONE_METAS[z]?.label || z}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1 font-mono">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-2.5 h-2.5 text-slate-400" />
                            {fmtDate(inj.from_date)}
                            {inj.until_date ? ` → ${fmtDate(inj.until_date)}` : " (ongoing)"}
                          </span>
                          {inj.season && <span>· {inj.season}</span>}
                        </div>
                      </div>

                      {/* Days missed pill */}
                      <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border shrink-0 ${severityClass}`}>
                        <Clock className="w-2.5 h-2.5 inline mr-1" />
                        {days}d
                      </span>
                    </div>

                    {/* Relative recovery bar */}
                    <div className="w-full h-1.5 rounded-full bg-navy-900 overflow-hidden mt-2 border border-white/5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 via-rose-500 to-red-600 transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(8, (days / 180) * 100))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
