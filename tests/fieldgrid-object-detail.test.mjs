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

test("object detail page uses staging-safe object loader", () => {
  const page = read("artifacts/backoffice/src/app/(dashboard)/objects/[id]/page.tsx");
  const loader = read("artifacts/backoffice/src/app/actions/object-detail-safe.ts");
  const actions = read("artifacts/backoffice/src/components/objects/ObjectDetailActions.tsx");
  const tabConfig = read("artifacts/backoffice/src/components/objects/object-tabs.ts");

  assert.match(page, /getObjectForDetailPage/u);
  assert.match(page, /safeOptional\("object", id, \(\) => getObjectForDetailPage\(id\), null\)/u);
  assert.match(page, /@\/components\/objects\/object-tabs/u);
  assert.doesNotMatch(page, /@\/components\/objects\/ObjectDetailTabs/u);
  assert.match(tabConfig, /export const OBJECT_TAB_KEYS/u);
  assert.match(tabConfig, /inventaris/u);
  assert.match(loader, /function asStringArray\(value: unknown\): string\[\]/u);
  assert.match(loader, /function toIso\(value: unknown\): string/u);
  assert.match(loader, /requiredRoles:\s+asStringArray\(row\.requiredRoles\)/u);
  assert.match(loader, /requiredCertificates:\s+asStringArray\(row\.requiredCertificates\)/u);
  assert.match(loader, /updatedAt:\s+toIso\(row\.updatedAt \?\? row\.createdAt\)/u);
  assert.match(actions, /sheetOpen \? \(/u);
});
