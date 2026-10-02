# Staging VPS handoff evidence — 2026-10-01

This record captures the operator-confirmed host transition that precedes the
first protected Fieldgrid V1 staging promotion. It contains no key material,
runtime values, tokens or database contents.

## Operator-confirmed result

- The root-only contract completed with:
  `Root-only staging key, trust and protected runtime metadata verified.`
- The unprivileged runner contract completed with:
  `Staging transfer-runner separation, denial and public unit contract verified.`
  This records the then-installed checker. The later hardened checker adds exact
  parent-directory mutability/access and socket type/owner/group/mode/link/
  access-indicator attestation and still needs a fresh host run from the new
  checksummed operator package.
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
Both separated controls then completed successfully again with the checker
installed at that time. This is historical evidence, not the still-pending
host result for the later exact-socket-metadata hardening. The runner remained
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
