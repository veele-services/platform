#!/usr/bin/env node
import assert from 'node:assert/strict';
import { FIXTURE, connect, databaseUrl, writeJsonArtifact } from './fieldgrid-runtime-safety-lib.mjs';

const parsedDatabase = new URL(databaseUrl());
assert.ok(['127.0.0.1', 'localhost', '::1', 'postgres'].includes(parsedDatabase.hostname));

const { saveWeeklyAvailability, selectInterestCandidateCanonically } = await import('../lib/db/src/index.ts');
const { pool } = await import('../lib/db/src/connection.ts');

const secondUser = '20000000-0000-4000-8000-000000000107';
const secondPersonnel = '60000000-0000-4000-8000-000000000107';
const roundId = '72000000-0000-4000-8000-000000000001';
const firstResponse = '72000000-0000-4000-8000-000000000002';
const secondResponse = '72000000-0000-4000-8000-000000000003';
const assignment = FIXTURE.assignments.a;
const tenantA = FIXTURE.tenants.a;
const tenantB = FIXTURE.tenants.b;
const personnelA = FIXTURE.personnel.a;
const actor = FIXTURE.users.tenantAPlanner;
const startedAt = new Date().toISOString();
const journeys: Array<Record<string, unknown>> = [];

async function journey(id: string, assertions: string[], run: () => Promise<Record<string, unknown>>) {
  const journeyStartedAt = new Date().toISOString();
  try {
    const observations = await run();
    journeys.push({ journeyId: id, status: 'passed', startedAt: journeyStartedAt, finishedAt: new Date().toISOString(), assertions, observations, failure: null });
  } catch (error) {
    journeys.push({
      journeyId: id,
      status: 'failed',
      startedAt: journeyStartedAt,
      finishedAt: new Date().toISOString(),
      assertions,
      observations: {},
      failure: { message: error instanceof Error ? error.message : String(error), code: (error as { code?: string })?.code ?? null },
    });
  }
}

async function resetAssignment(client: Awaited<ReturnType<typeof connect>>) {
  await client.query('delete from public.assignment_interest_responses where assignment_id = $1', [assignment]);
  await client.query('delete from public.assignment_interest_rounds where assignment_id = $1', [assignment]);
  await client.query(`delete from public.assignment_personnel_lifecycle_history where assignment_personnel_id in (select id from public.assignment_personnel where assignment_id = $1)`, [assignment]);
  await client.query(`delete from public.assignment_participant_executions where assignment_id = $1`, [assignment]);
  await client.query('delete from public.assignment_personnel where assignment_id = $1', [assignment]);
  await client.query(
    `update public.assignments set status = 'plannable', required_personnel_count = 2,
       scheduled_date = current_date, scheduled_start = '11:00', scheduled_end = '12:00',
       actual_started_at = null, actual_completed_at = null where id = $1`,
    [assignment],
  );
}

async function ensureSecondPersonnel(client: Awaited<ReturnType<typeof connect>>) {
  await client.query(`insert into auth.users (id, email) values ($1, 'phase2-personnel@tenant-a.runtime.fieldgrid.test') on conflict (id) do nothing`, [secondUser]);
  await client.query(
    `insert into public.personnel (id, tenant_id, user_id, code, first_name, last_name, email, is_active, is_available)
     values ($1, $2, $3, 'RTA-P107', 'Phase2', 'Personnel A', 'phase2-personnel@tenant-a.runtime.fieldgrid.test', true, true)
     on conflict (id) do update set is_active = true, is_available = true`,
    [secondPersonnel, tenantA, secondUser],
  );
}

async function staffing(client: Awaited<ReturnType<typeof connect>>, personnelId: string, action: 'assign' | 'unassign', reason: string | null = null, version: number | null = null) {
  return client.query('select * from public.transition_assignment_staffing($1,$2,$3,$4,$5,$6,$7)', [tenantA, assignment, personnelId, actor, action, reason, version]);
}

async function participant(client: Awaited<ReturnType<typeof connect>>, personnelId: string, userId: string, action: string, key: string) {
  return client.query(`select * from public.execute_assignment_participant_action($1,$2,$3,$4,$5,null,null,'{}'::jsonb)`, [assignment, personnelId, userId, action, key]);
}

async function expectCode(operation: () => Promise<unknown>, code: string) {
  try {
    await operation();
    assert.fail(`Expected PostgreSQL ${code}`);
  } catch (error) {
    assert.equal((error as { code?: string }).code, code);
  }
}

const client = await connect();
try {
  await ensureSecondPersonnel(client);

  await journey('availability', [
    'personnel availability change is persisted',
    'stale availability write fails with a safe conflict',
    'Tenant B availability remains unchanged',
  ], async () => {
    const day = new Date().getDay();
    const beforeB = await client.query(`select count(*)::int as count from public.availability_windows aw join public.personnel p on p.id=aw.personnel_id where p.tenant_id=$1`, [tenantB]);
    const first = await saveWeeklyAvailability({ tenantId: tenantA, userId: FIXTURE.users.tenantAPersonnel, windows: [{ dayOfWeek: day, startTime: '07:00', endTime: '18:00' }] });
    assert.equal(first.ok, true);
    const savedVersion = first.ok ? first.version : '';
    const fresh = await saveWeeklyAvailability({ tenantId: tenantA, userId: FIXTURE.users.tenantAPersonnel, expectedVersion: savedVersion, windows: [{ dayOfWeek: day, startTime: '08:00', endTime: '17:00' }] });
    assert.equal(fresh.ok, true);
    const second = await saveWeeklyAvailability({ tenantId: tenantA, userId: secondUser, windows: [{ dayOfWeek: day, startTime: '08:00', endTime: '17:00' }] });
    assert.equal(second.ok, true);
    const stale = await saveWeeklyAvailability({ tenantId: tenantA, userId: FIXTURE.users.tenantAPersonnel, expectedVersion: savedVersion, windows: [{ dayOfWeek: day, startTime: '09:00', endTime: '16:00' }] });
    assert.deepEqual(stale.ok ? null : stale.code, 'conflict');
    const afterB = await client.query(`select count(*)::int as count from public.availability_windows aw join public.personnel p on p.id=aw.personnel_id where p.tenant_id=$1`, [tenantB]);
    assert.equal(afterB.rows[0].count, beforeB.rows[0].count);
    return { savedVersion: fresh.ok ? fresh.version : null, staleConflict: !stale.ok && stale.code === 'conflict', tenantBRowsUnchanged: true };
  });

  await journey('interest-selection-and-staffing', [
    'accepted interest responses are selected through the canonical service',
    'headcount below threshold stays partially staffed',
    'headcount threshold schedules the assignment',
    'duplicate selection is idempotent',
  ], async () => {
    await resetAssignment(client);
    await client.query(`insert into public.assignment_interest_rounds (id,tenant_id,assignment_id,round_number,status,sent_at) values ($1,$2,$3,1,'sent',now())`, [roundId, tenantA, assignment]);
    await client.query(
      `insert into public.assignment_interest_responses (id,tenant_id,assignment_id,round_id,personnel_id,status,responded_at)
       values ($1,$3,$4,$5,$6,'interested',now()),($2,$3,$4,$5,$7,'interested',now())`,
      [firstResponse, secondResponse, tenantA, assignment, roundId, personnelA, secondPersonnel],
    );
    const selectedOne = await selectInterestCandidateCanonically({ tenantId: tenantA, assignmentId: assignment, personnelId: personnelA, status: 'selected', actorUserId: actor });
    assert.equal(selectedOne.assignedCount, 1);
    assert.equal(selectedOne.assignmentStatus, 'plannable');
    const selectedTwo = await selectInterestCandidateCanonically({ tenantId: tenantA, assignmentId: assignment, personnelId: secondPersonnel, status: 'selected', actorUserId: actor });
    assert.equal(selectedTwo.assignedCount, 2);
    assert.equal(selectedTwo.assignmentStatus, 'scheduled');
    const duplicate = await selectInterestCandidateCanonically({ tenantId: tenantA, assignmentId: assignment, personnelId: secondPersonnel, status: 'selected', actorUserId: actor });
    assert.equal(duplicate.idempotent, true);
    return { firstSelection: selectedOne, finalSelection: selectedTwo, duplicateIdempotent: duplicate.idempotent };
  });

  await journey('durable-unassignment', [
    'pre-start unassignment retains lifecycle history',
    'active staffing count is reduced',
    'actor and reason are persisted',
    'post-start unassignment is denied and execution history remains',
  ], async () => {
    await resetAssignment(client);
    await client.query('update public.assignments set required_personnel_count = 1 where id = $1', [assignment]);
    const assigned = await staffing(client, personnelA, 'assign');
    const linkId = assigned.rows[0].assignment_personnel_id;
    const removed = await staffing(client, personnelA, 'unassign', 'Phase 2D runtime reason', 1);
    assert.equal(Number(removed.rows[0].assigned_count), 0);
    const history = await client.query(`select status,unassigned_by,unassignment_reason from public.assignment_personnel_lifecycle_history where assignment_personnel_id=$1 order by lifecycle_version desc limit 1`, [linkId]);
    assert.deepEqual(history.rows[0], { status: 'unassigned', unassigned_by: actor, unassignment_reason: 'Phase 2D runtime reason' });
    await staffing(client, personnelA, 'assign');
    await client.query('begin');
    await participant(client, personnelA, FIXTURE.users.tenantAPersonnel, 'start', 'phase2d-unassignment-start');
    const retained = await client.query(`select count(*)::int as count from public.assignment_participant_executions where assignment_id=$1 and personnel_id=$2 and actual_started_at is not null`, [assignment, personnelA]);
    assert.equal(retained.rows[0].count, 1);
    await client.query('savepoint phase2d_unassign_denial');
    try {
      await staffing(client, personnelA, 'unassign', 'Too late');
      assert.fail('Expected post-start unassignment denial');
    } catch (error) {
      assert.equal((error as { code?: string }).code, '23514');
      await client.query('rollback to savepoint phase2d_unassign_denial');
    }
    await client.query('rollback');
    return { activeCountAfterUnassignment: 0, history: history.rows[0], postStartDenied: true, executionRowsRetained: retained.rows[0].count };
  });

  await journey('planned-versus-actual-and-multi-person', [
    'planned 11:00–12:00 values remain unchanged',
    'actual start is projected from participant execution',
    'partial completion does not complete the aggregate',
    'all required participants complete the aggregate',
    'duplicate participant action is idempotent',
  ], async () => {
    await resetAssignment(client);
    await staffing(client, personnelA, 'assign');
    await staffing(client, secondPersonnel, 'assign');
    const startOne = await participant(client, personnelA, FIXTURE.users.tenantAPersonnel, 'start', 'phase2d-p1-start');
    const replayStart = await participant(client, personnelA, FIXTURE.users.tenantAPersonnel, 'start', 'phase2d-p1-start');
    assert.equal(replayStart.rows[0].execution_id, startOne.rows[0].execution_id);
    await participant(client, secondPersonnel, secondUser, 'start', 'phase2d-p2-start');
    await participant(client, personnelA, FIXTURE.users.tenantAPersonnel, 'complete', 'phase2d-p1-complete');
    let state = await client.query(`select status,scheduled_start::text,scheduled_end::text,actual_started_at,actual_completed_at from public.assignments where id=$1`, [assignment]);
    assert.equal(state.rows[0].status, 'in_progress');
    assert.equal(state.rows[0].actual_completed_at, null);
    await participant(client, secondPersonnel, secondUser, 'complete', 'phase2d-p2-complete');
    state = await client.query(`select status,scheduled_start::text,scheduled_end::text,actual_started_at,actual_completed_at from public.assignments where id=$1`, [assignment]);
    assert.equal(state.rows[0].status, 'completed');
    assert.match(state.rows[0].scheduled_start, /^11:00/u);
    assert.match(state.rows[0].scheduled_end, /^12:00/u);
    assert.ok(state.rows[0].actual_started_at && state.rows[0].actual_completed_at);
    return { ...state.rows[0], replayIdempotent: true, requiredParticipants: 2 };
  });

  await journey('realtime-projections', [
    'management, personnel and customer projection events are emitted',
    'projection versions are monotonic',
    'customer payload is scrubbed',
    'Tenant B has no matching event',
  ], async () => {
    const correlation = '73000000-0000-4000-8000-000000000001';
    await client.query('begin');
    let events;
    try {
      await client.query(`select set_config('fieldgrid.realtime_correlation_id',$1,true)`, [correlation]);
      await client.query(`select public.portal_realtime_emit_management($1,'phase2d','assignments',$2,'changed',$3::jsonb)`, [tenantA, assignment, JSON.stringify({ assignmentId: assignment, recoveryCode: 'must-be-redacted' })]);
      await client.query(`select public.portal_realtime_emit_personnel($1,'phase2d','assignments',$2,'changed',$3::jsonb)`, [personnelA, assignment, JSON.stringify({ assignmentId: assignment, recoveryCode: 'must-be-redacted' })]);
      await client.query(`select public.portal_realtime_emit_customer($1,'phase2d','assignments',$2,'changed',$3::jsonb)`, [FIXTURE.customers.a, assignment, JSON.stringify({ assignmentId: assignment, recoveryCode: 'must-be-redacted' })]);
      events = await client.query(`select recipient_type,tenant_id,payload,projection_version from public.portal_realtime_events where correlation_id=$1::uuid order by projection_version`, [correlation]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
    assert.deepEqual(events.rows.map((row) => row.recipient_type), ['management', 'personnel', 'customer']);
    assert.ok(events.rows.every((row, index) => index === 0 || Number(row.projection_version) > Number(events.rows[index - 1].projection_version)));
    assert.equal(JSON.stringify(events.rows.find((row) => row.recipient_type === 'customer')?.payload).includes('recoveryCode'), false);
    assert.equal(events.rows.some((row) => row.tenant_id === tenantB), false);
    return { recipients: events.rows.map((row) => row.recipient_type), projectionVersions: events.rows.map((row) => Number(row.projection_version)), customerPayloadScrubbed: true, forbiddenTenantEvents: 0 };
  });
} finally {
  await client.end();
  await pool.end();
}

const status = journeys.every((entry) => entry.status === 'passed') ? 'passed' : 'failed';
const report = {
  schemaVersion: '1.0.0',
  name: 'fieldgrid-phase2d-runtime-journeys',
  status,
  startedAt,
  completedAt: new Date().toISOString(),
  environment: 'disposable-postgresql-17',
  tenantFixtureIds: [tenantA, tenantB],
  journeys,
};
await writeJsonArtifact('reports/phase2d-runtime-journeys.json', report);
console.log(JSON.stringify(report));
if (status !== 'passed') process.exitCode = 1;
