#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  FIXTURE,
  connect,
  tableExists,
  columnExists,
} from "../../../scripts/fieldgrid-runtime-safety-lib.mjs";

const E2E = {
  users: {
    tenantAInactivePersonnel: "20000000-0000-4000-8000-000000000106",
    tenantAPhase2Personnel: "20000000-0000-4000-8000-000000000107",
  },
  links: {
    assignmentPersonnelTenantA: "90000000-0000-4000-8000-000000000001",
    assignmentPersonnelTenantA2: "90000000-0000-4000-8000-000000000005",
  },
  reports: {
    tenantAApproved: "90000000-0000-4000-8000-000000000002",
  },
  invoices: {
    tenantAVisible: "90000000-0000-4000-8000-000000000003",
    cancellation: "91000000-0000-4000-8000-000000000003",
    collectionOne: "93000000-0000-4000-8000-000000000003",
    collectionTwo: "93000000-0000-4000-8000-000000000004",
  },
  payments: {
    tenantAPartialManual: "92000000-0000-4000-8000-000000000001",
  },
  assignments: {
    quoteAcceptance: "91000000-0000-4000-8000-000000000001",
    invoiceCancellation: "91000000-0000-4000-8000-000000000002",
    collectionOne: "93000000-0000-4000-8000-000000000001",
    collectionTwo: "93000000-0000-4000-8000-000000000002",
  },
  quotes: {
    acceptance: "91000000-0000-4000-8000-000000000004",
  },
  tasks: {
    tenantAOffline: "90000000-0000-4000-8000-000000000006",
  },
  customerUsers: {
    tenantA: "90000000-0000-4000-8000-000000000004",
  },
  personnel: {
    tenantAInactive: "60000000-0000-4000-8000-000000000106",
    tenantAPhase2: "60000000-0000-4000-8000-000000000107",
  },
};

const CANONICAL_ADMIN_ROLE = "Admin";
const CANONICAL_ADMIN_PERMISSIONS = [
  ["customers", "read"],
  ["customers", "write"],
  ["objects", "read"],
  ["objects", "write"],
  ["assignments", "read"],
  ["assignments", "write"],
  ["planning", "read"],
  ["planning", "write"],
  ["personnel", "read"],
  ["personnel", "write"],
  ["invoices", "read"],
  ["invoices", "write"],
];

function amsterdamDateKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const E2E_DATE_KEY =
  process.env.FIELDGRID_E2E_DATE_KEY ?? amsterdamDateKey();
if (!/^\d{4}-\d{2}-\d{2}$/u.test(E2E_DATE_KEY)) {
  throw new Error("FIELDGRID_E2E_DATE_KEY must use YYYY-MM-DD.");
}

const CANONICAL_TENANT_ADMINS = [
  {
    tenantId: FIXTURE.tenants.a,
    userId: FIXTURE.users.tenantAAdmin,
    key: "tenantA",
  },
  {
    tenantId: FIXTURE.tenants.b,
    userId: FIXTURE.users.tenantBAdmin,
    key: "tenantB",
  },
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
          ('objects', 'read'),
          ('objects', 'write'),
          ('assignments', 'read'),
          ('assignments', 'write'),
          ('planning', 'read'),
          ('planning', 'write'),
          ('personnel', 'read'),
          ('personnel', 'write'),
          ('invoices', 'read'),
          ('invoices', 'write')
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
    [
      E2E.personnel.tenantAInactive,
      FIXTURE.tenants.a,
      E2E.users.tenantAInactivePersonnel,
    ],
  );
}

async function insertPhase2Personnel(client) {
  await client.query(
    `
      insert into personnel (id, tenant_id, user_id, code, first_name, last_name, email, is_active, is_available)
      values ($1, $2, $3, 'RTA-P107', 'Phase2', 'Personnel A', 'phase2-personnel@tenant-a.runtime.fieldgrid.test', true, true)
      on conflict (id) do update set tenant_id = excluded.tenant_id, user_id = excluded.user_id, email = excluded.email, is_active = true, is_available = true
    `,
    [
      E2E.personnel.tenantAPhase2,
      FIXTURE.tenants.a,
      E2E.users.tenantAPhase2Personnel,
    ],
  );
}

async function insertAssignmentPersonnel(client) {
  if (!(await tableExists(client, "public", "assignment_personnel"))) return;
  if (
    await tableExists(
      client,
      "public",
      "assignment_personnel_lifecycle_history",
    )
  ) {
    await client.query(
      `delete from assignment_personnel_lifecycle_history
        where assignment_personnel_id in (
          select id from assignment_personnel where assignment_id = $1
        )`,
      [FIXTURE.assignments.a],
    );
  }
  if (
    await tableExists(client, "public", "assignment_participant_executions")
  ) {
    await client.query(
      "delete from assignment_participant_executions where assignment_id = $1",
      [FIXTURE.assignments.a],
    );
  }
  await client.query(
    "delete from assignment_personnel where assignment_id = $1",
    [FIXTURE.assignments.a],
  );
  // This deterministic test reset may move a terminal assignment back to its
  // initial scheduled fixture state. Production roles cannot disable triggers;
  // the PostgreSQL owner does so only inside this rollback-safe fixture tx.
  await client.query(
    "alter table assignments disable trigger fieldgrid_assignment_state_guard",
  );
  await client.query(
    `
      update assignments
      set required_personnel_count = 2, scheduled_date = $3, scheduled_start = '08:00', scheduled_end = '12:00',
          status = 'scheduled', seen_at = null, en_route_at = null, actual_started_at = null, actual_completed_at = null,\n          completion_reason = null, completion_notes = null, cancelled_at = null, cancelled_by = null, cancellation_reason = null
      where id = $1 and tenant_id = $2
    `,
    [FIXTURE.assignments.a, FIXTURE.tenants.a, E2E_DATE_KEY],
  );
  await client.query(
    `insert into assignments
       (id, tenant_id, code, title, customer_id, object_id, status, created_by)
     values
       ($1, $3, 'RTA-COLLECT-001', 'Runtime collection payment one', $4, $5, 'invoiced', $6),
       ($2, $3, 'RTA-COLLECT-002', 'Runtime collection payment two', $4, $5, 'invoiced', $6)
     on conflict (id) do update set status = 'invoiced', customer_id = excluded.customer_id,
       tenant_id = excluded.tenant_id, object_id = excluded.object_id`,
    [
      E2E.assignments.collectionOne,
      E2E.assignments.collectionTwo,
      FIXTURE.tenants.a,
      FIXTURE.customers.a,
      FIXTURE.objects.a,
      FIXTURE.users.tenantAAdmin,
    ],
  );
  await client.query(
    "alter table assignments enable trigger fieldgrid_assignment_state_guard",
  );
  for (const personnelId of [
    FIXTURE.personnel.a,
    E2E.personnel.tenantAPhase2,
  ]) {
    await client.query(
      `insert into availability_day_entries (personnel_id, date, start_time, end_time)
       values ($1, $2, '07:00', '17:00')
       on conflict (personnel_id, date)
       do update set start_time = excluded.start_time, end_time = excluded.end_time`,
      [personnelId, E2E_DATE_KEY],
    );
  }
  await client.query(
    `
      insert into assignment_personnel (id, assignment_id, personnel_id, status, assigned_by)
      values
        ($1, $3, $4, 'assigned', $6),
        ($2, $3, $5, 'assigned', $6)
      on conflict (assignment_id, personnel_id) where status in ('assigned', 'suggested')
      do update set status = excluded.status, assigned_by = excluded.assigned_by
    `,
    [
      E2E.links.assignmentPersonnelTenantA,
      E2E.links.assignmentPersonnelTenantA2,
      FIXTURE.assignments.a,
      FIXTURE.personnel.a,
      E2E.personnel.tenantAPhase2,
      FIXTURE.users.tenantAAdmin,
    ],
  );
  await client.query(
    `insert into invoices
       (id, tenant_id, invoice_number, customer_id, assignment_id, amount,
        vat_percentage, vat_amount, total_amount, status, due_date, notes,
        payment_status, collection_status, paid_amount, outstanding_amount, created_by)
     values
       ($1, $3, 'RTA-COLLECT-INV-001', $4, $5, 10, 21, 2.10, 12.10,
        'sent', current_date + 14, 'Runtime collection journey one', 'unpaid', 'none', 0, 12.10, $7),
       ($2, $3, 'RTA-COLLECT-INV-002', $4, $6, 20, 21, 4.20, 24.20,
        'sent', current_date + 14, 'Runtime collection journey two', 'unpaid', 'none', 0, 24.20, $7)
     on conflict (id) do update set status = 'sent', payment_status = 'unpaid',
       collection_status = 'none', paid_amount = 0, outstanding_amount = excluded.outstanding_amount,
       total_amount = excluded.total_amount, cancelled_at = null`,
    [
      E2E.invoices.collectionOne,
      E2E.invoices.collectionTwo,
      FIXTURE.tenants.a,
      FIXTURE.customers.a,
      E2E.assignments.collectionOne,
      E2E.assignments.collectionTwo,
      FIXTURE.users.tenantAAdmin,
    ],
  );
}

async function insertApprovedReport(client) {
  if (!(await tableExists(client, "public", "reports"))) return;
  await client.query(
    `
      insert into reports (id, tenant_id, assignment_id, submitted_by, status, content, hours_worked, submitter_notes, notes, reviewed_by, reviewed_at)
      values ($1, $2, $3, $4, 'approved', 'Runtime approved report A', '2.50', 'Runtime customer-visible report note', 'Runtime approved report A', $5, now())
      on conflict (id) do update set tenant_id = excluded.tenant_id, assignment_id = excluded.assignment_id, status = excluded.status, content = excluded.content, reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at
    `,
    [
      E2E.reports.tenantAApproved,
      FIXTURE.tenants.a,
      FIXTURE.assignments.a,
      FIXTURE.users.tenantAPersonnel,
      FIXTURE.users.tenantAAdmin,
    ],
  );
}

async function insertOfflineTask(client) {
  await client.query(
    `insert into assignment_tasks (id, assignment_id, notes, sort_order, completed_at, completed_by)
     values ($1, $2, 'Runtime offline checklist task', 1, null, null)
     on conflict (id) do update
     set assignment_id = excluded.assignment_id, notes = excluded.notes,
         sort_order = excluded.sort_order, completed_at = null, completed_by = null`,
    [E2E.tasks.tenantAOffline, FIXTURE.assignments.a],
  );
}

async function insertInvoice(client) {
  if (!(await tableExists(client, "public", "invoices"))) return;
  await client.query(
    `
      insert into invoices (id, tenant_id, invoice_number, customer_id, assignment_id, amount, vat_percentage, vat_amount, total_amount, status, due_date, notes, created_by)
      values ($1, $2, 'RTA-INV-001', $3, $4, '100.00', '21.00', '21.00', '121.00', 'sent', current_date + 14, 'RTA-INV-001 Runtime invoice A', $5)
      on conflict (id) do update set tenant_id = excluded.tenant_id, invoice_number = excluded.invoice_number, customer_id = excluded.customer_id, assignment_id = excluded.assignment_id, status = excluded.status, notes = excluded.notes
    `,
    [
      E2E.invoices.tenantAVisible,
      FIXTURE.tenants.a,
      FIXTURE.customers.a,
      FIXTURE.assignments.a,
      FIXTURE.users.tenantAAdmin,
    ],
  );
  await client.query(
    `delete from payments
     where invoice_id = $1 and id <> $2`,
    [E2E.invoices.tenantAVisible, E2E.payments.tenantAPartialManual],
  );
  await client.query(
    `insert into payments
       (id, tenant_id, customer_id, invoice_id, source_type, source_id,
        amount_cents, amount, currency, payment_method, status,
        registered_by_user_id, paid_at)
     values ($1, $2, $3, $4, 'invoice', $4, 5000, 50.00, 'EUR',
             'manual_bank', 'paid', $5, now())
     on conflict (id) do update set amount_cents = 5000, amount = 50.00,
       status = 'paid', paid_at = excluded.paid_at`,
    [
      E2E.payments.tenantAPartialManual,
      FIXTURE.tenants.a,
      FIXTURE.customers.a,
      E2E.invoices.tenantAVisible,
      FIXTURE.users.tenantAAdmin,
    ],
  );
  await client.query(
    `insert into payment_allocations
       (tenant_id, payment_id, invoice_id, amount_cents, amount, note)
     values ($1, $2, $3, 5000, 50.00, 'Playwright partial manual payment')
     on conflict (payment_id, invoice_id) do update
       set amount_cents = 5000, amount = 50.00`,
    [
      FIXTURE.tenants.a,
      E2E.payments.tenantAPartialManual,
      E2E.invoices.tenantAVisible,
    ],
  );
  await client.query(
    `update invoices set payment_status = 'partially_paid', paid_amount = 50.00,
       outstanding_amount = 71.00, paid_date = null
     where id = $1`,
    [E2E.invoices.tenantAVisible],
  );
}

async function insertReviewRemediationJourneys(client) {
  await client.query(
    "alter table assignments disable trigger fieldgrid_assignment_state_guard",
  );
  await client.query(
    `insert into assignments
       (id, tenant_id, code, title, customer_id, object_id, status, created_by)
     values
       ($1, $3, 'RTA-QUOTE-001', 'Runtime quote acceptance', $4, $5, 'awaiting_approval', $6),
       ($2, $3, 'RTA-CANCEL-001', 'Runtime invoice cancellation', $4, $5, 'invoiced', $6)
     on conflict (id) do update
     set tenant_id = excluded.tenant_id,
         code = excluded.code,
         title = excluded.title,
         customer_id = excluded.customer_id,
         object_id = excluded.object_id,
         status = excluded.status,
         cancelled_at = null,
         cancelled_by = null,
         cancellation_reason = null`,
    [
      E2E.assignments.quoteAcceptance,
      E2E.assignments.invoiceCancellation,
      FIXTURE.tenants.a,
      FIXTURE.customers.a,
      FIXTURE.objects.a,
      FIXTURE.users.tenantAAdmin,
    ],
  );
  await client.query(
    "alter table assignments enable trigger fieldgrid_assignment_state_guard",
  );

  await client.query(
    `insert into quotes
       (id, tenant_id, quote_number, assignment_id, customer_id, amount,
        validity_date, status, notes, created_by)
     values ($1, $2, 'RTA-OFF-001', $3, $4, 250, current_date + 14, 'sent',
             'Runtime quote acceptance journey', $5)
     on conflict (id) do update
     set tenant_id = excluded.tenant_id,
         quote_number = excluded.quote_number,
         assignment_id = excluded.assignment_id,
         customer_id = excluded.customer_id,
         amount = excluded.amount,
         validity_date = excluded.validity_date,
         status = 'sent',
         rejection_reason = null,
         approved_by = null,
         approved_at = null`,
    [
      E2E.quotes.acceptance,
      FIXTURE.tenants.a,
      E2E.assignments.quoteAcceptance,
      FIXTURE.customers.a,
      FIXTURE.users.tenantAAdmin,
    ],
  );

  await client.query(
    `insert into invoices
       (id, tenant_id, invoice_number, customer_id, assignment_id, amount,
        vat_percentage, vat_amount, total_amount, status, due_date, notes,
        payment_status, collection_status, paid_amount, outstanding_amount,
        created_by)
     values ($1, $2, 'RTA-CANCEL-INV-001', $3, $4, 100, 21, 21, 121,
             'sent', current_date + 14, 'Runtime cancellation journey',
             'unpaid', 'none', 0, 121, $5)
     on conflict (id) do update
     set tenant_id = excluded.tenant_id,
         invoice_number = excluded.invoice_number,
         customer_id = excluded.customer_id,
         assignment_id = excluded.assignment_id,
         amount = excluded.amount,
         vat_amount = excluded.vat_amount,
         total_amount = excluded.total_amount,
         status = 'sent',
         payment_status = 'unpaid',
         collection_status = 'none',
         paid_amount = 0,
         outstanding_amount = excluded.outstanding_amount,
         paid_date = null,
         cancelled_at = null,
         cancelled_by = null,
         cancellation_reason = null`,
    [
      E2E.invoices.cancellation,
      FIXTURE.tenants.a,
      FIXTURE.customers.a,
      E2E.assignments.invoiceCancellation,
      FIXTURE.users.tenantAAdmin,
    ],
  );
}

async function fetchAtMostOne(client, sql, params, description) {
  const result = await client.query(sql, params);
  if (result.rows.length > 1) {
    throw new Error(
      `${description} expected at most one row, found ${result.rows.length}`,
    );
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
          status = 'active'${hasUpdatedAt ? ", updated_at = now()" : ""}
      where id = $1
    `,
    [
      id,
      FIXTURE.tenants.a,
      FIXTURE.customers.a,
      FIXTURE.users.tenantACustomer,
      "customer@tenant-a.runtime.fieldgrid.test",
    ],
  );
}

async function upsertCustomerUser(client) {
  if (!(await tableExists(client, "public", "customer_users")))
    throw new Error(
      "customer_users table is required for Playwright E2E fixtures",
    );

  const hasId = await columnExists(client, "customer_users", "id");
  const hasUpdatedAt = await columnExists(
    client,
    "customer_users",
    "updated_at",
  );
  if (!hasId)
    throw new Error(
      "customer_users.id is required for deterministic E2E fixture resolution",
    );

  const naturalKey = {
    customerId: FIXTURE.customers.a,
    email: "customer@tenant-a.runtime.fieldgrid.test",
  };
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
    "customer_users natural-key lookup",
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
    "customer_users user/customer lookup",
  );

  if (
    naturalKeyRow &&
    userCustomerRow &&
    naturalKeyRow.id !== userCustomerRow.id
  ) {
    throw new Error(
      `customer_users fixture natural key and user/customer key resolve to different rows: natural=${naturalKeyRow.id} userCustomer=${userCustomerRow.id}`,
    );
  }

  if (naturalKeyRow) {
    await updateCustomerUserById(client, naturalKeyRow.id, hasUpdatedAt);
    return {
      actualId: naturalKeyRow.id,
      naturalKey,
      matchStrategy: "existing-natural-key",
      reusedExisting: true,
      insertedFallback: false,
    };
  }

  if (userCustomerRow) {
    await updateCustomerUserById(client, userCustomerRow.id, hasUpdatedAt);
    return {
      actualId: userCustomerRow.id,
      naturalKey,
      matchStrategy: "existing-user-customer",
      reusedExisting: true,
      insertedFallback: false,
    };
  }

  await client.query(
    `
      insert into customer_users (id, tenant_id, customer_id, user_id, email, role, status, invite_sent_at)
      values ($1, $2, $3, $4, $5, 'primary', 'active', now())
    `,
    [
      E2E.customerUsers.tenantA,
      FIXTURE.tenants.a,
      FIXTURE.customers.a,
      FIXTURE.users.tenantACustomer,
      naturalKey.email,
    ],
  );

  return {
    actualId: E2E.customerUsers.tenantA,
    naturalKey,
    matchStrategy: "inserted-fallback",
    reusedExisting: false,
    insertedFallback: true,
  };
}

async function count(client, sql, params = []) {
  const result = await client.query(sql, params);
  return Number(result.rows[0]?.count ?? 0);
}

async function verifyFixtures(client, customerUserResult, canonicalAdminRoles) {
  const assignmentPersonnelLinkCount = await count(
    client,
    `select count(*) from assignment_personnel where assignment_id = $1 and personnel_id = any($2::uuid[]) and status = 'assigned'`,
    [FIXTURE.assignments.a, [FIXTURE.personnel.a, E2E.personnel.tenantAPhase2]],
  );
  const inactivePersonnelCount = await count(
    client,
    "select count(*) from personnel where id = $1 and user_id = $2 and is_active = false",
    [E2E.personnel.tenantAInactive, E2E.users.tenantAInactivePersonnel],
  );
  const reportCount = await count(
    client,
    "select count(*) from reports where id = $1 and tenant_id = $2 and assignment_id = $3 and status = $4",
    [
      E2E.reports.tenantAApproved,
      FIXTURE.tenants.a,
      FIXTURE.assignments.a,
      "approved",
    ],
  );
  const offlineTaskCount = await count(
    client,
    "select count(*) from assignment_tasks where id = $1 and assignment_id = $2 and completed_at is null",
    [E2E.tasks.tenantAOffline, FIXTURE.assignments.a],
  );
  const invoiceCount = await count(
    client,
    "select count(*) from invoices where id = $1 and tenant_id = $2 and assignment_id = $3 and status = $4",
    [
      E2E.invoices.tenantAVisible,
      FIXTURE.tenants.a,
      FIXTURE.assignments.a,
      "sent",
    ],
  );
  const reviewJourneyCount = await count(
    client,
    `select
       (select count(*) from assignments
          where (id, status) in (($1::uuid, 'awaiting_approval'), ($2::uuid, 'invoiced')))
       + (select count(*) from quotes where id = $3 and status = 'sent')
       + (select count(*) from invoices where id = $4 and status = 'sent') as count`,
    [
      E2E.assignments.quoteAcceptance,
      E2E.assignments.invoiceCancellation,
      E2E.quotes.acceptance,
      E2E.invoices.cancellation,
    ],
  );
  const customerUserCount = await count(
    client,
    "select count(*) from customer_users where customer_id = $1 and lower(email) = lower($2)",
    [FIXTURE.customers.a, "customer@tenant-a.runtime.fieldgrid.test"],
  );
  const customerUserByUserCount = await count(
    client,
    "select count(*) from customer_users where customer_id = $1 and user_id = $2",
    [FIXTURE.customers.a, FIXTURE.users.tenantACustomer],
  );
  const canonicalAdminRoleCountTenantA = await count(
    client,
    "select count(*) from tenant_roles where tenant_id = $1 and name = $2",
    [FIXTURE.tenants.a, CANONICAL_ADMIN_ROLE],
  );
  const canonicalAdminRoleCountTenantB = await count(
    client,
    "select count(*) from tenant_roles where tenant_id = $1 and name = $2",
    [FIXTURE.tenants.b, CANONICAL_ADMIN_ROLE],
  );
  const canonicalAdminPermissionCountTenantA = await count(
    client,
    "select count(*) from tenant_role_permissions where tenant_role_id = $1",
    [canonicalAdminRoles.tenantA],
  );
  const canonicalAdminPermissionCountTenantB = await count(
    client,
    "select count(*) from tenant_role_permissions where tenant_role_id = $1",
    [canonicalAdminRoles.tenantB],
  );
  const tenantAAdminRoleLinkCount = await count(
    client,
    "select count(*) from tenant_user_roles where tenant_id = $1 and user_id = $2 and tenant_role_id = $3",
    [
      FIXTURE.tenants.a,
      FIXTURE.users.tenantAAdmin,
      canonicalAdminRoles.tenantA,
    ],
  );
  const tenantBAdminRoleLinkCount = await count(
    client,
    "select count(*) from tenant_user_roles where tenant_id = $1 and user_id = $2 and tenant_role_id = $3",
    [
      FIXTURE.tenants.b,
      FIXTURE.users.tenantBAdmin,
      canonicalAdminRoles.tenantB,
    ],
  );
  const tenantAAdminAllRoleLinkCount = await count(
    client,
    "select count(*) from tenant_user_roles where user_id = $1",
    [FIXTURE.users.tenantAAdmin],
  );
  const tenantBAdminAllRoleLinkCount = await count(
    client,
    "select count(*) from tenant_user_roles where user_id = $1",
    [FIXTURE.users.tenantBAdmin],
  );
  const crossTenantRoleLeakCount = await count(
    client,
    `
      select count(*)
      from tenant_user_roles tur
      join tenant_roles tr on tr.id = tur.tenant_role_id
      where (tur.user_id = $1 and (tur.tenant_id <> $2 or tr.tenant_id <> $2))
         or (tur.user_id = $3 and (tur.tenant_id <> $4 or tr.tenant_id <> $4))
    `,
    [
      FIXTURE.users.tenantAAdmin,
      FIXTURE.tenants.a,
      FIXTURE.users.tenantBAdmin,
      FIXTURE.tenants.b,
    ],
  );
  const customerUserFinalRow = await fetchAtMostOne(
    client,
    `
      select id, tenant_id, customer_id, user_id, email, role, status
      from customer_users
      where customer_id = $1
        and lower(email) = lower($2)
    `,
    [FIXTURE.customers.a, "customer@tenant-a.runtime.fieldgrid.test"],
    "customer_users final natural-key verification",
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
    "customer_users final user/customer verification",
  );
  const crossTenantAssignmentLeakCount = await count(
    client,
    "select count(*) from assignments where id = $1 and tenant_id = $2",
    [FIXTURE.assignments.b, FIXTURE.tenants.a],
  );
  const customerUserValid =
    customerUserFinalRow &&
    customerUserByUserFinalRow &&
    customerUserFinalRow.id === customerUserByUserFinalRow.id &&
    customerUserFinalRow.id === customerUserResult.actualId &&
    customerUserFinalRow.tenant_id === FIXTURE.tenants.a &&
    customerUserFinalRow.customer_id === FIXTURE.customers.a &&
    customerUserFinalRow.user_id === FIXTURE.users.tenantACustomer &&
    String(customerUserFinalRow.email).toLowerCase() ===
      "customer@tenant-a.runtime.fieldgrid.test" &&
    customerUserFinalRow.role === "primary" &&
    customerUserFinalRow.status === "active";
  const passed =
    assignmentPersonnelLinkCount === 2 &&
    inactivePersonnelCount === 1 &&
    reportCount === 1 &&
    offlineTaskCount === 1 &&
    invoiceCount === 1 &&
    reviewJourneyCount === 4 &&
    customerUserCount === 1 &&
    customerUserByUserCount === 1 &&
    canonicalAdminRoleCountTenantA === 1 &&
    canonicalAdminRoleCountTenantB === 1 &&
    canonicalAdminPermissionCountTenantA ===
      CANONICAL_ADMIN_PERMISSIONS.length &&
    canonicalAdminPermissionCountTenantB ===
      CANONICAL_ADMIN_PERMISSIONS.length &&
    tenantAAdminRoleLinkCount === 1 &&
    tenantBAdminRoleLinkCount === 1 &&
    tenantAAdminAllRoleLinkCount === 1 &&
    tenantBAdminAllRoleLinkCount === 1 &&
    crossTenantRoleLeakCount === 0 &&
    crossTenantAssignmentLeakCount === 0 &&
    customerUserValid;
  return {
    status: passed ? "passed" : "failed",
    deterministicIds: E2E,
    assignmentPersonnelLinkCount,
    inactivePersonnelCount,
    reportId: E2E.reports.tenantAApproved,
    reportCount,
    offlineTaskId: E2E.tasks.tenantAOffline,
    offlineTaskCount,
    invoiceId: E2E.invoices.tenantAVisible,
    invoiceCount,
    reviewJourneyCount,
    customerUserNaturalKey: customerUserResult.naturalKey,
    customerUserRowId: customerUserResult.actualId,
    customerUserMatchStrategy: customerUserResult.matchStrategy,
    customerUserReusedExisting: customerUserResult.reusedExisting,
    customerUserInsertedFallback: customerUserResult.insertedFallback,
    customerUserCount,
    customerUserByUserCount,
    canonicalAdminRoleCountTenantA,
    canonicalAdminRoleCountTenantB,
    canonicalAdminPermissionExpectedCount: CANONICAL_ADMIN_PERMISSIONS.length,
    canonicalAdminPermissionCountTenantA,
    canonicalAdminPermissionCountTenantB,
    tenantAAdminRoleLinkCount,
    tenantBAdminRoleLinkCount,
    tenantAAdminAllRoleLinkCount,
    tenantBAdminAllRoleLinkCount,
    crossTenantRoleLeakCount,
    crossTenantValidation: {
      tenantBAssignmentInTenantACount: crossTenantAssignmentLeakCount,
    },
  };
}

async function writeArtifact(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `${typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n`,
  );
}

async function main() {
  const client = await connect();
  const startedAt = new Date().toISOString();
  try {
    await client.query("begin");
    await insertE2EAuthUsers(client);
    const canonicalAdminRoles = await seedCanonicalAdminRoles(client);
    await insertInactivePersonnel(client);
    await insertPhase2Personnel(client);
    await insertAssignmentPersonnel(client);
    await insertOfflineTask(client);
    const customerUserResult = await upsertCustomerUser(client);
    await insertApprovedReport(client);
    await insertInvoice(client);
    await insertReviewRemediationJourneys(client);
    const verification = await verifyFixtures(
      client,
      customerUserResult,
      canonicalAdminRoles,
    );
    if (verification.status !== "passed")
      throw new Error(
        `Playwright E2E fixture verification failed: ${JSON.stringify(verification)}`,
      );
    await client.query("commit");
    await writeArtifact(
      join(
        process.cwd(),
        "artifacts",
        "fieldgrid-playwright",
        "e2e-fixtures.json",
      ),
      {
        name: "fieldgrid-playwright-e2e-fixtures",
        startedAt,
        completedAt: new Date().toISOString(),
        ...verification,
      },
    );
  } catch (error) {
    await client.query("rollback").catch(() => {});
    await writeArtifact(
      join(
        process.cwd(),
        "artifacts",
        "fieldgrid-playwright",
        "logs",
        "playwright-e2e-fixtures-error.log",
      ),
      error instanceof Error ? (error.stack ?? error.message) : String(error),
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
