# Fieldgrid Sprint 3 - Regio UI backoffice breed

Datum: 2026-07-04
Status: `done` voor backoffice create/edit UI; runtime planningproof blijft Sprint 4.

## Doel

Sprint 3 maakt tenant-regio's bruikbaar in de backoffice. De sprint bouwt voort op Sprint 2, waarin het datamodel en de backfill voor `tenant_regions`, `personnel_regions`, `object_regions` en `assignment_required_regions` zijn toegevoegd.

Deze sprint wijzigt geen database-schema en voegt geen migratie toe. De focus is bewust UI en server-action koppeling, zodat staging bereikbaar blijft en bestaande legacy regio-velden blijven werken.

## Opgeleverd

- Herbruikbare `RegionMultiSelect` met autocomplete, bestaande regio-opties en create-on-type.
- Centrale regio-acties in `artifacts/backoffice/src/app/actions/regions.ts`.
- Personeelsformulier gebruikt meerdere regio's en blijft legacy `personnel.region` plus `preferred_regions` vullen.
- Objectformulier gebruikt meerdere regio's via `object_regions`.
- Opdrachtformulier gebruikt meerdere regio's via `assignment_required_regions` en blijft de eerste regio naar legacy `assignments.required_region` schrijven.
- Objecten- en opdrachtenoverzicht geven tenant-regio-opties door aan hun formulieren.

## Compatibiliteitscontract

- De eerste geselecteerde personeelsregio is de primaire regio.
- Extra personeelsregio's blijven beschikbaar voor planning via `preferred_regions` en `personnel_regions`.
- De eerste geselecteerde opdrachtregio blijft leidend voor bestaande planningfilters via `assignments.required_region`.
- Nieuwe ingetypte regio's worden tenant-breed opgeslagen en verschijnen daarna in de dropdown.
- Oude single-regio velden blijven tijdelijk bestaan voor runtimecompatibiliteit en Sprint 4 planninglogica.

## Tenant-scope

Alle regio-acties vragen de huidige tenantcontext op en controleren dat het gekoppelde personeelslid, object of de opdracht binnen dezelfde tenant valt voordat regio's worden gelezen of opgeslagen.

## Bewijs

Deze sprint heeft een statische guardtest:

- `tests/fieldgrid-sprint-3-region-ui.test.mjs`

De guard controleert dat:

- de gedeelde selector bestaat;
- autocomplete en create-on-type aanwezig zijn;
- personeel, objecten en opdrachten de selector gebruiken;
- regio's via tenant-scoped server actions worden gelezen en gesynchroniseerd;
- objecten en opdrachten regio-opties vanuit hun pagina's ontvangen;
- dit sprintdocument onderdeel van de canon blijft.

## Vervolg in Sprint 4

Sprint 4 maakt de regio's runtime-actief:

- planning eligibility gebruikt overlap tussen opdrachtregio's en personeelsregio's;
- objectregio's kunnen opdrachtregio's voorinvullen;
- filters worden regio-aware;
- Tenant A/B/Veele denial proof volgt in runtime tests.
