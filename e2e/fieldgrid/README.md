# Fieldgrid Playwright golden path

This foundation starts the real Fieldgrid browser surfaces against local-only E2E infrastructure: local Supabase-compatible gateway, pinned PostgREST, and disposable PostgreSQL 17 fixtures. External providers may be mocked, but application data must flow through the Supabase/PostgREST data path and the browser must not use service-role credentials.

The E2E authentication seam is identity-only: `auth.getUser()` may return an allowlisted fixture identity when `FIELDGRID_E2E_AUTH_ENABLED=true` outside production. All other Supabase members (`from`, `rpc`, `storage`, `functions`, and `realtime`) are delegated to the original client.

Run with:

```sh
pnpm fieldgrid:playwright
```

## Workflowbot

`workflow-manifest.mjs` is a fail-closed evidence inventory for the explicitly listed browser journeys. The gate requires an executable evidence marker for every listed journey and covers backoffice, customer PWA and personnel PWA. It is deliberately not presented as exhaustive proof of every exported product mutation; additions to the complete workflow bot require both a manifest entry and executable journey evidence. `workflow-bot.spec.ts` adds a real mutating chain:

```text
klant → object → personeelslid → opdracht/werkbon → mobiel → tenant-B-denial
```

Each run uses synthetic `example.test` addresses and a unique `FIELDGRID_WORKFLOW_RUN_ID`. CI runs only against disposable PostgreSQL 17 and real PostgREST; it never connects the feature task to staging. JSON, JUnit, HTML, traces and screenshots are written below `artifacts/fieldgrid-playwright/` and finalized into exact-SHA evidence.

The authoritative exact-head workflow runs on pull requests, main pushes, manual dispatch and nightly at `02:17 UTC`. A failure blocks the aggregate gate and remains visible in GitHub Actions with its evidence artifact. The bot does not claim that an unknown future defect is impossible: its enforceable boundary is the versioned critical-workflow and mutation inventory. New critical workflows must be added to that inventory with executable evidence.
