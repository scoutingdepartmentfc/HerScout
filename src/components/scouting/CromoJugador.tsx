import React from "react";
import { Bandera } from "./Bandera";
import { EscudoEquipo } from "./EscudoEquipo";

export interface CromoPlayerProps {
  j: {
    player_id?: string;
    photo_url?: string | null;
    name: string;
    badge_url?: string | null;
    team_id?: string | null;
    team_name?: string;
    competition_name?: string | null;
    league_name?: string | null;
    league_logo_url?: string | null;
    country?: string | null;
    demarcacion?: string | null;
    score_general?: number | null;
    demarcacionesSecundarias?: string[];
  };
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const CromoJugador: React.FC<CromoPlayerProps> = ({
  j,
  size = "md",
  className = "",
}) => {
  const DEM_FC_MAP: Record<string, { code: string; subs: string[] }> = {
    Portero: { code: "GK", subs: [] },
    "Lateral Derecho": { code: "RB", subs: ["CB", "RM"] },
    "Central Derecho": { code: "CB", subs: ["RB", "CDM"] },
    "Central Izquierdo": { code: "CB", subs: ["LB", "CDM"] },
    "Lateral Izquierdo": { code: "LB", subs: ["CB", "LM"] },
    "Mediocentro Defensivo": { code: "CDM", subs: ["CM", "CB"] },
    Mediocentro: { code: "CM", subs: ["CDM", "CAM"] },
    Mediapunta: { code: "CAM", subs: ["CM", "RW"] },
    "Extremo Derecho": { code: "RW", subs: ["RM", "ST"] },
    "Extremo Izquierdo": { code: "LW", subs: ["LM", "ST"] },
    Delantero: { code: "ST", subs: ["CF", "LW"] },
    Delantera: { code: "ST", subs: ["CF", "LW"] },
    Centrocampista: { code: "CM", subs: ["CAM", "CDM"] },
    Defensa: { code: "CB", subs: ["RB", "LB"] },
  };

  const demInfo = DEM_FC_MAP[j.demarcacion || ""] || {
    code: (j.demarcacion?.slice(0, 3) || "CAM").toUpperCase(),
    subs: ["CM", "RW"],
  };

  const secondaryPositions =
    j.demarcacionesSecundarias && j.demarcacionesSecundarias.length > 0
      ? j.demarcacionesSecundarias.slice(0, 2)
      : demInfo.subs.slice(0, 2);

  const rawScore = j.score_general ? Number(j.score_general) : 7.5;
  const ovr = Math.min(99, Math.max(50, Math.round(48 + rawScore * 4.6)));

  const getClubColors = (name?: string) => {
    const n = (name || "").toLowerCase();
    if (n.includes("barcelona") || n.includes("barça")) {
      return {
        bg: "linear-gradient(135deg, #004d98 0%, #154284 35%, #7a1c32 70%, #a50044 100%)",
        overlay: "rgba(237, 187, 0, 0.15)",
        textLight: true,
      };
    }
    if (n.includes("chelsea")) {
      return {
        bg: "linear-gradient(135deg, #034694 0%, #001f5c 50%, #034694 100%)",
        overlay: "rgba(255, 255, 255, 0.15)",
        textLight: true,
      };
    }
    if (n.includes("arsenal")) {
      return {
        bg: "linear-gradient(135deg, #db0007 0%, #9c0004 50%, #023474 100%)",
        overlay: "rgba(255, 255, 255, 0.15)",
        textLight: true,
      };
    }
    if (n.includes("lyon")) {
      return {
        bg: "linear-gradient(135deg, #1b3866 0%, #002244 50%, #da291c 100%)",
        overlay: "rgba(255, 255, 255, 0.15)",
        textLight: true,
      };
    }
    if (n.includes("real madrid")) {
      return {
        bg: "linear-gradient(135deg, #ffffff 0%, #f0f2f5 40%, #e2e8f0 75%, #001c58 100%)",
        overlay: "rgba(238, 198, 67, 0.25)",
        textLight: false,
      };
    }
    // Neutral Platinum / EA FC Pro gradient
    return {
      bg: "linear-gradient(180deg, #d8dee4 0%, #cbd4dc 45%, #b4c0cc 70%, #9eabb8 100%)",
      overlay: "rgba(255, 255, 255, 0.4)",
      textLight: false,
    };
  };

  const clubTheme = getClubColors(j.team_name);

  const dims = {
    sm: "w-44 h-[245px] text-[10px]",
    md: "w-64 h-[356px] text-xs",
    lg: "w-72 h-[400px] text-sm",
  }[size];

  const cardClipPath =
    "polygon(0% 13%, 7% 5%, 22% 1.5%, 50% 0%, 78% 1.5%, 93% 5%, 100% 13%, 100% 92%, 93% 98.5%, 78% 100%, 22% 100%, 7% 98.5%, 0% 92%)";

  return (
    <div
      className={`relative select-none group transition-all duration-300 hover:scale-[1.02] ${dims} ${className}`}
      style={{
        filter:
          "drop-shadow(0 16px 24px rgba(0, 0, 0, 0.55)) drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4))",
      }}
    >
      {/* Secondary Positions Tab (EA FC Style Gold Badge) */}
      <div
        className="absolute top-[82px] -right-2.5 z-30 flex flex-col items-center justify-center px-2 py-1.5 min-w-[36px] shadow-xl transition-transform duration-200 hover:scale-105"
        style={{
          background:
            "linear-gradient(135deg, #fef08a 0%, #facc15 35%, #eab308 70%, #ca8a04 100%)",
          clipPath:
            "polygon(0% 0%, 82% 0%, 100% 18%, 100% 82%, 82% 100%, 0% 100%)",
          borderRight: "1px solid rgba(254, 240, 138, 0.9)",
          boxShadow:
            "0 4px 12px rgba(202, 138, 4, 0.45), 0 2px 4px rgba(0, 0, 0, 0.3)",
        }}
      >
        <span className="font-black text-[11px] leading-tight text-gray-900 drop-shadow-[0_1px_1px_rgba(255,255,255,0.6)]">
          {secondaryPositions[0] || "CAM"}
        </span>
        <div className="w-4/5 h-[1.5px] bg-amber-700/30 my-0.5 rounded-full" />
        <span className="font-black text-[11px] leading-tight text-gray-900 drop-shadow-[0_1px_1px_rgba(255,255,255,0.6)]">
          {secondaryPositions[1] || "RW"}
        </span>
      </div>

      {/* Main Card Shape */}
      <div
        className="relative w-full h-full overflow-hidden shadow-2xl"
        style={{
          clipPath: cardClipPath,
          background: clubTheme.bg,
        }}
      >
        {/* Metallic textures */}
        <div
          className="absolute inset-0 opacity-30 mix-blend-overlay pointer-events-none z-0"
          style={{
            backgroundImage: `
              repeating-linear-gradient(
                -45deg,
                rgba(255, 255, 255, 0.5) 0px,
                rgba(255, 255, 255, 0.5) 2px,
                transparent 2px,
                transparent 6px
              ),
              linear-gradient(135deg, rgba(255,255,255,0.7) 0%, rgba(200,210,220,0) 60%)
            `,
          }}
        />

        {/* Diagonal 3D Geometric Stripe */}
        <div className="absolute top-16 left-[-15%] right-[-15%] h-36 border-y-2 border-white/25 bg-gradient-to-r from-white/10 via-white/20 to-white/10 -rotate-12 pointer-events-none z-0" />

        {/* Top Left: OVR and Position */}
        <div
          className={`absolute top-6 left-4 z-20 flex flex-col items-center leading-none select-none ${
            clubTheme.textLight ? "text-white" : "text-[#181d22]"
          }`}
          style={{
            textShadow: clubTheme.textLight
              ? "0 2px 6px rgba(0,0,0,0.7)"
              : "0 1px 2px rgba(255,255,255,0.4)",
          }}
        >
          <span className="font-black text-3xl md:text-4xl tracking-tighter">
            {ovr}
          </span>
          <span
            className={`mt-0.5 font-black text-xs md:text-sm tracking-wider uppercase ${
              clubTheme.textLight ? "text-amber-300" : "text-[#2c333a]"
            }`}
          >
            {demInfo.code}
          </span>
        </div>

        {/* Real Player Silhouette / Photo */}
        <div className="absolute inset-x-0 bottom-[38px] top-3 z-10 flex items-end justify-center overflow-hidden pointer-events-none">
          {j.photo_url ? (
            <img
              src={j.photo_url}
              alt={j.name}
              className="h-[97%] w-auto max-w-[88%] object-contain object-bottom drop-shadow-[0_8px_16px_rgba(0,0,0,0.5)] transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          ) : (
            <div className="h-full flex items-center justify-center font-black text-white/50 text-5xl">
              ⚽
            </div>
          )}
        </div>

        {/* Bottom U-Base with Flag, Club Badge & League Crest */}
        <div className="absolute bottom-0.5 inset-x-0 z-20 flex justify-center pb-0 pt-2 px-3 bg-gradient-to-t from-black/40 via-black/10 to-transparent pointer-events-none">
          <div
            className="w-[88%] h-9 flex items-center justify-around px-3 border border-white/90 shadow-[0_8px_20px_rgba(0,0,0,0.35),0_2px_4px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.9)] backdrop-blur-md transition-transform duration-200 group-hover:scale-[1.03]"
            style={{
              background:
                "linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(245, 247, 250, 0.94) 100%)",
              borderRadius: "6px 6px 20px 20px",
              clipPath:
                "polygon(0% 0%, 100% 0%, 100% 70%, 88% 95%, 70% 100%, 30% 100%, 12% 95%, 0% 70%)",
            }}
          >
            {/* National Flag */}
            <div className="flex items-center justify-center shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)] -mt-0.5">
              <Bandera country={j.country} size="md" />
            </div>

            <div className="h-5 w-[1px] bg-slate-300/80" />

            {/* Club Crest */}
            <div
              className="flex items-center justify-center shrink-0"
              style={{
                filter: "drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))",
              }}
            >
              <EscudoEquipo
                teamId={j.team_id}
                badgeUrl={j.badge_url}
                name={j.team_name}
                size={27}
              />
            </div>

            <div className="h-5 w-[1px] bg-slate-300/80" />

            {/* League Badge / Code */}
            <div className="flex items-center justify-center shrink-0">
              <span className="text-[11px] font-black tracking-tight text-[#0f3460]">
                {j.league_name || j.competition_name || "LIGA F"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

