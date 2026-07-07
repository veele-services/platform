# Fieldgrid Sprint 1 - Geen Ruis Meer Evidence

Datum: 2026-07-07
Status: code/testbasis groen, live staging evidence geblokkeerd op ontbrekende auth/env.

## Samenvatting

Sprint 1 heeft de lokale testbasis opgeschoond: de volledige Node test-suite draait groen en oude contractruis is geactualiseerd naar de huidige implementatie. Zichtbare onafgemaakte MFA/security-copy is verwijderd of geneutraliseerd.

Live staging- en migration-smoke zijn niet groen afgetekend, omdat deze shell geen staging auth cookies/storage-state en geen smoke database-URLs bevat. De scripts stoppen daardoor fail-fast zonder tenantdata of migraties te muteren.

## Uitgevoerd

| Check | Resultaat | Evidence |
| --- | --- | --- |
| Full suite | Groen: 505 tests, 505 pass, 0 fail op Node v24.14.0 | `node --test tests/*.test.mjs` |
| Staging promotion contract | Groen | `node scripts/fieldgrid-staging-promotion-gate.mjs --check` |
| Sprint 15 staging smoke contract | Groen | `node scripts/fieldgrid-sprint15-staging-smoke.mjs --check` |
| Sprint 7 migration smoke contract | Groen | `node scripts/fieldgrid-sprint7-migration-smoke.mjs --check` |
| Sprint 16 final gate contract | Groen | `node scripts/fieldgrid-sprint16-final-gate.mjs --check` |
| Strict staging promotion gate | Conditional-go, warning | `node scripts/fieldgrid-staging-promotion-gate.mjs --strict-evidence` |
| Read-only staging smoke live route | Fail door ontbrekende auth, HTTP 401 | `artifacts/staging-smoke/2026-07-07T18-12-13-629Z-staging-smoke.json` |
| Migration smoke empty/staging-copy | Fail-fast `not-configured`, geen migraties uitgevoerd | `artifacts/migration-smoke/2026-07-07T18-12-33-150Z-migration-smoke.json` |
| Platform-admin strict final gate | Fail door ontbrekende visual/final-gate artifacts | `node scripts/fieldgrid-platform-admin-final-gate.mjs --strict-evidence` |
| Customer/personnel strict releasegate | Fail door ontbrekende portal base URLs en auth cookies/storage | `outputs/customer-personnel-phase16-releasegate/phase16-releasegate.json` |

## Opgeschoonde ruis

- Testcontracten geactualiseerd voor huidige helpernamen, migratienummering en tenant/provisioning flows.
- Inventory detail toont expliciet `Locatiegeschiedenis`.
- Inventory issues tonen expliciet `Open meldingen`.
- Securitydashboard toont aparte read-only secties voor support access events, downloads, denials en platform changes.
- Platformgebruikers tonen geen "MFA later" copy meer; MFA staat als niet actief zolang er geen meetbare feature is.
- Platform notification metadata gebruikt `not_configured` in plaats van `planned_later` voor push.

## Ontbrekende env voor strict evidence

Deze variabelen waren niet gezet in de lokale shell:

- `FIELDGRID_STAGING_SMOKE_COOKIE` of `FIELDGRID_STAGING_SMOKE_BEARER`
- `FIELDGRID_CUSTOMER_PORTAL_BASE_URL`
- `FIELDGRID_CUSTOMER_PORTAL_COOKIE` of storage-state
- `FIELDGRID_PERSONNEL_PORTAL_BASE_URL`
- `FIELDGRID_PERSONNEL_PORTAL_COOKIE` of storage-state
- `FIELDGRID_PLATFORM_PHASE13_BASE_URL`
- `FIELDGRID_PLATFORM_PHASE13_COOKIE`
- `FIELDGRID_PLATFORM_PHASE13_TENANT_DETAIL_PATH`
- `FIELDGRID_MIGRATION_SMOKE_EMPTY_DATABASE_URL`
- `FIELDGRID_MIGRATION_SMOKE_STAGING_COPY_DATABASE_URL`
- `FIELDGRID_MIGRATION_SMOKE_EMPTY_CONFIRM=empty-database`
- `FIELDGRID_MIGRATION_SMOKE_STAGING_COPY_CONFIRM=staging-copy`

## Wat jij nog moet doen

1. Lever een geldige platform-admin staging sessie aan via `FIELDGRID_STAGING_SMOKE_COOKIE` of `FIELDGRID_STAGING_SMOKE_BEARER`.
2. Lever customer en personnel staging sessies aan via cookies/storage-state plus concrete base URLs.
3. Lever twee geisoleerde smoke database-URLs aan: disposable empty DB en restored staging-copy DB.
4. Kies een pilottenant dry-run doel: slug, owner e-mail, plan, modules en of muterende demo-smokes toegestaan zijn.
5. Zet muterende smokes pas aan met `FIELDGRID_MUTATING_SMOKE_CONFIRM=demo-tenants-only`.

## Go/no-go voor externe tenant

Nog geen go voor een echte externe tenant. Wel is de ruis uit de lokale suite weg: de resterende rode punten zijn expliciete evidence/config blockers met owner.
