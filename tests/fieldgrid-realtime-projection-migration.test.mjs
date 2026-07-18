import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = process.cwd();
const migrationPath = join(
  repoRoot,
  "lib/db/migrations/20260716160000_realtime_projection_delivery.sql",
);
const migration = readFileSync(migrationPath, "utf8");
const dbRequire = createRequire(
  new URL("../lib/db/package.json", import.meta.url),
);
const { Client } = dbRequire("pg");

test("customer realtime policy uses the supported JWT email claim", () => {
  assert.doesNotMatch(migration, /auth\.email\s*\(\)/iu);
  assert.match(
    migration,
    /lower\(cu\.email\)\s*=\s*lower\(COALESCE\(auth\.jwt\(\)\s*->>\s*'email',\s*''\)\)/u,
  );
});

test(
  "installed customer realtime policy parses the JWT email claim",
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
      assert.match(policy.rows[0].qual, /auth\.jwt\(\)/u);
      assert.match(policy.rows[0].qual, /->>\s*'email'/u);
      assert.doesNotMatch(policy.rows[0].qual, /auth\.email\s*\(\)/iu);

      const claim = await client.query(
        "select auth.jwt() ->> 'email' as email",
      );
      assert.equal(claim.rows[0].email, null);

      const configuredClaim = await client.query(
        "select set_config('request.jwt.claims', $1, false)",
        [JSON.stringify({ email: "customer@example.test" })],
      );
      assert.equal(configuredClaim.rows.length, 1);

      const email = await client.query(
        "select auth.jwt() ->> 'email' as email",
      );
      assert.equal(email.rows[0].email, "customer@example.test");
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
          "runtime-regression-realtime-key",
          "assignments",
          "assignment",
          "assignment-regression",
          "insert",
          JSON.stringify({ email: "secret@example.test", safe: "retained" }),
        ],
      );
      const event = await client.query(
        "select resource_type, resource_id, action, event_type, payload from public.portal_realtime_events where realtime_key = $1 order by created_at desc limit 1",
        ["runtime-regression-realtime-key"],
      );
      assert.deepEqual(event.rows[0], {
        resource_type: "assignment",
        resource_id: "assignment-regression",
        action: "insert",
        event_type: "customer_visible_projection_changed",
        payload: { safe: "retained" },
      });
    } finally {
      await client.end();
    }
  },
);
