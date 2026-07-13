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
  if (tenantClaim !== undefined) claims.tenant_id = tenantClaim;
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

async function canManage(client, actor, tenantClaim, assignmentId, personnelId) {
  return asServiceRole(client, actor, claimsFor(actor, tenantClaim), async () => {
    const probe = await client.query(
      `select public.can_manage_assignment_personnel($1, $2) as allowed`,
      [assignmentId, personnelId],
    );
    return probe.rows[0]?.allowed === true;
  });
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

async function tenantContextIsFailClosed(client) {
  const actor = ACTORS.tenantAPlanner;
  const outcomes = {
    absent: await canManage(client, actor, undefined, FIXTURE.assignments.a, FIXTURE.personnel.a),
    malformed: await canManage(client, actor, "not-a-uuid", FIXTURE.assignments.a, FIXTURE.personnel.a),
    wrong: await canManage(client, actor, FIXTURE.tenants.b, FIXTURE.assignments.a, FIXTURE.personnel.a),
    correct: await canManage(client, actor, FIXTURE.tenants.a, FIXTURE.assignments.a, FIXTURE.personnel.a),
  };

  assert(outcomes.absent === false, "Missing tenant claim was accepted.");
  assert(outcomes.malformed === false, "Malformed tenant claim was accepted.");
  assert(outcomes.wrong === false, "Wrong tenant claim was accepted.");
  assert(outcomes.correct === true, "Correct tenant claim and tenant role were rejected.");

  return result("rls-tenant-context-fail-closed", "passed", outcomes);
}

async function legacyGlobalManagementCannotManage(client) {
  const allowed = await canManage(
    client,
    ACTORS.legacyGlobalManagementOnly,
    FIXTURE.tenants.a,
    FIXTURE.assignments.a,
    FIXTURE.personnel.a,
  );
  assert(allowed === false, "Legacy global Management role was accepted without tenant RBAC.");

  const rejection = await asAuthenticated(
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
    canManage: allowed,
    directWriteRejectionCode: rejection.code,
  });
}

async function authenticatedDirectWritesAreRevoked(client) {
  const actor = ACTORS.tenantAPlanner;
  const sameTenant = await asAuthenticated(client, actor, claimsFor(actor), async () =>
    expectRejected(
      () => directInsert(client, FIXTURE.assignments.a, FIXTURE.personnel.a, actor.userId),
      ["42501"],
    ),
  );
  const foreignTenant = await asAuthenticated(client, actor, claimsFor(actor), async () =>
    expectRejected(
      () => directInsert(client, FIXTURE.assignments.a, FIXTURE.personnel.b, actor.userId),
      ["42501"],
    ),
  );

  return result("rls-authenticated-direct-dml-revoked", "passed", {
    sameTenantRejectionCode: sameTenant.code,
    foreignTenantRejectionCode: foreignTenant.code,
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

async function ownPersonnelSelectRemainsCorrect(client) {
  const inserted = await client.query(
    `
      insert into assignment_personnel (assignment_id, personnel_id, status, assigned_by)
      values ($1, $2, 'assigned', $3)
      returning id
    `,
    [FIXTURE.assignments.a, FIXTURE.personnel.a, FIXTURE.users.tenantAPlanner],
  );

  const ownVisible = await asAuthenticated(
    client,
    ACTORS.tenantAPersonnel,
    claimsFor(ACTORS.tenantAPersonnel, undefined),
    async () => client.query(`select id from assignment_personnel where id = $1`, [inserted.rows[0].id]),
  );
  const tenantBVisible = await asAuthenticated(
    client,
    ACTORS.tenantBPersonnel,
    claimsFor(ACTORS.tenantBPersonnel),
    async () => client.query(`select id from assignment_personnel where id = $1`, [inserted.rows[0].id]),
  );

  assert(ownVisible.rows.length === 1, "Own personnel assignment_personnel SELECT was denied.");
  assert(tenantBVisible.rows.length === 0, "Tenant B personnel could read a Tenant A assignment_personnel link.");

  return result("rls-own-personnel-select-and-cross-tenant-read-denied", "passed", {
    ownRows: ownVisible.rows.length,
    tenantBRows: tenantBVisible.rows.length,
  });
}

async function multiTenantUserHonorsSelectedTenantContext(client) {
  const tenantAContext = {
    canManageA: await canManage(
      client,
      ACTORS.multiTenantInA,
      FIXTURE.tenants.a,
      FIXTURE.assignments.a,
      FIXTURE.personnel.a,
    ),
    canManageB: await canManage(
      client,
      ACTORS.multiTenantInA,
      FIXTURE.tenants.a,
      FIXTURE.assignments.b,
      FIXTURE.personnel.b,
    ),
  };
  const tenantBContext = {
    canManageA: await canManage(
      client,
      ACTORS.multiTenantInB,
      FIXTURE.tenants.b,
      FIXTURE.assignments.a,
      FIXTURE.personnel.a,
    ),
    canManageB: await canManage(
      client,
      ACTORS.multiTenantInB,
      FIXTURE.tenants.b,
      FIXTURE.assignments.b,
      FIXTURE.personnel.b,
    ),
  };

  assert(tenantAContext.canManageA === true, "Multi-tenant actor in Tenant A context cannot manage Tenant A.");
  assert(tenantAContext.canManageB === false, "Multi-tenant actor in Tenant A context can manage Tenant B.");
  assert(tenantBContext.canManageA === false, "Multi-tenant actor in Tenant B context can manage Tenant A.");
  assert(tenantBContext.canManageB === true, "Multi-tenant actor in Tenant B context cannot manage Tenant B.");

  return result("rls-multi-tenant-selected-context-boundary", "passed", {
    tenantAContext,
    tenantBContext,
  });
}

async function securityDefinerPrivilegesAreMinimal(client) {
  const functions = [
    "public.assignment_personnel_tenant_match(uuid, uuid)",
    "public.trg_assignment_personnel_tenant_guard()",
    "public.can_manage_assignment_personnel(uuid, uuid)",
    "public.can_select_own_assignment_personnel(uuid, uuid)",
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
  }

  assert(
    privileges["public.can_select_own_assignment_personnel(uuid, uuid)"]?.authenticated_execute === true,
    "Authenticated cannot execute the helper required by the own SELECT policy.",
  );
  assert(
    privileges["public.can_manage_assignment_personnel(uuid, uuid)"]?.authenticated_execute === false,
    "Authenticated can execute can_manage_assignment_personnel even though direct DML is server-only.",
  );
  assert(
    privileges["public.trg_assignment_personnel_tenant_guard()"]?.authenticated_execute === false,
    "Authenticated can directly execute the trigger function.",
  );

  const anonRejection = await asRole(client, "anon", ACTORS.tenantAPlanner, claimsFor(ACTORS.tenantAPlanner), async () =>
    expectRejected(
      () => client.query(`select public.can_manage_assignment_personnel($1, $2)`, [
        FIXTURE.assignments.a,
        FIXTURE.personnel.a,
      ]),
      ["42501"],
    ),
  );
  const authenticatedRejection = await asAuthenticated(client, ACTORS.tenantAPlanner, claimsFor(ACTORS.tenantAPlanner), async () =>
    expectRejected(
      () => client.query(`select public.can_manage_assignment_personnel($1, $2)`, [
        FIXTURE.assignments.a,
        FIXTURE.personnel.a,
      ]),
      ["42501"],
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
      await authenticatedDirectWritesAreRevoked(client),
      await serviceRoleServerCommandAndTriggerInvariant(client),
      await ownPersonnelSelectRemainsCorrect(client),
      await multiTenantUserHonorsSelectedTenantContext(client),
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
      authenticatedRole: "SELECT-only own personnel assignment links",
      rowSecurity: "on",
      claims: ["request.jwt.claim.sub", "request.jwt.claims.tenant_id"],
      directDml: "revoked for authenticated; writes are server/service-role commands plus database trigger invariant",
      excludedEvidence: ["postgres/superuser checks are not RLS evidence"],
    },
    checks,
    testLayerClassification: {
      "rls-tenant-context-fail-closed": "authenticated RLS",
      "rls-legacy-global-management-without-tenant-role-denied": "authenticated RLS",
      "rls-authenticated-direct-dml-revoked": "authenticated RLS",
      "rls-service-role-server-command-and-trigger-invariant": "service-role/database invariant",
      "rls-own-personnel-select-and-cross-tenant-read-denied": "authenticated RLS",
      "rls-multi-tenant-selected-context-boundary": "authenticated RLS",
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
