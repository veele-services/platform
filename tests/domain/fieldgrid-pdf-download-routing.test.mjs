import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(path, "utf8");

const apiProxy = read("artifacts/api-server/src/routes/platform-backoffice.ts");
const quoteList = read("artifacts/backoffice/src/components/quotes/QuotesView.tsx");
const quoteDetail = read("artifacts/backoffice/src/app/(dashboard)/quotes/[id]/page.tsx");
const reportDetail = read("artifacts/backoffice/src/app/(dashboard)/reports/[id]/page.tsx");
const quoteBridge = read("artifacts/backoffice/src/app/backoffice-api/quotes/[id]/pdf/route.ts");
const reportBridge = read("artifacts/backoffice/src/app/backoffice-api/reports/[id]/pdf/route.ts");

const pdfRoutes = [
  "artifacts/backoffice/src/app/api/invoices/[id]/pdf/route.ts",
  "artifacts/backoffice/src/app/api/invoices/batches/[id]/pdf/route.ts",
  "artifacts/backoffice/src/app/api/invoices/test-pdf/route.ts",
  "artifacts/backoffice/src/app/api/quotes/[id]/pdf/route.ts",
  "artifacts/backoffice/src/app/api/reports/[id]/pdf/route.ts",
  "artifacts/klant-pwa/src/app/api/factuur/[id]/pdf/route.ts",
  "artifacts/klant-pwa/src/app/api/offerte/[id]/pdf/route.ts",
  "artifacts/klant-pwa/src/app/api/verzamelfactuur/[id]/pdf/route.ts",
];

test("backoffice quote and report PDF links bypass the shared /api service", () => {
  assert.match(apiProxy, /\["\/invoices", "\/quotes", "\/reports", "\/google-maps"\]/u);
  assert.match(apiProxy, /replace\(\/\^\\\/api\(\?=\\\/\)\/u, "\/admin\/backoffice-api"\)/u);
  assert.match(apiProxy, /new URL\(`\/admin\$\{req\.originalUrl\}`/u);
  assert.match(quoteBridge, /@\/app\/api\/quotes\/\[id\]\/pdf\/route/u);
  assert.match(reportBridge, /@\/app\/api\/reports\/\[id\]\/pdf\/route/u);

  for (const source of [quoteList, quoteDetail]) {
    assert.match(source, /\/backoffice-api\/quotes\/\$\{(?:row|quote)\.id\}\/pdf/u);
    assert.doesNotMatch(source, /\/api\/quotes\/\$\{(?:row|quote)\.id\}\/pdf/u);
  }
  assert.match(reportDetail, /\/backoffice-api\/reports\/\$\{report\.id\}\/pdf/u);
  assert.doesNotMatch(reportDetail, /\/api\/reports\/\$\{report\.id\}\/pdf/u);
});

test("every user-facing PDF response is a private forced download", () => {
  for (const path of pdfRoutes) {
    const source = read(path);
    assert.match(source, /"Content-Type":\s+"application\/pdf"/u, path);
    assert.match(source, /"Content-Disposition":\s+["`]attachment; filename=/u, path);
    assert.match(source, /"Cache-Control":\s+"private, no-store, max-age=0"/u, path);
    assert.match(source, /"X-Content-Type-Options":\s+"nosniff"/u, path);
    assert.match(source, /new NextResponse\(new Uint8Array\(pdfBuffer\)/u, path);
  }
});
