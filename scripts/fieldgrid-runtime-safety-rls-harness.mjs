#!/usr/bin/env node
import nodeAssert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  FIXTURE,
  assert,
  connect,
  repoRoot,
  result,
  writeJsonArtifact,
  writeTextArtifact,
} from "./fieldgrid-runtime-safety-lib.mjs";

const ACTORS = {
  tenantAPlanner: {
    userId: FIXTURE.users.tenantAPlanner,
    email: "planner@tenant-a.runtime.fieldgrid.test",
    tenantId: FIXTURE.tenants.a,
  },
  tenantAPersonnel: {
    userId: FIXTURE.users.tenantAPersonnel,
    email: "personnel@tenant-a.runtime.fieldgrid.test",
    tenantId: FIXTURE.tenants.a,
  },
  tenantBPersonnel: {
    userId: FIXTURE.users.tenantBPersonnel,
    email: "personnel@tenant-b.runtime.fieldgrid.test",
    tenantId: FIXTURE.tenants.b,
  },
  tenantACustomer: {
    userId: FIXTURE.users.tenantACustomer,
    email: "customer@tenant-a.runtime.fieldgrid.test",
    tenantId: FIXTURE.tenants.a,
  },
  multiTenantInA: {
    userId: FIXTURE.users.multiTenant,
    email: "multi@runtime.fieldgrid.test",
    tenantId: FIXTURE.tenants.a,
  },
  multiTenantInB: {
    userId: FIXTURE.users.multiTenant,
    email: "multi@runtime.fieldgrid.test",
    tenantId: FIXTURE.tenants.b,
  },
  legacyGlobalManagementOnly: {
    userId: FIXTURE.users.legacyGlobalManagementOnly,
    email: "legacy-management-only@runtime.fieldgrid.test",
    tenantId: FIXTURE.tenants.a,
  },
};

const RLS_FIXTURE = {
  personnel: {
    multiA: "60000000-0000-4000-8000-000000000003",
    multiB: "60000000-0000-4000-8000-000000000004",
  },
  assignmentPersonnel: {
    a: "61000000-0000-4000-8000-000000000001",
    b: "61000000-0000-4000-8000-000000000002",
    multiA: "61000000-0000-4000-8000-000000000003",
    multiB: "61000000-0000-4000-8000-000000000004",
  },
  tasks: {
    a: "71000000-0000-4000-8000-000000000001",
    b: "71000000-0000-4000-8000-000000000002",
  },
  extraWork: {
    a: "72000000-0000-4000-8000-000000000001",
  },
  photos: {
    a: "73000000-0000-4000-8000-000000000001",
    b: "73000000-0000-4000-8000-000000000002",
  },
  reports: {
    a: "74000000-0000-4000-8000-000000000001",
    b: "74000000-0000-4000-8000-000000000002",
  },
  reportNotes: {
    a: "75000000-0000-4000-8000-000000000001",
  },
  reportNoteAttachments: {
    a: "76000000-0000-4000-8000-000000000001",
  },
  materialUsage: {
    a: "77000000-0000-4000-8000-000000000001",
  },
};

const ASSIGNMENT_PERSONNEL_TABLE_PRIVILEGES = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER",
  "MAINTAIN",
];

const ASSIGNMENT_PERSONNEL_EXPECTED_TABLE_PRIVILEGES = {
  anon: {
    SELECT: false,
    INSERT: false,
    UPDATE: false,
    DELETE: false,
    TRUNCATE: false,
    REFERENCES: false,
    TRIGGER: false,
    MAINTAIN: false,
  },
  authenticated: {
    SELECT: false,
    INSERT: false,
    UPDATE: false,
    DELETE: false,
    TRUNCATE: false,
    REFERENCES: false,
    TRIGGER: false,
    MAINTAIN: false,
  },
  service_role: {
    SELECT: true,
    INSERT: true,
    UPDATE: true,
    DELETE: true,
    TRUNCATE: false,
    REFERENCES: false,
    TRIGGER: false,
    MAINTAIN: false,
  },
};

const PHASE_A1_ACL_MIGRATION_PATH =
  "lib/db/migrations/20260713120000_assignment_personnel_phase_a_acl_hardening.sql";
const PHASE_B_ACL_MIGRATION_PATH =
  "lib/db/migrations/20260714120000_assignment_personnel_phase_b_direct_access_close.sql";

function claimsFor(actor, tenantClaim = actor.tenantId) {
  const claims = {
    sub: actor.userId,
    email: actor.email,
    role: "authenticated",
    aud: "authenticated",
  };
  if (tenantClaim !== null) claims.tenant_id = tenantClaim;
  return claims;
}

async function setLocalRoleContext(client, role, actor, claims) {
  await client.query(`set local role ${role}`);
  await client.query("set local row_security = on");
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [actor.userId]);
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
}

async function asRole(client, role, actor, claims, callback) {
  await client.query("begin");
  try {
    await setLocalRoleContext(client, role, actor, claims);
    const value = await callback();
    await client.query("rollback");
    return value;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }
}

async function asAuthenticated(client, actor, claims, callback) {
  return asRole(client, "authenticated", actor, claims, callback);
}

async function asServiceRole(client, actor, claims, callback) {
  return asRole(client, "service_role", actor, claims, callback);
}

async function expectRejected(operation, expectedCodes) {
  try {
    await operation();
  } catch (error) {
    const code = error?.code ?? "unknown";
    assert(expectedCodes.includes(code), "Unexpected rejection error code.", {
      code,
      expectedCodes,
      message: error instanceof Error ? error.message : String(error),
    });
    return { code, message: error instanceof Error ? error.message : String(error) };
  }
  throw new Error("Expected operation to be rejected.");
}

function directInsert(client, assignmentId, personnelId, assignedBy) {
  return client.query(
    `
      insert into public.assignment_personnel (assignment_id, personnel_id, status, assigned_by)
      values ($1, $2, 'assigned', $3)
      returning id
    `,
    [assignmentId, personnelId, assignedBy],
  );
}

function directSelect(client, linkId = RLS_FIXTURE.assignmentPersonnel.a) {
  return client.query(`select id from public.assignment_personnel where id = $1`, [linkId]);
}

function directUpdate(client, linkId = RLS_FIXTURE.assignmentPersonnel.a) {
  return client.query(
    `update public.assignment_personnel set assigned_by = assigned_by where id = $1`,
    [linkId],
  );
}

function directDelete(client, linkId = RLS_FIXTURE.assignmentPersonnel.a) {
  return client.query(`delete from public.assignment_personnel where id = $1`, [linkId]);
}

async function readAssignmentPersonnelTableAclSnapshot(client) {
  const acl = await client.query(
    `
      select
        acl.grantee::int as grantee,
        coalesce(r.rolname, 'PUBLIC') as grantee_name,
        acl.privilege_type,
        acl.is_grantable
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      left join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl on true
      left join pg_roles r on r.oid = acl.grantee
      where n.nspname = 'public'
        and c.relname = 'assignment_personnel'
      order by grantee_name, acl.privilege_type
    `,
  );
  const expectedRows = Object.entries(ASSIGNMENT_PERSONNEL_EXPECTED_TABLE_PRIVILEGES).flatMap(
    ([roleName, privileges]) =>
      ASSIGNMENT_PERSONNEL_TABLE_PRIVILEGES.map((privilegeName) => ({
        role_name: roleName,
        privilege_name: privilegeName,
        expected: privileges[privilegeName],
      })),
  );
  const rows = await client.query(
    `
      with expected(role_name, privilege_name, expected) as (
        select role_name, privilege_name, expected
        from jsonb_to_recordset($1::jsonb) as x(role_name text, privilege_name text, expected boolean)
      )
      select
        role_name,
        privilege_name,
        expected,
        has_table_privilege(role_name::name, 'public.assignment_personnel', privilege_name) as actual
      from expected
      order by role_name, privilege_name
    `,
    [JSON.stringify(expectedRows)],
  );

  const publicPrivileges = acl.rows
    .filter((row) => row.grantee === 0)
    .map((row) => row.privilege_type);
  const privileges = {};
  for (const row of rows.rows) {
    privileges[row.role_name] ??= {};
    privileges[row.role_name][row.privilege_name] = row.actual;
  }

  return {
    publicPrivileges,
    privileges,
    aclRows: acl.rows,
    expectedPrivilegeRows: rows.rows,
  };
}

function assertAssignmentPersonnelTableAclLeastPrivilege(snapshot) {
  assert(snapshot.publicPrivileges.length === 0, "PUBLIC has assignment_personnel table privileges.", {
    publicPrivileges: snapshot.publicPrivileges,
  });

  for (const row of snapshot.expectedPrivilegeRows) {
    assert(row.actual === row.expected, "Unexpected assignment_personnel table privilege.", row);
  }
}

async function applySqlMigration(client, relativePath) {
  const migration = await readFile(join(repoRoot, relativePath), "utf8");
  await client.query(migration);
}

async function historicalBroadAclDriftIsCleanedByPhaseBMigrations(client) {
  await client.query("GRANT ALL ON TABLE public.assignment_personnel TO anon, authenticated, service_role");
  const drift = await readAssignmentPersonnelTableAclSnapshot(client);

  for (const roleName of ["anon", "authenticated", "service_role"]) {
    for (const privilegeName of ASSIGNMENT_PERSONNEL_TABLE_PRIVILEGES) {
      assert(drift.privileges[roleName]?.[privilegeName] === true, "Historical broad ACL drift was not simulated.", {
        roleName,
        privilegeName,
        actual: drift.privileges[roleName]?.[privilegeName],
      });
    }
  }

  await applySqlMigration(client, PHASE_A1_ACL_MIGRATION_PATH);
  await applySqlMigration(client, PHASE_B_ACL_MIGRATION_PATH);
  const cleaned = await readAssignmentPersonnelTableAclSnapshot(client);
  assertAssignmentPersonnelTableAclLeastPrivilege(cleaned);

  return result("rls-assignment-personnel-historical-broad-acl-drift-cleaned-by-phase-b", "passed", {
    migrations: [PHASE_A1_ACL_MIGRATION_PATH, PHASE_B_ACL_MIGRATION_PATH],
    driftPrivileges: drift.privileges,
    cleanedPublicPrivileges: cleaned.publicPrivileges,
    cleanedPrivileges: cleaned.privileges,
  });
}

async function assignmentPersonnelTableAclIsLeastPrivilege(client) {
  const snapshot = await readAssignmentPersonnelTableAclSnapshot(client);
  assertAssignmentPersonnelTableAclLeastPrivilege(snapshot);

  return result("rls-assignment-personnel-table-acl-phase-b-least-privilege", "passed", {
    publicPrivileges: snapshot.publicPrivileges,
    privileges: snapshot.privileges,
    aclRows: snapshot.aclRows,
  });
}

async function ensurePersonnelRlsFixtureRows(client) {
  await client.query(
    `
      insert into public.personnel (id, tenant_id, user_id, code, first_name, last_name, email, is_active, is_available)
      values
        ($1, $2, $3, 'RTA-M001', 'Runtime', 'Multi A', 'multi-a@runtime.fieldgrid.test', true, true),
        ($4, $5, $3, 'RTB-M001', 'Runtime', 'Multi B', 'multi-b@runtime.fieldgrid.test', true, true)
      on conflict (id) do update set
        tenant_id = excluded.tenant_id,
        user_id = excluded.user_id,
        email = excluded.email,
        is_active = excluded.is_active
    `,
    [
      RLS_FIXTURE.personnel.multiA,
      FIXTURE.tenants.a,
      FIXTURE.users.multiTenant,
      RLS_FIXTURE.personnel.multiB,
      FIXTURE.tenants.b,
    ],
  );

  await client.query(
    `
      insert into public.assignment_personnel (id, assignment_id, personnel_id, status, assigned_by)
      values
        ($1, $2, $3, 'assigned', $4),
        ($5, $6, $7, 'assigned', $8),
        ($9, $2, $10, 'assigned', $4),
        ($11, $6, $12, 'assigned', $8)
      on conflict (assignment_id, personnel_id) do update set
        status = excluded.status,
        assigned_by = excluded.assigned_by
    `,
    [
      RLS_FIXTURE.assignmentPersonnel.a,
      FIXTURE.assignments.a,
      FIXTURE.personnel.a,
      FIXTURE.users.tenantAPlanner,
      RLS_FIXTURE.assignmentPersonnel.b,
      FIXTURE.assignments.b,
      FIXTURE.personnel.b,
      FIXTURE.users.tenantBPlanner,
      RLS_FIXTURE.assignmentPersonnel.multiA,
      RLS_FIXTURE.personnel.multiA,
      RLS_FIXTURE.assignmentPersonnel.multiB,
      RLS_FIXTURE.personnel.multiB,
    ],
  );

  await client.query(
    `
      insert into public.assignment_tasks (id, assignment_id, notes, sort_order)
      values
        ($1, $2, 'Runtime task A', 1),
        ($3, $4, 'Runtime task B', 1)
      on conflict (id) do update set notes = excluded.notes
    `,
    [RLS_FIXTURE.tasks.a, FIXTURE.assignments.a, RLS_FIXTURE.tasks.b, FIXTURE.assignments.b],
  );

  await client.query(
    `
      insert into public.assignment_extra_work (id, assignment_id, description, created_by)
      values ($1, $2, 'Runtime extra work A', $3)
      on conflict (id) do update set description = excluded.description
    `,
    [RLS_FIXTURE.extraWork.a, FIXTURE.assignments.a, FIXTURE.users.tenantAPersonnel],
  );

  await client.query(
    `
      insert into public.assignment_photos (id, tenant_id, assignment_id, storage_path, uploaded_by, is_approved)
      values
        ($1, $2, $3, $4, $5, true),
        ($6, $7, $8, $9, $10, true)
      on conflict (id) do update set
        tenant_id = excluded.tenant_id,
        storage_path = excluded.storage_path,
        is_approved = excluded.is_approved
    `,
    [
      RLS_FIXTURE.photos.a,
      FIXTURE.tenants.a,
      FIXTURE.assignments.a,
      `tenant/${FIXTURE.tenants.a}/assignments/${FIXTURE.assignments.a}/extra-work/${RLS_FIXTURE.extraWork.a}/photo-a.jpg`,
      FIXTURE.users.tenantAPersonnel,
      RLS_FIXTURE.photos.b,
      FIXTURE.tenants.b,
      FIXTURE.assignments.b,
      `tenant/${FIXTURE.tenants.b}/assignments/${FIXTURE.assignments.b}/photo-b.jpg`,
      FIXTURE.users.tenantBPersonnel,
    ],
  );

  await client.query(
    `
      insert into public.reports (id, tenant_id, assignment_id, submitted_by, status, content, hours_worked)
      values
        ($1, $2, $3, $4, 'approved', 'Runtime report A', 1),
        ($5, $6, $7, $8, 'approved', 'Runtime report B', 1)
      on conflict (id) do update set status = excluded.status, content = excluded.content
    `,
    [
      RLS_FIXTURE.reports.a,
      FIXTURE.tenants.a,
      FIXTURE.assignments.a,
      FIXTURE.users.tenantAPersonnel,
      RLS_FIXTURE.reports.b,
      FIXTURE.tenants.b,
      FIXTURE.assignments.b,
      FIXTURE.users.tenantBPersonnel,
    ],
  );

  await client.query(
    `
      insert into public.assignment_report_notes (id, assignment_id, body, created_by)
      values ($1, $2, 'Runtime note A', $3)
      on conflict (id) do update set body = excluded.body
    `,
    [RLS_FIXTURE.reportNotes.a, FIXTURE.assignments.a, FIXTURE.users.tenantAPersonnel],
  );

  await client.query(
    `
      insert into public.assignment_report_note_attachments (
        id, tenant_id, note_id, assignment_id, storage_path, file_name, mime_type, file_size, uploaded_by
      )
      values ($1, $2, $3, $4, $5, 'note-a.jpg', 'image/jpeg', 128, $6)
      on conflict (id) do update set storage_path = excluded.storage_path
    `,
    [
      RLS_FIXTURE.reportNoteAttachments.a,
      FIXTURE.tenants.a,
      RLS_FIXTURE.reportNotes.a,
      FIXTURE.assignments.a,
      `tenant/${FIXTURE.tenants.a}/assignments/${FIXTURE.assignments.a}/report-notes/note-a.jpg`,
      FIXTURE.users.tenantAPersonnel,
    ],
  );

  await client.query(
    `
      insert into public.assignment_material_usage (
        id, tenant_id, assignment_id, name, quantity, unit_price, created_by, approval_status
      )
      values ($1, $2, $3, 'Runtime material A', 1, 0, $4, 'pending')
      on conflict (id) do update set name = excluded.name
    `,
    [
      RLS_FIXTURE.materialUsage.a,
      FIXTURE.tenants.a,
      FIXTURE.assignments.a,
      FIXTURE.users.tenantAPersonnel,
    ],
  );
}

async function anonSelectCountIsPermissionDenied(client) {
  await client.query("begin");
  try {
    await client.query("set local role anon");
    await client.query("set local row_security = on");
    await client.query("SELECT count(*) FROM public.assignment_personnel");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    const code = error?.code ?? "unknown";
    assert(code === "42501", "Anon SELECT count must be permission denied, not zero rows.", {
      code,
      message: error instanceof Error ? error.message : String(error),
    });
    return result("rls-anon-assignment-personnel-select-permission-denied", "passed", {
      rejectionCode: code,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  await client.query("rollback").catch(() => {});
  throw new Error("Expected anon SELECT count on assignment_personnel to be permission denied.");
}

async function authenticatedDirectCrudIsRevoked(client) {
  const actor = ACTORS.tenantAPlanner;
  const select = await asAuthenticated(client, actor, claimsFor(actor), async () =>
    expectRejected(() => directSelect(client), ["42501"]),
  );
  const insert = await asAuthenticated(client, actor, claimsFor(actor), async () =>
    expectRejected(() => directInsert(client, FIXTURE.assignments.a, FIXTURE.personnel.a, actor.userId), ["42501"]),
  );
  const update = await asAuthenticated(client, actor, claimsFor(actor), async () =>
    expectRejected(() => directUpdate(client), ["42501"]),
  );
  const deleteResult = await asAuthenticated(client, actor, claimsFor(actor), async () =>
    expectRejected(() => directDelete(client), ["42501"]),
  );

  return result("rls-authenticated-direct-assignment-personnel-crud-revoked", "passed", {
    selectRejectionCode: select.code,
    insertRejectionCode: insert.code,
    updateRejectionCode: update.code,
    deleteRejectionCode: deleteResult.code,
  });
}

async function anonDirectDmlIsRevoked(client) {
  const actor = ACTORS.tenantAPlanner;
  const insert = await asRole(client, "anon", actor, claimsFor(actor), async () =>
    expectRejected(() => directInsert(client, FIXTURE.assignments.a, FIXTURE.personnel.a, actor.userId), ["42501"]),
  );
  const update = await asRole(client, "anon", actor, claimsFor(actor), async () =>
    expectRejected(() => directUpdate(client), ["42501"]),
  );
  const deleteResult = await asRole(client, "anon", actor, claimsFor(actor), async () =>
    expectRejected(() => directDelete(client), ["42501"]),
  );

  return result("rls-anon-direct-assignment-personnel-dml-revoked", "passed", {
    insertRejectionCode: insert.code,
    updateRejectionCode: update.code,
    deleteRejectionCode: deleteResult.code,
  });
}

async function serviceRoleCrudWorksAndTriggerInvariantHolds(client) {
  const actor = ACTORS.tenantAPlanner;
  const sameTenant = await asServiceRole(client, actor, claimsFor(actor), async () => {
    const inserted = await directInsert(client, FIXTURE.assignments.a, FIXTURE.personnel.a, actor.userId);
    assert(inserted.rows.length === 1, "Service-role same-tenant insert was rejected.");
    const linkId = inserted.rows[0].id;
    const selected = await directSelect(client, linkId);
    assert(selected.rows.length === 1, "Service-role same-tenant SELECT did not find inserted link.");
    const updated = await client.query(
      `update public.assignment_personnel set assigned_by = $1 where id = $2 returning id`,
      [actor.userId, linkId],
    );
    assert(updated.rows.length === 1, "Service-role same-tenant UPDATE did not affect inserted link.");
    const deleted = await client.query(
      `delete from public.assignment_personnel where id = $1 returning id`,
      [linkId],
    );
    assert(deleted.rows.length === 1, "Service-role same-tenant DELETE did not remove inserted link.");
    return { insert: true, select: true, update: true, delete: true };
  });

  const crossTenantInsert = await asServiceRole(client, actor, claimsFor(actor), async () =>
    expectRejected(() => directInsert(client, FIXTURE.assignments.a, FIXTURE.personnel.b, actor.userId), ["23514"]),
  );

  const crossTenantUpdate = await asServiceRole(client, actor, claimsFor(actor), async () => {
    const inserted = await directInsert(client, FIXTURE.assignments.a, FIXTURE.personnel.a, actor.userId);
    return expectRejected(
      () =>
        client.query(`update public.assignment_personnel set personnel_id = $1 where id = $2`, [
          FIXTURE.personnel.b,
          inserted.rows[0].id,
        ]),
      ["23514"],
    );
  });

  const crossTenantUpsert = await asServiceRole(client, actor, claimsFor(actor), async () =>
    expectRejected(
      () =>
        client.query(
          `
            insert into public.assignment_personnel (assignment_id, personnel_id, status, assigned_by)
            values ($1, $2, 'assigned', $3)
            on conflict (assignment_id, personnel_id)
            do update set status = excluded.status
          `,
          [FIXTURE.assignments.a, FIXTURE.personnel.b, actor.userId],
        ),
      ["23514"],
    ),
  );

  return result("rls-service-role-crud-and-trigger-invariant", "passed", {
    sameTenant,
    crossTenantInsertRejectionCode: crossTenantInsert.code,
    crossTenantUpdateRejectionCode: crossTenantUpdate.code,
    crossTenantUpsertRejectionCode: crossTenantUpsert.code,
  });
}

async function selectIds(client, query, params = []) {
  const rows = await client.query(query, params);
  return rows.rows.map((row) => row.id).sort();
}

async function personnelRlsPoliciesAllowLegitimateData(client) {
  await ensurePersonnelRlsFixtureRows(client);
  const actor = ACTORS.tenantAPersonnel;
  const claims = claimsFor(actor);

  const checks = await asAuthenticated(client, actor, claims, async () => ({
    assignments: await selectIds(client, `select id from public.assignments where id = $1`, [FIXTURE.assignments.a]),
    tasks: await selectIds(client, `select id from public.assignment_tasks where assignment_id = $1`, [FIXTURE.assignments.a]),
    extraWork: await selectIds(client, `select id from public.assignment_extra_work where assignment_id = $1`, [FIXTURE.assignments.a]),
    photos: await selectIds(client, `select id from public.assignment_photos where assignment_id = $1`, [FIXTURE.assignments.a]),
    reports: await selectIds(client, `select id from public.reports where assignment_id = $1`, [FIXTURE.assignments.a]),
    reportNotes: await selectIds(client, `select id from public.assignment_report_notes where assignment_id = $1`, [FIXTURE.assignments.a]),
    reportNoteAttachments: await selectIds(client, `select id from public.assignment_report_note_attachments where assignment_id = $1`, [FIXTURE.assignments.a]),
    materialUsage: await selectIds(client, `select id from public.assignment_material_usage where assignment_id = $1`, [FIXTURE.assignments.a]),
    objects: await selectIds(client, `select id from public.objects where id = $1`, [FIXTURE.objects.a]),
  }));

  nodeAssert.deepEqual(checks.assignments, [FIXTURE.assignments.a]);
  nodeAssert.deepEqual(checks.tasks, [RLS_FIXTURE.tasks.a]);
  nodeAssert.deepEqual(checks.extraWork, [RLS_FIXTURE.extraWork.a]);
  nodeAssert.deepEqual(checks.photos, [RLS_FIXTURE.photos.a]);
  nodeAssert.deepEqual(checks.reports, [RLS_FIXTURE.reports.a]);
  nodeAssert.deepEqual(checks.reportNotes, [RLS_FIXTURE.reportNotes.a]);
  nodeAssert.deepEqual(checks.reportNoteAttachments, [RLS_FIXTURE.reportNoteAttachments.a]);
  nodeAssert.deepEqual(checks.materialUsage, [RLS_FIXTURE.materialUsage.a]);
  nodeAssert.deepEqual(checks.objects, [FIXTURE.objects.a]);

  return result("rls-personnel-policy-mediated-legitimate-data-access", "passed", checks);
}

async function tenantABIsolationAndTenantClaimFailClosed(client) {
  await ensurePersonnelRlsFixtureRows(client);

  const tenantA = await asAuthenticated(client, ACTORS.tenantAPersonnel, claimsFor(ACTORS.tenantAPersonnel), async () =>
    selectIds(client, `select id from public.assignments where id = any($1::uuid[])`, [
      [FIXTURE.assignments.a, FIXTURE.assignments.b],
    ]),
  );
  const tenantB = await asAuthenticated(client, ACTORS.tenantBPersonnel, claimsFor(ACTORS.tenantBPersonnel), async () =>
    selectIds(client, `select id from public.assignments where id = any($1::uuid[])`, [
      [FIXTURE.assignments.a, FIXTURE.assignments.b],
    ]),
  );
  const multiA = await asAuthenticated(client, ACTORS.multiTenantInA, claimsFor(ACTORS.multiTenantInA), async () =>
    selectIds(client, `select id from public.assignments where id = any($1::uuid[])`, [
      [FIXTURE.assignments.a, FIXTURE.assignments.b],
    ]),
  );
  const multiB = await asAuthenticated(client, ACTORS.multiTenantInB, claimsFor(ACTORS.multiTenantInB), async () =>
    selectIds(client, `select id from public.assignments where id = any($1::uuid[])`, [
      [FIXTURE.assignments.a, FIXTURE.assignments.b],
    ]),
  );

  const absent = await asAuthenticated(client, ACTORS.multiTenantInA, claimsFor(ACTORS.multiTenantInA, null), async () =>
    selectIds(client, `select id from public.assignments where id = any($1::uuid[])`, [
      [FIXTURE.assignments.a, FIXTURE.assignments.b],
    ]),
  );
  const malformed = await asAuthenticated(client, ACTORS.multiTenantInA, claimsFor(ACTORS.multiTenantInA, "not-a-uuid"), async () =>
    selectIds(client, `select id from public.assignments where id = any($1::uuid[])`, [
      [FIXTURE.assignments.a, FIXTURE.assignments.b],
    ]),
  );
  const wrong = await asAuthenticated(client, ACTORS.tenantAPersonnel, claimsFor(ACTORS.tenantAPersonnel, FIXTURE.tenants.b), async () =>
    selectIds(client, `select id from public.assignments where id = any($1::uuid[])`, [
      [FIXTURE.assignments.a, FIXTURE.assignments.b],
    ]),
  );

  nodeAssert.deepEqual(tenantA, [FIXTURE.assignments.a]);
  nodeAssert.deepEqual(tenantB, [FIXTURE.assignments.b]);
  nodeAssert.deepEqual(multiA, [FIXTURE.assignments.a]);
  nodeAssert.deepEqual(multiB, [FIXTURE.assignments.b]);
  nodeAssert.deepEqual(absent, []);
  nodeAssert.deepEqual(malformed, []);
  nodeAssert.deepEqual(wrong, []);

  return result("rls-tenant-a-b-isolation-and-selected-tenant-fail-closed", "passed", {
    tenantA,
    tenantB,
    multiA,
    multiB,
    absent,
    malformed,
    wrong,
  });
}

async function customerPortalPoliciesAreNotRegressed(client) {
  await ensurePersonnelRlsFixtureRows(client);
  const actor = ACTORS.tenantACustomer;
  const claims = claimsFor(actor);
  const visible = await asAuthenticated(client, actor, claims, async () => ({
    assignments: await selectIds(client, `select id from public.assignments where id = any($1::uuid[])`, [
      [FIXTURE.assignments.a, FIXTURE.assignments.b],
    ]),
    tasks: await selectIds(client, `select id from public.assignment_tasks where assignment_id = any($1::uuid[])`, [
      [FIXTURE.assignments.a, FIXTURE.assignments.b],
    ]),
    photos: await selectIds(client, `select id from public.assignment_photos where assignment_id = any($1::uuid[])`, [
      [FIXTURE.assignments.a, FIXTURE.assignments.b],
    ]),
    reports: await selectIds(client, `select id from public.reports where assignment_id = any($1::uuid[])`, [
      [FIXTURE.assignments.a, FIXTURE.assignments.b],
    ]),
  }));

  nodeAssert.deepEqual(visible.assignments, [FIXTURE.assignments.a]);
  nodeAssert.deepEqual(visible.tasks, [RLS_FIXTURE.tasks.a]);
  nodeAssert.deepEqual(visible.photos, [RLS_FIXTURE.photos.a]);
  nodeAssert.deepEqual(visible.reports, [RLS_FIXTURE.reports.a]);

  return result("rls-customer-policy-regression-assignments-tasks-photos-reports", "passed", visible);
}

async function legacyGlobalManagementCannotManage(client) {
  const writeRejection = await asAuthenticated(
    client,
    ACTORS.legacyGlobalManagementOnly,
    claimsFor(ACTORS.legacyGlobalManagementOnly),
    async () =>
      expectRejected(
        () => directInsert(client, FIXTURE.assignments.a, FIXTURE.personnel.a, ACTORS.legacyGlobalManagementOnly.userId),
        ["42501"],
      ),
  );
  return result("rls-legacy-global-management-without-tenant-role-denied", "passed", {
    directWriteRejectionCode: writeRejection.code,
  });
}

async function securityDefinerPrivilegesAreMinimal(client) {
  const functions = [
    {
      signature: "public.trg_assignment_personnel_tenant_guard()",
      expectedAuthenticatedExecute: false,
      expectedServiceRoleExecute: false,
    },
    {
      signature: "public.personnel_assigned_to_assignment(uuid)",
      expectedAuthenticatedExecute: true,
      expectedServiceRoleExecute: false,
    },
  ];
  const privileges = {};
  for (const { signature, expectedAuthenticatedExecute, expectedServiceRoleExecute } of functions) {
    const row = await client.query(
      `
        select
          coalesce(bool_or(acl.grantee = 0 and acl.privilege_type = 'EXECUTE'), false) as public_execute,
          has_function_privilege('anon', p.oid, 'execute') as anon_execute,
          has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
          has_function_privilege('service_role', p.oid, 'execute') as service_role_execute,
          p.prosecdef as security_definer,
          p.proconfig as config
        from pg_proc p
        left join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl on true
        where p.oid = $1::regprocedure
        group by p.oid
      `,
      [signature],
    );
    privileges[signature] = row.rows[0];
    assert(row.rows[0]?.public_execute === false, `${signature} is executable by PUBLIC.`);
    assert(row.rows[0]?.anon_execute === false, `${signature} is executable by anon.`);
    assert(row.rows[0]?.authenticated_execute === expectedAuthenticatedExecute, `${signature} authenticated EXECUTE mismatch.`);
    assert(row.rows[0]?.service_role_execute === expectedServiceRoleExecute, `${signature} service_role EXECUTE mismatch.`);
  }

  const phaseBHelpers = await client.query(
    `
      select
        to_regprocedure('public.can_manage_assignment_personnel(uuid, uuid)') is not null as can_manage_exists,
        to_regprocedure('public.can_select_own_assignment_personnel(uuid, uuid)') is not null as can_select_own_exists,
        to_regprocedure('public.assignment_personnel_tenant_match(uuid, uuid)') is not null as tenant_match_exists
    `,
  );
  assert(phaseBHelpers.rows[0]?.can_manage_exists === false, "can_manage_assignment_personnel still exists.");
  assert(phaseBHelpers.rows[0]?.can_select_own_exists === false, "can_select_own_assignment_personnel still exists.");
  assert(phaseBHelpers.rows[0]?.tenant_match_exists === false, "assignment_personnel_tenant_match still exists.");

  const legacyRpc = await client.query(
    `select to_regprocedure('public.pwa_apply_for_assignment(uuid)') is not null as exists`,
  );
  let legacyRpcPrivileges = null;
  if (legacyRpc.rows[0]?.exists === true) {
    const row = await client.query(
      `
        select
          coalesce(bool_or(acl.grantee = 0 and acl.privilege_type = 'EXECUTE'), false) as public_execute,
          has_function_privilege('anon', p.oid, 'execute') as anon_execute,
          has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute
        from pg_proc p
        left join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl on true
        where p.oid = 'public.pwa_apply_for_assignment(uuid)'::regprocedure
        group by p.oid
      `,
    );
    legacyRpcPrivileges = row.rows[0];
    assert(row.rows[0]?.public_execute === false, "Legacy pwa_apply_for_assignment RPC is executable by PUBLIC.");
    assert(row.rows[0]?.anon_execute === false, "Legacy pwa_apply_for_assignment RPC is executable by anon.");
    assert(row.rows[0]?.authenticated_execute === false, "Legacy pwa_apply_for_assignment RPC is executable by authenticated.");
  }

  return result("rls-security-definer-execute-privileges-minimal", "passed", {
    privileges,
    removedHelpers: phaseBHelpers.rows[0],
    legacyRpcPrivileges,
  });
}

async function databaseDependencyAudit(client) {
  const functions = await client.query(
    `
      SELECT
        n.nspname,
        p.proname,
        pg_get_function_identity_arguments(p.oid) as arguments,
        p.prosecdef,
        p.proconfig
      FROM pg_proc p
      JOIN pg_namespace n
        ON n.oid = p.pronamespace
      WHERE pg_get_functiondef(p.oid) ILIKE '%assignment_personnel%'
      ORDER BY n.nspname, p.proname, arguments
    `,
  );
  const policies = await client.query(
    `
      SELECT
        schemaname,
        tablename,
        policyname,
        cmd,
        roles,
        qual,
        with_check
      FROM pg_policies
      WHERE coalesce(qual, '') ILIKE '%assignment_personnel%'
         OR coalesce(with_check, '') ILIKE '%assignment_personnel%'
         OR coalesce(qual, '') ILIKE '%personnel_assigned_to_assignment%'
         OR coalesce(with_check, '') ILIKE '%personnel_assigned_to_assignment%'
      ORDER BY tablename, policyname
    `,
  );

  const invokerAssignmentPersonnelReaders = functions.rows.filter(
    (row) => row.prosecdef === false && row.proname !== "fieldgrid_storage_assignment_id_from_path",
  );
  assert(
    invokerAssignmentPersonnelReaders.length === 0,
    "SECURITY INVOKER functions still read assignment_personnel.",
    { invokerAssignmentPersonnelReaders },
  );

  return result("rls-database-function-policy-dependency-audit", "passed", {
    functions: functions.rows,
    policies: policies.rows,
  });
}

async function runChecks() {
  const client = await connect();
  try {
    return [
      await historicalBroadAclDriftIsCleanedByPhaseBMigrations(client),
      await assignmentPersonnelTableAclIsLeastPrivilege(client),
      await anonSelectCountIsPermissionDenied(client),
      await authenticatedDirectCrudIsRevoked(client),
      await anonDirectDmlIsRevoked(client),
      await serviceRoleCrudWorksAndTriggerInvariantHolds(client),
      await personnelRlsPoliciesAllowLegitimateData(client),
      await tenantABIsolationAndTenantClaimFailClosed(client),
      await customerPortalPoliciesAreNotRegressed(client),
      await legacyGlobalManagementCannotManage(client),
      await securityDefinerPrivilegesAreMinimal(client),
      await databaseDependencyAudit(client),
    ];
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
    checks.push(result("authenticated-rls-failure", "failed", {
      message: error instanceof Error ? error.message : String(error),
      details: error?.details ?? {},
      code: error?.code,
    }));
    await writeTextArtifact(
      join("logs", "rls-harness-error.log"),
      `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
  }

  await writeJsonArtifact(join("reports", "rls-harness.json"), {
    name: "fieldgrid-runtime-safety-rls-harness",
    status,
    startedAt,
    completedAt: new Date().toISOString(),
    actorModel: {
      authenticatedRole: "phase B denies direct CRUD on assignment_personnel and keeps personnel RLS through a hardened helper",
      rowSecurity: "on",
      claims: ["request.jwt.claim.sub", "request.jwt.claims.tenant_id"],
      directAssignmentPersonnelAccess: "PUBLIC, anon and authenticated have no direct table privileges",
      serviceRole: "direct SELECT/INSERT/UPDATE/DELETE only; no TRUNCATE/REFERENCES/TRIGGER/MAINTAIN",
      excludedEvidence: ["postgres/superuser checks are not RLS evidence", "source regex checks are not runtime proof"],
    },
    checks,
    testLayerClassification: {
      "rls-assignment-personnel-historical-broad-acl-drift-cleaned-by-phase-b": "database ACL drift cleanup",
      "rls-assignment-personnel-table-acl-phase-b-least-privilege": "database ACL inspection",
      "rls-anon-assignment-personnel-select-permission-denied": "database ACL enforcement",
      "rls-authenticated-direct-assignment-personnel-crud-revoked": "authenticated RLS/direct table denial",
      "rls-anon-direct-assignment-personnel-dml-revoked": "database ACL enforcement",
      "rls-service-role-crud-and-trigger-invariant": "service-role/database invariant",
      "rls-personnel-policy-mediated-legitimate-data-access": "authenticated RLS-runtime evidence",
      "rls-tenant-a-b-isolation-and-selected-tenant-fail-closed": "authenticated RLS-runtime evidence",
      "rls-customer-policy-regression-assignments-tasks-photos-reports": "customer RLS-runtime evidence",
      "rls-legacy-global-management-without-tenant-role-denied": "authenticated RLS",
      "rls-security-definer-execute-privileges-minimal": "database function ACL invariant",
      "rls-database-function-policy-dependency-audit": "database dependency audit",
    },
    limitations: [
      "Uses local PostgreSQL 17 and GUC-backed auth.uid()/auth.jwt() Supabase shims.",
      "Does not prove Supabase GoTrue, JWT signing infrastructure, or live project role configuration.",
      "Selected tenant enforcement is proven for direct RLS/PostgREST only when a tenant_id claim is present; normal app personnel reads are server-side.",
    ],
  });

  if (status !== "passed") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
