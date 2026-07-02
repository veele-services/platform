## Samenvatting

-

## Fieldgrid canon-impact

Vul dit altijd in voor PR's die tenant lifecycle, modules, sectoren, RBAC, support access, platform-admin, portalen, storage, finance, documenten, audit, provisioning of deployment raken.

- Geraakte data-classificatie-items uit `docs/fieldgrid-data-classification.md`:
  -
- Geraakte test-id's uit `docs/fieldgrid-cross-tenant-testmatrix.md`:
  -
- Geraakte fasesprint uit `docs/fieldgrid-saas-masterplan.md`:
  -

## Scope

- [ ] Geen runtime-code aangepast.
- [ ] Geen schema of migraties aangepast.
- [ ] Geen databasegedrag gewijzigd.
- [ ] Runtime/schema/database gewijzigd; classificatie en test-id's hierboven zijn bijgewerkt.

## Migraties en data

- [ ] Niet van toepassing.
- [ ] Lege database smoke vereist.
- [ ] Staging-copy smoke vereist.
- [ ] Staging-data blijft behouden; geen drop/reset/rebuild.

## Testplan

- [ ] `pnpm test`
- [ ] `pnpm run typecheck`
- [ ] Build/checks volgens CI
- [ ] Extra tests voor genoemde test-id's:
  -

## Staging-promotie

- [ ] Minimum green before staging uit `docs/fieldgrid-cross-tenant-testmatrix.md` is gecontroleerd.
- [ ] PR raakt geen staging-promotie.
