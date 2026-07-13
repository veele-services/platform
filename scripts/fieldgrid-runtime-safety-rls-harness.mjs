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

async function asRole(client, role, actor, claims, callback) {
  await client.query("begin");
  try {
    await client.query(`set local role ${role}`);
    await client.query("set local row_security = on");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [actor.userId]);
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
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

async function tenantContextIsFailClosed(client) {
  const actor = ACTORS.tenantAPlanner;
  const outcomes = {
    absent: await asAuthenticated(client, actor, claimsFor(actor, null), async () =>
      expectRejected(() => directSelect(client), ["42501"]),
    ),
    malformed: await asAuthenticated(client, actor, claimsFor(actor, "not-a-uuid"), async () =>
      expectRejected(() => directSelect(client), ["42501"]),
    ),
    wrong: await asAuthenticated(client, actor, claimsFor(actor, FIXTURE.tenants.b), async () =>
      expectRejected(() => directSelect(client), ["42501"]),
    ),
    correct: await asAuthenticated(client, actor, claimsFor(actor, FIXTURE.tenants.a), async () =>
      expectRejected(() => directSelect(client), ["42501"]),
    ),
  };

  return result("rls-tenant-context-fail-closed", "passed", outcomes);
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
  const readRejection = await asAuthenticated(
    client,
    ACTORS.legacyGlobalManagementOnly,
    claimsFor(ACTORS.legacyGlobalManagementOnly),
    async () => expectRejected(() => directSelect(client), ["42501"]),
  );

  return result("rls-legacy-global-management-without-tenant-role-denied", "passed", {
    directReadRejectionCode: readRejection.code,
    directWriteRejectionCode: writeRejection.code,
  });
}

async function authenticatedDirectTableAccessIsRevoked(client) {
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

  return result("rls-authenticated-direct-table-access-revoked", "passed", {
    insertRejectionCode: insert.code,
    updateRejectionCode: update.code,
    deleteRejectionCode: deleteResult.code,
  });
}

async function anonDirectTableAccessIsRevoked(client) {
  const actor = ACTORS.tenantAPlanner;
  const insert = await asRole(client, "anon", actor, claimsFor(actor), async () =>
    expectRejected(
      () => directInsert(client, FIXTURE.assignments.a, FIXTURE.personnel.a, actor.userId),
      ["42501"],
    ),
  );
  const select = await asRole(client, "anon", actor, claimsFor(actor), async () =>
    expectRejected(() => directSelect(client), ["42501"]),
  );
  const update = await asRole(client, "anon", actor, claimsFor(actor), async () =>
    expectRejected(() => directUpdate(client), ["42501"]),
  );
  const deleteResult = await asRole(client, "anon", actor, claimsFor(actor), async () =>
    expectRejected(() => directDelete(client), ["42501"]),
  );

  return result("rls-anon-direct-table-access-revoked", "passed", {
    insertRejectionCode: insert.code,
    selectRejectionCode: select.code,
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

async function authenticatedDirectSelectIsRevoked(client) {
  const inserted = await client.query(
    `
      insert into assignment_personnel (assignment_id, personnel_id, status, assigned_by)
      values ($1, $2, 'assigned', $3)
      on conflict (assignment_id, personnel_id)
      do update set status = excluded.status
      returning id
    `,
    [FIXTURE.assignments.a, FIXTURE.personnel.a, FIXTURE.users.tenantAPlanner],
  );

  try {
    const ownRejection = await asAuthenticated(
      client,
      ACTORS.tenantAPersonnel,
      claimsFor(ACTORS.tenantAPersonnel, null),
      async () => expectRejected(() => directSelect(client, inserted.rows[0].id), ["42501"]),
    );
    const tenantBRejection = await asAuthenticated(
      client,
      ACTORS.tenantBPersonnel,
      claimsFor(ACTORS.tenantBPersonnel),
      async () => expectRejected(() => directSelect(client, inserted.rows[0].id), ["42501"]),
    );

    return result("rls-authenticated-direct-select-revoked", "passed", {
      ownPersonnelRejectionCode: ownRejection.code,
      tenantBPersonnelRejectionCode: tenantBRejection.code,
    });
  } finally {
    await client.query(`delete from assignment_personnel where id = $1`, [inserted.rows[0].id]).catch(() => {});
  }
}

async function selectedTenantClaimsDoNotOpenDirectTableAccess(client) {
  const tenantAContext = await asAuthenticated(client, ACTORS.multiTenantInA, claimsFor(ACTORS.multiTenantInA), async () =>
    expectRejected(() => directSelect(client), ["42501"]),
  );
  const tenantBContext = await asAuthenticated(client, ACTORS.multiTenantInB, claimsFor(ACTORS.multiTenantInB), async () =>
    expectRejected(() => directSelect(client), ["42501"]),
  );

  return result("rls-selected-tenant-claim-does-not-open-assignment-personnel", "passed", {
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
  }

  const removedHelpers = await client.query(
    `
      select
        to_regprocedure('public.can_manage_assignment_personnel(uuid, uuid)') is null as can_manage_absent,
        to_regprocedure('public.can_select_own_assignment_personnel(uuid, uuid)') is null as can_select_own_absent,
        to_regprocedure('public.assignment_personnel_tenant_match(uuid, uuid)') is null as tenant_match_absent
    `,
  );
  assert(removedHelpers.rows[0]?.can_manage_absent === true, "Server-only management helper still exists.");
  assert(removedHelpers.rows[0]?.can_select_own_absent === true, "Own SELECT helper still exists.");
  assert(removedHelpers.rows[0]?.tenant_match_absent === true, "Unused tenant-match helper still exists.");

  const anonRejection = await asRole(client, "anon", ACTORS.tenantAPlanner, claimsFor(ACTORS.tenantAPlanner), async () =>
    expectRejected(
      () => client.query(`select public.can_manage_assignment_personnel($1, $2)`, [
        FIXTURE.assignments.a,
        FIXTURE.personnel.a,
      ]),
      ["42883"],
    ),
  );
  const authenticatedRejection = await asAuthenticated(client, ACTORS.tenantAPlanner, claimsFor(ACTORS.tenantAPlanner), async () =>
    expectRejected(
      () => client.query(`select public.can_manage_assignment_personnel($1, $2)`, [
        FIXTURE.assignments.a,
        FIXTURE.personnel.a,
      ]),
      ["42883"],
    ),
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
    removedHelpers: removedHelpers.rows[0],
    legacyRpcPrivileges,
    anonRejectionCode: anonRejection.code,
    authenticatedCanManageRejectionCode: authenticatedRejection.code,
  });
}

async function runChecks() {
  const client = await connect();
  try {
    return [
      await tenantContextIsFailClosed(client),
      await legacyGlobalManagementCannotManage(client),
      await authenticatedDirectTableAccessIsRevoked(client),
      await anonDirectTableAccessIsRevoked(client),
      await serviceRoleServerCommandAndTriggerInvariant(client),
      await authenticatedDirectSelectIsRevoked(client),
      await selectedTenantClaimsDoNotOpenDirectTableAccess(client),
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
      authenticatedRole: "no direct SELECT/DML on assignment_personnel",
      rowSecurity: "on",
      claims: ["request.jwt.claim.sub", "request.jwt.claims.tenant_id"],
      directDml: "revoked for anon/authenticated; writes are server/service-role commands plus database trigger invariant",
      directReads: "revoked for anon/authenticated; reads are host/server-action scoped",
      excludedEvidence: ["postgres/superuser checks are not RLS evidence", "source regex checks are not runtime proof"],
    },
    checks,
    testLayerClassification: {
      "rls-tenant-context-fail-closed": "authenticated RLS",
      "rls-legacy-global-management-without-tenant-role-denied": "authenticated RLS",
      "rls-authenticated-direct-table-access-revoked": "authenticated RLS",
      "rls-anon-direct-table-access-revoked": "authenticated RLS",
      "rls-service-role-server-command-and-trigger-invariant": "service-role/database invariant",
      "rls-authenticated-direct-select-revoked": "authenticated RLS",
      "rls-selected-tenant-claim-does-not-open-assignment-personnel": "authenticated RLS",
      "rls-security-definer-execute-privileges-minimal": "service-role/database invariant",
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
