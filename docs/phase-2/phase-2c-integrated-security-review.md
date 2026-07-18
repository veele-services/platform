# Phase 2C integrated security review

Baseline: `7f57c5a93ec1af6d5553abf190cfd0c3ac300bda` (merged PRs #326, #327 and #328). This review covers the seven direct Phase 2 migrations and their tenancy, RLS, realtime, audit, storage and auth dependencies. It does not claim deployment or production evidence.

## Closed in this branch

- A legacy global `Management` actor could read and mutate Phase 2 rows across tenants. Runtime reproduction returned both Tenant A and Tenant B assignments. The forward fixup adds `is_management_for_tenant(uuid)`, requires an active tenant membership and active tenant, and replaces the relevant workflow, audit, storage and realtime policies.
- `is_management()` was PUBLIC-executable with no fixed path; 20 realtime definers and `current_user_tenant_ids()` also used caller-influenced relation resolution. Runtime roles can no longer create in `public`; all 22 affected functions have explicit trusted paths and explicit ACLs.
- Customer raw-table policies exposed internal workflow columns. They are removed. Customer server actions remain explicit projections, the Data API exposes only the barrier-protected `customer_assignment_projection`, and approved reports/photos now additionally require `visibility_scope = customer_approved`.
- Customer realtime no longer accepts invited rows or JWT email fallback. Customer, personnel and management policies now enforce live database linkage plus active customer/personnel/tenant state.
- Realtime recipient tuples are validated and JSON payload redaction is recursive and case-insensitive.
- Personnel cannot insert customer-approved photos, self-approve material/financial state, or mutate a coworker’s storage evidence.
- Deactivated personnel lose availability and owned-note mutation access. `availability_windows` has an active-own/tenant-management read policy.
- Tenant audit log RLS and `listAuditLog()` are tenant-scoped. Bulk backoffice availability replacement and its audit record are one transaction.
- The obsolete email-only `auth.users` personnel-link trigger is disabled; the current activation path explicitly writes the returned auth user id to the selected tenant-scoped personnel row.

The fix is forward-only (`20260718190000_phase2_security_reconciliation.sql`). Deployed migration history is not amended.

## Authorization conclusions

- Tenant and privilege decisions do not trust writable `user_metadata` or JWT tenant/role claims.
- Customer identity uses exact active `customer_users.user_id`, active customer and active host tenant. Email is display/delivery data, not an RLS authorization fallback.
- Personnel assignment access remains database-derived from active personnel and active assignment links.
- Platform administration remains an application-layer boundary; no generic platform-admin RLS bypass was added.
- Service-only staffing, participant and recovery functions remain unavailable to `anon` and `authenticated`.

## Phase 2C completion closure

- Durable offline receipts now bind tenant, actor, operation id, payload hash and expected lifecycle version. Identical commit-then-client-crash replay returns the canonical result; changed payload reuse and stale versions fail atomically. The browser queue binds its owner and quarantines mismatches.
- Staffing eligibility is re-evaluated under canonical locks for active membership, complete schedule, day/weekly availability, leave, overlap, region, sector, role and qualifications.
- Realtime projections are recipient-specific, recursively redacted for customer delivery and carry monotonic sequence/version plus transaction correlation. All three portal clients ignore malformed, duplicate and out-of-order projections.
- API JWT validation pins issuer, audience, authenticated token class, algorithm, temporal bounds and maximum lifetime, then checks the live provider subject for disablement and revocation timestamps.
- Credential recovery leases a grant before provider mutation, finalizes `used_at` only after success, releases failed claims and persists a provider-applied marker for safe retry after local finalization failure.
- The policy inventory contains no active global `is_management()` policy. Tenant A/B remains isolated and a tenantless legacy Management actor reads zero rows after a populated previous-release upgrade.
- Finance writes enforce provider request idempotency, unique active invoices and locked allocation/overpayment invariants. Report approval and Mollie webhook settlement update all local ledger/workflow/audit rows in one transaction.
- Assignment lifecycle edges and expected versions are database-enforced; support grants carry explicit permission/module allowlists; changed IDOR, storage and audit surfaces derive tenant scope server-side.
- A populated PostgreSQL 17 database built at exact migration `20260718180000_complete_credential_recovery.sql` upgrades forward without reset, row loss, tenant leakage or fresh/upgrade security-catalog drift.

## Remaining decisions

No P0 feature-freeze blocker remains. FG-HARD-018 and FG-HARD-019 retain P1 accepted browser-evidence gaps for interactive invitation acceptance and provider-sandbox payment navigation, owned by quality/browser and auth before the production go/no-go review. FG-HARD-031 retains the P1 accepted infrastructure gap for a dedicated NOLOGIN definer owner, owned by security/database before that review; pinned search paths, no PUBLIC execute and exact ACLs are enforced meanwhile.

FG-HARD-024 intentionally remains the only production-release blocker because this PR does not deploy. The eventual release SHA still requires staging, rollback and a signed production go/no-go packet. Synthetic W11 constants are not treated as runtime evidence.
