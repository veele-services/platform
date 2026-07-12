# Assignment Command Remediation Map

This map documents remediation targets only. This PR does not implement them.

| Finding | Command/helper | Current classification | Expected remediation |
| --- | --- | --- | --- |
| P0-A | `setAssignmentStatus` | Reproduced | Remove public `allowAny` path or gate it behind explicit elevated workflow permission, require reason, and deny illegal transitions by default. |
| P0-A | `updateAssignment` | Reproduced | Remove status from generic edit payload or route it through a transition service. Check affected row count before audit and side effects. |
| P0-A | `AssignmentForm` | Reproduced | Remove status from generic edit form or restrict it to legal next transitions handled by a command endpoint. |
| P0-A | `AssignmentStatusStepper` | Reproduced | Render only legal next transitions for normal writers. Do not call `allowAny` from generic UI. |
| P0-A | `setAssignmentStatus` without `allowAny` | Fixed/blocked | Keep tenant and transition checks; add live denial regression coverage. |
| P0-B | `removePersonnel` | Reproduced | Check parent assignment by `id AND tenantId` before deleting child link; include tenant in audit and route refresh only after authorization. |
| P0-B | `approveDirectly` | Reproduced | Require current tenant and fetch/update by `id AND tenantId`; audit denial when known ID is outside tenant. |
| P0-B | `deleteAssignment` | Reproduced | Require current tenant and delete by `id AND tenantId` or parent lookup result; handle zero affected rows as not found/denied. |
| P0-B | History helpers | Reproduced | Add current tenant to assignment/customer/object/personnel joins. Decide whether denied reads should audit. |
| P0-B | `rescheduleAssignment` | Reproduced | Require current tenant and scope all assignment reads/writes by tenant. Keep route refresh on authorized tenant only. |
| P0-B | `reshiftAssignment` | Reproduced | Same as reschedule; avoid exposing bare helper to scoped wrappers. |
| P0-B | `assignPersonnel` | Fixed/blocked | Keep existing parent and personnel tenant checks; add live regression coverage. |
| P0-B | `addAssignmentTask` / `removeAssignmentTask` | Fixed/blocked | Keep existing parent tenant checks; add live regression coverage. |
| P0-B | `applyRouteTimeSuggestion` | Wrapper fixed, callee vulnerable | Keep wrapper tenant checks and replace direct call to vulnerable `reshiftAssignment` with a tenant-scoped internal helper. |
| P0-C | `updateAssignment` + `calculateAssignmentCapacity` | Reproduced | Only audit/recalculate after an authorized row is returned. Pass tenant ID into capacity calculation and require assignment tenant match. |
| P0-D | `getAssignmentPlanningReadiness` | Reproduced | Require current tenant and scope assignment, personnel links, interest responses, and capacity reads by tenant. Avoid persisted recalculation in a read helper unless authorized. |
| P0-D | `recalculateAssignmentCapacity` | Reproduced | Require current tenant and pass tenant into capacity calculation; audit denied cross-tenant attempts. |
| P0-D | `sendAssignmentInterestPoll` | Reproduced | Require current tenant and load assignment by `id AND tenantId`; pass tenant to defaults and capacity helpers; audit denied cross-tenant attempts. |
| P0-D | `sendAssignmentInterestReminder` | Reproduced | Scope round, assignment, and response loads by tenant before updating reminder state or emitting notifications. |
| P0-D | `listAssignmentInterestRounds` | Reproduced | Require current tenant and scope rounds/responses through assignment tenant or tenant columns. |
| P0-D | `calculateAssignmentCapacity` | Reproduced | Change signature to accept tenant ID or authorized assignment row; make persistence tenant-aware and avoid bare assignment latest updates. |
| P0-D | `getLatestAssignmentCapacity` | Reproduced | Require tenant ID and filter checks/candidates by assignment and tenant. |
| P0-D | `getSmartPlanningRoundDefaults` | Reproduced | Require tenant ID or authorized assignment row before loading sector rules. |
| P0-D | `markInterestCandidate` | Fixed/blocked | Keep current assignment tenant join and add live denial regression coverage. |
| P0-D | Personnel `applyForAssignment` / `declineAssignmentInterest` | Fixed/blocked | Keep personnel ID plus tenant ID filters; add live denial regression coverage. |
| P0-D | Planning board stale-candidate load | Blocked by architecture | Keep tenant-scoped assignment ID source and add candidate-table tenant predicate as hardening. |

## Migration Notes

No migration is created here. Follow-up remediation may need index or constraint changes if tenant ID is added to child-table uniqueness contracts, but this PR intentionally avoids schema changes.

## Rollback Notes

Revert this documentation and the reproduction test/evidence files. There is no runtime rollback because production code is unchanged.
