# Fieldgrid Sprint 2 - Tenant Regions

Datum: 2026-07-03
Status: delivered on `codex/sprint-2-tenant-regions`
Canon: `docs/fieldgrid-saas-proof-sprint-plan.md`, Sprint 2

## Samenvatting

Sprint 2 levert de tenant-brede regiofundering. Regio's worden voortaan als tenant-configuratie gemodelleerd, terwijl de bestaande legacy velden voorlopig blijven bestaan voor staging-continuiteit.

Deze sprint is additive-first:

- geen bestaande stagingdata wordt verwijderd;
- legacy `personnel.region`, `personnel.preferred_regions` en `assignments.required_region` blijven bestaan;
- nieuwe tabellen krijgen `tenant_id` en RLS;
- backfill maakt canonieke tenant-regio's uit bestaande waarden;
- koppeltabellen valideren server-side dat parent, regio en link bij dezelfde tenant horen.

## Nieuwe tabellen

| Tabel | Doel | Scope |
| --- | --- | --- |
| `tenant_regions` | Canonieke regio's per tenant, genormaliseerd op naam. | `tenant_config` met directe `tenant_id`. |
| `personnel_regions` | Meerdere regio's per personeelslid, inclusief primaire regio. | Directe `tenant_id` plus parent naar `personnel`. |
| `object_regions` | Meerdere regio's per object. | Directe `tenant_id` plus parent naar `objects`. |
| `customer_regions` | Optionele klantregio's voor latere filters en defaults. | Directe `tenant_id` plus parent naar `customers`. |
| `assignment_required_regions` | Meerdere vereiste regio's per opdracht. | Directe `tenant_id` plus parent naar `assignments`. |

## Backfill

De migratie vult `tenant_regions` vanuit:

- `personnel.region`;
- `personnel.preferred_regions`;
- `assignments.required_region`.

Daarna vult de migratie:

- `personnel_regions` uit primaire en voorkeursregio's;
- `assignment_required_regions` uit `assignments.required_region`.

Object- en klantregio's krijgen in Sprint 3/4 runtime en UI-bronnen; ze worden nu al meegeleverd zodat alle relevante backoffice-pagina's op hetzelfde model kunnen aansluiten.

## Tenantveiligheid

De migratie schakelt RLS in op alle nieuwe public tabellen. Er worden geen brede `anon` of `authenticated` policies toegevoegd in deze sprint.

De triggerfunctie `fieldgrid_ensure_tenant_region_scope()` controleert bij iedere link dat:

- de link zelf dezelfde `tenant_id` gebruikt;
- de parent-record dezelfde tenant heeft;
- de gekoppelde `tenant_regions` rij dezelfde tenant heeft.

De functies zijn invoker-functies en krijgen geen `SECURITY DEFINER`.

## Compatibiliteit

Deze sprint verandert geen formuliergedrag. De oude single-region velden blijven de compatibiliteitsbron totdat Sprint 3 en Sprint 4 de UI en planningruntime naar het nieuwe model brengen.

## Volgende sprints

Sprint 3:

- `RegionMultiSelect` met autocomplete en create-on-type;
- toepassen op personeel, objecten, opdrachten en relevante filters;
- bestaande tenant-regio's opnieuw laden en opslaan.

Sprint 4:

- planning eligibility met regio-overlap;
- objectregio's als opdrachtdefaults;
- server-side denial voor vreemde tenant-regio's;
- Tenant A/B/Veele runtimebewijs.

## Acceptatiebewijs

Bestandsmatige guardrail: `tests/fieldgrid-sprint-2-tenant-regions.test.mjs`.

De test bewaakt dat:

- de migratie alle nieuwe tabellen aanmaakt;
- alle nieuwe tabellen RLS krijgen;
- legacy regio-bronnen worden gebackfilled;
- tenant-scope triggerguards aanwezig zijn;
- destructive cleanup van legacy velden ontbreekt;
- Drizzle schema exports aanwezig zijn.
