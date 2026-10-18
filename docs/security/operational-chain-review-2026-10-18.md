# Autorisatiebeoordeling operationele ketens — 18 oktober 2026

Deze beoordeling hoort bij implementatiecommit `9fef4f2d` en de aanvullende
hardening op pull request 595. De onderzochte baseline is
`caf992acd9815eef2106042769387058d225e7fd`. De structurele inventaris groeit
van 1.418 naar 1.456 oppervlakken. Er zijn 86 nieuwe of inhoudelijk gewijzigde
fingerprints: 13 code-ingangen, 18 tabellen, 53 functies en twee operationele
bestanden. De vervangen tweeargumentvariant van `prepare_provider_payment` is
verwijderd; alleen de hieronder beoordeelde servicevariant met verwacht
merchantprofiel blijft over.

## Planning en kwalificaties

`private.personnel_fit` is de enige beslisresolver voor planbordkandidaten,
capaciteit, open diensten, interesse en de uiteindelijke planning. De functie
heeft geen clientgrant. Publieke leesfuncties eisen de bestaande actieve
tenantcontext, module- en functierechten. Mutaties voeren dezelfde resolver
opnieuw uit onder de bestaande work-order- en assignmentlocks, versiecontrole
en idempotencybewijzen. Legacywrappers zijn bereikbaar gemaakt voor bestaande
SQL-aanroepen, maar hebben geen grant voor anon, authenticated of service-role.

Harde afwezigheid, overlap en ontbrekende harde kwalificaties blijven blokkeren.
Onbekende beschikbaarheid kan alleen per concrete inzet worden bevestigd met
een opgeslagen reden. Vrijgave controleert die reden en volledige tijdvakdekking
opnieuw; een preview of oudere bevestiging verleent geen recht. De personeelsfit
geeft alleen zakelijke matchredenen terug en projecteert geen privé-adres,
medische reden, bewijsbestand, salaris of HR-notitie.

Kwalificatie-eisen worden tenantgebonden gevalideerd voor functie, klant, object,
werkbon, dienst en concrete taakrevisie. Bewijs blijft in de bestaande dossier-
en verificatieketen. Nieuwe opvolgtabellen staan in `private`, hebben geforceerde
RLS en geen directe client- of service-rolegrants. Queuehelpers en triggers zijn
alleen intern uitvoerbaar; de workerprocessor is uitsluitend voor service-role.
De bestaande authenticated catalogusopdracht bewaakt managementlidmaatschap,
module, concrete functierechten, payload, tenant en idempotency.

Bewijs: `scripts/test-planboard.mjs`, `scripts/test-operational-chain.mjs`,
`supabase/tests/database/planning.sql`,
`supabase/tests/database/personnel_dossier.sql`,
`tests/e2e/planboard.spec.ts`, `tests/e2e/staff-availability.spec.ts` en
`tests/e2e/work-order-release.spec.ts`.

## Materialen en rapportbewijs

De materiaalcatalogus en verbruikstabel hebben geen directe anon- of
authenticated-CRUD. Commerciële status, kostprijs en reviewmetadata staan in
private tabellen met geforceerde RLS en zonder client- of service-rolegrants.
Backofficeopdrachten vereisen de bestaande taken- of financemodule plus de
concrete managementfunctie. De personeelsprojectie vereist een eigen actieve
personeelsbinding en geeft geen kostprijs, interne commerciële afweging of
afspraakbewijs terug.

Catalogusgegevens worden bij verbruik als immutable snapshot vastgelegd.
Rapportguards beschermen klantzichtbaar bewijs en de typed factuurbron bewaakt
dezelfde goedgekeurde hoeveelheid, prijs, btw en bronidentiteit. De private
prijsvoorsteltrigger had tijdens de structurele review aanvankelijk PostgreSQLs
standaard `EXECUTE`-recht. Dit is vóór het vastleggen van de inventaris hersteld:
public, anon, authenticated en service-role zijn expliciet ingetrokken; alleen
PostgreSQL mag de triggerfunctie uitvoeren.

Bewijs: `scripts/test-operational-chain.mjs`,
`scripts/test-work-order-reports.mjs`, `scripts/test-source-invoice-list.mjs`,
`tests/e2e/work-orders.spec.ts` en de negatieve grantasserties uit de schone
database-replay.

## Contractreeksen en opvolging

Reeksmutaties blijven achter tenantmanagement, planningmodule, concrete
functierechten, actuele versie en command-ID. Interne generatiehelpers,
indexatieherbinding, recurrencevalidatie en foutregistratie hebben geen
clientgrant. De contractworker accepteert alleen service-role, verwerkt alleen
actieve tenants met beide expliciete automationschakelaars en maakt uitsluitend
conceptwerk. Voorkeursmedewerkers zijn geen automatische plaatsing en worden bij
iedere generatie opnieuw door de personeelsfit beoordeeld.

De datum-effectieve contractregel wordt onder lock gekozen. Replays bewaren
dezelfde occurrence-identiteit; een gedeeltelijke fout komt in het private
foutregister en verleent geen extra toegang. Workerroute en worker-RPC delen de
bestaande serversecret-/servicegrens; authenticated gebruikers kunnen de
processoren niet rechtstreeks uitvoeren.

Bewijs: `scripts/test-operational-chain.mjs`,
`scripts/test-operational-chain-upgrade.mjs`,
`lib/work-orders/recurrence.test.ts` en `app/(workspace)/api/worker/route.ts`.

## Facturen en betalingen

Factuurconcepten gebruiken typed taak-, materiaal- en meerwerkbronnen. De bron-
en receiptguards binden tenant, actor, request-ID, bronversie, prijs en
hoeveelheid. Financeacties controleren de actuele sessie, tenant, module en
concrete functierechten vóór en na bestands- of providerwerk. Serverfilters
werken vóór paginering en kunnen geen object of contract uit een andere tenant
selecteren. Klantfacturen vereisen de bestaande actieve klantbinding en toegang
tot alle bronobjecten; gegroepeerde broncontext voegt geen nieuw dossierrecht toe.

Een betaalbatch ontstaat atomair onder tenant-/actor-/requestlock. De
receiptstabel is private en direct ontoegankelijk. `create_payment_bundle` is
alleen authenticated beschikbaar via de bestaande finance- en functierechten.
`prepare_provider_payment` is alleen service-role beschikbaar en vereist zowel
de verwachte test/live-modus als het geverifieerde tenantmerchantprofiel. De
API-route haalt dat profiel uit de bestaande tenantverbinding en hercontroleert
het na claim/provider-I/O. De oude tweeargumentfunctie is verwijderd, zodat er
geen profielvrije terugvalroute overblijft. Allocaties tonen pogingstatus en
worden pas na een bevestigde provideruitkomst als betaling verwerkt.

Bewijs: `scripts/test-payment-security.mjs`,
`scripts/test-customer-payments.mjs`, `scripts/test-source-invoice-list.mjs`,
`lib/payments/access.test.ts`, `lib/finance/service-permissions.test.ts`,
`tests/e2e/dossier-alignment.spec.ts` en de lokale Mollie-providerfixtures.

## Code-ingangen en operationele bestanden

De gewijzigde routes en serveracties behouden `getAuthContext`, hostnamegebonden
tenantselectie en de bestaande Supabase-JWT. Browsers leveren geen actor,
tenantrol, merchantprofiel of workersecret als autoriteitsbron. Clientcomponenten
gebruiken serveracties voor mutaties; hun Supabaseclient dient alleen de bestaande
realtimeverversing. `package.json` voegt uitsluitend lokale regressiescripts toe.
Het migratiemanifest bevat na een schone replay alleen de nieuwe statementhash;
er is geen provider-, secret-, deploy- of runtimeconfiguratie toegevoegd.

## Uitgevoerde hercontrole

- Schone replay van alle 179 migraties en voorwaartse upgrade met bestaande IDs,
  historie en gesloten defaults.
- 398 pgTAP-asserties en 730 Node-database-integratietests.
- 2.002 Vitest-tests, lint, typecheck en productiebuild.
- 135/135 browsertests met echte lokale database, Auth, Storage, Realtime en
  ClamAV-fixture.
- Gerichte planningregressie 12/12, inclusief vrijgaveweigering zonder geldige
  beschikbaarheidsreden.
- Structurele autorisatie-inventaris en alle 1.456 fingerprintgebonden
  reviewregels opnieuw gevalideerd na de triggerhardening.

Deze lokale beoordeling is geen stagingacceptatie. De echte Mollie-testbetaling
blijft BET-08 en vereist de bewust gepromoveerde, gereviewde `main`-SHA.
