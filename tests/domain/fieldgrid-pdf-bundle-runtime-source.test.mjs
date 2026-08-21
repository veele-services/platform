import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("Next server builds externalize PDFKit in every PDF application", () => {
  for (const path of [
    "artifacts/backoffice/next.config.ts",
    "artifacts/klant-pwa/next.config.ts",
  ]) {
    assert.match(
      read(path),
      /serverExternalPackages:\s*\["pdfkit"\]/u,
      path,
    );
  }
});

test("CI and release builds execute the compiled PDF bundle runtime gate", () => {
  const packageJson = JSON.parse(read("package.json"));
  assert.match(
    packageJson.scripts.build,
    /fieldgrid:pdf-bundle-runtime:check/u,
  );
  assert.equal(
    packageJson.scripts["fieldgrid:pdf-bundle-runtime:check"],
    "node scripts/fieldgrid-pdf-bundle-runtime-check.mjs",
  );
  assert.match(
    read(".github/workflows/main-exact-head-validation.yml"),
    /pnpm fieldgrid:pdf-bundle-runtime:check/u,
  );
});

test("the bundle gate covers both compiled invoice PDF entrypoints", () => {
  const gate = read("scripts/fieldgrid-pdf-bundle-runtime-check.mjs");
  assert.match(
    gate,
    /artifacts\/backoffice[\s\S]*api\/invoices\/\[id\]\/pdf\/route\.js/u,
  );
  assert.match(
    gate,
    /artifacts\/klant-pwa[\s\S]*api\/factuur\/\[id\]\/pdf\/route\.js/u,
  );
  assert.match(gate, /data\/Helvetica\.afm/u);
  assert.match(gate, /require\\\(\["'\]pdfkit/u);
  assert.match(gate, /%PDF-/u);
});
