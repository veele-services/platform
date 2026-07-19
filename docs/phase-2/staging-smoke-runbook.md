# Fieldgrid Phase 2 staging smoke runbook

Purpose: prepare the post-merge main-to-staging smoke without executing it in Phase 2D.

## Preconditions

1. Phase 2D closeout PR is squash-merged to `main` after exact-head CI and human review.
2. Record immutable `main` SHA: `git rev-parse origin/main`.
3. Record expected `staging` base SHA: `git rev-parse origin/staging`.
4. Compare `main` to `staging`: `git log --oneline --decorate origin/staging..origin/main` and `git diff --stat origin/staging..origin/main`.
5. Open a separate draft promotion PR from `main` to `staging`; do not push to `staging` directly.
6. Confirm no production deployment workflow is triggered by the promotion PR.

## Required checks before staging merge

```bash
pnpm fieldgrid:phase2-w11
pnpm fieldgrid:phase2-w11:check
pnpm fieldgrid:staging-promotion-gate:check
pnpm fieldgrid:phase2-hardening-report -- --json
node --test tests/fieldgrid-phase2-w11-cross-surface-acceptance.test.mjs
node --test tests/fieldgrid-hardening-register-current.test.mjs tests/fieldgrid-open-pr-disposition-2026-07-14.test.mjs
```

## Staging deployment watch commands

Run only after the separate promotion PR is approved and merged:

```bash
git fetch origin main staging
git rev-parse origin/main
git rev-parse origin/staging
git log --oneline --decorate origin/main..origin/staging
pnpm fieldgrid:staging-promotion-gate:strict
```

If the deployment platform exposes logs, watch the staging deployment only. Do not run production deploy commands.

## Authenticated smoke sequence

Use tenant-scoped test users and never service-role browser credentials.

1. Backoffice login: verify tenant host, assignment list and planboard load.
2. Planboard planned/actual: verify a scheduled assignment keeps planned history after actual early start/complete.
3. Interest selection: select first candidate, verify partial staffing, select final candidate and verify scheduled state.
4. Availability: mark a personnel slot unavailable/sick and confirm selection is blocked with a planner-safe reason.
5. Multi-person execution: two personnel users start and complete independently; verify aggregate state changes only after all required participants complete.
6. Personnel offline replay: queue start/complete offline, reconnect, verify replay count is one and evidence is not duplicated.
7. Customer portal: verify scheduled, in-progress and completed states; verify unapproved reports/evidence are hidden.
8. Credential recovery: complete activation/reset; verify invalid, expired and replayed challenges fail.
9. Tenant guard: confirm Tenant A users cannot read or mutate Tenant B assignments across backoffice, personnel and customer surfaces.
10. Accessibility spot-check: keyboard navigation and axe summary for planboard, personnel assignment, customer assignment and credential recovery.

## Evidence to attach to promotion PR

- Exact-head CI runtime acceptance artifact: `artifacts/fieldgrid-phase2-runtime/runtime-acceptance.json`.
- Browser summary, JUnit, Playwright HTML report, failure traces, fixture evidence, data-path proof and accessibility summary from `artifacts/fieldgrid-playwright/**`.
- Confirm issues #330, #331, #333 and #334 remain tracked in the production go/no packet.
- Staging promotion gate output.
- Hardening report JSON output.
- Deployment logs for staging only.
- Smoke screenshots/traces only when useful and redacted.
