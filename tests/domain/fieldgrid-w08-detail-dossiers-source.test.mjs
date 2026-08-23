import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

const navigation = read(
  "artifacts/backoffice/src/components/tenant-ui/tenant-detail-section-nav.tsx",
);
const responsiveActions = read(
  "artifacts/backoffice/src/components/tenant-ui/tenant-detail-responsive-actions.tsx",
);
const customerPage = read(
  "artifacts/backoffice/src/app/(dashboard)/customers/[id]/page.tsx",
);
const objectPage = read(
  "artifacts/backoffice/src/app/(dashboard)/objects/[id]/page.tsx",
);
const assignmentPage = read(
  "artifacts/backoffice/src/app/(dashboard)/assignments/[id]/page.tsx",
);

test("detail navigation is sticky, route-aware and keyboard/mobile canonical", () => {
  assert.match(navigation, /from "@\/components\/ui\/select"/u);
  assert.match(navigation, /from "next\/link"/u);
  assert.match(navigation, /sticky top-16/u);
  assert.match(navigation, /onValueChange=\{navigate\}/u);
  assert.match(navigation, /router\.push\(href\)/u);
  assert.match(
    navigation,
    /aria-current=\{item\.href === activeHref \? "page" : undefined\}/u,
  );
  assert.match(navigation, /prefers-reduced-motion: reduce/u);
  assert.doesNotMatch(navigation, /TabsTrigger/u);
  assert.doesNotMatch(navigation, /@radix-ui\/react-/u);
});

test("mobile detail actions use one responsive Radix sheet with focus return", () => {
  assert.match(responsiveActions, /useSyncExternalStore/u);
  assert.match(responsiveActions, /<Sheet>/u);
  assert.match(responsiveActions, /<SheetTrigger asChild>/u);
  assert.match(responsiveActions, /<SheetContent side="bottom"/u);
  assert.match(responsiveActions, /env\(safe-area-inset-bottom\)/u);
  assert.doesNotMatch(responsiveActions, /@radix-ui\/react-/u);
});

test("customer and object dossiers load only active heavy-tab data", () => {
  for (const [tab, loader] of [
    ["objecten", "listObjectsForCustomer"],
    ["opdrachten", "listAssignmentsForCustomer"],
    ["facturen", "listInvoicesForCustomer"],
    ["betalingen", "listPaymentsForCustomer"],
    ["rapporten", "listReportsForCustomer"],
    ["documenten", "listDocuments"],
    ["geschiedenis", "listCustomerHistory"],
  ]) {
    assert.match(
      customerPage,
      new RegExp(
        `showOverview \\|\\| activeTab === "${tab}"[\\s\\S]*${loader}`,
        "u",
      ),
      `${tab}:${loader}`,
    );
  }

  for (const [tab, loader] of [
    ["contacten", "listObjectContacts"],
    ["diensten", "listAssignmentsForObject"],
    ["materiaal", "listMaterialStockForObject"],
    ["inventaris", "listInventoryForObject"],
  ]) {
    assert.match(
      objectPage,
      new RegExp(`activeTab === "${tab}"[\\s\\S]*${loader}`, "u"),
      `${tab}:${loader}`,
    );
  }
});

test("assignment dossier lazy-loads workflows and explains their state", () => {
  for (const [tab, loader] of [
    ["bijlagen", "listDocuments"],
    ["rapport", "getReportForAssignment"],
    ["factuur", "getInvoiceForAssignment"],
    ["offerte", "getQuoteForAssignment"],
    ["planning", "getAssignmentPlanningReadiness"],
  ]) {
    assert.match(
      assignmentPage,
      new RegExp(`activeTab === "${tab}"[\\s\\S]*${loader}`, "u"),
      `${tab}:${loader}`,
    );
  }

  assert.match(assignmentPage, /Offerte · Wacht op akkoord/u);
  assert.match(assignmentPage, /Rapport · Ter controle/u);
  assert.match(assignmentPage, /Factuur · Concept/u);
  assert.match(assignmentPage, /Volgende stap/u);
  assert.match(assignmentPage, /<TenantDetailResponsiveActions/u);
});
