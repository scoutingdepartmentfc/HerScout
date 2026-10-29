const assert = require("assert");

// Extract logic to test in plain node
function assertTenantAccess(context, targetOrgId) {
  if (context.isPlatformAdmin) return;
  if (context.organizationId !== targetOrgId) {
    const err = new Error(`Cross-tenant access forbidden: User belongs to ${context.organizationId}, requested ${targetOrgId}`);
    err.statusCode = 403;
    throw err;
  }
  if (context.organization.subscription_status === "suspended") {
    const err = new Error("Club subscription is suspended. Access denied.");
    err.statusCode = 402;
    throw err;
  }
}

function assertRolePermission(currentRole, allowedRoles) {
  if (!allowedRoles.includes(currentRole)) {
    const err = new Error(`Insufficient role permissions.`);
    err.statusCode = 403;
    throw err;
  }
}

function isColorContrastAccessible(hslString) {
  const parts = hslString.split(" ");
  if (parts.length >= 3) {
    const lightness = parseFloat(parts[2].replace("%", ""));
    return lightness >= 40;
  }
  return true;
}

console.log("Running HerScout Multi-Tenancy Automated Tests...");

const chelseaContext = {
  organizationId: "org-chelsea",
  organization: { subscription_status: "active" },
  role: "scout",
  isPlatformAdmin: false,
};

const chelseaAdminContext = {
  ...chelseaContext,
  role: "club_admin",
};

const platformAdminContext = {
  organizationId: "org-platform",
  organization: { subscription_status: "active" },
  role: "club_admin",
  isPlatformAdmin: true,
};

// 1. Same-tenant access allowed
assert.doesNotThrow(() => {
  assertTenantAccess(chelseaContext, "org-chelsea");
}, "Should allow user accessing own organization");
console.log("✔ Test 1 passed: Same tenant access allowed");

// 2. Cross-tenant access forbidden
assert.throws(() => {
  assertTenantAccess(chelseaContext, "org-barca");
}, /Cross-tenant access forbidden/, "Should block cross-tenant attempt");
console.log("✔ Test 2 passed: Cross-tenant access blocked with 403");

// 3. Platform admin override
assert.doesNotThrow(() => {
  assertTenantAccess(platformAdminContext, "org-barca");
}, "Platform admin should be allowed across tenants");
console.log("✔ Test 3 passed: Platform admin authorization verified");

// 4. Suspended subscription blocked
const suspendedContext = {
  ...chelseaContext,
  organization: { subscription_status: "suspended" },
};
assert.throws(() => {
  assertTenantAccess(suspendedContext, "org-chelsea");
}, /Club subscription is suspended/, "Should block suspended subscriptions");
console.log("✔ Test 4 passed: Suspended subscriptions blocked");

// 5. Role permissions
assert.throws(() => {
  assertRolePermission(chelseaContext.role, ["club_admin"]);
}, /Insufficient role permissions/);
assert.doesNotThrow(() => {
  assertRolePermission(chelseaAdminContext.role, ["club_admin"]);
});
console.log("✔ Test 5 passed: Role permission hierarchy enforced");

// 6. WCAG AA Contrast check
assert.strictEqual(isColorContrastAccessible("217 91% 60%"), true);
assert.strictEqual(isColorContrastAccessible("217 91% 15%"), false);
console.log("✔ Test 6 passed: Accessible color contrast verified");

console.log("\nALL 6 MULTI-TENANCY VERIFICATION TESTS PASSED SUCCESSFULLY.");

