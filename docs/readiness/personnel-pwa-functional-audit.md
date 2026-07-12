# Personnel PWA Functional Audit

Date: 2026-07-12

Branch: `codex/personnel-pwa-functional-audit-20260712T134234Z-9812`

Base: `f36e84dad5d1c595e4dd349ff5ce6bd439722576`

Scope: audit-only trace from personnel account activation through completed work. This PR intentionally adds documentation and executable reproduction/contract tests only. It does not fix production behavior.

## Executive Summary

The personnel PWA has working UI and several tenant-aware patterns, but the end-to-end workflow is not production-ready without runtime fixes and database evidence. The highest-risk gaps are:

1. Planner interest selection can trap a worker: `selected` blocks reapplication but does not create `assignment_personnel`, does not make the work order visible in `getMyAssignments()`, and does not schedule the assignment.
2. Many personnel actions still resolve the current worker by `user_id` and first active row instead of the current host tenant.
3. Work execution uses global assignment status for team work, allowing one worker to move or close the whole assignment and creating race conditions.
4. Offline replay is not tenant/user scoped and is not consistently idempotent.
5. Availability replacement, report submission, media registration, notifications, and tickets need stronger transaction, idempotency, and access-validation guarantees.

Current validation in this PR is static source-contract coverage. It is not database, RLS, Storage, browser, provider, or staging evidence.

## Subagent Coverage

Five read-only subagents inspected the earlier isolated task worktree:

1. Authentication, activation, recovery, tenant/host identity.
2. Profile, qualifications, availability, leave and settings.
3. Interest invitations, applications, planner selection and work-order visibility.
4. Work execution, tasks, photos, materials, extra work, signatures and reports.
5. Offline queue, notifications, tickets, concurrency and cross-tenant isolation.

The reports were reconciled with no direct contradictions. The main shared conclusion is that host-bound tenant identity exists in some paths, but is not enforced consistently across the personnel PWA surface.

## End-to-End Trace

| Step | Current Behavior | Gap |
| --- | --- | --- |
| Invite activation | Backoffice personnel invites send a temporary password and login URL through the global personnel portal URL. | Invite links are not generated from the tenant's resolved personnel host, so activation can land on a generic/platform host where ambiguity fallback matters. |
| Login and recovery | Personnel login and reset actions exist and enforce password strength. | Reset completion is not re-bound to personnel portal metadata, current host tenant, or temporary-password expiry at final password submission. |
| Multi-tenant personnel user | `resolveAuthenticatedPersonnelTenantId()` detects ambiguity in the tenant resolver. | Many actions bypass the resolver and select the first active personnel row by `user_id`. Older RLS/RPC helpers also use `LIMIT 1`. |
| Profile and qualifications | Profile updates use current portal tenant filters. Legacy qualification JSON is displayed. | Normalized qualification tables are not surfaced in the PWA profile. |
| Weekly availability | Personnel can save weekly windows. | Save deletes all weekly rows before insert and is not transactional. Failed insert can erase the schedule. |
| Date-specific availability | Day entries are upserted/deleted for the resolved personnel row. | Identity resolution still depends on user-only personnel lookup before the date-specific mutation. |
| Leave request and approval result | Personnel can request leave and see leave periods. | Leave identity, organization settings lookup, and notification sender are not tenant-bound; validation is weaker than backoffice. |
| Open assignment eligibility | Open assignments use host-bound tenant context and exclude already linked assignments. | Interest status can make an assignment appear applied even when no work-order link exists. |
| Interest invited/viewed/interested/unavailable/question | Personnel responses update interest rows and question can create a ticket. | Ticket/message identity has first-row tenant risk; selected/reserve/confirmed block reapply. |
| Selected/reserve/confirmed | Planner can mark interest as `selected` or `reserve`; `confirmed` is modeled and displayed. | No audited planner action produces `confirmed`; `selected` is separate from assignment linking. |
| Assignment visible as work order | `getMyAssignments()` joins `assignment_personnel` and requires `status = "assigned"`. | A selected-only worker is absent from work orders. |
| Seen/en route/start | Assigned worker can update global assignment status. | Status belongs to the assignment, not the worker link, so one worker changes state for the team. |
| Per-task completion | Assigned worker can toggle task completion. | Task updates are not restricted to `in_progress`; completion can be displayed as done based on assignment status. |
| Materials | Material usage has stronger client mutation ID handling. | Identity is first-row in some material paths; other inventory ledgers can duplicate offline replay. |
| Extra work | Extra work can be added and photo paths saved. | Offline payload has `clientMutationId`, but server insert ignores it; task code selection is globally exposed/client-trusted. |
| Photos/upload failures | Storage path helpers validate tenant/assignment patterns. | Upload-first, DB-register-second flows can leave orphaned files after DB failures. |
| Signature | Completion can include customer signature data URL. | Signature closeout is part of global assignment status and races with other closeouts. |
| Completed/not completed | Personnel can close assignment as completed or not completed. | Closeout reads status then updates by assignment id/tenant without compare-and-set; last write can win. |
| Report | Report submission inserts a report and advances assignment status. | Duplicate report prevention is check-then-insert and status update is separate. |
| Offline actions and replay | Offline queue supports several work-order actions. | Queue is not tenant/user scoped, uses tab-local locking, and lacks consistent server idempotency. |
| Notifications and tickets | Hrefs are syntactically sanitized. | Links are not validated against recipient access before display/click; service worker accepts absolute HTTP(S) hrefs. |

## Explicit Workflow Black Hole

The requested black-hole path is present in source:

1. `artifacts/backoffice/src/app/actions/assignments.ts:2342` marks an interest candidate as `selected` or `reserve`.
2. That action updates `assignment_interest_responses` and sends notification/audit events, but it does not insert or update `assignment_personnel`.
3. `artifacts/personeel-pwa/src/actions/assignments.ts:228` loads work orders from `assignment_personnel`.
4. `artifacts/personeel-pwa/src/actions/assignments.ts:234` requires `assignment_personnel.status = "assigned"`.
5. `artifacts/personeel-pwa/src/actions/open-assignments.ts:384` treats `selected`, `reserve`, and `confirmed` as already applied.
6. `artifacts/personeel-pwa/src/actions/open-assignments.ts:448` blocks reapply for those statuses.
7. `artifacts/backoffice/src/app/actions/assignments.ts:3516` schedules only inside `assignPersonnel()`, not inside the selected-interest action.

Result: a planner can select a worker, the worker can be blocked from reapplying and still remain absent from work orders because no `assignment_personnel` link exists and assignment status remains non-scheduled.

## Tenant And Security Findings

High-risk first-row lookup patterns:

- `artifacts/personeel-pwa/src/actions/reports.ts:99`
- `artifacts/personeel-pwa/src/actions/hours.ts:14`
- `artifacts/personeel-pwa/src/actions/extra-work.ts:93`
- `artifacts/personeel-pwa/src/actions/materials.ts:107`
- `artifacts/personeel-pwa/src/actions/inventory.ts:94`
- `artifacts/personeel-pwa/src/actions/inventory-scan.ts:61`
- `artifacts/personeel-pwa/src/actions/inventory-issues.ts:44`
- `artifacts/personeel-pwa/src/actions/notifications.ts:39`
- `artifacts/personeel-pwa/src/actions/messages.ts:71`
- `artifacts/personeel-pwa/src/actions/documents.ts:22`

Database-side helpers with similar risk:

- `migrations/015_pwa_rls_policies.sql:21`
- `migrations/016_assignment_personnel_status.sql:51`
- `migrations/016_assignment_personnel_status.sql:115`

The safe target pattern is a single canonical personnel identity helper that requires current personnel portal tenant, filters `personnel.tenant_id`, rejects ambiguity, checks module entitlements server-side, and is used by every runtime read and mutation.

## Current Tests

Existing relevant tests are mostly static source guards using `node:test` and `readFileSync`. They are useful contract checks, but they do not prove runtime behavior:

- `tests/fieldgrid-personnel-pwa-assignment-visibility.test.mjs`
- `tests/fieldgrid-personnel-pwa-access.test.mjs`
- `tests/fieldgrid-portal-host-binding.test.mjs`
- `tests/fieldgrid-customer-personnel-phase13-open-assignments-messages.test.mjs`
- `tests/fieldgrid-customer-personnel-phase14-offline-coverage.test.mjs`
- `tests/fieldgrid-sprint-9-storage-hardening.test.mjs`

This PR adds `tests/security/personnel-pwa-functional-contracts.test.mjs`, also a static source-contract test. It is executable and intentionally reproduces the current black-hole and risk contracts without accessing live infrastructure.

## Missing Evidence

Still required before production readiness:

- Database integration proof for interest selection, assignment linking, scheduled transition, and report uniqueness.
- RLS proof for personnel identity helpers and assignment RPCs.
- Storage runtime proof for assignment media, extra-work photos, report attachments, and orphan cleanup.
- API/server-action runtime proof for tenant-bound actions across every personnel surface.
- Browser or E2E proof for activation, recovery, open assignment, selected worker, work order execution, offline replay, notifications, and inaccessible links.
- Provider/staging evidence for real push/email notification behavior.

## Recommended Remediation Sequence

1. Add a canonical `getCurrentPersonnelIdentity()` helper and migrate all personnel actions to host-bound tenant identity.
2. Define final semantics for `selected`, `reserve`, and `confirmed`. If planner selection is final, make it atomically upsert `assignment_personnel`, mark the response `confirmed`, and schedule when slots are filled.
3. Move team execution to per-worker execution state or an append-only execution event model, then aggregate assignment status intentionally.
4. Add compare-and-set status updates for work-order closeout and report status transitions.
5. Make weekly availability replacement transactional.
6. Scope offline queues by tenant/user/personnel and add durable idempotency for extra work, report notes, and inventory movements.
7. Validate notification/ticket links against recipient access and reject external service-worker click targets.
8. Add runtime DB/RLS/Storage/browser tests before claiming readiness.

## Migration Notes

No migration is created or modified in this PR. Future fixes may need forward-only migrations for unique constraints, idempotency keys, per-worker execution state, tenant-scoped RLS helpers, and/or offline mutation tables.

## Rollback Notes

Rollback is documentation/test-only: revert this PR commit. No database state, workflow, deployment script, live service, or runtime configuration is changed.
