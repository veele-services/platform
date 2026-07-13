#!/usr/bin/env node
import nodeAssert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
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

const execFileAsync = promisify(execFile);
const PREVIOUS_RELEASE_SHA = "132e7d0705f0192d6ec4a28195f192850574447d";

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

async function previousReleaseRlsContractStillWorksWithSelectedTenant(client) {
  await ensureCompatibilityFixtureRows(client);
  const visible = await asAuthenticated(client, ACTOR, claimsFor(ACTOR), async () => ({
    assignments: (await client.query(`select id from public.assignments where id = $1`, [FIXTURE.assignments.a])).rows.map((row) => row.id),
    tasks: (await client.query(`select id from public.assignment_tasks where assignment_id = $1`, [FIXTURE.assignments.a])).rows.map((row) => row.id),
    photos: (await client.query(`select id from public.assignment_photos where assignment_id = $1`, [FIXTURE.assignments.a])).rows.map((row) => row.id),
    reports: (await client.query(`select id from public.reports where assignment_id = $1`, [FIXTURE.assignments.a])).rows.map((row) => row.id),
  }));
  nodeAssert.deepEqual(visible.assignments, [FIXTURE.assignments.a]);
  nodeAssert.deepEqual(visible.tasks, [COMPAT_FIXTURE.task]);
  nodeAssert.deepEqual(visible.photos, [COMPAT_FIXTURE.photo]);
  nodeAssert.deepEqual(visible.reports, [COMPAT_FIXTURE.report]);

  const directDenied = await asAuthenticated(client, ACTOR, claimsFor(ACTOR), async () =>
    expectRejected(() => client.query(`select id from public.assignment_personnel limit 1`), ["42501"]),
  );

  return result("phase-b-previous-release-rls-contract-with-selected-tenant", "passed", {
    visible,
    directAssignmentPersonnelSelect: directDenied,
  });
}

async function runChecks() {
  const client = await connect();
  try {
    return [
      await previousReleaseCallsiteAudit(),
      await previousReleaseServerSideQueriesStillWork(client),
      await previousReleaseRlsContractStillWorksWithSelectedTenant(client),
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
    classification: "deployment compatibility layer",
    limitations: [
      "Uses local PostgreSQL 17 with auth.uid()/auth.jwt() shims.",
      "The callsite audit is static evidence; the server-side and RLS contract checks are runtime database evidence.",
      "No live database, live Supabase, staging, production, secrets, deploy or merge are used.",
    ],
  });

  if (status !== "passed") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
