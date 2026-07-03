# Fieldgrid sprint 2: module enforcement runtimebreed

Datum: 2026-07-03
Status: uitgevoerd op `codex/sprint-2-module-enforcement`
Gerelateerd: `docs/fieldgrid-saas-masterplan.md`, `docs/fieldgrid-cross-tenant-testmatrix.md`, `docs/fieldgrid-data-classification.md`

## Doel

Sprint 2 maakt module-entitlements runtime-relevant op de eerste brede grenzen. RBAC, host-first tenantcontext en portal identity blijven bestaan, maar een tenant mag een module niet gebruiken wanneer die module via plan of tenant override uit staat.

Deze sprint verandert geen database-schema en voegt geen migratie toe.

## Geleverde wijzigingen

- API-permissies lopen via `requirePermission` nu na tenant RBAC ook langs `requireTenantModule` voor bekende module-resources.
- Customer portal identity gebruikt `requireCurrentCustomerPortalTenantId`, waardoor klantacties alleen tenantcontext krijgen als `customer_portal` actief is.
- Personnel portal identity gebruikt `requireCurrentPersonnelPortalTenantId`, waardoor profielacties alleen tenantcontext krijgen als `personnel_portal` actief is.
- Personnel assignment server actions controleren `personnel_portal` voordat opdrachten, detaildata of statusmutaties beschikbaar komen.
- Finance achtergrondroutes voor betalingsherinneringen en verlopen offertes slaan tenants over waar `finance` niet actief is.
- Een statische sprinttest borgt de modulemapping, portaalhelpers, finance-job guards en koppeling met canonieke test-id's.

## Runtime contract

API-routes die `requirePermission(resource, action)` gebruiken hebben nu deze volgorde:

1. geldige gebruiker;
2. geldige tenantcontext;
3. tenantrol-permissie;
4. module entitlement voor het resource-domein;
5. routehandler.

Een RBAC-permissie alleen is dus niet meer genoeg voor modulegebonden API-domeinen.

## Modulemapping in deze sprint

| Permission resource | Module |
| --- | --- |
| `customers` | `customers` |
| `objects` | `objects` |
| `personnel` | `personnel` |
| `assignments` | `assignments` |
| `planning` | `planning` |
| `reports` | `reporting` |
| `documents` | `documents` |
| `invoices` | `finance` |
| `quotes` | `finance` |
| `payments` | `finance` |
| `customer_payment_batches` | `finance` |
| `notifications` | `notifications` |
| `smart_planning` | `smart_planning` |

Resources zonder mapping blijven alleen RBAC-gestuurd totdat ze in de data-classificatie aan een module zijn gekoppeld.

## Canonieke acceptatie-items

Deze sprint dekt de eerste statische en runtime-implementatie voor:

- `FG-MODULE-001`: module enabled happy path;
- `FG-MODULE-002`: module disabled UI;
- `FG-MODULE-003`: module disabled direct URL;
- `FG-MODULE-004`: module disabled server action;
- `FG-MODULE-005`: module disabled API;
- `FG-MODULE-006`: module dependency;
- `FG-MODULE-007`: background job;
- `FG-MODULE-008`: plan module seed.

Deze PR automatiseert vooral statische bewaking. Voor staging-promotie blijven de integration, Playwright en job-tests uit de cross-tenant matrix nodig zodra fixtures beschikbaar zijn.

## Bewust buiten scope

- Geen nieuwe tabellen, kolommen of migraties.
- Geen platform-admin UI voor modulebeheer.
- Geen Playwright-suite voor module-on/module-off navigatie.
- Geen volledige worker-herbouw buiten de twee bestaande finance admin jobs.
- Geen nieuwe module dependency resolver; bestaande dependencyconfig blijft leidend.

## Volgende stap

De volgende technische sprint kan modulegedrag verdiepen met integration fixtures: Tenant A met module aan, Tenant B met module uit, en Veele als gewone tenant. Daarna kunnen directe URL, server action, API en achtergrondjob-denials runtime worden bewezen.
