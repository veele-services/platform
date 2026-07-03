const REQUIRED_TENANTS = ["demo-a", "demo-b", "veele"];
const REQUIRED_MODULES = [
  "assignments",
  "customer_portal",
  "documents",
  "finance",
  "inventory",
  "materials",
  "notifications",
  "personnel_portal",
  "reports",
];

const TENANT_ROLES = [
  "owner",
  "admin",
  "management",
  "finance",
  "planner",
  "personnel",
  "customer",
];

const REQUIRED_BOUNDARIES = [
  "host",
  "membership",
  "rbac",
  "support_grant",
  "module",
  "sector",
  "entity_tenant",
  "storage",
  "customer_visibility",
  "billing_approval",
  "audit_log",
  "notification_scope",
];

const REQUIRED_TEST_IDS = [
  "MI-HOST-001",
  "MI-RBAC-001",
  "MI-MATERIAL-001",
  "MI-INVENTORY-001",
  "MI-QR-001",
  "MI-STORAGE-001",
  "MI-BILLING-001",
  "MI-AUDIT-001",
  "MI-MIG-EMPTY",
  "MI-MIG-STAGING-COPY",
];

function tenantHost(slug) {
  if (slug === "veele") {
    return "staging.veele.dgwebservices.nl";
  }

  return `${slug}.staging.fieldgrid.test`;
}

function actorEmail(slug, role) {
  return `${role}@${slug}.fieldgrid.test`;
}

export function buildMaterialInventoryPhase11Fixtures() {
  const tenants = REQUIRED_TENANTS.map((slug) => ({
    slug,
    host: tenantHost(slug),
    ordinaryTenant: true,
    preserveExistingData: true,
    destructive: false,
  }));

  return {
    marker: "fieldgrid-material-inventory-phase-11-fixtures",
    description:
      "Non-destructive fixture contract for material and inventory hardening across demo-a, demo-b and veele as ordinary tenants.",
    destructive: false,
    mutatesExistingTenants: false,
    tenants,
    actors: tenants.flatMap((tenant) =>
      TENANT_ROLES.map((role) => ({
        tenantSlug: tenant.slug,
        role,
        email: actorEmail(tenant.slug, role),
        ordinaryTenantActor: true,
      })),
    ),
    moduleEntitlements: tenants.flatMap((tenant) =>
      REQUIRED_MODULES.map((moduleKey) => ({
        tenantSlug: tenant.slug,
        moduleKey,
        enabled: true,
      })),
    ),
    materials: tenants.map((tenant) => ({
      tenantSlug: tenant.slug,
      code: "M00001",
      name: "Phase 11 test consumable",
      category: "consumables",
      unit: "piece",
      defaultInvoiceable: true,
      customerVisibleDefault: false,
      stockLocations: [
        {
          locationType: "object",
          externalKey: `${tenant.slug}-object-1`,
          quantity: 12,
          minimumQuantity: 2,
        },
        {
          locationType: "personnel",
          externalKey: `${tenant.slug}-personnel-1`,
          quantity: 4,
          minimumQuantity: 1,
        },
      ],
      assignmentUsage: [
        {
          testId: "MI-BILLING-001",
          quantity: 1,
          sourceLocationType: "object",
          customerVisible: true,
          approvedAmountCents: 0,
          approvedByRole: "management",
        },
        {
          testId: "MI-BILLING-002",
          quantity: 2,
          sourceLocationType: "personnel",
          customerVisible: false,
          approvedAmountCents: 1250,
          approvedByRole: "finance",
        },
      ],
    })),
    inventoryItems: tenants.map((tenant) => ({
      tenantSlug: tenant.slug,
      code: "I000001",
      name: "Phase 11 test asset",
      category: "equipment",
      status: "assigned_to_object",
      currentLocationType: "object",
      currentLocationExternalKey: `${tenant.slug}-object-1`,
      qrRoute: `/inventory/scan/I000001?tenant=${tenant.slug}`,
      customerVisible: false,
      maintenanceDue: true,
      issueFixture: {
        testId: "MI-QR-002",
        severity: "medium",
        reportedByRole: "personnel",
        shouldCreateTenantScopedTicket: true,
      },
      assignmentLink: {
        testId: "MI-INVENTORY-002",
        rentalOptional: true,
        billableOnlyAfterApproval: true,
      },
    })),
    securityBoundaries: REQUIRED_BOUNDARIES.map((boundary) => ({
      boundary,
      happyPathRequired: true,
      denialPathRequired: true,
    })),
    requiredTestIds: REQUIRED_TEST_IDS,
    minimumGreenBeforeStaging: [
      "pnpm test",
      "pnpm run typecheck",
      "pnpm run build",
      "MI-MIG-EMPTY",
      "MI-MIG-STAGING-COPY",
      "MI-HOST-001",
      "MI-STORAGE-001",
      "MI-QR-001",
      "MI-BILLING-001",
      "MI-AUDIT-001",
    ],
  };
}

export function validateMaterialInventoryPhase11Fixtures(
  fixtures = buildMaterialInventoryPhase11Fixtures(),
) {
  const errors = [];
  const tenantSlugs = fixtures.tenants.map((tenant) => tenant.slug);
  const moduleKeys = fixtures.moduleEntitlements.map((entitlement) => entitlement.moduleKey);
  const materialCodes = fixtures.materials.map((material) => material.code);
  const inventoryCodes = fixtures.inventoryItems.map((item) => item.code);
  const boundaries = fixtures.securityBoundaries.map((item) => item.boundary);

  if (fixtures.destructive || fixtures.mutatesExistingTenants) {
    errors.push("Phase 11 fixtures must stay non-destructive and must not mutate existing tenants.");
  }

  for (const tenant of REQUIRED_TENANTS) {
    if (!tenantSlugs.includes(tenant)) {
      errors.push(`Missing required tenant fixture: ${tenant}`);
    }
  }

  for (const tenant of fixtures.tenants) {
    if (!tenant.ordinaryTenant) {
      errors.push(`${tenant.slug} must be modeled as an ordinary tenant.`);
    }
  }

  for (const moduleKey of REQUIRED_MODULES) {
    if (!moduleKeys.includes(moduleKey)) {
      errors.push(`Missing required module entitlement: ${moduleKey}`);
    }
  }

  if (!materialCodes.every((code) => code === "M00001")) {
    errors.push("Every tenant fixture must include material code M00001.");
  }

  if (!inventoryCodes.every((code) => code === "I000001")) {
    errors.push("Every tenant fixture must include inventory code I000001.");
  }

  for (const boundary of REQUIRED_BOUNDARIES) {
    if (!boundaries.includes(boundary)) {
      errors.push(`Missing security boundary: ${boundary}`);
    }
  }

  for (const testId of REQUIRED_TEST_IDS) {
    if (!fixtures.requiredTestIds.includes(testId)) {
      errors.push(`Missing required test id: ${testId}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
