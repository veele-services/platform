import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const engineSource = read("lib/db/src/invoice-numbering.ts");
const formattingSource = read("lib/db/src/invoice-number-formatting.ts");
const sprint1Migration = read("lib/db/migrations/20260710110000_invoice_canon_datamodel.sql");
const sprint2Migration = read("lib/db/migrations/20260710120000_invoice_numbering_engine_guards.sql");
const invoiceActions = read("artifacts/backoffice/src/app/actions/invoices.ts");

test("Sprint 2 numbering validates prefixes, tokens, padding and start numbers", () => {
  assert.match(formattingSource, /INVOICE_NUMBER_ALLOWED_TOKENS = \["PREFIX", "YYYY", "YY", "MM", "NUMBER"\] as const/u);
  assert.match(formattingSource, /const PREFIX_PATTERN = \/\^\[A-Z\]\{3\}\$\/u/u);
  assert.match(formattingSource, /format\.includes\("\{PREFIX\}"\)/u);
  assert.match(formattingSource, /format\.includes\("\{NUMBER\}"\)/u);
  assert.match(formattingSource, /Onbekende factuurnummertoken: \{\$\{token\}\}/u);
  assert.match(formattingSource, /padding < 3 \|\| padding > 8/u);
  assert.match(formattingSource, /startNumber < 1/u);
  assert.match(formattingSource, /INVOICE_NUMBER_RESET_PERIODS\.includes/u);
  assert.match(formattingSource, /\.replaceAll\("\{PREFIX\}", config\.prefix\)/u);
  assert.match(formattingSource, /\.replaceAll\("\{YYYY\}", parts\.yyyy\)/u);
  assert.match(formattingSource, /\.replaceAll\("\{YY\}", parts\.yy\)/u);
  assert.match(formattingSource, /\.replaceAll\("\{MM\}", parts\.mm\)/u);
  assert.match(formattingSource, /\.replaceAll\("\{NUMBER\}", number\)/u);
  assert.match(formattingSource, /String\(sequenceValue\)\.padStart\(config\.numberPadding, "0"\)/u);
});

test("Sprint 2 numbering computes reset periods and previews without claiming", () => {
  assert.match(formattingSource, /case "never":\s+return "all"/u);
  assert.match(formattingSource, /case "yearly":\s+return parts\.yyyy/u);
  assert.match(formattingSource, /case "monthly":\s+return `\$\{parts\.yyyy\}-\$\{parts\.mm\}`/u);
  assert.match(formattingSource, /export function previewInvoiceNumber/u);
  assert.match(formattingSource, /invoiceNumber: formatInvoiceNumber\(config, nextNumber, invoiceDate\)/u);
  assert.match(formattingSource, /sequenceValue: nextNumber/u);
  assert.match(formattingSource, /periodKey: getInvoiceNumberPeriodKey\(config\.resetPeriod, invoiceDate\)/u);
});

test("Sprint 2 database guards mirror the numbering engine", () => {
  assert.match(sprint2Migration, /CHECK \(prefix ~ '\^\[A-Z\]\{3\}\$'\)/u);
  assert.match(sprint2Migration, /position\('\{PREFIX\}' in format\) > 0/u);
  assert.match(sprint2Migration, /position\('\{NUMBER\}' in format\) > 0/u);
  assert.match(sprint2Migration, /regexp_replace\(format, '\\\{\(PREFIX\|YYYY\|YY\|MM\|NUMBER\)\\\}'/u);
  assert.match(sprint2Migration, /number_padding BETWEEN 3 AND 8/u);
  assert.match(sprint2Migration, /default_start_number BETWEEN 1 AND 99999999/u);
  assert.match(sprint2Migration, /reset_period IN \('never', 'yearly', 'monthly'\)/u);
});

test("Sprint 2 claim is transaction safe and tenant scoped", () => {
  assert.match(engineSource, /export async function claimOfficialInvoiceNumber/u);
  assert.match(engineSource, /await client\.query\("BEGIN"\)/u);
  assert.match(engineSource, /pg_advisory_xact_lock\(hashtext\(\$1\), 710201\)/u);
  assert.match(engineSource, /WHERE id = \$1 AND tenant_id = \$2\s+FOR UPDATE/u);
  assert.match(engineSource, /WHERE tenant_id = \$1 AND is_active = true[\s\S]*FOR UPDATE/u);
  assert.match(engineSource, /ON CONFLICT \(tenant_id, numbering_settings_id, period_key\) DO NOTHING/u);
  assert.match(engineSource, /WHERE tenant_id = \$1[\s\S]*numbering_settings_id = \$2[\s\S]*period_key = \$3[\s\S]*FOR UPDATE/u);
  assert.match(engineSource, /SET next_number = next_number \+ 1/u);
  assert.match(engineSource, /SET invoice_number = \$1/u);
  assert.match(engineSource, /invoice_numbering_settings_id = \$2/u);
  assert.match(engineSource, /invoice_number_period_key = \$3/u);
  assert.match(engineSource, /invoice_number_sequence_value = \$4/u);
  assert.match(engineSource, /await client\.query\("COMMIT"\)/u);
  assert.match(engineSource, /await client\.query\("ROLLBACK"\)/u);

  assert.match(sprint1Migration, /ON public\.invoices\(tenant_id, invoice_number\)/u);
  assert.match(sprint1Migration, /WHERE invoice_number IS NOT NULL AND invoice_number <> ''/u);
});

test("Sprint 2 marks invoices as sent only after claiming an official number", () => {
  assert.match(invoiceActions, /finalizeOfficialInvoice/u);
  assert.match(invoiceActions, /const finalized = await finalizeOfficialInvoice\(\{ invoiceId, tenantId, actorUserId: user\.id \}\)/u);
  assert.ok(
    invoiceActions.indexOf("finalizeOfficialInvoice({ invoiceId, tenantId, actorUserId: user.id })") <
      invoiceActions.indexOf(".set({ status: \"sent\", updatedAt: new Date() })"),
    "official number should be finalized before the invoice becomes sent",
  );
  assert.match(invoiceActions, /metadata:\s+\{ assignmentId: invoice\.assignmentId, invoiceNumber: claimedInvoiceNumber \}/u);
});
