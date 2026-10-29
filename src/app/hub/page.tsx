"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useThemeContext } from "@/context/ThemeContext";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/Table";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/StatusStates";
import { Modal } from "@/components/ui/Modal";
import { Input, Select } from "@/components/ui/Input";
import {
  TrendingUp,
  FileSpreadsheet,
  Calendar,
  Bell,
  Plus,
  ArrowUpRight,
  Shield,
  Sparkles,
  Bookmark,
  CheckCircle2,
  Clock,
  AlertTriangle,
  UserPlus,
} from "lucide-react";

export default function HubPage() {
  const { currentClub, user, userRole } = useThemeContext();
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Quick Action Modal states
  const [activeModal, setActiveModal] = useState<"player" | "report" | "match" | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadHubData() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/hub", {
          headers: {
            "x-user-org-id": currentClub.id,
            "x-user-role": userRole,
          },
        });
        if (!res.ok) {
          throw new Error(`Failed to load intelligence data: ${res.statusText}`);
        }
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message || "Failed to contact database");
      } finally {
        setIsLoading(false);
      }
    }
    loadHubData();
  }, [currentClub.id, userRole]);

  const triggerActionSuccess = (msg: string) => {
    setActiveModal(null);
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 4000);
  };

  if (isLoading) {
    return <LoadingState message="Aggregating HerScout hub intelligence..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Hub Intelligence Standby"
        message={error}
        onRetry={() => window.location.reload()}
      />
    );
  }

  const trendingPlayers = data?.trendingPlayers || [];
  const recentMatches = data?.recentMatches || [];
  const upcomingMatches = data?.upcomingMatches || [];
  const reports = data?.reports || [];
  const alerts = data?.alerts || [];

  return (
    <div className="space-y-6">
      {/* 1. Welcome Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-lg border border-border/80 bg-gradient-to-r from-card to-secondary/30 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="default" size="sm">Active Workspace</Badge>
            <h1 className="text-xl font-bold tracking-tight text-white">
              Welcome back, {user.name}
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Signed in to <strong className="text-white">{currentClub.name}</strong> • Role:{" "}
            <span className="capitalize text-primary font-medium">{userRole.replace("_", " ")}</span>
          </p>
        </div>

        {/* 9. Quick Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => setActiveModal("player")}
            leftIcon={<UserPlus className="w-3.5 h-3.5" />}
          >
            Add Player
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setActiveModal("report")}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            Create Report
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveModal("match")}
            leftIcon={<Calendar className="w-3.5 h-3.5" />}
          >
            Add Match
          </Button>
          <Link href="/watchlist">
            <Button variant="ghost" size="sm" leftIcon={<Bookmark className="w-3.5 h-3.5 text-primary" />}>
              Open Watchlist
            </Button>
          </Link>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-3 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-[11px] opacity-80 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid: 2 Columns on Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols wide): Trending Players & Matches */}
        <div className="lg:col-span-2 space-y-6">
          {/* 2. Trending Players */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <CardTitle>Trending Scouting Profiles</CardTitle>
                </div>
                <CardDescription>
                  Ranked by verified Opta match ratings and continuous season performance
                </CardDescription>
              </div>
              <Link href="/players">
                <Button variant="ghost" size="xs" rightIcon={<ArrowUpRight className="w-3 h-3" />}>
                  Explore Registry
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {trendingPlayers.length === 0 ? (
                <EmptyState
                  title="No trending player records available"
                  description="Choose leagues in Administration; ratings appear after the next data download."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Player</TableHead>
                      <TableHead>Club</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Minutes</TableHead>
                      <TableHead>Rating (0–10)</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trendingPlayers.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="font-semibold text-white">{p.name}</div>
                          <div className="text-[10px] text-muted-foreground">{p.country}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-white">{p.club}</div>
                          <div className="text-[10px] text-muted-foreground">{p.competition} {p.season}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" size="sm">{p.demarcation}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{p.minutes} mins</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-emerald-400">{p.rating}</span>
                            <div className="w-12 h-1.5 bg-navy-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-400 rounded-full"
                                style={{ width: `${Math.min(100, (parseFloat(p.rating) / 10) * 100)}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/players/${p.id}`}>
                            <Button variant="outline" size="xs">
                              Dossier
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* 3 & 4. Yesterday's Results & Today's Fixtures */}
          <Card>
            <CardHeader className="py-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" />
                <CardTitle>Matches & Fixtures Intelligence</CardTitle>
              </div>
              <CardDescription>
                Verified match outcomes and upcoming fixtures across monitored competitions
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {recentMatches.length === 0 && upcomingMatches.length === 0 ? (
                <EmptyState
                  title="No match records found"
                  description="Matches will appear after the next Opta data download."
                />
              ) : (
                <div className="divide-y divide-border/40">
                  {[...recentMatches.slice(0, 4), ...upcomingMatches.slice(0, 4)].map((m: any) => (
                    <div key={m.id} className="p-4 flex items-center justify-between hover:bg-secondary/20 transition-colors">
                      <div className="space-y-1">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {m.competition}
                        </div>
                        <div className="flex items-center gap-3 font-semibold text-sm text-white">
                          <span>{m.homeTeam}</span>
                          <span className="px-2 py-0.5 rounded bg-navy-900 border border-border/80 font-mono text-xs text-primary">
                            {m.homeScore !== null ? `${m.homeScore} - ${m.awayScore}` : "VS"}
                          </span>
                          <span>{m.awayTeam}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={m.status === "Played" ? "secondary" : "outline"} size="sm">
                          {m.status === "Played"
                            ? "Final Result"
                            : m.timeConfirmed
                            ? new Date(m.date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
                            : "Time TBC"}
                        </Badge>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {new Date(m.date).toLocaleDateString("en-GB")}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 5. Latest Scouting Reports */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <div>
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-primary" />
                  <CardTitle>Latest Club Scouting Reports</CardTitle>
                </div>
                <CardDescription>
                  Tenant isolated dossiers filed by <strong className="text-white">{currentClub.shortName}</strong> scouts
                </CardDescription>
              </div>
              <Link href="/reports">
                <Button variant="ghost" size="xs" rightIcon={<ArrowUpRight className="w-3 h-3" />}>
                  All Reports
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {reports.length === 0 ? (
                <EmptyState
                  title="No scouting reports yet"
                  description="Reports filed by your club's scouts will appear here."
                />
              ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Target Player</TableHead>
                    <TableHead>Filing Date</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead>Recommendation</TableHead>
                    <TableHead className="text-right">Report Link</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((rep: any) => (
                    <TableRow key={rep.id}>
                      <TableCell className="font-semibold text-white">{rep.player}</TableCell>
                      <TableCell className="font-mono text-xs">{rep.date}</TableCell>
                      <TableCell>
                        <span className="font-bold text-emerald-400">{rep.rating}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="success" size="sm">{rep.recommendation}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href="/reports">
                          <Button variant="outline" size="xs">
                            Open
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column (1 Col wide): Alerts, News, Activity */}
        <div className="space-y-6">
          {/* 6. Alerts & Notifications */}
          <Card>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-primary" />
                  <CardTitle className="text-sm">Alerts & Notifications</CardTitle>
                </div>
                <Badge variant="default" size="sm">{alerts.length} active</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {alerts.length === 0 && (
                <p className="text-xs text-muted-foreground">No alerts: no contracts ending in the next 6 months.</p>
              )}
              {alerts.map((alt: any) => (
                <div
                  key={alt.id}
                  className="p-3 rounded-md bg-secondary/40 border border-border/50 text-xs space-y-1 hover:border-white/20 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{alt.title}</span>
                    <span className="text-[10px] text-muted-foreground">{alt.timestamp}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{alt.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>

        </div>
      </div>

      {/* Quick Action Modals */}
      <Modal
        isOpen={activeModal === "player"}
        onClose={() => setActiveModal(null)}
        title="Add Player to Scouting Database"
        description="Register a new talent profile for evaluation."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setActiveModal(null)}>Cancel</Button>
            <Button size="sm" onClick={() => triggerActionSuccess("Player registered successfully.")}>
              Submit Profile
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input placeholder="Full Player Name" />
          <Input placeholder="Current Club" />
          <Select defaultValue="AMF">
            <option value="GK">Goalkeeper (GK)</option>
            <option value="CB">Centre-Back (CB)</option>
            <option value="AMF">Attacking Midfielder (AMF)</option>
            <option value="CF">Centre Forward (CF)</option>
            <option value="W">Winger (LW/RW)</option>
          </Select>
        </div>
      </Modal>

      <Modal
        isOpen={activeModal === "report"}
        onClose={() => setActiveModal(null)}
        title="Create Scouting Dossier"
        description="File an official observation report."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setActiveModal(null)}>Cancel</Button>
            <Button size="sm" onClick={() => triggerActionSuccess("Scouting report saved to club dossiers.")}>
              Save Dossier
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input placeholder="Target Player" defaultValue="Salma Paralluelo" />
          <Input placeholder="Fixture Observed (e.g. UWCL vs Bayern Munich)" />
          <Select defaultValue="tier-a">
            <option value="tier-a">Tier A - Priority Target</option>
            <option value="tier-b">Tier B - Continued Monitoring</option>
            <option value="tier-c">Tier C - Depth Option</option>
          </Select>
        </div>
      </Modal>

      <Modal
        isOpen={activeModal === "match"}
        onClose={() => setActiveModal(null)}
        title="Add Match Observation"
        description="Schedule a match scouting assignment."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setActiveModal(null)}>Cancel</Button>
            <Button size="sm" onClick={() => triggerActionSuccess("Match assignment created.")}>
              Schedule Assignment
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input placeholder="Competition Name" />
          <Input placeholder="Home Team" />
          <Input placeholder="Away Team" />
        </div>
      </Modal>
    </div>
  );
}
