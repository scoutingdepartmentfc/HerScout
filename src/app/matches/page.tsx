"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/StatusStates";
import { EscudoEquipo } from "@/components/scouting/EscudoEquipo";
import { Trophy, Clock, MapPin } from "lucide-react";

type Tab = "results" | "today" | "upcoming";

interface TeamSide {
  id?: string;
  name?: string;
  badgeUrl?: string | null;
  score?: number | null;
}

interface MatchRow {
  id: string;
  date: string;
  status: string;
  week?: string | null;
  competition?: string;
  season?: string;
  venue?: string | null;
  timeConfirmed: boolean;
  home: TeamSide;
  away: TeamSide;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "upcoming", label: "Upcoming" },
  { id: "today", label: "Today's Fixtures" },
  { id: "results", label: "Latest Results" },
];

export default function MatchesPage() {
  const [tab, setTab] = useState<Tab>("upcoming");
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/matches?tab=${tab}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        if (!cancelled) setMatches(json.matches);
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Failed to load matches");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const played = (m: MatchRow) => m.status === "Played";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Matches & Fixtures</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Opta results and fixture schedules of the leagues selected in Administration.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-md bg-navy-900 border border-border p-1">
          {TABS.map((t) => (
            <Button key={t.id} variant={tab === t.id ? "primary" : "ghost"} size="xs" onClick={() => setTab(t.id)}>
              {t.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <LoadingState message="Loading matches..." />
      ) : error ? (
        <ErrorState title="Matches unavailable" message={error} onRetry={() => window.location.reload()} />
      ) : matches.length === 0 ? (
        <EmptyState
          title={tab === "today" ? "No matches today" : "No matches found"}
          description="Matches appear after the next Opta data download of the selected leagues."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {matches.map((m) => (
            <Card key={m.id} className="relative overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground mb-3">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="font-medium text-white truncate">{m.competition}</span>
                  </div>
                  {m.week && <span className="shrink-0">Matchday {m.week}</span>}
                </div>

                <div className="space-y-2 py-2">
                  {[m.home, m.away].map((side, i) => (
                    <div key={i} className="flex items-center justify-between font-semibold text-sm text-white">
                      <span className="flex items-center gap-2 min-w-0">
                        <EscudoEquipo teamId={side.id} badgeUrl={side.badgeUrl} name={side.name} size={20} />
                        <span className="truncate">{side.name}</span>
                      </span>
                      <span className={played(m) ? "font-mono" : "text-muted-foreground"}>
                        {played(m) ? side.score ?? 0 : "-"}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      {new Date(m.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                      {!played(m) &&
                        (m.timeConfirmed
                          ? ` · ${new Date(m.date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
                          : " · Time TBC")}
                    </span>
                  </div>
                  {played(m) ? (
                    <Badge variant="secondary" size="sm">Final</Badge>
                  ) : (
                    <Badge variant="outline" size="sm">{m.status === "Fixture" ? "Scheduled" : m.status}</Badge>
                  )}
                </div>
                {m.venue && (
                  <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">{m.venue}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
