import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  FIELDGRID_RUNTIME_ACTIVE_STATUSES,
  FIELDGRID_RUNTIME_BLOCKED_STATUSES,
  FIELDGRID_SPRINT_1_HOST_TEST_IDS,
  FIELDGRID_SPRINT_1_LIFECYCLE_TEST_IDS,
  FIELDGRID_TEST_ACTORS,
  FIELDGRID_TEST_HOSTS,
  FIELDGRID_TEST_TENANTS,
} from "./fixtures/fieldgrid-tenants.mjs";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should mention ${phrase}`);
  }
}

const dashboardLayout = "artifacts/backoffice/src/app/(dashboard)/layout.tsx";
const backofficeTenantAuth = "artifacts/backoffice/src/lib/auth/tenant.ts";
const backofficeTenantResolver = "artifacts/backoffice/src/lib/auth/tenant-resolver.ts";
const sharedTenantContext = "lib/db/src/tenant-context.ts";
const tenantSchema = "lib/db/src/schema/tenants.ts";
const sprintContract = "docs/fieldgrid-sprint-1-tenant-context.md";
const testMatrix = "docs/fieldgrid-cross-tenant-testmatrix.md";

test("Sprint 1 fixtures define Tenant A/B/Veele, hosts and actors", () => {
  assert.equal(FIELDGRID_TEST_TENANTS.veele.slug, "veele");
  assert.equal(FIELDGRID_TEST_TENANTS.demoA.slug, "demo-a");
  assert.equal(FIELDGRID_TEST_TENANTS.demoB.slug, "demo-b");
  assert.equal(FIELDGRID_TEST_HOSTS.platformProduction, "platform.fieldgrid.nl");
  assert.equal(FIELDGRID_TEST_HOSTS.platformStaging, "staging.fieldgrid.nl");
  assert.equal(FIELDGRID_TEST_HOSTS.unknownFieldgrid, "unknown.fieldgrid.nl");
  assert.equal(FIELDGRID_TEST_ACTORS.multiAB, "MULTI-A-B");
  assert.ok(FIELDGRID_SPRINT_1_HOST_TEST_IDS.includes("FG-HOST-004"));
  assert.ok(FIELDGRID_SPRINT_1_LIFECYCLE_TEST_IDS.includes("FG-LIFE-004"));
});

test("dashboard layout has no DEFAULT_TENANT_ID or first-tenant fallback", () => {
  const layout = read(dashboardLayout);

  assert.doesNotMatch(layout, /DEFAULT_TENANT_ID/u);
  assert.doesNotMatch(layout, /tenantOptions\[0\]\?\.id/u);
  assert.match(layout, /const tenantId = currentTenantId;/u);
  assert.match(layout, /if \(!tenantId\) \{\s*return <NoActiveTenantAccess \/>;/u);
  assert.match(layout, /Geen actieve organisatietoegang/u);
});

test("backoffice tenant selection is host-first before switcher cookie", () => {
  const tenantAuth = read(backofficeTenantAuth);

  const hostResolutionIndex = tenantAuth.indexOf("const hostResolution = await getHostTenantResolution();");
  const cookieIndex = tenantAuth.indexOf("const cookieStore = await cookies();");
  assert.notEqual(hostResolutionIndex, -1, "host resolution should exist");
  assert.notEqual(cookieIndex, -1, "cookie lookup should exist");
  assert.ok(hostResolutionIndex < cookieIndex, "host resolution must run before tenant switcher cookie lookup");

  assertContains(
    tenantAuth,
    [
      "if (hostResolution.kind === \"tenant\")",
      "await userHasActiveTenant(user.id, hostResolution.tenantId)",
      "if (hostResolution.kind === \"blocked\")",
      "return null;",
      "selectedTenantId && tenantOptions.some",
    ],
    backofficeTenantAuth,
  );
});

test("default tenant fallback remains non-production opt-in only", () => {
  const tenantAuth = read(backofficeTenantAuth);

  assertContains(
    tenantAuth,
    [
      "process.env.NODE_ENV !== \"production\"",
      "process.env.ALLOW_DEFAULT_TENANT_FALLBACK === \"true\"",
      "DEFAULT_TENANT_ID fallback gebruikt",
    ],
    backofficeTenantAuth,
  );
});

test("host resolver only returns routable runtime-active tenant domains", () => {
  const resolver = read(backofficeTenantResolver);

  assertContains(
    resolver,
    [
      "!isFieldgridHostAllowedForRuntimeEnvironment(normalizedHost)",
      "if (isPlatformHost(normalizedHost)) return null;",
      "eq(tenantDomainsTable.domain, normalizedHost)",
      "inArray(tenantDomainsTable.verificationStatus, [\"verified\", \"active\"])",
      "ne(tenantDomainsTable.type, \"platform_reserved\")",
      "eq(tenantsTable.isActive, true)",
      "TENANT_RUNTIME_ACTIVE_STATUSES",
    ],
    backofficeTenantResolver,
  );
});

test("shared tenant context keeps platform and unknown subdomain semantics", () => {
  const tenantContext = read(sharedTenantContext);

  assertContains(
    tenantContext,
    [
      "FIELDGRID_ROOT_DOMAIN = \"fieldgrid.nl\"",
      "\"admin.fieldgrid.nl\"",
      "\"platform.fieldgrid.nl\"",
      "\"staging.fieldgrid.nl\"",
      "normalizeHost",
      "isPlatformHost",
      "isFieldgridSubdomain",
      "!host.endsWith(\"dgwebservices.nl\")",
      "!isPlatformHost(normalizedHost)",
      "TENANT_RUNTIME_ACTIVE_STATUS_SET",
    ],
    sharedTenantContext,
  );
});

test("tenant lifecycle statuses distinguish runtime-active and blocked states", () => {
  const schema = read(tenantSchema);
  const contract = read(sprintContract);

  for (const status of FIELDGRID_RUNTIME_ACTIVE_STATUSES) {
    assertContains(schema, [status], tenantSchema);
    assertContains(contract, [status], sprintContract);
  }

  for (const status of FIELDGRID_RUNTIME_BLOCKED_STATUSES) {
    assertContains(schema, [status], tenantSchema);
    assertContains(contract, [status], sprintContract);
  }

  assertContains(
    contract,
    [
      "suspended",
      "geen normale backoffice/API/portaal-mutaties",
      "archived",
      "geen normale backoffice/API/portaal-runtime",
      "Veele",
      "gewone tenant",
    ],
    sprintContract,
  );
});

test("Sprint 1 contract maps to canonical host and lifecycle test IDs", () => {
  const contract = read(sprintContract);
  const matrix = read(testMatrix);

  for (const testId of [...FIELDGRID_SPRINT_1_HOST_TEST_IDS, ...FIELDGRID_SPRINT_1_LIFECYCLE_TEST_IDS]) {
    assertContains(contract, [testId], sprintContract);
    assertContains(matrix, [testId], testMatrix);
  }

  assertContains(
    matrix,
    [
      FIELDGRID_TEST_HOSTS.platformProduction,
      FIELDGRID_TEST_HOSTS.platformStaging,
      FIELDGRID_TEST_HOSTS.demoA,
      FIELDGRID_TEST_HOSTS.demoB,
      FIELDGRID_TEST_HOSTS.veele,
      FIELDGRID_TEST_HOSTS.unknownFieldgrid,
      "tenant switcher override",
    ],
    testMatrix,
  );
});
