import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const dataView = fs.readFileSync(
  path.join(
    root,
    "artifacts/backoffice/src/components/ui/fieldgrid-data-view.tsx",
  ),
  "utf8",
);

test("FieldgridDataView composes canonical table and Radix controls", () => {
  for (const requiredImport of [
    "@/components/ui/table",
    "@/components/ui/checkbox",
    "@/components/ui/dropdown-menu",
    "@/components/ui/popover",
    "@/components/ui/toggle-group",
    "@/components/ui/skeleton",
    "@/components/ui/empty",
  ]) {
    assert.match(dataView, new RegExp(requiredImport.replaceAll("/", "\\/")));
  }
  assert.doesNotMatch(dataView, /@radix-ui\/react-/);
  assert.doesNotMatch(dataView, /window\.(confirm|alert|prompt)\s*\(/);
});

test("FieldgridDataView exposes semantic sort, selection and state contracts", () => {
  assert.match(dataView, /aria-sort=\{ariaSort\}/);
  assert.match(dataView, /Selecteer alle resultaten op deze pagina/);
  assert.match(dataView, /aria-busy=\{loading\}/);
  assert.match(dataView, /filteredEmptyTitle/);
  assert.match(dataView, /mobile-skeleton-/);
  assert.match(dataView, /Resultaatpagina’s/);
  assert.match(dataView, /Deze voorkeuren blijven alleen in deze browser bewaard/);
});
