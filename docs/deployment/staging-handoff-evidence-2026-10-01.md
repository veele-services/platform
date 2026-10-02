# Staging VPS handoff evidence — 2026-10-01

This record captures the operator-confirmed host transition that precedes the
first protected Fieldgrid V1 staging promotion. It contains no key material,
runtime values, tokens or database contents.

## Operator-confirmed result

- The root-only contract completed with:
  `Root-only staging key, trust and protected runtime metadata verified.`
- The unprivileged runner contract completed with:
  `Staging transfer-runner separation, denial and public unit contract verified.`
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
bundle. Before the next promotion, an operator must replace only the fixed
root-owned broker from the newly checksummed operator package and rerun both
contract controls. The existing handoff identity, trusted root, runner
separation, units and protected directories remain unchanged.
