import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("phase 6 adds customer portal shared primitives", () => {
  const portalUi = read("artifacts/klant-pwa/src/components/portal-ui.tsx");
  const filterSheet = read(
    "artifacts/klant-pwa/src/components/PortalFilterSheet.tsx",
  );
  const actionMenu = read(
    "artifacts/klant-pwa/src/components/PortalActionMenu.tsx",
  );

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
  assert.match(filterSheet, /from "@workspace\/shared-ui"/u);
  assert.match(filterSheet, /DialogContent/u);
  assert.match(filterSheet, /DialogTitle/u);
  assert.match(filterSheet, /DialogDescription/u);
});

test("portal action menu renders asynchronous actions as canonical menu items", () => {
  const paymentAction = read(
    "artifacts/klant-pwa/src/components/PaymentActionButton.tsx",
  );
  const documentAction = read(
    "artifacts/klant-pwa/src/components/DocumentDownloadButton.tsx",
  );
  const paymentsPage = read(
    "artifacts/klant-pwa/src/app/(app)/betalingen/page.tsx",
  );
  const invoicesPage = read(
    "artifacts/klant-pwa/src/app/(app)/facturen/page.tsx",
  );
  const documentsPage = read(
    "artifacts/klant-pwa/src/app/(app)/documenten/page.tsx",
  );

  for (const action of [paymentAction, documentAction]) {
    assert.match(action, /DropdownMenuItem/u);
    assert.match(action, /renderAsMenuItem/u);
    assert.match(action, /onSelect=\{\(event\) => \{/u);
    assert.match(action, /event\.preventDefault\(\)/u);
  }

  assert.match(paymentsPage, /PaymentActionButton[\s\S]*renderAsMenuItem/u);
  assert.match(invoicesPage, /PaymentActionButton[\s\S]*renderAsMenuItem/u);
  assert.match(documentsPage, /DocumentDownloadButton[\s\S]*renderAsMenuItem/u);
});

test("phase 6 primitives use existing portal styling tokens and responsive list pattern", () => {
  const portalUi = read("artifacts/klant-pwa/src/components/portal-ui.tsx");
  const filterSheet = read(
    "artifacts/klant-pwa/src/components/PortalFilterSheet.tsx",
  );

  for (const token of [
    "var(--color-border)",
    "var(--color-primary)",
    "var(--color-secondary)",
    "var(--color-accent)",
  ]) {
    assert.match(portalUi, new RegExp(token.replace(/[()]/g, "\\$&"), "u"));
  }

  assert.match(filterSheet, /var\(--color-border\)/u);
  assert.match(filterSheet, /var\(--color-accent-accessible\)/u);
  const desktopListClasses = portalUi.match(
    /className="([^"]*hidden[^"]*overflow-x-auto[^"]*md:block[^"]*)"/u,
  )?.[1];
  assert.ok(desktopListClasses, "desktop data list remains hidden until md");
  for (const className of ["hidden", "overflow-x-auto", "md:block"]) {
    assert.ok(desktopListClasses.split(/\s+/u).includes(className));
  }

  const mobileListClasses = portalUi.match(
    /className="([^"]*grid[^"]*gap-3[^"]*md:hidden[^"]*)"/u,
  )?.[1];
  assert.ok(mobileListClasses, "mobile card list remains visible below md");
  assert.match(portalUi, /renderMobileCard/u);
});

test("phase 6 migrates documents as low-risk reference page without changing data flow", () => {
  const documentsPage = read(
    "artifacts/klant-pwa/src/app/(app)/documenten/page.tsx",
  );

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
  assert.match(
    documentsPage,
    /filterDocuments\(\{\s*documents,\s*query,\s*type: selectedType,/u,
  );
  assert.match(
    documentsPage,
    /searchParams:\s*Promise<\{\s*q\?: string;\s*type\?: string;\s*object\?: string;\s*assignment\?: string;\s*date\?: string;\s*\}>/u,
  );
  assert.doesNotMatch(documentsPage, /Veele Services/u);
});
