import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const migration = read("lib/db/migrations/20260718120000_durable_staffing_lifecycle.sql");
const assignmentActions = read("artifacts/backoffice/src/app/actions/assignments.ts");
const planningActions = read("artifacts/backoffice/src/app/actions/planning.ts");
const interestStaffing = read("lib/db/src/interest-selection-staffing.ts");
const participantProgress = read("artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/WorkOrderStatusProgress.tsx");
const personnelAssignmentActions = read("artifacts/personeel-pwa/src/actions/assignments.ts");
const planboard = read("artifacts/backoffice/src/components/assignments/PlanningBoardView.tsx");
const browserJourney = read("e2e/fieldgrid/tests/staffing-lifecycle.spec.ts");
const e2eAuth = read("lib/db/src/e2e-auth-adapter.ts");

const dbRequire = createRequire(new URL("../lib/db/package.json", import.meta.url));
const { Client } = dbRequire("pg");

const FIXTURE = {
  tenantA: "10000000-0000-4000-8000-000000000001",
  tenantB: "10000000-0000-4000-8000-000000000002",
  plannerA: "20000000-0000-4000-8000-000000000103",
  personnelUserA: "20000000-0000-4000-8000-000000000104",
  personnelUserA2: "20000000-0000-4000-8000-000000000108",
  personnelA: "60000000-0000-4000-8000-000000000001",
  personnelA2: "60000000-0000-4000-8000-000000000108",
  personnelB: "60000000-0000-4000-8000-000000000002",
  assignmentA: "70000000-0000-4000-8000-000000000001",
};

async function withRollback(run) {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: false });
  await client.connect();
  await client.query("begin");
  try {
    await run(client);
  } finally {
    await client.query("rollback");
    await client.end();
  }
}

async function expectDbError(client, savepoint, operation, code) {
  await client.query("savepoint " + savepoint);
  try {
    await operation();
    assert.fail("Expected PostgreSQL error " + code);
  } catch (error) {
    await client.query("rollback to savepoint " + savepoint);
    assert.equal(error.code, code);
  } finally {
    await client.query("release savepoint " + savepoint);
  }
}

async function staffing(client, personnelId, action, reason = null, expectedVersion = null) {
  return client.query(
    "select * from public.transition_assignment_staffing($1, $2, $3, $4, $5, $6, $7)",
    [FIXTURE.tenantA, FIXTURE.assignmentA, personnelId, FIXTURE.plannerA, action, reason, expectedVersion],
  );
}

async function participantAction(client, personnelId, actorUserId, action, key) {
  return client.query(
    "select * from public.execute_assignment_participant_action($1, $2, $3, $4, $5, null, null, '{}'::jsonb)",
    [FIXTURE.assignmentA, personnelId, actorUserId, action, key],
  );
}

async function resetStaffingLinks(client) {
  await client.query(
    `delete from public.assignment_personnel_lifecycle_history
      where assignment_personnel_id in (
        select id from public.assignment_personnel
         where assignment_id = $1
      )`,
    [FIXTURE.assignmentA],
  );
  await client.query(
    `delete from public.assignment_participant_executions
      where assignment_personnel_id in (
        select id from public.assignment_personnel
         where assignment_id = $1
      )`,
    [FIXTURE.assignmentA],
  );
  await client.query(
    "delete from public.assignment_personnel where assignment_id = $1",
    [FIXTURE.assignmentA],
  );
}

async function insertSecondTenantAPersonnel(client) {
  await client.query(
    "insert into auth.users (id, email) values ($1, 'personnel-2@tenant-a.runtime.fieldgrid.test')",
    [FIXTURE.personnelUserA2],
  );
  await client.query(
    `insert into public.personnel
      (id, tenant_id, user_id, code, first_name, last_name, email, is_active, is_available)
     values ($1, $2, $3, 'RTA-P002', 'Runtime', 'Personnel A2',
       'personnel-2@tenant-a.runtime.fieldgrid.test', true, true)`,
    [FIXTURE.personnelA2, FIXTURE.tenantA, FIXTURE.personnelUserA2],
  );
}

test("Phase 2A product paths use canonical transitions instead of hard-deleting lifecycle rows", () => {
  assert.match(assignmentActions, /transitionAssignmentStaffing\(/u);
  assert.match(assignmentActions, /cancelAssignmentStaffing\(/u);
  assert.match(planningActions, /transitionAssignmentStaffing\(/u);
  assert.match(interestStaffing, /transition_assignment_staffing/u);
  assert.doesNotMatch(assignmentActions, /\.delete\(assignmentPersonnelTable\)/u);
  assert.doesNotMatch(planningActions, /\.delete\(assignmentPersonnelTable\)/u);
  assert.doesNotMatch(interestStaffing, /delete\s+from\s+public\.assignment_personnel/iu);
});

test("Phase 2A migration preserves snapshots, remains previous-release compatible, and restricts public RPC access", () => {
  assert.match(migration, /assignment_personnel_unique_idx[\s\S]*assignment_id, personnel_id/iu);
  assert.match(migration, /assignment_personnel_lifecycle_history/iu);
  assert.match(migration, /unassignment_reason_check/iu);
  assert.match(migration, /cancellation_reason_check/iu);
  assert.match(migration, /on delete restrict/iu);
  assert.match(migration, /set search_path = pg_catalog, public/iu);
  assert.match(migration, /revoke all on function public\.transition_assignment_staffing[\s\S]*from public, anon, authenticated/iu);
  assert.match(migration, /grant execute on function public\.transition_assignment_staffing[\s\S]*to service_role/iu);
});

test("Phase 2A surfaces use participant progression, positioned actual overlays, and a real multi-context journey", () => {
  assert.match(participantProgress, /assignment\.participantStatus \?\? assignment\.status/u);
  assert.match(personnelAssignmentActions, /assigned:\s*\["seen", "en_route", "in_progress"\]/u);
  assert.match(planboard, /unionTimeBlocks\(plannedBlock, actualBlock \?\? effectiveBlock\)/u);
  assert.match(planboard, /relativeTimeBlock\(actualBlock, block\)/u);
  assert.match(browserJourney, /E2E: planning tijdelijk gewijzigd/u);
  assert.match(browserJourney, /goEnRouteAndStart\(participantOne\)/u);
  assert.match(browserJourney, /goEnRouteAndStart\(participantTwo\)/u);
  assert.match(e2eAuth, /20000000-0000-4000-8000-000000000107[\s\S]*phase2-personnel@tenant-a\.runtime\.fieldgrid\.test/u);
  assert.match(browserJourney, /Definitief gereedmelden/u);
  assert.match(browserJourney, /toContainText\(\x27Werkelijk\x27\)/u);
});

test(
  "staffing RPC is tenant-safe, idempotent, versioned, and preserves a lifecycle snapshot",
  { skip: !process.env.DATABASE_URL },
  async () => withRollback(async (client) => {
    await resetStaffingLinks(client);
    await client.query(
      "update public.assignments set status = 'plannable', required_personnel_count = 1, scheduled_date = current_date, scheduled_start = '09:00', scheduled_end = '11:00' where id = $1",
      [FIXTURE.assignmentA],
    );

    await expectDbError(client, "wrong_tenant", () => staffing(client, FIXTURE.personnelB, "assign"), "42501");

    const assigned = await staffing(client, FIXTURE.personnelA, "assign");
    assert.equal(assigned.rows[0].staffing_status, "assigned");
    assert.equal(assigned.rows[0].assignment_status, "scheduled");
    assert.equal(assigned.rows[0].lifecycle_version, "1");
    const firstLinkId = assigned.rows[0].assignment_personnel_id;

    const duplicateAssign = await staffing(client, FIXTURE.personnelA, "assign");
    assert.equal(duplicateAssign.rows[0].idempotent, true);
    assert.equal(duplicateAssign.rows[0].assignment_personnel_id, firstLinkId);

    await expectDbError(client, "blank_reason", () => staffing(client, FIXTURE.personnelA, "unassign", ""), "22023");
    await expectDbError(client, "stale_version", () => staffing(client, FIXTURE.personnelA, "unassign", "Planning gewijzigd", 99), "40001");

    const unassigned = await staffing(client, FIXTURE.personnelA, "unassign", "Planning gewijzigd", 1);
    assert.equal(unassigned.rows[0].staffing_status, "unassigned");
    assert.equal(unassigned.rows[0].assignment_status, "plannable");
    assert.equal(unassigned.rows[0].lifecycle_version, "2");

    const execution = await client.query(
      "select participant_status from public.assignment_participant_executions where assignment_personnel_id = $1",
      [firstLinkId],
    );
    assert.equal(execution.rows[0].participant_status, "removed");

    const duplicateUnassign = await staffing(client, FIXTURE.personnelA, "unassign", "Planning gewijzigd", 2);
    assert.equal(duplicateUnassign.rows[0].idempotent, true);

    const reassigned = await staffing(client, FIXTURE.personnelA, "assign");
    assert.equal(reassigned.rows[0].assignment_personnel_id, firstLinkId);
    assert.equal(reassigned.rows[0].lifecycle_version, "3");
    const currentAndHistory = await client.query(
      `select ap.id, ap.status, ap.lifecycle_version,
              h.status as historical_status, h.lifecycle_version as historical_version,
              h.unassignment_reason
         from public.assignment_personnel ap
         join public.assignment_personnel_lifecycle_history h
           on h.assignment_personnel_id = ap.id
        where ap.assignment_id = $1 and ap.personnel_id = $2`,
      [FIXTURE.assignmentA, FIXTURE.personnelA],
    );
    assert.deepEqual(currentAndHistory.rows[0], {
      id: firstLinkId,
      status: "assigned",
      lifecycle_version: "3",
      historical_status: "unassigned",
      historical_version: "2",
      unassignment_reason: "Planning gewijzigd",
    });
    const executions = await client.query(
      `select participant_status
         from public.assignment_participant_executions
        where assignment_personnel_id = $1
        order by created_at, id`,
      [firstLinkId],
    );
    assert.deepEqual(executions.rows.map((row) => row.participant_status).sort(), ["assigned", "removed"]);
  }),
);

test(
  "multi-person projection uses earliest actual start and completes only after all required participants finish",
  { skip: !process.env.DATABASE_URL },
  async () => withRollback(async (client) => {
    await resetStaffingLinks(client);
    await insertSecondTenantAPersonnel(client);
    await client.query(
      `update public.assignments
          set status = 'plannable', required_personnel_count = 2,
              scheduled_date = current_date, scheduled_start = '08:00', scheduled_end = '12:00',
              actual_started_at = null, actual_completed_at = null
        where id = $1`,
      [FIXTURE.assignmentA],
    );

    await staffing(client, FIXTURE.personnelA, "assign");
    const fullyStaffed = await staffing(client, FIXTURE.personnelA2, "assign");
    assert.equal(fullyStaffed.rows[0].assigned_count, 2);
    assert.equal(fullyStaffed.rows[0].assignment_status, "scheduled");

    await participantAction(client, FIXTURE.personnelA, FIXTURE.personnelUserA, "start", "phase2a-a-start");
    await expectDbError(client, "started_unassign", () => staffing(client, FIXTURE.personnelA, "unassign", "Te laat gewijzigd"), "23514");
    await expectDbError(
      client,
      "started_cancel",
      () => client.query(
        "select * from public.cancel_assignment_staffing($1, $2, $3, $4)",
        [FIXTURE.tenantA, FIXTURE.assignmentA, FIXTURE.plannerA, "Annuleren na start"],
      ),
      "23514",
    );

    await participantAction(client, FIXTURE.personnelA, FIXTURE.personnelUserA, "complete", "phase2a-a-complete");
    let aggregate = await client.query(
      "select status, actual_started_at, actual_completed_at from public.assignments where id = $1",
      [FIXTURE.assignmentA],
    );
    assert.equal(aggregate.rows[0].status, "in_progress");
    assert.equal(aggregate.rows[0].actual_completed_at, null);

    await participantAction(client, FIXTURE.personnelA2, FIXTURE.personnelUserA2, "start", "phase2a-a2-start");
    await participantAction(client, FIXTURE.personnelA2, FIXTURE.personnelUserA2, "complete", "phase2a-a2-complete");
    aggregate = await client.query(
      `select a.status, a.actual_started_at, a.actual_completed_at,
              min(e.actual_started_at) as earliest_start,
              max(e.actual_completed_at) as latest_end
         from public.assignments a
         join public.assignment_participant_executions e on e.assignment_id = a.id
        where a.id = $1 and e.participant_status <> 'removed'
        group by a.id`,
      [FIXTURE.assignmentA],
    );
    assert.equal(aggregate.rows[0].status, "completed");
    assert.deepEqual(aggregate.rows[0].actual_started_at, aggregate.rows[0].earliest_start);
    assert.deepEqual(aggregate.rows[0].actual_completed_at, aggregate.rows[0].latest_end);
  }),
);

test(
  "pre-start cancellation stores assignment and staffing reasons without deleting history",
  { skip: !process.env.DATABASE_URL },
  async () => withRollback(async (client) => {
    await resetStaffingLinks(client);
    await client.query(
      "update public.assignments set status = 'plannable', required_personnel_count = 1, scheduled_date = current_date where id = $1",
      [FIXTURE.assignmentA],
    );
    const assigned = await staffing(client, FIXTURE.personnelA, "assign");
    const cancelled = await client.query(
      "select * from public.cancel_assignment_staffing($1, $2, $3, $4)",
      [FIXTURE.tenantA, FIXTURE.assignmentA, FIXTURE.plannerA, "Klant heeft geannuleerd"],
    );
    assert.equal(cancelled.rows[0].assignment_status, "cancelled");
    assert.equal(cancelled.rows[0].cancelled_links, 1);

    const stored = await client.query(
      `select a.status as assignment_status, a.cancellation_reason,
              ap.status as staffing_status, ap.cancellation_reason as staffing_reason
         from public.assignments a
         join public.assignment_personnel ap on ap.assignment_id = a.id
        where a.id = $1 and ap.id = $2`,
      [FIXTURE.assignmentA, assigned.rows[0].assignment_personnel_id],
    );
    assert.deepEqual(stored.rows[0], {
      assignment_status: "cancelled",
      cancellation_reason: "Klant heeft geannuleerd",
      staffing_status: "cancelled",
      staffing_reason: "Klant heeft geannuleerd",
    });
  }),
);
