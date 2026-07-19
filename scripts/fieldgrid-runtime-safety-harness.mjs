#!/usr/bin/env node
import nodeAssert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  FIXTURE,
  assert,
  connect,
  result,
  tableExists,
  writeJsonArtifact,
  writeTextArtifact,
} from "./fieldgrid-runtime-safety-lib.mjs";

async function loadTenantlessClassification() {
  const raw = await readFile(
    join("docs", "testing", "tenantless-write-invariants.json"),
    "utf8",
  );
  return JSON.parse(raw);
}

async function schemaInvariantChecks(client) {
  const requiredTables = [
    "tenants",
    "tenant_users",
    "tenant_domains",
    "tenant_modules",
    "platform_users",
    "support_access_grants",
    "customers",
    "personnel",
    "objects",
    "assignments",
    "assignment_personnel",
  ];
  const missingTables = [];
  for (const table of requiredTables) {
    if (!(await tableExists(client, "public", table)))
      missingTables.push(table);
  }
  assert(missingTables.length === 0, "Required runtime tables are missing.", {
    missingTables,
  });

  const requiredTenantScopedTables = [
    "tenant_users",
    "tenant_domains",
    "tenant_modules",
    "support_access_grants",
    "customers",
    "personnel",
    "objects",
    "assignments",
    "customer_users",
  ];
  const tenantBoundByParentTables = ["assignment_personnel"];
  const tenantColumns = await client.query(
    `
      select table_name, is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and column_name = 'tenant_id'
        and table_name = any($1::text[])
      order by table_name
    `,
    [requiredTenantScopedTables],
  );
  const seenTenantColumns = new Set(
    tenantColumns.rows.map((row) => row.table_name),
  );
  const missingTenantColumns = requiredTenantScopedTables.filter(
    (table) => !seenTenantColumns.has(table),
  );
  assert(
    missingTenantColumns.length === 0,
    "Required tenant-bound tables are missing tenant_id columns.",
    {
      missingTenantColumns,
    },
  );
  const nullableRequiredTenantColumns = tenantColumns.rows
    .filter((row) => row.is_nullable === "YES")
    .map((row) => row.table_name);
  assert(
    nullableRequiredTenantColumns.length === 0,
    "Required tenant-bound tables have nullable tenant_id columns.",
    {
      nullableRequiredTenantColumns,
    },
  );

  const policies = await client.query(
    `
      select schemaname, tablename, policyname, roles, cmd
      from pg_policies
      where schemaname in ('public', 'storage')
      order by schemaname, tablename, policyname
    `,
  );
  assert(policies.rows.length > 0, "No RLS policies were installed.");

  return result("schema-invariant-checks", "passed", {
    requiredTables,
    requiredTenantScopedTables,
    tenantBoundByParentTables,
    tenantScopedColumns: tenantColumns.rows.length,
    policies: policies.rows.length,
  });
}

async function tenantDatabaseIntegration(client) {
  const joined = await client.query(
    `
      select
        a.id as assignment_id,
        a.tenant_id as assignment_tenant_id,
        c.tenant_id as customer_tenant_id,
        o.tenant_id as object_tenant_id
      from assignments a
      join customers c on c.id = a.customer_id
      left join objects o on o.id = a.object_id
      where a.id = any($1::uuid[])
      order by a.id
    `,
    [[FIXTURE.assignments.a, FIXTURE.assignments.b]],
  );
  assert(joined.rows.length === 2, "Tenant A/B assignments were not loaded.", {
    rows: joined.rows,
  });
  const mismatches = joined.rows.filter(
    (row) =>
      row.assignment_tenant_id !== row.customer_tenant_id ||
      (row.object_tenant_id &&
        row.assignment_tenant_id !== row.object_tenant_id),
  );
  assert(
    mismatches.length === 0,
    "Assignment parent entities are not tenant-bound.",
    { mismatches },
  );

  const multiTenantMemberships = await client.query(
    `select tenant_id from tenant_users where user_id = $1 and status = 'active' order by tenant_id`,
    [FIXTURE.users.multiTenant],
  );
  assert(
    multiTenantMemberships.rows.length === 2,
    "Multi-tenant user does not have deterministic Tenant A/B memberships.",
    { memberships: multiTenantMemberships.rows },
  );

  return result("tenant-a-b-database-integration", "passed", {
    checkedAssignments: joined.rows.length,
    multiTenantMemberships: multiTenantMemberships.rows.map(
      (row) => row.tenant_id,
    ),
  });
}

async function expectDatabaseInvariantRejection(operation) {
  try {
    await operation();
  } catch (error) {
    assert(
      error?.code === "23514",
      "Unexpected database invariant rejection code.",
      {
        code: error?.code,
        message: error instanceof Error ? error.message : String(error),
      },
    );
    return {
      code: error.code,
      message: error instanceof Error ? error.message : String(error),
    };
  }
  throw new Error(
    "Expected database invariant rejection, but the write was accepted.",
  );
}

let remediationSavepoint = 0;
async function expectSqlState(client, expectedCode, operation) {
  remediationSavepoint += 1;
  const name = `remediation_${remediationSavepoint}`;
  await client.query(`savepoint ${name}`);
  try {
    await operation();
  } catch (error) {
    await client.query(`rollback to savepoint ${name}`);
    await client.query(`release savepoint ${name}`);
    assert(
      error?.code === expectedCode,
      "Unexpected SQLSTATE for remediation regression.",
      {
        expectedCode,
        actualCode: error?.code,
        message: error instanceof Error ? error.message : String(error),
      },
    );
    return;
  }
  await client.query(`rollback to savepoint ${name}`);
  await client.query(`release savepoint ${name}`);
  throw new Error(
    `Expected SQLSTATE ${expectedCode}, but the operation was accepted.`,
  );
}

async function phase2cReviewRemediationFlows(client) {
  const ids = {
    quoteAssignment: "91000000-0000-4000-8000-000000000001",
    quote: "91000000-0000-4000-8000-000000000002",
    rejectedAssignment: "91000000-0000-4000-8000-000000000003",
    rejectedQuote: "91000000-0000-4000-8000-000000000004",
    invalidAssignment: "91000000-0000-4000-8000-000000000005",
    invalidQuote: "91000000-0000-4000-8000-000000000006",
    draftAssignment: "92000000-0000-4000-8000-000000000001",
    draftInvoice: "92000000-0000-4000-8000-000000000002",
    replacementInvoice: "92000000-0000-4000-8000-000000000003",
    sentAssignment: "92000000-0000-4000-8000-000000000004",
    sentInvoice: "92000000-0000-4000-8000-000000000005",
    paidAssignment: "92000000-0000-4000-8000-000000000006",
    paidInvoice: "92000000-0000-4000-8000-000000000007",
    creditedAssignment: "92000000-0000-4000-8000-000000000008",
    creditedInvoice: "92000000-0000-4000-8000-000000000009",
    creditNote: "92000000-0000-4000-8000-000000000010",
    collectionAssignment: "92000000-0000-4000-8000-000000000011",
    collectionInvoice: "92000000-0000-4000-8000-000000000012",
    collectionBatch: "93000000-0000-4000-8000-000000000001",
    directPayment: "93000000-0000-4000-8000-000000000002",
    collectionPayment: "93000000-0000-4000-8000-000000000003",
    collectionInvoiceTwo: "93000000-0000-4000-8000-000000000004",
    collectionAssignmentTwo: "93000000-0000-4000-8000-000000000005",
    unrelatedInvoice: "93000000-0000-4000-8000-000000000006",
    unrelatedAssignment: "93000000-0000-4000-8000-000000000007",
    crossTenantAssignment: "93000000-0000-4000-8000-000000000008",
    crossTenantInvoice: "93000000-0000-4000-8000-000000000009",
  };

  await client.query("begin");
  try {
    for (const [id, code, status] of [
      [ids.quoteAssignment, "RTA-QA-001", "awaiting_approval"],
      [ids.rejectedAssignment, "RTA-QA-002", "awaiting_approval"],
      [ids.invalidAssignment, "RTA-QA-003", "review"],
    ]) {
      await client.query(
        `insert into assignments (id, tenant_id, code, title, customer_id, object_id, status, priority, is_active)
         values ($1,$2,$3,'Runtime quote remediation',$4,$5,$6,'normal',true)`,
        [
          id,
          FIXTURE.tenants.a,
          code,
          FIXTURE.customers.a,
          FIXTURE.objects.a,
          status,
        ],
      );
    }
    for (const [id, assignmentId, number, status] of [
      [ids.quote, ids.quoteAssignment, "RTA-OFF-001", "sent"],
      [ids.rejectedQuote, ids.rejectedAssignment, "RTA-OFF-002", "rejected"],
      [ids.invalidQuote, ids.invalidAssignment, "RTA-OFF-003", "sent"],
    ]) {
      await client.query(
        `insert into quotes (id, tenant_id, quote_number, assignment_id, customer_id, amount, validity_date, status)
         values ($1,$2,$3,$4,$5,'100.00',current_date + 7,$6)`,
        [
          id,
          FIXTURE.tenants.a,
          number,
          assignmentId,
          FIXTURE.customers.a,
          status,
        ],
      );
    }

    const approval = await client.query(
      `select * from public.accept_customer_quote($1,$2)`,
      [ids.quoteAssignment, FIXTURE.users.tenantACustomer],
    );
    nodeAssert.deepEqual(
      {
        status: approval.rows[0]?.assignment_status,
        version: Number(approval.rows[0]?.lifecycle_version),
        idempotent: approval.rows[0]?.idempotent,
      },
      { status: "plannable", version: 3, idempotent: false },
    );
    const approvedAggregate = await client.query(
      `select a.status as assignment_status, q.status as quote_status, q.approved_by,
              (select count(*)::int from audit_log where action='customer_approve_quote' and resource_id=$2::text) as audits,
              (select count(*)::int from portal_realtime_events where payload->>'assignmentId'=$1::text) as realtime_events
       from assignments a join quotes q on q.assignment_id=a.id where a.id=$1::uuid`,
      [ids.quoteAssignment, ids.quote],
    );
    assert(
      approvedAggregate.rows[0]?.assignment_status === "plannable",
      "Customer approval did not become plannable.",
    );
    assert(
      approvedAggregate.rows[0]?.quote_status === "approved",
      "Customer quote did not become approved.",
    );
    assert(
      approvedAggregate.rows[0]?.approved_by === FIXTURE.users.tenantACustomer,
      "Approval actor was not retained.",
    );
    assert(
      approvedAggregate.rows[0]?.audits === 1,
      "Customer approval audit was not written exactly once.",
    );
    assert(
      approvedAggregate.rows[0]?.realtime_events >= 1,
      "Customer approval produced no realtime projection event.",
    );
    await client.query(`select set_config('request.jwt.claim.sub',$1,true)`, [
      FIXTURE.users.tenantACustomer,
    ]);
    const projection = await client.query(
      `select status from public.customer_assignment_projection where id=$1`,
      [ids.quoteAssignment],
    );
    await client.query(`select set_config('request.jwt.claim.sub','',true)`);
    assert(
      projection.rows[0]?.status === "plannable",
      "Customer refresh projection diverged from acceptance result.",
    );

    const approvalReplay = await client.query(
      `select * from public.accept_customer_quote($1,$2)`,
      [ids.quoteAssignment, FIXTURE.users.tenantACustomer],
    );
    assert(
      approvalReplay.rows[0]?.idempotent === true,
      "Duplicate customer approval was not idempotent.",
    );
    const approvalAuditReplay = await client.query(
      `select count(*)::int as count from audit_log where action='customer_approve_quote' and resource_id=$1`,
      [ids.quote],
    );
    assert(
      approvalAuditReplay.rows[0]?.count === 1,
      "Duplicate customer approval duplicated the audit.",
    );

    await expectSqlState(client, "42501", () =>
      client.query(`select * from public.accept_customer_quote($1,$2)`, [
        ids.quoteAssignment,
        FIXTURE.users.tenantBCustomer,
      ]),
    );
    await expectSqlState(client, "23514", () =>
      client.query(`select * from public.accept_customer_quote($1,$2)`, [
        ids.rejectedAssignment,
        FIXTURE.users.tenantACustomer,
      ]),
    );
    await expectSqlState(client, "23514", () =>
      client.query(`select * from public.accept_customer_quote($1,$2)`, [
        ids.invalidAssignment,
        FIXTURE.users.tenantACustomer,
      ]),
    );
    await client.query(`savepoint skipped_quote_transition`);
    await expectSqlState(client, "23514", () =>
      client.query(`update assignments set status='plannable' where id=$1`, [
        ids.rejectedAssignment,
      ]),
    );
    await client.query(`release savepoint skipped_quote_transition`);

    for (const [id, code, status] of [
      [ids.draftAssignment, "RTA-INV-A1", "invoice_ready"],
      [ids.sentAssignment, "RTA-INV-A2", "invoiced"],
      [ids.paidAssignment, "RTA-INV-A3", "invoiced"],
      [ids.creditedAssignment, "RTA-INV-A4", "invoiced"],
      [ids.collectionAssignment, "RTA-INV-A5", "invoiced"],
      [ids.collectionAssignmentTwo, "RTA-INV-A6", "invoiced"],
      [ids.unrelatedAssignment, "RTA-INV-A7", "invoiced"],
    ]) {
      await client.query(
        `insert into assignments (id,tenant_id,code,title,customer_id,object_id,status,priority,is_active)
         values ($1,$2,$3,'Runtime invoice remediation',$4,$5,$6,'normal',true)`,
        [
          id,
          FIXTURE.tenants.a,
          code,
          FIXTURE.customers.a,
          FIXTURE.objects.a,
          status,
        ],
      );
    }
    for (const [
      id,
      assignmentId,
      number,
      status,
      paymentStatus,
      paidAmount,
    ] of [
      [
        ids.draftInvoice,
        ids.draftAssignment,
        "RTA-F-001",
        "draft",
        "unpaid",
        "0",
      ],
      [ids.sentInvoice, ids.sentAssignment, "RTA-F-002", "sent", "unpaid", "0"],
      [ids.paidInvoice, ids.paidAssignment, "RTA-F-003", "sent", "paid", "121"],
      [
        ids.creditedInvoice,
        ids.creditedAssignment,
        "RTA-F-004",
        "sent",
        "unpaid",
        "0",
      ],
      [
        ids.collectionInvoice,
        ids.collectionAssignment,
        "RTA-F-005",
        "sent",
        "unpaid",
        "0",
      ],
      [
        ids.collectionInvoiceTwo,
        ids.collectionAssignmentTwo,
        "RTA-F-006",
        "sent",
        "unpaid",
        "0",
      ],
      [
        ids.unrelatedInvoice,
        ids.unrelatedAssignment,
        "RTA-F-007",
        "sent",
        "unpaid",
        "0",
      ],
    ]) {
      await client.query(
        `insert into invoices (id,tenant_id,invoice_number,customer_id,assignment_id,amount,vat_percentage,vat_amount,total_amount,status,payment_status,paid_amount,outstanding_amount,due_date,type)
         values ($1,$2,$3,$4,$5,'100','21','21','121',$6,$7,$8,'121',current_date+14,'invoice')`,
        [
          id,
          FIXTURE.tenants.a,
          number,
          FIXTURE.customers.a,
          assignmentId,
          status,
          paymentStatus,
          paidAmount,
        ],
      );
    }
    await client.query(
      `insert into assignments (id,tenant_id,code,title,customer_id,object_id,status,priority,is_active)
       values ($1,$2,'RTB-INV-A1','Runtime cross-tenant invoice remediation',$3,$4,'invoiced','normal',true)`,
      [
        ids.crossTenantAssignment,
        FIXTURE.tenants.b,
        FIXTURE.customers.b,
        FIXTURE.objects.b,
      ],
    );
    await client.query(
      `insert into invoices (id,tenant_id,invoice_number,customer_id,assignment_id,amount,vat_percentage,vat_amount,total_amount,status,payment_status,paid_amount,outstanding_amount,due_date,type)
       values ($1,$2,'RTB-F-001',$3,$4,'100','21','21','121','sent','unpaid','0','121',current_date+14,'invoice')`,
      [
        ids.crossTenantInvoice,
        FIXTURE.tenants.b,
        FIXTURE.customers.b,
        ids.crossTenantAssignment,
      ],
    );

    const cancelledDraft = await client.query(
      `select * from public.cancel_invoice_and_reopen_assignment($1,$2,$3,$4)`,
      [
        FIXTURE.tenants.a,
        ids.draftInvoice,
        FIXTURE.users.tenantAOwner,
        "Verkeerde factuurregels",
      ],
    );
    assert(
      cancelledDraft.rows[0]?.invoice_status === "cancelled",
      "Draft invoice was not cancelled.",
    );
    assert(
      cancelledDraft.rows[0]?.assignment_status === "report_approved",
      "Draft cancellation did not reopen assignment.",
    );
    const cancellationAudit = await client.query(
      `select count(*)::int as count from audit_log where action='cancel_invoice_and_reopen_assignment' and resource_id=$1`,
      [ids.draftInvoice],
    );
    assert(
      cancellationAudit.rows[0]?.count === 1,
      "Invoice cancellation audit missing.",
    );
    const cancelledReplay = await client.query(
      `select * from public.cancel_invoice_and_reopen_assignment($1,$2,$3,$4)`,
      [
        FIXTURE.tenants.a,
        ids.draftInvoice,
        FIXTURE.users.tenantAOwner,
        "Verkeerde factuurregels",
      ],
    );
    assert(
      cancelledReplay.rows[0]?.idempotent === true,
      "Duplicate cancellation was not idempotent.",
    );

    await client.query(
      `insert into invoices (id,tenant_id,invoice_number,customer_id,assignment_id,amount,vat_percentage,vat_amount,total_amount,status,payment_status,paid_amount,outstanding_amount,due_date,type)
       values ($1,$2,'RTA-F-REISSUE',$3,$4,'100','21','21','121','draft','unpaid','0','121',current_date+14,'invoice')`,
      [
        ids.replacementInvoice,
        FIXTURE.tenants.a,
        FIXTURE.customers.a,
        ids.draftAssignment,
      ],
    );
    await client.query(
      `update assignments set status='invoice_ready' where id=$1`,
      [ids.draftAssignment],
    );
    const replacement = await client.query(
      `select status from assignments where id=$1`,
      [ids.draftAssignment],
    );
    assert(
      replacement.rows[0]?.status === "invoice_ready",
      "Replacement invoice did not regain invoice eligibility.",
    );

    const cancelledSent = await client.query(
      `select * from public.cancel_invoice_and_reopen_assignment($1,$2,$3,$4)`,
      [
        FIXTURE.tenants.a,
        ids.sentInvoice,
        FIXTURE.users.tenantAOwner,
        "Verkeerde tenaamstelling",
      ],
    );
    assert(
      cancelledSent.rows[0]?.assignment_status === "report_approved",
      "Cancellable sent invoice did not reopen assignment.",
    );

    await expectSqlState(client, "42501", () =>
      client.query(
        `select * from public.cancel_invoice_and_reopen_assignment($1,$2,$3,$4)`,
        [
          FIXTURE.tenants.b,
          ids.paidInvoice,
          FIXTURE.users.tenantBOwner,
          "Verkeerde tenant",
        ],
      ),
    );
    await expectSqlState(client, "42501", () =>
      client.query(
        `select * from public.cancel_invoice_and_reopen_assignment($1,$2,$3,$4)`,
        [
          FIXTURE.tenants.a,
          ids.paidInvoice,
          FIXTURE.users.legacyGlobalManagementOnly,
          "Niet bevoegd",
        ],
      ),
    );
    await expectSqlState(client, "23514", () =>
      client.query(
        `select * from public.cancel_invoice_and_reopen_assignment($1,$2,$3,$4)`,
        [
          FIXTURE.tenants.a,
          ids.paidInvoice,
          FIXTURE.users.tenantAOwner,
          "Betaalde factuur",
        ],
      ),
    );

    await client.query(
      `insert into invoices (id,tenant_id,invoice_number,customer_id,assignment_id,credited_invoice_id,credit_reason,amount,vat_percentage,vat_amount,total_amount,status,payment_status,paid_amount,outstanding_amount,due_date,type)
       values ($1,$2,'RTA-CN-001',$3,$4,$5,'Correctie','-100','21','-21','-121','draft','unpaid','0','0',current_date+14,'credit_note')`,
      [
        ids.creditNote,
        FIXTURE.tenants.a,
        FIXTURE.customers.a,
        ids.creditedAssignment,
        ids.creditedInvoice,
      ],
    );
    await expectSqlState(client, "23514", () =>
      client.query(
        `select * from public.cancel_invoice_and_reopen_assignment($1,$2,$3,$4)`,
        [
          FIXTURE.tenants.a,
          ids.creditedInvoice,
          FIXTURE.users.tenantAOwner,
          "Heeft creditnota",
        ],
      ),
    );

    await client.query(
      `insert into customer_payment_batches (id,tenant_id,customer_id,amount_cents,outstanding_amount_cents,status)
       values ($1,$2,$3,24200,24200,'open')`,
      [ids.collectionBatch, FIXTURE.tenants.a, FIXTURE.customers.a],
    );
    await client.query(
      `insert into customer_payment_batch_items (tenant_id,batch_id,invoice_id,amount_cents,included_amount_cents)
       values ($1,$2,$3,12100,12100),($1,$2,$4,12100,12100)`,
      [
        FIXTURE.tenants.a,
        ids.collectionBatch,
        ids.collectionInvoice,
        ids.collectionInvoiceTwo,
      ],
    );
    await client.query(
      `update invoices set collection_status='collected' where id=$1`,
      [ids.collectionInvoice],
    );
    await expectSqlState(client, "23514", () =>
      client.query(
        `select * from public.cancel_invoice_and_reopen_assignment($1,$2,$3,$4)`,
        [
          FIXTURE.tenants.a,
          ids.collectionInvoice,
          FIXTURE.users.tenantAOwner,
          "In verzameling",
        ],
      ),
    );
    await expectSqlState(client, "23514", () =>
      client.query(
        `update assignments set status='report_approved' where id=$1`,
        [ids.collectionAssignmentTwo],
      ),
    );

    await client.query(
      `insert into payments (id,tenant_id,customer_id,invoice_id,source_type,source_id,amount_cents,amount,status,payment_method)
       values ($1,$2,$3,$4,'invoice',$4,12100,'121','paid','manual_bank')`,
      [
        ids.directPayment,
        FIXTURE.tenants.a,
        FIXTURE.customers.a,
        ids.unrelatedInvoice,
      ],
    );
    await client.query(
      `insert into payment_allocations (tenant_id,payment_id,invoice_id,amount_cents,amount)
       values ($1,$2,$3,12100,'121')`,
      [FIXTURE.tenants.a, ids.directPayment, ids.unrelatedInvoice],
    );
    await client.query(
      `insert into payments (
         id,tenant_id,customer_id,invoice_id,source_type,source_id,
         provider_request_key,request_hash,expected_provider_metadata,
         amount_cents,amount,status,payment_method
       ) values (
         $1,$2,$3,null,'invoice_collection',$4,gen_random_uuid(),
         md5($1::uuid::text) || md5('runtime|' || $1::uuid::text),
         jsonb_build_object(
           'schemaVersion','fieldgrid-payment-v1',
           'purpose','invoice_collection_payment',
           'paymentIntentId',$1::uuid::text,
           'tenantId',$2::uuid::text,
           'customerId',$3::uuid::text,
           'sourceType','invoice_collection',
           'sourceId',$4::uuid::text
         ),24200,'242','paid','mollie'
       )`,
      [
        ids.collectionPayment,
        FIXTURE.tenants.a,
        FIXTURE.customers.a,
        ids.collectionBatch,
      ],
    );
    await client.query(
      `insert into payment_allocations (tenant_id,payment_id,invoice_id,amount_cents,amount)
       values ($1,$2,$3,12100,'121')`,
      [FIXTURE.tenants.a, ids.collectionPayment, ids.collectionInvoice],
    );
    const partialAllocation = await client.query(
      `select count(*)::int as count, sum(amount_cents)::int as cents
       from payment_allocations where payment_id=$1`,
      [ids.collectionPayment],
    );
    nodeAssert.deepEqual(partialAllocation.rows[0], {
      count: 1,
      cents: 12100,
    });
    await expectSqlState(client, "23514", () =>
      client.query(
        `insert into payment_allocations (tenant_id,payment_id,invoice_id,amount_cents,amount)
         values ($1,$2,$3,12101,'121.01')`,
        [FIXTURE.tenants.a, ids.collectionPayment, ids.collectionInvoiceTwo],
      ),
    );
    await client.query(
      `insert into payment_allocations (tenant_id,payment_id,invoice_id,amount_cents,amount)
       values ($1,$2,$3,12100,'121')`,
      [FIXTURE.tenants.a, ids.collectionPayment, ids.collectionInvoiceTwo],
    );
    const collectionAllocations = await client.query(
      `select count(*)::int as count, sum(amount_cents)::int as cents from payment_allocations where payment_id=$1`,
      [ids.collectionPayment],
    );
    nodeAssert.deepEqual(collectionAllocations.rows[0], {
      count: 2,
      cents: 24200,
    });
    const duplicateAllocation = await client.query(
      `insert into payment_allocations (tenant_id,payment_id,invoice_id,amount_cents,amount)
       values ($1,$2,$3,12100,'121') returning id`,
      [FIXTURE.tenants.a, ids.collectionPayment, ids.collectionInvoice],
    );
    assert(
      duplicateAllocation.rowCount === 0,
      "Exact allocation replay was not idempotent.",
    );
    await expectSqlState(client, "23505", () =>
      client.query(
        `insert into payment_allocations (tenant_id,payment_id,invoice_id,amount_cents,amount)
         values ($1,$2,$3,12000,'120')`,
        [FIXTURE.tenants.a, ids.collectionPayment, ids.collectionInvoice],
      ),
    );
    await expectSqlState(client, "23514", () =>
      client.query(
        `insert into payment_allocations (tenant_id,payment_id,invoice_id,amount_cents,amount)
         values ($1,$2,$3,1,'0.01')`,
        [FIXTURE.tenants.a, ids.collectionPayment, ids.unrelatedInvoice],
      ),
    );
    await expectSqlState(client, "23514", () =>
      client.query(
        `insert into payment_allocations (tenant_id,payment_id,invoice_id,amount_cents,amount)
         values ($1,$2,$3,1,'0.01')`,
        [FIXTURE.tenants.a, ids.collectionPayment, ids.crossTenantInvoice],
      ),
    );

    await client.query("rollback");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }

  return result("phase2c-review-remediation-flows", "passed", {
    customerApproval:
      "awaiting_approval->approved->plannable, audited, replay-safe, projected",
    invoiceCancellation:
      "draft/sent cancellation atomically reopens report_approved and permits replacement",
    collectionAllocation:
      "source-aware tenant/customer/membership validation with exact replay",
  });
}

async function assignmentExploitTests(client) {
  const outcomes = {};

  await client.query("begin");
  try {
    const sameTenant = await client.query(
      `
        insert into assignment_personnel (assignment_id, personnel_id, status, assigned_by)
        values ($1, $2, 'assigned', $3)
        returning id
      `,
      [
        FIXTURE.assignments.a,
        FIXTURE.personnel.a,
        FIXTURE.users.tenantAPlanner,
      ],
    );
    assert(
      sameTenant.rows.length === 1,
      "Same-tenant assignment_personnel insert was not accepted.",
    );
    outcomes.sameTenantInsert = "accepted";
    await client.query("rollback");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }

  await client.query("begin");
  try {
    outcomes.crossTenantInsert = await expectDatabaseInvariantRejection(() =>
      client.query(
        `
          insert into assignment_personnel (assignment_id, personnel_id, status, assigned_by)
          values ($1, $2, 'assigned', $3)
          returning id
        `,
        [
          FIXTURE.assignments.a,
          FIXTURE.personnel.b,
          FIXTURE.users.tenantAPlanner,
        ],
      ),
    );
    await client.query("rollback");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }

  await client.query("begin");
  try {
    const inserted = await client.query(
      `
        insert into assignment_personnel (assignment_id, personnel_id, status, assigned_by)
        values ($1, $2, 'assigned', $3)
        returning id
      `,
      [
        FIXTURE.assignments.a,
        FIXTURE.personnel.a,
        FIXTURE.users.tenantAPlanner,
      ],
    );
    outcomes.updateToForeignPersonnel = await expectDatabaseInvariantRejection(
      () =>
        client.query(
          `update assignment_personnel set personnel_id = $1 where id = $2`,
          [FIXTURE.personnel.b, inserted.rows[0].id],
        ),
    );
    await client.query("rollback");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }

  await client.query("begin");
  try {
    outcomes.upsertCrossTenant = await expectDatabaseInvariantRejection(() =>
      client.query(
        `
        insert into assignment_personnel (assignment_id, personnel_id, status, assigned_by)
        values ($1, $2, 'assigned', $3)
        on conflict (assignment_id, personnel_id)
        do update set status = excluded.status
      `,
        [
          FIXTURE.assignments.a,
          FIXTURE.personnel.b,
          FIXTURE.users.tenantAPlanner,
        ],
      ),
    );
    await client.query("rollback");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }

  return result("assignment-exploit-tests", "passed", {
    attempted: "Tenant A assignment linked to Tenant B personnel",
    expected:
      "database rejects cross-tenant writes before commit, including update and upsert paths",
    outcomes,
  });
}

async function tenantlessWriteInvariants(client) {
  const classification = await loadTenantlessClassification();
  const tableClassifications = classification.tables ?? {};
  const rows = await client.query(
    `
      select columns_row.table_name, columns_row.is_nullable
      from information_schema.columns columns_row
      join information_schema.tables tables_row
        on tables_row.table_schema = columns_row.table_schema
       and tables_row.table_name = columns_row.table_name
       and tables_row.table_type = 'BASE TABLE'
      where columns_row.table_schema = 'public'
        and columns_row.column_name = 'tenant_id'
      order by columns_row.table_name
    `,
  );
  const unclassifiedNullableTables = rows.rows
    .filter(
      (row) =>
        row.is_nullable === "YES" && !tableClassifications[row.table_name],
    )
    .map((row) => row.table_name);
  assert(
    unclassifiedNullableTables.length === 0,
    "Nullable tenant_id tables must be explicitly classified before tenantless writes are allowed.",
    { unclassifiedNullableTables },
  );

  const violations = [];
  for (const row of rows.rows) {
    const classificationEntry = tableClassifications[row.table_name];
    const tableClass = classificationEntry?.classification ?? "tenant-required";
    if (row.is_nullable === "YES" && tableClass !== "tenant-required") continue;

    const count = await client.query(
      `select count(*)::int as count from ${row.table_name} where tenant_id is null`,
    );
    if (count.rows[0].count > 0)
      violations.push({ table: row.table_name, rows: count.rows[0].count });
  }
  assert(
    violations.length === 0,
    "Tenantless rows exist in tenant-bound tables.",
    { violations },
  );
  return result("tenantless-write-invariants", "passed", {
    checkedTables: rows.rows.length,
    classificationVersion: classification.version,
    nullableClassifiedTables: Object.keys(tableClassifications).length,
  });
}

async function passwordResetExploitScaffold(client) {
  const authUser = await client.query(
    `
      select id, email, raw_user_meta_data ->> 'expired_recovery_at' as expired_recovery_at
      from auth.users
      where id = $1
    `,
    [FIXTURE.users.tenantACustomer],
  );
  assert(
    authUser.rows.length === 1,
    "Tenant A customer auth fixture is missing.",
  );
  assert(
    new Date(authUser.rows[0].expired_recovery_at).getTime() < Date.now(),
    "Expired recovery fixture is not expired.",
    authUser.rows[0],
  );

  const invite = await client.query(
    `
      select status, invite_sent_at, metadata
      from tenant_owner_invites
      where id = $1
    `,
    [FIXTURE.tenantOwnerInviteExpired],
  );
  assert(invite.rows.length === 1, "Expired invite fixture is missing.");

  return result("password-reset-exploit-tests", "passed", {
    layer: "database integration scaffold",
    limitation:
      "No local Supabase password-reset token table exists; provider reset-code behavior still requires Supabase/runtime evidence.",
  });
}

async function phase2cTransactionalInvariants(client) {
  const policyScan = await client.query(`
    select count(*)::int as count from pg_policies
    where schemaname in ('public', 'storage')
      and (coalesce(qual, '') like '%is_management()%' or coalesce(with_check, '') like '%is_management()%')
  `);
  assert(
    policyScan.rows[0]?.count === 0,
    "Legacy global Management policies remain active.",
    policyScan.rows[0],
  );

  const catalog = await client.query(`
    select
      to_regclass('public.offline_operation_receipts') is not null as offline_receipts,
      to_regclass('public.payment_allocations_payment_invoice_idx') is not null as allocation_unique,
      to_regclass('public.invoices_assignment_active_unique_idx') is not null as invoice_unique,
      exists(select 1 from pg_trigger where tgname = 'fieldgrid_staffing_eligibility' and not tgisinternal) as staffing_guard,
      exists(select 1 from pg_trigger where tgname = 'payment_allocations_guard' and not tgisinternal) as allocation_guard,
      public.fieldgrid_assignment_transition_allowed('seen', 'plannable') as seen_staffing_rollback_allowed,
      not public.fieldgrid_assignment_transition_allowed('completed', 'in_progress') as terminal_regression_denied
  `);
  assert(
    Object.values(catalog.rows[0] ?? {}).every(Boolean),
    "Phase 2C transactional catalog is incomplete.",
    catalog.rows[0],
  );

  let replayVersion;
  await client.query("begin");
  try {
    await client.query(
      `
      insert into assignment_personnel (assignment_id, personnel_id, status, assigned_by)
      values ($1, $2, 'assigned', $3)
    `,
      [
        FIXTURE.assignments.a,
        FIXTURE.personnel.a,
        FIXTURE.users.tenantAPlanner,
      ],
    );
    const first = await client.query(
      `
      select * from public.execute_assignment_participant_action_v2(
        $1, $2, $3, 'en_route', 'runtime-offline-operation-0001', 1, null, null, '{}'::jsonb
      )
    `,
      [
        FIXTURE.assignments.a,
        FIXTURE.personnel.a,
        FIXTURE.users.tenantAPersonnel,
      ],
    );
    const replay = await client.query(
      `
      select * from public.execute_assignment_participant_action_v2(
        $1, $2, $3, 'en_route', 'runtime-offline-operation-0001', 1, null, null, '{}'::jsonb
      )
    `,
      [
        FIXTURE.assignments.a,
        FIXTURE.personnel.a,
        FIXTURE.users.tenantAPersonnel,
      ],
    );
    nodeAssert.deepEqual(replay.rows, first.rows);
    replayVersion = first.rows[0]?.version;

    await client.query("savepoint altered_operation");
    try {
      await client.query(
        `select * from public.execute_assignment_participant_action_v2($1,$2,$3,'start','runtime-offline-operation-0001',1,null,null,'{}'::jsonb)`,
        [
          FIXTURE.assignments.a,
          FIXTURE.personnel.a,
          FIXTURE.users.tenantAPersonnel,
        ],
      );
      throw new Error("Altered offline replay was accepted.");
    } catch (error) {
      assert(
        error?.code === "23505",
        "Altered offline replay returned an unexpected error.",
        { code: error?.code },
      );
      await client.query("rollback to savepoint altered_operation");
    }

    await client.query("savepoint stale_operation");
    try {
      await client.query(
        `select * from public.execute_assignment_participant_action_v2($1,$2,$3,'start','runtime-offline-operation-0002',1,null,null,'{}'::jsonb)`,
        [
          FIXTURE.assignments.a,
          FIXTURE.personnel.a,
          FIXTURE.users.tenantAPersonnel,
        ],
      );
      throw new Error("Stale offline operation was accepted.");
    } catch (error) {
      assert(
        error?.code === "40001",
        "Stale offline operation returned an unexpected error.",
        { code: error?.code },
      );
      await client.query("rollback to savepoint stale_operation");
    }
    await client.query("rollback");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }

  return result("phase2c-transactional-invariants", "passed", {
    catalog: catalog.rows[0],
    legacyGlobalManagementPolicies: policyScan.rows[0]?.count,
    offlineReplayVersion: replayVersion,
    alteredReplay: "23505",
    staleReplay: "40001",
  });
}

async function rlsStorageScaffold(client) {
  const storageObjects = await tableExists(client, "storage", "objects");
  const storagePolicies = storageObjects
    ? await client.query(
        `select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname`,
      )
    : { rows: [] };

  const rlsProbe = await client.query(
    `
      select relname, relrowsecurity
      from pg_class
      join pg_namespace on pg_namespace.oid = pg_class.relnamespace
      where nspname = 'public'
        and relkind = 'r'
        and relname in ('tenants', 'tenant_users', 'customers', 'personnel', 'assignments')
      order by relname
    `,
  );
  const withoutRls = rlsProbe.rows
    .filter((row) => !row.relrowsecurity)
    .map((row) => row.relname);
  assert(
    withoutRls.length === 0,
    "Expected public tables do not have RLS enabled.",
    { withoutRls },
  );

  return result("rls-storage-test-scaffolding", "passed", {
    rlsTablesChecked: rlsProbe.rows.length,
    storageObjects,
    storagePolicies: storagePolicies.rows.length,
    limitation:
      "Storage table policies are PostgreSQL policy checks, not object-storage runtime checks.",
  });
}

async function writeSchemaArtifacts(client) {
  const tables = await client.query(
    `
      select table_schema, table_name, column_name, data_type, is_nullable
      from information_schema.columns
      where table_schema in ('public', 'auth', 'storage')
      order by table_schema, table_name, ordinal_position
    `,
  );
  const policies = await client.query(
    `
      select schemaname, tablename, policyname, roles, cmd, qual, with_check
      from pg_policies
      where schemaname in ('public', 'storage')
      order by schemaname, tablename, policyname
    `,
  );
  await writeJsonArtifact(join("schema", "database-schema.json"), {
    generatedAt: new Date().toISOString(),
    columns: tables.rows,
    policies: policies.rows,
  });
  return result("test-result-and-schema-artifacts", "passed", {
    schemaArtifact:
      "artifacts/runtime-safety-harness/schema/database-schema.json",
  });
}

async function runChecks() {
  const client = await connect();
  const checks = [];
  try {
    checks.push(await schemaInvariantChecks(client));
    checks.push(await tenantDatabaseIntegration(client));
    checks.push(await assignmentExploitTests(client));
    checks.push(await passwordResetExploitScaffold(client));
    checks.push(await phase2cTransactionalInvariants(client));
    checks.push(await phase2cReviewRemediationFlows(client));
    checks.push(await tenantlessWriteInvariants(client));
    checks.push(await rlsStorageScaffold(client));
    checks.push(await writeSchemaArtifacts(client));
    return checks;
  } finally {
    await client.end();
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  const checks = [];
  let status = "passed";
  try {
    checks.push(...(await runChecks()));
  } catch (error) {
    status = "failed";
    checks.push(
      result("runtime-safety-db-failure", "failed", {
        message: error instanceof Error ? error.message : String(error),
        details: error?.details ?? {},
      }),
    );
    await writeTextArtifact(
      join("logs", "db-harness-error.log"),
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
  }

  await writeJsonArtifact(join("reports", "db-harness.json"), {
    name: "fieldgrid-runtime-safety-db-harness",
    status,
    startedAt,
    completedAt: new Date().toISOString(),
    checks,
    testLayerClassification: {
      "schema-invariant-checks": "database integration",
      "tenant-a-b-database-integration": "database integration",
      "assignment-exploit-tests": "service-role/database invariant",
      "password-reset-exploit-tests": "provider mock",
      "phase2c-transactional-invariants": "database integration",
      "phase2c-review-remediation-flows": "database integration",
      "tenantless-write-invariants": "database integration",
      "rls-storage-test-scaffolding": "provider mock",
      "test-result-and-schema-artifacts": "artifact generation",
    },
  });

  if (status !== "passed") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
