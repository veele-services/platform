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
