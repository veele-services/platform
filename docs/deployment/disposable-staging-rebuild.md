# Disposable staging rebuild

## Besluit en scope

Op 23 september 2026 heeft de opdrachtgever expliciet bevestigd dat staging
wegwerpbaar is: huidige databasegegevens hoeven niet behouden of herstelbaar te
zijn. Deze workflow bouwt de aangewezen staging-applicatiedatabase opnieuw op
vanuit ongewijzigde, gereviewde migraties en minimale bootstrap.

Doelproject: **olyfmekyqozxrbrwwszu**. Productie is geen invoeroptie en wordt door
het verbindingscontract geweigerd. De workflow draait alleen na een handmatige
dispatch van actuele `main` binnen de beschermde GitHub environment `staging`.

De nieuwe route heeft **geen afhankelijkheid** van oude WP1 diagnose-artifacts,
backup/restore-rehearsal, een lokale PostgreSQL-kopie of de sudo sandbox-helper.
De oude workflows blijven historische/afzonderlijke instrumenten. Hun
beveiligingen en bestaande productie-/promotiegates worden niet versoepeld.
PR #531 is hiervoor niet nodig.

Dit is een **database-rebuild, geen deployment**. De workflow bouwt of promoot
geen applicatierelease. Voor en na een normale rebuild worden de fysieke
release-identiteiten van de vier draaiende applicaties gecontroleerd. Het
resultaat vermeldt de daadwerkelijk geserveerde release-SHA's. Deployment van
nieuwe applicatiecode blijft onderdeel van het bestaande releaseproces.

## Wat wordt verwijderd en wat blijft staan?

Alle Storage-objecten in het staging-project worden via de Storage API
verwijderd. Auth-gebruikers worden via de Auth Admin API verwijderd en twee
nieuwe, verschillende beheeridentiteiten worden aangemaakt. Er worden geen
uitnodigingsmails verstuurd en geen betaalprovideroperaties uitgevoerd.

Eigen applicatieobjecten in `public`, `app_private` en `drizzle` worden opnieuw
opgebouwd. `public` zelf blijft bestaan, inclusief provider-schema-ACLs,
default privileges en extension-owned objecten. Verwijderen van applicatieroutines
kan bijbehorende applicatietriggers op `auth.users` verwijderen; de gereviewde
migraties herstellen ze. Applicatiepolicies op `storage.objects` en
`storage.buckets` worden opnieuw door de migraties aangebracht.

**Niet verwijderen:** de beheerde schema's `auth`, `storage`, `realtime`,
providerrelaties/-functies, extensies, SQL-rollen, project-API-keys en provider-
configuratie. De schema-reset maakt een structurele catalogusvergelijking binnen
één transactie. Verandert beschermde infrastructuur door een onverwachte CASCADE,
dan wordt die schema-transactie teruggedraaid. Dat herstelt niet de reeds via
API verwijderde wegwerpdata.

De migratiejournal wordt volledig opnieuw opgebouwd en op bestandsnamen,
tijdstempels en SHA256-hashes gecontroleerd. Er wordt geen nieuw `db:baseline`
uitgevoerd. Historische migraties blijven byte-voor-byte intact; expliciete,
bestaande compatibiliteit in de normale migratierunner blijft van toepassing.

## Eenmalige configuratie vóór de eerste apply

De bestaande staging-geheimen voor migration admin, runtime principal,
Supabase URL, anon key, service-role key en de gepinde database-CA blijven nodig.
Migration admin en runtime blijven aparte rollen met verschillende wachtwoorden,
session-affine poort 5432 en geverifieerde TLS.

Voeg aan GitHub environment `staging` vier geheimen toe:

| Geheim | Doel |
| --- | --- |
| `FIELDGRID_REBUILD_PLATFORM_EMAIL` | Nieuwe platformbeheerder |
| `FIELDGRID_REBUILD_PLATFORM_PASSWORD` | Eigen wachtwoord van 20–128 tekens |
| `FIELDGRID_REBUILD_TENANT_EMAIL` | Nieuwe Veele-tenantbeheerder |
| `FIELDGRID_REBUILD_TENANT_PASSWORD` | Ander wachtwoord van 20–128 tekens |

Gebruik verschillende e-mailadressen én wachtwoorden. Het platform staat bewust
geen hergebruik van één identiteit voor beide beheersurfaces toe. Geheimen gaan
niet in workflow-inputs, PR-teksten, artifacts of terminaloutput. De nieuwe
accounts krijgen de bestaande `force_password_change` metadata; de workflow
registreert geen gegenereerd wachtwoord en kopieert geen oude accounts.

Controleer de vier environment-variabelen `BACKOFFICE_PUBLIC_HEALTH_URL`,
`PERSONEEL_PUBLIC_HEALTH_URL`, `KLANT_PUBLIC_HEALTH_URL` en
`API_PUBLIC_HEALTH_URL`. Gebruik de daadwerkelijke HTTPS staging-healthroutes,
bijvoorbeeld `/healthz` waar de applicatie die exposeert. Een loginpagina is geen
healthroute. Zowel staging-environment, service-identiteit als een geldige
release-SHA moeten via de bestaande `X-Fieldgrid-*` headers aanwezig zijn.

De bestaande servicevariabelen leveren de vier verplichte units en eventuele
notification-/schedulerunits. De runner controleert de bestaande exacte
`sudo -l` start/stop-rechten; hij installeert geen sudoers en vraagt geen generieke
root-, shell- of Dockerrechten. Onbekende staging-writers blokkeren preflight.

## Uitvoering

1. Merge de gereviewde PR normaal. De relevante **push-run op de nieuwe main-SHA**
   moet groen zijn voor zowel `Main Exact Head Validation` als
   `Disposable Staging Rebuild Validation`. De runner wacht maximaal twintig
   minuten op nog lopende runs en stopt als main intussen verandert. Groen op de
   oude PR-SHA is geen vervanging.
2. Kies **Fieldgrid Disposable Staging Rebuild**, branch `main`, exacte SHA,
   mode `plan`. Dit controleert configuratie, projectverbinding, provider-
   inventaris, beheerbootstrap, schrijvers en healthroutes zonder data te wissen.
   Ook plan vereist de nieuwe geheimen: ontbrekende configuratie hoort vóór,
   niet halverwege een reset zichtbaar te worden.
3. Zet externe staging-ingangen in onderhoud: eindgebruikers/directe
   Supabase-clients, nieuwe signups, webhooks, extern geplande jobs en edge-
   functies die schrijven mogen tijdens de operatie geen nieuwe data toevoegen.
   De checkbox `maintenance_confirmed` is een **operatorverklaring**, geen
   technische verificatie dat alle externe clients gestopt zijn. De workflow
   stopt de VPS-units zelf en blokkeert op actieve `cron.job`-taken.
4. Start een **nieuwe handmatige dispatch**, mode `apply`, met:
   `REBUILD:olyfmekyqozxrbrwwszu:<exacte-main-SHA>:DISCARD_DATA`.
   Vink onderhoud alleen aan nadat stap 3 werkelijk is uitgevoerd.
5. Alleen een eindstatus `rebuilt` is succes. Houd extern onderhoud actief totdat
   de resultaatcontroles en de toepasselijke applicatieacceptatie zijn bekeken.

De apply-volgorde is: preflight → writers stoppen → Storage API leegmaken →
applicatieschema resetten → Auth API leegmaken → volledige normale migratierunner →
journal-hashes → RBAC-/sectorcatalogi → twee nieuwe owners en Veele-bootstrap →
SQL/RLS-controles → echte Auth-login/Storage roundtrip → writers starten →
geïdentificeerde applicatiehealth.

Historische productiedomein-seeds worden vervangen door
`veele.staging.fieldgrid.nl` en `platform-staging.fieldgrid.nl`. De bootstrap zet
SMTP uit en herstelt actuele rollen/modules, sectorinstellingen, trial-abonnement
en onboardingstatus. Operationele klanten, medewerkers, locaties, werkbonnen,
betalingen en facturen blijven leeg. Tenant A/B-proefdata wordt uitsluitend in
een teruggedraaide testtransactie gebruikt.

## Failure en herstel

Na de eerste providerwrite wordt een duurzaam eindrapport niet als bewijs van
succes gezien voordat alle stappen zijn geslaagd. De marker
`destructiveChangesStarted` wordt vóór die eerste write opgeslagen. Bij een fout
blijven schrijvers gestopt, óók bij gedeeltelijk starten of mislukte healthchecks.
`writersHeld: null` betekent dat stoppen niet bevestigd kon worden en vereist
onmiddellijke operatorcontrole. Er is geen automatische oude-data-restore.

Een destructieve GitHub **Re-run** is expliciet verboden. Herstel begint met de
veilige oorzaakcode/phase uit `result.json`, zo nodig een gereviewde codefix en
nieuwe groene main-CI. Start vervolgens een **nieuwe dispatch** met
`recover_failed_rebuild=true` en dezelfde expliciete dataverlies-/onderhouds-
bevestiging. Alle vier core-units moeten dan reeds gestopt zijn. Hun pre-start
HTTP-health wordt als `NOT_APPLICABLE` geregistreerd, niet als geslaagd. Na de
volledige nieuwe rebuild worden de core-applicaties gestart en wordt hun echte
health alsnog verplicht geverifieerd. Optionele workers die vóór deze
herstelpoging uit stonden blijven uit; controleer hun gewenste toestand als
onderdeel van de operatorafhandeling.

SIGTERM/SIGINT stoppen lopende migratieprocessen en proberen schrijvers gestopt
te houden. Geen softwaretrap kan SIGKILL, stroomverlies of een verloren host
wegtoveren. Houd de onderhoudsblokkade actief en controleer unittoestanden na
zo'n onderbreking. Oude JWT's kunnen hun oorspronkelijke cryptografische
levensduur behouden; er worden geen oude tenant-/platformbindings behouden en
nieuwe accounts krijgen nieuwe gebruikers-ID's. Providerkeys worden niet geroteerd.

## Testbewijs en grenzen

`tests/fieldgrid-disposable-staging-rebuild.test.mjs` test veilige en onveilige
configuratie, project-/TLS-/SHA-afbakening, credentialscheiding, provider-API-
inventarisdrift, alle foutfasen van de orchestration, recovery, twee CI-gates,
journal-hashes, managed-catalog rollback, health-identiteiten en het opt-out van
ancestor `.env`-bestanden. De standaard runtime-env-loader blijft verder ongewijzigd.

De nieuwe validation-workflow gebruikt een eigen PostgreSQL 17 service op
loopback, zonder staginggeheimen. Hij voert **twee echte schema-reset/migratie/
bootstrap/RLS-cycli** uit en bewijst met sentinel-data dat de SQL-reset geen
beheerde Auth/Storage-rijen wist. Deze job gebruikt de bestaande lokale provider-
shims en hun gedocumenteerde ACLs; hij bewijst geen hosted GoTrue/Storage-runtime.
De echte apply eist daarom afzonderlijk Auth-login/session, platform-/tenant-
toegang via authenticated APIs, en private Storage upload/download/delete.

Health is geen volledige browseracceptatie. De status `rebuilt` claimt niet dat
alle schermen, een nieuwe PDF, betalingsflows, SMTP-bezorging of customer/personnel
onboarding end-to-end zijn getest. Gebruik daarvoor de bestaande applicatie-
acceptatie; deze scope wist en herbouwt de database en controleert de beschreven
infrastructuur-/toegangscontracten. Geen live apply is vanuit een featurebranch
onderdeel van CI.

Relevante providerdocumentatie:
- https://supabase.com/docs/guides/storage/schema/design
- https://supabase.com/docs/reference/javascript/auth-admin-deleteuser
- https://supabase.com/docs/reference/cli/supabase-db-reset
