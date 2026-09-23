import { COMPATIBILITY_TENANT_ID, requireThat } from "./contract.mjs";

async function copyTenantRoles(client, tenantId) {
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
    configuration.tenants.length === 2,
    "BOOTSTRAP_TENANT_COUNT",
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
    // Canonical migrations intentionally seed one compatibility tenant that is
    // referenced by several migrated defaults. Re-keying it would cascade
    // through realtime triggers, so tenant A deliberately adopts that fixed ID.
    // Its tenant-facing configuration is cleared and rebuilt explicitly.
    const tenantIds = configuration.tenants.map(({ id }) => id);
    await client.query(
      "DELETE FROM public.tenant_user_roles WHERE tenant_id=ANY($1::uuid[])",
      [tenantIds],
    );
    await client.query(
      "DELETE FROM public.tenant_users WHERE tenant_id=ANY($1::uuid[])",
      [tenantIds],
    );
    await client.query(
      "DELETE FROM public.tenant_domains WHERE tenant_id=ANY($1::uuid[])",
      [tenantIds],
    );
    await client.query(
      "DELETE FROM public.tenant_subscriptions WHERE tenant_id=ANY($1::uuid[])",
      [tenantIds],
    );
    await client.query(
      "DELETE FROM public.tenant_modules WHERE tenant_id=ANY($1::uuid[])",
      [tenantIds],
    );
    await client.query(
      "DELETE FROM public.tenant_sectors WHERE tenant_id=ANY($1::uuid[])",
      [tenantIds],
    );
    await client.query(
      "DELETE FROM public.tenant_first_run_state WHERE tenant_id=ANY($1::uuid[])",
      [tenantIds],
    );
    await client.query(
      "DELETE FROM public.organization_settings WHERE tenant_id=ANY($1::uuid[])",
      [tenantIds],
    );
    await client.query(
      "DELETE FROM public.tenant_roles WHERE tenant_id=ANY($1::uuid[])",
      [tenantIds],
    );
    await client.query("DELETE FROM public.platform_users");
    await client.query(
      `
      INSERT INTO public.platform_users(user_id,role,status)
      VALUES ($1,'owner','active')
    `,
      [identities.platform],
    );

    for (let index = 0; index < configuration.tenants.length; index += 1) {
      const tenant = configuration.tenants[index];
      const managerId = identities.tenants[index];
      if (index === 0) {
        await client.query(
          `
          UPDATE public.tenants SET slug=$2,name=$3,status='active',is_active=true,plan_key='starter'
          WHERE id=$1
        `,
          [tenant.id, tenant.slug, tenant.name],
        );
      } else {
        await client.query(
          `
          INSERT INTO public.tenants(id,slug,name,status,is_active,plan_key)
          VALUES ($1,$2,$3,'active',true,'starter')
        `,
          [tenant.id, tenant.slug, tenant.name],
        );
      }
      await client.query(
        `
        INSERT INTO public.organization_settings(tenant_id,naam)
        VALUES ($1,$2)
      `,
        [tenant.id, tenant.name],
      );
      await copyTenantRoles(client, tenant.id);
      await client.query(
        `
        INSERT INTO public.tenant_users(tenant_id,user_id,role,status)
        VALUES ($1,$2,'owner','active')
      `,
        [tenant.id, managerId],
      );
      await client.query(
        `
        INSERT INTO public.tenant_user_roles(tenant_id,user_id,tenant_role_id)
        SELECT $1,$2,tr.id
        FROM public.tenant_roles tr
        WHERE tr.tenant_id=$1 AND tr.name='Management' AND tr.is_system AND NOT tr.is_custom
      `,
        [tenant.id, managerId],
      );
      await client.query(
        `
        INSERT INTO public.tenant_domains(
          tenant_id,domain,type,is_primary,verification_status,verified_at,
          verification_method,tls_status,activated_at
        ) VALUES ($1,$2,'fieldgrid_subdomain',true,'verified',now(),'dns_txt','active',now())
      `,
        [tenant.id, tenant.host],
      );
      await client.query(
        `
        INSERT INTO public.tenant_subscriptions(
          tenant_id,plan_id,status,source,starts_at,current_period_starts_at
        )
        SELECT $1,id,'active','system',now(),now() FROM public.plans WHERE key='starter'
      `,
        [tenant.id],
      );
      await client.query(
        `
        INSERT INTO public.tenant_modules(tenant_id,module_id,is_enabled,source,enabled_at)
        SELECT $1,pm.module_id,pm.is_included,'plan',CASE WHEN pm.is_included THEN now() END
        FROM public.plan_modules pm JOIN public.plans p ON p.id=pm.plan_id
        WHERE p.key='starter'
      `,
        [tenant.id],
      );
      await client.query(
        `
        INSERT INTO public.tenant_sectors(tenant_id,sector_id,is_enabled)
        SELECT $1,id,true FROM public.sectors
        ON CONFLICT DO NOTHING
      `,
        [tenant.id],
      );
      await client.query(
        `
        INSERT INTO public.tenant_first_run_state(
          tenant_id,status,required_steps,completed_steps,completed_at
        ) VALUES ($1,'completed','["branding","users","sectors","modules"]'::jsonb,
          '["branding","users","sectors","modules"]'::jsonb,now())
      `,
        [tenant.id],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

export async function verifyBootstrap(client, configuration, identities) {
  const result = await client.query(
    `
    SELECT t.id,t.slug,t.name,d.domain,d.verification_status,d.tls_status,
      u.user_id,u.status AS membership_status,r.name AS role_name,
      EXISTS(SELECT 1 FROM auth.users a WHERE a.id=u.user_id) AS auth_exists
    FROM public.tenants t
    JOIN public.tenant_domains d ON d.tenant_id=t.id AND d.is_primary
    JOIN public.tenant_users u ON u.tenant_id=t.id AND u.status='active'
    JOIN public.tenant_user_roles ur ON ur.tenant_id=t.id AND ur.user_id=u.user_id
    JOIN public.tenant_roles r ON r.id=ur.tenant_role_id AND r.tenant_id=ur.tenant_id
    WHERE t.id=ANY($1::uuid[]) AND t.status='active' AND t.is_active
    ORDER BY t.id
  `,
    [configuration.tenants.map(({ id }) => id)],
  );
  requireThat(
    result.rows.length === 2,
    "BOOTSTRAP_MEMBERSHIP_INVALID",
    "BOOTSTRAPPED",
    true,
  );
  for (let index = 0; index < configuration.tenants.length; index += 1) {
    const tenant = configuration.tenants[index];
    const row = result.rows.find((candidate) => candidate.id === tenant.id);
    requireThat(
      Boolean(row) &&
        row.domain === tenant.host &&
        row.user_id === identities.tenants[index] &&
        row.role_name === "Management" &&
        row.auth_exists === true &&
        row.verification_status === "verified" &&
        row.tls_status === "active",
      "BOOTSTRAP_MEMBERSHIP_INVALID",
      "BOOTSTRAPPED",
      true,
    );
  }
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
    tenantManagers: 2,
    platformAdmins: 1,
    hosts: configuration.tenants.map(({ host }) => host).sort(),
  };
}
