# Fieldgrid sprint 7 - Migration smoke workflow

Datum: 2026-07-04
Status: geleverd als migration-smoke contract, runner en handmatige GitHub Actions workflow. Deze sprint wijzigt geen runtime-code, geen schema en geen migraties.

## Doel

Sprint 7 maakt migraties aantoonbaar veiliger voordat staging geraakt wordt. Elke toekomstige migratie-PR moet kunnen laten zien dat dezelfde migraties slagen op:

- een lege database;
- een staging-copy database.

De generieke runner gebruikt de bestaande `@workspace/db` migratierunner en schrijft een machineleesbaar JSON-rapport. De zelf-contained CI-harness maakt daarnaast een tijdelijk, lokaal PostgreSQL 17-cluster met Supabase-compatibiliteit aan. Geen van beide workflows erft of leest een live database-URL.

## Geleverde onderdelen

- `scripts/fieldgrid-migration-order-check.mjs`: CI-check voor migratievolgorde, legacy dubbele prefixes en timestamp-cutover.
- `scripts/fieldgrid-sprint7-migration-smoke.mjs`: runner en rapportagecontract.
- `scripts/fieldgrid-local-migration-smoke.mjs`: zelf-contained lokale PostgreSQL 17-harness die beide targets in een run bewijst.
- `.github/workflows/fieldgrid-migration-smoke.yml`: handmatige workflow voor lege DB en staging-copy smoke.
- `tests/fieldgrid-sprint-7-migration-smoke.test.mjs`: guardtests voor targets, safety, parser, workflow, PR-template en package scripts.
- `package.json`: scripts voor validatie en uitvoering.
- `.github/pull_request_template.md`: verplichte smoke-checks voor migratie-PR's.

## Test-id dekking

| Test-id      | Betekenis                                   | Target           |
| ------------ | ------------------------------------------- | ---------------- |
| `FG-MIG-001` | Lege database smoke                         | `empty-database` |
| `FG-MIG-002` | Staging-copy smoke                          | `staging-copy`   |
| `FG-MIG-003` | Compatibility skip en legacy-migratiegedrag | beide targets    |

## Runner

Contractcheck zonder database:

```bash
pnpm fieldgrid:migration-order-check:check
pnpm fieldgrid:sprint7-migration-smoke:check
```

Plan tonen:

```bash
pnpm fieldgrid:sprint7-migration-smoke
pnpm fieldgrid:sprint7-migration-smoke --json
```

Lege database smoke:

```bash
FIELDGRID_MIGRATION_SMOKE_EMPTY_DATABASE_URL="postgres://.../fieldgrid_empty_smoke" \
FIELDGRID_MIGRATION_SMOKE_EMPTY_CONFIRM="empty-database" \
pnpm fieldgrid:sprint7-migration-smoke --run --target empty-database
```

Staging-copy smoke:

```bash
FIELDGRID_MIGRATION_SMOKE_STAGING_COPY_DATABASE_URL="postgres://.../fieldgrid_staging_copy" \
FIELDGRID_MIGRATION_SMOKE_STAGING_COPY_CONFIRM="staging-copy" \
pnpm fieldgrid:sprint7-migration-smoke --run --target staging-copy
```

Beide targets:

```bash
pnpm fieldgrid:sprint7-migration-smoke --run --target all
```

Zelf-contained lokaal of in CI, zonder externe database-URL's:

```bash
scripts/fieldgrid-setup-postgresql17.sh
node scripts/fieldgrid-local-migration-smoke.mjs --run --out artifacts/migration-smoke
```

Deze harness maakt twee databases in hetzelfde tijdelijke cluster:

- `empty-database`: een applicatie-lege database met uitsluitend de minimale Supabase-compatibiliteitsshims;
- `staging-copy`: een deterministische lokale compatibility-fixture. Dit is geen backup van live staging.

De Phase 2E-preflight gebruikt dezelfde dual-target runner, maar vult `staging-copy` met de werkelijk gemaakte, geisoleerde restore van staging. Alleen die Phase 2E-run geldt als releasebewijs voor de actuele staginginhoud.

## Veiligheidsregels

De runner blokkeert onduidelijke database-URL's standaard. Een URL wordt alleen gebruikt wanneer:

- de URL een veilige marker bevat, zoals `empty`, `smoke`, `test`, `migration`, `copy` of `clone`; of
- `FIELDGRID_MIGRATION_SMOKE_EMPTY_CONFIRM=empty-database` is gezet voor de lege database; of
- `FIELDGRID_MIGRATION_SMOKE_STAGING_COPY_CONFIRM=staging-copy` is gezet voor de staging-copy; of
- `--allow-unsafe-url` expliciet wordt meegegeven voor een bewust geisoleerde CI-database.

Deze bevestiging is bedoeld om directe runs tegen productie of echte staging te voorkomen. De targetnaam `staging-copy` betekent altijd een kopie, nooit de live stagingdatabase.

## Rapportage

Bij `--run` schrijft de runner een JSON-rapport naar:

```text
artifacts/migration-smoke/*.json
```

Het rapport bevat minimaal:

- target;
- start- en eindtijd;
- duur;
- readiness;
- exitcode;
- toegepaste SQL-migraties;
- skipped SQL-migraties;
- compatibility-skipped migraties;
- unresolved rows wanneer migraties/rapportages die loggen;
- failed statement of foutregel;
- samenvatting per target.

## GitHub Actions workflow

De workflow `Fieldgrid Migration Smoke` is handmatig (`workflow_dispatch`) en volledig zelf-contained. Zij installeert de checksum-gepinde PostgreSQL 17-runtime, valideert migratievolgorde en smokecontract, en draait altijd beide lokale targets. Er zijn geen database-, Supabase- of staging-secrets nodig.

Een run schrijft exact een `sprint-7-migration-smoke-v1`-rapport met precies `empty-database` en `staging-copy`. Het rapport wordt als artifact geupload. Omdat de lokale `staging-copy` een compatibility-fixture is, vervangt deze workflow niet de echte backup/restore-proef in Phase 2E.

## PR-contract voor migraties

Elke migratie-PR moet in de PR-body vastleggen:

- of de wijziging een lege database smoke vereist;
- of de wijziging een staging-copy smoke vereist;
- welk smokecommando is gedraaid;
- waar het JSON-rapport of workflow-artifact te vinden is;
- of unresolved rows bestaan en hoe die worden opgelost;
- waarom stagingdata behouden blijft.

Minimum voor migratie-PR's:

```bash
pnpm fieldgrid:migration-order-check:check
pnpm fieldgrid:sprint7-migration-smoke:check
scripts/fieldgrid-setup-postgresql17.sh
node scripts/fieldgrid-local-migration-smoke.mjs --run --out artifacts/migration-smoke
```

## Migratievolgorde en naming

De SQL-runner sorteert lexicografisch. Omdat er al een timestamp-migratie na `101_fieldgrid_notification_content_v1.sql` bestaat, blokkeert Fase 4 nieuwe numerieke migraties boven `101`.

Nieuwe migraties gebruiken een timestamp-prefix na `20260618201212`. Bekende legacy dubbele prefixes blijven toegestaan, maar nieuwe dubbele numerieke prefixes falen in CI.

## Stagingcontinuiteit

De standalone workflow migreert uitsluitend tijdelijke lokale databases. Er wordt geen database gemigreerd buiten die lokale harness en er wordt geen runtimegedrag gewijzigd.

Latere migraties blijven additive-first. `NOT NULL`, constraint validation en cleanup mogen pas na geslaagde staging-copy smoke en expliciet unresolved-row rapport.

## Grenzen van deze sprint

Nog open voor latere sprints:

- Sprint 8 gebruikt deze runner voor tenant-id hardening en constraint validation.
- Sprint 9 gebruikt deze runner voor storagebackfill en path-hardening.
- Sprint 15 toont migration-smoke run history in het staging smoke dashboard.
- De standalone harness maakt geen echte stagingkopie; backup/restore en het actuele staging-copy bewijs blijven onderdeel van Phase 2E.

## Acceptatie

Sprint 7 is klaar wanneer:

- `pnpm fieldgrid:sprint7-migration-smoke:check` bestaat en groen kan draaien;
- de handmatige workflow bestaat;
- PR-template migratie-smoke bewijs vraagt;
- `pnpm test` de runner, parser, safety en docs bewaakt;
- geen runtime-code, schema of migratie is aangepast.
