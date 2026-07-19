# Fieldgrid hardening register — Phase 2D closeout

Phase 2D starting main: `415c5531304091f043652b5fc3aaffca98d15c06` (merged Phase 2 PRs #326, #327, #328, #329 and #332). Runtime-derived local acceptance is green; the committed candidate still requires exact-head GitHub CI and human review. No deployment, staging update or production action is claimed.

The register classifies every non-closed item as either a release blocker or an accepted lower-severity risk with an owner and milestone. There are no unresolved P0 feature-freeze blockers. Production promotion remains blocked by FG-HARD-024 until the eventual release SHA has its own staging, rollback and go/no-go packet.

## Counts

| status | count |
|---|---:|
| closed | 30 |
| partial | 3 |
| open | 1 |
| deferred | 0 |
| feature-freeze blockers | 0 |
| production release blockers | 1 |

## Remaining accepted risks

| id | severity | release-blocking | exact risk scenario | owner | milestone | rationale |
|---|---|---|---|---|---|---|
| FG-HARD-018 | medium | no | A browser-only regression in invitation acceptance or interactive payment navigation could escape lower-layer runtime and source tests. | quality/browser | browser evidence expansion before the production go/no-go review | Real Playwright already covers all four surfaces, credential recovery, customer report visibility and invoice visibility; the remaining gap is orchestration evidence rather than an unfinished security or data-integrity control. |
| FG-HARD-019 | medium | no | An invite/login browser integration regression could remain undetected although recovery and authorization contracts are enforced below the browser layer. | auth | invite/login browser expansion before the production go/no-go review | Phase 2C closes provider-update recovery, session revocation, live identity checks and email-link removal; only broad invite/login browser orchestration remains. |
| FG-HARD-031 | medium | no | SECURITY DEFINER functions remain owned by the migration owner instead of a dedicated NOLOGIN role, increasing impact if that owner is misused. | security/database | managed database role provisioning before production go/no-go | Portable migrations cannot assume CREATEROLE or role membership. Every definer has a pinned trusted search_path, no PUBLIC execute and an exact runtime-role ACL; fresh and populated-upgrade catalogs match. |

## Remaining release blockers

| id | severity | classification | release-blocking | exact risk scenario | owner | required resolution |
|---|---|---|---|---|---|---|
| FG-HARD-024 | medium | production-release-blocking-only | yes | Production could be promoted without staging, rollback and exact release decision evidence. | release | Release owner must assemble and approve the staging, rollback and go/no-go packet for the eventual release SHA before production promotion. |

## Canonical items

| id | title | severity | status | implementation PRs | runtime proof | owner | freeze blocker | production blocker |
|---|---|---|---|---|---|---|---|---|
| FG-HARD-001 | assignment_personnel tenant invariant | P0 | closed | #278, #295 | PostgreSQL 17 runtime safety harness validates assignment_personnel parent tenant invariant | security/database | false | false |
| FG-HARD-002 | assignment_personnel direct authenticated DML closure | P0 | closed | #296 | authenticated INSERT/UPDATE/DELETE on assignment_personnel denied in RLS harness operator/staging evidence: live database ACL/RLS/helper verification passed | security/database | false | false |
| FG-HARD-003 | assignment_personnel direct authenticated SELECT closure | P0 | closed | #296 | authenticated direct SELECT on assignment_personnel returns permission denied operator/staging evidence: live database ACL/RLS/helper verification passed | security/database | false | false |
| FG-HARD-004 | assignment_personnel ACL least privilege | P0 | closed | #295, #296 | service_role retains only required CRUD; PUBLIC/anon/authenticated direct access is revoked operator/staging evidence: live database ACL/RLS/helper verification passed | security/database | false | false |
| FG-HARD-005 | assignment_personnel policy removal | P0 | closed | #296 | legacy assignment_personnel policies and helper functions are absent after migration | security/database | false | false |
| FG-HARD-006 | database-derived personnel assignment helper | P0 | closed | #278, #296 | personnel assignment access derives from active database rows instead of JWT tenant claims operator/staging evidence: live database ACL/RLS/helper verification passed | security/database | false | false |
| FG-HARD-007 | assignment-photo personnel Storage path tenant isolation | P0 | closed | #296 | storage helper binds assignment-photo path assignment id to tenant-derived personnel assignment operator/staging evidence: assignment-photo Storage smoke passed | storage/security | false | false |
| FG-HARD-008 | staging post-deploy health gate | P0 | closed | #291, #294 | post-deploy health gate script and tests cover runtime diagnostics contract operator/staging evidence: deployment run 29300175423 for release SHA 42edb5664ed507ed914b8bebf8847ab1f6e39f74 passed | release | false | false |
| FG-HARD-009 | automatic app rollback | P0 | closed | #291, #294 | health gate includes rollback decision path for failed deployment validation operator/staging evidence: deployment run 29300175423 for release SHA 42edb5664ed507ed914b8bebf8847ab1f6e39f74 passed | release | false | false |
| FG-HARD-010 | release SHA markers | P1 | closed | #291, #294 | deployment diagnostics include release SHA marker expectations operator/staging evidence: deployment run 29300175423 for release SHA 42edb5664ed507ed914b8bebf8847ab1f6e39f74 passed | release | false | false |
| FG-HARD-011 | deployment diagnostics | P1 | closed | #291, #294 | diagnostic output is contract-tested for health-gate failures operator/staging evidence: deployment run 29300175423 for release SHA 42edb5664ed507ed914b8bebf8847ab1f6e39f74 passed | release | false | false |
| FG-HARD-012 | runtime PostgreSQL 17 harness | P0 | closed | #278 | local PostgreSQL 17 harness applies migrations and exercises runtime database invariants | quality/database | false | false |
| FG-HARD-013 | authenticated RLS harness | P0 | closed | #278, #296 | authenticated role RLS checks exercise ACL closures and tenant isolation | quality/security | false | false |
| FG-HARD-014 | Tenant A/B DB integration | P0 | closed | #278 | Tenant A/B fixtures validate cross-tenant denial and same-tenant allow cases | quality/database | false | false |
| FG-HARD-015 | previous-release database compatibility lane | P0 | closed | #296 | previous release server query shapes run against post-Phase-B database contract | release/database | false | false |
| FG-HARD-016 | assignment/planning IDOR hardening beyond assignment_personnel | P0 | closed | #295, #296, #329 | Phase 2C source inventory and Tenant A/B API/runtime checks prove tenant derivation for the remaining assignment, personnel, customer, object and invoice bare-ID surfaces. | security/application | false | false |
| FG-HARD-017 | Storage/document access beyond assignment photos | P0 | closed | #296, #329 | Personnel document actions require immutable auth-user linkage plus tenant-bound document paths; report PDF photos are tenant/path validated; PostgreSQL 17 RLS covers storage object paths. | storage/security | false | false |
| FG-HARD-018 | browser E2E portal golden paths | P1 | partial | #291, #294, #328 | Exact-head Playwright validates backoffice, platform, personnel and customer isolation, credential recovery, approved report visibility and invoice visibility. | quality/browser | false | false |
| FG-HARD-019 | auth/invite/reset end-to-end flow | P1 | partial | #327, #329 | PostgreSQL 17 and Playwright prove recovery completion, provider retry/finalization, session invalidation and no code-as-password behavior. | auth | false | false |
| FG-HARD-020 | finance/payment/report-to-invoice correctness | P0 | closed | #329, #332 | PostgreSQL 17 enforces unique active invoices, stable provider idempotency, exact outstanding amounts, allocation integrity, fail-closed webhook verification and monotonic payment state. | finance | false | false |
| FG-HARD-021 | status state machine enforcement | P0 | closed | #326, #329 | The database rejects direct status mutation and invalid edges, requires expected lifecycle versions and advances the monotonic lifecycle version atomically. | workflow | false | false |
| FG-HARD-022 | support access least privilege | P0 | closed | #329 | Support access requires an active tenant-bound grant with explicit permission and module allowlists; legacy grants receive zero rights; activation and use are audit fail-closed. | support/security | false | false |
| FG-HARD-023 | test baseline and CI green lane on current main | P0 | closed | #328 | automatic exact-main run 29653351657 succeeded on 7f57c5a93ec1af6d5553abf190cfd0c3ac300bda workflow-dispatch run 29653565851 succeeded on the same exact main head with zero failed, cancelled or pending checks | quality | false | false |
| FG-HARD-024 | production go/no-go evidence pack | P0 | open | — | Phase 2D runtime acceptance is generated from observed exact-head sources, but staging validation, rollback rehearsal and a signed production decision remain absent. | release | false | true |
| FG-HARD-025 | legacy customer reset code must not become auth password | P0 | closed | #327 | pnpm fieldgrid:test:credential-recovery-runtime proves hash-only storage, expiry, replay denial, supersede/revoke, cross-context denial, concurrency, durable rate limits, audit redaction and RLS/ACL on PostgreSQL 17 pnpm fieldgrid:playwright proves real customer and personnel recovery journeys plus two provider password updates with session invalidation and no reset code used as a password pnpm fieldgrid:test:security-source keeps the reset-code-as-password regression closed across every recovery surface | auth/customer-portal | false | false |
| FG-HARD-026 | tenant-scoped legacy Management RLS | P0 | closed | #329 | Fresh and populated-upgrade PostgreSQL 17 runs find zero active global is_management policies; Tenant A/B stays isolated and a legacy tenantless Management actor reads zero rows. | security/database | false | false |
| FG-HARD-027 | realtime recipient, payload and deactivation isolation | P0 | closed | #329 | Recipient-specific projections carry monotonic sequence/version and transaction correlation; customer payloads are recursively redacted; all portal clients discard invalid, duplicate and out-of-order messages. | security/realtime | false | false |
| FG-HARD-028 | durable offline operation idempotency | P0 | closed | #329 | PostgreSQL 17 proves identical replay returns the canonical result, changed payload reuse is rejected, stale expected versions fail atomically and operation receipts remain tenant/actor bound; real Playwright proves an offline task mutation survives failed reconnect and refresh, then converges and is removed after successful idempotent replay. | workflow/offline | false | false |
| FG-HARD-029 | atomic staffing eligibility enforcement | P0 | closed | #329 | The locked staffing path rechecks active membership, complete schedule, availability, leave, overlap, region, sector, role and qualifications before assignment; negative runtime cases are denied. | workflow/staffing | false | false |
| FG-HARD-030 | API JWT issuer, audience and live deactivation validation | P0 | closed | #329 | API runtime denies wrong issuer, audience, role, algorithm, malformed, expired, future-not-before and excessive-lifetime tokens, revoked or disabled users, wrong surfaces and writable-metadata escalation. | security/api | false | false |
| FG-HARD-031 | SECURITY DEFINER ownership and complete ACL contract | P1 | partial | — | Fresh and populated-upgrade PostgreSQL 17 catalogs match exactly for SECURITY DEFINER identities, pinned search paths and narrow ACL grants. | security/database | false | false |
| FG-HARD-032 | populated previous-release migration compatibility | P0 | closed | #329 | A disposable PostgreSQL 17 database is built only through migration 20260718180000, populated with two tenants, staffing, execution actuals, reports, realtime and recovery state, then upgraded forward with row counts and security catalogs preserved. | release/database | false | false |
| FG-HARD-033 | tenant-scoped audit log reads and inserts | P0 | closed | #329 | Tenant A/B runtime checks deny tenantless/global reads and cross-tenant audit access; all changed mutation surfaces write tenant context and the application read remains current-tenant filtered. | security/audit | false | false |
| FG-HARD-034 | recoverable credential provider update saga | P1 | closed | #327, #329 | Recovery claims lease the grant, finalize used only after provider success, release safely after provider failure and persist a provider-applied claim marker so a local-finalization retry never changes the password twice. | auth/recovery | false | false |

## Evidence boundary

- Local PostgreSQL 17 evidence covers fresh migration, Tenant A/B database integration, authenticated RLS, API runtime, credential recovery and a populated exact-previous-release upgrade.
- Source and domain lanes cover JWT claim validation, support grant allowlists, tenant-scoped IDOR/storage/audit surfaces, state transitions, monotonic realtime replay and offline queue ownership.
- Real Playwright covers backoffice, platform, personnel and customer isolation, customer-visible approved reports and invoices, and customer/personnel credential recovery.
- No deployment was created and `staging` and `production` were not modified.

## Historical operator/staging evidence

This evidence was manually supplied from the prior release, not generated by Phase 2C: release SHA `42edb5664ed507ed914b8bebf8847ab1f6e39f74`, staging run `29300175423`, live ACL/RLS/helper verification passed, personnel assignment smoke passed and assignment-photo Storage smoke passed.

## Legacy PR and backlog disposition

Legacy Phase 2 triage is complete and there are zero open overlapping pull requests. The old dispositions remain in the JSON register under `historicalPrDispositions`; `openPrDispositions` is empty.

The non-blocking requirements preserved for the production go/no assessment are issues #330, #331, #333 and #334. They do not reopen a Phase 2 implementation blocker and do not close FG-HARD-024.
