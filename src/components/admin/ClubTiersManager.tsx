"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EscudoEquipo } from "@/components/scouting/EscudoEquipo";

const TIERS = [
  ["T1", "Elite"],
  ["T2", "European top"],
  ["T3", "Strong 1st division"],
  ["T4", "Mid 1st division"],
  ["T5", "Lower 1st division"],
  ["T6", "Top 2nd division"],
  ["T7", "2nd division"],
];

interface TeamRow {
  id: string;
  name: string;
  country: string | null;
  badge_url: string | null;
  tier: string | null;
}

/** Administration → Club Tiers (SPEC §6.7): global T1–T7 per club, used for match context (§6.4). */
export function ClubTiersManager() {
  const [q, setQ] = useState("");
  const [onlyUnset, setOnlyUnset] = useState(false);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set("q", q.trim());
      if (onlyUnset) qs.set("unset", "1");
      const res = await fetch(`/api/admin/club-tiers?${qs}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to load clubs");
      setTeams(j.teams || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [q, onlyUnset]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const setTier = async (teamId: string, tier: string) => {
    setSavingId(teamId);
    try {
      const res = await fetch("/api/admin/club-tiers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, tier: tier || null }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Save failed");
      setTeams((ts) => ts.map((t) => (t.id === teamId ? { ...t, tier: j.team.tier } : t)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Club Tiers</CardTitle>
        <p className="text-xs text-muted-foreground">
          Global tier per club (T1–T7), independent of league position. Used for match context and the adjusted rating in match reports.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search club…"
            className="w-64 border border-border bg-background px-2.5 py-1.5 text-sm text-white outline-none focus:border-primary"
          />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={onlyUnset} onChange={(e) => setOnlyUnset(e.target.checked)} /> Only clubs without tier
          </label>
          {loading && <span className="text-xs text-muted-foreground">Loading…</span>}
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
        <div className="max-h-[420px] overflow-y-auto border border-border/60">
          <table className="w-full text-sm">
            <tbody>
              {teams.map((t) => (
                <tr key={t.id} className="border-b border-border/40">
                  <td className="px-2 py-1.5 w-8">
                    <EscudoEquipo teamId={t.id} badgeUrl={t.badge_url} name={t.name} size={20} />
                  </td>
                  <td className="px-2 py-1.5 text-white">{t.name}</td>
                  <td className="px-2 py-1.5 text-xs text-muted-foreground">{t.country || ""}</td>
                  <td className="px-2 py-1.5 text-right">
                    <select
                      value={t.tier || ""}
                      disabled={savingId === t.id}
                      onChange={(e) => setTier(t.id, e.target.value)}
                      className="border border-border bg-background px-2 py-1 text-xs text-white"
                    >
                      <option value="">— no tier —</option>
                      {TIERS.map(([id, name]) => (
                        <option key={id} value={id}>
                          {id} · {name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {!teams.length && !loading && (
                <tr>
                  <td className="p-4 text-center text-xs text-muted-foreground">No clubs found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
