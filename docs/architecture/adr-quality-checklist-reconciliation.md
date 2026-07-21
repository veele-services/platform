# ADR — Central deterministic checklist resolution and immutable execution snapshots

Status: accepted for implementation, 2026-07-21.

## Context

Checklist applicability is composed from tenant, sector, customer, objecttype,
object, task and assignment overrides. The same assignment can change before or
during execution. Spreading those decisions over UI, SQL triggers and actions
would make conflicts non-deterministic and could silently remove obligations or
evidence.

## Decision

Use one pure deterministic resolver for runtime and preview, followed by one
transactional reconciliation service. Persist immutable published versions and
assignment-owned snapshots with explicit source provenance. Before actual start,
apply a deterministic diff atomically. At or after start, never mutate
composition automatically: persist a conservative review proposal. Keep answers,
evidence and waiver history append-only and enforce tenant/cardinality/history
in PostgreSQL as well as server actions.

Configuration fan-out uses bounded, idempotent database events rather than a new
external queue. Existing `assignment_tasks`, participant execution, permission,
audit, offline queue and assignment-media systems remain canonical.

## Consequences

- Runtime and explain cannot drift because they call the same engine.
- Multiple sources produce one identity without losing provenance.
- Existing snapshots deliberately do not follow newer template publications.
- Started assignments require human review for newly applicable or obsolete
  requirements, increasing explicit operational work in exchange for no silent
  data or obligation loss.
- A future new selector/cardinality can extend engine types and persistence
  without replacing the lifecycle model.
