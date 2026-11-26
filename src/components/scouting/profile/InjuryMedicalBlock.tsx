"use client";

import React, { useState } from "react";
import { ExpandableCard } from "./ExpandableCard";
import { InjuryAnatomy, InjuryItem } from "@/components/scouting/InjuryAnatomy";

interface InjuryMedicalBlockProps {
  injuries: InjuryItem[];
  availabilityNote?: number | null;
  seasonLabel?: string;
}

function classifyShortZone(name: string, index: number): { cx: number; cy: number; key: string } {
  const s = name.toLowerCase();
  if (s.includes("head") || s.includes("concussion") || s.includes("nose") || s.includes("face")) {
    return { cx: 35, cy: 14, key: "head" };
  }
  if (s.includes("shoulder") || s.includes("collarbone") || s.includes("arm")) {
    return { cx: s.includes("left") ? 13 : 57, cy: 36, key: "shoulder" };
  }
  if (s.includes("groin") || s.includes("hip") || s.includes("abductor") || s.includes("pubis")) {
    return { cx: 35, cy: 72, key: "hip" };
  }
  if (s.includes("hamstring") || s.includes("thigh") || s.includes("quad")) {
    const left = s.includes("left") || (!s.includes("right") && index % 2 === 1);
    return { cx: left ? 27 : 43, cy: 92, key: left ? "thigh_l" : "thigh_r" };
  }
  if (s.includes("knee") || s.includes("acl") || s.includes("cruciate") || s.includes("meniscus")) {
    const left = s.includes("left") || (!s.includes("right") && index % 2 === 1);
    return { cx: left ? 27 : 43, cy: 112, key: left ? "knee_l" : "knee_r" };
  }
  if (s.includes("calf") || s.includes("shin")) {
    const left = s.includes("left") || (!s.includes("right") && index % 2 === 1);
    return { cx: left ? 27 : 43, cy: 126, key: left ? "calf_l" : "calf_r" };
  }
  if (s.includes("ankle") || s.includes("foot") || s.includes("sprain") || s.includes("achilles")) {
    const left = s.includes("left") || (!s.includes("right") && index % 2 === 1);
    return { cx: left ? 27 : 43, cy: 140, key: left ? "ankle_l" : "ankle_r" };
  }
  return { cx: 35, cy: 52, key: "core" };
}

export const InjuryMedicalBlock: React.FC<InjuryMedicalBlockProps> = ({
  injuries,
  availabilityNote,
  seasonLabel,
}) => {
  const [zoneFilter, setZoneFilter] = useState<string | null>(null);

  const totalDays = injuries.reduce((acc, i) => acc + (i.days || 0), 0);
  const ongoing = injuries.some((i) => !i.until_date && new Date(i.from_date).getTime() > Date.now() - 180 * 86400_000);
  const risk = totalDays >= 120 || injuries.length >= 4 ? "high" : totalDays >= 45 || injuries.length >= 2 ? "medium" : "low";
  const availPct = availabilityNote != null ? Math.round(availabilityNote) : Math.max(60, 100 - Math.min(40, Math.round(totalDays / 6)));

  const zones = injuries.map((inj, idx) => ({
    inj,
    ...classifyShortZone(inj.injury, idx),
    serious: (inj.days || 0) >= 30 || !inj.until_date,
  }));

  // Deduplicate dots per zone keeping serious red precedence
  const dotMap = new Map<string, { cx: number; cy: number; serious: boolean }>();
  for (const z of zones) {
    const prev = dotMap.get(z.key);
    if (!prev || z.serious) dotMap.set(z.key, { cx: z.cx, cy: z.cy, serious: z.serious });
  }

  const visibleInjuries = zoneFilter
    ? zones.filter((z) => z.key === zoneFilter).map((z) => z.inj)
    : injuries;

  const fmtMonth = (dStr: string) =>
    new Date(dStr).toLocaleDateString("en-GB", { month: "short", year: "numeric" });

  return (
    <ExpandableCard
      title="Injury & medical"
      tag={injuries.length ? `${injuries.length} injuries · ${totalDays} days out` : "0 injuries"}
      tagTone={injuries.length ? "red" : "green"}
      className="flex-1 min-h-0"
      expandedContent={<InjuryAnatomy injuries={injuries} />}
    >
      <div className="grid grid-cols-[68px_1fr] gap-2.5 flex-1 min-h-0">
        {/* Compact Body Silhouette */}
        <div className="flex flex-col items-center justify-center">
          <svg width="68" height="142" viewBox="0 0 70 150" className="shrink-0">
            <circle cx="35" cy="14" r="10" fill="#2a3a5c" />
            <rect x="20" y="27" width="30" height="50" rx="9" fill="#2a3a5c" />
            <rect x="9" y="30" width="8" height="42" rx="4" fill="#2a3a5c" />
            <rect x="53" y="30" width="8" height="42" rx="4" fill="#2a3a5c" />
            <rect x="21" y="78" width="12" height="66" rx="5" fill="#2a3a5c" />
            <rect x="37" y="78" width="12" height="66" rx="5" fill="#2a3a5c" />

            {Array.from(dotMap.entries()).map(([key, dot]) => (
              <circle
                key={key}
                cx={dot.cx}
                cy={dot.cy}
                r={zoneFilter === key ? 7 : 5.5}
                fill={dot.serious ? "#F05252" : "#F4C35E"}
                opacity={0.9}
                stroke={zoneFilter === key ? "#ffffff" : "none"}
                strokeWidth={1.5}
                className="cursor-pointer"
                onClick={() => setZoneFilter(zoneFilter === key ? null : key)}
              />
            ))}
          </svg>
        </div>

        {/* Status + Scrollable History */}
        <div className="flex-1 min-h-0 overflow-y-auto s1-scroll-fade pr-1 space-y-1.5">
          <div
            className="border-l-[3px] px-2 py-[3px] bg-white/[0.03] rounded-r-[5px] text-[10.5px]"
            style={{ borderColor: ongoing ? "#F05252" : "#34d399" }}
          >
            <strong className="text-[11px] text-[#e6edf7] block">
              Status: {ongoing ? "Injured" : "Available"}
            </strong>
            <div className="text-[#8796b3]">
              Injury risk: {risk} · Availability {seasonLabel || ""}: {availPct}%
            </div>
          </div>

          {visibleInjuries.length === 0 ? (
            <div className="text-[10.5px] text-[#8796b3] pt-1">
              Clean medical record — no recorded injuries.
            </div>
          ) : (
            visibleInjuries.map((inj, i) => {
              const serious = (inj.days || 0) >= 30 || !inj.until_date;
              return (
                <div
                  key={`${inj.from_date}-${i}`}
                  className="border-l-[3px] px-2 py-[3px] bg-white/[0.03] rounded-r-[5px] text-[10.5px]"
                  style={{ borderColor: serious ? "#F05252" : "#F4C35E" }}
                >
                  <strong className="text-[11px] text-[#e6edf7] block truncate">
                    {inj.injury}
                  </strong>
                  <div className="text-[#8796b3] truncate">
                    {fmtMonth(inj.from_date)}
                    {inj.days != null ? ` · ${inj.days} days` : ""}
                    {inj.games_missed != null ? ` · ${inj.games_missed} matches` : ""}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </ExpandableCard>
  );
};
