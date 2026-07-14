# FIELDGRID open PR disposition and cleanup plan — 2026-07-14

Repository: `veele-services/platform`  
Current base: `42edb5664ed507ed914b8bebf8847ab1f6e39f74`  
Branch: `codex/open-pr-disposition-20260714`

## Audit boundary and limitation

This is a documentation/test PR only. No merge, PR closing, branch deletion, or deployment is part of this plan.
- GitHub PR metadata was not accessible from this workspace: gh is not installed, no git remote is configured, and unauthenticated GitHub API/HTTPS git access returned 404/authentication errors.
- Fields that require live GitHub access are marked UNKNOWN_AUTH_REQUIRED and must be refreshed by a maintainer before acting on runtime branches.

## Open PR disposition matrix

| PR | Title | Type | Base SHA | Head SHA | Behind/Ahead | Mergeability | Files | Migrations | Runtime | Tests | Workflows | Disposition | Next action |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|---|
| #279 | UNKNOWN_AUTH_REQUIRED: PR #279 title requires GitHub metadata refresh | audit | `UNKNOWN_AUTH_REQUIRED` | `UNKNOWN_AUTH_REQUIRED` | UNKNOWN_AUTH_REQUIRED/UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | False | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | EXTRACT_EVIDENCE_THEN_CLOSE | `git fetch origin pull/279/head:review/pr-279 && git checkout review/pr-279 && mkdir -p docs/readiness/pr-279-evidence && git diff --name-only origin/main...HEAD > docs/readiness/pr-279-evidence/changed-files.txt` |
| #280 | UNKNOWN_AUTH_REQUIRED: PR #280 title requires GitHub metadata refresh | architecture | `UNKNOWN_AUTH_REQUIRED` | `UNKNOWN_AUTH_REQUIRED` | UNKNOWN_AUTH_REQUIRED/UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | False | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | PARK_ARCHITECTURE | `git fetch origin pull/280/head:review/pr-280 && git checkout review/pr-280 && cp <architecture-docs> docs/readiness/pr-280-architecture-notes.md` |
| #281 | UNKNOWN_AUTH_REQUIRED: PR #281 title requires GitHub metadata refresh | implementation | `UNKNOWN_AUTH_REQUIRED` | `UNKNOWN_AUTH_REQUIRED` | UNKNOWN_AUTH_REQUIRED/UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | True | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | REBUILD_FROM_CURRENT_MAIN | `git fetch origin main pull/281/head:review/pr-281 && git checkout -b rebuild/pr-281 origin/main && git cherry-pick <audited-safe-commits-from-review/pr-281> && pnpm install --frozen-lockfile && pnpm fieldgrid:test-layers:check` |
| #282 | UNKNOWN_AUTH_REQUIRED: PR #282 title requires GitHub metadata refresh | implementation | `UNKNOWN_AUTH_REQUIRED` | `UNKNOWN_AUTH_REQUIRED` | UNKNOWN_AUTH_REQUIRED/UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | True | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | REBUILD_FROM_CURRENT_MAIN | `git fetch origin main pull/282/head:review/pr-282 && git checkout -b rebuild/pr-282 origin/main && git cherry-pick <audited-safe-commits-from-review/pr-282> && pnpm install --frozen-lockfile && pnpm fieldgrid:test-layers:check` |
| #283 | UNKNOWN_AUTH_REQUIRED: PR #283 title requires GitHub metadata refresh | tooling | `UNKNOWN_AUTH_REQUIRED` | `UNKNOWN_AUTH_REQUIRED` | UNKNOWN_AUTH_REQUIRED/UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | False | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | RETAIN_REBASE_COMPLETE | `git fetch origin main pull/283/head:review/pr-283 && git checkout review/pr-283 && git rebase origin/main && pnpm install --frozen-lockfile && pnpm fieldgrid:test-layers:check` |
| #284 | UNKNOWN_AUTH_REQUIRED: PR #284 title requires GitHub metadata refresh | reproduction | `UNKNOWN_AUTH_REQUIRED` | `UNKNOWN_AUTH_REQUIRED` | UNKNOWN_AUTH_REQUIRED/UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | False | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | DO_NOT_MERGE | `git fetch origin pull/284/head:review/pr-284 && git checkout review/pr-284 && git diff --name-only origin/main...HEAD # extract reproduction only; do not merge branch` |
| #285 | UNKNOWN_AUTH_REQUIRED: PR #285 title requires GitHub metadata refresh | implementation | `UNKNOWN_AUTH_REQUIRED` | `UNKNOWN_AUTH_REQUIRED` | UNKNOWN_AUTH_REQUIRED/UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | True | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | REBUILD_FROM_CURRENT_MAIN | `git fetch origin main pull/285/head:review/pr-285 && git checkout -b rebuild/pr-285 origin/main && git cherry-pick <audited-safe-commits-from-review/pr-285> && pnpm install --frozen-lockfile && pnpm fieldgrid:test-layers:check` |
| #286 | UNKNOWN_AUTH_REQUIRED: PR #286 title requires GitHub metadata refresh | audit | `UNKNOWN_AUTH_REQUIRED` | `UNKNOWN_AUTH_REQUIRED` | UNKNOWN_AUTH_REQUIRED/UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | False | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | SUPERSEDED_CLOSE | `git fetch origin pull/286/head:review/pr-286 && git diff --stat origin/main...review/pr-286 # confirm fully covered by merged PRs before human closes PR #286` |
| #287 | UNKNOWN_AUTH_REQUIRED: PR #287 title requires GitHub metadata refresh | tooling | `UNKNOWN_AUTH_REQUIRED` | `UNKNOWN_AUTH_REQUIRED` | UNKNOWN_AUTH_REQUIRED/UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | False | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | RETAIN_REBASE_COMPLETE | `git fetch origin main pull/287/head:review/pr-287 && git checkout review/pr-287 && git rebase origin/main && pnpm install --frozen-lockfile && pnpm fieldgrid:test-layers:check` |
| #288 | UNKNOWN_AUTH_REQUIRED: PR #288 title requires GitHub metadata refresh | audit | `UNKNOWN_AUTH_REQUIRED` | `UNKNOWN_AUTH_REQUIRED` | UNKNOWN_AUTH_REQUIRED/UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | False | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | EXTRACT_EVIDENCE_THEN_CLOSE | `git fetch origin pull/288/head:review/pr-288 && git checkout review/pr-288 && mkdir -p docs/readiness/pr-288-evidence && git diff --name-only origin/main...HEAD > docs/readiness/pr-288-evidence/changed-files.txt` |
| #289 | UNKNOWN_AUTH_REQUIRED: PR #289 title requires GitHub metadata refresh | architecture | `UNKNOWN_AUTH_REQUIRED` | `UNKNOWN_AUTH_REQUIRED` | UNKNOWN_AUTH_REQUIRED/UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | False | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | PARK_ARCHITECTURE | `git fetch origin pull/289/head:review/pr-289 && git checkout review/pr-289 && cp <architecture-docs> docs/readiness/pr-289-architecture-notes.md` |
| #290 | UNKNOWN_AUTH_REQUIRED: PR #290 title requires GitHub metadata refresh | implementation | `UNKNOWN_AUTH_REQUIRED` | `UNKNOWN_AUTH_REQUIRED` | UNKNOWN_AUTH_REQUIRED/UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | True | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | REBUILD_FROM_CURRENT_MAIN | `git fetch origin main pull/290/head:review/pr-290 && git checkout -b rebuild/pr-290 origin/main && git cherry-pick <audited-safe-commits-from-review/pr-290> && pnpm install --frozen-lockfile && pnpm fieldgrid:test-layers:check` |
| #292 | UNKNOWN_AUTH_REQUIRED: PR #292 title requires GitHub metadata refresh | audit | `UNKNOWN_AUTH_REQUIRED` | `UNKNOWN_AUTH_REQUIRED` | UNKNOWN_AUTH_REQUIRED/UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | False | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | SUPERSEDED_CLOSE | `git fetch origin pull/292/head:review/pr-292 && git diff --stat origin/main...review/pr-292 # confirm fully covered by merged PRs before human closes PR #292` |
| #293 | UNKNOWN_AUTH_REQUIRED: PR #293 title requires GitHub metadata refresh | implementation | `UNKNOWN_AUTH_REQUIRED` | `UNKNOWN_AUTH_REQUIRED` | UNKNOWN_AUTH_REQUIRED/UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | True | UNKNOWN_AUTH_REQUIRED | UNKNOWN_AUTH_REQUIRED | RETAIN_REBASE_COMPLETE | `git fetch origin main pull/293/head:review/pr-293 && git checkout review/pr-293 && git rebase origin/main && pnpm install --frozen-lockfile && pnpm fieldgrid:test-layers:check` |

## Blockers and overlap policy

### PR #279
- Unresolved blockers: Refresh PR metadata with authenticated GitHub access; Rebase or rebuild on current main before any merge decision.
- Overlap with merged #278/#291/#294/#295/#296: 278, 291, 294, 295, 296; requires authenticated diff confirmation.
- Overlap with other open PRs: 292, 293.
- Safe disposition: `EXTRACT_EVIDENCE_THEN_CLOSE`.

### PR #280
- Unresolved blockers: Refresh PR metadata with authenticated GitHub access; Rebase or rebuild on current main before any merge decision.
- Overlap with merged #278/#291/#294/#295/#296: 278, 291, 294, 295, 296; requires authenticated diff confirmation.
- Overlap with other open PRs: 281, 282, 283.
- Safe disposition: `PARK_ARCHITECTURE`.

### PR #281
- Unresolved blockers: Refresh PR metadata with authenticated GitHub access; Rebase or rebuild on current main before any merge decision.
- Overlap with merged #278/#291/#294/#295/#296: 278, 291, 294, 295, 296; requires authenticated diff confirmation.
- Overlap with other open PRs: 280, 282, 283.
- Safe disposition: `REBUILD_FROM_CURRENT_MAIN`.

### PR #282
- Unresolved blockers: Refresh PR metadata with authenticated GitHub access; Rebase or rebuild on current main before any merge decision.
- Overlap with merged #278/#291/#294/#295/#296: 278, 291, 294, 295, 296; requires authenticated diff confirmation.
- Overlap with other open PRs: 280, 281, 283.
- Safe disposition: `REBUILD_FROM_CURRENT_MAIN`.

### PR #283
- Unresolved blockers: Refresh PR metadata with authenticated GitHub access; Rebase or rebuild on current main before any merge decision.
- Overlap with merged #278/#291/#294/#295/#296: 278, 291, 294, 295, 296; requires authenticated diff confirmation.
- Overlap with other open PRs: 280, 281, 282.
- Safe disposition: `RETAIN_REBASE_COMPLETE`.

### PR #284
- Unresolved blockers: Refresh PR metadata with authenticated GitHub access; Rebase or rebuild on current main before any merge decision.
- Overlap with merged #278/#291/#294/#295/#296: 278, 291, 294, 295, 296; requires authenticated diff confirmation.
- Overlap with other open PRs: 280, 281, 282.
- Safe disposition: `DO_NOT_MERGE`.

### PR #285
- Unresolved blockers: Refresh PR metadata with authenticated GitHub access; Rebase or rebuild on current main before any merge decision.
- Overlap with merged #278/#291/#294/#295/#296: 278, 291, 294, 295, 296; requires authenticated diff confirmation.
- Overlap with other open PRs: 280, 281, 282.
- Safe disposition: `REBUILD_FROM_CURRENT_MAIN`.

### PR #286
- Unresolved blockers: Refresh PR metadata with authenticated GitHub access; Rebase or rebuild on current main before any merge decision.
- Overlap with merged #278/#291/#294/#295/#296: 278, 291, 294, 295, 296; requires authenticated diff confirmation.
- Overlap with other open PRs: 280, 281, 282.
- Safe disposition: `SUPERSEDED_CLOSE`.

### PR #287
- Unresolved blockers: Refresh PR metadata with authenticated GitHub access; Rebase or rebuild on current main before any merge decision.
- Overlap with merged #278/#291/#294/#295/#296: 278, 291, 294, 295, 296; requires authenticated diff confirmation.
- Overlap with other open PRs: 280, 281, 282.
- Safe disposition: `RETAIN_REBASE_COMPLETE`.

### PR #288
- Unresolved blockers: Refresh PR metadata with authenticated GitHub access; Rebase or rebuild on current main before any merge decision.
- Overlap with merged #278/#291/#294/#295/#296: 278, 291, 294, 295, 296; requires authenticated diff confirmation.
- Overlap with other open PRs: 280, 281, 282.
- Safe disposition: `EXTRACT_EVIDENCE_THEN_CLOSE`.

### PR #289
- Unresolved blockers: Refresh PR metadata with authenticated GitHub access; Rebase or rebuild on current main before any merge decision.
- Overlap with merged #278/#291/#294/#295/#296: 278, 291, 294, 295, 296; requires authenticated diff confirmation.
- Overlap with other open PRs: 280, 281, 282.
- Safe disposition: `PARK_ARCHITECTURE`.

### PR #290
- Unresolved blockers: Refresh PR metadata with authenticated GitHub access; Rebase or rebuild on current main before any merge decision.
- Overlap with merged #278/#291/#294/#295/#296: 278, 291, 294, 295, 296; requires authenticated diff confirmation.
- Overlap with other open PRs: 292, 293.
- Safe disposition: `REBUILD_FROM_CURRENT_MAIN`.

### PR #292
- Unresolved blockers: Refresh PR metadata with authenticated GitHub access; Rebase or rebuild on current main before any merge decision.
- Overlap with merged #278/#291/#294/#295/#296: 278, 291, 294, 295, 296; requires authenticated diff confirmation.
- Overlap with other open PRs: 290, 293.
- Safe disposition: `SUPERSEDED_CLOSE`.

### PR #293
- Unresolved blockers: Refresh PR metadata with authenticated GitHub access; Rebase or rebuild on current main before any merge decision.
- Overlap with merged #278/#291/#294/#295/#296: 278, 291, 294, 295, 296; requires authenticated diff confirmation.
- Overlap with other open PRs: 290, 292.
- Safe disposition: `RETAIN_REBASE_COMPLETE`.

## Required merge waves

### Parallel development groups
- evidence-and-audit: PRs #279, #286, #288, #292; parallel: True.
- architecture-parking: PRs #280, #289; parallel: True.
- tooling-validation: PRs #283, #287; parallel: False.
- implementation-rebuilds: PRs #281, #282, #285, #290, #293; parallel: False.

### Sequential merge order
- #283 → #287 → #293 → #281 → #282 → #285 → #290

### Required rebases
- #283, #287, #293

### Required staging smokes
- `pnpm fieldgrid:test-layers:check`
- `node --test tests/fieldgrid-open-pr-disposition-2026-07-14.test.mjs`
- `domain-specific smoke for each runtime branch after authenticated metadata refresh`

### Stop conditions
- Any PR cannot be authenticated/refreshed
- Any migration conflicts with migrations already on main
- Any workflow run fails after rebase
- Any branch overlaps a merged PR without a documented cherry-pick map

## End output

PR: draft documentation/test PR to `main` from `codex/open-pr-disposition-20260714`
branch: `codex/open-pr-disposition-20260714`
head SHA: populated after commit
retain/rebase: #283, #287, #293
rebuild: #281, #282, #285, #290
close: #279, #286, #288, #292
park: #280, #289
do-not-merge: #284
recommended first implementation PR: #293
ready for human review: yes after authenticated metadata refresh
