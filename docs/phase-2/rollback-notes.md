# Fieldgrid Phase 2 rollback notes

W12 performs no deployment and no production action. Rollback planning applies only to the later, separate main-to-staging promotion PR.

## Rollback principles

- Prefer reverting the staging promotion merge commit over ad-hoc fixes.
- Do not rollback by resetting shared branches without maintainer approval.
- Migrations are forward-only; do not edit or remove already-applied migration files.
- If a migration has reached staging, prepare a forward corrective migration and document the evidence.
- Production remains untouched by this closeout.

## Evidence locations

| Evidence | Location |
| --- | --- |
| Exact W11 acceptance artifact | `artifacts/fieldgrid-phase2-w11/cross-surface-acceptance-evidence.json` |
| W12 completion report | `docs/phase-2/completion-report.md` |
| Staging smoke runbook | `docs/phase-2/staging-smoke-runbook.md` |
| Final stale PR disposition | `docs/phase-2/final-stale-pr-disposition.md` and `.json` |
| Hardening register | `docs/security/fieldgrid-hardening-register.json` and `.md` |
| Readiness disposition source | `docs/readiness/open-pr-disposition-2026-07-14.json` and `.md` |

## Prepared rollback commands

Do not run these in W12. Use only after a failed staging promotion and maintainer approval.

```bash
git fetch origin main staging
git checkout -b rollback/phase2-staging-<date> origin/staging
git revert -m 1 <staging-promotion-merge-sha>
pnpm fieldgrid:staging-promotion-gate:check
pnpm fieldgrid:phase2-w11:check
git push origin rollback/phase2-staging-<date>
```

Open a rollback PR to `staging`, attach the failing smoke evidence, and link the corrective forward-migration plan if database state changed.
