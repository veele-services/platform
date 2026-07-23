# Website enterprise operations and staging activation

Status: Phase 9 code contract. This runbook is intentionally staging-only.
Merging the implementation does not activate a route, update staging or
production, or deploy a custom website.

## Safety boundary

- Use one operator and record the exact reviewed main and staging SHAs.
- Do not configure website runtime variables in the production environment.
- Do not copy a tenant-provided URL, header, cookie or secret into route
  configuration.
- Do not activate a custom deployment whose release, host or health evidence
  differs from the reviewed candidate.
- Do not use custom mode as an automatic fallback. Failure is a neutral `503`;
  recovery is an explicit audited rollback.
- Never include route JSON, upstream origins, health bodies or credentials in
  comments, screenshots, logs or acceptance artifacts.
- Treat production as a separate change with its own human go/no decision.

## Architecture

The existing public prefixes retain their current owners:

1. `/admin` → backoffice;
2. `/personeel` → personnel;
3. `/klant` → customer;
4. `/api` → API;
5. all remaining verified website paths → `website-runtime`.

For `managed_cms`, the runtime renders the exact immutable publication. For
`custom_nextjs`, it rewrites to the exact operator-owned HTTPS origin selected
by provider key, route key, release ID, expected host and health path.
Authorization, cookies and caller-controlled forwarding headers are not sent
to the custom origin.

## One-time staging configuration

Add these GitHub **staging environment variables**. Do not add their Phase 9
values to production:

| Variable                               | Contract                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| `WEBSITE_SERVICE_NAME`                 | Exact systemd unit for `@workspace/website-runtime`.                         |
| `WEBSITE_PORT`                         | Unique localhost-only numeric port.                                          |
| `WEBSITE_PUBLIC_HEALTH_URL`            | HTTPS URL ending `/healthz` on a `*.staging.fieldgrid.nl` host.              |
| `WEBSITE_PUBLIC_URL`                   | Optional public base used by the deploy health gate.                         |
| `WEBSITE_MANAGED_ACCEPTANCE_URL`       | Exact active managed proof site on `*.staging.fieldgrid.nl`.                 |
| `WEBSITE_CUSTOM_ACCEPTANCE_URL`        | Exact active custom proof site on a different `*.staging.fieldgrid.nl` host. |
| `FIELDGRID_CUSTOM_WEBSITE_ROUTES_JSON` | Reviewed JSON array described below.                                         |
| `NEXT_PUBLIC_MARKETING_SITE_URL`       | Exact canonical custom proof origin on `*.staging.fieldgrid.nl`.             |
| `FIELDGRID_CUSTOM_ROUTE_KEY`           | Exact opaque route key in the reviewed route registry.                       |
| `FIELDGRID_CUSTOM_EXPECTED_HOST`       | Hostname equal to the canonical custom proof host.                           |
| `FIELDGRID_WEBSITE_FORM_ID`            | Published form UUID; configure after staging site provisioning.              |

The route JSON is operator-owned configuration. It is not tenant input and is
never persisted as an origin:

```json
[
  {
    "providerKey": "fieldgrid_vps",
    "routeKey": "reviewed_opaque_route_key",
    "releaseId": "git-tree:reviewed-immutable-tree",
    "expectedHosts": ["customer.staging.fieldgrid.nl"],
    "healthPath": "/api/health",
    "status": "routable",
    "upstreamOrigin": "https://reviewed-origin.staging.fieldgrid.nl"
  }
]
```

The parser rejects unknown fields, non-HTTPS origins, credentials, ports,
paths, queries, fragments, IP literals, internal hostnames, non-staging public
hosts and configurations above 64 KiB. An absent or invalid variable is
fail-closed.

Configure the staging systemd unit to start the workspace package from the
atomic current release, use the shared environment file and bind only to
`127.0.0.1:${WEBSITE_PORT}`. Validate that the unit is enabled and active.

Configure and validate Caddy so that:

- the existing application prefixes remain before the website fallback;
- the dedicated runtime health host reaches `${WEBSITE_PORT}/healthz`;
- verified staging website hosts reach `${WEBSITE_PORT}` without stripping
  paths;
- TLS is valid for every exact managed, custom and health proof host;
- the prior Caddyfile and prior staging release remain available for rollback.

Before reload:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl status "$WEBSITE_SERVICE_NAME" --no-pager
curl --fail --silent --show-error \
  "http://127.0.0.1:${WEBSITE_PORT}/healthz"
```

Do not place a private origin in Caddy access logs. The Fieldgrid route registry
is the authority for custom upstream selection.

## Candidate requirements

The custom application must be an immutable reviewed release and expose an
HTTPS health endpoint returning exact schema version 3:

```json
{
  "schemaVersion": 3,
  "status": "healthy",
  "providerKey": "fieldgrid_vps",
  "routeKey": "reviewed_opaque_route_key",
  "releaseId": "git-tree:reviewed-immutable-tree",
  "expectedHost": "customer.staging.fieldgrid.nl",
  "tls": { "valid": true },
  "network": { "publicAddressesOnly": true },
  "seo": {
    "canonical": true,
    "robots": true,
    "sitemap": true,
    "structuredData": true
  },
  "assets": { "healthy": true },
  "forms": { "platformEndpoint": true }
}
```

The platform resolves every origin address, rejects non-public ranges, pins a
public address for the request, performs normal TLS hostname verification,
requires HTTP 200, limits the response to 32 KiB and times out after eight
seconds. Health evidence older than five minutes blocks activation.

## Guarded staging sequence

### 1. Review and merge

Require exact-head CI on the Phase 9 PR with zero failed, cancelled or pending
authoritative checks. Squash-merge only after human review. Record the squash
main SHA.

### 2. Backup, isolated restore and migration rehearsal

From the exact main SHA, dispatch **Phase 2E Staging Promotion Preflight** with:

- `expected_main_sha`: exact green main SHA;
- `expected_staging_sha`: current exact staging SHA and rollback target;
- `confirmation`: `phase2e-staging-only`.

The workflow verifies immutable refs, required secrets and website runtime
variables, backs up staging, restores an isolated copy, compares tenant and
website row counts, applies through
`20260721290000_website_enterprise_activation.sql`, checks routes and proves
the previous staging release marker. It does not move a ref or deploy.

Stop on any mismatch. Do not promote until its secret-free evidence artifact is
green.

### 3. Promote through the existing exact-ref staging contract

Use the existing normal, non-force, fast-forward main-to-staging promotion.
The staging deploy must:

- migrate successfully;
- start five exact services and five exact ports;
- return HTTP 200 from the local and public website health endpoint;
- retain the previous release;
- pass the atomic deploy health gate or restore the previous release.

Do not manually bypass a failed deployment.

### 4. Register, health-check and approve

As a platform admin:

1. open **Platformbeheer → Tenants → Website delivery**;
2. confirm the tenant is active, Enterprise, website-entitled and has an active
   verified primary staging domain;
3. select the exact code-owned candidate whose host and immutable release
   match the reviewed release;
4. enter a traceable change reference and register it;
5. run strict health;
6. verify the candidate reports healthy and the route configuration reports
   routable;
7. approve the exact health evidence.

Registration, health and approval each require server-side platform-admin
authorization and append a tenant-scoped audit event.

### 5. Activate exact revision

In the same tab, re-read the current mode, target and delivery revision. Enter a
change reference and reason, then activate. The server atomically verifies all
preflight checks and calls `activate_website_delivery` only when the exact
current state still matches.

The resulting operation row is append-only and records:

- prior and new mode/target;
- expected and new revision;
- actor, reason and change reference;
- bounded pass/fail checks;
- no origin, headers, cookies, token, health body or secret.

If another writer changed the state, activation is blocked without moving the
delivery revision.

### 6. Collect read-only staging evidence

After one managed and one custom proof host are active and healthy, dispatch
**Website Staging Acceptance** from the exact staging ref:

- `expected_staging_sha`: exact deployed staging SHA;
- `confirmation`: `website-staging-read-only`.

The workflow verifies the active release marker, runtime health, explicit
managed/custom route markers, security headers, HTML language/viewport/main/H1,
canonical and structured data, robots, sitemap, up to eight same-origin assets
and a four-second root-response budget. It records no body, route origin or
secret and performs no deployment.

## Explicit rollback

Use **Rollback naar vorige activatie** only after recording the current exact
mode, target and revision. Rollback:

- reads the exact previous target from durable activation history;
- refuses a stale current state;
- re-runs the current custom preflight when the previous target is custom;
- creates a new immutable publication snapshot when the previous target is
  managed, preserving the original source target in evidence;
- advances the delivery revision exactly once;
- appends operation and audit evidence.

After rollback, run the read-only staging acceptance workflow again against the
restored mode/target. If the application deployment itself is unhealthy, use
the existing atomic release rollback only; do not edit delivery rows manually.

## Failure matrix

| Failure                                 | Required action                                                              |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| Invalid/missing route JSON              | Keep managed mode; correct via reviewed environment change.                  |
| Private/mixed DNS answer                | Block candidate; correct DNS/origin architecture.                            |
| TLS, HTTP, body-size or timeout failure | Block health/approval; repair immutable candidate or register a new release. |
| Health identity mismatch                | Reject; never edit stored evidence.                                          |
| Stale delivery revision                 | Refresh the operator page and reassess; do not retry with guessed values.    |
| Staging deploy health failure           | Let atomic rollback restore the prior release; inspect secret-free artifact. |
| Custom runtime failure after switch     | Perform explicit delivery rollback to the recorded prior target.             |
| Unknown host or route                   | Preserve neutral 404/503; never add a default tenant.                        |

## Production gate

Phase 9 is complete only after exact-head CI and live staging evidence are
green with no critical/high finding. That result does **not** authorize
production. A production change must separately review capacity, Caddy/TLS,
monitoring, immutable custom release ownership, recovery timing and a human
go/no. The Phase 9 workflow and operator contract intentionally keep
`productionEnabled: false`.
