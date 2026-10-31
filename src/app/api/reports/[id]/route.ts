import { NextRequest, NextResponse } from "next/server";
import { reportsStore } from "@/lib/reportsStore";
import { ScoutingReport, calculateTransparentOverallRating } from "@/lib/reports";
import { assertTenantAccess, TenantContext } from "@/lib/tenancy";
import { MOCK_ORGANIZATIONS } from "@/lib/mockData";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const callerOrgId = req.headers.get("x-user-org-id") || "org-chelsea";
  const userId = req.headers.get("x-user-id") || "user-elena";
  const userRole = (req.headers.get("x-user-role") || "chief_scout") as any;
  const isPlatformAdmin = req.headers.get("x-is-platform-admin") === "true";

  const reportId = params.id;
  const report = reportsStore.find((r) => r.id === reportId);

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

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
    // Check Tenant Isolation
    assertTenantAccess(context, report.organizationId);

    // Check author privacy
    if (
      report.visibility === "author_private" &&
      report.authorId !== userId &&
      userRole !== "chief_scout" &&
      userRole !== "club_admin" &&
      !isPlatformAdmin
    ) {
      return NextResponse.json(
        { error: "Confidential draft: visible strictly to author and Chief Scout." },
        { status: 403 }
      );
    }

    return NextResponse.json({ report });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message, code: "ACCESS_DENIED" },
      { status: err.statusCode || 403 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Handles Review feedback / workflow status change
  const callerOrgId = req.headers.get("x-user-org-id") || "org-chelsea";
  const userId = req.headers.get("x-user-id") || "user-elena";
  const userName = req.headers.get("x-user-name") || "Elena Rostova";
  const userRole = (req.headers.get("x-user-role") || "chief_scout") as any;
  const isPlatformAdmin = req.headers.get("x-is-platform-admin") === "true";

  const reportId = params.id;
  const report = reportsStore.find((r) => r.id === reportId);

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

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
    assertTenantAccess(context, report.organizationId);

    const body = await req.json();
    const { comment, newStatus } = body;

    if (!comment) {
      return NextResponse.json({ error: "Review comment is required" }, { status: 400 });
    }

    const review = {
      id: `rev-${Date.now()}`,
      reviewerId: userId,
      reviewerName: userName,
      reviewerRole: userRole.replace("_", " "),
      timestamp: new Date().toISOString(),
      statusChange: newStatus,
      comment,
    };

    report.reviews.push(review);
    if (newStatus) {
      report.status = newStatus;
      report.currentVersion += 1;
      report.versionHistory.push({
        version: report.currentVersion,
        timestamp: new Date().toISOString(),
        authorName: userName,
        summary: `Status updated to ${newStatus.toUpperCase()}`,
        changes: comment,
      });
    }

    return NextResponse.json({ success: true, report });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: err.statusCode || 403 }
    );
  }
}

