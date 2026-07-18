import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = process.cwd();
const migrationPath = join(
  repoRoot,
  "lib/db/migrations/20260718190000_phase2_security_reconciliation.sql",
);
const migration = readFileSync(migrationPath, "utf8");
const dbRequire = createRequire(
  new URL("../lib/db/package.json", import.meta.url),
);
const { Client } = dbRequire("pg");

test("customer realtime policy rejects JWT email fallback", () => {
  assert.doesNotMatch(migration, /auth\.email\s*\(\)/iu);
  assert.doesNotMatch(migration, /auth\.jwt\(\)\s*->>\s*'email'/u);
  assert.match(migration, /cu\.status = 'active'/u);
  assert.match(migration, /cu\.user_id = auth\.uid\(\)/u);
});

test(
  "installed customer realtime policy requires an active linked user",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: false,
    });
    await client.connect();

    try {
      const policy = await client.query(
        `
        select qual
        from pg_policies
        where schemaname = 'public'
          and tablename = 'portal_realtime_events'
          and policyname = 'portal_realtime_events_customer_read'
      `,
      );

      assert.equal(policy.rows.length, 1);
      assert.doesNotMatch(policy.rows[0].qual, /auth\.jwt\(\)/u);
      assert.match(policy.rows[0].qual, /cu\.user_id = auth\.uid\(\)/u);
      assert.match(policy.rows[0].qual, /cu\.status.*active/u);
      assert.match(policy.rows[0].qual, /c\.is_active IS TRUE/u);
    } finally {
      await client.end();
    }
  },
);

test(
  "realtime emitter stores canonical metadata and redacts sensitive payload",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: false,
    });
    await client.connect();
    try {
      await client.query(
        "select public.portal_realtime_emit($1::uuid, $2, $3, null, null, $4, $5, $6, $7, $8::jsonb)",
        [
          "00000000-0000-0000-0000-000000000010",
          "management",
          "management_00000000-0000-0000-0000-000000000010",
          "assignments",
          "assignment",
          "assignment-regression",
          "insert",
          JSON.stringify({
            email: "secret@example.test",
            safe: "retained",
            nested: { accessToken: "secret", label: "retained" },
            rows: [{ Authorization: "Bearer secret", value: 1 }],
          }),
        ],
      );
      const event = await client.query(
        "select resource_type, resource_id, action, event_type, payload from public.portal_realtime_events where realtime_key = $1 order by created_at desc limit 1",
        ["management_00000000-0000-0000-0000-000000000010"],
      );
      assert.deepEqual(event.rows[0], {
        resource_type: "assignment",
        resource_id: "assignment-regression",
        action: "insert",
        event_type: "customer_visible_projection_changed",
        payload: { nested: { label: "retained" }, rows: [{ value: 1 }], safe: "retained" },
      });
    } finally {
      await client.end();
    }
  },
);
