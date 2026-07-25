import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const assignmentsView = fs.readFileSync(
  path.join(
    root,
    "artifacts/backoffice/src/components/assignments/AssignmentsView.tsx",
  ),
  "utf8",
);

test("W07 assignments uses the canonical responsive data view", () => {
  assert.match(
    assignmentsView,
    /from "@\/components\/ui\/fieldgrid-data-view"/u,
  );
  assert.match(assignmentsView, /<FieldgridDataView/u);
  assert.match(assignmentsView, /renderMobileCard=/u);
  assert.match(assignmentsView, /context\.selectionControl/u);
  assert.match(
    assignmentsView,
    /preferenceKey="fieldgrid:assignments:data-view"/u,
  );
  assert.match(
    assignmentsView,
    /storageKey: "fieldgrid:assignments:saved-views"/u,
  );
  assert.doesNotMatch(
    assignmentsView,
    /<table|<thead|<tbody|<th(?:\s|>)|<tr(?:\s|>)|<td(?:\s|>)/u,
  );
  assert.doesNotMatch(assignmentsView, /style=\{/u);
  assert.doesNotMatch(assignmentsView, /(?:bg|text|border)-slate-/u);
});

test("W07 assignments preserves server query state and explicit filter apply", () => {
  for (const queryKey of [
    "search",
    "status",
    "priority",
    "reportStatus",
    "region",
    "sort",
    "dir",
    "page",
  ]) {
    assert.match(assignmentsView, new RegExp(`\\b${queryKey}:`, "u"));
  }

  assert.match(assignmentsView, /onSubmit=\{handleSearchSubmit\}/u);
  assert.match(
    assignmentsView,
    /applyFilter\("search", searchInput\.trim\(\)\)/u,
  );
  assert.match(assignmentsView, /onApply=\{applyDraftFilters\}/u);
  assert.match(assignmentsView, /onReset=\{resetFilters\}/u);
  assert.match(assignmentsView, /onValueChange=\{setDraftStatus\}/u);
  assert.match(assignmentsView, /onValueChange=\{setDraftPriority\}/u);
  assert.match(assignmentsView, /onValueChange=\{setDraftReportStatus\}/u);
  assert.match(assignmentsView, /onValueChange=\{setDraftRegion\}/u);
  assert.match(
    assignmentsView,
    /currentQuery: buildUrl\(\{ page: undefined \}\)/u,
  );
});

test("W07 assignments keeps permission-gated selection and cancellation mutations", () => {
  assert.match(assignmentsView, /selection=\{\s*canWrite/u);
  assert.match(assignmentsView, /bulkActions=\{\s*canWrite/u);
  assert.match(assignmentsView, /selectedIds: selected/u);
  assert.match(assignmentsView, /Promise\.all\(/u);
  assert.match(assignmentsView, /deleteAssignment\(id, reason\)/u);
  assert.match(assignmentsView, /setSelected\(new Set\(failed\.map/u);
  assert.match(
    assignmentsView,
    /confirmDisabled=\{!bulkCancelReason\.trim\(\) \|\| pending\}/u,
  );
  assert.match(assignmentsView, /\{canWrite \? \(\s*<>\s*<Sheet/u);
  assert.match(
    assignmentsView,
    /Reden voor annuleren van geselecteerde opdrachten/u,
  );
});

test("W07 assignments exposes the primary detail action and next workflow state", () => {
  assert.match(
    assignmentsView,
    /aria-label=\{`Open opdracht \$\{row\.title\}`\}/u,
  );
  assert.match(assignmentsView, />\s*Open\s*<ArrowRight/u);
  assert.match(assignmentsView, /const NEXT_WORKFLOW_STATUS/u);
  assert.match(assignmentsView, /id: "nextStep"/u);
  assert.match(
    assignmentsView,
    /id: "nextStep",\s*label: "Volgende stap",\s*hideable: false/u,
  );
  assert.match(assignmentsView, /Volgende stap:/u);
  assert.match(assignmentsView, /nextWorkflowLabel\(row\.status\)/u);
  assert.match(
    assignmentsView,
    /pagination=\{\{\s*page,\s*pageSize: PAGE_SIZE,\s*pageCount: totalPages,\s*total,/u,
  );
});
