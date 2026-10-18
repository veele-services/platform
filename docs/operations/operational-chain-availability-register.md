# Beschikbaarheidsregister operationele ketens

Datum: 18 oktober 2026. Onderzochte baseline:
`caf992acd9815eef2106042769387058d225e7fd`. Implementatiecommit:
`9fef4f2d`. `Lokaal getest` is geen stagingacceptatie.

| Functie | Route / ingang | Module en kernrechten | Configuratie | Bewijs-ID's | Omgeving | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Capaciteit dag/week | `/app/planning` | `planning`; `backoffice.planning.read`, `backoffice.functions.planning_capacity` | actieve tenant, tenanttijdzone | CAP-01, CAP-02, CAP-04, CAP-05 | lokale Supabase | Lokaal getest |
| Kandidaten en plannen | planborddetail | `planning`; get/change-planboardrechten | inzetfunctie en kwalificatie-eisen waar van toepassing | CAP-01–04, KWA-01–04, SEC-01 | lokale Supabase | Lokaal getest |
| Volledige vrijgave | planbord, werkbonlijst en dossier | planning write + mutate; afwijking alleen eigenaar/management | taken, tijdvak en crew | CAP-04, SEC-01, UX-01 | lokale DB + volledige browsergate | Lokaal getest |
| Kwalificatiedossier | `/app/personeel/[id]` | `personeel`; dossier read/write en verificatierechten | kwalificatietypen en eisen | KWA-01–06 | lokale Supabase | Lokaal getest |
| Kwalificatie-opvolging | `/app/opvolging` + worker | cockpitrechten; worker service role | workersecret op omgeving | KWA-05, SEC-01 | lokale Supabase | Lokaal getest |
| Materiaalcatalogus | Taken & tarieven / werkbondossier | tasks read/write; material-cataloguecommand | finance alleen voor kostprijs | MAT-01, MAT-05, SEC-01 | lokale Supabase | Lokaal getest |
| Materiaalgebruik | `/staff` werkbon en `/app/werkbonnen/[id]` | personeeluitvoering of werkbon write | actieve werkbon | MAT-01, MAT-02, MAT-06 | lokale Supabase | Lokaal getest |
| Commerciële materiaalbeoordeling | werkbondossier | finance read/write + review-materiaalrecht | afspraakbewijs, tarief, btw | MAT-02–05, SEC-01 | lokale Supabase | Lokaal getest |
| Contractreeksbeheer | werkbondossier, Terugkerend werk | work-orders read/write + series command | actieve contractregel; tenant- en reeksschakelaar | HER-01–07, SEC-01 | lokale Supabase | Lokaal getest |
| Contractworker | `/api/worker` | service-only RPC | `ADMIN_API_SECRET`; beide automationschakelaars | HER-02–07 | lokale Supabase | Lokaal getest; staging worker open |
| Verzamelfactuur | `/app/facturen?stage=concepts` | finance read/write + create execution invoice | goedgekeurde bronnen van één klant | FAC-01–06, MAT-03–04 | lokale Supabase | Lokaal getest |
| Factuurbronweergave | factuurdetail, PDF en `/klant` | finance of volledig gebonden klantcontact | toegang tot alle bronobjecten | FAC-01, FAC-04–05 | lokale tests | Lokaal getest |
| Betaalbatch | `/app/facturen` | finance + create payment bundle | geverifieerde tenant-Mollieverbinding | BET-01–07, SEC-01 | lokale providerfixtures | Lokaal getest |
| Externe checkout | `/pay/[token]` | bearer-scope; servicevoorbereiding | actieve verbinding, overeenkomend profiel en modus | BET-02–06 | lokale providerfixtures | Lokaal getest; echte Mollie open |

## Lokaal releasebewijs

- Verse installatie: `pnpm db:reset` en migratiemanifestcontrole groen.
- Database: 398 pgTAP-tests en 729 Node-integratietests groen.
- Applicatie: lint zonder fouten, typecheck, 208 Vitest-bestanden met 2.002
  tests en productiebuild groen.
- Autorisatie: 1.418 geïnventariseerde server-/RPC-oppervlakken groen.
- Browser: 135/135 Playwright-scenario's groen, met een echte lokale
  fail-closed ClamAV-socket voor uploadketens.
- Visueel: capaciteit dag/week, ingeklapte tabletweergave en vaste
  beschikbaarheid op desktop en mobiel bekeken; bewijs staat onder
  `docs/operations/evidence/2026-10-18-operational-chain`.

## Omgevingsacceptatie

- Stagingpromotie is pas toegestaan na review en groene CI van exact de
  uiteindelijke `main`-SHA.
- Health moet `environment=staging` en exact die SHA melden.
- Workeracceptatie controleert contractgeneratie en kwalificatie-opvolging met
  synthetische gegevens.
- BET-08 vereist bewuste Mollie-testmodusbetalingen voor losse factuur en batch,
  via portaal en externe link. Dit lokale register markeert die niet als live.
