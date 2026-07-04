import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should contain ${phrase}`);
  }
}

test("phase 8 creates platform-scoped ticket tables with links, notes, SLA and RLS", () => {
  const schema = read("lib/db/src/schema/platform-tickets.ts");
  const migration = read("lib/db/migrations/075_platform_ticketing.sql");
  const exports = read("lib/db/src/schema/index.ts");

  assertContains(
    schema,
    [
      "platformTicketsTable",
      "platformTicketNotesTable",
      "PLATFORM_TICKET_TYPES",
      "PLATFORM_TICKET_STATUSES",
      "tenantSubscriptionsTable",
      "tenantDomainsTable",
      "supportAccessGrantsTable",
      "auditLogTable",
      "smokeRunId",
      "slaDueAt",
    ],
    "platform ticket schema",
  );
  assertContains(
    migration,
    [
      "CREATE TABLE IF NOT EXISTS platform_tickets",
      "CREATE TABLE IF NOT EXISTS platform_ticket_notes",
      "platform_tickets_type_check",
      "platform_tickets_status_check",
      "platform_tickets_priority_check",
      "platform_tickets_open_domain_idx",
      "ALTER TABLE platform_tickets ENABLE ROW LEVEL SECURITY",
      "ALTER TABLE platform_ticket_notes ENABLE ROW LEVEL SECURITY",
    ],
    "platform ticket migration",
  );
  assert.ok(exports.includes('export * from "./platform-tickets";'), "schema index should export platform tickets");
});

test("phase 8 exposes ticket actions with platform audit and domain failure automation", () => {
  const actions = read("artifacts/backoffice/src/app/actions/platform-tickets.ts");
  const tenantActions = read("artifacts/backoffice/src/app/actions/platform-tenants.ts");

  assertContains(
    actions,
    [
      "listPlatformTickets",
      "getPlatformTicketDetail",
      "createPlatformTicket",
      "updatePlatformTicket",
      "addPlatformTicketNote",
      "ensurePlatformTicketForDomainFailure",
      "writePlatformTicketAudit",
      "platform_ticket_created",
      "platform_ticket_updated",
      "platform_ticket_note_added",
      "auditLogTable",
    ],
    "platform ticket actions",
  );
  assertContains(
    tenantActions,
    [
      "maybeOpenDomainVerificationTicket",
      "ensurePlatformTicketForDomainFailure",
      "failureCount < 3",
      "tenantDomainChecksTable.status",
      "platform_ticket_created_from_domain_failure",
    ],
    "tenant domain ticket automation",
  );
});

test("phase 8 renders mobile-friendly ticket list and detail surfaces", () => {
  const listPage = read("artifacts/backoffice/src/app/(platform)/platform/tickets/page.tsx");
  const detailPage = read("artifacts/backoffice/src/app/(platform)/platform/tickets/[ticketId]/page.tsx");

  assertContains(
    listPage,
    [
      "Platformtickets",
      "Nieuw platformticket",
      "Ticketlijst",
      "grid gap-3",
      "sm:grid-cols-2",
      "xl:grid-cols-4",
      "createPlatformTicket",
      "updatePlatformTicket",
      "/platform/tickets/${ticket.id}",
    ],
    "ticket list page",
  );
  assertContains(
    detailPage,
    [
      "getPlatformTicketDetail",
      "addPlatformTicketNote",
      "Interne notities",
      "Koppelingen",
      "Ticket bijwerken",
      "grid gap-5",
      "lg:grid-cols",
    ],
    "ticket detail page",
  );
});
