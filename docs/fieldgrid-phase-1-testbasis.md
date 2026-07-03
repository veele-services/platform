# Fieldgrid sprint 1 testbasis en runtime fixtures

Datum: 2026-07-03
Status: sprint 1 uitgevoerd als staging-safe fixture- en harnesslaag.
Gerelateerd: `docs/fieldgrid-saas-proof-sprint-plan.md`, `docs/fieldgrid-cross-tenant-testmatrix.md`, `docs/fieldgrid-staging-promotion-checklist.md`.

## Doel

Sprint 1 verplaatst de SaaS-bewaking van alleen statische canonregels naar een herbruikbare executable fixturebasis. Deze sprint schrijft nog geen stagingdata en voert geen migraties uit. De basis bestaat uit deterministische Tenant A/B/Veele fixtures, seed/cleanup-manifesten, een runtime security-harness en een demo-data manifest-generator.

Deze sprint is bewust staging-safe:

- geen databaseverbinding;
- geen mutatie van bestaande staging-tenants;
- geen storage writes;
- geen schema of migratie;
- alleen testfixtures, runtime-harness, seed/cleanup-manifest, demo-data manifest en documentatie.

## Nieuwe of bijgewerkte onderdelen

### Runtime fixturecontract

Bestand: `tests/fixtures/fieldgrid-phase-1-fixtures.mjs`

Bevat:

- vaste tenants: `demo-a`, `demo-b`, `veele`;
- Veele als gewone tenant, niet als platform-uitzondering;
- vaste hosts, inclusief platform, staging, tenant hosts, custom host en unknown host;
- vaste tenant domains met tenant-eigenaarschap;
- vaste actoren voor platform, support, Tenant A en Tenant B;
- deterministische actor user ids;
- vaste records per tenant: customer, object, personnel, assignment, document, report, quote, invoice, payment en audit;
- deterministische record UUIDs;
- tenant-prefixed storage paths;
- support grant happy/denial fixtures;
- idempotente seed-batches;
- marker-scoped cleanup-batches;
- runtime assertions voor happy en denial paths;
- migration smoke targets `FG-MIG-001`, `FG-MIG-002` en `FG-MIG-003`.

### Seed/cleanup-manifest

De seed-batches zijn bewust manifesten en nog geen database-writes. Ze leggen vast hoe sprint 5, 6 en 7 dezelfde fixtures moeten aansluiten op echte integration, Playwright, DB/RLS, storage en migration-smoke runners.

Seed-batches:

- `seed-tenants`
- `seed-tenant-domains`
- `seed-platform-actors`
- `seed-tenant-memberships`
- `seed-tenant-records`
- `seed-storage-manifest`
- `seed-support-grants`

Cleanup-batches:

- `cleanup-support-grants`
- `cleanup-storage-manifest`
- `cleanup-tenant-records`
- `cleanup-memberships-and-domains`
- `cleanup-tenants-last`

Cleanup is scoped op `FIELDGRID_PHASE1_DEMO`, `fieldgrid-sprint-1-runtime-fixtures`, demo tenant ids/slugs en fixture users/domains. Het mag nooit breed tenantdata verwijderen.

### Executable security-harness

Bestand: `tests/fieldgrid-phase-1.test.mjs`

Dekt als executable contract:

- fixturevalidatie;
- Veele als gewone tenant;
- host-first tenant resolution;
- tenant switcher override denial;
- membership happy/denial;
- support grant actief/verlopen/verkeerde tenant;
- direct-ID denial tussen Tenant A en Tenant B;
- module-off denial;
- sector buiten tenant denial;
- storage path guessing denial;
- seed-batches idempotent en geordend;
- cleanup-batches marker-scoped en niet-destructief;
- non-destructive migration smoke contract.

Deze tests zijn nog geen volledige app-integratietests. Ze zijn de gedeelde fixture- en contractlaag waarop de echte Playwright, DB/RLS, storage en migration-smoke tests in vervolg-sprints worden aangesloten.

### Demo-data manifest-generator

Bestand: `scripts/fieldgrid-phase1-demo-data.mjs`

Gebruik:

```bash
pnpm fieldgrid:sprint1-fixtures -- --check
pnpm fieldgrid:sprint1-fixtures -- --json
pnpm fieldgrid:sprint1-fixtures -- --plan-json
pnpm fieldgrid:sprint1-fixtures
```

Legacy alias blijft werken:

```bash
pnpm fieldgrid:phase1-fixtures -- --check
```

De generator print alleen het manifest. Hij schrijft niets naar de database en maakt geen storageobjecten aan.

## Test-id dekking in sprint 1

| Securitygrens | Test-id's | Sprint 1 basis |
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

## Definition of Done

Sprint 1 is klaar wanneer:

- fixtures herhaalbaar en deterministisch zijn;
- `demo-a`, `demo-b` en `veele` alle vereiste actors en records hebben;
- Veele expliciet gewone tenant blijft;
- seed-batches idempotent zijn;
- cleanup-batches marker-scoped en niet-destructief zijn;
- host/membership/direct-ID/security harness tests bestaan;
- `pnpm fieldgrid:sprint1-fixtures -- --check` het manifest kan valideren;
- er geen runtime-code, schema, migratie of stagingdata wordt aangepast.

## Staging-promotie

Sprint 1 raakt staging niet direct. Voor promotie geldt:

- `pnpm test` moet groen zijn;
- `pnpm fieldgrid:sprint1-fixtures -- --check` moet groen zijn;
- geen database- of storage-mutaties vanuit deze sprint;
- demo-data blijft manifest-only totdat een aparte, goedgekeurde integration/seed PR wordt gemaakt.

## Vervolg

De volgende sprints moeten deze basis koppelen aan echte runtime-bewijsvoering:

1. Sprint 5: integration tests voor host, membership, RBAC, direct-ID, support, module, sector en regio.
2. Sprint 6: Playwright host-first en portal acceptance tests.
3. Sprint 7: migration smoke workflow op lege database en staging-copy.
4. Sprint 9: storage signed-url tests voor tenant-prefix en path guessing.

Tot die vervolgtests bestaan, blijft sprint 1 de fixture- en harnesslaag, niet het eindbewijs voor productieklare SaaS-isolatie.
