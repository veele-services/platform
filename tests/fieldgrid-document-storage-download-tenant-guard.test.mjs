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
const storagePaths = read("lib/db/src/storage-paths.ts");

test("document storage helper requires tenant-prefixed safe paths", () => {
  assert.ok(documents.includes("function getSafeDocumentStoragePath(path: string, tenantId: string): string | null"));
  assert.ok(documents.includes("getTenantBoundStoragePath(path, tenantId, { allowLegacyTenantRoot: true })"));
  assert.ok(documents.includes("buildTenantStoragePath"));
  assert.ok(documents.includes("getTenantBoundStoragePath"));

  assert.ok(storagePaths.includes('const normalized = path.trim().replace(/^\\/+/, "");'));
  assert.ok(storagePaths.includes("if (URL_SCHEME_PATTERN.test(normalized)) return null;"));
  assert.ok(storagePaths.includes('if (normalized.includes("\\\\")) return null;'));
  assert.ok(storagePaths.includes('segment.trim() === "" || segment === "." || segment === ".."'));
  assert.ok(storagePaths.includes("const canonicalPrefix = `${FIELDGRID_STORAGE_TENANT_ROOT}/${tenantId}/`;"));
  assert.ok(storagePaths.includes('normalized.startsWith(`${tenantId}/`)'));
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
  assert.match(body, /action:\s+"document_signed_url_issued"/u);
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
  assert.match(body, /action:\s+"document_deleted"/u);
});

test("document upload audit includes tenant context", () => {
  const body = functionBlock(documents, "uploadDocument");

  assert.match(body, /buildDocumentStoragePath\(tenantId, safeEntityType, entityId, docId, file\.name\)/u);
  assert.match(body, /values\(\{[\s\S]*tenantId,[\s\S]*action:\s+"document_uploaded"/u);
  assert.match(body, /metadata:\s*\{[\s\S]*name,[\s\S]*filename:\s+file\.name,[\s\S]*storagePath,[\s\S]*entityType:\s+safeEntityType/u);
});
