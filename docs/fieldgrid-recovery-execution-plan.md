# Fieldgrid recovery execution plan

Datum: 2026-07-02
Doelbranch: `main`
Stagingbeleid: staging-data behouden; geen rebuild, drop of reset.
Status: recoveryfase afgesloten na groene staging-builds; vervolgwerk loopt via de SaaS-canon.

## Nieuwe canon vanaf nu

De recovery-PR's hebben `main` opnieuw als bron van waarheid gestabiliseerd. Vanaf nu zijn deze documenten leidend voor vervolgwerk:

- `docs/fieldgrid-saas-masterplan.md`: product- en technische roadmap voor Fieldgrid SaaS.
- `docs/fieldgrid-data-classification.md`: tenantstrategie, prioriteit en migratierichting per databron.
- `docs/fieldgrid-cross-tenant-testmatrix.md`: verplichte test-id's voor tenant-, RBAC-, support-, module-, sector-, storage- en direct-ID grenzen.

Geen technische PR voor tenant lifecycle, modules, sectoren, storage, finance, documenten, audit of portalen mag naar staging zonder verwijzing naar de relevante data-classificatie en testmatrix-items.

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

## Afgeronde recovery-PR-volgorde

1. Recovery-plan en freeze-documentatie.
2. Migratie- en schema-repair.
3. Runtime RBAC en tenantresolver.
4. Platform-admin en support access.
5. Tenantsector enforcement.
6. Finale `main` -> `staging` PR na groene checks.

## Guardrails die blijven gelden

- Herschrijf geen reeds toegepaste `055_*` migraties.
- Voeg herstel toe via opvolgmigraties.
- Verwijder geen staging-data.
- Oude RBAC-kolommen mogen tijdelijk blijven voor backfill, maar runtimecode mag ze niet meer gebruiken.
- Platform/support-toegang moet expliciet, tenant-scoped en auditbaar zijn.
- Tenant switcher mag een host-resolved tenant nooit overschrijven.
- Nieuwe risicomigraties moeten verwijzen naar `docs/fieldgrid-data-classification.md`.
- Nieuwe security- of isolatiewijzigingen moeten verwijzen naar `docs/fieldgrid-cross-tenant-testmatrix.md`.

## Platform-admin bootstrap

Platform-admins worden niet automatisch door migraties aangemaakt. Na migreren moet minimaal een bestaande Supabase Auth user expliciet als platform owner worden gebootstrapt:

```bash
PLATFORM_OWNER_USER_IDS=<supabase-user-uuid> pnpm --filter @workspace/db run seed:platform-users
```

Optioneel kunnen extra admins/supportgebruikers worden gezet met:

```bash
PLATFORM_ADMIN_USER_IDS=<uuid-1>,<uuid-2> PLATFORM_SUPPORT_USER_IDS=<uuid-3> pnpm --filter @workspace/db run seed:platform-users
```

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
