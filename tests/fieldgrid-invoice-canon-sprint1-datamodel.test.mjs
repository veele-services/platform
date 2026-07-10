import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const schema = read("lib/db/src/schema/invoices.ts");
const migration = read("lib/db/migrations/20260710110000_invoice_canon_datamodel.sql");

test("Sprint 1 schema exposes all canonical invoice settings tables", () => {
  for (const table of [
    "tenantCompanySettingsTable",
    "invoiceNumberingSettingsTable",
    "invoiceNumberSequencesTable",
    "invoicePaymentSettingsTable",
    "invoiceTemplateSettingsTable",
    "invoiceLineItemSnapshotsTable",
  ]) {
    assert.match(schema, new RegExp(`export const ${table} = pgTable`, "u"), `${table} should be exported`);
  }

  for (const column of [
    "legalName",
    "kvkNumber",
    "vatNumber",
    "iban",
    "defaultPaymentTermDays",
    "prefix",
    "numberPadding",
    "resetPeriod",
    "defaultStartNumber",
    "paymentProvider",
    "mollieEnabled",
    "showPaymentQrOnInvoice",
    "paymentInstruction",
  ]) {
    assert.match(schema, new RegExp(`${column}:`, "u"), `${column} should be present in schema`);
  }
});

test("Sprint 1 migration safely removes old global numbering and keeps tenant uniqueness", () => {
  assert.match(migration, /DROP CONSTRAINT IF EXISTS invoices_invoice_number_unique/u);
  assert.match(migration, /DROP TRIGGER IF EXISTS trg_invoices_set_number/u);
  assert.match(migration, /ALTER COLUMN invoice_number DROP NOT NULL/u);
  assert.match(migration, /ALTER COLUMN invoice_number DROP DEFAULT/u);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS invoices_tenant_invoice_number_unique_idx/u);
  assert.match(migration, /ON public\.invoices\(tenant_id, invoice_number\)/u);
  assert.match(migration, /WHERE invoice_number IS NOT NULL AND invoice_number <> ''/u);
});

test("Sprint 1 migration backfills settings and sequence metadata without rewriting numbers", () => {
  assert.match(migration, /INSERT INTO public\.tenant_company_settings/u);
  assert.match(migration, /LEFT JOIN public\.organization_settings/u);
  assert.match(migration, /INSERT INTO public\.invoice_numbering_settings/u);
  assert.match(migration, /UPDATE public\.invoices invoice\s+SET\s+invoice_numbering_settings_id/u);
  assert.match(migration, /substring\(invoice\.invoice_number from '\(\[0-9\]\+\)\$'\)/u);
  assert.match(migration, /INSERT INTO public\.invoice_number_sequences/u);
  assert.doesNotMatch(migration, /SET\s+invoice_number\s*=/u, "migration must not rewrite existing invoice numbers");
});

test("Sprint 1 constraints protect invoice settings values", () => {
  for (const constraint of [
    "tenant_company_settings_payment_term_check",
    "invoice_numbering_settings_prefix_check",
    "invoice_numbering_settings_format_check",
    "invoice_numbering_settings_padding_check",
    "invoice_numbering_settings_start_check",
    "invoice_numbering_settings_reset_check",
    "invoice_number_sequences_next_number_check",
    "invoice_payment_settings_provider_check",
    "invoices_payment_status_check",
  ]) {
    assert.match(migration, new RegExp(constraint, "u"), `${constraint} should be created`);
  }

  assert.match(migration, /CHECK \(number_padding BETWEEN 3 AND 8\)/u);
  assert.match(migration, /CHECK \(default_start_number BETWEEN 1 AND 99999999\)/u);
  assert.match(migration, /CHECK \(reset_period IN \('never', 'yearly', 'monthly'\)\)/u);
  assert.match(migration, /CHECK \(payment_provider IN \('none', 'mollie'\)\)/u);
});
