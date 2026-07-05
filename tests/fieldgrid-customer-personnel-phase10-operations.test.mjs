import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("phase 10 adds explicit governance to customer object creation", () => {
  const action = read("artifacts/klant-pwa/src/actions/objects.ts");
  const form = read("artifacts/klant-pwa/src/components/CustomerObjectForm.tsx");
  const createPage = read("artifacts/klant-pwa/src/app/(app)/objecten/nieuw/page.tsx");

  for (const marker of [
    'reviewMode',
    '"concept"',
    '"review"',
    '"approved"',
    'isActive: data.reviewMode === "approved"',
    'governance: parsed.data.reviewMode',
  ]) {
    assert.match(action, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  }

  for (const marker of [
    "Review en activering",
    "Concept bewaren",
    "Ter review aanbieden",
    "Direct actief gebruiken",
    'name="reviewMode"',
  ]) {
    assert.match(form, new RegExp(marker, "u"));
  }

  assert.match(createPage, /PortalPageShell/u);
  assert.match(createPage, /Nieuwe objecten worden niet stilzwijgend operationeel actief/u);
});

test("phase 10 makes customer object and assignment detail section based", () => {
  const objectDetail = read("artifacts/klant-pwa/src/app/(app)/objecten/[id]/page.tsx");
  const assignmentDetail = read("artifacts/klant-pwa/src/app/(app)/opdrachten/[id]/page.tsx");

  for (const marker of [
    "PortalPageShell",
    "SectionNav",
    'id="overzicht"',
    'id="opdrachten"',
    'id="documenten"',
    'id="rapportages"',
    'id="tickets"',
    "getMyAssignments",
    "getMyDocuments",
    "getMyReports",
    "getMyCustomerTickets",
  ]) {
    assert.match(objectDetail, new RegExp(marker, "u"));
  }

  for (const marker of [
    "PortalPageShell",
    "SectionNav",
    'id="status"',
    'id="planning"',
    'id="rapportage"',
    'id="documenten"',
    'id="support"',
    "DocumentDownloadButton",
    "getMyDocuments",
  ]) {
    assert.match(assignmentDetail, new RegExp(marker, "u"));
  }
});

test("phase 10 exposes object and assignment context in customer documents and reports", () => {
  const documentAction = read("artifacts/klant-pwa/src/actions/documents.ts");
  const reportAction = read("artifacts/klant-pwa/src/actions/reports.ts");
  const documentsPage = read("artifacts/klant-pwa/src/app/(app)/documenten/page.tsx");
  const reportsPage = read("artifacts/klant-pwa/src/app/(app)/rapporten/page.tsx");

  for (const marker of [
    "CustomerVisibleDocumentEntityType",
    "entityType",
    "objectId",
    "assignmentId",
    "entityLabel",
    "canAccessDocumentEntity",
    '"customer"',
    '"object"',
    '"assignment"',
  ]) {
    assert.match(documentAction, new RegExp(marker, "u"));
  }

  for (const marker of [
    "assignmentCode",
    "objectId",
    "objectName",
    "leftJoin(objectsTable",
  ]) {
    assert.match(reportAction, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  }

  for (const marker of [
    "DocumentDateFilter",
    "selectedObject",
    "selectedAssignment",
    "selectedDate",
    "matchesDateFilter",
    'name="object"',
    'name="assignment"',
    'name="date"',
    "Koppeling",
  ]) {
    assert.match(documentsPage, new RegExp(marker, "u"));
  }

  for (const marker of [
    "ReportDateFilter",
    "selectedObject",
    "selectedAssignment",
    "selectedDate",
    "matchesDateFilter",
    'name="object"',
    'name="assignment"',
    'name="date"',
  ]) {
    assert.match(reportsPage, new RegExp(marker, "u"));
  }
});
