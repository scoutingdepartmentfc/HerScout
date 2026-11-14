"use client";

import React, { useEffect, useState } from "react";
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
} from "lucide-react";

export default function ReportsListPage() {
  const { currentClub, user, userRole } = useThemeContext();
  const searchParams = useSearchParams();
  const [reports, setReports] = useState<ScoutingReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Editor & Player Selection Modal
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isPlayerSelectOpen, setIsPlayerSelectOpen] = useState(false);
  const [allPlayersList, setAllPlayersList] = useState<any[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
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
    fetchAllPlayers();
    setIsPlayerSelectOpen(true);
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

  const handleCreateReport = async (payload: any) => {
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
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
      setSaveSuccess(true);
      loadReports();
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      console.error("Save report error:", err);
      throw err;
    }
  };

  const filtered = reports.filter((r) => {
    const matchesSearch =
      r.playerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.authorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.competition.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === "all" || r.reportType === filterType;
    const matchesStatus = filterStatus === "all" || r.status === filterStatus;
    return matchesSearch && matchesType && matchesStatus;
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

      {/* Filter Toolbar */}
      <Card>
        <CardContent className="p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <Input
                placeholder="Search by player, author scout, or competition..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
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
                      <Link href={`/reports/${rep.id}`}>
                        <Button variant="outline" size="xs" leftIcon={<Eye className="w-3 h-3" />}>
                          View
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
        onClose={() => setIsEditorOpen(false)}
        onSave={handleCreateReport}
        allPlayers={allPlayersList}
        onChangePlayer={() => {
          setIsEditorOpen(false);
          setIsPlayerSelectOpen(true);
        }}
        initialPlayer={initialModalPlayer}
        currentUser={{
          name: user.name,
          role: userRole,
          orgId: currentClub.id,
        }}
      />
    </div>
  );
}
