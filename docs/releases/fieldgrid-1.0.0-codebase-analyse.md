# Fieldgrid 1.0.0 — codebaseanalyse en productinventaris

Stand: 9 oktober 2026. Deze analyse beschrijft de vrijgegeven broncode, de uitgevoerde verificatie en vervolgstappen. Historische ontwikkelnotities kunnen een eerdere implementatiestand beschrijven. Hieronder staat de actuele productbaseline.

## Release en conclusie

**Fieldgrid 1.0.0 is gecommit, gepusht en succesvol gedeployd naar staging én productie.** Beide omgevingen gebruiken exact dezelfde gereviewde commit: `2324aa57fe98d4155e228049aaa055e115406c12`. De onveranderlijke tag is `v1.0.0`.

| Bewijs | Resultaat |
| --- | --- |
| [Wijziging en review, PR 589](https://github.com/veele-services/platform/pull/589) | Gemerged naar `main` |
| [Main-CI](https://github.com/veele-services/platform/actions/runs/37969513199) | Geslaagd op de vrijgegeven SHA |
| [Stagingdeployment](https://github.com/veele-services/platform/actions/runs/37969550597) | Verificatie, deployment en acceptatie geslaagd |
| [Productiedeployment](https://github.com/veele-services/platform/actions/runs/37974900440) | Verificatie, deployment en acceptatie geslaagd |
| Publieke health, beide omgevingen, gecontroleerd om 19:16 UTC | HTTP 200; juiste omgeving en SHA; database en scanner gereed |
| Achtergrondverwerking | Verse workeruitvoering geaccepteerd in beide deployments |
| [GitHub-release](https://github.com/veele-services/platform/releases/tag/v1.0.0) | Gepubliceerd op de bewezen productierelease |

Het product heeft vier werkruimtes met echte gegevensverwerking: platformbeheer, tenantbackoffice, personeelsapp en klantenportaal. Commerciële en operationele onderdelen zijn verbonden via dossiers, werkbonnen, offertes, bezoeken, rapporten, facturen en tickets. Dit is een functionele productbaseline met afzonderlijke toegangsgrenzen.

De belangrijkste verbeteringen betreffen operationeel toezicht, gegevensladen bij grotere aantallen, aantoonbaar herstel uit back-ups, apparaatacceptatie en onderhoud van grote componenten en verouderde teksten. Nieuwe commerciële platformfuncties, externe administratiekoppelingen en duurzame offline uitvoering zijn afzonderlijke vervolgfases.

## Omvang en architectuur

De broninventaris omvat routes, serveracties, gegevensadapters, rechten, migraties, providerintegraties, achtergrondverwerking, gedeelde UI en releaseautomatisering. Het schema is geïnventariseerd op een geïsoleerde lokale replay, zonder productiegegevens te exporteren.

| Onderdeel | Inventaris |
| --- | --- |
| Next.js-paginaroutes | 60; dynamische tabbladen en views leveren aanvullende schermen |
| Routehandlers onder `app/api` | 35; Auth-/PWA-routes buiten die map komen daar nog bij |
| Voorwaartse SQL-migraties | 135, met vastgelegd migratiemanifest |
| Applicatietabellen | 203: 123 in `public`, 80 in `private`; systeemtabellen niet meegeteld |
| Centrale rechteninventaris | 169 tenantrechten en 19 platformrechten |
| Testbestanden | 186 unitbestanden en 45 browserspecificaties |

De vastgelegde stack gebruikt Next.js 16.3.8, React 19.2.6, TypeScript 5.9.3, Node.js vanaf versie 24 en pnpm 11.25.0. Supabase verzorgt Auth, PostgreSQL, Storage en Realtime. SQL/RPC-contracten bewaken bedrijfsregels, actuele rechten, revisies en herhaalde opdrachten; een verborgen knop is geen autorisatiegrens.

Een tenant wordt uitsluitend uit een erkende, actieve hostname bepaald. Onbekende of inactieve hosts krijgen geen andere tenant als terugval. De tenantwerkruimtes staan op dezelfde oorsprong onder `/app`, `/staff` en `/klant`; platformbeheer gebruikt de platformhost onder `/platform`.

Staging en productie hebben afzonderlijke runtimes, Supabase-projecten en providerconfiguratie. Ze delen momenteel één VPS en een scannervoorziening: dit biedt gegevens- en configuratie-isolatie, maar geen onafhankelijkheid bij een VPS-storing. Next.js-poorten 3301 en 3302 blijven op loopback.

Bronnen: [stagingarchitectuur](../architecture/staging.md), [productiearchitectuur](../architecture/production.md), [hostnamegrens](../../proxy.ts), [gegevensladen](../../lib/data/workspace.ts), [migraties](../../supabase/migrations), [packageversies](../../package.json).

## Platformbeheer

| Onderdeel | Huidige mogelijkheden |
| --- | --- |
| Cockpit | Tenantstatussen, personeel, uitnodigingen, klantportalen, aangepaste templates en supportaandacht |
| Tenantbeheer | Lijst met zoeken, sorteren en paginatie; tenantdetails en zesstaps onboarding |
| Huisstijl en modules | Logo, kleuren, white-label, moduletoegang, communicatieafzender en versiegebonden berichttemplates |
| Eigen appdomein | Registratie, DNS-verificatie, activering en verwijdering van een omgevinggebonden tenantdomein |
| Supportdesk | Wachtrijen, filters, behandelaren, prioriteiten, termijnen, berichten, interne notities en afhandeling |
| Supportinrichting | Categorieën, routering, groepen, openingstijden en expliciete bevoegdheden |
| Supportteam | Medewerkers uitnodigen per e-mail, OTP-login, tenantbereik, profielbeheer, intrekking en activiteit |
| Notificaties | Inbox, voorkeuren en beheeronderdelen naar actuele bevoegdheden, binnen de platformshell |

Een supportmedewerker krijgt vier vaste mogelijkheden: lezen, antwoorden, interne Fieldgrid-notities en afhandelen. Het bereik bestaat uit geselecteerde actieve tickettenants of alle toegestane actieve tickettenants. Dit creëert geen tenantlidmaatschap en geen platformbeheerder. Teamwijzigingen vereisen een platformbeheerder met een daadwerkelijke OTP-login van maximaal vijftien minuten geleden; een vernieuwd token alleen voldoet niet. Intrekking wordt ook binnen een bestaande sessie opnieuw gecontroleerd.

De pagina **Rechten** van het supportteam toont deze vaste rechten. Er is nog geen editor voor willekeurige platformrollen. Tenantmanagement heeft wel een eigen rollen- en rechteneditor.

Tenantstatussen worden getoond, maar een complete bedienbare lifecycle voor pauzeren/hervatten met impactcontrole ontbreekt. Platformfacturatie van Fieldgrid aan tenants ontbreekt eveneens; facturen van tenants aan klanten bestaan al.

Bronnen: [platformgegevens](../../lib/platform/data.ts), [platformroutes](../../app/platform), [supportteam](../../lib/platform/team.ts), [platformanalyse](platform-dashboard-analyse-2026-10-09.md).

## Tenantbackoffice

| Gebied | Huidige mogelijkheden |
| --- | --- |
| Klant 360 | Klant/contacten, adressen, financiële gegevens, notities, documenten, historie, afspraken en gekoppelde dossiers |
| Object 360 | Objectstructuur, ruimtes, contacten, programma's, instructies, kwaliteit, documentversies en concrete bezoekaanvragen |
| Personeel 360 | Onboarding, uitnodigingen, nummering, functies, kwalificaties, beschikbaarheid, verlof, contract- en HR-registraties, taken en documenten |
| Taken en tarieven | Codes, categorieën, disciplines, duur, tarieven, templates, checklists en meerwerk |
| Aanvragen en offertes | Prospect-/klantaanvragen, objectkeuze, prijsversies, PDF, verzending, beveiligde reactie en concrete bezoekafspraken |
| Werkbonnen | Aanmaken, plannen, vrijgeven, uitvoeren, rapporteren, controleren, corrigeren, kopiëren, splitsen en opvolgen |
| Planbord | Dagplanning, slepen, aanpassen, filters, terugdraaien, bonnenbak, bemensing, beschikbaarheid, conflicten en reistijd |
| Rapportcontrole | Gezamenlijk rapport, uitvoeringsbijdragen, foto's, materialen, afwijkingen, ondertekening en vaste rapportversies |
| Finance | Factuurconcepten, definitieve documenten, verzending, bundeling, betaalverzoeken, gedeeltelijke betalingen en providercontrole |
| Communicatie | Nieuws, leesstatus, notificaties, voorkeuren, tickets en gekoppelde opvolgacties |
| Instellingen | Huisstijl/afzender, reizen, personeelsnummering en ondertekening |
| Gebruikers en rollen | Eigenaar, Management, Planning, Administratie en Support; pagina-/functierechten, uitnodiging, intrekking en gecontroleerde eigendomsoverdracht |

Werkbonvrijgave kan nu vanuit het planbordmenu, planningsdetail, werkbonnenlijst en werkbondossier. Alle ingangen gebruiken dezelfde bestaande publicatieopdracht: taken, datum, actieve medewerkers, actuele rechten en werkbonversie worden opnieuw in de database gecontroleerd. Een onzekere netwerkuitkomst behoudt dezelfde opdrachtsleutel.

Het reistijdvlak sluit op dezelfde hoogte aan op de werkbon. De berekende reistijd blijft behouden en een tekort aan beschikbare reistijd blijft zichtbaar en bedienbaar. Dit verandert de presentatie van de bestaande reisberekening.

Afgeschermde objectgegevens, zoals expliciet gebonden sleutel-/toegangsgegevens, hebben hun eigen bevoegdheid en gebruiksvenster. Vertrouwelijke HR-gesprekken vereisen afzonderlijke expliciete toegang; eigenaar zijn opent niet automatisch alle vertrouwelijke gesprekken.

Bronnen: [backofficeroutes](../../app/app), [dossiercomponenten](../../components/fieldgrid), [vrijgavecomponent](../../components/fieldgrid/work-orders/release.tsx), [planbord](../../components/fieldgrid/planboard/day-planboard.tsx).

## Personeelsapp en PWA

De personeelsapp bevat eigen planning, werkbonuitvoering, uren, nieuws, beschikbaarheid/verlof, documenten, profiel, instellingen, meldingen en notificaties. De gegevensprojectie is gekoppeld aan de eigen medewerker en geeft geen algemene backofficegegevens mee.

Tenantbranding verschijnt binnen de app. Zonder white-label gebruikt de installatie Fieldgrid-naam en -iconen, met tenantbranding binnen de app en Powered by Fieldgrid. Bij white-label gebruikt de PWA de tenantnaam, het tenantlogo en de bijbehorende installatie-/splashvoorzieningen.

Installeren wordt aangeboden na onboarding en nog één keer bij de volgende nieuwe geverifieerde login nadat de eerste vraag is overgeslagen. Daarna blijft installeren bereikbaar via instellingen en de browser. Android gebruikt de native installatieprompt wanneer de browser die aanbiedt; iOS toont Safari-instructies. De notificatievoorkeuren hebben een echte personeelsroute.

De serviceworker bewaart een publieke offline basis en verwerkt generieke push. Hij cachet geen privé-HTML, API-antwoorden of personeelsdossiers. Er is geen duurzame offline wachtrij voor werkbonwijzigingen of uploads. Een installeerbare PWA betekent in deze versie dus geen volledig offline uitvoering.

Bronnen: [personeelsapp](../../components/fieldgrid/staff/personnel-app.tsx), [personeelsprojectie](../../lib/staff/workspace.ts), [PWA](../../lib/pwa), [PWA-verificatie](../security/staff-pwa-verification-2026-10-09.md).

## Klantenportaal

Het klantenportaal heeft overzicht, eigen objecten, afspraken/bezoeken, vrijgegeven rapporten, facturen/betaalverzoeken, aanvragen/offertes, tickets, nieuws en profiel. Toegang vereist een expliciete koppeling van account, tenant en klant, met concrete objectbindingen. Een gedeeld e-mailadres alleen geeft geen toegang tot andere klantdossiers.

Onboarding kan worden hervat en het eerste object wordt gecontroleerd aangemaakt. Klanten kunnen toegestane gegevens en instructies bijwerken, concrete bezoeken aanvragen en aangeboden offertes beoordelen. De klantprojectie van rapporten blijft een klantkopie; een account met daarnaast personeelsrechten krijgt daardoor geen extra personeelsinhoud in dit portaal.

Realtime signalen en hercontrole bij focus/herverbinden houden de eigen gegevens actueel. Bij ingetrokken toegang verdwijnt de privé-inhoud uit het appgeheugen. Betalen vereist naast portaaltoegang een werkelijk geverifieerde betaalproviderkoppeling voor de tenant.

Bronnen: [klantenroutes](../../app/klant), [gegevensprojectie](../../lib/customer-portal/data.ts), [klantenarchitectuur](../architecture/customer-portal.md).

## Tickets: personeel/klant → tenant → Fieldgrid

De werkruimtes gebruiken één ticketengine met afzonderlijke gesprekspublieken, actuele bevoegdheden en gecontroleerde bijlagen. Supportlinks openen de ticketwerkruimte; instellingen zijn afzonderlijke routes.

1. Personeel of klant maakt een eigen servicemelding aan voor de tenant.
2. De tenant behandelt het oorspronkelijke gesprek. Interne en vertrouwelijke tenantnotities blijven afgeschermd.
3. Wanneer Fieldgrid nodig is, deelt de tenant een gecontroleerde technische omschrijving en geselecteerde schone bijlagen. Dit maakt een **afzonderlijk** Fieldgrid-ticket; het originele dossier wordt niet integraal doorgestuurd.
4. Een bevoegde Fieldgrid-supportmedewerker antwoordt aan de tenant. Interne Fieldgrid-notities blijven binnen het platformpubliek.
5. De tenant bereidt het antwoord aan de oorspronkelijke melder voor, controleert/bewerkt het en verstuurt het expliciet.

De oorspronkelijke melding en het Fieldgrid-ticket behouden ieder hun eigen status. Toewijzing verruimt geen leesrecht. Sluiting bij Fieldgrid sluit de oorspronkelijke melding niet stilzwijgend.

Daarnaast bestaat voor daarvoor toegestane technische categorieën een directe klantmelding aan Fieldgrid. Dit gebruikt dezelfde engine en een afgebakend platformpubliek. De tenantketen hierboven beschrijft escalatie van servicemeldingen; niet iedere technische melding vereist eerst een tenantticket.

De engine ondersteunt wachtrijen, zoeken/filteren, paginatie, prioriteit, behandelaar, reactietermijnen volgens openingstijden, wachten, oplossing, bevestigde sluiting, heropening en audit. Ticketbijlagen gaan via quarantaine en ClamAV; downloaden vereist opnieuw actuele gesprekstoegang.

De release test zowel de personeels- als klantenketen, gescheiden notities, tenantbereik van supportmedewerkers, intrekking en behouden sessies.

Bronnen: [ticketarchitectuur](../architecture/tickets-support.md), [ticketengine](../../lib/tickets), [autorisatiereview](../security/platform-support-team-verification-2026-10-09.md), [browserketen](../../tests/e2e/tickets.spec.ts).

## Gedeelde uitstraling en bediening

Er is een gedeelde componentbasis voor paginakoppen, actieknoppen, aangesloten tabbladen, secties, lege resultaten, paginatie, accountmenu's, dropdowns, dialogen en laden met branding. Dashboardtokens bepalen kleuren, typografie, tabelkoppen, borders, focus en afmetingen. Tenantkleuren worden ook doorgegeven aan overlays buiten de oorspronkelijke DOM-container.

De centrale patronen omvatten een rustige hoofdletter-subtitel, een duidelijke titel met helpicon ernaast, acties op dezelfde hoogte, lichte containers, kolomkoppen over de volle breedte, herkenbare lege resultaten en telling/paginatie onder de lijst. Logo en naam zijn alternatieven in de merkpositie. Headerzoeken toont vanaf drie tekens resultaten per toegestane categorie: klanten, objecten, werkbonnen, aanvragen, offertes, personeel en facturen.

Adresaanvulling wordt alleen geopend in straatnaam en postcode. Huisnummer, huisletter, toevoeging en plaats blijven gewone invoervelden. De actuele Nederlandse adresadapter gebruikt **Kadaster/PDOK**, terwijl kaartweergave en OpenRouteService-routering op OpenStreetMap-gegevens steunen. Een gewijzigd adres verliest zijn bevestigde locatie totdat de provideridentiteit opnieuw is gecontroleerd.

De componentbasis bestaat, maar vormt nog geen afzonderlijk gedocumenteerde designsystemcatalogus. Grote modulecomponenten en aanvullende CSS-regels blijven bestaan; gedeelde componenten alleen bewijzen geen volledige visuele gelijkheid van iedere mogelijke toestand op ieder apparaat.

Bronnen: [gedeelde componenten](../../components/fieldgrid), [UI-primitieven](../../components/ui), [dashboardstijl](../../app/dashboard-system.css), [adresvelden](../../components/fieldgrid/address-input.tsx), [adresadapter](../../lib/addresses/pdok.ts).

## Integraties, veiligheid en configuratie

| Gebied | Werkelijke stand en grens |
| --- | --- |
| OTP en uitnodigingen | Account, huidige sessie en lidmaatschap worden gecontroleerd; verzending blijft afhankelijk van afzender, hook en providerlimieten |
| Mail | Templates, afleverstatus en signed provider-events; provideracceptatie is niet hetzelfde als bezorging |
| Notificaties/push | Voorkeuren, bronnen, rechten, aflevering en achtergrondverwerking; push bevat geen privé-inboxinhoud |
| Private bestanden | Formaat-/magic-bytecontrole, ClamAV, hashes, gecontroleerde opslag en opnieuw geautoriseerde downloads |
| Betalingen | Mollie-profielcontrole, vaste bedragen/valuta, gedeeltelijke betalingen en idempotente verwerking van geverifieerde providerstatus |
| Routering | OpenRouteService, cache, claims en quota; onbekende reistijd wordt niet als berekende uitkomst voorgesteld |
| Eigen tenantdomein | Unieke TXT-verificatie, juiste CNAME, actuele DNS-hercontrole en expliciete omgevingbinding |
| Publieke commerciële routes | Veele-marketingintake en beveiligde offerte-/boekings-/betaalroutes gekoppeld aan echte registraties |

Scanning is ook aangesloten op branding, rapporten, handtekeningen, facturen, personeels-/klant-/objectdocumenten en commerciële documenten. Een aantal dossierteksten zegt nog ten onrechte dat malwarecontrole ontbreekt of dat een document niet gescand is. Dat is concrete tekstschuld, geen bewijs van een ontbrekende uploadcontrole. Nieuwe uploads gebruiken de scanhelper; bestaande bytes worden gecontroleerd wanneer ze via die helper worden gelezen.

Voorbeelden van die verouderde teksten staan in het [objectformulier](../../components/fieldgrid/objects/forms.tsx), [HR-uploadformulier](../../components/fieldgrid/personnel-dossier-forms.tsx) en [klantdossier](../../components/fieldgrid/customers/dossier.tsx). Deze teksten horen bij een volgende PATCH-correctie.

De huidige Mollie-inrichting gebruikt één ingestelde API-key per omgeving, met een exact geverifieerde tenant-/profielbinding. Er is geen volledig selfservice Mollie Connect-proces voor vele onafhankelijke merchants. De browserterugkeerpagina boekt geen betaling af zonder providerbewijs.

Een geregistreerd appdomein zoals `app.veeleservices.nl` wordt niet automatisch een live HTTPS-origin. DNS, Caddy/TLS en toegestane Auth-redirects vereisen de gedocumenteerde operatorinrichting. Deze analyse bevestigt de functie in de codebase, niet een nog niet afzonderlijk bewezen domeinactivatie.

Bij de eerder ontbrekende staging-OTP toonden Auth-logs een 429-mailratelimiet. De generieke loginmelding beschermt tegen accountenumeratie en bewijst niet dat een nieuwe mail bezorgd is. Read-only maildiagnostiek bestaat; een centraal bedienbaar provider-/queueoverzicht ontbreekt nog. Onzekere uitnodigingsuitkomsten worden bewaard en niet automatisch opnieuw verzonden, maar missen nog een specifieke herstelbediening.

De dependency-audit na oplevering slaagt met één bestaande expliciete uitzondering voor `GHSA-vfj7-8cjw-p6xm` in de transitieve `braces`-dependency. De uitzondering is gekoppeld aan een gecommitteerde lokale patch en regressietests op de werkelijk geïnstalleerde dependency. Dit is geen claim van nul advisories; bij een geschikte gevalideerde dependency-update moeten patch en uitzondering samen worden herzien.

Bronnen: [scanhelper](../../lib/files/scanned-storage.ts), [Mollie-binding](../../lib/payments/merchant.ts), [domeinrunbook](../deployment/tenant-workspace-domain.md), [maildiagnostiek](../security/auth-mail-diagnostics-2026-10-05.md), [dependencycontrole](../../lib/operations/dependency-security.test.ts).

## Onderhoud en schaalbaarheid

Twee concrete gegevenspaden verdienen aandacht vóór grote tenantvolumes:

- `getWorkspaceData` haalt voor verschillende backofficeviews veel domeinen parallel op. Sommige collecties worden volledig binnen de toegestane scope gelezen; andere hebben vaste maxima. Eenvoudige pagina's hebben daardoor meer gegevenswerk dan nodig. Planning en opvolging gebruiken inmiddels gerichtere projecties, maar die aanpak is nog niet overal doorgevoerd.
- `getPlatformData` leest brede tabellen en vraagt eigenaaraccounts parallel op voordat de UI pagineert. Zonder serverpaginatie/aggregatie kunnen API-rowlimits aantallen en lijsten afkappen; de Auth-opvraag groeit mee met het aantal tenants. Dit is een broncodebevinding, geen geconstateerde afkapping bij de huidige tenant.

Prioriteit is gerichte serverpaginatie, kleine samenvattingsprojecties en gemeten laadtijdbudgetten. Een ander laadscherm lost een groot queryvolume niet op. Er is nog geen productie-P95-benchmark voor lege én grote tenants vastgelegd.

Grote dossier-, personeels- en planbordcomponenten en lange CSS-bestanden vergroten onderhoudskosten. Splits die geleidelijk per verantwoordelijkheid, met behoud van de geteste contracten. De oude personeelscomponent mag niet blind worden verwijderd: de huidige app gebruikt daar nog de werkbonsheet uit.

Deployment maakt gecontroleerde databaseback-ups vóór migratie. Voor herstelvertrouwen ontbreken in deze analyse bewijzen van een recente volledige restore naar een geïsoleerd project, inclusief private bestanden, en van operationeel gecontroleerde offsite-retentie. Verbind RPO/RTO aan zo'n oefening; een geslaagde back-upopdracht alleen bewijst geen herstel.

## Testresultaten en grenzen

De afgeronde productie-CI van dezelfde vrijgegeven SHA rapporteert:

| Controle | Resultaat |
| --- | --- |
| Unittests | 1.856 geslaagd, 186 bestanden |
| SQL/pgTAP | 398 geslaagd, 12 bestanden |
| Node-databasecontractchecks | 483 geslaagd, nul overgeslagen |
| Echte Auth/Data API/Storage-HTTP-checks | 10 geslaagd, nul overgeslagen, met echte ClamAV |
| Chromium-browserflows | 131 geslaagd |
| Lint, TypeScript en productiebuild | Geslaagd |
| Schone migratiereplay, upgrades en manifest | Geslaagd; de 134 oudere statementhashes behouden |
| Autorisatie-inventaris | 1.125 beoordeelde items: 965 gecontroleerd en 160 gecorrigeerd/herbeoordeeld; geen openstaande reviewitems |
| Beide deployments | Hostcontrole, back-up/migratie, webhealth op exacte SHA, worker en acceptatie geslaagd |

Deze brede bronanalyse en tests vormen geen individuele bewijsgarantie voor iedere ongewijzigde coderegel of elk mogelijk productiegegeven. Browseracceptatie gebruikt Chromium, waaronder mobiele viewportcontroles; fysieke Samsung-/Android- en iOS-/Safari-installatie, splash en push zijn niet handmatig afgetekend. De tests hebben geen echte productiebetaling of nieuwe testmail naar echte eindgebruikers gestart. Er is geen lijncoveragepercentage of volledige productieperformancemeting vastgesteld.

## Aanbevolen vervolgreleases

Onderstaande versies zijn een voorstel voor groepering. Deze nieuwe functies zijn geen onderdeel van 1.0.0.

| Volgorde | Werk | Concreet resultaat |
| --- | --- | --- |
| Eerst, onderhoud 1.0.1 | Verouderde scanmeldingen/documentatie herstellen; platformrowlimits en onnodig breed laden aanpakken | Correcte teksten en betrouwbare lijsten/aantallen bij grotere volumes |
| Eerst, operationele acceptatie | Echte Android/iOS-checklist, gemeten laadtijden en volledige restore-oefening | Aantoonbare apparaatwerking, prestatiebudget en herstelbaarheid |
| Daarna, beheeruitbreiding 1.1.x | Cockpit met laatste workeruitvoering, oudste queue-items, afleverfouten, scannerstoringen en providerlimieten; gecontroleerd onderzoek van onzekere uitnodigingen | Storingen herkennen en afhandelen vanuit platformbeheer |
| Daarna, support 1.1.x | Werkvoorraad per medewerker, doorlooptijden, termijnen/SLA-trends, kennisbank, antwoordtemplates en incidentgroepering | Support kunnen sturen naast individuele tickets afhandelen |
| Daarna, tenantbeheer | Pauzeren/hervatten met impactcontrole, beperkte auditexports en accountprofielbeheer | Vollediger dagelijks platformbeheer |
| Afzonderlijke commerciële fase | Fieldgrid-abonnementen/tenantfacturatie en meerdere zelfstandig gekoppelde merchants | SaaS-exploitatie en schaalbare betaalprovideronboarding |
| Afzonderlijke integratiefase | Gecontroleerde boekhoud-/loonexports, automatische debiteurenopvolging en duurzame offline personeelsopdrachten | Administratie en uitvoering uitbreiden met expliciete gegevens-/conflictcontracten |
| Doorlopend | Gedeelde componentcatalogus, kleinere componenten en minder overlappende CSS | Consistentie behouden terwijl het product groeit |

Mijn advies is eerst onderhoud en operationele acceptatie af te ronden. Dat maakt de bestaande functies beter beheersbaar voordat nieuwe commerciële of offline contracten worden toegevoegd. De huidige cockpit is een configuratie- en supportoverzicht; zij is nog geen volledig operationeel controlecentrum.

## Versiebeheer vanaf deze baseline

`v1.0.0` blijft gekoppeld aan de exact geverifieerde productierelease. Reparaties krijgen PATCH, compatibele nieuwe functies MINOR en bewust incompatibele contractwijzigingen MAJOR. Packageversie, changelog, releasereview en GitHub-release worden bijgehouden. `main` blijft bron-/ontwikkelbranch; staging en productie blijven bewuste promoties van dezelfde geaccepteerde SHA.

Deze analyse is documentatie na de release. De documentatiecommit verandert de bestaande tag of gedeployde runtime niet.

Zie [versiebeheer](versioning.md) en [changelog](../../CHANGELOG.md).
