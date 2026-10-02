# Staging VPS handoff evidence — 2026-10-01

This record captures the operator-confirmed host transition that precedes the
first protected Fieldgrid V1 staging promotion. It contains no key material,
runtime values, tokens or database contents.

## Operator-confirmed result

- The root-only contract completed with:
  `Root-only staging key, trust and protected runtime metadata verified.`
  This exact output belongs to the historical metadata-only `c3dd469…` checker;
  preserve it as evidence and do not treat it as execution of the later expanded
  scanner-host check.
- The unprivileged runner contract completed with:
  `Staging transfer-runner separation, denial and public unit contract verified.`
  This first records the then-installed checker. The later hardened runner
  checker added exact parent-directory mutability/access and socket
  type/owner/group/mode/link/access-indicator attestation; it was subsequently
  installed and executed successfully as recorded below.
- The Actions runner is active as `fieldgrid-runner`, with primary group
  `fieldgrid-runner` and no supplementary groups. Its ACL on
  `/home/fieldgrid` is read/traverse (`r-x`), not traverse-only.
- `fieldgrid-worker@staging.timer` is intentionally `inactive/dead` until the
  first promoted release reports healthy web state and the exact expected SHA.
- GitHub Environment `staging` contains public variable
  `STAGING_HANDOFF_ENCRYPTION_CERT_B64`.
- The root operator retained the pre-handoff host backup at
  `/var/backups/fieldgrid-staging-handoff.ze5Pmkdk`.
- Staging-specific systemd instance configuration is installed. Superseded
  staging drop-ins were included in the operator backup, including the worker
  reference to the retired `shared/fieldgrid.env` runtime file.
- A follow-up host check on 2 October 2026 reported `pg_restore 18.6`
  (`Ubuntu 18.6-0ubuntu0.26.04.1`), satisfying the requirement to validate the
  PostgreSQL 17 archive format with an equal or newer client.

The private handoff key remains on the staging VPS. Its contents and those of
the operator backup are deliberately not recorded in the repository.

## GitHub control-plane verification

After the handoff, repository-side inspection confirmed:

- GitHub Environment `staging` has a custom deployment-branch policy allowing
  only branch `staging`.
- Runner `fieldgrid-staging-veele` is online with labels `self-hosted`, `Linux`,
  `X64` and `fieldgrid-staging`.
- The required staging variable and secret **names** are present, including the
  handoff certificate variable. No secret values were read.
- `GOOGLE_MAPS_SERVER_API_KEY` remains optional because
  `GOOGLE_ROUTES_ENABLED=false`; no legacy value is used as a fallback.
- The Supabase Send Email Hook remains disabled until the promoted release is
  healthy and its mail-hook endpoint is verified.

## First promotion gate

The protected workflow must perform, in order:

1. Verify the exact candidate and build it on a fresh hosted runner.
2. Verify the staging Supabase project-ref guards and migration history.
3. Create and validate a pre-migration backup.
4. Apply forward-only migrations and verify the complete history.
5. Encrypt and attest the runtime configuration and backup before transfer.
6. Let the transfer runner activate the release only through the fixed broker.
7. Verify public web health and the exact promoted commit SHA.
8. While the deploy job waits, have the operator run:

   ```sh
   sudo systemctl enable --now fieldgrid-worker@staging.timer
   ```

9. Require a new successful worker invocation after the web service activation.
10. Complete scanner, rollback-only database and provider acceptance checks.

Failure of any gate blocks staging acceptance. Production is outside this
handoff and remains untouched.

## First promotion attempt — 2 October 2026

Commit `f7fd0b2f25efd2bb00a144605ad809f44acf0c8c` first passed the complete
`Fieldgrid CI` run on `main` and was then promoted unchanged to `staging`.
Workflow run `36975937032` proved the project-ref guards, validated the
pre-migration backup, applied the remaining forward migrations and verified
the complete 55-migration statement history. Runtime and backup envelopes and
all three attestations were created on the hosted runner.

Activation then failed closed before any release, runtime file or backup was
installed and before either service was restarted. GitHub CLI rejected the
attestation bundle because the installed broker copied the three valid
`*.attestation.json` inputs to extensionless internal filenames. The exact
diagnostic was `bundle file extension not supported, must be json or jsonl`.
No verification control was bypassed, the worker timer was not resumed and the
Supabase Send Email Hook remained disabled. The staging database therefore has
the complete forward migration history, while the web runtime still awaits a
new candidate.

The reviewed correction preserves the `.json` suffix inside the root-owned
work directory and adds a regression check for every release/runtime/backup
bundle. Before the second promotion, the operator therefore had to replace
only the fixed root-owned broker from the newly checksummed operator package
and rerun both contract controls. The existing handoff identity, trusted root,
runner separation, units and protected directories remained unchanged.

## Broker correction and second promotion attempt — 2 October 2026

The operator installed the corrected broker and verified its exact SHA-256 as
`8f44ccbc7b98dbc6bedca8b85e4437b8cf5823143ede91cfee9566b1ebe96a34`.
Both separated controls then completed successfully again with the checkers
installed at that time. This was historical evidence; the later
exact-socket-metadata runner hardening was subsequently installed and executed.
The runner remained
active under `fieldgrid-runner`; the worker timer remained inactive.

Exact candidate `bd7f69f6233cd7066e3f042a718b1d9f629ee86a` passed the complete
`main` CI and was deliberately promoted unchanged. In staging workflow
`36993643269`, attempt 2 completed the full verification, host preflight,
hosted prepare, validated pre-migration backup, forward migration phase,
complete 55-migration history, runtime/backup encryption and all three
attestations. The corrected broker accepted those artifacts and installed the
root-owned release, protected backup and `shared/runtime.env`; `current` now
resolves to that candidate.

Web activation then failed before the Node process started. The installed
`fieldgrid@staging.service` used
`ExecStartPre=/usr/bin/test -w /run/clamav/clamd.ctl`. Operator diagnostics
confirmed all of the following at the same time:

- runtime user `fieldgrid` has supplementary group `clamav`;
- `/run/clamav/clamd.ctl` is a Unix socket owned by `clamav:clamav`, mode
  `0660`;
- `clamav-daemon.service` and `clamav-freshclam.service` are active;
- `test -S` succeeds; and
- the runtime `test -w` nevertheless returns status 1.

Systemd consequently entered an automatic restart-loop, public health returned
502 and the acceptance job was skipped. No zero-minute or bypass behavior was
introduced: the service failed closed. The worker timer was not resumed, the
Supabase Send Email Hook remained disabled and production remained untouched.

The diagnostic also identified the loaded unit as the staging-specific file
`/etc/systemd/system/fieldgrid@staging.service`. Recovery must therefore replace
that exact instance file from the reviewed packaged `deploy/fieldgrid@.service`
while web, runner and worker timer are stopped. Updating only the generic
`/etc/systemd/system/fieldgrid@.service` template would not change the unit
loaded on this host. After `daemon-reload` and both contract checks, only the
runner is resumed for promotion; the old web candidate stays stopped.

The incident establishes that `test -w` is not usable as positive proof that
this Unix socket accepts runtime connections. The forward fix retains the
socket-type check and replaces the write predicate with a bounded, packaged
clamd `PING`/`PONG` preflight under the runtime identity. It also makes the
runner contract reject the legacy check. The corrected negative runner gate
does not infer socket access from `test -r`/`test -w`: it combines exact runner
groups with a non-writable root/clamav-controlled parent and exact Unix-socket
type, `clamav:clamav` ownership, mode `0660`, one hardlink and absence of
extended-access indicators. Its disposable Linux test uses an actual socket
and separate UIDs, proves connection denial in the canonical state, proves
permissive mode drift is detected and demonstrates that writable-parent
substitution is possible but rejected. Those changes
require a new candidate and a reviewed operator update of the web unit before
promotion; the already installed `bd7f69f6` release must not be replayed or
started with a script it does not contain. Staging remains **NO-GO** until the
new SHA has full CI, healthy exact-SHA web activation, scanner/file acceptance,
a resumed timer with a fresh worker success, restore proof and provider checks.

## ClamAV forward fix and third promotion attempt — 2 October 2026

The operator installed the reviewed ClamAV forward-fix package for candidate
`700faaec493f43c10b2dd63f57f2c26568a6305b`. The metadata-only root control and
the hardened runner control completed successfully. The installed web unit,
release broker and runner check matched their published SHA-256 values. The
installed root check was the historical `c3dd469…` metadata-only version; it is
not the later local candidate that also checks clamd VERSION, the effective
socket unit and live process-owned TCP listeners. The runner was then
resumed while the web service and worker timer remained inactive. The operator
backup is retained at
`/var/backups/fieldgrid-staging-forward-fix-700faaec.QJ2E6n4w`.

The exact candidate passed `main` CI run `37010658744` and was promoted without
a merge commit. Staging run `37020411293` completed the full verification and
host preflight. Its hosted prepare job validated routing profiles, built and
packaged the release, created and validated the pre-migration backup, retained
the complete 55-migration history, encrypted runtime and backup payloads and
created all three attestations. The root broker accepted the handoff and
activated the exact candidate.

Public health then returned an empty Caddy HTTP 502 response. The deploy gate
failed closed before worker verification and acceptance; the worker timer was
not resumed. Reproduction with the exact attested `release.tar.gz` established
that `node server.js` terminated with a missing
`@swc/helpers/_/_interop_require_default` runtime module. The ClamAV protocol
preflight had succeeded and was not the cause.

The release packager had dereferenced the pnpm links in Next.js standalone
output. That relocated the physical `next` package while leaving its traced
hidden-hoist dependencies only below `.pnpm`, breaking Node's original module
ancestry. The forward recovery keeps the broker's link-free artifact contract,
materializes those traced pnpm runtime dependencies at top-level and launches
the final extracted tarball in mandatory `main` CI and staging prepare before
any backup or migration. It also reports a non-successful HTTP status before
attempting to parse a health response as JSON.

The failed candidate remains installed as immutable incident evidence and is
not modified or replayed. Recovery requires a new reviewed commit and exact-SHA
promotion; it does not require another privileged host handoff. The Supabase
Send Email Hook remains disabled and production remains untouched. Staging is
still **NO-GO** until that new candidate has healthy exact-SHA web activation,
a fresh post-activation worker success and the remaining acceptance evidence.

## Standalone artifact fix and fourth promotion attempt — 2 October 2026

The standalone-artifact correction was committed as
`d9084380f8278e634cb6ee372d2cc4ebe5e9b11e`. Exact-SHA `main` CI run
`37029578368` completed successfully, including the final extracted-artifact
launch smoke. The same commit was then fast-forwarded to `staging` without a
merge commit.

Staging run `37031911962` completed verification, the separated host preflight
and hosted preparation successfully. Preparation rebuilt and launched the
exact packaged artifact before database work, created the pre-migration backup,
applied and verified the complete 55-statement migration history, encrypted
the runtime and backup payloads and created all three attestations. The fixed
root broker accepted the handoff and activated exact release `d9084380`.

Public health then returned HTTP 503 while identifying the expected staging
environment and exact release. Its bounded response reported the database as
ready and the scanner as unavailable. This proves that the standalone web
runtime, release marker and database connection are active. A subsequent
read-only probe under the actual `fieldgrid` runtime identity established the
scanner cause: clamd answered `PING`, the process had UID 995/GID 982 and
supplementary `clamav` group 108, the socket was `clamav:clamav` mode `0660`,
both daemon and freshclam were active, and freshclam reported daily 28141, main
63 and bytecode 339 up-to-date. EICAR was rejected and the controlled PNG/PDF
were accepted. The clamd `VERSION` request, however, returned
`COMMAND UNAVAILABLE`; `clamdscan --version` explicitly reported that this
command is disabled while identifying the local engine as ClamAV 1.5.4.
Fieldgrid requests structured engine, database version and timestamp metadata
before scanning so it can enforce the maximum database age. That strict
readiness path therefore failed closed even though direct `INSTREAM` scanning
worked. The fresh-worker gate did not run, hosted acceptance was skipped and
the worker timer was not resumed.

The activated release is retained for diagnosis and cannot be replayed through
the broker. The Supabase Send Email Hook remains disabled, provider acceptance
has not started and production remains untouched. Staging remains **NO-GO**
until the proven `VERSION`-metadata incompatibility is remediated and verified,
exact-SHA public health is green, a fresh worker execution succeeds and the
remaining acceptance and provider controls complete. This evidence identifies
the cause; it does not claim that remediation has been applied.

The expanded root-check remediation remains local at this point. It has not
been installed or executed on the VPS and can only pass after a safely applied
`EnableVersionCommand yes` plus daemon restart. Its expected success message is
`Root-only staging key, trust, protected runtime and scanner host contract verified.`
