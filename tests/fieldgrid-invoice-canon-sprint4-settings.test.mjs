import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const page = read("artifacts/backoffice/src/app/(dashboard)/instellingen/facturen/page.tsx");
const view = read("artifacts/backoffice/src/components/settings/InvoiceSettingsView.tsx");
const actions = read("artifacts/backoffice/src/app/actions/invoice-settings.ts");
const settingsTabs = read("artifacts/backoffice/src/components/settings/SettingsTabs.tsx");
const settingsIndex = read("artifacts/backoffice/src/app/(dashboard)/settings/page.tsx");

test("Sprint 4 exposes tenant invoice settings route and settings navigation", () => {
  assert.match(page, /export const metadata: Metadata = \{ title: "Factuurinstellingen" \}/u);
  assert.match(page, /hasPermission\("settings", "read"\)/u);
  assert.match(page, /hasPermission\("settings", "write"\)/u);
  assert.match(page, /getInvoiceSettings\(\)/u);
  assert.match(page, /<InvoiceSettingsView settings=\{settings\} canWrite=\{canWrite\}/u);
  assert.match(settingsTabs, /href: "\/instellingen\/facturen"/u);
  assert.match(settingsTabs, /label: "Facturen"/u);
  assert.match(settingsIndex, /href="\/instellingen\/facturen"/u);
});

test("Sprint 4 invoice settings UI has required cards and preview", () => {
  for (const label of ["Bedrijfsgegevens", "Factuurnummering", "Opmaak", "Betaling", "Mollie", "Preview"]) {
    assert.match(view, new RegExp(label, "u"));
  }
  assert.match(view, /updateInvoiceCompanySettings/u);
  assert.match(view, /updateInvoiceNumberingSettings/u);
  assert.match(view, /updateInvoiceTemplateSettings/u);
  assert.match(view, /updateInvoicePaymentSettings/u);
  assert.match(view, /settings\.preview\.invoiceNumber/u);
});

test("Sprint 4 server actions validate invoice numbering and reject invalid formats", () => {
  assert.match(actions, /requirePermission\("settings", "write"\)/u);
  assert.match(actions, /validateInvoiceNumberingConfig\(settings\)/u);
  assert.match(actions, /if \(!validation\.valid\) return \{ success: false, message: validation\.errors\.join\(" "\) \}/u);
  assert.match(actions, /prefix: data\.prefix\.trim\(\)\.toUpperCase\(\)/u);
  assert.match(actions, /numberPadding: normalizeNumber\(data\.numberPadding, 4, 3, 8\)/u);
  assert.match(actions, /defaultStartNumber: normalizeNumber\(data\.defaultStartNumber, 1, 1, 99999999\)/u);
});

test("Sprint 4 writes audit rows for every invoice settings change", () => {
  assert.match(actions, /async function writeAudit/u);
  assert.match(actions, /resource: "invoice_settings"/u);
  for (const action of [
    "update_invoice_company_settings",
    "update_invoice_numbering_settings",
    "update_invoice_template_settings",
    "update_invoice_payment_settings",
  ]) {
    assert.match(actions, new RegExp(`action: "${action}"`, "u"));
  }
  assert.match(actions, /tenantId: input\.tenantId/u);
  assert.match(actions, /userId: input\.userId/u);
});
