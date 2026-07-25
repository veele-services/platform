# Fieldgrid repository instructions

## Branch model

- `main` is the development/integration source branch and has no shared live database.
- `staging` is only for deployed database, migrations, and live acceptance.
- Never commit directly to `main` or `staging`.
- Feature branches target `codex/fieldgrid-uiux-master` during the UI/UX program.
- Never merge staging-only fixes back implicitly. Recreate every fix from main and re-promote.

## Toolchain

- Use Node >=24 <25.
- Use pnpm 11.5.2 only.
- Do not generate package-lock.json or yarn.lock.
- Prefer existing dependencies and existing shadcn/Radix/Tailwind primitives.
- Do not add a production dependency without documenting why current dependencies cannot solve the problem.

## Required checks

Run the narrowest relevant tests while developing, then before PR completion run:

- `pnpm run typecheck`
- `pnpm -r --if-present run build`
- relevant `node --test ...` suites
- `pnpm fieldgrid:dashboard-ui-audit:check`
- `pnpm fieldgrid:visual-regression-snapshots:check`
- any task-specific gate added by the work package

If a required check cannot run in the cloud environment, add or improve deterministic static/unit coverage and document the exact staging gate that must prove it. Do not silently skip it.

## Database and migrations

- Migrations are forward-only.
- Never edit, reorder, squash, or delete an already committed migration.
- Every schema change needs tenant isolation, RLS/security review, rollback reasoning, and a migration-order check.
- Prefer existing `actual_started_at`, `actual_completed_at`, assignment-personnel and interest-response fields over adding duplicate columns.
- Do not connect feature tasks to the staging database.

## UI/UX

- Mobile support is mandatory, not a later enhancement.
- Test at 320, 390, 430, 768, 1024, 1280, 1440, and 1920 widths where relevant.
- No unintended page-level horizontal overflow.
- Mobile touch targets are at least 44x44 px.
- All forms collapse to one column on narrow screens.
- Complex desktop planning must have a non-drag mobile/touch alternative.
- The UI architecture is Radix-first and follows shadcn/ui composition principles.
- Product pages import interactive primitives through `@/components/ui` or approved Fieldgrid wrappers. Direct `@radix-ui/react-*` imports belong only in shared primitive/adapter code.
- Do not hand-roll dialogs, alert dialogs, sheets, dropdowns, popovers, tooltips, selects, checkboxes, switches, radio groups, tabs, accordions, collapsibles, focus traps, or portal behavior when a canonical Radix/shadcn primitive exists.
- Use Radix data attributes for open/closed/checked/selected/disabled states and preserve focus return, Escape behavior, modal semantics, portal layering, and scroll locking.
- Use `asChild` only with one semantically valid interactive root; never create nested buttons or links.
- Use CVA/typed variants and `cn` in shared components instead of page-specific class forks.
- Use semantic design tokens. Do not add hardcoded Fieldgrid navy/teal/border colors in product components.
- Status is never communicated by color alone.
- Hide inaccessible tabs instead of showing an empty or forbidden tab.
- Hide unfinished features and placeholders.
- Dutch user-facing copy is required unless a technical identifier must remain English.
- Avoid duplicate page titles, duplicate actions, card-within-card clutter, raw implementation terminology, and generic admin-template styling.
- The final UI must look restrained, precise, consistent, and professionally finished across platform, tenant, customer, and personnel surfaces.

## Product timing rule

- Preserve planned times.
- Display effective times from actual start/completion when available.
- Running work orders display actual start to “now”.
- Use Europe/Amsterdam for user-facing work-order date/time decisions.
- Do not overwrite scheduled fields when personnel starts or completes work.

## Interest selection rule

- Selecting a candidate from an interest poll must atomically assign that personnel member.
- Reconcile filled slots using max(explicit required personnel, distinct required roles, 1).
- Transition to scheduled only when the full planned moment exists and all required slots are filled.
- Never regress an active/final workflow status.

## Accessibility and safety

- Preserve visible focus.
- Add keyboard alternatives for pointer/drag interactions.
- Add aria-sort, labels, dialog descriptions, and meaningful empty/loading states.
- Confirm destructive actions with an in-product dialog.
- Every async mutation needs pending, success, and error feedback.
- Do not log PII, secrets, full cookies, tokens, signatures, or sensitive form payloads.

## Subagents

- Delegate read-heavy exploration, test design, security review, accessibility review, and log analysis to parallel subagents.
- Avoid parallel agents editing the same files.
- Tell subagents exactly what to inspect, whether to wait for all results, and what summary with file paths to return.
- The parent agent owns final integration, test execution, and the PR.

## Completion

A work package is not complete until:

- every acceptance criterion is implemented;
- all relevant tests pass;
- no TODO/FIXME/deferred acceptance remains;
- a self-review and a separate subagent review found no unresolved P0/P1 issue;
- the PR body contains changed files, migration impact, test evidence, screenshots/evidence paths, risks, and rollback notes.

## Review guidelines

- Flag tenant-isolation or auth regressions as P0.
- Flag wrong dashboard data, workflow-status regression, lost scheduled/actual timing, non-idempotent assignment, inaccessible critical controls, and mobile blockers as P1.
