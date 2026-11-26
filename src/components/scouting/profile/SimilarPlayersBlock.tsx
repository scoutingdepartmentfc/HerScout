"use client";

import React from "react";
import Link from "next/link";
import { ExpandableCard } from "./ExpandableCard";
import { Bandera } from "@/components/scouting/Bandera";

export interface SimilarPlayerItem {
  id: string;
  name: string;
  photoUrl?: string | null;
  country?: string | null;
  teamName: string;
  badgeUrl?: string | null;
  age: number | null;
  position: string;
  similarity: number;
  form: "up" | "down" | "neutral" | null;
}

interface SimilarPlayersBlockProps {
  currentPlayerId: string;
  players: SimilarPlayerItem[];
  loading?: boolean;
}

export const SimilarPlayersBlock: React.FC<SimilarPlayersBlockProps> = ({
  currentPlayerId,
  players,
  loading = false,
}) => {
  const renderTable = (rows: SimilarPlayerItem[]) => (
    <table className="w-full border-collapse text-[11.5px]">
      <thead>
        <tr className="text-[9.5px] text-[#8796b3] uppercase tracking-[0.06em] border-b border-[#1c2a45]">
          <th className="text-left font-semibold py-[3px] px-1">Player</th>
          <th className="text-left font-semibold py-[3px] px-1">Similarity</th>
          <th className="text-left font-semibold py-[3px] px-1">Age</th>
          <th className="text-left font-semibold py-[3px] px-1">Pos</th>
          <th className="text-center font-semibold py-[3px] px-1">Form</th>
          <th className="py-[3px] px-1" />
        </tr>
      </thead>
      <tbody>
        {rows.map((sim) => {
          const isPivot = sim.position === "CDM" || sim.position === "DMF";
          const initials = sim.name
            .split(" ")
            .map((w) => w[0])
            .filter(Boolean)
            .slice(0, 2)
            .join("")
            .toUpperCase();

          const formGlyph =
            sim.form === "up" ? "▲" : sim.form === "down" ? "▼" : sim.form === "neutral" ? "■" : "—";
          const formColor =
            sim.form === "up" ? "#34d399" : sim.form === "down" ? "#f05252" : "#8796b3";

          return (
            <tr key={sim.id} className="border-b border-[#16223a] last:border-b-0 hover:bg-white/[0.02]">
              <td className="py-[4px] px-1 whitespace-nowrap">
                <Link href={`/players/${sim.id}`} className="flex items-center gap-2 group">
                  <div className="w-[26px] h-[26px] rounded-full bg-gradient-to-br from-[#2a3c63] to-[#1a2540] flex items-center justify-center text-[10px] font-bold text-[#8796b3] overflow-hidden shrink-0 border border-white/10">
                    {sim.photoUrl ? (
                      <img src={sim.photoUrl} alt={sim.name} className="w-full h-full object-cover object-top" />
                    ) : (
                      initials
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-[11px] uppercase text-[#e6edf7] group-hover:text-[#5b8cff] truncate max-w-[130px]">
                      {sim.name}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-[#8796b3] truncate max-w-[135px]">
                      {sim.country && <Bandera country={sim.country} size="xs" />}
                      <span className="truncate">{sim.teamName || "—"}</span>
                    </div>
                  </div>
                </Link>
              </td>

              <td className="py-[4px] px-1 whitespace-nowrap">
                <span className="inline-block align-middle w-[44px] h-[6px] rounded-[3px] bg-[#1a2640] relative mr-1.5 overflow-hidden">
                  <span
                    className="absolute inset-y-0 left-0 rounded-[3px] bg-[#5b8cff]"
                    style={{ width: `${Math.max(4, Math.min(100, sim.similarity))}%` }}
                  />
                </span>
                <strong className="font-bold text-[#e6edf7] tabular-nums">{sim.similarity}%</strong>
              </td>

              <td className="py-[4px] px-1 text-[#e6edf7] tabular-nums">{sim.age ?? "—"}</td>

              <td className="py-[4px] px-1">
                <span
                  className="text-[10px] font-bold px-1.5 py-[1px] rounded-[4px] border"
                  style={{
                    color: isPivot ? "#f5b942" : "#5b8cff",
                    borderColor: isPivot ? "#f5b942" : "#5b8cff",
                  }}
                >
                  {sim.position}
                </span>
              </td>

              <td className="py-[4px] px-1 text-center text-[12px]" style={{ color: formColor }}>
                {formGlyph}
              </td>

              <td className="py-[4px] px-1 text-right">
                <Link
                  href={`/compare?players=${currentPlayerId},${sim.id}`}
                  title={`Compare with ${sim.name}`}
                  className="inline-block text-[10.5px] font-semibold text-[#5b8cff] border border-[#3b6ff555] hover:bg-[#3b6ff5]/20 rounded-[4px] px-1.5 py-[1px] transition-colors"
                >
                  ⇄
                </Link>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <ExpandableCard
      title="Similar players"
      tag="Data match"
      tagTone="green"
      className="flex-none"
      expandedContent={
        players.length > 0 ? renderTable(players) : <p className="text-xs text-[#8796b3]">No similar players found.</p>
      }
    >
      {loading && players.length === 0 ? (
        <div className="py-8 text-center text-xs text-[#8796b3] animate-pulse">
          Finding similar profiles...
        </div>
      ) : players.length === 0 ? (
        <div className="py-8 text-center text-xs text-[#8796b3]">
          Not enough minutes in pool for similarity match.
        </div>
      ) : (
        renderTable(players.slice(0, 4))
      )}
    </ExpandableCard>
  );
};
