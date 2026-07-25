# Fieldgrid UI/UX local release evidence

Evidence date: 25 July 2026  
Base commit: `04922e758e939957ec51f875fa88c76c8aad585b`  
Branch: `codex/fieldgrid-uiux-master`

This record covers the local, non-deployed W01-W15 acceptance run. It contains
no credentials, session data or personal data. W16 remains a separate live
staging gate and is deliberately recorded as `NOT_RUN`.

## Source and migration safety

- One forward-only migration was added:
  `lib/db/migrations/20260725100000_staffing_capacity_invariants.sql`.
- The staffing transition is tenant-bound, concurrency-safe and callable only
  by `service_role`.
- The migration contains no destructive table or column removal.
- `pnpm fieldgrid:migration-order-check:check`: PASS. The command only reports
  pre-existing historical numbering gaps `003` and `005..022`.
- No source branch, `main`, `staging` or `production` ref was pushed or moved.

## Focused work-package gates

All commands below passed on the local integration branch:

- `pnpm fieldgrid:live-planning-consistency:check`
- `pnpm fieldgrid:staffing-capacity-invariants:check`
- `pnpm fieldgrid:uiux-responsive-forms:check`
- `pnpm fieldgrid:uiux-browser-dialogs:check`
- `pnpm fieldgrid:uiux-object-semantics:check`
- `pnpm fieldgrid:uiux-detail-permissions:check`
- `pnpm fieldgrid:uiux-design-system:check`
- `pnpm fieldgrid:uiux-navigation:check`
- `pnpm fieldgrid:uiux-data-view:check`
- W07 assignments, customers and personnel data-view source tests
- `pnpm fieldgrid:uiux-detail-dossiers:check`
- `pnpm fieldgrid:uiux-dashboard:check`
- `pnpm fieldgrid:uiux-planboard:check`
- `pnpm fieldgrid:uiux-platform:check`
- `pnpm fieldgrid:uiux-auth:check`
- `pnpm fieldgrid:uiux-analytics:check`
- `pnpm fieldgrid:uiux-quality:check`
- `pnpm fieldgrid:android-play:check`

The UI/UX source inventory reports zero raw released selects, raw
checkbox/radio controls, browser dialogs, custom modal overlays and unapproved
direct Radix imports. The hardcoded-brand-colour gate reports no unapproved
literal brand colours in released React surfaces.

## Cross-cutting validation

- `pnpm run typecheck`: PASS.
- `pnpm fieldgrid:test:domain-recursive`: PASS.
- `pnpm fieldgrid:test:security-recursive`: PASS.
- `pnpm fieldgrid:test:ui-contracts`: PASS.
- `pnpm fieldgrid:dashboard-ui-audit:check`: PASS.
- `pnpm fieldgrid:uiux-master-gate:check`: PASS with 94 traceability rows,
  zero active findings and zero errors.
- Customer PWA optimized production build: PASS.
- Personnel PWA optimized production build: PASS.
- Backoffice optimized production build: PASS with non-secret placeholder
  values for the two required public Supabase build variables. The same build
  correctly fails closed when those mandatory variables are absent.
- Mockup sandbox, marketing, API server and website runtime builds: PASS when
  their documented `PORT` and `BASE_PATH` build variables are supplied.

No production service, database or remote environment was contacted for these
build proofs.

## Performance and responsive evidence

- The W14 fixture processes 2,000 assignments and 250 personnel records over
  20 passes in roughly 25 ms on this development machine. This is a regression
  guard, not a production latency guarantee.
- The minute ticker changes display state without a database write or route
  refresh.
- Inactive dossier tabs do not execute their heavy loaders.
- The static visual matrix covers widths 320, 390, 430, 768, 1024, 1280, 1440
  and 1920 pixels plus a 200% zoom scenario.
- Keyboard, focus-trap, focus-return, Escape, route-error announcement,
  semantic-link and reduced-motion contracts are covered by source and domain
  tests.

## Deliberately outstanding live evidence

The following cannot be truthfully proven from a disconnected local build:

- authenticated tenant A and tenant B journeys on the deployed exact head;
- real role and module combinations;
- real-time start/completion propagation across open sessions;
- restored-copy migration rehearsal and post-migration smoke tests;
- browser screenshots and overflow checks against the deployed applications;
- screen-reader and keyboard acceptance in supported production browsers;
- Android installation, App Links, offline/reconnect and native push on
  physical devices.

These items belong to W16. Until they pass on an exact reviewed staging head,
`stagingResult` remains `NOT_RUN` and the strict master gate must remain red.
