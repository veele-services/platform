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

const sectorSchema = "lib/db/src/schema/tenant-sectors.ts";
const sectorMigration = "lib/db/migrations/061_tenant_sector_policy.sql";
const sectorHelpers = "artifacts/backoffice/src/lib/tenant-sectors.ts";
const tenantSectorActions = "artifacts/backoffice/src/app/actions/tenant-sectors.ts";
const taskCodeActions = "artifacts/backoffice/src/app/actions/task-codes.ts";
const sprintContract = "docs/fieldgrid-sprint-3-sector-policy.md";
const testMatrix = "docs/fieldgrid-cross-tenant-testmatrix.md";

const SECTOR_TEST_IDS = [
  "FG-SECTOR-001",
  "FG-SECTOR-002",
  "FG-SECTOR-003",
  "FG-SECTOR-004",
  "FG-SECTOR-005",
  "FG-SECTOR-006",
];

test("tenant sector settings schema defines policy mode, default sector and enforcement flag", () => {
  const schema = read(sectorSchema);

  assertContains(
    schema,
    [
      "TENANT_SECTOR_POLICY_MODES",
      "tenantSectorSettingsTable",
      "mode: varchar(\"mode\"",
      "maxSectors: integer(\"max_sectors\")",
      "defaultSectorId: uuid(\"default_sector_id\")",
      "enforceSectorScope: boolean(\"enforce_sector_scope\")",
      "TenantSectorPolicyMode",
      "TenantSectorSettings",
    ],
    sectorSchema,
  );
});

test("sector policy migration is staging-safe and installs policy-aware triggers", () => {
  const migration = read(sectorMigration);

  assertContains(
    migration,
    [
      "CREATE TABLE IF NOT EXISTS tenant_sector_settings",
      "ON CONFLICT (tenant_id) DO NOTHING",
      "fieldgrid_assert_tenant_sector_limit",
      "tenant_sectors_policy_limit_trigger",
      "fieldgrid_apply_tenant_sector_policy",
      "DROP TRIGGER IF EXISTS customers_tenant_sector_enabled_trigger",
      "customers_tenant_sector_policy_trigger",
      "objects_tenant_sector_policy_trigger",
      "personnel_tenant_sector_policy_trigger",
      "task_codes_tenant_sector_policy_trigger",
      "mode IN ('multi', 'single')",
      "Sector % is not enabled for tenant %",
    ],
    sectorMigration,
  );
});

test("shared tenant sector helpers expose default-sector and enforcement-aware write policy", () => {
  const helpers = read(sectorHelpers);

  assertContains(
    helpers,
    [
      "getTenantSectorPolicy",
      "listEnabledTenantSectorOptions",
      "resolveTenantSectorForWrite",
      "policy.mode !== \"single\"",
      "policy.defaultSectorId",
      "assertTenantSectorAllowed",
      "assertTenantSectorsAllowed",
      "policy.enforceSectorScope",
      "Forbidden: sector",
    ],
    sectorHelpers,
  );
});

test("tenant sector settings actions block unsafe disable and validate policy updates", () => {
  const actions = read(tenantSectorActions);

  assertContains(
    actions,
    [
      "getTenantSectorSettingsForSettings",
      "updateTenantSectorSettings",
      "tenantSectorSettingsTable",
      "assertTenantSectorCanBeDisabled",
      "countTenantSectorUsage",
      "customersTable",
      "objectsTable",
      "personnelTable",
      "taskCodesTable",
      "Single-sector modus kan pas aan",
      "Defaultsector moet actief zijn voor deze tenant.",
      "Verplaats deze records voordat je de sector uitschakelt.",
      "Deze sector is ingesteld als defaultsector.",
    ],
    tenantSectorActions,
  );
});

test("task code actions are tenant-scoped and use tenant sector policy", () => {
  const actions = read(taskCodeActions);

  assertContains(
    actions,
    [
      "requireCurrentTenantId",
      "listEnabledTenantSectorOptions",
      "resolveTenantSectorForWrite",
      "const tenantId = await requireCurrentTenantId();",
      "eq(taskCodesTable.tenantId, tenantId)",
      "values({ ...parsed.data, tenantId })",
      "task_codes:create",
      "task_codes:update",
      "Sector is niet beschikbaar voor deze tenant.",
    ],
    taskCodeActions,
  );
});

test("Sprint 3 contract maps to canonical sector test IDs", () => {
  const contract = read(sprintContract);
  const matrix = read(testMatrix);

  assertContains(
    contract,
    [
      "sectorbeleid productklaar maken",
      "tenant_sector_settings",
      "single-sector defaultgedrag",
      "sector uitschakelen blokkeren",
      "Geen assignment sectorkolom",
    ],
    sprintContract,
  );

  for (const testId of SECTOR_TEST_IDS) {
    assertContains(contract, [testId], sprintContract);
    assertContains(matrix, [testId], testMatrix);
  }
});
