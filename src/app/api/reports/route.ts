import { NextRequest, NextResponse } from "next/server";
import { INITIAL_REPORTS } from "@/lib/mockReports";
import { ScoutingReport, calculateTransparentOverallRating } from "@/lib/reports";
import { assertTenantAccess, TenantContext } from "@/lib/tenancy";
import { MOCK_ORGANIZATIONS } from "@/lib/mockData";

// In-memory reports store
let reportsStore: ScoutingReport[] = [...INITIAL_REPORTS];

export async function GET(req: NextRequest) {
  const callerOrgId = req.headers.get("x-user-org-id") || "org-chelsea";
  const userId = req.headers.get("x-user-id") || "user-elena";
  const userRole = (req.headers.get("x-user-role") || "chief_scout") as any;
  const isPlatformAdmin = req.headers.get("x-is-platform-admin") === "true";

  const url = new URL(req.url);
  const targetOrgId = url.searchParams.get("organizationId") || callerOrgId;
  const filterPlayer = url.searchParams.get("playerId");
  const filterType = url.searchParams.get("reportType");
  const filterStatus = url.searchParams.get("status");

  const org = MOCK_ORGANIZATIONS.get(callerOrgId);
  const context: TenantContext = {
    userId,
    userEmail: "scout@club.com",
    organizationId: callerOrgId,
    organization: org || ({ id: callerOrgId } as any),
    role: userRole,
    isPlatformAdmin,
  };

  try {
    // 1. Enforce strict cross-tenant boundary
    assertTenantAccess(context, targetOrgId);

    // 2. Filter by organization and author-private visibility
    let filtered = reportsStore.filter((r) => {
      if (r.organizationId !== targetOrgId) return false;
      // If report is marked "author_private", only the author or chief scout / admin can view it
      if (
        r.visibility === "author_private" &&
        r.authorId !== userId &&
        userRole !== "chief_scout" &&
        userRole !== "club_admin" &&
        !isPlatformAdmin
      ) {
        return false;
      }
      return true;
    });

    if (filterPlayer) filtered = filtered.filter((r) => r.playerId === filterPlayer);
    if (filterType) filtered = filtered.filter((r) => r.reportType === filterType);
    if (filterStatus) filtered = filtered.filter((r) => r.status === filterStatus);

    return NextResponse.json({ reports: filtered });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message, code: "ACCESS_DENIED" },
      { status: err.statusCode || 403 }
    );
  }
}

export async function POST(req: NextRequest) {
  const callerOrgId = req.headers.get("x-user-org-id") || "org-chelsea";
  const userId = req.headers.get("x-user-id") || "user-elena";
  const userName = req.headers.get("x-user-name") || "Elena Rostova";
  const userRole = (req.headers.get("x-user-role") || "chief_scout") as any;
  const isPlatformAdmin = req.headers.get("x-is-platform-admin") === "true";

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
      matchFixture,
      competition,
      observationDate,
      tacticalContext,
      ratings,
      confidence,
      strengths,
      weaknesses,
      developmentAreas,
      recommendation,
      freeTextNotes,
    } = body;

    const targetOrg = organizationId || callerOrgId;

    const org = MOCK_ORGANIZATIONS.get(callerOrgId);
    const context: TenantContext = {
      userId,
      userEmail: "scout@club.com",
      organizationId: callerOrgId,
      organization: org || ({ id: callerOrgId } as any),
      role: userRole,
      isPlatformAdmin,
    };

    assertTenantAccess(context, targetOrg);

    const calculatedRating = calculateTransparentOverallRating(ratings || {});

    const newReport: ScoutingReport = {
      id: `rep-${Date.now()}`,
      organizationId: targetOrg,
      reportType: reportType || "full_scouting",
      status: status || "draft",
      visibility: visibility || "club_private",

      authorId: userId,
      authorName: userName,
      authorRole: userRole.replace("_", " "),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),

      playerId: playerId || "p-custom",
      playerName: playerName || "Target Player",
      playerClub: playerClub || "Observed Team",
      primaryPosition: primaryPosition || "Unspecified",
      matchFixture: matchFixture || "Scouted Match",
      competition: competition || "Official Monitored League",
      observationDate: observationDate || new Date().toISOString().split("T")[0],
      tacticalContext: tacticalContext || "",

      ratings: {
        technical: ratings?.technical ?? null,
        tactical: ratings?.tactical ?? null,
        physical: ratings?.physical ?? null,
        psychological: ratings?.psychological ?? null,
      },
      overallRating: calculatedRating,
      confidence: confidence || "medium",

      strengths: Array.isArray(strengths) ? strengths : [],
      weaknesses: Array.isArray(weaknesses) ? weaknesses : [],
      developmentAreas: Array.isArray(developmentAreas) ? developmentAreas : [],
      recommendation: recommendation || "monitor_tier_b",
      freeTextNotes: freeTextNotes || "",

      currentVersion: 1,
      versionHistory: [
        {
          version: 1,
          timestamp: new Date().toISOString(),
          authorName: userName,
          summary: "Initial report draft filed.",
          changes: "Created dossier.",
        },
      ],
      reviews: [],
    };

    reportsStore.unshift(newReport);

    return NextResponse.json({
      success: true,
      report: newReport,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message, code: "SAVE_ERROR" },
      { status: err.statusCode || 400 }
    );
  }
}

