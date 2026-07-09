# Fieldgrid Live Day Map - Fase 7 Kaart UI Achter Feature Flag

## Scope

Fase 7 voegt de eerste kaartweergave toe aan de tenant planning, maar alleen achter de bestaande feature flag `FIELDGRID_PLANNING_DAY_MAP_ENABLED`.

Standaard blijft de flag uit. Zonder flag ziet een gebruiker alleen de bestaande Bord-, Dag- en Maandweergave. Er wordt dan geen mapdata opgehaald en de kaartcomponent wordt niet geladen.

## Wat Is Toegevoegd

- Nieuwe clientcomponent `PlanningMapView`.
- Nieuwe planningroute `?view=map&date=YYYY-MM-DD`, alleen actief als `isPlanningDayMapEnabled()` true is.
- Vierde headeractie `Kaart`, alleen zichtbaar wanneer de flag aan staat.
- Markerstatuskleuren op basis van opdrachtstatus en waarschuwingen.
- Overlaychips voor werkbonnen, waarschuwingen en routes met compacte inline scroll.
- Detaildrawer per marker met status, prioriteit, objectadres, gekoppeld personeel en opdrachtinformatie.
- Empty/warning states voor ontbrekende coordinaten en geen data.

## Client-side Rasterkaart En SSR

`PlanningMapView` is een clientcomponent en rendert een keyless rasterkaart met gewone image tiles. Daardoor is er geen WebGL- of MapLibre-runtime nodig en blijft SSR veilig.

## Security

- De kaart gebruikt `getPlanningDayMapData` uit fase 6.
- Alle data blijft server-side geautoriseerd via `planning:read`.
- Tenantfiltering blijft in de server action zitten.
- Er zijn geen `NEXT_PUBLIC` routeprovider keys toegevoegd.
- De rasterkaart gebruikt een keyless CARTO rasterbron met OpenStreetMap fallbacktiles.
- Provider metadata en routeprovider secrets worden niet aan de client doorgegeven.

## UI Gedrag

De kaart toont:

- markers met statuskleur;
- overlay met werkbonnen voor toetsenbord/muisnavigatie;
- overlay met stops, reistijd en afstand per medewerker;
- overlay met warnings voor ontbrekende locaties en routecontextproblemen;
- detaildrawer voor de geselecteerde werkbon.

Ontbrekende objectcoordinaten blokkeren de pagina niet. De gebruiker ziet een nette waarschuwing en kan de werkbon alsnog openen.

## Rollback

Directe rollback kan door `FIELDGRID_PLANNING_DAY_MAP_ENABLED` uit te zetten. Dan verdwijnt de kaarttab en wordt de kaartcomponent niet geladen.

Code rollback is beperkt tot:

- `PlanningMapView` verwijderen;
- de `view=map` branch en `Kaart` actie uit `planning/page.tsx` verwijderen.

## Verificatie

Aanbevolen checks:

```powershell
node scripts/fieldgrid-live-day-map-phase1-baseline.mjs --check
node scripts/fieldgrid-live-day-map-phase2-datamodel.mjs --check
node scripts/fieldgrid-live-day-map-phase3-geocoding.mjs --check
node scripts/fieldgrid-live-day-map-phase4-route-provider.mjs --check
node scripts/fieldgrid-live-day-map-phase5-eta-engine.mjs --check
node scripts/fieldgrid-live-day-map-phase6-map-data.mjs --check
node scripts/fieldgrid-live-day-map-phase7-map-ui.mjs --check
node --test tests/fieldgrid-live-day-map-phase6-map-data.test.mjs
node --test tests/fieldgrid-live-day-map-phase7-map-ui.test.mjs
node node_modules/typescript/bin/tsc -p artifacts/backoffice/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc --build
```
