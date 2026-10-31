"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { ErrorState } from "@/components/ui/StatusStates";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";

interface ClubRow {
  id: string;
  name: string;
  short_name: string;
  slug: string;
  subscription_plan: string;
  subscription_status: string;
  seat_limit: number;
  members: number;
  leagues: string[];
}

interface LeagueRow {
  competition_id: string;
  competition_name: string;
  country: string | null;
}

const HEADERS = { "Content-Type": "application/json" };
const PLANS = ["trial", "standard", "pro", "enterprise"];
const STATUSES = ["trialing", "active", "suspended", "cancelled"];
const STATUS_BADGE: Record<string, "success" | "warning" | "destructive" | "outline"> = {
  active: "success",
  trialing: "warning",
  suspended: "destructive",
  cancelled: "outline",
};

const selectClass =
  "h-7 rounded-md border border-border bg-navy-900/70 px-2 text-xs text-white capitalize focus:outline-none focus:ring-1 focus:ring-primary";

export function ClubsManager() {
  const [clubs, setClubs] = useState<ClubRow[]>([]);
  const [leagues, setLeagues] = useState<LeagueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newPlan, setNewPlan] = useState("standard");
  const [editing, setEditing] = useState<string | null>(null);
  const [draftLeagues, setDraftLeagues] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/clubs", { headers: HEADERS });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setClubs(data.clubs);
      setLeagues(data.leagues);
      setLoaded(true);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Could not load clubs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const send = async (key: string, body: Record<string, any>) => {
    setSaving(key);
    try {
      const res = await fetch("/api/admin/clubs", { method: "POST", headers: HEADERS, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
      return true;
    } catch (err: any) {
      setError(err.message || "Could not save");
      return false;
    } finally {
      setSaving(null);
    }
  };

  const leagueName = (id: string) => leagues.find((l) => l.competition_id === id)?.competition_name || id;

  const startEditing = (club: ClubRow) => {
    setEditing(club.id);
    setDraftLeagues(new Set(club.leagues));
  };

  const toggleLeague = (id: string) =>
    setDraftLeagues((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-xs text-muted-foreground">Loading clubs…</CardContent>
      </Card>
    );
  }

  if (!loaded) {
    return <ErrorState title="Clubs" message={error || "Could not load clubs"} onRetry={load} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clubs & Subscriptions</CardTitle>
        <CardDescription>
          Clubs that have contracted HerScout and the leagues included in each club&apos;s app. Leagues come from the
          download list below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-xs text-destructive">{error}</p>}

        <form
          className="flex flex-col sm:flex-row gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await send("create", { action: "create", name: newName, plan: newPlan })) setNewName("");
          }}
        >
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New club name (e.g. Valencia CF Femenino)"
            leftIcon={<Building2 className="w-3.5 h-3.5" />}
          />
          <select value={newPlan} onChange={(e) => setNewPlan(e.target.value)} className={`${selectClass} h-9`}>
            {PLANS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <Button
            type="submit"
            size="sm"
            disabled={!newName.trim()}
            isLoading={saving === "create"}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            Add club
          </Button>
        </form>

        {clubs.length === 0 && <p className="text-xs text-muted-foreground">No clubs yet.</p>}

        {clubs.map((club) => (
          <div key={club.id} className="rounded-md border border-border bg-navy-900/60 p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-white">{club.name}</p>
                <Badge variant={STATUS_BADGE[club.subscription_status] || "outline"} size="sm">
                  {club.subscription_status}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <label className="flex items-center gap-1">
                  Plan
                  <select
                    value={club.subscription_plan}
                    disabled={saving === `plan-${club.id}`}
                    onChange={(e) => send(`plan-${club.id}`, { action: "update", id: club.id, plan: e.target.value })}
                    className={selectClass}
                  >
                    {PLANS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1">
                  Status
                  <select
                    value={club.subscription_status}
                    disabled={saving === `status-${club.id}`}
                    onChange={(e) => send(`status-${club.id}`, { action: "update", id: club.id, status: e.target.value })}
                    className={selectClass}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1">
                  Seats {club.members}/
                  <Input
                    key={`${club.id}-${club.seat_limit}`}
                    type="number"
                    min={1}
                    defaultValue={club.seat_limit}
                    className="h-7 w-16 text-xs"
                    onBlur={(e) => {
                      if (e.target.value !== String(club.seat_limit)) {
                        send(`seats-${club.id}`, { action: "update", id: club.id, seatLimit: e.target.value });
                      }
                    }}
                  />
                </label>
                <Button
                  variant="ghost"
                  size="xs"
                  aria-label={`Delete ${club.name}`}
                  isLoading={saving === `rm-${club.id}`}
                  onClick={() => {
                    if (window.confirm(`Delete ${club.name}? Its users, watchlists and reports will be deleted too.`)) {
                      send(`rm-${club.id}`, { action: "delete", id: club.id });
                    }
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {editing === club.id ? (
              <div className="space-y-2">
                {leagues.length === 0 && (
                  <p className="text-xs text-muted-foreground">Add leagues to the download list first.</p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {leagues.map((l) => {
                    const on = draftLeagues.has(l.competition_id);
                    return (
                      <button
                        key={l.competition_id}
                        type="button"
                        onClick={() => toggleLeague(l.competition_id)}
                        className={`rounded border px-2 py-1 text-[11px] transition-colors ${
                          on ? "border-primary bg-primary/20 text-white" : "border-border text-muted-foreground hover:text-white"
                        }`}
                      >
                        {l.competition_name}
                        {l.country ? ` · ${l.country}` : ""}
                        {on ? " ✓" : ""}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="xs"
                    isLoading={saving === `lg-${club.id}`}
                    onClick={async () => {
                      const ok = await send(`lg-${club.id}`, {
                        action: "setLeagues",
                        id: club.id,
                        competitionIds: Array.from(draftLeagues),
                      });
                      if (ok) setEditing(null);
                    }}
                  >
                    Save leagues
                  </Button>
                  <Button variant="ghost" size="xs" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">Leagues:</span>
                {club.leagues.length === 0 && <span className="text-[11px] text-muted-foreground">none</span>}
                {club.leagues.map((id) => (
                  <Badge key={id} variant="outline" size="sm">{leagueName(id)}</Badge>
                ))}
                <Button variant="ghost" size="xs" leftIcon={<Pencil className="w-3 h-3" />} onClick={() => startEditing(club)}>
                  Edit
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
