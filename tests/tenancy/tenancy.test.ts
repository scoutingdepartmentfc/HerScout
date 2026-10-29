import { describe, it, expect } from "vitest";
import {
  assertTenantAccess,
  assertRolePermission,
  isColorContrastAccessible,
  TenantContext,
  TenantSecurityError,
} from "../../src/lib/tenancy";

describe("HerScout Multi-Tenancy & Security Guard Tests", () => {
  const chelseaOrg = {
    id: "org-chelsea",
    name: "Chelsea FC Women",
    short_name: "Chelsea",
    slug: "chelsea-fcw",
    primary_color: "217 95% 45%",
    secondary_color: "215 28% 17%",
    accent_color: "160 84% 39%",
    preferred_timezone: "Europe/London",
    subscription_plan: "enterprise" as const,
    subscription_status: "active" as const,
    seat_limit: 15,
    feature_entitlements: {
      pdf_export: true,
      advanced_radars: true,
      video_attachments: true,
    },
  };

  const chelseaScoutContext: TenantContext = {
    userId: "user-1",
    userEmail: "scout@chelsea.com",
    organizationId: "org-chelsea",
    organization: chelseaOrg,
    role: "scout",
    isPlatformAdmin: false,
  };

  const chelseaAdminContext: TenantContext = {
    ...chelseaScoutContext,
    role: "club_admin",
  };

  const platformAdminContext: TenantContext = {
    userId: "admin-root",
    userEmail: "owner@herscout.pro",
    organizationId: "org-platform",
    organization: { ...chelseaOrg, id: "org-platform" },
    role: "club_admin",
    isPlatformAdmin: true,
  };

  it("1. Allows user to access their own organization data", () => {
    expect(() => {
      assertTenantAccess(chelseaScoutContext, "org-chelsea");
    }).not.toThrow();
  });

  it("2. Blocks cross-tenant access attempt by regular club user (direct ID tampering)", () => {
    expect(() => {
      // Chelsea scout attempting to read Barça organization data
      assertTenantAccess(chelseaScoutContext, "org-barca");
    }).toThrow(TenantSecurityError);
  });

  it("3. Allows authorized platform admin to inspect cross-tenant data with override", () => {
    expect(() => {
      assertTenantAccess(platformAdminContext, "org-barca");
    }).not.toThrow();
  });

  it("4. Blocks access if organization subscription is suspended", () => {
    const suspendedContext: TenantContext = {
      ...chelseaScoutContext,
      organization: {
        ...chelseaOrg,
        subscription_status: "suspended",
      },
    };

    expect(() => {
      assertTenantAccess(suspendedContext, "org-chelsea");
    }).toThrow("Club subscription is suspended");
  });

  it("5. Role authorization enforces club_admin for sensitive settings updates", () => {
    // Scout should be forbidden
    expect(() => {
      assertRolePermission(chelseaScoutContext.role, ["club_admin"]);
    }).toThrow("Insufficient role permissions");

    // Admin should succeed
    expect(() => {
      assertRolePermission(chelseaAdminContext.role, ["club_admin"]);
    }).not.toThrow();
  });

  it("6. Contrast check flags low-contrast colors against dark navy", () => {
    // Accessible color (lightness 60%)
    expect(isColorContrastAccessible("217 91% 60%")).toBe(true);

    // Inaccessible dark color (lightness 15%)
    expect(isColorContrastAccessible("217 91% 15%")).toBe(false);
  });
});

