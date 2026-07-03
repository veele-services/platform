import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should contain ${phrase}`);
  }
}

test("phase 4 exposes tenant-safe material approval actions", () => {
  const action = read("artifacts/backoffice/src/app/actions/assignment-material-approvals.ts");

  assertContains(
    action,
    [
      "listAssignmentMaterialApprovals",
      "approveAssignmentMaterialUsage",
      "hasPermission(\"materials\", \"approve_usage\")",
      "approved_unit_price",
      "approved_vat_rate",
      "customer_visible",
      "approval_reason",
      "assignment_material_usage_approved",
      "assignment_material_usage_rejected",
      "Reden",
    ],
    "material approval action",
  );
});

test("phase 4 approval panel supports management financial decisions", () => {
  const panel = read("artifacts/backoffice/src/components/materials/AssignmentMaterialsApprovalPanel.tsx");

  assertContains(
    panel,
    [
      "Materiaal en inventaris",
      "Prijs per stuk",
      "BTW (%)",
      "Factureerbaar",
      "Klantzichtbaar",
      "EUR 0,00 is toegestaan",
      "Reden voor goedkeuring of wijziging",
      "Goedkeuren",
      "Afwijzen",
    ],
    "material approval panel",
  );
});

test("phase 4 report approval is gated by pending material review", () => {
  const reportPage = read("artifacts/backoffice/src/app/(dashboard)/reports/[id]/page.tsx");
  const reportActions = read("artifacts/backoffice/src/components/reports/ReportActions.tsx");
  const approvalWrapper = read("artifacts/backoffice/src/app/actions/report-material-approval.ts");

  assertContains(
    reportPage,
    [
      "listAssignmentMaterialApprovals",
      "AssignmentMaterialsApprovalPanel",
      "pendingMaterialCount",
      "approveDisabledReason",
    ],
    "report material approval page",
  );
  assertContains(reportActions, ["approveReportAfterMaterialReview", "approveDisabledReason"], "report actions");
  assertContains(
    approvalWrapper,
    [
      "approveReportAfterMaterialReview",
      "usage.approval_status = 'pending'",
      "Beoordeel eerst",
      "approveReport(reportId)",
    ],
    "report material approval wrapper",
  );
});

test("phase 4 invoice proposal only includes approved invoiceable material", () => {
  const proposals = read("artifacts/backoffice/src/lib/invoice-proposals.ts");

  assertContains(
    proposals,
    [
      "assignmentMaterialUsageTable.approvedName",
      "assignmentMaterialUsageTable.approvedQuantity",
      "assignmentMaterialUsageTable.approvedUnitPrice",
      "eq(assignmentMaterialUsageTable.approvalStatus, \"approved\")",
      "eq(assignmentMaterialUsageTable.invoiceable, true)",
      "approved_invoiceable_only",
    ],
    "invoice proposal material gate",
  );
});
