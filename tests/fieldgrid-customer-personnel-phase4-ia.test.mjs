import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("phase 4 defines the customer desktop navigation around daily tasks", () => {
  const sidebar = read("artifacts/klant-pwa/src/components/DesktopSidebar.tsx");

  for (const label of ["Overzicht", "Opdrachten", "Objecten", "Support", "Offertes", "Facturen", "Documenten"]) {
    assert.match(sidebar, new RegExp(`label:\\s*"${label}"`, "u"));
  }

  assert.match(sidebar, /href:\s*"\/facturen"[\s\S]*match:\s*\["\/financieel", "\/facturen", "\/betalingen"\]/u);
  assert.match(sidebar, /href:\s*"\/offertes"[\s\S]*match:\s*\["\/offertes"\]/u);
  assert.match(sidebar, /href:\s*"\/meldingen\/tickets"[\s\S]*label:\s*"Support"/u);
  assert.doesNotMatch(sidebar, /label:\s*"Afspraken"/u);
  assert.doesNotMatch(sidebar, /label:\s*"Aanvragen"/u);
});

test("phase 4 keeps mobile navigation compact and moves secondary areas to Meer", () => {
  const bottomNav = read("artifacts/klant-pwa/src/components/BottomNav.tsx");
  const morePage = read("artifacts/klant-pwa/src/app/(app)/meer/page.tsx");

  for (const label of ["Overzicht", "Opdrachten", "Objecten", "Support", "Meer"]) {
    assert.match(bottomNav, new RegExp(`label:\\s*"${label}"`, "u"));
  }

  assert.doesNotMatch(bottomNav, /label:\s*"Aanvragen"/u);
  assert.doesNotMatch(bottomNav, /label:\s*"Meldingen"/u);
  assert.match(morePage, /href:\s*"\/facturen"/u);
  assert.match(morePage, /href:\s*"\/offertes"/u);
  assert.match(morePage, /href:\s*"\/documenten"/u);
  assert.match(morePage, /href:\s*"\/meldingen\/tickets"/u);
  assert.doesNotMatch(morePage, /ticketfunctie[\s\S]*later/u);
});

test("phase 4 adds a finance hub for invoices payments and quotes", () => {
  const financePagePath = "artifacts/klant-pwa/src/app/(app)/financieel/page.tsx";
  assert.ok(existsSync(new URL(`../${financePagePath}`, import.meta.url)));

  const financePage = read(financePagePath);
  assert.match(financePage, /title="Financieel"/u);
  assert.match(financePage, /getMyInvoices/u);
  assert.match(financePage, /getMyPayments/u);
  assert.match(financePage, /getMyPaymentBatches/u);
  assert.match(financePage, /getMyQuotes/u);
  assert.match(financePage, /pendingQuotes/u);
  assert.match(financePage, /href="\/facturen"/u);
  assert.match(financePage, /href="\/betalingen"/u);
  assert.match(financePage, /href="\/offertes"/u);
});

test("phase 4 sends contact actions directly to support and documents module decisions", () => {
  const dashboard = read("artifacts/klant-pwa/src/app/(app)/page.tsx");
  const ticketsPage = read("artifacts/klant-pwa/src/app/(app)/meldingen/tickets/page.tsx");
  const docs = read("docs/fieldgrid-customer-portal-phase4-ia.md");

  assert.match(dashboard, /href="\/meldingen\/tickets"/u);
  assert.match(dashboard, /title="Support"/u);
  assert.match(ticketsPage, /title="Support"/u);

  for (const moduleKey of ["finance", "documents", "reporting"]) {
    assert.ok(docs.includes(`\`${moduleKey}\``), `docs must mention ${moduleKey}`);
  }
  assert.match(docs, /Meer -> Facturen/u);
  assert.match(docs, /Meer -> Offertes/u);
  assert.match(docs, /Meer -> Documenten/u);
});
