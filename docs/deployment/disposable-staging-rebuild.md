# Disposable staging rebuild

This route rebuilds only Fieldgrid staging project `olyfmekyqozxrbrwwszu`.
Production project `ckdtiuemeygrnujjibnw` is an explicit deny target. Existing
staging data is not retained or restored.

## One-time host and environment setup

1. Install `ops/sudoers/veele-staging-disposable-rebuild` as a root-owned sudoers
   include and validate it with `visudo -cf`. It grants the runner only exact
   start/stop commands for the enumerated staging writer units.
2. Configure the staging environment secrets for the platform admin and tenant
   A/B manager email/password pairs:
   `FIELDGRID_REBUILD_PLATFORM_ADMIN_EMAIL`,
   `FIELDGRID_REBUILD_PLATFORM_ADMIN_PASSWORD`,
   `FIELDGRID_REBUILD_TENANT_A_MANAGER_EMAIL`,
   `FIELDGRID_REBUILD_TENANT_A_MANAGER_PASSWORD`,
   `FIELDGRID_REBUILD_TENANT_B_MANAGER_EMAIL`, and
   `FIELDGRID_REBUILD_TENANT_B_MANAGER_PASSWORD`.
3. Configure the matching non-secret names/slugs in the staging environment:
   `FIELDGRID_REBUILD_PLATFORM_ADMIN_NAME`, tenant `A`/`B` `SLUG`, `NAME` and
   `MANAGER_NAME`. Each host must equal `<slug>.staging.fieldgrid.nl` and match
   the existing W00 host/ID bindings. Tenant A deliberately uses canonical
   compatibility ID `00000000-0000-0000-0000-000000000010`; configure the W00
   tenant-A ID secret to that value. Tenant B must use a different explicit UUID.
4. Apply the protected-branch prerequisite documented in
   [Main and staging promotion](../operations/main-staging-promotion.md).

## Run

Dispatch `Fieldgrid Disposable Staging Rebuild` on `main` with the exact live
main and staging SHA. Start with operation `plan`; its artifact contains only
counts, fixed identities and digests. It performs no data or service mutation.

For operation `rebuild`, enter this exact confirmation:

```text
fieldgrid-disposable-staging-rebuild-v1:olyfmekyqozxrbrwwszu:<exact-main-sha>
```

The workflow validates exact-main CI, installs and builds the candidate, then
rechecks `main` immediately before stopping writers. It empties the fixed
Storage bucket allowlist via the Storage API, drops only `public`, `app_private`
and `drizzle`, deletes Auth users via the Admin API, runs the canonical forward
migration command, and bootstraps two isolated tenants plus a distinct platform
administrator. Managed Supabase schemas are not reset. The new release is
activated only after database, tenant, runtime-principal and provider checks.
Before deletion, the route disables runtime database login, revokes effective
application DML/RPC access from public API roles, terminates their in-flight
sessions and rejects every unknown login role with inherited write capability.
The normal runtime-principal provisioning step restores only the reviewed
least-privileged runtime login after the new schema exists.

`COMPLETE` is emitted only after the active candidate passes the deployment
health gate and a post-rebuild acceptance run proves platform and both tenant
manager logins, reciprocal tenant-A/B RLS isolation, an authenticated tenant-
scoped Storage upload/read/delete round trip and denial for both another tenant
and an unauthenticated client. A generic health URL alone is not promotable.

The private resumability receipt is stored at
`/var/www/veele/staging/shared/disposable-staging-rebuild/receipt.json` with a
private directory and file mode. It is not uploaded. The public artifact is a
single redacted `result.json`.

## Failure and retry

- Before the destructive boundary, original service states are restored.
- After the boundary, every enumerated writer remains stopped; health failure
  cannot roll back to old code.
- A `COMPLETE` receipt rejects a duplicate rebuild of the same candidate.
- A partial receipt can be superseded only by rerunning the complete exact-main
  rebuild. The original pre-boundary active/inactive service baseline is carried
  across retries and restored only after acceptance succeeds; do not manually
  edit the receipt or start services.
- Never use `supabase db reset`, baseline mode, arbitrary database URLs, schema
  inputs or shell commands for this route.

After a successful rebuild, promote with its exact run ID as described in the
canonical promotion document. Do not merge refs or run a hosted reset by hand.
