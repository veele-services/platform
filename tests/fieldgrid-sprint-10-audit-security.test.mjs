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

const platformAccess = "lib/db/src/platform-access.ts";
const platformActions = "artifacts/backoffice/src/app/actions/platform.ts";
const securityPage = "artifacts/backoffice/src/app/(platform)/platform/security/page.tsx";
const sprintContract = "docs/fieldgrid-sprint-10-audit-security.md";
const sprintPlan = "docs/fieldgrid-saas-proof-sprint-plan.md";

test("Sprint 10 defines the central security audit contract", () => {
  const access = read(platformAccess);

  assertContains(
    access,
    [
      "FIELDGRID_SECURITY_AUDIT_SCOPES",
      "FIELDGRID_SECURITY_AUDIT_EVENT_TYPES",
      "FIELDGRID_SECURITY_AUDIT_CONTRACT",
      "support_access",
      "download",
      "pdf",
      "direct_id_denial",
      "module_denial",
      "storage_denial",
      "platform_admin",
      "null-for-platform-only",
    ],
    platformAccess,
  );
});

test("Sprint 10 dashboard combines support, tenant and platform audit sources", () => {
  const actions = read(platformActions);

  assertContains(
    actions,
    [
      "auditLogTable",
      "supportAccessAuditLogTable",
      "PlatformSecurityDashboardFilters",
      "source: \"support_access_audit_log\"",
      "source: \"audit_log\"",
      "scope: \"support\"",
      "scope: row.tenantId ? \"tenant\" : \"platform\"",
      "tenantOptions",
      "events",
    ],
    platformActions,
  );
});

test("Sprint 10 dashboard filters by tenant, actor, event type and scope", () => {
  const actions = read(platformActions);
  const page = read(securityPage);

  assertContains(
    actions,
    [
      "normalizeSecurityFilters",
      "matchesPlatformSecurityFilter",
      "tenantId",
      "actorId",
      "eventType",
      "scope",
      "event.categories.includes(filters.eventType)",
    ],
    platformActions,
  );

  assertContains(
    page,
    [
      "method=\"get\"",
      "name=\"tenantId\"",
      "name=\"actorId\"",
      "name=\"eventType\"",
      "name=\"scope\"",
      "Alle tenants",
      "Alle scopes",
      "Reset",
    ],
    securityPage,
  );
});

test("Sprint 10 contract maps audit dashboard work to canonical test IDs", () => {
  const contract = read(sprintContract);
  const plan = read(sprintPlan);

  assertContains(
    contract,
    [
      "Audit en security dashboard 2.0",
      "support_access_audit_log",
      "audit_log",
      "FG-SUPPORT-005",
      "FG-AUDIT-001",
      "FG-AUDIT-002",
      "FG-AUDIT-003",
      "FG-AUDIT-004",
      "FG-OPS-005",
      "Geen nieuwe auditkolommen of migratie",
    ],
    sprintContract,
  );

  assertContains(
    plan,
    [
      "Sprint 10 - Audit en security dashboard 2.0",
      "Status: `geleverd`",
      "filters per tenant, actor, eventtype en scope",
    ],
    sprintPlan,
  );
});
