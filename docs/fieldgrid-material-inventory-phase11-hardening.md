# Fieldgrid materiaal- en inventarisbeheer fase 11

## Doel

Fase 11 sluit de materiaal- en inventariscanon af met een aantoonbare test- en rolloutbasis. Deze fase wijzigt geen runtime-code, schema's of staging-data. Het doel is dat elke volgende implementatie- of staging-promotie kan aantonen dat materiaal, voorraad, inventaris, QR-scans, facturatie en storage tenantveilig blijven.

Deze fase behandelt `demo-a`, `demo-b` en `veele` expliciet als gewone tenants. `veele` krijgt dus geen platform-uitzondering in testdata, permissies of hostgedrag.

## Scope

Toegevoegd in deze fase:

- non-destructieve fixtures voor `demo-a`, `demo-b` en `veele`;
- een fase-11-contractcheck via `pnpm run fieldgrid:material-inventory-phase11:check`;
- een handmatige GitHub Actions-workflow voor fase-11-hardening;
- statische testbewaking zodat de canon, fixtures en workflow niet stil verdwijnen;
- een minimum green before staging lijst voor materiaal- en inventarisbeheer.

Niet toegevoegd in deze fase:

- nieuwe databasekolommen;
- nieuwe migraties;
- runtime-wijzigingen;
- automatische writes naar bestaande staging-tenants;
- reset, rebuild of drop van staging-data.

## Fixturecontract

De fixturebasis zit in `tests/fixtures/fieldgrid-material-inventory-phase11-fixtures.mjs` en bevat per tenant:

- tenant `demo-a` als gewone tenant;
- tenant `demo-b` als gewone tenant;
- tenant `veele` als gewone tenant;
- module-entitlements voor opdrachten, documenten, finance, reports, materiaal, inventaris, klantportaal, personeelsportaal en notificaties;
- materiaalcode `M00001` voor het eerste testmateriaal;
- inventariscode `I000001` voor het eerste testinventarisitem;
- objectvoorraad en personeelsvoorraad;
- materiaalverbruik dat door management of finance op `0,00` of een bedrag kan worden goedgekeurd;
- een inventarisitem met QR-route, onderhoudssignaal en storingsfixture.

Deze fixturebasis is bewust plan-only. Een echte seed- of demo-data-generator mag dit contract later gebruiken, maar moet apart worden goedgekeurd en mag staging-data niet overschrijven.

## Securitygrenzen

Fase 11 vereist happy paths en denial paths voor deze grenzen:

- host-first tenant resolution;
- tenant membership;
- tenant-RBAC;
- support grant;
- module entitlement;
- sector enforcement;
- entity tenant isolation;
- storage isolation;
- customer visibility;
- billing approval;
- tenant-aware audit logging;
- notification scope.

## Belangrijkste scenario's

| Test-id | Grens | Verwachting |
| --- | --- | --- |
| `MI-HOST-001` | Host | Hostcontext wint altijd van tenant switcher. |
| `MI-RBAC-001` | RBAC | Alleen juiste tenantrollen mogen materiaal/inventaris beheren of kosten zien. |
| `MI-MATERIAL-001` | Entity tenant | Tenant A kan geen materiaal, voorraad of mutaties van Tenant B lezen. |
| `MI-MATERIAL-002` | Personeels-PWA | Personeel kan verbruik registreren zonder kostprijzen te zien. |
| `MI-INVENTORY-001` | Entity tenant | QR of directe ID van Tenant B lekt geen inventarisdata. |
| `MI-INVENTORY-002` | Facturatie | Optioneel inventarisgebruik/verhuur wordt pas factureerbaar na goedkeuring. |
| `MI-QR-001` | QR-scan | Anonieme scan toont geen inventarisdata. |
| `MI-QR-002` | QR-scan | Bevoegd personeel kan issue/media tenantveilig melden. |
| `MI-STORAGE-001` | Storage | Path guessing naar andere tenant faalt. |
| `MI-STORAGE-002` | Storage | signed URL is tenant-bound, kort geldig en waar nodig geaudit. |
| `MI-BILLING-001` | Klantzichtbaarheid | Alleen `customer_visible` materiaalregels verschijnen in klantweergave. |
| `MI-BILLING-002` | Facturatie | Alleen goedgekeurde factureerbare regels gaan naar factuurvoorstel. |
| `MI-AUDIT-001` | Audit | Downloads, QR-labels, goedkeuringen en issues schrijven tenant-aware auditregels. |
| `MI-NOTIFY-001` | Notificaties | Lage voorraad, verlopen keuringen en storingen lekken niet tussen tenants. |
| `MI-MIG-EMPTY` | Migratie | Migraties slagen op lege database. |
| `MI-MIG-STAGING-COPY` | Migratie | Migraties slagen op staging-copy zonder destructieve reset. |

## Minimum green before staging

Voordat een materiaal- of inventarisupdate naar staging mag, moet minimaal groen zijn:

1. fase-11-contractcheck;
2. `pnpm test`;
3. `pnpm run typecheck`;
4. `pnpm run build`;
5. lege database migration smoke;
6. staging-copy migration smoke;
7. cross-tenant integration tests voor `demo-a`, `demo-b` en `veele`;
8. Playwright host-first tests;
9. PWA-tests voor materiaalverbruik en QR-scan;
10. storage signed URL tests;
11. factuurvoorstel- en goedkeuringsregels;
12. auditlog- en notificatiescope-tests.

De huidige workflow bewaakt het contract en kan handmatig worden gestart. Echte database-smokes moeten op disposable databases draaien en mogen geen staging resetten.

## Staging bereikbaar houden

Tijdens de uitvoering van dit plan blijft staging zoveel mogelijk bereikbaar. Daarom blijven nieuwe checks in deze fase plan-only en niet-destructief. Voor latere runtime-fases geldt:

- eerst additive migraties;
- daarna backfillrapport;
- daarna validatie op staging-copy;
- daarna pas constraints of hardere enforcement;
- nooit een drop, reset of rebuild van staging zonder expliciete menselijke keuze.

## Volgende technische testuitbreiding

Na fase 11 kunnen de plan-only scenario's worden omgezet naar echte suites:

- DB/RLS-tests voor tenant-id, parent-scope en denial events;
- Playwright-tests voor backoffice, personeels-PWA en QR-flow;
- storage tests voor signed URL, path guessing en media-audit;
- integration tests voor bon-goedkeuring, `customer_visible`, factuurvoorstellen en voorraadmutaties;
- notification tests voor lage voorraad, verlopen keuringen en storingen.
