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
const objectsView = fs.readFileSync(
  path.join(
    root,
    "artifacts/backoffice/src/components/objects/ObjectsView.tsx",
  ),
  "utf8",
);
const objectForm = fs.readFileSync(
  path.join(
    root,
    "artifacts/backoffice/src/components/objects/ObjectForm.tsx",
  ),
  "utf8",
);
const combobox = fs.readFileSync(
  path.join(
    root,
    "artifacts/backoffice/src/components/ui/combobox.tsx",
  ),
  "utf8",
);
const formSection = fs.readFileSync(
  path.join(
    root,
    "artifacts/backoffice/src/components/ui/form-section.tsx",
  ),
  "utf8",
);
const globals = fs.readFileSync(
  path.join(root, "artifacts/backoffice/src/app/globals.css"),
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

test("objects is the server-filtered DataView pilot without duplicate table UI", () => {
  assert.match(objectsView, /<FieldgridDataView/);
  assert.match(objectsView, /preferenceKey="fieldgrid:objects:data-view"/);
  assert.match(objectsView, /storageKey: "fieldgrid:objects:saved-views"/);
  assert.match(objectsView, /onApply=\{applyDraftFilters\}/);
  assert.match(objectsView, /setDraftServiceType\(event\.target\.value\)/);
  assert.match(objectsView, /setDraftRegion\(event\.target\.value\)/);
  assert.doesNotMatch(objectsView, /<table|<thead|<tbody|<th(?:\s|>)/);
  assert.doesNotMatch(objectsView, /style=\{/);
});

test("W06 form pilot consumes the canonical combobox and named sections", () => {
  assert.match(objectForm, /from "@\/components\/ui\/combobox"/);
  assert.match(objectForm, /from "@\/components\/ui\/form-section"/);
  assert.match(objectForm, /from "@\/components\/ui\/form-grid"/);
  assert.match(objectForm, /shouldDirty: true/);
  assert.doesNotMatch(objectForm, /<section(?:\s|>)/);
  assert.doesNotMatch(objectForm, /<Popover|<Command/);
  assert.doesNotMatch(objectForm, /style=\{/);

  assert.match(combobox, /role="combobox"/);
  assert.match(combobox, /aria-expanded=\{open\}/);
  assert.match(combobox, /aria-invalid=\{invalid\}/);
  assert.doesNotMatch(combobox, /@radix-ui\/react-/);

  assert.match(formSection, /aria-labelledby=\{titleId\}/);
  assert.match(formSection, /<h2 id=\{titleId\}/);
});

test("nested floating controls layer above modal surfaces", () => {
  const value = (name) => {
    const match = globals.match(new RegExp(`--z-${name}:\\s*(\\d+)`));
    assert.ok(match, `missing --z-${name}`);
    return Number(match[1]);
  };
  assert.ok(value("dropdown") > value("modal"));
  assert.ok(value("overlay") > value("modal"));
  assert.ok(value("toast") > value("overlay"));
});
