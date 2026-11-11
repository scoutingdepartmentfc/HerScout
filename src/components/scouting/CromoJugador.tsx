import React from "react";
import { Bandera } from "./Bandera";
import { EscudoEquipo } from "./EscudoEquipo";
import { PlayerSilhouette } from "./PlayerSilhouette";

import { getClubTheme } from "@/lib/clubThemes";

export type TrendEvolution = "up" | "neutral" | "down" | null;

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
    trend?: TrendEvolution;
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
    Goalkeeper: { code: "GK", subs: [] },
    "Lateral Derecho": { code: "RB", subs: ["CB", "RM"] },
    "Right-Back": { code: "RB", subs: ["CB", "RM"] },
    "Central Derecho": { code: "CB", subs: ["RB", "CDM"] },
    "Central Izquierdo": { code: "CB", subs: ["LB", "CDM"] },
    "Centre-Back": { code: "CB", subs: ["RB", "LB"] },
    "Lateral Izquierdo": { code: "LB", subs: ["CB", "LM"] },
    "Left-Back": { code: "LB", subs: ["CB", "LM"] },
    "Mediocentro Defensivo": { code: "CDM", subs: ["CM", "CB"] },
    "Defensive Midfield": { code: "CDM", subs: ["CM", "CB"] },
    Mediocentro: { code: "CM", subs: ["CDM", "CAM"] },
    "Central Midfield": { code: "CM", subs: ["CDM", "CAM"] },
    Mediapunta: { code: "CAM", subs: ["CM", "RW"] },
    "Attacking Midfield": { code: "CAM", subs: ["CM", "RW"] },
    "Extremo Derecho": { code: "RW", subs: ["RM", "ST"] },
    "Right Winger": { code: "RW", subs: ["RM", "ST"] },
    "Extremo Izquierdo": { code: "LW", subs: ["LM", "ST"] },
    "Left Winger": { code: "LW", subs: ["LM", "ST"] },
    Delantero: { code: "ST", subs: ["CF", "LW"] },
    Delantera: { code: "ST", subs: ["CF", "LW"] },
    "Centre-Forward": { code: "ST", subs: ["CF", "LW"] },
    Centrocampista: { code: "CM", subs: ["CAM", "CDM"] },
    Midfielder: { code: "CM", subs: ["CAM", "CDM"] },
    Defensa: { code: "CB", subs: ["RB", "LB"] },
    Defender: { code: "CB", subs: ["RB", "LB"] },
  };

  const toShortCode = (pos: string) => {
    if (!pos) return "";
    if (pos.length <= 3 && pos === pos.toUpperCase()) return pos;
    if (DEM_FC_MAP[pos]) return DEM_FC_MAP[pos].code;
    const lower = pos.toLowerCase();
    if (lower.includes("defensive midfield") || lower.includes("defensivo")) return "CDM";
    if (lower.includes("attacking midfield") || lower.includes("mediapunta")) return "CAM";
    if (lower.includes("midfield") || lower.includes("mediocentro")) return "CM";
    if (lower.includes("centre-back") || lower.includes("central")) return "CB";
    if (lower.includes("fullback, right") || lower.includes("lateral derecho") || lower.includes("right-back")) return "RB";
    if (lower.includes("fullback, left") || lower.includes("lateral izquierdo") || lower.includes("left-back")) return "LB";
    if (lower.includes("winger, right") || lower.includes("extremo derecho") || lower.includes("right winger")) return "RW";
    if (lower.includes("winger, left") || lower.includes("extremo izquierdo") || lower.includes("left winger")) return "LW";
    if (lower.includes("striker") || lower.includes("forward") || lower.includes("delanter")) return "ST";
    if (lower.includes("goalkeeper") || lower.includes("porter")) return "GK";
    return pos.slice(0, 3).toUpperCase();
  };

  const demInfo = DEM_FC_MAP[j.demarcacion || ""] || {
    code: toShortCode(j.demarcacion || "CAM"),
    subs: ["CM", "RW"],
  };

  const secondaryPositions: string[] = (j.demarcacionesSecundarias || [])
    .map(toShortCode)
    .filter((code) => Boolean(code) && code !== demInfo.code)
    .slice(0, 2);

  const rawScore = j.score_general != null ? Number(j.score_general) : null;
  // If score is already on 0-100 scale (e.g. 61, 85), use it directly. If on 0-10 scale (e.g. 7.5), scale to 100.
  const ovr = rawScore != null
    ? (rawScore > 10 ? Math.min(99, Math.max(1, Math.round(rawScore))) : Math.min(99, Math.max(1, Math.round(rawScore * 10))))
    : 75;

  const clubTheme = getClubTheme(j.team_name);

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
      {/* Trend Evolution Indicator (Above Secondary Positions) */}
      {j.trend && (
        <div
          className="absolute -top-1 right-2 z-30 flex items-center justify-center w-7 h-7 rounded-full shadow-lg border backdrop-blur-md transition-transform duration-200 hover:scale-110"
          style={{
            background:
              j.trend === "up"
                ? "linear-gradient(135deg, rgba(16, 185, 129, 0.95) 0%, rgba(5, 150, 105, 0.95) 100%)"
                : j.trend === "neutral"
                ? "linear-gradient(135deg, rgba(234, 179, 8, 0.95) 0%, rgba(202, 138, 4, 0.95) 100%)"
                : "linear-gradient(135deg, rgba(239, 68, 68, 0.95) 0%, rgba(185, 28, 28, 0.95) 100%)",
            borderColor:
              j.trend === "up"
                ? "rgba(110, 231, 183, 0.8)"
                : j.trend === "neutral"
                ? "rgba(253, 224, 71, 0.8)"
                : "rgba(252, 165, 165, 0.8)",
            boxShadow:
              j.trend === "up"
                ? "0 4px 10px rgba(16, 185, 129, 0.45), 0 0 6px rgba(16, 185, 129, 0.3)"
                : j.trend === "neutral"
                ? "0 4px 10px rgba(234, 179, 8, 0.45), 0 0 6px rgba(234, 179, 8, 0.3)"
                : "0 4px 10px rgba(239, 68, 68, 0.45), 0 0 6px rgba(239, 68, 68, 0.3)",
          }}
          title={
            j.trend === "up"
              ? "Evolución último mes: Rendimiento alto o en ascenso"
              : j.trend === "neutral"
              ? "Evolución último mes: Rendimiento regular o medio"
              : "Evolución último mes: Rendimiento bajo o en descenso"
          }
        >
          {j.trend === "up" && (
            <svg
              className="w-4 h-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
            >
              <polyline points="18 15 12 9 6 15" />
            </svg>
          )}
          {j.trend === "neutral" && (
            <svg
              className="w-4 h-4 text-gray-900 drop-shadow-[0_1px_1px_rgba(255,255,255,0.4)]"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="14 7 19 12 14 17" />
            </svg>
          )}
          {j.trend === "down" && (
            <svg
              className="w-4 h-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
        </div>
      )}

      {/* Secondary Positions Tab (EA FC Style Gold Badge) */}
      {secondaryPositions.length > 0 && (
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
          {secondaryPositions.map((pos, idx) => (
            <React.Fragment key={pos}>
              {idx > 0 && <div className="w-4/5 h-[1.5px] bg-amber-700/30 my-0.5 rounded-full" />}
              <span className="font-black text-[11px] leading-tight text-gray-900 drop-shadow-[0_1px_1px_rgba(255,255,255,0.6)]">
                {pos}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}

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

        {/* Diagonal 3D Geometric Subtle Stripe */}
        <div className="absolute top-12 left-[-15%] right-[-15%] h-32 border-y border-slate-200/60 bg-gradient-to-r from-slate-100/30 via-slate-200/50 to-slate-100/30 -rotate-12 pointer-events-none z-0" />

        {/* Top Left: OVR and Position */}
        <div
          className={`absolute top-6 left-5 z-20 flex flex-col items-center leading-none select-none ${
            clubTheme.textLight ? "text-white" : "text-[#10141a]"
          }`}
          style={{
            textShadow: clubTheme.textLight
              ? "0 2px 6px rgba(0,0,0,0.7)"
              : "0 1px 2px rgba(255,255,255,0.8)",
          }}
        >
          <span className="font-black text-3xl md:text-4xl tracking-tighter">
            {ovr}
          </span>
          <span
            className={`mt-0.5 font-black text-xs md:text-sm tracking-wider uppercase ${
              clubTheme.textLight ? "text-amber-300" : "text-[#1e2530]"
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
              className="h-[97%] w-auto max-w-[88%] object-contain object-bottom drop-shadow-[0_8px_16px_rgba(0,0,0,0.25)] transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-slate-500/70 drop-shadow-[0_4px_8px_rgba(0,0,0,0.3)]">
              <PlayerSilhouette className="w-40 h-40 scale-125" />
            </div>
          )}
        </div>

        {/* Bottom U-Base with Flag, Club Badge & League Crest */}
        <div className="absolute bottom-0.5 inset-x-0 z-20 flex justify-center pb-0 pt-2 px-3 bg-gradient-to-t from-slate-300/40 via-transparent to-transparent pointer-events-none">
          <div
            className="w-[88%] h-9 flex items-center justify-around px-3 border border-white/95 shadow-[0_6px_16px_rgba(0,0,0,0.18),inset_0_1px_1px_rgba(255,255,255,1)] backdrop-blur-md transition-transform duration-200 group-hover:scale-[1.03]"
            style={{
              background:
                "linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(240, 244, 248, 0.95) 100%)",
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
                filter: "drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2))",
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

            {/* League Badge / Logo / Code */}
            <div className="flex items-center justify-center shrink-0 max-w-[70px]">
              {j.league_logo_url ? (
                <img
                  src={j.league_logo_url}
                  alt={j.league_name || "League"}
                  className="h-5 max-w-[55px] object-contain"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              ) : (
                <span className="text-[11px] font-black tracking-tight text-[#0f3460] truncate uppercase">
                  {j.league_name || j.competition_name || "LIGA F"}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

