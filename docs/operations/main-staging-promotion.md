# Main and staging promotion model

This document is the canonical branch and environment contract for the current Fieldgrid staging phase.

## Roles

- `main` is the canonical source branch for reviewed work.
- `main` has no database, no runtime environment and no deployment target.
- `staging` is a release pointer for the live staging environment.
- `staging` must resolve to the exact promoted `main` commit SHA.
- `staging` is not an independent integration branch and must not accumulate merge-only history.
- Production is outside the current operating scope and must not be used until staging is explicitly declared complete.

## Normal development flow

1. Create a feature or security branch from the current `main` SHA.
2. Open a pull request into `main`.
3. Run the required review and CI checks.
4. Merge the approved pull request into `main`.
5. Select the exact resulting `main` commit SHA for staging promotion.
6. Move the `staging` ref to that exact SHA with the guarded fast-forward-only promotion command.
7. Verify that `main` and `staging` resolve to the same commit SHA before enabling or starting deployment.
8. Deploy the staging ref and validate migrations, runtime services and public health.

A pull request from `main` into `staging` must not be used for normal promotion because it creates an extra merge commit and causes branch-history drift.

## Database rules

- Only the GitHub `staging` environment owns a `DATABASE_URL`.
- A push or merge to `main` must never migrate a database.
- The regular staging deploy runs migrations before activating the release.
- Database Autofix is manual-only and must be dispatched from the `staging` branch.
- Database Autofix must validate both the selected branch and the expected staging Supabase project reference before running migrations.
- Secrets must never be printed in workflow logs.

Current expected staging Supabase project reference:

```text
olyfmekyqozxrbrwwszu
```

## Staging promotion guard

Before moving the staging ref:

1. Record the approved `main` candidate SHA and the expected current `staging` SHA.
2. Fetch `main` and `staging` from `origin`.
3. Confirm current `origin/main` equals the approved candidate SHA.
4. Confirm current `origin/staging` equals the expected staging SHA.
5. Confirm the expected staging commit is an ancestor of the approved candidate.
6. Push the exact approved candidate SHA normally to `refs/heads/staging`.
7. Fail closed if the remote rejects the update.
8. Confirm after promotion that `main` and `staging` are identical.

This promotion path accepts only `main` as its source and `staging` as its
target. It does not use a release branch, create a merge commit on staging or
touch production.

Example guarded promotion:

```bash
APPROVED_MAIN_SHA="<exact reviewed and green main SHA>"
EXPECTED_STAGING_SHA="<exact current staging SHA>"

pnpm fieldgrid:phase2e-staging-promote --run \
  --approved-main "${APPROVED_MAIN_SHA}" \
  --expected-staging "${EXPECTED_STAGING_SHA}" \
  --confirm phase2e-fast-forward-staging
```

## Deployment behavior

The staging deployment must:

1. Check out the exact staging SHA.
2. Attach only to the GitHub `staging` environment.
3. validate required staging configuration without exposing secrets;
4. install locked dependencies;
5. run release and migration-order checks;
6. build the workspace;
7. run database migrations;
8. activate the release only after a successful build and migration;
9. restart the configured staging services;
10. verify application health.

## Rollback

A staging rollback may use:

- an archived staging branch or tag;
- a prior release directory and symlink;
- the verified database backup;
- the verified Storage backup.

Do not run a down migration unless it has been explicitly designed and restore-tested.

## Current Sprint 0 recovery points

- pre-reconciliation staging archive: `archive/staging-post-recovery-green-20260711`
- annotated tag: `staging-post-recovery-green-20260711`
- archived commit: `f2bc9e01550e616c3ded4b4e42b0efccc52773d6`
- reconciled baseline before workflow hardening: `eac95e58bd4f0009e5ae3aa9b8d4966cfeea0615`
