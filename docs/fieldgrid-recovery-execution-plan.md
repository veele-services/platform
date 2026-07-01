# Fieldgrid recovery execution plan

Datum: 2026-07-02
Doelbranch: `main`
Stagingbeleid: staging-data behouden; geen rebuild, drop of reset.

## Vastgelegde besluiten

- `main` is de bron van waarheid voor recovery.
- `staging` blijft bevroren tot de recovery-PR's op `main` groen zijn.
- De bestaande staging-database blijft behouden.
- Globale `roles` blijven templates; `tenant_roles` is de runtime-bron voor RBAC.
- Host/subdomain is leidend boven de tenant switcher.
- Productie draait op `platform.fieldgrid.nl`.
- Staging draait op `staging.fieldgrid.nl`.
- Platform-admin komt technisch terug.
- Support access zit in de MVP.
- Starter, Professional en Enterprise krijgen nu geen harde pakketlimieten.
- Custom role management is alleen beschikbaar vanaf Professional.
- Tenantsectoren worden hard afgedwongen in de MVP.
- Alleen de eigenaar merged de finale `main` -> `staging` PR.

## PR-volgorde

1. Recovery-plan en freeze-documentatie.
2. Migratie- en schema-repair.
3. Runtime RBAC en tenantresolver.
4. Platform-admin en support access.
5. Tenantsector enforcement.
6. Finale `main` -> `staging` PR na groene checks.

## Guardrails

- Herschrijf geen reeds toegepaste `055_*` migraties.
- Voeg herstel toe via opvolgmigraties.
- Verwijder geen staging-data.
- Oude RBAC-kolommen mogen tijdelijk blijven voor backfill, maar runtimecode mag ze niet meer gebruiken.
- Platform/support-toegang moet expliciet, tenant-scoped en auditbaar zijn.
- Tenant switcher mag een host-resolved tenant nooit overschrijven.

## Minimale validatie voor staging

- Install met de repo-versies van Node en pnpm.
- Typecheck, lint, tests en build voor zover beschikbaar.
- Migratie-smoke-test op een lege database.
- Migratie-smoke-test op een kopie van staging.
- Cross-tenant testmatrix.
- RBAC-tests voor tenantrollen.
- Platform-admin en support-grant tests.
- Sector enforcement tests.

## Nog expliciet te controleren buiten code

- Backup van staging-database is gemaakt en herstelbaar.
- Toegepaste migraties op staging zijn geinventariseerd.
- DNS/reverse proxy wijst `platform.fieldgrid.nl` en `staging.fieldgrid.nl` naar de juiste omgevingen.
