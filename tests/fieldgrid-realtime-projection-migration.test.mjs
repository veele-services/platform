import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { verifyFieldDemoOwnerPlatformPrivilegeDiagnostic } from "./runtime/fieldgrid-staging-field-demo-owner-binding-diagnostic.test.mjs";
import { FIXTURE } from "../scripts/fieldgrid-runtime-safety-lib.mjs";

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
const continuityAuthUserA = "93000000-0000-4000-8000-000000000001";
const continuityPlatformUserA = "93000000-0000-4000-8000-000000000002";
const continuityAuthUserB = "93000000-0000-4000-8000-000000000003";
const continuityPlatformUserB = "93000000-0000-4000-8000-000000000004";

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

if (process.env.DATABASE_URL) {
  const databaseHost = new URL(process.env.DATABASE_URL).hostname;
  assert.ok(
    ["127.0.0.1", "localhost", "::1", "postgres"].includes(databaseHost),
    "runtime migration tests require a disposable local PostgreSQL database",
  );

  test("platform privilege repair has one scoped migration-admin DELETE policy", async () => {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: false,
    });
    await client.connect();
    try {
      const policy = await client.query(
        `SELECT
           policy_row.cmd,
           policy_row.permissive,
           policy_row.roles::text[] AS roles,
           policy_row.qual,
           policy_row.with_check
         FROM pg_catalog.pg_policies AS policy_row
         WHERE policy_row.schemaname = 'public'
           AND policy_row.tablename = 'platform_users'
           AND policy_row.policyname =
             'fieldgrid_migration_admin_platform_overlap_delete'`,
      );
      assert.equal(policy.rows.length, 1);
      assert.equal(policy.rows[0]?.cmd, "DELETE");
      assert.equal(policy.rows[0]?.permissive, "PERMISSIVE");
      assert.equal(policy.rows[0]?.with_check, null);
      assert.match(policy.rows[0]?.qual ?? "", /role.*owner/u);
      assert.match(policy.rows[0]?.qual ?? "", /status.*suspended/u);
      assert.match(policy.rows[0]?.qual ?? "", /tenant_users/u);
      assert.match(policy.rows[0]?.qual ?? "", /status.*active/u);

      const acl = await client.query(
        `SELECT
           configuration.migration_admin::text AS migration_admin,
           pg_catalog.has_table_privilege(
             configuration.migration_admin,
             'public.platform_users'::regclass,
             'DELETE'
           ) AS migration_admin_delete,
           EXISTS (
             SELECT 1
             FROM app_private.fieldgrid_runtime_relation_capabilities AS capability
             WHERE capability.schema_name = 'public'
               AND capability.relation_name = 'platform_users'
               AND 'DELETE' = ANY(capability.privileges)
           ) AS runtime_delete
         FROM app_private.fieldgrid_runtime_principal_configuration AS configuration
         WHERE configuration.singleton IS TRUE`,
      );
      assert.equal(acl.rows.length, 1);
      assert.equal(acl.rows[0]?.migration_admin_delete, true);
      assert.equal(acl.rows[0]?.runtime_delete, false);
      assert.deepEqual(policy.rows[0]?.roles, [acl.rows[0]?.migration_admin]);

      const forbiddenAcl = await client.query(
        `SELECT role_name
         FROM unnest(ARRAY[
           'anon',
           'authenticated',
           'service_role',
           'fieldgrid_runtime_app',
           'fieldgrid_runtime_data'
         ]::text[]) AS forbidden(role_name)
         WHERE pg_catalog.has_table_privilege(
           role_name,
           'public.platform_users'::regclass,
           'DELETE'
         )`,
      );
      assert.deepEqual(forbiddenAcl.rows, []);
    } finally {
      await client.end();
    }
  });

  test("Auth surface separation serializes concurrent tenant and platform bindings", async () => {
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
      const firstPid = await first.query(
        "SELECT pg_backend_pid()::integer AS pid",
      );
      const secondPid = await second.query(
        "SELECT pg_backend_pid()::integer AS pid",
      );

      await second.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      await second.query(
        `SELECT revision
           FROM public.fieldgrid_auth_surface_locks
          WHERE user_id = $1`,
        [separatedAuthUserId],
      );
      await first.query("BEGIN");
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
          `SELECT $1::integer = ANY(
             pg_catalog.pg_blocking_pids($2::integer)
           ) AS waiting`,
          [firstPid.rows[0]?.pid, secondPid.rows[0]?.pid],
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
      await assert.rejects(tenantInsert, (error) => error?.code === "40001");
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
  });

  test("platform owner continuity serializes concurrent last-owner removal", async () => {
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
    let secondDemotion = null;
    let originalOwnerIds = [];
    await first.connect();
    await second.connect();

    try {
      await first.query(
        `INSERT INTO auth.users (id, email, raw_app_meta_data)
         VALUES ($1, 'platform-owner@runtime.fieldgrid.test', '{}'::jsonb)
         ON CONFLICT (id) DO NOTHING`,
        [FIXTURE.users.platformOwner],
      );
      await first.query(
        `INSERT INTO public.platform_users (id, user_id, role, status)
         VALUES ($1, $2, 'owner', 'active')
         ON CONFLICT (id) DO UPDATE
           SET role = 'owner', status = 'active'`,
        [FIXTURE.platformUsers.owner, FIXTURE.users.platformOwner],
      );
      const originalOwners = await first.query(
        `SELECT id::text
           FROM public.platform_users
          WHERE role = 'owner' AND status = 'active'
          ORDER BY id`,
      );
      originalOwnerIds = originalOwners.rows.map((row) => row.id);
      assert.ok(
        originalOwnerIds.length > 0,
        "runtime fixtures must provide an existing active platform owner",
      );

      await first.query(
        `INSERT INTO auth.users (id, email, raw_app_meta_data)
         VALUES
           ($1, 'owner-continuity-a@example.invalid', '{}'::jsonb),
           ($2, 'owner-continuity-b@example.invalid', '{}'::jsonb)`,
        [continuityAuthUserA, continuityAuthUserB],
      );
      await first.query(
        `INSERT INTO public.platform_users (id, user_id, role, status)
         VALUES
           ($1, $2, 'owner', 'active'),
           ($3, $4, 'owner', 'active')`,
        [
          continuityPlatformUserA,
          continuityAuthUserA,
          continuityPlatformUserB,
          continuityAuthUserB,
        ],
      );
      await first.query(
        `UPDATE public.platform_users
            SET role = 'admin'
          WHERE id = ANY($1::uuid[])`,
        [originalOwnerIds],
      );

      const firstPid = await first.query(
        "SELECT pg_backend_pid()::integer AS pid",
      );
      const secondPid = await second.query(
        "SELECT pg_backend_pid()::integer AS pid",
      );
      await second.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      await second.query(
        `SELECT revision
           FROM public.fieldgrid_platform_owner_continuity_lock
          WHERE singleton IS TRUE`,
      );
      await first.query("BEGIN");
      await first.query(
        `UPDATE public.platform_users
            SET role = 'admin'
          WHERE id = $1`,
        [continuityPlatformUserA],
      );
      secondDemotion = second.query(
        `UPDATE public.platform_users
            SET role = 'admin'
          WHERE id = $1`,
        [continuityPlatformUserB],
      );

      let waitingOnContinuityBarrier = false;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const waiting = await first.query(
          `SELECT $1::integer = ANY(
             pg_catalog.pg_blocking_pids($2::integer)
           ) AS waiting`,
          [firstPid.rows[0]?.pid, secondPid.rows[0]?.pid],
        );
        waitingOnContinuityBarrier = waiting.rows[0]?.waiting === true;
        if (waitingOnContinuityBarrier) break;
        await delay(20);
      }
      assert.equal(
        waitingOnContinuityBarrier,
        true,
        "the concurrent demotion must wait on the owner-continuity barrier",
      );

      await first.query("COMMIT");
      await assert.rejects(secondDemotion, (error) => error?.code === "40001");
      secondDemotion = null;
      await second.query("ROLLBACK");

      const retainedOwner = await first.query(
        `SELECT id::text, role, status
           FROM public.platform_users
          WHERE role = 'owner' AND status = 'active'`,
      );
      assert.deepEqual(retainedOwner.rows, [
        {
          id: continuityPlatformUserB,
          role: "owner",
          status: "active",
        },
      ]);
      await assert.rejects(
        first.query("DELETE FROM public.platform_users WHERE id = $1", [
          continuityPlatformUserB,
        ]),
        (error) =>
          error?.code === "23514" &&
          error?.constraint === "fieldgrid_platform_owner_continuity",
      );

      await first.query(
        `UPDATE public.platform_users
            SET role = 'owner', status = 'active'
          WHERE id = $1`,
        [continuityPlatformUserA],
      );
      const legitimateDemotion = await first.query(
        `UPDATE public.platform_users
            SET role = 'admin'
          WHERE id = $1`,
        [continuityPlatformUserB],
      );
      assert.equal(legitimateDemotion.rowCount, 1);

      await first.query(
        `UPDATE public.platform_users
            SET role = 'owner'
          WHERE id = $1`,
        [continuityPlatformUserB],
      );
      await first.query("BEGIN");
      await first.query(
        `UPDATE public.platform_users
            SET role = 'admin'
          WHERE id = $1`,
        [continuityPlatformUserA],
      );
      secondDemotion = second.query(
        `UPDATE public.platform_users
            SET role = 'admin'
          WHERE id = $1`,
        [continuityPlatformUserB],
      );

      let readCommittedWaiterBlocked = false;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const waiting = await first.query(
          `SELECT $1::integer = ANY(
             pg_catalog.pg_blocking_pids($2::integer)
           ) AS waiting`,
          [firstPid.rows[0]?.pid, secondPid.rows[0]?.pid],
        );
        readCommittedWaiterBlocked = waiting.rows[0]?.waiting === true;
        if (readCommittedWaiterBlocked) break;
        await delay(20);
      }
      assert.equal(readCommittedWaiterBlocked, true);
      await first.query("COMMIT");
      await assert.rejects(
        secondDemotion,
        (error) =>
          error?.code === "23514" &&
          error?.constraint === "fieldgrid_platform_owner_continuity",
      );
      secondDemotion = null;
      const readCommittedOwner = await first.query(
        `SELECT id::text
           FROM public.platform_users
          WHERE role = 'owner' AND status = 'active'`,
      );
      assert.deepEqual(readCommittedOwner.rows, [
        { id: continuityPlatformUserB },
      ]);
    } finally {
      await first.query("ROLLBACK").catch(() => undefined);
      if (secondDemotion) await secondDemotion.catch(() => undefined);
      await second.query("ROLLBACK").catch(() => undefined);
      if (originalOwnerIds.length > 0) {
        await first
          .query(
            `UPDATE public.platform_users
                SET role = 'owner', status = 'active'
              WHERE id = ANY($1::uuid[])`,
            [originalOwnerIds],
          )
          .catch(() => undefined);
      }
      await first
        .query("DELETE FROM public.platform_users WHERE id = ANY($1::uuid[])", [
          [continuityPlatformUserA, continuityPlatformUserB],
        ])
        .catch(() => undefined);
      await first
        .query("DELETE FROM auth.users WHERE id = ANY($1::uuid[])", [
          [continuityAuthUserA, continuityAuthUserB],
        ])
        .catch(() => undefined);
      await Promise.allSettled([first.end(), second.end()]);
    }
  });
}
