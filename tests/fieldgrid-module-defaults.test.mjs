import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("tenant module defaults enable all modules for every tenant", () => {
  const migration = read("lib/db/migrations/065_enable_all_tenant_modules_by_default.sql");

  assert.match(migration, /ALTER COLUMN is_enabled_by_default SET DEFAULT true/);
  assert.match(migration, /UPDATE modules[\s\S]*is_enabled_by_default = true/);
  assert.match(migration, /INSERT INTO plan_modules[\s\S]*CROSS JOIN modules/);
  assert.match(migration, /INSERT INTO tenant_modules[\s\S]*CROSS JOIN modules/);
  assert.match(migration, /ON CONFLICT \(tenant_id, module_id\) DO UPDATE[\s\S]*is_enabled = true/);
});

test("schema keeps new modules enabled by default", () => {
  const schema = read("lib/db/src/schema/modules.ts");

  assert.ok(schema.includes('"personnel_portal"'), "personnel portal module should stay registered");
  assert.ok(schema.includes('"smart_planning"'), "smart planning module should stay registered");
  assert.ok(
    schema.includes('isEnabledByDefault: boolean("is_enabled_by_default").notNull().default(true)'),
    "module schema should default modules to enabled",
  );
});
