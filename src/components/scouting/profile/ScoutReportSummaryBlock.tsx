"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { ExpandableCard } from "./ExpandableCard";
import { PILLAR_BLOCKS_TO_SCORE, scoreColor } from "@/lib/scorePalette";

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

interface ScoutReportSummaryBlockProps {
  reports: ScoutReportSummaryItem[];
  onCreateReport: () => void;
}

const DEFAULT_PILLARS = ["Technique", "Game Vision", "Decision Making", "Pace", "Strength"];

export const ScoutReportSummaryBlock: React.FC<ScoutReportSummaryBlockProps> = ({
  reports,
  onCreateReport,
}) => {
  const router = useRouter();
  const [selectedIdx, setSelectedIdx] = useState(0);

  const report = reports[selectedIdx] || reports[0] || null;

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
          <span
            className="text-[9.5px] font-bold tracking-[0.06em] px-1.5 py-[2px] rounded border uppercase"
            style={{ background: "#3b6ff522", color: "#5b8cff", borderColor: "#3b6ff566" }}
          >
            No Reports
          </span>
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

  const starsNow = sp.ratingStars ?? (report.rating != null ? Number((report.rating / 2).toFixed(1)) : 4.0);
  const starsPot = sp.ratingPotentialStars ?? Math.min(5, Number((starsNow + 0.5).toFixed(1)));
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
      tag={`Latest · ${dateFmt}`}
      tagTone="blue"
      hideExpand
      onCardClick={() => router.push(`/reports/${report.id}`)}
      className="flex-1 cursor-pointer hover:border-[#5b8cff]/70 transition-colors"
      style={{
        background: "linear-gradient(160deg, #16244a, #0d172a 60%)",
        borderColor: "#3b6ff566",
      }}
      headerRight={
        reports.length > 1 ? (
          <select
            value={selectedIdx}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              setSelectedIdx(Number(e.target.value));
            }}
            className="bg-[#0b1426] border border-[#1c2a45] rounded px-1.5 py-0.5 text-[10.5px] text-[#8796b3] hover:text-white focus:outline-none"
          >
            {reports.map((r, idx) => (
              <option key={r.id} value={idx}>
                {idx === 0 ? `${reports.length} reports` : `Report #${reports.length - idx}`} (
                {new Date(r.observationDate || r.createdAt).toLocaleDateString("en-GB")})
              </option>
            ))}
          </select>
        ) : (
          <span className="text-[10.5px] text-[#8796b3]">1 report</span>
        )
      }
    >
      {/* Top Score Ring + Verdict + Metadata */}
      <div className="flex gap-3.5 items-center">
        <div
          className="w-[70px] h-[70px] rounded-full border-[5px] flex flex-col items-center justify-center shrink-0"
          style={{ borderColor: ringColor }}
        >
          <span className="text-[23px] font-extrabold leading-none text-[#e6edf7] tabular-nums">
            {scoutScore}
          </span>
          <span className="text-[9px] text-[#8796b3] mt-0.5 whitespace-nowrap">
            {starsNow}★ · pot {starsPot}★
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
          <div className="text-[10.5px] text-[#8796b3] mt-0.5 truncate">
            Scout: {report.scoutName}
            {report.matchFixture ? ` · Watched: ${report.matchFixture}` : ""}
          </div>
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
