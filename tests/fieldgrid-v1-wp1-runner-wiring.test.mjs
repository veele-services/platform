import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const runner = readFileSync("scripts/fieldgrid-v1-wp1-runner.mjs", "utf8");
const services = readFileSync("scripts/wp1/services.mjs", "utf8");
const exactHead = readFileSync(
  ".github/workflows/main-exact-head-validation.yml",
  "utf8",
);

test("WP1 live runner uses reviewed concrete reset modules", () => {
  for (const expected of [
    "./wp1/environment.mjs",
    "./wp1/evidence.mjs",
    "./wp1/backup.mjs",
    "./wp1/services.mjs",
    "./wp1/database.mjs",
    "./wp1/providers.mjs",
    "./wp1/bootstrap.mjs",
    "resolveCanonicalManager",
    "backupAndRehearse",
    "inventoryDatabase",
    "resetDatabase",
    "createProviderAdapter",
    "verifyResetSafeTestPayments",
    "verifyCanonical",
    "readDiagnose",
    "assertValidation",
  ]) {
    assert.ok(runner.includes(expected), `missing ${expected}`);
  }

  for (const unsafeShortcut of [
    "projectVerified: true",
    "databaseVerified: true",
    "migrationFrontierValid: true",
    "writersCanQuiesce: true",
    "activeOrUnknownPayments: 0",
    "unexpectedCandidates: 0",
    "candidateIdentity: () => \"unknown\"",
    "isQuiesced() { return true; }",
    "Canonical bootstrap must be supplied",
  ]) {
    assert.ok(
      !runner.includes(unsafeShortcut),
      `unsafe shortcut remains: ${unsafeShortcut}`,
    );
  }
});

test("WP1 service control distinguishes known non-writers from declared writers", () => {
  assert.match(services, /KNOWN_NON_WRITERS/u);
  assert.match(services, /veele-staging-website\.service/u);
  assert.match(services, /veele-staging-marketing\.service/u);
  assert.match(services, /UNDECLARED_STAGING_WRITER/u);
  assert.match(services, /WRITERS_NOT_QUIESCED/u);
});

test("authoritative exact-head PostgreSQL 17 lane executes the real WP1 database test", () => {
  assert.match(
    exactHead,
    /pnpm fieldgrid:test:postgres17-migration-smoke[\s\S]*src\/seed\/rbac\.ts[\s\S]*tests\/runtime\/fieldgrid-wp1-database\.test\.mjs/u,
  );
});
