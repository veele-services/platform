# Fieldgrid Live Day Map - Fase 7 Kaart UI Achter Feature Flag

## Scope

Fase 7 voegt de eerste kaartweergave toe aan de tenant planning, maar alleen achter de bestaande feature flag `FIELDGRID_PLANNING_DAY_MAP_ENABLED`.

Standaard blijft de flag uit. Zonder flag ziet een gebruiker alleen de bestaande Bord-, Dag- en Maandweergave. Er wordt dan geen mapdata opgehaald en de MapLibre-bundle wordt niet geladen.

## Wat Is Toegevoegd

- `maplibre-gl` als dependency van `@workspace/backoffice`.
- Nieuwe clientcomponent `PlanningMapView`.
- Nieuwe planningroute `?view=map&date=YYYY-MM-DD`, alleen actief als `isPlanningDayMapEnabled()` true is.
- Vierde headeractie `Kaart`, alleen zichtbaar wanneer de flag aan staat.
- Markerstatuskleuren op basis van opdrachtstatus en waarschuwingen.
- Routepaneel per personeelslid met stops, reistijd, afstand en warning count.
- Detaildrawer per marker met status, prioriteit, locatiebron, gekoppeld personeel en routecontext.
- Empty/warning states voor ontbrekende coordinaten, geen data en kaartlaadfouten.

## Lazy Loading En SSR

Deze fase gebruikt expliciet lazy-loading voor MapLibre.

`PlanningMapView` is een clientcomponent, maar MapLibre wordt niet statisch geimporteerd. De component gebruikt:

```ts
await import("maplibre-gl")
```

Daardoor blijft SSR veilig en wordt de zware kaartcode pas geladen wanneer de kaartcomponent daadwerkelijk gemount wordt.

## Security

- De kaart gebruikt `getPlanningDayMapData` uit fase 6.
- Alle data blijft server-side geautoriseerd via `planning:read`.
- Tenantfiltering blijft in de server action zitten.
- Er zijn geen `NEXT_PUBLIC` routeprovider keys toegevoegd.
- De rasterkaart gebruikt een keyless OpenStreetMap-bron.
- Provider metadata en routeprovider secrets worden niet aan de client doorgegeven.

## UI Gedrag

De kaart toont:

- markers met statuskleur;
- markerlijst voor toetsenbord/muisnavigatie;
- routepaneel met stops per medewerker;
- warnings voor ontbrekende locaties en routecontextproblemen;
- detaildrawer voor de geselecteerde werkbon.

Ontbrekende objectcoordinaten blokkeren de pagina niet. De gebruiker ziet een nette waarschuwing en kan de werkbon alsnog openen.

## Rollback

Directe rollback kan door `FIELDGRID_PLANNING_DAY_MAP_ENABLED` uit te zetten. Dan verdwijnt de kaarttab en wordt de kaartcomponent niet geladen.

Code rollback is beperkt tot:

- `PlanningMapView` verwijderen;
- de `view=map` branch en `Kaart` actie uit `planning/page.tsx` verwijderen;
- `maplibre-gl` dependency verwijderen.

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
