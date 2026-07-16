# Phase 2 Stale PR Disposition

Do not merge, close or deploy these PRs in W00. This table records how Phase 2 should treat them after the W00 contract lands.

| PR | Title | Classification | Phase 2 disposition |
| --- | --- | --- | --- |
| #282 | Platform functional audit | Reference-only | Extract audit evidence into backlog/acceptance notes; no runtime merge. |
| #283 | Customer PWA functional audit | Reference-only | Use for customer projection and privacy requirements. |
| #284 | Interest selection scheduling | Concept to reimplement | Rebuild staffing/interest selection after lifecycle, concurrency and idempotency contracts are accepted. |
| #285 | Backoffice functional audit | Reference-only | Use for planboard/backoffice findings; no runtime merge. |
| #286 | Credential challenge protocol | Tests/docs to port | Port compatible protocol tests/docs when account recovery workstream starts; rebuild obsolete runtime/migration work. |
| #287 | Personnel PWA functional audit | Reference-only | Use for personnel execution/offline acceptance criteria. |
| #288 | Assignment P0 reproduction | Tests/docs to port | Convert reproduction into deterministic tests for overrides, tenant scope and zero-row update failures. |
| #289 | Availability atomicity | Concept to reimplement | Rebuild atomic availability writes with current-main transaction, conflict and isolation proof. |
| #290 | Finance/worker audit | Later-phase scope | Keep as downstream finance visibility reference; implementation belongs outside W00 and mostly outside Phase 2 core runtime. |
| #292 | Team execution architecture | Concept to reimplement | Use architecture as input for participant aggregation, but implement only after canonical contracts are approved. |

The machine-readable version is `docs/phase-2/stale-pr-disposition.json`.
