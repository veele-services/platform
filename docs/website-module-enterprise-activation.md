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

| Variable                                          | Contract                                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| `WEBSITE_SERVICE_NAME`                            | Exact systemd unit for `@workspace/website-runtime`.                         |
| `WEBSITE_PORT`                                    | Unique localhost-only numeric port.                                          |
| `WEBSITE_PUBLIC_HEALTH_URL`                       | HTTPS URL ending `/healthz` on a `*.staging.fieldgrid.nl` host.              |
| `MARKETING_SERVICE_NAME`                          | Exact independent systemd unit for the reviewed custom application.          |
| `MARKETING_PORT`                                  | Unique localhost-only numeric port for the custom application.               |
| `MARKETING_PUBLIC_HEALTH_URL`                     | Exact custom-origin process health URL ending in `/healthz`.                 |
| `WEBSITE_PUBLIC_URL`                              | Optional public base used by the deploy health gate.                         |
| `WEBSITE_MANAGED_ACCEPTANCE_URL`                  | Exact active managed proof site on `*.staging.fieldgrid.nl`.                 |
| `WEBSITE_CUSTOM_ACCEPTANCE_URL`                   | Exact active custom proof site on a different `*.staging.fieldgrid.nl` host. |
| `FIELDGRID_CUSTOM_WEBSITE_ROUTES_JSON`            | Reviewed JSON array described below.                                         |
| `NEXT_PUBLIC_MARKETING_SITE_URL`                  | Exact canonical custom proof origin on `*.staging.fieldgrid.nl`.             |
| `FIELDGRID_CUSTOM_ROUTE_KEY`                      | Exact opaque route key in the reviewed route registry.                       |
| `FIELDGRID_CUSTOM_EXPECTED_HOST`                  | Hostname equal to the canonical custom proof host.                           |
| `FIELDGRID_WEBSITE_FORM_ID`                       | Published form UUID; configure after staging site provisioning.              |
| `FIELDGRID_CUSTOM_WEBSITE_HEALTH_REFRESH_ENABLED` | Set to exact `true` only in staging after migration `20260909121000`.        |

Add `FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID` as a **staging environment
secret** before any post-prepare action. It must be the UUID of one existing
active platform owner or admin. The first `prepare-managed` run may omit it; in
that case the script fails closed unless the database contains exactly one
active owner/admin, then writes that UUID to the short-lived fixture artifact.
Set the secret to that exact value before continuing. `prepare-managed` alone
uses the runtime URL only to validate the distinct project/principal contract,
then selects the existing migration-admin `DATABASE_URL` secret through the
step-scoped migration connection purpose. `complete-custom`,
`verify` and `rollback-custom` use only the least-privilege
`FIELDGRID_RUNTIME_DATABASE_URL` secret. Every database step installs and
checks the pinned Supabase Root 2021 CA from
`FIELDGRID_DATABASE_SSL_ROOT_CERT_BASE64` and requires TLS `verify-full`;
certificate, connection strings and passwords are never uploaded.

Configure the proof URLs and runtime-database secret before `prepare-managed`.
Configure the automation actor before that run when its UUID is already known;
otherwise set it immediately from the successful short-lived fixture before
any post-prepare action.
Configure the website/marketing unit names, ports and health URLs only after the
first application promotion has completed on the existing four-service gate.
Enable the recurring custom-health refresher only in the deployment that has
successfully applied migration `20260909121000`.

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
seconds. The staging API refreshes active custom delivery evidence every 60
seconds under a process-local guard and a global PostgreSQL advisory lock.
Claims are bounded, compare-and-set recording refuses superseded identities,
and only healthy-to-failed or failed-to-healthy transitions produce audit
events. Health evidence older than five minutes remains fail-closed.

## Guarded staging sequence

### 1. Review and merge

Require exact-head CI on the Phase 9 PR with zero failed, cancelled or pending
authoritative checks. Squash-merge only after human review. Record the squash
main SHA.

### 2. Prepare the managed proof and principal fixture

After the exact main merge, but before moving `staging`, dispatch **Website
Staging Proof State** from `main` with:

- `operation`: `prepare-managed`;
- `expected_sha`: the exact remote main head;
- `change_reference`: the reviewed PR/change reference;
- `confirmation`: `website-staging-prepare-managed`.

The staging-environment job idempotently provisions the Enterprise,
website-only proof tenant, publishes its reviewed managed content and verifies
`https://managed-proof.staging.fieldgrid.nl/`. The shorter generic `managed`
tenant label is reserved and must never be used. The job also
creates the one-day `w00-principal-fixtures.json` artifact containing exactly
the existing `field-demo.staging.fieldgrid.nl` and new
`managed-proof.staging.fieldgrid.nl` host/tenant-ID pairs plus the verified
automation actor UUID. It contains no email address, upstream, credential or
other PII. Download it only for the W00 principal proof and delete it after use.
This operation cannot register, approve or activate a custom release.

### 3. Backup, isolated restore and migration rehearsal

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

### 4. Promote through the existing exact-ref staging contract

Use the existing normal, non-force, fast-forward main-to-staging promotion.
The staging deploy must:

- migrate successfully;
- keep the existing four services and four ports green;
- retain the previous release;
- pass the atomic deploy health gate or restore the previous release.

Do not manually bypass a failed deployment.

### 5. Deploy the exact website stack

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

### 6. Confirm proof sites and form

Use only these two staging proof sites:

- the automation-owned managed site bound to
  `managed-proof.staging.fieldgrid.nl`;
- the Veele custom site bound to `veeleservices.staging.fieldgrid.nl`.

Create and publish the real Veele lead form, set its UUID as
`FIELDGRID_WEBSITE_FORM_ID`, then rerun **Website Staging Stack Deploy** against
the same exact staging SHA. `/healthz` proves process readiness independently;
`/api/health` remains fail-closed until the form UUID and complete activation
identity are present.

### 7. Complete the custom proof, soak and accept

After both the core release and website-stack release markers equal the same
exact staging SHA, dispatch **Website Staging Proof State** from `staging` with:

- `operation`: `complete-custom`;
- `expected_sha`: that exact remote staging head;
- `change_reference`: the reviewed PR/change reference;
- `confirmation`: `website-staging-complete-custom`.

The job first refuses unequal release markers or an ambiguous route registry.
It then idempotently registers, health-checks, approves and activates only the
exact `git-commit:<expected_sha>` Veele identity. A failed immediate public
verification rolls back that newly activated delivery through the audited
service. Success is held for 370 seconds, proving that the 60-second refresher
keeps evidence fresh beyond the five-minute expiry window, and then runs both
the exact database-state verification and full read-only website acceptance.

During rollout, retain the old active and new candidate registrations in
`FIELDGRID_CUSTOM_WEBSITE_ROUTES_JSON` until activation and soak finish. Put the
new exact identity first because current exact-identity validators resolve the
first matching route. Remove the old identity only through a later reviewed
environment update after acceptance is green.

### 8. Manual equivalent: register, health-check and approve

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

### 9. Manual equivalent: activate exact revision

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

### 10. Re-run read-only staging evidence

After one managed and one custom proof host are active and healthy, dispatch
**Website Staging Proof State** from the exact staging ref with operation
`verify`, or dispatch **Website Staging Acceptance** directly:

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

For the automated exact identity, dispatch **Website Staging Proof State** from
the exact `staging` head with operation `rollback-custom`, confirmation
`website-staging-rollback-custom`, and the original change reference. It refuses
to roll back a different active custom release.

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
