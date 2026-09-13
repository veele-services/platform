import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { verifyFieldDemoOwnerPlatformPrivilegeDiagnostic } from "./runtime/fieldgrid-staging-field-demo-owner-binding-diagnostic.test.mjs";

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
const separatedAuthUserId = "92000000-0000-4000-8000-000000000001";
const separatedPlatformUserId = "92000000-0000-4000-8000-000000000002";
const separatedTenantId = "92000000-0000-4000-8000-000000000003";

test("customer realtime policy rejects JWT email fallback", () => {
  assert.doesNotMatch(migration, /auth\.email\s*\(\)/iu);
  assert.doesNotMatch(migration, /auth\.jwt\(\)\s*->>\s*'email'/u);
  assert.match(migration, /cu\.status = 'active'/u);
  assert.match(migration, /cu\.user_id = auth\.uid\(\)/u);
});

test(
  "installed customer realtime policy requires an active linked user",
  { skip: !process.env.DATABASE_URL },
  async (context) => {
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
      await context.test(
        "owner platform-privilege diagnostic executes against the migrated schema",
        async () => {
          await verifyFieldDemoOwnerPlatformPrivilegeDiagnostic(client);
        },
      );
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
        payload: {
          nested: { label: "retained" },
          rows: [{ value: 1 }],
          safe: "retained",
        },
      });
    } finally {
      await client.end();
    }
  },
);

test(
  "Auth surface separation serializes concurrent tenant and platform bindings",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const first = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: false,
      statement_timeout: 10_000,
    });
    const second = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: false,
      statement_timeout: 10_000,
    });
    let tenantInsert = null;
    await first.connect();
    await second.connect();

    try {
      await first.query(
        `INSERT INTO auth.users (id, email, raw_app_meta_data)
         VALUES ($1, 'surface-separation@example.invalid', '{}'::jsonb)`,
        [separatedAuthUserId],
      );
      await first.query(
        `INSERT INTO public.tenants (id, slug, name, is_active, status)
         VALUES ($1, 'surface-separation', 'Surface separation', true, 'active')`,
        [separatedTenantId],
      );
      const secondPid = await second.query(
        "SELECT pg_backend_pid()::integer AS pid",
      );

      await first.query("BEGIN");
      await second.query("BEGIN");
      await first.query(
        `INSERT INTO public.platform_users (id, user_id, role, status)
         VALUES ($1, $2, 'admin', 'active')`,
        [separatedPlatformUserId, separatedAuthUserId],
      );
      tenantInsert = second.query(
        `INSERT INTO public.tenant_users (tenant_id, user_id, role, status)
         VALUES ($1, $2, 'member', 'active')`,
        [separatedTenantId, separatedAuthUserId],
      );

      let waitingOnIdentityLock = false;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const waiting = await first.query(
          `SELECT EXISTS (
             SELECT 1
               FROM pg_catalog.pg_locks
              WHERE pid = $1
                AND locktype = 'advisory'
                AND granted = false
           ) AS waiting`,
          [secondPid.rows[0]?.pid],
        );
        waitingOnIdentityLock = waiting.rows[0]?.waiting === true;
        if (waitingOnIdentityLock) break;
        await delay(20);
      }
      assert.equal(
        waitingOnIdentityLock,
        true,
        "the concurrent binding must wait on the shared Auth identity lock",
      );

      await first.query("COMMIT");
      await assert.rejects(
        tenantInsert,
        (error) =>
          error?.code === "23514" &&
          error?.constraint === "fieldgrid_auth_surface_separation",
      );
      tenantInsert = null;
      await second.query("ROLLBACK");

      const bindingCounts = await first.query(
        `SELECT
           (SELECT COUNT(*)::integer FROM public.platform_users
             WHERE user_id = $1) AS platform_count,
           (SELECT COUNT(*)::integer FROM public.tenant_users
             WHERE user_id = $1) AS tenant_count`,
        [separatedAuthUserId],
      );
      assert.deepEqual(bindingCounts.rows[0], {
        platform_count: 1,
        tenant_count: 0,
      });

      await first.query(
        "DELETE FROM public.platform_users WHERE user_id = $1",
        [separatedAuthUserId],
      );
      await first.query(
        `INSERT INTO public.tenant_users (tenant_id, user_id, role, status)
         VALUES ($1, $2, 'member', 'active')`,
        [separatedTenantId, separatedAuthUserId],
      );
      await assert.rejects(
        first.query(
          `INSERT INTO public.platform_users (id, user_id, role, status)
           VALUES ($1, $2, 'admin', 'active')`,
          [separatedPlatformUserId, separatedAuthUserId],
        ),
        (error) =>
          error?.code === "23514" &&
          error?.constraint === "fieldgrid_auth_surface_separation",
      );
      const reverseBindingCounts = await first.query(
        `SELECT
           (SELECT COUNT(*)::integer FROM public.platform_users
             WHERE user_id = $1) AS platform_count,
           (SELECT COUNT(*)::integer FROM public.tenant_users
             WHERE user_id = $1) AS tenant_count`,
        [separatedAuthUserId],
      );
      assert.deepEqual(reverseBindingCounts.rows[0], {
        platform_count: 0,
        tenant_count: 1,
      });
    } finally {
      await first.query("ROLLBACK").catch(() => undefined);
      if (tenantInsert) await tenantInsert.catch(() => undefined);
      await second.query("ROLLBACK").catch(() => undefined);
      await first
        .query("DELETE FROM public.platform_users WHERE user_id = $1", [
          separatedAuthUserId,
        ])
        .catch(() => undefined);
      await first
        .query("DELETE FROM public.tenant_users WHERE user_id = $1", [
          separatedAuthUserId,
        ])
        .catch(() => undefined);
      await first
        .query("DELETE FROM public.tenants WHERE id = $1", [separatedTenantId])
        .catch(() => undefined);
      await first
        .query("DELETE FROM auth.users WHERE id = $1", [separatedAuthUserId])
        .catch(() => undefined);
      await Promise.allSettled([first.end(), second.end()]);
    }
  },
);
