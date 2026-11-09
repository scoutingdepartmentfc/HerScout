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
import { notaClases } from "@/lib/notaColor";
import { OptaLogo } from "@/components/scouting/OptaLogo";
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
    return <LoadingState message="Aggregating SPONDA hub intelligence..." />;
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
    <div className="space-y-3">
      {/* 1. Welcome hero + 9. Quick actions, as career-hub tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="tile-cut relative col-span-2 lg:row-span-2 min-h-[220px] overflow-hidden border-t-2 border-primary bg-gradient-to-br from-card via-navy-900 to-black">
          <img
            src="/logo2.png"
            alt=""
            className="absolute inset-y-0 right-0 h-full w-3/5 object-cover object-right opacity-70 [mask-image:linear-gradient(to_right,transparent,black_45%)]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-primary/25 via-transparent to-transparent" />
          <div className="relative flex h-full flex-col justify-between p-5">
            <div>
              <span className="inline-block bg-primary px-2 py-0.5 font-display text-xs font-bold uppercase tracking-wider text-white">
                Active Workspace
              </span>
              <h1 className="mt-3 font-display text-4xl sm:text-5xl font-extrabold uppercase leading-[0.9] tracking-tight text-white">
                Welcome back
                {user.name && <span className="block text-primary">{user.name}</span>}
              </h1>
            </div>
            <div className="mt-6 space-y-1 font-display text-sm font-semibold uppercase tracking-wide">
              <div className="text-white">
                <span className="text-muted-foreground">Club </span>
                {currentClub.name}
              </div>
              <div className="text-white">
                <span className="text-muted-foreground">Role </span>
                <span className="text-primary">{userRole.replace("_", " ")}</span>
              </div>
              <div className="text-white">
                <span className="text-muted-foreground">Alerts </span>
                {alerts.length} active
              </div>
            </div>
          </div>
        </div>

        {[
          { label: "Add Player", hint: "Register a new talent profile", icon: UserPlus, onClick: () => setActiveModal("player") },
          { label: "Create Report", hint: "File an observation dossier", icon: Plus, onClick: () => setActiveModal("report") },
          { label: "Add Match", hint: "Schedule a scouting assignment", icon: Calendar, onClick: () => setActiveModal("match") },
          { label: "Open Watchlist", hint: "Your tracked targets", icon: Bookmark, href: "/watchlist" },
        ].map((tile) => {
          const Icon = tile.icon;
          const body = (
            <>
              <div className="font-display text-xl sm:text-2xl font-extrabold uppercase leading-none tracking-wide text-white">
                {tile.label}
              </div>
              <div className="mt-1 pr-10 sm:pr-14 text-[11px] leading-snug text-white/70">{tile.hint}</div>
              <Icon className="absolute bottom-3 right-3 h-8 w-8 sm:h-12 sm:w-12 text-white/90 transition-transform group-hover:scale-110" strokeWidth={2.5} />
            </>
          );
          const cls =
            "group relative block min-h-[104px] overflow-hidden border border-white/10 bg-gradient-to-br from-primary to-primary/60 p-3 text-left shadow-lg shadow-black/30 transition-[filter] hover:brightness-110";
          return tile.href ? (
            <Link key={tile.label} href={tile.href} className={cls}>
              {body}
            </Link>
          ) : (
            <button key={tile.label} onClick={tile.onClick} className={cls}>
              {body}
            </button>
          );
        })}
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Left Column (2 Cols wide): Trending Players & Matches */}
        <div className="lg:col-span-2 space-y-3">
          {/* 2. Trending Players */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <CardTitle>Trending Scouting Profiles</CardTitle>
                  <OptaLogo variant="icon" size="xs" />
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
                            <span className={`font-bold ${notaClases(parseFloat(p.rating) * 10).text}`}>{p.rating}</span>
                            <div className="w-12 h-1.5 bg-navy-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${notaClases(parseFloat(p.rating) * 10).bar}`}
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
        <div className="space-y-3">
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
