"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { ExpandableCard } from "./ExpandableCard";
import { PILLAR_BLOCKS_TO_SCORE, scoreColor, SCORE_ON_TEXT } from "@/lib/scorePalette";
import { Stars } from "@/components/matchReport/controls";

export interface ScoutReportSummaryItem {
  id: string;
  createdAt: string;
  status: string;
  scoutName: string;
  rating: number | null;
  recommendation: string;
  tacticalNotes: string;
  strengths: string[];
  weaknesses: string[];
  matchFixture: string;
  competition: string;
  observationDate: string;
  spondaData?: any;
}

export interface MatchReportSummaryItem {
  id: string;
  matchId: string;
  date: string;
  home: string;
  away: string;
  score: string | null;
  scoutName: string;
  mode: "live" | "video";
  ownTier: string | null;
  opponentTier: string | null;
  tierDiff: number | null;
  matchRating: number | null;
}

export interface StarsConsensusInfo {
  now: number | null;
  potential: number | null;
  scouts: number;
  ratings: number;
}

interface ScoutReportSummaryBlockProps {
  reports: ScoutReportSummaryItem[];
  matchReports?: MatchReportSummaryItem[];
  stars?: StarsConsensusInfo | null;
  onCreateReport: () => void;
}

const ctxArrow = (d: number | null) => (d == null ? "" : d > 0 ? " ▲" : d < 0 ? " ▼" : " =");

const DEFAULT_PILLARS = ["Technique", "Game Vision", "Decision Making", "Pace", "Strength"];

export const ScoutReportSummaryBlock: React.FC<ScoutReportSummaryBlockProps> = ({
  reports: allReports,
  matchReports = [],
  stars = null,
  onCreateReport,
}) => {
  const router = useRouter();
  // Stars-only drafts (created from match reports) are not shown as full reports
  const reports = allReports.filter((r) => !r.spondaData?.starsOnly);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [tab, setTab] = useState<"full" | "match">(reports.length || !matchReports.length ? "full" : "match");

  const report = reports[selectedIdx] || reports[0] || null;

  const tabs = (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {(
        [
          ["full", `Full reports · ${reports.length}`],
          ["match", `Match reports · ${matchReports.length}`],
        ] as const
      ).map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => setTab(k)}
          className={`rounded-[6px] border px-2 py-[2px] text-[10.5px] whitespace-nowrap ${
            tab === k ? "border-[#5b8cff] text-white" : "border-[#1c2a45] text-[#8796b3] hover:text-white"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const cardStyle = { background: "linear-gradient(160deg, #16244a, #0d172a 60%)", borderColor: "#3b6ff566" };

  if (tab === "match") {
    return (
      <ExpandableCard title="Scout Report" hideExpand className="flex-1" style={cardStyle} headerRight={tabs}>
        {matchReports.length === 0 ? (
          <p className="flex-1 flex items-center justify-center text-center text-xs text-[#8796b3] py-6">
            No match reports yet — rate her from a match lineup (Matches → match → Match report).
          </p>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto s1-scroll-fade pr-1">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-[9px] uppercase tracking-[0.08em] text-[#5a6884] text-left">
                  <th className="py-1 font-semibold">Date</th>
                  <th className="py-1 font-semibold">Match</th>
                  <th className="py-1 font-semibold">Context</th>
                  <th className="py-1 font-semibold">Scout</th>
                  <th className="py-1 font-semibold text-right">/10</th>
                </tr>
              </thead>
              <tbody>
                {matchReports.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => router.push(`/matches/${encodeURIComponent(m.matchId)}/report`)}
                    className="border-t border-[#1c2a45] cursor-pointer hover:bg-white/[0.03]"
                  >
                    <td className="py-1 text-[#8796b3] whitespace-nowrap">{new Date(m.date).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" })}</td>
                    <td className="py-1 text-[#e6edf7] truncate max-w-[150px]" title={`${m.home} ${m.score ?? ""} ${m.away}`}>
                      {m.home} – {m.away}
                      <span className="text-[#5a6884]"> · {m.mode === "video" ? "Video" : "Live"}</span>
                    </td>
                    <td className="py-1 text-[#c8d3e6] whitespace-nowrap">
                      {m.ownTier || "T?"} v {m.opponentTier || "T?"}
                      {ctxArrow(m.tierDiff)}
                    </td>
                    <td className="py-1 text-[#c8d3e6] truncate max-w-[90px]">{m.scoutName}</td>
                    <td className="py-1 text-right">
                      {m.matchRating != null && (
                        <span className="rounded-[4px] px-1 font-extrabold" style={{ backgroundColor: scoreColor(m.matchRating, 10), color: SCORE_ON_TEXT }}>
                          {m.matchRating.toFixed(1)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ExpandableCard>
    );
  }

  if (!report) {
    return (
      <div
        className="s1-card px-3 py-2.5 flex-1 flex flex-col justify-between min-h-[220px]"
        style={{
          background: "linear-gradient(160deg, #16244a, #0d172a 60%)",
          borderColor: "#3b6ff566",
        }}
      >
        <div className="flex items-center gap-2">
          <span className="s1-title text-[12px] text-[#e6edf7]">Scout Report</span>
          <div className="ml-auto">{tabs}</div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center text-center py-6 px-4 gap-3">
          <p className="text-xs text-[#8796b3] max-w-[280px]">
            No full scouting report has been filed for this player yet.
          </p>
          <button
            type="button"
            onClick={onCreateReport}
            className="inline-flex items-center gap-1.5 bg-[#3B6FF5] hover:bg-[#5B8CFF] text-white text-[11px] font-bold uppercase tracking-[0.06em] px-3.5 py-2 rounded-[6px] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Create Scout Report
          </button>
        </div>
      </div>
    );
  }

  const sp = report.spondaData || {};

  // Compute 0-100 Scout Score (from spondaData.scoutScore, pillars, ratingStars, or report.rating)
  const scoutScore = (() => {
    if (typeof sp.scoutScore === "number") return Math.round(sp.scoutScore);
    if (Array.isArray(sp.pillars) && sp.pillars.length > 0) {
      const avg =
        sp.pillars.reduce((acc: number, p: any) => acc + (PILLAR_BLOCKS_TO_SCORE[Number(p.value)] ?? 62), 0) /
        sp.pillars.length;
      return Math.round(avg);
    }
    if (typeof sp.ratingStars === "number") return Math.round(sp.ratingStars * 20);
    if (report.rating != null) return Math.round(report.rating * 10);
    return 75;
  })();

  // Stars shown = average of each scout's latest value (SPEC §6.9); fall back to this report's own stars
  const ownNow = sp.ratingStars ?? (report.rating != null ? Math.round(report.rating) / 2 : null);
  const ownPot = sp.potentialStars ?? sp.ratingPotentialStars ?? null;
  const starsNow = stars?.now ?? ownNow;
  const starsPot = stars?.potential ?? ownPot;
  const starsHint = stars && stars.scouts > 0 ? `avg of ${stars.scouts} scout${stars.scouts === 1 ? "" : "s"} · ${stars.ratings} rating${stars.ratings === 1 ? "" : "s"}` : "this report";
  const reportNo = reports.length - selectedIdx;
  const ringColor = scoreColor(scoutScore, 100);

  const decisionLabel =
    sp.scoutDecision ||
    (report.recommendation === "sign_tier_a"
      ? "To Sign"
      : report.recommendation === "monitor_tier_b"
      ? "To Monitor"
      : report.recommendation === "pass"
      ? "To Decline"
      : "To Monitor");

  const decisionStyles =
    decisionLabel.toLowerCase().includes("sign")
      ? { bg: "#34d39922", border: "#34d39966", color: "#6BE88F", prefix: "✓ " }
      : decisionLabel.toLowerCase().includes("decline")
      ? { bg: "#f0525222", border: "#f0525266", color: "#F05252", prefix: "✕ " }
      : { bg: "#f5b94222", border: "#f5b94266", color: "#F4C35E", prefix: "• " };

  // 5 Pillar mini-bars (1-5 blocks)
  const pillarBars: { name: string; blocks: number }[] = DEFAULT_PILLARS.map((name) => {
    if (Array.isArray(sp.pillars)) {
      const found = sp.pillars.find((p: any) => p.pillar === name);
      if (found) return { name, blocks: Math.max(1, Math.min(5, Math.round(Number(found.value) / 2))) };
    }
    const base = Math.max(1, Math.min(5, Math.round(scoutScore / 20)));
    return { name, blocks: base };
  });

  // Pros & Cons lists (max 3 each)
  const parseList = (raw: string | string[] | undefined, fallback: string[]) => {
    if (Array.isArray(raw) && raw.length > 0) return raw.slice(0, 3);
    if (typeof raw === "string" && raw.trim()) {
      return raw
        .split(/\n|•|;/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3);
    }
    return fallback.slice(0, 3);
  };

  const prosList = parseList(sp.pros, report.strengths || []);
  const consList = parseList(sp.cons, report.weaknesses || []);
  const opinion = sp.scoutOpinion || report.tacticalNotes || "";
  const dateFmt = report.observationDate
    ? new Date(report.observationDate).toLocaleDateString("en-GB")
    : new Date(report.createdAt).toLocaleDateString("en-GB");

  const suitableTier = sp.tierNow || sp.clubsStatus || "—";

  return (
    <ExpandableCard
      title="Scout Report"
      hideExpand
      onCardClick={() => router.push(`/reports/${report.id}`)}
      className="flex-1 cursor-pointer hover:border-[#5b8cff]/70 transition-colors"
      style={cardStyle}
      headerRight={tabs}
    >
      {/* Report navigation: Report x of y */}
      <div className="flex items-center gap-1.5 mb-2 text-[10.5px] text-[#8796b3]" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          disabled={selectedIdx >= reports.length - 1}
          onClick={() => setSelectedIdx((i) => Math.min(reports.length - 1, i + 1))}
          className="w-5 h-5 rounded-[5px] border border-[#1c2a45] flex items-center justify-center hover:text-white disabled:opacity-30"
          aria-label="Previous report"
        >
          <ChevronLeft className="w-3 h-3" />
        </button>
        <b className="text-[#e6edf7]">
          Report {reportNo} of {reports.length}
        </b>
        <button
          type="button"
          disabled={selectedIdx <= 0}
          onClick={() => setSelectedIdx((i) => Math.max(0, i - 1))}
          className="w-5 h-5 rounded-[5px] border border-[#1c2a45] flex items-center justify-center hover:text-white disabled:opacity-30"
          aria-label="Next report"
        >
          <ChevronRight className="w-3 h-3" />
        </button>
        <span className="truncate">
          {dateFmt} · {report.scoutName}
          {report.status === "draft" ? " · draft" : ""}
        </span>
      </div>

      {/* Top Score Ring + Verdict + Metadata */}
      <div className="flex gap-3.5 items-center">
        <div
          className="w-[70px] h-[70px] rounded-full border-[5px] flex flex-col items-center justify-center shrink-0"
          style={{ borderColor: ringColor }}
        >
          <span className="text-[23px] font-extrabold leading-none text-[#e6edf7] tabular-nums">
            {scoutScore}
          </span>

        </div>

        <div className="min-w-0 flex-1">
          <span
            className="inline-block font-extrabold text-[11px] tracking-[0.08em] px-2.5 py-[3px] rounded-[5px] border uppercase"
            style={{
              background: decisionStyles.bg,
              borderColor: decisionStyles.border,
              color: decisionStyles.color,
            }}
          >
            {decisionStyles.prefix}
            {decisionLabel}
          </span>
          <div className="mt-1.5 text-[11.5px] text-[#e6edf7] truncate">
            Role: <strong>{sp.role || "—"}</strong> · Suitable for:{" "}
            <strong className="text-[#9d94ff]">{suitableTier}</strong>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-[#8796b3]" title={starsHint}>
            <span className="flex items-center gap-1">
              Now <Stars value={starsNow} tone="now" size={12} />
            </span>
            <span className="flex items-center gap-1">
              Pot <Stars value={starsPot} tone="potential" size={12} />
            </span>
          </div>
          <div className="text-[9.5px] text-[#5a6884] mt-0.5 truncate">{starsHint}</div>
        </div>
      </div>

      {/* 5 Pillar Mini-Bars */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2.5">
        {pillarBars.map((pb) => (
          <div key={pb.name} className="flex items-center justify-between text-[11px] gap-2">
            <span className="text-[#e6edf7] truncate">{pb.name}</span>
            <span className="flex gap-[3px] shrink-0">
              {[1, 2, 3, 4, 5].map((i) => (
                <i
                  key={i}
                  className="w-[11px] h-[6px] rounded-[2px] block"
                  style={{ backgroundColor: i <= pb.blocks ? "#5b8cff" : "#22304d" }}
                />
              ))}
            </span>
          </div>
        ))}
      </div>

      {/* Pros & Cons */}
      {(prosList.length > 0 || consList.length > 0) && (
        <div className="grid grid-cols-2 gap-3 mt-2.5 text-[11px]">
          <div className="min-w-0">
            <strong className="block text-[10px] tracking-[0.08em] uppercase text-[#34d399] mb-0.5">
              Pros
            </strong>
            {prosList.length > 0 ? (
              <ul className="space-y-0.5 text-[#c8d3e6]">
                {prosList.map((item, idx) => (
                  <li key={idx} className="truncate">
                    <span className="text-[#5a6884] mr-1">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-[#5a6884]">—</span>
            )}
          </div>
          <div className="min-w-0">
            <strong className="block text-[10px] tracking-[0.08em] uppercase text-[#f05252] mb-0.5">
              Cons
            </strong>
            {consList.length > 0 ? (
              <ul className="space-y-0.5 text-[#c8d3e6]">
                {consList.map((item, idx) => (
                  <li key={idx} className="truncate">
                    <span className="text-[#5a6884] mr-1">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-[#5a6884]">—</span>
            )}
          </div>
        </div>
      )}

      {/* One-line Opinion Quote */}
      {opinion && (
        <div className="mt-2 text-[11px] text-[#c8d3e6] leading-snug border-l-2 border-[#5b8cff] pl-2 line-clamp-2 italic">
          &ldquo;{opinion}&rdquo;
        </div>
      )}

      {/* Card Footer */}
      <div className="mt-auto pt-2 border-t border-[#1c2a45] flex items-center justify-between text-[11px]">
        <span className="text-[#8796b3]">Click the card → full-screen report</span>
        <span className="bg-[#3B6FF5] hover:bg-[#5B8CFF] text-white px-2.5 py-1 rounded-[6px] font-bold tracking-[0.05em] uppercase text-[10px]">
          Open report ⤢
        </span>
      </div>
    </ExpandableCard>
  );
};
