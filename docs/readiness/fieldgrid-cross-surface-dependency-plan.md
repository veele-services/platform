# Fieldgrid cross-surface dependency plan

Date: 2026-07-12
Scope: remediation plan for the source-level flow map and gap register. This plan is documentation only and does not authorize runtime code, migration, workflow, deployment, database, provider, or live-service changes.

## Operating assumptions

- `main` is canonical source and has no database.
- `staging` is the only active runtime environment, but staging/live access was out of scope for this audit.
- Production is out of scope.
- No migrations are proposed for this documentation PR. Future fixes may require migrations only after explicit task approval.
- No live secrets or providers are required to execute the plan until a later, explicitly scoped runtime evidence phase.

## Dependency order

### 1. Tenant boundary and server-action safety

Fix these before broad end-to-end testing, because they affect whether test evidence is trustworthy:

| Gap | Owner | Dependency | Target evidence |
| --- | --- | --- | --- |
| `FG-FLOW-BACKOFFICE-001` cross-tenant planning mutations | Planning | `requireCurrentTenantId`, assignment/round tenant predicates | Static and API/action runtime tests invoking actions with foreign tenant ids |
| `FG-FLOW-BACKOFFICE-005` tenant activity log globally readable | Settings/audit | Current-tenant audit filter and explicit platform/global row policy | Tenant A/B activity-log isolation test |
| `FG-FLOW-BACKOFFICE-006` personnel password reset by foreign id | Auth/personnel | Personnel lookup scoped to current tenant | Cross-tenant personnel id denial test |
| `FG-FLOW-PLATFORM-001` platform ticket cross-tenant relationships | Support/ticketing | Ownership validators and possible DB constraints | Static/unit tests for every linked id; database integration if constraints are added |
| `FG-FLOW-PLATFORM-005` invite/reset auth mutation before email proof | Auth/platform | Token-first invite/reset model or compensating auth rollback | Email-failure tests proving auth metadata/password remain unchanged |
| `FG-FLOW-PLATFORM-006` active account overwrite by temp-password provisioning | Auth/platform | Verified account-linking policy and constrained `allowExistingActive` | Existing active customer/personnel/tenant account preservation tests |
| `FG-FLOW-PERSONNEL-002` host drift in personnel mutations | PWA auth | Current host tenant helper in all mutation families | Wrong-host API/action tests for reports, materials, extra work, messages |
| `FG-FLOW-PERSONNEL-005` tenant-null PWA reports | Personnel reporting | Set report tenantId and backfill existing nulls in a separately approved migration | Report submit test asserting `reports.tenant_id` |
| `FG-FLOW-PERSONNEL-003` task-code tenant leak | Pricing/field execution | Tenant-scoped task-code catalog and validation | Unit/source tests plus integration test for submitted ids |
| `FG-FLOW-CROSS-003` feature module direct access | Entitlements/customer PWA | Feature guard helpers for actions/routes | Static plus API/action runtime tests for module-off routes/actions |
| `FG-FLOW-CUSTOMER-005` raw customer document path signing | Customer documents/storage | Tenant-bound storage path validation before signed URL creation | Non-tenant-bound path rejection test |

### 2. Workflow transaction boundaries

After tenant boundaries are fixed, make multi-row status transitions atomic or explicitly compensating:

| Gap | Owner | Dependency | Target evidence |
| --- | --- | --- | --- |
| `FG-FLOW-PERSONNEL-001` report submission | Reporting/notifications | DB transaction and `emitReportWorkflowEvent("report_submitted")` | Unit/source and integration tests for report insert, assignment status, event/outbox |
| `FG-FLOW-BACKOFFICE-002` report approval/proposal failure | Reports/finance | Transaction or compensating finance exception event | Test that proposal failure prevents customer notification or records explicit exception |
| `FG-FLOW-BACKOFFICE-003` invoice proposal helper tenant boundary | Finance | Helper signature requires tenantId | Source/unit tests for tenant predicate |
| `FG-FLOW-CUSTOMER-003` payment checkout atomicity | Payments | Idempotent local payment intent and reconciliation | Unit tests for local-failed/external-created paths; later Mollie sandbox proof |
| `FG-FLOW-CROSS-001` Mollie webhook parity | API payments | Shared payment settlement finalizer | Tests proving webhook and manual payment produce the same invoice_paid event/outbox |

### 3. Customer-visible correctness

These are high-impact visible defects and should follow the transaction work:

| Gap | Owner | Dependency | Target evidence |
| --- | --- | --- | --- |
| `FG-FLOW-CUSTOMER-001` expired quote decisions | Quotes/workflow | Server-side expiration guard | Unit/source tests and customer action runtime test |
| `FG-FLOW-CUSTOMER-002` draft invoice exposure | Finance/customer PWA | Shared customer-visible invoice status predicate | Static and route/action tests for assignment detail |
| `FG-FLOW-CUSTOMER-004` synthetic notification state | Notifications/customer PWA | Persisted source-key read/delete state or materialized notifications | Unit/source tests for mark-read/delete after reload |
| `FG-FLOW-CUSTOMER-006` customer notification preferences ignored by delivery | Notifications | Preference-aware recipient filtering | Tests proving disabled email/push preferences suppress queue rows |
| `FG-FLOW-PLATFORM-002` archived tenant reactivation | Tenant lifecycle | Explicit lifecycle transition policy | Unit/source tests for all allowed/denied transitions |
| `FG-FLOW-PLATFORM-003` sector disable usage parity | Sectors/task codes | Shared sector usage counter | Unit/source tests for platform and tenant paths |

### 4. Durable notification and job parity

Run this after canonical mutations are stable:

| Gap | Owner | Dependency | Target evidence |
| --- | --- | --- | --- |
| `FG-FLOW-CROSS-002` payment reminders | API jobs | Runtime-active tenant guard and `payment_reminder` event | Unit/source job tests for suspended/archived tenants and event rows |
| `FG-FLOW-CROSS-005` manual full-payment event parity | Finance/backoffice | Shared paid-settlement finalizer | Tests proving `registerManualInvoicePayment` emits `invoice_paid` and revalidates customer-visible routes |
| `FG-FLOW-PLATFORM-004` platform notification delivery | Notifications | Dispatcher/worker implementation or documented scheduled-only status | Worker unit test or explicit product status change |
| `FG-FLOW-CROSS-004` tenant-ambiguous org settings reads | Workflow/platform | TenantId-required settings accessors | Source tests for report/quote email side effects |
| `FG-FLOW-CROSS-006` domain-event recipient tenant membership | Notifications/events | Tenant filters on customer/personnel recipient lookups | Tests proving cross-tenant recipient ids are rejected |
| `FG-FLOW-BACKOFFICE-004` status override parity | Assignment workflow | Status-transition side-effect matrix | Unit tests per status class and override reason |
| `FG-FLOW-PERSONNEL-004` offline queue durability | PWA offline | Server-side idempotency/mutation log | Browser/E2E replay tests after close/reopen and stale status |

## Golden path proof ladder

1. Static/source-contract layer:
   - Validate exact guard calls, tenant predicates, feature-module gates, status predicates, event emission, and downstream query filters.
   - This is the only layer collected in the current audit.

2. Unit layer:
   - Extract pure policy helpers for lifecycle transitions, quote expiration, invoice visibility, module gating, task-code tenant scope, sector usage, and payment settlement side effects.

3. API/action runtime layer:
   - Invoke Next server actions/API routes with attacker-controlled ids and wrong-host contexts.
   - Prove no action trusts UI-hidden controls or client-provided tenant ids.

4. Integration/database layer:
   - Use a local test database only after explicit approval for DB work.
   - Prove multi-row report, quote, planning, invoice, payment, notification, and ticket writes are atomic or compensating.

5. RLS/storage runtime layer:
   - Prove document/photo download/list behavior against actual policies, including mismatched document tenant rows.

6. E2E/browser layer:
   - Full path: customer request -> backoffice review -> quote sent -> customer approval -> plannable -> interest poll -> selected/assigned personnel -> field execution -> report submit -> report approval -> invoice proposal/finalization -> customer payment -> webhook/manual close -> customer/backoffice/personnel notification and status visibility.

7. Manual/live evidence layer:
   - DNS, SMTP/API provider, Mollie, Supabase auth, push provider, and staging evidence remain separate and require explicit future authorization.

## Proposed issue ownership

| Area | Primary owner | Supporting owners |
| --- | --- | --- |
| Platform lifecycle/domain/sector/ticketing | Platform engineering | Support operations, billing |
| Tenant RBAC and backoffice planning | Backoffice platform | Planning, personnel PWA |
| Reporting and invoice proposal handoff | Reports/finance | Customer PWA, notifications |
| Payments and webhook settlement | Finance/API | Customer PWA, notification infrastructure |
| Personnel host identity/offline execution | Personnel PWA | Platform auth, field execution |
| Customer quote/payment/notification correctness | Customer PWA | Finance, quotes, notifications |
| Notification/outbox parity | Notifications platform | All surface teams |

## Migration notes

This documentation PR creates no migration and makes no schema change.

Potential future migrations, only with explicit approval:

- Ticket ownership constraints or validated foreign-key model for platform tickets.
- Notification source-key/read-state table for synthetic customer notifications.
- Durable offline mutation/idempotency table for Personnel PWA replay.
- Payment settlement/outbox idempotency fields if the shared finalizer needs persistent dedupe.
- Optional stricter constraints around tenant-scoped invoice/proposal/task-code relationships.

## Rollback notes

Rollback for this documentation PR is limited to removing these files:

- `docs/readiness/fieldgrid-functional-golden-paths-2026-07-12.md`
- `docs/readiness/fieldgrid-surface-readiness-matrix.md`
- `docs/readiness/fieldgrid-functional-gap-register.json`
- `docs/readiness/fieldgrid-cross-surface-dependency-plan.md`

No runtime state, migrations, workflows, package metadata, generated clients, lockfiles, live services, or deployment settings are changed by this PR.

## Unresolved blockers and evidence gaps

- `pnpm install --frozen-lockfile` completed successfully in the isolated task worktree after adding the local Git `sh.exe` directory to PATH for the repository `preinstall` script.
- Node 24.18.0 and pnpm 11.5.2 were used for local validation.
- No runtime, database, RLS/storage, provider, browser, or staging tests were run. Validation for this documentation-only PR is limited to install completion, JSON parsing, and Git diff checks.
- No live runtime claims should be made from this audit. Database, RLS/storage, provider, browser, and staging proof remain future work.
