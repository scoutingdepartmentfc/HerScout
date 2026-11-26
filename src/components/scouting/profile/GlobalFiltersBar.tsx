"use client";

import React from "react";
import { ExternalLink } from "lucide-react";

export interface FilterCompetition {
  id: string;
  name: string;
}

interface GlobalFiltersBarProps {
  competitions: FilterCompetition[];
  selectedCompetition: string; // "all" or competitionId
  onSelectCompetition: (id: string) => void;
  seasons: string[]; // unique season names e.g. ["2025/2026", "2024/2025"]
  selectedSeason: string; // season name or "all"
  onSelectSeason: (name: string) => void;
  metricMode: "per90" | "totals";
  onChangeMetricMode: (m: "per90" | "totals") => void;
  updatedAt?: string | null;
  sdUrl?: string | null;
}

export const GlobalFiltersBar: React.FC<GlobalFiltersBarProps> = ({
  competitions,
  selectedCompetition,
  onSelectCompetition,
  seasons,
  selectedSeason,
  onSelectSeason,
  metricMode,
  onChangeMetricMode,
  updatedAt,
  sdUrl,
}) => {
  const updatedStr = updatedAt
    ? new Date(updatedAt).toLocaleDateString("en-GB")
    : null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1 text-[11.5px] shrink-0">
      {/* Competition Filter */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[#8796b3] font-medium">Competition:</span>
        <button
          type="button"
          onClick={() => onSelectCompetition("all")}
          className={`rounded-full px-2.5 py-[3px] border text-[11px] font-semibold transition-colors ${
            selectedCompetition === "all"
              ? "border-[#f5b942] text-[#f5b942] bg-[#f5b94214]"
              : "border-[#1c2a45] bg-[#0b1426cc] text-[#e6edf7] hover:border-[#3b6ff5]/50"
          }`}
        >
          All
        </button>
        {competitions.map((comp) => (
          <button
            key={comp.id}
            type="button"
            onClick={() => onSelectCompetition(comp.id)}
            className={`rounded-full px-2.5 py-[3px] border text-[11px] font-semibold transition-colors ${
              selectedCompetition === comp.id
                ? "border-[#f5b942] text-[#f5b942] bg-[#f5b94214]"
                : "border-[#1c2a45] bg-[#0b1426cc] text-[#e6edf7] hover:border-[#3b6ff5]/50"
            }`}
          >
            {comp.name}
          </button>
        ))}
      </div>

      {/* Season Filter */}
      {seasons.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[#8796b3] font-medium ml-1">Season:</span>
          {seasons.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSelectSeason(s)}
              className={`rounded-full px-2.5 py-[3px] border text-[11px] font-semibold transition-colors ${
                selectedSeason === s
                  ? "border-[#f5b942] text-[#f5b942] bg-[#f5b94214]"
                  : "border-[#1c2a45] bg-[#0b1426cc] text-[#e6edf7] hover:border-[#3b6ff5]/50"
              }`}
            >
              {s}
            </button>
          ))}
          {seasons.length > 1 && (
            <button
              type="button"
              onClick={() => onSelectSeason("all")}
              className={`rounded-full px-2.5 py-[3px] border text-[11px] font-semibold transition-colors ${
                selectedSeason === "all"
                  ? "border-[#f5b942] text-[#f5b942] bg-[#f5b94214]"
                  : "border-[#1c2a45] bg-[#0b1426cc] text-[#e6edf7] hover:border-[#3b6ff5]/50"
              }`}
            >
              All
            </button>
          )}
        </div>
      )}

      {/* Metric Filter (Per 90' / Totals) */}
      <div className="flex items-center gap-1.5">
        <span className="text-[#8796b3] font-medium ml-1">Metric:</span>
        <button
          type="button"
          onClick={() => onChangeMetricMode("per90")}
          className={`rounded-full px-2.5 py-[3px] border text-[11px] font-semibold transition-colors ${
            metricMode === "per90"
              ? "border-[#f5b942] text-[#f5b942] bg-[#f5b94214]"
              : "border-[#1c2a45] bg-[#0b1426cc] text-[#e6edf7] hover:border-[#3b6ff5]/50"
          }`}
        >
          Per 90&apos;
        </button>
        <button
          type="button"
          onClick={() => onChangeMetricMode("totals")}
          className={`rounded-full px-2.5 py-[3px] border text-[11px] font-semibold transition-colors ${
            metricMode === "totals"
              ? "border-[#f5b942] text-[#f5b942] bg-[#f5b94214]"
              : "border-[#1c2a45] bg-[#0b1426cc] text-[#e6edf7] hover:border-[#3b6ff5]/50"
          }`}
        >
          Totals
        </button>
      </div>

      {/* Right Data Source Info */}
      <div className="ml-auto flex items-center gap-1.5 text-[10.5px] text-[#8796b3]">
        <span>
          Data: Opta{updatedStr ? ` · updated ${updatedStr}` : ""} · Profile source:
        </span>
        {sdUrl ? (
          <a
            href={sdUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[#e6edf7] hover:text-[#f5b942] font-medium transition-colors"
          >
            Soccerdonna <ExternalLink className="w-2.5 h-2.5" />
          </a>
        ) : (
          <span>Soccerdonna</span>
        )}
      </div>
    </div>
  );
};
