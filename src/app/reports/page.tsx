"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useThemeContext } from "@/context/ThemeContext";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { LoadingState, EmptyState, ErrorState, SuccessBanner } from "@/components/ui/StatusStates";
import { ScoutingReport, ReportType, ReportStatus, calculateTransparentOverallRating } from "@/lib/reports";
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
} from "lucide-react";

export default function ReportsListPage() {
  const { currentClub, user, userRole } = useThemeContext();
  const [reports, setReports] = useState<ScoutingReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Editor Modal
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form states
  const [formPlayer, setFormPlayer] = useState("Vicky López");
  const [formClub, setFormClub] = useState("FC Barcelona");
  const [formPosition, setFormPosition] = useState("Attacking Midfielder (AMF)");
  const [formType, setFormType] = useState<ReportType>("full_scouting");
  const [formMatch, setFormMatch] = useState("FC Barcelona vs Chelsea FCW (UWCL)");
  const [formCompetition, setFormCompetition] = useState("UEFA Women's Champions League");
  const [formTacticalContext, setFormTacticalContext] = useState("Interior #10 against mid-block press");
  const [formTechnical, setFormTechnical] = useState<string>("9.0");
  const [formTactical, setFormTactical] = useState<string>("8.5");
  const [formPhysical, setFormPhysical] = useState<string>("7.5");
  const [formPsychological, setFormPsychological] = useState<string>(""); // empty = Not Assessed
  const [formStrengths, setFormStrengths] = useState("First touch in half-spaces, progressive vision");
  const [formWeaknesses, setFormWeaknesses] = useState("Aerial contestation against deep blocks");
  const [formRecommendation, setFormRecommendation] = useState("sign_tier_a");
  const [formNotes, setFormNotes] = useState("Scouted live from stadium. Elite prospect profile.");
  const [formVisibility, setFormVisibility] = useState("club_private");

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

  const handleCreateReport = async () => {
    const ratings = {
      technical: formTechnical ? parseFloat(formTechnical) : null,
      tactical: formTactical ? parseFloat(formTactical) : null,
      physical: formPhysical ? parseFloat(formPhysical) : null,
      psychological: formPsychological ? parseFloat(formPsychological) : null,
    };

    const payload = {
      organizationId: currentClub.id,
      reportType: formType,
      status: "draft",
      visibility: formVisibility,
      playerName: formPlayer,
      playerClub: formClub,
      primaryPosition: formPosition,
      matchFixture: formMatch,
      competition: formCompetition,
      tacticalContext: formTacticalContext,
      ratings,
      confidence: "high",
      strengths: formStrengths.split(",").map((s) => s.trim()),
      weaknesses: formWeaknesses.split(",").map((w) => w.trim()),
      recommendation: formRecommendation,
      freeTextNotes: formNotes,
    };

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

      if (res.ok) {
        setIsEditorOpen(false);
        setSaveSuccess(true);
        loadReports();
        setTimeout(() => setSaveSuccess(false), 4000);
      }
    } catch (err) {
      console.error("Save report error:", err);
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
            <h1 className="text-xl font-bold tracking-tight text-white">Reports & Analysis</h1>
            <Badge variant="default" size="sm">Workspace Dossiers</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Internal evaluation reports, match observations, and scouting dossiers for <strong className="text-white">{currentClub.name}</strong>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setIsEditorOpen(true)}
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
                      <div className="text-white">{rep.authorName}</div>
                      <div className="text-[10px] text-muted-foreground">{rep.authorRole}</div>
                    </TableCell>
                    <TableCell>
                      <span className="font-bold text-emerald-400 text-sm">
                        {rep.overallRating !== null ? rep.overallRating.toFixed(1) : "N/A"}
                      </span>
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

      {/* Structured Report Editor Modal */}
      <Modal
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        title="Create Professional Scouting Report"
        description="Compile structured tactical, physical, and technical observations."
        size="lg"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setIsEditorOpen(false)}>
              Discard Draft
            </Button>
            <Button size="sm" onClick={handleCreateReport} leftIcon={<Sparkles className="w-3.5 h-3.5" />}>
              Save and Commit Dossier
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          {/* Metadata Section */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="font-semibold text-white block mb-1">Target Player Name</label>
              <Input value={formPlayer} onChange={(e) => setFormPlayer(e.target.value)} />
            </div>
            <div>
              <label className="font-semibold text-white block mb-1">Current Club</label>
              <Input value={formClub} onChange={(e) => setFormClub(e.target.value)} />
            </div>
            <div>
              <label className="font-semibold text-white block mb-1">Primary Role / Position</label>
              <Input value={formPosition} onChange={(e) => setFormPosition(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="font-semibold text-white block mb-1">Report Type</label>
              <Select value={formType} onChange={(e) => setFormType(e.target.value as any)}>
                <option value="full_scouting">Full Player Scouting</option>
                <option value="match_observation">Match Observation</option>
                <option value="live_scouting">Live Scouting</option>
                <option value="opposition_analysis">Opposition Analysis</option>
                <option value="follow_up">Follow-up Evaluation</option>
              </Select>
            </div>
            <div>
              <label className="font-semibold text-white block mb-1">Observed Fixture</label>
              <Input value={formMatch} onChange={(e) => setFormMatch(e.target.value)} />
            </div>
            <div>
              <label className="font-semibold text-white block mb-1">Visibility Permission</label>
              <Select value={formVisibility} onChange={(e) => setFormVisibility(e.target.value)}>
                <option value="club_private">Club Private (All Club Scouts)</option>
                <option value="author_private">Author Private (Confidential Draft)</option>
              </Select>
            </div>
          </div>

          {/* Tactical Context */}
          <div>
            <label className="font-semibold text-white block mb-1">Tactical Context</label>
            <Input
              value={formTacticalContext}
              onChange={(e) => setFormTacticalContext(e.target.value)}
              placeholder="e.g. Left interior in 4-3-3 against high-pressing back four"
            />
          </div>

          {/* Ratings Dimension Matrix (0-10 or empty for Not Assessed) */}
          <div className="p-3 rounded-md bg-navy-900 border border-border/80 space-y-2">
            <span className="font-semibold text-white block">
              Category Assessments (1.0 to 10.0 scale — Leave empty for &quot;Not Assessed&quot;)
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] text-muted-foreground block mb-0.5">Technical</label>
                <Input
                  value={formTechnical}
                  onChange={(e) => setFormTechnical(e.target.value)}
                  placeholder="e.g. 9.0"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-0.5">Tactical</label>
                <Input
                  value={formTactical}
                  onChange={(e) => setFormTactical(e.target.value)}
                  placeholder="e.g. 8.5"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-0.5">Physical</label>
                <Input
                  value={formPhysical}
                  onChange={(e) => setFormPhysical(e.target.value)}
                  placeholder="e.g. 7.5"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-0.5">Psychological</label>
                <Input
                  value={formPsychological}
                  onChange={(e) => setFormPsychological(e.target.value)}
                  placeholder="N/A (empty)"
                />
              </div>
            </div>
          </div>

          {/* Strengths & Weaknesses */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-white block mb-1">Strengths (Comma separated)</label>
              <Input value={formStrengths} onChange={(e) => setFormStrengths(e.target.value)} />
            </div>
            <div>
              <label className="font-semibold text-white block mb-1">Weaknesses (Comma separated)</label>
              <Input value={formWeaknesses} onChange={(e) => setFormWeaknesses(e.target.value)} />
            </div>
          </div>

          {/* Recommendation & Free Text */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-white block mb-1">Final Recommendation</label>
              <Select value={formRecommendation} onChange={(e) => setFormRecommendation(e.target.value)}>
                <option value="sign_tier_a">Sign - Tier A (Priority Target)</option>
                <option value="monitor_tier_b">Monitor - Tier B (Continued Observation)</option>
                <option value="depth_tier_c">Squad Depth - Tier C</option>
                <option value="pass">Pass (Not Recommended)</option>
              </Select>
            </div>
            <div>
              <label className="font-semibold text-white block mb-1">Author / Lead Scout</label>
              <Input value={user.name} disabled />
            </div>
          </div>

          <div>
            <label className="font-semibold text-white block mb-1">Comprehensive Scout Notes</label>
            <textarea
              className="w-full h-20 rounded-md border border-input bg-navy-900/80 p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
