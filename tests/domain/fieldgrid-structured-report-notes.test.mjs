import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

const migration = read(
  "lib/db/migrations/20260731170000_portal_user_onboarding.sql",
);
const schema = read("lib/db/src/schema/assignments.ts");
const actions = read("artifacts/personeel-pwa/src/actions/reports.ts");
const timeline = read(
  "artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/RapportageTimeline.tsx",
);
const queue = read(
  "artifacts/personeel-pwa/src/lib/offline/work-order-queue.ts",
);
const provider = read(
  "artifacts/personeel-pwa/src/components/PersonnelRealtimeOfflineProvider.tsx",
);

test("structured report notes use a versioned canonical JSON contract", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS structured_data jsonb/u);
  assert.match(migration, /structured_data @> '\{"version": 1\}'::jsonb/u);
  assert.match(schema, /export type StructuredReportNoteV1/u);
  assert.match(schema, /structuredData: jsonb\("structured_data"\)/u);
  assert.match(actions, /normalizeStructuredReportNote/u);
  assert.match(
    actions,
    /structuredData: assignmentReportNotesTable\.structuredData/u,
  );
  assert.match(actions, /structuredData,/u);
});

test("offline report synchronization preserves the structured payload", () => {
  assert.match(queue, /structuredData: StructuredReportNoteV1/u);
  assert.match(provider, /structuredData: action\.payload\.structuredData/u);
  assert.match(timeline, /payload: \{ body: trimmedBody, structuredData \}/u);
});

test("the report UI renders canonical JSON first and keeps legacy text fallback", () => {
  assert.match(
    timeline,
    /note\.structuredData[\s\S]*structuredReportForDisplay\(note\.structuredData\)[\s\S]*parseStructuredReportBody\(note\.body\)/u,
  );
  assert.match(timeline, /RadioGroupItem/u);
  assert.doesNotMatch(timeline, /role="radio"/u);
});
