import { createHash } from 'node:crypto';
import { requireThat, uuid } from './contract.mjs';

export function fixtureId(operationId, kind) {
  requireThat(uuid(operationId) && /^[a-z-]+$/.test(kind), 'FIXTURE_ID_INVALID');
  const raw = createHash('sha256').update(`${operationId}:${kind}`).digest('hex');
  return `${raw.slice(0,8)}-${raw.slice(8,12)}-4${raw.slice(13,16)}-a${raw.slice(17,20)}-${raw.slice(20,32)}`;
}
export const REQUIRED_TEMPLATES = Object.freeze(['Management', 'Administration', 'Planning', 'Employee']);

export async function resolveCanonicalManager(client, tenantId) {
  requireThat(uuid(tenantId), 'BOOTSTRAP_CONFIGURATION');
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const candidates = (await client.query(`
      SELECT DISTINCT membership.user_id
      FROM public.tenant_users membership
      JOIN auth.users account ON account.id=membership.user_id
      JOIN public.tenant_user_roles grant_link
        ON grant_link.user_id=membership.user_id
       AND grant_link.tenant_id=membership.tenant_id
      JOIN public.tenant_roles scoped_role
        ON scoped_role.id=grant_link.tenant_role_id
       AND scoped_role.tenant_id=grant_link.tenant_id
      JOIN public.roles template ON template.id=scoped_role.template_role_id
      WHERE membership.tenant_id=$1
        AND membership.status='active'
        AND scoped_role.name='Management'
        AND scoped_role.is_system IS TRUE
        AND scoped_role.is_custom IS FALSE
        AND template.name='Management'
        AND template.is_system IS TRUE
      ORDER BY membership.user_id
      LIMIT 21
    `, [tenantId])).rows;
    requireThat(candidates.length <= 20, 'ADMIN_CANDIDATE_LIMIT');

    const allowed = [];
    for (const candidate of candidates) {
      requireThat(uuid(candidate.user_id), 'ADMIN_CANDIDATE_INVALID');
      const claims = JSON.stringify({ sub: candidate.user_id, role: 'authenticated' });
      await client.query(
        `SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)`,
        [candidate.user_id, claims],
      );
      const result = (await client.query(
        'SELECT public.is_management_for_tenant($1::uuid) AS allowed',
        [tenantId],
      )).rows[0];
      if (result?.allowed === true) allowed.push(candidate.user_id);
    }

    requireThat(
      allowed.length === 1,
      allowed.length === 0 ? 'ADMIN_NOT_TENANT_MANAGER' : 'ADMIN_MANAGER_AMBIGUOUS',
    );
    return allowed[0];
  } finally {
    await client.query('ROLLBACK').catch(() => {});
  }
}

export async function assertBootstrapContext(client, context) {
  requireThat(uuid(context?.tenantId) && uuid(context?.adminId) && uuid(context?.operationId), 'BOOTSTRAP_CONTEXT');
  const tenant = (await client.query(`SELECT id FROM public.tenants WHERE id=$1 AND is_active AND status IN ('active','trial')`, [context.tenantId])).rows;
  requireThat(tenant.length === 1, 'TENANT_INACTIVE');
  const user = (await client.query('SELECT id FROM auth.users WHERE id=$1', [context.adminId])).rows;
  requireThat(user.length === 1, 'ADMIN_AUTH_MISSING');
  const templates = (await client.query(`SELECT r.id,r.name FROM public.roles r WHERE r.is_system AND r.name=ANY($1::text[])
    AND EXISTS (SELECT 1 FROM public.role_permissions p WHERE p.role_id=r.id)`, [REQUIRED_TEMPLATES])).rows;
  requireThat(templates.length === REQUIRED_TEMPLATES.length && new Set(templates.map(row => row.name)).size === templates.length, 'CANONICAL_TEMPLATES_MISSING');
  const claims = JSON.stringify({ sub: context.adminId, role: 'authenticated' });
  await client.query(`SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)`, [context.adminId, claims]);
  const allowed = (await client.query('SELECT public.is_management_for_tenant($1::uuid) AS allowed', [context.tenantId])).rows[0];
  requireThat(allowed?.allowed === true, 'ADMIN_NOT_TENANT_MANAGER');
  return templates;
}

// Same canonical role-copy semantics as tenant-provisioning.ts: use the current
// system templates and their permission rows. No new global role/permission map.
export async function copyRoles(client, tenantId) {
  await client.query(`INSERT INTO public.tenant_roles(tenant_id,template_role_id,name,description,is_system,is_custom)
    SELECT $1,r.id,r.name,r.description,true,false FROM public.roles r WHERE r.is_system
    ON CONFLICT DO NOTHING`, [tenantId]);
  await client.query(`INSERT INTO public.tenant_role_permissions(tenant_role_id,permission_id)
    SELECT tr.id,rp.permission_id FROM public.tenant_roles tr JOIN public.role_permissions rp ON rp.role_id=tr.template_role_id
    WHERE tr.tenant_id=$1 AND tr.is_system AND NOT tr.is_custom ON CONFLICT DO NOTHING`, [tenantId]);
}

export async function bootstrapCanonical(client, context) {
  await assertBootstrapContext(client, context);
  const isolationId = fixtureId(context.operationId, 'isolation');
  requireThat((await client.query('SELECT id FROM public.tenants WHERE id=$1', [isolationId])).rows.length === 0, 'FIXTURE_ALREADY_EXISTS');
  await client.query(`INSERT INTO public.tenants(id,slug,name,status,is_active,plan_key)
    VALUES ($1,$2,'WP1 tenantisolatie','active',true,'starter')`, [isolationId, `wp1-${context.operationId}`]);
  await client.query(`INSERT INTO public.organization_settings(tenant_id,naam) VALUES ($1,'WP1 tenantisolatie')`, [isolationId]);
  await copyRoles(client, isolationId);
  const fixture = { isolationId, personnelId: fixtureId(context.operationId, 'personnel'), customers: [], objects: [], assignments: [] };
  for (const [suffix, tenantId] of [['veele', context.tenantId], ['isolation', isolationId]]) {
    const customerId = fixtureId(context.operationId, `customer-${suffix}`);
    const objectId = fixtureId(context.operationId, `object-${suffix}`);
    const assignmentId = fixtureId(context.operationId, `assignment-${suffix}`);
    await client.query(`INSERT INTO public.customers(id,tenant_id,name,contact_email,is_active)
      VALUES ($1,$2,$3,$4,true)`, [customerId,tenantId,`WP1 testklant ${suffix}`,`${suffix}-${context.operationId}@example.invalid`]);
    await client.query(`INSERT INTO public.objects(id,tenant_id,customer_id,name,is_active) VALUES ($1,$2,$3,'WP1 testlocatie',true)`, [objectId,tenantId,customerId]);
    await client.query(`INSERT INTO public.assignments(id,tenant_id,customer_id,object_id,title,status,created_by)
      VALUES ($1,$2,$3,$4,'WP1 controlewerkbon','requested',$5)`, [assignmentId,tenantId,customerId,objectId,context.adminId]);
    await client.query(`INSERT INTO public.assignment_tasks(assignment_id,sort_order) VALUES ($1,0)`, [assignmentId]);
    fixture.customers.push(customerId); fixture.objects.push(objectId); fixture.assignments.push(assignmentId);
  }
  await client.query(`INSERT INTO public.personnel(id,tenant_id,first_name,last_name,email,role_id,is_active,notification_email_enabled,notification_push_enabled)
    SELECT $1,$2,'WP1','Medewerker',$3,r.id,true,false,false FROM public.roles r WHERE r.name='Employee' AND r.is_system`,
    [fixture.personnelId,context.tenantId,`wp1-${context.operationId}@example.invalid`]);
  // No password/invitation is created, and no e-mail is emitted by the seed.
  // The personnel record is deliberately unlinked until a real tester activates
  // the existing invitation flow. Existing manager access is retained.
  return { ...fixture, authenticationActivationRequired: true };
}

export async function verifyCanonical(client, context) {
  const isolation = fixtureId(context.operationId,'isolation');
  const wanted = [
    ['customers','customer-veele'], ['customers','customer-isolation'],
    ['objects','object-veele'], ['objects','object-isolation'],
    ['assignments','assignment-veele'], ['assignments','assignment-isolation'], ['personnel','personnel'],
  ];
  for (const [table,kind] of wanted) {
    const rows = (await client.query(`SELECT id,tenant_id FROM public.${table} WHERE id=$1`, [fixtureId(context.operationId,kind)])).rows;
    requireThat(rows.length === 1 && rows[0].tenant_id === (kind.endsWith('isolation') ? isolation : context.tenantId), 'CANONICAL_DATA_MISSING');
  }
  await assertBootstrapContext(client, context);
  await client.query('SET LOCAL ROLE authenticated');
  try {
    const visible = (await client.query('SELECT id FROM public.customers WHERE id=ANY($1::uuid[])',
      [[fixtureId(context.operationId,'customer-veele'),fixtureId(context.operationId,'customer-isolation')]])).rows;
    requireThat(visible.length === 1 && visible[0].id === fixtureId(context.operationId,'customer-veele'), 'TENANT_ISOLATION_FAILED');
  } finally { await client.query('RESET ROLE'); }
  return { ready: true, tenantIsolationVerified: true, authenticationActivationRequired: true };
}
