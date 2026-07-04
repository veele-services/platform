# Fieldgrid Sprint 15 - Staging smoke dashboard

Datum: 2026-07-04
Status: geimplementeerd met `runtime-proof-open` voor echte Playwright/integration/storage runs.
Scope: staging smoke dashboard, run history, live-smoke targets, migratie-smoke status en mutating cleanup-contract.

## Oplevering

Sprint 15 maakt staging continu controleerbaar vanuit platformbeheer zonder stagingdata te resetten of te muteren.

Geleverd:

- Run history op `/platform/staging-smoke`.
- JSON-artifact ondersteuning voor `artifacts/staging-smoke` en `artifacts/migration-smoke`.
- Live Playwright-smokes als expliciete targets voor host, login, modules, sectoren, regio's, storage, PDF, portalen en personeelsplanning.
- Migratie-smoke status met de bestaande Sprint 7 runner en targets `empty-database` en `staging-copy`.
- Mutating checks en cleanup-contracten voor lifecycle, supportgrant en document/PDF audit.
- Script `scripts/fieldgrid-sprint15-staging-smoke.mjs`.
- Package scripts:
  - `pnpm fieldgrid:sprint15-staging-smoke`
  - `pnpm fieldgrid:sprint15-staging-smoke:check`
  - `pnpm fieldgrid:sprint15-staging-smoke:run-read-only`

## Veiligheidscontract

Deze sprint heeft geen migratie en schrijft geen database records vanuit de app.

Read-only snapshot:

```bash
FIELDGRID_STAGING_SMOKE_COOKIE="..." \
pnpm fieldgrid:sprint15-staging-smoke:run-read-only
```

Het read-only script haalt `GET /api/platform/staging-smoke` op en schrijft een JSON-rapport naar:

```text
artifacts/staging-smoke/*.json
```

Mutating checks blijven geblokkeerd totdat een toekomstige runner expliciet werkt met:

- dedicated demo-tenants `demo-a`, `demo-b` en `veele`;
- `FIELDGRID_MUTATING_SMOKE_CONFIRM=demo-tenants-only`;
- marker-scoped cleanup selectors zoals `fieldgrid-sprint-15-mutating-*`;
- cleanup in dezelfde run.

## Supabase changelog

Supabase changelog gecontroleerd op 2026-07-04: https://supabase.com/changelog.md.

Relevante conclusie: de recente Data API/RLS waarschuwingen voor nieuwe public-tabellen raken Sprint 15 niet, omdat deze sprint geen nieuwe tabellen, policies of migraties toevoegt. De Postgres 14 deprecation en self-hosted breaking changes blijven operationele aandachtspunten voor infrastructuur, maar veranderen dit dashboardcontract niet.

## Test-id dekking

Direct:

- `FG-OPS-008`: staging smoke dashboard.

Gerelateerd:

- `FG-HOST-001` t/m `FG-HOST-004`
- `FG-MODULE-001`, `FG-MODULE-003`, `FG-MODULE-005`
- `FG-SECTOR-001`, `FG-SECTOR-006`
- `FG-REGION-003`, `FG-REGION-006`, `FG-REGION-007`
- `FG-STORAGE-001`, `FG-STORAGE-002`
- `FG-DATA-004`, `FG-AUDIT-001`
- `FG-MIG-001` t/m `FG-MIG-003`
- `FG-PORTAL-C-*`
- `FG-PORTAL-P-*`

## Grenzen

Nog `runtime-proof-open`:

- echte Playwright-runs met platform-owner en Tenant A/B/Veele actoren;
- echte storage signed URL/path guessing tests;
- echte DB/RLS validatie;
- echte mutating runner met cleanup;
- migration-smoke artifacts uit CI of releaseomgeving.

## Rollback

Rollback is code-only:

- verwijder de extra dashboardvelden uit `platform-smoke.ts`;
- verwijder de extra secties uit `/platform/staging-smoke`;
- verwijder het sprint 15 script en package scripts;
- er is geen database rollback nodig.
