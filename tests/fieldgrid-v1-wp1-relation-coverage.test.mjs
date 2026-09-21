import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { APPLICATION_TABLES, AUTHORITATIVE_APPLICATION_RELATIONS, EXHAUSTIVE_RELATION_CLASSIFICATION } from "../scripts/fieldgrid-v1-wp1-reset-plan.mjs";

test("WP1 classifies every committed public application relation exactly once", () => {
  const found = new Set();
  for (const file of readdirSync("lib/db/migrations")) {
    if (!file.endsWith(".sql")) continue;
    for (const match of readFileSync(`lib/db/migrations/${file}`, "utf8").matchAll(/create table\s+(?:if not exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)) if (match[1] !== "in" && match[1] !== "app_private") found.add(match[1]);
  }
  assert.deepEqual([...found].sort(), [...AUTHORITATIVE_APPLICATION_RELATIONS].sort());
  for (const relation of found) assert.ok(EXHAUSTIVE_RELATION_CLASSIFICATION[relation], `unclassified ${relation}`);
  assert.equal(new Set(APPLICATION_TABLES).size, APPLICATION_TABLES.length);
  for (const relation of APPLICATION_TABLES) assert.ok(EXHAUSTIVE_RELATION_CLASSIFICATION[relation] === "delete-test-data");
});
