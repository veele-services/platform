import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("phase 5 turns the customer dashboard into summary action and focus sections", () => {
  const dashboard = read("artifacts/klant-pwa/src/app/(app)/page.tsx");

  assert.match(dashboard, /function SummaryStrip/u);
  assert.match(dashboard, /function ActionInbox/u);
  assert.match(dashboard, /function FocusPanel/u);
  assert.match(dashboard, /function SecondaryCard/u);
  assert.match(dashboard, /<SummaryStrip/u);
  assert.match(dashboard, /<ActionInbox items=\{visibleActionItems\}/u);
  assert.match(dashboard, /title="Opdrachten"/u);
  assert.match(dashboard, /title="Financieel"/u);
  assert.match(dashboard, /title="Support"/u);
  assert.doesNotMatch(dashboard, /function StatCard/u);
  assert.doesNotMatch(dashboard, /function QuickAction/u);
});

test("phase 5 keeps action inbox bounded and pushes secondary widgets lower", () => {
  const dashboard = read("artifacts/klant-pwa/src/app/(app)/page.tsx");

  assert.match(dashboard, /const visibleActionItems = actionItems\.slice\(0, 5\)/u);
  assert.match(dashboard, /Maximaal vijf punten/u);

  const focusIndex = dashboard.indexOf("<FocusPanel");
  const secondaryIndex = dashboard.indexOf("<SecondaryCard");
  assert.ok(focusIndex > -1, "dashboard must render focus panels");
  assert.ok(secondaryIndex > -1, "dashboard must render secondary cards");
  assert.ok(focusIndex < secondaryIndex, "secondary widgets should render below focus panels");

  assert.match(dashboard, /recentDocuments/u);
  assert.match(dashboard, /recentReports/u);
  assert.match(dashboard, /recentObjects/u);
});

test("phase 5 uses tenant branding and removes hardcoded vendor dashboard copy", () => {
  const dashboard = read("artifacts/klant-pwa/src/app/(app)/page.tsx");

  assert.match(dashboard, /getTenantBranding/u);
  assert.match(dashboard, /const tenantName = branding\.displayName/u);
  assert.match(dashboard, /\{tenantName\} klantportaal/u);
  assert.doesNotMatch(dashboard, /Veele Services/u);
  assert.match(dashboard, /greetingForNow/u);
});

test("phase 5 makes urgent assignment requests explicit", () => {
  const dashboard = read("artifacts/klant-pwa/src/app/(app)/page.tsx");
  const requestPage = read("artifacts/klant-pwa/src/app/(app)/opdrachten/aanvragen/page.tsx");
  const requestForm = read("artifacts/klant-pwa/src/app/(app)/opdrachten/aanvragen/RequestAssignmentForm.tsx");

  assert.match(dashboard, /href="\/opdrachten\/aanvragen\?prioriteit=urgent"/u);
  assert.match(dashboard, /Urgente opdracht/u);
  assert.doesNotMatch(dashboard, /Spoedaanvraag/u);

  assert.match(requestPage, /searchParams: Promise<\{ prioriteit\?: string \}>/u);
  assert.match(requestPage, /initialPriorityFromSearch\(prioriteit\)/u);
  assert.match(requestForm, /initialPriority\?: "low" \| "normal" \| "high" \| "urgent"/u);
  assert.match(
    requestForm,
    /useState<\s*"low"\s*\|\s*"normal"\s*\|\s*"high"\s*\|\s*"urgent"\s*>\(initialPriority\)/u,
  );
});
