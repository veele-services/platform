import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(path, "utf8");

const coreForms = [
  "artifacts/backoffice/src/components/customers/CustomerForm.tsx",
  "artifacts/backoffice/src/components/objects/ObjectForm.tsx",
  "artifacts/backoffice/src/components/personnel/PersonnelForm.tsx",
  "artifacts/backoffice/src/components/assignments/AssignmentForm.tsx",
  "artifacts/backoffice/src/components/task-codes/TaskCodeForm.tsx",
];

test("core forms use sticky actions and an unsaved-changes guard", () => {
  for (const path of coreForms) {
    const source = read(path);
    assert.match(source, /FormActions/u, path);
    assert.match(source, /useUnsavedChangesGuard/u, path);
    assert.doesNotMatch(source, /grid grid-cols-[23] gap/u, path);
  }
});

test("known action sheets retain full mobile width", () => {
  for (const path of [
    "artifacts/backoffice/src/components/customers/CustomersView.tsx",
    "artifacts/backoffice/src/components/objects/ObjectsView.tsx",
    "artifacts/backoffice/src/components/personnel/PersonnelDetailActions.tsx",
    "artifacts/backoffice/src/components/assignments/PlanningDayView.tsx",
    "artifacts/backoffice/src/components/task-codes/TaskCodesView.tsx",
  ]) {
    assert.doesNotMatch(read(path), /className="w-\[(?:360|440|540|560)px\]/u, path);
  }
});

test("bulk status mutations use the responsive canonical bar and confirmation", () => {
  for (const path of [
    "artifacts/backoffice/src/components/customers/CustomersView.tsx",
    "artifacts/backoffice/src/components/personnel/PersonnelView.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /BulkActionBar/u, path);
    assert.match(source, /bulkDeactivateOpen/u, path);
    assert.match(source, /TenantConfirmDialog/u, path);
  }

  const objects = read(
    "artifacts/backoffice/src/components/objects/ObjectsView.tsx",
  );
  const dataView = read(
    "artifacts/backoffice/src/components/ui/fieldgrid-data-view.tsx",
  );
  assert.match(objects, /FieldgridDataView/u);
  assert.match(objects, /bulkActions=/u);
  assert.match(dataView, /BulkActionBar/u);
  assert.match(objects, /bulkDeactivateOpen/u);
  assert.match(objects, /TenantConfirmDialog/u);
});

test("assignment times are validated in client and server paths", () => {
  const form = read(
    "artifacts/backoffice/src/components/assignments/AssignmentForm.tsx",
  );
  const actions = read(
    "artifacts/backoffice/src/app/actions/assignments.ts",
  );
  assert.match(form, /TimeRangeField/u);
  assert.match(form, /validateTimeRange/u);
  assert.equal((actions.match(/validateTimeRange\(/gu) ?? []).length, 2);
});
