import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("phase 9 adds shared customer finance workspace primitives", () => {
  const primitives = read("artifacts/klant-pwa/src/components/FinanceWorkspace.tsx");

  for (const marker of [
    "FinanceSummaryStrip",
    "FinanceSectionHeader",
    "FinanceActionPanel",
  ]) {
    assert.match(primitives, new RegExp(marker, "u"));
  }
});

test("phase 9 makes the customer finance landing page action oriented", () => {
  const finance = read("artifacts/klant-pwa/src/app/(app)/financieel/page.tsx");

  for (const marker of [
    "PortalPageShell",
    "FinanceSummaryStrip",
    "Openstaand saldo",
    "Vervallen",
    "Binnenkort te betalen",
    "Laatste betaling",
    "Financiele inbox",
    "getMyInvoices",
    "getMyPayments",
    "getMyPaymentBatches",
    "getMyQuotes",
  ]) {
    assert.match(finance, new RegExp(marker, "u"));
  }

  assert.doesNotMatch(finance, /from "@\/components\/PageShell"/u);
});

test("phase 9 keeps invoice payment and PDF flows while compacting batch payment", () => {
  const invoices = read("artifacts/klant-pwa/src/app/(app)/facturen/page.tsx");
  const batchPanel = read("artifacts/klant-pwa/src/components/InvoiceBatchPaymentPanel.tsx");

  for (const marker of [
    "FinanceSummaryStrip",
    "Openstaand saldo",
    "Vervallen",
    "Binnenkort",
    "InvoiceBatchPaymentPanel",
    "PaymentActionButton",
    "/api/factuur/${invoice.id}/pdf",
  ]) {
    assert.match(invoices, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  }

  for (const marker of [
    "Verzamelbetaling starten",
    "Verzamelfactuur wizard",
    "Selecteer facturen",
    "Controleer totaal",
    "fixed inset-0",
    "PaymentActionButton",
  ]) {
    assert.match(batchPanel, new RegExp(marker, "u"));
  }
});

test("phase 9 aligns customer payments and quotes with the finance pattern", () => {
  const payments = read("artifacts/klant-pwa/src/app/(app)/betalingen/page.tsx");
  const quotes = read("artifacts/klant-pwa/src/app/(app)/offertes/page.tsx");

  for (const marker of [
    "FinanceSummaryStrip",
    "Open betalingen",
    "Betaald totaal",
    "Niet afgerond",
    "Laatste betaling",
    "FinanceSectionHeader",
    "/api/verzamelfactuur/${batch.id}/pdf",
  ]) {
    assert.match(payments, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  }

  for (const marker of [
    "FinanceSummaryStrip",
    "Actie vereist",
    "Ter beoordeling",
    "Goedgekeurd",
    "Verlopen",
    "FinanceActionPanel",
    "Te beoordelen offertes",
    "OfferteActieButtons",
  ]) {
    assert.match(quotes, new RegExp(marker, "u"));
  }
});
