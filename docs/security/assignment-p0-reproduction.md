# Assignment P0 Reproduction Evidence

This PR is reproduction-only. It does not repair production behavior and does not add migrations.

The executable evidence lives in `tests/security/assignment-p0-reproduction.test.mjs` and `security/repros/assignments/source-evidence.mjs`. The test reads the real repository source for the exported server actions and DB helpers, classifies each finding, and marks exploit evidence as requiring a real database when persisted row proof is needed.

Current matrix: 22 evidence rows, 17 current-failing exploit rows, 5 fixed or architecture-blocked control rows.

## Classification Summary

| Finding | Status |
| --- | --- |
| P0-A | Reproduced, requires real DB for row-change proof |
| P0-B | Reproduced for the listed bare-ID mutations and reads; selected child controls are fixed/blocked by architecture |
| P0-C | Reproduced, requires real DB for zero-parent-row plus capacity/candidate side-effect proof |
| P0-D | Reproduced for backoffice readiness, interest rounds, and DB helpers; personnel response action is fixed/blocked by architecture |

## P0-A Status Transitions

Current-failing exploit evidence:

- `setAssignmentStatus(id, newStatus, { allowAny: true })` skips `ASSIGNMENT_STATUS_TRANSITIONS` denial and writes the parent status with a `status_override` audit.
- `updateAssignment(id, payload)` accepts `data.status` through `updateAssignmentSchema` without transition validation. Same-tenant illegal transitions change the parent row and trigger capacity recalculation.
- `AssignmentForm` accepts status as a non-empty string and exposes all assignment statuses in the edit dropdown.
- `AssignmentStatusStepper` exposes all process statuses and calls `setAssignmentStatus(..., { allowAny: true })`, providing a first-party path into the bypass.

Fixed or architecture-blocked control:

- `setAssignmentStatus(id, newStatus)` without `allowAny` uses the tenant-scoped parent row and transition matrix, so direct normal illegal transitions should be denied.

Live DB assertions:

- Unauthorized illegal transition call succeeds in current code.
- Parent assignment status changes for same-tenant calls.
- Generic edit also triggers capacity/candidate side effects.
- Audit records success (`status_override` or `update`); no denial audit is emitted.

## P0-B Cross-Tenant IDORs

Current-failing exploit evidence:

- `removePersonnel(assignmentId, linkId)` deletes `assignment_personnel` by `assignmentId` and `linkId` without checking the assignment tenant.
- `approveDirectly(id)` fetches and updates assignments by bare ID.
- `deleteAssignment(id)` fetches and deletes assignments by bare ID; FK cascades affect child rows.
- `listAssignmentsForCustomer`, `listAssignmentsForObject`, and `listAssignmentsForPersonnel` read history by supplied foreign UUID without tenant scope or audit.
- `rescheduleAssignment` and `reshiftAssignment` fetch and update assignments by bare ID.

Fixed or architecture-blocked controls:

- `assignPersonnel`, `addAssignmentTask`, `removeAssignmentTask`, and `applyRouteTimeSuggestion` have parent/context tenant checks before child writes.

Live DB assertions:

- Tenant A actor with the relevant permission can call the vulnerable functions with a known Tenant B UUID.
- Parent row changes for `approveDirectly`, `deleteAssignment`, `rescheduleAssignment`, and `reshiftAssignment`.
- Parent row remains unchanged but child row changes for `removePersonnel`.
- History helpers leak rows but do not mutate.
- Current audit behavior records success or nothing; no cross-tenant denial audit is emitted.

## P0-C Capacity Side Effect

Current-failing exploit evidence:

- `updateAssignment` scopes the parent update to `id AND tenantId`, but does not check affected rows.
- It then unconditionally inserts an `update` audit and calls `calculateAssignmentCapacity(id, { persist: true })`.
- `calculateAssignmentCapacity` loads by bare `assignmentId`, and persistence clears latest checks and upserts candidates by assignment ID.

Live DB assertions:

- Tenant A `updateAssignment(tenantBAssignmentId, validPayload)` returns success in current code.
- Tenant B assignment fields and `updated_at` remain unchanged because zero parent rows were updated.
- Tenant B `assignment_capacity_checks` and/or `assignment_candidates` are inserted or updated.
- Audit records an `update` for the Tenant B resource ID despite no parent mutation; no denial audit is emitted.

## P0-D Interest And Readiness Helpers

Current-failing exploit evidence:

- `getAssignmentPlanningReadiness` loads assignment, links, interest responses, and persisted capacity by bare `assignmentId`.
- `recalculateAssignmentCapacity` calls the tenantless capacity calculator by assignment ID and records a success audit.
- `sendAssignmentInterestPoll` loads assignment by bare ID, recalculates capacity, gets defaults by bare ID, then writes interest rounds/responses under the target assignment tenant.
- `sendAssignmentInterestReminder` loads a round by `roundId + assignmentId`, loads assignment by bare ID, then updates `reminderSentAt`.
- `listAssignmentInterestRounds` reads rounds/responses by bare assignment ID.
- `calculateAssignmentCapacity`, `getLatestAssignmentCapacity`, and `getSmartPlanningRoundDefaults` are tenantless DB helpers.

Fixed or architecture-blocked controls:

- Backoffice `markInterestCandidate` scopes candidate selection through the assignment tenant.
- Personnel PWA `applyForAssignment` and `declineAssignmentInterest` scope responses by logged-in personnel ID and tenant ID.
- Planning board stale-candidate loading is reachable through tenant-scoped assignment IDs, although an extra candidate-table tenant predicate would harden it.

Live DB assertions:

- Tenant A planning actor can trigger Tenant B readiness/capacity/interest side effects by assignment ID.
- Parent row generally remains unchanged.
- Capacity/candidate rows or interest round/response rows change.
- Audit is success-only for poll send; read helpers and capacity helpers do not emit denial audit.

## Rollback

Rollback is code-only: revert the added files under `security/repros/assignments`, `tests/security`, and `docs/security`. No migrations or production behavior changes are included.
