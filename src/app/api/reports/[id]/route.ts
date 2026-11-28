import { NextRequest, NextResponse } from "next/server";
import { ScoutingReport, calculateTransparentOverallRating } from "@/lib/reports";
import { supabaseAdmin } from "@/lib/supabase";
import { recordFullReportStars } from "@/lib/matchReportServer";

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
    playerClubId: p.current_team_id || team.id || null,
    playerDemarcacion: p.grupo_demarcacion || p.primary_position || null,
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

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const reportId = params.id;
  try {
    const db = supabaseAdmin as any;
    const { data, error } = await db
      .from("scouting_reports")
      .select("*")
      .eq("id", reportId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    // Fetch player card details separately if player_id exists
    if (data.player_id) {
      const { data: playerData } = await db
        .from("players")
        .select(`
          id,
          name,
          match_name,
          photo_url,
          country,
          birth_date,
          primary_position,
          grupo_demarcacion,
          fm_team_name,
          fm_team_badge_url,
          current_team_id
        `)
        .eq("id", data.player_id)
        .maybeSingle();

      if (playerData) {
        if (playerData.current_team_id) {
          const { data: teamData } = await db
            .from("teams")
            .select("id, name, badge_url, league_name")
            .eq("id", playerData.current_team_id)
            .maybeSingle();
          playerData.teams = teamData;
        }
        data.players = playerData;
      }
    }

    const report = rowToReport(data);
    return NextResponse.json({ report });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const reportId = params.id;
  const userName = req.headers.get("x-user-name") || "Elena Rostova";

  try {
    const db = supabaseAdmin as any;

    // Fetch existing report
    const { data: existing, error: fetchErr } = await db
      .from("scouting_reports")
      .select("*")
      .eq("id", reportId)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const body = await req.json();
    const {
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

    const calculatedRating = calculateTransparentOverallRating(ratings || {});
    const finalRating = calculatedRating ?? (spondaData?.ratingStars ? spondaData.ratingStars * 2 : existing.rating);

    const oldHistory = Array.isArray(existing.version_history) ? existing.version_history : [];
    const newVersionNum = oldHistory.length + 1;
    const updatedHistory = [
      ...oldHistory,
      {
        version: newVersionNum,
        timestamp: new Date().toISOString(),
        authorName: scoutName || userName,
        summary: "Dossier edited and updated.",
        changes: "Updated report content.",
      },
    ];

    const updatePayload = {
      player_id: playerId !== undefined ? playerId : existing.player_id,
      player_name: playerName !== undefined ? playerName : existing.player_name,
      player_club: playerClub !== undefined ? playerClub : existing.player_club,
      primary_position: primaryPosition || spondaData?.bestPosition?.[0] || existing.primary_position,
      match_id: matchId !== undefined ? matchId : existing.match_id,
      match_fixture: matchFixture !== undefined ? matchFixture : existing.match_fixture,
      competition: competition || existing.competition,
      observation_date: observationDate ? observationDate.slice(0, 10) : existing.observation_date,
      report_type: reportType || existing.report_type,
      status: status || existing.status,
      visibility: visibility || existing.visibility,
      scout_name: scoutName || spondaData?.scoutName || existing.scout_name,
      rating: finalRating,
      recommendation: recommendation || existing.recommendation,
      tactical_notes: freeTextNotes !== undefined ? freeTextNotes : existing.tactical_notes,
      strengths: Array.isArray(strengths) ? strengths : existing.strengths,
      weaknesses: Array.isArray(weaknesses) ? weaknesses : existing.weaknesses,
      sponda_data: spondaData !== undefined ? spondaData : existing.sponda_data,
      version_history: updatedHistory,
      updated_at: new Date().toISOString(),
    };

    const { data: updated, error: updateErr } = await db
      .from("scouting_reports")
      .update(updatePayload)
      .eq("id", reportId)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    await recordFullReportStars(db, updated);
    return NextResponse.json({ success: true, report: rowToReport(updated) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const reportId = params.id;
  try {
    const db = supabaseAdmin as any;
    const { error } = await db
      .from("scouting_reports")
      .delete()
      .eq("id", reportId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, deletedId: reportId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const reportId = params.id;
  const userName = req.headers.get("x-user-name") || "Elena Rostova";

  try {
    const db = supabaseAdmin as any;
    const { data: report, error: fetchErr } = await db
      .from("scouting_reports")
      .select("*")
      .eq("id", reportId)
      .single();

    if (fetchErr || !report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const body = await req.json();
    const { comment, newStatus } = body;

    const oldHistory = Array.isArray(report.version_history) ? report.version_history : [];
    const newVersionNum = oldHistory.length + 1;
    const updatedHistory = [
      ...oldHistory,
      {
        version: newVersionNum,
        timestamp: new Date().toISOString(),
        authorName: userName,
        summary: newStatus ? `Status updated to ${newStatus.toUpperCase()}` : "Review submitted",
        changes: comment,
      },
    ];

    const updatePayload: any = {
      version_history: updatedHistory,
      updated_at: new Date().toISOString(),
    };
    if (newStatus) updatePayload.status = newStatus;

    const { data: updated, error: updateErr } = await db
      .from("scouting_reports")
      .update(updatePayload)
      .eq("id", reportId)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    await recordFullReportStars(db, updated);
    return NextResponse.json({ success: true, report: rowToReport(updated) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
