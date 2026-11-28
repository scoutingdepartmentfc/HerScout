"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Eye, NotebookPen } from "lucide-react";
import { useThemeContext } from "@/context/ThemeContext";
import { useCurrentScout } from "@/lib/useCurrentScout";
import { tapRatingBlock } from "@/lib/matchReportLogic";
import { LoadingState, ErrorState } from "@/components/ui/StatusStates";
import { EscudoEquipo } from "@/components/scouting/EscudoEquipo";
import { ScoutSwitcher } from "@/components/layout/ScoutSwitcher";
import { PitchLineup } from "@/components/matchReport/PitchLineup";
import { RatingPanel } from "@/components/matchReport/RatingPanel";
import { QuickRateList, type ListFilter } from "@/components/matchReport/QuickRateList";
import { draftFrom, draftToPayload, type Draft, type MatchContext } from "@/components/matchReport/types";

export default function MatchReportPage() {
  const params = useParams();
  const search = useSearchParams();
  const matchId = params?.id as string;
  const { currentClub } = useThemeContext();
  const { scout, scoutId, loaded: scoutsLoaded } = useCurrentScout();

  const [ctx, setCtx] = useState<MatchContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [view, setView] = useState<"pitch" | "list">(search?.get("mode") === "list" ? "list" : "pitch");
  const [filter, setFilter] = useState<ListFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(search?.get("player") || null);
  const [mode, setMode] = useState<"live" | "video">("live");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [matchNote, setMatchNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const attendanceSent = useRef<string | null>(null);

  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-user-org-id": currentClub.id }), [currentClub.id]);

  // Load the match context for the current scout
  const load = useCallback(async () => {
    if (!matchId) return;
    setLoading(true);
    setError(null);
    try {
      const qs = scoutId ? `?scoutId=${scoutId}` : "";
      const res = await fetch(`/api/matches/${matchId}/report${qs}`, { headers, cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      const c = j as MatchContext;
      setCtx(c);
      setDrafts(Object.fromEntries(c.players.map((p) => [p.id, draftFrom(p)])));
      setMatchNote(c.matchNote || "");
      setMode(c.attendance?.mode || c.assignmentMode || "live");
    } catch (e: any) {
      setError(e.message || "Failed to load match");
    } finally {
      setLoading(false);
    }
  }, [matchId, scoutId, headers]);

  useEffect(() => {
    if (scoutsLoaded) load();
  }, [load, scoutsLoaded]);

  // Attendance: recorded when the scout opens the match report (SPEC §5.1)
  const recordAttendance = useCallback(
    (m: "live" | "video") => {
      if (!scoutId) return;
      fetch(`/api/matches/${matchId}/attendance`, { method: "POST", headers, body: JSON.stringify({ scoutId, mode: m }) }).catch(() => {});
    },
    [matchId, scoutId, headers]
  );
  useEffect(() => {
    if (!ctx || !scoutId || attendanceSent.current === scoutId) return;
    attendanceSent.current = scoutId;
    recordAttendance(ctx.attendance?.mode || ctx.assignmentMode || "live");
  }, [ctx, scoutId, recordAttendance]);

  const players = ctx?.players || [];
  const ratable = players.filter((p) => p.inDatabase);
  const selected = players.find((p) => p.id === selectedId) || null;
  const selIndex = selected ? ratable.findIndex((p) => p.id === selected.id) : -1;
  const ratedCount = players.filter((p) => p.report || drafts[p.id]?.matchRating != null).length;

  const patch = useCallback((pid: string, ch: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [pid]: { ...prev[pid], ...ch, dirty: true } }));
  }, []);

  const go = (delta: number) => {
    if (!ratable.length) return;
    const i = selIndex < 0 ? 0 : (selIndex + delta + ratable.length) % ratable.length;
    setSelectedId(ratable[i].id);
    setSaveError(null);
  };

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  /** Save (draft) or publish the given players. */
  const save = useCallback(
    async (ids: string[], publish: boolean) => {
      if (!ctx || !scoutId) {
        setSaveError("Select who you are (scout) first");
        return false;
      }
      const items = ids
        .map((id) => ctx.players.find((p) => p.id === id)!)
        .filter((p) => p && drafts[p.id]?.matchRating != null)
        .map((p) => draftToPayload(p, drafts[p.id]));
      if (!items.length) {
        setSaveError("Rate at least one player first");
        return false;
      }
      setSaving(true);
      setSaveError(null);
      try {
        const res = await fetch(`/api/matches/${matchId}/report`, {
          method: "POST",
          headers,
          body: JSON.stringify({ scoutId, mode, publish, reports: items }),
        });
        const j = await res.json();
        if (!res.ok) {
          if (j.problems?.[0]?.playerId) setSelectedId(j.problems[0].playerId);
          throw new Error(j.error || "Save failed");
        }
        const savedBy = new Map<string, any>((j.reports || []).map((r: any) => [r.player_id, r]));
        setCtx((c) => (c ? { ...c, players: c.players.map((p) => (savedBy.has(p.id) ? { ...p, report: savedBy.get(p.id) } : p)) } : c));
        setDrafts((prev) => {
          const next = { ...prev };
          savedBy.forEach((_r, pid) => (next[pid] = { ...next[pid], dirty: false }));
          return next;
        });
        flash(publish ? `Published ${savedBy.size} report${savedBy.size === 1 ? "" : "s"}` : `Saved ${savedBy.size}`);
        return true;
      } catch (e: any) {
        setSaveError(e.message);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [ctx, scoutId, drafts, matchId, headers, mode]
  );

  const saveCurrent = async (next: boolean) => {
    if (!selected) return;
    const ok = await save([selected.id], false);
    if (ok && next) go(1);
  };

  const publishAll = async () => {
    const ids = players.filter((p) => drafts[p.id]?.matchRating != null).map((p) => p.id);
    await save(ids, true);
  };

  const saveAllDirty = async () => {
    const ids = players.filter((p) => drafts[p.id]?.dirty && drafts[p.id]?.matchRating != null).map((p) => p.id);
    if (!ids.length) return flash("Nothing new to save");
    await save(ids, false);
  };

  // Keyboard: 1–0 rate the selected player (tap again = .5), N = save & next
  useEffect(() => {
    if (view !== "pitch" || !selected) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) {
        const block = e.key === "0" ? 10 : Number(e.key);
        patch(selected.id, { matchRating: tapRatingBlock(drafts[selected.id]?.matchRating ?? null, block) });
        e.preventDefault();
      } else if (e.key === "n" || e.key === "N") {
        if (drafts[selected.id]?.matchRating != null) saveCurrent(true);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selected, drafts, patch]);

  const saveNote = async () => {
    if (!scoutId) return;
    await fetch(`/api/matches/${matchId}/note`, { method: "PUT", headers, body: JSON.stringify({ scoutId, text: matchNote }) });
    setNoteOpen(false);
    flash("Match note saved");
  };

  if (!scoutsLoaded || (loading && !ctx)) return <LoadingState message="Loading match report…" />;
  if (error || !ctx) return <ErrorState title="Match report unavailable" message={error || "Match not found"} onRetry={load} />;

  const m = ctx.match;
  const dateStr = m.date ? new Date(m.date).toLocaleDateString("en-GB") : "";
  const tierChip = (t: string | null) => (
    <span className="rounded-[4px] border border-[#2f3e5e] px-1.5 py-[1px] text-[10.5px] font-extrabold text-[#c8d3e6]" title={t ? `Club tier ${t}` : "Tier not set"}>
      {t || "T?"}
    </span>
  );

  return (
    <div className="flex flex-col gap-2.5 min-h-full lg:h-full">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-[#1c2a45] bg-[#0a1020] px-3 py-2">
        <Link
          href="/matches"
          className="flex items-center gap-1.5 rounded-[7px] border border-[#22304d] px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#c8d3e6] hover:text-white"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Matches
        </Link>
        <span className="s1-title text-[14px] text-white">Match report</span>
        <div className="flex items-center gap-2 text-[14px] font-bold text-white">
          <EscudoEquipo teamId={m.home.id} badgeUrl={m.home.badgeUrl} name={m.home.name} size={22} />
          <span className="truncate max-w-[160px]">{m.home.name}</span>
          {tierChip(m.home.tier)}
          <span className="text-[22px] font-extrabold tracking-wide px-1">
            {m.home.score ?? "–"}–{m.away.score ?? "–"}
          </span>
          {tierChip(m.away.tier)}
          <span className="truncate max-w-[160px]">{m.away.name}</span>
          <EscudoEquipo teamId={m.away.id} badgeUrl={m.away.badgeUrl} name={m.away.name} size={22} />
        </div>
        <span className="text-[11.5px] text-[#8796b3]">
          {[m.competition, m.week ? `J${m.week}` : null, dateStr, m.venue].filter(Boolean).join(" · ")}
        </span>

        {/* Scout + live/video */}
        {scout ? (
          <div className="flex items-center gap-1 rounded-[7px] border border-[#22304d] px-2 py-1 text-[12px] text-[#c8d3e6]">
            <Eye className="w-3.5 h-3.5" /> {scout.name} ·
            <select
              value={mode}
              onChange={(e) => {
                const v = e.target.value as "live" | "video";
                setMode(v);
                recordAttendance(v);
              }}
              className="bg-transparent text-white outline-none"
            >
              <option value="live">Live</option>
              <option value="video">Video</option>
            </select>
          </div>
        ) : null}

        <div className="relative">
          <button
            type="button"
            onClick={() => setNoteOpen(!noteOpen)}
            disabled={!scoutId}
            className="flex items-center gap-1.5 rounded-[7px] border border-[#22304d] px-2.5 py-1.5 text-[11.5px] text-[#c8d3e6] hover:text-white disabled:opacity-40"
            title={matchNote || "Shared match note"}
          >
            <NotebookPen className="w-3.5 h-3.5" /> Match note{matchNote ? " ✓" : ""}
          </button>
          {noteOpen && (
            <div className="absolute left-0 z-30 mt-1 w-[360px] rounded-[10px] border border-[#2a3a5c] bg-[#0d1628] p-2.5 shadow-2xl">
              <textarea
                autoFocus
                value={matchNote}
                onChange={(e) => setMatchNote(e.target.value)}
                rows={4}
                placeholder="Shared note for this match (one per match)"
                className="w-full resize-none rounded-[8px] border border-[#22304d] bg-[#0b1426] px-2.5 py-2 text-[12.5px] text-white outline-none focus:border-[#5b8cff]"
              />
              <div className="mt-1.5 flex justify-end gap-2">
                <button type="button" onClick={() => setNoteOpen(false)} className="px-2.5 py-1 text-[11px] text-[#8796b3]">
                  Cancel
                </button>
                <button type="button" onClick={saveNote} className="rounded-[6px] bg-[#3B6FF5] px-3 py-1 text-[11px] font-bold text-white">
                  Save note
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded-[7px] border border-[#22304d] text-[11.5px]">
            <button type="button" onClick={() => setView("pitch")} className={`px-3 py-1.5 ${view === "pitch" ? "bg-[#16223a] text-white" : "text-[#8796b3]"}`}>
              Pitch
            </button>
            <button type="button" onClick={() => setView("list")} className={`px-3 py-1.5 ${view === "list" ? "bg-[#16223a] text-white" : "text-[#8796b3]"}`}>
              List (all {players.length})
            </button>
          </div>
          <span className="rounded-[7px] border border-[#22304d] px-2.5 py-1.5 text-[12px] text-[#c8d3e6]">
            Rated <b className="text-[#6BE88F]">{ratedCount}</b> / {players.length} played
          </span>
          <button
            type="button"
            onClick={publishAll}
            disabled={saving || !scoutId}
            className="rounded-[7px] bg-[#3B6FF5] hover:bg-[#5B8CFF] px-3.5 py-1.5 text-[12px] font-bold uppercase tracking-[0.06em] text-white disabled:opacity-40"
          >
            Publish all
          </button>
        </div>
      </div>

      {!scoutId && (
        <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-[#f5b942]/40 bg-[#f5b942]/[0.06] px-3 py-2 text-[12.5px] text-[#f5d08a]">
          Choose who you are before rating — attendance, reports and stars are saved under your scout name.
          <ScoutSwitcher pillClass="flex items-center gap-1.5 rounded-[7px] border border-[#f5b942]/50 px-2.5 py-1 text-[12px]" />
        </div>
      )}
      {(saveError || toast) && (
        <div className={`rounded-[8px] px-3 py-1.5 text-[12px] ${saveError ? "bg-[#f05252]/15 text-[#ff8a8a]" : "bg-[#34d399]/15 text-[#6BE88F]"}`}>
          {saveError || toast}
        </div>
      )}

      {players.length === 0 ? (
        <div className="rounded-[10px] border border-[#1c2a45] bg-[#0b1222] p-8 text-center text-[13px] text-[#8796b3]">
          No lineup for this match yet — players who played appear here once the lineup and minutes are available.
        </div>
      ) : view === "pitch" ? (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(360px,0.75fr)_minmax(0,1.6fr)] gap-3 flex-1 min-h-0">
          <PitchLineup ctx={ctx} drafts={drafts} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setSaveError(null); }} />
          {selected && drafts[selected.id] ? (
            <RatingPanel
              ctx={ctx}
              player={selected}
              draft={drafts[selected.id]}
              onChange={(ch) => patch(selected.id, ch)}
              index={selIndex}
              total={ratable.length}
              onPrev={() => go(-1)}
              onNext={() => go(1)}
              onClose={() => setSelectedId(null)}
              onSkip={() => go(1)}
              onSave={() => saveCurrent(false)}
              onSaveNext={() => saveCurrent(true)}
              saving={saving}
              error={saveError}
              matchNote={matchNote}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-[12px] border border-dashed border-[#2a3a5c] bg-[#0b1222] p-8 text-center text-[13px] text-[#8796b3]">
              Click a player on the pitch to rate her.
              <button
                type="button"
                onClick={() => ratable[0] && setSelectedId(ratable[0].id)}
                className="rounded-[7px] bg-[#3B6FF5] px-4 py-2 text-[12px] font-bold uppercase tracking-[0.06em] text-white"
              >
                Start with the first player
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0 rounded-[12px] border border-[#1c2a45] bg-[#0b1222] overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-[#1c2a45] px-3 py-2.5">
            <b className="s1-title text-[12.5px] text-white">Quick rate · all players who played</b>
            <span className="text-[11px] text-[#5a6884]">
              Type a number (e.g. 7.5) or use −/+ · Tab = next player · stars pre-filled · click a row to open the full panel
            </span>
            <div className="ml-auto flex items-center gap-1 rounded-[7px] border border-[#22304d] px-2 py-1 text-[11.5px] text-[#8796b3]">
              Show:
              {(
                [
                  ["all", "All"],
                  ["targets", "Targets ★"],
                  ["not_rated", "Not rated"],
                ] as const
              ).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setFilter(k)} className={`px-1.5 ${filter === k ? "font-bold text-white" : "hover:text-white"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <QuickRateList
              ctx={ctx}
              drafts={drafts}
              onChange={patch}
              filter={filter}
              selectedId={null}
              onOpen={(id) => {
                setSelectedId(id);
                setView("pitch");
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-[#1c2a45] px-3 py-2.5">
            <span className="text-[11.5px] text-[#8796b3]">
              {ratedCount} rated · {players.length - ratedCount} to go · ~10 s per player in list mode
            </span>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={saveAllDirty}
                disabled={saving || !scoutId}
                className="h-9 rounded-[7px] border border-[#22304d] px-4 text-[12px] font-bold uppercase tracking-[0.06em] text-white disabled:opacity-40"
              >
                Save
              </button>
              <button
                type="button"
                onClick={publishAll}
                disabled={saving || !scoutId}
                className="h-9 rounded-[7px] bg-[#3B6FF5] hover:bg-[#5B8CFF] px-4 text-[12px] font-bold uppercase tracking-[0.06em] text-white disabled:opacity-40"
              >
                Publish all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
