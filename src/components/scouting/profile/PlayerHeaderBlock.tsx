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
  const posColor = lightBg ? "#3b2f9e" : "#b9b3ff"; // primary position = purple (SPEC §1.6)
  const sortedProfiles = player.perfiles
    ? Object.entries<number>(player.perfiles)
        .filter(([, val]) => Number.isFinite(Number(val)))
        .sort((a, b) => Number(b[1]) - Number(a[1]))
    : [];
  // Always the same tile row: top 4 profiles, the rest listed in the tooltip
  const shownProfiles = sortedProfiles.slice(0, 4);
  const hiddenProfiles = sortedProfiles.slice(4);

  const dobShort = player.birthDate
    ? new Date(player.birthDate).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" })
    : null;
  const contractShort = player.contractUntil
    ? new Date(player.contractUntil).toLocaleDateString("en-GB", { month: "short", year: "2-digit" })
    : "—";

  const Fact = ({ label, children, title }: { label: string; children: React.ReactNode; title?: string }) => (
    <div className="min-w-0 rounded-[7px] bg-[#0b1426]/70 border border-[#1c2a45] px-2 py-[5px]" title={title}>
      <div className="text-[9px] uppercase tracking-[0.08em] text-[#8796b3] truncate">{label}</div>
      <div className="text-[13.5px] font-semibold text-[#e6edf7] leading-tight mt-[1px] truncate tabular-nums">
        {children}
      </div>
    </div>
  );

  return (
    <div
      className="relative rounded-[12px] border border-[#1c2a45] px-4 py-2.5 flex flex-wrap items-center gap-4 fit:grid fit:grid-cols-[110px_minmax(0,0.8fr)_minmax(0,1.3fr)_minmax(0,1.1fr)_150px_auto] fit:gap-4 overflow-hidden shrink-0"
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
        className="relative w-[96px] h-[112px] fit:w-[110px] fit:h-[126px] rounded-[10px] border border-white/15 overflow-hidden shrink-0 shadow-lg"
        style={{ background: photoBg }}
      >
        <div className="relative z-10 px-1.5 pt-1 leading-none">
          <div
            className="text-[21px] fit:text-[23px] font-extrabold tracking-tight"
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

      {/* Identity: name, club, nationality, positions */}
      <div className="min-w-0 flex-1 flex flex-col justify-center gap-1.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h1
              className="text-2xl fit:text-[27px] font-extrabold uppercase tracking-[0.01em] text-[#e6edf7] leading-none truncate"
              title={player.matchName || player.name}
            >
              {player.matchName || player.name}
            </h1>
            {player.shirtNumber != null && (
              <span className="text-[13px] font-extrabold bg-[#8a1d4b] border border-white/20 rounded-[6px] px-1.5 py-0.5 text-white leading-none shrink-0">
                #{player.shirtNumber}
              </span>
            )}
          </div>
          <div className="text-[11.5px] text-[#8796b3] mt-0.5 truncate">{player.name}</div>
        </div>

        {/* Club + nationality: compact one-line rows */}
        <div className="flex flex-col gap-[3px] min-w-0">
          <div
            className="flex items-center gap-1.5 min-w-0"
            title={`${player.teamName || "Unattached"} · ${player.leagueName || "No current league"}`}
          >
            <span className="shrink-0 w-[20px] flex justify-center">
              <EscudoEquipo teamId={player.teamId} badgeUrl={player.badgeUrl} name={player.teamName} size={20} />
            </span>
            <span className="text-[12px] font-bold text-[#e6edf7] truncate shrink">{player.teamName || "Unattached"}</span>
            <span className="text-[10px] text-[#8796b3] truncate shrink-[2] min-w-0">· {player.leagueName || "No league"}</span>
          </div>
          <div
            className="flex items-center gap-1.5 min-w-0"
            title={`${player.country || "—"}${secondNat ? ` · 2nd: ${secondNat}` : ""}`}
          >
            <span className="shrink-0 w-[20px] h-[14px] rounded-[2px] overflow-hidden ring-1 ring-white/20 bg-[#132145] flex items-center justify-center">
              {flagUrl ? (
                <img src={flagUrl} alt={player.country || "Country"} className="w-full h-full object-cover" />
              ) : (
                <span className="text-[9px]">🌐</span>
              )}
            </span>
            <span className="text-[12px] font-bold text-[#e6edf7] truncate shrink">{player.country || "—"}</span>
            {secondNat && <span className="text-[10px] text-[#8796b3] truncate shrink-[2] min-w-0">· {secondNat}</span>}
          </div>
        </div>

        {/* Position chips */}
        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          <span
            className="border border-[#7166F2] bg-[#7166F2]/20 text-[#c9c4ff] rounded-full px-2 py-[2px] text-[10.5px] font-semibold truncate"
            title={primaryBadge.fullEn}
          >
            {primaryBadge.code} · {primaryBadge.fullEn}
          </span>
          {secondaryList.map((secPos) => {
            const sb = getPositionBadge(secPos);
            return (
              <span
                key={secPos}
                className="border border-[#55B862]/60 bg-[#55B862]/10 text-[#8fe39a] rounded-full px-2 py-[2px] text-[10.5px] shrink-0"
                title={sb.fullEn}
              >
                {sb.code}
              </span>
            );
          })}
        </div>
      </div>

      {/* 4x2 Facts Grid (compact tiles) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 min-w-0 w-full fit:w-auto">
        <Fact label="Age" title={dobFmt ? `Born ${dobFmt}` : undefined}>
          {age ?? "—"}
          {dobShort && <span className="text-[10px] font-normal text-[#8796b3] ml-1">{dobShort}</span>}
        </Fact>
        <Fact label="Contract" title={`${contractFmt}${contractInfo.label ? ` ${contractInfo.label}` : ""}`}>
          <span style={{ color: contractInfo.color }}>
            {contractShort}
            {contractInfo.monthsLeft != null && (
              <span className="text-[10px] font-medium ml-1">
                {contractInfo.monthsLeft < 0 ? "exp." : `${contractInfo.monthsLeft}m`}
              </span>
            )}
          </span>
        </Fact>
        <Fact label="Value">
          <span className="text-[#f5b942]">{fmtValue(player.marketValue)}</span>
        </Fact>
        <Fact label="Height · Foot">
          {player.height ? `${player.height}` : "—"}
          <span className="text-[10px] font-normal text-[#8796b3]"> cm</span> · {player.preferredFoot?.slice(0, 1).toUpperCase() || "—"}
        </Fact>
        <Fact label="Matches · Min">
          {matchesCount ?? "—"}
          {minutesCount != null && minutesCount > 0 && (
            <span className="text-[10px] font-normal text-[#8796b3] ml-1">{minutesCount}&apos;</span>
          )}
        </Fact>
        <Fact label="Goals · Ast">
          {goalsCount} · {assistsCount}
        </Fact>
        <Fact label="Avg rating">
          {avgRating != null ? (
            <span
              className="inline-block min-w-[36px] text-center rounded-[4px] px-1 text-[12.5px] font-extrabold font-mono"
              style={{ backgroundColor: scoreColor(avgRating, 10), color: SCORE_ON_TEXT }}
            >
              {avgRating.toFixed(2)}
            </span>
          ) : (
            <span className="text-[#8796b3]">—</span>
          )}
        </Fact>
        <Fact label="Intl · Goals">
          {internationalCaps != null && internationalCaps > 0 ? `${internationalCaps} · ${internationalGoals ?? 0}` : "—"}
        </Fact>
      </div>

      {/* Tactical Profiles: fixed row of up to 4 equal "glasses" */}
      {sortedProfiles.length > 0 ? (
        <div className="hidden fit:flex flex-col justify-center gap-1.5 min-w-0 h-full">
          <div className="flex items-center justify-between gap-2">
            <span
              className="inline-flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#8796b3]"
              title={hiddenProfiles.length ? hiddenProfiles.map(([n, v]) => `${n}: ${Number(v).toFixed(0)}%`).join("\n") : undefined}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] shadow-[0_0_6px_rgba(52,211,153,0.85)]" />
              Tactical Profiles
              {hiddenProfiles.length > 0 && <span className="text-[#5a6884] normal-case">+{hiddenProfiles.length}</span>}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-[1px] rounded bg-[#7166F2]/15 text-[#c9c4ff] border border-[#7166F2]/50">
              {primaryBadge.code}
            </span>
          </div>

          <div
            className="grid gap-1.5 w-full"
            style={{ gridTemplateColumns: `repeat(${Math.max(1, shownProfiles.length)}, minmax(0, 1fr))` }}
          >
            {shownProfiles.map(([profName, rawScore], idx) => {
              const val = Math.max(0, Math.min(100, Number(rawScore)));
              const isTop = idx === 0;
              const Icon = getProfileIcon(profName);
              const liquidColor = isTop ? "rgba(52, 211, 153, 0.34)" : "rgba(59, 111, 245, 0.32)";
              const liquidTopColor = isTop ? "rgba(107, 232, 143, 0.55)" : "rgba(91, 140, 255, 0.50)";

              return (
                <div
                  key={profName}
                  title={`${profName}: ${val.toFixed(1)}%`}
                  className={`group relative min-w-0 h-[96px] rounded-t-[4px] rounded-b-[10px] border overflow-hidden px-1.5 py-1.5 flex flex-col justify-between bg-[#081022]/90 shadow-inner transition-transform duration-200 hover:-translate-y-[1px] ${
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
                    <div className="absolute -top-[5px] left-0 right-0 h-[6px] overflow-hidden">
                      <svg viewBox="0 0 200 12" preserveAspectRatio="none" className="liquid-wave-track h-full">
                        <path d="M0,6 Q25,0 50,6 T100,6 T150,6 T200,6 L200,12 L0,12 Z" fill={liquidTopColor} />
                      </svg>
                    </div>
                  </div>

                  <div className="relative z-10 flex items-center justify-between gap-1">
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${isTop ? "text-[#6BE88F]" : "text-[#5B8CFF]"}`} />
                    <span
                      className={`font-mono font-extrabold text-[12.5px] leading-none tabular-nums ${
                        isTop ? "text-[#6BE88F]" : "text-[#e6edf7]"
                      }`}
                    >
                      {val.toFixed(0)}%
                    </span>
                  </div>

                  <div
                    className={`relative z-10 text-[10px] leading-[1.15] line-clamp-3 break-words [text-shadow:0_1px_3px_rgba(0,0,0,0.7)] ${
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
      ) : (
        <div className="hidden fit:block" />
      )}

      {/* Mini Pitch */}
      <div
        className="hidden sm:block relative w-[150px] h-[98px] rounded-[6px] border border-white/20 shrink-0 overflow-hidden"
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
            className="absolute -translate-x-1/2 -translate-y-1/2 w-[9px] h-[9px] rounded-full bg-[#55B862] border border-white/75"
          />
        ))}
        <div
          style={{ left: `${primaryCoords.x}%`, top: `${primaryCoords.y}%` }}
          title={`Primary: ${primaryBadge.fullEn}`}
          className="absolute -translate-x-1/2 -translate-y-1/2 w-[12px] h-[12px] rounded-full bg-[#7166F2] border-2 border-white shadow-[0_0_8px_rgba(113,102,242,0.9)]"
        />
      </div>
      {/* Action Buttons */}
      <div className="flex fit:flex-col gap-1.5 shrink-0 z-10 ml-auto fit:ml-0">
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
