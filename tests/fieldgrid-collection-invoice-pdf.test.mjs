import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const customerAppRequire = createRequire(
  new URL("../artifacts/klant-pwa/package.json", import.meta.url),
);
const PDFDocument = customerAppRequire("pdfkit");

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function loadTypeScriptModule(source) {
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  Function("exports", "module", output)(exports, { exports });
  return exports;
}

async function renderFooterFixture(
  pdfStyle,
  pageCount,
  footerText = "Fieldgrid · Verzamelfactuur",
) {
  const doc = new PDFDocument({ size: "A4", margin: 55, bufferPages: true });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));

  const complete = new Promise((resolve) => doc.on("end", resolve));
  for (let page = 1; page < pageCount; page += 1) doc.addPage();
  const before = doc.bufferedPageRange().count;
  pdfStyle.drawPdfFooter(doc, footerText);
  const after = doc.bufferedPageRange().count;
  doc.end();
  await complete;

  return { before, after, buffer: Buffer.concat(chunks) };
}

test("shared PDF footer never creates blank overflow pages", async () => {
  const backofficeStyleSource = read(
    "artifacts/backoffice/src/lib/pdf-style.ts",
  );
  const customerStyleSource = read("artifacts/klant-pwa/src/lib/pdf-style.ts");
  assert.equal(customerStyleSource, backofficeStyleSource);

  const pdfStyle = loadTypeScriptModule(customerStyleSource);
  for (const pageCount of [1, 2, 4]) {
    const fixture = await renderFooterFixture(pdfStyle, pageCount);
    assert.equal(fixture.before, pageCount);
    assert.equal(fixture.after, pageCount);
    assert.equal(fixture.buffer.subarray(0, 5).toString(), "%PDF-");
    assert.match(fixture.buffer.subarray(-16).toString(), /%%EOF/u);
  }

  const longFooter = await renderFooterFixture(
    pdfStyle,
    1,
    "Bedrijfsnaam KvK 12345678 BTW NL001234567B01 IBAN NL00 BANK 0123 4567 89 ".repeat(
      20,
    ),
  );
  assert.equal(longFooter.after, 1);
});

test("collection invoice routes share the professional document contract", () => {
  const routes = [
    read("artifacts/backoffice/src/app/api/invoices/batches/[id]/pdf/route.ts"),
    read("artifacts/klant-pwa/src/app/api/verzamelfactuur/[id]/pdf/route.ts"),
  ];

  for (const route of routes) {
    assert.match(
      route,
      /collectionNumber: customerPaymentBatchesTable\.collectionNumber/u,
    );
    assert.match(
      route,
      /invoiceNumberSnapshot:\s+customerPaymentBatchItemsTable\.invoiceNumberSnapshot/u,
    );
    assert.match(
      route,
      /invoiceDateSnapshot: customerPaymentBatchItemsTable\.invoiceDateSnapshot/u,
    );
    assert.match(route, /invoiceDate: invoicesTable\.invoiceDate/u);
    assert.match(route, /invoiceCreatedAt: invoicesTable\.createdAt/u);
    assert.match(
      route,
      /item\.invoiceDateSnapshot \?\?\s+item\.invoiceDate \?\?\s+item\.invoiceCreatedAt/u,
    );
    assert.doesNotMatch(
      route,
      /item\.invoiceDateSnapshot \?\? item\.scheduledDate/u,
    );
    assert.match(route, /primaryColor: branding\.primaryColor/u);
    assert.match(route, /accentColor: branding\.accentColor/u);
    assert.match(route, /drawCollectionContinuation/u);
    assert.match(route, /doc\.heightOfString/u);
    assert.match(route, /batch\.discountCents > 0/u);
    assert.match(route, /batch\.surchargeCents > 0/u);
    assert.match(route, /displayBatchStatus\(batch\.status\)/u);
    assert.match(route, /filenameReference/u);
    assert.doesNotMatch(route, /Administratieve notitie/u);
  }

  const pdfStyle = read("artifacts/backoffice/src/lib/pdf-style.ts");
  assert.match(pdfStyle, /fitPdfSingleLine\(doc, value, 105\)/u);
  assert.match(pdfStyle, /wrapPdfFooterLines/u);
});
