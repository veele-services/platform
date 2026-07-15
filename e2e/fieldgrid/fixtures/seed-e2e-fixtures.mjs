#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { FIXTURE, connect, tableExists, columnExists } from '../../../scripts/fieldgrid-runtime-safety-lib.mjs';

const E2E = {
  users: {
    tenantAInactivePersonnel: '20000000-0000-4000-8000-000000000106',
  },
  links: {
    assignmentPersonnelTenantA: '90000000-0000-4000-8000-000000000001',
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
  },
};

async function insertE2EAuthUsers(client) {
  await client.query(
    `
      insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
      values ($1, 'inactive-personnel@tenant-a.runtime.fieldgrid.test', now(), '{"provider":"fieldgrid-e2e"}'::jsonb, '{"fixture":true}'::jsonb)
      on conflict (id) do update set email = excluded.email, raw_user_meta_data = excluded.raw_user_meta_data
    `,
    [E2E.users.tenantAInactivePersonnel],
  );
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

async function insertAssignmentPersonnel(client) {
  if (!(await tableExists(client, 'public', 'assignment_personnel'))) return;
  await client.query(
    `
      insert into assignment_personnel (id, assignment_id, personnel_id, status, assigned_by)
      values ($1, $2, $3, 'assigned', $4)
      on conflict (assignment_id, personnel_id) do update set status = excluded.status, assigned_by = excluded.assigned_by
    `,
    [E2E.links.assignmentPersonnelTenantA, FIXTURE.assignments.a, FIXTURE.personnel.a, FIXTURE.users.tenantAAdmin],
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

async function upsertCustomerUser(client) {
  if (!(await tableExists(client, 'public', 'customer_users'))) return;
  const hasId = await columnExists(client, 'customer_users', 'id');
  if (hasId) {
    await client.query(
      `
        insert into customer_users (id, tenant_id, customer_id, user_id, email, role, status, invite_sent_at)
        values ($1, $2, $3, $4, 'customer@tenant-a.runtime.fieldgrid.test', 'primary', 'active', now())
        on conflict (id) do update set tenant_id = excluded.tenant_id, customer_id = excluded.customer_id, user_id = excluded.user_id, email = excluded.email, role = excluded.role, status = excluded.status
      `,
      [E2E.customerUsers.tenantA, FIXTURE.tenants.a, FIXTURE.customers.a, FIXTURE.users.tenantACustomer],
    );
    return;
  }
  await client.query(
    `
      insert into customer_users (tenant_id, customer_id, user_id, email, role, status, invite_sent_at)
      values ($1, $2, $3, 'customer@tenant-a.runtime.fieldgrid.test', 'primary', 'active', now())
      on conflict do nothing
    `,
    [FIXTURE.tenants.a, FIXTURE.customers.a, FIXTURE.users.tenantACustomer],
  );
}

async function count(client, sql, params = []) {
  const result = await client.query(sql, params);
  return Number(result.rows[0]?.count ?? 0);
}

async function verifyFixtures(client) {
  const assignmentPersonnelLinkCount = await count(client, 'select count(*) from assignment_personnel where assignment_id = $1 and personnel_id = $2', [FIXTURE.assignments.a, FIXTURE.personnel.a]);
  const inactivePersonnelCount = await count(client, 'select count(*) from personnel where id = $1 and user_id = $2 and is_active = false', [E2E.personnel.tenantAInactive, E2E.users.tenantAInactivePersonnel]);
  const reportCount = await count(client, 'select count(*) from reports where id = $1 and tenant_id = $2 and assignment_id = $3 and status = $4', [E2E.reports.tenantAApproved, FIXTURE.tenants.a, FIXTURE.assignments.a, 'approved']);
  const invoiceCount = await count(client, 'select count(*) from invoices where id = $1 and tenant_id = $2 and assignment_id = $3 and status = $4', [E2E.invoices.tenantAVisible, FIXTURE.tenants.a, FIXTURE.assignments.a, 'sent']);
  const customerUserCount = await tableExists(client, 'public', 'customer_users')
    ? await count(client, 'select count(*) from customer_users where tenant_id = $1 and customer_id = $2 and user_id = $3 and status = $4', [FIXTURE.tenants.a, FIXTURE.customers.a, FIXTURE.users.tenantACustomer, 'active'])
    : 0;
  const crossTenantAssignmentLeakCount = await count(client, 'select count(*) from assignments where id = $1 and tenant_id = $2', [FIXTURE.assignments.b, FIXTURE.tenants.a]);
  const passed = assignmentPersonnelLinkCount > 0 && inactivePersonnelCount === 1 && reportCount === 1 && invoiceCount === 1 && customerUserCount > 0 && crossTenantAssignmentLeakCount === 0;
  return {
    status: passed ? 'passed' : 'failed',
    deterministicIds: E2E,
    assignmentPersonnelLinkCount,
    inactivePersonnelCount,
    reportId: E2E.reports.tenantAApproved,
    reportCount,
    invoiceId: E2E.invoices.tenantAVisible,
    invoiceCount,
    customerUserId: E2E.customerUsers.tenantA,
    customerUserCount,
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
    await insertInactivePersonnel(client);
    await insertAssignmentPersonnel(client);
    await upsertCustomerUser(client);
    await insertApprovedReport(client);
    await insertInvoice(client);
    const verification = await verifyFixtures(client);
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
