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
  tenantBPlanner: {
    userId: FIXTURE.users.tenantBPlanner,
    email: "planner@tenant-b.runtime.fieldgrid.test",
    tenantId: FIXTURE.tenants.b,
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
};

async function asAuthenticated(client, actor, callback) {
  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    await client.query("set local row_security = on");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [actor.userId]);
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({
        sub: actor.userId,
        email: actor.email,
        role: "authenticated",
        aud: "authenticated",
        tenant_id: actor.tenantId,
      }),
    ]);
    const value = await callback();
    await client.query("rollback");
    return value;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }
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

async function authenticatedTenantAWritesSameTenant(client) {
  const inserted = await asAuthenticated(client, ACTORS.tenantAPlanner, async () =>
    client.query(
      `
        insert into assignment_personnel (assignment_id, personnel_id, status, assigned_by)
        values ($1, $2, 'assigned', $3)
        returning id
      `,
      [FIXTURE.assignments.a, FIXTURE.personnel.a, FIXTURE.users.tenantAPlanner],
    ),
  );

  assert(inserted.rows.length === 1, "Tenant A planner could not create a same-tenant assignment_personnel link.");
  return result("rls-authenticated-tenant-a-same-tenant-write", "passed", {
    actor: "tenantAPlanner",
    assignmentTenant: FIXTURE.tenants.a,
    personnelTenant: FIXTURE.tenants.a,
  });
}

async function authenticatedTenantACannotLinkTenantBPersonnel(client) {
  const policyProbe = await asAuthenticated(client, ACTORS.tenantAPlanner, async () =>
    client.query(`select public.can_manage_assignment_personnel($1, $2) as allowed`, [
      FIXTURE.assignments.a,
      FIXTURE.personnel.b,
    ]),
  );
  assert(policyProbe.rows[0]?.allowed === false, "Tenant A actor was policy-allowed to manage Tenant B personnel.");

  const rejection = await asAuthenticated(client, ACTORS.tenantAPlanner, async () =>
    expectRejected(
      () =>
        client.query(
          `
            insert into assignment_personnel (assignment_id, personnel_id, status, assigned_by)
            values ($1, $2, 'assigned', $3)
          `,
          [FIXTURE.assignments.a, FIXTURE.personnel.b, FIXTURE.users.tenantAPlanner],
        ),
      ["23514", "42501"],
    ),
  );

  return result("rls-authenticated-tenant-a-foreign-personnel-write-denied", "passed", {
    actor: "tenantAPlanner",
    assignmentTenant: FIXTURE.tenants.a,
    foreignPersonnelTenant: FIXTURE.tenants.b,
    policyAllowed: policyProbe.rows[0]?.allowed,
    rejectionCode: rejection.code,
  });
}

async function authenticatedTenantACannotReadTenantBPersonnel(client) {
  const visible = await asAuthenticated(client, ACTORS.tenantAPlanner, async () =>
    client.query(`select count(*)::int as count from personnel where id = $1`, [FIXTURE.personnel.b]),
  );

  assert(visible.rows[0]?.count === 0, "Tenant A actor could read Tenant B personnel through RLS.");
  return result("rls-authenticated-tenant-a-foreign-personnel-read-denied", "passed", {
    actor: "tenantAPlanner",
    foreignPersonnelId: FIXTURE.personnel.b,
  });
}

async function tenantBCannotReadTenantALink(client) {
  await client.query("begin");
  try {
    await client.query(
      `
        insert into assignment_personnel (assignment_id, personnel_id, status, assigned_by)
        values ($1, $2, 'assigned', $3)
      `,
      [FIXTURE.assignments.a, FIXTURE.personnel.a, FIXTURE.users.tenantAPlanner],
    );

    await client.query("set local role authenticated");
    await client.query("set local row_security = on");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [ACTORS.tenantBPlanner.userId]);
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({
        sub: ACTORS.tenantBPlanner.userId,
        email: ACTORS.tenantBPlanner.email,
        role: "authenticated",
        aud: "authenticated",
        tenant_id: ACTORS.tenantBPlanner.tenantId,
      }),
    ]);

    const visible = await client.query(
      `
        select count(*)::int as count
        from assignment_personnel
        where assignment_id = $1
          and personnel_id = $2
      `,
      [FIXTURE.assignments.a, FIXTURE.personnel.a],
    );

    assert(visible.rows[0]?.count === 0, "Tenant B actor could read a Tenant A assignment_personnel link.");
    await client.query("rollback");
    return result("rls-authenticated-tenant-b-tenant-a-link-read-denied", "passed", {
      actor: "tenantBPlanner",
      hiddenAssignmentTenant: FIXTURE.tenants.a,
    });
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }
}

async function updateToForeignPersonnelRejected(client) {
  const rejection = await asAuthenticated(client, ACTORS.tenantAPlanner, async () => {
    const inserted = await client.query(
      `
        insert into assignment_personnel (assignment_id, personnel_id, status, assigned_by)
        values ($1, $2, 'assigned', $3)
        returning id
      `,
      [FIXTURE.assignments.a, FIXTURE.personnel.a, FIXTURE.users.tenantAPlanner],
    );
    return expectRejected(
      () =>
        client.query(
          `update assignment_personnel set personnel_id = $1 where id = $2`,
          [FIXTURE.personnel.b, inserted.rows[0].id],
        ),
      ["23514", "42501"],
    );
  });

  return result("rls-authenticated-update-to-foreign-personnel-denied", "passed", {
    actor: "tenantAPlanner",
    rejectionCode: rejection.code,
  });
}

async function upsertCannotBypassGuard(client) {
  const rejection = await asAuthenticated(client, ACTORS.tenantAPlanner, async () =>
    expectRejected(
      () =>
        client.query(
          `
            insert into assignment_personnel (assignment_id, personnel_id, status, assigned_by)
            values ($1, $2, 'assigned', $3)
            on conflict (assignment_id, personnel_id)
            do update set status = excluded.status
          `,
          [FIXTURE.assignments.a, FIXTURE.personnel.b, FIXTURE.users.tenantAPlanner],
        ),
      ["23514", "42501"],
    ),
  );

  return result("rls-authenticated-upsert-foreign-personnel-denied", "passed", {
    actor: "tenantAPlanner",
    rejectionCode: rejection.code,
  });
}

async function deleteAndReadPoliciesRemainTenantBound(client) {
  const deleted = await asAuthenticated(client, ACTORS.tenantAPlanner, async () => {
    const inserted = await client.query(
      `
        insert into assignment_personnel (assignment_id, personnel_id, status, assigned_by)
        values ($1, $2, 'assigned', $3)
        returning id
      `,
      [FIXTURE.assignments.a, FIXTURE.personnel.a, FIXTURE.users.tenantAPlanner],
    );
    const selected = await client.query(`select id from assignment_personnel where id = $1`, [inserted.rows[0].id]);
    const removed = await client.query(`delete from assignment_personnel where id = $1 returning id`, [inserted.rows[0].id]);
    return { selected, removed };
  });

  assert(deleted.selected.rows.length === 1, "Tenant A planner could not read its same-tenant link.");
  assert(deleted.removed.rows.length === 1, "Tenant A planner could not delete its same-tenant link.");
  return result("rls-authenticated-delete-and-read-policies-tenant-bound", "passed", {
    actor: "tenantAPlanner",
  });
}

async function multiTenantUserHonorsTenantContext(client) {
  const tenantAContext = await asAuthenticated(client, ACTORS.multiTenantInA, async () =>
    client.query(
      `
        select
          public.can_manage_assignment_personnel($1, $2) as can_manage_a,
          public.can_manage_assignment_personnel($3, $4) as can_manage_b
      `,
      [FIXTURE.assignments.a, FIXTURE.personnel.a, FIXTURE.assignments.b, FIXTURE.personnel.b],
    ),
  );
  const tenantBContext = await asAuthenticated(client, ACTORS.multiTenantInB, async () =>
    client.query(
      `
        select
          public.can_manage_assignment_personnel($1, $2) as can_manage_a,
          public.can_manage_assignment_personnel($3, $4) as can_manage_b
      `,
      [FIXTURE.assignments.a, FIXTURE.personnel.a, FIXTURE.assignments.b, FIXTURE.personnel.b],
    ),
  );

  assert(tenantAContext.rows[0]?.can_manage_a === true, "Multi-tenant actor in Tenant A context cannot manage Tenant A.");
  assert(tenantAContext.rows[0]?.can_manage_b === false, "Multi-tenant actor in Tenant A context can manage Tenant B.");
  assert(tenantBContext.rows[0]?.can_manage_a === false, "Multi-tenant actor in Tenant B context can manage Tenant A.");
  assert(tenantBContext.rows[0]?.can_manage_b === true, "Multi-tenant actor in Tenant B context cannot manage Tenant B.");

  return result("rls-authenticated-multi-tenant-context-boundary", "passed", {
    actor: "multiTenant",
    tenantAContext: tenantAContext.rows[0],
    tenantBContext: tenantBContext.rows[0],
  });
}

async function runChecks() {
  const client = await connect();
  try {
    return [
      await authenticatedTenantAWritesSameTenant(client),
      await authenticatedTenantACannotReadTenantBPersonnel(client),
      await authenticatedTenantACannotLinkTenantBPersonnel(client),
      await tenantBCannotReadTenantALink(client),
      await updateToForeignPersonnelRejected(client),
      await upsertCannotBypassGuard(client),
      await deleteAndReadPoliciesRemainTenantBound(client),
      await multiTenantUserHonorsTenantContext(client),
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
      role: "authenticated",
      rowSecurity: "on",
      claims: ["request.jwt.claim.sub", "request.jwt.claims.tenant_id"],
      excludedActors: ["postgres", "service_role", "superuser"],
    },
    checks,
    testLayerClassification: Object.fromEntries(
      checks.map((check) => [check.name, "authenticated RLS"]),
    ),
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
