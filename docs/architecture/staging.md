# Fieldgrid V1 staging architecture

Status: **canonical**

Scope: staging only

This document is the architectural source of truth for the first Fieldgrid V1
environment. It deliberately does not describe production. Any later
implementation that conflicts with this document requires an explicit
architecture decision and a corresponding documentation update first.

## 1. Principles

1. Fieldgrid V1 is a clean implementation. Existing applications, database
   migrations, Caddy rules, service definitions and port assignments are
   legacy, not reusable architecture.
2. Staging is built and accepted before production is designed.
3. Every staging resource is isolated from production: database, credentials,
   runtime configuration, release storage and future runner.
4. Tenant selection is hostname-only and fail-closed.
5. No credential or secret value is committed to Git.

## 2. Source and promotion branches

| Branch | Responsibility | Deployment behaviour |
|---|---|---|
| `main` | Development and stable source history | Never deploys automatically |
| `staging` | Explicit promotions of reviewed `main` commits | Runs full CI, then deploys that exact commit |
| `production` | Not present in this phase | Must not be created or deployed |

Development happens on `main` or short-lived branches merged into `main`.
`staging` is not a development branch. A staging promotion deliberately moves
`staging` to a selected commit that is already contained in `main`. The initial
`staging` branch starts at exactly the same commit as the documented `main`.

`main` runs CI but never deploys. The `staging` workflow runs the same reusable
verification suite, including the required Playwright flows, before its deploy
job can start. It also proves that the branch tip equals the workflow SHA and
that this SHA is contained in `origin/main`.

## 3. Runtime contract

| Property | Canonical staging value |
|---|---|
| Environment identity | `staging` |
| Public platform origin | `https://staging.fieldgrid.nl` |
| Internal listen address | `127.0.0.1` |
| Internal port | `3301` |
| Deploy root | `/opt/fieldgrid/staging` |
| systemd template | `/etc/systemd/system/fieldgrid@.service` |
| systemd instance | `fieldgrid@staging.service` |
| Healthcheck | `https://staging.fieldgrid.nl/api/healthz` |

The deployment-environment identity `staging` is distinct from any
framework-specific `APP_ENV` enum. An implementation must inspect and obey the
actual application validation rather than assuming that `APP_ENV=staging` is
accepted.

### Filesystem layout

The future staging runtime uses this layout:

```text
/opt/fieldgrid/staging/
├── releases/
│   └── <release>/
├── shared/
│   └── <runtime configuration and secrets>
└── current -> /opt/fieldgrid/staging/releases/<release>
```

`current` is an atomic symlink to the active release. Releases are immutable;
mutable runtime configuration belongs under `shared/`. Secrets must be readable
only by the service identity. The precise release identifier may later be the
full Git SHA, but it must always map unambiguously to the deployed commit.

Port 3301 is internal. The firewall must not expose it publicly and the process
must bind to `127.0.0.1`, not to all interfaces.

## 4. Routing and tenant resolution

| URL | Meaning |
|---|---|
| `https://staging.fieldgrid.nl` | Public Fieldgrid staging/platform page; no tenant context |
| `https://{slug}.staging.fieldgrid.nl` | Public page for exactly one tenant |
| `https://{slug}.staging.fieldgrid.nl/app` | Backoffice for that tenant |
| `https://{slug}.staging.fieldgrid.nl/staff` | Personnel portal for that tenant |

All workspaces are paths on the same tenant origin. The Object 360 request of
30 September 2026 adds `/klant` solely for explicitly bound customer users:
their object visits, appointment requests and explicitly permitted secure
object management. A contact email is not an access grant. No global customer
role, separate planning or general customer administration is introduced.
The commercial module adds `/klant/aanvragen` for requests and offers within those
same explicit bindings, and `/aanvraag` for public intake on an active tenant host.
External version-bound offer links do not grant general portal access. See
[`commercial.md`](commercial.md) for the data and release contract.
Klant 360 adds the canonical backoffice dossier at `/app/klanten/[customerId]`
and `/klant/documenten` for explicitly shared customer documents, approved
reports and scoped invoices. Current object bindings remain authoritative.
See [Dossier 360](dossier-360.md#klant-360-customer-workspace).
Separate backoffice or personnel subdomains must not be introduced.

Tenant context is determined exclusively from the validated request hostname:

1. Normalize and validate the host; reject malformed, non-ASCII or unexpected
   multi-label hosts.
2. The exact base hostname `staging.fieldgrid.nl` resolves to platform context,
   never to a default tenant.
3. Exactly one label before `.staging.fieldgrid.nl` is a candidate tenant slug.
4. Validate the slug format and look up exactly one active tenant.
5. An invalid, unknown, inactive or ambiguous slug returns a closed error such
   as HTTP 404. It never falls back to another tenant or a remembered tenant.
6. Once resolved, the tenant context is fixed for the entire request and must
   constrain every tenant-owned query and mutation.

Path parameters, query parameters, cookies and request bodies cannot override
the hostname-derived tenant. Proxy host headers may only be trusted from the
known local reverse proxy.

## 5. Caddy boundary

The currently installed Caddy configuration and its legacy port range
3301–3306 are not canonical and must not be copied.

The repository contains a staging-only reference configuration that terminates
TLS for:

- `staging.fieldgrid.nl`;
- `*.staging.fieldgrid.nl`.

Both route to `127.0.0.1:3301`. Wildcard DNS and certificate issuance must be
configured and validated by the VPS operator. Caddy requires a DNS challenge
and the matching DNS-provider module for the wildcard certificate. No old
website-runtime or origin hostnames are reintroduced without an explicit
architecture decision.

Repository changes do not modify the live Caddy installation.

## 6. Healthcheck contract

`GET /api/healthz` is a server endpoint and returns at minimum:

```json
{
  "status": "ok",
  "environment": "staging",
  "release": "<exact deployed git sha>"
}
```

A later deployment is successful only when all of these conditions hold:

1. the endpoint is reachable over the public HTTPS origin;
2. the response is HTTP 200 and valid JSON;
3. `status` is exactly `ok`;
4. `environment` is exactly `staging`;
5. `release` exactly equals the GitHub SHA selected for that deployment.

HTTP 200 by itself is insufficient. A stale process serving a different release
must fail deployment validation.

## 7. Supabase isolation

Staging receives a new, dedicated Supabase project. No existing production or
legacy project is used as its starting point.

| Guard | Value |
|---|---|
| `EXPECTED_SUPABASE_PROJECT_REF` | Present in GitHub Environment `staging`; identifies the new staging project and remains out of Git |
| `FORBIDDEN_SUPABASE_PROJECT_REF` | `ckdtiuemeygrnujjibnw` |

Starting the runtime, running migrations and creating backups must all fail
closed when:

- the expected staging ref is absent;
- expected and forbidden refs are equal;
- a configured Supabase URL resolves to the forbidden ref;
- a migration or backup connection resolves to the forbidden ref;
- the actual connection cannot be proven to belong to the expected staging ref.

Staging uses its own publishable key, server secret, database credentials, Auth
configuration and Storage configuration. Production credentials must never be
available to the staging runner or runtime.

The dedicated staging project has been created and its connection material is
available only through GitHub Environment `staging`. No project value is copied
into the repository and no migration is executed in this documentation update.

## 8. Configuration contract

GitHub Environment `staging` exists and is the sole staging configuration
source. The repository owner has confirmed its values; a name-only GitHub CLI
inventory confirms that the keys below exist. Secret values were not read.

Legacy code, old branches, old environments and local `.env` files are not
fallback sources. Implementations must consume the environment entries by their
exact names and fail closed when required configuration is absent.

### Confirmed staging variables

| Key | Canonical value or status |
|---|---|
| `APP_URL` | `https://staging.fieldgrid.nl` |
| `DEPLOY_ROOT` | `/opt/fieldgrid/staging` |
| `PORT` | `3301` |
| `SERVICE_NAME` | `fieldgrid@staging.service` |
| `HEALTHCHECK_URL` | `https://staging.fieldgrid.nl/api/healthz` |
| `SENDGRID_FROM_EMAIL` | `noreply@fieldgrid.nl` |
| `SENDGRID_FROM_NAME` | `Fieldgrid` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Present in GitHub; value remains out of Git |
| `VAPID_SUBJECT` | `mailto:services@fieldgrid.nl` |
| `EXPECTED_SUPABASE_PROJECT_REF` | Present in GitHub; identifies the new staging project |
| `FORBIDDEN_SUPABASE_PROJECT_REF` | `ckdtiuemeygrnujjibnw` |
| `GOOGLE_ROUTES_ENABLED` | `false` |
| `LOG_LEVEL` | `info` |

### Confirmed staging secret names

- `ADMIN_API_SECRET`
- `BACKUP_DATABASE_URL`
- `DATABASE_URL`
- `FIELDGRID_ADMIN_EMAIL`
- `FIELDGRID_ADMIN_PASSWORD`
- `MIGRATION_DATABASE_URL`
- `MOLLIE_API_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`
- `SENDGRID_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VAPID_PRIVATE_KEY`

Fixed non-secret values and unmistakable placeholders are recorded in
`.env.example`; actual GitHub values are never copied there.

| Key | Contract |
|---|---|
| `SENDGRID_FROM_EMAIL` | Required before the first mail-enabled deployment; must be a verified staging sender |
| `SENDGRID_FROM_NAME` | `Fieldgrid` |
| `SENDGRID_API_BASE` | Omit unless the real account configuration requires a regional API base |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Required when push notifications are activated; staging-only pair |
| `VAPID_PRIVATE_KEY` | Secret half of the same stable staging-only pair |
| `VAPID_SUBJECT` | A managed `mailto:` contact |
| `GOOGLE_ROUTES_ENABLED` | `false` for the first deployment |
| `GOOGLE_MAPS_SERVER_API_KEY` | Absent until Routes is intentionally enabled |
| `LOG_LEVEL` | `info` |

SendGrid, VAPID, Supabase and all other providers use staging-specific
credentials. Secret values belong in the future GitHub Environment or the
provider itself, never in source, examples, logs or committed service files.

## 9. Deployment implementation and operator boundary

The repository provides:

- reusable CI for `main`, pull requests and staging promotions;
- an explicit `staging` deployment workflow using the exclusive
  `fieldgrid-staging` runner label and GitHub Environment `staging`;
- staging preflight and Supabase project-ref guards for runtime, database,
  migrations and backups;
- build-before-migrate ordering, pre-migration backup, atomic activation,
  exact-release health validation and code rollback;
- reference Caddy and systemd configuration plus an operator runbook.

The following actions remain external and are never performed merely by
committing these files:

- changing Caddy;
- installing systemd units;
- creating `/opt/fieldgrid/staging` on the VPS;
- registering or starting the `fieldgrid-staging` runner;
- configuring wildcard DNS and certificate issuance;
- creating a production branch, environment or deployment flow.

Migrations run only after the operator deliberately promotes a verified `main`
commit to `staging` and the staging workflow passes its own full CI job.


## Address and basic-travel addition (2026-09-30)

The PDOK / openrouteservice / OpenFreeMap contract is specified in
[addresses-and-travel.md](addresses-and-travel.md). It reuses the existing staging
runtime and requires no new VPS, systemd service or branch. Automatic travel
requires the new environment secret `OPENROUTESERVICE_API_KEY`; without it,
estimates are explicitly unknown and manual estimates remain usable. Optional
routing variables and conservative rate limits are listed in that contract.
Google Routes remains disabled; its key is never a fallback.
