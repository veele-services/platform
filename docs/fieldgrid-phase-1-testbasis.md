# Fieldgrid fase 1 testbasis en demo-data

Datum: 2026-07-03  
Status: fase 1 basis voor de volgende grote update.  
Gerelateerd: `docs/fieldgrid-next-major-update-plan.md`, `docs/fieldgrid-cross-tenant-testmatrix.md`, `docs/fieldgrid-staging-promotion-checklist.md`.

## Doel

Fase 1 verplaatst de SaaS-bewaking van alleen statische canonregels naar een executable testbasis. Deze fase schrijft geen stagingdata en voert geen migraties uit. De basis bestaat uit deterministische Tenant A/B/Veele fixtures, een security-harness test en een demo-data plan-generator.

Deze fase is bewust staging-safe:

- geen databaseverbinding;
- geen mutatie van bestaande staging-tenants;
- geen storage writes;
- geen schema of migratie;
- alleen testfixtures, contracttests, demo-data plan en documentatie.

## Nieuwe onderdelen

### Fixturecontract

Bestand: `tests/fixtures/fieldgrid-phase-1-fixtures.mjs`

Bevat:

- vaste tenants: `demo-a`, `demo-b`, `veele`;
- Veele als gewone tenant, niet als platform-uitzondering;
- vaste hosts, inclusief platform, staging, tenant hosts, custom host en unknown host;
- vaste actoren voor platform, support, Tenant A en Tenant B;
- vaste records per tenant: customer, object, personnel, assignment, document, report, quote, invoice, payment en audit;
- tenant-prefixed storage paths;
- support grant happy/denial fixtures;
- migration smoke targets `FG-MIG-001`, `FG-MIG-002` en `FG-MIG-003`.

### Executable security-harness

Bestand: `tests/fieldgrid-phase-1.test.mjs`

Dekt nu als eerste executable contract:

- host-first tenant resolution;
- tenant switcher override denial;
- Veele als gewone tenant;
- membership happy/denial;
- support grant actief/verlopen/verkeerde tenant;
- direct-ID denial tussen Tenant A en Tenant B;
- module-off denial;
- sector buiten tenant denial;
- storage path guessing denial;
- non-destructive migration smoke contract.

Deze tests zijn nog geen volledige app-integratietests. Ze zijn de gedeelde fixture- en contractlaag waarop de echte Playwright, DB/RLS, storage en migration-smoke tests in vervolg-PR's worden aangesloten.

### Demo-data plan-generator

Bestand: `scripts/fieldgrid-phase1-demo-data.mjs`

Gebruik:

```bash
pnpm fieldgrid:phase1-fixtures -- --check
pnpm fieldgrid:phase1-fixtures -- --json
pnpm fieldgrid:phase1-fixtures
```

De generator print alleen het plan. Hij schrijft niets naar de database en maakt geen storageobjecten aan.

## Test-id dekking in deze fase

| Securitygrens | Test-id's | Fase 1 basis |
| --- | --- | --- |
| Host-first | `FG-HOST-001` t/m `FG-HOST-006` | Fixturecontract + resolver harness |
| Tenant lifecycle | `FG-LIFE-004` | Veele gewone tenant fixture |
| RBAC | `FG-RBAC-002` | Tenant A/B denial contract |
| Support | `FG-SUPPORT-001` t/m `FG-SUPPORT-004` | Grant happy/denial contract |
| Modules | `FG-MODULE-005` | Module-off denial contract |
| Sectoren | `FG-SECTOR-002` | Sector buiten tenant denial contract |
| Direct-ID | `FG-DATA-001` | Tenant B kan Tenant A customer niet lezen |
| Storage | `FG-STORAGE-001`, `FG-STORAGE-002` | Tenant-prefix en path guessing contract |
| Migraties | `FG-MIG-001` t/m `FG-MIG-003` | Non-destructive smoke target contract |

## Staging-promotie

Fase 1 raakt staging niet direct. Voor promotie geldt:

- `pnpm test` moet groen zijn;
- `pnpm fieldgrid:phase1-fixtures -- --check` moet groen zijn;
- geen database- of storage-mutaties vanuit deze fase;
- demo-data blijft plan-only totdat een aparte, goedgekeurde seed/backfill PR wordt gemaakt.

## Vervolg

De volgende PR's moeten deze basis koppelen aan echte runtime-bewijsvoering:

1. Playwright host-first tests die dezelfde hosts en actoren gebruiken.
2. Integration fixtures die dezelfde Tenant A/B/Veele ids of slugs seedbaar maken.
3. DB/RLS tests voor tenantdata, support audit en platform-only tabellen.
4. Storage signed-url tests voor tenant-prefix en path guessing.
5. Migration smoke workflow op lege database en staging-copy.

Tot die vervolgtests bestaan, blijft deze fase een contractbasis en geen eindbewijs voor productieklare SaaS-isolatie.
