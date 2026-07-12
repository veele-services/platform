# Team Execution Migration Plan

Status: design only. This PR does not create a production migration.

## Goal

Move assignment execution from one shared parent status to per-person execution state while keeping assignment planning, reporting, invoicing, notifications, audit, and offline replay consistent.

## Non-Goals

- Do not implement the production migration in this PR.
- Do not remove `assignment_personnel`.
- Do not change live personnel PWA behavior in this PR.
- Do not deploy, access live services, or use secrets.

## Proposed Schema Migration

Create `assignment_execution_participants`:

```sql
create table assignment_execution_participants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  assignment_id uuid not null references assignments(id) on delete cascade,
  assignment_personnel_id uuid references assignment_personnel(id) on delete set null,
  personnel_id uuid not null references personnel(id) on delete cascade,
  actor_user_id uuid,
  status varchar(40) not null default 'assigned',
  required boolean not null default true,
  sequence integer not null default 0,
  version integer not null default 0,
  last_event_id text,
  last_event_at timestamptz,
  acknowledged_at timestamptz,
  en_route_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  unable_to_complete_at timestamptz,
  withdrawn_at timestamptz,
  replaced_at timestamptz,
  replaced_by_participant_id uuid,
  completion_reason varchar(160),
  completion_notes text,
  report_id uuid,
  signature_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Add indexes:

```sql
create index assignment_execution_participants_assignment_idx
  on assignment_execution_participants (tenant_id, assignment_id);

create index assignment_execution_participants_personnel_idx
  on assignment_execution_participants (tenant_id, personnel_id, status);

create unique index assignment_execution_participants_active_personnel_idx
  on assignment_execution_participants (tenant_id, assignment_id, personnel_id)
  where status not in ('withdrawn', 'replaced');
```

Add check constraints:

- `status in ('assigned', 'acknowledged', 'en_route', 'started', 'completed', 'unable_to_complete', 'withdrawn', 'replaced')`
- `version >= 0`
- `completion_reason is not null when status = 'unable_to_complete'`
- terminal statuses must have their matching terminal timestamp.

Add an event/idempotency table if existing audit infrastructure cannot guarantee uniqueness:

```sql
create table assignment_execution_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  assignment_id uuid not null,
  participant_id uuid not null,
  event_id text not null,
  actor_user_id uuid not null,
  event_type varchar(60) not null,
  occurred_at timestamptz not null,
  accepted_at timestamptz not null default now(),
  aggregate_status_before varchar(50),
  aggregate_status_after varchar(50),
  denial_reason varchar(100),
  unique (tenant_id, event_id)
);
```

## Backfill Strategy

1. Create execution rows for every `assignment_personnel` row with `status = 'assigned'`.
2. Copy tenant and assignment IDs from the parent assignment join, not from user input.
3. For single-person assignments, map existing parent execution timestamps to the sole participant.
4. For multi-person assignments with historical parent timestamps, mark all active required participants with the safest non-terminal inferred state and add an audit note that historical per-person attribution was unavailable.
5. Keep parent assignment status unchanged during backfill.
6. Validate counts before enabling writes:
   - active assigned personnel count equals active execution participant count;
   - every execution row tenant matches its parent assignment tenant;
   - every active participant has one active `(tenant_id, assignment_id, personnel_id)` row.

## Application Cutover

Phase 1: dual-read preparation

- Add domain aggregate policy and query helpers.
- Backoffice shows participant status when execution rows exist and falls back to parent status for legacy assignments.
- Personnel PWA fetches the current worker's participant row.
- Planning write paths must consistently use `required_personnel_count` when deciding whether a crew is full. Smart planning and board display already model team slots; scheduling and direct assign flows must not rely only on distinct required roles.

Phase 2: dual-write guarded rollout

- Personnel PWA status actions write participant events and recompute aggregate status.
- Parent status is updated only by the aggregate policy helper.
- Existing assignment timestamp fields are maintained as compatibility projections:
  - `seen_at`: first participant acknowledged.
  - `en_route_at`: first participant en route.
  - `actual_started_at`: first participant started.
  - `actual_completed_at`: aggregate completion or not-completed time.

Phase 3: report and signature ownership

- Add participant foreign keys to reports/signatures or introduce a signature table if needed.
- Enforce one report per participant row, then derive assignment report package readiness.
- Keep legacy report queries working through assignment-level projections until all surfaces are migrated.
- Add participant-owned task completion history or a task completion join table before enabling team closeout.

Phase 4: enforce-only mode

- Reject direct parent execution status writes from personnel actions.
- Require `tenant_id`, `participant_id`, `expected_version`, and event ID on every worker execution mutation.
- Turn duplicate/stale offline events into audited no-op or denial outcomes.

Phase 5: cleanup

- Remove writes to legacy parent completion/signature fields when all consumers use participant-owned data.
- Keep parent aggregate status because planning, reporting, invoicing, and dashboards still need a fast assignment-level status.

## Integration Notes

Personnel PWA:

- Replace direct `setAssignmentStatus`, `startAssignment`, `completeAssignment`, and `notCompleteAssignment` parent writes with participant event commands.
- Offline queue items must include `participant_id`, `expected_version`, and `event_id`.
- Duplicate events should be idempotent. Stale events should be denied and surfaced for user review.

Backoffice:

- Assignment detail shows crew execution rows.
- Planning can replace or withdraw a participant without deleting execution history.
- Monitoring badges distinguish aggregate assignment status from individual worker state.

Reports and signatures:

- Worker report submission attaches to the participant row.
- Customer signature belongs to the capturing participant.
- Assignment report approval approves the aggregate report package, not an anonymous single assignment report.
- Report submission advances the assignment to `report_submitted` only when all required participant report obligations are satisfied or an authorized lead/closeout-owner policy explicitly allows one report for the team.
- Report rejection restores the derived aggregate execution state, preserving whether the assignment was completed or not completed.

Invoicing:

- Invoice readiness remains assignment-level and should depend on aggregate `report_approved`.
- Material, extra work, and inventory lines should retain participant actor metadata where available.
- Invoice proposal creation, assignment status advance, and audit should run in one transaction during production implementation.
- Add an active unique constraint for `(tenant_id, assignment_id)` invoice/proposal creation where business rules allow only one active financial document, so concurrent report approval or invoice creation cannot double-create.

Notifications:

- Participant notifications are worker-specific.
- Customer notifications fire on aggregate transitions only.
- Event IDs prevent duplicate notifications on offline replay.
- Deterministic notification idempotency keys should include tenant ID, logical mutation ID, event key, aggregate/participant scope, recipient, and channel.
- Recipient lookups must include tenant predicates.

Audit:

- Accepted participant events and denied events are both auditable.
- Aggregate transition audit records previous aggregate status, new aggregate status, participant event ID, and actor.

## Rollback Plan

Before enforcement:

- Disable participant execution writes with a feature flag.
- Keep reading parent assignment status.
- Leave backfilled rows unused but intact.

During dual-write:

- Stop writing participant events.
- Continue using parent assignment status projections.
- Reconcile participant rows from audit before re-enabling.

After enforcement:

- Roll back only by restoring a database snapshot or replaying accepted execution events into parent projections.
- Do not delete participant execution rows during rollback; they are audit evidence.

## Validation Plan

Run before enabling production writes:

- Backfill count validation for every tenant.
- Tenant mismatch validation across assignment, assignment_personnel, and execution participant rows.
- Aggregate recomputation diff against parent assignment status.
- Offline replay tests for duplicate and stale events.
- Cross-tenant denial tests for participant event commands.
- Report/signature ownership tests.

Executable proof in this PR:

```bash
node --test tests/domain/team-assignment-execution-policy.test.mjs
```

The test is intentionally domain-only. It proves the required policy without changing production code or creating migrations.
