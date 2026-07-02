import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function functionBlock(source, functionName) {
  const marker = `export async function ${functionName}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const next = source.indexOf("\nexport async function ", start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

const documents = read("artifacts/backoffice/src/app/actions/documents.ts");

test("document storage helper requires tenant-prefixed safe paths", () => {
  assert.ok(documents.includes("function getSafeDocumentStoragePath(path: string, tenantId: string): string | null"));
  assert.ok(documents.includes('path.trim().replace(/^\\/+/, "")'));
  assert.ok(documents.includes('if (/^[a-z][a-z\\d+.-]*:\\/\\//i.test(normalized)) return null;'));
  assert.ok(documents.includes('if (normalized.includes("\\\\")) return null;'));
  assert.ok(documents.includes('normalized.split("/").some((part) => part.trim() === "" || part === "..")'));
  assert.ok(documents.includes("if (!normalized.startsWith(`${tenantId}/`)) return null;"));
});

test("document downloads sign only tenant-validated storage paths", () => {
  const body = functionBlock(documents, "getDocumentDownloadUrl");

  assert.match(body, /requirePermission\("documents", "read"\)/u);
  assert.match(body, /const tenantId = await requireCurrentTenantModule\("documents"\)/u);
  assert.match(body, /isDocumentEntityInTenant\(\{[\s\S]*tenantId,[\s\S]*\}\)/u);
  assert.match(body, /const storagePath = getSafeDocumentStoragePath\(doc\.storagePath, tenantId\)/u);
  assert.match(body, /if \(!storagePath\)/u);
  assert.match(body, /createSignedUrl\(storagePath, 3600\)/u);
  assert.doesNotMatch(body, /createSignedUrl\(doc\.storagePath/u);
  assert.match(body, /tenantId,/u);
  assert.match(body, /action:\s+"download"/u);
});

test("document deletes remove only tenant-validated storage paths", () => {
  const body = functionBlock(documents, "deleteDocument");

  assert.match(body, /requirePermission\("documents", "write"\)/u);
  assert.match(body, /const tenantId = await requireCurrentTenantModule\("documents"\)/u);
  assert.match(body, /isDocumentEntityInTenant\(\{[\s\S]*tenantId,[\s\S]*\}\)/u);
  assert.match(body, /const storagePath = getSafeDocumentStoragePath\(doc\.storagePath, tenantId\)/u);
  assert.match(body, /if \(!storagePath\)/u);
  assert.match(body, /remove\(\[storagePath\]\)/u);
  assert.doesNotMatch(body, /remove\(\[doc\.storagePath\]\)/u);
  assert.match(body, /tenantId,/u);
  assert.match(body, /action:\s+"delete"/u);
});

test("document upload audit includes tenant context", () => {
  const body = functionBlock(documents, "uploadDocument");

  assert.match(body, /buildStoragePath\(tenantId, safeEntityType, entityId, docId, file\.name\)/u);
  assert.match(body, /action:\s+"create"/u);
  assert.match(body, /metadata:\s*\{[\s\S]*tenantId,[\s\S]*name,/u);
});
