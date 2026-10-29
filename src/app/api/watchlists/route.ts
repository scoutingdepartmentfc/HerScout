import { NextRequest, NextResponse } from "next/server";
import { TenantContext, assertTenantAccess } from "@/lib/tenancy";
import { MOCK_ORGANIZATIONS, MOCK_WATCHLISTS } from "@/lib/mockData";

export async function GET(req: NextRequest) {
  const callerOrgId = req.headers.get("x-user-org-id") || "org-chelsea";
  const userRole = (req.headers.get("x-user-role") || "scout") as any;
  const isPlatformAdmin = req.headers.get("x-is-platform-admin") === "true";

  const url = new URL(req.url);
  const targetOrgId = url.searchParams.get("organizationId") || callerOrgId;

  const org = MOCK_ORGANIZATIONS.get(callerOrgId);
  const context: TenantContext = {
    userId: "user-123",
    userEmail: "scout@club.com",
    organizationId: callerOrgId,
    organization: org || ({ id: callerOrgId } as any),
    role: userRole,
    isPlatformAdmin,
  };

  try {
    // Assert tenant boundary
    assertTenantAccess(context, targetOrgId);

    // Return strictly organization-isolated watchlists
    const clubWatchlists = MOCK_WATCHLISTS.filter((w) => w.organization_id === targetOrgId);
    return NextResponse.json({ watchlists: clubWatchlists });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message, code: "CROSS_TENANT_VIOLATION" },
      { status: err.statusCode || 403 }
    );
  }
}
