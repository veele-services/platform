# Fieldgrid Live Day Map - Fase 10

## Doel

Fase 10 maakt de live dagkaart beta-ready door de bestaande ETA-, snap-, provider-, map-data-, UI-, time-suggestion- en realtime-fases vast te zetten met acceptatiechecks, performancebewijs en beheerinstructies.

## Release notes

- De planning kan optioneel een live dagkaart tonen via `FIELDGRID_PLANNING_DAY_MAP_ENABLED`.
- De kaart toont werkbonmarkers, routecontexten, ontbrekende locaties, ETA-waarschuwingen en routepanelen per personeelslid.
- Routevoorstellen blijven bewust handmatig: een planner moet het voorstel expliciet toepassen.
- Bestaande planningweergaven blijven beschikbaar: bord, dag en maand.
- Provider fallback is veilig: zonder `GOOGLE_ROUTES_API_KEY` faalt de Google provider gecontroleerd en kan `FIELDGRID_ROUTE_PROVIDER=mock` voor CI of demo worden gebruikt.
- De fase-10 gate bewaakt tenantisolatie, permissies, responsive UI-contracten, provider fallback en performance met minimaal 50 opdrachten en 20 personeelsleden.

## Geraakte routes, acties en tabellen

- Route: `/planning?view=map&date=YYYY-MM-DD`.
- Bestaande routes: `/planning?date=YYYY-MM-DD`, `/planning?day=YYYY-MM-DD`, `/planning?month=YYYY-MM`.
- Server action: `getPlanningDayMapData`.
- Mutatie action: `applyRouteTimeSuggestion`.
- Datashaping: `buildPlanningDayMapDataFromRows`.
- Providerlaag: `createRouteProvider`, `createGoogleRoutesProvider`, `createMockRouteProvider`.
- Tabellen: `assignments`, `assignment_personnel`, `assignment_route_contexts`, `personnel`, `customers`, `objects`.

## Beheerinstructies

1. Laat de functie standaard uit totdat beta start: `FIELDGRID_PLANNING_DAY_MAP_ENABLED=false`.
2. Zet beta bewust aan per environment: `FIELDGRID_PLANNING_DAY_MAP_ENABLED=true`.
3. Gebruik productieprovider alleen met een geldige `GOOGLE_ROUTES_API_KEY`.
4. Gebruik `FIELDGRID_ROUTE_PROVIDER=mock` voor CI, demo of wanneer geen routeprovider gebruikt mag worden.
5. Controleer dat objecten of klanten coordinaten hebben; zonder locatie blijft de werkbon zichtbaar als waarschuwing, niet als marker.
6. Draai voor release:
   - `pnpm fieldgrid:live-day-map-phase10:check`
   - `pnpm fieldgrid:live-day-map-phase9:check`
   - `pnpm run typecheck`
   - `pnpm run build` in een dependency-complete CI/staging omgeving.

## Security, cross-tenant en tenantisolatie

- `getPlanningDayMapData` vereist `planning.read`.
- Bij ontbrekende permissie retourneert de action alleen lege kaartdata met `accessDenied`.
- Alle relevante joins zijn tenant-scoped met de actuele tenantcontext:
  - opdracht;
  - personeelslid;
  - klant;
  - object;
  - routecontext.
- Daardoor kan Tenant A geen kaart-, route- of ETA-data van Tenant B lezen via de backoffice action.
- Directe database-exposure blijft afhankelijk van bestaande RLS/grants. Voor beta is de app-route veilig omdat de server action dezelfde tenantfiltering en permissies afdwingt.

## Performancecheck

De fase-10 test bevat een fixture met minimaal:

- 50 opdrachten;
- 20 personeelsleden;
- statusfilter;
- regiofilter;
- personeelsfilter;
- route- en warning-samenvattingen.

De test draait zonder externe provider en bewaakt dat datashaping ruim binnen een lokale beta-latency blijft. De productiequery moet daarnaast door database-indexen uit fase 6/7 blijven leunen op tenant, datum, status en routecontext.

## Playwright acceptatie

Voor volledige beta-acceptatie met echte sessies moet strict evidence worden vastgelegd in:

- `outputs/live-day-map-phase10-beta-gate/planning-map-desktop.png`
- `outputs/live-day-map-phase10-beta-gate/planning-map-tablet.png`
- `outputs/live-day-map-phase10-beta-gate/planning-map-mobile.png`
- `outputs/live-day-map-phase10-beta-gate/planning-board-desktop.png`
- `outputs/live-day-map-phase10-beta-gate/planning-day-tablet.png`
- `outputs/live-day-map-phase10-beta-gate/planning-month-mobile.png`
- `outputs/live-day-map-phase10-beta-gate/phase10-playwright-report.json`

Draai daarna:

```powershell
pnpm fieldgrid:live-day-map-phase10:strict
```

De strict gate faalt als screenshots of rapport ontbreken. Hiermee wordt zichtbaar bewijs afgedwongen voor desktop, tablet en mobiel zonder dat de normale CI afhankelijk is van live inlogsessies.

## Acceptatiecriteria

- Typecheck en build slagen in een volledige dependency omgeving.
- Fase 5 tot en met fase 9 gates blijven groen.
- Bord-, dag- en maandplanning blijven bruikbaar wanneer de kaartflag uit staat.
- Kaartweergave is alleen actief wanneer de flag aan staat.
- Geen horizontale scroll door vaste mapbreedtes; de kaart gebruikt responsive gridtracks en een mobiele drawer.
- Provider fallback werkt zonder API key.
- Cross-tenant datalek via de server action is uitgesloten.
- Beta kan worden teruggedraaid door de feature flag uit te zetten.

## Rollback

1. Zet `FIELDGRID_PLANNING_DAY_MAP_ENABLED=false`.
2. Laat routecontexten en providerconfiguratie staan; ze worden niet zichtbaar gebruikt.
3. Bord-, dag- en maandplanning blijven de bestaande primaire planningervaring.
4. Als providerproblemen optreden, zet tijdelijk `FIELDGRID_ROUTE_PROVIDER=mock` of laat `GOOGLE_ROUTES_API_KEY` leeg zodat er gecontroleerde waarschuwingen ontstaan.

## Open beta checks

- Strict Playwright evidence vereist live ingelogde sessies en moet per stagingrelease worden vastgelegd.
- Build moet in CI/staging draaien met complete native dependencies voor Next, Vite, Rollup en Lightning CSS.
