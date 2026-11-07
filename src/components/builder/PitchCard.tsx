"use client";

import React from "react";
import { Bandera } from "@/components/scouting/Bandera";
import { EscudoEquipo } from "@/components/scouting/EscudoEquipo";

export interface PitchCardPlayer {
  id: string;
  name: string;
  matchName?: string;
  country?: string | null;
  photoUrl?: string | null;
  position: string;
  grupoDemarcacion?: string;
  teamId?: string | null;
  teamName: string;
  badgeUrl?: string | null;
  leagueName?: string | null;
  leagueLogoUrl?: string | null;
  notaGlobal?: number | null;
  score_general?: number | null;
  notaAtaque?: number | null;
  notaConstruccion?: number | null;
  notaDefensa?: number | null;
  notaBalonParado?: number | null;
  notaDisponibilidad?: number | null;
  notaFisico?: number | null;
  trend?: "up" | "neutral" | "down" | null;
  secondaryPositions?: string[];
}

interface PitchCardProps {
  player: PitchCardPlayer;
  assignedRole: string; // e.g. "LW", "ST", "CB", "GK"
  onClick?: () => void;
}

export const PitchCard: React.FC<PitchCardProps> = ({ player, assignedRole, onClick }) => {
  const rawScore = player.notaGlobal ?? player.score_general;
  const ovr =
    rawScore != null
      ? rawScore > 10
        ? Math.min(99, Math.max(1, Math.round(rawScore)))
        : Math.min(99, Math.max(1, Math.round(rawScore * 10)))
      : 75;

  const cardClipPath =
    "polygon(0% 12%, 8% 4%, 22% 1.5%, 50% 0%, 78% 1.5%, 92% 4%, 100% 12%, 100% 92%, 92% 98.5%, 78% 100%, 22% 100%, 8% 98.5%, 0% 92%)";

  return (
    <div
      onClick={onClick}
      className="group relative flex flex-col items-center cursor-pointer select-none transition-transform duration-200 hover:scale-110 hover:z-40"
      style={{
        filter: "drop-shadow(0 12px 20px rgba(0, 0, 0, 0.75))",
      }}
    >
      {/* Role tag marker above/below */}
      <div className="mb-1 px-2 py-0.5 rounded bg-black/75 border border-white/20 backdrop-blur-md shadow-md text-[10px] font-black tracking-wider text-emerald-400 uppercase">
        {assignedRole}
      </div>

      {/* Main FUT-Style Card */}
      <div className="relative w-28 h-40 sm:w-32 sm:h-44 md:w-36 md:h-52">
        {/* Trend Indicator */}
        {player.trend && (
          <div
            className="absolute -top-1 right-1 z-30 flex items-center justify-center w-5 h-5 rounded-full shadow-md border backdrop-blur-md"
            style={{
              background:
                player.trend === "up"
                  ? "linear-gradient(135deg, rgba(16, 185, 129, 0.95), rgba(5, 150, 105, 0.95))"
                  : player.trend === "neutral"
                  ? "linear-gradient(135deg, rgba(234, 179, 8, 0.95), rgba(202, 138, 4, 0.95))"
                  : "linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(185, 28, 28, 0.95))",
              borderColor: "rgba(255, 255, 255, 0.8)",
            }}
          >
            {player.trend === "up" && (
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            )}
            {player.trend === "neutral" && (
              <svg className="w-3 h-3 text-gray-900" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            )}
            {player.trend === "down" && (
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )}
          </div>
        )}

        {/* Card Body */}
        <div
          className="relative w-full h-full overflow-hidden shadow-2xl"
          style={{
            clipPath: cardClipPath,
            background:
              "linear-gradient(135deg, #093375 0%, #03204e 40%, #0d1e38 75%, #051021 100%)",
          }}
        >
          {/* Metallic texture stripes */}
          <div
            className="absolute inset-0 opacity-25 mix-blend-overlay pointer-events-none z-0"
            style={{
              backgroundImage: `repeating-linear-gradient(-45deg, rgba(255, 255, 255, 0.4) 0px, rgba(255, 255, 255, 0.4) 2px, transparent 2px, transparent 6px)`,
            }}
          />

          {/* Top Left: OVR and Position */}
          <div className="absolute top-3 left-2.5 z-20 flex flex-col items-center leading-none text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
            <span className="font-black text-xl sm:text-2xl tracking-tighter text-sky-100">
              {ovr}
            </span>
            <span className="mt-0.5 font-black text-[10px] sm:text-xs tracking-wider uppercase text-amber-300">
              {assignedRole}
            </span>
          </div>

          {/* Player Photo */}
          <div className="absolute inset-x-0 bottom-6 sm:bottom-7 top-1 z-10 flex items-end justify-center overflow-hidden pointer-events-none">
            {player.photoUrl ? (
              <img
                src={player.photoUrl}
                alt={player.name}
                className="h-[96%] w-auto max-w-[90%] object-contain object-bottom drop-shadow-[0_6px_12px_rgba(0,0,0,0.6)]"
                loading="lazy"
              />
            ) : (
              <div className="h-full flex items-center justify-center font-black text-slate-400 text-3xl">
                ⚽
              </div>
            )}
          </div>

          {/* Player Name Banner */}
          <div className="absolute bottom-5 sm:bottom-6 inset-x-0 z-20 px-1 text-center">
            <p className="text-[10px] sm:text-[11px] font-black uppercase tracking-tight text-white truncate drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
              {player.matchName || player.name.split(" ").slice(-1)[0]}
            </p>
          </div>

          {/* Bottom U-Base Badges (Flag, Club, League) */}
          <div className="absolute bottom-0 inset-x-0 z-20 flex justify-center pb-0.5 px-2">
            <div
              className="w-[92%] h-5 sm:h-6 flex items-center justify-around px-1.5 border border-white/95 shadow-md backdrop-blur-md"
              style={{
                background: "linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(235, 240, 248, 0.95) 100%)",
                borderRadius: "4px 4px 14px 14px",
                clipPath: "polygon(0% 0%, 100% 0%, 100% 70%, 88% 95%, 70% 100%, 30% 100%, 12% 95%, 0% 70%)",
              }}
            >
              <div className="flex items-center justify-center shrink-0 scale-75 sm:scale-90">
                <Bandera country={player.country} size="sm" />
              </div>
              <div className="h-3 w-[1px] bg-slate-300" />
              <div className="flex items-center justify-center shrink-0">
                <EscudoEquipo
                  teamId={player.teamId}
                  badgeUrl={player.badgeUrl}
                  name={player.teamName}
                  size={14}
                />
              </div>
              <div className="h-3 w-[1px] bg-slate-300" />
              <div className="flex items-center justify-center shrink-0 max-w-[36px]">
                {player.leagueLogoUrl ? (
                  <img
                    src={player.leagueLogoUrl}
                    alt={player.leagueName || "League"}
                    className="h-3 max-w-[30px] object-contain"
                  />
                ) : (
                  <span className="text-[8px] font-black text-navy-950 uppercase truncate">
                    {player.leagueName?.slice(0, 4) || "LEAG"}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
