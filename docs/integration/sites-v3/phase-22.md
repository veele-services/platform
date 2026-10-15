# Productbeheer, supportteam en platforminformatie

Deze fase behandelt P07, P08 en P09. De meegeleverde platformpresentatie blijft de referentie; de bestaande product-, account-, kennisbank- en notificatieprocessen blijven de gegevens- en autorisatiebron. De browseracceptatie en releasegates zijn nog in uitvoering.

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

De bestaande native regressies voor supportteam, primaire beheerder, managementrollen, productbeheer, kennisbank en notificaties slagen gezamenlijk voor 77 controles. Nieuwe verpakte browserketens, bekeken bronvergelijkingen en de verdere releasegates worden afzonderlijk vastgelegd. Er is nog geen deployment of liveacceptatie.
