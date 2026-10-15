# Productbeheer, supportteam en platforminformatie

Deze fase behandelt P07, P08 en P09. De meegeleverde platformpresentatie blijft de referentie; de bestaande product-, account-, kennisbank- en notificatieprocessen blijven de gegevens- en autorisatiebron. De lokale browseracceptatie is voltooid. De gezamenlijke releasegates, deployment en liveacceptatie zijn afzonderlijke vervolgstappen.

| Onderdeel | Keuze | Uitwerking |
| --- | --- | --- |
| Productoverzicht | Uitbreiden | Bronpanelen voor modules en roadmap. Modulekaarten openen werkelijke mogelijkheden en afhankelijkheden, met een echte route naar tenantbeheer. |
| Modulecatalogus | Hergebruiken | De zes bestaande modules en herkenbaar uitgeschakelde toekomstige websiteoptie blijven behouden. Er komt geen tweede entitlementregistratie of demorecht. |
| Productbeheer | Hergebruiken | Ideeën, roadmap, releases, doelgroep, publicatie, beschikbaarheid, bestanden en announcements blijven via de bestaande API en beheerbediening bereikbaar. |
| Supportteam | Uitbreiden | Vijf bronkolommen, expliciet geregistreerde primaire beheerder, actuele medewerkers en uitnodigingsstatus. Extra lifecycleacties staan in de bestaande gedeelde dropdownstijl. |
| Uitnodiging en toegang | Hergebruiken | Native accountvoorbereiding, recente echte OTP, begrensde supportrechten, herhaalregistratie, globale SendGrid-policy en verzendclaim blijven leidend. |
| Primaire beheerder | Hergebruiken | De bestaande registratie, versiecontrole en OTP blijven verplicht. Een willekeurige Auth-gebruiker of supportmedewerker wordt geen primaire beheerder. |
| Kennisbank | Uitbreiden | Bronkaarten met werkelijke artikelen, zoeken/filters, detailvenster, volledige uitleg en stabiele deel-/bewerkroute. Alleen werkelijk bevoegde platformbeheerders kunnen wijzigen/publiceren. |
| Notificaties | Uitbreiden | Bronpaneel met eigen werkelijke berichten en native detail/lifecycle; aanvullende campagnes, regels, templates, afleverstatus en bevoegdheden blijven beschikbaar. |
| Topbarbel | Uitbreiden | De bronknop opent platformnotificaties; binnen CRM opent hij de websiteaanvragen. Het accountmenu blijft gekoppeld aan het huidige account. |

## Noodzakelijke integratieverschillen

De bron bevat fictieve modules, teamregels, kennisartikelen en meldingen. Productie gebruikt de bestaande catalogus, expliciete beheerregistratie, actuele rosters en eigen geautoriseerde content. Het aantal kaarten of regels kan daardoor verschillen. Een modulekaart biedt productinformatie; daadwerkelijke tenantbeschikbaarheid wordt op de bestaande tenantpagina gewijzigd. Roadmapstatus en publicatie worden niet tot een lokale demoflag teruggebracht.

De aanvullende native productbediening en teamrechten/activiteit blijven in afzonderlijke uitklapbare onderdelen bereikbaar. Supportuitnodigingen behouden e-mailadres, expliciet organisatiebereik, OTP-vereiste en werkelijke verzenduitkomst. Alleen bij het maken van een nieuw supportaccount wordt de ingevoerde naam als eerste profielnaam meegegeven; bestaande Auth-accounts behouden hun profiel en credentials. Een gesloten of onbekende opslaguitkomst wordt niet als geslaagde providerbezorging beschreven.

De kennisbank behoudt uitgebreide artikelen, doelgroep- en publicatiefilters, revisies, verwante artikelen en de native editor. Een onbewaard artikelconcept vraagt bevestiging bij sluiten of navigeren. Berichten blijven aan het huidige account gebonden en gebruiken de bestaande lees-, bevestig- en archiefcommando's. De accountknop behoudt echte profiel-/voorkeurs- en uitlogmogelijkheden binnen dezelfde bronframe.

De eerder gevonden modules-/afzenderadviezen gebruiken nu leesbare bronparagrafen in plaats van de kleine native meldingsbalken. Het compacte supportreactieveld krijgt de bronlabeldikte en de reactieknop wordt links uitgelijnd. Er worden geen onderliggende module-, verzend-, rechten- of ticketcommando's gewijzigd door deze presentatiecorrecties.

## Bewijsstatus

Het [bewijsregister](evidence/phase-22/result.json) bevat zeven geslaagde browserketens op het werkelijk verpakte artifact `0b2e587c9048160bc995226755c0c4373e28ad19`, met nul browserfouten. Echte lokale SMTP/OTP-verificatie, primaire beheerregistratie en CRM-ontvanger, supportuitnodiging met één Auth-account en vier begrensde rechten, native verzendpolicy/providerclaim, daadwerkelijk ingelogde supportmedewerker en blokkade op CRM/beheer, moduleafhankelijkheden, roadmapdetails, kennisbank bewerken/publiceren, read-only support, eigen notificaties lezen/bevestigen/archiveren en intrekken van een eerder werkende supportsessie zijn gecontroleerd. De verzendtransportproef gebruikt de begrensde lokale providerregistratie en fictieve `.invalid`-ontvangers; dit bewijst geen externe bezorging.

Alle 36 opgenomen beelden zijn bekeken: twaalf bron-/doelparen op 1440, 768 en 390 pixels en vier native detail-/uitnodigingsvensters op diezelfde breedten. De geïmporteerde bron-UI en de originele lettertypen zijn gelijk gebleven. De referentie gebruikt een afzonderlijke, uitsluitend leesbare lege CRM-adapter om de originele Cloudflare-worker buiten deze Next-omgeving te houden; er is geen Sites-backend of owner-fallback naar productie gekopieerd. De geïsoleerde referentieruntime staat los van de echte testdatabase.

De actuele bronkaarten gebruiken bestaande modulegegevens en alfabetisch gesorteerde native artikelen; aantallen/volgorde zijn daardoor data-afhankelijk. Extra echte filters, zoek-/vernieuwbediening en paginatie blijven behouden. Bij informatiepagina's maken deze knoppen de kop op desktop 13 pixels hoger en op mobiel een extra regel. Dit is een beperkte integratieafwijking om bestaande beheerfuncties bereikbaar te houden. Breedte, bronpaneel, kaarten, tekstbehandeling en vensterframe zijn bekeken. Lange echte e-mailadressen en expliciet supportbereik mogen afbreken; de tabel houdt op mobiel de bronmatige interne horizontale scroll, zonder pagina-overloop.

De native regressies voor supportteam, primaire beheerder, managementrollen, productbeheer, kennisbank en notificaties slagen gezamenlijk voor 77 controles. De volledige unitrun vóór de personeelsuitbreiding bevat 1958 geslaagde tests. De nieuwe OTP-navigatie is daarna gericht herhaald; het opgenomen koude artifact compileert alle 108 pagina's, materialiseert 19 vereiste modules en slaagt voor de aparte release-opstartproef. Er is nog geen deployment of liveacceptatie.
