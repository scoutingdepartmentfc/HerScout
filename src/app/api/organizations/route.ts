import { NextRequest, NextResponse } from "next/server";
import {
  TenantContext,
  assertTenantAccess,
  assertRolePermission,
  isColorContrastAccessible,
  TenantSecurityError,
} from "@/lib/tenancy";
import { MOCK_ORGANIZATIONS } from "@/lib/mockData";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const orgId = url.searchParams.get("organizationId");
  const callerOrgId = req.headers.get("x-user-org-id") || "org-chelsea";
  const userRole = (req.headers.get("x-user-role") || "club_admin") as any;
  const isPlatformAdmin = req.headers.get("x-is-platform-admin") === "true";

  if (!orgId) {
    return NextResponse.json({ error: "Missing organizationId parameter" }, { status: 400 });
  }

  const org = MOCK_ORGANIZATIONS.get(orgId);
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const context: TenantContext = {
    userId: "user-123",
    userEmail: "scout@club.com",
    organizationId: callerOrgId,
    organization: MOCK_ORGANIZATIONS.get(callerOrgId) || org,
    role: userRole,
    isPlatformAdmin,
  };

  try {
    // Enforce Tenant Isolation Guard
    assertTenantAccess(context, orgId);
    return NextResponse.json({ organization: org });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message, code: "TENANT_VIOLATION" },
      { status: err.statusCode || 403 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const callerOrgId = req.headers.get("x-user-org-id") || "org-chelsea";
  const userRole = (req.headers.get("x-user-role") || "club_admin") as any;
  const isPlatformAdmin = req.headers.get("x-is-platform-admin") === "true";

  const body = await req.json();
  const { organizationId, name, primary_color, secondary_color, preferred_timezone, logo_url } = body;

  if (!organizationId) {
    return NextResponse.json({ error: "Missing organizationId" }, { status: 400 });
  }

  const org = MOCK_ORGANIZATIONS.get(organizationId);
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const context: TenantContext = {
    userId: "user-123",
    userEmail: "scout@club.com",
    organizationId: callerOrgId,
    organization: MOCK_ORGANIZATIONS.get(callerOrgId) || org,
    role: userRole,
    isPlatformAdmin,
  };

  try {
    // 1. Assert Tenant Isolation
    assertTenantAccess(context, organizationId);
    // 2. Assert Role Authorization (Only club_admin can update settings)
    assertRolePermission(context.role, ["club_admin"]);

    // 3. Contrast accessibility check
    if (primary_color && !isColorContrastAccessible(primary_color)) {
      return NextResponse.json(
        {
          error: "Selected primary color does not meet WCAG AA contrast standards against dark background.",
          code: "ACCESSIBILITY_WARNING",
        },
        { status: 422 }
      );
    }

    // Update in-memory record
    if (name) org.name = name;
    if (primary_color) org.primary_color = primary_color;
    if (secondary_color) org.secondary_color = secondary_color;
    if (preferred_timezone) org.preferred_timezone = preferred_timezone;
    if (logo_url !== undefined) org.logo_url = logo_url;

    MOCK_ORGANIZATIONS.set(organizationId, org);

    return NextResponse.json({
      success: true,
      message: "Club workspace settings updated successfully",
      organization: org,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message, code: "AUTHORIZATION_ERROR" },
      { status: err.statusCode || 403 }
    );
  }
}
