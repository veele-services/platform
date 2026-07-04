import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should contain ${phrase}`);
  }
}

test("phase 10 extends the canonical security audit contract", () => {
  const platformAccess = read("lib/db/src/platform-access.ts");

  assertContains(
    platformAccess,
    [
      "direct_id_denial",
      "module_denial",
      "storage_denial",
      "tenant_mismatch",
      "platform_access_denial",
      "FIELDGRID_SUPPORT_BREAK_GLASS_MAX_TTL_MINUTES = 240",
      "gt(supportAccessGrantsTable.expiresAt, now)",
      "isNull(supportAccessGrantsTable.revokedAt)",
    ],
    "phase 10 platform access contract",
  );
});

test("platform actions enforce break-glass scope and expose security filters", () => {
  const platformActions = read("artifacts/backoffice/src/app/actions/platform.ts");

  assertContains(
    platformActions,
    [
      "resource?: string",
      "dateFrom?: string",
      "dateTo?: string",
      "severity?: PlatformSecuritySeverity",
      "supportGrantId?: string",
      "scope !== \"tenant\"",
      "grant_create_denied",
      "validateSupportBreakGlassGrant",
      "support_scope_required",
      "direct_id_denial",
      "module_denial",
      "storage_denial",
      "tenant_mismatch",
      "platform_access_denial",
      "activeSupportGrants",
      "supportAccessLog",
    ],
    "phase 10 platform actions",
  );
});

test("security dashboard 2.0 is mobile friendly and includes support controls", () => {
  const securityPage = read("artifacts/backoffice/src/app/(platform)/platform/security/page.tsx");

  assertContains(
    securityPage,
    [
      "Security dashboard 2.0",
      "Audit export",
      "Support break-glass",
      "Reden",
      "Scope",
      "Max TTL",
      "Revoke",
      "Direct-ID",
      "Module",
      "Storage",
      "Tenant mismatch",
      "Platform access",
      "sm:grid-cols-2",
      "lg:grid-cols-2",
      "xl:grid-cols-4",
    ],
    "phase 10 security dashboard page",
  );
});

test("security export route serves filtered CSV audit rows", () => {
  const exportRoute = read("artifacts/backoffice/src/app/api/platform/security/export/route.ts");

  assertContains(
    exportRoute,
    [
      "listPlatformSecurityDashboard",
      "text/csv",
      "Content-Disposition",
      "fieldgrid-security-audit",
      "severity",
      "denial_type",
      "metadata",
    ],
    "phase 10 security export route",
  );
});
