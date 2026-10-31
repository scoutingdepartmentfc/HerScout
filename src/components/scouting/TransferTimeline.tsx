"use client";

import React, { useState } from "react";
import { ArrowRight, ArrowUpRight, DollarSign, Repeat, Shield } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";

export interface TransferItem {
  date: string;
  season?: string | null;
  club_from?: string | null;
  club_to?: string | null;
  club_from_badge_url?: string | null;
  club_to_badge_url?: string | null;
  fee_text?: string | null;
  loan?: boolean | null;
}

interface TransferTimelineProps {
  transfers: TransferItem[];
}

export const TransferTimeline: React.FC<TransferTimelineProps> = ({ transfers }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const fmtDate = (dStr: string) => {
    if (!dStr) return "—";
    try {
      const d = new Date(dStr);
      return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    } catch {
      return dStr;
    }
  };

  return (
    <Card className="bg-[#070c18] border-border/80 shadow-2xl overflow-hidden h-full flex flex-col">
      <CardHeader className="py-3.5 px-5 border-b border-border/40 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
            <Repeat className="w-4 h-4 text-sky-400" />
            Transfer History
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Career club transfers & loan spells (Soccerdonna verified)
          </CardDescription>
        </div>
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-sky-500/10 text-sky-300 border border-sky-500/30">
          {transfers.length} moves
        </span>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 flex-1 flex flex-col justify-start">
        {transfers.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted-foreground">
            No transfer movements recorded.
          </div>
        ) : (
          <div className="space-y-3 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-gradient-to-b before:from-sky-500/40 before:via-border/60 before:to-transparent">
            {transfers.map((t, idx) => {
              const isHovered = hoveredIdx === idx;
              const isLoan = !!t.loan;
              const feeText = t.fee_text || (isLoan ? "Loan" : "Free transfer");

              return (
                <div
                  key={`${t.date}-${idx}`}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className={`relative pl-8 transition-all duration-200 group rounded-xl p-2.5 border ${
                    isHovered
                      ? "bg-navy-900/80 border-sky-400/40 shadow-lg shadow-sky-500/5"
                      : "bg-navy-950/50 border-border/40 hover:border-border/80"
                  }`}
                >
                  {/* Timeline Node Bullet */}
                  <div
                    className={`absolute left-2.5 top-4 -translate-x-1/2 w-3 h-3 rounded-full border-2 transition-transform duration-200 ${
                      isHovered
                        ? "bg-white border-sky-400 scale-125"
                        : "bg-navy-950 border-sky-500/70"
                    }`}
                  />

                  {/* Header: Date + Season + Fee Badge */}
                  <div className="flex items-center justify-between gap-2 text-[11px] mb-2">
                    <span className="font-mono text-muted-foreground flex items-center gap-1.5 font-medium">
                      {fmtDate(t.date)}
                      {t.season && (
                        <span className="px-1.5 py-0.2 rounded bg-white/5 border border-white/10 text-[10px]">
                          {t.season}
                        </span>
                      )}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                        isLoan
                          ? "bg-purple-500/15 text-purple-300 border-purple-500/30"
                          : feeText.toLowerCase().includes("free")
                          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                          : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                      }`}
                    >
                      <DollarSign className="w-2.5 h-2.5" />
                      {feeText}
                    </span>
                  </div>

                  {/* Visual Club From -> Club To Flow */}
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    {/* Club From */}
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-navy-900 border border-white/15 p-1 shrink-0 flex items-center justify-center overflow-hidden">
                        {t.club_from_badge_url ? (
                          <img
                            src={t.club_from_badge_url}
                            alt={t.club_from || "Club"}
                            className="w-full h-full object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                      </div>
                      <span className="text-xs text-slate-300 font-medium truncate" title={t.club_from || ""}>
                        {t.club_from || "Youth / Unknown"}
                      </span>
                    </div>

                    {/* Transfer Direction Arrow */}
                    <div className="px-1 shrink-0 flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full bg-sky-500/10 border border-sky-400/30 flex items-center justify-center text-sky-400 group-hover:bg-sky-500 group-hover:text-navy-950 transition-colors">
                        <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    {/* Club To */}
                    <div className="flex items-center gap-2 justify-end min-w-0">
                      <span className="text-xs text-white font-bold truncate text-right" title={t.club_to || ""}>
                        {t.club_to || "Unattached"}
                      </span>
                      <div className="w-7 h-7 rounded-full bg-navy-900 border border-white/20 p-1 shrink-0 flex items-center justify-center overflow-hidden shadow-sm">
                        {t.club_to_badge_url ? (
                          <img
                            src={t.club_to_badge_url}
                            alt={t.club_to || "Club"}
                            className="w-full h-full object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
