#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { FIXTURE, connect, tableExists, columnExists } from '../../../scripts/fieldgrid-runtime-safety-lib.mjs';

const E2E = {
  users: {
    tenantAInactivePersonnel: '20000000-0000-4000-8000-000000000106',
    tenantAPhase2Personnel: '20000000-0000-4000-8000-000000000107',
  },
  links: {
    assignmentPersonnelTenantA: '90000000-0000-4000-8000-000000000001',
    assignmentPersonnelTenantA2: '90000000-0000-4000-8000-000000000005',
  },
  reports: {
    tenantAApproved: '90000000-0000-4000-8000-000000000002',
  },
  invoices: {
    tenantAVisible: '90000000-0000-4000-8000-000000000003',
  },
  customerUsers: {
    tenantA: '90000000-0000-4000-8000-000000000004',
  },
  personnel: {
    tenantAInactive: '60000000-0000-4000-8000-000000000106',
    tenantAPhase2: '60000000-0000-4000-8000-000000000107',
  },
};

const CANONICAL_ADMIN_ROLE = 'Admin';
const CANONICAL_ADMIN_PERMISSIONS = [
  ['customers', 'read'],
  ['customers', 'write'],
  ['assignments', 'read'],
  ['assignments', 'write'],
  ['planning', 'read'],
  ['planning', 'write'],
  ['personnel', 'read'],
  ['personnel', 'write'],
];

const CANONICAL_TENANT_ADMINS = [
  { tenantId: FIXTURE.tenants.a, userId: FIXTURE.users.tenantAAdmin, key: 'tenantA' },
  { tenantId: FIXTURE.tenants.b, userId: FIXTURE.users.tenantBAdmin, key: 'tenantB' },
];

async function insertE2EAuthUsers(client) {
  await client.query(
    `
      insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
      values
        ($1, 'inactive-personnel@tenant-a.runtime.fieldgrid.test', now(), '{"provider":"fieldgrid-e2e"}'::jsonb, '{"fixture":true}'::jsonb),
        ($2, 'phase2-personnel@tenant-a.runtime.fieldgrid.test', now(), '{"provider":"fieldgrid-e2e"}'::jsonb, '{"fixture":true,"phase2a":true}'::jsonb)
      on conflict (id) do update set email = excluded.email, raw_user_meta_data = excluded.raw_user_meta_data
    `,
    [E2E.users.tenantAInactivePersonnel, E2E.users.tenantAPhase2Personnel],
  );
}

async function seedCanonicalAdminRoles(client) {
  for (const [resource, action] of CANONICAL_ADMIN_PERMISSIONS) {
    await client.query(
      `
        insert into permissions (resource, action, description)
        values ($1, $2, 'Fieldgrid Playwright canonical Admin permission')
        on conflict (resource, action) do update set description = excluded.description
      `,
      [resource, action],
    );
  }

  const roles = {};
  for (const admin of CANONICAL_TENANT_ADMINS) {
    const role = await client.query(
      `
        insert into tenant_roles (tenant_id, name, description, is_system, is_custom)
        values ($1, $2, 'Fieldgrid Playwright canonical Admin role', true, false)
        on conflict (tenant_id, name) do update
        set description = excluded.description,
            is_system = true,
            is_custom = false
        returning id
      `,
      [admin.tenantId, CANONICAL_ADMIN_ROLE],
    );
    roles[admin.key] = role.rows[0].id;
  }

  // The Runtime Safety roles remain available for their other fixture users.
  // Tenant admins deliberately receive only their own canonical Admin role.
  await client.query(
    `
      delete from tenant_user_roles
      where user_id = any($1::uuid[])
    `,
    [CANONICAL_TENANT_ADMINS.map((admin) => admin.userId)],
  );

  for (const admin of CANONICAL_TENANT_ADMINS) {
    const roleId = roles[admin.key];
    await client.query(
      `
        insert into tenant_users (tenant_id, user_id, role, status)
        values ($1, $2, 'member', 'active')
        on conflict (tenant_id, user_id) do update set role = excluded.role, status = excluded.status
      `,
      [admin.tenantId, admin.userId],
    );
    await client.query(
      `
        delete from tenant_role_permissions
        where tenant_role_id = $1
      `,
      [roleId],
    );
    await client.query(
      `
        insert into tenant_role_permissions (tenant_role_id, permission_id)
        select $1::uuid, id
        from permissions
        where (resource, action) in (
          ('customers', 'read'),
          ('customers', 'write'),
          ('assignments', 'read'),
          ('assignments', 'write'),
          ('planning', 'read'),
          ('planning', 'write'),
          ('personnel', 'read'),
          ('personnel', 'write')
        )
      `,
      [roleId],
    );
    await client.query(
      `
        insert into tenant_user_roles (tenant_id, user_id, tenant_role_id)
        values ($1, $2, $3)
      `,
      [admin.tenantId, admin.userId, roleId],
    );
  }

  return roles;
}

async function insertInactivePersonnel(client) {
  await client.query(
    `
      insert into personnel (id, tenant_id, user_id, code, first_name, last_name, email, is_active, is_available)
      values ($1, $2, $3, 'RTA-P106', 'Inactive', 'Personnel A', 'inactive-personnel@tenant-a.runtime.fieldgrid.test', false, false)
      on conflict (id) do update set tenant_id = excluded.tenant_id, user_id = excluded.user_id, email = excluded.email, is_active = false, is_available = false
    `,
    [E2E.personnel.tenantAInactive, FIXTURE.tenants.a, E2E.users.tenantAInactivePersonnel],
  );
}

async function insertPhase2Personnel(client) {
  await client.query(
    `
      insert into personnel (id, tenant_id, user_id, code, first_name, last_name, email, is_active, is_available)
      values ($1, $2, $3, 'RTA-P107', 'Phase2', 'Personnel A', 'phase2-personnel@tenant-a.runtime.fieldgrid.test', true, true)
      on conflict (id) do update set tenant_id = excluded.tenant_id, user_id = excluded.user_id, email = excluded.email, is_active = true, is_available = true
    `,
    [E2E.personnel.tenantAPhase2, FIXTURE.tenants.a, E2E.users.tenantAPhase2Personnel],
  );
}

async function insertAssignmentPersonnel(client) {
  if (!(await tableExists(client, 'public', 'assignment_personnel'))) return;
  if (await tableExists(client, 'public', 'assignment_personnel_lifecycle_history')) {
    await client.query(
      `delete from assignment_personnel_lifecycle_history
        where assignment_personnel_id in (
          select id from assignment_personnel where assignment_id = $1
        )`,
      [FIXTURE.assignments.a],
    );
  }
  if (await tableExists(client, 'public', 'assignment_participant_executions')) {
    await client.query('delete from assignment_participant_executions where assignment_id = $1', [FIXTURE.assignments.a]);
  }
  await client.query('delete from assignment_personnel where assignment_id = $1', [FIXTURE.assignments.a]);
  await client.query(
    `
      update assignments
      set required_personnel_count = 2, scheduled_date = current_date, scheduled_start = '08:00', scheduled_end = '12:00',
          status = 'scheduled', seen_at = null, en_route_at = null, actual_started_at = null, actual_completed_at = null,\n          completion_reason = null, completion_notes = null, cancelled_at = null, cancelled_by = null, cancellation_reason = null
      where id = $1 and tenant_id = $2
    `,
    [FIXTURE.assignments.a, FIXTURE.tenants.a],
  );
  await client.query(
    `
      insert into assignment_personnel (id, assignment_id, personnel_id, status, assigned_by)
      values
        ($1, $3, $4, 'assigned', $6),
        ($2, $3, $5, 'assigned', $6)
      on conflict (assignment_id, personnel_id) where status in ('assigned', 'suggested')
      do update set status = excluded.status, assigned_by = excluded.assigned_by
    `,
    [E2E.links.assignmentPersonnelTenantA, E2E.links.assignmentPersonnelTenantA2, FIXTURE.assignments.a, FIXTURE.personnel.a, E2E.personnel.tenantAPhase2, FIXTURE.users.tenantAAdmin],
  );
}

async function insertApprovedReport(client) {
  if (!(await tableExists(client, 'public', 'reports'))) return;
  await client.query(
    `
      insert into reports (id, tenant_id, assignment_id, submitted_by, status, content, hours_worked, submitter_notes, notes, reviewed_by, reviewed_at)
      values ($1, $2, $3, $4, 'approved', 'Runtime approved report A', '2.50', 'Runtime customer-visible report note', 'Runtime approved report A', $5, now())
      on conflict (id) do update set tenant_id = excluded.tenant_id, assignment_id = excluded.assignment_id, status = excluded.status, content = excluded.content, reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at
    `,
    [E2E.reports.tenantAApproved, FIXTURE.tenants.a, FIXTURE.assignments.a, FIXTURE.users.tenantAPersonnel, FIXTURE.users.tenantAAdmin],
  );
}

async function insertInvoice(client) {
  if (!(await tableExists(client, 'public', 'invoices'))) return;
  await client.query(
    `
      insert into invoices (id, tenant_id, invoice_number, customer_id, assignment_id, amount, vat_percentage, vat_amount, total_amount, status, due_date, notes, created_by)
      values ($1, $2, 'RTA-INV-001', $3, $4, '100.00', '21.00', '21.00', '121.00', 'sent', current_date + 14, 'RTA-INV-001 Runtime invoice A', $5)
      on conflict (id) do update set tenant_id = excluded.tenant_id, invoice_number = excluded.invoice_number, customer_id = excluded.customer_id, assignment_id = excluded.assignment_id, status = excluded.status, notes = excluded.notes
    `,
    [E2E.invoices.tenantAVisible, FIXTURE.tenants.a, FIXTURE.customers.a, FIXTURE.assignments.a, FIXTURE.users.tenantAAdmin],
  );
}

async function fetchAtMostOne(client, sql, params, description) {
  const result = await client.query(sql, params);
  if (result.rows.length > 1) {
    throw new Error(`${description} expected at most one row, found ${result.rows.length}`);
  }
  return result.rows[0] ?? null;
}

async function updateCustomerUserById(client, id, hasUpdatedAt) {
  await client.query(
    `
      update customer_users
      set tenant_id = $2,
          customer_id = $3,
          user_id = $4,
          email = $5,
          role = 'primary',
          status = 'active'${hasUpdatedAt ? ', updated_at = now()' : ''}
      where id = $1
    `,
    [id, FIXTURE.tenants.a, FIXTURE.customers.a, FIXTURE.users.tenantACustomer, 'customer@tenant-a.runtime.fieldgrid.test'],
  );
}

async function upsertCustomerUser(client) {
  if (!(await tableExists(client, 'public', 'customer_users'))) throw new Error('customer_users table is required for Playwright E2E fixtures');

  const hasId = await columnExists(client, 'customer_users', 'id');
  const hasUpdatedAt = await columnExists(client, 'customer_users', 'updated_at');
  if (!hasId) throw new Error('customer_users.id is required for deterministic E2E fixture resolution');

  const naturalKey = { customerId: FIXTURE.customers.a, email: 'customer@tenant-a.runtime.fieldgrid.test' };
  const naturalKeyRow = await fetchAtMostOne(
    client,
    `
      select id, tenant_id, customer_id, user_id, email, role, status
      from customer_users
      where customer_id = $1
        and lower(email) = lower($2)
      for update
    `,
    [naturalKey.customerId, naturalKey.email],
    'customer_users natural-key lookup',
  );
  const userCustomerRow = await fetchAtMostOne(
    client,
    `
      select id, tenant_id, customer_id, user_id, email, role, status
      from customer_users
      where customer_id = $1
        and user_id = $2
      for update
    `,
    [FIXTURE.customers.a, FIXTURE.users.tenantACustomer],
    'customer_users user/customer lookup',
  );

  if (naturalKeyRow && userCustomerRow && naturalKeyRow.id !== userCustomerRow.id) {
    throw new Error(`customer_users fixture natural key and user/customer key resolve to different rows: natural=${naturalKeyRow.id} userCustomer=${userCustomerRow.id}`);
  }

  if (naturalKeyRow) {
    await updateCustomerUserById(client, naturalKeyRow.id, hasUpdatedAt);
    return {
      actualId: naturalKeyRow.id,
      naturalKey,
      matchStrategy: 'existing-natural-key',
      reusedExisting: true,
      insertedFallback: false,
    };
  }

  if (userCustomerRow) {
    await updateCustomerUserById(client, userCustomerRow.id, hasUpdatedAt);
    return {
      actualId: userCustomerRow.id,
      naturalKey,
      matchStrategy: 'existing-user-customer',
      reusedExisting: true,
      insertedFallback: false,
    };
  }

  await client.query(
    `
      insert into customer_users (id, tenant_id, customer_id, user_id, email, role, status, invite_sent_at)
      values ($1, $2, $3, $4, $5, 'primary', 'active', now())
    `,
    [E2E.customerUsers.tenantA, FIXTURE.tenants.a, FIXTURE.customers.a, FIXTURE.users.tenantACustomer, naturalKey.email],
  );

  return {
    actualId: E2E.customerUsers.tenantA,
    naturalKey,
    matchStrategy: 'inserted-fallback',
    reusedExisting: false,
    insertedFallback: true,
  };
}

async function count(client, sql, params = []) {
  const result = await client.query(sql, params);
  return Number(result.rows[0]?.count ?? 0);
}

async function verifyFixtures(client, customerUserResult, canonicalAdminRoles) {
  const assignmentPersonnelLinkCount = await count(client, `select count(*) from assignment_personnel where assignment_id = $1 and personnel_id = any($2::uuid[]) and status = 'assigned'`, [FIXTURE.assignments.a, [FIXTURE.personnel.a, E2E.personnel.tenantAPhase2]]);
  const inactivePersonnelCount = await count(client, 'select count(*) from personnel where id = $1 and user_id = $2 and is_active = false', [E2E.personnel.tenantAInactive, E2E.users.tenantAInactivePersonnel]);
  const reportCount = await count(client, 'select count(*) from reports where id = $1 and tenant_id = $2 and assignment_id = $3 and status = $4', [E2E.reports.tenantAApproved, FIXTURE.tenants.a, FIXTURE.assignments.a, 'approved']);
  const invoiceCount = await count(client, 'select count(*) from invoices where id = $1 and tenant_id = $2 and assignment_id = $3 and status = $4', [E2E.invoices.tenantAVisible, FIXTURE.tenants.a, FIXTURE.assignments.a, 'sent']);
  const customerUserCount = await count(client, 'select count(*) from customer_users where customer_id = $1 and lower(email) = lower($2)', [FIXTURE.customers.a, 'customer@tenant-a.runtime.fieldgrid.test']);
  const customerUserByUserCount = await count(client, 'select count(*) from customer_users where customer_id = $1 and user_id = $2', [FIXTURE.customers.a, FIXTURE.users.tenantACustomer]);
  const canonicalAdminRoleCountTenantA = await count(client, 'select count(*) from tenant_roles where tenant_id = $1 and name = $2', [FIXTURE.tenants.a, CANONICAL_ADMIN_ROLE]);
  const canonicalAdminRoleCountTenantB = await count(client, 'select count(*) from tenant_roles where tenant_id = $1 and name = $2', [FIXTURE.tenants.b, CANONICAL_ADMIN_ROLE]);
  const canonicalAdminPermissionCountTenantA = await count(client, 'select count(*) from tenant_role_permissions where tenant_role_id = $1', [canonicalAdminRoles.tenantA]);
  const canonicalAdminPermissionCountTenantB = await count(client, 'select count(*) from tenant_role_permissions where tenant_role_id = $1', [canonicalAdminRoles.tenantB]);
  const tenantAAdminRoleLinkCount = await count(client, 'select count(*) from tenant_user_roles where tenant_id = $1 and user_id = $2 and tenant_role_id = $3', [FIXTURE.tenants.a, FIXTURE.users.tenantAAdmin, canonicalAdminRoles.tenantA]);
  const tenantBAdminRoleLinkCount = await count(client, 'select count(*) from tenant_user_roles where tenant_id = $1 and user_id = $2 and tenant_role_id = $3', [FIXTURE.tenants.b, FIXTURE.users.tenantBAdmin, canonicalAdminRoles.tenantB]);
  const tenantAAdminAllRoleLinkCount = await count(client, 'select count(*) from tenant_user_roles where user_id = $1', [FIXTURE.users.tenantAAdmin]);
  const tenantBAdminAllRoleLinkCount = await count(client, 'select count(*) from tenant_user_roles where user_id = $1', [FIXTURE.users.tenantBAdmin]);
  const crossTenantRoleLeakCount = await count(
    client,
    `
      select count(*)
      from tenant_user_roles tur
      join tenant_roles tr on tr.id = tur.tenant_role_id
      where (tur.user_id = $1 and (tur.tenant_id <> $2 or tr.tenant_id <> $2))
         or (tur.user_id = $3 and (tur.tenant_id <> $4 or tr.tenant_id <> $4))
    `,
    [FIXTURE.users.tenantAAdmin, FIXTURE.tenants.a, FIXTURE.users.tenantBAdmin, FIXTURE.tenants.b],
  );
  const customerUserFinalRow = await fetchAtMostOne(
    client,
    `
      select id, tenant_id, customer_id, user_id, email, role, status
      from customer_users
      where customer_id = $1
        and lower(email) = lower($2)
    `,
    [FIXTURE.customers.a, 'customer@tenant-a.runtime.fieldgrid.test'],
    'customer_users final natural-key verification',
  );
  const customerUserByUserFinalRow = await fetchAtMostOne(
    client,
    `
      select id, tenant_id, customer_id, user_id, email, role, status
      from customer_users
      where customer_id = $1
        and user_id = $2
    `,
    [FIXTURE.customers.a, FIXTURE.users.tenantACustomer],
    'customer_users final user/customer verification',
  );
  const crossTenantAssignmentLeakCount = await count(client, 'select count(*) from assignments where id = $1 and tenant_id = $2', [FIXTURE.assignments.b, FIXTURE.tenants.a]);
  const customerUserValid = customerUserFinalRow
    && customerUserByUserFinalRow
    && customerUserFinalRow.id === customerUserByUserFinalRow.id
    && customerUserFinalRow.id === customerUserResult.actualId
    && customerUserFinalRow.tenant_id === FIXTURE.tenants.a
    && customerUserFinalRow.customer_id === FIXTURE.customers.a
    && customerUserFinalRow.user_id === FIXTURE.users.tenantACustomer
    && String(customerUserFinalRow.email).toLowerCase() === 'customer@tenant-a.runtime.fieldgrid.test'
    && customerUserFinalRow.role === 'primary'
    && customerUserFinalRow.status === 'active';
  const passed = assignmentPersonnelLinkCount === 2
    && inactivePersonnelCount === 1
    && reportCount === 1
    && invoiceCount === 1
    && customerUserCount === 1
    && customerUserByUserCount === 1
    && canonicalAdminRoleCountTenantA === 1
    && canonicalAdminRoleCountTenantB === 1
    && canonicalAdminPermissionCountTenantA === CANONICAL_ADMIN_PERMISSIONS.length
    && canonicalAdminPermissionCountTenantB === CANONICAL_ADMIN_PERMISSIONS.length
    && tenantAAdminRoleLinkCount === 1
    && tenantBAdminRoleLinkCount === 1
    && tenantAAdminAllRoleLinkCount === 1
    && tenantBAdminAllRoleLinkCount === 1
    && crossTenantRoleLeakCount === 0
    && crossTenantAssignmentLeakCount === 0
    && customerUserValid;
  return {
    status: passed ? 'passed' : 'failed',
    deterministicIds: E2E,
    assignmentPersonnelLinkCount,
    inactivePersonnelCount,
    reportId: E2E.reports.tenantAApproved,
    reportCount,
    invoiceId: E2E.invoices.tenantAVisible,
    invoiceCount,
    customerUserNaturalKey: customerUserResult.naturalKey,
    customerUserRowId: customerUserResult.actualId,
    customerUserMatchStrategy: customerUserResult.matchStrategy,
    customerUserReusedExisting: customerUserResult.reusedExisting,
    customerUserInsertedFallback: customerUserResult.insertedFallback,
    customerUserCount,
    customerUserByUserCount,
    canonicalAdminRoleCountTenantA,
    canonicalAdminRoleCountTenantB,
    canonicalAdminPermissionCountTenantA,
    canonicalAdminPermissionCountTenantB,
    tenantAAdminRoleLinkCount,
    tenantBAdminRoleLinkCount,
    tenantAAdminAllRoleLinkCount,
    tenantBAdminAllRoleLinkCount,
    crossTenantRoleLeakCount,
    crossTenantValidation: { tenantBAssignmentInTenantACount: crossTenantAssignmentLeakCount },
  };
}

async function writeArtifact(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const client = await connect();
  const startedAt = new Date().toISOString();
  try {
    await client.query('begin');
    await insertE2EAuthUsers(client);
    const canonicalAdminRoles = await seedCanonicalAdminRoles(client);
    await insertInactivePersonnel(client);
    await insertPhase2Personnel(client);
    await insertAssignmentPersonnel(client);
    const customerUserResult = await upsertCustomerUser(client);
    await insertApprovedReport(client);
    await insertInvoice(client);
    const verification = await verifyFixtures(client, customerUserResult, canonicalAdminRoles);
    if (verification.status !== 'passed') throw new Error(`Playwright E2E fixture verification failed: ${JSON.stringify(verification)}`);
    await client.query('commit');
    await writeArtifact(join(process.cwd(), 'artifacts', 'fieldgrid-playwright', 'e2e-fixtures.json'), {
      name: 'fieldgrid-playwright-e2e-fixtures',
      startedAt,
      completedAt: new Date().toISOString(),
      ...verification,
    });
  } catch (error) {
    await client.query('rollback').catch(() => {});
    await writeArtifact(join(process.cwd(), 'artifacts', 'fieldgrid-playwright', 'logs', 'playwright-e2e-fixtures-error.log'), error instanceof Error ? error.stack ?? error.message : String(error));
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
