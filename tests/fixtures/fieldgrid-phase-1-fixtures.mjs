export const PHASE1_NOW = "2026-07-03T12:00:00.000Z";
export const PHASE1_DEMO_MARKER = "FIELDGRID_PHASE1_DEMO";

export const requiredRecordTypes = [
  "customer",
  "object",
  "personnel",
  "assignment",
  "document",
  "report",
  "quote",
  "invoice",
  "payment",
  "audit",
];

export const phase1Tenants = [
  {
    slug: "demo-a",
    id: "11111111-1111-4111-8111-111111111111",
    name: "Demo A",
    primaryHost: "demo-a.fieldgrid.nl",
    hosts: ["demo-a.fieldgrid.nl", "demo-a.customers.example"],
    status: "active",
    planKey: "professional",
    platformException: false,
    sectors: ["cleaning", "security"],
    modules: [
      "customers",
      "objects",
      "personnel",
      "assignments",
      "documents",
      "finance",
      "reporting",
      "customer_portal",
      "personnel_app",
    ],
  },
  {
    slug: "demo-b",
    id: "22222222-2222-4222-8222-222222222222",
    name: "Demo B",
    primaryHost: "demo-b.fieldgrid.nl",
    hosts: ["demo-b.fieldgrid.nl"],
    status: "active",
    planKey: "starter",
    platformException: false,
    sectors: ["cleaning"],
    modules: ["customers", "objects", "personnel", "assignments", "customer_portal"],
  },
  {
    slug: "veele",
    id: "33333333-3333-4333-8333-333333333333",
    name: "Veele Services",
    primaryHost: "veele.fieldgrid.nl",
    hosts: ["veele.fieldgrid.nl"],
    status: "active",
    planKey: "enterprise",
    platformException: false,
    sectors: ["cleaning", "facility", "security"],
    modules: [
      "customers",
      "objects",
      "personnel",
      "assignments",
      "documents",
      "finance",
      "reporting",
      "customer_portal",
      "personnel_app",
      "notifications",
    ],
  },
];

export const phase1Hosts = [
  { testId: "FG-HOST-001", host: "platform.fieldgrid.nl", expectedKind: "platform" },
  { testId: "FG-HOST-001", host: "staging.fieldgrid.nl", expectedKind: "platform" },
  { testId: "FG-HOST-002", host: "demo-a.fieldgrid.nl", expectedKind: "tenant", expectedTenantSlug: "demo-a" },
  { testId: "FG-HOST-002", host: "demo-b.fieldgrid.nl", expectedKind: "tenant", expectedTenantSlug: "demo-b" },
  { testId: "FG-LIFE-004", host: "veele.fieldgrid.nl", expectedKind: "tenant", expectedTenantSlug: "veele" },
  { testId: "FG-HOST-003", host: "unknown.fieldgrid.nl", expectedKind: "denied" },
  {
    testId: "FG-HOST-004",
    host: "demo-a.fieldgrid.nl",
    switcherTenantSlug: "demo-b",
    expectedKind: "tenant",
    expectedTenantSlug: "demo-a",
    switcherMustBeIgnored: true,
  },
  { testId: "FG-HOST-006", host: "demo-a.customers.example", expectedKind: "tenant", expectedTenantSlug: "demo-a" },
];

export const phase1Actors = [
  { id: "PLAT-OWNER-ACTIVE", kind: "platform", status: "active", platformRole: "owner" },
  { id: "PLAT-ADMIN-INACTIVE", kind: "platform", status: "inactive", platformRole: "admin" },
  { id: "SUPPORT-NO-GRANT", kind: "support", status: "active", grants: [] },
  {
    id: "SUPPORT-A-GRANT",
    kind: "support",
    status: "active",
    grants: [
      {
        tenantSlug: "demo-a",
        startsAt: "2026-07-03T11:00:00.000Z",
        expiresAt: "2026-07-03T13:00:00.000Z",
        revoked: false,
        reason: "Phase 1 active grant fixture",
      },
    ],
  },
  {
    id: "SUPPORT-EXPIRED",
    kind: "support",
    status: "active",
    grants: [
      {
        tenantSlug: "demo-a",
        startsAt: "2026-07-03T08:00:00.000Z",
        expiresAt: "2026-07-03T09:00:00.000Z",
        revoked: false,
        reason: "Phase 1 expired grant fixture",
      },
    ],
  },
  { id: "A-OWNER", kind: "tenant", status: "active", memberships: [{ tenantSlug: "demo-a", role: "owner" }] },
  { id: "A-ADMIN", kind: "tenant", status: "active", memberships: [{ tenantSlug: "demo-a", role: "admin" }] },
  { id: "A-PLANNER", kind: "tenant", status: "active", memberships: [{ tenantSlug: "demo-a", role: "planner" }] },
  { id: "A-EMPLOYEE", kind: "tenant", status: "active", memberships: [{ tenantSlug: "demo-a", role: "employee" }] },
  { id: "A-CUSTOMER", kind: "customer", status: "active", memberships: [{ tenantSlug: "demo-a", role: "customer" }] },
  { id: "A-PERSONNEL", kind: "personnel", status: "active", memberships: [{ tenantSlug: "demo-a", role: "personnel" }] },
  { id: "B-OWNER", kind: "tenant", status: "active", memberships: [{ tenantSlug: "demo-b", role: "owner" }] },
  { id: "B-ADMIN", kind: "tenant", status: "active", memberships: [{ tenantSlug: "demo-b", role: "admin" }] },
  { id: "B-PLANNER", kind: "tenant", status: "active", memberships: [{ tenantSlug: "demo-b", role: "planner" }] },
  { id: "B-EMPLOYEE", kind: "tenant", status: "active", memberships: [{ tenantSlug: "demo-b", role: "employee" }] },
  { id: "B-CUSTOMER", kind: "customer", status: "active", memberships: [{ tenantSlug: "demo-b", role: "customer" }] },
  { id: "B-PERSONNEL", kind: "personnel", status: "active", memberships: [{ tenantSlug: "demo-b", role: "personnel" }] },
  {
    id: "MULTI-A-B",
    kind: "tenant",
    status: "active",
    memberships: [
      { tenantSlug: "demo-a", role: "planner" },
      { tenantSlug: "demo-b", role: "employee" },
    ],
  },
];

export const phase1Records = phase1Tenants.flatMap((tenant) =>
  requiredRecordTypes.map((type) => ({
    id: `${tenant.slug}:${type}:001`,
    type,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    label: `${tenant.slug.toUpperCase()} ${type} 001`,
    sector: tenant.sectors[0],
    storagePath: ["document", "report"].includes(type) ? `tenant/${tenant.id}/${type}/${tenant.slug}-${type}-001.pdf` : null,
  })),
);

export const phase1StorageObjects = [
  ...phase1Records
    .filter((record) => record.storagePath)
    .map((record) => ({
      id: `${record.id}:storage`,
      tenantSlug: record.tenantSlug,
      tenantId: record.tenantId,
      entityType: record.type,
      entityId: record.id,
      storagePath: record.storagePath,
      expectedBucket: "tenant-private",
    })),
  ...phase1Tenants.map((tenant) => ({
    id: `${tenant.slug}:assignment_photo:001:storage`,
    tenantSlug: tenant.slug,
    tenantId: tenant.id,
    entityType: "assignment_photo",
    entityId: `${tenant.slug}:assignment_photo:001`,
    storagePath: `tenant/${tenant.id}/assignment-photos/${tenant.slug}-photo-001.jpg`,
    expectedBucket: "tenant-private",
  })),
];

export const phase1SecurityCases = [
  { testId: "FG-HOST-004", boundary: "host", actorId: "MULTI-A-B", host: "demo-a.fieldgrid.nl", switcherTenantSlug: "demo-b", expected: "allow-demo-a" },
  { testId: "FG-RBAC-002", boundary: "rbac", actorId: "MULTI-A-B", host: "demo-b.fieldgrid.nl", requiredRole: "planner", expected: "deny" },
  { testId: "FG-SUPPORT-002", boundary: "support", actorId: "SUPPORT-A-GRANT", host: "platform.fieldgrid.nl", tenantSlug: "demo-a", expected: "allow" },
  { testId: "FG-SUPPORT-004", boundary: "support", actorId: "SUPPORT-A-GRANT", host: "platform.fieldgrid.nl", tenantSlug: "demo-b", expected: "deny" },
  { testId: "FG-MODULE-005", boundary: "module", actorId: "B-ADMIN", host: "demo-b.fieldgrid.nl", moduleKey: "documents", expected: "deny" },
  { testId: "FG-SECTOR-002", boundary: "sector", actorId: "A-ADMIN", host: "demo-a.fieldgrid.nl", sectorKey: "facility", expected: "deny" },
  { testId: "FG-DATA-001", boundary: "direct-id", actorId: "B-ADMIN", host: "demo-b.fieldgrid.nl", recordId: "demo-a:customer:001", expected: "deny" },
  { testId: "FG-STORAGE-002", boundary: "storage", actorId: "B-ADMIN", host: "demo-b.fieldgrid.nl", storagePath: "tenant/11111111-1111-4111-8111-111111111111/document/demo-a-document-001.pdf", expected: "deny" },
];

export const phase1MigrationSmokes = [
  {
    id: "FG-MIG-001",
    target: "empty-db",
    command: "pnpm --filter @workspace/db run db:migrate",
    requiresDatabaseUrl: true,
    destructive: false,
  },
  {
    id: "FG-MIG-002",
    target: "staging-copy",
    command: "pnpm --filter @workspace/db run db:migrate",
    requiresDatabaseUrl: true,
    destructive: false,
  },
  {
    id: "FG-MIG-003",
    target: "legacy-compatibility-skip",
    command: "pnpm --filter @workspace/db run db:migrate",
    requiresDatabaseUrl: true,
    destructive: false,
  },
];

export function findTenant(slug) {
  return phase1Tenants.find((tenant) => tenant.slug === slug) ?? null;
}

export function findActor(actorId) {
  return phase1Actors.find((actor) => actor.id === actorId) ?? null;
}

export function findRecord(recordId) {
  return phase1Records.find((record) => record.id === recordId) ?? null;
}

export function resolveHostContext({ host, switcherTenantSlug = null }) {
  const normalizedHost = String(host).toLowerCase();
  if (["platform.fieldgrid.nl", "staging.fieldgrid.nl"].includes(normalizedHost)) {
    return { kind: "platform", tenantSlug: null, switcherIgnored: Boolean(switcherTenantSlug) };
  }

  const tenant = phase1Tenants.find((candidate) => candidate.hosts.includes(normalizedHost));
  if (!tenant) return { kind: "denied", tenantSlug: null, switcherIgnored: Boolean(switcherTenantSlug) };

  return {
    kind: "tenant",
    tenantSlug: tenant.slug,
    switcherIgnored: Boolean(switcherTenantSlug && switcherTenantSlug !== tenant.slug),
  };
}

function hasActiveSupportGrant(actor, tenantSlug, now = PHASE1_NOW) {
  if (!actor || actor.kind !== "support" || actor.status !== "active") return false;
  const current = new Date(now).getTime();
  return (actor.grants ?? []).some((grant) => {
    return (
      grant.tenantSlug === tenantSlug &&
      !grant.revoked &&
      new Date(grant.startsAt).getTime() <= current &&
      current < new Date(grant.expiresAt).getTime()
    );
  });
}

export function canEnterTenant(actorId, tenantSlug, { supportMode = false, now = PHASE1_NOW } = {}) {
  const actor = findActor(actorId);
  const tenant = findTenant(tenantSlug);
  if (!actor || !tenant || tenant.status !== "active") return { allowed: false, via: "none" };

  if (supportMode && hasActiveSupportGrant(actor, tenantSlug, now)) return { allowed: true, via: "support-grant" };

  const membership = (actor.memberships ?? []).find((entry) => entry.tenantSlug === tenantSlug);
  if (actor.status === "active" && membership) return { allowed: true, via: "tenant-role", role: membership.role };

  return { allowed: false, via: "none" };
}

export function canUseModule(actorId, tenantSlug, moduleKey) {
  const tenantAccess = canEnterTenant(actorId, tenantSlug);
  const tenant = findTenant(tenantSlug);
  return Boolean(tenantAccess.allowed && tenant?.modules.includes(moduleKey));
}

export function canUseSector(actorId, tenantSlug, sectorKey) {
  const tenantAccess = canEnterTenant(actorId, tenantSlug);
  const tenant = findTenant(tenantSlug);
  return Boolean(tenantAccess.allowed && tenant?.sectors.includes(sectorKey));
}

export function canReadRecord(actorId, host, recordId) {
  const hostContext = resolveHostContext({ host });
  const record = findRecord(recordId);
  if (!record || hostContext.kind !== "tenant") return false;
  if (hostContext.tenantSlug !== record.tenantSlug) return false;
  return canEnterTenant(actorId, record.tenantSlug).allowed;
}

export function canSignStoragePath(actorId, host, storagePath) {
  const hostContext = resolveHostContext({ host });
  if (hostContext.kind !== "tenant") return false;
  const tenant = findTenant(hostContext.tenantSlug);
  if (!tenant || !canEnterTenant(actorId, tenant.slug).allowed) return false;
  return String(storagePath).startsWith(`tenant/${tenant.id}/`);
}

export function buildPhase1DemoDataPlan() {
  return {
    marker: PHASE1_DEMO_MARKER,
    destructive: false,
    mutatesExistingTenants: false,
    allowedTenantSlugs: phase1Tenants.map((tenant) => tenant.slug),
    cleanupSelectors: [
      `metadata.seed = ${PHASE1_DEMO_MARKER}`,
      `storage_path like tenant/{phase1TenantId}/%`,
      "slug in (demo-a, demo-b, veele)",
    ],
    tenants: phase1Tenants,
    actors: phase1Actors,
    records: phase1Records,
    storageObjects: phase1StorageObjects,
    migrationSmokes: phase1MigrationSmokes,
  };
}

export function validatePhase1Fixtures() {
  const errors = [];
  const slugs = phase1Tenants.map((tenant) => tenant.slug);
  for (const requiredSlug of ["demo-a", "demo-b", "veele"]) {
    if (!slugs.includes(requiredSlug)) errors.push(`Missing required tenant ${requiredSlug}`);
  }
  for (const tenant of phase1Tenants) {
    if (tenant.platformException) errors.push(`${tenant.slug} must not be a platform exception`);
    for (const type of requiredRecordTypes) {
      const record = phase1Records.find((candidate) => candidate.tenantSlug === tenant.slug && candidate.type === type);
      if (!record) errors.push(`${tenant.slug} is missing ${type}`);
      if (record && record.tenantId !== tenant.id) errors.push(`${record.id} has the wrong tenantId`);
    }
  }
  for (const storageObject of phase1StorageObjects) {
    if (!storageObject.storagePath.startsWith(`tenant/${storageObject.tenantId}/`)) {
      errors.push(`${storageObject.id} is not tenant-prefixed`);
    }
  }
  for (const smoke of phase1MigrationSmokes) {
    if (smoke.destructive) errors.push(`${smoke.id} must be non-destructive`);
  }
  return errors;
}
