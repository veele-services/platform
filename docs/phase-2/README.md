# Fieldgrid Phase 2 Program Bootstrap

Branch: `phase2/w00-program-bootstrap`  
Target: `main`  
Required starting `main` SHA: `c13327593599e78abb266b0e6a231feac4aaa8f2`  
Required starting `staging` SHA: `c13327593599e78abb266b0e6a231feac4aaa8f2`

## Objective

W00 creates the authoritative Phase 2 execution contract before runtime implementation begins. It intentionally changes only documentation and a focused static validation test.

Phase 2 covers assignment/planning correctness, planned versus actual execution time, staffing and interest selection, availability and eligibility, multi-person execution, realtime updates, planboard UX, personnel PWA/offline behavior, customer downstream visibility, account activation/recovery, responsive shared UI foundations and deterministic acceptance evidence.

## Safety constraints

- Do not modify application runtime code in W00.
- Do not create migrations in W00.
- Do not deploy, touch live services, modify staging/production, merge the PR or mark it ready.
- Keep the PR draft.
- Old PRs are evidence/design inputs only unless a later workstream explicitly rebuilds them from current `main`.

## Canonical contract documents

- `domain-contracts.md` defines lifecycle, time, staffing, execution, visibility, event, concurrency and idempotency rules.
- `dependency-graph.md` describes the workstream DAG.
- `workstreams.json` is the machine-readable workstream source of truth.
- `cross-surface-acceptance-matrix.md` defines deterministic acceptance surfaces.
- `file-ownership-map.md` assigns future implementation ownership.
- `stale-pr-disposition.md` and `stale-pr-disposition.json` classify old PRs.

## Runtime inventory expectation

No runtime inventory change is expected from W00. Any runtime entrypoint, migration, workflow or application code delta should block review unless it is separately justified as docs-validation-only work.
