# Huisstijl, klantbeheer en bezoekacties — review 5 oktober 2026

Deze review betreft de lokale werkboom van de klantportaalrelease. De
onderstaande controles bewijzen geen stagingdeploy of hosted configuratie.
De definitieve browser- en deploygates worden bij de release vastgelegd.

## Centrale huisstijl en backoffice

Beoordeeld: `house-style-actions.ts`, `validation.ts`, `logo-url.ts`, het
publieke logo-endpoint, `TenantBrandingSettings`, `TenantThemeProvider`,
`BackofficeLive`, de gedeelde dialogcomponent en migratie `20261005065200`.

- De server bepaalt de tenant vanuit de actuele sessie en hostname. Alleen
  `management` en `tenant_admin` kunnen bewaren; platformstatus alleen is
  onvoldoende. Het formulier accepteert geen tenant, opslagpad of extern
  logo-URL. Dubbele en onbekende velden worden geweigerd.
- Kleuren, afzender en logo worden in één voorwaardelijke update gepubliceerd.
  De bestaande `updated_at` is een monotone bronversie. Een verouderde versie
  schrijft niets; de editor behoudt het concept en vereist een bewuste keuze
  om de actuele instellingen over te nemen. Preview, annuleren en standaard
  herstellen schrijven zelf niets naar de database.
- Logo's worden op omvang, formaat, dimensies, animatie en volledige decoding
  gecontroleerd vóór de bestaande scan/opslagroute. Na de asynchrone upload
  volgt opnieuw een actuele bevoegdheidscontrole vóór metadata wordt gewijzigd.
  Mislukking of een conflict kan ongebruikte immutable bytes achterlaten, maar
  publiceert die niet als actueel logo. Historische bestanden worden niet gewist.
- Het publieke logo-endpoint levert uitsluitend een gecontroleerd huidig logo
  of een bestaand bevroren mailasset. De huidige versie krijgt `private,
  no-store`; tenantstatus en het actuele pad worden na het lezen opnieuw
  gecontroleerd. Het endpoint accepteert geen willekeurige URL of opslaglocatie.
- Realtime gebruikt alleen de bestaande tenantgebonden revisieteller. Afzender,
  dossierinhoud en brandingrijen gaan niet via dit kanaal. Een managementlid kan
  de teller ook zonder optionele modules lezen; een buitenstaander of ingetrokken
  lid niet. Reconnect, focus en een interval herstellen gemiste invalidaties.
- Themawaarden worden uit gedeelde kleurfuncties afgeleid. React-context brengt
  ze naar Radix-portals; de CSS-adapter vereist een expliciete tenantmarker en
  verandert daardoor geen platformdialogen. Het mobiele menu maakt de hoofdinhoud
  inert, begrenst toetsenbordfocus en herstelt focus bij sluiten.

## Expliciet klantaccountbeheer

Onafhankelijk beoordeeld: de management-action en invoerschema's,
`CustomerPortalAccess`, de dossierintegratie en de SQL-functies voor uitlezen
en koppelen van klantaccounts.

De exacte tenant/klant/contactcontrole gaat vooraf aan iedere globale
Auth-lookup. Een nieuwe identiteit krijgt geen wachtwoord, sessie of impliciete
rol. Bestaande identiteiten worden niet aangepast. De definitieve bind-RPC
controleert management, actief contact/klant/gebruiker en de verwachte versie;
alleen de aangevraagde accountmogelijkheden worden toegekend. Intrekken sluit
ook bestaande objectkoppelingen; heractiveren herstelt die niet automatisch.
De UI remount bij wisselen van klant, zodat een geselecteerd account of concept
niet uit het vorige dossier kan blijven staan.

De review vond dat een directe SQL-aanroep met `expected_version = NULL` de
oude vergelijkingen kon overslaan. Migratie `20261005072100` weigert ontbrekende
en negatieve versies expliciet en hercontroleert management na het wachten op
de tenantlock. De databasefixture bevat regressieasserties voor zowel een nieuw
als een bestaand account. Een mislukte definitieve bind na Auth-provisioning kan
een identiteit zonder toegekende klantrechten achterlaten; dat wordt niet als
geslaagde toegang gerapporteerd.

## Concrete bezoekverzoeken en bestanden

Beoordeeld en hersteld: `visit-detail.tsx`, de nieuwe visit-command-action en
downloadroute en migratie `20261005072000`. Het portaal ondersteunt weer
gestructureerd toevoegen, wijzigen, intrekken, gelezen markeren, bijlagen en
expliciet akkoord op een voorstel, via de bestaande Object 360 domeinfuncties.

- Iedere opdracht gebruikt het geselecteerde account, concrete bezoek, actuele
  actor en exacte bronversie. De server controleert account/contact, klant van
  het object, concrete bezoektoegang en eigendom van het verzoek opnieuw.
  Gesloten bezoeken accepteren geen nieuwe inhoudelijke opdracht.
- Opdracht-ID's zijn aan actor, account en invoer gebonden. Een herhaalde
  succesvolle opdracht heeft geen extra effect en een andere opdracht kan het
  receipt niet overnemen. De browser bewaart het opdracht-ID voor een retry,
  maar gebruikt een nieuw ID na een bevestigde nieuwe actie.
- Voorstelacceptatie vereist expliciet `true` en de exacte voorstelversie.
  Het bestaande model bepaalt de taak en status; de browser levert geen prijs
  of taakconfiguratie aan. Een dubbele acceptatie maakt geen tweede extra taak.
- Uploads hebben een serverbepaald immutable pad, een begrensd bestandstype en
  omvang, en doorlopen de bestaande scanner. De toegang wordt voor en na de
  scan opnieuw bepaald; de bind-RPC controleert verzoekversie en padprefix.
- Downloads gebruiken account én bezoek en vereisen dat het document in de
  actuele veilige bezoekprojectie staat. Na het lezen volgt dezelfde controle
  opnieuw. Andere bezoeken, accounts, objectpaden of ingetrokken toegang leveren
  geen bytes. De respons is privaat en niet cachebaar.
- Een live refresh vervangt geen open formulierconcept. Een bronconflict geeft
  een expliciete keuze om de huidige versie te gebruiken en behoudt de tekst.

## Aanvullende betaalreview

De onafhankelijke lezing van betaalvoorbereiding, providerafhandeling en
merchantconfiguratie vond een ontbrekend hervatpad voor een al lopende checkout
en een providerwijziging die de oude merchantguard kon omzeilen. Deze zijn in
de integratie verholpen. Ook de reserveringsguard voor handmatige betalingen is
beoordeeld: open betaalbundels blijven afgeschermd tegen een tussentijdse
verlaging van het restsaldo. De merchant moet expliciet actief, geverifieerd
en in de verwachte modus zijn; een afwijkend providerprofiel wordt geweigerd.

Een latere controle vond dat de factuurpagina alleen de finance-module gebruikte
om online betalen aan te bieden. Migratie `20261005075400` projecteert nu alleen
een boolean voor een actieve, geverifieerde, expliciet gekoppelde Mollie-merchant
met de toegestane sleutelreferentie en profielvorm. De route vereist zowel die
binding als finance. Zonder binding gebruikt de bestaande UI de melding dat
online betalen niet is aangesloten en schakelt betalen uit. Profiel en
sleutelreferentie komen niet in de klantprojectie. Deze configuratieboolean
bewijst geen actuele providerbeschikbaarheid of match met de serverkeymodus;
de checkout controleert beide nog steeds zelfstandig.

## Aanvullende review rapport- en betaalmeldingen

Migratie `20261005075300` is onafhankelijk gelezen op bronbevoegdheid,
ontvangerprivacy, behoud van de centrale notificatie-engine en lockvolgorde.
Een goedgekeurd rapport vereist ook `approved_at`; een betaalmelding vereist
een werkelijk betaald Mollie-attempt met passende opgeslagen providergegevens
en allocaties. Het exacte account, actieve contact, klant en alle betrokken
objectkoppelingen blijven voorwaarden. De melding gebruikt generieke tekst,
een accountgebonden portaalpad en geen interne auteur of rapportinhoud.

De bronovergang legt de toen bevoegde ontvangers vast en maakt een outboxevent.
Hij vraagt geen notificatiepolicylock aan terwijl betaling/invoice-rijen zijn
gelockt. De centrale worker neemt policylock vóór outboxlock en gebruikt daarna
de bestaande enqueue-, policy-, preference-, template-, delivery- en
provider-gates. Andere eventtypes delegeren naar de bestaande implementatie.
Oude workers zonder centrale notificatieondersteuning claimen het nieuwe
eventtype niet. Bronrechten worden vóór verwerking én aflevering opnieuw
beoordeeld, en de bron-tijd bepaalt de oorspronkelijke vervaldatum.

De review vond een ontbrekende bronmomentcontrole: uitgeschakelde e-mail kon
vóór de eerste worker alsnog worden ingeschakeld. De definitieve versie bewaart
daarom de onderdrukte kanalen plus fingerprints van toepasselijke policy- en
eigen voorkeursrevisies in dezelfde SQL-snapshot als de ontvangers. De worker
vergelijkt deze onder de policylock. Zo blijven zowel OFF→ON als ON→OFF→ON
onderdrukt; een andere gebruiker of een ongerelateerd notificatietype verandert
deze fingerprints niet. De canonieke mutaties bewaren de rijen en verhogen hun
revisie. Een SQL-naamresolutiefout in de fingerprinthelper is in de integratie
gecorrigeerd naar de expliciete functieparameter `$2`.

De rapport-/betaallifecyclefixture rapporteert **28 geslaagde controles**,
inclusief het publieke workerpad, beide voorkeursovergangen, uitsluiting van
de oude worker, idempotentie en ingetrokken toegang. De finale gelezen versie
heeft geen resterende bevinding binnen deze scope; de schone migratiereplay en
browsercontrole blijven afzonderlijke releasegates.

## Visuele review en gerichte herstelwijzigingen

De vijf klantdashboardbeelden zijn vergeleken met de daadwerkelijke
klantreferentie (`fieldgrid-klantportaal-codex-overdracht`, niet het
personeelsprototype), op 1440, 1024, 768, 390 en 320 pixels. De hiërarchie,
kleuren, kaarten, vier naar twee metrickolommen en overgang van sidebar naar
iconrail en mobiele ondernavigatie volgen de referentie. Verschillende aantallen
en lege toestanden komen uit de eigen fictieve databasefixture.

De review vond vier concrete layoutfouten, waarvoor kleine herstelwijzigingen
zijn toegevoegd:

- Op 1024px verborg `:last-child` ook het enige object in de cockpit. De selector
  begrenst nu uitsluitend kaart drie en verder. De browserloop controleert het
  bestaande object op iedere doelbreedte.
- Lange tenantnamen konden op tablet afkappen; op mobiel viel de merkpunt op
  een tweede regel. Een begrensde tekstspan kan nu afbreken op desktop/tablet
  en toont een ellipsis binnen dezelfde flexrij op mobiel.
- Bij een volle backofficenavigatie kromp het logoblok tot onder de eerste
  navigatielink. Het logoblok krimpt nu niet; de bestaande sidebar kan scrollen.
- De platformnotificatielink had geen navigatieopmaak doordat de platform-CSS
  uitsluitend buttons selecteerde. Links gebruiken nu dezelfde platformstijl.

De klantbeelden waren daarnaast genomen na automatisch scrollen naar een actie.
De screenshotloop scrollt nu aantoonbaar terug naar boven, zodat een sticky
header niet midden in een volledige paginacapture wordt afgebeeld.

De nieuwe 1440px-stijl van Object 360, de klantwizard, het klantdossier,
personeelsdossier en personeelsnummering is visueel beoordeeld en geschikt
voor baselinevernieuwing: inhoud en acties blijven aanwezig en leesbaar;
het gedeelde dialogframe, contentbreedte en focusstijl zijn beoogd.
De gerichte nieuwe beelden bevestigen de klantlayout op alle vijf breedtes,
inclusief het zichtbare object op 1024px, de mobiele merkrij en de header bovenaan.
Ook backoffice 1440px, de aanvragenpagina, klantlijst, objectwizard en Object 360
op 1440/390/320px zijn visueel goedgekeurd. De 768px-iconrail liet nog een oud
`min-width:100px` voor het logo doorwerken; de adapter zet dat nu op nul zodat
de ingestelde 60px past. De vernieuwde backoffice- en Object 360-beelden op
768px bevestigen dat het logo volledig binnen de iconrail past; beide zijn
visueel goedgekeurd. Het personeelsdossier op 390px toont alle inhoud en acties
binnen de kaartbreedte. De vaste header midden in deze elementcapture is een
captureartefact; de onderliggende dossierinhoud blijft aanwezig.

De gerichte dossierloop vond daarnaast echte horizontale overloop op 320px:
de melding over een ontbrekende accountverantwoordelijke gebruikte flex zonder
regelomloop, waardoor de knop “Klantgegevens aanvullen” tot x=329 liep.
Alleen meldingen binnen het klantdossier krijgen nu regelomloop en woordafbraak.
Een DOM-controle op de bestaande build met exact die CSS bevestigde
`scrollWidth=320`, zonder elementen buiten de viewport. De herhaalde browserloop
voor alle elf dossieronderdelen op 390 en 320px is geslaagd, samen met het
beheer-/OTP-scenario (**2/2**). Ook de nieuwe dossiercapture met vier gestapelde
overzichtskaarten op 390px is visueel goedgekeurd.

Het planbord op 1440px behoudt de beschikbare viewport, medewerkers, tijdlijn
en onderste bonnenlijst. De nieuwe 14px-invoerletter knipte nog de AM/PM-sectie
van native tijdvelden af binnen de oude 100px-breedte (mobiel 86px). De adapter
geeft uitsluitend de twee planbordtijdvelden nu 8rem breedte. De vernieuwde
planbordbeelden op 1440/1280/1920/768/375/320px zijn visueel goedgekeurd:
beide tijdwaarden zijn volledig leesbaar, de mobiele velden passen naast
elkaar, de tabletwerkbalk breekt ordelijk af en de tijdlijn en bonnenlijst
houden hun eigen scrollgebied. De bijbehorende twee gerichte browsertests
zijn geslaagd (**2/2**). De volledige browserreeks zonder snapshotupdates
blijft een afzonderlijke integratiegate.
De platformbaseline wacht op een schone fixture; tijdelijke tenants uit een
mislukte opruimactie mogen geen referentie worden.

## Uitgevoerde lokale controles

- Gerichte Vitest-run op branding, bezoekacties, bezoekdownloads, klantbeheer,
  betaalactie en merchant: **126 geslaagd** op 5 oktober 2026. Daarvan 79
  branding, 18 bezoekactie/download, 6 provisioning en 23 betaling/merchant.
  Deze tests controleren ook ingetrokken toegang tijdens asynchrone I/O,
  misvormde invoer, races, foutafhandeling en het uitblijven van neveneffecten.
- `node --test scripts/test-tenant-house-style.mjs`: **1 geslaagd**. Werkelijke
  lokale PostgreSQL-controles op bronversies, conflict, teller en RLS-revocatie.
- `node --test scripts/test-customer-portal.mjs`: **27 geslaagd**, inclusief de
  extra NULL-versieasserties uit `72100` in de finale schone databasegate.
  Onder meer accountscheiding, verzoekversies,
  gelezenstatus, intrekken, bijlagepad, ingetrokken toegang en idempotent
  voorstelakkoord. Alle testgegevens worden teruggedraaid.
- Typecheck en gerichte ESLint op de implementatie geslaagd. De volledige
  browserreeks, waaronder de bestaande Object 360-scenario's en de nieuwe
  huisstijlscenario's, wordt door de release-integratie uitgevoerd.

De finale lokale integratiegate rapporteert **398 pgTAP- en 379 Node-database-
tests**, **975 security-inventorychecks** en **1294 unittests**, alle geslaagd;
ook typecheck is groen. Dit omvat de schone migratiereeks tot en met de laatste
accountversieguard en de overige releasewijzigingen.

De eerste gecombineerde browserrun bevestigde het bewaren en het
huisstijlconflict; een testlocator matchte daarnaast Next.js' route-announcer.
De locator is nu beperkt tot de huisstijleditor. Dit is geen claim dat de
herhaalde volledige browserreeks al is geslaagd.
