import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  const normalized = content.toLowerCase();

  for (const phrase of phrases) {
    assert.ok(normalized.includes(phrase.toLowerCase()), `${label} should include ${phrase}`);
  }
}

const migration = read("lib/db/migrations/064_tenant_regions.sql");
const schema = read("lib/db/src/schema/tenant-regions.ts");
const schemaIndex = read("lib/db/src/schema/index.ts");
const personnelSchema = read("lib/db/src/schema/personnel.ts");
const assignmentsSchema = read("lib/db/src/schema/assignments.ts");
const sprintDoc = read("docs/fieldgrid-sprint-2-tenant-regions.md");

const regionTables = [
  "tenant_regions",
  "personnel_regions",
  "object_regions",
  "customer_regions",
  "assignment_required_regions",
];

test("sprint 2 migration creates the tenant region model", () => {
  for (const table of regionTables) {
    assertContains(migration, [`CREATE TABLE IF NOT EXISTS ${table}`, "tenant_id uuid NOT NULL"], table);
  }

  assertContains(
    migration,
    [
      "tenant_regions_tenant_normalized_name_idx",
      "personnel_regions_personnel_region_idx",
      "personnel_regions_primary_idx",
      "object_regions_object_region_idx",
      "customer_regions_customer_region_idx",
      "assignment_required_regions_assignment_region_idx",
      "source varchar(40) NOT NULL DEFAULT 'manual'",
    ],
    "tenant region indexes",
  );
});

test("sprint 2 migration backfills from legacy region fields without removing them", () => {
  assertContains(
    migration,
    [
      "personnel.region",
      "personnel.preferred_regions",
      "assignments.required_region",
      "legacy_backfill",
      "fieldgrid_normalize_region_name",
      "INSERT INTO tenant_regions",
      "INSERT INTO personnel_regions",
      "INSERT INTO assignment_required_regions",
    ],
    "tenant region backfill",
  );

  const destructivePatterns = [
    /DROP\s+TABLE\s+(personnel|assignments|tenant_regions|personnel_regions|object_regions|customer_regions|assignment_required_regions)\b/i,
    /DELETE\s+FROM\s+(personnel|assignments)\b/i,
    /ALTER\s+TABLE\s+personnel\s+DROP\s+COLUMN\s+(region|preferred_regions)\b/i,
    /ALTER\s+TABLE\s+assignments\s+DROP\s+COLUMN\s+required_region\b/i,
  ];

  for (const pattern of destructivePatterns) {
    assert.ok(!pattern.test(migration), `migration should not match destructive pattern ${pattern}`);
  }

  assertContains(personnelSchema, ["region", "preferredRegions"], "legacy personnel region fields");
  assertContains(assignmentsSchema, ["requiredRegion"], "legacy assignment region field");
});

test("sprint 2 migration enables RLS and tenant-scope trigger guards", () => {
  for (const table of regionTables) {
    assertContains(migration, [`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`], `${table} RLS`);
  }

  assertContains(
    migration,
    [
      "fieldgrid_ensure_tenant_region_scope",
      "parent_tenant_id",
      "region_tenant_id",
      "Tenant region parent tenant mismatch",
      "Tenant region tenant mismatch",
      "trg_personnel_regions_tenant_scope",
      "trg_object_regions_tenant_scope",
      "trg_customer_regions_tenant_scope",
      "trg_assignment_required_regions_tenant_scope",
      "REVOKE ALL ON FUNCTION fieldgrid_ensure_tenant_region_scope() FROM PUBLIC",
    ],
    "tenant region scope guards",
  );

  assert.ok(!/SECURITY\s+DEFINER/i.test(migration), "tenant region functions should not be SECURITY DEFINER");
});

test("sprint 2 schema exports tenant region tables", () => {
  assertContains(
    schema,
    [
      "tenantRegionsTable",
      "personnelRegionsTable",
      "objectRegionsTable",
      "customerRegionsTable",
      "assignmentRequiredRegionsTable",
      "RegionLinkSource",
      "source: varchar",
      "uniqueIndex(\"tenant_regions_tenant_normalized_name_idx\")",
    ],
    "tenant region schema",
  );

  assertContains(schemaIndex, ["export * from \"./tenant-regions\""], "schema index");
});

test("sprint 2 documentation captures compatibility and next steps", () => {
  assertContains(
    sprintDoc,
    [
      "Sprint 2",
      "tenant_regions",
      "personnel_regions",
      "object_regions",
      "assignment_required_regions",
      "legacy `personnel.region`",
      "preferred_regions",
      "required_region",
      "RLS",
      "Sprint 3",
      "Sprint 4",
    ],
    "sprint 2 documentation",
  );
});
