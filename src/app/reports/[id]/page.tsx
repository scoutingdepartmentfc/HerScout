"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useThemeContext } from "@/context/ThemeContext";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { LoadingState, ErrorState, SuccessBanner } from "@/components/ui/StatusStates";
import { ScoutingReport, RATING_DEFINITIONS } from "@/lib/reports";
import {
  ArrowLeft,
  Printer,
  Download,
  Calendar,
  User,
  Shield,
  Clock,
  Sparkles,
  CheckCircle2,
  FileCheck,
  MessageSquare,
  Lock,
  Star,
  Video,
  Award,
  AlertTriangle,
  Target,
} from "lucide-react";

export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { currentClub, user, userRole, isPlatformAdmin } = useThemeContext();

  const [report, setReport] = useState<ScoutingReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Review feedback form
  const [reviewComment, setReviewComment] = useState("");
  const [reviewStatus, setReviewStatus] = useState<"approved" | "in_review" | "archived">("approved");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState(false);

  const reportId = params?.id as string;

  const fetchReport = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}`, {
        headers: {
          "x-user-org-id": currentClub.id,
          "x-user-id": "user-elena",
          "x-user-role": userRole,
        },
      });
      if (!res.ok) {
        if (res.status === 403) throw new Error("Confidential Report: Access Denied for your user or club.");
        if (res.status === 404) throw new Error("Scouting Report not found.");
        throw new Error("Failed to load report");
      }
      const json = await res.json();
      setReport(json.report);
    } catch (err: any) {
      setError(err.message || "Failed to load report");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (reportId) fetchReport();
  }, [reportId, currentClub.id, userRole]);

  const handlePrintPdf = () => {
    window.print();
  };

  const handleReviewSubmit = async () => {
    if (!reviewComment.trim()) return;
    setSubmittingReview(true);
    try {
      const res = await fetch(`/api/reports/${reportId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-org-id": currentClub.id,
          "x-user-id": "user-elena",
          "x-user-name": user.name,
          "x-user-role": userRole,
        },
        body: JSON.stringify({
          comment: reviewComment,
          newStatus: reviewStatus,
        }),
      });
      if (res.ok) {
        setReviewComment("");
        setReviewSuccess(true);
        fetchReport();
        setTimeout(() => setReviewSuccess(false), 4000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingReview(false);
    }
  };

  if (isLoading) return <LoadingState message="Retrieving scouting dossier..." />;
  if (error || !report) return <ErrorState title="Report Unavailable" message={error || "Not found"} onRetry={() => router.push("/reports")} />;

  const isChiefScoutOrAdmin = userRole === "chief_scout" || isPlatformAdmin;

  return (
    <div className="space-y-6 max-w-5xl mx-auto print:p-0 print:max-w-none">
      {/* Top Action Bar (Hidden when printing to PDF) */}
      <div className="flex items-center justify-between print:hidden">
        <Link href="/reports">
          <Button variant="outline" size="sm" leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}>
            Back to Reports
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handlePrintPdf} leftIcon={<Printer className="w-3.5 h-3.5" />}>
            Print / Export PDF
          </Button>
        </div>
      </div>

      {reviewSuccess && (
        <SuccessBanner
          message="Chief scout review committed and status updated."
          onDismiss={() => setReviewSuccess(false)}
        />
      )}

      {/* Printable Dossier Header with Club Branding */}
      <div className="p-6 rounded-2xl border border-white/10 bg-[#070e1e]/95 shadow-xl space-y-5 print:border-black print:text-black print:bg-white">
        <div className="flex items-start justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3.5">
            {/* SPONDA App Brand Icon / Shield */}
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/20 bg-black shadow-md flex items-center justify-center">
              <img
                src="/logo1.png"
                alt="SPONDA"
                className="absolute max-w-none"
                style={{ width: 160, height: "auto", left: -98, top: -22 }}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase font-black tracking-widest text-primary flex items-center gap-1.5">
                  SPONDA PRO SCOUTING DOSSIER
                </span>
                <span className="text-slate-500">•</span>
                <span className="text-xs text-slate-300 font-semibold">{currentClub.name}</span>
                {report.visibility === "author_private" && (
                  <Badge variant="warning" size="sm">
                    <Lock className="w-2.5 h-2.5 mr-1" /> Confidential Draft
                  </Badge>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white print:text-black mt-0.5">
                {report.playerName}
              </h1>
              <p className="text-xs text-muted-foreground print:text-gray-700">
                {report.primaryPosition} • {report.playerClub} {report.playerCountry ? `(${report.playerCountry})` : ""}
              </p>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs font-mono text-muted-foreground print:text-gray-600">
              Dossier #{report.id}
            </div>
            <div className="mt-1 flex items-center justify-end gap-1.5">
              <Badge variant="outline" size="sm">
                v{report.currentVersion}.0
              </Badge>
              <Badge
                variant={report.status === "approved" ? "success" : "warning"}
                size="sm"
              >
                {report.status.toUpperCase()}
              </Badge>
            </div>
          </div>
        </div>

        {/* Observation Metadata Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-2 border-b border-white/10 text-xs">
          <div>
            <span className="text-muted-foreground block text-[11px]">Lead Scout</span>
            <span className="font-bold text-white print:text-black flex items-center gap-1 mt-0.5">
              <User className="w-3.5 h-3.5 text-primary" />
              {report.scoutName || report.authorName}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[11px]">Observation Date</span>
            <span className="font-semibold text-white print:text-black block mt-0.5">
              {new Date(report.observationDate).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[11px]">Competition</span>
            <span className="font-semibold text-white print:text-black truncate block mt-0.5">
              {report.competition}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[11px]">Observed Fixture</span>
            <span className="font-semibold text-white print:text-black truncate block mt-0.5">
              {report.matchFixture || "Direct Scouting"}
            </span>
          </div>
        </div>

        {/* SPONDA Dossier Overview Badges (Role, Potential, Decision, Risk) */}
        {report.spondaData && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-navy-900/80 border border-white/10">
            <div>
              <span className="text-[10.5px] uppercase font-bold text-slate-400 block">Squad Role</span>
              <span className="text-sm font-extrabold text-white mt-0.5 block">{report.spondaData.role || "Starter"}</span>
            </div>
            <div>
              <span className="text-[10.5px] uppercase font-bold text-slate-400 block">Development Potential</span>
              <span className="text-sm font-extrabold text-sky-400 mt-0.5 block">{report.spondaData.developmentPotential || "High"}</span>
            </div>
            <div>
              <span className="text-[10.5px] uppercase font-bold text-slate-400 block">Transfer Risk</span>
              <span className={`text-sm font-extrabold mt-0.5 block ${report.spondaData.transferRisk === "High" ? "text-red-400" : report.spondaData.transferRisk === "Medium" ? "text-amber-400" : "text-emerald-400"}`}>
                {report.spondaData.transferRisk || "Low"}
              </span>
            </div>
            <div>
              <span className="text-[10.5px] uppercase font-bold text-slate-400 block">Scout Final Decision</span>
              <span className="text-sm font-black text-amber-400 mt-0.5 block">{report.spondaData.scoutDecision || "To Sign"}</span>
            </div>
          </div>
        )}

        {/* Tactical Context & Archetype */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {report.spondaData?.positionalProfile && (
            <div className="p-3 rounded-xl bg-navy-950/70 border border-white/10">
              <span className="text-primary font-bold uppercase tracking-wider text-[10.5px] block mb-1">
                Positional Profile Archetype
              </span>
              <p className="font-bold text-white text-sm">{report.spondaData.positionalProfile}</p>
              {report.spondaData.typeOfPlayer && (
                <span className="text-xs text-slate-400 block mt-0.5">Type: {report.spondaData.typeOfPlayer}</span>
              )}
            </div>
          )}

          {report.spondaData?.clubsStatus && (
            <div className="p-3 rounded-xl bg-navy-950/70 border border-white/10">
              <span className="text-primary font-bold uppercase tracking-wider text-[10.5px] block mb-1">
                Club Target Standard (Club Status)
              </span>
              <p className="font-bold text-amber-300 text-sm">{report.spondaData.clubsStatus}</p>
              <span className="text-xs text-slate-400 block mt-0.5">Scouting Status: {report.spondaData.scoutingStatus || "Priority"}</span>
            </div>
          )}
        </div>

        {/* SPONDA Rating Stars & Final Decision Box */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
          {/* Rating Stars card */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/15 via-navy-950 to-navy-950 border border-amber-500/30 flex flex-col justify-between">
            <div>
              <span className="text-xs uppercase font-extrabold text-amber-300 tracking-wider flex items-center gap-1.5">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                SPONDA Rating Score
              </span>
              <div className="text-4xl font-black text-white print:text-black mt-2 font-mono flex items-baseline gap-1.5">
                <span>{report.spondaData?.ratingStars ? report.spondaData.ratingStars.toFixed(1) : report.overallRating !== null ? (report.overallRating / 2).toFixed(1) : "3.5"}</span>
                <span className="text-sm text-slate-400 font-normal">/ 5.0 Stars</span>
              </div>
            </div>
            <div className="pt-2">
              <div className="flex gap-1 text-amber-400 text-lg">
                {"★★★★★".slice(0, Math.round(report.spondaData?.ratingStars || (report.overallRating ? report.overallRating / 2 : 3.5)))}
              </div>
            </div>
          </div>

          {/* Board Recommendation */}
          <div className="md:col-span-2 p-4 rounded-xl bg-gradient-to-br from-primary/15 via-navy-950 to-navy-950 border border-primary/30 flex flex-col justify-between">
            <div>
              <span className="text-xs uppercase font-extrabold text-primary tracking-wider flex items-center gap-1.5">
                <Target className="w-4 h-4" />
                Scouting Verdict &amp; Target Tier
              </span>
              <div className="text-xl font-bold text-white mt-2">
                {report.spondaData?.scoutDecision || report.recommendation.replace("_tier_", " Tier ").toUpperCase()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {report.spondaData?.reputation ? `Reputation: ${report.spondaData.reputation} • Projected Potential: ${report.spondaData.reputationPotential || "Global"}` : "Dossier recommendation recorded for sports direction review."}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="tier-a" size="md">
                {report.recommendation.replace("_tier_", " Tier ").toUpperCase()}
              </Badge>
              {report.spondaData?.transferRisk && (
                <Badge variant="outline" size="md">
                  Risk Level: {report.spondaData.transferRisk}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Technical-Tactical Tags (Tec-Tac Tags) */}
        {report.spondaData?.tecTacTags && report.spondaData.tecTacTags.length > 0 && (
          <div className="p-4 rounded-xl bg-navy-950/70 border border-white/10 space-y-2">
            <span className="font-bold text-white text-xs block">
              Observed Technical &amp; Tactical Traits (Tec-Tac Tags)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {report.spondaData.tecTacTags.map((tag, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-primary/15 text-primary border border-primary/30"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Specialities & Debilities */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 text-xs">
          {/* Specialities */}
          <div className="p-4 rounded-xl bg-navy-950/70 border border-emerald-500/20 space-y-2">
            <span className="font-bold text-emerald-400 uppercase tracking-wide text-[11px] flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5" />
              Specialities &amp; Key Virtues
            </span>
            <div className="flex flex-wrap gap-1.5">
              {(report.spondaData?.specialities || report.strengths).map((spec, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
                >
                  {spec}
                </span>
              ))}
            </div>
          </div>

          {/* Debilities */}
          <div className="p-4 rounded-xl bg-navy-950/70 border border-red-500/20 space-y-2">
            <span className="font-bold text-red-400 uppercase tracking-wide text-[11px] flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Debilities &amp; Weaknesses
            </span>
            <div className="flex flex-wrap gap-1.5">
              {(report.spondaData?.debilities || report.weaknesses).map((deb, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded text-[11px] font-medium bg-red-500/10 text-red-300 border border-red-500/30"
                >
                  {deb}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Pros and Cons */}
        {(report.spondaData?.pros || report.spondaData?.cons) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
            {report.spondaData.pros && (
              <div className="p-3.5 rounded-xl bg-navy-950/70 border border-white/10 space-y-1">
                <span className="font-bold text-emerald-400 uppercase text-[11px] block">Pros</span>
                <p className="text-slate-300 whitespace-pre-wrap">{report.spondaData.pros}</p>
              </div>
            )}
            {report.spondaData.cons && (
              <div className="p-3.5 rounded-xl bg-navy-950/70 border border-white/10 space-y-1">
                <span className="font-bold text-amber-400 uppercase text-[11px] block">Cons</span>
                <p className="text-slate-300 whitespace-pre-wrap">{report.spondaData.cons}</p>
              </div>
            )}
          </div>
        )}

        {/* Scout Qualitative Opinion */}
        {(report.spondaData?.scoutOpinion || report.freeTextNotes) && (
          <div className="p-4 rounded-xl bg-navy-950/70 border border-white/10 space-y-1.5 text-xs">
            <span className="font-bold text-white text-xs block">
              Scout Qualitative Opinion &amp; Synthesis
            </span>
            <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">
              {report.spondaData?.scoutOpinion || report.freeTextNotes}
            </p>
          </div>
        )}

        {/* Video Link */}
        {report.spondaData?.videoUrl && (
          <div className="p-3.5 rounded-xl bg-navy-950/70 border border-primary/30 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Video className="w-4 h-4 text-primary" />
              <span className="font-bold text-white">Video Footage / Match Clip</span>
            </div>
            <a
              href={report.spondaData.videoUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline font-mono text-[11px] truncate max-w-sm"
            >
              {report.spondaData.videoUrl}
            </a>
          </div>
        )}
      </div>

      {/* Version History & Audit Log */}
      <Card className="print:hidden">
        <CardHeader className="py-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm">Dossier Version History & Audit Log</CardTitle>
          </div>
          <CardDescription>Immutable tracking of modifications and reviewers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="divide-y divide-border/40">
            {report.versionHistory.map((ver) => (
              <div key={ver.version} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" size="sm">Version {ver.version}.0</Badge>
                    <span className="font-semibold text-white">{ver.authorName}</span>
                  </div>
                  <p className="text-muted-foreground text-[11px] mt-0.5">{ver.summary}</p>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {new Date(ver.timestamp).toLocaleString("en-GB")}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Review Workflow Section (Only for Chief Scout / Club Admin) */}
      {isChiefScoutOrAdmin && (
        <Card className="print:hidden">
          <CardHeader className="py-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm">Chief Scout Review & Approval Workflow</CardTitle>
            </div>
            <CardDescription>
              Review this dossier, provide formal feedback, or advance status to Approved.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.reviews.length > 0 && (
              <div className="p-3 rounded-md bg-secondary/30 border border-border/60 space-y-2 mb-3">
                <span className="text-[11px] font-semibold text-white block">Previous Reviews:</span>
                {report.reviews.map((rev) => (
                  <div key={rev.id} className="text-xs border-l-2 border-primary pl-2 py-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{rev.reviewerName} ({rev.reviewerRole})</span>
                      <span className="text-[10px] text-muted-foreground">{new Date(rev.timestamp).toLocaleDateString()}</span>
                    </div>
                    <p className="text-muted-foreground mt-0.5">{rev.comment}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-3">
                <textarea
                  className="w-full h-16 rounded-md border border-input bg-navy-900/80 p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Provide feedback, revision requests, or sign-off commentary..."
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <select
                  className="w-full h-9 rounded-md border border-input bg-navy-900/80 px-2 text-xs text-foreground"
                  value={reviewStatus}
                  onChange={(e) => setReviewStatus(e.target.value as any)}
                >
                  <option value="approved">Mark as Approved</option>
                  <option value="in_review">Request Revisions</option>
                  <option value="archived">Archive Dossier</option>
                </select>
                <Button
                  size="sm"
                  className="w-full"
                  isLoading={submittingReview}
                  onClick={handleReviewSubmit}
                  leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                >
                  Submit Review
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

