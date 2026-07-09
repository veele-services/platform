# Fieldgrid Live Day Map - Fase 9

## Doel

Fase 9 koppelt status- en planningwijzigingen aan de live day map, zodat ETA's en routecontexten niet stale blijven wanneer een werkbon onderweg gaat, start, afrondt, wordt afgemeld of op het planbord verschuift.

## Geraakte routes en acties

- Backoffice opdrachtstatus: `setAssignmentStatus`.
- Backoffice planningmutaties: `assignPersonnel`, `removePersonnel`, `rescheduleAssignment`, `reshiftAssignment`, `applyRouteTimeSuggestion`.
- Backoffice planbord drag/drop: planning schedule action.
- Personeels-PWA statusmutaties: `en_route`, `in_progress`, `completed`, `not_completed`.
- Realtime refresh: `portal_realtime_events` topic `planning_refresh`.

## Implementatie

- `@workspace/db/planning-realtime` bevat een gedeelde realtime helper.
- Personeels-PWA invalidatie verwijdert stale `assignment_route_contexts` voor de werkbon en schrijft een management `planning_refresh` event.
- Backoffice gebruikt `safeRefreshPlanningRoutesForAssignment` om de bestaande `recalculatePlanningRouteContexts` engine te draaien voor geraakte dagen en daarna hetzelfde realtime-event te schrijven.
- Planning board mutaties nemen de vorige plandatum mee, zodat oude en nieuwe dag worden ververst.

## Klantmelding Onderweg

De bestaande eenmalige klantmelding blijft leidend:

- `firstEnRouteTrigger` wordt alleen true als `en_route_at` nog leeg is.
- Alleen `newStatus === "en_route" && firstEnRouteTrigger` stuurt `assignment_en_route`.
- Een tweede gekoppelde medewerker kan daardoor geen dubbele klantmail of klantpush veroorzaken.
- De routecontext/realtime invalidatie mag wel opnieuw draaien, omdat die geen klantbericht maakt.

## Acceptatiecriteria

- `en_route`, `in_progress`, `completed` en `not_completed` triggeren planningroute invalidatie of herberekening.
- Assign, unassign, reschedule, reshift en routevoorstel toepassen triggeren herberekening en backoffice realtime refresh.
- Het planbord ontvangt `planning_refresh` zonder refresh-loop; de client debouncet refreshes in `BackofficeRealtimeProvider`.
- Eerste `en_route` triggert maximaal 1 klantmail/melding.
- Tweede gekoppelde medewerker veroorzaakt geen dubbele klantmelding.

## Rollback

- Backoffice: verwijder imports en calls naar `safeRefreshPlanningRoutesForAssignment`.
- Personeels-PWA: verwijder calls naar `safelyInvalidateAssignmentRouteContexts`.
- Shared helper: `lib/db/src/planning-realtime.ts` kan blijven staan zolang hij niet wordt aangeroepen; realtime SQL-functies blijven bestaande infrastructuur.
- rollback is veilig omdat statusupdates en bestaande workflowmeldingen los staan van de route-refresh hooks.

## Verificatie

- `pnpm fieldgrid:live-day-map-phase9:check`
- `node --test tests/fieldgrid-live-day-map-phase9-realtime-status.test.mjs`
- Typecheck backoffice en personeels-PWA.
