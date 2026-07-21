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

const actions = read("artifacts/backoffice/src/app/actions/invoice-settings.ts");
const view = read("artifacts/backoffice/src/components/settings/InvoiceSettingsView.tsx");
const testPdfRoute = read("artifacts/backoffice/src/app/api/invoices/test-pdf/route.ts");

test("Sprint 8 invoice settings preview reads the next sequence without claiming a number", () => {
  const getSettings = functionBlock(actions, "getInvoiceSettings");

  assert.match(actions, /invoiceNumberSequencesTable/u);
  assert.match(actions, /previewInvoiceNumber/u);
  assert.match(getSettings, /sequence\?\.nextNumber \?\? numberingSettings\.defaultStartNumber/u);
  assert.match(getSettings, /testPdfUrl:\s+"\/backoffice-api\/invoices\/test-pdf"/u);
  assert.match(getSettings, /warnings:\s+invoiceSettingsWarnings/u);
  assert.doesNotMatch(actions, /claimOfficialInvoiceNumber/u);
  assert.doesNotMatch(actions, /claimOfficialInvoiceNumberInTransaction/u);
});

test("Sprint 8 preview UI shows warnings, branding and a test PDF download", () => {
  assert.match(view, /InvoicePreviewCard/u);
  assert.match(view, /settings\.preview\.warnings\.length > 0/u);
  assert.match(view, /Controleer deze instellingen/u);
  assert.match(view, /settings\.template\.primaryColor \|\| settings\.company\.primaryColor/u);
  assert.match(view, /settings\.template\.logoUrl \|\| settings\.company\.logoUrl/u);
  assert.match(view, /href=\{settings\.preview\.testPdfUrl\}/u);
  assert.match(view, /Test-PDF downloaden/u);
  assert.match(view, /Geen sequence claim/u);
});

test("Sprint 8 test PDF route generates a preview PDF without writing invoices", () => {
  const body = functionBlock(testPdfRoute, "GET");

  assert.match(testPdfRoute, /hasPermission\("settings", "read"\)/u);
  assert.match(testPdfRoute, /getInvoiceSettings\(\)/u);
  assert.match(testPdfRoute, /generateInvoicePdf\(sampleInvoice\(settings\)\)/u);
  assert.match(testPdfRoute, /TEST-\$\{settings\.preview\.invoiceNumber\}/u);
  assert.match(testPdfRoute, /new NextResponse\(new Uint8Array\(pdfBuffer\)/u);
  assert.match(testPdfRoute, /testfactuur-preview\.pdf/u);
  assert.doesNotMatch(testPdfRoute, /db\.insert|invoicesTable|claimOfficialInvoiceNumber/u);
  assert.match(body, /Cache-Control": "private, no-store, max-age=0"/u);
});

test("Sprint 8 missing invoice settings warnings are explicit", () => {
  for (const warning of [
    "Bedrijfsnaam ontbreekt.",
    "Adresgegevens zijn niet volledig.",
    "KVK-nummer ontbreekt.",
    "BTW-nummer ontbreekt.",
    "IBAN ontbreekt.",
    "Administratie e-mail ontbreekt.",
    "Logo staat aan, maar er is nog geen logo-URL ingesteld.",
  ]) {
    assert.match(actions, new RegExp(warning.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  }
});
