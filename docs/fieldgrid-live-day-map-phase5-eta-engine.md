# Fieldgrid Live Day Map - Fase 5 ETA-engine read-only

## Scope

Fase 5 voegt de ETA-engine toe zonder kaart-UI, server action of planneractie. De engine analyseert bestaande dagplanning per personeelslid, berekent routecontexten en schrijft alleen naar `assignment_route_contexts`.

Deze fase doet expliciet geen assignment update. `scheduled_start`, `scheduled_end`, status, personeelskoppelingen en bestaande planning blijven onaangeroerd.

## Wat Is Toegevoegd

- Pure snapregels in `artifacts/backoffice/src/lib/planning/eta-rules.ts`.
- Server-only recalculatie in `artifacts/backoffice/src/lib/planning/eta-engine.ts`.
- Unit tests voor buffers, klanttijdvakken, actual timestamps, providerfout, ontbrekende locatie en meerdere volgordegevallen.
- Fase-5 gate: `pnpm fieldgrid:live-day-map-phase5:check`.

## Dagvolgorde

De volgorde wordt per personeelslid bepaald op bestaande planning:

1. `scheduledStart`
2. `scheduledEnd`
3. `assignedAt`
4. `assignment id`

Dit is bewust geen routeoptimalisatie. Fieldgrid verandert de volgorde niet en kiest geen "beste route".

## Vertrekbasis

Voor opdracht B na opdracht A:

- Als A `actualCompletedAt` heeft, gebruikt de engine die timestamp.
- Als A `in_progress` is, gebruikt de engine `max(now, scheduledEnd)`.
- In alle andere gevallen gebruikt de engine de geplande eindtijd van A.
- Als er geen vorige opdracht is, wordt geen routebuffer toegepast en blijft de context `ok` zolang de bestemming bekend is.

## Locatiekeuze

Per opdracht gebruikt de engine:

1. Objectcoördinaten.
2. Klantcoördinaten als fallback.
3. `missing_location` wanneer beide ontbreken.

## Snapregels

De basisformule:

```text
computedEarliestStart = departureTime + routeDuration + vehicleBuffer
```

Daarna:

- Als de route ruim voor het klanttijdvak aankomt, blijft de start op het venster/de geplande start.
- Als de route binnen het klanttijdvak aankomt, wordt naar boven afgerond op `planningTimeSlotMinutes`.
- Als de route na het klanttijdvak aankomt, krijgt de context `outside_window`.
- Als de provider faalt, krijgt de context `provider_error`.
- Als locatie of vertrektijd ontbreekt, krijgt de context een waarschuwing zonder pagina-crash.

Omdat er nog geen apart klanttijdvak in de opdracht bestaat, gebruikt fase 5 voorlopig `scheduledStart` en `scheduledEnd` als customer-window velden in de routecontext. Dit maakt de engine compatibel met een latere aparte tijdvakmigratie zonder bestaande planning te muteren.

## Buffers

Buffers komen uit `organization_settings`:

- `route_buffer_minutes_car`
- `route_buffer_minutes_bicycle`
- `route_buffer_minutes_walking`
- `route_buffer_minutes_moped_or_scooter`
- `route_buffer_minutes_public_transport`

De cache TTL blijft gekoppeld aan `route_cache_ttl_hours`.

## Meerdere Personeelsleden

Bij meerdere personeelsleden op één opdracht schrijft de engine één context per personeelslid. De unieke sleutel blijft:

```text
tenant_id + assignment_id + personnel_id + scheduled_date
```

Daardoor overschrijft route-informatie van medewerker A nooit die van medewerker B.

## Read-only Garantie

Fase 5 mag alleen:

- `assignment_route_contexts` voor de gevraagde tenant/datum-scope opschonen.
- Nieuwe routecontexten schrijven.
- Routecache gebruiken via fase 4.

Fase 5 mag niet:

- `assignments` bijwerken.
- `assignment_personnel` wijzigen.
- Plannerstatussen aanpassen.
- Tijden automatisch toepassen.
- Een kaart-UI tonen.

## Security

- Alle ETA-modules zijn `server-only`.
- Routeprovider keys blijven server-side.
- Recalculatie vereist een expliciete `tenantId`.
- Alle routecontextqueries filteren op `tenantId`.
- Deze fase voegt geen nieuwe Supabase grants toe.

## Verificatie

Aanbevolen checks:

```powershell
node scripts/fieldgrid-live-day-map-phase1-baseline.mjs --check
node scripts/fieldgrid-live-day-map-phase2-datamodel.mjs --check
node scripts/fieldgrid-live-day-map-phase3-geocoding.mjs --check
node scripts/fieldgrid-live-day-map-phase4-route-provider.mjs --check
node scripts/fieldgrid-live-day-map-phase5-eta-engine.mjs --check
node --test tests/fieldgrid-live-day-map-phase5-eta-rules.test.mjs
node node_modules/typescript/bin/tsc -p artifacts/backoffice/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc --build
```
