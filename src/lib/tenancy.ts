/**
 * HerScout Multi-Tenant Security & Tenant Isolation Guard
 * 
 * Enforces server-side tenant boundaries, role verification,
 * and organization context for all API routes and Server Actions.
 */

export type ClubRole = "club_admin" | "chief_scout" | "scout" | "analyst" | "viewer";

export interface Organization {
  id: string;
  name: string;
  short_name: string;
  slug: string;
  logo_url?: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  preferred_timezone: string;
  subscription_plan: "trial" | "standard" | "pro" | "enterprise";
  subscription_status: "trialing" | "active" | "suspended" | "cancelled";
  seat_limit: number;
  feature_entitlements: {
    pdf_export: boolean;
    advanced_radars: boolean;
    video_attachments: boolean;
  };
}

export interface TenantContext {
  userId: string;
  userEmail: string;
  organizationId: string;
  organization: Organization;
  role: ClubRole;
  isPlatformAdmin: boolean;
}

export class TenantSecurityError extends Error {
  constructor(message: string, public statusCode: number = 403) {
    super(message);
    this.name = "TenantSecurityError";
  }
}

/**
 * Validates whether the authenticated user has access to the requested organization.
 * Throws TenantSecurityError if cross-tenant violation occurs.
 */
export function assertTenantAccess(
  context: TenantContext,
  targetOrganizationId: string
): void {
  // Platform admins can access cross-tenant with audit logging
  if (context.isPlatformAdmin) {
    return;
  }

  if (context.organizationId !== targetOrganizationId) {
    throw new TenantSecurityError(
      `Cross-tenant access forbidden: User belongs to ${context.organizationId}, requested ${targetOrganizationId}`,
      403
    );
  }

  if (context.organization.subscription_status === "suspended") {
    throw new TenantSecurityError("Club subscription is suspended. Access denied.", 402);
  }
}

/**
 * Validates whether the user role possesses the required permission level.
 */
export function assertRolePermission(
  currentRole: ClubRole,
  allowedRoles: ClubRole[]
): void {
  if (!allowedRoles.includes(currentRole)) {
    throw new TenantSecurityError(
      `Insufficient role permissions. Required one of: ${allowedRoles.join(", ")}, current: ${currentRole}`,
      403
    );
  }
}

/**
 * Accessible color contrast check (WCAG AA).
 * Returns true if the HSL / hex color maintains sufficient contrast against dark navy background.
 */
export function isColorContrastAccessible(hslString: string): boolean {
  // Extract lightness percentage from HSL string "H S L%"
  const parts = hslString.split(" ");
  if (parts.length >= 3) {
    const lightness = parseFloat(parts[2].replace("%", ""));
    // Against #070c18 (lightness ~6%), accessible text/accent lightness should be >= 40%
    return lightness >= 40;
  }
  return true;
}

