# Fieldgrid hardening register — Phase 2C reconciliation

Current main SHA: `7f57c5a93ec1af6d5553abf190cfd0c3ac300bda`.

This register is reconciled after merged PRs #326, #327 and #328 and the two successful exact-main runs `29653351657` and `29653565851`. Phase 2C local evidence is explicitly marked partial until its PR is reviewed and merged.

## Operator/staging evidence

The following evidence was manually supplied as operator/staging evidence, not as an automated CI artifact.

- merge/release SHA: `42edb5664ed507ed914b8bebf8847ab1f6e39f74`
- staging deployment run: `29300175423`
- live database ACL/RLS/helper verification: `passed`
- personnel assignment app smoke: `passed`
- assignment-photo Storage smoke: `passed`

## Counts

| status | count |
|---|---:|
| closed | 17 |
| partial | 9 |
| open | 8 |
| deferred | 0 |
| feature-freeze blockers | 16 |
| production release blockers | 17 |

## Canonical items

| id | title | severity | category | status | implementation PRs | runtime proof | next action | owner | freeze blocker | production blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| FG-HARD-001 | assignment_personnel tenant invariant | P0 | security/tenant-isolation | closed | #278, #295 | PostgreSQL 17 runtime safety harness validates assignment_personnel parent tenant invariant | Monitor future assignment_personnel schema changes with source and runtime safety harnesses. | security/database | false | false |
| FG-HARD-002 | assignment_personnel direct authenticated DML closure | P0 | security/rls-acl | closed | #296 | authenticated INSERT/UPDATE/DELETE on assignment_personnel denied in RLS harness; operator/staging evidence: live database ACL/RLS/helper verification passed | Keep direct DML closure in release gate. | security/database | false | false |
| FG-HARD-003 | assignment_personnel direct authenticated SELECT closure | P0 | security/rls-acl | closed | #296 | authenticated direct SELECT on assignment_personnel returns permission denied; operator/staging evidence: live database ACL/RLS/helper verification passed | Retain compatibility lane for previous release query shapes. | security/database | false | false |
| FG-HARD-004 | assignment_personnel ACL least privilege | P0 | security/rls-acl | closed | #295, #296 | service_role retains only required CRUD; PUBLIC/anon/authenticated direct access is revoked; operator/staging evidence: live database ACL/RLS/helper verification passed | Prevent new broad grants in migration-order and security-source checks. | security/database | false | false |
| FG-HARD-005 | assignment_personnel policy removal | P0 | security/rls-policy | closed | #296 | legacy assignment_personnel policies and helper functions are absent after migration | Keep policy-removal assertions immutable. | security/database | false | false |
| FG-HARD-006 | database-derived personnel assignment helper | P0 | security/database-helper | closed | #278, #296 | personnel assignment access derives from active database rows instead of JWT tenant claims; operator/staging evidence: live database ACL/RLS/helper verification passed | Use helper for future personnel assignment checks. | security/database | false | false |
| FG-HARD-007 | assignment-photo personnel Storage path tenant isolation | P0 | storage/tenant-isolation | closed | #296 | storage helper binds assignment-photo path assignment id to tenant-derived personnel assignment; operator/staging evidence: assignment-photo Storage smoke passed | Extend same evidence model to documents, attachments, PDFs, and signed URLs. | storage/security | false | false |
| FG-HARD-008 | staging post-deploy health gate | P0 | release/staging | closed | #291, #294 | post-deploy health gate script and tests cover runtime diagnostics contract; operator/staging evidence: deployment run 29300175423 for release SHA 42edb5664ed507ed914b8bebf8847ab1f6e39f74 passed | Run only against intended staging deployment during release operations. | release | false | false |
| FG-HARD-009 | automatic app rollback | P0 | release/rollback | closed | #291, #294 | health gate includes rollback decision path for failed deployment validation; operator/staging evidence: deployment run 29300175423 for release SHA 42edb5664ed507ed914b8bebf8847ab1f6e39f74 passed | Keep rollback dry-run documented for operators. | release | false | false |
| FG-HARD-010 | release SHA markers | P1 | release/diagnostics | closed | #291, #294 | deployment diagnostics include release SHA marker expectations; operator/staging evidence: deployment run 29300175423 for release SHA 42edb5664ed507ed914b8bebf8847ab1f6e39f74 passed | Keep current SHA marker updated in release notes. | release | false | false |
| FG-HARD-011 | deployment diagnostics | P1 | release/diagnostics | closed | #291, #294 | diagnostic output is contract-tested for health-gate failures; operator/staging evidence: deployment run 29300175423 for release SHA 42edb5664ed507ed914b8bebf8847ab1f6e39f74 passed | Add incident examples after first real staging run. | release | false | false |
| FG-HARD-012 | runtime PostgreSQL 17 harness | P0 | test/runtime | closed | #278 | local PostgreSQL 17 harness applies migrations and exercises runtime database invariants | Keep harness in feature-freeze test baseline. | quality/database | false | false |
| FG-HARD-013 | authenticated RLS harness | P0 | test/security | closed | #278, #296 | authenticated role RLS checks exercise ACL closures and tenant isolation | Run before any production go/no-go. | quality/security | false | false |
| FG-HARD-014 | Tenant A/B DB integration | P0 | test/tenant-isolation | closed | #278 | Tenant A/B fixtures validate cross-tenant denial and same-tenant allow cases | Keep fixtures current with new assignment child tables. | quality/database | false | false |
| FG-HARD-015 | previous-release database compatibility lane | P0 | release/compatibility | closed | #296 | previous release server query shapes run against post-Phase-B database contract | Refresh compatibility base after each production release. | release/database | false | false |
| FG-HARD-016 | assignment/planning IDOR hardening beyond assignment_personnel | P0 | security/idor | partial | #295, #296 | assignment_personnel path has runtime proof; remaining bare-ID actions do not; operator/staging evidence: personnel assignment app smoke passed for Phase-B surface | Rebuild current implementation PR for remaining bare-ID assignment/planning actions and add Tenant A/B runtime tests. | security/application | true | true |
| FG-HARD-017 | Storage/document access beyond assignment photos | P0 | storage/signed-urls | partial | #296 | assignment-photo storage helper runtime evidence only | Implement document/attachment/PDF/signed URL tenant checks with source and runtime tests. | storage/security | true | true |
| FG-HARD-018 | browser E2E portal golden paths | P0 | test/browser-e2e | partial | #291, #294, #328 | exact-main runs 29653351657 and 29653565851 completed the Playwright lane; Phase 2C locally validates the safe customer projection through real PostgREST | Extend the automated lane with invite acceptance, report approval/customer visibility and invoice/payment golden paths. | quality/browser | true | true |
| FG-HARD-019 | auth/invite/reset end-to-end flow | P0 | auth/reset | partial | #327 | credential recovery runtime/Playwright plus Phase 2C source and RLS regressions | Make provider update recoverable after a claimed grant and complete invite/login browser coverage. | auth | true | true |
| FG-HARD-020 | finance/payment/report-to-invoice correctness | P0 | finance/data-integrity | open | — | — | Build implementation PR for payment ledger and report-to-invoice atomic transaction tests. | finance | true | true |
| FG-HARD-021 | status state machine enforcement | P0 | workflow/data-integrity | open | #326 | durable staffing/participant lifecycle runtime checks; broader state model remains incomplete | Implement the remaining canonical state machine and negative transitions. | workflow | true | true |
| FG-HARD-022 | support access least privilege | P0 | support/security | open | — | — | Define and implement audited support access model with tenant-scoped tests. | support/security | true | true |
| FG-HARD-023 | test baseline and CI green lane on current main | P0 | quality/ci | closed | #328 | exact-main runs 29653351657 and 29653565851 succeeded on `7f57c5a9...` with zero failed/cancelled/pending | Keep exact-head validation mandatory in the human merge process. | quality | false | false |
| FG-HARD-024 | production go/no-go evidence pack | P0 | release/production | open | — | — | After blockers close, assemble production go/no-go packet without accessing live DBs or secrets from this PR. | release | false | true |
| FG-HARD-025 | legacy customer reset code must not become auth password | P0 | auth/reset | closed | #327 | PostgreSQL 17 credential-recovery runtime proves hash-only expiry/replay/concurrency/rate-limit/RLS behavior; Playwright proves customer and personnel completion, provider session invalidation and no code-as-password; security-source regression covers all surfaces | Keep PR #327 runtime, browser and source regressions in required CI and monitor provider session behavior after deployment. | auth/customer-portal | false | false |
| FG-HARD-026 | tenant-scoped legacy Management RLS | P0 | security/tenant-isolation | partial | Phase 2C | Tenant A/B matrix and tenantless legacy actor denial | Replace remaining non-Phase-2 global Management policies. | security/database | true | true |
| FG-HARD-027 | realtime recipient, payload and deactivation isolation | P0 | security/realtime | partial | Phase 2C | linked-active actor matrix, tuple validation and recursive redaction | Split internal/customer fanout and add monotonic/live reconnect evidence. | security/realtime | true | true |
| FG-HARD-028 | durable offline operation idempotency | P0 | workflow/offline | open | — | — | Add operation receipts and atomic stale-version rejection. | workflow/offline | true | true |
| FG-HARD-029 | atomic staffing eligibility enforcement | P0 | workflow/staffing | open | — | — | Recheck eligibility under staffing locks and add audited overrides. | workflow/staffing | true | true |
| FG-HARD-030 | API JWT issuer, audience and live deactivation validation | P0 | security/api-auth | open | — | — | Enforce issuer/audience/token class and revocation. | security/api | true | true |
| FG-HARD-031 | SECURITY DEFINER ownership and complete ACL contract | P0 | security/database-functions | partial | Phase 2C | 35-function PostgreSQL 17 catalog inventory | Provision and pin a portable approved NOLOGIN owner. | security/database | true | true |
| FG-HARD-032 | populated previous-release migration compatibility | P0 | release/database | partial | Phase 2C | fresh PG17 and current-main fixture upgrade | Add a sanitized populated previous-release upgrade fixture. | release/database | true | true |
| FG-HARD-033 | tenant-scoped audit log reads and inserts | P0 | security/audit | partial | Phase 2C | application tenant filter and RLS actor denial | Preserve in exact-head CI and define platform audit projection. | security/audit | true | true |
| FG-HARD-034 | recoverable credential provider update saga | P1 | auth/recovery-availability | open | — | — | Finalize `used_at` only after provider success and safely expire failed claims. | auth/recovery | true | true |

## Open PR disposition

| PR | actual type | actual subject | disposition | runtime code exists | action | delete later |
|---:|---|---|---|---|---|---|
| #279 | audit/documentation | cross-surface functional flow map | EXTRACT_EVIDENCE_THEN_CLOSE | false | Extract flow-map evidence into current register/backlog, then close. | true |
| #282 | audit/documentation | platform administration audit | EXTRACT_EVIDENCE_THEN_CLOSE | false | Extract platform administration audit evidence, then close. | true |
| #283 | audit/documentation | customer PWA audit | EXTRACT_EVIDENCE_THEN_CLOSE | false | Extract customer PWA audit evidence, then close. | true |
| #284 | implementation | interest selection and scheduling | RETAIN_REBASE_COMPLETE | true | Retain, rebase on current main, complete implementation and current CI. | false |
| #285 | audit/documentation | tenant backoffice audit | EXTRACT_EVIDENCE_THEN_CLOSE | false | Extract tenant backoffice audit evidence, then close. | true |
| #287 | audit/documentation | personnel PWA audit | EXTRACT_EVIDENCE_THEN_CLOSE | false | Extract personnel PWA audit evidence, then close. | true |
| #288 | reproduction | assignment P0 evidence | EXTRACT_EVIDENCE_THEN_CLOSE | false | Extract assignment P0 reproduction evidence, then close. | true |
| #289 | implementation | atomic personnel availability | RETAIN_REBASE_COMPLETE | true | Retain, rebase, and complete atomic personnel availability implementation. | false |
| #290 | reproduction | finance/webhook/worker integrity pack | EXTRACT_EVIDENCE_THEN_CLOSE | false | Extract finance reproduction evidence; build implementation separately. | true |
| #292 | architecture | multi-person execution model | PARK_ARCHITECTURE | false | Park as architecture reference; do not classify as superseded implementation. | false |
