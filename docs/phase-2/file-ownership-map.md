# Phase 2 File Ownership Map

| Area | Primary owner | Files/directories | Phase 2 rule |
| --- | --- | --- | --- |
| Database schema and RLS | DB owner | `lib/db/**` | Migrations are forbidden in W00; future migrations require lifecycle contract references. |
| Backoffice assignment commands | Backoffice owner | `artifacts/backoffice/src/app/actions/**`, `artifacts/backoffice/src/components/assignments/**` | Replace generic status writes with domain commands. |
| Planboard | Backoffice/shared UI owners | `artifacts/backoffice/src/components/assignments/**` | Use canonical lifecycle, staffing counts and accessible responsive interactions. |
| Personnel PWA | Personnel owner | `artifacts/personeel-pwa/**` | Own participant state, offline queue and media/report replay semantics. |
| Customer portal | Customer owner | `artifacts/klant-pwa/**` | Use customer-safe projection only; never expose internal-only fields. |
| Shared UI | Shared UI owner | shared component/token directories under `artifacts/**` and `lib/**` | Consolidate duplicate responsive shells and token usage after W00. |
| Release/testing | QA/release owner | `tests/**`, `scripts/fieldgrid-*.mjs`, `e2e/**` | Maintain runtime inventory non-regression and deterministic cross-surface evidence. |
| Phase 2 contracts | Orchestrator/docs owner | `docs/phase-2/**`, `tests/fieldgrid-phase2-program-contract.test.mjs` | W00 authoritative planning contract; no runtime behavior changes. |
