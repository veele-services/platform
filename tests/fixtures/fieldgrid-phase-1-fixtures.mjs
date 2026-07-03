export const PHASE1_NOW = "2026-07-03T12:00:00.000Z";
export const PHASE1_DEMO_MARKER = "FIELDGRID_PHASE1_DEMO";
export const SPRINT1_FIXTURE_VERSION = "sprint-1-runtime-fixtures-v1";
export const SPRINT1_SCOPE = "fieldgrid-sprint-1-runtime-fixtures";

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

const tenantIds = {
  "demo-a": "11111111-1111-4111-8111-111111111111",
  "demo-b": "22222222-2222-4222-8222-222222222222",
  veele: "33333333-3333-4333-8333-333333333333",
};

const actorUserIds = {
  "PLAT-OWNER-ACTIVE": "10000000-0000-4000-8000-000000000001",
  "PLAT-ADMIN-INACTIVE": "10000000-0000-4000-8000-000000000002",
  "SUPPORT-NO-GRANT": "10000000-0000-4000-8000-000000000003",
  "SUPPORT-A-GRANT": "10000000-0000-4000-8000-000000000004",
  "SUPPORT-EXPIRED": "10000000-0000-4000-8000-000000000005",
  "A-OWNER": "10000000-0000-4000-8000-000000000101",
  "A-ADMIN": "10000000-0000-4000-8000-000000000102",
  "A-PLANNER": "10000000-0000-4000-8000-000000000103",
  "A-EMPLOYEE": "10000000-0000-4000-8000-000000000104",
  "A-CUSTOMER": "10000000-0000-4000-8000-000000000105",
  "A-PERSONNEL": "10000000-0000-4000-8000-000000000106",
  "B-OWNER": "10000000-0000-4000-8000-000000000201",
  "B-ADMIN": "10000000-0000-4000-8000-000000000202",
  "B-PLANNER": "10000000-0000-4000-8000-000000000203",
  "B-EMPLOYEE": "10000000-0000-4000-8000-000000000204",
  "B-CUSTOMER": "10000000-0000-4000-8000-000000000205",
  "B-PERSONNEL": "10000000-0000-4000-8000-000000000206",
  "MULTI-A-B": "10000000-0000-4000-8000-000000000301",
};

const recordUuidPrefixes = {
  "demo-a": "11111111-1111-4111-8111",
  "demo-b": "22222222-2222-4222-8222",
  veele: "33333333-3333-4333-8333",
};

const recordTypeSuffixes = {
  customer: "000000000101",
  object: "000000000102",
  personnel: "000000000103",
  assignment: "000000000104",
  document: "000000000105",
  report: "000000000106",
  quote: "000000000107",
  invoice: "000000000108",
  payment: "000000000109",
  audit: "000000000110",
};

function recordUuid(tenantSlug, type) {
  return `${recordUuidPrefixes[tenantSlug]}-${recordTypeSuffixes[type]}`;
}

export const phase1Tenants = [
  {
    slug: "demo-a",
    id: tenantIds["demo-a"],
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
    id: tenantIds["demo-b"],
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
    id: tenantIds.veele,
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

export const phase1TenantDomains = phase1Tenants.flatMap((tenant) =>
  tenant.hosts.map((host, index) => ({
    tenantSlug: tenant.slug,
    tenantId: tenant.id,
    host,
    isPrimary: host === tenant.primaryHost,
    fixtureKey: `${tenant.slug}:domain:${index + 1}`,
  })),
);

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
  { id: "PLAT-OWNER-ACTIVE", userId: actorUserIds["PLAT-OWNER-ACTIVE"], kind: "platform", status: "active", platformRole: "owner" },
  { id: "PLAT-ADMIN-INACTIVE", userId: actorUserIds["PLAT-ADMIN-INACTIVE"], kind: "platform", status: "inactive", platformRole: "admin" },
  { id: "SUPPORT-NO-GRANT", userId: actorUserIds["SUPPORT-NO-GRANT"], kind: "support", status: "active", grants: [] },
  {
    id: "SUPPORT-A-GRANT",
    userId: actorUserIds["SUPPORT-A-GRANT"],
    kind: "support",
    status: "active",
    grants: [
      {
        tenantSlug: "demo-a",
        startsAt: "2026-07-03T11:00:00.000Z",
        expiresAt: "2026-07-03T13:00:00.000Z",
        revoked: false,
        reason: "Sprint 1 active grant fixture",
      },
    ],
  },
  {
    id: "SUPPORT-EXPIRED",
    userId: actorUserIds["SUPPORT-EXPIRED"],
    kind: "support",
    status: "active",
    grants: [
      {
        tenantSlug: "demo-a",
        startsAt: "2026-07-03T08:00:00.000Z",
        expiresAt: "2026-07-03T09:00:00.000Z",
        revoked: false,
        reason: "Sprint 1 expired grant fixture",
      },
    ],
  },
  { id: "A-OWNER", userId: actorUserIds["A-OWNER"], kind: "tenant", status: "active", memberships: [{ tenantSlug: "demo-a", role: "owner" }] },
  { id: "A-ADMIN", userId: actorUserIds["A-ADMIN"], kind: "tenant", status: "active", memberships: [{ tenantSlug: "demo-a", role: "admin" }] },
  { id: "A-PLANNER", userId: actorUserIds["A-PLANNER"], kind: "tenant", status: "active", memberships: [{ tenantSlug: "demo-a", role: "planner" }] },
  { id: "A-EMPLOYEE", userId: actorUserIds["A-EMPLOYEE"], kind: "tenant", status: "active", memberships: [{ tenantSlug: "demo-a", role: "employee" }] },
  { id: "A-CUSTOMER", userId: actorUserIds["A-CUSTOMER"], kind: "customer", status: "active", memberships: [{ tenantSlug: "demo-a", role: "customer" }] },
  { id: "A-PERSONNEL", userId: actorUserIds["A-PERSONNEL"], kind: "personnel", status: "active", memberships: [{ tenantSlug: "demo-a", role: "personnel" }] },
  { id: "B-OWNER", userId: actorUserIds["B-OWNER"], kind: "tenant", status: "active", memberships: [{ tenantSlug: "demo-b", role: "owner" }] },
  { id: "B-ADMIN", userId: actorUserIds["B-ADMIN"], kind: "tenant", status: "active", memberships: [{ tenantSlug: "demo-b", role: "admin" }] },
  { id: "B-PLANNER", userId: actorUserIds["B-PLANNER"], kind: "tenant", status: "active", memberships: [{ tenantSlug: "demo-b", role: "planner" }] },
  { id: "B-EMPLOYEE", userId: actorUserIds["B-EMPLOYEE"], kind: "tenant", status: "active", memberships: [{ tenantSlug: "demo-b", role: "employee" }] },
  { id: "B-CUSTOMER", userId: actorUserIds["B-CUSTOMER"], kind: "customer", status: "active", memberships: [{ tenantSlug: "demo-b", role: "customer" }] },
  { id: "B-PERSONNEL", userId: actorUserIds["B-PERSONNEL"], kind: "personnel", status: "active", memberships: [{ tenantSlug: "demo-b", role: "personnel" }] },
  {
    id: "MULTI-A-B",
    userId: actorUserIds["MULTI-A-B"],
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
    uuid: recordUuid(tenant.slug, type),
    type,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    label: `${tenant.slug.toUpperCase()} ${type} 001`,
    sector: tenant.sectors[0],
    metadata: { seed: PHASE1_DEMO_MARKER, scope: SPRINT1_SCOPE, fixtureVersion: SPRINT1_FIXTURE_VERSION },
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
      entityId: record.uuid,
      storagePath: record.storagePath,
      expectedBucket: "tenant-private",
      metadata: { seed: PHASE1_DEMO_MARKER, scope: SPRINT1_SCOPE, fixtureVersion: SPRINT1_FIXTURE_VERSION },
    })),
  ...phase1Tenants.map((tenant) => ({
    id: `${tenant.slug}:assignment_photo:001:storage`,
    tenantSlug: tenant.slug,
    tenantId: tenant.id,
    entityType: "assignment_photo",
    entityId: recordUuid(tenant.slug, "assignment"),
    storagePath: `tenant/${tenant.id}/assignment-photos/${tenant.slug}-photo-001.jpg`,
    expectedBucket: "tenant-private",
    metadata: { seed: PHASE1_DEMO_MARKER, scope: SPRINT1_SCOPE, fixtureVersion: SPRINT1_FIXTURE_VERSION },
  })),
];

export const phase1SeedBatches = [
  {
    id: "seed-tenants",
    order: 10,
    mode: "upsert",
    table: "tenants",
    uniqueBy: ["slug"],
    rows: phase1Tenants.map((tenant) => ({
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status,
      plan_key: tenant.planKey,
      is_active: true,
    })),
  },
  {
    id: "seed-tenant-domains",
    order: 20,
    mode: "upsert",
    table: "tenant_domains",
    uniqueBy: ["domain"],
    rows: phase1TenantDomains.map((domain) => ({
      tenant_id: domain.tenantId,
      domain: domain.host,
      is_primary: domain.isPrimary,
      metadata: { seed: PHASE1_DEMO_MARKER, scope: SPRINT1_SCOPE, fixtureKey: domain.fixtureKey },
    })),
  },
  {
    id: "seed-platform-actors",
    order: 30,
    mode: "upsert",
    table: "platform_users",
    uniqueBy: ["user_id"],
    rows: phase1Actors
      .filter((actor) => ["platform", "support"].includes(actor.kind))
      .map((actor) => ({
        user_id: actor.userId,
        role: actor.platformRole ?? "support",
        status: actor.status,
      })),
  },
  {
    id: "seed-tenant-memberships",
    order: 40,
    mode: "upsert",
    table: "tenant_users",
    uniqueBy: ["tenant_id", "user_id"],
    rows: phase1Actors.flatMap((actor) =>
      (actor.memberships ?? []).map((membership) => ({
        tenant_id: findTenant(membership.tenantSlug)?.id,
        user_id: actor.userId,
        role: membership.role,
        status: actor.status,
      })),
    ),
  },
  {
    id: "seed-tenant-records",
    order: 50,
    mode: "upsert",
    table: "tenant_fixture_records",
    uniqueBy: ["fixture_key"],
    virtual: true,
    rows: phase1Records.map((record) => ({
      fixture_key: record.id,
      id: record.uuid,
      tenant_id: record.tenantId,
      tenant_slug: record.tenantSlug,
      type: record.type,
      label: record.label,
      sector: record.sector,
      metadata: record.metadata,
    })),
  },
  {
    id: "seed-storage-manifest",
    order: 60,
    mode: "upsert",
    table: "tenant_storage_manifest",
    uniqueBy: ["storage_path"],
    virtual: true,
    rows: phase1StorageObjects.map((object) => ({
      tenant_id: object.tenantId,
      tenant_slug: object.tenantSlug,
      bucket: object.expectedBucket,
      storage_path: object.storagePath,
      entity_type: object.entityType,
      entity_id: object.entityId,
      metadata: object.metadata,
    })),
  },
  {
    id: "seed-support-grants",
    order: 70,
    mode: "upsert",
    table: "support_access_grants",
    uniqueBy: ["platform_user_id", "tenant_id", "reason"],
    rows: phase1Actors.flatMap((actor) =>
      (actor.grants ?? []).map((grant) => ({
        platform_user_id: actor.userId,
        tenant_id: findTenant(grant.tenantSlug)?.id,
        reason: grant.reason,
        starts_at: grant.startsAt,
        expires_at: grant.expiresAt,
        revoked_at: grant.revoked ? PHASE1_NOW : null,
        metadata: { seed: PHASE1_DEMO_MARKER, scope: SPRINT1_SCOPE },
      })),
    ),
  },
];

export const phase1CleanupBatches = [
  {
    id: "cleanup-support-grants",
    order: 10,
    tables: ["support_access_audit_log", "support_access_grants"],
    selector: `reason like 'Sprint 1%' or metadata->>'seed' = '${PHASE1_DEMO_MARKER}'`,
    requiresMarker: true,
    destructive: false,
  },
  {
    id: "cleanup-storage-manifest",
    order: 20,
    tables: ["documents", "assignment_photos", "reports"],
    selector: `storage_path like 'tenant/{sprint1TenantId}/%' and metadata->>'seed' = '${PHASE1_DEMO_MARKER}'`,
    requiresMarker: true,
    destructive: false,
  },
  {
    id: "cleanup-tenant-records",
    order: 30,
    tables: ["payments", "invoices", "quotes", "reports", "documents", "assignments", "objects", "personnel", "customers"],
    selector: `tenant_id in (${Object.values(tenantIds).join(", ")}) and metadata->>'seed' = '${PHASE1_DEMO_MARKER}'`,
    requiresMarker: true,
    destructive: false,
  },
  {
    id: "cleanup-memberships-and-domains",
    order: 40,
    tables: ["tenant_user_roles", "tenant_users", "tenant_domains"],
    selector: `tenant_id in (${Object.values(tenantIds).join(", ")}) and only sprint-1 fixture users/domains`,
    requiresMarker: true,
    destructive: false,
  },
  {
    id: "cleanup-tenants-last",
    order: 50,
    tables: ["tenants"],
    selector: "slug in (demo-a, demo-b, veele) and created by sprint-1 fixture harness only",
    requiresMarker: true,
    destructive: false,
  },
];

export const phase1RuntimeAssertions = [
  { testId: "FG-HOST-002", name: "host resolves tenant", type: "host", happy: true },
  { testId: "FG-HOST-004", name: "host beats switcher", type: "host", happy: false },
  { testId: "FG-LIFE-004", name: "veele ordinary tenant", type: "tenant", happy: true },
  { testId: "FG-RBAC-002", name: "tenant role differs per tenant", type: "rbac", happy: false },
  { testId: "FG-SUPPORT-002", name: "active support grant", type: "support", happy: true },
  { testId: "FG-SUPPORT-004", name: "wrong support tenant denied", type: "support", happy: false },
  { testId: "FG-MODULE-005", name: "module off denied", type: "module", happy: false },
  { testId: "FG-SECTOR-002", name: "foreign sector denied", type: "sector", happy: false },
  { testId: "FG-DATA-001", name: "direct id denied", type: "direct-id", happy: false },
  { testId: "FG-STORAGE-002", name: "path guessing denied", type: "storage", happy: false },
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

export function buildPhase1RuntimeFixtureManifest() {
  return {
    version: SPRINT1_FIXTURE_VERSION,
    marker: PHASE1_DEMO_MARKER,
    scope: SPRINT1_SCOPE,
    destructive: false,
    mutatesExistingTenants: false,
    directDatabaseWrites: false,
    allowedTenantSlugs: phase1Tenants.map((tenant) => tenant.slug),
    tenants: phase1Tenants,
    tenantDomains: phase1TenantDomains,
    actors: phase1Actors,
    records: phase1Records,
    storageObjects: phase1StorageObjects,
    seedBatches: phase1SeedBatches,
    cleanupBatches: phase1CleanupBatches,
    runtimeAssertions: phase1RuntimeAssertions,
    securityCases: phase1SecurityCases,
    migrationSmokes: phase1MigrationSmokes,
  };
}

export function buildPhase1DemoDataPlan() {
  const manifest = buildPhase1RuntimeFixtureManifest();
  return {
    ...manifest,
    cleanupSelectors: phase1CleanupBatches.map((batch) => batch.selector),
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
    if (!tenant.hosts.includes(tenant.primaryHost)) errors.push(`${tenant.slug} primaryHost must be in hosts`);
    for (const type of requiredRecordTypes) {
      const record = phase1Records.find((candidate) => candidate.tenantSlug === tenant.slug && candidate.type === type);
      if (!record) errors.push(`${tenant.slug} is missing ${type}`);
      if (record && record.tenantId !== tenant.id) errors.push(`${record.id} has the wrong tenantId`);
      if (record && record.metadata?.seed !== PHASE1_DEMO_MARKER) errors.push(`${record.id} is missing seed metadata`);
    }
  }
  for (const actor of phase1Actors) {
    if (!actor.userId) errors.push(`${actor.id} is missing deterministic userId`);
  }
  for (const storageObject of phase1StorageObjects) {
    if (!storageObject.storagePath.startsWith(`tenant/${storageObject.tenantId}/`)) {
      errors.push(`${storageObject.id} is not tenant-prefixed`);
    }
  }
  for (const batch of phase1SeedBatches) {
    if (batch.mode !== "upsert") errors.push(`${batch.id} must be idempotent upsert mode`);
    if (!Array.isArray(batch.uniqueBy) || batch.uniqueBy.length === 0) errors.push(`${batch.id} needs uniqueBy`);
    if (!Array.isArray(batch.rows) || batch.rows.length === 0) errors.push(`${batch.id} needs rows`);
  }
  for (const batch of phase1CleanupBatches) {
    if (batch.destructive) errors.push(`${batch.id} must not be destructive`);
    if (!batch.requiresMarker) errors.push(`${batch.id} must require marker-scoped cleanup`);
  }
  for (const smoke of phase1MigrationSmokes) {
    if (smoke.destructive) errors.push(`${smoke.id} must be non-destructive`);
  }
  return errors;
}
