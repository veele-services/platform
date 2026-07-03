import {
  PHASE1_NOW,
  canEnterTenant,
  canReadRecord,
  canSignStoragePath,
  canUseModule,
  canUseSector,
  findActor,
  findRecord,
  findTenant,
  phase1Tenants,
  resolveHostContext,
} from "./fieldgrid-phase-1-fixtures.mjs";

export const SPRINT5_RUNTIME_PROOF_VERSION = "sprint-5-runtime-security-proof-v1";
export const SPRINT5_REQUIRED_BOUNDARIES = [
  "host",
  "membership",
  "rbac",
  "support",
  "module",
  "sector",
  "region",
  "direct-id",
  "storage",
];

const tenantRolePermissions = {
  owner: ["customers.read", "customers.write", "assignments.read", "assignments.write", "personnel.read", "settings.manage"],
  admin: ["customers.read", "customers.write", "assignments.read", "assignments.write", "personnel.read"],
  planner: ["customers.read", "assignments.read", "assignments.write", "personnel.read"],
  employee: ["assignments.read"],
  customer: ["portal.read"],
  personnel: ["personnel_app.read", "assignments.read"],
};

export const sprint5RegionFixtures = {
  personnel: [
    { actorId: "A-PERSONNEL", tenantSlug: "demo-a", regions: ["north", "west"] },
    { actorId: "A-EMPLOYEE", tenantSlug: "demo-a", regions: ["east"] },
    { actorId: "B-PERSONNEL", tenantSlug: "demo-b", regions: ["north"] },
  ],
  assignments: [
    { id: "demo-a:assignment:unrestricted", tenantSlug: "demo-a", requiredRegions: [] },
    { id: "demo-a:assignment:north", tenantSlug: "demo-a", requiredRegions: ["north"] },
    { id: "demo-a:assignment:south", tenantSlug: "demo-a", requiredRegions: ["south"] },
    { id: "demo-b:assignment:north", tenantSlug: "demo-b", requiredRegions: ["north"] },
  ],
};

function hostTenant(host, switcherTenantSlug = null) {
  return resolveHostContext({ host, switcherTenantSlug });
}

function tenantMembership(actorId, host) {
  const context = hostTenant(host);
  if (context.kind !== "tenant" || !context.tenantSlug) return { allowed: false, role: null, tenantSlug: null };
  const access = canEnterTenant(actorId, context.tenantSlug);
  return { ...access, tenantSlug: context.tenantSlug };
}

function hasTenantPermission(actorId, host, permission) {
  const membership = tenantMembership(actorId, host);
  if (!membership.allowed || !membership.role) return false;
  return Boolean(tenantRolePermissions[membership.role]?.includes(permission));
}

function hasPlatformAccess(actorId) {
  const actor = findActor(actorId);
  return Boolean(actor?.kind === "platform" && actor.status === "active");
}

function supportCanEnter(actorId, tenantSlug, now = PHASE1_NOW) {
  return canEnterTenant(actorId, tenantSlug, { supportMode: true, now }).allowed;
}

function findPersonnelRegion(actorId) {
  return sprint5RegionFixtures.personnel.find((entry) => entry.actorId === actorId) ?? null;
}

function findAssignmentRegion(assignmentId) {
  return sprint5RegionFixtures.assignments.find((entry) => entry.id === assignmentId) ?? null;
}

function hasRegionOverlap(requiredRegions, personnelRegions) {
  if (requiredRegions.length === 0) return true;
  return requiredRegions.some((region) => personnelRegions.includes(region));
}

function canPlanByRegion({ plannerActorId, host, assignmentId, personnelActorId }) {
  const context = hostTenant(host);
  const assignment = findAssignmentRegion(assignmentId);
  const personnel = findPersonnelRegion(personnelActorId);
  if (context.kind !== "tenant" || !context.tenantSlug || !assignment || !personnel) return false;
  if (assignment.tenantSlug !== context.tenantSlug || personnel.tenantSlug !== context.tenantSlug) return false;
  if (!hasTenantPermission(plannerActorId, host, "assignments.write")) return false;
  return hasRegionOverlap(assignment.requiredRegions, personnel.regions);
}

function isVeeleOrdinaryTenant() {
  const tenant = findTenant("veele");
  const context = hostTenant("veele.fieldgrid.nl");
  return Boolean(tenant && !tenant.platformException && context.kind === "tenant" && context.tenantSlug === "veele");
}

export const sprint5RuntimeProofCases = [
  {
    testId: "FG-HOST-002",
    boundary: "host",
    mode: "happy",
    actorId: "A-ADMIN",
    host: "demo-a.fieldgrid.nl",
    entrypoints: ["api", "backoffice"],
    action: "resolve tenant from host",
    expected: "allow-demo-a",
    evaluate: () => hostTenant("demo-a.fieldgrid.nl").tenantSlug === "demo-a",
  },
  {
    testId: "FG-HOST-003",
    boundary: "host",
    mode: "denial",
    actorId: "A-ADMIN",
    host: "unknown.fieldgrid.nl",
    entrypoints: ["api", "backoffice"],
    action: "deny unknown host",
    expected: "deny",
    evaluate: () => hostTenant("unknown.fieldgrid.nl").kind === "denied",
  },
  {
    testId: "FG-HOST-004",
    boundary: "host",
    mode: "denial",
    actorId: "MULTI-A-B",
    host: "demo-a.fieldgrid.nl",
    entrypoints: ["api", "backoffice"],
    action: "host beats switcher tenant",
    expected: "allow-demo-a-ignore-demo-b-switcher",
    evaluate: () => {
      const context = hostTenant("demo-a.fieldgrid.nl", "demo-b");
      return context.kind === "tenant" && context.tenantSlug === "demo-a" && context.switcherIgnored === true;
    },
  },
  {
    testId: "FG-LIFE-004",
    boundary: "membership",
    mode: "happy",
    actorId: "A-ADMIN",
    host: "veele.fieldgrid.nl",
    entrypoints: ["api", "backoffice"],
    action: "treat veele as ordinary tenant host",
    expected: "tenant-not-platform-exception",
    evaluate: () => isVeeleOrdinaryTenant(),
  },
  {
    testId: "FG-LIFE-001",
    boundary: "membership",
    mode: "happy",
    actorId: "A-ADMIN",
    host: "demo-a.fieldgrid.nl",
    entrypoints: ["api", "backoffice"],
    action: "active tenant member enters own tenant",
    expected: "allow",
    evaluate: () => tenantMembership("A-ADMIN", "demo-a.fieldgrid.nl").allowed === true,
  },
  {
    testId: "FG-DATA-001",
    boundary: "membership",
    mode: "denial",
    actorId: "B-ADMIN",
    host: "demo-a.fieldgrid.nl",
    entrypoints: ["api", "backoffice"],
    action: "tenant member without membership cannot enter foreign tenant",
    expected: "deny",
    evaluate: () => tenantMembership("B-ADMIN", "demo-a.fieldgrid.nl").allowed === false,
  },
  {
    testId: "FG-RBAC-001",
    boundary: "rbac",
    mode: "happy",
    actorId: "A-PLANNER",
    host: "demo-a.fieldgrid.nl",
    entrypoints: ["api", "backoffice"],
    action: "planner can write assignments in own tenant",
    expected: "allow",
    evaluate: () => hasTenantPermission("A-PLANNER", "demo-a.fieldgrid.nl", "assignments.write"),
  },
  {
    testId: "FG-RBAC-002",
    boundary: "rbac",
    mode: "denial",
    actorId: "MULTI-A-B",
    host: "demo-b.fieldgrid.nl",
    entrypoints: ["api", "backoffice"],
    action: "same user has different role per tenant",
    expected: "deny-planner-action-in-demo-b",
    evaluate: () => !hasTenantPermission("MULTI-A-B", "demo-b.fieldgrid.nl", "assignments.write"),
  },
  {
    testId: "FG-RBAC-003",
    boundary: "rbac",
    mode: "denial",
    actorId: "A-EMPLOYEE",
    host: "demo-a.fieldgrid.nl",
    entrypoints: ["api", "backoffice"],
    action: "employee cannot manage settings",
    expected: "deny",
    evaluate: () => !hasTenantPermission("A-EMPLOYEE", "demo-a.fieldgrid.nl", "settings.manage"),
  },
  {
    testId: "FG-PLATFORM-001",
    boundary: "rbac",
    mode: "happy",
    actorId: "PLAT-OWNER-ACTIVE",
    host: "platform.fieldgrid.nl",
    entrypoints: ["api", "backoffice"],
    action: "active platform owner can enter platform scope",
    expected: "allow",
    evaluate: () => hasPlatformAccess("PLAT-OWNER-ACTIVE"),
  },
  {
    testId: "FG-PLATFORM-002",
    boundary: "rbac",
    mode: "denial",
    actorId: "PLAT-ADMIN-INACTIVE",
    host: "platform.fieldgrid.nl",
    entrypoints: ["api", "backoffice"],
    action: "inactive platform admin cannot enter platform scope",
    expected: "deny",
    evaluate: () => !hasPlatformAccess("PLAT-ADMIN-INACTIVE"),
  },
  {
    testId: "FG-SUPPORT-002",
    boundary: "support",
    mode: "happy",
    actorId: "SUPPORT-A-GRANT",
    host: "platform.fieldgrid.nl",
    entrypoints: ["api", "backoffice"],
    action: "support user with active grant can enter granted tenant",
    expected: "allow",
    evaluate: () => supportCanEnter("SUPPORT-A-GRANT", "demo-a"),
  },
  {
    testId: "FG-SUPPORT-001",
    boundary: "support",
    mode: "denial",
    actorId: "SUPPORT-NO-GRANT",
    host: "platform.fieldgrid.nl",
    entrypoints: ["api", "backoffice"],
    action: "support user without grant is denied",
    expected: "deny",
    evaluate: () => !supportCanEnter("SUPPORT-NO-GRANT", "demo-a"),
  },
  {
    testId: "FG-SUPPORT-003",
    boundary: "support",
    mode: "denial",
    actorId: "SUPPORT-EXPIRED",
    host: "platform.fieldgrid.nl",
    entrypoints: ["api", "backoffice"],
    action: "expired support grant is denied",
    expected: "deny",
    evaluate: () => !supportCanEnter("SUPPORT-EXPIRED", "demo-a"),
  },
  {
    testId: "FG-SUPPORT-004",
    boundary: "support",
    mode: "denial",
    actorId: "SUPPORT-A-GRANT",
    host: "platform.fieldgrid.nl",
    entrypoints: ["api", "backoffice"],
    action: "active support grant for Tenant A does not grant Tenant B",
    expected: "deny",
    evaluate: () => !supportCanEnter("SUPPORT-A-GRANT", "demo-b"),
  },
  {
    testId: "FG-MODULE-001",
    boundary: "module",
    mode: "happy",
    actorId: "A-ADMIN",
    host: "demo-a.fieldgrid.nl",
    entrypoints: ["api", "backoffice"],
    action: "enabled module can be used",
    expected: "allow",
    evaluate: () => canUseModule("A-ADMIN", "demo-a", "documents"),
  },
  {
    testId: "FG-MODULE-005",
    boundary: "module",
    mode: "denial",
    actorId: "B-ADMIN",
    host: "demo-b.fieldgrid.nl",
    entrypoints: ["api", "backoffice"],
    action: "disabled module is denied even with tenant access",
    expected: "deny",
    evaluate: () => !canUseModule("B-ADMIN", "demo-b", "documents"),
  },
  {
    testId: "FG-SECTOR-001",
    boundary: "sector",
    mode: "happy",
    actorId: "A-ADMIN",
    host: "demo-a.fieldgrid.nl",
    entrypoints: ["api", "backoffice"],
    action: "allowed sector can be used",
    expected: "allow",
    evaluate: () => canUseSector("A-ADMIN", "demo-a", "cleaning"),
  },
  {
    testId: "FG-SECTOR-002",
    boundary: "sector",
    mode: "denial",
    actorId: "A-ADMIN",
    host: "demo-a.fieldgrid.nl",
    entrypoints: ["api", "backoffice"],
    action: "sector outside tenant configuration is denied",
    expected: "deny",
    evaluate: () => !canUseSector("A-ADMIN", "demo-a", "facility"),
  },
  {
    testId: "FG-REGION-006",
    boundary: "region",
    mode: "happy",
    actorId: "A-PLANNER",
    host: "demo-a.fieldgrid.nl",
    entrypoints: ["api", "backoffice"],
    action: "planning allows personnel with region overlap",
    expected: "allow",
    evaluate: () =>
      canPlanByRegion({
        plannerActorId: "A-PLANNER",
        host: "demo-a.fieldgrid.nl",
        assignmentId: "demo-a:assignment:north",
        personnelActorId: "A-PERSONNEL",
      }),
  },
  {
    testId: "FG-REGION-007",
    boundary: "region",
    mode: "denial",
    actorId: "A-PLANNER",
    host: "demo-a.fieldgrid.nl",
    entrypoints: ["api", "backoffice"],
    action: "planning denies personnel without required region overlap",
    expected: "deny",
    evaluate: () =>
      !canPlanByRegion({
        plannerActorId: "A-PLANNER",
        host: "demo-a.fieldgrid.nl",
        assignmentId: "demo-a:assignment:south",
        personnelActorId: "A-PERSONNEL",
      }),
  },
  {
    testId: "FG-REGION-006A",
    boundary: "region",
    mode: "happy",
    actorId: "A-PLANNER",
    host: "demo-a.fieldgrid.nl",
    entrypoints: ["api", "backoffice"],
    action: "planning leaves assignments without region unrestricted",
    expected: "allow",
    evaluate: () =>
      canPlanByRegion({
        plannerActorId: "A-PLANNER",
        host: "demo-a.fieldgrid.nl",
        assignmentId: "demo-a:assignment:unrestricted",
        personnelActorId: "A-EMPLOYEE",
      }),
  },
  {
    testId: "FG-REGION-002",
    boundary: "region",
    mode: "denial",
    actorId: "A-PLANNER",
    host: "demo-a.fieldgrid.nl",
    entrypoints: ["api", "backoffice"],
    action: "planning denies cross-tenant personnel region even if names overlap",
    expected: "deny",
    evaluate: () =>
      !canPlanByRegion({
        plannerActorId: "A-PLANNER",
        host: "demo-a.fieldgrid.nl",
        assignmentId: "demo-a:assignment:north",
        personnelActorId: "B-PERSONNEL",
      }),
  },
  {
    testId: "FG-DATA-001",
    boundary: "direct-id",
    mode: "happy",
    actorId: "A-ADMIN",
    host: "demo-a.fieldgrid.nl",
    entrypoints: ["api", "backoffice"],
    action: "own tenant direct id is readable",
    expected: "allow",
    evaluate: () => canReadRecord("A-ADMIN", "demo-a.fieldgrid.nl", "demo-a:customer:001"),
  },
  {
    testId: "FG-DATA-001B",
    boundary: "direct-id",
    mode: "denial",
    actorId: "B-ADMIN",
    host: "demo-b.fieldgrid.nl",
    entrypoints: ["api", "backoffice"],
    action: "foreign tenant direct id is denied",
    expected: "deny",
    evaluate: () => !canReadRecord("B-ADMIN", "demo-b.fieldgrid.nl", "demo-a:customer:001"),
  },
  {
    testId: "FG-STORAGE-001",
    boundary: "storage",
    mode: "happy",
    actorId: "A-ADMIN",
    host: "demo-a.fieldgrid.nl",
    entrypoints: ["api"],
    action: "own tenant-prefixed storage path can be signed",
    expected: "allow",
    evaluate: () => {
      const record = findRecord("demo-a:document:001");
      return Boolean(record?.storagePath && canSignStoragePath("A-ADMIN", "demo-a.fieldgrid.nl", record.storagePath));
    },
  },
  {
    testId: "FG-STORAGE-002",
    boundary: "storage",
    mode: "denial",
    actorId: "B-ADMIN",
    host: "demo-b.fieldgrid.nl",
    entrypoints: ["api"],
    action: "foreign tenant storage path guessing is denied",
    expected: "deny",
    evaluate: () => {
      const record = findRecord("demo-a:document:001");
      return Boolean(record?.storagePath && !canSignStoragePath("B-ADMIN", "demo-b.fieldgrid.nl", record.storagePath));
    },
  },
];

export function runSprint5RuntimeProofCases() {
  return sprint5RuntimeProofCases.map((testCase) => {
    let passed = false;
    let error = null;
    try {
      passed = Boolean(testCase.evaluate());
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }

    return {
      testId: testCase.testId,
      boundary: testCase.boundary,
      mode: testCase.mode,
      actorId: testCase.actorId,
      host: testCase.host,
      entrypoints: testCase.entrypoints,
      action: testCase.action,
      expected: testCase.expected,
      passed,
      error,
    };
  });
}

export function validateSprint5RuntimeProof() {
  const errors = [];
  const results = runSprint5RuntimeProofCases();
  const casesByBoundary = new Map();

  for (const tenant of phase1Tenants) {
    if (tenant.slug === "veele" && tenant.platformException) {
      errors.push("Veele must remain an ordinary tenant, not a platform exception.");
    }
  }

  for (const testCase of sprint5RuntimeProofCases) {
    if (!testCase.entrypoints.includes("api")) errors.push(`${testCase.testId} must include the API entrypoint.`);
    if (["host", "membership", "rbac", "support", "module", "sector", "region", "direct-id"].includes(testCase.boundary)) {
      if (!testCase.entrypoints.includes("backoffice")) errors.push(`${testCase.testId} must include the backoffice entrypoint.`);
    }
    if (!findActor(testCase.actorId)) errors.push(`${testCase.testId} references unknown actor ${testCase.actorId}.`);

    const current = casesByBoundary.get(testCase.boundary) ?? { happy: 0, denial: 0 };
    current[testCase.mode] += 1;
    casesByBoundary.set(testCase.boundary, current);
  }

  for (const boundary of SPRINT5_REQUIRED_BOUNDARIES) {
    const coverage = casesByBoundary.get(boundary) ?? { happy: 0, denial: 0 };
    if (coverage.happy < 1) errors.push(`${boundary} needs at least one happy path case.`);
    if (coverage.denial < 1) errors.push(`${boundary} needs at least one denial path case.`);
  }

  for (const result of results) {
    if (!result.passed) errors.push(`${result.testId} failed: ${result.error ?? result.action}`);
  }

  return errors;
}

export function buildSprint5RuntimeProofManifest() {
  const results = runSprint5RuntimeProofCases();
  return {
    version: SPRINT5_RUNTIME_PROOF_VERSION,
    generatedAt: PHASE1_NOW,
    destructive: false,
    directDatabaseWrites: false,
    mutatesExistingTenants: false,
    tenants: phase1Tenants.map((tenant) => ({
      slug: tenant.slug,
      id: tenant.id,
      platformException: tenant.platformException,
      modules: tenant.modules,
      sectors: tenant.sectors,
    })),
    requiredBoundaries: SPRINT5_REQUIRED_BOUNDARIES,
    regionFixtures: sprint5RegionFixtures,
    cases: sprint5RuntimeProofCases.map(({ evaluate, ...testCase }) => testCase),
    results,
    summary: {
      total: results.length,
      passed: results.filter((result) => result.passed).length,
      failed: results.filter((result) => !result.passed).length,
      boundaries: SPRINT5_REQUIRED_BOUNDARIES.map((boundary) => ({
        boundary,
        happy: results.filter((result) => result.boundary === boundary && result.mode === "happy").length,
        denial: results.filter((result) => result.boundary === boundary && result.mode === "denial").length,
      })),
    },
  };
}
