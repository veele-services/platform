#!/usr/bin/env node
import nodeAssert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import {
  FIXTURE,
  Client,
  assert,
  connect,
  databaseUrl,
  repoRoot,
  result,
  writeJsonArtifact,
  writeTextArtifact,
} from "./fieldgrid-runtime-safety-lib.mjs";

const execFileAsync = promisify(execFile);
const PREVIOUS_RELEASE_SHA = "132e7d0705f0192d6ec4a28195f192850574447d";
const PREVIOUS_RELEASE_MIGRATION_MAX = "20260718180000_complete_credential_recovery.sql";

const ACTOR = {
  userId: FIXTURE.users.tenantAPersonnel,
  email: "personnel@tenant-a.runtime.fieldgrid.test",
  tenantId: FIXTURE.tenants.a,
};

const COMPAT_FIXTURE = {
  assignmentPersonnel: "69000000-0000-4000-8000-000000000001",
  task: "79000000-0000-4000-8000-000000000001",
  photo: "79000000-0000-4000-8000-000000000002",
  report: "79000000-0000-4000-8000-000000000003",
};

function claimsFor(actor, tenantClaim) {
  const claims = {
    sub: actor.userId,
    email: actor.email,
    role: "authenticated",
    aud: "authenticated",
  };
  if (tenantClaim !== undefined) claims.tenant_id = tenantClaim;
  return claims;
}

async function setLocalRoleContext(client, role, actor, claims) {
  await client.query(`set local role ${role}`);
  await client.query("set local row_security = on");
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [actor.userId]);
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
}

async function asAuthenticated(client, actor, claims, callback) {
  await client.query("begin");
  try {
    await setLocalRoleContext(client, "authenticated", actor, claims);
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

async function runRepositoryCommand(command, args, env) {
  return execFileAsync(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    maxBuffer: 1024 * 1024 * 32,
  });
}

async function seedPopulatedPreviousRelease(client) {
  const links = [
    ["69000000-0000-4000-8000-000000000101", FIXTURE.assignments.a, FIXTURE.personnel.a, FIXTURE.users.tenantAPlanner],
    ["69000000-0000-4000-8000-000000000201", FIXTURE.assignments.b, FIXTURE.personnel.b, FIXTURE.users.tenantBPlanner],
  ];
  for (const [id, assignmentId, personnelId, actorId] of links) {
    await client.query(`
      insert into public.assignment_personnel(id, assignment_id, personnel_id, status, assigned_by)
      values ($1, $2, $3, 'assigned', $4)
      on conflict (assignment_id, personnel_id) do update set status = 'assigned'
    `, [id, assignmentId, personnelId, actorId]);
  }
  await client.query(`
    update public.assignment_participant_executions ape
    set participant_status = 'completed',
        en_route_at = '2026-07-21T08:45:00Z',
        actual_started_at = '2026-07-21T09:00:00Z',
        actual_completed_at = '2026-07-21T12:00:00Z',
        completion_outcome = 'completed', version = 4
    where ape.assignment_id in ($1, $2)
  `, [FIXTURE.assignments.a, FIXTURE.assignments.b]);
  await client.query(`
    update public.assignments
    set actual_started_at = '2026-07-21T09:00:00Z',
        actual_completed_at = '2026-07-21T12:00:00Z'
    where id in ($1, $2)
  `, [FIXTURE.assignments.a, FIXTURE.assignments.b]);
  await client.query(`
    insert into public.reports(id, tenant_id, assignment_id, submitted_by,
      assignment_participant_execution_id, assignment_personnel_id, personnel_id,
      visibility_scope, status, content, hours_worked)
    select v.report_id::uuid, a.tenant_id, a.id, v.user_id::uuid,
      ape.id, ape.assignment_personnel_id, ape.personnel_id,
      'customer_approved', 'approved', v.content, 3.00
    from (values
      ('79000000-0000-4000-8000-000000000101', $1::uuid, $3::uuid, 'Tenant A completed report'),
      ('79000000-0000-4000-8000-000000000201', $2::uuid, $4::uuid, 'Tenant B completed report')
    ) v(report_id, assignment_id, user_id, content)
    join public.assignments a on a.id = v.assignment_id
    join public.assignment_participant_executions ape on ape.assignment_id = a.id and ape.participant_status <> 'removed'
    on conflict (id) do nothing
  `, [FIXTURE.assignments.a, FIXTURE.assignments.b, FIXTURE.users.tenantAPersonnel, FIXTURE.users.tenantBPersonnel]);
  await client.query(`select public.portal_realtime_emit($1, 'customer', 'upgrade-a', null, $2, 'assignments', 'assignments', $3::text, 'changed', '{"status":"completed"}'::jsonb)`,
    [FIXTURE.tenants.a, FIXTURE.customers.a, FIXTURE.assignments.a]);
  await client.query(`select public.portal_realtime_emit($1, 'customer', 'upgrade-b', null, $2, 'assignments', 'assignments', $3::text, 'changed', '{"status":"completed"}'::jsonb)`,
    [FIXTURE.tenants.b, FIXTURE.customers.b, FIXTURE.assignments.b]);
  await client.query(`
    insert into public.credential_recovery_challenges(
      id, tenant_id, surface, purpose, subject_user_id, account_lookup_hmac,
      code_hash, request_fingerprint_hmac, redirect_origin, issued_at,
      expires_at, resend_available_at, attempts_remaining, delivery_status
    ) values (
      '89000000-0000-4000-8000-000000000001', $1, 'personnel-portal', 'password-reset', $2,
      decode(repeat('11', 32), 'hex'), decode(repeat('22', 32), 'hex'),
      decode(repeat('33', 32), 'hex'), 'https://personnel.runtime.fieldgrid.test', now(),
      now() + interval '30 minutes', now() - interval '1 minute', 6, 'sent'
    ) on conflict (id) do nothing
  `, [FIXTURE.tenants.a, FIXTURE.users.tenantAPersonnel]);
}

async function databaseContract(client) {
  const functions = await client.query(`
    select p.oid::regprocedure::text as signature,
           coalesce(array_to_string(p.proacl, ','), '') as acl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
    order by 1
  `);
  const policies = await client.query(`
    select schemaname, tablename, policyname, cmd, coalesce(qual, '') as qual,
           coalesce(with_check, '') as with_check
    from pg_policies where schemaname in ('public', 'storage') order by 1,2,3
  `);
  return { functions: functions.rows, policies: policies.rows };
}

async function populatedPreviousReleaseUpgrade() {
  const baseUrl = new URL(databaseUrl());
  const databaseName = `fieldgrid_runtime_safety_upgrade_${process.pid}`;
  const upgradeUrl = new URL(baseUrl);
  upgradeUrl.pathname = `/${databaseName}`;
  const admin = new Client({ connectionString: baseUrl.toString(), ssl: false });
  await admin.connect();
  try {
    await admin.query(`drop database if exists ${databaseName} with (force)`);
    await admin.query(`create database ${databaseName}`);
  } finally {
    await admin.end();
  }

  const env = {
    DATABASE_URL: upgradeUrl.toString(), DB_SSL: "false", PGSSLMODE: "disable",
    FIELDGRID_RUNTIME_SAFETY_ALLOW_RESET: "1",
    FIELDGRID_RUNTIME_SAFETY_RESET_CONFIRM: databaseName,
    FIELDGRID_SQL_MIGRATION_MAX_NAME: PREVIOUS_RELEASE_MIGRATION_MAX,
  };
  let upgradeClient;
  try {
    await runRepositoryCommand("node", ["scripts/fieldgrid-runtime-safety-setup.mjs"], env);
    await runRepositoryCommand("node", ["scripts/fieldgrid-runtime-safety-fixtures.mjs"], env);
    upgradeClient = new Client({ connectionString: upgradeUrl.toString(), ssl: false });
    await upgradeClient.connect();
    await seedPopulatedPreviousRelease(upgradeClient);
    const before = await upgradeClient.query(`
      select
        (select count(*)::int from tenants where id in ($1, $2)) tenants,
        (select count(*)::int from personnel where id in ($3, $4)) personnel,
        (select count(*)::int from assignments where id in ($5, $6)) assignments,
        (select count(*)::int from assignment_personnel where assignment_id in ($5, $6)) staffing,
        (select count(*)::int from assignment_participant_executions where assignment_id in ($5, $6)) executions,
        (select count(*)::int from reports where assignment_id in ($5, $6)) reports,
        (select count(*)::int from portal_realtime_events where realtime_key in ('upgrade-a','upgrade-b')) realtime,
        (select count(*)::int from credential_recovery_challenges where id = '89000000-0000-4000-8000-000000000001') recovery
    `, [FIXTURE.tenants.a, FIXTURE.tenants.b, FIXTURE.personnel.a, FIXTURE.personnel.b, FIXTURE.assignments.a, FIXTURE.assignments.b]);
    await upgradeClient.end();
    upgradeClient = null;

    await runRepositoryCommand("pnpm", ["--filter", "@workspace/db", "run", "db:migrate"], {
      ...env, FIELDGRID_SQL_MIGRATION_MAX_NAME: "",
    });
    upgradeClient = new Client({ connectionString: upgradeUrl.toString(), ssl: false });
    await upgradeClient.connect();
    const after = await upgradeClient.query(`
      select
        (select count(*)::int from tenants where id in ($1, $2)) tenants,
        (select count(*)::int from personnel where id in ($3, $4)) personnel,
        (select count(*)::int from assignments where id in ($5, $6)) assignments,
        (select count(*)::int from assignment_personnel where assignment_id in ($5, $6)) staffing,
        (select count(*)::int from assignment_participant_executions where assignment_id in ($5, $6)) executions,
        (select count(*)::int from reports where assignment_id in ($5, $6)) reports,
        (select count(*)::int from portal_realtime_events where realtime_key in ('upgrade-a','upgrade-b')) realtime,
        (select count(*)::int from credential_recovery_challenges where id = '89000000-0000-4000-8000-000000000001') recovery
    `, [FIXTURE.tenants.a, FIXTURE.tenants.b, FIXTURE.personnel.a, FIXTURE.personnel.b, FIXTURE.assignments.a, FIXTURE.assignments.b]);
    nodeAssert.deepEqual(after.rows[0], before.rows[0]);
    nodeAssert.deepEqual(after.rows[0], { tenants: 2, personnel: 2, assignments: 2, staffing: 2, executions: 2, reports: 2, realtime: 2, recovery: 1 });

    const history = await upgradeClient.query(`
      select assignment_id, participant_status, version, actual_started_at is not null as started,
             actual_completed_at is not null as completed
      from assignment_participant_executions where assignment_id in ($1, $2) order by assignment_id
    `, [FIXTURE.assignments.a, FIXTURE.assignments.b]);
    assert(history.rows.every((row) => row.started && row.completed && Number(row.version) === 4), "Execution history changed during populated upgrade.", { history: history.rows });
    const leaked = await upgradeClient.query(`
      select count(*)::int as count from portal_realtime_events
      where recipient_type = 'customer' and payload::text ~* '(personnel|internal|credential|audit)'
        and realtime_key in ('upgrade-a','upgrade-b')
    `);
    assert(leaked.rows[0]?.count === 0, "Customer realtime payload exposed internal fields after upgrade.", leaked.rows[0]);

    const tenantAVisible = await asAuthenticated(upgradeClient, ACTOR, claimsFor(ACTOR), async () =>
      (await upgradeClient.query(`select id from assignments where id in ($1,$2) order by id`, [FIXTURE.assignments.a, FIXTURE.assignments.b])).rows.map((row) => row.id),
    );
    nodeAssert.deepEqual(tenantAVisible, [FIXTURE.assignments.a]);
    const legacyActor = { userId: FIXTURE.users.legacyGlobalManagementOnly, email: "legacy-management-only@runtime.fieldgrid.test", tenantId: null };
    const legacyVisible = await asAuthenticated(upgradeClient, legacyActor, claimsFor(legacyActor), async () =>
      (await upgradeClient.query(`select id from tenants order by id`)).rows,
    );
    nodeAssert.deepEqual(legacyVisible, []);

    const freshClient = await connect();
    let freshContract;
    try { freshContract = await databaseContract(freshClient); } finally { await freshClient.end(); }
    const upgradedContract = await databaseContract(upgradeClient);
    nodeAssert.deepEqual(upgradedContract, freshContract);

    return result("phase2c-populated-previous-release-upgrade", "passed", {
      previousReleaseMigrationMax: PREVIOUS_RELEASE_MIGRATION_MAX,
      before: before.rows[0], after: after.rows[0], executionHistory: history.rows,
      tenantAVisible, legacyGlobalManagementRows: legacyVisible.length,
      functionCount: upgradedContract.functions.length, policyCount: upgradedContract.policies.length,
    });
  } finally {
    if (upgradeClient) await upgradeClient.end().catch(() => {});
    const cleanup = new Client({ connectionString: baseUrl.toString(), ssl: false });
    await cleanup.connect();
    try { await cleanup.query(`drop database if exists ${databaseName} with (force)`); }
    finally { await cleanup.end(); }
  }
}

async function ensureCompatibilityFixtureRows(client) {
  await client.query(
    `
      insert into public.assignment_personnel (id, assignment_id, personnel_id, status, assigned_by)
      values ($1, $2, $3, 'assigned', $4)
      on conflict (assignment_id, personnel_id) do update set
        status = excluded.status,
        assigned_by = excluded.assigned_by
    `,
    [
      COMPAT_FIXTURE.assignmentPersonnel,
      FIXTURE.assignments.a,
      FIXTURE.personnel.a,
      FIXTURE.users.tenantAPlanner,
    ],
  );

  await client.query(
    `
      insert into public.assignment_tasks (id, assignment_id, notes, sort_order)
      values ($1, $2, 'Previous release compatibility task', 1)
      on conflict (id) do update set notes = excluded.notes
    `,
    [COMPAT_FIXTURE.task, FIXTURE.assignments.a],
  );

  await client.query(
    `
      insert into public.assignment_photos (id, tenant_id, assignment_id, storage_path, uploaded_by, is_approved)
      values ($1, $2, $3, $4, $5, true)
      on conflict (id) do update set
        tenant_id = excluded.tenant_id,
        storage_path = excluded.storage_path,
        is_approved = excluded.is_approved
    `,
    [
      COMPAT_FIXTURE.photo,
      FIXTURE.tenants.a,
      FIXTURE.assignments.a,
      `tenant/${FIXTURE.tenants.a}/assignments/${FIXTURE.assignments.a}/compat/photo.jpg`,
      FIXTURE.users.tenantAPersonnel,
    ],
  );

  await client.query(
    `
      insert into public.reports (id, tenant_id, assignment_id, submitted_by, status, content, hours_worked)
      values ($1, $2, $3, $4, 'approved', 'Previous release compatibility report', 1)
      on conflict (id) do update set status = excluded.status, content = excluded.content
    `,
    [
      COMPAT_FIXTURE.report,
      FIXTURE.tenants.a,
      FIXTURE.assignments.a,
      FIXTURE.users.tenantAPersonnel,
    ],
  );
}

async function gitGrep(pattern) {
  try {
    const { stdout } = await execFileAsync("git", ["grep", "-n", pattern, PREVIOUS_RELEASE_SHA, "--", "."], {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024 * 8,
    });
    return stdout
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    if (error?.code === 1) return [];
    throw error;
  }
}

async function previousReleaseCallsiteAudit() {
  const [assignmentPersonnel, personnelHelper, legacyRpc] = await Promise.all([
    gitGrep("assignment_personnel"),
    gitGrep("personnel_assigned_to_assignment"),
    gitGrep("pwa_apply_for_assignment"),
  ]);

  const runtimeClassification = {
    serverActions: assignmentPersonnel.filter((line) => line.includes("artifacts/personeel-pwa/src/actions/") || line.includes("artifacts/backoffice/src/app/actions/")),
    databasePolicyDependency: personnelHelper.filter((line) => line.includes("lib/db/migrations/")),
    legacyRpc: legacyRpc,
    browserPostgrestDirectAssignmentPersonnel: assignmentPersonnel.filter((line) =>
      /\.from\(["']assignment_personnel["']\)/u.test(line),
    ),
  };
  assert(
    runtimeClassification.browserPostgrestDirectAssignmentPersonnel.length === 0,
    "Previous release contains browser/PostgREST assignment_personnel table callsites.",
    runtimeClassification,
  );

  return result("phase-b-previous-release-callsite-audit", "passed", {
    previousReleaseSha: PREVIOUS_RELEASE_SHA,
    counts: {
      assignmentPersonnel: assignmentPersonnel.length,
      personnelHelper: personnelHelper.length,
      legacyRpc: legacyRpc.length,
    },
    runtimeClassification,
  });
}

async function previousReleaseServerSideQueriesStillWork(client) {
  await ensureCompatibilityFixtureRows(client);
  const assignments = await client.query(
    `
      select a.id
      from public.assignment_personnel ap
      join public.assignments a on a.id = ap.assignment_id
      where ap.personnel_id = $1
        and ap.status = 'assigned'
        and a.tenant_id = $2
        and a.is_active = true
      order by a.id
    `,
    [FIXTURE.personnel.a, FIXTURE.tenants.a],
  );
  const tasks = await client.query(
    `select id from public.assignment_tasks where assignment_id = $1 order by id`,
    [FIXTURE.assignments.a],
  );
  const photos = await client.query(
    `select id from public.assignment_photos where assignment_id = $1 order by id`,
    [FIXTURE.assignments.a],
  );
  const reports = await client.query(
    `select id from public.reports where assignment_id = $1 and submitted_by = $2 order by id`,
    [FIXTURE.assignments.a, FIXTURE.users.tenantAPersonnel],
  );

  assert(assignments.rows.some((row) => row.id === FIXTURE.assignments.a), "Previous release assignment list query returned no assigned Tenant A assignment.");
  assert(tasks.rows.some((row) => row.id === COMPAT_FIXTURE.task), "Previous release task query returned no task.");
  assert(photos.rows.some((row) => row.id === COMPAT_FIXTURE.photo), "Previous release photo query returned no photo.");
  assert(reports.rows.some((row) => row.id === COMPAT_FIXTURE.report), "Previous release report query returned no report.");

  return result("phase-b-previous-release-server-side-database-queries", "passed", {
    assignments: assignments.rows.map((row) => row.id),
    tasks: tasks.rows.map((row) => row.id),
    photos: photos.rows.map((row) => row.id),
    reports: reports.rows.map((row) => row.id),
    note: "These emulate the previous release personnel server-action Drizzle/DATABASE_URL query shape, not browser/PostgREST direct table access.",
  });
}

async function previousReleaseRlsContractStillWorksWithoutTenantClaim(client) {
  await ensureCompatibilityFixtureRows(client);
  const visible = await asAuthenticated(client, ACTOR, claimsFor(ACTOR), async () => ({
    assignments: (await client.query(`select id from public.assignments where id = $1`, [FIXTURE.assignments.a])).rows.map((row) => row.id),
    tasks: (await client.query(`select id from public.assignment_tasks where assignment_id = $1`, [FIXTURE.assignments.a])).rows.map((row) => row.id),
    photos: (await client.query(`select id from public.assignment_photos where assignment_id = $1`, [FIXTURE.assignments.a])).rows.map((row) => row.id),
    reports: (await client.query(`select id from public.reports where assignment_id = $1`, [FIXTURE.assignments.a])).rows.map((row) => row.id),
  }));
  nodeAssert.deepEqual(visible.assignments, [FIXTURE.assignments.a]);
  nodeAssert.ok(visible.tasks.includes(COMPAT_FIXTURE.task), "Previous-release task must remain visible alongside newer same-assignment fixtures.");
  nodeAssert.ok(visible.photos.includes(COMPAT_FIXTURE.photo), "Previous-release photo must remain visible alongside newer same-assignment fixtures.");
  nodeAssert.ok(visible.reports.includes(COMPAT_FIXTURE.report), "Previous-release report must remain visible alongside newer same-assignment fixtures.");

  const directDenied = await asAuthenticated(client, ACTOR, claimsFor(ACTOR), async () =>
    expectRejected(() => client.query(`select id from public.assignment_personnel limit 1`), ["42501"]),
  );

  return result("phase-b-previous-release-rls-contract-without-tenant-claim", "passed", {
    visible,
    directAssignmentPersonnelSelect: directDenied,
    jwtContract: {
      role: "authenticated",
      sub: "present",
      tenant_id: "absent",
    },
  });
}

async function runChecks() {
  const populatedUpgrade = await populatedPreviousReleaseUpgrade();
  const client = await connect();
  try {
    return [
      populatedUpgrade,
      await previousReleaseCallsiteAudit(),
      await previousReleaseServerSideQueriesStillWork(client),
      await previousReleaseRlsContractStillWorksWithoutTenantClaim(client),
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
    checks.push(result("phase-b-previous-release-database-compatibility-failure", "failed", {
      message: error instanceof Error ? error.message : String(error),
      details: error?.details ?? {},
      code: error?.code,
    }));
    await writeTextArtifact(
      join("logs", "previous-release-compatibility-error.log"),
      `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
  }

  await writeJsonArtifact(join("reports", "previous-release-compatibility.json"), {
    name: "phase-b-previous-release-database-compatibility",
    status,
    previousReleaseSha: PREVIOUS_RELEASE_SHA,
    startedAt,
    completedAt: new Date().toISOString(),
    checks,
    classification: "populated previous-release database upgrade and deployment compatibility layer",
    limitations: [
      "Uses local PostgreSQL 17 with auth.uid()/auth.jwt() shims.",
      "A disposable database is migrated only through the previous release, populated with two-tenant execution history, then upgraded through the current migration set.",
      "The callsite audit is static evidence; the populated upgrade, server-side and RLS contract checks are runtime database evidence.",
      "Authenticated RLS compatibility is tested without a tenant_id JWT claim, matching the observed real Fieldgrid personnel session contract.",
      "No live database, live Supabase, staging, production, secrets, deploy or merge are used.",
    ],
  });

  if (status !== "passed") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
