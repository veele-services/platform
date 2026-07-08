# Fieldgrid live dagkaart - fase 2 passief datamodel

## Doel

Fase 2 voegt alleen passieve datamodelvelden toe voor latere kaart-, geocoding- en ETA-functionaliteit. Er is geen kaart UI, geen routeprovider, geen geocoding job en geen planningmutatie toegevoegd.

## Passief datamodel

Deze fase legt alleen opslagstructuren vast. Latere fases mogen deze velden en tabellen vullen of tonen, maar fase 2 zelf mag geen bestaande planningstatus, klantmelding, personeels-PWA flow of opdrachtmutatie veranderen.

## Geraakte schema's

- `lib/db/src/schema/customers.ts`
- `lib/db/src/schema/objects.ts`
- `lib/db/src/schema/personnel.ts`
- `lib/db/src/schema/organization-settings.ts`
- `lib/db/src/schema/planning-routes.ts`
- `lib/db/src/schema/index.ts`

## Nieuwe velden

Klanten en objecten:

- `latitude`
- `longitude`
- `geocoded_at`
- `geocoding_provider`
- `geocoding_status`
- `geocoding_confidence`
- `geocoding_error`

Personeel:

- `vehicle_type`, default `car`

Organisatie-instellingen:

- `route_provider`, default `google`
- `route_buffer_minutes_car`, default `10`
- `route_buffer_minutes_bicycle`, default `5`
- `route_buffer_minutes_walking`, default `5`
- `route_buffer_minutes_moped_or_scooter`, default `8`
- `route_buffer_minutes_public_transport`, default `15`
- `route_cache_ttl_hours`, default `24`

## Nieuwe tabellen

`assignment_route_cache`

- Tenant-scoped cache voor routeprovider-resultaten.
- Bevat origin/destination hashes, coordinaten, vervoerstype, reistijd, afstand en provider metadata.
- Directe `anon` en `authenticated` privileges zijn ingetrokken.

`assignment_route_contexts`

- Tenant-scoped routecontext per opdracht en per personeelslid.
- Bevat vorige opdracht, volgorde, reistijd, buffer, klanttijdvak, snapstatus en waarschuwing.
- Uniek per `tenant_id`, `assignment_id`, `personnel_id`, `scheduled_date`.
- Directe `anon` en `authenticated` privileges zijn ingetrokken.

## Security

De nieuwe route-tabellen zijn bedoeld voor server-mediated access via latere planning server actions. Daarom:

- RLS staat aan.
- Directe Data API privileges voor `anon` en `authenticated` zijn ingetrokken.
- Management policies bestaan alleen als defense-in-depth wanneer privileges later bewust worden toegekend.
- Provider secrets of routeprovider metadata komen niet in client code.

## Regressiegrens

Deze fase wijzigt niet:

- assignment statussen;
- assignment status transities;
- bestaande planning board/dag/maand routes;
- personeels-PWA `Onderweg` flow;
- klantnotificaties;
- bestaande scheduled start/eindtijden.

## Gate

Command:

```bash
pnpm fieldgrid:live-day-map-phase2:check
```

De gate controleert dat schema, migratie en documentatie de passieve routevelden/tabellen bevatten en dat de nieuwe route-tabellen RLS/revokes hebben.
