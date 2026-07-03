import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("platform layout handles missing platform role without server error", () => {
  const layout = read("artifacts/backoffice/src/app/(platform)/layout.tsx");

  assert.ok(layout.includes("getCurrentPlatformUser"));
  assert.ok(layout.includes("NoPlatformAccess"));
  assert.ok(layout.includes("redirect(\"/login?next=/platform\")"));
  assert.ok(layout.includes("Geen platformtoegang"));
  assert.ok(!layout.includes("requirePlatformSupportUser"));
});

test("platform last-seen tracking is non-blocking", () => {
  const layout = read("artifacts/backoffice/src/app/(platform)/layout.tsx");

  assert.ok(layout.includes("try {"));
  assert.ok(layout.includes("await markCurrentPlatformUserSeen()"));
  assert.ok(layout.includes("last-seen update skipped"));
});
