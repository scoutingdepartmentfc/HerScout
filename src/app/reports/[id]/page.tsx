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
      <div className="p-6 rounded-lg border border-border/80 bg-card shadow-sm space-y-4 print:border-black print:text-black">
        <div className="flex items-start justify-between border-b border-border/60 pb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center font-bold text-lg text-white"
              style={{ backgroundColor: `hsl(${currentClub.primaryColor})` }}
            >
              {currentClub.shortName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-bold tracking-wider text-primary">
                  {currentClub.name} • Scouting Department
                </span>
                {report.visibility === "author_private" && (
                  <Badge variant="warning" size="sm">
                    <Lock className="w-2.5 h-2.5 mr-1" /> Confidential Draft
                  </Badge>
                )}
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white print:text-black mt-0.5">
                {report.playerName}
              </h1>
              <p className="text-xs text-muted-foreground print:text-gray-700">
                {report.primaryPosition} • {report.playerClub} ({report.playerCountry})
              </p>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs font-mono text-muted-foreground print:text-gray-600">
              Dossier ID: {report.id}
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-2 border-b border-border/40 text-xs">
          <div>
            <span className="text-muted-foreground block text-[11px]">Lead Scout</span>
            <span className="font-semibold text-white print:text-black">{report.authorName}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[11px]">Observation Date</span>
            <span className="font-semibold text-white print:text-black">{report.observationDate}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[11px]">Competition</span>
            <span className="font-semibold text-white print:text-black truncate block">{report.competition}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[11px]">Match Observed</span>
            <span className="font-semibold text-white print:text-black truncate block">{report.matchFixture || "General Tracking"}</span>
          </div>
        </div>

        {/* Tactical Context */}
        {report.tacticalContext && (
          <div className="p-3 rounded-md bg-navy-900/60 border border-border/60 text-xs print:bg-gray-100">
            <span className="font-semibold text-primary block mb-0.5">Tactical Role & Opponent Context</span>
            <p className="text-muted-foreground print:text-gray-800">{report.tacticalContext}</p>
          </div>
        )}

        {/* Assessments Matrix & Overall Score */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
          {/* 4 Dimension Ratings */}
          <div className="md:col-span-2 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Performance Dimensions (1.0 to 10.0 Scale)
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-md bg-secondary/40 border border-border/60">
                <span className="text-[11px] text-muted-foreground block">Technical Assessment</span>
                <span className="text-xl font-bold text-white print:text-black">
                  {report.ratings.technical !== null ? report.ratings.technical.toFixed(1) : "N/A"}
                </span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">First touch, passing, ball security</span>
              </div>
              <div className="p-3 rounded-md bg-secondary/40 border border-border/60">
                <span className="text-[11px] text-muted-foreground block">Tactical Assessment</span>
                <span className="text-xl font-bold text-white print:text-black">
                  {report.ratings.tactical !== null ? report.ratings.tactical.toFixed(1) : "N/A"}
                </span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">Positioning, press resistance, spatial IQ</span>
              </div>
              <div className="p-3 rounded-md bg-secondary/40 border border-border/60">
                <span className="text-[11px] text-muted-foreground block">Physical Assessment</span>
                <span className="text-xl font-bold text-white print:text-black">
                  {report.ratings.physical !== null ? report.ratings.physical.toFixed(1) : "N/A"}
                </span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">Acceleration, duel stamina, recovery</span>
              </div>
              <div className="p-3 rounded-md bg-secondary/40 border border-border/60">
                <span className="text-[11px] text-muted-foreground block">Psychological & Mental</span>
                <span className="text-xl font-bold text-white print:text-black">
                  {report.ratings.psychological !== null ? report.ratings.psychological.toFixed(1) : "Not Assessed"}
                </span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">Composure, work ethic, leadership</span>
              </div>
            </div>
          </div>

          {/* Overall Rating & Recommendation Box */}
          <div className="p-4 rounded-lg border border-primary/40 bg-primary/10 flex flex-col justify-between text-center print:border-black print:bg-gray-100">
            <div>
              <span className="text-xs uppercase font-bold text-primary tracking-wider">
                Overall Transparent Grade
              </span>
              <div className="text-4xl font-black text-white print:text-black mt-2">
                {report.overallRating !== null ? report.overallRating.toFixed(1) : "N/A"}
              </div>
              <p className="text-[10px] text-muted-foreground print:text-gray-600 mt-1">
                Arithmetic mean of all assessed dimensions
              </p>
            </div>

            <div className="pt-4 border-t border-primary/20">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">
                Final Board Recommendation
              </span>
              <Badge
                variant={report.recommendation.includes("tier_a") ? "tier-a" : "tier-b"}
                size="md"
                className="justify-center w-full"
              >
                {report.recommendation.replace("_tier_", " Tier ").toUpperCase()}
              </Badge>
            </div>
          </div>
        </div>

        {/* Strengths & Weaknesses Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-border/40 text-xs">
          <div className="space-y-2">
            <span className="font-bold text-emerald-400 uppercase tracking-wide text-[11px] block">
              Observed Strengths
            </span>
            <ul className="space-y-1 text-muted-foreground print:text-gray-800 list-disc list-inside">
              {report.strengths.map((str, idx) => (
                <li key={idx}>{str}</li>
              ))}
            </ul>
          </div>
          <div className="space-y-2">
            <span className="font-bold text-amber-400 uppercase tracking-wide text-[11px] block">
              Weaknesses & Areas for Development
            </span>
            <ul className="space-y-1 text-muted-foreground print:text-gray-800 list-disc list-inside">
              {report.weaknesses.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Free Text Notes */}
        <div className="pt-4 border-t border-border/40 text-xs space-y-1">
          <span className="font-bold text-white print:text-black block">Comprehensive Scout Notes</span>
          <p className="text-muted-foreground print:text-gray-800 leading-relaxed whitespace-pre-wrap">
            {report.freeTextNotes}
          </p>
        </div>
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

