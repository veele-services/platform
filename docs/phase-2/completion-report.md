# Fieldgrid Phase 2 completion report

Date: 2026-07-19

Branch: `phase2d/runtime-evidence-closeout`

Starting main: `415c5531304091f043652b5fc3aaffca98d15c06`

Production action: none

## Closeout decision

Phase 2 implementation is complete and the local runtime-derived acceptance gate is green. The gate executed 11 mandatory journeys against disposable PostgreSQL 17 and the real local browser surfaces: 11 passed, zero failed and zero skipped. The candidate is ready for controlled staging promotion after the exact Phase 2D head passes authoritative GitHub CI, receives human review, and is squash-merged to `main`.

This task did not update `staging`, did not deploy, and did not touch production. Production-ready remains **false** until the exact eventual release SHA has staging proof, a rollback rehearsal and an approved go/no-go packet (FG-HARD-024).

## Runtime evidence contract

Per-run pass JSON is generated only as a CI/local artifact and is not committed. The canonical components are:

| Component                           | Canonical location                                                       |
| ----------------------------------- | ------------------------------------------------------------------------ |
| Evidence schema                     | `schemas/fieldgrid-phase2-runtime-evidence.schema.json`                  |
| Collector and fail-closed validator | `scripts/fieldgrid-phase2-w11-cross-surface-acceptance.mjs`              |
| Browser/accessibility finalizer     | `e2e/fieldgrid/finalize-runtime-evidence.mjs`                            |
| Data-path/fixture validator         | `e2e/fieldgrid/validate-runtime-evidence.mjs`                            |
| Generated runtime acceptance        | CI artifact `artifacts/fieldgrid-phase2-runtime/runtime-acceptance.json` |
| Browser artifacts                   | CI artifact `artifacts/fieldgrid-playwright/**`                          |

The collector binds evidence to the exact Git head, CI workflow run, disposable environment, source artifact hashes and runtime timestamps. Missing, duplicate, stale, skipped, wrong-head, wrong-environment or secret-bearing evidence fails closed.

## Exit criteria

| Criterion               | Status                       | Observed evidence                                                                                                                                 |
| ----------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planned versus actual   | complete                     | Planned values remain available; participant start/completion and all three projections are observed.                                             |
| Availability            | complete                     | Save, stale-conflict rejection, planning/personnel parity and Tenant A/B isolation execute at runtime.                                            |
| Interest and staffing   | complete                     | Partial and full headcount, scheduled transition, planboard visibility and duplicate idempotency execute at runtime.                              |
| Durable unassignment    | complete                     | Pre-start history/actor/reason retention, active-count change and post-start denial execute at runtime.                                           |
| Multi-person execution  | complete                     | Independent starts, partial completion, aggregate completion and replay idempotency execute at runtime.                                           |
| Realtime                | complete                     | Management/personnel/customer projections, monotonic versions, payload scrubbing and forbidden-recipient denial execute at runtime.               |
| Offline personnel PWA   | complete                     | Queue, refresh, failed reconnect, successful reconnect, replay-once and visible convergence execute in Playwright.                                |
| Customer visibility     | complete                     | Allowed assignment/report visibility, internal-field exclusion and cross-tenant denial execute at runtime.                                        |
| Credential recovery     | complete                     | Generic response, captured message, valid/invalid/expired/used/wrong-tenant behavior, provider update and legacy-path absence execute at runtime. |
| Tenant guards           | complete                     | Management, personnel, customer, malformed/tenantless JWT, RPC and realtime denial paths execute at runtime.                                      |
| Accessibility           | complete                     | Eight desktop/mobile axe scans have zero serious/critical violations; keyboard, labels, associated errors and dialog focus/Escape are exercised.  |
| Exact-head candidate CI | pending until PR head exists | GitHub Actions is authoritative for the committed candidate head.                                                                                 |
| Staging-ready           | conditional yes              | Proceed only after exact-head CI, human approval and squash merge; use the immutable merged `main` SHA.                                           |
| Production-ready        | false                        | Staging validation and FG-HARD-024 remain open.                                                                                                   |

## Preserved non-blocking backlog

- #330 — Make personnel availability deletion conflict-aware and auditable.
- #331 — Complete post-start crew replacement and aggregate report-package policy.
- #333 — Track residual platform and portal hardening extracted from legacy Phase 2 audits.
- #334 — Harden notification-worker tenant lifecycle and delivery-attempt semantics.

These issues do not block Phase 2 implementation closeout or a controlled staging validation. They remain visible for the production go/no assessment.

## Next action

Require the draft PR's exact head to pass every authoritative check with zero failed, cancelled or pending checks. After review and squash merge, verify exact squash-main again, then create a separate controlled `main` to `staging` promotion using the immutable merged SHA. Do not promote production from this closeout.
