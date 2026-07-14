# Fieldgrid hardening register — Phase B current

Current main SHA: `42edb5664ed507ed914b8bebf8847ab1f6e39f74`.

Old draft PR #293 is acknowledged as a source only. This register is rebuilt from current main after merged PRs #278, #291, #294, #295, and #296.

## Counts

| status | count |
|---|---:|
| closed | 15 |
| partial | 5 |
| open | 4 |
| deferred | 0 |
| feature-freeze blockers | 9 |

## Canonical items

| id | title | severity | category | status | implementation PRs | runtime proof | next action | owner | freeze blocker |
|---|---|---|---|---|---|---|---|---|---|
| FG-HARD-001 | assignment_personnel tenant invariant | P0 | security/tenant-isolation | closed | #278, #295 | PostgreSQL 17 runtime safety harness validates assignment_personnel parent tenant invariant. | Monitor future assignment_personnel schema changes with source and runtime safety harnesses. | security/database | false |
| FG-HARD-002 | assignment_personnel direct authenticated DML closure | P0 | security/rls-acl | closed | #296 | authenticated INSERT/UPDATE/DELETE denied in RLS harness. | Keep direct DML closure in release gate. | security/database | false |
| FG-HARD-003 | assignment_personnel direct authenticated SELECT closure | P0 | security/rls-acl | closed | #296 | authenticated direct SELECT returns permission denied. | Retain compatibility lane for previous release query shapes. | security/database | false |
| FG-HARD-004 | assignment_personnel ACL least privilege | P0 | security/rls-acl | closed | #295, #296 | service_role keeps required CRUD; PUBLIC/anon/authenticated direct access revoked. | Prevent new broad grants. | security/database | false |
| FG-HARD-005 | assignment_personnel policy removal | P0 | security/rls-policy | closed | #296 | legacy policies and helper functions absent after migration. | Keep policy-removal assertions immutable. | security/database | false |
| FG-HARD-006 | database-derived personnel assignment helper | P0 | security/database-helper | closed | #278, #296 | access derives from active database rows, not JWT tenant claims. | Use helper for future checks. | security/database | false |
| FG-HARD-007 | assignment-photo personnel Storage path tenant isolation | P0 | storage/tenant-isolation | closed | #296 | storage helper binds path assignment id to tenant-derived personnel assignment. | Extend to documents, attachments, PDFs, and signed URLs. | storage/security | false |
| FG-HARD-008 | staging post-deploy health gate | P0 | release/staging | closed | #291, #294 | health gate script and tests cover diagnostics contract. | Run only against intended staging deployment. | release | false |
| FG-HARD-009 | automatic app rollback | P0 | release/rollback | closed | #291, #294 | health gate includes rollback decision path. | Keep rollback dry-run documented. | release | false |
| FG-HARD-010 | release SHA markers | P1 | release/diagnostics | closed | #291, #294 | deployment diagnostics include SHA marker expectations. | Keep SHA marker updated. | release | false |
| FG-HARD-011 | deployment diagnostics | P1 | release/diagnostics | closed | #291, #294 | diagnostic output contract-tested. | Add incident examples after real staging run. | release | false |
| FG-HARD-012 | runtime PostgreSQL 17 harness | P0 | test/runtime | closed | #278 | local PostgreSQL 17 applies migrations and exercises invariants. | Keep in feature-freeze baseline. | quality/database | false |
| FG-HARD-013 | authenticated RLS harness | P0 | test/security | closed | #278, #296 | authenticated role RLS checks ACL closures and tenant isolation. | Run before production go/no-go. | quality/security | false |
| FG-HARD-014 | Tenant A/B DB integration | P0 | test/tenant-isolation | closed | #278 | Tenant A/B fixtures validate cross-tenant denial and allow cases. | Keep fixtures current. | quality/database | false |
| FG-HARD-015 | previous-release database compatibility lane | P0 | release/compatibility | closed | #296 | previous release server query shapes run against post-Phase-B database contract. | Refresh base after each production release. | release/database | false |
| FG-HARD-016 | assignment/planning IDOR hardening beyond assignment_personnel | P0 | security/idor | partial | #295, #296 | assignment_personnel path has runtime proof; remaining bare-ID actions do not. | Rebuild current implementation PR for remaining bare-ID assignment/planning actions. | security/application | true |
| FG-HARD-017 | Storage/document access beyond assignment photos | P0 | storage/signed-urls | partial | #296 | assignment-photo storage helper runtime evidence only. | Implement document/attachment/PDF/signed URL tenant checks. | storage/security | true |
| FG-HARD-018 | browser E2E portal golden paths | P0 | test/browser-e2e | partial | #291, #294 | manual staging smoke evidence only. | Add automated Playwright golden paths. | quality/browser | true |
| FG-HARD-019 | auth/invite/reset end-to-end flow | P0 | auth/reset | partial | — | provider mock evidence only. | Retain/rebase auth reset implementation branch and prove full flow. | auth | true |
| FG-HARD-020 | finance/payment/report-to-invoice correctness | P0 | finance/data-integrity | partial | — | reproduction evidence only. | Build payment ledger and report-to-invoice atomic transaction tests. | finance | true |
| FG-HARD-021 | status state machine enforcement | P0 | workflow/data-integrity | open | — | — | Implement canonical status state machine and invalid-transition tests. | workflow | true |
| FG-HARD-022 | support access least privilege | P0 | support/security | open | — | — | Define and implement audited support access model. | support/security | true |
| FG-HARD-023 | test baseline and CI green lane on current main | P0 | quality/ci | open | — | — | Make required validation green on current branch. | quality | true |
| FG-HARD-024 | production go/no-go evidence pack | P0 | release/production | open | — | — | Assemble production go/no-go packet after blockers close. | release | true |

## Open PR disposition

| PR | disposition | action | delete later |
|---:|---|---|---|
| #279 | retain-and-rebase | Rebase only if auth/reset implementation remains useful. | false |
| #280 | implementation-required | Use finance reproduction source, then rebuild implementation. | true |
| #281 | rebuild-current | Rebuild remaining assignment/planning IDOR hardening. | true |
| #282 | rebuild-current | Rebuild storage/document/signed URL coverage. | true |
| #283 | park-architecture | Park architecture notes until implementation exists. | false |
| #284 | rebuild-current | Rebuild browser E2E golden paths. | true |
| #285 | retain-and-rebase | Retain if reusable status state machine implementation exists. | false |
| #286 | park-architecture | Keep as support access architecture reference. | false |
| #287 | implementation-required | Extract payment ledger evidence and rebuild. | true |
| #288 | implementation-required | Extract report-to-invoice reproduction and implement atomicity. | true |
| #289 | close-after-evidence-extraction | Extract evidence into this register, then close. | true |
| #290 | rebuild-current | Rebuild test baseline fixes on current main. | true |
| #292 | superseded-by-register | Close once register PR is accepted. | true |
| #293 | superseded-by-register | Source only; close after replacement. | true |
