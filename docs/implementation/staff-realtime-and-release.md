# Personeelsapp: realtime, tijdregistratie en release

Status: geïmplementeerd technisch contract; deploymentbewijs is SHA-gebonden
Peildatum: 2026-10-05

## Besluiten

1. **Realtime is invalidatie, geen applicatiestatus.** De personeelsbrowser en
   het planbord abonneren zich uitsluitend op dezelfde tenantgebonden
   revisierij. Na een wijziging halen zij hun eigen geautoriseerde, begrensde
   serverprojectie opnieuw op.
2. **De browser-DTO faalt gesloten.** Zowel de databaseprojectie als de strict
   Zod-parser gebruiken expliciete velden en controleren tenant-, personeel- en
   werkbonrelaties.
3. **PostgreSQL klokt het werk.** Geplande tijd is presentatie vóór start;
   reizen, werk, pauze, terugmelding en eigen stop worden server-side verwerkt.
4. **Eigen stop en gezamenlijk rapport zijn gescheiden.** Een medewerker sluit
   alleen de eigen inzet. Rapportversie, contenthash en ondertekening volgen in
   een aparte flow.
5. **Klantondertekening gebruikt exact dezelfde immutable klantkopie.** Preview,
   opgenomen bijlagen, prepare en finalize zijn gebonden aan rapport-id en
   SHA-256-contenthash.
6. **Staging gebruikt alleen expliciete promotie.** main deployt nooit
   automatisch; exact één groene main-SHA wordt fast-forward naar staging en
   doorloopt de volledige stagingworkflow.

## Realtimepad

De gedeelde datastroom voor personeelsapp en planbord is:

1. een relevante bronmutatie voert private.bump_staff_workspace_revision() uit;
2. die trigger verhoogt alleen tenant_id, revision en updated_at in
   public.staff_workspace_revisions;
3. Realtime levert die grove, tenantgefilterde wijziging aan de browser;
4. de browser gebruikt het event niet als data, maar start een verse refetch;
5. `/staff` ververst via `router.refresh()` de
   `staff_workspace(target_tenant)`-projectie; het planbord roept via zijn
   serveractie opnieuw de begrensde `get_planboard(...)`-projectie aan;
6. de consumer accepteert alleen het resultaat van die geautoriseerde
   serverprojectie. Voor `/staff` valideert `parseStaffWorkspaceProjection()`
   bovendien de volledige teruggegeven DTO voordat React haar ontvangt.

Hierdoor bevat een Realtime-payload geen adressen, persoonsgegevens,
rapporttekst, opslagpad, actor-id of financiële details. Zelfs wanneer een event
wordt gemist of dubbel wordt ontvangen, blijft de verse serverprojectie de enige
bron van waarheid.

### Revisierij en RLS

public.staff_workspace_revisions bevat één rij per tenant. Een actieve
objectsessie is altijd vereist. Lezen is daarna alleen toegestaan via een van
deze twee paden:

- actieve staff: module personeel is actief, de gebruiker heeft tenantrol
  staff en is aan een actieve eigen personeelskaart in die tenant gekoppeld;
- planning: module planning is actief en `planning_access(tenant_id)` staat de
  gebruiker voor die tenant toe.

authenticated heeft alleen SELECT; INSERT en UPDATE zijn ingetrokken. anon heeft
geen SELECT. De client filtert het kanaal bovendien op tenant_id. Dit filter is
een optimalisatie naast RLS, niet de autorisatiegrens.

De gerichte pgTAP-test bewijst dat staff en geautoriseerd planningmanagement
slechts hun tenantrevision zien, authenticated de rij niet kan muteren, anon
geen toegang heeft en elke verwachte bron een revision-trigger bezit.

### Brondekking

De revision-trigger staat op de directe bronnen én helperbronnen van
staff_workspace. Dat omvat:

- tenantinstellingen, memberships, personeel, functies, kwalificaties, depots;
- klanten, objecten, werkboncontacts, werkbonnen, assignments en dispatches;
- tijdregels, travel legs, availability, verlof en dagreviews;
- taken, taakbijdragen, taakcatalogus/-revisies en meerwerkregels/-toelatingen;
- rapportregels, bijlagen, handtekeningen, status-events, materiaal, private
  materiaalfinance en onkosten;
- aankondigingen/gelezenstatus, open diensten/interesse en personeelsdocumenten.

De trigger draait bij INSERT, UPDATE én DELETE. De repositorypublicatie levert
bewust alleen insert/update-events; een fysieke delete van een bron wordt voor
staff alsnog zichtbaar als UPDATE van de veilige revisionrij. Daardoor hoeft
geen privacyrijke deleted-row-payload te worden gepubliceerd.

De personeelsmigratie publiceert uitsluitend `staff_workspace_revisions` als
invalidatiesignaal en verwijdert `work_orders` en de overige privacyrijke
bronrelaties idempotent uit de Realtime-publicatie. Ook het planbord gebruikt
dus geen ruwe werkbonpayload meer: het ontvangt dezelfde grove revisionwijziging
en refetcht daarna zijn eigen begrensde `get_planboard`-projectie. Daardoor kan
geen van beide browsers vóór de refetch velden ontvangen die zijn
serverprojectie bewust weglaat.

## Clientgedrag

| Consumer | Event en debounce | Herstelpad | Bescherming tegen stale UI |
| --- | --- | --- | --- |
| Hoofdapp /staff | staff-workspace-{tenant}; revisionrij; 250 ms | refresh bij subscribe, online en focus; iedere 20 s zolang het document zichtbaar is | Status wordt pas current nadat nieuwe serverdata de component bereikt; timers/listeners/channel worden opgeruimd. |
| Tickets/notificaties in staff-shell | staff-route-shell-{tenant}; revisionrij; 180 ms | refresh bij subscribe, online, focus en visibilitychange; zichtbare 20 s fallback | useTransition houdt syncing actief tot de refreshtransitie klaar is; gecontroleerd profielmenu behoudt focusgedrag. |
| Planbord | planboard-live-{tenant}-{user}; dezelfde tenantgefilterde revisionrij; 180 ms | begrensde get_planboard-refetch bij subscribe, channel error/timeout, focus, visibilitychange en iedere 20 s | Monotone requestsequence verwerpt late responses. Nieuwe snapshots worden uitgesteld tijdens save, drag, detailmodal, bevestiging en scopekeuze. |

Snel opeenvolgende events worden samengevoegd. Een reconnect/subscription start
een volledige resync; focus en de zichtbare 20-secondenfallback herstellen
gemiste events. De route-shell en het planbord verversen daarnaast direct bij
visibilitychange. Geen consumer probeert te beredeneren welke bronrijen
tussentijds zijn gemist.

Bij CHANNEL_ERROR, TIMED_OUT of CLOSED toont de staff-shell connecting in plaats
van ten onrechte “bijgewerkt”. Offline toont zij offline en laat zij de laatst
bevoegd geladen snapshot staan. Er bestaat bewust geen offline mutation queue:
een actie zonder serverbevestiging moet na herstel opnieuw worden uitgevoerd.
De idempotency keys en command receipts zorgen ervoor dat een bevestigde retry
niet als tweede bedrijfsactie wordt verwerkt.

### Eventvolgorde en formulieren

De revisionwaarde is monotone invalidatie, geen eventlog dat de client hoeft af
te spelen. Een oude of dubbele callback kan daardoor hoogstens nog een verse
snapshot aanvragen en kan geen nieuwere data terugschrijven.

De hoofdapp bewaart view-, selectie- en modalstate client-side terwijl
router.refresh() serverdata vernieuwt. Rapportnotities hebben daarnaast een
expliciete dirty-state: tabwissel, sheet-close of submit kan een open concept
niet stilzwijgend verwijderen. Het planbord stelt een nieuwe snapshot uit zolang
de gebruiker een conflictgevoelige handeling uitvoert.

## Tijd- en lifecyclecontract

| Fase/actie | Serverbron en gevolg | Presentatie |
| --- | --- | --- |
| Nog niet gestart | Eigen projected_start_at/projected_end_at | Gepland begin–einde |
| Vertrekken | travel opent één authoritative time_entries-regel met kind travel | Reisstatus en reisduur uit serverdata |
| Starten | start sluit de open reisregel en opent kind work zonder overlap | Eigen actual_start_at tot nu/einde |
| Pauzeren | pause sluit werk en opent pauze; paused_at markeert toestand | Eigen werkelijk interval met status Gepauzeerd |
| Hervatten | resume sluit pauze en opent werk | Zelfde werkelijke start blijft behouden |
| Terugmelden | return vereist geldige reden en concrete toelichting; eigen open tijd sluit | Teruggemeld als read-only historie |
| Mijn inzet stoppen | stop sluit alleen eigen assignment en open tijdregel | Bevroren eigen actual_start_at/actual_end_at |
| Laatste inzet gesloten | Werkbon kan naar completed en krijgt order-actual_end_at | Collega's eigen tijden blijven ongewijzigd |
| Rapport indienen | Aparte immutable rapportversie na geldige uitvoeringsstaat | Geen wijziging van tijdregels |
| Ondertekenen | Exact rapport-id/hash; private gescande afbeelding | Geen wijziging van tijdregels |

assignmentInterval() en de urenhelpers zijn alleen presentatie. Zij schrijven
geen browserklok terug. De server gebruikt clock_timestamp() en verifieert
assignment, status, versie en sessie.

### Urencorrectie en herbevestiging

Een medewerker schrijft een gesloten tijdregel nooit rechtstreeks om.
`staff_request_time_correction` bewaart de volledige oorspronkelijke
bronsnapshot en versie, de dagstatus, de reden en het exact gewenste interval.
Het pending verzoek verschijnt vervolgens in het personeelsdossier van die
medewerker. Alleen tenant admin, management of HR kan het daar via
`review_staff_time_correction` beoordelen; authenticated gebruikers hebben
geen rechtstreeks UPDATE-recht op de reviewtabel.

Approve vergrendelt verzoek, tijdregel en dagstaat onder dezelfde daglock en
controleert requestversie, bronversie en -velden, lokale daggrens en overlap met
andere registraties opnieuw. Alleen bij een exacte match worden begin en einde
atomisch vervangen. Was de dag al confirmed of correction_requested, dan wordt
zij closed met een nieuwe versie en moet de medewerker haar daarna expliciet
herbevestigen. Reject vereist een toelichting en wijzigt de bronregel en
dagstaat niet. Beide uitkomsten leggen reviewer, tijdstip, before/after-snapshot
en actie vast in audit_events. Een stale request, gewijzigde bron of overlap
rolt de volledige beoordeling terug.

### Geen geïnferreerde payroll

Week- en dagtotalen tellen alleen bestaande work-, travel-, break- en
other-regels. De app creëert geen betaalde “overige” regels om gaten tussen een
rooster en registraties op te vullen. Zij claimt ook geen loonrecht: de UI noemt
dit **geregistreerde tijd**. Een payroll- of CAO-bron kan later een apart,
expliciet contract toevoegen; dat wordt hier niet afgeleid.

## Rapport-, hash- en ondertekencontract

### Rapportnotities en scannerbevestigde bijlagen

Het aanmaken van een rapportnotitie met bijlagen gebruikt één stabiele
clientmutatiesleutel. Iedere bijlage krijgt daaronder een deterministisch id en
opslagpad. `staff_report_upload_allowed` is alleen een actuele, read-only
autorisatiecheck voor server-side scannen en publiceren; zij maakt nog geen
rapport- of bijlagemetadata zichtbaar.

Na het scannen voert `staff_finalize_report_entry` de enige staff-creategrens
uit. De RPC controleert opnieuw de actieve eigen opdracht, modules, invoer en
deterministische paden. Voor iedere bijlage vereist zij bovendien een
scannerreceipt dat exact is gebonden aan de actuele storage-objectversie,
MIME-type, grootte en SHA-256. Pas daarna worden de rapportregel, alle
bijlagemetadata, het auditevent en de command receipt in één
databasetransactie vastgelegd. Een fout laat daardoor geen zichtbare halve
rapportregel achter. Een retry met dezelfde invoer retourneert dezelfde receipt;
hergebruik van de sleutel met gewijzigde invoer faalt gesloten. Alleen
niet-gecommitte gestagede bytes komen in aanmerking voor best-effort cleanup.

Rechtstreekse staff-inserts op `report_entries` en `attachments` zijn niet de
creategrens. Wijzigen en soft-deleten blijven afzonderlijke versioned
staffcommando's, zolang de canonieke rapportstatus dat toestaat.

submit_work_order_report maakt een immutable snapshot met klant-/objectgegevens,
resultaten, customer-visible notities, checklists, materialen, onkosten en
bijlagen. De exacte snapshottekst bepaalt content_hash. Een rapportversie wordt
niet uit het actuele React-scherm gereconstrueerd.

Voor een klantondertekening voert staff_report_signature_preview alle volgende
controles opnieuw uit:

- personeel, planning en rapportage zijn geautoriseerd;
- de rapportversie is de actuele work-order-versie;
- state is waiting_signature of review en de policy is niet none;
- expected_content_hash is syntactisch geldig, gelijk aan de opgeslagen hash en
  gelijk aan een nieuwe SHA-256 over de immutable snapshot;
- de gebruiker heeft een geldige execution session en niet-teruggemelde eigen
  assignment;
- er bestaat nog geen actieve klantondertekening;
- private.customer_signature_snapshot accepteert uitsluitend het bekende schema.

De preview krijgt projection customer_copy. De UI rendert dit document en de
opgenomen bijlagen vóór de bevestigingscheckbox en canvas beschikbaar zijn.
staff_report_signature_preview_file geeft alleen een asset terug die in exact
die snapshot/hash staat; een interne of later toegevoegde bijlage faalt
gesloten. prepare_work_order_signature herhaalt de schema-, hash- en actuele
autorisatiecontrole voordat een intent wordt gemaakt. finalize koppelt de
gescande PNG en imagehash aan die intent.

staff_report_customer_absent is een afzonderlijk pad. Het vereist
waiting_signature, exact rapport/hash en een reden van 3–1000 tekens. Het maakt
hoogstens één rapportgebonden uitzondering, zet de opvolgstatus en bewaart een
idempotent command receipt. De generieke uitzonderingactie accepteert deze kind
niet, zodat de hashbinding niet kan worden omzeild.

### Meerwerk en klantzichtbaarheid

Een vrije personeelsaanvraag wordt als awaiting_review-taak met een werkelijke
duur en commercieel unit_price_cents = 0 opgeslagen. De reden blijft intern
binnen de toegewezen werkbon; alleen de maker ziet het optionele
voorstelbedrag in de staff-DTO. Een niet-goedgekeurd voorstelbedrag wordt niet
in de customer_copy opgenomen en wordt dus niet “per ongeluk” door de klant
ondertekend.

De gewone staffweergave van een gezamenlijk rapport blijft own_contribution.
Historische expense-ownership wordt niet geraden; onbekende onkosten worden daar
weggelaten. De aparte customer_copy toont daarentegen alle velden die in de
immutable customer-visible snapshot horen, inclusief customer-visible onkosten.

## Migratie en compatibiliteit

De implementatie staat in de forward-only migratie
20261004220000_staff_personnel_app.sql, na
20261004164500_fix_ticket_claim_guards.sql. Zij bevat onder meer:

- personeelsprofiel-, vervoer-, beschikbaarheids-, onboarding- en
  notificatievelden;
- leave-entitlement/request-, day-review-, tijdcorrectie-, expense- en
  command-receipttabellen en policies, inclusief snapshotgedreven
  managementreview en expliciete herbevestiging na goedkeuring;
- guarded staff-RPC's met optimistic concurrency en audit;
- lifecycle-uitbreidingen voor travel, pause/resume, return en eigen stop;
- de bounded staff_workspace-projectie en strict gevalideerde browser-DTO;
- coarse staff realtime revision en brontriggers;
- immutable customer preview, veilige previewbestanden en klant-afwezigflow.
- server-side module-/rolguards voor open diensten en taakuitvoering, met de
  oude onversioneerde taakcompletion ingetrokken voor authenticated;
- atomische, idempotente rapportregel-/bijlagefinalisatie met stabiele
  clientmutatiesleutel en scannerreceipts die aan de actuele objectversies zijn
  gebonden.

scripts/migration-manifest.json bevat deze migratie met de statementhash van de
actuele SQL. lib/database.types.ts is opnieuw tegen het lokale gemigreerde
schema gegenereerd. pnpm db:reset en de complete lokale pgTAP-suite zijn na deze
wijzigingen geslaagd. Wijziging van de migratie vereist daardoor ook opnieuw
types genereren, manifesthash verifiëren en de databaseproeven herhalen.

## Release naar staging

De canonieke flow uit docs/architecture/staging.md blijft ongewijzigd:

1. de featurecommit wordt gereviewd en in main opgenomen;
2. de volledige verificatie moet groen zijn voor exact die main-SHA;
3. staging wordt bewust fast-forward naar precies die SHA;
4. de push op staging start deploy-staging.yml; main zelf deployt nooit;
5. verify en host-preflight moeten slagen vóór backup of migratie;
6. prepare bouwt de exacte release, verpakt haar, maakt een gevalideerde
   pre-migratiebackup, voert alleen forward-only migraties uit en verifieert de
   volledige statementgeschiedenis;
7. runtime en backup verlaten de hosted runner alleen versleuteld, samen met de
   geattesteerde immutable release;
8. de vaste rootbroker activeert één keer; worker-acceptance en publieke
   acceptance verifiëren daarna de geïnstalleerde release;
9. /api/healthz moet HTTP 200, status ok, environment staging en exact de
   gepromoveerde Git-SHA melden.

De personeelscode of dit document kan geen deployment claimen. Het betrouwbare
releasebewijs bestaat uit de groene staging-workflow/run-id én de publieke
healthresponse voor dezelfde SHA.

## Rollback- en herstelgedrag

Voor de migratie wordt bij iedere verify-, preflight-, build-, package- of
backupfout niets aan database of actieve release veranderd.

Na een geslaagde forward-only migratie wordt niet automatisch een oude
applicatiesymlink teruggezet. Oudere code is niet automatisch compatibel met de
nieuwe policies, RPC's en rapportintegriteit. De veilige route is verdere
acceptatie stoppen, de kandidaat diagnosticeren en een gereviewde forward fix
met een nieuwe exact-SHA-promotie leveren. Een oudere release mag alleen terug
als haar compatibiliteit met het huidige schema expliciet is bewezen.

De versleutelde pre-migratiebackup is noodherstelbewijs, geen automatische
rollbackknop. Restore is een bewuste operatorhandeling met maintenance en
beoordeling van writes sinds de backup. De migratie heeft geen downmigratie;
realtime-triggers, policies of rapportfuncties mogen niet los als snelle fix
worden verwijderd.

## Verificatiebewijs op de implementatiewerkboom

| Controle | Vastgesteld resultaat | Reikwijdte |
| --- | --- | --- |
| pnpm db:reset | Geslaagd | Schone migratievolgorde en gegenereerd lokaal schema |
| Gerichte staff pgTAP | 138/138 geslaagd op 2026-10-05 | RLS/projectie, hervatbare onboarding, verlof/dagen, urencorrectieaanvraag en managementreview met autorisatie/concurrency/audit/herbevestiging, lifecycle, travel, return, kosten/meerwerk, hashpreview, preview-assets, klant-afwezig en revision-triggerdekking |
| Volledige lokale pgTAP | 398/398 geslaagd | Databasebrede regressiedekking |
| Volledige Vitest | 821/821 geslaagd in 101 bestanden op 2026-10-05 | Tijd/DST, fail-closed DTO, uploadpreflight, routeherstel en PDF/previewpariteit |
| pnpm typecheck | Geslaagd | Actuele TypeScript- en databasecontracten |
| Volledige ESLint | Geslaagd | Definitieve implementatiewerkboom |
| HTTP/security | 10/10 geslaagd | Echte Auth, Storage, minimaal Realtime-event en ClamAV; ingetrokken sessie/binding weigert toegang |
| Playwright-scenario planner → staff | Lokaal geslaagd op 2026-10-05 | Wijzigt in een plannersessie de tijd en verwacht binnen 8 s de nieuwe stafftijd zonder reload; bewaart een window-sentinel om paginanavigatie uit te sluiten |
| Playwright onboarding/responsive | Lokaal geslaagd op 2026-10-05 | Resume na reload, complete flow, herhaalde beschikbaarheidswijziging, 320/390/768/1440, modal-focustrapping en overflow |

De browserregels hierboven beschrijven lokale testuitvoering; pas de groene CI
voor de uiteindelijke SHA maakt er releasebewijs van. De stagingstatus hoort
daarom niet als handmatig GO/NO-GO-vinkje in dit document, maar volgt uit de
branchpromotie, workflow en exacte health-SHA.
