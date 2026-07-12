# Team Assignment Execution Model

Status: architecture and executable domain policy only. This PR intentionally does not implement the production migration or change runtime behavior.

## Problem

Assignments currently carry one global execution status. The same parent row stores `seen_at`, `en_route_at`, `actual_started_at`, `actual_completed_at`, completion reason, notes, and customer signature fields. `assignment_personnel` stores assignment membership with `assigned`, `suggested`, and `declined` style planning states. Personnel PWA actions can therefore move the shared assignment through `seen`, `en_route`, `in_progress`, `completed`, and `not_completed`, even when multiple workers are assigned.

That is unsafe for team assignments because one worker can accidentally complete or fail the whole job while another worker is still en route, active, offline, or replaced. Concurrent offline events can also replay in a different order and overwrite the parent status without preserving each worker's state.

## Decision

Use a new execution table: `assignment_execution_participants`.

Do not extend `assignment_personnel` for execution state. The current link table is still useful for planning, candidate acceptance, and assignment membership. Execution is a different lifecycle with different ownership, event ordering, audit, and completion semantics. Keeping execution separate avoids overloading `assignment_personnel.status` and lets the migration backfill execution rows without changing planner-facing assignment links in the same step.

## Execution Participant State

Each row represents one worker's execution instance for one assignment.

Required columns:

| Column | Purpose |
| --- | --- |
| `id` | Stable participant execution UUID. |
| `tenant_id` | Tenant guard for every lookup and mutation. |
| `assignment_id` | Parent assignment. |
| `assignment_personnel_id` | Source planning link when present. Nullable for imported legacy rows until backfill is complete. |
| `personnel_id` | Personnel profile ID. |
| `actor_user_id` | Last user who moved the participant state. |
| `status` | `assigned`, `acknowledged`, `en_route`, `started`, `completed`, `unable_to_complete`, `withdrawn`, `replaced`. |
| `required` | Whether this participant counts toward the aggregate required crew target. |
| `sequence` | Replacement/order index for display and deterministic conflict handling. |
| `version` | Optimistic concurrency integer, incremented on every accepted state change. |
| `last_event_id` | Last accepted client/server event ID. |
| `last_event_at` | Event time used to reject stale offline replay. |
| `acknowledged_at` | First time the worker opened/acknowledged the job. |
| `en_route_at` | First time this worker marked en route. |
| `started_at` | First time this worker started work. |
| `completed_at` | Worker completion time. |
| `unable_to_complete_at` | Worker unable-to-complete time. |
| `withdrawn_at` | Planner removal time when the worker is removed before or during execution. |
| `replaced_at` | Replacement time when this execution row is superseded. |
| `replaced_by_participant_id` | New execution participant that supersedes this row. |
| `completion_reason` | Required for `unable_to_complete`; optional completion categorization. |
| `completion_notes` | Worker closeout notes for completion or failure. |
| `report_id` | Report owned by this worker's execution row, when submitted. |
| `signature_id` | Customer signature owned by this worker's execution row, when captured. |
| `created_at`, `updated_at` | Standard timestamps. |

Recommended constraints:

- Unique active participant per `(tenant_id, assignment_id, personnel_id)` where `status not in ('withdrawn', 'replaced')`.
- Foreign keys to `assignments`, `assignment_personnel`, `personnel`, reports, and signatures.
- Check constraint requiring `completion_reason` when `status = 'unable_to_complete'`.
- Check constraint requiring terminal timestamps for terminal statuses.
- Tenant-aware indexes on `(tenant_id, assignment_id, status)`, `(tenant_id, personnel_id, status)`, and `(tenant_id, assignment_id, required)`.

## Aggregate Assignment Policy

The parent assignment status becomes a derived aggregate from active required execution participants. Parent status changes must be made by one aggregate policy function, never directly by individual worker actions.

Definitions:

- Active required participant: `required = true` and status is not `withdrawn` or `replaced`.
- Required crew target: `assignments.required_personnel_count`.
- Completed count: active required participants with `status = 'completed'`.
- Unable count: active required participants with `status = 'unable_to_complete'`.

Rules:

| Aggregate status | Rule |
| --- | --- |
| `seen` | At least one active required participant is `acknowledged` or beyond, and no participant is en route, started, completed, or unable. |
| `en_route` | At least one active required participant is `en_route`, and no participant is started, completed, or unable. |
| `in_progress` | At least one active required participant is `started`, `completed`, or `unable_to_complete`, but the completion target is not satisfied and the job is not fully unable. |
| `completed` | Completed active required participants are greater than or equal to `required_personnel_count`. |
| `not_completed` | All active required participants are `unable_to_complete` and completed count is below the required crew target. |

The model intentionally uses "one required worker starts" for `in_progress`. Waiting for all required workers before marking the assignment in progress hides partial crew execution and makes monitoring worse. The completion rule remains stricter: all required crew capacity must either complete, be replaced, or be deliberately reduced by an authorized planner decision.

## Replacement and Removal

Removing a worker after assignment creates a terminal participant state instead of deleting execution history.

- `withdrawn`: worker removed and not replaced.
- `replaced`: worker superseded by a new participant row.
- Replacement rows start at `assigned` with their own `version`, timestamps, report ownership, and signature ownership.
- The old participant remains visible in audit and monitoring timelines.
- A replacement counts toward aggregate rules only after it is active and `required = true`.

## Required Personnel Count Changes

Changing `required_personnel_count` is an explicit aggregate decision, not a side effect of one worker failing or being removed.

- Increasing the count can move a previously complete crew back to an incomplete planning/execution state only before invoicing/report approval locks the assignment.
- Decreasing the count can allow partial crew completion when a planner deliberately accepts a smaller crew.
- Every count change must write audit metadata with previous count, new count, actor, reason, and affected participant IDs.

## No-Show and Partial Crew Handling

No-show is represented as `unable_to_complete` with a reason such as `no_show`, `no_access`, `sick`, `material_missing`, or `other`.

- One no-show on a multi-worker assignment leaves the aggregate `in_progress` with `needsReplacement = true`.
- All required workers unable to complete moves the aggregate to `not_completed`.
- One worker completed and another no-show does not complete a two-person assignment unless a planner reduces `required_personnel_count` or adds/replaces a worker who completes.

## Report and Signature Ownership

Reports and signatures must belong to execution participants, not only to the assignment.

- A worker can submit exactly one report for their participant row.
- Customer signature capture is linked to the participant that captured it.
- Assignment-level report readiness is derived from required participant reports and aggregate completion.
- Backoffice report approval can still approve the assignment-level report package, but it must preserve participant-level submitter ownership.
- Legacy assignment-level signature fields should be treated as compatibility projections after migration.
- Report submission must not move the assignment from `completed` or `not_completed` to `report_submitted` until the report package policy is satisfied. Otherwise the first worker report on a team assignment can prevent remaining workers from submitting.
- Report rejection must restore the aggregate execution state that actually applies. It must not blindly set the assignment back to `completed` when the participant or assignment closeout was `unable_to_complete` / `not_completed`.

Task completion also needs participant attribution. Current assignment tasks have one global `completed_at` / `completed_by` pair. The execution model should either add participant-linked task completion events or a join table for `(assignment_task_id, execution_participant_id)` so one worker's checklist progress does not erase another worker's work.

## Notifications

Notifications should be split by participant event and aggregate event.

- Participant events notify management for worker-specific movement: acknowledged, en route, started, completed, unable, withdrawn, replaced.
- Customer-facing notifications should fire on aggregate transitions, for example first en route, aggregate started, aggregate completed, or aggregate not completed.
- Duplicate offline replay must not re-send notifications. Notification idempotency should use accepted participant event IDs and aggregate transition IDs.
- Recipient selection must include tenant predicates, not only recipient IDs. A malformed caller must not be able to enqueue cross-tenant notifications under the wrong tenant context.

## Concurrency and Offline Replay

Every participant mutation includes:

- `tenant_id`
- `assignment_id`
- `participant_id`
- `actor_user_id`
- `event_id` or `client_mutation_id`
- `expected_version`
- `occurred_at`

The server accepts an event only when:

- the participant row belongs to the same tenant and assignment;
- the actor is allowed to operate that participant;
- the `expected_version` equals the current participant `version`;
- the event is not older than `last_event_at`;
- the event does not regress the participant status;
- the event ID has not already been processed.

Accepted events update one participant row, append audit, recompute the aggregate status, and write aggregate audit only if the aggregate status changed.

All worker execution mutations, including task completion, notes, extra work, material usage, inventory usage, status changes, reports, and signatures, should carry a server-enforced idempotency key. Existing local queue dedupe is a client convenience, not a concurrency boundary.

## Tenant Boundary

Every read and mutation must include `tenant_id` on both parent assignment and execution participant. A worker from another tenant is denied before any parent or participant state changes. Denials are audited with actor tenant, assignment ID, participant ID, event ID, and reason.

## Executable Proof

The policy is encoded in `tests/domain/team-assignment-execution-policy.test.mjs`. It proves:

- concurrent starts by two workers do not overwrite each other;
- one worker can start while another has not arrived;
- one completed worker does not complete a two-person assignment;
- unable-to-complete requires replacement or a deliberate crew target decision;
- replacement preserves the old worker's execution history;
- duplicate offline events are idempotent;
- stale events are denied;
- final aggregate completion waits for the required crew target;
- required crew count changes can intentionally accept partial crew completion;
- another tenant's worker cannot mutate the assignment.
