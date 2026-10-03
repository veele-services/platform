# Fieldgrid V1 staging runbook

The first-host transition and scanner remediation history are recorded in
[staging-handoff-evidence-2026-10-01.md](staging-handoff-evidence-2026-10-01.md).
The later successful activation, paused-worker failure and recovery procedure
are recorded in [staging-worker-recovery-2026-10-03.md](staging-worker-recovery-2026-10-03.md).

This runbook prepares the existing staging VPS for the new Fieldgrid V1
runtime. It does not reuse, stop or remove a legacy application. Inspect live
paths and services before every operator command and keep production out of
scope.

## 1. GitHub controls

The GitHub Environment `staging` is already populated. In repository settings:

1. Restrict the environment's deployment branches to the protected
   `staging` branch only.
2. Protect `main` and require the `Fieldgrid CI / verify / verify` check before
   merge. Do not add a production environment or branch.
3. Protect `staging` against direct development. Promotions must use a commit
   already contained in `main`.

Credentialed preparation and acceptance jobs read configuration only from
GitHub Environment `staging` and run on fresh GitHub-hosted runners. The
persistent VPS runner receives no Environment secrets. Never create a VPS
`.env` by hand; the root broker decrypts and installs the workflow-generated
runtime file atomically without printing its values.

## 2. VPS runtime identity and filesystem

Use `fieldgrid` for the application and a **different non-root UID** for the
runner service. Only the runtime belongs to `clamav`; sharing a UID cannot
satisfy scanner isolation. Install Node.js 24, `rsync`, `curl`, `openssl`, GitHub
CLI and PostgreSQL 17 (or newer) client tools compatible with the hosted
Supabase PostgreSQL version. The hosted backup job uses an immutable PostgreSQL
17 client image; the VPS `pg_restore` must be able to validate that archive
before the root broker can activate it. The runner needs outbound HTTPS access but port 3301 must remain
private.

The persistent runner must not belong to `fieldgrid` or `clamav`. Give it an
own primary group and access only to the untrusted incoming directory. Installed
releases, runtime configuration and backups are owned by a broker/runtime
identity and are not readable or writable by the runner:

```text
/opt/fieldgrid/staging            root:root                         0711
/opt/fieldgrid/staging/incoming   fieldgrid-runner:fieldgrid-runner 0700
/opt/fieldgrid/staging/releases   root:fieldgrid                    0750
/opt/fieldgrid/staging/shared     root:fieldgrid                    0750
/opt/fieldgrid/staging/backups    root:root                         0700
```

Install the repository templates as system units:

- `deploy/fieldgrid@.service` → `/etc/systemd/system/fieldgrid@.service`
- `deploy/fieldgrid-worker@.service` →
  `/etc/systemd/system/fieldgrid-worker@.service`
- `deploy/fieldgrid-worker@.timer` →
  `/etc/systemd/system/fieldgrid-worker@.timer`

Initial host bootstrap is an operator action: units cannot start before a
release and its generated runtime file exist. The staging host has completed
the hardened handoff and subsequent checksummed scanner remediation. Exact
release `916ab0ec1ae9dbffe78f436c6d0a64dcb8e01a58` was installed on 3 October
2026 and returned exact-SHA public health with database and scanner ready. Its
workflow failed only because the worker timer remained paused after activation;
the operator has since resumed that timer. Do not repeat the one-time handoff,
replay the installed SHA through the broker, or edit/recreate the installed
runtime file. A new promotion must prove a fresh successful worker invocation
and complete hosted acceptance. See the linked recovery evidence for the exact
run and the workflow correction.
The ticket pipeline does not bootstrap a replacement VPS or bypass this gate;
restore a replacement host through a separately reviewed operator procedure.

Install the reviewed combined broker from `deploy/` root-owned and non-writable
by the runner. Give the runner passwordless sudo permission only for this exact
no-argument executable:

```text
/usr/local/sbin/fieldgrid-install-staging-release
```

Remove the old direct `systemctl restart` rule and any retired runtime/backup
broker rules. Do not grant general passwordless sudo. The broker validates all
paths, identities, three GitHub attestations, encrypted payloads and release
metadata before it uses its fixed systemctl action.

The first promotion attempt on 2 October 2026 applied and verified the complete
forward migration history, then stopped safely because the installed broker
had removed the `.json` suffix from its private copies of the attestation
bundles. The operator subsequently installed the corrected broker, SHA-256
`8f44ccbc7b98dbc6bedca8b85e4437b8cf5823143ede91cfee9566b1ebe96a34`, and
reran both contract checks successfully.

The second promotion attempt, staging workflow `36993643269` attempt 2, proved
the full verify, host-preflight, prepare, backup, complete 55-migration history,
encryption, all three attestations and broker installation for exact candidate
`bd7f69f6`. The broker installed release, runtime and backup and advanced
`current`. The web restart then failed before Node started because the installed
unit used `test -w /run/clamav/clamd.ctl` as a positive Unix-socket check. The
runtime is in the `clamav` group, the socket is `clamav:clamav` `0660`, the
daemons are active and `test -S` succeeds, but `test -w` returned status 1.
Public health therefore returned 502 and acceptance was skipped.

That recovery step is now historical. The checksummed operator update installed
the reviewed web unit at the actually loaded
`/etc/systemd/system/fieldgrid@staging.service` path and updated the public
runner-contract checker. The operator ran `daemon-reload`; the metadata-only
root control and current runner control passed before only the runner was
restarted. This is not execution of the later expanded rootchecker. No key/certificate,
trusted root, sudo rule, identity or protected directory was regenerated.

Historically, commit `d9084380f8278e634cb6ee372d2cc4ebe5e9b11e` passed complete `main` CI. Its
staging verify, host-preflight and hosted prepare jobs also passed; the broker
then installed and activated that exact release with database readiness. The
public health endpoint then returned HTTP 503 with
`scanner=unavailable`, so acceptance was skipped, the worker timer remains off,
and staging remains NO-GO. Current runtime evidence now establishes the cause:
`PING`, runtime UID/groups, the `clamav:clamav` `0660` socket, active services
with current definitions, EICAR rejection and PNG/PDF acceptance all pass, but
clamd `VERSION` returns `COMMAND UNAVAILABLE`. Fieldgrid therefore cannot
complete its mandatory engine/database-age validation. Do not retry the broker
with this already installed SHA: existing release paths are intentionally
non-replayable. Preserve the current ownership, mode and runner-denial
boundaries. If release content must change, promote a new fully reviewed SHA.
The Supabase Send Email Hook remains off and production remains untouched.

### One-time hardened handoff (operator)

Perform this in one maintenance window while the runner and worker timer are
stopped. Resolve the reviewed checkout explicitly; do not paste secrets and do
not run these commands against production.

1. Set `package_dir` to the absolute extracted path of the verified operator
   package. Give `fieldgrid-runner` its own primary group, keep the existing
   `r-x` ACL on `/home/fieldgrid`, and remove all `fieldgrid`/`clamav`
   supplementary groups. Install the reviewed runner drop-in and restart that
   same runner service:

   ```sh
   package_dir=/var/tmp/fieldgrid-staging-operator-handoff-REVIEWED
   getent group fieldgrid-runner >/dev/null || sudo groupadd fieldgrid-runner
   sudo usermod --gid fieldgrid-runner --groups '' fieldgrid-runner
   sudo chown -R fieldgrid-runner:fieldgrid-runner /home/fieldgrid/actions-runner
   sudo install -d -o root -g root -m 0755 \
     /etc/systemd/system/actions.runner.veele-services-platform.fieldgrid-staging-veele.service.d
   sudo install -o root -g root -m 0644 \
     "$package_dir/deploy/fieldgrid-staging-runner-user.conf" \
     /etc/systemd/system/actions.runner.veele-services-platform.fieldgrid-staging-veele.service.d/20-runner-user.conf
   sudo systemctl daemon-reload
   sudo systemctl restart actions.runner.veele-services-platform.fieldgrid-staging-veele.service
   ```

2. Create or correct the five paths to the owners/modes listed above. The
   `0711` staging root permits access to the known `incoming` path without
   permitting a directory listing; each protected child still denies the
   runner. Preserve release file execute bits while removing group/other write:

   ```sh
   sudo install -d -o root -g root -m 0711 /opt/fieldgrid/staging
   sudo install -d -o fieldgrid-runner -g fieldgrid-runner -m 0700 /opt/fieldgrid/staging/incoming
   sudo install -d -o root -g fieldgrid -m 0750 /opt/fieldgrid/staging/releases
   sudo install -d -o root -g fieldgrid -m 0750 /opt/fieldgrid/staging/shared
   sudo install -d -o root -g root -m 0700 /opt/fieldgrid/staging/backups
   sudo chown -R root:fieldgrid /opt/fieldgrid/staging/releases /opt/fieldgrid/staging/shared
   sudo chmod -R u=rwX,g=rX,o= /opt/fieldgrid/staging/releases /opt/fieldgrid/staging/shared
   sudo chown -R root:root /opt/fieldgrid/staging/backups
   sudo chmod -R u=rwX,go= /opt/fieldgrid/staging/backups
   sudo chown -R fieldgrid-runner:fieldgrid-runner /opt/fieldgrid/staging/incoming
   sudo chmod -R u=rwX,go= /opt/fieldgrid/staging/incoming
   ```

   Recursively transfer every installed release and the active `current`
   symlink to `root:fieldgrid`, removing group/other write bits. Transfer any
   retained backups to `root:root` mode `0600`. Transfer the old runtime file to
   `root:fieldgrid` mode `0640`; the runner must no longer be able to list or
   read it.
3. Create the root-only handoff identity once. Refuse to overwrite an existing
   key: inspect and deliberately rotate instead. A new installation can use:

   ```sh
   sudo install -d -o root -g root -m 0700 /etc/fieldgrid
   sudo test ! -e /etc/fieldgrid/staging-handoff.key
   sudo test ! -e /etc/fieldgrid/staging-handoff.crt
   sudo openssl req -x509 -newkey rsa:3072 -nodes -sha256 -days 397 \
     -subj '/CN=Fieldgrid staging release handoff' \
     -keyout /etc/fieldgrid/staging-handoff.key \
     -out /etc/fieldgrid/staging-handoff.crt
   sudo chown root:root /etc/fieldgrid/staging-handoff.key /etc/fieldgrid/staging-handoff.crt
   sudo chmod 0600 /etc/fieldgrid/staging-handoff.key
   sudo chmod 0644 /etc/fieldgrid/staging-handoff.crt
   sudo openssl x509 -in /etc/fieldgrid/staging-handoff.crt -noout -checkend 86400
   ```

   Copy only the public certificate to a trusted administrator workstation,
   encode it as one-line base64 and set GitHub Environment `staging` variable
   `STAGING_HANDOFF_ENCRYPTION_CERT_B64`. With an authenticated `gh` on that
   workstation this can be done without a command-line value:

   ```sh
   base64 -w0 staging-handoff.crt | gh variable set \
     STAGING_HANDOFF_ENCRYPTION_CERT_B64 --env staging \
     --repo veele-services/platform
   ```

   Never copy the private key off the VPS or into GitHub. Certificate rotation
   requires installing the new key/certificate and updating the public variable
   as one coordinated change before a promotion.
4. Install the reviewed broker and both separated contract controls root-owned:

   ```sh
   sudo install -o root -g root -m 0755 \
     "$package_dir/deploy/fieldgrid-install-staging-release" \
     /usr/local/sbin/fieldgrid-install-staging-release
   sudo install -d -o root -g root -m 0755 /usr/local/libexec/fieldgrid
   sudo install -o root -g root -m 0755 \
     "$package_dir/scripts/check-staging-root-contract.sh" \
     /usr/local/libexec/fieldgrid/check-staging-root-contract.sh
   sudo install -o root -g root -m 0755 \
     "$package_dir/scripts/check-staging-runner-contract.sh" \
     /usr/local/libexec/fieldgrid/check-staging-runner-contract.sh
   ```

5. Install GitHub CLI on the VPS. Generate the current GitHub attestation trust
   material with `gh attestation trusted-root` into a temporary operator-owned
   file, then install it as
   `/etc/fieldgrid/github-attestation-trusted-root.jsonl`, owner `root:root`,
   mode `0644`. Never place a GitHub token in this file. The private repository
   is in an Enterprise organization, so the protected workflow can create the
   required private-Sigstore build provenance.
6. Replace `/etc/sudoers.d/fieldgrid-runner` atomically with the packaged exact
   no-argument broker rule. No root-check, shell, systemctl or wildcard rule is
   allowed:

   ```sh
   sudo install -o root -g root -m 0440 \
     "$package_dir/deploy/fieldgrid-runner.sudoers" \
     /etc/sudoers.d/.fieldgrid-runner.candidate
   sudo visudo -cf /etc/sudoers.d/.fieldgrid-runner.candidate
   sudo mv -T /etc/sudoers.d/.fieldgrid-runner.candidate /etc/sudoers.d/fieldgrid-runner
   sudo visudo -cf /etc/sudoers.d/fieldgrid-runner
   ```

7. Pause `fieldgrid-worker@staging.timer`, install the reviewed web/worker unit
   templates and run `systemctl daemon-reload`. Do not restart either service
   before deployment has created `shared/runtime.env`:

   ```sh
   sudo systemctl stop fieldgrid-worker@staging.timer
   sudo install -o root -g root -m 0644 "$package_dir/deploy/fieldgrid@.service" /etc/systemd/system/fieldgrid@.service
   sudo install -o root -g root -m 0644 "$package_dir/deploy/fieldgrid-worker@.service" /etc/systemd/system/fieldgrid-worker@.service
   sudo install -o root -g root -m 0644 "$package_dir/deploy/fieldgrid-worker@.timer" /etc/systemd/system/fieldgrid-worker@.timer
   sudo systemctl daemon-reload
   ```

8. Install the new checksummed rootchecker before bringing ClamAV into its
   expanded rootgate contract. This is a targeted checker/config correction;
   do not repeat the one-time handoff and do not reinstall the already verified
   webunit, runnerchecker or broker solely for VERSION. The operator-owned
   `/etc/clamav/clamd.conf` must be a non-symlinked, root-owned
   file with one hardlink, no group/world-write or extended-access indicator,
   exactly one active `EnableVersionCommand yes` and no active `TCPSocket`.
   Never replace the complete daemon configuration with the repository example
   and never edit it in place without a backup. If VERSION is disabled, use the
   checksummed operator package to stop runner, worker timer/service and web;
   create a root-only backup; validate an atomic candidate with the installed
   ClamAV tooling; restart `clamav-daemon.service`; and roll back automatically
   if the daemon or VERSION probe fails. Preserve the canonical Unix socket,
   resource limits and freshclam configuration.

   The root-only control then verifies both protected release metadata and the
   live scanner boundary. Besides `/etc/fieldgrid`, the handoff key/certificate,
   attestation trusted root, broker and protected runtime metadata, it checks
   the canonical ClamAV config, the effective `clamav-daemon.socket` listener
   and active state, and binds the daemon `MainPID` plus listening Unix socket to
   the same service tree. It checks that tree and all other `clamd*` processes
   fail-closed for IPv4/IPv6 TCP listeners, then requires a bounded structured
   VERSION response on the Unix socket. It accepts the protected legacy
   `fieldgrid.env` during the coordinated
   first transition and must be rerun after deployment has created `runtime.env`:

   ```sh
   sudo /usr/bin/env -i \
     PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
     /usr/bin/bash /usr/local/libexec/fieldgrid/check-staging-root-contract.sh
   ```

   A successful expanded check prints exactly:

   ```text
   Root-only staging key, trust, protected runtime and scanner host contract verified.
   ```

   The historical output ending in `protected runtime metadata verified.` came
   from the older `c3dd469…` metadata-only checker and is insufficient here.

9. Run the unprivileged control as `fieldgrid-runner` with only canonical
   non-secret values. It must not traverse `/etc/fieldgrid` or read runtime
   metadata. It proves denial for `shared`, `releases` and `backups`, performs a
   bounded create/remove probe below `incoming`, checks public unit references,
   requires exactly one no-argument sudo broker rule and attests the scanner
   boundary without connecting: exact separate runner groups, a root/clamav-
   controlled `/run/clamav` without group/world write or access indicator,
   socket metadata `socket:clamav:clamav:660:1` and first socket `ls -ld` token
   `srw-rw----`:

   ```sh
   sudo -u fieldgrid-runner /usr/bin/env -i \
     PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
     DEPLOY_TARGET=staging \
     DEPLOY_ROOT=/opt/fieldgrid/staging \
     SERVICE_NAME=fieldgrid@staging.service \
     CLAMAV_ENABLED=true \
     CLAMAV_SOCKET=/run/clamav/clamd.ctl \
     /usr/bin/bash /usr/local/libexec/fieldgrid/check-staging-runner-contract.sh
   ```

The first protected promotion creates plaintext runtime/backup only on a fresh
GitHub-hosted runner, encrypts both to the public handoff certificate and
attests release plus ciphertext there. The persistent runner transfers those
bytes only. The combined root broker verifies all three attestations, decrypts
root-only and installs `runtime.env`, a root-only backup and a root-owned
release. Resume the worker timer only after the new web process is healthy; the
workflow then requires a fresh successful worker invocation before it can
complete.

An already installed release SHA is never reactivated from a retained handoff.
The broker also requires the signed GitHub observer timestamp of every
attestation to be no older than six hours (and not more than five minutes in the
future). If activation has not occurred and the handoff has expired, use
**Re-run all jobs** to create a fresh backup, build and attestations. Re-running
only a failed deploy reuses the expired preparation. Each preparation attempt
has its own immutable artifact, and deployment downloads its exact artifact ID.

After successful activation, retry only the separate `worker-acceptance` or
hosted `acceptance` job that failed. The worker job rechecks exact-SHA public
health before observing a fresh successful execution; it never invokes the
broker. A failure inside activation itself, a changed release, or a rollback
still requires a new reviewed commit and hosted-runner attestation. Historical
runs that combined activation and worker verification also require a forward
fix: retrying them executes the historical workflow and replays activation.

## 3. DNS and Caddy

Point both the base record and wildcard record at the staging VPS:

- `staging.fieldgrid.nl`
- `*.staging.fieldgrid.nl`

Adapt `deploy/Caddyfile.example` into the existing Caddy configuration. Both
hosts must preserve the original `Host` header and proxy only to
`127.0.0.1:3301`. The wildcard certificate requires Caddy's DNS challenge,
the matching DNS-provider module, and a provider token stored on the VPS—not
in Git or GitHub workflow output. Validate with `caddy validate` before a
graceful reload.

## 4. Dedicated staging runner

Run the existing runner under its separate runner identity (not `fieldgrid`) with
these labels:

```text
self-hosted, Linux, X64, fieldgrid-staging
```

Do not attach `fieldgrid-staging` to a production or legacy runner. Install the
current GitHub Actions runner release (compatible with Node 24 actions) as a
boot-enabled service and verify in GitHub that it is online and idle. The
existing generic/offline legacy runner is not a fallback.
This runner is a transfer-only boundary: workflow code on it must contain no
Environment-secret references, builds, migrations, backups or attestation
creation.

## 5. Supabase provider checks

Before promotion, verify in the dedicated staging project:

- Auth Site URL is `https://staging.fieldgrid.nl` and redirect allow-listing
  covers the intended staging tenant host pattern;
- the project is new/empty or its applied migrations are an exact prefix of the
  repository's V1 migration history, including subsequent module extensions;
- Storage has no legacy application data;
- SMTP is configured with the staging SendGrid sender if Auth email delivery
  is enabled.

Do not reset any remote database. The workflow checks all three database URLs
and both API URLs against `EXPECTED_SUPABASE_PROJECT_REF`, refuses the known
production ref, inspects migration history, builds first, creates and validates
a backup, and only then applies forward migrations. Immediately before that
write phase, the same isolated adapter and work directory perform a non-writing
Supabase CLI `db push --dry-run`. A failed dry-run or migration logs only its phase, a
repository-allowlisted migration filename, an allowlisted SQLSTATE and a coarse
failure category plus the allowlisted connection class (`direct` or
`session-pooler`); raw database and connection diagnostics remain suppressed.

The normal Supabase toolchain remains pinned to CLI `2.117.0`. The isolated
staging migration process alone uses the separately locked
`supabase-migration-client` alias at `2.109.1`, the final release before remote
`db push` moved from the Go implementation to the TypeScript database driver in
`2.110.0`. Both `2.118.0` and `2.117.0` reached the dedicated staging
session-pooler through the preceding project/history guard, but their hosted
`db push --dry-run` stopped before producing a migration plan. The migration
client receives a generated minimal config with migrations enabled, seeding
disabled and no `[db.vault]` values; `2.109.1` therefore needs no
TypeScript-only `--skip-vault` flag. Because this Go release can lose TLS query
parameters while normalizing a connection URL, the isolated child also pins
`PGSSLMODE=verify-full` and `PGSSLROOTCERT` to the reviewed private CA bundle;
URL and final driver parse must therefore both require certificate and hostname
verification. CLI telemetry is disabled for this secret-bearing process and its
private `HOME` cannot discover an ambient login or linked project. A clean local
forward replay from the exact 35-migration staging
prefix with `2.109.1` must produce the same 55
statement-history hashes recorded by the repository manifest. Do not change
this release pin without repeating that complete history check and a
non-writing hosted staging dry-run.

## 6. First promotion

First push the implementation to `main` and wait for `Fieldgrid CI` to pass.
Select that exact green commit SHA and promote it without developing on
`staging`:

```bash
git fetch origin main staging
git merge-base --is-ancestor <green-main-sha> origin/main
git push origin <green-main-sha>:refs/heads/staging
```

The `Verify and deploy staging` workflow reruns the full CI suite, including
all Playwright flows. Only after that job succeeds does a fresh hosted prepare
job build, back up, migrate, encrypt and attest. The self-hosted job only
transfers the handoff and invokes the broker. A final fresh hosted acceptance
job rejects the deployment unless `status`, `environment`, `database`,
`scanner`, and `release` all match.

If activation fails after a forward-only migration, the candidate remains
selected for diagnosis. The workflow never restores older, potentially
incompatible code automatically; use a reviewed forward fix or a separately
proven compatible operator action.

The 2 October `bd7f69f6` scanner-preflight incident and its operator fix are
complete: the reviewed unit is installed at the loaded staging-instance path,
systemd was reloaded, the historical metadata-rootcheck and current runnercheck
passed, and `d9084380` packages
`clamav-preflight.mjs`. Systemd retains `test -S` for path type and uses the
bounded clamd `PING`/`PONG` probe over the canonical Unix socket; `test -w` is
not positive scanner proof. The runner contract continues to prove its negative
boundary through exact runner groups, a non-writable root/clamav-controlled
parent without extended access, plus exact socket type, `clamav:clamav`
ownership, mode `0660`, one hardlink and no access indicator; it never connects
to clamd.

The current `d9084380` release is active and database-ready but reports
`scanner=unavailable` with HTTP 503. The current runtime, daemon, definition,
socket and direct-scan evidence proves that clamd is reachable and scans
correctly, while its disabled `VERSION` command withholds the engine/database
timestamp required by Fieldgrid's strict definition-age readiness. Keep the
worker timer off, do not broaden socket or runner access, and do not replay the
same SHA through the broker. The cause is diagnosed but not remediated. If a
code, packaging or reviewed host configuration change is required, promote or
apply it through the applicable controlled flow. Resume the timer only after
public health validates the exact active SHA with scanner readiness; then
require a new successful worker invocation that started after that activation.

## 7. First administrator and tenant

After the first healthy deployment, select branch `staging` in GitHub Actions
and run **Bootstrap staging platform administrator** once. Sign in at the base
staging origin, open `/platform`, create the first tenant with **Nieuwe tenant**
and use its chosen slug at:

- `https://{slug}.staging.fieldgrid.nl/app`
- `https://{slug}.staging.fieldgrid.nl/staff`

Use the platform tenant detail to upload the approved tenant logo, set branding,
select modules and review the four message templates before visual acceptance.
A remaining `LOGO` placeholder means branding acceptance is incomplete.

Complete `docs/staging-acceptance.md`. Only after explicit staging acceptance
may a separate production architecture, GitHub Environment, branch and runner
be designed.

## Ticket scanner and delivery readiness

The ticket release gate additionally requires an operator-provisioned supported
ClamAV daemon and freshclam updater. Deployment does not install these, grant
sudo, or change system units. Run the scanner under its own identity, without
access to Fieldgrid runtime credentials. Permit the `fieldgrid` identity to use
only `/run/clamav/clamd.ctl` (`clamav:clamav`, `0660`), never a TCP port. The
staging runner uses a different UID and has no `clamav` membership/access. Start from
`deploy/clamd-ticket.conf.example`; verify the actual loaded configuration has
PDF scanning, heuristic/encrypted-document alerts and `AlertExceedsMax yes`.
Keep daemon resources bounded and definitions refreshed. Do not log original
filenames, file contents, scanner JSON metadata or clean-file details.

Set `CLAMAV_ENABLED=true` and `CLAMAV_SOCKET=/run/clamav/clamd.ctl` in GitHub Environment `staging`; optional timeout and
definition-age limits are documented in the architecture. Do not manually copy
secrets into VPS environment files. The generated file is encrypted on the
hosted preparation runner and becomes `shared/runtime.env` only after root-only
decryption by the combined broker.
The application healthcheck performs EICAR rejection and clean PNG/PDF
acceptance under the actual runtime identity and sandbox. The staging runner
only verifies configuration, identity, installed public units, non-writable
scanner-directory metadata and exact socket metadata/access indicators; it
never connects and must not be given scanner access for preflight. A missing/
stale/erroring scanner blocks acceptance.
The web service separately performs a bounded clamd `PING`/`PONG` over the Unix
socket before Node starts; it does not treat `test -w` as proof of socket
connectability. This availability probe is not a replacement for the healthcheck
or the EICAR/clean-file acceptance.
See [ClamAV operator steps](clamav.md) for the current config/rootgate
remediation. Do not reinstall the already verified webunit solely for VERSION.

Tickets share `/api/worker` and the existing timer. Check a fresh successful
invocation after deploying, not just an active timer or historical unit result.
The separate `worker-acceptance` job observes the timer without starting or changing system units:
`scripts/check-worker-timer.sh` requires a successful execution that **started
after** the new web-service activation. An old successful result is insufficient.
It observes for up to ten minutes, allowing a bounded provider/scan batch to
finish and the operator to resume a timer paused for the runtime transition.
It fails closed if no fresh success appears. The `--installed` preflight mode
checks only the installed unit and exact worker target, never runtime success.
The existing loopback POST is admitted by the hostname proxy only for the exact
staging worker route/port and a valid worker secret; the handler authenticates
the secret again. This exception gives no access to tenant pages or other APIs.
Review only generic counters/status codes: pending/error scans remain private;
uncertain mail/push means provider acceptance could not be established and is
not automatically retried. Reconcile with the provider before any explicit
future retry mechanism. Notification contents and HR subjects are never log
fields. Test with controlled fixtures/sinks, never real employee recipients.

Upload cleanup removes only unbound artifacts older than 24 hours or drafts
explicitly discarded by their owner. A live scan lease delays deletion to avoid
a late-write race. Removing a draft frees its upload quota immediately.
Bound messages/support copies have no invented automatic retention purge.
