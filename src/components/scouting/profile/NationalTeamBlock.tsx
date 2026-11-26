"use client";

import React from "react";
import { ExpandableCard } from "./ExpandableCard";
import { Bandera } from "@/components/scouting/Bandera";

export interface NationalTeamRow {
  team_name: string;
  debut_date?: string | null;
  caps?: number | null;
  goals?: number | null;
}

interface NationalTeamBlockProps {
  nationalTeams: NationalTeamRow[];
  playerCountry?: string | null;
}

export const NationalTeamBlock: React.FC<NationalTeamBlockProps> = ({
  nationalTeams,
  playerCountry,
}) => {
  const totalCaps = nationalTeams.reduce((acc, n) => acc + (n.caps || 0), 0);
  const totalGoals = nationalTeams.reduce((acc, n) => acc + (n.goals || 0), 0);
  const maxCaps = Math.max(1, ...nationalTeams.map((n) => n.caps || 0));

  const getCountry = (name: string) =>
    name.replace(/\s+U-?\d+.*$/i, "").trim() || playerCountry || "";

  const fmtDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString("en-GB") : null;

  const renderList = () => (
    <div className="flex flex-col gap-[7px]">
      {nationalTeams.map((nt) => {
        const caps = nt.caps ?? 0;
        const goals = nt.goals ?? 0;
        const isSenior = !/U-?\d+/i.test(nt.team_name);
        const pct = Math.max(6, Math.round((caps / maxCaps) * 100));
        const debut = fmtDate(nt.debut_date);
        return (
          <div key={nt.team_name} className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-[3px] text-[11px] items-center">
            <div className="flex items-center gap-1.5 min-w-0">
              <Bandera country={getCountry(nt.team_name)} size="xs" />
              <strong className="text-[#e6edf7] truncate">{nt.team_name}</strong>
              {isSenior && (
                <span className="text-[8.5px] font-bold uppercase tracking-[0.06em] px-1.5 py-[1px] rounded bg-[#f5b94222] text-[#f5b942] border border-[#f5b94266]">
                  Senior
                </span>
              )}
              {debut && <span className="text-[10px] text-[#5a6884] truncate">Debut {debut}</span>}
            </div>
            <div className="font-mono text-[11px] whitespace-nowrap">
              <strong className="text-[#e6edf7]">{caps}</strong> <span className="text-[#8796b3]">caps</span> ·{" "}
              <strong className="text-[#e6edf7]">{goals}</strong> <span className="text-[#8796b3]">g</span>
            </div>
            <div className="col-span-2 h-[4px] bg-[#1a2640] rounded-[2px] relative overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-[2px]"
                style={{ width: `${pct}%`, backgroundColor: "#7166F2" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <ExpandableCard
      title="National team"
      tag={`${totalCaps} caps · ${totalGoals} goals`}
      tagTone="green"
      className="flex-1 min-h-0"
      expandedContent={
        nationalTeams.length ? renderList() : <p className="text-xs text-[#8796b3]">No international caps recorded.</p>
      }
    >
      {nationalTeams.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-[#8796b3]">
          No international appearances recorded.
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto s1-scroll-fade pr-1">
          {renderList()}
        </div>
      )}
    </ExpandableCard>
  );
};
