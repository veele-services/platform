import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should mention ${phrase}`);
  }
}

const schemaFilesWithoutDefaultTenant = [
  "lib/db/src/schema/customers.ts",
  "lib/db/src/schema/customer-users.ts",
  "lib/db/src/schema/customer-tickets.ts",
  "lib/db/src/schema/domain-events.ts",
  "lib/db/src/schema/notifications.ts",
  "lib/db/src/schema/objects.ts",
  "lib/db/src/schema/organization-settings.ts",
  "lib/db/src/schema/personnel.ts",
  "lib/db/src/schema/personnel-notifications.ts",
  "lib/db/src/schema/personnel-tickets.ts",
  "lib/db/src/schema/planning-intelligence.ts",
  "lib/db/src/schema/qualifications.ts",
  "lib/db/src/schema/task-codes.ts",
  "lib/db/src/schema/tenant-domains.ts",
  "lib/db/src/schema/tenant-rbac.ts",
  "lib/db/src/schema/tenant-sectors.ts",
];

const defaultHardenedTables = [
  "customers",
  "customer_users",
  "customer_message_threads",
  "domain_events",
  "push_subscriptions",
  "native_push_device_tokens",
  "customer_notifications",
  "notification_dispatches",
  "notification_delivery_queue",
  "notification_delivery_attempts",
  "objects",
  "organization_settings",
  "personnel",
  "personnel_notifications",
  "personnel_message_threads",
  "assignment_capacity_checks",
  "assignment_candidates",
  "assignment_interest_rounds",
  "assignment_interest_responses",
  "planning_sector_rules",
  "qualification_items",
  "personnel_qualifications",
  "role_qualifications",
  "task_code_qualifications",
  "task_codes",
  "tenant_domains",
  "tenant_roles",
  "tenant_user_roles",
  "tenant_sectors",
];

test("Sprint 8 removes DEFAULT_TENANT_ID schema defaults from tenantdata", () => {
  for (const path of schemaFilesWithoutDefaultTenant) {
    const content = read(path);
    assert.doesNotMatch(content, /DEFAULT_TENANT_ID/u, `${path} should not import DEFAULT_TENANT_ID`);
    assert.doesNotMatch(content, /sql\.raw\(DEFAULT_TENANT_ID\)/u, `${path} should not use raw default tenant SQL`);
  }
});

test("Sprint 8 migration drops tenant_id defaults for tenant-scoped tables", () => {
  const migration = read("lib/db/migrations/070_sprint8_tenant_id_default_hardening.sql");

  assertContains(
    migration,
    [
      "Sprint 8: tenant-id default hardening",
      "ALTER TABLE public.%I ALTER COLUMN tenant_id DROP DEFAULT",
      "to_regclass(format('public.%I', target_table))",
    ],
    "tenant-id default hardening migration",
  );

  for (const tableName of defaultHardenedTables) {
    assertContains(migration, [`'${tableName}'`], "tenant-id default hardening migration");
  }
}
);

test("Sprint 8 domain events require explicit tenant context", () => {
  const events = read("lib/db/src/events.ts");

  assert.doesNotMatch(events, /DEFAULT_TENANT_ID/u);
  assertContains(
    events,
    [
      "tenantId: string;",
      "mist tenantcontext",
      "tenantId,",
      "domainEventsTable",
      "auditLogTable",
    ],
    "domain event tenant contract",
  );
});

test("Sprint 8 runtime writes pass tenant context explicitly", () => {
  const quotes = read("artifacts/backoffice/src/app/actions/quotes.ts");
  const assignments = read("artifacts/backoffice/src/app/actions/assignments.ts");
  const settings = read("artifacts/backoffice/src/app/actions/settings.ts");
  const qualifications = read("artifacts/backoffice/src/app/actions/qualifications.ts");

  assert.match(quotes, /eventKey: "quote_sent_to_customer",\s+tenantId,/su);
  assert.match(assignments, /eventKey:\s+status === "reserve"[\s\S]+tenantId: assignment\.tenantId,/su);
  assertContains(
    settings,
    [
      "const tenantId = await requireCurrentTenantId();",
      "eq(personnelTable.tenantId, tenantId)",
      "eq(customersTable.tenantId, tenantId)",
      "notificationDispatchesTable",
      "notificationDeliveryQueueTable",
    ],
    "manual notifications tenant writes",
  );
  assertContains(
    qualifications,
    [
      "requireCurrentTenantId",
      "eq(qualificationItemsTable.tenantId, tenantId)",
      "eq(personnelQualificationsTable.tenantId, tenantId)",
      "eq(roleQualificationsTable.tenantId, tenantId)",
      "eq(taskCodeQualificationsTable.tenantId, tenantId)",
    ],
    "qualification tenant writes",
  );
});

test("Sprint 8 docs and report include default fallback hardening", () => {
  const sprintDoc = read("docs/fieldgrid-sprint-8-payments-audit.md");
  const phase2Doc = read("docs/fieldgrid-phase-2-tenant-hardening.md");
  const reportScript = read("lib/db/scripts/tenant-hardening-report.mjs");

  assertContains(
    `${sprintDoc}\n${phase2Doc}\n${reportScript}`,
    [
      "070_sprint8_tenant_id_default_hardening.sql",
      "Ontbrekende tenantcontext schrijft niet stil naar de default tenant",
      "default_hardened_tables",
      "default_removed",
    ],
    "Sprint 8 tenant-id default hardening docs",
  );
});
