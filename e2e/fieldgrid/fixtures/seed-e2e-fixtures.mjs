#!/usr/bin/env node
import { join } from 'node:path';
import { FIXTURE, connect, tableExists, writeJsonArtifact, writeTextArtifact } from '../../../scripts/fieldgrid-runtime-safety-lib.mjs';

const E2E = {
  users: {
    tenantAInactivePersonnel: '20000000-0000-4000-8000-000000000106',
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
      insert into assignment_personnel (assignment_id, personnel_id, status, assigned_by)
      values ($1, $2, 'assigned', $3)
      on conflict do nothing
    `,
    [FIXTURE.assignments.a, FIXTURE.personnel.a, FIXTURE.users.tenantAAdmin],
  );
}

async function insertAssignmentTask(client) {
  if (!(await tableExists(client, 'public', 'assignment_tasks'))) return;
  await client.query(
    `
      insert into assignment_tasks (assignment_id, notes, sort_order)
      values ($1, 'Runtime Task A - inspect fixture installation', 1)
      on conflict do nothing
    `,
    [FIXTURE.assignments.a],
  );
}

async function insertApprovedReport(client) {
  if (!(await tableExists(client, 'public', 'reports'))) return;
  await client.query(
    `
      insert into reports (tenant_id, assignment_id, submitted_by, status, content, hours_worked, submitter_notes, notes, reviewed_by, reviewed_at)
      values ($1, $2, $3, 'approved', 'Runtime approved report A', '2.50', 'Runtime customer-visible report note', 'Runtime approved report A', $4, now())
      on conflict do nothing
    `,
    [FIXTURE.tenants.a, FIXTURE.assignments.a, FIXTURE.users.tenantAPersonnel, FIXTURE.users.tenantAAdmin],
  );
}

async function insertInvoice(client) {
  if (!(await tableExists(client, 'public', 'invoices'))) return;
  await client.query(
    `
      insert into invoices (customer_id, assignment_id, amount, vat_percentage, vat_amount, total_amount, status, due_date, notes, created_by)
      values ($1, $2, '100.00', '21.00', '21.00', '121.00', 'sent', current_date + 14, 'RTA-INV-001 Runtime invoice A', $3)
      on conflict do nothing
    `,
    [FIXTURE.customers.a, FIXTURE.assignments.a, FIXTURE.users.tenantAAdmin],
  );
}

async function main() {
  const client = await connect();
  const startedAt = new Date().toISOString();
  try {
    await client.query('begin');
    await insertE2EAuthUsers(client);
    await insertInactivePersonnel(client);
    await insertAssignmentPersonnel(client);
    await insertAssignmentTask(client);
    await insertApprovedReport(client);
    await insertInvoice(client);
    await client.query('commit');
    await writeJsonArtifact(join('reports', 'playwright-e2e-fixtures.json'), {
      name: 'fieldgrid-playwright-e2e-fixtures',
      status: 'passed',
      startedAt,
      completedAt: new Date().toISOString(),
      fixtureIds: E2E,
    });
  } catch (error) {
    await client.query('rollback').catch(() => {});
    await writeTextArtifact(join('logs', 'playwright-e2e-fixtures-error.log'), `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
