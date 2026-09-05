import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
function action(source, name) {
  const start = source.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist`);
  const next = source.indexOf("\nexport async function ", start + 22);
  return source.slice(start, next < 0 ? source.length : next);
}

test("destructive server actions require exact delete permissions", () => {
  for (const [file, name, resource] of [
    ["customers.ts", "deleteCustomer", "customers"],
    ["objects.ts", "deleteObject", "objects"],
    ["personnel.ts", "deletePersonnel", "personnel"],
    ["assignments.ts", "deleteAssignment", "assignments"],
    ["documents.ts", "deleteDocument", "documents"],
  ]) {
    const body = action(read(`artifacts/backoffice/src/app/actions/${file}`), name);
    assert.match(body, new RegExp(`requirePermission\\("${resource}", "delete"\\)`, "u"));
    assert.doesNotMatch(body, new RegExp(`requirePermission\\("${resource}", "write"\\)`, "u"));
  }
});

test("destructive controls receive a separate canDelete capability", () => {
  for (const [route, resource, view] of [
    ["customers/page.tsx", "customers", "customers/CustomersView.tsx"],
    ["objects/page.tsx", "objects", "objects/ObjectsView.tsx"],
    ["personnel/page.tsx", "personnel", "personnel/PersonnelView.tsx"],
    ["assignments/page.tsx", "assignments", "assignments/AssignmentsView.tsx"],
  ]) {
    const page = read(`artifacts/backoffice/src/app/(dashboard)/${route}`);
    const component = read(`artifacts/backoffice/src/components/${view}`);
    assert.match(page, new RegExp(`hasPermission\\("${resource}", "delete"\\)`, "u"));
    assert.match(page, /canDelete=\{canDelete\}/u);
    assert.match(component, /canDelete:\s+boolean/u);
    assert.match(component, /\.\.\.\(canDelete/u);
  }
  const assignments = read("artifacts/backoffice/src/components/assignments/AssignmentsView.tsx");
  assert.match(assignments, /selection=\{\s*canDelete/u);
  assert.match(assignments, /bulkActions=\{\s*canDelete/u);
});

test("document deletion is independent from document writes at every caller", () => {
  for (const route of ["documents/page.tsx", "customers/[id]/page.tsx", "personnel/[id]/page.tsx", "assignments/[id]/page.tsx"]) {
    const source = read(`artifacts/backoffice/src/app/(dashboard)/${route}`);
    assert.match(source, /hasPermission\("documents", "delete"\)/u, route);
    assert.match(source, /canDelete=\{canDeleteDocuments|canDelete=\{canDelete\}/u, route);
  }
  for (const [route, contextGate] of [
    ["materials/[id]/page.tsx", /canDelete=\{\(canUpdate \|\| canManage\) && canDeleteDocuments\}/u],
    ["inventory/[id]/page.tsx", /canDelete=\{\(canUpdate \|\| canManage\) && canDeleteDocuments\}/u],
    ["inventory/issues/[id]/page.tsx", /canDelete=\{canDeleteDocuments && \(canResolve \|\| canManageMaintenance\)\}/u],
  ]) {
    const source = read(`artifacts/backoffice/src/app/(dashboard)/${route}`);
    assert.match(source, /hasPermission\("documents", "delete"\)/u, route);
    assert.match(source, contextGate, route);
  }
  for (const component of ["DocumentsView.tsx", "AssignmentDocumentsPanel.tsx", "EntityDocumentsPanel.tsx", "DocumentAttachmentPanel.tsx"]) {
    assert.match(read(`artifacts/backoffice/src/components/documents/${component}`), /canDelete:\s*boolean/u, component);
  }
});

test("material and inventory document mutations repeat their context permission server-side", () => {
  const source = read("artifacts/backoffice/src/app/actions/documents.ts");
  assert.match(source, /async function canMutateDocumentContext/u);
  for (const permission of [
    ["materials", "update"],
    ["materials", "manage"],
    ["inventory", "update"],
    ["inventory", "resolve_issue"],
    ["inventory", "manage_maintenance"],
    ["inventory", "manage"],
  ]) {
    assert.match(source, new RegExp(`hasPermission\\("${permission[0]}", "${permission[1]}"\\)`, "u"));
  }
  assert.match(action(source, "uploadDocument"), /canMutateDocumentContext\(safeEntityType\)/u);
  assert.match(action(source, "deleteDocument"), /canMutateDocumentContext\(doc\.entityType as DocumentEntityType\)/u);
  assert.match(source, /if \(entityType === "inventory_issue"\)[\s\S]*resolve_issue[\s\S]*manage_maintenance/u);
  assert.match(source, /if \(entityType === "inventory_maintenance"\)[\s\S]*manage_maintenance[\s\S]*return canManageMaintenance \|\| canManage/u);

  const page = read("artifacts/backoffice/src/app/(dashboard)/documents/page.tsx");
  const view = read("artifacts/backoffice/src/components/documents/DocumentsView.tsx");
  assert.match(page, /contextMutationCapabilities=\{\{/u);
  assert.match(page, /inventory_maintenance:\s*canManageInventoryMaintenance \|\| canManageInventory/u);
  assert.match(view, /contextMutationCapabilities:\s*Partial<Record<DocumentEntityType, boolean>>/u);
  assert.match(view, /canDelete && canMutateContext\(doc\.entityType\)/u);
  assert.match(view, /DOCUMENT_ENTITY_TYPES\.filter\(canMutateContext\)/u);
});

test("planning movement and assignment creation have distinct permissions", () => {
  const page = read("artifacts/backoffice/src/app/(dashboard)/planning/page.tsx");
  const day = read("artifacts/backoffice/src/components/assignments/PlanningDayView.tsx");
  const palette = read("artifacts/backoffice/src/components/navigation/GlobalCommandPalette.tsx");
  assert.match(page, /hasPermission\("planning", "write"\)/u);
  assert.match(page, /hasPermission\("assignments", "write"\)/u);
  assert.match(page, /canCreateAssignment \? await getCustomerOptions\(\) : \[\]/u);
  assert.equal((day.match(/\{canCreateAssignment && \(/gu) ?? []).length, 3);
  assert.match(day, /if \(!canWrite \|\| !isTimelineMovable/u);
  assert.match(palette, /permissions\.has\("assignments:read"\) && permissions\.has\("assignments:write"\)/u);
});

test("material and inventory create, archive, manage and stock capabilities remain distinct", () => {
  const materialPage = read("artifacts/backoffice/src/app/(dashboard)/materials/page.tsx");
  const materialView = read("artifacts/backoffice/src/components/materials/MaterialsView.tsx");
  for (const permission of ["create", "adjust_stock", "transfer_stock", "archive", "manage"]) assert.match(materialPage, new RegExp(`hasPermission\\("materials", "${permission}"\\)`, "u"));
  for (const prop of ["canCreate", "canAdjust", "canTransfer", "canArchive"]) assert.match(materialView, new RegExp(`${prop}: boolean`, "u"));
  assert.match(materialView, /\{canAdjust \? <>/u);
  assert.match(materialView, /\{canTransfer \? <option/u);
  const inventoryPage = read("artifacts/backoffice/src/app/(dashboard)/inventory/page.tsx");
  for (const permission of ["create", "archive", "manage"]) assert.match(inventoryPage, new RegExp(`hasPermission\\("inventory", "${permission}"\\)`, "u"));
  assert.match(inventoryPage, /canCreate=\{canCreate \|\| canManage\}/u);
  assert.match(inventoryPage, /canArchive=\{canArchive \|\| canManage\}/u);
});

test("newly exposed destructive and icon controls are confirmed, named and touch sized", () => {
  const objectActions = read("artifacts/backoffice/src/components/objects/ObjectDetailActions.tsx");
  assert.match(objectActions, /aria-label="Objectacties openen"/u);
  assert.match(objectActions, /className="h-11 w-11 p-0"/u);

  for (const component of ["DocumentAttachmentPanel.tsx", "EntityDocumentsPanel.tsx", "AssignmentDocumentsPanel.tsx"]) {
    const source = read(`artifacts/backoffice/src/components/documents/${component}`);
    assert.equal((source.match(/h-11 w-11/gu) ?? []).length >= 2, true, component);
    assert.match(source, /aria-label=\{`Download/u, component);
    assert.match(source, /aria-label=\{`Verwijder/u, component);
  }

  for (const component of ["materials/MaterialsView.tsx", "materials/MaterialDetailView.tsx", "inventory/InventoryView.tsx", "inventory/InventoryDetailView.tsx"]) {
    const source = read(`artifacts/backoffice/src/components/${component}`);
    assert.match(source, /<TenantConfirmDialog/u, component);
    assert.match(source, /confirmLabel="Archiveren"/u, component);
    assert.match(source, /min-h-11/u, component);
  }
});
