"use client";

import React from "react";
import { Bandera } from "@/components/scouting/Bandera";
import { EscudoEquipo } from "@/components/scouting/EscudoEquipo";
import { getClubTheme } from "@/lib/clubThemes";

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

  const clubTheme = getClubTheme(player.teamName);

  const cardClipPath =
    "polygon(0% 12%, 8% 4%, 22% 1.5%, 50% 0%, 78% 1.5%, 92% 4%, 100% 12%, 100% 92%, 92% 98.5%, 78% 100%, 22% 100%, 8% 98.5%, 0% 92%)";

  return (
    <div
      onClick={onClick}
      className="group relative flex flex-col items-center cursor-pointer select-none transition-transform duration-200 hover:scale-110 hover:z-40"
      style={{
        filter: "drop-shadow(0 14px 22px rgba(0, 0, 0, 0.75))",
      }}
    >
      {/* Role tag marker above/below */}
      <div className="mb-1 px-2 py-0.5 rounded bg-black/80 border border-white/20 backdrop-blur-md shadow-md text-[10px] font-black tracking-wider text-emerald-400 uppercase">
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

        {/* Card Body with Dynamic Club Colors */}
        <div
          className="relative w-full h-full overflow-hidden shadow-2xl"
          style={{
            clipPath: cardClipPath,
            background: clubTheme.bg,
          }}
        >
          {/* Metallic texture stripes */}
          <div
            className="absolute inset-0 opacity-25 mix-blend-overlay pointer-events-none z-0"
            style={{
              backgroundImage: `repeating-linear-gradient(-45deg, rgba(255, 255, 255, 0.4) 0px, rgba(255, 255, 255, 0.4) 2px, transparent 2px, transparent 6px)`,
            }}
          />

          {/* Diagonal 3D Geometric Stripe matching CromoJugador */}
          <div className="absolute top-8 left-[-15%] right-[-15%] h-20 border-y border-white/20 bg-gradient-to-r from-white/10 via-white/20 to-white/10 -rotate-12 pointer-events-none z-0" />

          {/* Top: Header zone with OVR/Role (left) and Player Name (top right above head) */}
          <div className="absolute top-2 inset-x-2 z-20 flex items-start justify-between pointer-events-none">
            {/* OVR & Role */}
            <div
              className={`flex flex-col items-center leading-none ${
                clubTheme.textLight ? "text-white" : "text-[#10141a]"
              }`}
              style={{
                textShadow: clubTheme.textLight ? "0 2px 4px rgba(0,0,0,0.8)" : "0 1px 2px rgba(255,255,255,0.8)",
              }}
            >
              <span className="font-black text-xl sm:text-2xl tracking-tighter">
                {ovr}
              </span>
              <span
                className={`mt-0.5 font-black text-[10px] sm:text-xs tracking-wider uppercase ${
                  clubTheme.textLight ? "text-amber-300" : "text-[#1e2530]"
                }`}
              >
                {assignedRole}
              </span>
            </div>

            {/* Name Banner: escorado ligeramente hacia la izquierda para centrarse mejor sobre la cabeza */}
            <div className="flex-1 flex justify-center pl-2 pr-1 pt-0.5 max-w-[70%]">
              <span
                className={`text-[9px] sm:text-[10px] font-black uppercase tracking-tight text-center leading-tight line-clamp-2 px-1.5 py-0.5 rounded backdrop-blur-md border ${
                  clubTheme.textLight
                    ? "bg-black/60 border-white/20 text-white shadow-[0_2px_6px_rgba(0,0,0,0.7)]"
                    : "bg-white/80 border-black/20 text-slate-950 shadow-[0_2px_6px_rgba(0,0,0,0.25)]"
                }`}
                title={player.name}
              >
                {player.matchName || player.name}
              </span>
            </div>
          </div>

          {/* Player Photo */}
          <div className="absolute inset-x-0 bottom-6 sm:bottom-7 top-7 sm:top-8 z-10 flex items-end justify-center overflow-hidden pointer-events-none">
            {player.photoUrl ? (
              <img
                src={player.photoUrl}
                alt={player.name}
                className="h-[96%] w-auto max-w-[92%] object-contain object-bottom drop-shadow-[0_6px_12px_rgba(0,0,0,0.6)]"
                loading="lazy"
              />
            ) : (
              <div className="h-full flex items-center justify-center font-black text-slate-400 text-3xl">
                ⚽
              </div>
            )}
          </div>

          {/* Bottom U-Base Badges (Flag, Club, League) */}
          <div className="absolute bottom-0.5 inset-x-0 z-20 flex justify-center pb-0.5 px-1.5">
            <div
              className="w-[94%] h-7 sm:h-8 flex items-center justify-around px-1.5 border border-white/95 shadow-lg backdrop-blur-md"
              style={{
                background: "linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(235, 240, 248, 0.95) 100%)",
                borderRadius: "4px 4px 14px 14px",
                clipPath: "polygon(0% 0%, 100% 0%, 100% 70%, 88% 95%, 70% 100%, 30% 100%, 12% 95%, 0% 70%)",
              }}
            >
              {/* Country Flag */}
              <div className="flex items-center justify-center shrink-0 scale-90 sm:scale-100">
                <Bandera country={player.country} size="sm" />
              </div>

              <div className="h-4 w-[1px] bg-slate-300" />

              {/* Club Crest (2x bigger: from size 14 to size 28) */}
              <div
                className="flex items-center justify-center shrink-0"
                style={{
                  filter: "drop-shadow(0 1px 3px rgba(0, 0, 0, 0.35))",
                }}
              >
                <EscudoEquipo
                  teamId={player.teamId}
                  badgeUrl={player.badgeUrl}
                  name={player.teamName}
                  size={28}
                />
              </div>

              <div className="h-4 w-[1px] bg-slate-300" />

              {/* League Crest */}
              <div className="flex items-center justify-center shrink-0 max-w-[42px]">
                {player.leagueLogoUrl ? (
                  <img
                    src={player.leagueLogoUrl}
                    alt={player.leagueName || "League"}
                    className="h-4 max-w-[36px] object-contain"
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
