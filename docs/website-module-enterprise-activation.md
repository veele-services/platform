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
| `MARKETING_SERVICE_NAME`               | Exact independent systemd unit for the reviewed custom application.          |
| `MARKETING_PORT`                       | Unique localhost-only numeric port for the custom application.               |
| `MARKETING_PUBLIC_HEALTH_URL`          | Exact custom-origin process health URL ending in `/healthz`.                 |
| `WEBSITE_PUBLIC_URL`                   | Optional public base used by the deploy health gate.                         |
| `WEBSITE_MANAGED_ACCEPTANCE_URL`       | Exact active managed proof site on `*.staging.fieldgrid.nl`.                 |
| `WEBSITE_CUSTOM_ACCEPTANCE_URL`        | Exact active custom proof site on a different `*.staging.fieldgrid.nl` host. |
| `FIELDGRID_CUSTOM_WEBSITE_ROUTES_JSON` | Reviewed JSON array described below.                                         |
| `NEXT_PUBLIC_MARKETING_SITE_URL`       | Exact canonical custom proof origin on `*.staging.fieldgrid.nl`.             |
| `FIELDGRID_CUSTOM_ROUTE_KEY`           | Exact opaque route key in the reviewed route registry.                       |
| `FIELDGRID_CUSTOM_EXPECTED_HOST`       | Hostname equal to the canonical custom proof host.                           |
| `FIELDGRID_WEBSITE_FORM_ID`            | Published form UUID; configure after staging site provisioning.              |

Configure `WEBSITE_*` and `MARKETING_*` only after the first application
promotion has completed on the existing four-service gate. Adding them before
that promotion would require services that do not exist yet.

The route JSON is operator-owned configuration. It is not tenant input:

```json
[
  {
    "providerKey": "fieldgrid_vps",
    "routeKey": "reviewed_opaque_route_key",
    "releaseId": "git-commit:exact-staging-sha",
    "expectedHosts": ["veeleservices.staging.fieldgrid.nl"],
    "healthPath": "/api/health",
    "status": "routable",
    "upstreamOrigin": "https://veeleservices-origin.staging.fieldgrid.nl"
  }
]
```

The parser rejects unknown fields, non-HTTPS origins, credentials, ports,
paths, queries, fragments, IP literals, internal hostnames, non-staging public
hosts and configurations above 64 KiB. An absent or invalid variable is
fail-closed.

The website router and marketing application use the separate immutable
release root `/var/www/veele/website-stack-staging`. They have separate
environment files: only the website router receives the database URL. The
marketing process never receives platform database credentials.

### One-time root bootstrap

The deploy runner must not receive generic root file-write access. A server
operator installs the reviewed root-owned systemd assets once from the exact
active staging release. The service Node validation remains mandatory:

```bash
set -euo pipefail
expected="EXACT_STAGING_SHA"
source_root="/var/www/veele/staging/current"
service_node="/usr/bin/node"

test "$(whoami)" = "root"
test "$(cat "$source_root/.fieldgrid-release-sha")" = "$expected"
test -x "$service_node"
test "$(readlink -f "$(command -v node)")" = "$(readlink -f "$service_node")"
"$service_node" -e '
  const version = process.versions.node;
  if (!/^24\.\d+\.\d+$/.test(version)) {
    throw new Error(`Fieldgrid requires Node >=24.0.0 <25; received ${version}`);
  }
'
install -o root -g root -m 0644 \
  "$source_root/ops/systemd/veele-staging-website.service" \
  /etc/systemd/system/veele-staging-website.service
install -o root -g root -m 0644 \
  "$source_root/ops/systemd/veele-staging-marketing.service" \
  /etc/systemd/system/veele-staging-marketing.service
systemctl daemon-reload
systemctl enable veele-staging-website veele-staging-marketing
```

Do not use `enable --now`: the deploy workflow first creates and atomically
activates `/var/www/veele/website-stack-staging/current`, then starts both
services. The operator must provision a root-managed Node 24 executable at
`/usr/bin/node`; an nvm- or toolcache-only installation is insufficient. The
bootstrap and every deployment verify that the PATH-resolved build Node and
the systemd service Node resolve to the same executable and satisfy the
repository engine before any release is built or activated. Do not reload
Caddy through an unvalidated handwritten command.

Wildcard TLS and the narrow runner capability are installed by the reviewed
fail-closed bootstrap from that same active release:

```bash
bash \
  /var/www/veele/staging/current/scripts/fieldgrid-staging-wildcard-tls-bootstrap.sh \
  --install \
  --source-dir /var/www/veele/staging/current \
  --expected-sha EXACT_STAGING_SHA
```

Run this second block as root. It verifies the active release marker, the
Cloudflare DNS-provider module, the sudoers policy and the complete Caddy
configuration before Caddy is restarted. The Cloudflare token is read from the
running Caddy service when available; otherwise the script asks for it without
echoing it. The token is stored only in
`/etc/caddy/fieldgrid-cloudflare.env` as `root:root` mode `0600`, loaded through
the Caddy systemd service environment and never written to the repository.
Failure restores the previous Caddy and sudoers files. Success includes a
normal TLS request to a random, previously unbound
`*.staging.fieldgrid.nl` hostname and requires exact HTTP `404`.

Every later deployment compares all root-owned assets byte for byte with the
exact staging checkout and fails closed on drift. It never
uses `sudo install`, `sudo cp`, `sudo tee` or generic privileged file mutation.
The separate root-owned sudoers drop-in grants only the exact two-unit
restart/stop commands needed for activation and rollback, plus `systemctl
reload caddy` and the exact one-shot Caddy validation unit. The workflow
verifies those grants without executing them before it builds a release.

Configure and validate Caddy so that:

- the existing application prefixes remain before the website fallback;
- the dedicated runtime health host reaches `${WEBSITE_PORT}/healthz`;
- verified staging website hosts reach `${WEBSITE_PORT}` without stripping
  paths;
- TLS is valid for every exact managed, custom and health proof host;
- deploys never rewrite root-owned Caddy configuration and retain the prior
  website-stack release for rollback.

The bootstrap performs the authoritative Caddy validation with the same
protected environment as the service. For diagnosis after installation:

```bash
systemctl start fieldgrid-caddy-validate.service
systemctl status "$WEBSITE_SERVICE_NAME" --no-pager
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
  "releaseId": "git-commit:exact-staging-sha",
  "expectedHost": "veeleservices.staging.fieldgrid.nl",
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

The workflow verifies immutable refs, required secrets and the four existing
rollback services, backs up staging, restores an isolated copy, compares tenant
and website row counts, applies through
`20260721290000_website_enterprise_activation.sql`, checks routes and proves
the previous staging release marker. It does not move a ref or deploy.

Stop on any mismatch. Do not promote until its secret-free evidence artifact is
green.

### 3. Promote through the existing exact-ref staging contract

Use the existing normal, non-force, fast-forward main-to-staging promotion.
The staging deploy must:

- migrate successfully;
- keep the existing four services and four ports green;
- retain the previous release;
- pass the atomic deploy health gate or restore the previous release.

Do not manually bypass a failed deployment.

### 4. Deploy the exact website stack

After the four-service promotion is green:

1. configure the reviewed staging-only website and marketing variables;
2. bind the route registry release ID to the exact deployed staging SHA;
3. dispatch **Website Staging Stack Deploy** from that exact staging ref with
   confirmation `website-staging-stack-only`;
4. require local and public HTTP 200 from both `/healthz` endpoints;
5. verify the immutable website-stack release, systemd units, Caddy validation
   and secret-free evidence;
6. dispatch **Deploy VEELE** again from the same exact staging SHA and require
   the six-service health gate to pass.

The stack workflow owns only the exact staging systemd units and imported
`fieldgrid-website-staging.caddy` snippet. On failure it restores both the prior
website-stack symlink and prior Caddy state. It never moves a Git ref.

### 5. Provision the proof sites and form

Create or select two staging proof sites:

- one managed site bound to `managed.staging.fieldgrid.nl`;
- the Veele custom site bound to `veeleservices.staging.fieldgrid.nl`.

Create and publish the real Veele lead form, set its UUID as
`FIELDGRID_WEBSITE_FORM_ID`, then rerun **Website Staging Stack Deploy** against
the same exact staging SHA. `/healthz` proves process readiness independently;
`/api/health` remains fail-closed until the form UUID and complete activation
identity are present.

### 6. Register, health-check and approve

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

### 7. Activate exact revision

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

### 8. Collect read-only staging evidence

After one managed and one custom proof host are active and healthy, dispatch
**Website Staging Acceptance** from the exact staging ref:

- `expected_staging_sha`: exact deployed staging SHA;
- `confirmation`: `website-staging-read-only`.

The workflow verifies the active release marker, both process-health endpoints,
the exact schema-v3 custom candidate identity, configured form endpoint,
explicit managed/custom route markers, security headers, HTML
language/viewport/main/H1, canonical and structured data, robots, sitemap, up
to eight same-origin assets and a four-second root-response budget. It records
no form UUID, endpoint, body, route origin or secret and performs no deployment
or form submission.

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
