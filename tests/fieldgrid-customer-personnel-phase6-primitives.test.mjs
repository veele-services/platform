import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("phase 6 adds customer portal shared primitives", () => {
  const portalUi = read("artifacts/klant-pwa/src/components/portal-ui.tsx");
  const filterSheet = read("artifacts/klant-pwa/src/components/PortalFilterSheet.tsx");
  const actionMenu = read("artifacts/klant-pwa/src/components/PortalActionMenu.tsx");
  const confirmDialog = read("artifacts/klant-pwa/src/components/PortalConfirmDialog.tsx");

  for (const exportName of [
    "PortalPageShell",
    "PortalPageHeader",
    "PortalToolbar",
    "PortalToolbarSearch",
    "PortalToolbarSelect",
    "PortalActiveFilterChips",
    "PortalDataList",
  ]) {
    assert.match(portalUi, new RegExp(`export function ${exportName}`, "u"));
  }

  assert.match(filterSheet, /export function PortalFilterSheet/u);
  assert.match(actionMenu, /export function PortalActionMenu/u);
  assert.match(confirmDialog, /export function PortalConfirmDialog/u);
});

test("phase 6 primitives use existing portal styling tokens and responsive list pattern", () => {
  const portalUi = read("artifacts/klant-pwa/src/components/portal-ui.tsx");
  const filterSheet = read("artifacts/klant-pwa/src/components/PortalFilterSheet.tsx");
  const confirmDialog = read("artifacts/klant-pwa/src/components/PortalConfirmDialog.tsx");

  for (const token of [
    "var(--color-border)",
    "var(--color-primary)",
    "var(--color-secondary)",
    "var(--color-accent)",
  ]) {
    assert.match(portalUi, new RegExp(token.replace(/[()]/g, "\\$&"), "u"));
  }

  assert.match(filterSheet, /var\(--color-border\)/u);
  assert.match(confirmDialog, /var\(--color-accent\)/u);
  assert.match(portalUi, /hidden overflow-x-auto[\s\S]+md:block/u);
  assert.match(portalUi, /grid gap-3 md:hidden/u);
  assert.match(portalUi, /renderMobileCard/u);
});

test("phase 6 migrates documents as low-risk reference page without changing data flow", () => {
  const documentsPage = read("artifacts/klant-pwa/src/app/(app)/documenten/page.tsx");

  for (const component of [
    "PortalPageShell",
    "PortalToolbar",
    "PortalFilterSheet",
    "PortalActiveFilterChips",
    "PortalDataList",
    "PortalActionMenu",
  ]) {
    assert.match(documentsPage, new RegExp(component, "u"));
  }

  assert.match(documentsPage, /getMyDocuments\(\)/u);
  assert.match(documentsPage, /DocumentDownloadButton/u);
  assert.match(documentsPage, /filterDocuments\(documents, query, selectedType\)/u);
  assert.match(documentsPage, /searchParams: Promise<\{ q\?: string; type\?: string \}>/u);
  assert.doesNotMatch(documentsPage, /Veele Services/u);
});
