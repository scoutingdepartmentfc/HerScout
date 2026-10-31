"use client";

import React, { useState } from "react";
import { Flag, Award, Calendar, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Bandera } from "./Bandera";

export interface NationalTeamItem {
  team_name: string;
  debut_date?: string | null;
  caps?: number | null;
  goals?: number | null;
}

interface NationalTeamGridProps {
  nationalTeams: NationalTeamItem[];
  playerCountry?: string | null;
}

export const NationalTeamGrid: React.FC<NationalTeamGridProps> = ({
  nationalTeams,
  playerCountry,
}) => {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const fmtDate = (dStr?: string | null) => {
    if (!dStr) return null;
    try {
      const d = new Date(dStr);
      return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    } catch {
      return dStr;
    }
  };

  const totalCaps = nationalTeams.reduce((acc, curr) => acc + (curr.caps || 0), 0);
  const totalGoals = nationalTeams.reduce((acc, curr) => acc + (curr.goals || 0), 0);
  const maxCaps = Math.max(...nationalTeams.map((n) => n.caps || 0), 10);

  // Extract base country name from team_name (e.g. "Norway U-19" -> "Norway", "Spain" -> "Spain")
  const getCountryName = (teamName: string) => {
    return teamName.replace(/\s+U-?\d+.*$/i, "").trim() || playerCountry || "";
  };

  return (
    <Card className="bg-[#070c18] border-border/80 shadow-2xl overflow-hidden h-full flex flex-col">
      <CardHeader className="py-3.5 px-5 border-b border-border/40 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
            <Flag className="w-4 h-4 text-emerald-400" />
            National Team Career
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            International caps and goals across age categories
          </CardDescription>
        </div>

        {/* Aggregate badge */}
        <div className="flex items-center gap-2">
          <div className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
            {totalCaps} caps · {totalGoals} goals
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 flex-1 flex flex-col justify-start">
        {nationalTeams.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted-foreground">
            No international appearances recorded yet.
          </div>
        ) : (
          <div className="space-y-3">
            {nationalTeams.map((team, idx) => {
              const country = getCountryName(team.team_name);
              const caps = team.caps ?? 0;
              const goals = team.goals ?? 0;
              const isSelected = selectedIdx === idx;
              const isSenior = !team.team_name.includes("U-");

              return (
                <div
                  key={team.team_name}
                  onClick={() => setSelectedIdx(isSelected ? null : idx)}
                  className={`p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? "bg-navy-900/90 border-emerald-400/50 shadow-lg shadow-emerald-500/5"
                      : "bg-navy-950/60 border-border/40 hover:border-border/80 hover:bg-navy-900/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    {/* Country flag + Category badge */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-5 rounded overflow-hidden shadow-sm shrink-0 flex items-center justify-center">
                        <Bandera country={country} size="sm" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-xs truncate">
                            {team.team_name}
                          </span>
                          {isSenior && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-amber-400/15 text-amber-300 border border-amber-400/30">
                              Senior
                            </span>
                          )}
                        </div>
                        {team.debut_date && (
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Calendar className="w-2.5 h-2.5" />
                            <span>Debut: {fmtDate(team.debut_date)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Numeric stats */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="font-mono font-black text-white text-xs">
                          {caps} <span className="text-[10px] font-normal text-muted-foreground">caps</span>
                        </div>
                        <div className="font-mono text-emerald-400 text-[11px] font-bold">
                          {goals} <span className="text-[10px] font-normal text-muted-foreground">goals</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Relative visual bar comparing caps vs highest */}
                  <div className="w-full h-1.5 rounded-full bg-navy-900 overflow-hidden border border-white/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                      style={{ width: `${Math.max(8, (caps / maxCaps) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
