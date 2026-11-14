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
  Pencil,
  Trash2,
} from "lucide-react";
import { SpondaReportEditorModal } from "@/components/scouting/SpondaReportEditorModal";
import { EscudoEquipo } from "@/components/scouting/EscudoEquipo";
import { Bandera } from "@/components/scouting/Bandera";
import { PlayerSilhouette } from "@/components/scouting/PlayerSilhouette";
import { ReportPrint } from "@/components/scouting/ReportPrint";

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

  // Edit modal & Delete state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
    <>
    <ReportPrint report={report} clubName={currentClub?.name} />
    <div className="space-y-6 max-w-5xl mx-auto print:hidden">
      {/* Top Action Bar (Hidden when printing to PDF) */}
      <div className="flex items-center justify-between print:hidden">
        <Link href="/reports">
          <Button variant="outline" size="sm" leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}>
            Back to Reports
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditOpen(true)}
            leftIcon={<Pencil className="w-3.5 h-3.5 text-sky-400" />}
          >
            Edit Dossier
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-rose-500/30 text-rose-300 hover:bg-rose-500/10 hover:border-rose-500/50"
            isLoading={isDeleting}
            onClick={async () => {
              if (!confirm("Are you sure you want to delete this scouting report?")) return;
              setIsDeleting(true);
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
                  router.push("/reports");
                } else {
                  const data = await res.json();
                  alert(data.error || "Failed to delete report");
                }
              } catch (e: any) {
                alert("Failed to delete report: " + e.message);
              } finally {
                setIsDeleting(false);
              }
            }}
            leftIcon={<Trash2 className="w-3.5 h-3.5 text-rose-400" />}
          >
            Delete
          </Button>
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
      <div className="p-6 rounded-2xl border border-white/10 bg-[#070e1e]/95 shadow-xl space-y-5 print:border-slate-300 print:text-black print:bg-white print:p-4">
        {/* Top Header: SPONDA Logo & Document Title */}
        <div className="flex items-center justify-between border-b border-white/10 print:border-slate-200 pb-3">
          <div className="flex items-center gap-3">
            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-white/20 bg-black shadow-md flex items-center justify-center print:border-slate-300">
              <img
                src="/logo1.png"
                alt="SPONDA"
                className="absolute max-w-none"
                style={{ width: 145, height: "auto", left: -88, top: -20 }}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase font-black tracking-widest text-primary print:text-sky-700 flex items-center gap-1.5">
                  SPONDA PRO SCOUTING DOSSIER
                </span>
                <span className="text-slate-500">•</span>
                <span className="text-xs text-slate-300 print:text-slate-700 font-semibold">{currentClub.name}</span>
                {report.visibility === "author_private" && (
                  <Badge variant="warning" size="sm" className="print:hidden">
                    <Lock className="w-2.5 h-2.5 mr-1" /> Confidential Draft
                  </Badge>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground print:text-slate-500">
                Professional Scouting & Evaluation Report
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs font-mono text-muted-foreground print:text-slate-600">
              Dossier #{report.id}
            </div>
            <div className="mt-1 flex items-center justify-end gap-1.5">
              <Badge variant="outline" size="sm" className="print:border-slate-400 print:text-black">
                v{report.currentVersion}.0
              </Badge>
              <Badge
                variant={report.status === "approved" ? "success" : "warning"}
                size="sm"
                className="print:border-slate-400"
              >
                {report.status.toUpperCase()}
              </Badge>
            </div>
          </div>
        </div>

        {/* Player Profile Card (Photo, Name, Demarcation, Club Badge) */}
        <div className="p-4 rounded-xl border border-white/10 bg-navy-950/70 print:bg-slate-50 print:border-slate-300 flex flex-col sm:flex-row items-center sm:items-stretch justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Player Photo */}
            <div className="w-20 h-24 sm:w-24 sm:h-28 rounded-xl bg-gradient-to-b from-white/10 to-white/5 border border-white/15 overflow-hidden flex items-end justify-center shrink-0 shadow-lg print:border-slate-300">
              {report.playerPhotoUrl ? (
                <img
                  src={report.playerPhotoUrl}
                  alt={report.playerName}
                  className="w-full h-full object-cover object-top"
                />
              ) : (
                <div className="w-full h-full p-2 flex items-end justify-center">
                  <PlayerSilhouette className="w-full h-full text-slate-400/80" />
                </div>
              )}
            </div>

            {/* Player Identity Details */}
            <div className="space-y-1 text-left">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white print:text-black">
                  {report.playerName}
                </h1>
                {report.playerCountry && (
                  <Bandera country={report.playerCountry} size="sm" />
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2.5 py-0.5 rounded-full font-bold bg-primary/20 text-primary border border-primary/30 print:bg-sky-100 print:text-sky-800 print:border-sky-300">
                  {report.playerDemarcacion || report.primaryPosition}
                </span>
                {report.playerCountry && (
                  <span className="text-slate-300 print:text-slate-600 font-medium">
                    {report.playerCountry}
                  </span>
                )}
                {report.playerBirthDate && (
                  <span className="text-muted-foreground print:text-slate-500 text-[11px]">
                    • Born {new Date(report.playerBirthDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                )}
              </div>

              {/* Club Information with Shield */}
              <div className="flex items-center gap-2 pt-1">
                <EscudoEquipo
                  teamId={report.playerClubId}
                  badgeUrl={report.playerClubBadgeUrl}
                  name={report.playerClub}
                  size={24}
                  className="shrink-0 drop-shadow"
                />
                <span className="font-bold text-sm text-slate-100 print:text-slate-800">
                  {report.playerClub || "No Club"}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Score Highlight */}
          <div className="flex sm:flex-col justify-center sm:items-end sm:text-right border-t sm:border-t-0 sm:border-l border-white/10 print:border-slate-300 pt-3 sm:pt-0 sm:pl-5 shrink-0">
            <span className="text-[10px] uppercase font-bold text-slate-400 print:text-slate-600 tracking-wider block">
              Overall Scouting Score
            </span>
            <div className="text-3xl sm:text-4xl font-black text-amber-400 print:text-amber-600 font-mono mt-0.5">
              {report.spondaData?.ratingStars ? report.spondaData.ratingStars.toFixed(1) : report.overallRating !== null ? (report.overallRating / 2).toFixed(1) : "3.5"}
              <span className="text-xs text-slate-400 print:text-slate-500 font-normal ml-1">/ 5★</span>
            </div>
            <span className="text-[11px] font-semibold text-emerald-400 print:text-emerald-700 mt-0.5 block">
              {report.spondaData?.scoutDecision || report.recommendation.replace("_tier_", " Tier ").toUpperCase()}
            </span>
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
        {report.spondaData && (report.spondaData.role || report.spondaData.developmentPotential || report.spondaData.transferRisk || report.spondaData.scoutDecision) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-navy-900/80 border border-white/10">
            {report.spondaData.role && (
              <div>
                <span className="text-[10.5px] uppercase font-bold text-slate-400 block">Squad Role</span>
                <span className="text-sm font-extrabold text-white mt-0.5 block">{report.spondaData.role}</span>
              </div>
            )}
            {report.spondaData.developmentPotential && (
              <div>
                <span className="text-[10.5px] uppercase font-bold text-slate-400 block">Development Potential</span>
                <span className="text-sm font-extrabold text-sky-400 mt-0.5 block">{report.spondaData.developmentPotential}</span>
              </div>
            )}
            {report.spondaData.transferRisk && (
              <div>
                <span className="text-[10.5px] uppercase font-bold text-slate-400 block">Transfer Risk</span>
                <span className={`text-sm font-extrabold mt-0.5 block ${report.spondaData.transferRisk === "High" ? "text-red-400" : report.spondaData.transferRisk === "Medium" ? "text-amber-400" : "text-emerald-400"}`}>
                  {report.spondaData.transferRisk}
                </span>
              </div>
            )}
            {report.spondaData.scoutDecision && (
              <div>
                <span className="text-[10.5px] uppercase font-bold text-slate-400 block">Scout Final Decision</span>
                <span className="text-sm font-black text-amber-400 mt-0.5 block">{report.spondaData.scoutDecision}</span>
              </div>
            )}
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
      <Card className="print:rounded-xl print:border print:border-slate-300 print:bg-white print:text-black">
        <CardHeader className="py-3 print:border-b print:border-slate-200">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary print:text-slate-700" />
            <CardTitle className="text-sm print:text-black">Dossier Version History & Audit Log</CardTitle>
          </div>
          <CardDescription className="print:text-slate-500">Immutable tracking of modifications and reviewers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 print:p-3">
          <div className="divide-y divide-border/40 print:divide-slate-200">
            {report.versionHistory.map((ver) => (
              <div key={ver.version} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" size="sm" className="print:border-slate-400 print:text-black">Version {ver.version}.0</Badge>
                    <span className="font-semibold text-white print:text-black">{ver.authorName}</span>
                  </div>
                  <p className="text-muted-foreground print:text-slate-600 text-[11px] mt-0.5">{ver.summary}</p>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground print:text-slate-500">
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

      {/* Edit Modal */}
      {report && (
        <SpondaReportEditorModal
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          onSave={async (payload) => {
            const res = await fetch(`/api/reports/${reportId}`, {
              method: "PUT",
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
              const errData = await res.json();
              throw new Error(errData.error || "Failed to update report");
            }
            setIsEditOpen(false);
            fetchReport();
          }}
          existingReport={report}
          currentUser={{
            name: user.name,
            role: userRole,
            orgId: currentClub.id,
          }}
        />
      )}
    </div>
    </>
  );
}
