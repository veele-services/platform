# Backoffice functional audit

Date: 2026-07-12
Canonical base: `f36e84dad5d1c595e4dd349ff5ce6bd439722576`
Task branch: `codex/backoffice-functional-audit-20260712T113422Z-4136`
Worktree: `C:/Users/danny/AppData/Local/Temp/fieldgrid-backoffice-functional-audit-20260712T113422Z-4136`

This audit is source-only. It does not claim database, RLS, Storage runtime, browser, provider, staging, or live-service evidence. No migrations, workflows, deployment scripts, runtime actions, or package manifests were changed.

## Scope

The audit covers the tenant backoffice end-to-end surfaces and their downstream portal effects:

- Tenant context, RBAC, modules, organization settings, mail settings, users, roles, audit log.
- Customers, contacts, objects, customer types, documents, signed URLs.
- Personnel, qualifications, availability, leave, portal invite feedback.
- Assignments, planning, interest rounds, suggested candidates, route refresh, personnel execution.
- Reports, quotes, invoices, material and inventory approvals.
- Notifications, tickets, audit rows, exports, domain events, cross-surface propagation.

The six requested read-only subagents all verified the same isolated task worktree before inspection. Their findings were reconciled with local source inspection. No contradiction changed the outcome: all findings below are source-level risks and require runtime proof before being closed.

## Method

For every major page and server action examined, the audit asked:

- Is the UI connected to a real mutation?
- Does success feedback represent committed canonical state?
- Are tenant, permission, and module gates enforced server-side?
- Is the action atomic?
- Do downstream portals observe the change?
- Are zero-row updates detected?
- Are stale data and races handled?
- Are errors visible and recoverable?

The executable reproduction in `tests/security/backoffice-functional-contracts.test.mjs` pins the highest-risk source contracts and the integrity of the gap register. That test layer is a static source guard, not runtime validation.

## Executive Summary

The tenant backoffice is broadly connected to real server actions, and several central guards are strong: tenant context is centralized, many backoffice actions call `requirePermission`, and the module map is used by the permission layer where resources are mapped.

The main readiness gap is not missing UI wiring. It is that success feedback often means "the action returned" rather than "the intended tenant-bound canonical state committed and downstream surfaces can observe it." This appears across assignment planning, role management, settings, documents, reports, finance, personnel availability, notifications, and tickets.

The highest risks are:

- `BFA-P0-001`: backoffice role pages still mutate legacy/global RBAC tables while runtime permissions use tenant RBAC tables.
- `BFA-P0-002`: several assignment/planning actions can operate without a current-tenant predicate on the parent assignment or round.
- `BFA-P0-003`: generic assignment status editing and `allowAny` status override can bypass lifecycle invariants and produce customer-visible final states without the expected closeout artifacts.
- `BFA-P0-004`: report approval can commit approval and customer visibility while invoice proposal creation fails.
- `BFA-P0-005`: customer portal document signing does not tenant-bind the storage path before issuing a signed URL.

## Page and Action Findings

### Settings, RBAC, modules

Roles UI is reachable from `artifacts/backoffice/src/app/(dashboard)/instellingen/rollen/page.tsx` and calls actions in `artifacts/backoffice/src/app/actions/settings.ts`. Those actions list and mutate `roles` and `role_permissions`, while runtime permission resolution in `artifacts/backoffice/src/lib/auth/permissions.ts` uses `tenant_user_roles`, `tenant_roles`, and `tenant_role_permissions`. This means the UI can return success while active tenant authorization is unchanged. See `BFA-P0-001`.

Organization and mail settings are tenant-scoped on `organization_settings.tenant_id`, but updates do not use `.returning()` or affected-row checks. A missing provisioned row can still lead to success feedback and audit rows. SMTP passwords are written to `organization_settings.smtp_password` as plaintext, while platform provider secrets use encrypted config. See `BFA-P1-006` and `BFA-P1-007`.

`listAuditLog` does not require the current tenant or filter by tenant in the ultimate query. Notification audience options query active personnel/customers without requiring current tenant. See `BFA-P1-008` and `BFA-P1-009`.

The module-permission map includes `notifications` but not `tickets`; ticket server actions call `requirePermission("tickets", ...)`, which checks RBAC but has no module entitlement mapping. See `BFA-P1-021`.

### Customers, contacts, objects, documents

Customer, object, and contact actions are real server mutations, but multiple status/delete/update flows do not confirm affected rows. Primary-contact demote-and-write flows are not transactional and have no partial unique index guard. Customer types are tenant-facing in backoffice but globally listed and mutated. See `BFA-P1-010`.

Backoffice document upload writes Storage, then DB, then audit. Delete removes Storage, then DB, then audit, and ignores Storage remove errors. Customer/object deletes do not block or clean generic document rows/blobs. See `BFA-P1-011`.

Customer portal document listing joins through tenant-bound parent ownership, but does not include `documents.tenant_id` on all branches. The download action does filter `documents.tenant_id`, then signs `doc.storagePath` directly. Backoffice uses a safe tenant-bound storage-path helper before signing; the customer portal does not. See `BFA-P0-005`.

The customer portal document actions and mobile "Meer" route do not enforce the `documents` module directly, so direct action or URL access can bypass hidden UI. See `BFA-P1-012`.

### Personnel, qualifications, availability, leave

PWA availability and leave actions resolve personnel by `user_id` and `is_active`, but do not require the portal tenant in the action itself. Layout gating is not enough for direct action calls. Availability and leave also read the first organization settings row with `.limit(1)`, without tenant scope. See `BFA-P1-013`.

Qualification links validate the personnel row tenant but not every referenced qualification, role, or task-code tenant before writing link rows. Legacy denormalized personnel qualification fields are synced in separate statements. See `BFA-P1-014`.

Availability replace flows delete windows then insert replacements outside a transaction. Leave approve/reject selects pending rows first, then updates by id, leaving stale-data race windows. Several personnel and leave updates do not detect zero-row changes. See `BFA-P1-015`.

`createPersonnel` can swallow auto-invite failure while the form copy tells the user a temporary password was sent when auto-invite was selected. See `BFA-P2-026`.

### Assignments, planning, interest rounds, execution

Some assignment flows are well tenant-bound, but high-risk planning and interest helpers are not consistent. `recalculateAssignmentCapacity`, interest poll/reminder/list actions, reschedule/reshift, and delete paths require permissions but do not consistently constrain the parent assignment or round by current tenant. See `BFA-P0-002`.

`requiredPersonnelCount` is displayed by planning surfaces, but scheduling and direct-assignment write paths compute required slots from distinct required roles, falling back to 1. A multi-person assignment with no required roles can be marked scheduled after one person. See `BFA-P1-016`.

"Selecteer" for interest candidates calls `markInterestCandidate` and updates interest response status. It does not create an `assignment_personnel` row with status `assigned`, so personnel execution lists do not observe it as assigned work. See `BFA-P1-017`.

Multi-person execution uses global assignment status. Any linked assigned worker can set the assignment to `en_route`, `in_progress`, `completed`, or `not_completed`, and the customer portal observes that global state. See `BFA-P1-018`.

Planning candidates are upserted but stale candidates are not deleted when eligibility changes. Route refresh and map invalidation are best-effort, with at least one planning-board unassign path not clearly refreshing route contexts. See `BFA-P1-019` and `BFA-P2-027`.

### Reports, quotes, invoices, materials, inventory

Report approval updates report state, updates assignment state, then tries to create an invoice proposal. Proposal failure is logged but the action can still return success. Customer reports become visible after approval even when no invoice proposal exists. See `BFA-P0-004`.

Invoice proposal creation checks for an existing active invoice, then inserts without a transaction lock or partial unique active-invoice constraint. Duplicate draft proposals are possible under concurrency. See `BFA-P1-020`.

Report approval UI pre-blocks pending material approvals, while the server wrapper also blocks pending inventory approvals. The page does not surface inventory rows needed for recovery before the user clicks. Invoice, report, material, and inventory transitions generally pre-read status and then update without conditional status predicates and `.returning()` checks. See `BFA-P1-020`.

### Notifications, tickets, audit, exports, events

Customer ticket mutations and backoffice replies commit ticket/message rows in one transaction, then emit domain events afterward. `emitDomainEvent` inserts event, audit, notifications, and queue rows in separate statements. Durable ticket state can therefore exist without downstream event/audit/notification rows. See `BFA-P1-022`.

General personnel tickets write threads/messages and revalidate local routes, but do not emit a domain event, unlike assignment questions and customer tickets. Backoffice notification surfaces may not observe those tickets until manual refresh. See `BFA-P1-023`.

Customer and personnel notification single-row actions update/delete without row-count checks. Personnel notification UI ignores action results and optimistically mutates local state. Portal close/reopen ticket actions similarly discard server action errors. See `BFA-P1-024`.

Platform export routes are gated, but the actual CSV download does not write an audit row with actor, filters, and row count. Platform ticket audits can be written after a zero-row mutation. See `BFA-P2-025`.

## Existing Tests

Existing coverage is mainly static source guards and fixture-level checks:

- `tests/fieldgrid-backoffice-module-guards.test.mjs`
- `tests/fieldgrid-backoffice-tenant-isolation-regression.test.mjs`
- `tests/fieldgrid-document-storage-download-tenant-guard.test.mjs`
- `tests/fieldgrid-invoice-canon-current-flow.test.mjs`
- `tests/fieldgrid-material-inventory-phase4.test.mjs`
- `tests/fieldgrid-material-inventory-phase6.test.mjs`
- `tests/fieldgrid-platform-provisioning-org-settings-hardening.test.mjs`
- `tests/fieldgrid-sprint-4-rbac-support.test.mjs`
- `tests/fieldgrid-sprint-8-tenant-id-hardening.test.mjs`
- `tests/fieldgrid-sprint-11-module-harmonization.test.mjs`

Those tests are useful as regression guards, but they do not prove runtime DB behavior, RLS, Storage path denial, browser UI recoverability, concurrent races, or downstream provider delivery.

## Required Runtime Evidence Before Closure

The following claims remain unproven until future work supplies safe non-live runtime tests:

- Cross-tenant server action denial for assignment, planning, interest, ticket, document, qualification, and settings actions.
- Zero-row updates return recoverable errors and do not write success audit rows.
- Module-off direct action calls are denied for documents, tickets, notifications, availability, leave, and portal routes.
- Storage signed URL creation rejects cross-tenant storage paths in customer portal actions.
- Report approval rolls back when invoice proposal creation fails.
- Concurrent report approval cannot create duplicate active invoice proposals.
- Multi-person execution follows explicit per-person, lead-worker, or quorum rules.
- Downstream portals observe committed state only after the canonical transaction commits.
- Event/audit/notification rows are committed atomically or through a durable outbox.
- SMTP secrets are encrypted at rest and never exposed in audit, logs, or API responses.

## Rollback

This task adds documentation and a static contract test only. Rollback is a normal revert of the audit commit. No database rollback, migration ordering, workflow rollback, deployment rollback, or provider rollback is required.
