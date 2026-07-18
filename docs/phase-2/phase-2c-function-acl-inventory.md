# Phase 2C SECURITY DEFINER and ACL inventory

Fresh PostgreSQL 17 and populated previous-release-upgrade catalog result: 40 `SECURITY DEFINER` functions, all owned by the migration role (`postgres` in the disposable harness), all with explicit trusted `search_path`, none executable by PUBLIC, and an exact fresh/upgrade identity-and-ACL match.

| Group | Count | Signatures / functions | Effective execute ACL |
|---|---:|---|---|
| auth/tenant helpers | 4 | `is_management()`, `is_management_for_tenant(uuid)`, `current_user_tenant_ids()`, `fieldgrid_has_platform_permission(text)` | authenticated |
| personnel RLS helpers | 2 | `personnel_assigned_to_assignment(uuid)`, `personnel_can_access_assignment_storage(uuid,uuid)` | authenticated |
| realtime emitters | 5 | `portal_realtime_emit`, `_management`, `_customer`, `_personnel`, `_assignment` | owner only |
| realtime trigger functions | 15 | assignments, assignment personnel/child/sidecar/interest; quote/invoice/report; payment; tenant/customer/personnel owned; preferences/batches/tickets | owner only |
| staffing/execution | 11 | staffing/status transition, cancel, participant v1/v2, eligibility, recompute; tenant guard, participant guard, reactivation history, execution seed | service entrypoints: service_role; trigger/internal helpers: owner only |
| offline operation receipts | 2 | `begin_offline_operation`, `complete_offline_operation` | service_role |
| credential recovery | 1 | `cleanup_expired_credential_recovery_challenges()` | service_role |

## Path reconciliation

Before Phase 2C, 22 functions had unsafe posture: `is_management()` (unset), `current_user_tenant_ids()` (`public,auth`) and 20 realtime definers (`public`). Phase 2C fixes all 22 by revoking runtime `CREATE` on `public`, placing `pg_catalog` first and `pg_temp` last, and explicitly revoking runtime execute where direct calls are not required.

`is_management()` is schema-qualified internally and no longer PUBLIC-executable. The tenant-scoped helper validates caller id, global compatibility role, active `tenant_users` membership and active tenant. Realtime recipient ids/keys are checked against canonical customer/personnel tenant rows before insertion.

## Ownership decision

Ownership changes: zero. The repository has no approved portable NOLOGIN definer-owner role, and hard-coding `OWNER TO postgres` would make deployment assumptions rather than enforce a portable contract. Fresh and populated-upgrade catalogs identify the current owner as `postgres`; FG-HARD-031 is a P1 accepted infrastructure risk owned by security/database with managed role provisioning due before production go/no-go.

Catalog regression: the PostgreSQL 17 runtime harness asserts all 40 identities, explicit paths, installed owner, no PUBLIC execute, exact runtime grants and non-writable `public` schema for `anon`/`authenticated`. The populated previous-release lane proves the same function and policy catalogs after upgrade (`functionCount = 40`, `policyCount = 204`).
