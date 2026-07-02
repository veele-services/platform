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

test("backoffice report actions are parent-scoped through assignments", () => {
  const reports = read("artifacts/backoffice/src/app/actions/reports.ts");

  assert.match(reports, /requireCurrentTenantId/u);
  assert.match(reports, /innerJoin\(assignmentsTable, eq\(reportsTable\.assignmentId, assignmentsTable\.id\)\)/u);

  const tenantChecks = reports.match(/eq\(assignmentsTable\.tenantId, tenantId\)/gu) ?? [];
  assert.ok(tenantChecks.length >= 8, "report reads and mutations should filter through assignments.tenantId");
});

test("report list and detail reads include tenant filters", () => {
  const reports = read("artifacts/backoffice/src/app/actions/reports.ts");

  for (const functionName of [
    "listReports",
    "listReportsForCustomer",
    "getReport",
    "getReportForAssignment",
    "getPendingReportsCount",
  ]) {
    assert.match(
      reports,
      new RegExp(`${functionName}[\\s\\S]*requireCurrentTenantId\\([\\s\\S]*eq\\(assignmentsTable\\.tenantId, tenantId\\)`, "u"),
    );
  }

  assert.match(reports, /getPendingReportsCount[\s\S]*innerJoin\(assignmentsTable, eq\(reportsTable\.assignmentId, assignmentsTable\.id\)\)/u);
});

test("report mutations verify assignment tenant before writes", () => {
  const reports = read("artifacts/backoffice/src/app/actions/reports.ts");

  assert.match(
    reports,
    /submitReport[\s\S]*where\(and\(eq\(assignmentsTable\.id, assignmentId\), eq\(assignmentsTable\.tenantId, tenantId\)\)\)/u,
  );

  for (const functionName of ["approveReport", "rejectReport"]) {
    assert.match(
      reports,
      new RegExp(`${functionName}[\\s\\S]*innerJoin\\(assignmentsTable, eq\\(reportsTable\\.assignmentId, assignmentsTable\\.id\\)\\)[\\s\\S]*where\\(and\\(eq\\(reportsTable\\.id, reportId\\), eq\\(assignmentsTable\\.tenantId, tenantId\\)\\)\\)`, "u"),
    );
  }
});

test("report timeline attachments are gated by the tenant-scoped report", () => {
  const reports = read("artifacts/backoffice/src/app/actions/reports.ts");
  const body = block(reports, "getReportTimelineNotes");

  assert.match(body, /const report = await getReport\(id\);/u);
  assert.match(body, /if \(!report\) return \[\];/u);
  assert.match(body, /where\(eq\(assignmentReportNotesTable\.assignmentId, report\.assignmentId\)\)/u);
  assert.match(body, /const noteIds = notes\.map\(\(note\) => note\.id\);/u);
  assert.match(body, /\.from\(assignmentReportNoteAttachmentsTable\)/u);
  assert.match(body, /where\(inArray\(assignmentReportNoteAttachmentsTable\.noteId, noteIds\)\)/u);
  assert.match(body, /createSignedReportAttachmentUrl\(attachment\.storagePath\)/u);

  assert.ok(
    body.indexOf("const report = await getReport(id);") < body.indexOf(".from(assignmentReportNotesTable)"),
    "timeline notes should only load after the tenant-scoped report lookup succeeds",
  );
  assert.ok(
    body.indexOf("if (!report) return [];") < body.indexOf("createSignedReportAttachmentUrl(attachment.storagePath)"),
    "signed attachment URLs should only be considered after the report access check",
  );
});

test("report attachment signed URLs use the assignment media bucket with a short TTL", () => {
  const reports = read("artifacts/backoffice/src/app/actions/reports.ts");
  const helper = block(reports, "createSignedReportAttachmentUrl");

  assert.match(helper, /createAdminClient\(\)/u);
  assert.match(helper, /\.from\("assignment-photos"\)/u);
  assert.match(helper, /createSignedUrl\(storagePath, 3600\)/u);
});
