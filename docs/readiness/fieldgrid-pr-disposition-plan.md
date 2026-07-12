# Fieldgrid PR Disposition Plan

## Keep As Evidence Inputs

| PR | Disposition | Reason |
| --- | --- | --- |
| #279 | keep as source evidence | cross-surface map and original FG-FLOW IDs |
| #281 | keep as architecture evidence | auth provider boundary and dependency inventory |
| #282 | keep as source evidence | platform administration PF gaps |
| #283 | keep as source evidence | customer PWA CPWA gaps |
| #285 | keep as source evidence | tenant backoffice BFA gaps |
| #287 | keep as source evidence | personnel PWA PPWA gaps |
| #288 | keep as reproduction evidence | assignment P0 source-level reproductions |
| #290 | keep as reproduction evidence | finance and async worker threat models and source reproductions |
| #292 | keep as architecture dependency | team execution model, not runtime behavior |

## Candidate Implementations Only

| PR | Candidate area | Disposition |
| --- | --- | --- |
| #278 | runtime safety harness | candidate only; does not close canonical items by itself |
| #284 | interest selection scheduling | candidate only for `FG-HARD-P1-PROD-003` |
| #286 | credential challenge reset protocol | candidate only for `FG-HARD-P0-SEC-001` |
| #289 | personnel availability atomicity | candidate only for `FG-HARD-P1-REL-004` |
| #291 | staging health gate rollback | candidate only for release-gate operations; production behavior not evaluated here |

## Proposed Issue Order

1. `FG-HARD-P2-003` runtime evidence program and test-layer gate
2. `FG-HARD-P0-SEC-001` auth challenge and recovery boundary
3. `FG-HARD-P0-SEC-002` host-bound identity, AAL and tenant profile resolution
4. `FG-HARD-P0-SEC-003` assignment and planning cross-tenant IDOR closure
5. `FG-HARD-P0-SEC-004` assignment status transition bypass removal
6. `FG-HARD-P0-SEC-005` tenant-bound document and media signed URL enforcement
7. `FG-HARD-P0-SEC-006` support, sensitive access and audit isolation
8. `FG-HARD-P0-DATA-001` payment intent, webhook inbox and ledger integrity
9. `FG-HARD-P0-DATA-002` report approval, proposal and invoice atomicity
10. P1 product contract and reliability items in dependency order from the graph
11. P2 hardening items after P0/P1 runtime evidence is in place

## Labels To Create Later

No GitHub issues are created by this PR. Suggested labels:

- `fieldgrid-hardening`
- `evidence-required`
- `P0-security`
- `P0-data-finance`
- `P1-reliability`
- `P1-product-contract`
- `P2-hardening`
- `needs-db-integration`
- `needs-authenticated-rls`
- `needs-browser-e2e`
- `candidate-implementation`

## PR Hygiene

Leave all PRs draft unless a separate review decision changes that. Do not merge, auto-merge, force-push, deploy, dispatch workflows or use live services as part of this consolidation.
