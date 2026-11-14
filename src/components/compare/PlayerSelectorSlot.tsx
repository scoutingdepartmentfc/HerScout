import React from "react";
import { Plus, X, Search, Shield, ChevronDown } from "lucide-react";
import { EscudoEquipo } from "@/components/scouting/EscudoEquipo";
import { LogoLiga } from "@/components/scouting/LogoLiga";

export interface ComparePlayerItem {
  id: string;
  name: string;
  matchName?: string;
  photoUrl?: string | null;
  position?: string;
  teamName?: string;
  badgeUrl?: string | null;
  leagueName?: string | null;
  leagueLogoUrl?: string | null;
  color: string;
  metrics?: Record<string, [number, number]>;
  notes?: Record<string, number | null>;
  rating?: number | null;
  age?: number | null;
  minutesPlayed?: number;
}

interface PlayerSelectorSlotProps {
  player: ComparePlayerItem | null;
  color: string;
  slotIndex: number;
  onOpenSearch: () => void;
  onRemove: () => void;
}

export const PlayerSelectorSlot: React.FC<PlayerSelectorSlotProps> = ({
  player,
  color,
  slotIndex,
  onOpenSearch,
  onRemove,
}) => {
  if (!player) {
    return (
      <button
        type="button"
        onClick={onOpenSearch}
        className="flex-1 min-w-[220px] h-[106px] rounded-2xl border-2 border-dashed border-white/15 hover:border-primary/50 hover:bg-white/[0.02] flex flex-col items-center justify-center gap-2 transition-all group"
      >
        <div
          style={{ borderColor: color, color }}
          className="w-9 h-9 rounded-full border-2 flex items-center justify-center bg-white/5 group-hover:scale-110 transition-transform"
        >
          <Plus className="w-5 h-5" />
        </div>
        <div className="text-center">
          <span className="text-xs font-semibold text-slate-300 group-hover:text-white">
            Add Player {slotIndex + 1}
          </span>
          <span className="block text-[10px] text-slate-500">Click to search catalog</span>
        </div>
      </button>
    );
  }

  return (
    <div
      style={{
        borderColor: `${color}40`,
        background: `radial-gradient(circle at top right, ${color}12, #070e1e 80%)`,
      }}
      className="flex-1 min-w-[240px] h-[106px] rounded-2xl border p-3 flex items-center justify-between gap-3 shadow-lg relative group transition-all"
    >
      {/* Player photo / avatar */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative shrink-0">
          <div
            style={{ borderColor: color }}
            className="w-14 h-14 rounded-full overflow-hidden border-2 bg-slate-900 shadow-md flex items-center justify-center"
          >
            {player.photoUrl ? (
              <img
                src={player.photoUrl}
                alt={player.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <span className="font-bold text-white text-base">
                {player.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          {/* Team mini crest */}
          <div className="absolute -bottom-1 -right-1 bg-slate-950 p-0.5 rounded-full border border-white/20">
            <EscudoEquipo
              badgeUrl={player.badgeUrl}
              name={player.teamName}
              size={18}
            />
          </div>
        </div>

        {/* Player info */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              style={{ backgroundColor: color }}
              className="w-2.5 h-2.5 rounded-full inline-block shrink-0 shadow-sm"
            />
            <h4 className="text-sm font-bold text-white truncate" title={player.name}>
              {player.matchName || player.name}
            </h4>
          </div>

          <p className="text-[11px] text-slate-400 truncate mt-0.5">
            {player.position || "Player"} · {player.teamName || "Without club"}
          </p>

          <div className="flex items-center gap-2 mt-1">
            {player.rating != null && (
              <span
                style={{ borderColor: `${color}60`, color }}
                className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border bg-black/40"
              >
                OVR {Math.round(player.rating)}
              </span>
            )}
            {player.age != null && (
              <span className="text-[10px] text-slate-400 font-mono">
                {player.age} yrs
              </span>
            )}
            {player.minutesPlayed != null && (
              <span className="text-[10px] text-slate-500 font-mono">
                {player.minutesPlayed}&apos;
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Remove button */}
      <button
        type="button"
        onClick={onRemove}
        className="w-7 h-7 rounded-full bg-white/5 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 flex items-center justify-center transition-colors shrink-0"
        title="Remove player from comparison"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

