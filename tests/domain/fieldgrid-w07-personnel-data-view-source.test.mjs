import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const personnelView = read(
  "artifacts/backoffice/src/components/personnel/PersonnelView.tsx",
);
const personnelPage = read(
  "artifacts/backoffice/src/app/(dashboard)/personnel/page.tsx",
);
const personnelWidgets = read(
  "artifacts/backoffice/src/components/personnel/PersonnelWidgets.tsx",
);

function dataViewColumns(source) {
  const start = source.indexOf(
    "const columns: FieldgridDataViewColumn<PersonnelRow>[] = [",
  );
  const end = source.indexOf("\n  ];", start);
  assert.ok(start >= 0 && end > start, "personnel DataView columns exist");

  const block = source.slice(start, end);
  const starts = [...block.matchAll(/\n    \{\n      id: "([^"]+)",/gu)];
  return starts.map((match, index) => ({
    id: match[1],
    source: block.slice(match.index, starts[index + 1]?.index ?? block.length),
  }));
}

test("W07 personnel consumes the canonical DataView without duplicate list controls", () => {
  assert.match(personnelView, /from "@\/components\/ui\/fieldgrid-data-view"/u);
  assert.match(personnelView, /<FieldgridDataView/u);
  assert.doesNotMatch(
    personnelView,
    /<table|<thead|<tbody|<th(?:\s|>)|<Checkbox|<button/u,
  );
  assert.doesNotMatch(personnelView, /BulkActionBar|SortHeader/u);
  assert.doesNotMatch(personnelView, /ChevronLeft|ChevronRight/u);
});

test("W07 personnel defaults to operational columns and keeps secondary fields selectable", () => {
  const columns = dataViewColumns(personnelView);
  const visibleByDefault = columns
    .filter((column) => !/hiddenByDefault:\s*true/u.test(column.source))
    .map((column) => column.id);

  assert.deepEqual(visibleByDefault, [
    "lastName",
    "role",
    "region",
    "availability",
    "portal",
    "status",
    "actions",
  ]);

  for (const secondaryColumn of [
    "code",
    "email",
    "personnelType",
    "sector",
    "certificates",
    "createdAt",
  ]) {
    const column = columns.find(({ id }) => id === secondaryColumn);
    assert.ok(column, `missing secondary column ${secondaryColumn}`);
    assert.match(column.source, /hiddenByDefault:\s*true/u);
  }
});

test("W07 personnel preserves server URL filters behind explicit apply seams", () => {
  for (const queryKey of [
    "search",
    "roleId",
    "sectorId",
    "region",
    "status",
    "personnelType",
    "sort",
    "dir",
    "page",
  ]) {
    assert.match(
      personnelView,
      new RegExp(`\\b${queryKey}:`, "u"),
      `missing URL query seam ${queryKey}`,
    );
  }

  assert.match(personnelView, /onSubmit=\{handleSearchSubmit\}/u);
  assert.match(
    personnelView,
    /applyFilter\("search", searchInput\.trim\(\)\)/u,
  );
  assert.match(personnelView, /onApply=\{applyDraftFilters\}/u);
  assert.match(personnelView, /setDraftRegion\(event\.target\.value\)/u);
  assert.match(
    personnelView,
    /region:\s*draftRegion\.trim\(\) \|\| undefined/u,
  );
  assert.doesNotMatch(
    personnelView,
    /onChange=\{\(event\) => applyFilter\("region"/u,
  );
});

test("W07 personnel adds saved views, preferences, semantic tokens and explicit quick view", () => {
  assert.match(personnelView, /preferenceKey="fieldgrid:personnel:data-view"/u);
  assert.match(personnelView, /storageKey: "fieldgrid:personnel:saved-views"/u);
  assert.match(
    personnelView,
    /currentQuery: buildUrl\(\{ page: undefined \}\)/u,
  );
  assert.match(
    personnelView,
    /onApplyQuery: \(query\) =>[\s\S]*router\.replace/u,
  );
  assert.match(personnelView, /label: "Snel bekijken"/u);
  assert.match(personnelView, /<SlimProfielPanel/u);
  assert.match(personnelView, /<Sheet[\s\S]*slimProfiel/u);

  for (const semanticToken of [
    "bg-success",
    "bg-warning",
    "bg-info",
    "bg-danger",
    "bg-muted",
    "text-muted-foreground",
  ]) {
    assert.match(personnelView, new RegExp(semanticToken, "u"));
  }
  assert.doesNotMatch(personnelView, /style=\{/u);
  assert.doesNotMatch(personnelView, /#[0-9A-Fa-f]{3,8}\b/u);
});

test("W07 personnel preserves permissions, mutations, sheets, and surrounding staffing widgets", () => {
  for (const behavior of [
    "bulkSetPersonnelStatus",
    "setPersonnelStatus",
    "deletePersonnel",
    "PersonnelForm",
    "TenantConfirmDialog",
    "renderMobileCard",
    "pagination={{",
    "canWrite",
  ]) {
    assert.match(
      personnelView,
      new RegExp(behavior.replace(/[{}]/gu, "\\$&"), "u"),
      `missing personnel behavior ${behavior}`,
    );
  }

  assert.match(personnelPage, /hasPermission\("personnel", "read"\)/u);
  assert.match(personnelPage, /hasPermission\("personnel", "write"\)/u);
  assert.match(personnelPage, /listPersonnelRegionAware\(/u);
  assert.match(personnelPage, /<PersonnelStatBar/u);
  assert.match(personnelPage, /<PersonnelView/u);
  assert.match(personnelPage, /<PersonnelWidgets/u);
  assert.match(personnelWidgets, /<FlexpoolWidget\s+rows=\{flexpoolRows\}/u);
  assert.match(personnelWidgets, /<CapacityWidget\s+rows=\{capacityRows\}/u);
});
