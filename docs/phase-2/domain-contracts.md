# Phase 2 Domain Contracts

Phase 2 defines product-correctness contracts only. Runtime code, migrations, deployments, staging data and production data are out of scope for W00.

## Assignment lifecycle

Canonical internal lifecycle:

1. `draft` — assignment exists but is not ready for planning. Missing customer/object/work details, required personnel count, sector, or planning window keeps the assignment here.
2. `plannable` — assignment has enough validated data to be considered by planning, but has no selected staffing plan.
3. `partially_staffed` — at least one selected participant exists, but selected primary personnel count is below required count.
4. `scheduled` — selected primary personnel count is at least the required personnel count, planned window is valid, and publication rules are satisfied.
5. `in_progress` — at least one primary participant has started actual work and the assignment is not cancelled or completed.
6. `completed` — completion criteria are met for all required primary participants or an authorized planner completes the aggregate with an explicit reason.
7. `cancelled` — assignment is intentionally stopped before completion; cancellation freezes customer-visible progress and requires an auditable reason.

Compatibility mapping for existing equivalent names:

| Existing/internal equivalent | Canonical lifecycle | Notes |
| --- | --- | --- |
| `aanvraag`, `request`, `new` | `draft` | Customer request may remain customer-visible as "received" while internally draft. |
| `approved`, `accepted`, `open`, `ready_for_planning` | `plannable` | Must not imply staffing readiness. |
| `planned`, `assigned`, `ingepland` with insufficient selected primaries | `partially_staffed` | Backfill/read compatibility must compute staffing count before display. |
| `planned`, `assigned`, `published`, `ingepland` with full selected primaries | `scheduled` | Personnel PWA visibility starts only after publication/visibility gate. |
| `started`, `active`, `onderhanden` | `in_progress` | Derived from participant actual start when available. |
| `done`, `finished`, `closed`, `afgerond` | `completed` | Customer-visible completion still waits for report/projection rules where needed. |
| `cancelled`, `geannuleerd`, `rejected` assignment-level | `cancelled` | Participant rejection is not assignment cancellation. |

Generic status override rule: no surface may write an arbitrary assignment status string directly when a domain command exists. Status changes must flow through a lifecycle command that validates the current state, row ownership, tenant scope, staffing counts and expected version. Any zero-row update is a failed command and must surface as an error, not success.

## Time semantics

- `planned_start` and `planned_end` are the planner-approved assignment window. They are required for `scheduled`, immutable by personnel execution actions, and changed only by planning commands.
- `actual_start` and `actual_end` are aggregate assignment facts derived from participant execution unless an authorized planner applies an audited correction.
- Participant actual times are stored per assignment participant and never overwritten by assignment aggregate display logic.
- Effective display window is `actual_start`/`actual_end` when present for execution evidence, otherwise `planned_start`/`planned_end` for planning views. Customer portal may show planned window until work starts, then customer-safe progress labels rather than raw personnel timing unless explicitly approved.
- Aggregate assignment duration is not the sum of participant durations. For elapsed work it is `aggregate_actual_end - aggregate_actual_start`; for labor it is the sum of approved participant work intervals.
- Planned duration is `planned_end - planned_start`; participant planned allocation may be equal to or narrower than the assignment window.

## Staffing semantics

- Required personnel count is the number of primary participants needed before the assignment can be fully staffed.
- Assigned count includes selected primary participants that are not rejected/removed.
- Reserve count includes selected reserve participants and does not satisfy required primary count unless promoted by a staffing command.
- Interest selected means a personnel interest response has been chosen for primary or reserve participation; selection must be idempotent and tenant-scoped.
- Assignment readiness requires a canonical lifecycle of at least `plannable`, valid planned window, required personnel count, eligibility checks, and no blocking availability conflicts.
- Full-staffing transition moves `partially_staffed` to `scheduled` only when selected primary count is greater than or equal to required personnel count and publication rules pass.

## Personnel execution semantics

Participant states:

1. `seen` — participant has been made aware of the assignment or opened it.
2. `accepted` — participant confirms participation when acceptance is required by tenant/workstream policy.
3. `started` — participant begins execution; captures participant `actual_start` and can move assignment aggregate to `in_progress`.
4. `paused` — participant temporarily stops work; pause intervals do not close the assignment.
5. `completed` — participant finishes required work and submits required report/media gates.
6. `rejected` / `removed` — participant is no longer a primary/reserve assignee and does not count toward readiness.

Single-person aggregation mirrors the participant after validation. Multi-person aggregation starts the assignment when the first required primary starts, completes when every required primary is completed or removed with an approved replacement/override, and keeps reserve-only activity out of aggregate actual time unless reserve is promoted.

Offline personnel actions require stable client operation ids. Replay is idempotent by `(tenant_id, assignment_id, participant_id, operation_id)` and must reject stale expected versions with a recoverable conflict state.

## Cross-surface visibility

| Field/event | Backoffice | Planboard | Personnel PWA | Customer portal |
| --- | --- | --- | --- | --- |
| Canonical internal lifecycle | Full | Full planning subset | Work-ready subset only | Customer-safe projection only |
| Planned window | Full | Full | Assigned/published only | Scheduled appointment window |
| Actual participant times | Full when authorized | Aggregated indicators | Own participant times | Hidden by default |
| Staffing counts | Full | Full | Own assignment/team hints only | Hidden |
| Interest responses | Full planning scope | Selection controls | Own response only | Hidden |
| Reports/media | Draft/review/approved | Status indicator | Own submission/edit scope | Approved customer-visible only |
| Quotes/invoices/support | Full authorized modules | Relevant badges only | Hidden unless work instruction | Customer-owned records only |

Internal-only fields include personnel identities beyond customer-approved display, availability reasons, sickness/leave details, eligibility failures, internal notes, raw audit metadata, and unapproved media/report content.

## Event contract

Events are tenant-scoped, versioned, idempotent and publish only the minimum payload needed by subscribers.

- `assignment.updated` — lifecycle, planned window, object/customer reference, or internal planning metadata changed.
- `staffing.changed` — required count, selected primary/reserve participants, interest selection, or readiness changed.
- `execution.started` — participant or aggregate execution started; includes aggregate projection version.
- `execution.completed` — participant or aggregate execution completed; includes report gate state.
- `availability.changed` — availability, leave, sickness or eligibility-relevant calendar state changed.
- `report.approved` — report became approved and may trigger downstream customer projection.
- `customer-visible projection changed` — customer-safe assignment/report/document/quote/invoice/support projection changed.

## Concurrency and idempotency

- Every command carries tenant id, actor id, assignment id, expected version and optional idempotency key.
- Commands must validate row count exactly equals the intended mutation count. Zero-row updates and multi-row surprises fail closed.
- Status, staffing and execution commands must be serializable per assignment or guarded by optimistic version checks.
- Offline replay must be idempotent and preserve original event time separately from server receipt time.
- Customer projections are eventually consistent but must be monotonic by projection version.
