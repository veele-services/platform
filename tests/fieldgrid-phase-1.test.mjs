import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPhase1DemoDataPlan,
  buildPhase1RuntimeFixtureManifest,
  canEnterTenant,
  canReadRecord,
  canSignStoragePath,
  canUseModule,
  canUseSector,
  phase1CleanupBatches,
  phase1Hosts,
  phase1MigrationSmokes,
  phase1Records,
  phase1RuntimeAssertions,
  phase1SecurityCases,
  phase1SeedBatches,
  phase1TenantDomains,
  phase1Tenants,
  requiredRecordTypes,
  resolveHostContext,
  validatePhase1Fixtures,
} from "./fixtures/fieldgrid-phase-1-fixtures.mjs";

test("sprint 1 runtime fixture manifest is complete and staging safe", () => {
  assert.deepEqual(validatePhase1Fixtures(), []);

  const manifest = buildPhase1RuntimeFixtureManifest();
  assert.equal(manifest.version, "sprint-1-runtime-fixtures-v1");
  assert.equal(manifest.scope, "fieldgrid-sprint-1-runtime-fixtures");
  assert.equal(manifest.destructive, false);
  assert.equal(manifest.mutatesExistingTenants, false);
  assert.equal(manifest.directDatabaseWrites, false);
  assert.deepEqual(manifest.allowedTenantSlugs, ["demo-a", "demo-b", "veele"]);
  assert.ok(manifest.seedBatches.length >= 6);
  assert.ok(manifest.cleanupBatches.length >= 4);
  assert.ok(manifest.runtimeAssertions.length >= 8);
});

test("sprint 1 demo-data plan remains plan-only and cleanup scoped", () => {
  const plan = buildPhase1DemoDataPlan();
  assert.equal(plan.destructive, false);
  assert.equal(plan.mutatesExistingTenants, false);
  assert.equal(plan.directDatabaseWrites, false);
  assert.deepEqual(plan.allowedTenantSlugs, ["demo-a", "demo-b", "veele"]);
  assert.ok(plan.cleanupSelectors.length >= 4);
  assert.ok(plan.cleanupSelectors.every((selector) => selector.includes("FIELDGRID_PHASE1_DEMO") || selector.includes("sprint-1")));
});

test("sprint 1 seed batches are idempotent and ordered", () => {
  const orders = phase1SeedBatches.map((batch) => batch.order);
  assert.deepEqual([...orders].sort((a, b) => a - b), orders);

  for (const batch of phase1SeedBatches) {
    assert.equal(batch.mode, "upsert", `${batch.id} should be idempotent`);
    assert.ok(batch.uniqueBy.length > 0, `${batch.id} should define uniqueBy`);
    assert.ok(batch.rows.length > 0, `${batch.id} should have rows`);
  }

  const batchIds = new Set(phase1SeedBatches.map((batch) => batch.id));
  for (const requiredBatch of [
    "seed-tenants",
    "seed-tenant-domains",
    "seed-platform-actors",
    "seed-tenant-memberships",
    "seed-tenant-records",
    "seed-storage-manifest",
    "seed-support-grants",
  ]) {
    assert.ok(batchIds.has(requiredBatch), `missing ${requiredBatch}`);
  }
});

test("sprint 1 cleanup batches are marker scoped and non destructive", () => {
  const orders = phase1CleanupBatches.map((batch) => batch.order);
  assert.deepEqual([...orders].sort((a, b) => a - b), orders);

  for (const batch of phase1CleanupBatches) {
    assert.equal(batch.destructive, false, `${batch.id} should be non destructive`);
    assert.equal(batch.requiresMarker, true, `${batch.id} should require marker-scoped cleanup`);
    assert.ok(batch.tables.length > 0, `${batch.id} should name tables`);
  }
});

test("phase 1 fixtures treat Veele as a normal tenant", () => {
  const veele = phase1Tenants.find((tenant) => tenant.slug === "veele");
  assert.ok(veele, "veele tenant fixture should exist");
  assert.equal(veele.platformException, false);
  assert.equal(veele.primaryHost, "veele.fieldgrid.nl");

  for (const type of requiredRecordTypes) {
    assert.ok(
      phase1Records.some((record) => record.tenantSlug === "veele" && record.type === type),
      `veele should include ${type}`,
    );
  }
});

test("tenant domains are explicit and tenant-owned", () => {
  assert.ok(phase1TenantDomains.length >= 4);
  for (const domain of phase1TenantDomains) {
    assert.ok(domain.tenantId, `${domain.host} should have tenantId`);
    assert.ok(domain.tenantSlug, `${domain.host} should have tenantSlug`);
    assert.ok(domain.fixtureKey.startsWith(`${domain.tenantSlug}:domain:`));
  }
});

test("host-first resolver contract ignores switcher override", () => {
  for (const hostCase of phase1Hosts) {
    const context = resolveHostContext(hostCase);
    assert.equal(context.kind, hostCase.expectedKind, `${hostCase.host} should resolve as ${hostCase.expectedKind}`);
    if (hostCase.expectedTenantSlug) assert.equal(context.tenantSlug, hostCase.expectedTenantSlug);
    if (hostCase.switcherMustBeIgnored) assert.equal(context.switcherIgnored, true);
  }

  const override = resolveHostContext({ host: "demo-a.fieldgrid.nl", switcherTenantSlug: "demo-b" });
  assert.equal(override.kind, "tenant");
  assert.equal(override.tenantSlug, "demo-a");
  assert.equal(override.switcherIgnored, true);
});

test("membership and support access contract has happy and denial paths", () => {
  assert.equal(canEnterTenant("A-ADMIN", "demo-a").allowed, true);
  assert.equal(canEnterTenant("A-ADMIN", "demo-b").allowed, false);
  assert.equal(canEnterTenant("SUPPORT-NO-GRANT", "demo-a", { supportMode: true }).allowed, false);
  assert.equal(canEnterTenant("SUPPORT-A-GRANT", "demo-a", { supportMode: true }).allowed, true);
  assert.equal(canEnterTenant("SUPPORT-A-GRANT", "demo-b", { supportMode: true }).allowed, false);
  assert.equal(canEnterTenant("SUPPORT-EXPIRED", "demo-a", { supportMode: true }).allowed, false);
});

test("direct id, module, sector and storage denial contracts are executable", () => {
  assert.equal(canReadRecord("A-ADMIN", "demo-a.fieldgrid.nl", "demo-a:customer:001"), true);
  assert.equal(canReadRecord("B-ADMIN", "demo-b.fieldgrid.nl", "demo-a:customer:001"), false);

  assert.equal(canUseModule("A-ADMIN", "demo-a", "documents"), true);
  assert.equal(canUseModule("B-ADMIN", "demo-b", "documents"), false);

  assert.equal(canUseSector("A-ADMIN", "demo-a", "cleaning"), true);
  assert.equal(canUseSector("A-ADMIN", "demo-a", "facility"), false);

  assert.equal(
    canSignStoragePath(
      "A-ADMIN",
      "demo-a.fieldgrid.nl",
      "tenant/11111111-1111-4111-8111-111111111111/document/demo-a-document-001.pdf",
    ),
    true,
  );
  assert.equal(
    canSignStoragePath(
      "B-ADMIN",
      "demo-b.fieldgrid.nl",
      "tenant/11111111-1111-4111-8111-111111111111/document/demo-a-document-001.pdf",
    ),
    false,
  );
});

test("runtime assertions cover the sprint 1 required proof boundaries", () => {
  const assertionTypes = new Set(phase1RuntimeAssertions.map((assertion) => assertion.type));
  for (const type of ["host", "tenant", "rbac", "support", "module", "sector", "direct-id", "storage"]) {
    assert.ok(assertionTypes.has(type), `missing ${type} assertion`);
  }

  assert.ok(phase1RuntimeAssertions.some((assertion) => assertion.happy), "should include happy paths");
  assert.ok(phase1RuntimeAssertions.some((assertion) => !assertion.happy), "should include denial paths");
});

test("security cases cover the phase 1 required boundaries", () => {
  const boundaries = new Set(phase1SecurityCases.map((securityCase) => securityCase.boundary));
  for (const boundary of ["host", "rbac", "support", "module", "sector", "direct-id", "storage"]) {
    assert.ok(boundaries.has(boundary), `missing ${boundary} case`);
  }

  const testIds = new Set(phase1SecurityCases.map((securityCase) => securityCase.testId));
  for (const testId of ["FG-HOST-004", "FG-RBAC-002", "FG-SUPPORT-002", "FG-MODULE-005", "FG-SECTOR-002", "FG-DATA-001", "FG-STORAGE-002"]) {
    assert.ok(testIds.has(testId), `missing ${testId}`);
  }
});

test("migration smoke contract defines empty db, staging copy and compatibility targets", () => {
  assert.deepEqual(
    phase1MigrationSmokes.map((smoke) => smoke.id),
    ["FG-MIG-001", "FG-MIG-002", "FG-MIG-003"],
  );
  for (const smoke of phase1MigrationSmokes) {
    assert.equal(smoke.destructive, false);
    assert.equal(smoke.requiresDatabaseUrl, true);
    assert.match(smoke.command, /db:migrate/u);
  }
});
