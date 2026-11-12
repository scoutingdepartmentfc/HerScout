"use client";

import React from "react";
import { Bandera } from "@/components/scouting/Bandera";
import { EscudoEquipo } from "@/components/scouting/EscudoEquipo";
import { PlayerSilhouette } from "@/components/scouting/PlayerSilhouette";
import { getClubTheme } from "@/lib/clubThemes";
import { usePitchScale, PITCH_CARD_W, PITCH_CARD_H } from "./StadiumPitch";

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

/** dataTransfer type used when dragging a player from the pitch to "My team". */
export const PLAYER_DRAG_TYPE = "application/x-herscout-player";

interface PitchCardProps {
  player: PitchCardPlayer;
  assignedRole: string; // e.g. "LW", "ST", "CB", "GK"
  onClick?: () => void;
  /** Lets the card be dragged (to "My team"). */
  draggable?: boolean;
  /** Scout's note on this player: shows a marker (and the text on hover). */
  note?: string;
  /** Custom drag data (makes the card draggable). */
  onDragStart?: React.DragEventHandler<HTMLDivElement>;
  /** On-screen scale when the card is scaled by a parent (keeps the name legible). */
  textScale?: number;
}

export const PitchCard: React.FC<PitchCardProps> = ({ player, assignedRole, onClick, draggable, note, onDragStart, textScale }) => {
  const rawScore = player.notaGlobal ?? player.score_general;
  const ovr =
    rawScore != null
      ? rawScore > 10
        ? Math.min(99, Math.max(1, Math.round(rawScore)))
        : Math.min(99, Math.max(1, Math.round(rawScore * 10)))
      : 75;

  const clubTheme = getClubTheme(player.teamName);
  // The card is laid out at its full design size and scaled to the space the pitch gives it.
  const scale = usePitchScale();
  // Keep the name legible when the card shrinks (never below ~7px on screen)
  const nameSize = Math.max(10, 7 / (textScale ?? scale));

  const cardClipPath =
    "polygon(0% 12%, 8% 4%, 22% 1.5%, 50% 0%, 78% 1.5%, 92% 4%, 100% 12%, 100% 92%, 92% 98.5%, 78% 100%, 22% 100%, 8% 98.5%, 0% 92%)";

  return (
    <div style={{ width: PITCH_CARD_W * scale, height: PITCH_CARD_H * scale }}>
    <div
      onClick={onClick}
      draggable={draggable || !!onDragStart}
      onDragStart={
        onDragStart ??
        (draggable
          ? (e) => {
              e.dataTransfer.setData(PLAYER_DRAG_TYPE, JSON.stringify(player));
              e.dataTransfer.effectAllowed = "copy";
            }
          : undefined)
      }
      className={`group relative flex flex-col items-center select-none transition-transform duration-200 hover:scale-105 hover:z-40 ${
        draggable || onDragStart ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      }`}
      style={{
        width: PITCH_CARD_W,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        filter: "drop-shadow(0 8px 14px rgba(0, 0, 0, 0.6))",
      }}
    >
      {/* Main FUT-Style Card (compact: the role is inside the card) */}
      <div className="relative w-32 h-40" title={note || undefined}>
        {note && (
          <div className="absolute -top-1 -left-1 z-30 flex items-center justify-center w-5 h-5 rounded-full bg-amber-400 border border-white/80 shadow-md">
            <svg className="w-3 h-3 text-gray-900" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z" />
              <path d="M15 3v6h6" />
            </svg>
          </div>
        )}
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
            className="absolute inset-0 opacity-15 mix-blend-overlay pointer-events-none z-0"
            style={{
              backgroundImage: `repeating-linear-gradient(-45deg, rgba(255, 255, 255, 0.4) 0px, rgba(255, 255, 255, 0.4) 2px, transparent 2px, transparent 6px)`,
            }}
          />

          {/* Diagonal 3D Geometric Stripe matching CromoJugador */}
          <div className="absolute top-6 left-[-15%] right-[-15%] h-14 border-y border-white/10 bg-gradient-to-r from-white/5 via-white/10 to-white/5 -rotate-12 pointer-events-none z-0" />

          {/* Top: Header zone with OVR/Role (left) and Player Name (top right above head) */}
          <div className="absolute top-1.5 inset-x-1.5 z-20 flex items-start justify-between pointer-events-none">
            {/* OVR & Role */}
            <div
              className={`flex flex-col items-center leading-none ${
                clubTheme.textLight ? "text-white" : "text-[#10141a]"
              }`}
              style={{
                textShadow: clubTheme.textLight ? "0 2px 4px rgba(0,0,0,0.8)" : "0 1px 2px rgba(255,255,255,0.8)",
              }}
            >
              <span className="font-black text-xl tracking-tighter">
                {ovr}
              </span>
              <span
                className={`font-black text-[10px] tracking-wider uppercase ${
                  clubTheme.textLight ? "text-amber-300" : "text-[#1e2530]"
                }`}
              >
                {assignedRole}
              </span>
            </div>

            {/* Name Banner: escorado ligeramente hacia la izquierda para centrarse mejor sobre la cabeza */}
            <div className="flex-1 flex justify-center pl-1.5 pt-0.5 max-w-[74%]">
              <span
                style={{ fontSize: nameSize }}
                className={`font-black uppercase tracking-tight text-center leading-tight line-clamp-2 px-1 py-px rounded backdrop-blur-md border ${
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
          <div className="absolute inset-x-0 bottom-5 top-6 z-10 flex items-end justify-center overflow-hidden pointer-events-none">
            {player.photoUrl ? (
              <img
                src={player.photoUrl}
                alt={player.name}
                className="h-full w-auto max-w-[96%] object-contain object-bottom drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]"
                loading="lazy"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-slate-500/70 drop-shadow-[0_4px_8px_rgba(0,0,0,0.3)]">
                <PlayerSilhouette className="w-20 h-20 scale-125" />
              </div>
            )}
          </div>

          {/* Bottom U-Base Badges (Flag, Club, League) */}
          <div className="absolute bottom-0.5 inset-x-0 z-20 flex justify-center px-1">
            <div
              className="w-[96%] h-6 flex items-center justify-around px-1 border border-white/95 shadow-md backdrop-blur-md"
              style={{
                background: "linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(235, 240, 248, 0.95) 100%)",
                borderRadius: "4px 4px 14px 14px",
                clipPath: "polygon(0% 0%, 100% 0%, 100% 70%, 88% 95%, 70% 100%, 30% 100%, 12% 95%, 0% 70%)",
              }}
            >
              {/* Country Flag */}
              <div className="flex items-center justify-center shrink-0">
                <Bandera country={player.country} size="sm" />
              </div>

              <div className="h-3 w-[1px] bg-slate-300" />

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
                  size={20}
                />
              </div>

              <div className="h-3 w-[1px] bg-slate-300" />

              {/* League Crest */}
              <div className="flex items-center justify-center shrink-0 max-w-[42px]">
                {player.leagueLogoUrl ? (
                  <img
                    src={player.leagueLogoUrl}
                    alt={player.leagueName || "League"}
                    className="h-3.5 max-w-[32px] object-contain"
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
    </div>
  );
};
