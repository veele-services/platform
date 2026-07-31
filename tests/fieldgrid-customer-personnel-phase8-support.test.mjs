import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("phase 8 turns customer tickets into a contextual support inbox", () => {
  const source = read("artifacts/klant-pwa/src/app/(app)/meldingen/tickets/page.tsx");

  for (const marker of [
    "TicketContextFilter",
    "TicketDateFilter",
    "TOPICS",
    "PortalFilterSheet",
    "PortalActiveFilterChips",
    "PortalDataList",
    "Supportstatus",
  ]) {
    assert.match(source, new RegExp(marker, "u"));
  }

  assert.doesNotMatch(source, /SLA-tijden/u);

  for (const context of ['context: "object"', 'context: "assignment"', 'context: "invoice"', 'context: "general"']) {
    assert.match(source, new RegExp(context, "u"));
  }

  assert.match(source, /name="context"/u);
  assert.match(source, /name="date"/u);
  assert.match(source, /matchesTicketContext/u);
  assert.match(source, /matchesTicketDate/u);
});

test("phase 8 pre-fills the new ticket flow and explains attachment handling", () => {
  const form = read("artifacts/klant-pwa/src/app/(app)/meldingen/tickets/NewTicketForm.tsx");
  const dashboard = read("artifacts/klant-pwa/src/app/(app)/page.tsx");
  const objectDetail = read("artifacts/klant-pwa/src/app/(app)/objecten/[id]/page.tsx");
  const assignmentDetail = read("artifacts/klant-pwa/src/app/(app)/opdrachten/[id]/page.tsx");

  for (const marker of [
    "initialDepartment",
    "initialPriority",
    "initialSubject",
    "initialBody",
    "contextLabel",
    "Bijlagen",
    "createMyCustomerTicket",
  ]) {
    assert.match(form, new RegExp(marker, "u"));
  }

  assert.match(dashboard, /supportPrefillHref/u);
  assert.match(dashboard, /context: "general"/u);
  assert.match(dashboard, /Nieuw ticket/u);

  assert.match(objectDetail, /supportHrefForObject/u);
  assert.match(objectDetail, /context: "object"/u);
  assert.match(objectDetail, /Vraag over object/u);

  assert.match(assignmentDetail, /supportHrefForAssignment/u);
  assert.match(assignmentDetail, /context: "assignment"/u);
  assert.match(assignmentDetail, /Vraag over deze opdracht/u);
});

test("phase 8 makes ticket detail read as a support conversation", () => {
  const detail = read("artifacts/klant-pwa/src/app/(app)/meldingen/tickets/[id]/page.tsx");
  const actions = read("artifacts/klant-pwa/src/app/(app)/meldingen/tickets/[id]/TicketActions.tsx");

  for (const marker of [
    "PortalPageShell",
    "supportStatusCopy",
    "ReplyForm",
    "TicketActions",
    "Paperclip",
    "Status en SLA",
    "SLA-statussen",
    "Bijlagen",
  ]) {
    assert.match(detail, new RegExp(marker, "u"));
  }

  assert.match(actions, /variant\?: "light" \| "solid"/u);
  assert.match(actions, /closeMyCustomerTicket/u);
  assert.match(actions, /reopenMyCustomerTicket/u);
});

test("phase 8 keeps customer notifications mapped to ticket detail routes", () => {
  const routes = read("lib/db/src/portal-routes.ts");
  const notifications = read("artifacts/klant-pwa/src/actions/notifications.ts");
  const tickets = read("artifacts/klant-pwa/src/actions/tickets.ts");

  assert.match(routes, /ticket: \(id: string\) => `\/meldingen\/tickets\/\$\{segment\(id\)\}`/u);
  assert.match(notifications, /sanitizeCustomerPortalHref\(row\.href\)/u);
  assert.match(tickets, /backofficeRoutes\.customerTicket/u);
});
