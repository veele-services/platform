export const FIELDGRID_TEST_TENANT_IDS = Object.freeze({
  veele: "10000000-0000-0000-0000-000000000001",
  demoA: "10000000-0000-0000-0000-0000000000a1",
  demoB: "10000000-0000-0000-0000-0000000000b1",
});

export const FIELDGRID_TEST_TENANTS = Object.freeze({
  veele: Object.freeze({
    id: FIELDGRID_TEST_TENANT_IDS.veele,
    slug: "veele",
    host: "veele.fieldgrid.nl",
    role: "ordinary-tenant",
  }),
  demoA: Object.freeze({
    id: FIELDGRID_TEST_TENANT_IDS.demoA,
    slug: "demo-a",
    host: "demo-a.fieldgrid.nl",
    role: "happy-path-tenant",
  }),
  demoB: Object.freeze({
    id: FIELDGRID_TEST_TENANT_IDS.demoB,
    slug: "demo-b",
    host: "demo-b.fieldgrid.nl",
    role: "cross-tenant-denial-tenant",
  }),
});

export const FIELDGRID_TEST_HOSTS = Object.freeze({
  platformProduction: "platform.fieldgrid.nl",
  platformStaging: "staging.fieldgrid.nl",
  veele: FIELDGRID_TEST_TENANTS.veele.host,
  demoA: FIELDGRID_TEST_TENANTS.demoA.host,
  demoB: FIELDGRID_TEST_TENANTS.demoB.host,
  unknownFieldgrid: "unknown.fieldgrid.nl",
  customDemoA: "app.demo-a.example.com",
});

export const FIELDGRID_TEST_ACTORS = Object.freeze({
  platformOwnerActive: "PLAT-OWNER-ACTIVE",
  platformAdminInactive: "PLAT-ADMIN-INACTIVE",
  supportNoGrant: "SUPPORT-NO-GRANT",
  supportAGrant: "SUPPORT-A-GRANT",
  supportExpired: "SUPPORT-EXPIRED",
  multiAB: "MULTI-A-B",
  tenantAOwner: "A-OWNER",
  tenantAAdmin: "A-ADMIN",
  tenantAPlanner: "A-PLANNER",
  tenantAEmployee: "A-EMPLOYEE",
  tenantACustomer: "A-CUSTOMER",
  tenantAPersonnel: "A-PERSONNEL",
  tenantBOwner: "B-OWNER",
  tenantBAdmin: "B-ADMIN",
  tenantBPlanner: "B-PLANNER",
  tenantBEmployee: "B-EMPLOYEE",
  tenantBCustomer: "B-CUSTOMER",
  tenantBPersonnel: "B-PERSONNEL",
});

export const FIELDGRID_SPRINT_1_HOST_TEST_IDS = Object.freeze([
  "FG-HOST-001",
  "FG-HOST-002",
  "FG-HOST-003",
  "FG-HOST-004",
  "FG-HOST-005",
  "FG-HOST-006",
]);

export const FIELDGRID_SPRINT_1_LIFECYCLE_TEST_IDS = Object.freeze([
  "FG-LIFE-001",
  "FG-LIFE-002",
  "FG-LIFE-003",
  "FG-LIFE-004",
]);

export const FIELDGRID_RUNTIME_ACTIVE_STATUSES = Object.freeze(["trial", "active"]);
export const FIELDGRID_RUNTIME_BLOCKED_STATUSES = Object.freeze([
  "provisioning",
  "suspended",
  "archived",
]);
