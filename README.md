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

- `https://{slug}.staging.fieldgrid.nl/personeel`
- `https://{slug}.staging.fieldgrid.nl/backoffice`
- `https://{slug}.staging.fieldgrid.nl/klant`

Tenant resolution is hostname-only and fail-closed. The platform hostname never
silently selects a tenant, and an unknown tenant hostname never falls back to a
different tenant.

## Git flow

- `main` is the development and source branch; it never deploys automatically.
- `staging` contains deliberate staging promotions from reviewed `main`
  commits. Direct development on `staging` is not allowed.
- A later push or merge to `staging` may start the staging deployment after its
  workflow has been designed and approved.
- There is currently no production branch or production deployment flow.

## Current phase

This phase records architecture only. It does not install services, alter
Caddy, create VPS directories, start a runner, create a Supabase project, run
migrations or add deployment automation. `.env.example` records the public
configuration contract with placeholders and contains no secret values.

The previous implementation is preserved in the
`archive/pre-rebuild-20260928-*` branches.
