# Fieldgrid live dagkaart en reistijdbuffer - onderzoek en implementatieplan

## 1. Samenvatting

Dit document beschrijft hoe Fieldgrid een eerste productieklare versie kan krijgen van een live dagkaart voor planning. De kaart toont werkbonnen/opdrachten op een kaart, toont de actuele status per marker en berekent per personeelslid de reistijd van de vorige werkbon naar de volgende werkbon. Op basis daarvan kan Fieldgrid automatisch een buffer voorstellen en geplande tijden naar voren schuiven wanneer een werkbon buiten het klanttijdvak dreigt te vallen.

Dit is bewust geen routeoptimalisatie, geen live GPS-tracking en geen automatische volgordebepaling. De planner bepaalt de volgorde. Fieldgrid ondersteunt alleen met reistijd, ETA, buffer en waarschuwingen.

De eerste versie moet tenant-safe zijn, alleen backoffice/planning zichtbaar zijn, server-side provider keys gebruiken en geen route- of klantdata lekken tussen organisaties.

## 2. Scope en niet-doelen

### In scope

- Dagkaart in tenant backoffice planning.
- Markers voor geplande werkbonnen op basis van object- of klantlocatie.
- Markerstatus met kleur:
  - grijs: nog niet gestart of gepland;
  - geel: onderweg;
  - oranje: in uitvoering;
  - groen: afgerond of administratief afgerond;
  - rood: niet afgerond, probleem of toekomstige incidentstatus.
- Per personeelslid de routecontext berekenen op basis van bestaande geplande volgorde.
- Reistijd en afstand tussen vorige en volgende werkbon ophalen via routeprovider.
- Configureerbare buffer per vervoerstype.
- ETA en waarschuwingen tonen wanneer de berekende starttijd buiten het klanttijdvak valt.
- Tijdvoorstel/snap naar vroegst mogelijke tijd binnen klanttijdvak.
- Basis realtime-refresh bij status- of planningswijzigingen.

### Buiten scope voor eerste versie

- Geen automatische volgorde-optimalisatie.
- Geen "beste route" per dag.
- Geen live GPS-locatie van personeel.
- Geen turn-by-turn navigatie.
- Geen klantzichtbare realtime tracking.
- Geen automatische planning zonder bevestiging van planner.

## 3. Analyse huidige codebase

### 3.1 Planningroutes en UI

De tenant backoffice planning staat in:

- `artifacts/backoffice/src/app/(dashboard)/planning/page.tsx`
- `artifacts/backoffice/src/components/assignments/PlanningBoardView.tsx`
- `artifacts/backoffice/src/components/assignments/PlanningDayView.tsx`
- `artifacts/backoffice/src/components/assignments/PlanningMonthView.tsx`

De route ondersteunt nu bord-, dag- en maandweergave. Een dagkaart past logisch als vierde weergave binnen dezelfde route, bijvoorbeeld:

- `/planning?view=map&date=YYYY-MM-DD`
- of backwards-compatible: `/planning?map=YYYY-MM-DD`

Aanbevolen: introduceer expliciet `view=board|day|month|map`, maar behoud de bestaande queryvormen voorlopig als fallback.

### 3.2 Planningacties en bestaande data

Belangrijke server actions:

- `artifacts/backoffice/src/app/actions/planning.ts`
- `artifacts/backoffice/src/app/actions/assignments.ts`

Herbruikbare functies en patronen:

- `getPlanningBoardData(filters)` haalt dagplanning, open opdrachten, personeel, beschikbaarheid, sectoren en kandidaatdata tenant-scoped op.
- `getDayTimelineData(dateStr)` bouwt een per-personeelslid timeline voor een datum.
- `rescheduleAssignment(id, newDate)` verplaatst een opdracht naar een andere datum.
- `reshiftAssignment(id, newStart, newEnd)` wijzigt start/eindtijd op dezelfde dag.
- `assignPersonnel(...)` koppelt personeel en zet plannable opdrachten naar scheduled.
- `setAssignmentStatus(...)` valideert statustransities en schrijft auditlog.

Voor de kaart is een nieuwe server action het schoonst:

- `getPlanningDayMapData({ date, personnelId?, status?, region? })`
- `recalculateAssignmentRouteContext({ date, personnelId? })`
- `applyRouteTimeSuggestion({ assignmentId, scheduledStart, scheduledEnd })`

### 3.3 Opdrachtstatussen

De statusdefinitie staat in:

- `lib/db/src/schema/assignments.ts`
- `artifacts/backoffice/src/lib/process-status.ts`
- `artifacts/backoffice/src/components/assignments/AssignmentStatusBadge.tsx`
- `artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/work-order-data.ts`

Bestaande statussen bevatten al:

- `scheduled`
- `seen`
- `en_route`
- `in_progress`
- `not_completed`
- `completed`
- administratieve statussen zoals `report_submitted`, `invoice_ready`, `closed`

De personeelsapp gebruikt al "Onderweg" in de timeline en zet `enRouteAt` bij eerste trigger. Daardoor kan de dagkaart aansluiten op bestaande statusdata.

### 3.4 Datamodel dat nu bestaat

Belangrijke tabellen:

- `assignmentsTable` in `lib/db/src/schema/assignments.ts`
- `assignmentPersonnelTable` in `lib/db/src/schema/assignments.ts`
- `customersTable` in `lib/db/src/schema/customers.ts`
- `objectsTable` in `lib/db/src/schema/objects.ts`
- `personnelTable` in `lib/db/src/schema/personnel.ts`
- `organizationSettingsTable` in `lib/db/src/schema/organization-settings.ts`

Huidige relevante velden:

- Opdracht: `tenantId`, `customerId`, `objectId`, `scheduledDate`, `scheduledStart`, `scheduledEnd`, `status`, `seenAt`, `enRouteAt`, `actualStartedAt`, `actualCompletedAt`.
- Object: `address`, `postalCode`, `city`, `customerId`.
- Klant: `address`, `postalCode`, `city`, `country`.
- Personeel: adresvelden, `sectorId`, `region`, `preferredRegions`.
- Organisatie-instellingen: onder andere `planningWorkdayStart` en `planningTimeSlotMinutes`.

Ontbrekend voor de dagkaart:

- Latitude/longitude voor objecten/klanten.
- Geocode-status en provider metadata.
- Vervoerstype per personeelslid.
- Routecache.
- ETA-velden per opdracht/personeelsroute.
- Klanttijdvak apart van geplande start/eind.
- Travel-buffer instellingen per vervoerstype.

### 3.5 Personeelsapp en status-events

De personeelsapp action staat in:

- `artifacts/personeel-pwa/src/actions/assignments.ts`

Bij `en_route` wordt `enRouteAt` gezet. De code voorkomt dat de klantmelding meerdere keren wordt gestuurd door alleen de eerste trigger te behandelen als eerste onderweg-event. Dit is ook het juiste moment om de routecontext opnieuw te berekenen.

### 3.6 Realtime

De backoffice heeft een realtime provider:

- `artifacts/backoffice/src/components/realtime/BackofficeRealtimeProvider.tsx`

Deze luistert naar `portal_realtime_events` en refresht de router. De kaart kan hierop aansluiten. Voor MVP is polling of router refresh bij server actions voldoende; daarna kunnen status- en planningsacties expliciet realtime events wegschrijven.

### 3.7 Rechten en tenant-scope

De planningroute gebruikt planningrechten:

- `planning:read` voor zichtbaarheid.
- `planning:write` voor aanpassen.

Nieuwe kaartdata moet dezelfde authorization gebruiken. Provider keys en routecache mogen nooit naar clients lekken. Alle data blijft tenant-scoped.

## 4. Herbruikbaar versus nieuw

### Direct herbruikbaar

- Bestaande planningroute en header.
- Bestaande statusflow en timestamps.
- Bestaande assignment/personnel koppeling.
- Bestaande adresvelden op object/klant.
- Bestaande tenant auth en permission helpers.
- Bestaande `rescheduleAssignment` en `reshiftAssignment`.
- Bestaande auditlog/notificatiepatronen.
- Bestaande realtime-refresh infrastructuur.

### Nieuw nodig

- Map component en dependency, bijvoorbeeld MapLibre GL.
- Server-side routeprovider abstraction.
- Geocoding abstraction.
- Routecache tabel.
- Velden voor coordinaten.
- Velden voor route/ETA-resultaat.
- Vervoerstype per personeelslid.
- Tenant-configuratie voor reistijdbuffers.
- Visuele routewaarschuwingen.
- Tests voor ETA, snapregels en tenant-isolatie.

## 5. Datamodelvoorstel

### 5.1 Object- en klantlocatie

Voeg aan objecten toe:

- `latitude numeric(9,6)`
- `longitude numeric(9,6)`
- `geocoded_at timestamptz`
- `geocoding_provider varchar`
- `geocoding_status varchar default 'pending'`
- `geocoding_confidence numeric(5,2)`
- `geocoding_error text`

Voeg dezelfde velden optioneel aan klanten toe als fallback wanneer een opdracht geen object heeft.

Aanbevolen locatiekeuze:

1. Gebruik objectcoordinaten als `objectId` aanwezig is.
2. Gebruik klantcoordinaten als er geen objectlocatie is.
3. Toon "locatie ontbreekt" wanneer beide ontbreken.

### 5.2 Vervoerstype personeel

Voeg aan personeel toe:

- `vehicle_type varchar default 'car'`

Toegestane waarden voor eerste versie:

- `car`
- `bicycle`
- `walking`
- `moped_or_scooter`
- `public_transport`

Als de provider een type niet ondersteunt, valt de backend terug naar tenant default of `car` en toont een waarschuwing.

### 5.3 Routecache

Nieuwe tabel `assignment_route_cache`:

- `id uuid primary key`
- `tenant_id uuid not null`
- `provider varchar not null`
- `vehicle_type varchar not null`
- `origin_lat numeric(9,6) not null`
- `origin_lng numeric(9,6) not null`
- `destination_lat numeric(9,6) not null`
- `destination_lng numeric(9,6) not null`
- `origin_hash varchar not null`
- `destination_hash varchar not null`
- `duration_seconds integer not null`
- `distance_meters integer`
- `provider_meta jsonb`
- `calculated_at timestamptz not null default now()`
- `expires_at timestamptz not null`

Indexen:

- unique `(tenant_id, provider, vehicle_type, origin_hash, destination_hash)`
- index `(tenant_id, expires_at)`

RLS:

- Geen directe client reads nodig in MVP.
- Revoke anon/authenticated grants of maak read policies alleen voor tenant-backoffice service/context als Data API exposure nodig is.
- Service role/server action mag schrijven.

### 5.4 Routecontext per opdracht

Optie A: velden op `assignments`.

- `customer_window_start varchar(5)`
- `customer_window_end varchar(5)`
- `estimated_start_at timestamptz`
- `estimated_end_at timestamptz`
- `travel_buffer_minutes integer`
- `travel_duration_seconds integer`
- `travel_distance_meters integer`
- `route_previous_assignment_id uuid`
- `route_calculated_at timestamptz`
- `route_warning varchar`
- `route_snap_reason varchar`

Optie B: aparte tabel `assignment_route_contexts`.

Aanbevolen voor productie: aparte tabel, omdat een opdracht meerdere personeelsleden kan hebben.

Nieuwe tabel `assignment_route_contexts`:

- `id uuid primary key`
- `tenant_id uuid not null`
- `assignment_id uuid not null`
- `personnel_id uuid not null`
- `previous_assignment_id uuid`
- `scheduled_date varchar(10) not null`
- `sequence_index integer not null`
- `origin_kind varchar`
- `origin_assignment_id uuid`
- `origin_lat numeric(9,6)`
- `origin_lng numeric(9,6)`
- `destination_lat numeric(9,6)`
- `destination_lng numeric(9,6)`
- `vehicle_type varchar not null`
- `travel_duration_seconds integer`
- `travel_distance_meters integer`
- `buffer_minutes integer not null default 0`
- `computed_earliest_start timestamptz`
- `customer_window_start varchar(5)`
- `customer_window_end varchar(5)`
- `snap_status varchar`
- `snap_suggested_start varchar(5)`
- `snap_suggested_end varchar(5)`
- `warning_code varchar`
- `warning_message text`
- `calculated_at timestamptz`

Unieke index:

- `(tenant_id, assignment_id, personnel_id, scheduled_date)`

Dit voorkomt dat data van meerdere gekoppelde personeelsleden elkaar overschrijft.

### 5.5 Organisatie-instellingen

Breid `organization_settings` uit met routebuffer instellingen:

- `route_provider varchar default 'google'`
- `route_buffer_minutes_car integer default 10`
- `route_buffer_minutes_bicycle integer default 5`
- `route_buffer_minutes_walking integer default 5`
- `route_buffer_minutes_moped_or_scooter integer default 8`
- `route_buffer_minutes_public_transport integer default 15`
- `route_cache_ttl_hours integer default 24`

Dit past beter dan hardcoded waarden, omdat reistijdmarges per organisatie verschillen.

## 6. Routeprovider ontwerp

### 6.1 Server-only abstraction

Maak een server-only module, bijvoorbeeld:

- `artifacts/backoffice/src/lib/planning/routes/route-provider.ts`
- `artifacts/backoffice/src/lib/planning/routes/google-routes-provider.ts`
- `artifacts/backoffice/src/lib/planning/routes/geocoding-provider.ts`

Interface:

```ts
type VehicleType = "car" | "bicycle" | "walking" | "moped_or_scooter" | "public_transport";

type RouteRequest = {
  tenantId: string;
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  vehicleType: VehicleType;
  departureTime?: Date;
};

type RouteResult = {
  durationSeconds: number;
  distanceMeters?: number;
  provider: string;
  providerMode: string;
  warnings: string[];
};
```

De Google API key hoort in een server-only env var:

- `GOOGLE_ROUTES_API_KEY`

Nooit:

- `NEXT_PUBLIC_GOOGLE_ROUTES_API_KEY`

### 6.2 Google Routes mapping

Voor implementatie moet de exacte Google Routes API documentatie op dat moment worden gecontroleerd. Functioneel advies:

- `car` -> drive mode.
- `bicycle` -> bicycle mode als ondersteund, anders fallback en waarschuwing.
- `walking` -> walking mode.
- `moped_or_scooter` -> two-wheeler mode als ondersteund in regio, anders drive fallback.
- `public_transport` -> transit mode als beschikbaar, anders markeer als niet betrouwbaar voor automatische tijdsnap.

### 6.3 Geocoding

Gebruik voor Nederlandse adressen bij voorkeur een server-side geocoder met gecontroleerde opslag:

- PDOK Locatieserver voor NL-adressen.
- Google Geocoding alleen als fallback of wanneer internationale adressen nodig zijn.

Geocode alleen wanneer adres verandert of coordinaten ontbreken. Sla confidence/status op en toon handmatige correctie in object/klantdetail wanneer geocoding faalt.

## 7. ETA- en snapregels

### 7.1 Volgorde

De volgorde komt uit bestaande planning:

1. Filter per personeelslid en datum.
2. Sorteer op `scheduledStart`, daarna `scheduledEnd`, daarna `assignedAt`.
3. Gebruik geen automatische routeoptimalisatie.

Bij meerdere personeelsleden op een opdracht:

- Bereken per personeelslid een eigen routecontext.
- Toon op de marker de primaire context als samenvatting.
- Detaildrawer toont alle gekoppelde personeelsleden en hun ETA/waarschuwingen.
- Primaire context voor marker: eerst toegewezen personeelslid op basis van `assignedAt`.

### 7.2 Vertrekbasis

Voor opdracht B na opdracht A:

- Als A `actualCompletedAt` heeft: vertrekbasis = `actualCompletedAt`.
- Als A `in_progress` is en `scheduledEnd` bekend is: vertrekbasis = max(huidige tijd, geplande eindtijd of berekende eindtijd).
- Als A `en_route` is: gebruik de bekende ETA naar A en geplande/verwachte duur van A om B opnieuw te berekenen.
- Als A alleen gepland is: vertrekbasis = geplande eindtijd van A.
- Als er geen vorige opdracht is: geen routebuffer nodig of vertrekbasis = start van werkdag/thuisbasis wanneer later ingericht.

Wanneer personeelslid bij opdracht B op "Onderweg" zet:

- `enRouteAt` wordt de actuele vertrekbasis voor B.
- Route naar B wordt opnieuw berekend vanaf vorige opdrachtlocatie als die bekend is.
- De klantmelding blijft alleen op eerste `en_route` trigger actief.

### 7.3 Bufferformule

```text
earliestStart = previousEventTime + routeDuration + vehicleBuffer
```

Daarna:

- Als `earliestStart <= customerWindowStart`: voorstel = `customerWindowStart`.
- Als `customerWindowStart < earliestStart <= customerWindowEnd`: voorstel = `earliestStart`, afgerond op planningsslot.
- Als `earliestStart > customerWindowEnd`: waarschuwing = "buiten klanttijdvak".

Afronden:

- Gebruik `organizationSettings.planningTimeSlotMinutes`.
- Rond naar boven af, niet naar beneden.

### 7.4 Voorbeeld

Werkbon A eindigt om 09:00. De route naar B duurt 22 minuten. Autobuf is 10 minuten.

- Vroegst haalbare start B = 09:32.
- Klanttijdvak B = 09:00-11:00.
- Bij 15 minuten slots wordt voorstel 09:45.

## 8. UI/UX voorstel

### 8.1 Planning dagkaart

Nieuwe view binnen planning:

- Header: Bord, Dag, Maand, Kaart.
- Linker/onderste paneel: personeelsroutes per dag.
- Kaart: markers per opdracht.
- Filterbar: datum, personeelslid, status, regio, waarschuwingen.
- Marker click: detaildrawer met opdracht, klant, object, personeel, status, reistijd, ETA, waarschuwing en acties.

### 8.2 Markerweergave

Marker toont:

- Statuskleur.
- Opdrachtcode of volgnummer.
- Kleine badge bij waarschuwing.
- Cluster bij identieke of dicht bij elkaar liggende locaties.

Detail toont:

- Geplande tijd.
- Klanttijdvak.
- Berekende ETA.
- Reistijd + buffer.
- Vorige opdracht.
- Knop "Tijdvoorstel toepassen" als planning write permission bestaat.

### 8.3 Personeelsroutepaneel

Per personeelslid:

- Naam.
- Vervoerstype.
- Aantal opdrachten.
- Totale reistijd.
- Waarschuwingen.
- Opdrachten in volgorde.

Acties:

- Open opdracht.
- Pas voorgestelde tijd toe.
- Herbereken routecontext.

## 9. Realtime en recalculatie

Recalculate triggers:

- Opdracht gepland of tijd gewijzigd.
- Personeel toegewezen of verwijderd.
- Status naar `en_route`, `in_progress`, `completed`, `not_completed`.
- Object- of klantadres/coordinaten gewijzigd.
- Vervoerstype personeel gewijzigd.
- Bufferinstelling gewijzigd.

MVP:

- Recalculate in server actions.
- `revalidatePath("/planning")`.
- Kaart pollt of refresht bij bestaande realtime events.

Vervolg:

- Schrijf `portal_realtime_events` bij relevante status- en planningmutaties.
- Backoffice realtime provider ververst kaart automatisch.

## 10. Security en Supabase/RLS

Belangrijk:

- Google/route API keys blijven server-side.
- Routecache en routecontexts zijn tenant-scoped.
- Geen routecache direct beschikbaar voor `anon`.
- Directe Data API toegang moet expliciet veilig zijn of ingetrokken worden.
- Kaartdata wordt alleen via server actions aan gebruikers met `planning:read` gegeven.
- Mutaties alleen met `planning:write`.
- Views moeten security-invoker zijn of niet exposed worden.
- UPDATE policies moeten SELECT + WITH CHECK hebben wanneer directe RLS-toegang wordt toegestaan.

Geen klantportaal of personeelsapp hoeft routecache direct te lezen in MVP.

## 11. Implementatiefases

### Fase 0 - Baseline en ontwerpbesluit

Taken:

- Dit document reviewen.
- Keuze bevestigen voor MapLibre + PDOK/Google.
- Keuze bevestigen voor aparte `assignment_route_contexts` tabel.
- Bepalen of klanttijdvak los van geplande tijd wordt opgeslagen.

Klaar wanneer:

- Scope en niet-doelen akkoord zijn.
- Geen automatische routeoptimalisatie in MVP.

### Fase 1 - Datamodel en types

Taken:

- Migratie voor coordinaten op objecten/klanten.
- Migratie voor `vehicle_type` op personeel.
- Migratie voor routebuffer instellingen.
- Migratie voor `assignment_route_cache`.
- Migratie voor `assignment_route_contexts`.
- Drizzle schema bijwerken.
- Typecheck.

Klaar wanneer:

- Migraties slagen.
- Tabellen tenant-scoped zijn.
- RLS/grants veilig zijn.

### Fase 2 - Geocoding

Taken:

- Server-side geocoding service.
- Adreswijziging markeert geocoding als pending.
- Backoffice object/klant detail toont geocode-status.
- Handmatige lat/lng correctie of "opnieuw geocoden".

Klaar wanneer:

- Nieuwe of gewijzigde objectlocaties coordinaten krijgen.
- Fouten zichtbaar zijn zonder server exception.

### Fase 3 - Routeprovider en cache

Taken:

- Provider abstraction.
- Google Routes provider.
- Routecache read/write.
- Fallback bij providerfout.
- Unit tests met mock provider.

Klaar wanneer:

- Reistijd en afstand deterministisch terugkomen in tests.
- API key niet client-side zichtbaar is.

### Fase 4 - ETA engine en snapregels

Taken:

- Per personeelslid volgorde bepalen.
- Vorige->volgende routecontext berekenen.
- Buffer per vervoerstype toepassen.
- Klanttijdvak snapregels implementeren.
- Waarschuwingen opslaan.

Klaar wanneer:

- Alle randgevallen testbaar zijn.
- Bij meerdere personeelsleden ontstaan meerdere routecontexts.

### Fase 5 - Backoffice server actions

Taken:

- `getPlanningDayMapData`.
- `recalculatePlanningDayRoutes`.
- `applyRouteTimeSuggestion`.
- Recalculate hooks in status-, assign-, reschedule- en reshift-actions.
- Auditlog voor toegepaste tijdvoorstellen.

Klaar wanneer:

- Kaartdata tenant-safe via server action beschikbaar is.
- Planning write acties bestaande permissies respecteren.

### Fase 6 - Map UI

Taken:

- MapLibre dependency toevoegen.
- `PlanningMapView` bouwen.
- Markerstatussen en clusters.
- Detaildrawer.
- Personeelsroutepaneel.
- Kaart view toevoegen aan planningheader.

Klaar wanneer:

- Desktop/tablet/mobile bruikbaar zijn.
- Geen layout overflow.
- Ontbrekende coordinaten tonen duidelijke states.

### Fase 7 - Realtime en PWA-statuskoppeling

Taken:

- Recalculate bij `en_route`, `in_progress`, `completed`, `not_completed`.
- Realtime event wegschrijven voor management planning.
- Klantmelding bij eerste `en_route` blijft eenmalig.

Klaar wanneer:

- Planner ziet status/ETA updates zonder handmatig zoeken.
- Meerdere personeelsleden sturen geen dubbele klantmail.

### Fase 8 - QA en acceptatie

Taken:

- Unit tests ETA/snap.
- Server action tests tenant-isolatie.
- Playwright desktop/tablet/mobile planningkaart.
- Provider mock tests.
- Migratie/gate/typecheck/build.

Klaar wanneer:

- Tests tonen dat routedata niet lekt.
- Kaart werkt met ontbrekende coordinaten, providerfout en meerdere personeelsleden.

## 12. Regressievrij uitvoeringsplan - 10 volledig uitvoerbare fases

Dit plan is bedoeld om de functie 100 procent uitvoerbaar te maken zonder regressies in bestaande planning, opdrachten, statusflows, personeelsapp of klantcommunicatie. Iedere fase moet afzonderlijk kunnen worden gemerged, gedeployed en eventueel teruggedraaid.

Algemene regels voor alle fases:

- Nieuwe functionaliteit staat standaard achter een feature flag of wordt read-only toegevoegd.
- Bestaande planningviews blijven werken: bord, dag en maand.
- Bestaande statusflow blijft leidend; er worden geen statussen verwijderd of hernoemd.
- Geen automatische volgorde-optimalisatie in code, ook niet als "helper".
- Geen client-side routeprovider keys.
- Geen bestaande notificatie/mailflow aanpassen zonder regressietest.
- Iedere fase eindigt met typecheck, relevante unit tests en minimaal een gerichte smoke op planning.
- Iedere fase documenteert welke bestanden, tabellen en acties zijn geraakt.

### Fase 1 - Baseline, feature flag en regressiehek

Doel:

- Een harde nulmeting maken voordat er routefunctionaliteit bijkomt.

Taken:

- Voeg feature flag toe, bijvoorbeeld `planning_day_map_enabled`, default `false`.
- Documenteer huidige planningroutes, statusflows en PWA-statusacties.
- Voeg een kleine regression gate toe die controleert dat bestaande assignment statussen en transities intact blijven.
- Maak testfixtures voor een tenant met opdrachten, personeel, objecten en planning.

Raakt:

- Planning config/settings.
- Test/gate scripts.
- Geen runtime UI behalve verborgen flag.

Niet verder voordat:

- Bord/dag/maand planning nog renderen.
- `en_route`, `in_progress`, `completed` statusflow onveranderd is.
- Feature flag default uit staat.

Rollback:

- Flag en tests verwijderen zonder dat data geraakt wordt.

### Fase 2 - Datamodel passief toevoegen

Doel:

- Alle benodigde velden en tabellen toevoegen zonder bestaande flows te veranderen.

Taken:

- Voeg coordinaten/geocode-status toe aan objecten en klanten.
- Voeg `vehicle_type` toe aan personeel met default `car`.
- Voeg routebuffer instellingen toe aan organisatie-instellingen.
- Voeg `assignment_route_cache` toe.
- Voeg `assignment_route_contexts` toe.
- Borg RLS/grants of sluit directe clienttoegang expliciet af.

Raakt:

- `lib/db/src/schema/*`
- SQL migrations.
- Geen backoffice UI verplicht, behalve eventueel read-only debug in settings later.

Niet verder voordat:

- Migraties op lege en bestaande database slagen.
- Bestaande objecten, klanten, personeel en opdrachten blijven leesbaar.
- Directe Supabase/Data API toegang geen cross-tenant routegegevens kan lezen.

Rollback:

- Omdat velden passief zijn, kan rollback via revert zolang er geen productiedata afhankelijk van is.

### Fase 3 - Geocoding read-only

Doel:

- Objecten/klanten coordinaten geven zonder planning te beinvloeden.

Taken:

- Bouw server-side geocoding service.
- Start met handmatige actie "opnieuw geocoden" op object/klant, geen automatische batch.
- Toon geocode-status op object- en klantdetail.
- Bij mislukking duidelijke melding; geen server exception pagina.

Raakt:

- Objectdetail.
- Klantdetail.
- Server action voor geocoding.

Niet verder voordat:

- Adres zonder resultaat een nette fallback toont.
- Objectpagina en klantenpagina geen bestaande regressies hebben.
- Providerfout planning niet raakt.

Rollback:

- UI-actie uitzetten; opgeslagen coordinaten mogen blijven staan.

### Fase 4 - Routeprovider en cache zonder UI

Doel:

- Reistijd veilig kunnen berekenen zonder dat gebruikers al een kaart zien.

Taken:

- Bouw routeprovider interface.
- Implementeer Google Routes provider server-side.
- Implementeer mock provider voor tests.
- Implementeer routecache read/write.
- Voeg rate-limit/fallback handling toe.

Raakt:

- Nieuwe server-only planning route modules.
- Routecache tabel.
- Tests.

Niet verder voordat:

- API key nergens in client bundle of `NEXT_PUBLIC` zit.
- Mock provider alle ETA-tests deterministic maakt.
- Providerfout leidt tot waarschuwing, niet tot pagina-crash.

Rollback:

- Provider modules verwijderen; passieve tabel kan blijven bestaan.

### Fase 5 - ETA-engine read-only

Doel:

- Bestaande geplande volgorde analyseren en ETA/waarschuwingen berekenen zonder planning te wijzigen.

Taken:

- Bepaal per personeelslid de dagvolgorde op geplande tijd.
- Bereken vorige->volgende reistijd.
- Pas buffer per vervoerstype toe.
- Bereken `computed_earliest_start`.
- Bepaal snapstatus: ok, voorstel, buiten klanttijdvak, ontbrekende locatie, providerfout.
- Schrijf routecontexts read-only weg.

Raakt:

- Nieuwe ETA engine.
- `assignment_route_contexts`.
- Geen bestaande assignment update.

Niet verder voordat:

- Unit tests alle snapregels dekken.
- Meerdere personeelsleden op 1 opdracht geen data overschrijven.
- Geen bestaande `scheduledStart` of `scheduledEnd` wordt aangepast.

Rollback:

- Stop recalculatie; contexts kunnen genegeerd of opgeschoond worden.

### Fase 6 - Map data server action read-only

Doel:

- De kaartdata veilig beschikbaar maken voor backoffice zonder UI-wijziging.

Taken:

- Voeg `getPlanningDayMapData` toe.
- Respecteer `planning:read`.
- Filter strikt op tenant.
- Normaliseer markers, personeelsroutes, routewarnings en ontbrekende coordinaten.
- Voeg server action tests toe voor tenantisolatie.

Raakt:

- `artifacts/backoffice/src/app/actions/planning.ts`
- Nieuwe map-data types.

Niet verder voordat:

- Tenant A nooit markers/context van tenant B kan opvragen.
- Gebruiker zonder planningrecht geen data krijgt.
- Response geen provider secrets of ruwe provider metadata bevat.

Rollback:

- Server action verwijderen zonder UI-impact.

### Fase 7 - Kaart UI verborgen achter flag

Doel:

- MapLibre UI bouwen zonder impact voor normale gebruikers.

Taken:

- Voeg MapLibre dependency toe.
- Bouw `PlanningMapView`.
- Voeg vierde tab "Kaart" toe, alleen zichtbaar als flag aan staat.
- Markerstatuskleuren, routepaneel en detaildrawer bouwen.
- Ontbrekende locatie en providerfout als nette empty/warning states tonen.

Raakt:

- Planning page/header.
- Nieuwe client map component.
- Styling.

Niet verder voordat:

- Flag uit: huidige planning UI is visueel onveranderd.
- Flag aan: desktop/tablet/mobile geen horizontale scroll of crash.
- Kaart laadt lazy en breekt SSR niet.

Rollback:

- Flag uitzetten is genoeg voor directe rollback.

### Fase 8 - Planner-acties voor tijdvoorstellen

Doel:

- Planner kan een voorstel toepassen, maar Fieldgrid past niets stilzwijgend aan.

Taken:

- Voeg action `applyRouteTimeSuggestion` toe.
- Hergebruik bestaande `reshiftAssignment` validatie waar mogelijk.
- Auditlog bij toepassen voorstel.
- Toon voor/na tijd duidelijk in confirm dialog.
- Geen automatische bulk apply in MVP.

Raakt:

- Planning map detaildrawer.
- Assignment scheduling actions.
- Auditlog.

Niet verder voordat:

- Alleen gebruikers met `planning:write` kunnen toepassen.
- Bestaande conflictchecks blijven actief.
- Planner ziet altijd confirm voor wijziging.

Rollback:

- Actie verbergen of flag uitzetten; routecontexts blijven read-only.

### Fase 9 - Status- en realtimekoppeling

Doel:

- ETA wordt actueel bij onderweg/start/afronden zonder dubbele klantmeldingen.

Taken:

- Trigger recalculatie na `en_route`, `in_progress`, `completed`, `not_completed`.
- Trigger recalculatie na assign/unassign/reschedule/reshift.
- Schrijf backoffice realtime event voor planningrefresh.
- Behoud bestaande eenmalige klantmelding bij eerste `en_route`.

Raakt:

- Backoffice assignment actions.
- Personeels-PWA assignment actions.
- Realtime events.

Niet verder voordat:

- Eerste `en_route` triggert maximaal 1 klantmail/melding.
- Tweede gekoppelde medewerker veroorzaakt geen dubbele klantmelding.
- Plannerkaart refresh werkt zonder loop.

Rollback:

- Realtime/recalculate hooks achter flag uitzetten.

### Fase 10 - Acceptatie, performance en beta-gate

Doel:

- Bewijzen dat de functie beta-ready is.

Taken:

- Unit tests ETA/snap/provider.
- Server action tests tenantisolatie en permissies.
- Playwright desktop/tablet/mobile voor planning map.
- Smoke tests voor bestaande bord/dag/maand planning.
- Performance check met minimaal 50 opdrachten en 20 personeelsleden.
- Provider fallback test zonder API key.
- Release notes en beheerinstructies toevoegen.

Raakt:

- Tests.
- Docs.
- CI/gates.

Niet verder voordat:

- Typecheck/build/gates groen zijn.
- Geen horizontale scroll op kaart en bestaande planning.
- Geen cross-tenant datalek mogelijk is.
- Feature flag bewust aan gezet kan worden voor beta.

Rollback:

- Flag uit. Bestaande planning blijft bruikbaar.

## 13. Testplan

Minimaal te testen:

1. Tenant A ziet geen routecontext van tenant B.
2. Gebruiker zonder `planning:read` krijgt geen kaartdata.
3. Gebruiker zonder `planning:write` kan geen tijdvoorstel toepassen.
4. Objectlocatie heeft prioriteit boven klantlocatie.
5. Opdracht zonder coordinaten toont duidelijke waarschuwing.
6. Auto ETA gebruikt vorige geplande eindtijd wanneer geen actuals bestaan.
7. Auto ETA gebruikt `actualCompletedAt` wanneer beschikbaar.
8. `en_route` herberekent routecontext.
9. Eerste `en_route` triggert klantmelding eenmalig.
10. Meerdere personeelsleden leveren meerdere routecontexts.
11. Buffer per vervoerstype wordt toegepast.
12. Snap naar klanttijdvak werkt binnen venster.
13. Buiten venster geeft waarschuwing en past niet stilzwijgend aan.
14. Routeproviderfout breekt planningpagina niet.
15. Map render op desktop/tablet/mobile zonder horizontale scroll.

## 14. Risico's en mitigaties

- Providerkosten: routecache en alleen herberekenen bij relevante wijzigingen.
- Privacy: geen live GPS, geen klantzichtbare tracking in MVP.
- Adreskwaliteit: geocode-status en handmatige correctie.
- Meerdere personeelsleden: aparte routecontext per persoon.
- Browser performance: lazy-load map en cluster markers.
- API-dekking vervoerstypes: fallback met zichtbare waarschuwing.
- Realtime complexiteit: begin met server-action refresh, daarna event producer.

## 15. Concrete vervolgtaken

Prompt voor implementatie fase 1:

```text
Start met fase 1 uit docs/research-live-day-map-route-buffering.md. Voeg migraties en Drizzle schema's toe voor object/klant coordinaten, personeel vehicle_type, organisatie routebuffer instellingen, assignment_route_cache en assignment_route_contexts. Borg RLS/grants tenant-safe. Run typecheck/migration gates, commit en push naar main.
```

Prompt voor implementatie fase 2:

```text
Start met fase 2 uit docs/research-live-day-map-route-buffering.md. Bouw server-side geocoding voor objecten/klanten, geocode-status in detailpagina's en opnieuw-geocoden actie. Geen routekaart UI nog. Run typecheck/build, commit en push naar main.
```

Prompt voor implementatie fase 3:

```text
Start met fase 3 uit docs/research-live-day-map-route-buffering.md. Bouw routeprovider abstraction, Google Routes provider, routecache en mockbare tests. API keys server-only. Run typecheck/build/tests, commit en push naar main.
```

Prompt voor implementatie fase 4:

```text
Start met fase 4 uit docs/research-live-day-map-route-buffering.md. Bouw ETA engine en snapregels voor per-personeelslid routecontexts. Voeg unit tests toe voor buffers, klanttijdvakken, actual timestamps en meerdere personeelsleden. Commit en push naar main.
```

Prompt voor implementatie fase 5-6:

```text
Start met fase 5 en 6 uit docs/research-live-day-map-route-buffering.md. Voeg planning day map server actions en MapLibre UI toe met markers, routepaneel, detaildrawer en tijdvoorstel acties. Run desktop/tablet/mobile checks, commit en push naar main.
```

## 16. Acceptatiecriteria voor eerste versie

De eerste versie is gereed wanneer:

- Planner kan een dagkaart openen vanuit planning.
- Opdrachten met locatie verschijnen als marker.
- Markerstatuskleur klopt met opdrachtstatus.
- Per personeelslid wordt vorige->volgende reistijd berekend.
- Buffer per vervoerstype wordt toegepast.
- ETA en waarschuwingen worden zichtbaar.
- Planner kan een voorgestelde tijd toepassen.
- Geen automatische volgorde-optimalisatie plaatsvindt.
- Geen live GPS gebruikt wordt.
- Provider keys blijven server-side.
- Tenantdata blijft strikt gescheiden.
- Desktop, tablet en mobiel zijn gecontroleerd.
