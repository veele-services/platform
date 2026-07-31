import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const read = (path) => readFileSync(path, "utf8");

function assertIncludes(source, needles, label) {
  for (const needle of needles) {
    assert.ok(source.includes(needle), `${label} should include ${needle}`);
  }
}

test("W09 customer portal navigation exposes calm Dutch IA", () => {
  const sidebar = read("artifacts/klant-pwa/src/components/DesktopSidebar.tsx");
  const bottomNav = read("artifacts/klant-pwa/src/components/BottomNav.tsx");
  const more = read("artifacts/klant-pwa/src/app/(app)/meer/page.tsx");

  assertIncludes(
    sidebar,
    [
      "Overzicht",
      "Opdrachten",
      "Objecten",
      "Contact & tickets",
      "Financieel",
      "Rapportages",
      "Documenten",
      "Hulpcentrum",
      "Wat is nieuw",
      "Voorkeuren",
      "featureFlags",
    ],
    "desktop sidebar",
  );
  assertIncludes(
    bottomNav,
    ["Overzicht", "Opdrachten", "Objecten", "Support", "Meer"],
    "mobile bottom nav",
  );
  assertIncludes(
    more,
    [
      "Offertes en akkoordstatus",
      "Facturen, status en bestaande betaalopties",
      "Naar Support",
    ],
    "more page",
  );
});

test("W09 assignment detail presents planned versus actual customer timeline", () => {
  const action = read("artifacts/klant-pwa/src/actions/assignments.ts");
  const detail = read(
    "artifacts/klant-pwa/src/app/(app)/opdrachten/[id]/page.tsx",
  );

  assertIncludes(
    action,
    [
      "actualStartedAt: assignmentsTable.actualStartedAt",
      "actualCompletedAt: assignmentsTable.actualCompletedAt",
      "eq(assignmentsTable.customerId, identity.customerId)",
      "eq(assignmentsTable.tenantId, identity.tenantId)",
    ],
    "assignment action",
  );
  assertIncludes(
    detail,
    [
      "AssignmentTimeline",
      "Gepland tijdvenster",
      "Werkelijke uitvoering",
      "Ingepland",
      "In uitvoering",
      "Afgerond",
      "Rustige weergave van planning, uitvoering en afronding zonder",
      "timeZone: \"Europe/Amsterdam\"",
      "pre_scheduled",
      "Nog niet ingepland",
      "status === \"scheduled\" && scheduledDate",
    ],
    "assignment detail",
  );
  assert.doesNotMatch(
    detail,
    /participant_status|route_context|planning overload/u,
  );
  const phaseFunction = detail.slice(
    detail.indexOf("function customerTimelinePhase"),
    detail.indexOf("function AssignmentTimeline"),
  );
  assert.ok(
    !phaseFunction.trimEnd().endsWith('return "scheduled";\n}'),
    "assignment detail should not fall through to scheduled for pre-planning statuses",
  );
});

test("W09 documents, reports, commerce and support remain customer-visible only", () => {
  const documents = read("artifacts/klant-pwa/src/actions/documents.ts");
  const reports = read("artifacts/klant-pwa/src/actions/reports.ts");
  const detail = read(
    "artifacts/klant-pwa/src/app/(app)/opdrachten/[id]/page.tsx",
  );
  const tickets = read("artifacts/klant-pwa/src/actions/tickets.ts");

  assertIncludes(
    documents,
    [
      "eq(documentsTable.tenantId, identity.tenantId)",
      "eq(objectsTable.customerId, identity.customerId)",
      "eq(assignmentsTable.customerId, identity.customerId)",
      "getTenantBoundStoragePath",
      "createSignedUrl(storagePath, 3600)",
      "Deze download-link is verlopen",
    ],
    "document action",
  );
  assertIncludes(
    reports,
    [
      "customerVisibleSummary",
      "eq(assignmentsTable.customerId, identity.customerId)",
      "eq(assignmentsTable.tenantId, identity.tenantId)",
    ],
    "report action",
  );
  assertIncludes(
    detail,
    [
      "QUOTE_STATUS_LABEL",
      "INVOICE_STATUS_LABEL",
      "Ticket starten",
      "approvedPhotos",
    ],
    "assignment detail commerce/support",
  );
  assertIncludes(
    tickets,
    [
      "createMyCustomerTicket",
      "getMyCustomerTickets",
      "identity.customerId",
      "identity.tenantId",
    ],
    "ticket actions",
  );
});
