# Current main full test baseline — 2026-07-14

Base SHA: `42edb5664ed507ed914b8bebf8847ab1f6e39f74`

Branch: `codex/current-main-test-baseline-20260714`

## Root test totals

- Total: 759
- Passed: 745
- Failed: 14
- Skipped: 0
- Flaky: 0
- Environment-blocked lanes: 5

## Classification

- Test layer: root/unit-static plus Runtime Safety Harness lanes; DB runtime lanes environment-blocked without DATABASE_URL; health gate blocked by missing shellcheck
- Security relevance: security-source passes; root includes tenant/security-relevant failures in branding, tenant context, PDF downloads
- Tenant relevance: tenant-relevant blockers present in tenant context, portal branding, branding upload scope
- Finance relevance: finance-relevant blockers present in finance downloads and invoice PDF/payment/preview tests
- Feature-freeze relevance: not ready for feature-freeze promotion until blockers are triaged

## Command evidence

| Command | Status | Exit | Layer | Log |
|---|---:|---:|---|---|
| `pnpm install --frozen-lockfile` | pass | 0 | install | `outputs/current-main-baseline-2026-07-14/pnpm-install.log` |
| `pnpm test` | fail | 1 | root | `outputs/current-main-baseline-2026-07-14/pnpm-test.log` |
| `pnpm run typecheck` | pass | 0 | typecheck | `outputs/current-main-baseline-2026-07-14/pnpm-run-typecheck.log` |
| `pnpm build` | fail | 1 | build | `outputs/current-main-baseline-2026-07-14/pnpm-build.log` |
| `pnpm fieldgrid:migration-order-check:check` | pass | 0 | migration-order | `outputs/current-main-baseline-2026-07-14/pnpm-fieldgrid-migration-order-check-check.log` |
| `pnpm fieldgrid:test-layers:check` | pass | 0 | test-layer | `outputs/current-main-baseline-2026-07-14/pnpm-fieldgrid-test-layers-check.log` |
| `pnpm fieldgrid:test:contract-static` | pass | 0 | runtime-safety/contract-static | `outputs/current-main-baseline-2026-07-14/pnpm-fieldgrid-test-contract-static.log` |
| `pnpm fieldgrid:test:postgres17-migration-smoke` | fail | 1 | runtime-safety/postgres17-migration-smoke | `outputs/current-main-baseline-2026-07-14/pnpm-fieldgrid-test-postgres17-migration-smoke.log` |
| `pnpm fieldgrid:test:unit-domain` | pass | 0 | runtime-safety/unit-domain | `outputs/current-main-baseline-2026-07-14/pnpm-fieldgrid-test-unit-domain.log` |
| `pnpm fieldgrid:test:security-source` | pass | 0 | runtime-safety/security-source | `outputs/current-main-baseline-2026-07-14/pnpm-fieldgrid-test-security-source.log` |
| `pnpm fieldgrid:test:db-integration-tenant-ab` | fail | 1 | runtime-safety/db-integration-tenant-ab | `outputs/current-main-baseline-2026-07-14/pnpm-fieldgrid-test-db-integration-tenant-ab.log` |
| `pnpm fieldgrid:test:rls-security` | fail | 1 | runtime-safety/rls-security | `outputs/current-main-baseline-2026-07-14/pnpm-fieldgrid-test-rls-security.log` |
| `pnpm fieldgrid:test:phase-b-previous-release-database-compatibility` | fail | 1 | runtime-safety/phase-b-previous-release-database-compatibility | `outputs/current-main-baseline-2026-07-14/pnpm-fieldgrid-test-phase-b-previous-release-database-compatibility.log` |
| `pnpm fieldgrid:test:api-runtime` | fail | 1 | runtime-safety/api-runtime | `outputs/current-main-baseline-2026-07-14/pnpm-fieldgrid-test-api-runtime.log` |
| `pnpm fieldgrid:deploy-health-gate:test` | fail | 1 | health-gate | `outputs/current-main-baseline-2026-07-14/pnpm-fieldgrid-deploy-health-gate-test.log` |

## Root failures

| Test | File | Owner track | Severity | Feature-freeze blocker |
|---|---|---|---|---|
| tenant backoffice finance PDF and CSV downloads are wired | `tests/fieldgrid-finance-downloads.test.mjs` | finance | P1 | yes |
| Sprint 6 renders configured payment link and server-side QR in backoffice PDFs | `tests/fieldgrid-invoice-canon-sprint6-payments-qr.test.mjs` | finance | P1 | yes |
| Sprint 8 invoice settings preview reads the next sequence without claiming a number | `tests/fieldgrid-invoice-canon-sprint8-preview-test-pdf.test.mjs` | finance | P2 | no |
| phase 2 stock locations support object and personnel dossiers | `tests/fieldgrid-material-inventory-phase2.test.mjs` | operations-ui | P2 | no |
| phase 7 manual code fallback and login form keep redirects safe | `tests/fieldgrid-material-inventory-phase7.test.mjs` | platform | P2 | no |
| backoffice and personnel PWA offer secured address autocomplete | `tests/fieldgrid-personnel-home-address-routing.test.mjs` | operations-ui | P2 | no |
| phase 7 keeps active subscription status leading for entitlements | `tests/fieldgrid-phase-7.test.mjs` | platform | P2 | no |
| dashboard layout has no DEFAULT_TENANT_ID or first-tenant fallback | `tests/fieldgrid-sprint-1-tenant-context.test.mjs` | tenant-platform | P1 | yes |
| sprint 10 centralizes tenant branding with Fieldgrid defaults and plan gating | `tests/fieldgrid-sprint-10-portals-branding.test.mjs` | tenant-platform | P1 | yes |
| sprint 10 gates customer and personnel portal shells by host-bound tenant context | `tests/fieldgrid-sprint-10-portals-branding.test.mjs` | tenant-platform | P1 | yes |
| sprint 10 uses Fieldgrid as static PWA default instead of Veele tenant branding | `tests/fieldgrid-sprint-10-portals-branding.test.mjs` | tenant-platform | P1 | yes |
| sprint 3 has a reusable region multiselect with autocomplete and create-on-type | `tests/fieldgrid-sprint-3-region-ui.test.mjs` | operations-ui | P2 | no |
| branding asset uploads are tenant-scoped and reject svg | `tests/fieldgrid-theme-branding-system.test.mjs` | tenant-platform | P1 | yes |
| platform and tenant admin expose Branding & Thema management | `tests/fieldgrid-theme-branding-system.test.mjs` | tenant-platform | P1 | yes |

Full failure records are in the JSON companion file.
