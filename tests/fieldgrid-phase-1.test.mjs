import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPhase1DemoDataPlan,
  canEnterTenant,
  canReadRecord,
  canSignStoragePath,
  canUseModule,
  canUseSector,
  phase1Hosts,
  phase1MigrationSmokes,
  phase1Records,
  phase1SecurityCases,
  phase1Tenants,
  requiredRecordTypes,
  resolveHostContext,
  validatePhase1Fixtures,
} from "./fixtures/fieldgrid-phase-1-fixtures.mjs";

test("phase 1 fixtures are complete and staging safe", () => {
  assert.deepEqual(validatePhase1Fixtures(), []);

  const plan = buildPhase1DemoDataPlan();
  assert.equal(plan.destructive, false);
  assert.equal(plan.mutatesExistingTenants, false);
  assert.deepEqual(plan.allowedTenantSlugs, ["demo-a", "demo-b", "veele"]);
  assert.ok(plan.cleanupSelectors.length >= 3);
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
