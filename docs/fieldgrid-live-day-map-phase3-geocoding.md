# Fieldgrid Live Day Map - Fase 3 Read-only geocoding

## Samenvatting

Fase 3 maakt klant- en objectlocaties geocodeerbaar zonder planning, routeberekening of kaartgedrag te wijzigen. De fase gebruikt een server-only geocoding helper en handmatige backoffice-acties om bestaande adresvelden te vertalen naar latitude/longitude.

## Scope

- Server-side geocoding via PDOK Locatieserver voor Nederlandse adressen.
- Handmatige actie "Opnieuw geocoden" op klantdetail en objectdetail.
- Geocode-status zichtbaar op klantdetail, objectdetail en de overzichtstabbladen.
- Adreswijzigingen resetten de geocode-status naar `pending` of `not_required`.
- Providerfouten worden opgeslagen als `failed` met fouttekst, zonder server exception page.
- Er is geen planningmutatie, routeberekening, realtime map, automatische batch of dispatchgedrag toegevoegd.

## Datavelden

Fase 2 heeft de passieve velden al toegevoegd op `customers` en `objects`:

- `latitude`
- `longitude`
- `geocoded_at`
- `geocoding_provider`
- `geocoding_status`
- `geocoding_confidence`
- `geocoding_error`

Fase 3 gebruikt deze velden read-only voor latere kaart- en routefases.

## Gedrag

### Nieuwe klant of nieuw object

Bij aanmaken wordt de status:

- `pending` als straat, postcode of plaats aanwezig is;
- `not_required` als er geen bruikbaar adres is.

Er wordt niet automatisch naar PDOK gebeld tijdens aanmaken.

### Adres wijzigen

Als straat, postcode, plaats of klantland wijzigt, worden oude coordinaten gewist en gaat de status terug naar `pending` of `not_required`. Bij objecten wordt alleen straat, postcode en plaats vergeleken, omdat objecten geen eigen landkolom hebben.

### Handmatig opnieuw geocoden

Een backofficegebruiker met schrijfrecht op klanten/objecten kan handmatig opnieuw geocoden:

- Succes: latitude/longitude, provider, confidence en timestamp worden bijgewerkt.
- Geen adres: status wordt `not_required`; er wordt geen provider call gedaan.
- Providerfout of geen match: status wordt `failed`; bestaande coordinaten blijven behouden bij tijdelijke providerfouten.

### Auditlog

De volgende acties worden gelogd:

- `geocode_customer_location`
- `geocode_customer_location_failed`
- `geocode_object_location`
- `geocode_object_location_failed`

## Provider

De helper staat in `artifacts/backoffice/src/lib/planning/geocoding.ts` en heeft `import "server-only";`. De provider is PDOK Locatieserver:

`https://api.pdok.nl/bzk/locatieserver/search/v3_1/free`

De helper heeft:

- timeout via `AbortController`;
- mockbare `fetchImpl` voor tests;
- parser voor PDOK `POINT(lon lat)`;
- alleen Nederlandse adressen in deze fase;
- duidelijke fallbackmeldingen.

## UI

Nieuwe gedeelde UI:

- `GeocodeStatusBadge`
- `GeocodeStatusSummary`

Toepassing:

- klantdetail action header;
- klantoverzichttab;
- objectdetail action header;
- objectoverzichttab.

## Niet in fase 3

Deze fase doet bewust nog niet:

- automatische batch-geocoding;
- routeprovider of reistijdberekening;
- kaartweergave;
- planningoptimalisatie;
- realtime voertuig- of personeelslocatie;
- pushnotificaties.

## Acceptatiecriteria

- Fase 1 en fase 2 gates blijven groen.
- `fieldgrid:live-day-map-phase3:check` is groen.
- Backoffice typecheck is groen.
- DB migratievolgorde blijft groen.
- Handmatige geocodeacties falen netjes met status/toast en veroorzaken geen server exception page.
- Geen bestaande planningflow wordt gewijzigd.

## Verificatie

Gebruikte checks:

```powershell
node scripts/fieldgrid-live-day-map-phase1-baseline.mjs --check
node scripts/fieldgrid-live-day-map-phase2-datamodel.mjs --check
node scripts/fieldgrid-live-day-map-phase3-geocoding.mjs --check
node scripts/fieldgrid-migration-order-check.mjs --check
node node_modules\typescript\bin\tsc -p artifacts\backoffice\tsconfig.json --noEmit
node node_modules\typescript\bin\tsc --build
```
