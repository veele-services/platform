import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FIELD_DEMO_DOMAIN_REPAIR_CONFIRMATION,
  FIELD_DEMO_DOMAIN_REPAIR_PROJECT_REF,
  FIELD_DEMO_DOMAIN_REPAIR_SUPABASE_URL,
  FIELD_DEMO_DOMAIN_REPAIR_VERSION,
  FIELD_DEMO_HOST,
  FIELD_DEMO_OWNER_EMAIL,
  FIELD_DEMO_SLUG,
  LEGACY_FIELD_DEMO_HOST,
  classifyFieldDemoDomain,
  classifyFieldDemoDomainShape,
  formatSafeFieldDemoDomainError,
  loadFieldDemoDomainSnapshot,
  repairFieldDemoDomain,
  safeFieldDemoDomainErrorCode,
  safeFieldDemoDomainFailureReason,
  validateFieldDemoDomainConfig,
  type FieldDemoDomainSnapshot,
} from "../../scripts/fieldgrid-staging-field-demo-domain-repair.mts";
import {
  FIELD_DEMO_HOST as PROOF_FIELD_DEMO_HOST,
  FIELD_DEMO_OWNER_EMAIL as PROOF_FIELD_DEMO_OWNER_EMAIL,
  FIELD_DEMO_SLUG as PROOF_FIELD_DEMO_SLUG,
} from "../../scripts/fieldgrid-website-staging-proof-state.mts";

const sha = "a".repeat(40);
const tenantId = "10000000-0000-4000-8000-000000000081";

const exactSnapshot: FieldDemoDomainSnapshot = {
  tenant_id: tenantId,
  slug_tenant_count: 1,
  exact_domain_global_count: 1,
  legacy_domain_global_count: 0,
  target_domain_count: 1,
  target_exact_domain_count: 1,
  target_legacy_domain_count: 0,
  target_primary_domain_count: 1,
  target_exact_primary_count: 1,
  target_exact_ready_count: 1,
  target_exact_normalizable_count: 1,
  target_legacy_ready_count: 0,
  legacy_domain_check_count: 0,
  target_tenant_core_valid_count: 1,
  organization_settings_count: 1,
  active_subscription_count: 1,
  active_enterprise_subscription_count: 1,
  expected_owner_count: 1,
  expected_owner_management_role_count: 1,
  website_site_count: 0,
  active_website_site_count: 0,
  website_binding_count: 0,
  active_website_binding_count: 0,
  exact_domain_binding_count: 0,
  legacy_domain_binding_count: 0,
};

const legacySnapshot: FieldDemoDomainSnapshot = {
  ...exactSnapshot,
  exact_domain_global_count: 0,
  legacy_domain_global_count: 1,
  target_exact_domain_count: 0,
  target_legacy_domain_count: 1,
  target_exact_primary_count: 0,
  target_exact_ready_count: 0,
  target_exact_normalizable_count: 0,
  target_legacy_ready_count: 1,
};

const validEnvironment = {
  APP_ENV: "staging",
  TARGET_ENVIRONMENT: "staging",
  GITHUB_ACTIONS: "true",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REF: "refs/heads/main",
  GITHUB_REF_NAME: "main",
  GITHUB_REPOSITORY: "veele-services/platform",
  GITHUB_RUN_ATTEMPT: "1",
  GITHUB_RUN_ID: "123456789",
  GITHUB_SHA: sha,
  EXPECTED_SUPABASE_PROJECT_REF: FIELD_DEMO_DOMAIN_REPAIR_PROJECT_REF,
  NEXT_PUBLIC_SUPABASE_URL: `${FIELD_DEMO_DOMAIN_REPAIR_SUPABASE_URL}/`,
  DATABASE_URL: "postgresql://runtime:secret@example.invalid/db",
  FIELDGRID_MIGRATION_DATABASE_URL:
    "postgresql://migration:secret@example.invalid/db",
  FIELDGRID_DATABASE_CONNECTION_PURPOSE: "migration",
  FIELDGRID_FIELD_DEMO_DOMAIN_REPAIR_CONFIRMATION:
    FIELD_DEMO_DOMAIN_REPAIR_CONFIRMATION,
};

async function captureError(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  assert.fail("Expected domain repair to fail.");
}

test("domain operation configuration is exact staging and exact main only", () => {
  for (const mode of ["diagnose", "repair"] as const) {
    assert.deepEqual(
      validateFieldDemoDomainConfig(
        { mode, expectedSha: sha },
        validEnvironment,
      ),
      [],
    );
  }

  for (const [key, value] of [
    ["APP_ENV", "production"],
    ["TARGET_ENVIRONMENT", "production"],
    ["GITHUB_ACTIONS", "false"],
    ["GITHUB_EVENT_NAME", "push"],
    ["GITHUB_REF", "refs/heads/staging"],
    ["GITHUB_REF_NAME", "staging"],
    ["GITHUB_REPOSITORY", "other/repository"],
    ["GITHUB_RUN_ATTEMPT", "0"],
    ["GITHUB_RUN_ID", "stale/path"],
    ["GITHUB_SHA", "b".repeat(40)],
    ["EXPECTED_SUPABASE_PROJECT_REF", "productionref"],
    ["NEXT_PUBLIC_SUPABASE_URL", "https://example.com/"],
    ["DATABASE_URL", ""],
    ["FIELDGRID_MIGRATION_DATABASE_URL", ""],
    ["FIELDGRID_DATABASE_CONNECTION_PURPOSE", "runtime"],
    ["FIELDGRID_FIELD_DEMO_DOMAIN_REPAIR_CONFIRMATION", "wrong"],
  ] as const) {
    const errors = validateFieldDemoDomainConfig(
      { mode: "repair", expectedSha: sha },
      { ...validEnvironment, [key]: value },
    );
    assert.ok(errors.length > 0, `${key} must fail closed`);
  }
});

test("classifier accepts only exact state or the dependency-free legacy shape", () => {
  assert.deepEqual(classifyFieldDemoDomain(exactSnapshot), {
    state: "already-valid",
    failureReason: null,
  });
  assert.equal(classifyFieldDemoDomainShape(exactSnapshot), "ready");
  assert.deepEqual(
    classifyFieldDemoDomain({
      ...exactSnapshot,
      target_exact_ready_count: 0,
    }),
    { state: "exact-domain-needs-normalization", failureReason: null },
  );
  assert.deepEqual(classifyFieldDemoDomain(legacySnapshot), {
    state: "legacy-domain-needs-migration",
    failureReason: null,
  });
  assert.equal(classifyFieldDemoDomainShape(legacySnapshot), "legacy");

  assert.deepEqual(
    classifyFieldDemoDomain({ ...legacySnapshot, website_site_count: 1 }),
    { state: "unsafe", failureReason: "website-state-present" },
  );
  assert.deepEqual(
    classifyFieldDemoDomain({
      ...legacySnapshot,
      legacy_domain_check_count: 1,
    }),
    { state: "unsafe", failureReason: "domain-history-present" },
  );
  assert.deepEqual(
    classifyFieldDemoDomain({
      ...legacySnapshot,
      exact_domain_global_count: 1,
    }),
    { state: "unsafe", failureReason: "expected-domain-collision" },
  );
  assert.deepEqual(
    classifyFieldDemoDomain({
      ...exactSnapshot,
      legacy_domain_global_count: 1,
      target_domain_count: 2,
      target_legacy_domain_count: 1,
    }),
    { state: "unsafe", failureReason: "domain-shape-unsupported" },
  );
});

test("every fixture prerequisite fails before a legacy migration", () => {
  const cases: Array<[Partial<FieldDemoDomainSnapshot>, string]> = [
    [{ slug_tenant_count: 0, tenant_id: null }, "tenant-identity-invalid"],
    [{ target_tenant_core_valid_count: 0 }, "tenant-runtime-invalid"],
    [{ organization_settings_count: 0 }, "organization-settings-invalid"],
    [{ active_subscription_count: 0 }, "subscription-invalid"],
    [{ active_enterprise_subscription_count: 0 }, "subscription-invalid"],
    [{ expected_owner_count: 0 }, "owner-invalid"],
    [{ expected_owner_management_role_count: 0 }, "owner-invalid"],
    [{ website_binding_count: 1 }, "website-state-present"],
    [{ exact_domain_binding_count: 1 }, "website-state-present"],
    [{ legacy_domain_binding_count: 1 }, "website-state-present"],
    [{ legacy_domain_check_count: 1 }, "domain-history-present"],
    [{ target_domain_count: 2 }, "domain-shape-unsupported"],
  ];
  for (const [change, reason] of cases) {
    assert.equal(
      classifyFieldDemoDomain({ ...legacySnapshot, ...change }).failureReason,
      reason,
    );
  }
});

test("an exact canonical domain is a no-op", async () => {
  let migrations = 0;
  const result = await repairFieldDemoDomain({
    readSnapshot: async () => exactSnapshot,
    migrateLegacyDomain: async () => {
      migrations += 1;
    },
  });
  assert.equal(result, "already-valid");
  assert.equal(migrations, 0);
});

test("the exact legacy domain is migrated once and requires an exact postcheck", async () => {
  let reads = 0;
  let migrations = 0;
  const result = await repairFieldDemoDomain({
    readSnapshot: async () => {
      reads += 1;
      return reads === 1 ? legacySnapshot : exactSnapshot;
    },
    migrateLegacyDomain: async (receivedTenantId) => {
      assert.equal(receivedTenantId, tenantId);
      migrations += 1;
    },
  });
  assert.equal(result, "legacy-migrated-and-verified");
  assert.equal(migrations, 1);
  assert.equal(reads, 2);
});

test("missing, ambiguous and dependent shapes never mutate", async () => {
  const snapshots = [
    {
      ...legacySnapshot,
      target_domain_count: 0,
      legacy_domain_global_count: 0,
      target_legacy_domain_count: 0,
      target_primary_domain_count: 0,
      target_legacy_ready_count: 0,
    },
    { ...legacySnapshot, target_domain_count: 2 },
    { ...legacySnapshot, website_site_count: 1 },
    { ...legacySnapshot, legacy_domain_check_count: 1 },
  ];
  for (const snapshot of snapshots) {
    let migrations = 0;
    const error = await captureError(() =>
      repairFieldDemoDomain({
        readSnapshot: async () => snapshot,
        migrateLegacyDomain: async () => {
          migrations += 1;
        },
      }),
    );
    assert.equal(migrations, 0);
    assert.equal(
      safeFieldDemoDomainErrorCode(error),
      "field_demo_domain_precondition_invalid",
    );
  }
});

test("mutation exceptions and invalid postconditions stay bounded", async () => {
  const mutationError = await captureError(() =>
    repairFieldDemoDomain({
      readSnapshot: async () => legacySnapshot,
      migrateLegacyDomain: async () => {
        throw new Error("database URL and tenant-shaped private detail");
      },
    }),
  );
  assert.equal(
    safeFieldDemoDomainErrorCode(mutationError),
    "field_demo_domain_mutation_failed",
  );
  assert.equal(safeFieldDemoDomainFailureReason(mutationError), null);
  assert.doesNotMatch(
    formatSafeFieldDemoDomainError(mutationError),
    /private/u,
  );

  let reads = 0;
  const postcheckError = await captureError(() =>
    repairFieldDemoDomain({
      readSnapshot: async () => {
        reads += 1;
        return legacySnapshot;
      },
      migrateLegacyDomain: async () => {},
    }),
  );
  assert.equal(reads, 2);
  assert.equal(
    safeFieldDemoDomainErrorCode(postcheckError),
    "field_demo_domain_postcondition_invalid",
  );
});

test("snapshot query is parameterized and returns one fixed aggregate row", async () => {
  let capturedSql = "";
  let capturedValues: unknown[] = [];
  const snapshot = await loadFieldDemoDomainSnapshot({
    async query<T extends Record<string, unknown>>(
      text: string,
      values?: unknown[],
    ) {
      capturedSql = text;
      capturedValues = values ?? [];
      return { rows: [exactSnapshot as T], rowCount: 1 };
    },
  });
  assert.equal(snapshot, exactSnapshot);
  assert.deepEqual(capturedValues, [
    FIELD_DEMO_SLUG,
    FIELD_DEMO_HOST,
    FIELD_DEMO_OWNER_EMAIL,
    LEGACY_FIELD_DEMO_HOST,
  ]);
  assert.doesNotMatch(capturedSql, /field-demo(?:\.staging)?\.fieldgrid\.nl/u);
  assert.doesNotMatch(capturedSql, /services@fieldgrid\.nl/u);
  assert.match(capturedSql, /AS legacy_domain_check_count/u);
  assert.match(capturedSql, /AS expected_owner_management_role_count/u);
  assert.equal(
    capturedSql.match(/AND domain\.verified_at IS NOT NULL/gu)?.length,
    2,
  );
  for (const placeholder of ["\\$2", "\\$4"]) {
    assert.match(
      capturedSql,
      new RegExp(
        `FROM public\\.website_domain_bindings AS binding\\s+WHERE binding\\.hostname = ${placeholder}`,
        "u",
      ),
    );
  }
});

test("static identities remain exact and staging-scoped", () => {
  assert.equal(
    FIELD_DEMO_DOMAIN_REPAIR_CONFIRMATION,
    FIELD_DEMO_DOMAIN_REPAIR_VERSION,
  );
  assert.equal(LEGACY_FIELD_DEMO_HOST, "field-demo.fieldgrid.nl");
  assert.equal(FIELD_DEMO_HOST, "field-demo.staging.fieldgrid.nl");
  assert.equal(FIELD_DEMO_HOST, PROOF_FIELD_DEMO_HOST);
  assert.equal(FIELD_DEMO_OWNER_EMAIL, PROOF_FIELD_DEMO_OWNER_EMAIL);
  assert.equal(FIELD_DEMO_SLUG, PROOF_FIELD_DEMO_SLUG);
});
