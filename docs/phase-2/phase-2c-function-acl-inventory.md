# Phase 2C SECURITY DEFINER and ACL inventory

Fresh PostgreSQL 17 catalog result: 35 Phase 2-relevant `SECURITY DEFINER` functions, all owned by the migration role (`postgres` in the disposable harness), all with explicit `search_path`, and none executable by PUBLIC.

| Group | Count | Signatures / functions | Effective execute ACL |
|---|---:|---|---|
| legacy signup | 1 | `app_private.link_personnel_on_signup()` | owner only; trigger removed |
| auth/tenant helpers | 3 | `is_management()`, `is_management_for_tenant(uuid)`, `current_user_tenant_ids()` | authenticated |
| personnel RLS helpers | 2 | `personnel_assigned_to_assignment(uuid)`, `personnel_can_access_assignment_storage(uuid,uuid)` | authenticated |
| realtime emitters | 5 | `portal_realtime_emit`, `_management`, `_customer`, `_personnel`, `_assignment` | owner only |
| realtime trigger functions | 15 | assignments, assignment personnel/child/sidecar/interest; quote/invoice/report; payment; tenant/customer/personnel owned; preferences/batches/tickets | owner only |
| staffing/execution | 8 | transition, cancel, participant action, recompute; tenant guard, participant guard, reactivation history, execution seed | transition/cancel/participant: service_role; others owner only |
| credential recovery | 1 | `cleanup_expired_credential_recovery_challenges()` | service_role |

## Path reconciliation

Before Phase 2C, 22 functions had unsafe posture: `is_management()` (unset), `current_user_tenant_ids()` (`public,auth`) and 20 realtime definers (`public`). Phase 2C fixes all 22 by revoking runtime `CREATE` on `public`, placing `pg_catalog` first and `pg_temp` last, and explicitly revoking runtime execute where direct calls are not required.

`is_management()` is schema-qualified internally and no longer PUBLIC-executable. The tenant-scoped helper validates caller id, global compatibility role, active `tenant_users` membership and active tenant. Realtime recipient ids/keys are checked against canonical customer/personnel tenant rows before insertion.

## Ownership decision

Ownership changes: zero. The repository has no approved portable NOLOGIN definer-owner role, and hard-coding `OWNER TO postgres` would make deployment assumptions rather than enforce a portable contract. Fresh and upgrade catalogs identify the current owner as `postgres`; FG-HARD-031 remains partial until deployment infrastructure defines and provisions the approved owner role.

Catalog regression: `tests/fieldgrid-phase2c-security-reconciliation.test.mjs` asserts the 35-function inventory, explicit paths, installed owner, no PUBLIC execute, and non-writable `public` schema for `anon`/`authenticated`.
