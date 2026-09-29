# Fieldgrid V1

Fieldgrid V1 is a new, tenant-neutral implementation. Legacy applications and
their migrations, services, deployment structures and proxy rules are not a
source of truth for this repository.

## Canonical staging architecture

Staging is the first and only deployment environment currently being designed.
The complete, normative specification is
[`docs/architecture/staging.md`](docs/architecture/staging.md).

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

The customer portal is not part of the current V1 route contract.

Tenant resolution is hostname-only and fail-closed. The platform hostname never
silently selects a tenant, and an unknown tenant hostname never falls back to a
different tenant.

## Git flow

- `main` is the development and source branch; it never deploys automatically.
- `staging` contains deliberate staging promotions from reviewed `main`
  commits. Direct development on `staging` is not allowed.
- A push to `staging` first runs the complete CI suite and deploys that exact
  commit only after every check succeeds.
- There is currently no production branch or production deployment flow.

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
