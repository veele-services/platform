import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Sprint 10 exposes an invoice release gate script and package commands", () => {
  const pkg = JSON.parse(read("package.json"));
  const scriptPath = new URL("../scripts/fieldgrid-invoice-sprint10-release-gate.mjs", import.meta.url);
  const script = read("scripts/fieldgrid-invoice-sprint10-release-gate.mjs");

  assert.ok(existsSync(scriptPath), "release gate script should exist");
  assert.equal(
    pkg.scripts["fieldgrid:invoice-sprint10-release-gate"],
    "node scripts/fieldgrid-invoice-sprint10-release-gate.mjs && node --test tests/fieldgrid-invoice-canon-sprint10-release-gate.test.mjs",
  );
  assert.equal(
    pkg.scripts["fieldgrid:invoice-sprint10-release-gate:check"],
    "node scripts/fieldgrid-invoice-sprint10-release-gate.mjs --check && node --test tests/fieldgrid-invoice-canon-sprint10-release-gate.test.mjs",
  );
  assert.match(script, /FIELDGRID_INVOICE_GATE_TENANT_BASE_URL/u);
  assert.match(script, /FIELDGRID_INVOICE_GATE_CUSTOMER_BASE_URL/u);
  assert.match(script, /\/invoices/u);
  assert.match(script, /\/instellingen\/facturen/u);
  assert.match(script, /\/api\/factuur\/\$\{invoiceId\}\/pdf/u);
  assert.match(script, /horizontalOverflow/u);
});

test("Sprint 10 release gate covers the complete invoice canon surface", () => {
  const script = read("scripts/fieldgrid-invoice-sprint10-release-gate.mjs");

  for (const marker of [
    "draft-finalized-sent-paid-flow",
    "tenant-safe-numbering",
    "snapshot-pdf-downloads",
    "mollie-payment-qr",
    "settings-preview",
    "security-rbac-audit",
    "regression-tests",
  ]) {
    assert.match(script, new RegExp(marker, "u"));
  }

  for (const route of [
    "artifacts/backoffice/src/app/(dashboard)/invoices/page.tsx",
    "artifacts/backoffice/src/app/(dashboard)/invoices/[id]/page.tsx",
    "artifacts/backoffice/src/app/(dashboard)/instellingen/facturen/page.tsx",
    "artifacts/klant-pwa/src/app/api/factuur/[id]/pdf/route.ts",
    "artifacts/klant-pwa/src/app/api/factuur/[id]/pay/route.ts",
  ]) {
    assert.match(script, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  }
});

test("Sprint 10 release gate passes in static check mode", () => {
  const output = execFileSync("node", ["scripts/fieldgrid-invoice-sprint10-release-gate.mjs", "--check"], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
  });

  assert.match(output, /Fieldgrid invoice sprint 10 release gate passed/u);
  assert.match(output, /invoice-sprint10-release-gate\.json/u);
});
