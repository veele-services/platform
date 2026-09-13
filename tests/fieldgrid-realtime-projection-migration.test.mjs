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
const invitationSourceAuthUserId = "94000000-0000-4000-8000-000000000001";
const invitationSourceTenantId = "94000000-0000-4000-8000-000000000002";
const invitationSourcePlatformAuthUserId =
  "94000000-0000-4000-8000-000000000003";
const invitationSourcePlatformUserId =
  "94000000-0000-4000-8000-000000000004";
const invitationSourcePersonnelAuthUserId =
  "94000000-0000-4000-8000-000000000005";
const invitationSourcePersonnelId =
  "94000000-0000-4000-8000-000000000006";
const invitationReservationTokenA =
  "94000000-0000-4000-8000-000000000007";
const invitationReservationTokenB =
  "94000000-0000-4000-8000-000000000008";

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

if (process.env.DATABASE_URL) {
  test("authorization invitation tokens enforce reclaim and activation state", async () => {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: false,
    });
    await client.connect();

    try {
      const contract = await client.query(
        `SELECT
           attribute_row.attnotnull AS not_null,
           attribute_row.atttypmod AS type_modifier,
           constraint_row.convalidated AS validated,
           pg_catalog.pg_get_constraintdef(constraint_row.oid, true) AS definition
         FROM pg_catalog.pg_attribute AS attribute_row
         JOIN pg_catalog.pg_constraint AS constraint_row
           ON constraint_row.conrelid = attribute_row.attrelid
          AND constraint_row.conname = 'tenant_users_invitation_source_state_check'
        WHERE attribute_row.attrelid = 'public.tenant_users'::regclass
          AND attribute_row.attname = 'invitation_source'
          AND attribute_row.attisdropped IS FALSE`,
      );
      assert.equal(contract.rows.length, 1);
      assert.equal(contract.rows[0]?.not_null, false);
      assert.equal(contract.rows[0]?.type_modifier, 68);
      assert.equal(contract.rows[0]?.validated, true);
      for (const value of [
        "tenant_role_invite",
        "platform_tenant_admin",
        "platform_tenant_owner",
        "tenant_provisioning_owner",
      ]) {
        assert.match(
          contract.rows[0]?.definition ?? "",
          new RegExp(value, "u"),
        );
      }

      const reservationColumns = await client.query(
        `SELECT table_name, column_name, data_type, character_maximum_length
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND (
              (table_name = 'tenant_users'
                AND column_name = 'invitation_reservation_id')
              OR (table_name = 'platform_users'
                AND column_name IN (
                  'invitation_source',
                  'invitation_reservation_id'
                ))
              OR (table_name = 'personnel'
                AND column_name = 'invitation_reservation_id')
            )
          ORDER BY table_name, column_name`,
      );
      assert.deepEqual(reservationColumns.rows, [
        {
          table_name: "personnel",
          column_name: "invitation_reservation_id",
          data_type: "uuid",
          character_maximum_length: null,
        },
        {
          table_name: "platform_users",
          column_name: "invitation_reservation_id",
          data_type: "uuid",
          character_maximum_length: null,
        },
        {
          table_name: "platform_users",
          column_name: "invitation_source",
          data_type: "character varying",
          character_maximum_length: 64,
        },
        {
          table_name: "tenant_users",
          column_name: "invitation_reservation_id",
          data_type: "uuid",
          character_maximum_length: null,
        },
      ]);
      const reservationConstraints = await client.query(
        `SELECT constraint_row.conname,
                constraint_row.convalidated,
                pg_catalog.pg_get_constraintdef(
                  constraint_row.oid,
                  true
                ) AS definition
           FROM pg_catalog.pg_constraint AS constraint_row
          WHERE constraint_row.conname IN (
                  'tenant_users_invitation_reservation_check',
                  'platform_users_invitation_reservation_check',
                  'personnel_invitation_reservation_check'
                )
          ORDER BY constraint_row.conname`,
      );
      assert.equal(reservationConstraints.rows.length, 3);
      for (const row of reservationConstraints.rows) {
        assert.equal(row.convalidated, true);
        assert.match(row.definition, /invitation_reservation_id/u);
      }
      assert.match(
        reservationConstraints.rows.find(
          (row) =>
            row.conname === "platform_users_invitation_reservation_check",
        )?.definition ?? "",
        /platform_user_invite.*inactive/u,
      );
      assert.match(
        reservationConstraints.rows.find(
          (row) => row.conname === "personnel_invitation_reservation_check",
        )?.definition ?? "",
        /user_id IS NULL.*invite_sent_at IS NOT NULL/u,
      );

      await client.query("BEGIN");
      await client.query(
        `INSERT INTO auth.users (id, email, raw_app_meta_data)
         VALUES
           ($1, 'invite-source@example.invalid', '{}'::jsonb),
           ($2, 'platform-invite-source@example.invalid', '{}'::jsonb),
           ($3, 'personnel-invite-source@example.invalid', '{}'::jsonb)`,
        [
          invitationSourceAuthUserId,
          invitationSourcePlatformAuthUserId,
          invitationSourcePersonnelAuthUserId,
        ],
      );
      await client.query(
        `INSERT INTO public.tenants (id, slug, name, is_active, status)
         VALUES ($1, 'invite-source', 'Invite source', true, 'active')`,
        [invitationSourceTenantId],
      );
      await client.query(
        `INSERT INTO public.tenant_users (
           tenant_id,
           user_id,
           role,
           status,
           invitation_source,
           invitation_reservation_id
         ) VALUES (
           $1,
           $2,
           'member',
           'invited',
           'tenant_role_invite',
           $3
         )`,
        [
          invitationSourceTenantId,
          invitationSourceAuthUserId,
          invitationReservationTokenA,
        ],
      );

      await client.query("SAVEPOINT invalid_active_source");
      await assert.rejects(
        client.query(
          `UPDATE public.tenant_users
              SET status = 'active'
            WHERE tenant_id = $1 AND user_id = $2`,
          [invitationSourceTenantId, invitationSourceAuthUserId],
        ),
        (error) =>
          error?.code === "23514" &&
          error?.constraint === "tenant_users_invitation_source_state_check",
      );
      await client.query("ROLLBACK TO SAVEPOINT invalid_active_source");

      await client.query("SAVEPOINT invalid_member_source");
      await assert.rejects(
        client.query(
          `UPDATE public.tenant_users
              SET role = 'owner'
            WHERE tenant_id = $1 AND user_id = $2`,
          [invitationSourceTenantId, invitationSourceAuthUserId],
        ),
        (error) =>
          error?.code === "23514" &&
          error?.constraint === "tenant_users_invitation_source_state_check",
      );
      await client.query("ROLLBACK TO SAVEPOINT invalid_member_source");

      const ownerReservation = await client.query(
        `UPDATE public.tenant_users
            SET role = 'owner', invitation_source = 'platform_tenant_owner'
          WHERE tenant_id = $1 AND user_id = $2
        RETURNING role, status, invitation_source, invitation_reservation_id`,
        [invitationSourceTenantId, invitationSourceAuthUserId],
      );
      assert.deepEqual(ownerReservation.rows, [
        {
          role: "owner",
          status: "invited",
          invitation_source: "platform_tenant_owner",
          invitation_reservation_id: invitationReservationTokenA,
        },
      ]);

      const reclaimedTenantReservation = await client.query(
        `UPDATE public.tenant_users
            SET invitation_reservation_id = $3
          WHERE tenant_id = $1
            AND user_id = $2
            AND invitation_reservation_id = $4
        RETURNING invitation_reservation_id`,
        [
          invitationSourceTenantId,
          invitationSourceAuthUserId,
          invitationReservationTokenB,
          invitationReservationTokenA,
        ],
      );
      assert.deepEqual(reclaimedTenantReservation.rows, [
        { invitation_reservation_id: invitationReservationTokenB },
      ]);

      const staleTenantActivation = await client.query(
        `UPDATE public.tenant_users
            SET status = 'active',
                invitation_source = NULL,
                invitation_reservation_id = NULL
          WHERE tenant_id = $1
            AND user_id = $2
            AND invitation_reservation_id = $3`,
        [
          invitationSourceTenantId,
          invitationSourceAuthUserId,
          invitationReservationTokenA,
        ],
      );
      assert.equal(staleTenantActivation.rowCount, 0);
      const tenantActivation = await client.query(
        `UPDATE public.tenant_users
            SET status = 'active',
                invitation_source = NULL,
                invitation_reservation_id = NULL
          WHERE tenant_id = $1
            AND user_id = $2
            AND invitation_reservation_id = $3
        RETURNING status, invitation_source, invitation_reservation_id`,
        [
          invitationSourceTenantId,
          invitationSourceAuthUserId,
          invitationReservationTokenB,
        ],
      );
      assert.deepEqual(tenantActivation.rows, [
        {
          status: "active",
          invitation_source: null,
          invitation_reservation_id: null,
        },
      ]);

      await client.query(
        `INSERT INTO public.platform_users (
           id,
           user_id,
           role,
           status,
           invitation_source,
           invitation_reservation_id
         ) VALUES ($1, $2, 'admin', 'inactive', 'platform_user_invite', $3)`,
        [
          invitationSourcePlatformUserId,
          invitationSourcePlatformAuthUserId,
          invitationReservationTokenA,
        ],
      );
      await client.query("SAVEPOINT invalid_platform_activation");
      await assert.rejects(
        client.query(
          `UPDATE public.platform_users
              SET status = 'active'
            WHERE id = $1`,
          [invitationSourcePlatformUserId],
        ),
        (error) =>
          error?.code === "23514" &&
          error?.constraint ===
            "platform_users_invitation_reservation_check",
      );
      await client.query("ROLLBACK TO SAVEPOINT invalid_platform_activation");
      await client.query(
        `UPDATE public.platform_users
            SET invitation_reservation_id = $2
          WHERE id = $1 AND invitation_reservation_id = $3`,
        [
          invitationSourcePlatformUserId,
          invitationReservationTokenB,
          invitationReservationTokenA,
        ],
      );
      const stalePlatformActivation = await client.query(
        `UPDATE public.platform_users
            SET status = 'active',
                invitation_source = NULL,
                invitation_reservation_id = NULL
          WHERE id = $1 AND invitation_reservation_id = $2`,
        [invitationSourcePlatformUserId, invitationReservationTokenA],
      );
      assert.equal(stalePlatformActivation.rowCount, 0);
      const platformActivation = await client.query(
        `UPDATE public.platform_users
            SET status = 'active',
                invitation_source = NULL,
                invitation_reservation_id = NULL
          WHERE id = $1 AND invitation_reservation_id = $2
        RETURNING status, invitation_source, invitation_reservation_id`,
        [invitationSourcePlatformUserId, invitationReservationTokenB],
      );
      assert.deepEqual(platformActivation.rows, [
        {
          status: "active",
          invitation_source: null,
          invitation_reservation_id: null,
        },
      ]);

      await client.query(
        `INSERT INTO public.personnel (
           id,
           tenant_id,
           first_name,
           last_name,
           email,
           invite_sent_at,
           invitation_reservation_id
         ) VALUES ($1, $2, 'Invite', 'Token', $3, now(), $4)`,
        [
          invitationSourcePersonnelId,
          invitationSourceTenantId,
          "personnel-invite-token@example.invalid",
          invitationReservationTokenA,
        ],
      );
      await client.query("SAVEPOINT invalid_personnel_activation");
      await assert.rejects(
        client.query(
          `UPDATE public.personnel
              SET user_id = $2
            WHERE id = $1`,
          [
            invitationSourcePersonnelId,
            invitationSourcePersonnelAuthUserId,
          ],
        ),
        (error) =>
          error?.code === "23514" &&
          error?.constraint === "personnel_invitation_reservation_check",
      );
      await client.query("ROLLBACK TO SAVEPOINT invalid_personnel_activation");
      await client.query(
        `UPDATE public.personnel
            SET invitation_reservation_id = $2
          WHERE id = $1 AND invitation_reservation_id = $3`,
        [
          invitationSourcePersonnelId,
          invitationReservationTokenB,
          invitationReservationTokenA,
        ],
      );
      const stalePersonnelActivation = await client.query(
        `UPDATE public.personnel
            SET user_id = $2, invitation_reservation_id = NULL
          WHERE id = $1 AND invitation_reservation_id = $3`,
        [
          invitationSourcePersonnelId,
          invitationSourcePersonnelAuthUserId,
          invitationReservationTokenA,
        ],
      );
      assert.equal(stalePersonnelActivation.rowCount, 0);
      const personnelActivation = await client.query(
        `UPDATE public.personnel
            SET user_id = $2, invitation_reservation_id = NULL
          WHERE id = $1 AND invitation_reservation_id = $3
        RETURNING user_id::text, invitation_reservation_id`,
        [
          invitationSourcePersonnelId,
          invitationSourcePersonnelAuthUserId,
          invitationReservationTokenB,
        ],
      );
      assert.deepEqual(personnelActivation.rows, [
        {
          user_id: invitationSourcePersonnelAuthUserId,
          invitation_reservation_id: null,
        },
      ]);
      await client.query("ROLLBACK");
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      await client.end();
    }
  });
}

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

      await client.query("BEGIN");
      try {
        const alterPolicy = await client.query(
          `SELECT pg_catalog.format(
             'ALTER POLICY fieldgrid_migration_admin_platform_overlap_delete ON public.platform_users TO PUBLIC, %I',
             configuration.migration_admin
           ) AS statement
           FROM app_private.fieldgrid_runtime_principal_configuration AS configuration
          WHERE configuration.singleton IS TRUE`,
        );
        assert.equal(alterPolicy.rows.length, 1);
        await client.query(alterPolicy.rows[0].statement);

        const projectedRoles = await client.query(
          `SELECT ARRAY(
             SELECT COALESCE(
               role_row.rolname::text,
               CASE
                 WHEN policy_role.role_oid = 0 THEN 'PUBLIC'
                 ELSE pg_catalog.format('oid:%s', policy_role.role_oid)
               END
             )
               FROM pg_catalog.pg_policy AS policy_row
              CROSS JOIN LATERAL unnest(policy_row.polroles)
                AS policy_role(role_oid)
               LEFT JOIN pg_catalog.pg_roles AS role_row
                 ON role_row.oid = policy_role.role_oid
              WHERE policy_row.polrelid = 'public.platform_users'::regclass
                AND policy_row.polname =
                  'fieldgrid_migration_admin_platform_overlap_delete'
              ORDER BY 1
           ) AS roles`,
        );
        assert.deepEqual(projectedRoles.rows, [
          // PostgreSQL canonicalizes a policy containing PUBLIC plus named
          // roles to PUBLIC because OID 0 already includes every role.
          { roles: ["PUBLIC"] },
        ]);
      } finally {
        await client.query("ROLLBACK");
      }
    } finally {
      await client.end();
    }
  });

  test("Auth surface lock denies direct access to named Supabase and runtime roles", async () => {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: false,
    });
    await client.connect();
    try {
      const relation = await client.query(
        `SELECT
           relation_row.relrowsecurity AS rls_enabled,
           (
             SELECT COUNT(*)::integer
             FROM pg_catalog.pg_policy AS policy_row
             WHERE policy_row.polrelid = relation_row.oid
           ) AS policy_count
         FROM pg_catalog.pg_class AS relation_row
         WHERE relation_row.oid =
           'public.fieldgrid_auth_surface_locks'::regclass`,
      );
      assert.deepEqual(relation.rows, [
        { rls_enabled: true, policy_count: 0 },
      ]);

      const forbiddenAcl = await client.query(
        `SELECT role_name, privilege_name
         FROM (
           VALUES
             ('anon'::name),
             ('authenticated'::name),
             ('service_role'::name),
             ('fieldgrid_runtime_app'::name),
             ('fieldgrid_runtime_data'::name)
         ) AS forbidden_role(role_name)
         CROSS JOIN unnest(ARRAY[
           'SELECT',
           'INSERT',
           'UPDATE',
           'DELETE',
           'TRUNCATE',
           'REFERENCES',
           'TRIGGER',
           'MAINTAIN'
         ]::text[]) AS operation(privilege_name)
         WHERE pg_catalog.has_table_privilege(
           forbidden_role.role_name,
           'public.fieldgrid_auth_surface_locks'::regclass,
           operation.privilege_name
         )`,
      );
      assert.deepEqual(forbiddenAcl.rows, []);

      const capability = await client.query(
        `SELECT access_mode, privileges
         FROM app_private.fieldgrid_runtime_relation_capabilities
         WHERE schema_name = 'public'
           AND relation_name = 'fieldgrid_auth_surface_locks'`,
      );
      assert.deepEqual(capability.rows, [
        { access_mode: "function_only", privileges: [] },
      ]);
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
