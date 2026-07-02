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

const customerAssignments = read("artifacts/klant-pwa/src/actions/assignments.ts");

test("customer assignment photo signed URLs require scoped storage paths", () => {
  const body = functionBlock(customerAssignments, "getMyAssignmentDetail");

  assert.ok(customerAssignments.includes("function getSafeCustomerAssignmentPhotoStoragePath"));
  assert.ok(customerAssignments.includes("`tenants/${tenantId}/assignments/${assignmentId}/`"));
  assert.ok(customerAssignments.includes("`${tenantId}/assignments/${assignmentId}/`"));
  assert.ok(customerAssignments.includes("`assignments/${assignmentId}/`"));
  assert.ok(customerAssignments.includes("`${assignmentId}/`"));
  assert.ok(customerAssignments.includes('if (/^[a-z][a-z\\d+.-]*:\\/\\//i.test(normalized)) return null;'));
  assert.ok(customerAssignments.includes('if (normalized.includes("\\\\")) return null;'));
  assert.ok(customerAssignments.includes('normalized.split("/").some((segment) => !segment || segment === "..")'));

  assert.match(body, /eq\(assignmentsTable\.customerId, identity\.customerId\)/u);
  assert.match(body, /eq\(assignmentsTable\.tenantId,\s+identity\.tenantId\)/u);
  assert.match(body, /eq\(assignmentPhotosTable\.assignmentId, assignmentId\)/u);
  assert.match(body, /eq\(assignmentPhotosTable\.isApproved,\s+true\)/u);
  assert.match(body, /getSafeCustomerAssignmentPhotoStoragePath\(\s*p\.storagePath,\s*identity\.tenantId,\s*assignmentId,\s*\)/u);
  assert.match(body, /if \(!storagePath\) return \{ id: p\.id, signedUrl: null \}/u);
  assert.match(body, /createSignedUrl\(storagePath, 3600\)/u);
  assert.doesNotMatch(body, /createSignedUrl\(p\.storagePath/u);
});
