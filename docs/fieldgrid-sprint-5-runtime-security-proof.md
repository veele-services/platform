# Fieldgrid sprint 5 - Runtime security proof suite

Datum: 2026-07-04
Status: geleverd als uitvoerbare runtime-proof harness bovenop de Tenant A/B/Veele fixtures. Playwright, DB/RLS en echte storage-provider tests blijven Sprint 6, Sprint 7 en Sprint 9.

## Doel

Sprint 5 vult de statische guardrails aan met een uitvoerbare proof-suite. De suite gebruikt de vaste Tenant A/B/Veele fixtures uit Sprint 1 en draait concrete beslissingen door voor de belangrijkste SaaS-grenzen.

De suite schrijft niet naar staging en verbindt niet met een database. Daardoor blijft staging bereikbaar en kan de proof veilig in `pnpm test` meedraaien. Dezelfde cases vormen de acceptatiebasis voor latere echte integration-, Playwright-, DB/RLS- en storage-tests.

## Geleverde onderdelen

- `tests/fixtures/fieldgrid-sprint-5-runtime-proof.mjs`: runtime-proof manifest en beslisfuncties.
- `tests/fieldgrid-sprint-5-runtime-proof.test.mjs`: Node-testdekking voor alle Sprint 5-grenzen.
- `scripts/fieldgrid-sprint5-runtime-proof.mjs`: CLI-runner met `--check` en `--json`.
- `package.json`: scripts `fieldgrid:sprint5-runtime-proof` en `fieldgrid:sprint5-runtime-proof:check`.

## Bewezen securitygrenzen

| Grens | Happy path | Denial path |
| --- | --- | --- |
| Host-first tenantcontext | Tenant A host resolveert naar `demo-a`. | Unknown host faalt en switcher kan hostcontext niet overrulen. |
| Membership | Tenant A admin komt Tenant A binnen. | Tenant B admin komt Tenant A niet binnen. |
| RBAC | Tenant A planner mag opdrachten beheren. | Dezelfde multi-tenant user mist plannerrechten in Tenant B; inactive platform admin faalt. |
| Support access | Actieve supportgrant voor Tenant A werkt. | Geen grant, verlopen grant en verkeerde tenant falen. |
| Modules | Tenant A mag enabled module gebruiken. | Tenant B kan disabled documents-module niet gebruiken. |
| Sectoren | Tenant A gebruikt eigen sector. | Sector buiten Tenant A-configuratie faalt. |
| Regio's | Regio-overlap werkt en opdracht zonder regio blijft unrestricted. | Geen overlap en cross-tenant regio/personnel falen. |
| Direct-ID | Eigen tenantrecord is leesbaar. | Tenant B kan Tenant A customer-id niet lezen. |
| Storage | Eigen tenant-prefixed path kan worden gesigned. | Tenant B kan Tenant A path niet raden/signen. |

## Veele als gewone tenant

De suite controleert expliciet dat `veele` geen platform-uitzondering is en dat `veele.fieldgrid.nl` als tenantcontext resolveert. Dit blijft belangrijk voor elke volgende portal- en smoke-test.

## Runner

Gebruik:

```bash
pnpm fieldgrid:sprint5-runtime-proof
pnpm fieldgrid:sprint5-runtime-proof:check
node scripts/fieldgrid-sprint5-runtime-proof.mjs --json
```

## Stagingcontinuiteit

Deze sprint bevat geen migraties, geen runtime-schemawijzigingen en geen databasewrites. De proof-suite is read-only en fixture-driven.

## Grenzen van deze sprint

Sprint 5 is de eerste runtime-proof laag, maar nog geen volledig extern bewijs tegen een echte applicatieomgeving.

Nog open:

- Playwright host-, portal- en personeelsapp-tests: Sprint 6.
- Lege DB en staging-copy migration smoke: Sprint 7.
- Tenant-id constraint hardening: Sprint 8.
- Supabase Storage policy/RLS en echte signed-url/path-guessing tests: Sprint 9.
- Audit/security dashboard en denial-event logging: Sprint 10.

## Acceptatie voor vervolg-PR's

Elke latere PR die host, RBAC, support, modules, sectoren, regio's, direct-ID of storage raakt, moet minimaal verwijzen naar de relevante Sprint 5 case-id's en waar nodig een echte integration/Playwright/DB/RLS/storage test toevoegen.