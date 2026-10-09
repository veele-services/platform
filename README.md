# Fieldgrid 1.0.0

Fieldgrid V1 is a new, tenant-neutral implementation. Legacy applications and
their migrations, services, deployment structures and proxy rules are not a
source of truth for this repository.

## Canonical staging architecture

Staging was accepted as V1 on 7 October 2026. Production uses
the same VPS with a separate runtime and a separate Supabase project; see
[the production architecture](docs/architecture/production.md) and
[the production setup and configuration inventory](docs/deployment/production-runbook.md).
The complete, normative specification is
[`docs/architecture/staging.md`](docs/architecture/staging.md).
The platform workspace, onboarding, module-entitlement and template contracts
are documented in
[`docs/architecture/platform-backoffice.md`](docs/architecture/platform-backoffice.md).

Fixed staging values:

| Setting | Value |
|---|---|
| Public platform origin | `https://staging.fieldgrid.nl` |
| Tenant origin | `https://{slug}.staging.fieldgrid.nl` |
| Next.js listener | `127.0.0.1:3301` |
| Deploy root | `/opt/fieldgrid/staging` |
| Service | `fieldgrid@staging.service` |
| Healthcheck | `https://staging.fieldgrid.nl/api/healthz` |

Tenant portals remain on one tenant hostname:

- `https://{slug}.staging.fieldgrid.nl/app` (backoffice)
- `https://{slug}.staging.fieldgrid.nl/staff` (personnel)
- `https://{slug}.staging.fieldgrid.nl/klant` (explicitly bound customer contacts)

Product releases follow [semantic versioning](docs/releases/versioning.md), with
an immutable Git tag on the exact deployed SHA and a [changelog](CHANGELOG.md).
The released functionality, verification and next priorities are recorded in
the [Fieldgrid 1.0.0 codebase analysis](docs/releases/fieldgrid-1.0.0-codebase-analyse.md).

Tenant resolution is hostname-only and fail-closed. The platform hostname never
silently selects a tenant, and an unknown tenant hostname never falls back to a
different tenant.

## Git flow

- `main` is the development and source branch; it never deploys automatically.
- `staging` contains deliberate staging promotions from reviewed `main`
  commits. Direct development on `staging` is not allowed.
- A push to `staging` first runs the complete CI suite and deploys that exact
  commit only after every check succeeds.
- `production` receives only explicitly accepted, reviewed `main` commits with
  green main CI and a successful staging deployment for that same SHA. Its
  workflow uses only Environment `production` and separate credentials.

## Deploying staging

The GitHub Environment `staging` now contains the required staging variables
and secrets. It is the only configuration source for staging; legacy code, old
branches and old environments are never fallbacks. The expected Supabase ref
identifies the new staging project and the forbidden ref identifies production.

Secret values remain exclusively in GitHub and their providers. `.env.example`
records fixed non-secret values and placeholders only. Follow
[`docs/deployment/staging-runbook.md`](docs/deployment/staging-runbook.md) to
prepare the runner and VPS, promote an accepted `main` SHA to `staging`, and
bootstrap the first platform administrator. The workflow never falls back to
legacy configuration.

The previous implementation is preserved in the
`archive/pre-rebuild-20260928-*` branches.
