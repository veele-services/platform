import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Sprint 9 exposes canonical tenant assignment-media storage helpers", () => {
  const storage = read("lib/db/src/storage-paths.ts");

  assert.ok(storage.includes('FIELDGRID_STORAGE_TENANT_ROOT = "tenant"'));
  assert.ok(storage.includes('FIELDGRID_ASSIGNMENT_MEDIA_ROOT = "assignments"'));
  assert.ok(storage.includes("buildAssignmentMediaStoragePath"));
  assert.ok(storage.includes("getTenantBoundAssignmentMediaStoragePath"));
  assert.ok(storage.includes("isCanonicalAssignmentMediaStoragePath"));
  assert.ok(storage.includes("`${FIELDGRID_STORAGE_TENANT_ROOT}/${tenantId}/${FIELDGRID_ASSIGNMENT_MEDIA_ROOT}/${assignmentId}/`"));
  assert.ok(storage.includes("allowLegacyAssignmentRoot"));
  assert.ok(storage.includes("allowLegacyTenantRoot"));
  assert.ok(storage.includes("allowLegacyPluralTenantRoot"));
});

test("Sprint 9 personnel uploads create tenant-prefixed assignment media paths", () => {
  const media = read("artifacts/personeel-pwa/src/lib/uploads/assignment-media.ts");
  const reportActions = read("artifacts/personeel-pwa/src/actions/reports.ts");
  const extraWorkActions = read("artifacts/personeel-pwa/src/actions/extra-work.ts");

  assert.doesNotMatch(media, /@workspace\/db/u);
  assert.ok(media.includes('ASSIGNMENT_MEDIA_TENANT_ROOT = "tenant"'));
  assert.ok(media.includes('ASSIGNMENT_MEDIA_ASSIGNMENT_ROOT = "assignments"'));
  assert.match(media, /export function buildReportNoteAttachmentPath\(\s*tenantId: string,\s*assignmentId: string,/u);
  assert.match(media, /export function buildExtraWorkPhotoPath\(\s*tenantId: string,\s*assignmentId: string,\s*extraWorkId: string,/u);
  assert.doesNotMatch(media, /return `\$\{assignmentId\}\/report-notes\//u);
  assert.doesNotMatch(media, /return `\$\{assignmentId\}\/extra-work\//u);
  assert.match(reportActions, /buildReportNoteAttachmentPath\(\s*auth\.tenantId,\s*assignmentId,/u);
  assert.match(extraWorkActions, /buildExtraWorkPhotoPath\(\s*auth\.tenantId,\s*assignmentId,\s*extraWorkId,/u);
});

test("Sprint 9 signed URLs are bound to tenant and assignment before signing", () => {
  const customerAssignments = read("artifacts/klant-pwa/src/actions/assignments.ts");
  const backofficeReports = read("artifacts/backoffice/src/app/actions/reports.ts");
  const personnelReports = read("artifacts/personeel-pwa/src/actions/reports.ts");
  const extraWorkActions = read("artifacts/personeel-pwa/src/actions/extra-work.ts");

  assert.match(customerAssignments, /getTenantBoundAssignmentMediaStoragePath\(\s*storagePath,\s*tenantId,\s*assignmentId,/u);
  assert.match(backofficeReports, /getTenantBoundAssignmentMediaStoragePath\(\s*storagePath,\s*tenantId,\s*assignmentId,/u);
  assert.match(backofficeReports, /createSignedUrl\(safeStoragePath, 3600\)/u);
  assert.match(personnelReports, /isReportNoteAttachmentPath\(tenantId, assignmentId, storagePath\)/u);
  assert.match(personnelReports, /createSignedAttachmentUrl\(attachment\.storagePath, auth\.tenantId, assignmentId\)/u);
  assert.match(extraWorkActions, /isExtraWorkPhotoPath\(tenantId, assignmentId, extraWorkId, storagePath\)/u);
  assert.match(extraWorkActions, /generateSignedUrl\(p\.storagePath, auth\.tenantId, assignmentId, p\.extraWorkId\)/u);
});

test("Sprint 9 storage docs describe copy-first legacy cleanup", () => {
  const sprint = read("docs/fieldgrid-sprint-9-storage-hardening.md");
  const plan = read("docs/fieldgrid-saas-proof-sprint-plan.md");

  for (const expected of [
    "tenant/{tenant_id}/assignments/{assignment_id}/...",
    "copy-first",
    "legacy-path cleanup-plan",
    "Tenant B krijgt geen Tenant A signed URL/path access",
  ]) {
    assert.match(sprint, new RegExp(expected.replace(/[{}]/g, "\\$&"), "u"));
  }

  assert.match(plan, /Sprint 9 - Storage hardening/u);
  assert.match(plan, /Status: `geleverd`/u);
});
