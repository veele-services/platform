import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const LIST_PAGES = [
  "artifacts/klant-pwa/src/app/(app)/objecten/page.tsx",
  "artifacts/klant-pwa/src/app/(app)/opdrachten/page.tsx",
  "artifacts/klant-pwa/src/app/(app)/facturen/page.tsx",
  "artifacts/klant-pwa/src/app/(app)/betalingen/page.tsx",
  "artifacts/klant-pwa/src/app/(app)/offertes/page.tsx",
  "artifacts/klant-pwa/src/app/(app)/documenten/page.tsx",
  "artifacts/klant-pwa/src/app/(app)/rapporten/page.tsx",
  "artifacts/klant-pwa/src/app/(app)/meldingen/tickets/page.tsx",
];

test("phase 7 migrates customer core lists to shared portal primitives", () => {
  for (const path of LIST_PAGES) {
    const source = read(path);

    assert.match(source, /PortalPageShell/u, `${path} should use PortalPageShell`);
    assert.match(source, /PortalToolbar/u, `${path} should use PortalToolbar`);
    assert.match(source, /PortalFilterSheet/u, `${path} should use PortalFilterSheet`);
    assert.match(source, /PortalActiveFilterChips/u, `${path} should use active filter chips`);
    assert.match(source, /PortalDataList/u, `${path} should use PortalDataList`);
    assert.match(source, /PortalActionMenu/u, `${path} should expose row actions`);
    assert.match(source, /searchParams: Promise/u, `${path} should preserve URL-driven filters`);
    assert.match(source, /renderMobileCard/u, `${path} should define mobile card rendering`);
    assert.doesNotMatch(source, /from "@\/components\/PageShell"/u, `${path} should not use legacy PageShell`);
  }
});

test("phase 7 keeps existing customer actions in the migrated lists", () => {
  const objects = read("artifacts/klant-pwa/src/app/(app)/objecten/page.tsx");
  const assignments = read("artifacts/klant-pwa/src/app/(app)/opdrachten/page.tsx");
  const invoices = read("artifacts/klant-pwa/src/app/(app)/facturen/page.tsx");
  const payments = read("artifacts/klant-pwa/src/app/(app)/betalingen/page.tsx");
  const quotes = read("artifacts/klant-pwa/src/app/(app)/offertes/page.tsx");
  const documents = read("artifacts/klant-pwa/src/app/(app)/documenten/page.tsx");
  const reports = read("artifacts/klant-pwa/src/app/(app)/rapporten/page.tsx");
  const tickets = read("artifacts/klant-pwa/src/app/(app)/meldingen/tickets/page.tsx");

  assert.match(objects, /href="\/objecten\/nieuw"/u);
  assert.match(objects, /href=\{`\/opdrachten\/aanvragen\?object=\$\{object\.id\}`\}/u);

  assert.match(assignments, /OfferteActieButtons/u);
  assert.match(assignments, /href="\/opdrachten\/aanvragen"/u);

  assert.match(invoices, /PaidBanner/u);
  assert.match(invoices, /InvoiceBatchPaymentPanel/u);
  assert.match(invoices, /PaymentActionButton/u);
  assert.match(invoices, /\/api\/factuur\/\$\{invoice\.id\}\/pdf/u);

  assert.match(payments, /getMyPaymentBatches/u);
  assert.match(payments, /PaymentActionButton/u);
  assert.match(payments, /\/api\/verzamelfactuur\/\$\{batch\.id\}\/pdf/u);

  assert.match(quotes, /OfferteRegelitems/u);
  assert.match(quotes, /OfferteActieButtons/u);

  assert.match(documents, /DocumentDownloadButton/u);
  assert.match(reports, /href=\{`\/opdrachten\/\$\{report\.assignmentId\}`\}/u);

  assert.match(tickets, /NewTicketForm/u);
  assert.match(tickets, /href=\{`\/meldingen\/tickets\/\$\{ticket\.id\}`\}/u);
});

test("phase 7 removes known legacy mojibake from migrated list pages", () => {
  for (const path of LIST_PAGES) {
    const source = read(path);
    assert.doesNotMatch(source, /Â|â/u, `${path} should not contain mojibake`);
  }
});
