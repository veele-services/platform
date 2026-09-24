# Disposable staging rebuild

This route rebuilds only Fieldgrid staging project `olyfmekyqozxrbrwwszu`.
Production project `ckdtiuemeygrnujjibnw` is an explicit deny target. Existing
staging data is not retained or restored.

## One-time host and environment setup

1. Install `ops/sudoers/veele-staging-disposable-rebuild` as a root-owned sudoers
   include and validate it with `visudo -cf`. It grants the runner only exact
   start/stop commands for the enumerated staging writer units.
2. Configure only `FIELDGRID_REBUILD_PLATFORM_ADMIN_EMAIL`,
   `FIELDGRID_REBUILD_PLATFORM_ADMIN_PASSWORD` and the non-secret
   `FIELDGRID_REBUILD_PLATFORM_ADMIN_NAME`. Permanent rebuild-tenant and W00
   tenant A/B bindings are deliberately not inputs to this route.
3. Apply the protected-branch prerequisite documented in
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
migration command, removes the migration-seeded compatibility tenant and
bootstraps exactly one platform administrator. Managed Supabase schemas are not
reset. The new release is activated only after database, runtime-principal,
platform-only W00 and provider checks.
Before deletion, the route disables runtime database login, revokes effective
application DML/RPC access from public API roles, terminates their in-flight
sessions and rejects every unknown login role with inherited write capability.
The normal runtime-principal provisioning step restores only the reviewed
least-privileged runtime login after the new schema exists.

Disposable staging rebuild eindigt met nul permanente tenants en één platformbeheerder. Tenant-isolatietests gebruiken uitsluitend tijdelijke acceptancefixtures die vóór COMPLETE worden verwijderd.

`COMPLETE` is emitted only after the active candidate passes the deployment
health gate and a post-rebuild acceptance run proves the platform login. That
acceptance run creates two run-bound synthetic Auth users and tenants, proves
both manager logins, reciprocal tenant-A/B RLS isolation, an authenticated
tenant-scoped Storage upload/read/delete round trip and denial for both another
tenant and an unauthenticated client. Its `finally` cleanup removes the exact
Storage object, both database tenants (with dependent rows) and both tagged Auth
users through provider APIs. A cleanup failure safe-stops the deployment and
forbids `COMPLETE`.

The final report contains safe counts and digests proving zero tenants and
tenant memberships, zero tenant-scoped rows, zero Storage objects, exactly one
Auth account with canonical platform-owner metadata, and exactly one matching
active `platform_users` owner. The promotion validator requires that complete
final-state object; acceptance booleans alone are insufficient.

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
