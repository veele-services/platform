import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("backoffice exposes a tenant-scoped module guard helper", () => {
  const guard = read("artifacts/backoffice/src/lib/auth/modules.ts");

  for (const token of [
    "requireCurrentTenantModule",
    "isCurrentTenantModuleEnabled",
    "requireCurrentTenantId",
    "requireTenantModule",
    "isTenantModuleEnabled",
    "FieldgridModuleKey",
  ]) {
    assert.match(guard, new RegExp(`\\b${token}\\b`, "u"));
  }

  assert.match(guard, /Promise<string>/u);
  assert.match(guard, /requireTenantModule\(tenantId, moduleKey\)/u);
  assert.match(guard, /isTenantModuleEnabled\(tenantId, moduleKey\)/u);
});

test("permission checks enforce module gates for sensitive backoffice domains", () => {
  const permissions = read("artifacts/backoffice/src/lib/auth/permissions.ts");

  for (const token of [
    "PERMISSION_MODULES",
    "moduleForPermissionResource",
    "hasEnabledPermissionModule",
    "requireEnabledPermissionModule",
    "isTenantModuleEnabled",
    "requireTenantModule",
    "FieldgridModuleKey",
  ]) {
    assert.match(permissions, new RegExp(`\\b${token}\\b`, "u"));
  }

  for (const [resource, moduleKey] of [
    ["documents", "documents"],
    ["invoices", "finance"],
    ["quotes", "finance"],
    ["payments", "finance"],
    ["customer_payment_batches", "finance"],
    ["reports", "reporting"],
  ]) {
    assert.match(permissions, new RegExp(`${resource}:\\s*\"${moduleKey}\"`, "u"));
  }

  assert.match(permissions, /hasPermission[\s\S]*hasEnabledPermissionModule\(resource\)/u);
  assert.match(permissions, /requirePermission[\s\S]*requireEnabledPermissionModule\(resource\)/u);
});

test("document server actions enforce the documents module entitlement", () => {
  const actions = read("artifacts/backoffice/src/app/actions/documents.ts");
  const guardCalls = actions.match(/requireCurrentTenantModule\("documents"\)/gu) ?? [];

  assert.match(actions, /@\/lib\/auth\/modules/u);
  assert.ok(guardCalls.length >= 4, "documents list, upload, delete and download should all check module access");
  assert.doesNotMatch(actions, /@\/lib\/auth\/tenant/u);

  for (const actionName of [
    "listDocuments",
    "uploadDocument",
    "deleteDocument",
    "getDocumentDownloadUrl",
  ]) {
    assert.match(actions, new RegExp(`${actionName}[\\s\\S]*requireCurrentTenantModule\\(\"documents\"\\)`, "u"));
  }
});

test("finance and reporting actions flow through the guarded permission gate", () => {
  const invoices = read("artifacts/backoffice/src/app/actions/invoices.ts");
  const quotes = read("artifacts/backoffice/src/app/actions/quotes.ts");
  const reports = read("artifacts/backoffice/src/app/actions/reports.ts");

  for (const [source, resource] of [
    [invoices, "invoices"],
    [quotes, "quotes"],
    [reports, "reports"],
  ]) {
    assert.match(source, new RegExp(`hasPermission\\(\"${resource}\"`, "u"));
    assert.match(source, new RegExp(`requirePermission\\(\"${resource}\"`, "u"));
  }
});
