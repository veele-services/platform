# Fieldgrid sprint 4 - Regio runtime en planninglogica

Datum: 2026-07-04
Status: geleverd als runtimebasis; echte Tenant A/B/Veele integration proof blijft Sprint 5.

## Doel

Sprint 4 maakt de regio's uit Sprint 2 en Sprint 3 bruikbaar in runtimeflows. De additive tabellen blijven leidend voor nieuwe data, terwijl legacy velden tijdelijk blijven bestaan als fallback zodat staging bereikbaar blijft en bestaande data blijft werken.

## Geleverde onderdelen

- Personeelslijsten filteren regio-aware via `personnel_regions`, `tenant_regions`, legacy `personnel.region` en legacy `personnel.preferred_regions`.
- Objectlijsten filteren regio-aware via `object_regions`, `tenant_regions` en legacy `objects.city`.
- Opdrachtlijsten filteren regio-aware via `assignment_required_regions`, `tenant_regions` en legacy `assignments.required_region`.
- Nieuwe opdrachten nemen objectregio's automatisch over zolang planning zelf nog geen regio gekozen heeft.
- Het opdrachtfilter in de backoffice heeft een tenant-regio dropdown.
- De runtimequeries scopen alle regio-relaties op de huidige tenant.

## Runtimecontract

1. Een opdracht zonder regio-eis blijft planbaar voor alle medewerkers die aan de overige planningregels voldoen.
2. Een opdracht met een of meer regio's vereist regio-overlap bij personeelsmatching.
3. Nieuwe multi-regio data gebruikt de linktabellen als bron.
4. Legacy `required_region`, `personnel.region`, `preferred_regions` en objectplaats blijven tijdelijk fallback voor staging-continuiteit.
5. Een regio uit een andere tenant mag nooit matchen, omdat elke region join zowel de linktabel als `tenant_regions` op `tenant_id` begrenst.
6. Objectregio's mogen opdrachtregio's voorinvullen, maar planning kan deze daarna handmatig overschrijven.

## Bestanden

- `artifacts/backoffice/src/app/actions/region-runtime.ts`
- `artifacts/backoffice/src/app/(dashboard)/personnel/page.tsx`
- `artifacts/backoffice/src/app/(dashboard)/objects/page.tsx`
- `artifacts/backoffice/src/app/(dashboard)/assignments/page.tsx`
- `artifacts/backoffice/src/components/assignments/AssignmentsView.tsx`
- `artifacts/backoffice/src/components/assignments/AssignmentForm.tsx`
- `tests/fieldgrid-sprint-4-region-runtime.test.mjs`

## Open bewijs na deze sprint

Sprint 4 levert runtimewiring en statische bewaking. Sprint 5 moet dit bewijzen met echte Tenant A/B/Veele fixtures:

- Tenant A-regio mag Tenant B-personeel niet matchen.
- `veele` blijft een gewone tenant en krijgt geen platform-uitzondering.
- Opdracht zonder regio blijft unrestricted.
- Opdracht met meerdere regio's matcht als er minimaal een overlap is.
- Direct-ID en verkeerde-host scenario's blijven tenant-denials.

## Stagingcontinuiteit

Deze sprint bevat geen migratie en geen datadestructieve wijziging. Bestaande legacy regio-data blijft zichtbaar en bruikbaar; nieuwe multi-regio data wordt daarnaast gebruikt.