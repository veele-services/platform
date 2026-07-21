import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("tenant backoffice finance PDF and CSV downloads are wired", () => {
  const pdfStyle = read("artifacts/backoffice/src/lib/pdf-style.ts");
  const invoicePdf = read("artifacts/backoffice/src/lib/invoice-pdf.ts");
  const quotePdf = read("artifacts/backoffice/src/lib/quote-pdf.ts");
  const quoteRoute = read("artifacts/backoffice/src/app/api/quotes/[id]/pdf/route.ts");
  const invoiceActions = read("artifacts/backoffice/src/app/actions/invoices.ts");
  const quoteActions = read("artifacts/backoffice/src/app/actions/quotes.ts");
  const invoiceView = read("artifacts/backoffice/src/components/invoices/InvoicesView.tsx");
  const quoteView = read("artifacts/backoffice/src/components/quotes/QuotesView.tsx");

  assert.match(pdfStyle, /drawPdfHeader/u);
  assert.match(pdfStyle, /drawPdfFooter/u);
  assert.match(pdfStyle, /drawPdfTotalPanel/u);
  assert.match(invoicePdf, /const brandName = companyDisplayName\(invoice\)/u);
  assert.match(invoicePdf, /drawPdfHeader\(doc,\s*\{\s*title: "FACTUUR"/u);
  assert.match(invoicePdf, /brandTitle: brandName\.toUpperCase\(\)/u);
  assert.match(quotePdf, /const brandName = quote\.brandName\?\.trim\(\) \|\| "Fieldgrid"/u);
  assert.match(quotePdf, /drawPdfHeader\(doc,\s*\{\s*title: "OFFERTE"/u);
  assert.match(quotePdf, /brandTitle: brandName\.toUpperCase\(\)/u);

  assert.match(quoteRoute, /hasPermission\("quotes", "read"\)/u);
  assert.match(quoteRoute, /generateQuotePdf\(quote\)/u);
  assert.match(quoteRoute, /Content-Type":\s+"application\/pdf"/u);
  assert.match(quoteRoute, /sanitizePdfFilename/u);

  assert.match(invoiceActions, /export async function exportInvoices/u);
  assert.match(invoiceActions, /const EXPORT_LIMIT = 5000/u);
  assert.match(invoiceActions, /action:\s+"export_csv"/u);
  assert.match(quoteActions, /export async function exportQuotes/u);
  assert.match(quoteActions, /const EXPORT_LIMIT = 5000/u);
  assert.match(quoteActions, /resource:\s+"quotes"/u);

  assert.match(invoiceView, /CSV downloaden/u);
  assert.match(invoiceView, /exportInvoices/u);
  assert.match(quoteView, /CSV downloaden/u);
  assert.match(quoteView, /exportQuotes/u);
  assert.match(quoteView, /\/backoffice-api\/quotes\/\$\{row\.id\}\/pdf/u);
});

test("customer portal quote and invoice PDFs use secured enterprise styling", () => {
  const pdfStyle = read("artifacts/klant-pwa/src/lib/pdf-style.ts");
  const invoicePdf = read("artifacts/klant-pwa/src/lib/invoice-pdf.ts");
  const quotePdf = read("artifacts/klant-pwa/src/lib/quote-pdf.ts");
  const invoiceRoute = read("artifacts/klant-pwa/src/app/api/factuur/[id]/pdf/route.ts");
  const quoteRoute = read("artifacts/klant-pwa/src/app/api/offerte/[id]/pdf/route.ts");
  const batchRoute = read("artifacts/klant-pwa/src/app/api/verzamelfactuur/[id]/pdf/route.ts");
  const offersPage = read("artifacts/klant-pwa/src/app/(app)/offertes/page.tsx");
  const assignmentsPage = read("artifacts/klant-pwa/src/app/(app)/opdrachten/page.tsx");
  const assignmentDetail = read("artifacts/klant-pwa/src/app/(app)/opdrachten/[id]/page.tsx");

  assert.match(pdfStyle, /drawPdfHeader/u);
  assert.match(pdfStyle, /drawPdfRecipientPanel/u);
  assert.match(invoicePdf, /brandName\?: string \| null/u);
  assert.match(invoicePdf, /drawPdfHeader\(doc,\s*\{\s*title: "FACTUUR"/u);
  assert.match(quotePdf, /brandName\?: string \| null/u);
  assert.match(quotePdf, /drawPdfHeader\(doc,\s*\{\s*title: "OFFERTE"/u);
  assert.match(batchRoute, /getTenantBranding\(identity\.tenantId\)/u);
  assert.match(batchRoute, /drawPdfHeader\(doc,\s*\{\s*title: "VERZAMELFACTUUR"/u);

  assert.match(invoiceRoute, /getMyCustomerIdentity\(\)/u);
  assert.match(invoiceRoute, /getTenantBranding\(identity\.tenantId\)/u);
  assert.match(invoiceRoute, /sanitizePdfFilename/u);
  assert.match(quoteRoute, /getMyCustomerIdentity\(\)/u);
  assert.match(quoteRoute, /getTenantBranding\(identity\.tenantId\)/u);
  assert.match(quoteRoute, /eq\(quotesTable\.customerId, identity\.customerId\)/u);
  assert.match(quoteRoute, /eq\(assignmentsTable\.tenantId, identity\.tenantId\)/u);
  assert.match(quoteRoute, /inArray\(quotesTable\.status, CUSTOMER_VISIBLE_QUOTE_STATUSES\)/u);
  assert.match(quoteRoute, /customer_download_quote_pdf/u);
  assert.match(quoteRoute, /Content-Type": "application\/pdf"/u);

  assert.match(offersPage, /\/api\/offerte\/\$\{quote\.id\}\/pdf/u);
  assert.match(assignmentsPage, /\/api\/offerte\/\$\{assignment\.quoteId\}\/pdf/u);
  assert.match(assignmentDetail, /\/api\/offerte\/\$\{quote\.id\}\/pdf/u);
});
