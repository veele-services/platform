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

const invoices = read("artifacts/backoffice/src/app/actions/invoices.ts");
const createInvoiceForm = read("artifacts/backoffice/src/components/invoices/CreateInvoiceForm.tsx");
const invoiceActions = read("artifacts/backoffice/src/components/invoices/InvoiceActions.tsx");
const invoiceDetail = read("artifacts/backoffice/src/app/(dashboard)/invoices/[id]/page.tsx");
const assignmentDetail = read("artifacts/backoffice/src/app/(dashboard)/assignments/[id]/page.tsx");
const invoicesView = read("artifacts/backoffice/src/components/invoices/InvoicesView.tsx");
const processStatus = read("artifacts/backoffice/src/lib/process-status.ts");

test("Sprint 5 uses tenant invoice payment terms while keeping draft numbers empty", () => {
  const create = functionBlock(invoices, "createInvoice");
  const valuesStart = create.indexOf(".values({");
  const returningStart = create.indexOf(".returning({ id: invoicesTable.id })", valuesStart);
  const insertValues = create.slice(valuesStart, returningStart);

  assert.match(invoices, /tenantCompanySettingsTable/u);
  assert.match(invoices, /async function getDefaultInvoiceDueDate/u);
  assert.match(invoices, /defaultPaymentTermDays: tenantCompanySettingsTable\.defaultPaymentTermDays/u);
  assert.match(invoices, /normalizePaymentTermDays\(settings\?\.defaultPaymentTermDays\)/u);
  assert.match(create, /const explicitDueDate = data\.dueDate\?\.trim\(\)/u);
  assert.match(create, /getDefaultInvoiceDueDate\(tenantId\)/u);
  assert.match(insertValues, /dueDate,/u);
  assert.doesNotMatch(insertValues, /invoiceNumber/u);
  assert.doesNotMatch(insertValues, /finalizedAt/u);

  assert.match(assignmentDetail, /getInvoiceDefaultPaymentTermDays/u);
  assert.match(assignmentDetail, /defaultPaymentTermDays=\{invoiceDefaultPaymentTermDays\}/u);
  assert.match(createInvoiceForm, /defaultDueDate\(defaultPaymentTermDays\)/u);
  assert.match(createInvoiceForm, /Concept bewaren/u);
});

test("Sprint 5 separates finalization from sending and keeps send backwards compatible", () => {
  const finalize = functionBlock(invoices, "finalizeInvoiceDraft");
  const sent = functionBlock(invoices, "markInvoiceSent");

  assert.match(finalize, /requirePermission\("invoices", "write"\)/u);
  assert.match(finalize, /invoice\.status !== "draft"/u);
  assert.match(finalize, /finalizeOfficialInvoice\(\{ invoiceId, tenantId, actorUserId: user\.id \}\)/u);
  assert.match(finalize, /data: \{ invoiceNumber: finalized\.invoiceNumber \}/u);

  assert.match(sent, /invoice\.status !== "draft"/u);
  assert.match(sent, /let claimedInvoiceNumber = invoice\.invoiceNumber \?\? ""/u);
  assert.match(sent, /if \(!invoice\.finalizedAt \|\| !invoice\.invoiceNumber\?\.trim\(\)\)/u);
  assert.match(sent, /finalizeOfficialInvoice\(\{ invoiceId, tenantId, actorUserId: user\.id \}\)/u);
  assert.match(sent, /\.set\(\{ status: "sent", updatedAt: new Date\(\) \}\)/u);
  assert.match(sent, /\.set\(\{ status: "invoiced", updatedAt: new Date\(\) \}\)/u);
  assert.match(sent, /eventKey:\s+"invoice_sent"/u);
});

test("Sprint 5 exposes calm canon actions and preserves old invoice visibility", () => {
  assert.match(invoiceActions, /finalizeInvoiceDraft/u);
  for (const label of ["Finaliseren", "Verzenden", "Betaald markeren", "Annuleren"]) {
    assert.match(invoiceActions, new RegExp(label, "u"));
  }
  assert.match(invoiceDetail, /finalizedAt=\{invoice\.finalizedAt\}/u);
  assert.match(invoiceDetail, /invoiceNumber=\{invoice\.officialInvoiceNumber\}/u);

  assert.match(invoices, /displayInvoiceNumber\(row\.invoiceNumber, `Factuur-\$\{row\.id\.slice\(0, 8\)\}`\)/u);
  assert.match(invoices, /officialInvoiceNumber: row\.invoiceNumber \?\? null/u);
  assert.match(invoicesView, /label: "Concepten"/u);
  assert.match(processStatus, /value: "draft", label: "Concept"/u);
  assert.match(processStatus, /value: "sent", label: "Verzonden"/u);
  assert.match(processStatus, /value: "paid", label: "Betaald"/u);
  assert.match(processStatus, /value: "cancelled", label: "Geannuleerd"/u);
});
