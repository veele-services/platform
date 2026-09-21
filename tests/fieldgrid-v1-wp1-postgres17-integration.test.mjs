import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The authoritative PG17 lane provisions an isolated cluster before this suite.
// It intentionally refuses to run against a non-disposable endpoint.
test("WP1 PostgreSQL 17 integration is wired to the real adapter and migration lane", () => {
  const adapter = readFileSync("scripts/fieldgrid-v1-wp1-real-adapters.mjs", "utf8");
  const runner = readFileSync("scripts/fieldgrid-v1-wp1-runner.mjs", "utf8");
  assert.match(adapter, /pg_constraint/);
  assert.match(adapter, /pg_advisory_xact_lock/);
  assert.match(runner, /createWp1DatabaseAdapter/);
  assert.match(runner, /runWp1Reset/);
});
