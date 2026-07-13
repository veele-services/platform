#!/usr/bin/env node
import { join } from "node:path";
import {
  FIXTURE,
  assert,
  connect,
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
  tenantBPersonnel: {
    userId: FIXTURE.users.tenantBPersonnel,
    email: "personnel@tenant-b.runtime.fieldgrid.test",
    tenantId: FIXTURE.tenants.b,
  },
  tenantAPersonnel: {
    userId: FIXTURE.users.tenantAPersonnel,
    email: "personnel@tenant-a.runtime.fieldgrid.test",
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
    SELECT: true,
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
      insert into assignment_personnel (assignment_id, personnel_id, status, assigned_by)
      values ($1, $2, 'assigned', $3)
      returning id
    `,
    [assignmentId, personnelId, assignedBy],
  );
}

function directSelect(client, linkId = "00000000-0000-4000-8000-000000000000") {
  return client.query(`select id from assignment_personnel where id = $1`, [linkId]);
}

function directUpdate(client, linkId = "00000000-0000-4000-8000-000000000000") {
  return client.query(
    `update assignment_personnel set status = 'assigned' where id = $1`,
    [linkId],
  );
}

function directDelete(client, linkId = "00000000-0000-4000-8000-000000000000") {
  return client.query(`delete from assignment_personnel where id = $1`, [linkId]);
}

async function createSameTenantAssignmentPersonnelLinkAsServiceRole(client) {
  const actor = ACTORS.tenantAPlanner;
  await client.query("begin");
  try {
    await setLocalRoleContext(client, "service_role", actor, claimsFor(actor));
    await client.query(
      `
        delete from public.assignment_personnel
        where assignment_id = $1
          and personnel_id = $2
      `,
      [FIXTURE.assignments.a, FIXTURE.personnel.a],
    );
    const link = await directInsert(client, FIXTURE.assignments.a, FIXTURE.personnel.a, actor.userId);
    await client.query("commit");
    assert(link.rows.length === 1, "Service-role same-tenant assignment_personnel link was not created.");
    return link.rows[0].id;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }
}

async function deleteAssignmentPersonnelLinkAsServiceRole(client, linkId) {
  const actor = ACTORS.tenantAPlanner;
  await client.query("begin");
  try {
    await setLocalRoleContext(client, "service_role", actor, claimsFor(actor));
    await client.query(`delete from public.assignment_personnel where id = $1`, [linkId]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }
}

async function assignmentPersonnelTableAclIsLeastPrivilege(client) {
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
  const publicPrivileges = acl.rows
    .filter((row) => row.grantee === 0)
    .map((row) => row.privilege_type);
  assert(publicPrivileges.length === 0, "PUBLIC has assignment_personnel table privileges.", {
    publicPrivileges,
  });

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

  const privileges = {};
  for (const row of rows.rows) {
    privileges[row.role_name] ??= {};
    privileges[row.role_name][row.privilege_name] = row.actual;
    assert(row.actual === row.expected, "Unexpected assignment_personnel table privilege.", row);
  }

  return result("rls-assignment-personnel-table-acl-least-privilege", "passed", {
    publicPrivileges,
    privileges,
    aclRows: acl.rows,
  });
}

async function authenticatedOwnSelectRollbackCompatibility(client) {
  let linkId = null;
  try {
    linkId = await createSameTenantAssignmentPersonnelLinkAsServiceRole(client);
    const selected = await asAuthenticated(
      client,
      ACTORS.tenantAPersonnel,
      claimsFor(ACTORS.tenantAPersonnel),
      async () => directSelect(client, linkId),
    );
    assert(selected.rows.length === 1, "Authenticated personnel user cannot SELECT their own assignment_personnel link.");
    assert(selected.rows[0]?.id === linkId, "Authenticated personnel SELECT returned the wrong assignment_personnel link.");

    return result("rls-authenticated-own-select-rollback-compatibility", "passed", {
      createdBy: "service_role",
      selectedBy: "authenticated personnel user",
      linkVisible: true,
      note: "Temporary Phase-A rollback compatibility only; cross-tenant SELECT closure remains Phase B.",
    });
  } finally {
    if (linkId) await deleteAssignmentPersonnelLinkAsServiceRole(client, linkId);
  }
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

async function tenantContextDoesNotOpenDirectDml(client) {
  const actor = ACTORS.tenantAPlanner;
  const outcomes = {
    absent: await asAuthenticated(client, actor, claimsFor(actor, null), async () =>
      expectRejected(() => directInsert(client, FIXTURE.assignments.a, FIXTURE.personnel.a, actor.userId), ["42501"]),
    ),
    malformed: await asAuthenticated(client, actor, claimsFor(actor, "not-a-uuid"), async () =>
      expectRejected(() => directInsert(client, FIXTURE.assignments.a, FIXTURE.personnel.a, actor.userId), ["42501"]),
    ),
    wrong: await asAuthenticated(client, actor, claimsFor(actor, FIXTURE.tenants.b), async () =>
      expectRejected(() => directInsert(client, FIXTURE.assignments.a, FIXTURE.personnel.a, actor.userId), ["42501"]),
    ),
    correct: await asAuthenticated(client, actor, claimsFor(actor, FIXTURE.tenants.a), async () =>
      expectRejected(() => directInsert(client, FIXTURE.assignments.a, FIXTURE.personnel.a, actor.userId), ["42501"]),
    ),
  };

  return result("rls-tenant-context-does-not-open-direct-dml", "passed", outcomes);
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

async function authenticatedDirectDmlIsRevoked(client) {
  const actor = ACTORS.tenantAPlanner;
  const insert = await asAuthenticated(client, actor, claimsFor(actor), async () =>
    expectRejected(
      () => directInsert(client, FIXTURE.assignments.a, FIXTURE.personnel.a, actor.userId),
      ["42501"],
    ),
  );
  const update = await asAuthenticated(client, actor, claimsFor(actor), async () =>
    expectRejected(
      () => directUpdate(client),
      ["42501"],
    ),
  );
  const deleteResult = await asAuthenticated(client, actor, claimsFor(actor), async () =>
    expectRejected(
      () => directDelete(client),
      ["42501"],
    ),
  );

  return result("rls-authenticated-direct-dml-revoked", "passed", {
    insertRejectionCode: insert.code,
    updateRejectionCode: update.code,
    deleteRejectionCode: deleteResult.code,
  });
}

async function anonDirectDmlIsRevoked(client) {
  const actor = ACTORS.tenantAPlanner;
  const insert = await asRole(client, "anon", actor, claimsFor(actor), async () =>
    expectRejected(
      () => directInsert(client, FIXTURE.assignments.a, FIXTURE.personnel.a, actor.userId),
      ["42501"],
    ),
  );
  const update = await asRole(client, "anon", actor, claimsFor(actor), async () =>
    expectRejected(() => directUpdate(client), ["42501"]),
  );
  const deleteResult = await asRole(client, "anon", actor, claimsFor(actor), async () =>
    expectRejected(() => directDelete(client), ["42501"]),
  );

  return result("rls-anon-direct-dml-revoked", "passed", {
    insertRejectionCode: insert.code,
    updateRejectionCode: update.code,
    deleteRejectionCode: deleteResult.code,
  });
}

async function serviceRoleServerCommandAndTriggerInvariant(client) {
  const sameTenant = await asServiceRole(
    client,
    ACTORS.tenantAPlanner,
    claimsFor(ACTORS.tenantAPlanner),
    async () => directInsert(client, FIXTURE.assignments.a, FIXTURE.personnel.a, ACTORS.tenantAPlanner.userId),
  );
  assert(sameTenant.rows.length === 1, "Service-role same-tenant server command was rejected.");

  const mismatch = await asServiceRole(client, ACTORS.tenantAPlanner, claimsFor(ACTORS.tenantAPlanner), async () =>
    expectRejected(
      () => directInsert(client, FIXTURE.assignments.a, FIXTURE.personnel.b, ACTORS.tenantAPlanner.userId),
      ["23514"],
    ),
  );

  return result("rls-service-role-server-command-and-trigger-invariant", "passed", {
    sameTenant: "accepted",
    mismatchRejectionCode: mismatch.code,
  });
}

async function selectedTenantClaimsDoNotOpenDirectDml(client) {
  const tenantAContext = await asAuthenticated(client, ACTORS.multiTenantInA, claimsFor(ACTORS.multiTenantInA), async () =>
    expectRejected(
      () => directInsert(client, FIXTURE.assignments.a, FIXTURE.personnel.a, ACTORS.multiTenantInA.userId),
      ["42501"],
    ),
  );
  const tenantBContext = await asAuthenticated(client, ACTORS.multiTenantInB, claimsFor(ACTORS.multiTenantInB), async () =>
    expectRejected(
      () => directInsert(client, FIXTURE.assignments.b, FIXTURE.personnel.b, ACTORS.multiTenantInB.userId),
      ["42501"],
    ),
  );

  return result("rls-selected-tenant-claim-does-not-open-assignment-personnel-dml", "passed", {
    tenantAContextRejectionCode: tenantAContext.code,
    tenantBContextRejectionCode: tenantBContext.code,
  });
}

async function securityDefinerPrivilegesAreMinimal(client) {
  const functions = [
    "public.trg_assignment_personnel_tenant_guard()",
  ];
  const privileges = {};
  for (const signature of functions) {
    const row = await client.query(
      `
        select
          coalesce(bool_or(acl.grantee = 0 and acl.privilege_type = 'EXECUTE'), false) as public_execute,
          has_function_privilege('anon', p.oid, 'execute') as anon_execute,
          has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
          has_function_privilege('service_role', p.oid, 'execute') as service_role_execute
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
    assert(row.rows[0]?.authenticated_execute === false, `${signature} is executable by authenticated.`);
    assert(typeof row.rows[0]?.service_role_execute === "boolean", `${signature} service_role execute state was not measured.`);
  }

  const phaseBHelpers = await client.query(
    `
      select
        to_regprocedure('public.can_manage_assignment_personnel(uuid, uuid)') is not null as can_manage_exists,
        to_regprocedure('public.can_select_own_assignment_personnel(uuid, uuid)') is not null as can_select_own_exists,
        to_regprocedure('public.assignment_personnel_tenant_match(uuid, uuid)') is not null as tenant_match_exists
    `,
  );
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
    phaseBHelperPresenceOnly: phaseBHelpers.rows[0],
    legacyRpcPrivileges,
  });
}

async function runChecks() {
  const client = await connect();
  try {
    return [
      await assignmentPersonnelTableAclIsLeastPrivilege(client),
      await authenticatedOwnSelectRollbackCompatibility(client),
      await anonSelectCountIsPermissionDenied(client),
      await tenantContextDoesNotOpenDirectDml(client),
      await legacyGlobalManagementCannotManage(client),
      await authenticatedDirectDmlIsRevoked(client),
      await anonDirectDmlIsRevoked(client),
      await serviceRoleServerCommandAndTriggerInvariant(client),
      await selectedTenantClaimsDoNotOpenDirectDml(client),
      await securityDefinerPrivilegesAreMinimal(client),
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
      authenticatedRole: "phase A denies direct DML on assignment_personnel and keeps existing SELECT compatibility for rollback",
      rowSecurity: "on",
      claims: ["request.jwt.claim.sub", "request.jwt.claims.tenant_id"],
      directDml: "revoked for anon/authenticated; writes are server/service-role commands plus database trigger invariant",
      directReads: "authenticated SELECT on own assignment_personnel links is intentionally retained in phase A for app rollback compatibility; anon table SELECT is permission denied",
      excludedEvidence: ["postgres/superuser checks are not RLS evidence", "source regex checks are not runtime proof"],
    },
    checks,
    testLayerClassification: {
      "rls-assignment-personnel-table-acl-least-privilege": "database ACL inspection",
      "rls-authenticated-own-select-rollback-compatibility": "authenticated RLS rollback compatibility",
      "rls-anon-assignment-personnel-select-permission-denied": "database ACL enforcement",
      "rls-tenant-context-does-not-open-direct-dml": "authenticated RLS",
      "rls-legacy-global-management-without-tenant-role-denied": "authenticated RLS",
      "rls-authenticated-direct-dml-revoked": "authenticated RLS",
      "rls-anon-direct-dml-revoked": "authenticated RLS",
      "rls-service-role-server-command-and-trigger-invariant": "service-role/database invariant",
      "rls-selected-tenant-claim-does-not-open-assignment-personnel-dml": "authenticated RLS",
      "rls-security-definer-execute-privileges-minimal": "service-role/database invariant",
    },
    phaseBAcceptanceCriteria: {
      deferredReason: "Staging applies migrations before app activation and may roll back to the previous release, which still reads assignment_personnel directly.",
      safetyBranch: "codex/assignment-personnel-direct-access-close-phase2-prep",
      requiredFollowUp: "Close authenticated assignment_personnel SELECT after phase-A is live on staging.",
      deferredClaims: [
        "authenticated SELECT on assignment_personnel is revoked",
        "PUBLIC, anon, and authenticated direct table access are fully closed",
        "assignment_personnel_management_all is removed",
        "assignment_personnel_tenant_management_all is removed",
        "assignment_personnel_own_select is removed",
        "personnel_read_own_assignment_personnel is removed",
        "can_select_own_assignment_personnel is removed",
      ],
    },
    limitations: [
      "Uses local PostgreSQL 17 and GUC-backed auth.uid()/auth.jwt() Supabase shims.",
      "Does not prove Supabase GoTrue, JWT signing infrastructure, or live project role configuration.",
    ],
  });

  if (status !== "passed") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
