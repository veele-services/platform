import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  new URL("../PlanningBoardView.tsx", import.meta.url),
  "utf8",
);

test("planboard exposes the queue and timeline as labelled keyboard regions", () => {
  assert.match(source, /aria-label="Openstaande werkbonnen"/u);
  assert.match(
    source,
    /<Sheet open=\{openQueueOpen\} onOpenChange=\{setOpenQueueOpen\}>/u,
  );
  assert.match(source, /<SheetTrigger asChild>/u);
  assert.match(source, /<SheetContent side="right"/u);
  assert.match(
    source,
    /aria-label=\{`Planningtijdlijn voor \$\{person\.firstName\} \$\{person\.lastName\}\.[^`]+`\}/u,
  );
  assert.match(source, /tabIndex=\{0\}/u);
});

test("open assignment cards support keyboard selection and drag semantics", () => {
  assert.match(source, /role="button"/u);
  assert.match(source, /aria-pressed=\{selected\}/u);
  assert.match(
    source,
    /aria-grabbed=\{\s*canWrite &&\s*dragging\?\.assignmentId === assignment\.id\s*\}/u,
  );
  assert.match(
    source,
    /onKeyDown=\{\(e\) =>\s*handleAssignmentCardKeyDown\(e, assignment, selected\)\s*\}/u,
  );
  assert.match(source, /e\.key === "Enter" \|\| e\.key === " "/u);
  assert.match(source, /e\.key === "Escape"/u);
});

test("scheduled appointment blocks describe planned and actual timing without losing planned values", () => {
  assert.match(source, /appointmentTimingLabel\(assignment\)/u);
  assert.match(
    source,
    /Gepland \$\{formatPlanboardTimeRange\(assignment\.scheduledStart, assignment\.scheduledEnd\)\}/u,
  );
  assert.match(source, /planboardDisplayWindow\(assignment\)\.label/u);
  assert.match(
    source,
    /assignment\.effectiveStart !== assignment\.scheduledStart/u,
  );
  assert.match(
    source,
    /assignment\.effectiveEnd !== assignment\.scheduledEnd/u,
  );
  assert.match(source, /title=\{appointmentTimingLabel\(assignment\)\}/u);
  assert.match(
    source,
    /aria-label=\{`\$\{assignment\.code\}: \$\{displayWorkOrderTitle\(assignment\.title\)\}\. \$\{appointmentTimingLabel\(assignment\)\}/u,
  );
});
