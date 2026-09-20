# Production release

Production deploys the exact protected `main` commit only after that same commit has passed Main Exact Head Validation and a successful staging deployment. The separate `fieldgrid-production-deploy.yml` workflow keeps the staging workflow and database bindings unchanged.

## Inventory and configuration

Run `Fieldgrid Production Inventory` from `main` with `expected_main_sha` equal to the current full main SHA. Its artifact contains bounded database metadata, service/release metadata, Caddy host/path/upstream routing and unauthenticated health status codes. It never uploads credentials, response bodies, database rows, private backups or full proxy configuration. Caddy configuration is read only in memory; only validated Fieldgrid hosts, path matchers and localhost upstreams are retained. The separate proxy-capabilities report records effective file and parent-directory permissions, approved configuration/import paths and hashes, and parsed start/reload persistence. An API persistence flag alone does not prove that a service restart or file-based reload preserves an API change.

For a failed private rehearsal, supply its numeric `preflight_run_id` to the inventory workflow. Its diagnostic report contains only fixed error categories, allowed SQLSTATE/process codes and migration names from the reviewed source. Raw command logs and database payloads remain private on the VPS. New rehearsal failures include the same bounded diagnostics automatically.

The production Supabase project is `ckdtiuemeygrnujjibnw`; staging `olyfmekyqozxrbrwwszu` is forbidden. Use the verified production Supavisor session pooler host from the inventory or Supabase connection descriptor, on port 5432. Do not infer a host from staging or use transaction mode for migration/backup sessions.

In the GitHub `production` environment configure:

- `DATABASE_URL`: existing migration-administrator URL, using direct/session port 5432.
- `FIELDGRID_DATABASE_SSL_ROOT_CERT_BASE64`: the pinned Supabase Root 2021 CA.
- `FIELDGRID_RUNTIME_DATABASE_PASSWORD`: a newly generated 64-character lowercase hexadecimal secret, distinct from the administrator password.
- `FIELDGRID_RUNTIME_DATABASE_URL`: `postgresql://fieldgrid_runtime_app.ckdtiuemeygrnujjibnw:<password>@<verified-production-pooler>:5432/postgres`, using exactly that generated password.
- Variable `FIELDGRID_PRODUCTION_DATABASE_POOLER_HOST`: the verified production pooler hostname.
- Variables `BACKOFFICE_PUBLIC_LOGIN_URL`, `PERSONEEL_PUBLIC_HEALTH_URL`, `KLANT_PUBLIC_HEALTH_URL`, `API_PUBLIC_HEALTH_URL`, and `API_PUBLIC_ROOT_URL`: explicit production routes verified against the inventory. Personnel/customer/API routes normally end in `/personeel/healthz`, `/klant/healthz`, `/api/healthz`, and `/rest/v1/` respectively.

The four existing services are `veele-production`, `veele-production-personeel`, `veele-production-klant`, and `veele-production-api`, on distinct ports 3300, 3402, 3403 and 3404. `APP_ENV=production`, `APP_URL=https://app.fieldgrid.nl`, Node 24 and pnpm 11.5.2 are required. Keep the existing independent session, JWT, provider and encryption secrets. Configure `FIELDGRID_CREDENTIAL_RECOVERY_SECRET` before enabling credential recovery. Optional provider secrets retain their existing application behavior.

Generate credentials locally in memory and pass them to `gh secret set --env production NAME` over standard input using a subprocess. Do not put passwords in workflow inputs, shell command arguments, console output, artifacts, documentation or Git. Setting runtime secrets alone does not rotate the live database role; the deploy provisions it after migrations and verifies its exact capabilities before activation.

Ordinary deployments reject a changed password when the active release already
uses the same production runtime role. This is checked before building and again
immediately before provisioning, so the previous release and its rollback
environment remain usable. The initial transition from a legacy administrator
connection is allowed because provisioning does not alter that administrator.

## Rehearsal and release

1. Dispatch `Fieldgrid Production Deploy` on `main` with `operation=preflight`, the full `expected_main_sha`, and `confirmation=production-backup-rehearsal-only-v1`. No staging run ID is needed for rehearsal. The workflow makes a private backup, restores it to an isolated local PostgreSQL instance, applies migrations, and checks migration idempotence. Private backups remain under `/var/www/veele/production/shared/preflight-backups`; only the bounded JSON report is uploaded. The legacy release is diagnosed without modifying its marker.
2. Promote the reviewed main commit to staging and complete a successful staging deploy. Preserve its run ID. Main, staging, the active staging release marker and that successful run must identify the same commit; the run must be less than 24 hours old.
3. Dispatch the production workflow with `operation=deploy`, the same `expected_main_sha`, `staging_deploy_run_id`, and `confirmation=fieldgrid-production-deploy-exact-sha`.
4. Confirm the production run succeeds and inspect `health.json` from its `fieldgrid-production-deploy-<run-id>` artifact. Check the active production release marker and public entrypoints. A successful `preflight` run by itself is not a successful deployment.

The deployment repeats its backup/rehearsal immediately before making live schema changes. It builds into a new release with an isolated `.env` and pinned certificate. The workflow keeps its administrative CA file private (`0600`) in runner temporary storage through all builds, migrations and capability gates. A separate pinned CA copy in the release has mode `0640` and group `veele-deploy`, so the `veele` runtime can read it; only the saved application `.env` references that copy. The application validator accepts exactly `0600` or `0640`; group writes, other-user access, executable/special bits, symlinks and unpinned certificates remain rejected. Administrative certificate tooling retains its existing private-file requirement.

The migration administrator is available only to migration/provisioning steps and is never persisted as the application `DATABASE_URL`. Empty production databases use normal `db:migrate`, which runs generated Drizzle migrations before hand-written migrations; never baseline an empty database.

## Rollback and recovery

Before first deployment, an absent legacy release SHA marker is created only after every deployed source blob matches the immutable legacy commit `eedbf033ec08a12411760acf8ea7f5d5acf8cc20`. Existing markers are preserved. The new release and environment become active together. The health gate restarts the four services, verifies systemd, loopback/public endpoints and release SHA, and automatically restores the previous release and environment if health fails.

Migrations are forward-only; application rollback does not reverse database migrations. Keep the private verified backup and both release directories until acceptance is complete. Previous source/backup compatibility must be assessed before any manual database restoration. A failed pre-activation step leaves the original application environment active. If a failed activation leaves `.env.rollback-<sha>` material, retain it and diagnose the recorded health/activation evidence before retrying that exact SHA; the workflow deliberately refuses to overwrite rollback material.

Required local checks include the production release-proof tests, production runtime-principal tests, backup rehearsal tests, rollback-marker tests, deploy-health tests, typecheck, workspace builds and the repository UI/visual gates. The live production gates must additionally prove the backup/restore, real migration administrator permissions, runtime handshake/capabilities and public proxy routing; unit tests alone cannot establish those facts.
