# Production release boundary review — 7 October 2026

Scope: infrastructure preparation after the owner's explicit V1 staging
acceptance. Production uses the confirmed domains on the same VPS, a new
Supabase project and independent Unix identities. No schema changes, staging
data import, production test fixtures or automatic host mutations are introduced.
This source review and local evidence are not proof of an installed production
host, configured production providers or production inbox delivery.

## Project and runtime guards

Reviewed `lib/env/production-database.ts`, `production-runtime.ts`, `server.ts`,
`production-migration-command.ts`, `production-migration-config.ts` and the
production preflight/target/migration/backup/bootstrap adapters. Guard checks
precede filesystem writes, connections and Supabase client creation. Missing,
equal, staging or legacy refs fail closed. Public/server API origins and direct
or pooler user/host/database/port are pinned. Only a single known TLS query
setting is accepted; routing overrides and transaction-mode migration/backup
are rejected. The CLI password is inherited in an isolated subprocess environment,
never argv. Both migration and backup adapters verify CA and hostname and exclude
ambient libpq routing overrides. Migration dry-run precedes apply and consumes
only the content-verified history prefix, with seed and vault configuration absent.

Production requires canonical loopback bind, enabled scanner, live Mollie,
verified signed-mail settings, matching cryptographic VAPID keys, valid AES key
and a distinct worker secret. Errors identify settings only. Marketing and Google
Routes remain disabled. Bootstrap remains OTP-only, emailconfirmed and idempotent;
its hosted workflow checks the exact healthy runtime first and never resets a
password. Staging adapters retain their own staging-only project contracts.

Evidence: `lib/env/production-database.test.ts`, `production-runtime.test.ts`,
`lib/operations/production-backup.test.ts`, `production-bootstrap.test.ts`,
`production-deployment.test.ts`, existing staging database/migration tests.

## Runtime health, worker and scanner

Reviewed `app/api/healthz/route.ts`, `lib/operations/worker-request.ts`,
`lib/tickets/scanner-readiness.ts`, `scripts/run-worker.mjs`,
`scripts/check-clamav-socket.mjs` and both production public health/auth checks.
Production health requires a root-owned non-writable exact release marker and
actual database/scanner readiness; it cannot fall back to a runner-supplied SHA.
Public output contains no paths, engine identities or credentials. The worker
exception admits only the exact POST route, empty query, environment's loopback
port and timing-safe bearer secret. Stage credentials/port never authenticate a
production worker. The handler retains its independent existing authentication.
Production scanner probes require its separate runtime UID, clamav group and
canonical 0660 clamav-owned socket before checking protocol/definitions/EICAR.
Startup preflight admits production only at its fixed loopback bind.

Read-only worker acceptance requires a successful execution whose start follows
the current web activation. `check-production-worker-timer.sh` never installs,
enables or starts units. Public health does not follow a redirect to another host.
Obsolete Auth links preserve the production origin and return OTP-required login
without session or credential cookies.

Evidence: health route tests, worker request tests, scanner runtime permissions,
scanner readiness and startup tests; `production-worker-timer.test.ts` exercises
the separate production timer's fresh/old/failed/paused and wrong-environment
cases, alongside the unchanged staging suite. Production
public checks are source-reviewed but await live production execution.

## Hosted workflow and root broker

Reviewed both production workflows, `verify-production-promotion.mjs`, the
production broker/activator, runtime writer/encryptor, root/runner contracts and
systemd identity/sudo/Caddy references. Promotion requires exact accepted SHA,
production branch tip, main ancestry, green main push CI and successful staging
push deployment for the same SHA, using only an ephemeral Actions-read token.
Full reusable CI runs again before host preflight or production credentials.
The builder is hosted; credentials are step-scoped after frozen dependency
installation. Build and readable backup precede forward migration.

The persistent runner receives only attested build bytes and encrypted runtime/
backup under an immutable artifact ID. It has a separate identity, no extra
groups and one fixed no-argument sudo broker. The root broker pins repository,
production workflow/ref/SHA, hosted signer and six-hour verified timestamp;
verifies all three attestations before decryption; rejects unsafe archive members,
unknown/duplicate runtime keys, cross-environment identities and replay. Root-only
private keys and backups never return to the runner. Runtime/release files belong
to root and the production runtime group. Activation affects only the production
service and has no automatic rollback after forward migrations.

Root preflight additionally checks four distinct UIDs, reciprocal denial across
both environments, and matching production certificate/key public fingerprints
that differ from staging. Runner preflight does not traverse configuration or
connect to the scanner. Instance-specific systemd drop-ins replace User/Group
without modifying staging; Caddy adds production 3302 while preserving staging.

Evidence: `production-deployment.test.ts` executes the broker's decrypted-runtime
validator against cross-project, cross-port, missing, duplicate and injected
settings and exercises promotion API evidence/redaction. `staging-handoff.test.ts`
now verifies both independently encrypted CMS flows. `workflow-security.test.ts`
covers both new workflows. `scripts/test-production-contract-linux.sh` proves
actual Linux read/write/traversal denial in a disposable container with two
runtime accounts and two runners. Existing broker/artifact/staging Linux checks
remain mandatory; no production secrets or host accounts are used in tests.

## Public acceptance and inventory

Production acceptance uses only exact health, obsolete-link redirect and public
marketing/portal GETs. It neither writes database fixtures nor creates live
Mollie transactions. Initial tenant/bootstrap setup is explicitly operator work;
website acceptance fails until the actual Veele tenant exists. A repeat of only
the acceptance job cannot replay deployment. `verify-production-website.mjs`
is intentionally tenant-specific like its existing staging equivalent; no tenant
fallback, seeded tenant or general application authorization change is introduced.
The fixed repository identifier in `verify-production-promotion.mjs` is an
attestation/promotion boundary, not tenant application data. These two narrowly
scoped operational scripts are added to the existing no-hardcoded-tenant check's
allowlist. All other application code keeps that check.

`lib/travel/provider-smoke.ts` permits production only at its canonical APP_URL,
uses public station coordinates, no tenant data, HTTPS without embedded credentials,
redirect refusal and sanitized output. Profile coverage includes a production case.
`scripts/check-security-surface.mjs` includes every new production operational
file and explicitly tracks environment, worker, routing and scanner helpers.
No authorization or database surface is removed; changed/new inventory entries
have this source review plus relevant test evidence recorded in the review ledger.

Remaining operator evidence: new Supabase and provider configuration; production
Unix/runner/service/proxy installation; production migrations/activation/worker;
real branded OTP delivery, tenant setup and mobile smoke; offsite backups and a
restore exercise. Neither the V1 acceptance record nor this review fabricates
those proofs. Secrets are configured only in GitHub Environment `production`;
source examples and tests contain fixed settings, placeholders or generated
local cryptographic fixtures.
