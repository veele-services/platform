import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function block(source, functionName) {
  const markers = [
    `export async function ${functionName}`,
    `async function ${functionName}`,
    `function ${functionName}`,
  ];
  const start = markers
    .map((marker) => source.indexOf(marker))
    .filter((index) => index !== -1)
    .sort((a, b) => a - b)[0];

  assert.notEqual(start, undefined, `${functionName} should exist`);

  const nextMarkers = ["\nexport async function ", "\nasync function ", "\nfunction "];
  const next = nextMarkers
    .map((marker) => source.indexOf(marker, start + functionName.length))
    .filter((index) => index !== -1)
    .sort((a, b) => a - b)[0];

  return source.slice(start, next ?? source.length);
}

const documents = read("artifacts/backoffice/src/app/actions/documents.ts");

test("new document storage paths are prefixed by current tenant", () => {
  const helper = block(documents, "buildDocumentStoragePath");
  const upload = block(documents, "uploadDocument");

  assert.match(helper, /tenantId: string/u);
  assert.match(helper, /const entityParts = entityType !== "general" && entityId \? \[entityType, entityId\] : \["general"\]/u);
  assert.match(helper, /return buildTenantStoragePath\(tenantId, \["documents", \.\.\.entityParts, `\$\{docId\}\.\$\{safeExt\}`\]\)/u);

  assert.match(upload, /const tenantId = await requireCurrentTenantModule\("documents"\)/u);
  assert.match(upload, /buildDocumentStoragePath\(tenantId, safeEntityType, entityId, docId, file\.name\)/u);
  assert.match(upload, /\.upload\(storagePath, bytes/u);
});

test("document list and upload validate entity membership before exposing storage-backed rows", () => {
  const list = block(documents, "listDocuments");
  const upload = block(documents, "uploadDocument");

  assert.match(list, /allowed: await isDocumentEntityInTenant\(/u);
  assert.match(list, /tenantId/u);
  assert.match(upload, /const entityAllowed = await isDocumentEntityInTenant\(/u);
  assert.match(upload, /if \(!entityAllowed\)/u);
});

test("document delete checks tenant membership before storage removal", () => {
  const body = block(documents, "deleteDocument");

  assert.match(body, /const tenantId = await requireCurrentTenantModule\("documents"\)/u);
  assert.match(body, /const allowed = await isDocumentEntityInTenant\(/u);
  assert.match(body, /if \(!allowed\) return/u);
  assert.match(body, /const storagePath = getSafeDocumentStoragePath\(doc\.storagePath, tenantId\)/u);
  assert.match(body, /if \(!storagePath\)/u);
  assert.match(body, /storage\.from\(BUCKET\)\.remove\(\[storagePath\]\)/u);
  assert.doesNotMatch(body, /remove\(\[doc\.storagePath\]\)/u);
  assert.ok(
    body.indexOf("if (!allowed) return") < body.indexOf("getSafeDocumentStoragePath"),
    "tenant denial should happen before storage removal",
  );
  assert.ok(
    body.indexOf("if (!storagePath)") < body.indexOf("storage.from(BUCKET).remove"),
    "storage path validation should happen before storage removal",
  );
});

test("document download checks tenant membership before creating signed URL", () => {
  const body = block(documents, "getDocumentDownloadUrl");

  assert.match(body, /const tenantId = await requireCurrentTenantModule\("documents"\)/u);
  assert.match(body, /const allowed = await isDocumentEntityInTenant\(/u);
  assert.match(body, /if \(!allowed\) return/u);
  assert.match(body, /const storagePath = getSafeDocumentStoragePath\(doc\.storagePath, tenantId\)/u);
  assert.match(body, /if \(!storagePath\)/u);
  assert.match(body, /createSignedUrl\(storagePath, 3600\)/u);
  assert.doesNotMatch(body, /createSignedUrl\(doc\.storagePath/u);
  assert.ok(
    body.indexOf("if (!allowed) return") < body.indexOf("getSafeDocumentStoragePath"),
    "tenant denial should happen before signed URL creation",
  );
  assert.ok(
    body.indexOf("if (!storagePath)") < body.indexOf("createSignedUrl(storagePath"),
    "storage path validation should happen before signed URL creation",
  );
});

test("document download writes an audit log after signed URL creation", () => {
  const body = block(documents, "getDocumentDownloadUrl");

  assert.match(body, /const supabase = await createClient\(\)/u);
  assert.match(body, /supabase\.auth\.getUser\(\)/u);
  assert.match(body, /db\.insert\(auditLogTable\)\.values\(/u);
  assert.match(body, /action:\s+"document_signed_url_issued"/u);
  assert.match(body, /resource:\s+"documents"/u);
  assert.match(body, /resourceId:\s+id/u);
  assert.match(body, /filename:\s+doc\.filename/u);

  assert.ok(
    body.indexOf("if (!allowed) return") < body.indexOf("db.insert(auditLogTable).values"),
    "tenant denial should happen before download audit logging",
  );
  assert.ok(
    body.indexOf("createSignedUrl(storagePath, 3600)") < body.indexOf("db.insert(auditLogTable).values"),
    "successful signed URL creation should happen before audit logging",
  );
});
