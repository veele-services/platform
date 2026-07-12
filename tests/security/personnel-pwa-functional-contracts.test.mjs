import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

function sectionBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing marker ${startMarker}`);
  const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : -1;
  return source.slice(start, end === -1 ? undefined : end);
}

function functionBody(source, name) {
  const marker = `export async function ${name}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Missing function ${name}`);

  let open = -1;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] !== "{") continue;
    const next = source[index + 1];
    if (next === "\r" || next === "\n") {
      open = index;
      break;
    }
  }

  assert.notEqual(open, -1, `Missing body opening brace for ${name}`);

  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(open, index + 1);
  }

  assert.fail(`Missing closing brace for ${name}`);
}

test("current selected interest response reproduces the work-order black hole", () => {
  const backofficeAssignments = read("artifacts/backoffice/src/app/actions/assignments.ts");
  const personnelAssignments = read("artifacts/personeel-pwa/src/actions/assignments.ts");
  const openAssignments = read("artifacts/personeel-pwa/src/actions/open-assignments.ts");

  const markInterestCandidate = functionBody(backofficeAssignments, "markInterestCandidate");
  const getMyAssignments = functionBody(personnelAssignments, "getMyAssignments");
  const applyForAssignment = functionBody(openAssignments, "applyForAssignment");

  assert.match(markInterestCandidate, /\.set\(\{\s*status,/u);
  assert.match(markInterestCandidate, /selectedAt:\s*status === "selected" \|\| status === "reserve"/u);
  assert.doesNotMatch(markInterestCandidate, /\.insert\(assignmentPersonnelTable\)/u);
  assert.doesNotMatch(markInterestCandidate, /\.update\(assignmentPersonnelTable\)/u);
  assert.doesNotMatch(markInterestCandidate, /status:\s*"scheduled"/u);

  assert.match(getMyAssignments, /\.from\(assignmentPersonnelTable\)/u);
  assert.match(getMyAssignments, /eq\(assignmentPersonnelTable\.status,\s*"assigned"\)/u);

  assert.match(openAssignments, /\["interested", "selected", "reserve", "confirmed"\]\.includes/u);
  assert.match(applyForAssignment, /\["interested", "selected", "reserve", "confirmed"\]\.includes\(interestResponse\.status\)/u);
});

test("current assignment scheduling is tied to assignment_personnel linking, not selected interest", () => {
  const backofficeAssignments = read("artifacts/backoffice/src/app/actions/assignments.ts");
  const assignPersonnel = functionBody(backofficeAssignments, "assignPersonnel");
  const markInterestCandidate = functionBody(backofficeAssignments, "markInterestCandidate");

  assert.match(assignPersonnel, /\.insert\(assignmentPersonnelTable\)/u);
  assert.match(assignPersonnel, /assignedCount/u);
  assert.match(assignPersonnel, /status:\s*"scheduled"/u);

  assert.doesNotMatch(markInterestCandidate, /assignedCount/u);
  assert.doesNotMatch(markInterestCandidate, /status:\s*"scheduled"/u);
});

test("personnel PWA still contains first-row user identity lookups outside the host-bound resolver", () => {
  const riskyFiles = [
    "artifacts/personeel-pwa/src/actions/reports.ts",
    "artifacts/personeel-pwa/src/actions/hours.ts",
    "artifacts/personeel-pwa/src/actions/extra-work.ts",
    "artifacts/personeel-pwa/src/actions/materials.ts",
    "artifacts/personeel-pwa/src/actions/inventory.ts",
    "artifacts/personeel-pwa/src/actions/notifications.ts",
    "artifacts/personeel-pwa/src/actions/messages.ts",
    "artifacts/personeel-pwa/src/actions/documents.ts",
  ];

  for (const path of riskyFiles) {
    const source = read(path);
    assert.match(source, /user_id|personnelTable\.userId/u, `${path} should show user-based personnel lookup evidence`);
    assert.match(source, /\.limit\(1\)|\.single\(\)/u, `${path} should show first-row/single-row lookup evidence`);
  }
});

test("weekly availability replacement remains destructive and non-transactional", () => {
  const availability = read("artifacts/personeel-pwa/src/actions/availability.ts");
  const saveAvailabilityWindows = functionBody(availability, "saveAvailabilityWindows");

  assert.match(saveAvailabilityWindows, /\.delete\(\)/u);
  assert.match(saveAvailabilityWindows, /\.insert\(/u);
  assert.ok(saveAvailabilityWindows.indexOf(".delete()") < saveAvailabilityWindows.indexOf(".insert("));
  assert.doesNotMatch(saveAvailabilityWindows, /\.transaction\(/u);
});

test("offline queue replay lacks durable tenant/user scoping and relies on tab-local locking", () => {
  const queue = read("artifacts/personeel-pwa/src/lib/offline/work-order-queue.ts");
  const provider = read("artifacts/personeel-pwa/src/components/PersonnelRealtimeOfflineProvider.tsx");

  assert.match(queue, /const QUEUE_KEY = "veele-personeel-offline-work-order-actions-v1"/u);
  assert.doesNotMatch(queue, /tenantId:\s*string/u);
  assert.doesNotMatch(queue, /personnelId:\s*string/u);
  assert.match(provider, /const syncingRef = useRef\(false\)/u);
  assert.doesNotMatch(provider, /navigator\.locks|BroadcastChannel|localStorage\.setItem\([^,]*lock/u);
});

test("service-worker push click accepts absolute http URLs while foreground toast rejects cross-origin hrefs", () => {
  const serviceWorker = read("artifacts/personeel-pwa/public/sw.js");
  const provider = read("artifacts/personeel-pwa/src/components/PersonnelRealtimeOfflineProvider.tsx");

  assert.ok(serviceWorker.includes("if (/^https?:\\/\\//i.test(href)) return href;"));
  assert.match(serviceWorker, /clients\.openWindow\(targetUrl\)/u);

  assert.match(provider, /url\.origin !== window\.location\.origin/u);
  assert.match(provider, /return null/u);
});

test("audit register tracks required personnel PWA gaps", () => {
  const register = JSON.parse(read("docs/readiness/personnel-pwa-gap-register.json"));
  const ids = new Set(register.gaps.map((gap) => gap.id));

  for (const id of [
    "PPWA-GAP-001",
    "PPWA-GAP-002",
    "PPWA-GAP-003",
    "PPWA-GAP-005",
    "PPWA-GAP-007",
    "PPWA-GAP-010",
    "PPWA-GAP-011",
    "PPWA-GAP-012",
  ]) {
    assert.ok(ids.has(id), `Missing ${id}`);
  }

  assert.equal(register.metadata.liveServicesAccessed, false);
  assert.equal(register.metadata.migrationsChanged, false);
  assert.equal(register.metadata.workflowFilesChanged, false);
});
