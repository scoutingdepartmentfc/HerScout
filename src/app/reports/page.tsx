"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useThemeContext } from "@/context/ThemeContext";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/Table";
import { LoadingState, EmptyState, ErrorState, SuccessBanner } from "@/components/ui/StatusStates";
import { ScoutingReport, ReportType, ReportStatus, calculateTransparentOverallRating } from "@/lib/reports";
import { SpondaReportEditorModal } from "@/components/scouting/SpondaReportEditorModal";
import { PlayerSearchModal } from "@/components/compare/PlayerSearchModal";
import {
  FileText,
  Plus,
  Filter,
  Download,
  Calendar,
  User,
  Shield,
  ArrowUpRight,
  Eye,
  CheckCircle2,
  Clock,
  Sparkles,
  Lock,
  Star,
  Pencil,
  Trash2,
  Users,
} from "lucide-react";

function ReportsListContent() {
  const { currentClub, user, userRole } = useThemeContext();
  const searchParams = useSearchParams();
  const [reports, setReports] = useState<ScoutingReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterScout, setFilterScout] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Editor & Player Selection Modal
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<ScoutingReport | null>(null);
  const [isPlayerSelectOpen, setIsPlayerSelectOpen] = useState(false);
  const [allPlayersList, setAllPlayersList] = useState<any[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [initialModalPlayer, setInitialModalPlayer] = useState<{
    id?: string;
    name?: string;
    club?: string;
    position?: string;
  } | undefined>(undefined);

  // Preload players list on mount for instant searching
  const fetchAllPlayers = async () => {
    if (allPlayersList.length > 0) return;
    setLoadingPlayers(true);
    try {
      const res = await fetch("/api/players");
      if (res.ok) {
        const json = await res.json();
        const players = json.players || json.data || (Array.isArray(json) ? json : []);
        setAllPlayersList(players);
      }
    } catch (e) {
      console.error("Error loading players for report selector:", e);
    } finally {
      setLoadingPlayers(false);
    }
  };

  useEffect(() => {
    fetchAllPlayers();
  }, []);

  const handleStartNewReport = () => {
    setEditingReport(null);
    fetchAllPlayers();
    setIsPlayerSelectOpen(true);
  };

  const handleEditReport = (report: ScoutingReport) => {
    setEditingReport(report);
    setInitialModalPlayer({
      id: report.playerId,
      name: report.playerName,
      club: report.playerClub,
      position: report.primaryPosition,
    });
    setIsEditorOpen(true);
  };

  const handleDeleteReport = async (reportId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this scouting report?")) return;
    setDeletingId(reportId);
    try {
      const res = await fetch(`/api/reports/${reportId}`, {
        method: "DELETE",
        headers: {
          "x-user-org-id": currentClub.id,
          "x-user-id": "user-elena",
          "x-user-role": userRole,
        },
      });
      if (res.ok) {
        setReports((prev) => prev.filter((r) => r.id !== reportId));
      } else {
        const json = await res.json();
        alert(json.error || "Failed to delete report");
      }
    } catch (err: any) {
      alert("Failed to delete report: " + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handlePlayerChosen = (player: any) => {
    setInitialModalPlayer({
      id: player.id,
      name: player.matchName || player.match_name || player.name,
      club: player.teamName || player.teams?.name || "",
      position: player.position || player.primary_position || "",
    });
    setIsPlayerSelectOpen(false);
    setIsEditorOpen(true);
  };

  const handleCustomPlayerCreated = (custom: { name: string; club?: string; position?: string }) => {
    setInitialModalPlayer({
      id: `custom-${Date.now()}`,
      name: custom.name,
      club: custom.club || "",
      position: custom.position || "",
    });
    setIsPlayerSelectOpen(false);
    setIsEditorOpen(true);
  };

  // Open editor if query param has ?newReport=1
  useEffect(() => {
    if (searchParams) {
      const isNew = searchParams.get("newReport") === "1";
      const pName = searchParams.get("playerName");
      const pId = searchParams.get("playerId");
      const pClub = searchParams.get("playerClub");
      const pPos = searchParams.get("primaryPosition");
      const pSearch = searchParams.get("player");

      if (pSearch) {
        setSearchQuery(pSearch);
      }

      if (isNew) {
        setInitialModalPlayer({
          id: pId || undefined,
          name: pName || undefined,
          club: pClub || undefined,
          position: pPos || undefined,
        });
        setIsEditorOpen(true);
      }
    }
  }, [searchParams]);

  const loadReports = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        headers: {
          "x-user-org-id": currentClub.id,
          "x-user-id": "user-elena",
          "x-user-role": userRole,
        },
      });
      if (!res.ok) throw new Error("Failed to fetch scouting reports");
      const json = await res.json();
      setReports(json.reports || []);
    } catch (err: any) {
      setError(err.message || "Failed to load reports");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [currentClub.id, userRole]);

  const handleCreateOrUpdateReport = async (payload: any) => {
    try {
      const isEditing = !!editingReport;
      const url = isEditing ? `/api/reports/${editingReport.id}` : "/api/reports";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-user-org-id": currentClub.id,
          "x-user-id": "user-elena",
          "x-user-name": user.name,
          "x-user-role": userRole,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save report");
      }

      setIsEditorOpen(false);
      setEditingReport(null);
      setSaveSuccess(true);
      loadReports();
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      console.error("Save report error:", err);
      throw err;
    }
  };

  // Group reports by Scout (Scout dossier accumulation)
  const scoutStats = React.useMemo(() => {
    const map = new Map<string, { scoutName: string; total: number; approved: number; latestDate: string }>();
    reports.forEach((r) => {
      const name = r.scoutName || r.authorName || "Unknown Scout";
      const existing = map.get(name) || {
        scoutName: name,
        total: 0,
        approved: 0,
        latestDate: r.observationDate || r.createdAt.slice(0, 10),
      };
      existing.total += 1;
      if (r.status === "approved") existing.approved += 1;
      if ((r.observationDate || r.createdAt) > existing.latestDate) {
        existing.latestDate = r.observationDate || r.createdAt.slice(0, 10);
      }
      map.set(name, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [reports]);

  const filtered = reports.filter((r) => {
    const scout = r.scoutName || r.authorName;
    const matchesSearch =
      r.playerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.authorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.scoutName && r.scoutName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      r.competition.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === "all" || r.reportType === filterType;
    const matchesStatus = filterStatus === "all" || r.status === filterStatus;
    const matchesScout = filterScout === "all" || scout === filterScout;
    return matchesSearch && matchesType && matchesStatus && matchesScout;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-white">Reports & Analysis</h1>
            <Badge variant="default" size="sm">Workspace Dossiers</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Internal evaluation reports, match observations, and scouting dossiers for <strong className="text-white">{currentClub.name}</strong>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleStartNewReport}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            Create Scouting Report
          </Button>
        </div>
      </div>

      {saveSuccess && (
        <SuccessBanner
          message="Scouting report saved and versioned in club repository."
          onDismiss={() => setSaveSuccess(false)}
        />
      )}

      {/* Scout Performance & Dossier Accumulation Cards */}
      {scoutStats.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-primary" /> Reports by Scout (Accumulated Dossiers)
            </span>
            {filterScout !== "all" && (
              <button
                type="button"
                onClick={() => setFilterScout("all")}
                className="text-[11px] text-amber-400 hover:underline"
              >
                Clear Scout Filter
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
            {scoutStats.map((sc) => {
              const isActive = filterScout === sc.scoutName;
              return (
                <button
                  key={sc.scoutName}
                  type="button"
                  onClick={() => setFilterScout(isActive ? "all" : sc.scoutName)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    isActive
                      ? "bg-primary/20 border-primary shadow-lg shadow-primary/20"
                      : "bg-[#070e1e]/80 border-white/10 hover:border-white/20 hover:bg-[#0b1426]"
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <User className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-primary" : "text-slate-400"}`} />
                    <span className="font-bold text-white text-xs truncate">{sc.scoutName}</span>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <div>
                      <span className="text-lg font-black font-mono text-white">{sc.total}</span>
                      <span className="text-[10px] text-slate-400 ml-1">reports</span>
                    </div>
                    {sc.approved > 0 && (
                      <span className="text-[10px] font-mono font-semibold text-emerald-400 bg-emerald-500/10 px-1 rounded border border-emerald-500/20">
                        {sc.approved} app.
                      </span>
                    )}
                  </div>
                  <div className="text-[9.5px] text-slate-500 mt-1 truncate">
                    Last: {sc.latestDate}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <Card>
        <CardContent className="p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            <div className="md:col-span-2">
              <Input
                placeholder="Search by player, author scout, or competition..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div>
              <Select value={filterScout} onChange={(e) => setFilterScout(e.target.value)}>
                <option value="all">All Scouts</option>
                {scoutStats.map((s) => (
                  <option key={s.scoutName} value={s.scoutName}>
                    {s.scoutName} ({s.total})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="all">All Report Types</option>
                <option value="full_scouting">Full Player Scouting</option>
                <option value="match_observation">Match Observation</option>
                <option value="live_scouting">Live Scouting</option>
                <option value="opposition_analysis">Opposition Analysis</option>
                <option value="follow_up">Follow-up Evaluation</option>
              </Select>
            </div>
            <div>
              <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="all">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="in_review">In Review</option>
                <option value="approved">Approved</option>
                <option value="archived">Archived</option>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reports Data Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <div className="flex items-center gap-2">
            <CardTitle>Club Dossier Repository</CardTitle>
            <Badge variant="secondary" size="sm">
              {filtered.length} files
            </Badge>
          </div>
          <span className="text-[11px] text-muted-foreground hidden sm:block">
            Tenant Isolated: {currentClub.shortName}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <LoadingState message="Loading club scouting records..." />
          ) : error ? (
            <ErrorState title="Failed to load dossiers" message={error} onRetry={loadReports} />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No scouting reports found"
              description="No reports match your active filter criteria."
              actionLabel="Create First Dossier"
              onAction={() => setIsEditorOpen(true)}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Target Player</TableHead>
                  <TableHead>Report Type</TableHead>
                  <TableHead>Competition & Match</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Recommendation</TableHead>
                  <TableHead className="text-right">Dossier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((rep) => (
                  <TableRow key={rep.id}>
                    <TableCell>
                      <div className="font-semibold text-white flex items-center gap-1.5">
                        {rep.playerName}
                        {rep.visibility === "author_private" && (
                          <span title="Author Private">
                            <Lock className="w-3 h-3 text-amber-400" />
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{rep.playerClub}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" size="sm">
                        {rep.reportType.replace("_", " ").toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-white max-w-[200px] truncate">{rep.matchFixture || rep.competition}</div>
                      <div className="text-[10px] text-muted-foreground">{rep.observationDate}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-white flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span>{rep.scoutName || rep.authorName}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">{rep.authorRole}</div>
                    </TableCell>
                    <TableCell>
                      {rep.spondaData?.ratingStars ? (
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-amber-400 text-sm font-mono">
                            ★ {rep.spondaData.ratingStars}
                          </span>
                          <span className="text-[10px] text-slate-500">/ 5</span>
                        </div>
                      ) : (
                        <span className="font-bold text-emerald-400 text-sm font-mono">
                          {rep.overallRating !== null ? rep.overallRating.toFixed(1) : "N/A"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          rep.status === "approved"
                            ? "success"
                            : rep.status === "in_review"
                            ? "warning"
                            : "secondary"
                        }
                        size="sm"
                      >
                        {rep.status.replace("_", " ").toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={rep.recommendation.includes("tier_a") ? "tier-a" : "tier-b"}
                        size="sm"
                      >
                        {rep.recommendation.replace("_tier_", " Tier ").toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link href={`/reports/${rep.id}`}>
                          <Button variant="outline" size="xs" leftIcon={<Eye className="w-3 h-3" />}>
                            View
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="h-7 w-7 p-0 text-slate-400 hover:text-sky-300 hover:bg-sky-500/10"
                          onClick={() => handleEditReport(rep)}
                          title="Edit Report"
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="h-7 w-7 p-0 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                          isLoading={deletingId === rep.id}
                          onClick={(e) => handleDeleteReport(rep.id, e)}
                          title="Delete Report"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Player Selection Modal before opening Editor (with Create Custom Player support) */}
      <PlayerSearchModal
        isOpen={isPlayerSelectOpen}
        onClose={() => setIsPlayerSelectOpen(false)}
        onSelectPlayer={handlePlayerChosen}
        allPlayers={allPlayersList}
        alreadySelectedIds={[]}
        allowCreateCustom={true}
        onCreateCustomPlayer={handleCustomPlayerCreated}
      />

      {/* Structured SPONDA Report Editor Modal */}
      <SpondaReportEditorModal
        isOpen={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingReport(null);
        }}
        onSave={handleCreateOrUpdateReport}
        allPlayers={allPlayersList}
        onChangePlayer={() => {
          setIsEditorOpen(false);
          setIsPlayerSelectOpen(true);
        }}
        initialPlayer={initialModalPlayer}
        existingReport={editingReport || undefined}
        currentUser={{
          name: user.name,
          role: userRole,
          orgId: currentClub.id,
        }}
      />
    </div>
  );
}

export default function ReportsListPage() {
  return (
    <Suspense fallback={<LoadingState message="Loading scouting reports..." />}>
      <ReportsListContent />
    </Suspense>
  );
}
