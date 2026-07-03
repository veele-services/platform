# Fieldgrid sprint 6 - Portal acceptance en host-bound flows

Datum: 2026-07-04
Status: geleverd als uitvoerbare portal-acceptance harness. Live browser-smokes blijven Sprint 15; deze sprint verandert geen runtime en raakt stagingdata niet.

## Doel

Sprint 6 vertaalt het originele Veele Portaal-doel naar concrete, uitvoerbare acceptatiecases voor backoffice, klantportaal en personeelsapp. De cases sluiten aan op de Tenant A/B/Veele fixtures en Sprint 5 security proof.

De harness schrijft niet naar de database en start geen browser. Elke case is wel expliciet gemarkeerd als Playwright-promotable, zodat Sprint 15 dezelfde matrix live tegen staging kan draaien.

## Geleverde onderdelen

- `tests/fixtures/fieldgrid-sprint-6-portal-acceptance.mjs`: portal-acceptance manifest en beslisfuncties.
- `tests/fieldgrid-sprint-6-portal-acceptance.test.mjs`: Node-testdekking voor host, klantportaal, personeelsapp en planning-refresh.
- `scripts/fieldgrid-sprint6-portal-acceptance.mjs`: CLI-runner met `--check` en `--json`.
- `package.json`: scripts `fieldgrid:sprint6-portal-acceptance` en `fieldgrid:sprint6-portal-acceptance:check`.

## Bewezen flows

| Surface | Happy path | Denial path |
| --- | --- | --- |
| Backoffice | Tenant A dashboard opent host-bound. | Unknown host faalt; tenant switcher kan hostcontext niet overrulen. |
| Klantportaal | Tenant A klant ziet eigen documenten, facturen, rapporten en tickets. | Verkeerde host faalt; module-off documenten faalt server-side. |
| Personeelsapp | Tenant A personeel ziet eigen opdrachten, media en notificaties. | Verkeerde host faalt; module-off personeelsapp faalt server-side. |
| Planning/Home | Huidige/eerstvolgende dienst verschuift bij minuutrefresh en accepteert realtime assignment events. | Geen planning snapshot wanneer personeelsapp-module uit staat. |

## Test-id dekking

Sprint 6 dekt minimaal:

- `FG-HOST-002`, `FG-HOST-003`, `FG-HOST-004`
- `FG-PORTAL-C-001` t/m `FG-PORTAL-C-004`
- `FG-PORTAL-P-001` t/m `FG-PORTAL-P-005`

Extra case:

- `FG-PORTAL-P-005B`: realtime `assignment.updated` event raakt de zichtbare planning snapshot.
- `FG-PORTAL-P-005C`: planning snapshot wordt niet getoond wanneer `personnel_app` uit staat.

## Runner

Gebruik:

```bash
pnpm fieldgrid:sprint6-portal-acceptance
pnpm fieldgrid:sprint6-portal-acceptance:check
node scripts/fieldgrid-sprint6-portal-acceptance.mjs --json
```

## Stagingcontinuiteit

Deze sprint bevat geen migraties, geen runtime-schemawijzigingen en geen databasewrites. De proof-suite is fixture-driven en read-only.

## Grenzen van deze sprint

Nog open voor latere sprints:

- Live Playwright-run tegen staging met echte login en screenshots: Sprint 15.
- DB/RLS-bewijs voor klant- en personeelsportalqueries: Sprint 8/10 waar tenantdata en audit geraakt worden.
- Echte Supabase Storage signed-url en path-guessing tests: Sprint 9.
- Security dashboard voor portal-denials en downloads: Sprint 10.

## Acceptatie voor vervolg-PR's

Elke portal-, PWA-, planning-, notificatie-, document-, invoice-, ticket-, report- of mediawijziging moet verwijzen naar de relevante Sprint 6 cases en waar mogelijk een echte integration of Playwright test toevoegen.