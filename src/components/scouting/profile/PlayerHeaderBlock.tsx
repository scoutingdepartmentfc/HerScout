"use client";

import React, { useState } from "react";
import {
  Activity,
  Award,
  Bookmark,
  Compass,
  Crosshair,
  Flame,
  Pencil,
  Plus,
  Radio,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  Wind,
  Zap,
} from "lucide-react";
import { EscudoEquipo } from "@/components/scouting/EscudoEquipo";
import { getFlagUrl } from "@/components/scouting/Bandera";
import { PlayerSilhouette } from "@/components/scouting/PlayerSilhouette";
import { getPositionBadge } from "@/lib/positions";
import { getContractStatus, scoreColor, SCORE_ON_TEXT } from "@/lib/scorePalette";
import { getTeamColors } from "@/lib/teamColors";

interface PlayerHeaderBlockProps {
  player: any;
  overallScore: number | null;
  matchesCount: number | null;
  minutesCount: number | null;
  goalsCount: number;
  assistsCount: number;
  avgRating: number | null;
  internationalCaps: number | null;
  internationalGoals: number | null;
  isInWatchlist: boolean;
  watchlistBusy?: boolean;
  onEdit: () => void;
  onToggleWatchlist: () => void;
  onCreateReport: () => void;
}

const getPitchCoords = (pos?: string | null): { x: number; y: number } => {
  if (!pos) return { x: 50, y: 50 };
  const p = pos.toLowerCase();
  if (p.includes("porter") || p.includes("goalkeeper") || p === "gk") return { x: 10, y: 50 };
  if (p.includes("lateral derecho") || p.includes("right-back") || p === "rb" || p === "rwb") return { x: 26, y: 82 };
  if (p.includes("central derecho") || p === "rcb") return { x: 23, y: 62 };
  if (p.includes("central izquierdo") || p === "lcb") return { x: 23, y: 38 };
  if (p.includes("central") || p.includes("centre-back") || p === "cb") return { x: 23, y: 50 };
  if (p.includes("lateral izquierdo") || p.includes("left-back") || p === "lb" || p === "lwb") return { x: 26, y: 18 };
  if (p.includes("defensivo") || p.includes("defensive") || p === "cdm" || p === "dmf") return { x: 38, y: 50 };
  if (p.includes("mediocentro") || p.includes("central midfield") || p === "cm" || p === "cmf") return { x: 50, y: 50 };
  if (p.includes("mediapunta") || p.includes("attacking") || p === "cam" || p === "amf") return { x: 64, y: 50 };
  if (p.includes("extremo derecho") || p.includes("right winger") || p === "rw") return { x: 75, y: 82 };
  if (p.includes("extremo izquierdo") || p.includes("left winger") || p === "lw") return { x: 75, y: 18 };
  if (p.includes("delanter") || p.includes("striker") || p.includes("forward") || p === "st" || p === "cf") return { x: 86, y: 50 };
  return { x: 50, y: 50 };
};

const isLightColor = (hex: string): boolean => {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.55;
};

const getProfileIcon = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes("creative") || n.includes("classic 10")) return Sparkles;
  if (n.includes("complete") || n.includes("balance")) return Compass;
  if (n.includes("box to box") || n.includes("box-to-box")) return Activity;
  if (n.includes("stopper") || n.includes("defensive") || n.includes("classic cb")) return Shield;
  if (n.includes("control")) return Radio;
  if (n.includes("offensive") || n.includes("attacking")) return Flame;
  if (n.includes("arrival") || n.includes("second striker")) return TrendingUp;
  if (n.includes("inverted")) return Zap;
  if (n.includes("winger")) return Wind;
  if (n.includes("false 9") || n.includes("number 9")) return Target;
  if (n.includes("gk")) return Crosshair;
  return Award;
};

export const PlayerHeaderBlock: React.FC<PlayerHeaderBlockProps> = ({
  player,
  overallScore,
  matchesCount,
  minutesCount,
  goalsCount,
  assistsCount,
  avgRating,
  internationalCaps,
  internationalGoals,
  isInWatchlist,
  watchlistBusy = false,
  onEdit,
  onToggleWatchlist,
  onCreateReport,
}) => {
  const [imgError, setImgError] = useState(false);

  const primaryBadge = getPositionBadge(player.primaryPosition);
  const secondaryList: string[] = (player.otherPositions || [])
    .filter((x: string) => x && x !== "-" && x !== player.primaryPosition)
    .slice(0, 2);

  const age = player.birthDate
    ? Math.floor((Date.now() - new Date(player.birthDate).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;
  const dobFmt = player.birthDate ? new Date(player.birthDate).toLocaleDateString("en-GB") : null;
  const contractFmt = player.contractUntil ? new Date(player.contractUntil).toLocaleDateString("en-GB") : "—";
  const contractInfo = getContractStatus(player.contractUntil);

  const fmtValue = (v: number | null | undefined) =>
    v ? (v >= 1_000_000 ? `€${(v / 1_000_000).toFixed(2)}m` : `€${Math.round(v / 1000)}k`) : "—";

  const flagUrl = getFlagUrl(player.country, 80);
  const secondNat = (player.citizenship || []).find(
    (c: string) => c && c.toLowerCase() !== (player.country || "").toLowerCase()
  );

  const primaryCoords = getPitchCoords(player.primaryPosition);
  const secondaryCoords = secondaryList.map((pos) => ({ pos, ...getPitchCoords(pos) }));
  const clubColors = getTeamColors(player.teamName);
  const hasCustomClub = !(clubColors.primary === "#FFFFFF" && clubColors.secondary === "#0F172A");
  const photoBg = hasCustomClub
    ? `linear-gradient(160deg, ${clubColors.primary}, ${clubColors.secondary})`
    : "linear-gradient(160deg, #2b4fa8, #8a1d4b)";
  const lightBg = hasCustomClub && isLightColor(clubColors.primary);
  const ovrColor = lightBg ? "#0A0A14" : "#FFFFFF";
  const posColor = lightBg ? "#78350F" : "#f5b942";
  const sortedProfiles = player.perfiles
    ? Object.entries<number>(player.perfiles)
        .filter(([, val]) => Number.isFinite(Number(val)))
        .sort((a, b) => Number(b[1]) - Number(a[1]))
    : [];

  return (
    <div
      className="relative rounded-[12px] border border-[#1c2a45] px-4 py-2.5 flex flex-wrap xl:flex-nowrap items-center gap-4 xl:gap-5 overflow-hidden shrink-0"
      style={{
        background: "linear-gradient(100deg, #3a1030 0%, #151f3d 38%, #0d172a 100%)",
      }}
    >
      {/* Ambient right glow */}
      <div
        className="pointer-events-none absolute -right-14 -top-20 w-[420px] h-[300px] rounded-full opacity-70"
        style={{ background: "radial-gradient(circle, rgba(59,111,245,0.2), transparent 65%)" }}
      />

      {/* Photo Card with OVR & POS */}
      <div
        className="relative w-[96px] h-[112px] xl:w-[110px] xl:h-[126px] rounded-[10px] border border-white/15 overflow-hidden shrink-0 shadow-lg"
        style={{ background: photoBg }}
      >
        <div className="relative z-10 px-1.5 pt-1 leading-none">
          <div
            className="text-[21px] xl:text-[23px] font-extrabold tracking-tight"
            style={{
              color: ovrColor,
              textShadow: lightBg ? "0 1px 2px rgba(255,255,255,0.4)" : "0 1px 4px rgba(0,0,0,0.6)",
            }}
          >
            {overallScore != null ? Math.round(overallScore) : "—"}
          </div>
          <div
            className="text-[9.5px] font-extrabold tracking-[0.06em] uppercase mt-[1px]"
            style={{
              color: posColor,
              textShadow: lightBg ? "none" : "0 1px 3px rgba(0,0,0,0.6)",
            }}
          >
            {primaryBadge.code}
          </div>
        </div>
        {player.photoUrl && !imgError ? (
          <img
            src={player.photoUrl}
            alt={player.matchName || player.name}
            onError={() => setImgError(true)}
            className="absolute inset-0 w-full h-full object-cover object-top"
            style={{ maskImage: "linear-gradient(to top, black 70%, rgba(0,0,0,0.4) 100%)" }}
          />
        ) : (
          <div className="absolute inset-x-2 -bottom-1 h-[84px] text-white/25 pointer-events-none">
            <PlayerSilhouette className="w-full h-full" />
          </div>
        )}
      </div>

      {/* Identity + Club & Flag Big Badges + Position Chips */}
      <div className="min-w-0 flex-1 xl:flex-none">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-2xl xl:text-[30px] font-extrabold uppercase tracking-[0.01em] text-[#e6edf7] leading-none">
            {player.matchName || player.name}
          </h1>
          {player.shirtNumber != null && (
            <span className="text-[14px] font-extrabold bg-[#8a1d4b] border border-white/20 rounded-[6px] px-2 py-0.5 text-white leading-none">
              #{player.shirtNumber}
            </span>
          )}
        </div>
        <div className="text-[12.5px] text-[#8796b3] mt-0.5 truncate">
          {player.name}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-2">
          {/* Large Club Crest (~46px) */}
          <div className="flex items-center gap-2.5 bg-[#0b1426cc] border border-[#1c2a45] rounded-[10px] py-1 px-2.5">
            <EscudoEquipo
              teamId={player.teamId}
              badgeUrl={player.badgeUrl}
              name={player.teamName}
              size={42}
            />
            <div className="leading-tight min-w-0">
              <div className="text-[13.5px] font-bold text-[#e6edf7] truncate max-w-[170px]">
                {player.teamName || "Unattached"}
              </div>
              <div className="text-[10.5px] text-[#8796b3] truncate max-w-[170px]">
                {player.leagueName || "No current league"}
              </div>
            </div>
          </div>

          {/* Large Nationality Flag (~48x32px) */}
          <div className="flex items-center gap-2.5 bg-[#0b1426cc] border border-[#1c2a45] rounded-[10px] py-1 px-2.5">
            <div className="w-[46px] h-[30px] rounded-[4px] overflow-hidden ring-1 ring-white/20 bg-[#132145] flex items-center justify-center shrink-0">
              {flagUrl ? (
                <img
                  src={flagUrl}
                  alt={player.country || "Country"}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-sm">🌐</span>
              )}
            </div>
            <div className="leading-tight">
              <div className="text-[13.5px] font-bold text-[#e6edf7]">
                {player.country || "—"}
              </div>
              <div className="text-[10.5px] text-[#8796b3]">
                Nationality · 2nd: {secondNat || "—"}
              </div>
            </div>
          </div>

          {/* Position Chips */}
          <span className="border border-[#f5b94266] bg-[#0b1426cc] text-[#f5b942] rounded-full px-2.5 py-1 text-[11.5px] font-medium">
            {primaryBadge.code} · {primaryBadge.fullEn}
          </span>
          {secondaryList.map((secPos) => {
            const sb = getPositionBadge(secPos);
            return (
              <span
                key={secPos}
                className="border border-[#1c2a45] bg-[#0b1426cc] text-[#e6edf7] rounded-full px-2.5 py-1 text-[11.5px]"
                title={sb.fullEn}
              >
                {sb.code} (sec.)
              </span>
            );
          })}
        </div>
      </div>

      {/* 4x2 Facts Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-2 xl:ml-2 xl:pl-5 xl:border-l border-[#1c2a45] shrink-0">
        <div>
          <div className="text-[9.5px] uppercase tracking-[0.08em] text-[#8796b3]">Age</div>
          <div className="text-[14px] font-semibold text-[#e6edf7] mt-0.5 whitespace-nowrap">
            {age ?? "—"}
            {dobFmt && <span className="text-[11px] font-normal text-[#8796b3] ml-1">({dobFmt})</span>}
          </div>
        </div>

        <div>
          <div className="text-[9.5px] uppercase tracking-[0.08em] text-[#8796b3]">Contract until</div>
          <div
            className="text-[14px] font-semibold mt-0.5 whitespace-nowrap"
            style={{ color: contractInfo.color }}
          >
            {contractFmt}
            {contractInfo.label && (
              <span className="text-[10px] font-medium ml-1">{contractInfo.label}</span>
            )}
          </div>
        </div>

        <div>
          <div className="text-[9.5px] uppercase tracking-[0.08em] text-[#8796b3]">Market value</div>
          <div className="text-[14px] font-semibold text-[#f5b942] mt-0.5 whitespace-nowrap">
            {fmtValue(player.marketValue)}
          </div>
        </div>

        <div>
          <div className="text-[9.5px] uppercase tracking-[0.08em] text-[#8796b3]">Height · Foot</div>
          <div className="text-[14px] font-semibold text-[#e6edf7] mt-0.5 whitespace-nowrap">
            {player.height ? `${player.height} cm` : "—"} · {player.preferredFoot || "—"}
          </div>
        </div>

        <div>
          <div className="text-[9.5px] uppercase tracking-[0.08em] text-[#8796b3]">Matches</div>
          <div className="text-[14px] font-semibold text-[#e6edf7] mt-0.5 whitespace-nowrap">
            {matchesCount ?? "—"}
            {minutesCount != null && minutesCount > 0 && (
              <span className="text-[11px] font-normal text-[#8796b3] ml-1">· {minutesCount}&apos;</span>
            )}
          </div>
        </div>

        <div>
          <div className="text-[9.5px] uppercase tracking-[0.08em] text-[#8796b3]">Goals · Assists</div>
          <div className="text-[14px] font-semibold text-[#e6edf7] mt-0.5 whitespace-nowrap">
            {goalsCount} · {assistsCount}
          </div>
        </div>

        <div>
          <div className="text-[9.5px] uppercase tracking-[0.08em] text-[#8796b3]">Avg rating</div>
          <div className="mt-0.5">
            {avgRating != null ? (
              <span
                className="inline-block min-w-[38px] text-center rounded-[4px] px-1.5 py-[1px] text-[13px] font-extrabold font-mono"
                style={{
                  backgroundColor: scoreColor(avgRating, 10),
                  color: SCORE_ON_TEXT,
                }}
              >
                {avgRating.toFixed(2)}
              </span>
            ) : (
              <span className="text-[14px] font-semibold text-[#8796b3]">—</span>
            )}
          </div>
        </div>

        <div>
          <div className="text-[9.5px] uppercase tracking-[0.08em] text-[#8796b3]">International</div>
          <div className="text-[14px] font-semibold text-[#e6edf7] mt-0.5 whitespace-nowrap">
            {internationalCaps != null && internationalCaps > 0
              ? `${internationalCaps} caps · ${internationalGoals ?? 0} g`
              : "—"}
          </div>
        </div>
      </div>

      {/* Tactical Profiles (between Facts Grid and Mini Pitch, filling available space) */}
      {sortedProfiles.length > 0 && (
        <div className="hidden lg:flex flex-col justify-center gap-2 xl:pl-5 xl:border-l border-[#1c2a45] flex-1 min-w-[210px]">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#8796b3]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] shadow-[0_0_6px_rgba(52,211,153,0.85)]" />
              Tactical Profiles
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-[1px] rounded bg-white/[0.06] text-[#f5b942] border border-[#f5b942]/30">
              {primaryBadge.code}
            </span>
          </div>

          <div className="flex items-stretch gap-2 w-full">
            {sortedProfiles.map(([profName, rawScore], idx) => {
              const val = Math.max(0, Math.min(100, Number(rawScore)));
              const isTop = idx === 0;
              const Icon = getProfileIcon(profName);
              const liquidColor = isTop ? "rgba(52, 211, 153, 0.34)" : "rgba(59, 111, 245, 0.32)";
              const liquidTopColor = isTop ? "rgba(107, 232, 143, 0.55)" : "rgba(91, 140, 255, 0.50)";

              return (
                <div
                  key={profName}
                  title={`${profName}: ${val.toFixed(1)}%`}
                  className={`group relative flex-1 min-w-0 rounded-t-[4px] rounded-b-[10px] border overflow-hidden px-2 py-2 flex flex-col justify-between min-h-[72px] bg-[#081022]/90 shadow-inner transition-transform duration-200 hover:-translate-y-[1px] ${
                    isTop ? "border-[#34d399]/55" : "border-[#253759]"
                  }`}
                >
                  {/* Glass left-edge reflection */}
                  <div className="pointer-events-none absolute inset-y-1 left-[2px] w-[2px] rounded-full bg-white/10 z-20" />

                  {/* Liquid fill rising from bottom */}
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 transition-all duration-500"
                    style={{
                      height: `${val}%`,
                      background: `linear-gradient(180deg, ${liquidTopColor} 0%, ${liquidColor} 100%)`,
                    }}
                  >
                    {/* Animated wave surface at top of liquid (moves on hover) */}
                    <div className="absolute -top-[5px] left-0 right-0 h-[6px] overflow-hidden">
                      <svg
                        viewBox="0 0 200 12"
                        preserveAspectRatio="none"
                        className="liquid-wave-track h-full"
                      >
                        <path
                          d="M0,6 Q25,0 50,6 T100,6 T150,6 T200,6 L200,12 L0,12 Z"
                          fill={liquidTopColor}
                        />
                      </svg>
                    </div>
                  </div>

                  <div className="relative z-10 flex items-center justify-between gap-1">
                    <Icon
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isTop ? "text-[#6BE88F]" : "text-[#5B8CFF]"
                      }`}
                    />
                    <span
                      className={`font-mono font-extrabold text-[12.5px] leading-none tabular-nums ${
                        isTop ? "text-[#6BE88F]" : "text-[#e6edf7]"
                      }`}
                    >
                      {val.toFixed(0)}%
                    </span>
                  </div>

                  <div
                    className={`relative z-10 text-[10px] leading-tight mt-2 truncate ${
                      isTop ? "font-bold text-white" : "font-semibold text-[#c8d3e6]"
                    }`}
                  >
                    {profName}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Mini Pitch */}
      <div
        className="hidden sm:block ml-auto relative w-[144px] h-[94px] rounded-[6px] border border-white/20 shrink-0 overflow-hidden"
        style={{
          background: "repeating-linear-gradient(90deg, #14532d 0 15px, #166534 15px 30px)",
        }}
        title="Positions played"
      >
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/35" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full border border-white/30" />
        <div className="absolute inset-y-3 left-0 w-4 border-r border-y border-white/30" />
        <div className="absolute inset-y-3 right-0 w-4 border-l border-y border-white/30" />

        {secondaryCoords.map((sc, i) => (
          <div
            key={`${sc.pos}-${i}`}
            style={{ left: `${sc.x}%`, top: `${sc.y}%` }}
            title={`Secondary: ${getPositionBadge(sc.pos).fullEn}`}
            className="absolute -translate-x-1/2 -translate-y-1/2 w-[9px] h-[9px] rounded-full bg-[#a3e635]/70 border border-white/75"
          />
        ))}
        <div
          style={{ left: `${primaryCoords.x}%`, top: `${primaryCoords.y}%` }}
          title={`Primary: ${primaryBadge.fullEn}`}
          className="absolute -translate-x-1/2 -translate-y-1/2 w-[12px] h-[12px] rounded-full bg-[#f5b942] border-2 border-white shadow-[0_0_8px_rgba(245,185,66,0.85)]"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex xl:flex-col gap-1.5 shrink-0 z-10 ml-auto xl:ml-0">
        <button
          type="button"
          onClick={onEdit}
          className="border border-[#1c2a45] bg-[#0b1426] hover:bg-[#132145] text-[#e6edf7] rounded-[6px] px-3 py-1.5 text-[11px] font-bold tracking-[0.06em] uppercase flex items-center justify-center gap-1.5 transition-colors"
        >
          <Pencil className="w-3 h-3" /> Edit
        </button>
        <button
          type="button"
          disabled={watchlistBusy}
          onClick={onToggleWatchlist}
          className={`border rounded-[6px] px-3 py-1.5 text-[11px] font-bold tracking-[0.06em] uppercase flex items-center justify-center gap-1.5 transition-colors ${
            isInWatchlist
              ? "border-[#f5b942]/60 bg-[#f5b942]/15 text-[#f5b942]"
              : "border-[#1c2a45] bg-[#0b1426] hover:bg-[#132145] text-[#e6edf7]"
          }`}
        >
          <Bookmark className={`w-3 h-3 ${isInWatchlist ? "fill-[#f5b942]" : ""}`} />
          {isInWatchlist ? "Watchlisted" : "Watchlist"}
        </button>
        <button
          type="button"
          onClick={onCreateReport}
          className="border border-[#3B6FF5] bg-[#3B6FF5] hover:bg-[#5B8CFF] text-white rounded-[6px] px-3 py-1.5 text-[11px] font-bold tracking-[0.06em] uppercase flex items-center justify-center gap-1.5 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Report
        </button>
      </div>
    </div>
  );
};
