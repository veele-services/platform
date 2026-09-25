# Main and staging promotion model

This document is the canonical branch and environment contract for the current Fieldgrid staging phase.

## Roles

- `main` is the canonical source branch for reviewed work.
- `main` has no database, no runtime environment and no deployment target.
- `staging` is a release pointer for the live staging environment.
- `staging` must resolve to the exact promoted `main` commit SHA.
- `staging` is not an independent integration branch and must not accumulate merge-only history.
- The shared deploy workflow therefore accepts only an exact-SHA manual `staging` dispatch. The separate `fieldgrid-production-deploy.yml` workflow accepts an exact `main` SHA only after that same SHA has passed staging deployment and remains active there. Its production environment owns separate credentials, a verified private backup and restore rehearsal, runtime-principal checks, and paired application/environment rollback. See [Production release](../deployment/production-release.md). An ordinary push to `main` does not deploy either environment.

## Normal development flow

1. Create a feature or security branch from the current `main` SHA.
2. Open a pull request into `main`.
3. Run the required review and CI checks.
4. Merge the approved pull request into `main`.
5. Select the exact resulting `main` commit SHA for staging promotion.
6. Run the guarded fast-forward-only promotion command. It moves `staging`,
   restores and verifies branch protection, then explicitly dispatches the
   exact-SHA staging deployment.
7. Verify that `main` and `staging` resolve to the same commit SHA and that the
   exact dispatched deployment run is active.
8. Validate migrations, runtime services and public health on staging.

A pull request from `main` into `staging` must not be used for normal promotion because it creates an extra merge commit and causes branch-history drift.

An equal tree is not a substitute for shared ancestry. Do not create a
`codex/promote-*` branch with a copy or squash of `main`: that makes `staging`
look identical while breaking the next fast-forward promotion. If historical
squash promotions have already diverged the refs, repair them once through a
dedicated reviewed pull request into `main` whose branch contains a real merge
of the exact current `staging` commit. Preserve all normal protection and exact-
head checks; allow merge commits and suspend required linear history only for
that pinned reconciliation PR, then restore both repository settings
immediately. Verify afterward that the former staging SHA is an ancestor of the
new main SHA before using the normal exact-ref promotion command.

## Database rules

- Only the GitHub deployment environments own database credentials. `main`
  has none.
- GitHub secret `FIELDGRID_RUNTIME_DATABASE_URL` contains the queryless,
  least-privileged application credential. Workflows map it to runtime
  `DATABASE_URL`; it is the only database credential written to the shared
  service environment.
- The protected GitHub secret `DATABASE_URL` is the queryless migration/admin
  credential. Before the one-time cutover it is the legacy `postgres`
  bootstrap credential; after a successful reviewed bootstrap it must be
  manually replaced with the fixed `fieldgrid_migration_admin` Supavisor
  session-pooler URL. Database steps map it locally to
  `FIELDGRID_MIGRATION_DATABASE_URL`; it is used only for migrations, the
  Phase2E source backup, administrative backfills and the migration-admin
  ownership preflight, and is never written to service environment files.
- Do not add or consume a GitHub secret named
  `FIELDGRID_MIGRATION_DATABASE_URL`: that name is deliberately the
  step-scoped process variable for the existing stored `DATABASE_URL` secret.
- Both credentials must resolve structurally to the selected environment's
  Supabase project. Staging requires `olyfmekyqozxrbrwwszu`.
- GitHub secret `FIELDGRID_DATABASE_SSL_ROOT_CERT_BASE64` must contain the
  pinned Supabase Root 2021 CA. Every live workflow verifies its fingerprint,
  installs it as a private regular file for administrative checks and passes
  that exact path to Node.js and libpq (`PGSSLMODE=verify-full`). The separately
  pinned runtime copy may be `0640` so the `veele-deploy` service group can read
  this public certificate; group writes and all access by other users remain
  forbidden. `PGSSLROOTCERT=system`, URL
  query/fragment overrides and TLS opt-outs fail closed.
- A push or merge to `main` must never migrate a database.
- The regular staging deploy runs migrations before activating the release.
- Database Autofix is manual-only and must be dispatched from the `staging` branch.
- Database Autofix must validate both the selected branch and the expected staging Supabase project reference before running migrations.
- Secrets must never be printed in workflow logs.

### One-time staging migration-admin bootstrap

This is a staging-only prerequisite and is not a promotion or deployment. It
must run from the exact current `main` through **Fieldgrid Staging Migration
Admin Bootstrap**, whose default `plan` performs no database or service
mutation. Production project `ckdtiuemeygrnujjibnw` is an explicit deny target.

Operator sequence after the bootstrap change has merged:

1. Generate a 64-character lowercase hexadecimal password locally and store it
   only as staging environment secret `FIELDGRID_MIGRATION_DATABASE_PASSWORD`.
2. Record exact live `main` and `staging` SHAs and run the workflow with
   `operation=plan`; inspect its secret-free artifact.
3. Run `operation=apply` for those same SHAs with confirmation
   `fieldgrid-staging-migration-admin-bootstrap-v1:olyfmekyqozxrbrwwszu:<exact-main-sha>`.
4. Require a `passed` artifact proving the real
   `fieldgrid_migration_admin.olyfmekyqozxrbrwwszu` login over the Supavisor
   session pooler on port 5432, exact role attributes, application ownership,
   runtime ADMIN-without-INHERIT/SET topology, unchanged managed catalog,
   rollback-only rebuild capability, restored services and all four core
   runtime identities healthy on the exact expected staging SHA.
5. Manually replace staging environment secret `DATABASE_URL` with
   `postgresql://fieldgrid_migration_admin.olyfmekyqozxrbrwwszu:<FIELDGRID_MIGRATION_DATABASE_PASSWORD>@<FIELDGRID_STAGING_DATABASE_POOLER_HOST>:5432/postgres`.
6. Run **Fieldgrid Disposable Staging Rebuild** with `operation=plan`. Only a
   green read-only plan authorizes considering the separately confirmed
   destructive rebuild.

Never put the password in a workflow input, logs or an artifact. The bootstrap
workflow does not modify secrets, refs, branch protection or production and it
must not be used as evidence to move `staging`.

Current expected staging Supabase project reference:

```text
olyfmekyqozxrbrwwszu
```

## Staging promotion guard

There are two authenticated evidence routes. The existing Phase2E route remains
available for a data-preserving promotion. A disposable rebuild uses the manual
`Fieldgrid Disposable Staging Rebuild` workflow from the exact current `main`
SHA. Its default `plan` operation is read-only and is never valid promotion
evidence. Only a successful `rebuild` artifact whose report is `COMPLETE`, active,
smoke-passed and post-rebuild acceptance-passed can authorize the ref move. The
report must also prove the complete `fieldgrid-platform-only-v1` final state:
zero persistent tenants and tenant-scoped rows, zero Storage objects, one
canonical platform Auth account and one matching active platform owner.

Before this change is used after merge, change the sole required status check on
the protected `staging` branch from `Backup, restore and migration rehearsal` to
`Main exact-head gate` (GitHub Actions app id `15368`). Keep strict checks,
linear history, conversation resolution, the `TIXOCEO` actor restriction,
force-push/deletion bans and all other protection fields unchanged. The promoter
fails closed until its readback sees that exact contract.

Before moving the staging ref:

1. Record the approved `main` candidate SHA and the expected current `staging` SHA.
2. Fetch `main` and `staging` from `origin`.
3. Confirm current `origin/main` equals the approved candidate SHA.
4. Confirm current `origin/staging` equals the expected staging SHA.
5. Confirm the expected staging commit is an ancestor of the approved candidate.
6. Download the exact successful Phase2E GitHub Actions artifact by run ID,
   verify its workflow, repository, branch, candidate SHA and server-recorded
   digest, then validate its staging-smoke, migration-smoke and Phase2E JSON in
   an isolated temporary evidence root through the strict semantic gate.
7. Verify and snapshot the complete normalized promotion-protection contract
   for both branches,
   including the permanent `staging` push restriction to the dedicated
   `TIXOCEO` promotion actor.
8. Temporarily disable only `enforce_admins` on `main` and `staging` inside the
   promoter's bounded `try/finally` block. Required reviews, required status
   checks, linear history and conversation resolution stay enabled throughout;
   force pushes and deletions remain forbidden, and the staging actor
   restriction stays active.
9. Submit one GitHub `updateRefs` transaction that binds both `main` and
   `staging` through `beforeOid`, keeps `main` fixed and advances `staging` to
   the exact approved candidate.
10. Restore admin enforcement in the unconditional cleanup path and read back
    the complete normalized snapshotted protection states, even when GitHub
    rejects the transaction.
11. Fail closed if the evidence gate, provider transaction or protection
    readback fails.
12. Confirm after promotion that `main` and `staging` are identical.
13. Only after protection restoration and exact-ref readback, explicitly
    dispatch `deploy.yml` on `staging` with `expected_staging_sha` set to that
    SHA and `confirmation=fieldgrid-staging-deploy-exact-sha`. The deploy
    workflow has no push trigger.

This promotion path accepts only `main` as its source and `staging` as its
target. It does not use a release branch, create a merge commit on staging or
touch production.

Example guarded promotion:

```bash
APPROVED_MAIN_SHA="<exact reviewed and green main SHA>"
EXPECTED_STAGING_SHA="<exact current staging SHA>"
PREFLIGHT_RUN_ID="<successful exact-main Phase2E workflow run ID>"

pnpm fieldgrid:phase2e-staging-promote --run \
  --approved-main "${APPROVED_MAIN_SHA}" \
  --expected-staging "${EXPECTED_STAGING_SHA}" \
  --preflight-run-id "${PREFLIGHT_RUN_ID}" \
  --confirm phase2e-fast-forward-staging
```

Disposable rebuild promotion (only after the rebuild workflow is green):

```bash
REBUILD_RUN_ID="<successful rebuild workflow run ID>"

pnpm fieldgrid:phase2e-staging-promote --run \
  --approved-main "${APPROVED_MAIN_SHA}" \
  --expected-staging "${EXPECTED_STAGING_SHA}" \
  --rebuild-run-id "${REBUILD_RUN_ID}" \
  --confirm disposable-rebuild-fast-forward-staging
```

The promoter authenticates the workflow/run/repository/head SHA, GitHub artifact
digest and bounded `result.json`. It rejects plan artifacts, prepared-only
reports and failed/partial rebuilds. After the atomic ref advance it still
dispatches the normal exact-SHA `deploy.yml`; that ordinary deploy remains the
staging proof consumed by the separate production-release workflow. Production
backup, restore rehearsal and production runtime proof are unchanged.

The `:check` calls in pull-request and deploy workflows validate only the
static contract. They intentionally do not claim runtime proof. The mutating
promoter itself uses the authenticated GitHub CLI session to select exactly one
non-expired artifact from the named successful workflow run, verifies its
server-recorded SHA-256 digest, extracts only bounded JSON evidence into a new
temporary directory and runs the strict semantic evidence gate there before
its only provider-side atomic ref transaction. Locally copied or gitignored JSON is never promotion
evidence, and calling the promoter cannot bypass exact-SHA live-smoke,
migration-smoke or Phase2E evidence. Do not supply an artifact ID or digest by
hand; those values are read back from GitHub for the exact run ID.

GitHub re-evaluates protected-branch rules inside `updateRefs`, including for
the no-op `main` update needed to make the two `beforeOid` comparisons one
provider transaction. The authenticated promoter therefore verifies that its
actor is exactly `TIXOCEO`, snapshots both complete normalized promotion-
protection states and
temporarily disables only admin enforcement. It never removes the required
review, required status check or staging actor restriction. The exact `main`
commit has already passed its protected merge gate, and the promoter accepts
only the authenticated, successful, non-expired Phase2E run for that same SHA.
The `finally` path restores admin enforcement in reverse order; complete
normalized contract readback and exact `main`/`staging` ref readback must succeed before
the promoter dispatches the staging-only deploy workflow. A failed restoration
is a release incident and no deployment is dispatched. A hard interruption
also cannot trigger a deployment merely by moving `staging`, because
`deploy.yml` is manual-only; ordinary writers remain excluded by the permanent
staging actor restriction.

The authenticated `TIXOCEO` operator session needs repository Administration
write access for the scoped admin-enforcement toggle, Contents write access for
the atomic ref transaction and Actions write access for deployment dispatch.
If the process is interrupted, immediately re-enable `enforce_admins` on both
branches and verify the complete normalized promotion-protection contract
before retrying. Never dispatch deployment as part of that recovery.

The staging environment must provide the two explicit tenant host/ID pairs
required by the existing W00 ownership gate. That gate is a migration-admin
preflight: it intentionally uses only step-scoped
`FIELDGRID_MIGRATION_DATABASE_URL` and proves the expected table ownership
before the separate runtime-principal cutover. It must never receive runtime
`DATABASE_URL`.

The application principal is a separate, zero-table-ownership role: it must not
be an admin, superuser or `BYPASSRLS` role and must not control such a role. The
first redeploy under this contract is blocked until the runtime-role patch is
integrated and both `FIELDGRID_RUNTIME_DATABASE_URL` and the independent
`FIELDGRID_RUNTIME_DATABASE_PASSWORD` are provisioned. The deploy then invokes
the shared idempotent `fieldgrid-w00-runtime-principal.mjs --apply` helper with
the step-scoped migration credential and exact candidate SHA before running the
runtime-principal proof. Never temporarily place the migration/admin URL in the
runtime secret or shared `.env`.

## Deployment behavior

The staging deployment must:

1. Accept only an explicit `workflow_dispatch` on `staging`, bind its expected
   SHA to `$GITHUB_SHA`, and prove live `main` and `staging` both equal it before
   checkout or any checked-out repository code runs.
2. Check out that exact staging SHA and repeat the immutable-ref proof.
3. Attach only to the GitHub `staging` environment.
4. validate required staging configuration without exposing secrets and write
   the candidate runtime environment only inside the new release directory;
5. install locked dependencies;
6. run release and migration-order checks;
7. build the workspace;
8. run database migrations with `FIELDGRID_MIGRATION_DATABASE_URL`;
9. run any required admin backfills with that migration credential;
10. run the existing strict W00 migration-admin ownership proof with only
    step-scoped `FIELDGRID_MIGRATION_DATABASE_URL`, then bind the fresh report to
    the exact release marker and `$GITHUB_SHA`;
11. idempotently apply the reviewed runtime principal with
    `fieldgrid-w00-runtime-principal.mjs --apply`, the step-scoped migration URL,
    `FIELDGRID_RUNTIME_DATABASE_PASSWORD`, the dedicated runtime URL, the fixed
    confirmation value and the exact `$GITHUB_SHA`;
12. run `fieldgrid-w00-runtime-principal-gate.mjs --strict` using only the
    runtime URL and exact release/environment inputs, proving zero table
    ownership and the required minimum capabilities;
13. atomically publish the prepared runtime environment and activate the release
    only after both principal gates pass;
14. restart the configured staging services;
15. verify application health and, on failure, restore both the previous
    `current` symlink and previous `shared/.env`.

The W00 ownership proof deliberately runs after every database-backed
migration/backfill but before runtime-principal provisioning or verification
and activation. Normal and recovery deploys retain the strict tenant-pair path.
The disposable rebuild instead uses `strict-platform-only`: it accepts no
permanent tenant bindings and proves migration-admin ownership plus the exact
zero-tenant catalog state before runtime-principal cutover. If a required
credential or scope-specific proof is not ready, deployment stops before
activation and the previous application release and environment stay active.
An already-applied forward migration remains in place
and must be compatible with that previous release.

## Rollback

For a disposable rebuild, old staging data and the previous code release are not
rollback targets. Any failure after writers are stopped leaves every staging
writer stopped. Fix the reviewed code/configuration on `main` and rerun the full
rebuild. Do not manually start old code against the rebuilt schema/data. This is
intentionally different from the data-preserving deployment rollback below.

A staging rollback may use:

- an archived staging branch or tag;
- a prior release directory and symlink;
- the verified database backup;
- the verified Storage backup.

Do not run a down migration unless it has been explicitly designed and restore-tested.

A failed post-activation health gate must restore the previous release symlink
and the paired previous `shared/.env`; restoring code without its matching
runtime configuration is not a valid rollback. When the active release marker
therefore differs from the `staging` Git ref, a new Phase2E rehearsal must name
both exact values and the failed deploy run that proves the rollback:

```bash
PHASE2E_CONFIRM=phase2e-staging-only \
pnpm fieldgrid:phase2e-staging-preflight --run \
  --expected-main "${APPROVED_MAIN_SHA}" \
  --expected-staging "${EXPECTED_STAGING_SHA}" \
  --expected-active-staging-release "${EXPECTED_ACTIVE_STAGING_RELEASE_SHA}" \
  --rollback-deploy-run-id "${FAILED_DEPLOY_RUN_ID}"
```

The preflight accepts divergence only after exact GitHub `workflow_dispatch`
run, deploy-job and
diagnostics-artifact readback proves a fresh failed staging deploy and a
successful paired rollback. The one pinned legacy recovery run above predates
the manual-only trigger and remains accepted only with its exact immutable run,
artifact and digest tuple. That historical incident is exempt from the ordinary
seven-day run/artifact age limit in both preflight and promotion; its artifact
must still be available and non-expired, and invalid or future timestamps remain
rejected. The exception requires the pinned legacy schema and downloaded content
digest, so an altered or versioned replacement cannot inherit it. Every new
preflight still reads the current symlink, exact release marker, active services
and public routes, and creates and rehearses a fresh backup. The resulting
preflight, live smoke and migration evidence retain their existing freshness
requirements. If Git and the active marker are aligned, omit the rollback run ID.

## Current Sprint 0 recovery points

- pre-reconciliation staging archive: `archive/staging-post-recovery-green-20260711`
- annotated tag: `staging-post-recovery-green-20260711`
- archived commit: `f2bc9e01550e616c3ded4b4e42b0efccc52773d6`
- reconciled baseline before workflow hardening: `eac95e58bd4f0009e5ae3aa9b8d4966cfeea0615`
