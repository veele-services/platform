import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const customersView = fs.readFileSync(
  path.join(
    root,
    "artifacts/backoffice/src/components/customers/CustomersView.tsx",
  ),
  "utf8",
);

function dataViewColumns(source) {
  const start = source.indexOf(
    "const columns: FieldgridDataViewColumn<CustomerRow>[] = [",
  );
  const end = source.indexOf("\n  ];", start);
  assert.ok(start >= 0 && end > start, "customer DataView columns exist");

  const block = source.slice(start, end);
  const starts = [...block.matchAll(/\n    \{\n      id: "([^"]+)",/gu)];
  return starts.map((match, index) => ({
    id: match[1],
    source: block.slice(match.index, starts[index + 1]?.index ?? block.length),
  }));
}

test("customers uses the canonical responsive data view without duplicate table helpers", () => {
  assert.match(customersView, /<FieldgridDataView/u);
  assert.match(
    customersView,
    /preferenceKey="fieldgrid:customers:data-view"/u,
  );
  assert.match(
    customersView,
    /storageKey: "fieldgrid:customers:saved-views"/u,
  );
  assert.match(customersView, /selection=\{/u);
  assert.match(customersView, /bulkActions=\{/u);
  assert.match(customersView, /pagination=\{\{/u);
  assert.match(customersView, /renderMobileCard=/u);
  assert.match(customersView, /context\.selectionControl/u);

  assert.doesNotMatch(
    customersView,
    /<table|<thead|<tbody|<th(?:\s|>)|<tr(?:\s|>)|<td(?:\s|>)/u,
  );
  assert.doesNotMatch(customersView, /function SortHeader/u);
  assert.doesNotMatch(customersView, /function toggle(All|One)/u);
  assert.doesNotMatch(
    customersView,
    /from "@\/components\/ui\/bulk-action-bar"|<BulkActionBar/u,
  );
  assert.doesNotMatch(
    customersView,
    /from "@\/components\/ui\/checkbox"|<Checkbox/u,
  );
  assert.doesNotMatch(customersView, /style=\{/u);
  assert.doesNotMatch(customersView, /#[0-9A-Fa-f]{3,8}\b/u);
  assert.doesNotMatch(customersView, /(?:bg|text|border)-slate-/u);
  assert.doesNotMatch(customersView, /ChevronLeft|ChevronRight/u);
});

test("customer data view preserves table fields and exposes creation date as a preference", () => {
  const columns = dataViewColumns(customersView);
  assert.deepEqual(
    columns.map(({ id }) => id),
    [
      "code",
      "name",
      "sector",
      "customerType",
      "city",
      "accountManager",
      "createdAt",
      "status",
      "actions",
    ],
  );

  const createdAt = columns.find(({ id }) => id === "createdAt");
  assert.ok(createdAt);
  assert.match(createdAt.source, /sortable: true/u);
  assert.match(createdAt.source, /hiddenByDefault: true/u);
});

test("customer text filters navigate only when submitted or applied", () => {
  assert.match(customersView, /onSubmit=\{handleSearchSubmit\}/u);
  assert.match(
    customersView,
    /applyFilter\("search", searchInput\.trim\(\)\)/u,
  );
  assert.match(customersView, /onApply=\{applyAdvancedFilters\}/u);
  assert.match(customersView, /onReset=\{clearAdvancedFilters\}/u);
  assert.match(
    customersView,
    /onChange=\{\(e\) => setFilterCity\(e\.target\.value\)\}/u,
  );
  assert.match(
    customersView,
    /onChange=\{\(e\) => setFilterCountry\(e\.target\.value\)\}/u,
  );
  assert.doesNotMatch(
    customersView,
    /onChange=\{[^}]*applyFilter\("(?:search|city|country)"/u,
  );
});

test("customer data view preserves URL filters, exports, permissions, and actions", () => {
  for (const queryParam of [
    "search",
    "sectorId",
    "status",
    "customerTypeId",
    "city",
    "country",
    "accountManagerId",
    "dateFrom",
    "dateTo",
    "sort",
    "dir",
    "page",
  ]) {
    assert.match(customersView, new RegExp(`${queryParam}:`, "u"), queryParam);
  }

  for (const preservedContract of [
    "exportCustomers",
    "exportCustomersPdf",
    "bulkSetCustomerStatus",
    "setCustomerStatus",
    "deleteCustomer",
    "CustomerForm",
    "canWriteNotes",
    "TenantActionMenu",
    "TenantConfirmDialog",
  ]) {
    assert.match(customersView, new RegExp(preservedContract, "u"));
  }

  assert.match(customersView, /selection=\{\s*canWrite/u);
  assert.match(customersView, /bulkActions=\{\s*canWrite/u);
  assert.match(customersView, /savedViews=\{\{/u);
});
