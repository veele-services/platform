import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "lib/db/migrations/20260718190000_phase2_security_reconciliation.sql";
const migration = readFileSync(migrationPath, "utf8");
const tenantRbacMigration = readFileSync(
  "lib/db/migrations/20260824150000_tenant_role_membership_scope.sql",
  "utf8",
);
const customerIdentity = readFileSync("artifacts/klant-pwa/src/actions/customer.ts", "utf8");
const customerAssignments = readFileSync("artifacts/klant-pwa/src/actions/assignments.ts", "utf8");
const customerReports = readFileSync("artifacts/klant-pwa/src/actions/reports.ts", "utf8");
const auditAction = readFileSync("artifacts/backoffice/src/app/actions/settings.ts", "utf8");
const availabilityAction = readFileSync("artifacts/backoffice/src/app/actions/availability.ts", "utf8");
const dbHarness = readFileSync("scripts/fieldgrid-runtime-safety-harness.mjs", "utf8");
const dbRequire = createRequire(new URL("../lib/db/package.json", import.meta.url));
const { Client } = dbRequire("pg");

test("Phase 2C uses a forward-only migration and tenant-scoped management helper", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.is_management_for_tenant\(p_tenant_id uuid\)/u);
  assert.match(migration, /tu\.tenant_id = p_tenant_id/u);
  assert.match(migration, /tu\.status = 'active'/u);
  assert.match(migration, /t\.is_active IS TRUE/u);
  assert.match(migration, /assignments_management_all[\s\S]*is_management_for_tenant\(tenant_id\)/u);
  assert.match(migration, /portal_realtime_events_management_read[\s\S]*is_management_for_tenant\(tenant_id\)/u);
  assert.doesNotMatch(migration, /tenant_id = '00000000-0000-0000-0000-000000000010'/u);
});

test("raw customer workflow policies are removed and app projections are explicit", () => {
  for (const policy of [
    "assignments_customer_users_select",
    "assignment_tasks_customer_users_select",
    "assignment_extra_work_customer_users_select",
    "assignment_photos_customer_approved_select",
    "reports_customer_approved_select",
  ]) {
    assert.match(migration, new RegExp(`DROP POLICY IF EXISTS ${policy}`, "u"));
  }
  assert.match(migration, /CREATE VIEW public\.customer_assignment_projection[\s\S]*WITH \(security_barrier = true\)/u);
  assert.match(migration, /cu\.user_id = auth\.uid\(\)[\s\S]*cu\.status = 'active'/u);
  assert.match(migration, /REVOKE ALL ON public\.customer_assignment_projection FROM PUBLIC, anon/u);
  assert.match(migration, /GRANT SELECT ON public\.customer_assignment_projection TO authenticated/u);
  assert.match(customerIdentity, /eq\(customerUsersTable\.status, "active"\)/u);
  assert.match(customerIdentity, /eq\(customerUsersTable\.userId, user\.id\)/u);
  assert.match(customerIdentity, /eq\(customersTable\.isActive, true\)/u);
  assert.doesNotMatch(customerIdentity, /isNull\(customerUsersTable\.userId\)/u);
  assert.doesNotMatch(customerIdentity, /user\.email\.toLowerCase\(\)/u);
  assert.match(customerAssignments, /visibilityScope, "customer_approved"/u);
  assert.match(customerReports, /visibilityScope, "customer_approved"/u);
});

test("personnel inserts cannot self-approve customer-visible financial or photo state", () => {
  assert.match(migration, /personnel_insert_photos[\s\S]*is_approved IS FALSE[\s\S]*visibility_scope = 'internal_until_approved'/u);
  assert.match(migration, /assignment_material_usage_personnel_assigned_insert[\s\S]*approval_status = 'pending'/u);
  assert.match(migration, /approved_by IS NULL/u);
  assert.match(migration, /invoiceable IS FALSE/u);
  assert.match(migration, /customer_visible IS FALSE/u);
  assert.match(migration, /assignment_photos_assigned_personnel_update[\s\S]*owner = auth\.uid\(\)/u);
  assert.match(migration, /assignment_photos_assigned_personnel_delete[\s\S]*owner = auth\.uid\(\)/u);
});

test("definer path, ACL and cross-surface signup controls are explicit", () => {
  assert.match(migration, /REVOKE CREATE ON SCHEMA public FROM PUBLIC/u);
  assert.match(migration, /SET search_path = pg_catalog, public, pg_temp/u);
  assert.match(migration, /DROP TRIGGER IF EXISTS on_auth_user_created ON auth\.users/u);
  assert.match(migration, /REVOKE ALL ON FUNCTION app_private\.link_personnel_on_signup\(\)/u);
  const alteredRealtimeFunctions = migration.match(/ALTER FUNCTION public\.(?:portal|trg_portal)_realtime_[^(]+\([^;]*SET search_path = pg_catalog, public, pg_temp;/gu) ?? [];
  assert.equal(alteredRealtimeFunctions.length, 20);
});

test("realtime payload redaction is recursive and recipient tuples are validated", () => {
  assert.match(migration, /fieldgrid_redact_realtime_payload\(entry\.value\)/u);
  assert.match(migration, /jsonb_array_elements\(p_value\)/u);
  assert.match(migration, /regexp_replace\(lower\(entry\.key\)/u);
  assert.match(migration, /p_realtime_key <> 'customer_' \|\| p_customer_id::text/u);
  assert.match(migration, /p_realtime_key <> 'personnel_' \|\| p_personnel_id::text/u);
});

test("audit reads and bulk availability writes are tenant-scoped and atomic", () => {
  assert.match(auditAction, /const tenantId = await requireCurrentTenantId\(\)/u);
  assert.match(auditAction, /eq\(auditLogTable\.tenantId, tenantId\)/u);
  assert.match(availabilityAction, /await db\.transaction\(async \(tx\)/u);
  assert.match(availabilityAction, /tenantId,[\s\S]*action: "update"/u);
});

test("tenantless write inventory excludes read-only projections", () => {
  assert.match(dbHarness, /join information_schema\.tables tables_row/u);
  assert.match(dbHarness, /tables_row\.table_type = 'BASE TABLE'/u);
});

test("tenant RBAC migration adds both fail-closed composite ownership constraints", () => {
  assert.match(tenantRbacMigration, /FOREIGN KEY \(tenant_id, tenant_role_id\)/u);
  assert.match(tenantRbacMigration, /FOREIGN KEY \(tenant_id, user_id\)/u);
  assert.doesNotMatch(tenantRbacMigration, /UPDATE\s+public\.tenant_user_roles/iu);
  assert.doesNotMatch(tenantRbacMigration, /DELETE\s+FROM\s+public\.tenant_user_roles/iu);
});

test(
  "installed tenant RBAC constraints reject cross-tenant roles and non-members",
  async () => {
    if (!process.env.DATABASE_URL) {
      assert.match(
        tenantRbacMigration,
        /ADD CONSTRAINT tenant_user_roles_tenant_role_scope_fk[\s\S]*FOREIGN KEY \(tenant_id, tenant_role_id\)[\s\S]*NOT VALID/u,
      );
      assert.match(
        tenantRbacMigration,
        /ADD CONSTRAINT tenant_user_roles_tenant_membership_fk[\s\S]*FOREIGN KEY \(tenant_id, user_id\)[\s\S]*NOT VALID/u,
      );
      return;
    }

    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: false,
    });
    await client.connect();
    await client.query("begin");
    try {
      const tenantA = "a1000000-0000-4000-8000-000000000001";
      const tenantB = "a1000000-0000-4000-8000-000000000002";
      const userA = "a2000000-0000-4000-8000-000000000001";
      const userB = "a2000000-0000-4000-8000-000000000002";
      const roleA = "a3000000-0000-4000-8000-000000000001";

      await client.query(
        "insert into public.tenants (id, slug, name) values ($1, 'rbac-runtime-a', 'RBAC runtime A'), ($2, 'rbac-runtime-b', 'RBAC runtime B')",
        [tenantA, tenantB],
      );
      await client.query(
        "insert into public.tenant_users (tenant_id, user_id, role, status) values ($1, $2, 'member', 'active'), ($3, $4, 'member', 'active')",
        [tenantA, userA, tenantB, userB],
      );
      await client.query(
        "insert into public.tenant_roles (id, tenant_id, name, is_custom) values ($1, $2, 'Runtime role A', true)",
        [roleA, tenantA],
      );
      await client.query(
        "insert into public.tenant_user_roles (tenant_id, user_id, tenant_role_id) values ($1, $2, $3)",
        [tenantA, userA, roleA],
      );

      for (const [savepoint, values, expectedConstraint] of [
        [
          "cross_tenant_role",
          [tenantB, userB, roleA],
          "tenant_user_roles_tenant_role_scope_fk",
        ],
        [
          "missing_membership",
          [tenantA, userB, roleA],
          "tenant_user_roles_tenant_membership_fk",
        ],
      ]) {
        await client.query(`savepoint ${savepoint}`);
        try {
          await client.query(
            "insert into public.tenant_user_roles (tenant_id, user_id, tenant_role_id) values ($1, $2, $3)",
            values,
          );
          assert.fail(`Expected ${expectedConstraint} to reject the insert`);
        } catch (error) {
          assert.equal(error.code, "23503");
          assert.equal(error.constraint, expectedConstraint);
          await client.query(`rollback to savepoint ${savepoint}`);
        }
        await client.query(`release savepoint ${savepoint}`);
      }

      await client.query(
        "alter table public.tenant_user_roles validate constraint tenant_user_roles_tenant_role_scope_fk",
      );
      await client.query(
        "alter table public.tenant_user_roles validate constraint tenant_user_roles_tenant_membership_fk",
      );
      const validated = await client.query(`
        select conname, convalidated
        from pg_constraint
        where conrelid = 'public.tenant_user_roles'::regclass
          and conname in (
            'tenant_user_roles_tenant_role_scope_fk',
            'tenant_user_roles_tenant_membership_fk'
          )
        order by conname
      `);
      assert.deepEqual(
        validated.rows,
        [
          {
            conname: "tenant_user_roles_tenant_membership_fk",
            convalidated: true,
          },
          {
            conname: "tenant_user_roles_tenant_role_scope_fk",
            convalidated: true,
          },
        ],
      );
    } finally {
      await client.query("rollback");
      await client.end();
    }
  },
);

test(
  "installed Phase 2C definer catalog has trusted paths and explicit ACLs",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: false });
    await client.connect();
    try {
      const rows = await client.query(`
        select
          n.nspname,
          p.proname,
          pg_get_function_identity_arguments(p.oid) as args,
          owner.rolname as owner,
          p.proconfig,
          coalesce(bool_or(acl.grantee = 0 and acl.privilege_type = 'EXECUTE'), false) as public_execute
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        join pg_roles owner on owner.oid = p.proowner
        left join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl on true
        where p.prosecdef
          and (
            p.proname like 'portal_realtime_%'
            or p.proname like 'trg_portal_realtime_%'
            or p.proname in (
              'is_management', 'is_management_for_tenant', 'current_user_tenant_ids',
              'personnel_assigned_to_assignment', 'personnel_can_access_assignment_storage',
              'trg_assignment_personnel_tenant_guard', 'trg_assignment_participant_execution_guard',
              'recompute_assignment_execution_projection', 'transition_assignment_staffing',
              'cancel_assignment_staffing', 'trg_assignment_personnel_reactivation_history',
              'trg_assignment_personnel_execution_seed', 'execute_assignment_participant_action',
              'cleanup_expired_credential_recovery_challenges', 'link_personnel_on_signup'
            )
          )
        group by n.nspname, p.oid, owner.rolname
        order by n.nspname, p.proname, args
      `);

      assert.equal(rows.rows.length, 35);
      for (const row of rows.rows) {
        assert.equal(row.owner, "postgres", `${row.nspname}.${row.proname} owner`);
        assert.equal(row.public_execute, false, `${row.nspname}.${row.proname} PUBLIC execute`);
        assert.ok(row.proconfig?.some((value) => value.startsWith("search_path=")), `${row.proname} path`);
      }

      const schemaAcl = await client.query(`
        select has_schema_privilege('authenticated', 'public', 'CREATE') as authenticated_create,
               has_schema_privilege('anon', 'public', 'CREATE') as anon_create
      `);
      assert.deepEqual(schemaAcl.rows[0], { authenticated_create: false, anon_create: false });
    } finally {
      await client.end();
    }
  },
);
