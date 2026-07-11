import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const deploymentDoc = read("docs/deployment/google-maps-platform.md");
const integrationPlan = read("docs/google-maps-platform-integration-plan.md");
const rootEnvExample = read(".env.example");
const backofficeEnvExample = read("artifacts/backoffice/.env.example");
const packageJson = JSON.parse(read("package.json"));

const requiredDeploymentSnippets = [
  "# Google Maps Platform Configuratie En Operatie",
  "Maps JavaScript API draait client-side",
  "Places API (New) draait alleen server-side",
  "Routes API draait alleen server-side",
  "`GOOGLE_MAPS_SERVER_API_KEY` mag nooit in browserbundles",
  "## Google Cloud Services",
  "## Environmentvariabelen",
  "## Keyrestricties",
  "## Github Environment Setup",
  "## Dataflow",
  "## Field Masks",
  "## Opgeslagen Google-data",
  "## Privacy En EEA",
  "## Attribution",
  "## Cachebeleid",
  "## Rate Limits",
  "## Usage Rapportage",
  "## Kostenbeheersing",
  "## Fallbackstates",
  "## Rollback",
  "## Operator Checklist Staging",
  "## Operator Checklist Production",
];

test("Sprint 13 deployment runbook covers Google setup, privacy, cost and rollback", () => {
  for (const snippet of requiredDeploymentSnippets) {
    assert.match(deploymentDoc, new RegExp(escapeRegExp(snippet)), snippet);
  }

  for (const api of ["Maps JavaScript API", "Places API (New)", "Routes API"]) {
    assert.match(deploymentDoc, new RegExp(escapeRegExp(api)), api);
  }

  for (const forbiddenApi of [
    "Directions API Legacy",
    "Distance Matrix API Legacy",
    "Places API Legacy",
    "Route Optimization API",
    "Compute Route Matrix",
    "Fleet Routing",
  ]) {
    assert.match(deploymentDoc, new RegExp(escapeRegExp(forbiddenApi)), forbiddenApi);
  }
});

test("Sprint 13 docs specify required environment variables and operator checklists", () => {
  for (const envName of [
    "NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY",
    "GOOGLE_MAPS_SERVER_API_KEY",
    "GOOGLE_MAPS_MAP_ID",
    "GOOGLE_MAPS_ENABLED",
    "GOOGLE_MAPS_DEFAULT_COUNTRY",
    "GOOGLE_MAPS_DEFAULT_LANGUAGE",
    "GOOGLE_MAPS_DEFAULT_REGION",
    "GOOGLE_PLACES_AUTOCOMPLETE_ENABLED",
    "GOOGLE_ROUTES_ENABLED",
    "GOOGLE_ROUTES_TRAFFIC_ENABLED",
    "FIELDGRID_ROUTE_PROVIDER",
  ]) {
    assert.match(deploymentDoc, new RegExp(envName), `${envName} documented`);
  }

  assert.match(deploymentDoc, /GitHub Environment `staging`/);
  assert.match(deploymentDoc, /GitHub Environment `production`/);
  assert.match(deploymentDoc, /serverkey in frontend bundle of logs/);
});

test("Environment examples expose canonical Google Maps variables without legacy route key", () => {
  for (const envText of [rootEnvExample, backofficeEnvExample]) {
    for (const envName of [
      "NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY",
      "GOOGLE_MAPS_SERVER_API_KEY",
      "GOOGLE_MAPS_MAP_ID",
      "GOOGLE_MAPS_ENABLED",
      "GOOGLE_MAPS_DEFAULT_COUNTRY",
      "GOOGLE_MAPS_DEFAULT_LANGUAGE",
      "GOOGLE_MAPS_DEFAULT_REGION",
      "GOOGLE_PLACES_AUTOCOMPLETE_ENABLED",
      "GOOGLE_ROUTES_ENABLED",
      "GOOGLE_ROUTES_TRAFFIC_ENABLED",
    ]) {
      assert.match(envText, new RegExp(envName), `${envName} in env example`);
    }

    assert.doesNotMatch(envText, /^GOOGLE_ROUTES_API_KEY=/m);
  }
});

test("Integration plan records Sprint 13 documentation completion", () => {
  assert.match(integrationPlan, /Status: Sprint 13 documentatie, privacy, Google Cloud setup en rollback afgerond\./);
  assert.match(integrationPlan, /docs\/deployment\/google-maps-platform\.md/);
  assert.match(integrationPlan, /Maps JavaScript API is expliciet client-side/);
  assert.match(integrationPlan, /Places API \(New\) en Routes API zijn expliciet server-side/);
  assert.match(integrationPlan, /Privacy\/EEA, opgeslagen Google-data, field masks, attribution, rate limits, usage metrics, cachebeleid, kostenbeheersing en rollback/);
});

test("Package exposes the Sprint 13 docs gate", () => {
  assert.equal(
    packageJson.scripts["fieldgrid:google-maps-sprint13:check"],
    "node --test tests/fieldgrid-google-maps-sprint13-docs.test.mjs",
  );
});
