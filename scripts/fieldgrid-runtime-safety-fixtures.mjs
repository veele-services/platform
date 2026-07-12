#!/usr/bin/env node
import { join } from "node:path";
import {
  FIXTURE,
  columnExists,
  connect,
  tableExists,
  writeJsonArtifact,
  writeTextArtifact,
} from "./fieldgrid-runtime-safety-lib.mjs";

const MODULES = [
  "customers",
  "objects",
  "personnel",
  "assignments",
  "planning",
  "documents",
  "finance",
  "customer_portal",
  "personnel_portal",
  "notifications",
];

const PERMISSIONS = [
  ["customers", "read"],
  ["customers", "write"],
  ["assignments", "read"],
  ["assignments", "write"],
  ["personnel", "read"],
  ["personnel", "write"],
];

const ACTORS = [
  ["platform-owner@runtime.fieldgrid.test", FIXTURE.users.platformOwner],
  ["platform-admin@runtime.fieldgrid.test", FIXTURE.users.platformAdmin],
  ["platform-support@runtime.fieldgrid.test", FIXTURE.users.platformSupport],
  ["owner@tenant-a.runtime.fieldgrid.test", FIXTURE.users.tenantAOwner],
  ["admin@tenant-a.runtime.fieldgrid.test", FIXTURE.users.tenantAAdmin],
  ["planner@tenant-a.runtime.fieldgrid.test", FIXTURE.users.tenantAPlanner],
  ["personnel@tenant-a.runtime.fieldgrid.test", FIXTURE.users.tenantAPersonnel],
  ["customer@tenant-a.runtime.fieldgrid.test", FIXTURE.users.tenantACustomer],
  ["owner@tenant-b.runtime.fieldgrid.test", FIXTURE.users.tenantBOwner],
  ["admin@tenant-b.runtime.fieldgrid.test", FIXTURE.users.tenantBAdmin],
  ["planner@tenant-b.runtime.fieldgrid.test", FIXTURE.users.tenantBPlanner],
  ["personnel@tenant-b.runtime.fieldgrid.test", FIXTURE.users.tenantBPersonnel],
  ["customer@tenant-b.runtime.fieldgrid.test", FIXTURE.users.tenantBCustomer],
  ["multi@runtime.fieldgrid.test", FIXTURE.users.multiTenant],
  ["owner@suspended.runtime.fieldgrid.test", FIXTURE.users.suspendedOwner],
  ["owner@module-off.runtime.fieldgrid.test", FIXTURE.users.moduleOffOwner],
];

async function insertAuthUsers(client) {
  for (const [email, id] of ACTORS) {
    await client.query(
      `
        insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
        values ($1, $2, now(), '{"provider":"runtime-safety"}'::jsonb, jsonb_build_object('fixture', true, 'expired_recovery_at', '2026-01-01T00:00:00Z'))
        on conflict (id) do update set email = excluded.email, raw_user_meta_data = excluded.raw_user_meta_data
      `,
      [id, email],
    );
  }
}

async function insertTenants(client) {
  const tenants = [
    [FIXTURE.tenants.a, "runtime-tenant-a", "Runtime Tenant A", true, "active", "professional"],
    [FIXTURE.tenants.b, "runtime-tenant-b", "Runtime Tenant B", true, "active", "professional"],
    [FIXTURE.tenants.suspended, "runtime-suspended", "Runtime Suspended Tenant", false, "suspended", "professional"],
    [FIXTURE.tenants.moduleOff, "runtime-module-off", "Runtime Module Off Tenant", true, "active", "professional"],
  ];
  for (const tenant of tenants) {
    await client.query(
      `
        insert into tenants (id, slug, name, is_active, status, plan_key)
        values ($1, $2, $3, $4, $5, $6)
        on conflict (id) do update set
          slug = excluded.slug,
          name = excluded.name,
          is_active = excluded.is_active,
          status = excluded.status,
          plan_key = excluded.plan_key
      `,
      tenant,
    );
  }

  const domains = [
    [FIXTURE.tenants.a, "tenant-a.runtime.fieldgrid.test"],
    [FIXTURE.tenants.b, "tenant-b.runtime.fieldgrid.test"],
    [FIXTURE.tenants.moduleOff, "module-off.runtime.fieldgrid.test"],
  ];
  for (const [tenantId, domain] of domains) {
    await client.query(
      `
        insert into tenant_domains (tenant_id, domain, type, is_primary, verification_status, verification_method, tls_status, activated_at, verified_at)
        values ($1, $2, 'fieldgrid_subdomain', true, 'verified', 'dns_txt', 'active', now(), now())
        on conflict (domain) do update set tenant_id = excluded.tenant_id, verification_status = excluded.verification_status
      `,
      [tenantId, domain],
    );
  }
}

async function insertPlatformUsers(client) {
  const rows = [
    [FIXTURE.platformUsers.owner, FIXTURE.users.platformOwner, "owner"],
    [FIXTURE.platformUsers.admin, FIXTURE.users.platformAdmin, "admin"],
    [FIXTURE.platformUsers.support, FIXTURE.users.platformSupport, "support"],
  ];
  for (const row of rows) {
    await client.query(
      `
        insert into platform_users (id, user_id, role, status, created_by)
        values ($1, $2, $3, 'active', $2)
        on conflict (id) do update set user_id = excluded.user_id, role = excluded.role, status = excluded.status
      `,
      row,
    );
  }

  await client.query(
    `
      insert into support_access_grants (id, tenant_id, platform_user_id, reason, starts_at, expires_at, revoked_at, created_by)
      values ($1, $2, $3, 'expired runtime safety fixture', now() - interval '10 days', now() - interval '1 day', null, $4)
      on conflict (id) do update set expires_at = excluded.expires_at, revoked_at = excluded.revoked_at
    `,
    [
      FIXTURE.supportGrantExpired,
      FIXTURE.tenants.a,
      FIXTURE.platformUsers.support,
      FIXTURE.users.platformAdmin,
    ],
  );
}

async function insertModulesAndPermissions(client) {
  for (const moduleKey of MODULES) {
    await client.query(
      `
        insert into modules (key, name, category, is_system, is_enabled_by_default)
        values ($1, $2, 'runtime', true, true)
        on conflict (key) do update set name = excluded.name
      `,
      [moduleKey, `Runtime ${moduleKey}`],
    );
  }

  for (const [resource, action] of PERMISSIONS) {
    await client.query(
      `
        insert into permissions (resource, action, description)
        values ($1, $2, 'runtime safety fixture')
        on conflict (resource, action) do nothing
      `,
      [resource, action],
    );
  }

  const moduleRows = await client.query("select id, key from modules where key = any($1::text[])", [MODULES]);
  for (const tenantId of Object.values(FIXTURE.tenants)) {
    for (const row of moduleRows.rows) {
      const enabled = !(tenantId === FIXTURE.tenants.moduleOff && row.key === "customers");
      await client.query(
        `
          insert into tenant_modules (tenant_id, module_id, is_enabled, source, enabled_at, disabled_at)
          values ($1, $2, $3, 'manual', case when $3 then now() else null end, case when $3 then null else now() end)
          on conflict (tenant_id, module_id) do update set is_enabled = excluded.is_enabled, disabled_at = excluded.disabled_at
        `,
        [tenantId, row.id, enabled],
      );
    }
  }
}

async function insertTenantRoles(client, tenantId, roleName, userIds) {
  const role = await client.query(
    `
      insert into tenant_roles (tenant_id, name, description, is_system, is_custom)
      values ($1, $2, 'runtime safety role', true, false)
      on conflict (tenant_id, name) do update set description = excluded.description
      returning id
    `,
    [tenantId, roleName],
  );
  const roleId = role.rows[0].id;

  await client.query(
    `
      insert into tenant_role_permissions (tenant_role_id, permission_id)
      select $1::uuid, id
      from permissions
      where (resource, action) in (('customers', 'read'), ('customers', 'write'), ('assignments', 'read'), ('assignments', 'write'), ('personnel', 'read'), ('personnel', 'write'))
      on conflict do nothing
    `,
    [roleId],
  );

  for (const userId of userIds) {
    await client.query(
      `
        insert into tenant_users (tenant_id, user_id, role, status)
        values ($1, $2, 'member', 'active')
        on conflict (tenant_id, user_id) do update set status = excluded.status
      `,
      [tenantId, userId],
    );
    await client.query(
      `
        insert into tenant_user_roles (tenant_id, user_id, tenant_role_id)
        values ($1, $2, $3)
        on conflict do nothing
      `,
      [tenantId, userId, roleId],
    );
  }
}

async function insertTenantUsersAndRoles(client) {
  await insertTenantRoles(client, FIXTURE.tenants.a, "runtime-a-all-access", [
    FIXTURE.users.tenantAOwner,
    FIXTURE.users.tenantAAdmin,
    FIXTURE.users.tenantAPlanner,
    FIXTURE.users.tenantAPersonnel,
    FIXTURE.users.tenantACustomer,
    FIXTURE.users.multiTenant,
  ]);
  await insertTenantRoles(client, FIXTURE.tenants.b, "runtime-b-all-access", [
    FIXTURE.users.tenantBOwner,
    FIXTURE.users.tenantBAdmin,
    FIXTURE.users.tenantBPlanner,
    FIXTURE.users.tenantBPersonnel,
    FIXTURE.users.tenantBCustomer,
    FIXTURE.users.multiTenant,
  ]);
  await insertTenantRoles(client, FIXTURE.tenants.suspended, "runtime-suspended-all-access", [
    FIXTURE.users.suspendedOwner,
  ]);
  await insertTenantRoles(client, FIXTURE.tenants.moduleOff, "runtime-module-off-all-access", [
    FIXTURE.users.moduleOffOwner,
  ]);
}

async function insertBusinessRows(client) {
  const customers = [
    [FIXTURE.customers.a, FIXTURE.tenants.a, "Runtime Customer A", "RTA-C001", "customer@tenant-a.runtime.fieldgrid.test"],
    [FIXTURE.customers.b, FIXTURE.tenants.b, "Runtime Customer B", "RTB-C001", "customer@tenant-b.runtime.fieldgrid.test"],
  ];
  for (const row of customers) {
    await client.query(
      `
        insert into customers (id, tenant_id, name, code, contact_email, is_active)
        values ($1, $2, $3, $4, $5, true)
        on conflict (id) do update set tenant_id = excluded.tenant_id, name = excluded.name, contact_email = excluded.contact_email
      `,
      row,
    );
  }

  const objects = [
    [FIXTURE.objects.a, FIXTURE.tenants.a, FIXTURE.customers.a, "Runtime Object A", "RTA-O001"],
    [FIXTURE.objects.b, FIXTURE.tenants.b, FIXTURE.customers.b, "Runtime Object B", "RTB-O001"],
  ];
  for (const row of objects) {
    await client.query(
      `
        insert into objects (id, tenant_id, customer_id, name, code, is_active)
        values ($1, $2, $3, $4, $5, true)
        on conflict (id) do update set tenant_id = excluded.tenant_id, customer_id = excluded.customer_id, name = excluded.name
      `,
      row,
    );
  }

  const personnel = [
    [FIXTURE.personnel.a, FIXTURE.tenants.a, FIXTURE.users.tenantAPersonnel, "RTA-P001", "Runtime", "Personnel A", "personnel@tenant-a.runtime.fieldgrid.test"],
    [FIXTURE.personnel.b, FIXTURE.tenants.b, FIXTURE.users.tenantBPersonnel, "RTB-P001", "Runtime", "Personnel B", "personnel@tenant-b.runtime.fieldgrid.test"],
  ];
  for (const row of personnel) {
    await client.query(
      `
        insert into personnel (id, tenant_id, user_id, code, first_name, last_name, email, is_active, is_available)
        values ($1, $2, $3, $4, $5, $6, $7, true, true)
        on conflict (id) do update set tenant_id = excluded.tenant_id, user_id = excluded.user_id, email = excluded.email
      `,
      row,
    );
  }

  const assignments = [
    [FIXTURE.assignments.a, FIXTURE.tenants.a, "RTA-A001", "Runtime Assignment A", FIXTURE.customers.a, FIXTURE.objects.a],
    [FIXTURE.assignments.b, FIXTURE.tenants.b, "RTB-A001", "Runtime Assignment B", FIXTURE.customers.b, FIXTURE.objects.b],
  ];
  for (const row of assignments) {
    await client.query(
      `
        insert into assignments (id, tenant_id, code, title, customer_id, object_id, status, priority, is_active)
        values ($1, $2, $3, $4, $5, $6, 'scheduled', 'normal', true)
        on conflict (id) do update set tenant_id = excluded.tenant_id, customer_id = excluded.customer_id, object_id = excluded.object_id
      `,
      row,
    );
  }

  if (await tableExists(client, "public", "customer_users")) {
    await client.query(
      `
        insert into customer_users (tenant_id, customer_id, user_id, email, role, status, invite_sent_at)
        values
          ($1, $2, $3, 'customer@tenant-a.runtime.fieldgrid.test', 'primary', 'active', now()),
          ($4, $5, $6, 'customer@tenant-b.runtime.fieldgrid.test', 'primary', 'active', now())
        on conflict do nothing
      `,
      [
        FIXTURE.tenants.a,
        FIXTURE.customers.a,
        FIXTURE.users.tenantACustomer,
        FIXTURE.tenants.b,
        FIXTURE.customers.b,
        FIXTURE.users.tenantBCustomer,
      ],
    );
  }
}

async function insertExpiredInviteFixtures(client) {
  if (await tableExists(client, "public", "tenant_owner_invites")) {
    await client.query(
      `
        insert into tenant_owner_invites (id, tenant_id, email, user_id, status, invited_by, invite_sent_at, metadata)
        values ($1, $2, 'expired-owner@tenant-a.runtime.fieldgrid.test', null, 'sent', $3, now() - interval '30 days', '{"expired":true,"expires_at":"2026-01-01T00:00:00Z"}'::jsonb)
        on conflict (tenant_id, email) do update set invite_sent_at = excluded.invite_sent_at, metadata = excluded.metadata
      `,
      [FIXTURE.tenantOwnerInviteExpired, FIXTURE.tenants.a, FIXTURE.users.platformAdmin],
    );
  }

  if (await tableExists(client, "public", "sensitive_access_requests")) {
    await client.query(
      `
        insert into sensitive_access_requests (id, tenant_id, requested_by_user_id, requested_role, data_scope, data_classification_level, reason, approval_required_from, status, expires_at)
        values ('80000000-0000-4000-8000-000000000003', $1, $2, 'support', 'password-recovery', 3, 'expired recovery fixture', 'tenant_owner', 'expired', now() - interval '1 day')
        on conflict (id) do nothing
      `,
      [FIXTURE.tenants.a, FIXTURE.users.platformSupport],
    );
  }
}

async function assertFixtureIntegrity(client) {
  const hasRoleId = await columnExists(client, "tenant_user_roles", "tenant_role_id");
  const hasLegacyRoleId = await columnExists(client, "tenant_user_roles", "role_id");
  const counts = {};
  for (const table of ["tenants", "tenant_users", "platform_users", "customers", "personnel", "assignments", "tenant_modules"]) {
    const count = await client.query(`select count(*)::int as count from ${table}`);
    counts[table] = count.rows[0].count;
  }
  return {
    counts,
    rbacShape: {
      hasTenantRoleId: hasRoleId,
      hasLegacyRoleId,
      selectedShape: hasRoleId ? "tenant_role_id" : "legacy-role-id",
    },
  };
}

async function main() {
  const client = await connect();
  const startedAt = new Date().toISOString();
  try {
    await client.query("begin");
    await insertAuthUsers(client);
    await insertTenants(client);
    await insertPlatformUsers(client);
    await insertModulesAndPermissions(client);
    await insertTenantUsersAndRoles(client);
    await insertBusinessRows(client);
    await insertExpiredInviteFixtures(client);
    const integrity = await assertFixtureIntegrity(client);
    await client.query("commit");

    await writeJsonArtifact(join("reports", "fixtures.json"), {
      name: "runtime-safety-fixtures",
      status: "passed",
      startedAt,
      completedAt: new Date().toISOString(),
      fixtureIds: FIXTURE,
      integrity,
      limitations: [
        "Expired recovery is represented as local auth metadata and sensitive-access rows because this repository has no local Supabase password-reset token table.",
        "Fixture loader uses direct SQL into the ephemeral database; it does not call Supabase Admin or send email.",
      ],
    });
  } catch (error) {
    await client.query("rollback").catch(() => {});
    await writeTextArtifact(
      join("logs", "fixtures-error.log"),
      `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
