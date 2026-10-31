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
  head: { label: "Head & Face", cx: 100, cy: 38, group: "head" },
  shoulder_left: { label: "Left Shoulder", cx: 62, cy: 80, group: "upper" },
  shoulder_right: { label: "Right Shoulder", cx: 138, cy: 80, group: "upper" },
  chest: { label: "Chest & Heart", cx: 100, cy: 96, group: "core" },
  abdomen: { label: "Abdomen & Illness", cx: 100, cy: 132, group: "core" },
  hip_groin: { label: "Groin & Abductor", cx: 100, cy: 168, group: "core" },
  thigh_left: { label: "Left Thigh / Hamstring", cx: 78, cy: 206, group: "thigh" },
  thigh_right: { label: "Right Thigh / Hamstring", cx: 122, cy: 206, group: "thigh" },
  knee_left: { label: "Left Knee & Ligaments", cx: 78, cy: 254, group: "knee" },
  knee_right: { label: "Right Knee & Ligaments", cx: 122, cy: 254, group: "knee" },
  calf_left: { label: "Left Calf & Shin", cx: 77, cy: 298, group: "calf" },
  calf_right: { label: "Right Calf & Shin", cx: 123, cy: 298, group: "calf" },
  ankle_foot_left: { label: "Left Ankle & Foot", cx: 74, cy: 346, group: "ankle" },
  ankle_foot_right: { label: "Right Ankle & Foot", cx: 126, cy: 346, group: "ankle" },
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
                  {/* Athletic metallic muscle gradient */}
                  <linearGradient id="bodyMuscleGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1e293b" />
                    <stop offset="50%" stopColor="#0f172a" />
                    <stop offset="100%" stopColor="#090e17" />
                  </linearGradient>

                  {/* Muscle contours subtle gradient */}
                  <linearGradient id="contourGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.1" />
                    <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.1" />
                  </linearGradient>

                  {/* Hotspot radial pulse glow */}
                  <radialGradient id="hotspotRadial">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.9" />
                    <stop offset="45%" stopColor="#f43f5e" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
                  </radialGradient>
                </defs>

                {/* --- REALISTIC ATHLETIC HUMAN ANATOMY SILHOUETTE --- */}
                <g className="fill-[url(#bodyMuscleGrad)] stroke-slate-600/70 stroke-[1.2] transition-colors">
                  {/* Head & Cranium */}
                  <path
                    d="M 100,16 
                       C 84,16 80,27 80,42 
                       C 80,54 86,63 92,67 
                       L 93,73 
                       L 107,73 
                       L 108,67 
                       C 114,63 120,54 120,42 
                       C 120,27 116,16 100,16 Z"
                  />

                  {/* Neck Trapezius */}
                  <path d="M 93,71 L 80,82 L 120,82 L 107,71 Z" />

                  {/* Torso: Pectorals, Ribcage & Abdominals */}
                  <path
                    d="M 80,82 
                       C 68,84 56,92 56,104 
                       C 56,118 64,136 67,155 
                       L 72,175 
                       C 84,180 116,180 128,175 
                       L 133,155 
                       C 136,136 144,118 144,104 
                       C 144,92 132,84 120,82 Z"
                  />

                  {/* Left Arm (Athletic Deltoid, Bicep, Forearm, Hand) */}
                  <path
                    d="M 56,92 
                       C 48,94 40,105 40,118 
                       C 40,132 44,152 42,170 
                       L 38,198 
                       C 36,206 37,212 40,212 
                       C 43,212 45,206 46,198 
                       L 50,168 
                       C 53,152 56,132 58,118 Z"
                  />

                  {/* Right Arm */}
                  <path
                    d="M 144,92 
                       C 152,94 160,105 160,118 
                       C 160,132 156,152 158,170 
                       L 162,198 
                       C 164,206 163,212 160,212 
                       C 157,212 155,206 154,198 
                       L 150,168 
                       C 147,152 144,132 142,118 Z"
                  />

                  {/* Left Leg: Hip, Quadriceps, Knee, Calf, Ankle, Foot */}
                  <path
                    d="M 72,175 
                       C 64,188 62,212 63,234 
                       C 64,244 68,252 68,260 
                       C 68,268 64,286 64,304 
                       C 64,324 67,342 66,354 
                       L 61,358 
                       C 58,362 62,366 70,366 
                       C 78,366 82,360 82,354 
                       C 83,342 86,324 87,304 
                       C 88,286 86,268 86,260 
                       C 86,252 90,244 91,234 
                       C 93,212 92,188 88,177 Z"
                  />

                  {/* Right Leg */}
                  <path
                    d="M 128,175 
                       C 136,188 138,212 137,234 
                       C 136,244 132,252 132,260 
                       C 132,268 136,286 136,304 
                       C 136,324 133,342 134,354 
                       L 139,358 
                       C 142,362 138,366 130,366 
                       C 122,366 118,360 118,354 
                       C 117,342 114,324 113,304 
                       C 112,286 114,268 114,260 
                       C 114,252 110,244 109,234 
                       C 107,212 108,188 112,177 Z"
                  />
                </g>

                {/* Anatomical Line Contours (Chest, Knees, Shins) */}
                <g className="fill-none stroke-sky-400/20 stroke-[1] pointer-events-none">
                  {/* Clavicles */}
                  <path d="M 82,86 Q 100,92 118,86" />
                  {/* Pectoral line */}
                  <path d="M 75,108 Q 100,116 125,108" />
                  {/* Sternum & Abdominal midline */}
                  <path d="M 100,108 L 100,165" strokeDasharray="3,3" />
                  {/* Pelvic arch */}
                  <path d="M 80,174 Q 100,183 120,174" />
                  {/* Left Patella (Knee Cap) */}
                  <ellipse cx="78" cy="254" rx="6" ry="6" />
                  {/* Right Patella */}
                  <ellipse cx="122" cy="254" rx="6" ry="6" />
                  {/* Shin lines */}
                  <path d="M 77,272 L 75,328" strokeDasharray="2,3" />
                  <path d="M 123,272 L 125,328" strokeDasharray="2,3" />
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
