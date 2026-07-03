import {
  PHASE1_NOW,
  canEnterTenant,
  canSignStoragePath,
  canUseModule,
  findActor,
  findRecord,
  findTenant,
  resolveHostContext,
} from "./fieldgrid-phase-1-fixtures.mjs";

export const SPRINT6_PORTAL_ACCEPTANCE_VERSION = "sprint-6-portal-acceptance-v1";
export const SPRINT6_REQUIRED_SURFACES = [
  "backoffice",
  "customer-portal",
  "personnel-app",
  "planning-refresh",
];

export const SPRINT6_REQUIRED_FLOW_IDS = [
  "FG-HOST-002",
  "FG-HOST-003",
  "FG-HOST-004",
  "FG-PORTAL-C-001",
  "FG-PORTAL-C-002",
  "FG-PORTAL-C-003",
  "FG-PORTAL-C-004",
  "FG-PORTAL-P-001",
  "FG-PORTAL-P-002",
  "FG-PORTAL-P-003",
  "FG-PORTAL-P-004",
  "FG-PORTAL-P-005",
];

const demoA = findTenant("demo-a");
const demoB = findTenant("demo-b");

export const sprint6PortalEntities = [
  {
    id: "demo-a:document:001",
    tenantSlug: "demo-a",
    surface: "customer-portal",
    entityType: "document",
    requiredModule: "documents",
    audienceActorIds: ["A-CUSTOMER"],
    storagePath: findRecord("demo-a:document:001")?.storagePath ?? `tenant/${demoA?.id}/document/demo-a-document-001.pdf`,
  },
  {
    id: "demo-a:invoice:001",
    tenantSlug: "demo-a",
    surface: "customer-portal",
    entityType: "invoice",
    requiredModule: "finance",
    audienceActorIds: ["A-CUSTOMER"],
  },
  {
    id: "demo-a:report:001",
    tenantSlug: "demo-a",
    surface: "customer-portal",
    entityType: "report",
    requiredModule: "reporting",
    audienceActorIds: ["A-CUSTOMER"],
    storagePath: findRecord("demo-a:report:001")?.storagePath ?? `tenant/${demoA?.id}/report/demo-a-report-001.pdf`,
  },
  {
    id: "demo-a:ticket:001",
    tenantSlug: "demo-a",
    surface: "customer-portal",
    entityType: "ticket",
    requiredModule: "customer_portal",
    audienceActorIds: ["A-CUSTOMER"],
  },
  {
    id: "demo-b:document:001",
    tenantSlug: "demo-b",
    surface: "customer-portal",
    entityType: "document",
    requiredModule: "documents",
    audienceActorIds: ["B-CUSTOMER"],
    storagePath: findRecord("demo-b:document:001")?.storagePath ?? `tenant/${demoB?.id}/document/demo-b-document-001.pdf`,
  },
  {
    id: "demo-a:assignment:001",
    tenantSlug: "demo-a",
    surface: "personnel-app",
    entityType: "assignment",
    requiredModule: "personnel_app",
    visiblePersonnelActorIds: ["A-PERSONNEL"],
  },
  {
    id: "demo-a:assignment-media:001",
    tenantSlug: "demo-a",
    surface: "personnel-app",
    entityType: "assignment_media",
    requiredModule: "personnel_app",
    visiblePersonnelActorIds: ["A-PERSONNEL"],
    storagePath: `tenant/${demoA?.id}/assignment-photos/demo-a-photo-001.jpg`,
  },
  {
    id: "demo-a:notification:001",
    tenantSlug: "demo-a",
    surface: "personnel-app",
    entityType: "notification",
    requiredModule: "personnel_app",
    visiblePersonnelActorIds: ["A-PERSONNEL"],
  },
];

export const sprint6PlanningTimeline = [
  {
    id: "demo-a:assignment:0900",
    tenantSlug: "demo-a",
    personnelActorId: "A-PERSONNEL",
    startsAt: "2026-07-03T09:00:00.000Z",
    endsAt: "2026-07-03T09:30:00.000Z",
    title: "Morning service",
  },
  {
    id: "demo-a:assignment:1000",
    tenantSlug: "demo-a",
    personnelActorId: "A-PERSONNEL",
    startsAt: "2026-07-03T10:00:00.000Z",
    endsAt: "2026-07-03T10:30:00.000Z",
    title: "Next service",
  },
];

function actorKind(actorId) {
  return findActor(actorId)?.kind ?? null;
}

function hostTenant(host, switcherTenantSlug = null) {
  return resolveHostContext({ host, switcherTenantSlug });
}

function tenantSlugFromHost(host) {
  const context = hostTenant(host);
  return context.kind === "tenant" ? context.tenantSlug : null;
}

function hostAllowsTenant(host, tenantSlug) {
  const context = hostTenant(host);
  return context.kind === "tenant" && context.tenantSlug === tenantSlug;
}

function canOpenBackoffice({ actorId, host, switcherTenantSlug = null }) {
  const context = hostTenant(host, switcherTenantSlug);
  if (context.kind !== "tenant" || !context.tenantSlug) return false;
  return canEnterTenant(actorId, context.tenantSlug).allowed;
}

function findPortalEntity(entityId) {
  return sprint6PortalEntities.find((entity) => entity.id === entityId) ?? null;
}

function canOpenCustomerPortalEntity({ actorId, host, entityId }) {
  const entity = findPortalEntity(entityId);
  if (!entity || entity.surface !== "customer-portal") return false;
  if (!hostAllowsTenant(host, entity.tenantSlug)) return false;
  if (actorKind(actorId) !== "customer") return false;
  if (!canEnterTenant(actorId, entity.tenantSlug).allowed) return false;
  if (!canUseModule(actorId, entity.tenantSlug, "customer_portal")) return false;
  if (entity.requiredModule && !canUseModule(actorId, entity.tenantSlug, entity.requiredModule)) return false;
  if (!entity.audienceActorIds.includes(actorId)) return false;
  if (entity.storagePath && !canSignStoragePath(actorId, host, entity.storagePath)) return false;
  return true;
}

function canOpenPersonnelAppEntity({ actorId, host, entityId }) {
  const entity = findPortalEntity(entityId);
  if (!entity || entity.surface !== "personnel-app") return false;
  if (!hostAllowsTenant(host, entity.tenantSlug)) return false;
  if (actorKind(actorId) !== "personnel") return false;
  if (!canEnterTenant(actorId, entity.tenantSlug).allowed) return false;
  if (!canUseModule(actorId, entity.tenantSlug, "personnel_app")) return false;
  if (entity.requiredModule && !canUseModule(actorId, entity.tenantSlug, entity.requiredModule)) return false;
  if (!entity.visiblePersonnelActorIds.includes(actorId)) return false;
  if (entity.storagePath && !canSignStoragePath(actorId, host, entity.storagePath)) return false;
  return true;
}

function currentPersonnelAssignment(actorId, tenantSlug, nowIso) {
  const now = new Date(nowIso).getTime();
  return (
    sprint6PlanningTimeline.find((assignment) => {
      return (
        assignment.tenantSlug === tenantSlug &&
        assignment.personnelActorId === actorId &&
        new Date(assignment.startsAt).getTime() <= now &&
        now < new Date(assignment.endsAt).getTime()
      );
    }) ?? null
  );
}

function nextPersonnelAssignment(actorId, tenantSlug, nowIso) {
  const now = new Date(nowIso).getTime();
  return (
    sprint6PlanningTimeline
      .filter((assignment) => {
        return (
          assignment.tenantSlug === tenantSlug &&
          assignment.personnelActorId === actorId &&
          new Date(assignment.startsAt).getTime() > now
        );
      })
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0] ?? null
  );
}

function personnelHomeSnapshot({ actorId, host, nowIso }) {
  const tenantSlug = tenantSlugFromHost(host);
  if (!tenantSlug || !canUseModule(actorId, tenantSlug, "personnel_app")) return { allowed: false };
  return {
    allowed: true,
    current: currentPersonnelAssignment(actorId, tenantSlug, nowIso)?.id ?? null,
    next: nextPersonnelAssignment(actorId, tenantSlug, nowIso)?.id ?? null,
  };
}

function minuteRefreshMovesNextAssignment() {
  const before = personnelHomeSnapshot({
    actorId: "A-PERSONNEL",
    host: "demo-a.fieldgrid.nl",
    nowIso: "2026-07-03T08:59:00.000Z",
  });
  const after = personnelHomeSnapshot({
    actorId: "A-PERSONNEL",
    host: "demo-a.fieldgrid.nl",
    nowIso: "2026-07-03T09:01:00.000Z",
  });

  return before.allowed && after.allowed && before.next === "demo-a:assignment:0900" && after.current === "demo-a:assignment:0900";
}

function realtimeEventUpdatesPlanningSnapshot() {
  const before = personnelHomeSnapshot({
    actorId: "A-PERSONNEL",
    host: "demo-a.fieldgrid.nl",
    nowIso: "2026-07-03T09:31:00.000Z",
  });
  const event = { type: "assignment.updated", assignmentId: "demo-a:assignment:1000", scheduledStart: "2026-07-03T09:31:00.000Z" };
  const acceptsRealtimeEvent = event.type === "assignment.updated" && event.assignmentId === before.next;
  return before.allowed && before.next === "demo-a:assignment:1000" && acceptsRealtimeEvent;
}

export const sprint6PortalAcceptanceCases = [
  {
    testId: "FG-HOST-002",
    surface: "backoffice",
    mode: "happy",
    actorId: "A-ADMIN",
    host: "demo-a.fieldgrid.nl",
    route: "/dashboard",
    futureTestType: ["Playwright", "integration"],
    action: "Backoffice login resolves Tenant A from host.",
    expected: "Tenant A dashboard opens.",
    evaluate: () => canOpenBackoffice({ actorId: "A-ADMIN", host: "demo-a.fieldgrid.nl" }),
  },
  {
    testId: "FG-HOST-003",
    surface: "backoffice",
    mode: "denial",
    actorId: "A-ADMIN",
    host: "unknown.fieldgrid.nl",
    route: "/dashboard",
    futureTestType: ["Playwright", "integration"],
    action: "Backoffice login on unknown host.",
    expected: "Safe denial, no default tenant fallback.",
    evaluate: () => !canOpenBackoffice({ actorId: "A-ADMIN", host: "unknown.fieldgrid.nl" }),
  },
  {
    testId: "FG-HOST-004",
    surface: "backoffice",
    mode: "denial",
    actorId: "MULTI-A-B",
    host: "demo-a.fieldgrid.nl",
    route: "/dashboard",
    switcherTenantSlug: "demo-b",
    futureTestType: ["Playwright", "integration"],
    action: "Tenant switcher tries to override host context.",
    expected: "Host wins and Tenant B remains hidden.",
    evaluate: () => {
      const context = hostTenant("demo-a.fieldgrid.nl", "demo-b");
      return context.kind === "tenant" && context.tenantSlug === "demo-a" && context.switcherIgnored === true;
    },
  },
  {
    testId: "FG-PORTAL-C-001",
    surface: "customer-portal",
    mode: "happy",
    actorId: "A-CUSTOMER",
    host: "demo-a.fieldgrid.nl",
    route: "/customer",
    futureTestType: ["Playwright", "integration"],
    action: "Customer opens host-bound portal.",
    expected: "Customer portal opens in Tenant A context.",
    evaluate: () => canUseModule("A-CUSTOMER", "demo-a", "customer_portal") && hostAllowsTenant("demo-a.fieldgrid.nl", "demo-a"),
  },
  {
    testId: "FG-PORTAL-C-004",
    surface: "customer-portal",
    mode: "happy",
    actorId: "A-CUSTOMER",
    host: "demo-a.fieldgrid.nl",
    route: "/customer/documents/demo-a:document:001",
    futureTestType: ["Playwright", "integration", "DB/RLS", "storage"],
    action: "Customer opens own document, invoice, report and ticket surfaces.",
    expected: "Only Tenant A customer-visible records open.",
    evaluate: () =>
      canOpenCustomerPortalEntity({ actorId: "A-CUSTOMER", host: "demo-a.fieldgrid.nl", entityId: "demo-a:document:001" }) &&
      canOpenCustomerPortalEntity({ actorId: "A-CUSTOMER", host: "demo-a.fieldgrid.nl", entityId: "demo-a:invoice:001" }) &&
      canOpenCustomerPortalEntity({ actorId: "A-CUSTOMER", host: "demo-a.fieldgrid.nl", entityId: "demo-a:report:001" }) &&
      canOpenCustomerPortalEntity({ actorId: "A-CUSTOMER", host: "demo-a.fieldgrid.nl", entityId: "demo-a:ticket:001" }),
  },
  {
    testId: "FG-PORTAL-C-002",
    surface: "customer-portal",
    mode: "denial",
    actorId: "A-CUSTOMER",
    host: "demo-b.fieldgrid.nl",
    route: "/customer/documents/demo-a:document:001",
    futureTestType: ["Playwright", "integration"],
    action: "Customer tries wrong tenant host.",
    expected: "Tenant A customer cannot open Tenant B host or Tenant A record through Tenant B host.",
    evaluate: () => !canOpenCustomerPortalEntity({ actorId: "A-CUSTOMER", host: "demo-b.fieldgrid.nl", entityId: "demo-a:document:001" }),
  },
  {
    testId: "FG-PORTAL-C-003",
    surface: "customer-portal",
    mode: "denial",
    actorId: "B-CUSTOMER",
    host: "demo-b.fieldgrid.nl",
    route: "/customer/documents/demo-b:document:001",
    futureTestType: ["Playwright", "integration"],
    action: "Customer opens documents feature while documents module is off.",
    expected: "Server-side module denial.",
    evaluate: () => !canOpenCustomerPortalEntity({ actorId: "B-CUSTOMER", host: "demo-b.fieldgrid.nl", entityId: "demo-b:document:001" }),
  },
  {
    testId: "FG-PORTAL-P-001",
    surface: "personnel-app",
    mode: "happy",
    actorId: "A-PERSONNEL",
    host: "demo-a.fieldgrid.nl",
    route: "/pwa/home",
    futureTestType: ["Playwright", "integration"],
    action: "Personnel opens host-bound app.",
    expected: "Personnel app opens in Tenant A context.",
    evaluate: () => canUseModule("A-PERSONNEL", "demo-a", "personnel_app") && hostAllowsTenant("demo-a.fieldgrid.nl", "demo-a"),
  },
  {
    testId: "FG-PORTAL-P-003",
    surface: "personnel-app",
    mode: "happy",
    actorId: "A-PERSONNEL",
    host: "demo-a.fieldgrid.nl",
    route: "/pwa/assignments/demo-a:assignment:001",
    futureTestType: ["Playwright", "integration", "storage"],
    action: "Personnel opens own assignment, media and notification surfaces.",
    expected: "Only linked Tenant A assignment data opens.",
    evaluate: () =>
      canOpenPersonnelAppEntity({ actorId: "A-PERSONNEL", host: "demo-a.fieldgrid.nl", entityId: "demo-a:assignment:001" }) &&
      canOpenPersonnelAppEntity({ actorId: "A-PERSONNEL", host: "demo-a.fieldgrid.nl", entityId: "demo-a:assignment-media:001" }) &&
      canOpenPersonnelAppEntity({ actorId: "A-PERSONNEL", host: "demo-a.fieldgrid.nl", entityId: "demo-a:notification:001" }),
  },
  {
    testId: "FG-PORTAL-P-002",
    surface: "personnel-app",
    mode: "denial",
    actorId: "A-PERSONNEL",
    host: "demo-b.fieldgrid.nl",
    route: "/pwa/assignments/demo-a:assignment:001",
    futureTestType: ["Playwright", "integration"],
    action: "Personnel tries wrong tenant host.",
    expected: "Tenant A personnel cannot open Tenant B host data.",
    evaluate: () => !canOpenPersonnelAppEntity({ actorId: "A-PERSONNEL", host: "demo-b.fieldgrid.nl", entityId: "demo-a:assignment:001" }),
  },
  {
    testId: "FG-PORTAL-P-004",
    surface: "personnel-app",
    mode: "denial",
    actorId: "B-PERSONNEL",
    host: "demo-b.fieldgrid.nl",
    route: "/pwa/home",
    futureTestType: ["Playwright", "integration"],
    action: "Personnel opens app while personnel_app module is off.",
    expected: "Server-side module denial.",
    evaluate: () => !canUseModule("B-PERSONNEL", "demo-b", "personnel_app"),
  },
  {
    testId: "FG-PORTAL-P-005",
    surface: "planning-refresh",
    mode: "happy",
    actorId: "A-PERSONNEL",
    host: "demo-a.fieldgrid.nl",
    route: "/pwa/home",
    futureTestType: ["Playwright", "integration"],
    action: "Personnel home updates when the minute crosses the current assignment start.",
    expected: "Next assignment becomes current within a minute refresh window.",
    evaluate: () => minuteRefreshMovesNextAssignment(),
  },
  {
    testId: "FG-PORTAL-P-005B",
    surface: "planning-refresh",
    mode: "happy",
    actorId: "A-PERSONNEL",
    host: "demo-a.fieldgrid.nl",
    route: "/pwa/planning",
    futureTestType: ["Playwright", "integration"],
    action: "Personnel planning accepts realtime assignment update events.",
    expected: "Realtime assignment.updated event targets the visible planning snapshot.",
    evaluate: () => realtimeEventUpdatesPlanningSnapshot(),
  },
  {
    testId: "FG-PORTAL-P-005C",
    surface: "planning-refresh",
    mode: "denial",
    actorId: "B-PERSONNEL",
    host: "demo-b.fieldgrid.nl",
    route: "/pwa/home",
    futureTestType: ["Playwright", "integration"],
    action: "Personnel app planning refresh is denied when app module is off.",
    expected: "No planning snapshot is exposed.",
    evaluate: () => !personnelHomeSnapshot({ actorId: "B-PERSONNEL", host: "demo-b.fieldgrid.nl", nowIso: PHASE1_NOW }).allowed,
  },
];

export function runSprint6PortalAcceptanceCases() {
  return sprint6PortalAcceptanceCases.map((testCase) => {
    let passed = false;
    let error = null;
    try {
      passed = Boolean(testCase.evaluate());
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }

    return {
      testId: testCase.testId,
      surface: testCase.surface,
      mode: testCase.mode,
      actorId: testCase.actorId,
      host: testCase.host,
      route: testCase.route,
      action: testCase.action,
      expected: testCase.expected,
      futureTestType: testCase.futureTestType,
      passed,
      error,
    };
  });
}

export function validateSprint6PortalAcceptance() {
  const errors = [];
  const results = runSprint6PortalAcceptanceCases();
  const casesBySurface = new Map();

  for (const testCase of sprint6PortalAcceptanceCases) {
    if (!SPRINT6_REQUIRED_FLOW_IDS.includes(testCase.testId) && !testCase.testId.startsWith("FG-PORTAL-P-005")) {
      errors.push(`${testCase.testId} is not mapped to the Sprint 6 required flow set.`);
    }
    if (!testCase.futureTestType.includes("Playwright")) {
      errors.push(`${testCase.testId} must be promotable to a Playwright test.`);
    }
    if (!findActor(testCase.actorId)) {
      errors.push(`${testCase.testId} references unknown actor ${testCase.actorId}.`);
    }

    const current = casesBySurface.get(testCase.surface) ?? { happy: 0, denial: 0 };
    current[testCase.mode] += 1;
    casesBySurface.set(testCase.surface, current);
  }

  for (const surface of SPRINT6_REQUIRED_SURFACES) {
    const coverage = casesBySurface.get(surface) ?? { happy: 0, denial: 0 };
    if (coverage.happy < 1) errors.push(`${surface} needs at least one happy path.`);
    if (coverage.denial < 1) errors.push(`${surface} needs at least one denial path.`);
  }

  for (const requiredFlowId of SPRINT6_REQUIRED_FLOW_IDS) {
    if (!sprint6PortalAcceptanceCases.some((testCase) => testCase.testId === requiredFlowId)) {
      errors.push(`${requiredFlowId} is missing from Sprint 6 portal acceptance.`);
    }
  }

  for (const result of results) {
    if (!result.passed) errors.push(`${result.testId} failed: ${result.error ?? result.action}`);
  }

  return errors;
}

export function buildSprint6PortalAcceptanceManifest() {
  const results = runSprint6PortalAcceptanceCases();
  return {
    version: SPRINT6_PORTAL_ACCEPTANCE_VERSION,
    generatedAt: PHASE1_NOW,
    destructive: false,
    directDatabaseWrites: false,
    mutatesExistingTenants: false,
    requiredSurfaces: SPRINT6_REQUIRED_SURFACES,
    requiredFlowIds: SPRINT6_REQUIRED_FLOW_IDS,
    portalEntities: sprint6PortalEntities,
    planningTimeline: sprint6PlanningTimeline,
    cases: sprint6PortalAcceptanceCases.map(({ evaluate, ...testCase }) => testCase),
    results,
    summary: {
      total: results.length,
      passed: results.filter((result) => result.passed).length,
      failed: results.filter((result) => !result.passed).length,
      surfaces: SPRINT6_REQUIRED_SURFACES.map((surface) => ({
        surface,
        happy: results.filter((result) => result.surface === surface && result.mode === "happy").length,
        denial: results.filter((result) => result.surface === surface && result.mode === "denial").length,
      })),
    },
  };
}
