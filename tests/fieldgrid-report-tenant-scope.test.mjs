import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
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
