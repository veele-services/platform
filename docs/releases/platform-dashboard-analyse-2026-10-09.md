# Platformdashboard — analyse en inrichting

Beoordeling van het platformdashboard voor de Fieldgrid 1.0.0-baseline,
9 oktober 2026. De functionele bronreview omvat de platformroutes, serveracties,
ticket-RPC's, accountinrichting en gedeelde dashboardcomponenten.

## Wat al mogelijk was

| Onderdeel | Beschikbare bediening |
| --- | --- |
| Overzicht | Aantallen actieve/inactieve tenants, personeel, uitnodigingen, klantportalen en aangepaste templates; supportaandacht |
| Tenants | Zoeken, sorteren, pagineren en een tenant openen |
| Onboarding | Organisatie, eigenaar, huisstijl, modules, communicatie en eindcontrole; herstelbare eigenaaruitnodiging |
| Tenantinstellingen | Logo, kleuren, white-label, afzonderlijke modules, afzender en berichttemplates |
| Eigen tenantadres | Domeinnaam registreren, DNS controleren en actief koppelen; Caddy/TLS blijft een operatorhandeling |
| Supportdesk | Wachtrijen, filters, toewijzing, prioriteiten, reactietermijnen, berichten, notities, oplossing en sluiting |
| Supportinstellingen | Categorieën, routering, behandelgroepen, openingstijden, deadlines en expliciete bevoegdheden |
| Notificaties | Inbox, voorkeuren en beheeronderdelen naar actuele rechten; gedeelde platformshell |

Platformbeheer geeft geen algemene toegang tot personeels- of klantgesprekken.
De supportdesk gebruikt het expliciete rechtenregister en uitsluitend gesprekken
die voor Fieldgrid zijn bestemd: expliciet gedeelde tenantescalaties of toegestane
directe technische meldingen.

## Wat deze release toevoegt

De praktische lacune was het toevoegen en laten inloggen van echte
Fieldgrid-supportmedewerkers. Onder **Supportteam** kan platformbeheer nu een
medewerker per e-mail uitnodigen, een tenantbereik kiezen, het profiel wijzigen,
toegang intrekken en de laatste teamwijzigingen bekijken. De rol kent lezen,
antwoorden, interne Fieldgrid-notities en afhandelen toe. Een supportmedewerker
krijgt geen platformbeheer of tenantlidmaatschap. De behandelaar verschijnt met
een herkenbare naam in platformtickets.

Supportaccounts loggen in met OTP op de platformhost en landen in de supportdesk.
De navigatie toont alleen toegestane onderdelen. Teamwijzigingen vereisen een
platformbeheerder die in de afgelopen vijftien minuten met OTP is ingelogd.
Intrekking wordt opnieuw gecontroleerd bij de volgende serveraanvraag, ook
binnen een bestaande sessie. Zoekfunctie, sortering, paginatie, tabbladen en
dialogen volgen de gedeelde dashboardstijl op desktop en mobiel.

De supportcockpit heeft directe links naar **Reactie nodig**, **Niet toegewezen**
en **Termijn verstreken**. De antwoordvoorbereiding noemt voortaan de melder,
zodat de terugkoppeling ook voor klantmeldingen duidelijk is.

## Dagelijks supportproces

1. Personeel of klant opent een eigen melding in het eigen portaal.
2. De tenant behandelt het oorspronkelijke gesprek. Interne tenantnotities blijven intern.
3. De tenant deelt een gecontroleerde technische omschrijving en gekozen veilige
   bijlagen met Fieldgrid. Er ontstaat een afzonderlijk supportticket.
4. Een bevoegde supportmedewerker pakt dit ticket op en antwoordt aan de tenant.
   Fieldgrid-notities blijven binnen de bevoegde platformgroep.
5. De tenant gebruikt het antwoordconcept, controleert of bewerkt dit en stuurt
   het expliciet naar de oorspronkelijke melder. Beide tickets houden hun eigen status.

Een behandelaar toewijzen verruimt geen rechten. Het sluiten van een
Fieldgrid-ticket sluit niet automatisch de oorspronkelijke personeels- of klantmelding.
Dit voorkomt dat een onbeoordeeld platformantwoord rechtstreeks bij de melder belandt.

## Nog ontbrekend en aanbevolen volgorde

| Prioriteit | Verbetering | Waarom |
| --- | --- | --- |
| 1 | Operationeel scherm voor workerachterstand, mail-/pushfouten, scanstoringen en providerlimieten | Gezonde webhealth alleen vertelt niet of alle achtergrondleveringen tijdig zijn verwerkt |
| 1 | Teamcapaciteit, ticketdoorlooptijd en SLA-rapportage | De huidige wachtrijen helpen afhandelen; trends en verdeling per medewerker ontbreken |
| 1 | Kennisbank en beheerde antwoordtemplates voor support | Herhaalvragen sneller en consequent beantwoorden, met controle vóór versturen |
| 2 | Tenant pauzeren/hervatten met impactoverzicht en audit | Status wordt getoond, maar een complete beheerde lifecycleactie ontbreekt |
| 2 | Incidenten en onderhoudscommunicatie | Eén storing kunnen koppelen aan meerdere tickets en gericht communiceren |
| 2 | Auditexport met beperkt bereik | Teamactiviteit bestaat, maar een platformbrede export met filters ontbreekt |
| 3 | Abonnementen, platformfacturatie en commerciële tenantlifecycle | Tenantfacturen aan klanten bestaan; SaaS-facturatie van Fieldgrid aan tenants is een afzonderlijke functie |

Een supportmedewerker kan direct werken na uitnodiging en OTP-login. Mail blijft
afhankelijk van de ingestelde SendGrid-afzender en Supabase Auth-limieten.
Een onbekende verzenduitkomst wordt zichtbaar bewaard en niet automatisch
opnieuw verstuurd. De huidige versie heeft geen provideronderzoek-/herstelknop
voor zulke onzekere uitnodigingen. Deze operationele verbetering hoort bij prioriteit 1.

## Verificatie en grenzen

De releasecontrole omvat unit-/type-/lintcontrole, een schone replay van 135
migraties, 881 databasechecks (398 pgTAP en 483 Node-contractchecks) en tien echte
HTTP-privacychecks. De nieuwe
supportteamchecks testen actuele OTP, tenantbereik, revisies, herhaalde opdrachten,
eenmalige verzendclaims, intrekking en afgeschermde notities. De ticketketen is
afzonderlijk getest voor personeel en klanten. Browserflows controleren de
platformpagina's, echte OTP-uitnodiging en intrekking, ticketescalatie,
werkbonvrijgave en de aangesloten reistijd op desktop en mobiel.

Deze verificatie maakt geen uitspraak over elk werkelijk eindapparaat of iedere
providerconfiguratie. Main-CI, stagingacceptatie, productiepromotie en exact-SHA
web-/workerhealth blijven afzonderlijke releasegates.
