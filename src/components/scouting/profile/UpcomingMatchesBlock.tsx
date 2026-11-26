"use client";

import React, { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

export interface UpcomingMatchItem {
  id: string;
  date: string;
  week?: string | null;
  timeConfirmed?: boolean;
  venue?: string | null;
  isHome: boolean;
  competition: string;
  opponent: { id?: string; name: string; badgeUrl?: string | null };
  assignment: { id: string; scoutName: string; mode: "live" | "video"; status: string } | null;
}

interface UpcomingMatchesBlockProps {
  playerId: string;
  matches: UpcomingMatchItem[];
  defaultScoutName?: string;
  onUpdated: () => void;
}

export const UpcomingMatchesBlock: React.FC<UpcomingMatchesBlockProps> = ({
  playerId,
  matches,
  defaultScoutName = "Scout",
  onUpdated,
}) => {
  const [assignModalMatch, setAssignModalMatch] = useState<UpcomingMatchItem | null>(null);
  const [scoutName, setScoutName] = useState(defaultScoutName);
  const [mode, setMode] = useState<"live" | "video">("live");
  const [saving, setSaving] = useState(false);

  const assignedCount = matches.filter((m) => !!m.assignment).length;

  const openModal = (m: UpcomingMatchItem) => {
    setAssignModalMatch(m);
    setScoutName(m.assignment?.scoutName || defaultScoutName || "Scout");
    setMode(m.assignment?.mode || "live");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignModalMatch || !scoutName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/players/${playerId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: assignModalMatch.id,
          scoutName: scoutName.trim(),
          mode,
        }),
      });
      if (res.ok) {
        setAssignModalMatch(null);
        onUpdated();
      } else {
        const j = await res.json();
        alert(j.error || "Failed to save assignment");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUnassign = async () => {
    if (!assignModalMatch) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/players/${playerId}/assignments?matchId=${encodeURIComponent(assignModalMatch.id)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setAssignModalMatch(null);
        onUpdated();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        className="s1-card px-3 py-2.5 flex-1 flex flex-col min-h-0"
        style={{ borderColor: "#7166F266" }}
      >
        <div className="flex items-center gap-2 mb-2 shrink-0">
          <span className="s1-title text-[12px] text-[#e6edf7] whitespace-nowrap">
            Upcoming matches
          </span>
          <span
            className="text-[9.5px] font-bold tracking-[0.06em] px-1.5 py-[2px] rounded border uppercase"
            style={{ background: "#7166F222", color: "#a59cff", borderColor: "#7166F266" }}
          >
            {assignedCount}/{matches.length} assigned
          </span>
          <Link
            href="/matches"
            className="ml-auto text-[10.5px] font-semibold text-[#5b8cff] hover:underline whitespace-nowrap"
          >
            View in Matches →
          </Link>
        </div>

        {matches.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-xs text-[#8796b3] py-4">
            No upcoming fixtures scheduled for this club.
          </div>
        ) : (
          <div className="flex flex-col gap-[5px] justify-center flex-1">
            {matches.slice(0, 3).map((m) => {
              const dt = new Date(m.date);
              const dayNum = dt.toLocaleDateString("en-GB", { day: "2-digit" });
              const weekdayMonth = dt
                .toLocaleDateString("en-GB", { weekday: "short", month: "short" })
                .toUpperCase();
              const timeStr = m.timeConfirmed
                ? dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
                : "TBD";

              return (
                <div
                  key={m.id}
                  className="grid grid-cols-[48px_1fr_auto] gap-2.5 items-center bg-[#0b1426] border border-[#1c2a45] rounded-[7px] px-2 py-[5px]"
                >
                  <div className="text-center border-r border-[#1c2a45] pr-2 leading-tight">
                    <strong className="block text-[16px] font-extrabold text-[#e6edf7]">
                      {dayNum}
                    </strong>
                    <small className="text-[8.5px] text-[#8796b3] uppercase whitespace-nowrap">
                      {weekdayMonth}
                    </small>
                  </div>

                  <div className="min-w-0">
                    <div className="text-[10px] text-[#8796b3] truncate">
                      {m.competition}
                      {m.week ? ` · J${m.week}` : ""} · {timeStr}
                    </div>
                    <div className="text-[12px] font-bold text-[#e6edf7] truncate">
                      {m.isHome ? "vs " : "@ "}
                      {m.opponent.name}{" "}
                      {m.venue && (
                        <span className="text-[10px] font-normal text-[#5a6884]">
                          {m.venue} ({m.isHome ? "H" : "A"})
                        </span>
                      )}
                    </div>
                  </div>

                  {m.assignment ? (
                    <button
                      type="button"
                      onClick={() => openModal(m)}
                      className="text-[10.5px] font-bold px-2.5 py-[5px] rounded-[5px] whitespace-nowrap transition-colors"
                      style={{
                        background: "#6BE88F22",
                        color: "#6BE88F",
                        border: "1px solid #6BE88F66",
                      }}
                    >
                      ✓ {m.assignment.scoutName} · {m.assignment.mode}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openModal(m)}
                      className="text-[10.5px] font-bold px-2.5 py-[5px] rounded-[5px] bg-[#3B6FF5] hover:bg-[#5B8CFF] text-white whitespace-nowrap transition-colors"
                    >
                      + Assign scout
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {assignModalMatch && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setAssignModalMatch(null)}
        >
          <form
            onSubmit={handleSave}
            onClick={(e) => e.stopPropagation()}
            className="s1-card w-full max-w-md p-5 space-y-4 border-[#3b6ff5]/50 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#1c2a45] pb-2.5">
              <div>
                <div className="s1-title text-sm text-[#e6edf7]">Assign Scout</div>
                <div className="text-[11px] text-[#8796b3] mt-0.5">
                  {assignModalMatch.isHome ? "vs" : "@"} {assignModalMatch.opponent.name} ·{" "}
                  {new Date(assignModalMatch.date).toLocaleDateString("en-GB")}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAssignModalMatch(null)}
                className="w-7 h-7 rounded-md border border-[#1c2a45] bg-[#0b1426] text-[#8796b3] hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-[#8796b3] mb-1">
                  Scout Name
                </label>
                <input
                  type="text"
                  required
                  value={scoutName}
                  onChange={(e) => setScoutName(e.target.value)}
                  placeholder="e.g. J. Martínez"
                  className="w-full px-3 py-2 rounded-[6px] bg-[#070d1a] border border-[#1c2a45] text-[#e6edf7] focus:outline-none focus:border-[#3B6FF5]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#8796b3] mb-1">
                  Observation Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["live", "video"] as const).map((mOpt) => (
                    <button
                      key={mOpt}
                      type="button"
                      onClick={() => setMode(mOpt)}
                      className={`py-2 rounded-[6px] border font-bold uppercase tracking-wider text-[11px] transition-colors ${
                        mode === mOpt
                          ? "bg-[#3B6FF5]/25 border-[#3B6FF5] text-white"
                          : "bg-[#070d1a] border-[#1c2a45] text-[#8796b3]"
                      }`}
                    >
                      {mOpt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#1c2a45]">
              {assignModalMatch.assignment ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleUnassign}
                  className="text-xs font-semibold text-[#F05252] hover:underline"
                >
                  Remove assignment
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAssignModalMatch(null)}
                  className="px-3 py-1.5 rounded-[6px] border border-[#1c2a45] text-xs font-semibold text-[#8796b3] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 rounded-[6px] bg-[#3B6FF5] hover:bg-[#5B8CFF] text-xs font-bold text-white uppercase tracking-wider"
                >
                  {saving ? "Saving..." : "Save Assignment"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </>
  );
};
