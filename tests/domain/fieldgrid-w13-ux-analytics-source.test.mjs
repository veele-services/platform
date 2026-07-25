import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(
    process.cwd(),
    "artifacts/backoffice/src/lib/ux-analytics.ts",
  ),
  "utf8",
);

test("UX analytics does not transmit or persist events by itself", () => {
  assert.match(source, /window\.dispatchEvent/);
  assert.doesNotMatch(source, /fetch\(|sendBeacon|localStorage|sessionStorage/);
});

test("UX analytics schema excludes content and identity fields", () => {
  assert.doesNotMatch(
    source,
    /\b(query|email|fullName|address|notes?|signature|token|secret|userId|tenantId|entityId)\s*:/,
  );
  assert.match(source, /schemaVersion: 1/);
});
