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

## Remaining blockers

1. Offline notes, extra work and inventory do not have a common durable operation receipt; the participant RPC also lacks atomic expected-version input.
2. Staffing does not re-evaluate availability, leave, overlap and qualifications under its canonical row locks.
3. Realtime trigger fanout still needs recipient-specific generation for staffing/internal report artifacts, monotonic projection versions and live reconnect/out-of-order browser proof.
4. API JWT verification needs issuer, audience, token-class and live deactivation checks.
5. The recovery provider update occurs after grant consumption and needs a recoverable saga.
6. Legacy global `is_management()` policies outside the reviewed Phase 2 workflow remain for a later tenant-policy migration.
7. A portable approved NOLOGIN owner for definer functions is not part of current deployment infrastructure; ownership was therefore inventoried, not guessed or reassigned.
8. The existing “previous-release compatibility” lane validates old call shapes on the current schema, not a populated previous-release database migrated forward.

These are recorded as FG-HARD-026 through FG-HARD-034 in the hardening register. Synthetic W11 constants are not treated as runtime evidence.
