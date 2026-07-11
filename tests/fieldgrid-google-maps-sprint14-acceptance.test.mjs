import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const packageJson = JSON.parse(read("package.json"));

test("Sprint 14 package scripts expose check, strict and optional live smoke gates", () => {
  assert.equal(
    packageJson.scripts["fieldgrid:google-maps-sprint14:check"],
    "node --test tests/fieldgrid-google-maps-sprint*.test.mjs tests/fieldgrid-personnel-home-address-routing.test.mjs && node scripts/fieldgrid-migration-order-check.mjs --check && node scripts/fieldgrid-google-maps-playwright-smoke.mjs --mock && node scripts/fieldgrid-google-maps-sprint14-acceptance.mjs --check --strict-evidence",
  );
  assert.equal(
    packageJson.scripts["fieldgrid:google-maps-sprint14:strict"],
    "pnpm run typecheck && pnpm -r --if-present run build && pnpm fieldgrid:google-maps-sprint14:check",
  );
  assert.equal(
    packageJson.scripts["fieldgrid:google-maps-sprint14:staging-live"],
    "node scripts/fieldgrid-google-maps-playwright-smoke.mjs --staging-live",
  );
});

test("Sprint 14 acceptance script checks the full Google Maps canon", () => {
  const gate = read("scripts/fieldgrid-google-maps-sprint14-acceptance.mjs");

  for (const snippet of [
    "checkGoogleMapsRuntimeContract",
    "checkPlacesContract",
    "checkRoutesContract",
    "checkUsageAndRateLimitContract",
    "checkSecurityAndLegacyCleanup",
    "checkDocsContract",
    "checkPlaywrightSmokeContract",
    "checkEvidence",
    "TRAFFIC_AWARE",
    "computeRouteMatrix",
    "optimizeWaypointOrder",
    "google_api_rate_limited",
    "Maps JavaScript API draait client-side",
  ]) {
    assert.match(gate, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("Sprint 14 Playwright smoke is mocked by default and live staging is explicit opt-in", () => {
  const smoke = read("scripts/fieldgrid-google-maps-playwright-smoke.mjs");

  assert.match(smoke, /chromium/);
  assert.match(smoke, /--mock/);
  assert.match(smoke, /--staging-live/);
  assert.match(smoke, /FIELDGRID_GOOGLE_MAPS_LIVE_SMOKE !== "1"/);
  assert.match(smoke, /No paid Google calls|geen betaalde|paid\/live staging checks/i);
  assert.match(smoke, /sessionToken/);
  assert.match(smoke, /TRAFFIC_AWARE/);
  assert.match(smoke, /mapInstances/);
  assert.match(smoke, /optimizeWaypointOrder: false/);
  assert.match(smoke, /computeRouteMatrix: false/);
});

test("Sprint 14 docs record final gate commands and optional live smoke", () => {
  const docs = read("docs/deployment/google-maps-platform.md");
  const plan = read("docs/google-maps-platform-integration-plan.md");

  assert.match(docs, /Sprint 14 Acceptatiegate/);
  assert.match(docs, /fieldgrid:google-maps-sprint14:check/);
  assert.match(docs, /fieldgrid:google-maps-sprint14:strict/);
  assert.match(docs, /FIELDGRID_GOOGLE_MAPS_LIVE_SMOKE=1/);
  assert.match(plan, /Status: Sprint 14 volledige acceptatiegate en optionele live smoke afgerond\./);
});
