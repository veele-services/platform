import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../PlanningBoardView.tsx", import.meta.url), "utf8");

test("planboard exposes the queue and timeline as labelled keyboard regions", () => {
  assert.match(source, /aria-label="Openstaande werkbonnen"/u);
  assert.match(source, /aria-expanded=\{openQueueOpen\}/u);
  assert.match(source, /aria-controls="planning-board-open-queue"/u);
  assert.match(source, /role="dialog"/u);
  assert.match(source, /aria-modal="false"/u);
  assert.match(source, /aria-label=\{`Planningtijdlijn voor \$\{person\.firstName\} \$\{person\.lastName\}`\}/u);
  assert.match(source, /tabIndex=\{0\}/u);
});

test("open assignment cards support keyboard selection and drag semantics", () => {
  assert.match(source, /role="button"/u);
  assert.match(source, /aria-pressed=\{selected\}/u);
  assert.match(source, /aria-grabbed=\{canWrite && dragging\?\.assignmentId === assignment\.id\}/u);
  assert.match(source, /onKeyDown=\{\(e\) => handleAssignmentCardKeyDown\(e, assignment, selected\)\}/u);
  assert.match(source, /e\.key === "Enter" \|\| e\.key === " "/u);
  assert.match(source, /e\.key === "Escape"/u);
});

test("scheduled appointment blocks describe planned and actual timing without losing planned values", () => {
  assert.match(source, /appointmentTimingLabel\(assignment\)/u);
  assert.match(source, /Gepland \$\{formatPlanboardTimeRange\(assignment\.scheduledStart, assignment\.scheduledEnd\)\}/u);
  assert.match(source, /Werkelijk gestart/u);
  assert.match(source, /Werkelijk gereed/u);
  assert.match(source, /title=\{appointmentTimingLabel\(assignment\)\}/u);
  assert.match(source, /aria-label=\{`\$\{assignment\.code\}: \$\{displayWorkOrderTitle\(assignment\.title\)\}\. \$\{appointmentTimingLabel\(assignment\)\}`\}/u);
});
