import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("phase 13 makes open assignments filterable and scanable", () => {
  const page = read("artifacts/personeel-pwa/src/app/(app)/openstaand/page.tsx");

  for (const marker of [
    "type OpenAssignmentFilterStatus",
    "type OpenAssignmentPriorityFilter",
    "function OpenAssignmentsCommandBar",
    "function filterOpenAssignments",
    "function responseState",
    'name="q"',
    'name="status"',
    'name="priority"',
    "Nog te reageren",
    "Reacties",
    "md:grid-cols-2 xl:grid-cols-3",
  ]) {
    assert.match(page, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  }
});

test("phase 13 replaces open assignment confirmations with bottom sheets and feedback", () => {
  const applyButton = read("artifacts/personeel-pwa/src/app/(app)/openstaand/ApplyButton.tsx");

  for (const marker of [
    "type SheetAction",
    "function ResponseBottomSheet",
    'role="dialog"',
    'aria-modal="true"',
    "Vraag via bericht",
    "setFeedback",
    "Ticket bekijken",
    "askQuestionAboutAssignment",
  ]) {
    assert.match(applyButton, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  }

  assert.doesNotMatch(applyButton, /window\.confirm/u);
  assert.doesNotMatch(applyButton, /\bconfirm\s*\(/u);
});

test("phase 13 makes personnel messages read as an inbox", () => {
  const page = read("artifacts/personeel-pwa/src/app/(app)/berichten/page.tsx");

  for (const marker of [
    "function TicketSummaryStrip",
    "function TicketInboxCard",
    "function TicketListSection",
    "Actie nodig",
    "Lopende gesprekken",
    "Afgerond",
    "md:grid-cols-[minmax(0,1fr)_22rem]",
    "NewTicketForm",
  ]) {
    assert.match(page, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  }
});

test("phase 13 normalizes message detail into a conversation timeline", () => {
  const detail = read("artifacts/personeel-pwa/src/app/(app)/berichten/[id]/page.tsx");

  for (const marker of [
    "function MessageBubble",
    "function ConversationTimeline",
    "function TicketContextPanel",
    "Gesprekstijdlijn",
    "Personeelsapp",
    "md:grid-cols-[minmax(0,1fr)_22rem]",
    "ReplyForm",
  ]) {
    assert.match(detail, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  }
});

test("phase 13 keeps personnel notification links sanitized for the messages route", () => {
  const notifications = read("artifacts/personeel-pwa/src/actions/notifications.ts");
  const messages = read("artifacts/personeel-pwa/src/actions/messages.ts");

  assert.match(notifications, /sanitizePersonnelPortalHref\(row\.href\)/u);
  assert.match(messages, /revalidatePath\("\/berichten"\)/u);
  assert.match(messages, /revalidatePath\(`\/berichten\/\$\{ticketId\}`\)/u);
  assert.doesNotMatch(notifications, /\/tickets\/personnel/u);
});
