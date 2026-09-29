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
| `staging` | Explicit promotions of reviewed `main` commits | May later trigger staging deployment |
| `production` | Not present in this phase | Must not be created or deployed |

Development happens on `main` or short-lived branches merged into `main`.
`staging` is not a development branch. A staging promotion deliberately moves
`staging` to a selected commit that is already contained in `main`. The initial
`staging` branch starts at exactly the same commit as the documented `main`.

No deployment workflow is introduced in this architecture-only phase.

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
| `https://{slug}.staging.fieldgrid.nl/personeel` | Personnel portal for that tenant |
| `https://{slug}.staging.fieldgrid.nl/backoffice` | Backoffice for that tenant |
| `https://{slug}.staging.fieldgrid.nl/klant` | Customer portal for that tenant |

The three portals are paths on the same tenant origin. Separate backoffice,
personnel or customer subdomains must not be introduced.

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

## 5. Future Caddy boundary

The currently installed Caddy configuration and its legacy port range
3301–3306 are not canonical and must not be copied.

When implementation is explicitly authorized, one new staging configuration
will terminate TLS for:

- `staging.fieldgrid.nl`;
- `*.staging.fieldgrid.nl`.

Both route to `127.0.0.1:3301`. Wildcard DNS and certificate issuance must be
validated as part of that later phase. No old website-runtime or origin
hostnames are reintroduced without an explicit architecture decision.

This phase does not modify Caddy.

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
| `EXPECTED_SUPABASE_PROJECT_REF` | Set only after the dedicated staging project exists |
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

No Supabase project is created and no migration is executed in this phase.

## 8. Configuration contract

The future GitHub Environment is named `staging`. Fixed non-secret values and
placeholders are recorded in `.env.example`.

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

## 9. Deferred implementation

The following work is explicitly outside this architecture-only phase:

- changing Caddy;
- installing systemd units;
- creating `/opt/fieldgrid/staging` on the VPS;
- registering or starting a runner;
- building a deployment workflow;
- creating or changing a Supabase project;
- running migrations;
- creating a production branch, environment or deployment flow.

These activities begin only after an explicit follow-up request.
