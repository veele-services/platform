# Fieldgrid Playwright golden path foundation

This E2E lane starts the real local Fieldgrid applications and drives their actual Next.js routes, components, middleware, server actions, tenant resolution, and authorization guards. It does **not** render the pages under test from a mock application server.

## Local app startup

Playwright runs `start-real-apps.mjs`, which starts:

- tenant backoffice on `127.0.0.1:9321`;
- personnel PWA on `127.0.0.1:9322` with `/personeel` base path;
- customer PWA on `127.0.0.1:9323` with `/klant` base path;
- an external provider mock server on `127.0.0.1:9324` for health checks and future email/payment/maps/push stubs only.

## Fixture strategy

- Reuses the Runtime Safety PostgreSQL 17 setup and deterministic fixture IDs for Tenant A and Tenant B.
- CI runs setup, migrations, and `fieldgrid:runtime-safety:fixtures` before Playwright.
- The fixture IDs used by tests are declared in `fixtures/tenants.ts` and match `scripts/fieldgrid-runtime-safety-lib.mjs`.
- The database is disposable and guarded by the Runtime Safety reset checks; teardown runs after CI.
- Browser contexts are test-scoped, so parallel workers do not share mutable cookies or local storage.

## Auth test seam

The apps include a shared narrow local E2E Supabase-auth adapter in `@workspace/db/e2e-auth-adapter`, keyed by the `fieldgrid_e2e_user_id` cookie. It replaces only Supabase provider identity verification; middleware and application code still execute normal host resolution, tenant resolution, suspended/active-profile checks, module gates, permissions, and route authorization. It is enabled only when both conditions are true:

1. `FIELDGRID_E2E_AUTH_ENABLED=true`;
2. `NODE_ENV !== "production"`.

The seam returns seeded Runtime Safety auth users from a central allowlist. A sourceguard test verifies that each app uses the shared adapter, the adapter checks the explicit env flag, production is rejected, and middleware does not short-circuit to `NextResponse.next()` before normal guards.

## Covered smoke paths

- Backoffice: session → dashboard → customer list → assignment list → planning board.
- Personnel: session → assignment list → assignment detail → task view → reports/time view.
- Customer: session → assignments → reports → invoices.
- Negative: Tenant A URL with Tenant B identity, wrong host, inactive/suspended profile, direct guessed Tenant B assignment URL while authenticated as Tenant A personnel.

## Artifacts

Playwright retains screenshot, video, and trace on failure, emits an HTML report, writes JSON summary output, and records per-process app startup logs under `artifacts/playwright/app-logs/`.
