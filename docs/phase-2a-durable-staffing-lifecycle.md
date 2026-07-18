# Phase 2A — durable staffing lifecycle

## Scope and baseline

This track starts from `edf432b90897bc6203bd5ed3deb106c026b242d6`. It closes the staffing and execution lifecycle only; credential recovery, deployment and unrelated UI work are out of scope.

No `AGENTS.md` files are present in the repository. The architecture ADRs, Phase 2 contracts, assignment schemas, staffing services, execution RPC, realtime migrations, backoffice/personnel surfaces and runtime-safety documentation were reviewed before implementation.

## Before

| Transition | Existing behavior | Risk |
| --- | --- | --- |
| Interested → selected | `selectInterestCandidateCanonically` inserts or reactivates `assignment_personnel` and counts active links | The cancellation branch hard-deletes the link; scheduling rules differ from direct planning |
| Direct assignment | Backoffice actions insert/reactivate a link and separately recompute status | The relationship, status, audit and realtime writes are not one canonical transaction |
| Planboard move | The planboard has a third staffing implementation and can delete or mutate a link while replacing personnel | Execution/report history can be detached or destroyed |
| Unassignment | Assignment detail and planning drawer hard-delete `assignment_personnel` | Participant execution has a restrictive FK, so deletion can fail after Phase 2 or destroy pre-execution audit history |
| Execution | Per-participant execution is canonical and assignment actuals are aggregated | A removed participant is excluded only when it has not started; callers can still try destructive unassignment after start |
| Time display | Shared projections expose planned, actual and effective times | Planboard uses them, but assignment detail and personnel planning still show planned-only ranges in places |
| Realtime | Row triggers emit transaction-bound projection events | Destructive and duplicated staffing paths produce inconsistent payloads and refresh behavior |

Hard-delete callsites found in product code before this track:

- `lib/db/src/interest-selection-staffing.ts` — cancelled interest selection;
- `artifacts/backoffice/src/app/actions/assignments.ts` — assignment-detail removal;
- `artifacts/backoffice/src/app/actions/planning.ts` — personnel-drawer removal;
- `artifacts/backoffice/src/app/actions/planning.ts` — planboard personnel replacement.

Deletes in disposable runtime-safety fixture cleanup are not product lifecycle writes and remain test setup/teardown only.

## Canonical model after this track

`assignment_personnel` keeps one stable canonical relationship per assignment/personnel pair, preserving the previous release's `ON CONFLICT (assignment_id, personnel_id)` contract. `assigned` and `suggested` are the only active states. Every completed unassignment or cancellation state is copied to the append-only `assignment_personnel_lifecycle_history` table before the relationship can be reactivated. Participant execution episodes remain separate rows, so earlier actor, reason, timestamp, execution and audit evidence are never overwritten. Selection, direct planning and planboard replacement call the same transactional database command.

The transition command locks the assignment and all staffing episodes in a stable order, validates tenant parents, checks an optional lifecycle version, enforces capacity, writes actor/reason/timestamps, recomputes active headcount and assignment status, appends audit evidence, and relies on existing row triggers to enqueue realtime projections in the same transaction. Duplicate requests are idempotent.

The existing `plannable` state represents both empty and partially staffed work. When the active count exactly meets required headcount and a planned date exists, the assignment becomes `scheduled`. Extra active personnel are rejected unless a future, explicit overstaffing policy authorizes them.

Unassignment rules:

- before actual start: allowed with a non-empty reason; the stable relationship becomes `unassigned`, an append-only snapshot is recorded, and its unstarted participant execution becomes `removed`;
- after actual start: rejected; use the execution close-out flow so worked time cannot disappear;
- after completion: rejected for the same reason;
- duplicate unassignment: returns the stored result without rewriting timestamps or audit;
- inactive personnel: may still be unassigned by an authorized planner, but cannot be newly assigned;
- concurrent commands: assignment/link row locks plus lifecycle versions serialize the outcome;
- assignment cancellation: allowed with a reason only before any participant starts; active links become `cancelled` and remain historical.

Participant execution remains the source of actual projections: earliest active participant start, and completion only after every required active participant reaches a final outcome. Planned date/time fields are never overwritten. Live presentation uses actual start/completion when present and labels planned values separately for audit.



## Verification contract

The merge gate is manual peer review, as agreed; repository branch protection is intentionally deferred until the GitHub plan is upgraded. The branch must remain unmerged and not ready-for-review until the exact branch head has green typecheck, static/domain tests, PostgreSQL 17 fresh migration, Tenant A/B database and RLS harnesses, previous-release compatibility, generators with no drift, and the real multi-context Playwright journey.

The Phase 2A PostgreSQL integration test covers wrong-tenant rejection, required reasons, optimistic lifecycle versions, duplicate idempotency, unassignment without deletion, append-only lifecycle snapshots, a fresh execution episode on reactivation, previous-release unique-key compatibility, start-time unassignment/cancellation rejection, two required participants, earliest aggregate start, all-required completion, and durable cancellation reasons.
