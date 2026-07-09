# Fieldgrid live dagkaart - fase 1 baseline

## Doel

Fase 1 legt een harde nulmeting vast voordat route-, kaart- of ETA-functionaliteit wordt toegevoegd. Deze fase verandert geen bestaande runtime UI en voert geen datamutaties uit.

## Feature flag

- Key: `planning_day_map_enabled`
- Server env: `FIELDGRID_PLANNING_DAY_MAP_ENABLED`
- Default: uit (`false`)
- Bestand: `artifacts/backoffice/src/lib/planning/day-map-feature.ts`
- De flag is server-only en gebruikt geen `NEXT_PUBLIC` variabele.

De kaart mag in latere fases alleen zichtbaar worden wanneer deze flag expliciet aan staat.

## Planningroutes

Bestaande planningviews blijven de baseline:

- Bord: `/planning?date=YYYY-MM-DD`
- Dag: `/planning?day=YYYY-MM-DD`
- Maand: `/planning?month=YYYY-MM`

Belangrijke bestanden:

- `artifacts/backoffice/src/app/(dashboard)/planning/page.tsx`
- `artifacts/backoffice/src/components/assignments/PlanningBoardView.tsx`
- `artifacts/backoffice/src/components/assignments/PlanningDayView.tsx`
- `artifacts/backoffice/src/components/assignments/PlanningMonthView.tsx`
- `artifacts/backoffice/src/app/actions/planning.ts`
- `artifacts/backoffice/src/app/actions/assignments.ts`

Toegang blijft:

- `planning:read` voor bekijken;
- `planning:write` voor plannen/wijzigen.

## Statusflow baseline

De routekaart mag bestaande opdrachtstatussen niet wijzigen. De baseline staat in:

- `lib/db/src/schema/assignments.ts`
- `artifacts/backoffice/src/lib/process-status.ts`

Kritieke statussen:

- `scheduled`
- `seen`
- `en_route`
- `in_progress`
- `not_completed`
- `completed`

Kritieke transities:

- `scheduled` -> `seen`, `en_route`, `in_progress`, `plannable`
- `seen` -> `en_route`, `in_progress`, `scheduled`
- `en_route` -> `in_progress`, `scheduled`
- `in_progress` -> `completed`, `not_completed`
- `completed` -> `report_submitted`

Kritieke labels:

- `en_route` blijft "Onderweg"
- `in_progress` blijft "In uitvoering"
- `completed` blijft "Afgerond"

## Personeels-PWA statusacties

Bestand:

- `artifacts/personeel-pwa/src/actions/assignments.ts`

Baseline:

- `markAssignmentEnRoute` roept `setAssignmentStatus(assignmentId, "en_route")` aan.
- Bij `en_route` wordt `enRouteAt` gevuld wanneer die nog leeg is.
- De klantnotificatie `assignment_en_route` wordt alleen gestuurd wanneer `firstEnRouteTrigger` waar is.
- De check op `isNull(assignmentsTable.enRouteAt)` voorkomt dubbele "Onderweg"-klantmeldingen bij meerdere gekoppelde personeelsleden.

## Testfixture

Fixture:

- `tests/fixtures/fieldgrid-live-day-map-baseline.mjs`

De fixture bevat:

- een tenant;
- een klant;
- een object;
- een personeelslid;
- vier werkbonnen met statussen `scheduled`, `en_route`, `in_progress` en `completed`;
- personeels-koppelingen per werkbon;
- geplande datum/start/eindtijd per werkbon.

Deze fixture is bewust statisch en raakt geen database.

## Regressiegate

Command:

```bash
pnpm fieldgrid:live-day-map-phase1:check
```

De gate controleert:

- feature flag bestaat en staat default uit;
- feature flag gebruikt geen public client env var;
- bord/dag/maand planninglinks en componenten bestaan;
- statuslijst en kritieke transities zijn intact;
- personeels-PWA `Onderweg`-flow stuurt klantmelding eenmalig;
- baseline fixture bevat tenant, klant, object, personeel, planning en kritieke statussen.

## Geen runtime UI gewijzigd

Deze fase voegt geen kaarttab, kaartcomponent, routeprovider, geocoding, databasetabel of planningmutatie toe. Bestaande gebruikers zien geen verschil.
