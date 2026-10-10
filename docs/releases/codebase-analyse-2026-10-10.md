# Fieldgrid — codebaseanalyse, 10 oktober 2026

## Afbakening en productstand

Deze analyse omvat de applicatieroutes, domeinmodules, gegevensprojecties,
autorisatie, migraties, provideradapters, gedeelde UI, testinrichting en
releaseautomatisering. De uitgangsbasis is main
`6658383ba86d737b7fcba7d0ba8bf725e2bc3d92`; de kennisbank wordt toegevoegd in
**1.1.0-rc.2**. Definitieve test- en deploymentbewijzen staan afzonderlijk in
[het opleververslag](kennisbank-oplevering.md). Bronaanwezigheid is geen bewijs
dat een externe koppeling bij iedere tenant actief is.

De eerdere [1.0.0-analyse](fieldgrid-1.0.0-codebase-analyse.md) blijft het bewijs
voor de vrijgegeven productiebaseline. Productbeheer en de kennisbank behoren
tot de 1.1.0-kandidaten. Deze opdracht promoveert de kandidaat naar staging;
een productievrijgave blijft een afzonderlijke stap in het bestaande versiebeleid.

Fieldgrid bevat vier geïntegreerde werkruimtes: platformbeheer, tenantbackoffice,
personeel en klanten. De operationele keten is daadwerkelijk gekoppeld: aanvraag,
offerte, werkbon, planning, uitvoering, rapportcontrole, factuur en betaling.
Klanten, objecten en medewerkers hebben dossiers; tickets hebben afzonderlijke
gesprekspublieken. De nieuwe kennisbank legt deze handelingen uit binnen de
werkruimte waarin de gebruiker ze uitvoert.

## Technische opbouw

De vastgelegde stack gebruikt Next.js 16.3.8, React 19.2.6, TypeScript 5.9.3,
Node.js vanaf 24 en pnpm 11.25.0. Supabase verzorgt Auth, PostgreSQL, private
Storage en Realtime. Eén applicatie bedient de vier portalen. Shared components
onder `components/fieldgrid` leveren paginakoppen, aangesloten tabs, modals,
actieknoppen, overlays, lege resultaten, paginatie en tenantbranding.

De nieuwe broninventaris bevat 72 `page.tsx`-routes en 42 `route.ts`-handlers;
tabbladen en views leveren meer schermen dan deze aantallen. Er zijn 138
voorwaartse migraties. Tests bestaan uit 190 unitbestanden en 47
browserspecificaties. Aantallen beschrijven de broninventaris, geen onafhankelijke
functies of resultaatgarantie. De 136 historische migratiehashes worden behouden;
de twee kennisbankmigraties worden pas na schone replay toegevoegd.

`lib` verdeelt de domeinen in Auth/tenancy, management/platform, klanten/objecten/
personeel, commercial/work-orders/planning/travel, finance/payments, files,
tickets/notifications/communications, product en knowledge. Serveracties en
DTO-schema's begrenzen de input. SQL/RPC-contracten controleren bedrijfsregels,
actuele rechten, revisies en herhaalde opdrachten. De UI is geen rechtenbewijs.

Een tenant volgt uitsluitend een geregistreerde actieve hostname. Een onbekende
of inactieve host valt nooit terug op een andere tenant. Platformbeheer staat
onder `/platform`; tenantwerkruimtes onder `/app`, `/staff` en `/klant`.
Staging en productie hebben afzonderlijke Supabase- en providerconfiguratie,
maar delen momenteel een VPS en scannervoorziening. Dat is gegevensisolatie,
geen onafhankelijkheid bij uitval van die host.

Bronnen: [package](../../package.json), [routes](../../app),
[domeinen](../../lib), [hostnamegrens](../../proxy.ts),
[staging](../architecture/staging.md), [productie](../architecture/production.md).

## Platformbeheer: Fieldgrid bedienen

| Onderdeel | Beschikbare bediening | Aandachtspunt |
| --- | --- | --- |
| Cockpit | Tenantstatus, personeel, uitnodigingen, portalen, templates en supportaandacht | Geen volledig infrastructuur- of providerincidentdashboard |
| Tenants | Zoekbare lijst, details, onboarding, huisstijl, modules en afzender | Een module aanzetten geeft nog geen gebruikersbinding |
| Eigen appdomeinen | Omgevinggebonden registreren, verifiëren en activeren | DNS, Caddy/TLS en Auth-origin vereisen afzonderlijk bewijs |
| Supportdesk | Queues, prioriteit, behandelaar, termijnen, antwoord, notitie en afhandeling | Geen onbeperkte toegang tot bron­dossiers |
| Supportteam | Uitnodigen, OTP, tenantbereik, profiel, intrekken en activiteit | Vaste supportbevoegdheden; geen vrije platformrolleneditor |
| Notificaties | Inbox, voorkeuren en beheer naar actuele rechten | Geen automatisch extern bericht door productpublicatie |
| Productbeheer | Tenantideeën, interne beoordeling, roadmap, releases en doelgroepvoorbeeld | Beschikbaarheid/planning worden bewust handmatig onderhouden |
| Kennisbank | Volledige centrale redactie voor vier werkruimtes | Alleen platformadmin schrijft; support leest en deelt |

Een platformsupportprofiel biedt lezen, antwoorden, interne Fieldgrid-notities
en afhandelen, binnen het ingestelde tenantbereik. Het maakt de medewerker geen
tenantlid of platformbeheerder. Teamwijzigingen vereisen een daadwerkelijke
recente OTP-verificatie; tokenverversing telt niet als nieuwe login. Intrekking
wordt in een bestaande sessie opnieuw gecontroleerd.

Productbeheer bewaart tenantideeën privé per tenant, met aparte interne notities
en tenantreacties. Roadmap en releaseberichten hebben concepten, doelgroepkeuze,
ontvangersvoorbeelden, publicatie en archivering. Optionele in-appmeldingen
gebruiken de bestaande notificatiegrenzen. Productbeheer verandert geen
featureflags of deploymentstatus; een geplande ontwikkeling is geen beschikbare
functie. Er is geen openbare roadmap of tenantoverstijgende discussie.

Bronnen: [platformdata](../../lib/platform/data.ts),
[supportteam](../../lib/platform/team.ts), [productcontract](../architecture/product-management.md).

## Tenantbackoffice: dagelijkse bedrijfsvoering

**Relaties en locaties.** Klant 360 verbindt klant/contacten, financiële gegevens,
documenten, notities, historie, afspraken en gerelateerde dossiers. Object 360
voegt locaties, ruimtes, contacten, programma's, instructies, documentversies,
kwaliteit en concrete bezoekaanvragen toe. Personeel 360 bevat onboarding,
uitnodigingen, functies, kwalificaties, nummering, beschikbaarheid, verlof,
contractregistraties, taken en documenten. Vertrouwelijke HR-gesprekken en
objecttoegangsgegevens hebben afzonderlijke rechten en gebruiksvensters.

**Commercieel werk.** Aanvragen en offertes ondersteunen prospect-/klantkeuze,
objectkoppeling, prijsversies, PDF, verzending, beveiligde reactie en afspraken.
Taken en tarieven beheren codes, categorieën, duur, disciplines, tarieven,
checklists, templates en meerwerk. Geaccordeerd werk kan worden verbonden aan
werkbonnen; vastgelegde bronversies blijven belangrijk voor latere controle.

**Planning en uitvoering.** Werkbonnen kunnen worden aangemaakt, gepland,
vrijgegeven, gekopieerd, gesplitst, uitgevoerd, gerapporteerd, gecontroleerd en
gecorrigeerd. Het dagplanbord bevat bonnenbak, slepen, medewerkers, beschikbaarheid,
conflicten, filters, aanpassen en terugdraaien. Vrijgeven kan vanuit lijst,
planningsmenu en dossier, via dezelfde databaseopdracht. Actieve medewerkers,
datum, taken, rechten en verwachte werkbonversie worden opnieuw gecontroleerd.

Reistijd wordt via de routeadapter berekend en bij de bijbehorende werkbon
getoond. Handmatige afwijkingen blijven bedienbaar. Dit is geen live GPS-tracking
of gegarandeerde verkeersvoorspelling. Rapportcontrole combineert bijdragen,
foto's, materialen, afwijkingen, ondertekening en vaste rapportversies. Een
correctieverzoek is een expliciete vervolgactie, geen stille herschrijving.

**Finance en communicatie.** Factuurconcepten, definitieve documenten, bundeling,
verzending, betaalverzoeken en gedeeltelijke betalingen zijn aanwezig. Online
betaling vereist de geverifieerde Mollie-koppeling van die tenant. Nieuws,
leesstatus, notificaties, opvolgacties en tickets gebruiken hun eigen actuele
rechten. Huisstijl, reizen, personeelsnummering en ondertekening zijn instellingen.

**Management.** Eigenaar, Management, Planning, Administratie en Support zijn
aanwezig, met pagina-/functierechten, mailuitnodiging, OTP, intrekking en
gecontroleerde eigendomsoverdracht. Een functie zichtbaar maken in een rol
vervangt niet de module- of bronrecordcontrole.

Bronnen: [backoffice](../../app/app), [werkbonnen](../architecture/work-orders.md),
[planning](../architecture/planboard.md), [commercial](../architecture/commercial.md),
[management](../architecture/tenant-management.md), [objecten](../architecture/object-360.md).

## Personeel en klanten

De personeelsapp projecteert eigen planning, vrijgegeven werkbonnen, uitvoering,
rapporten, uren, beschikbaarheid/verlof, nieuws, documenten, meldingen, profiel
en instellingen. Een medewerker krijgt geen algemene tenantdataset. De app is
installeerbaar als PWA: Android gebruikt de native browserprompt wanneer aanwezig;
iOS krijgt Safari-instructies. Het aanbod verschijnt na onboarding en één keer
bij de volgende nieuwe login na overslaan, daarna alleen via instellingen/browser.

Zonder white-label gebruikt installatie Fieldgrid-branding; de tenant verschijnt
binnen de app, met Powered by Fieldgrid. Met white-label volgen naam en geschikte
installatiebeelden de tenantbranding. De serviceworker bewaart een publieke
offline basis en generieke push. Er is **geen duurzame private offlinewachtrij**
voor uitvoeringswijzigingen of uploads. Geautomatiseerd browserbewijs vervangt
geen fysieke Samsung-/iPhone-acceptatie.

Het klantenportaal toont eigen objecten, afspraken/bezoeken, vrijgegeven
rapporten, facturen/betaalverzoeken, aanvragen/offertes, tickets, nieuws en
profiel. Toegang vereist actuele account-/klant-/objectbindingen en de module.
Onboarding kan worden hervat, inclusief gecontroleerd eerste object. De klant
kan toegestane gegevens en instructies onderhouden, een concreet bezoek
aanvragen, een offerte beoordelen en een beschikbare betaling openen.
Eenzelfde account met personeelsrechten krijgt in dit portaal nog steeds alleen
de klantprojectie. Realtime en focushercontrole verversen actuele gegevens;
intrekking wist de privéweergave.

Bronnen: [staffprojectie](../../lib/staff/workspace.ts), [PWA](../../lib/pwa),
[klantprojectie](../../lib/customer-portal/data.ts), [klantcontract](../architecture/customer-portal.md).

## Supportketen en kennisbank

Personeel of klant meldt een vraag aan de tenant. De tenant behandelt het eigen
gesprek. Een technische escalatie maakt een apart Fieldgrid-ticket met bewust
gekozen beschrijving en schone bijlagen. Interne tenantnotities en het volledige
bron­dossier gaan niet automatisch mee. Fieldgrid antwoordt aan het tenantcontact;
de tenant bereidt vervolgens een antwoord aan de oorspronkelijke melder voor,
controleert het en verzendt bewust. De twee gesprekken houden eigen statussen.
Voor toegestane technische categorieën bestaat ook directe klantintake bij
Fieldgrid. Toewijzing verruimt geen leesrecht.

De engine ondersteunt wachtrijen, filteren, prioriteit, behandelaar, termijnen
volgens openingstijden, wachten, oplossen, bevestigde sluiting, heropening en
audit. Bestanden gaan via quarantaine en ClamAV; downloaden controleert actuele
gesprekstoegang. Vertrouwelijke publieken blijven gescheiden.

De nieuwe bibliotheek bevat **46 uitgebreide artikelen, circa 15.700 woorden**:
12 beschikbaar voor platform, 20 voor tenantbeheer, 13 voor personeel en 13
voor klanten; gedeelde artikelen tellen in meer dan één werkruimte mee. Artikelen
hebben voorwaarden, stappen, resultaatcontrole, FAQ, categorie, trefwoorden,
inhoudsopgave en verwante links. Nederlandse full-textweging, letterlijke delen
en typefoutgelijkenis helpen praktische zoekvragen.

Alleen platformadmins beheren concepten, doelgroepen, publicatie, archivering en
versieherstel. Opslaan verandert geen publicatie. Support zoekt, leest en voegt
een gepubliceerde link in vanuit het antwoordformulier. Het echte ticket en
berichtpubliek bepalen het doelportaal; support kiest geen willekeurige
ontvangerscope. Invoegen verzendt niets. Archivering begrenst opnieuw openen,
maar herschrijft geen historische berichttekst. De kennisbank blijft ingelogd
en is geen openbaar marketing-CMS.

Bronnen: [ticketcontract](../architecture/tickets-support.md),
[kennisbankcontract](../architecture/knowledge-base.md), [startinhoud](../../content/knowledge).

## Providers, beveiliging en releasebeheer

Adresaanvulling activeert alleen bij straatnaam en postcode. De huidige zoekadapter
is **Kadaster/PDOK**; OpenStreetMap/OpenFreeMap levert kaartweergave en
OpenRouteService de routeadapter. De eerdere wens voor OpenStreetMap als
adreszoekprovider is daarmee nog geen geïmplementeerde providerwisseling.
Huisnummer, huisletter, toevoeging en plaats zijn normale invoervelden.
Een gewijzigd adres verliest de bevestigde locatie totdat die opnieuw is geverifieerd.

SendGrid verzorgt ingerichte mails en providerstatussen; Supabase Auth verzorgt
OTP binnen de ingerichte mailhook. Notifications ondersteunen in-app en
geconfigureerde kanaalverwerking. Mollie-acties controleren de tenant-/merchant-
binding en daadwerkelijke provideruitkomst. Er is geen algemene zelfbedienbare
Mollie Connect-onboarding voor veel merchants en geen Fieldgrid-abonnementsbilling.

RLS, private tabellen/RPC's, actuele sessies en levende lidmaatschappen beschermen
gegevens. Revisies en payloadgebonden receipts voorkomen stil overschrijven en
duplicatie. Private bestanden worden niet via publieke buckets aangeboden.
De kennisbank voegt geen service-role-leesbypass, private offlinecache of
onbegrensde HTML-renderer toe. De bronreview en metadata-inventaris bewaken
veranderde oppervlakken; een capture is geen beveiligingsgoedkeuring.

Releases volgen gereviewde mainbron, groene volledige CI, bewuste stagingpromotie,
schone migratiecontrole, backup, build, attestatie, brokerinstallatie, verse worker
en publieke acceptatie met exacte Git-SHA. Code terugzetten maakt een voorwaartse
DB-migratie niet ongedaan. Productiepromotie vraagt de bestaande eigenaarvrijgave.
De versie en changelog benoemen het product, health benoemt de werkelijke commit.

## Prioriteiten voor de volgende fase

| Prioriteit | Voorstel | Waarom en concrete acceptatie |
| --- | --- | --- |
| 1 | Provider-/queuecockpit | Toon OTP/mail/push/betaalbacklogs en veilige retry; behoud per-tenant toegang en onzekere-uitkomstbewijzen |
| 1 | Restore-oefening | Herstel database én private bestanden in een afgeschermde omgeving; meet herstelduur voordat RPO/RTO wordt beloofd |
| 1 | Deviceacceptatie | Controleer echte Android/Samsung en iPhone-installatie, branding, updates, push en herlogin |
| 1 | Volumebudgetten | Meet P95, requestaantallen en paginatie voor grote tenants; vervang brede platform/workspace-loads door serverfilters |
| 2 | Supportinzichten | SLA-trends, eerste antwoord, oplossingen, artikelgebruik en feedback, met scopebehoud |
| 2 | Inhoudsonderhoud | Feedback, leeswaardering, beoordelingsdatum en controle op verouderde kennisartikellinks |
| 2 | Tenantlifecycle | Begeleide pauze/hervat met impact op accounts, betalingen, workers en domeinen |
| 2 | Commerciële website | Bouw op het functionele overzicht, met demoaanvraag en onderbouwde screenshots |
| 3 | SaaS-abonnementen/koppelingen | Eigen abonnementsbilling en boekhoud-/CRM-integraties als afzonderlijk contract |
| 3 | Duurzame offline uitvoering | Ontwerp encryptie, herstel, conflictresolutie en intrekking vóór offline private writes |

Brede `getWorkspaceData`- en platformloads verdienen aandacht bij schaalgroei;
planbord/opvolging gebruiken al smallere projecties. Bestaande tests geven
regressiebewijs, geen onbeperkte schaalgarantie. Sommige oude UI-waarschuwingen
over bestandscontrole verdienen tekstonderhoud; daadwerkelijke uploads worden
wel door het centrale scancontract beschermd. De bestaande vastgelegde
dependency-uitzondering blijft zichtbaar; deze analyse claimt geen nul kwetsbaarheden.

Voor de publieke website is de [uitgebreide productbrief](../product/publieke-website-functioneel-overzicht.md)
de bruikbare vertaling van deze broninventaris. Nog te bouwen functies staan daarin
afzonderlijk en horen niet tussen de huidige productbeloften.
