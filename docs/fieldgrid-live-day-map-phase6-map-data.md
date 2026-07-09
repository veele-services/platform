# Fieldgrid Live Day Map - Fase 6 Map Data Server Action

## Scope

Fase 6 maakt kaartdata read-only beschikbaar voor de tenant backoffice. Er is nog geen kaart-UI, geen MapLibre-integratie en geen planneractie die tijden of statussen wijzigt.

De nieuwe server action is `getPlanningDayMapData` in `artifacts/backoffice/src/app/actions/planning.ts`. De normalisatie staat in `artifacts/backoffice/src/lib/planning/map-data.ts`.

## Security En Tenant Scope

- De server action vereist `planning:read` via `hasPermission("planning", "read")`.
- Zonder permissie komt een lege response terug met `accessDenied: true`.
- Alle queries gebruiken `requireCurrentTenantId()`.
- Assignments, personeel, klanten, objecten en routecontexten worden allemaal expliciet op dezelfde `tenantId` gefilterd.
- De helper is `server-only`.
- Er worden geen provider secrets, provider keys of ruwe provider metadata teruggegeven.

Hiermee kan tenant A nooit markers, routecontext of planningdata van tenant B ophalen via deze action.

## Response Model

De action retourneert:

- `markers`: werkbonmarkers met klant/object, status, prioriteit, geplande tijden, coordinate en gekoppeld personeel.
- `personnelRoutes`: genormaliseerde routevolgorde per medewerker met stops, reistijd, afstand en waarschuwingsteller.
- `warnings`: routewarnings zoals `missing_location`, providerwarnings uit fase 5 en tijdvensterwaarschuwingen.
- `missingLocationCount`: teller voor werkbonnen zonder bruikbare object- of klantcoordinaten.
- `accessDenied`: expliciete vlag voor permissieafwijzing.

## Coordinaten

Coordinaten worden bewust beperkt tot bruikbare markerpunten:

1. Objectcoordinaten.
2. Klantcoordinaten als fallback.
3. `missing_location` wanneer beide ontbreken of ongeldig zijn.

Ruwe providerresponses blijven in de routecache en worden niet meegenomen in de map-data response.

## Filters

De read-only action ondersteunt alvast:

- datum;
- personeelslid;
- opdrachtstatus;
- regio;
- alleen waarschuwingen.

Filters worden na de tenant-scoped query nogmaals op de genormaliseerde data toegepast, zodat markers, routes en warnings consistent blijven.

## Read-only Garantie

Fase 6 mag niet:

- assignments bijwerken;
- assignment_personnel wijzigen;
- routecontexten herberekenen;
- routeproviders aanroepen;
- provider metadata of secrets expose-en;
- UI-componenten of MapLibre laden.

Fase 6 mag alleen bestaande, tenant-scoped planning- en routecontextdata lezen en normaliseren.

## Verificatie

Aanbevolen checks:

```powershell
node scripts/fieldgrid-live-day-map-phase1-baseline.mjs --check
node scripts/fieldgrid-live-day-map-phase2-datamodel.mjs --check
node scripts/fieldgrid-live-day-map-phase3-geocoding.mjs --check
node scripts/fieldgrid-live-day-map-phase4-route-provider.mjs --check
node scripts/fieldgrid-live-day-map-phase5-eta-engine.mjs --check
node scripts/fieldgrid-live-day-map-phase6-map-data.mjs --check
node --test tests/fieldgrid-live-day-map-phase5-eta-rules.test.mjs
node --test tests/fieldgrid-live-day-map-phase6-map-data.test.mjs
node node_modules/typescript/bin/tsc -p artifacts/backoffice/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc --build
```
