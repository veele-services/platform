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
├── incoming/                  # runner-only, untrusted staging area
├── releases/
│   └── <release>/
├── shared/
│   └── <runtime configuration and secrets>
├── backups/                   # root-only recovery artifacts
└── current -> /opt/fieldgrid/staging/releases/<release>
```

`current` is an atomic symlink to the active release. Releases are immutable;
mutable runtime configuration belongs under `shared/`. Secrets must be readable
only by the service identity. The full Git SHA identifies each release. The
persistent runner may write only below `incoming`; it cannot read or alter an
installed release, `current`, `shared/runtime.env` or retained backups. Its
handoff contains public release bytes plus encrypted runtime/backup envelopes;
plaintext provider credentials and database backups never enter the runner
identity.

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
available to any staging job or runtime. Staging secrets are exposed only to
fresh GitHub-hosted preparation/acceptance jobs and, after root-only decryption,
to the application runtime; they are never exposed to the persistent VPS runner.

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
| `SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY` | Owner confirmed configured; name verified, value not retrieved |
| `MAIL_MARKETING_ENABLED` | Owner confirmed `false`; marketing remains disabled for this release |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Present in GitHub; value remains out of Git |
| `VAPID_SUBJECT` | `mailto:services@fieldgrid.nl` |
| `EXPECTED_SUPABASE_PROJECT_REF` | Present in GitHub; identifies the new staging project |
| `FORBIDDEN_SUPABASE_PROJECT_REF` | `ckdtiuemeygrnujjibnw` |
| `GOOGLE_ROUTES_ENABLED` | `false` |
| `LOG_LEVEL` | `info` |
| `STAGING_HANDOFF_ENCRYPTION_CERT_B64` | Public X.509 certificate for the root-decryptable release handoff; operator-confirmed present in GitHub Environment `staging`, value not retrieved |

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
- `OPENROUTESERVICE_API_KEY`
- `SENDGRID_API_KEY`
- `SUPABASE_SEND_EMAIL_HOOK_SECRET`
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

### Auth/mail integration status — 2026-10-01

The owner prepared the signed SendGrid Event Webhook and Supabase Send Email
Hook configuration in the staging providers. The Supabase form temporarily
contained `https://www.fieldgrid.nl`. That is **not a Fieldgrid staging hook
endpoint**. The owner confirmed that the hook was initially enabled and has
now been **disabled**. Keep it disabled until the replacement is deployed and
accepted. Existing SMTP remains the active Auth-mail mechanism in the meantime.

The implementation targets `https://staging.fieldgrid.nl/api/email/auth` and
`https://staging.fieldgrid.nl/api/email/events`. Source code and local tests do
not prove these routes exist in the currently deployed staging release.
See [the activation runbook](../deployment/mail-hooks.md). Do not enable either
provider integration merely because its GitHub environment names exist.

## 9. Deployment implementation and operator boundary

### Scanner/runtime contract (owner update, 2026-10-02)

The operator has confirmed the UID/group/socket separation below; this is
operator evidence, not a deployed-application scanner acceptance. Staging uses `CLAMAV_ENABLED=true` and
`CLAMAV_SOCKET=/run/clamav/clamd.ctl` from GitHub Environment `staging`.
`clamav-daemon` listens only on this Unix socket, owned by `clamav:clamav`
with mode `0660`; `clamav-freshclam` maintains definitions. No TCP listener.
The `fieldgrid` application user belongs to `clamav`. The staging runner must
have a **different UID**, no `clamav` membership and no direct socket access.

The target generated runtime file is
`/opt/fieldgrid/staging/shared/runtime.env` (not `fieldgrid.env`). Both the web
unit and worker-trigger unit reference it. It is not manually populated: the
deployment writer uses the existing GitHub Environment values and the fixed
root broker installs the encrypted handoff as `root:fieldgrid`/`0640`.

Operator-confirmed hardened handoff, 1 October 2026: the application identity
remains `fieldgrid` with `clamav` access. The runner is active as
`fieldgrid-runner` UID 994 with primary group `fieldgrid-runner` and no
supplementary groups; it has read/traversal (`r-x`) only on `/home/fieldgrid`,
no `fieldgrid`/`clamav` membership and no access to protected shared, release or
backup data. GitHub reports `fieldgrid-staging-veele` online with label
`fieldgrid-staging`. The fixed broker, root-only handoff key/certificate,
attestation trust and staging-specific unit references passed their separate
root and runner checks. Superseded staging drop-ins, including the worker's old
`shared/fieldgrid.env` reference, are preserved in the protected operator
backup. See `docs/deployment/staging-handoff-evidence-2026-10-01.md`.

Operator-confirmed current host state, 2 October 2026: the fixed broker installed
the release, protected backup and generated
`/opt/fieldgrid/staging/shared/runtime.env` for candidate
`bd7f69f6233cd7066e3f042a718b1d9f629ee86a`. The runtime file exists as
`root:fieldgrid` with mode `0640`, and `current` still points to that candidate.
Web activation failed before Node started because the loaded staging-specific
unit used `test -w /run/clamav/clamd.ctl` as a positive Unix-socket check. The
last operator diagnostic showed the web service in an automatic restart-loop;
it must remain stopped during recovery. The worker timer remains intentionally
inactive/dead. Production was not touched.

`test -w` is not valid positive proof that a Unix stream socket accepts a
connection: on this host it returned status 1 even though `fieldgrid` had the
`clamav` supplementary group, the `clamav:clamav` socket had mode `0660`, both
ClamAV services were active and `test -S` succeeded. The forward fix retains
the socket-type check and adds a release-packaged, bounded clamd `PING`/`PONG`
protocol preflight executed under the web-runtime identity before `server.js`.
This proves reachability only; durable permissions after daemon restart,
current TCP-listener absence and EICAR/PNG/PDF checks through the deployed
runtime remain acceptance steps.

The unprivileged runner check never connects to the scanner. It proves the
negative boundary from exact runner group separation, a root/clamav-controlled
parent directory without group/world write or an extended-access indicator,
and exact public socket metadata: Unix-socket type, `clamav:clamav`, mode
`0660`, one hardlink and no extended-access indicator. These conditions are
exercised with separate Linux users and a real Unix socket; permissive socket
mode and writable-parent drift must demonstrate their real access/replacement
effect and fail the contract. Positive runtime availability remains the
release-packaged `PING`/`PONG` check under `fieldgrid`.

Before another promotion, the operator must install the reviewed updated web
unit and runner-contract checker at the actually loaded staging-instance path,
reload systemd and rerun the separated root and runner controls. The installed
`bd7f69f6` release must not be started with the new unit because it does not
contain the packaged protocol preflight. A new reviewed SHA must pass complete
CI and staging activation. During this transition the pre-deploy timer gate
checks the installed timer and its exact worker target, not that the paused
timer is already active. After healthy exact-SHA web activation, the operator
resumes the timer; the final read-only gate then requires a fresh successful
worker invocation. The runner never starts timers or installs/reloads units and
has no direct service-restart sudo permission. Its only privileged route is the
fixed, no-argument release broker.

The target deployment boundary deliberately splits credentials from the
persistent host runner:

1. A fresh GitHub-hosted `prepare` job receives Environment `staging` values,
   runs preflight/provider/database checks, builds the exact commit, creates and
   validates the pre-migration backup, applies forward migrations and generates
   the allowlisted runtime payload.
2. That job encrypts runtime and backup separately with the public X.509
   certificate from `STAGING_HANDOFF_ENCRYPTION_CERT_B64`. The matching private
   key exists only as `/etc/fieldgrid/staging-handoff.key`, `root:root` mode
   `0600`, on the VPS. It produces GitHub attestations for release, encrypted
   runtime and encrypted backup from the hosted runner.
3. The persistent self-hosted `deploy` job has no `${{ secrets.* }}` references,
   build, migration, backup or attestation authority. It transfers only those
   six immutable files into `incoming` and invokes one fixed no-argument broker.
4. The root-owned broker verifies all three attestations offline against the
   pinned GitHub trust root, exact repository, signer workflow, `staging` ref
   and SHA, and explicitly rejects self-hosted attestation signers. It decrypts,
   validates and atomically installs `shared/runtime.env` as `root:fieldgrid`
   mode `0640`, the backup root-only, and the release without group/other write
   bits. Only then does it select `current` and restart the fixed web service.
5. A fresh GitHub-hosted acceptance job receives only the credentials needed
   for public health/SHA/scanner validation and rollback-only database smoke
   tests. The one-shot platform-admin bootstrap also runs hosted, never on the
   persistent runner.

Configuration preflight therefore runs on a fresh hosted runner. Before the
promotion, a root-only operator control checks protected key, trust and runtime
metadata; the persistent runner cannot reach those paths. Its separate contract
check inspects public unit metadata, attests the configured denial boundary
through exact identity, groups, parent-directory and socket metadata/access
indicators, and performs only one bounded create/remove probe in its own
`incoming` directory.
It never opens the scanner socket. Real EICAR/clean PNG/PDF readiness runs in the web runtime during health
checks, under its own identity and systemd sandbox. Deployment checks exact
release SHA **and** scanner readiness. Missing/disabled/unreachable/stale
scanners never release uploads. Runtime file permissions allow only root and
the separate app group to read the installed file. The runner is not a member
of that group. The app's separate `clamav` supplementary group grants only
scanner-socket access.

The repository provides:

- reusable CI for `main`, pull requests and staging promotions;
- an explicit `staging` deployment workflow whose credentialed preparation and
  acceptance run on fresh GitHub-hosted runners and whose transfer-only deploy
  step uses the exclusive `fieldgrid-staging` runner label;
- staging preflight and Supabase project-ref guards for runtime, database,
  migrations and backups;
- build-before-migrate ordering, pre-migration backup, atomic activation and
  exact-release health validation. Na forward-only securitymigraties wordt
  nooit automatisch oudere applicatiecode teruggezet; herstel is een bewuste
  forward-fix of een vooraf als compatibel beoordeelde operatorhandeling;
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

## Private ticket-file scanning addition (2026-09-30)

Tickets reuse the existing web runtime, private Supabase Storage and outbox
worker. Releasing a ticket attachment additionally requires a real ClamAV
scanner, isolated from runtime credentials under a dedicated service identity,
with refreshed malware definitions and a permissioned Unix socket. This is a
deliberate operator prerequisite, not a service installed by the application or
deployment runner. No public TCP scanning endpoint or alternative provider is
introduced. See `deploy/clamd-ticket.conf.example` and the staging runbook.

GitHub Environment `staging` supplies `CLAMAV_ENABLED=true`,
`CLAMAV_SOCKET=/run/clamav/clamd.ctl`, optional
`CLAMAV_TIMEOUT_MS` (default 30000) and
`CLAMAV_MAX_DATABASE_AGE_HOURS` (default 72, maximum 168). These are
configuration names, not credentials. The existing runtime environment writer
passes only these allowlisted settings. Scan failure keeps files private and
unreleased. Staging uses exactly `/run/clamav/clamd.ctl`; sockets in
`/tmp`, home directories or rootless `/run/user` namespaces can be visible to a
runner but hidden from the hardened web service and are rejected. Local/CI test
sockets remain isolated temporary paths. The web-runtime health gate must demonstrate genuine EICAR rejection
and valid PNG/PDF acceptance before accepting a release. The staging runner
does not connect to the scanner. An absent scanner is a NO-GO, not
an authorization to install system packages or change VPS units automatically.
