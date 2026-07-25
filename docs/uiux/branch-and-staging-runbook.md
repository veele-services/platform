# UI/UX branch and staging runbook

## Source flow

1. Fetch `origin/main`, `origin/staging` and `origin/production`.
2. Create a feature branch from the exact reviewed `codex/fieldgrid-uiux-master` head.
3. Run narrow tests while developing and the work-package gate before review.
4. Merge reviewed feature work into `codex/fieldgrid-uiux-master` in dependency order.
5. Run the integration gate, typecheck, builds, domain/security suites and Playwright evidence on the exact integration head.
6. Open one reviewed PR from `codex/fieldgrid-uiux-master` to `main`.
7. Record and re-check the exact reviewed head, require zero failed/cancelled/pending checks, then squash-merge with head matching.
8. Validate the exact resulting `main` head. Never push directly to `main`.

## Staging flow

1. Resolve the exact approved `main` candidate and expected current `staging` head.
2. Prove backup, isolated restore, migration rehearsal, required secrets, routing and rollback target.
3. Verify expected staging is an ancestor of the approved main candidate.
4. Promote the exact candidate with a normal non-force fast-forward ref push.
5. Fail closed on stale refs, remote rejection or a non-ancestor relationship.
6. Run W16 live tenant A/B, permissions, planboard, personnel, responsive, accessibility and migration acceptance.
7. Record evidence by traceability ID under `docs/uiux/evidence/`.

Never force-push, create a release branch, update production or treat staging-only repair as source code.

## Evidence naming

Use `<traceability-id>--<surface>--<viewport-or-scenario>.<ext>`, for example `PB-006--planbord--realtime-start.json` or `UX-058--tenant-overview--390.png`. Evidence must contain no credentials, session state or personal data.
