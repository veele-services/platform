# Current main full test baseline — 2026-07-14

Base SHA: `42edb5664ed507ed914b8bebf8847ab1f6e39f74`

Branch: `feature/run-full-current-test-baseline`

PR: #300

## Root suite result

- Command: `pnpm test`
- Status: fail
- Total: 759
- Passed: 745
- Failed: 14
- Skipped: 0
- Flaky: 0
- Result: Current main has 14 existing root test failures. This PR records them and does not repair functional failures.

## Baseline differential

- Current-main root failures: 14
- Shared failures: 14
- Candidate-only failures: 0
- Permanent broad failure allowlist added: no

## Local execution constraints

Local execution constraints are separate from product failures and separate from GitHub Actions evidence.

| Lane | Status | Reason |
|---|---|---|
| local pnpm build | blocked | Local mockup-sandbox build requires PORT in this environment; GitHub Actions build evidence is authoritative for this head. |
| local Runtime Safety Harness DB/API lanes | blocked | Local DATABASE_URL and local PostgreSQL/Docker runtime were not available. |
| local deploy health gate | blocked | Local shellcheck binary was not available. |

## GitHub Actions evidence contract

Status: required-on-reviewed-head

Source: GitHub pull-request checks for the reviewed head

Concrete workflow run IDs belong in the PR body or review evidence, not this durable baseline schema.

| Required workflow | Requirement |
|---|---|
| Runtime Safety Harness | required on reviewed head |
| Fieldgrid Deploy Health Gate | required on reviewed head |

| Required lane | Requirement |
|---|---|
| build | required on reviewed head |
| PostgreSQL migration smoke | required on reviewed head |
| Tenant A/B DB integration | required on reviewed head |
| RLS security | required on reviewed head |
| previous-release compatibility | required on reviewed head |
| API runtime | required on reviewed head |
| typecheck | required on reviewed head |
| health gate | required on reviewed head |

## Classification

- Test layer: root suite plus migration-order, test-layer and Runtime Safety Harness lanes; local environment constraints are tracked separately from product/test failures.
- Security relevance: security-source and CI runtime security lanes are expected green; root baseline includes tenant/security-relevant failures in branding, tenant context and PDF/download controls.
- Tenant relevance: tenant-relevant root failures remain in tenant context, portal branding and branding upload scope.
- Finance relevance: finance-relevant root failures remain in finance downloads and invoice PDF/payment/preview tests.
- Feature-freeze relevance: not ready for feature-freeze promotion until the existing root blockers are triaged.

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

Full structured failure records are in the JSON companion file. Full command logs belong in GitHub Actions artifacts, not source control.
