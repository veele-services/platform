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

const documentsSchema = "lib/db/src/schema/documents.ts";
const storagePaths = "lib/db/src/storage-paths.ts";
const dbIndex = "lib/db/src/index.ts";
const documentsActions = "artifacts/backoffice/src/app/actions/documents.ts";
const migration = "lib/db/migrations/061_documents_tenant_storage.sql";
const sprintContract = "docs/fieldgrid-sprint-6-documents-storage.md";
const testMatrix = "docs/fieldgrid-cross-tenant-testmatrix.md";

const SPRINT_6_TEST_IDS = [
  "FG-DATA-004",
  "FG-STORAGE-001",
  "FG-STORAGE-002",
  "FG-STORAGE-006",
  "FG-STORAGE-007",
  "FG-AUDIT-001",
  "FG-MIG-001",
  "FG-MIG-002",
];

test("Sprint 6 documents schema exposes tenant scope", () => {
  const schema = read(documentsSchema);
  const index = read(dbIndex);

  assertContains(
    schema,
    [
      "tenantId:    uuid(\"tenant_id\")",
      "references(() => tenantsTable.id",
      "documents_tenant_idx",
      "documents_tenant_entity_idx",
      "tenantId:  true",
    ],
    documentsSchema,
  );

  assertContains(index, ["./storage-paths"], dbIndex);
});

test("Sprint 6 migration backfills documents tenant ids safely", () => {
  const sql = read(migration);

  assertContains(
    sql,
    [
      "ADD COLUMN IF NOT EXISTS tenant_id uuid",
      "documents_tenant_id_fkey",
      "FROM assignments assignment",
      "FROM customers customer",
      "FROM personnel person",
      "FROM objects object_record",
      "FROM tenant_users",
      "storage_path ~* '^tenant/",
      "documents_tenant_idx",
      "documents_tenant_entity_idx",
      "documents_storage_canonical_tenant_path_check",
      "NOT VALID",
      "ALTER COLUMN tenant_id SET NOT NULL",
      "RAISE NOTICE",
    ],
    migration,
  );
});

test("Sprint 6 shared storage validator enforces tenant-bound paths", () => {
  const helper = read(storagePaths);

  assertContains(
    helper,
    [
      "FIELDGRID_STORAGE_TENANT_ROOT = \"tenant\"",
      "normalizeStoragePath",
      "buildTenantStoragePath",
      "getTenantBoundStoragePath",
      "isCanonicalTenantStoragePath",
      "allowLegacyTenantRoot",
      "URL_SCHEME_PATTERN",
      "normalized.includes(\"\\\\\")",
      "segment === \"..\"",
      "`${FIELDGRID_STORAGE_TENANT_ROOT}/${tenantId}/`",
    ],
    storagePaths,
  );
});

test("Sprint 6 document actions use tenant id and shared storage guards", () => {
  const actions = read(documentsActions);

  assertContains(
    actions,
    [
      "buildTenantStoragePath",
      "getTenantBoundStoragePath",
      "tenant/{tenant_id}",
      "eq(documentsTable.tenantId, tenantId)",
      "tenantId,",
      "allowLegacyTenantRoot: true",
      "createSignedUrl(storagePath, 3600)",
      "remove([storagePath])",
      "storagePath,",
    ],
    documentsActions,
  );
});

test("Sprint 6 contract maps documents/storage work to canonical test IDs", () => {
  const contract = read(sprintContract);
  const matrix = read(testMatrix);

  assertContains(
    contract,
    [
      "Documenten en storage wave 1",
      "documents.tenant_id",
      "tenant/{tenant_id}/",
      "Storage backfillplan voor staging",
      "Geen fysieke Supabase Storage object move in SQL",
      "allowLegacyTenantRoot",
    ],
    sprintContract,
  );

  for (const testId of SPRINT_6_TEST_IDS) {
    assertContains(contract, [testId], sprintContract);
    assertContains(matrix, [testId], testMatrix);
  }
});
