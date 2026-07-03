import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("personnel PWA resolves platform hosts through authenticated personnel only", () => {
  const resolver = read("artifacts/personeel-pwa/src/lib/auth/tenant.ts");

  assert.match(resolver, /resolveAuthenticatedPersonnelTenantId/u);
  assert.match(resolver, /isPlatformHost\(normalizedHost\)/u);
  assert.match(resolver, /resolution\.kind === "platform" \|\| resolution\.kind === "none"/u);
  assert.match(resolver, /personnelTable\.userId/u);
  assert.match(resolver, /lower\(\$\{personnelTable\.email\}\) = \$\{email\}/u);
  assert.match(resolver, /isNull\(personnelTable\.userId\)/u);
  assert.match(resolver, /requireCurrentPortalModule\("personnel_portal"\)/u);
  assert.doesNotMatch(resolver, /DEFAULT_TENANT_ID/u);
});
