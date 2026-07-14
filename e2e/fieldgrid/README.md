# Fieldgrid Playwright golden path foundation

This E2E lane is intentionally local-only and deterministic. It starts `fixtures/mock-server.mjs` through Playwright `webServer`, seeds in-memory Tenant A/Tenant B data per process, and uses mocked providers instead of Supabase, staging, production, or live credentials.

## Fixture strategy

- Tenants, users, and assignments are declared in `fixtures/tenants.ts` and mirrored by the mock server.
- Each Playwright invocation gets `FIELDGRID_E2E_RUN_ID` in report output and page metadata.
- Browser contexts are test-scoped, so parallel workers do not share mutable cookies or local storage.
- The mock database is in-memory and process-scoped; CI starts a fresh server for each run.
- The cleanup guard is `FIELDGRID_E2E_NO_LIVE_PROVIDERS=true` in CI plus no live provider URLs/secrets in the fixture server.

## Covered smoke paths

- Backoffice: login → dashboard → customer list → assignment list → planning board.
- Personnel: login → assignment list → assignment detail → tasks → reports.
- Customer: login → assignments → reports → invoices.
- Negative: Tenant A URL with Tenant B user, wrong host, inactive profile, direct guessed assignment URL.

## Artifacts

Playwright retains screenshot, video, and trace on failure, emits an HTML report, and writes JSON summary output under `artifacts/playwright/`.
