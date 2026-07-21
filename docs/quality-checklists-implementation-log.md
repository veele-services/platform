# Quality & Checklists — implementation log

## Phase 0 gap analysis (2026-07-21)

This log records the required repository analysis before implementation. The
analysis was performed read-only on `origin/main` at
`1bd829e2cb94ee9999e46dfbd91d955a33efc816` in an isolated worktree.

### 1. Existing and reusable architecture

- Fieldgrid's canonical work-order aggregate is `assignment`. Existing lifecycle
  states, participant execution records and transition functions remain the
  source of truth; this implementation does not introduce a parallel work-order
  status model.
- `assignments`, `assignment_personnel`, `assignment_participant_executions` and
  `assignment_tasks` provide tenant context, durable staffing, actual start/end,
  idempotency and optimistic participant versions.
- `customers.sector_id`, `objects.sector_id`, `objects.service_type`, assignment
  customer/object links and task-code snapshots provide the available selector
  context. `objects.service_type` is the current canonical object-type value;
  there is no separate object-type table.
- Existing database transactions, offline operation receipts, audit log,
  permission checks, module entitlements, assignment media bucket and tenant-
  bound storage-path helpers are reusable.
- The backoffice has settings tabs, permission-gated server actions and assignment
  detail tabs. The personnel PWA has a work-order checklist card, offline queue,
  signed-work-order lock and the canonical server-side completion action.
- RLS helper functions already cover management membership and personnel access
  to an assigned work order. The checklist policies can compose these helpers
  with explicit tenant and assignment ownership checks.
- Timestamped forward-only SQL migrations, Node test layers, TypeScript
  typechecks and per-app production builds are the existing delivery model.

### 2. Missing functionality

- There is no checklist template, immutable template version, contextual binding,
  assignment snapshot, multi-source provenance, answer/evidence, waiver,
  reconciliation event or persistent configuration-warning model.
- `assignment_tasks` is a flat task list. It has no tenant column, stable
  snapshot item identity, field schema, evidence requirements, conditional
  visibility or checklist cardinality. It remains supported as legacy work scope
  and is not repurposed as the new quality model.
- No central deterministic resolver implements priority, specificity, add,
  available, replace, suppress, strongest-rule merge or explain output.
- Assignment creation/context/task/staffing/start flows do not create or reconcile
  checklist snapshots, and completion validates only lifecycle/signature rules.
- There is no template/binding builder, runtime preview, reconciliation review or
  dynamic personnel checklist renderer.

### 3. Canonical-name and lifecycle mapping

- Instruction `work_order` maps to repository `assignment`.
- `per_work_order` remains the public cardinality value; its database owner is an
  assignment and its cardinality key is `assignment:<assignment-id>`.
- Instruction `object_type` maps to normalized `objects.service_type` until a
  canonical object-type entity is introduced separately.
- Prepared/draft maps to `requested`, `review`, `quote_preparation`,
  `awaiting_approval`, `approved` and `plannable`.
- Snapshot-required/pre-start maps to `scheduled`, `seen` and `en_route`, plus
  durable personnel assignment. `in_progress` or a non-null canonical actual
  start locks automatic mutation.
- Interrupted/non-complete maps to participant `paused` and assignment or
  participant `not_completed`; snapshots and partial answers remain intact.
- Terminal immutable states map to `completed`, `report_submitted`,
  `report_approved`, `invoice_ready`, `invoiced`, `paid`, `closed` and
  `cancelled` (with cancellation retaining historical records).

### 4. Required migrations

- Add the first-class `quality` module and tenant enablement with dependencies on
  assignments and objects.
- Add tenant-owned templates, immutable versions and contextual bindings.
- Add assignment checklist snapshots, source provenance, answers, evidence,
  reconciliation events, waivers and configuration warnings.
- Add checks and unique indexes for status/mode/cardinality, published-version
  immutability, snapshot cardinality and reconciliation idempotency.
- Add tenant-safe RLS policies for management and assigned personnel, immutable/
  append-only guards for historical records, targeted RBAC permissions and a
  tenant-bound checklist media path.
- No legacy checklist backfill is required because no legacy structured checklist
  data exists. `assignment_tasks` remains available and no existing answers are
  migrated or deleted. Migration verification queries will assert tenant,
  reference and orphan invariants.

### 5. Risky integration points

- Starting and completing work are concurrency-sensitive and offline-capable.
  Reconciliation and completion validation must run server-side and idempotently
  without weakening participant execution version checks.
- Configuration edits can affect many assignments; a web request must only enqueue
  bounded, resumable reconciliation events, not synchronously mutate every row.
- Reconciliation must never cascade-delete answers/media or mutate a snapshot at
  or after actual start. Empty, pre-start, source-less instances may only be soft
  cancelled; answered instances become `detached_pending_review`.
- Template publication must be immutable at both action and database layers.
- The personnel PWA may receive concurrent/offline changes. Answer writes use an
  expected revision plus a deterministic operation key; blind last-write-wins is
  rejected.
- Existing service-role server actions bypass RLS, so every server action must
  still bind tenant, assignment, template and item identifiers explicitly.

### 6. Concrete implementation plan

- `lib/db/src/checklist-resolution.ts`: pure types, validation, cardinality,
  deterministic resolver, strongest-rule merge and explain/diff primitives.
- `lib/db/src/schema/checklists.ts` and exports: typed persistence model with
  stable IDs, tenant ownership and non-destructive relationships.
- `lib/db/migrations/20260721120000_quality_checklists_foundation.sql`: module,
  schema, constraints, indexes, RBAC, RLS, immutability and storage policies.
- `lib/db/src/checklist-reconciliation.ts`: tenant-bound context loading,
  transactional/idempotent reconciliation, pending review and completion gate.
- Backoffice checklist actions/pages/components: template/version publication,
  bindings, preview/explain, assignment impact and reconciliation decisions.
- Personnel assignment actions/components/offline queue: grouped snapshots,
  revision-safe partial answers/evidence and exact completion blockers.
- Assignment integration: reconcile after relevant pre-start context/task/staffing
  changes and immediately before start; never automatically mutate after start.
- Tests: pure resolver unit matrix, reconciliation state transitions, migration/
  RLS/permission contracts and focused UI/server-action behavior.
- Documentation: architecture, priority/cardinality examples, lifecycle mapping,
  operational recovery and staging scenarios. No ADR is added because this
  central snapshot/reconciliation choice is recorded in
  `docs/architecture/adr-quality-checklist-reconciliation.md`.

## Implementation progress

- Gap analysis recorded before product/schema implementation: complete.
- Deterministic resolution, reconciliation planning and completion validation:
  complete with focused unit matrix.
- Quality module, forward-only PostgreSQL schema, indexes, tenant guards, RLS,
  immutable history and canonical storage path: complete.
- Assignment/task/staffing/scheduling/start/completion/cancellation integration:
  complete with recoverable idempotent events.
- Backoffice template/binding/preview/review/snapshot/waiver UI and personnel PWA
  dynamic fields/offline answers/evidence/completion gate: complete.
- Fresh PostgreSQL 17 migration, runtime tenant A/B probes and existing DB/RLS
  harnesses: complete locally against a disposable Docker database.
- Production, deployment, push and merge: not performed.

## Validation record

- `pnpm run typecheck`: green for libraries, API, backoffice, customer PWA,
  personnel PWA, mockup sandbox and scripts.
- `pnpm fieldgrid:test:domain-recursive`: 95/95 green.
- `pnpm fieldgrid:test:security-recursive`: 38/38 green.
- Focused quality, storage, lifecycle, security and W04 contracts: 60/60 green
  after the final start-lock correction.
- `pnpm fieldgrid:migration-order-check:check`: green.
- Fresh PostgreSQL 17 migration plus existing runtime safety DB/RLS harnesses:
  green. The dedicated runtime proof validates catalog, idempotency,
  cardinality, completion, protected/immutable state, tenant A/B RLS,
  assigned-personnel RLS, manipulated item IDs and canonical storage paths.
- Production builds: mockup sandbox, API, customer PWA and personnel PWA green
  in the recursive build; backoffice green separately with local build-only
  Supabase placeholders and the disposable database.
- The repository-wide historical `pnpm test` has three pre-existing failures:
  raw `confirm()` in `BeschikbaarheidForm` and two stale customer-navigation
  expectations. All four involved files are byte-identical to base
  `1bd829e2cb94ee9999e46dfbd91d955a33efc816`; the one W04 source contract
  initially touched by this work is restored and 6/6 green.
