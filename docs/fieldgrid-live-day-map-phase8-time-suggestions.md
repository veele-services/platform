# Fieldgrid live day map - Fase 8 tijdvoorstellen

## Scope

Fase 8 maakt route-tijdvoorstellen toepasbaar voor planners, zonder automatische wijzigingen. De kaart blijft achter de bestaande `planning_day_map_enabled` feature flag; als de flag uit staat is deze fase niet zichtbaar in de runtime UI.

## Runtimegedrag

- De routecontext in de planningkaart toont huidig tijdslot en voorgesteld tijdslot naast elkaar.
- Een planner kan per routecontext op `Voorstel toepassen` klikken.
- Daarna opent een confirm dialog met de werkbon, gekoppeld personeelslid, huidige tijd en voorgestelde tijd.
- Fieldgrid past niets stilzwijgend aan: de planner moet altijd expliciet bevestigen.
- Er is geen automatische bulk apply in MVP.

## Server action

`applyRouteTimeSuggestion` staat in `artifacts/backoffice/src/app/actions/assignments.ts`.

De action:

- vereist `planning:write`;
- resolveert de huidige tenant via `requireCurrentTenantId`;
- zoekt de `assignment_route_contexts` rij alleen binnen dezelfde tenant;
- controleert dat de gekoppelde opdracht actief is en dezelfde tenant heeft;
- vereist een `snapSuggestedStart`;
- blokkeert contexten met ontbrekende locatie of routeproviderfout;
- hergebruikt `reshiftAssignment` zodat bestaande statusguards, beschikbaarheidschecks en conflictchecks blijven gelden;
- schrijft een tenant-aware auditregel met action `apply_route_time_suggestion`;
- revalideert `/planning` en de werkbondetailpagina.

## Veiligheid

De routecontext-id uit de client is nooit leidend voor tenanttoegang. De server valideert:

- UUID-vorm;
- routecontext tenant;
- opdracht tenant;
- actieve opdracht;
- `planning:write`.

Hierdoor kan een gebruiker geen tijdvoorstel van een andere organisatie toepassen, ook niet met een handmatig aangepaste request.

## UX

De UI gebruikt de bestaande shadcn `AlertDialog`. Serverfouten sluiten de dialog niet automatisch; de planner ziet de fout direct en kan annuleren of opnieuw proberen. Succes sluit de dialog, toont een melding in de drawer en ververst de planning.

## Rollback

Directe rollback:

1. Zet `planning_day_map_enabled` uit. De actie is dan niet zichtbaar.
2. Desnoods verwijder alleen de knop/import uit `PlanningMapView`; routecontexts blijven read-only.

Er is geen nieuwe migratie en geen dataverliespad.

## Verificatie

- `node scripts/fieldgrid-live-day-map-phase8-time-suggestions.mjs --check`
- `node --test tests/fieldgrid-live-day-map-phase8-time-suggestions.test.mjs`
- `node node_modules\typescript\bin\tsc -p artifacts\backoffice\tsconfig.json --noEmit`
- `node node_modules\typescript\bin\tsc --build`
