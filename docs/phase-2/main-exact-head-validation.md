# Phase 2B.5A exact-head main validation

## Immutable baseline

- Starting `main`: `fc947571877b92035418e5ded92795a5fc978c84`
- Approved Phase 2B head: `189cfc3c689c2454f2fa9a4c09ed38c8407e90aa`
- Approved-head tree: `717ce7a230c536e2222e0e0970238c375adcbdeb`
- Squash-main tree: `717ce7a230c536e2222e0e0970238c375adcbdeb`

The GitHub commit/tree API proves that the approved PR head and squash-merged
`main` commit contain the same tree. The different commit SHAs are therefore
solely the expected result of squash merging.

## Canonical validation

`.github/workflows/main-exact-head-validation.yml` is the stable orchestration
layer for:

- pull requests to `main`;
- every push to `main`, without path filtering;
- manual dispatch against the selected ref.

Every validation group checks out `github.sha` explicitly with persisted Git
credentials disabled and fails when `git rev-parse HEAD` differs. For a
manual dispatch, `github.ref` and `github.sha` are the ref and head recorded
by GitHub when the run is created. No caller-supplied environment or deploy
target exists.

The workflow runs the Runtime Safety static/build/database lanes, Runtime
Entrypoint Inventory, Fieldgrid Playwright and the Deploy Health validation
commands. Deploy Health is classified as validation-only: it uses a disposable
test baseline, has no environment, receives no repository secrets and invokes
no release, DNS, application, staging, production or migration-deployment
operation.

The always-emitted final context is:

`Main Exact Head Validation / Main exact-head gate`

It fails unless every authoritative validation group succeeds. Matrix jobs use
`fail-fast: false` so all diagnostics complete; no failure is suppressed and
no `continue-on-error` is used.

Validation concurrency is separated by event and ref. Only obsolete pull
request runs are cancelled. A `main` push run cannot cancel, or be cancelled
by, an unrelated pull-request run.

## Governance hand-off

Branch protection is deliberately not changed in Phase 2B.5A. The repository
is private on GitHub Free, has one organization owner and currently reports no
protection or required checks on `main`, `staging` or `production`.
Enabling approval enforcement now would create a single-reviewer lockout.

After the GitHub plan and reviewer model are upgraded, the prepared `main`
context is `Main Exact Head Validation / Main exact-head gate`. Do not require
the path-filtered `Baseline differential health gate` or skipped `Supabase
Preview` context. Promotion governance for `staging` and `production`
remains a separate later decision.

Until then, every merge remains a mutual human review decision: verify the
exact PR head, require the aggregate context to be green, and re-check that the
reviewed SHA has not changed before merging.

## Legacy PR disposition and retained backlog

PR #286 is implementation-superseded by merged PR #327 and current `main`.
Its older migration would create a parallel credential-recovery model and
conflicting auth rewrites. Preserve one policy question for Phase 2C or later:
whether privileged administrator-initiated resets require recent
authentication or MFA step-up.

PR #323 is superseded by the PR #322 recovery and the stronger Phase 2A
realtime/staffing implementation merged through PR #326. Its historical
`portal_realtime_emit` parameter rename conflicts with the established
signature now protected by the complete compatibility test. No unique change
should be carried forward.

Two unresolved PR #327 review findings are also retained for Phase 2C audit,
without changing Phase 2B product code here:

- rotate any legacy mailed temporary password when a pending invite is
  converted to activation-pending;
- define recovery behavior for users with multiple active tenant memberships.
