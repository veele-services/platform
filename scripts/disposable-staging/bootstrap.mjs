import { COMPATIBILITY_TENANT_ID, requireThat } from "./contract.mjs";

function quoteIdentifier(value) {
  requireThat(
    typeof value === "string" && value.length > 0 && value.length <= 63,
    "BOOTSTRAP_CATALOG_INVALID",
    "MIGRATED",
    true,
  );
  return `"${value.replaceAll('"', '""')}"`;
}

async function snapshotPublicUserTriggers(client) {
  const triggers = await client.query(`
    SELECT
      relation.relname AS table_name,
      trigger.tgname AS trigger_name,
      trigger.tgenabled AS enabled
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    JOIN pg_trigger trigger ON trigger.tgrelid=relation.oid
    WHERE namespace.nspname='public'
      AND relation.relkind='r'
      AND NOT trigger.tgisinternal
    ORDER BY relation.relname,trigger.tgname
  `);
  return triggers.rows;
}

async function disablePublicUserTriggers(client, triggers) {
  for (const {
    table_name: tableName,
    trigger_name: triggerName,
    enabled,
  } of triggers) {
    if (enabled === "D") continue;
    await client.query(
      `ALTER TABLE public.${quoteIdentifier(tableName)} DISABLE TRIGGER ${quoteIdentifier(triggerName)}`,
    );
  }
}

async function restorePublicUserTriggers(client, triggers) {
  const actions = {
    A: "ENABLE ALWAYS",
    D: "DISABLE",
    O: "ENABLE",
    R: "ENABLE REPLICA",
  };
  for (const {
    table_name: tableName,
    trigger_name: triggerName,
    enabled,
  } of triggers) {
    const action = actions[enabled];
    requireThat(Boolean(action), "BOOTSTRAP_CATALOG_INVALID", "MIGRATED", true);
    await client.query(
      `ALTER TABLE public.${quoteIdentifier(tableName)} ${action} TRIGGER ${quoteIdentifier(triggerName)}`,
    );
  }
}

export async function copyTenantRoles(client, tenantId) {
  await client.query(
    `
    INSERT INTO public.tenant_roles(tenant_id,template_role_id,name,description,is_system,is_custom)
    SELECT $1,r.id,r.name,r.description,true,false
    FROM public.roles r
    WHERE r.is_system
    ON CONFLICT DO NOTHING
  `,
    [tenantId],
  );
  await client.query(
    `
    INSERT INTO public.tenant_role_permissions(tenant_role_id,permission_id)
    SELECT tr.id,rp.permission_id
    FROM public.tenant_roles tr
    JOIN public.role_permissions rp ON rp.role_id=tr.template_role_id
    WHERE tr.tenant_id=$1 AND tr.is_system AND NOT tr.is_custom
    ON CONFLICT DO NOTHING
  `,
    [tenantId],
  );
}

export async function bootstrapDatabase(client, configuration, identities) {
  requireThat(
    Boolean(configuration.platform),
    "BOOTSTRAP_PLATFORM_REQUIRED",
    "MIGRATED",
    true,
  );
  requireThat(
    typeof identities.platform === "string",
    "BOOTSTRAP_PLATFORM_REQUIRED",
    "MIGRATED",
    true,
  );
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='120s'");
    const freshTenants = await client.query(
      "SELECT id FROM public.tenants ORDER BY id",
    );
    requireThat(
      freshTenants.rows.length === 1 &&
        freshTenants.rows[0].id === COMPATIBILITY_TENANT_ID,
      "BOOTSTRAP_DATABASE_NOT_FRESH",
      "MIGRATED",
      true,
    );
    // Canonical migrations intentionally seed one compatibility tenant for
    // forward-migration compatibility. Disposable staging does not retain it:
    // the tenant row is the root of the canonical ON DELETE graph. Application
    // delete/audit/realtime triggers are disabled only inside this quiesced
    // transaction so cascading child deletes cannot emit new rows for a parent
    // that is being removed. Internal FK triggers remain active; any restrictive
    // dependency still fails this transaction closed, and rollback restores the
    // trigger state.
    const publicUserTriggers = await snapshotPublicUserTriggers(client);
    await disablePublicUserTriggers(client, publicUserTriggers);
    await client.query("DELETE FROM public.tenants WHERE id=$1", [
      COMPATIBILITY_TENANT_ID,
    ]);
    await restorePublicUserTriggers(client, publicUserTriggers);
    const remainingTenants = await client.query(
      "SELECT count(*)::int AS count FROM public.tenants",
    );
    requireThat(
      remainingTenants.rows[0]?.count === 0,
      "BOOTSTRAP_TENANT_CLEANUP_INCOMPLETE",
      "MIGRATED",
      true,
    );
    await client.query("DELETE FROM public.platform_users");
    await client.query(
      `
      INSERT INTO public.platform_users(user_id,role,status)
      VALUES ($1,'owner','active')
    `,
      [identities.platform],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

export async function verifyBootstrap(client, configuration, identities) {
  requireThat(
    Boolean(configuration.platform),
    "BOOTSTRAP_PLATFORM_REQUIRED",
    "BOOTSTRAPPED",
    true,
  );
  const tenantState = await client.query(`
    SELECT
      (SELECT count(*)::int FROM public.tenants) AS tenants,
      (SELECT count(*)::int FROM public.tenant_users) AS tenant_users,
      (SELECT count(*)::int FROM public.tenant_user_roles) AS tenant_user_roles,
      (SELECT count(*)::int FROM public.tenant_roles) AS tenant_roles,
      (SELECT count(*)::int FROM public.tenant_domains) AS tenant_domains,
      (SELECT count(*)::int FROM public.organization_settings) AS organization_settings
  `);
  requireThat(
    Object.values(tenantState.rows[0] ?? {}).every((count) => count === 0),
    "BOOTSTRAP_TENANT_STATE_INVALID",
    "BOOTSTRAPPED",
    true,
  );
  const platform = await client.query(`
    SELECT p.user_id,p.role,p.status,EXISTS(SELECT 1 FROM auth.users a WHERE a.id=p.user_id) AS auth_exists
    FROM public.platform_users p
  `);
  requireThat(
    platform.rows.length === 1 &&
      platform.rows[0].user_id === identities.platform &&
      platform.rows[0].role === "owner" &&
      platform.rows[0].status === "active" &&
      platform.rows[0].auth_exists === true,
    "BOOTSTRAP_PLATFORM_ADMIN_INVALID",
    "BOOTSTRAPPED",
    true,
  );
  return {
    tenantCount: 0,
    tenantMembershipCount: 0,
    tenantRoleMembershipCount: 0,
    platformAdmins: 1,
  };
}
