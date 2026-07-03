## Samenvatting

-

## Fieldgrid canon-impact

Vul dit altijd in voor PR's die tenant lifecycle, modules, sectoren, RBAC, support access, platform-admin, portalen, storage, finance, documenten, audit, provisioning, deployment of staging-promotie raken.

- Geraakte updatefase uit `docs/fieldgrid-next-major-update-plan.md`:
  -
- Geraakte sprint uit `docs/fieldgrid-saas-proof-sprint-plan.md`:
  -
- Geraakte data-classificatie-items uit `docs/fieldgrid-data-classification.md`:
  -
- Geraakte test-id's uit `docs/fieldgrid-cross-tenant-testmatrix.md`:
  -
- Geraakte staging-promotiechecklist uit `docs/fieldgrid-staging-promotion-checklist.md`:
  -

## Scope

- [ ] Geen runtime-code aangepast.
- [ ] Geen schema of migraties aangepast.
- [ ] Geen databasegedrag gewijzigd.
- [ ] Runtime/schema/database gewijzigd; classificatie, test-id's en stagingchecklist hierboven zijn bijgewerkt.

## Migraties en data

- [ ] Niet van toepassing.
- [ ] Lege database smoke vereist.
- [ ] Staging-copy smoke vereist.
- [ ] `pnpm fieldgrid:sprint7-migration-smoke:check` groen.
- [ ] Lege database smoke uitgevoerd met `pnpm fieldgrid:sprint7-migration-smoke --run --target empty-database`.
- [ ] Staging-copy smoke uitgevoerd met `pnpm fieldgrid:sprint7-migration-smoke --run --target staging-copy`.
- [ ] Smoke artifact of JSON-rapport toegevoegd aan PR/Actions-run.
- [ ] Unresolved rows zijn nul of hieronder expliciet verklaard.
- [ ] Staging-data blijft behouden; geen drop/reset/rebuild.
- [ ] Migratie is additive-first of het rollbackpad is expliciet beschreven.

## Testplan

- [ ] `pnpm test`
- [ ] `pnpm run typecheck`
- [ ] Build/checks volgens CI
- [ ] Extra tests voor genoemde test-id's:
  -

## Staging-promotie

- [ ] PR raakt geen staging-promotie.
- [ ] Minimum green before staging uit `docs/fieldgrid-cross-tenant-testmatrix.md` is gecontroleerd.
- [ ] Fasechecklist uit `docs/fieldgrid-staging-promotion-checklist.md` is gecontroleerd.
- [ ] Staging blijft zoveel mogelijk bereikbaar; geen geplande downtime zonder expliciete reden.
