"use client";

import React from "react";
import { ExpandableCard } from "./ExpandableCard";
import { EscudoEquipo } from "@/components/scouting/EscudoEquipo";
import { SCORE_ON_TEXT, scoreColor } from "@/lib/scorePalette";

export interface CareerSeasonRow {
  key: string;
  seasonName: string;
  teamId?: string | null;
  teamName: string;
  badgeUrl?: string | null;
  apps: number;
  goals: number;
  assists: number;
  rating: number | null;
}

interface CareerStatsBlockProps {
  rows: CareerSeasonRow[];
}

export const CareerStatsBlock: React.FC<CareerStatsBlockProps> = ({ rows }) => {
  const uniqueSeasons = new Set(rows.map((r) => r.seasonName)).size;
  const uniqueClubs = new Set(rows.map((r) => r.teamName)).size;

  const renderTable = () => (
    <table className="w-full border-collapse text-[11.5px] tabular-nums">
      <thead className="sticky top-0 z-10 bg-[#111d34]">
        <tr className="text-[9.5px] text-[#8796b3] uppercase tracking-[0.05em] border-b border-[#1c2a45]">
          <th className="text-left font-semibold py-1 px-1.5">Season</th>
          <th className="text-left font-semibold py-1 px-1.5">Team</th>
          <th className="text-right font-semibold py-1 px-1.5">Apps</th>
          <th className="text-right font-semibold py-1 px-1.5">Gls</th>
          <th className="text-right font-semibold py-1 px-1.5">Ast</th>
          <th className="text-right font-semibold py-1 px-1.5">Rating</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const rtColor = r.rating != null ? scoreColor(r.rating, 10) : null;
          return (
            <tr key={r.key} className="border-b border-[#16223a] hover:bg-white/[0.02]">
              <td className="py-[5px] px-1.5 text-left text-[#e6edf7] whitespace-nowrap">
                {r.seasonName}
              </td>
              <td className="py-[5px] px-1.5 text-left">
                <span className="inline-flex items-center gap-1.5 text-[#e6edf7] font-medium">
                  <EscudoEquipo teamId={r.teamId} badgeUrl={r.badgeUrl} name={r.teamName} size={16} />
                  <span className="truncate max-w-[180px]">{r.teamName}</span>
                </span>
              </td>
              <td className="py-[5px] px-1.5 text-right text-[#e6edf7]">{r.apps}</td>
              <td className="py-[5px] px-1.5 text-right text-[#e6edf7]">{r.goals}</td>
              <td className="py-[5px] px-1.5 text-right text-[#e6edf7]">{r.assists}</td>
              <td className="py-[5px] px-1.5 text-right">
                {r.rating != null && rtColor ? (
                  <span
                    className="inline-block min-w-[36px] text-center rounded-[4px] px-1.5 py-[1px] font-extrabold"
                    style={{ backgroundColor: rtColor, color: SCORE_ON_TEXT }}
                  >
                    {r.rating.toFixed(2)}
                  </span>
                ) : (
                  <span className="text-[#5a6884]">—</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <ExpandableCard
      title="Career Stats / Teams"
      subtitle={`${uniqueSeasons} ${uniqueSeasons === 1 ? "season" : "seasons"} · ${uniqueClubs} ${uniqueClubs === 1 ? "club" : "clubs"} · inner scroll ↕`}
      className="flex-none fit:h-[168px]"
      expandedContent={renderTable()}
    >
      {rows.length === 0 ? (
        <div className="py-6 text-center text-xs text-[#8796b3]">No career stats recorded.</div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto s1-scroll-fade pr-1">
          {renderTable()}
        </div>
      )}
    </ExpandableCard>
  );
};
