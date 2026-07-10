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
const finalization = read("lib/db/src/invoice-finalization.ts");
const numbering = read("lib/db/src/invoice-numbering.ts");
const migration = read("lib/db/migrations/20260710130000_invoice_finalization_immutability.sql");

test("Sprint 3 keeps drafts numberless until finalization", () => {
  const create = functionBlock(invoices, "createInvoice");
  const valuesStart = create.indexOf(".values({");
  const returningStart = create.indexOf(".returning({ id: invoicesTable.id })", valuesStart);
  const insertValues = create.slice(valuesStart, returningStart);

  assert.match(create, /status:\s+"draft"/u);
  assert.doesNotMatch(insertValues, /invoiceNumber/u);
  assert.doesNotMatch(insertValues, /invoiceDate/u);
  assert.doesNotMatch(insertValues, /finalizedAt/u);
});

test("Sprint 3 finalization claims exactly once and captures immutable snapshots", () => {
  const finalize = functionBlock(finalization, "finalizeOfficialInvoice");

  assert.match(finalize, /await client\.query\("BEGIN"\)/u);
  assert.match(finalize, /WHERE id = \$1 AND tenant_id = \$2\s+FOR UPDATE/u);
  assert.match(finalize, /if \(invoice\.finalized_at && invoice\.invoice_number\?\.trim\(\) && hasSnapshots\)/u);
  assert.match(finalize, /alreadyFinalized:\s+true/u);
  assert.match(finalize, /claimOfficialInvoiceNumberInTransaction\(client/u);
  assert.match(finalize, /tenant_company_settings/u);
  assert.match(finalize, /invoice_numbering_settings/u);
  assert.match(finalize, /invoice_payment_settings/u);
  assert.match(finalize, /invoice_template_settings/u);
  assert.match(finalization, /INSERT INTO public\.invoice_line_item_snapshots/u);
  assert.match(finalize, /company_snapshot_json = COALESCE\(company_snapshot_json, \$1::jsonb\)/u);
  assert.match(finalize, /invoice_settings_snapshot_json = COALESCE\(invoice_settings_snapshot_json, \$2::jsonb\)/u);
  assert.match(finalize, /payment_settings_snapshot_json = COALESCE\(payment_settings_snapshot_json, \$3::jsonb\)/u);
  assert.match(finalize, /template_snapshot_json = COALESCE\(template_snapshot_json, \$4::jsonb\)/u);
  assert.match(finalize, /finalized_at = COALESCE\(finalized_at, now\(\)\)/u);
  assert.match(finalize, /action,\s+resource,\s+resource_id/u);
  assert.match(finalize, /'finalize_invoice', 'invoices'/u);
  assert.match(finalize, /await client\.query\("COMMIT"\)/u);
  assert.match(finalize, /await client\.query\("ROLLBACK"\)/u);
});

test("Sprint 3 number claim can run inside finalization without finalizing early", () => {
  assert.match(numbering, /export async function claimOfficialInvoiceNumberInTransaction/u);
  assert.match(numbering, /export async function claimOfficialInvoiceNumber/u);
  assert.match(numbering, /const claimed = await claimOfficialInvoiceNumberInTransaction\(client, input\)/u);
  const claim = functionBlock(numbering, "claimOfficialInvoiceNumberInTransaction");
  assert.doesNotMatch(claim, /finalized_at = COALESCE\(finalized_at, now\(\)\)/u);
});

test("Sprint 3 existing send flow finalizes before sending and keeps current UI workflow", () => {
  const sent = functionBlock(invoices, "markInvoiceSent");

  assert.match(sent, /invoice\.status !== "draft"/u);
  assert.match(sent, /const finalized = await finalizeOfficialInvoice\(\{ invoiceId, tenantId, actorUserId: user\.id \}\)/u);
  assert.ok(
    sent.indexOf("finalizeOfficialInvoice({ invoiceId, tenantId, actorUserId: user.id })") <
      sent.indexOf(".set({ status: \"sent\", updatedAt: new Date() })"),
    "finalization must happen before status changes to sent",
  );
  assert.match(sent, /\.set\(\{ status: "sent", updatedAt: new Date\(\) \}\)/u);
  assert.match(sent, /eventKey:\s+"invoice_sent"/u);
});

test("Sprint 3 database migration protects finalized invoice data and line snapshots", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.fieldgrid_prevent_finalized_invoice_mutation/u);
  assert.match(migration, /IF OLD\.finalized_at IS NOT NULL/u);
  assert.match(migration, /NEW\.invoice_number IS DISTINCT FROM OLD\.invoice_number/u);
  assert.match(migration, /NEW\.company_snapshot_json IS DISTINCT FROM OLD\.company_snapshot_json/u);
  assert.match(migration, /NEW\.invoice_settings_snapshot_json IS DISTINCT FROM OLD\.invoice_settings_snapshot_json/u);
  assert.match(migration, /NEW\.payment_settings_snapshot_json IS DISTINCT FROM OLD\.payment_settings_snapshot_json/u);
  assert.match(migration, /NEW\.template_snapshot_json IS DISTINCT FROM OLD\.template_snapshot_json/u);
  assert.match(migration, /CREATE TRIGGER prevent_finalized_invoice_mutation/u);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.fieldgrid_prevent_finalized_invoice_line_snapshot_mutation/u);
  assert.match(migration, /CREATE TRIGGER prevent_finalized_invoice_line_snapshot_insert/u);
  assert.match(migration, /CREATE TRIGGER prevent_finalized_invoice_line_snapshot_update/u);
  assert.match(migration, /CREATE TRIGGER prevent_finalized_invoice_line_snapshot_delete/u);
});
