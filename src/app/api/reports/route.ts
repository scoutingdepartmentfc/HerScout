import { NextRequest, NextResponse } from "next/server";
import { ScoutingReport, calculateTransparentOverallRating } from "@/lib/reports";
import { supabaseAdmin } from "@/lib/supabase";
import { recordFullReportStars } from "@/lib/matchReportServer";

// Map Supabase DB row to application ScoutingReport
function rowToReport(r: any): ScoutingReport {
  const p = r.players || {};
  const team = p.teams || {};
  return {
    id: r.id,
    organizationId: r.organization_id,
    reportType: r.report_type || "full_scouting",
    status: r.status || "draft",
    visibility: r.visibility || "club_private",

    authorId: r.author_id,
    authorName: r.scout_name || "Scout",
    authorRole: "Scout",
    scoutName: r.scout_name || undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,

    playerId: r.player_id,
    playerName: r.player_name || p.match_name || p.name || "Player",
    playerClub: r.player_club || p.fm_team_name || team.name || "",
    playerCountry: p.country || undefined,
    playerPhotoUrl: p.photo_url || null,
    playerClubBadgeUrl: p.fm_team_badge_url || team.badge_url || null,
    playerClubId: team.id || null,
    playerDemarcacion: p.demarcacion || p.primary_position || null,
    playerBirthDate: p.birth_date || null,
    primaryPosition: r.primary_position || p.primary_position || "Unspecified",
    matchId: r.match_id || null,
    matchFixture: r.match_fixture || "",
    competition: r.competition || "",
    observationDate: r.observation_date ? String(r.observation_date).slice(0, 10) : String(r.created_at).slice(0, 10),
    tacticalContext: r.tactical_notes || "",

    ratings: {
      technical: Number(r.rating) || null,
      tactical: Number(r.rating) || null,
      physical: Number(r.rating) || null,
      psychological: null,
    },
    overallRating: r.rating != null ? Number(r.rating) : null,
    confidence: "medium",

    strengths: Array.isArray(r.strengths) ? r.strengths : [],
    weaknesses: Array.isArray(r.weaknesses) ? r.weaknesses : [],
    developmentAreas: [],
    recommendation: r.recommendation || "monitor_tier_b",
    freeTextNotes: r.tactical_notes || "",

    spondaData: r.sponda_data || undefined,
    currentVersion: Array.isArray(r.version_history) && r.version_history.length > 0 ? r.version_history.length : 1,
    versionHistory: Array.isArray(r.version_history) && r.version_history.length > 0
      ? r.version_history
      : [
          {
            version: 1,
            timestamp: r.created_at,
            authorName: r.scout_name || "Scout",
            summary: "Initial report draft filed.",
            changes: "Created dossier.",
          },
        ],
    reviews: [],
  };
}

export async function GET(req: NextRequest) {
  const callerOrgId = req.headers.get("x-user-org-id") || "sponda-default";
  const userId = req.headers.get("x-user-id") || "user-elena";
  const userRole = (req.headers.get("x-user-role") || "chief_scout") as any;
  const isPlatformAdmin = req.headers.get("x-is-platform-admin") === "true";

  const url = new URL(req.url);
  const filterPlayer = url.searchParams.get("playerId");
  const filterType = url.searchParams.get("reportType");
  const filterStatus = url.searchParams.get("status");

  try {
    const db = supabaseAdmin as any;
    let query = db
      .from("scouting_reports")
      .select("*")
      .order("created_at", { ascending: false });

    // Filter by organization if UUID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(callerOrgId);
    if (isUuid) {
      query = query.eq("organization_id", callerOrgId);
    }

    if (filterPlayer) query = query.eq("player_id", filterPlayer);
    if (filterType) query = query.eq("report_type", filterType);
    if (filterStatus) query = query.eq("status", filterStatus);

    const { data, error } = await query;
    if (error) {
      console.error("Error fetching reports from Supabase:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const reports: ScoutingReport[] = (data || []).map(rowToReport);

    return NextResponse.json({ reports });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const callerOrgId = req.headers.get("x-user-org-id") || "sponda-default";
  const userName = req.headers.get("x-user-name") || "Elena Rostova";

  try {
    const body = await req.json();
    const {
      organizationId,
      reportType,
      status,
      visibility,
      playerId,
      playerName,
      playerClub,
      primaryPosition,
      matchId,
      matchFixture,
      competition,
      observationDate,
      tacticalContext,
      ratings,
      strengths,
      weaknesses,
      recommendation,
      freeTextNotes,
      scoutName,
      spondaData,
    } = body;

    const orgIdToUse = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId || callerOrgId)
      ? (organizationId || callerOrgId)
      : "00000000-0000-0000-0000-000000000000";

    const calculatedRating = calculateTransparentOverallRating(ratings || {});
    const finalRating = calculatedRating ?? (spondaData?.ratingStars ? spondaData.ratingStars * 2 : 7.0);

    const versionHistory = [
      {
        version: 1,
        timestamp: new Date().toISOString(),
        authorName: scoutName || userName,
        summary: "Initial report draft filed.",
        changes: "Created dossier.",
      },
    ];

    const insertPayload = {
      organization_id: orgIdToUse,
      author_id: "00000000-0000-0000-0000-000000000000",
      player_id: playerId || `custom-${Date.now()}`,
      player_name: playerName || "Target Player",
      player_club: playerClub || "",
      primary_position: primaryPosition || spondaData?.bestPosition?.[0] || "Unspecified",
      match_id: matchId || null,
      match_fixture: matchFixture || "Observation Match",
      competition: competition || "Official League",
      observation_date: observationDate ? observationDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
      report_type: reportType || "full_scouting",
      status: status || "draft",
      visibility: visibility || "club_private",
      scout_name: scoutName || spondaData?.scoutName || userName,
      rating: finalRating,
      recommendation: recommendation || "monitor_tier_b",
      tactical_notes: freeTextNotes || spondaData?.scoutOpinion || tacticalContext || "",
      strengths: Array.isArray(strengths) ? strengths : [],
      weaknesses: Array.isArray(weaknesses) ? weaknesses : [],
      sponda_data: spondaData || {},
      version_history: versionHistory,
    };

    const db = supabaseAdmin as any;
    const { data, error } = await db
      .from("scouting_reports")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error("Supabase insert report error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await recordFullReportStars(db, data);
    const newReport = rowToReport(data);

    return NextResponse.json({
      success: true,
      report: newReport,
    });
  } catch (err: any) {
    console.error("Save report exception:", err);
    return NextResponse.json(
      { error: err.message, code: "SAVE_ERROR" },
      { status: 400 }
    );
  }
}
