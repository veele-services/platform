import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("object detail tabs normalize legacy qualification values before rendering", () => {
  const overview = read("artifacts/backoffice/src/components/objects/tabs/ObjectOverviewTab.tsx");
  const details = read("artifacts/backoffice/src/components/objects/tabs/ObjectDetailsTab.tsx");

  for (const source of [overview, details]) {
    assert.match(source, /function asStringArray\(value: unknown\): string\[\]/u);
    assert.match(source, /Array\.isArray\(value\)/u);
    assert.match(source, /item is string/u);
  }

  assert.match(overview, /const requiredRoles = asStringArray\(obj\.requiredRoles\);/u);
  assert.match(overview, /const requiredCertificates = asStringArray\(obj\.requiredCertificates\);/u);
  assert.doesNotMatch(overview, /obj\.requiredRoles\.map/u);
  assert.doesNotMatch(overview, /obj\.requiredCertificates\.map/u);

  assert.match(details, /requiredRoles,/u);
  assert.match(details, /requiredCertificates,/u);
  assert.doesNotMatch(details, /obj\.requiredRoles\s+\?\? \[\]/u);
  assert.doesNotMatch(details, /obj\.requiredCertificates \?\? \[\]/u);
});
