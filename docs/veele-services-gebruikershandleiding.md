# Veele Services Platform

## Gebruikershandleiding voor management, planning, administratie, personeel en klanten

**Documentversie:** 1.0
**Documentdatum:** 24 juni 2026
**Doelgroep:** Veele Services VOF, management, planning, administratie, medewerkers en klanten
**Status:** gebruikershandleiding voor bekijken, gebruiken en testen van het platform
**Omgeving:** geschikt voor gebruik op acceptatie/staging en als basis voor productie-instructie

---

## Documentbeheer

| Onderdeel | Waarde |
| --- | --- |
| Product | Veele Services Platform |
| Document | Gebruikershandleiding |
| Versie | 1.0 |
| Taal | Nederlands |
| Bedoeld voor | Niet-technische en operationele gebruikers |
| Laatst bijgewerkt | 24 juni 2026 |
| Gebruik | Overdracht, instructie, interne training en acceptatietest |

Deze handleiding beschrijft het Veele Services Platform zoals het platform in de huidige versie is opgebouwd. De handleiding is geschreven voor dagelijks gebruik door mensen die het platform moeten begrijpen, beoordelen, testen of gebruiken. Technische details, ontwikkelnotities en geheime instellingen zijn bewust weggelaten.

Wanneer een onderdeel in de applicatie aanwezig is maar nog bedoeld is voor acceptatietesten, wordt dat duidelijk aangegeven met termen zoals **beschikbaar ter test**, **controlepunt tijdens acceptatietest** of **in voorbereiding**. Zo is zichtbaar wat al gebruikt kan worden en welke onderdelen extra aandacht vragen tijdens de testfase.

---

## Inhoudsopgave

1. [Inleiding](#1-inleiding)
2. [Wat is het Veele Services Platform?](#2-wat-is-het-veele-services-platform)
3. [Voor wie is het platform bedoeld?](#3-voor-wie-is-het-platform-bedoeld)
4. [De hoofdgedachte: alles draait om de werkbon](#4-de-hoofdgedachte-alles-draait-om-de-werkbon)
5. [Rollen binnen het platform](#5-rollen-binnen-het-platform)
6. [Hoofdproces van aanvraag tot betaling](#6-hoofdproces-van-aanvraag-tot-betaling)
7. [Backoffice voor Veele Services](#7-backoffice-voor-veele-services)
8. [Managementdashboard](#8-managementdashboard)
9. [Klantenbeheer](#9-klantenbeheer)
10. [Objectbeheer](#10-objectbeheer)
11. [Opdrachten en werkbonnen](#11-opdrachten-en-werkbonnen)
12. [Offertes en klantakkoord](#12-offertes-en-klantakkoord)
13. [Planning en slim plannen](#13-planning-en-slim-plannen)
14. [Personeelsbeheer](#14-personeelsbeheer)
15. [Rapportages, meerwerk en materiaal](#15-rapportages-meerwerk-en-materiaal)
16. [Facturen, betalingen en verzamelfacturen](#16-facturen-betalingen-en-verzamelfacturen)
17. [Tickets, berichten en meldingen](#17-tickets-berichten-en-meldingen)
18. [Nieuws en communicatie](#18-nieuws-en-communicatie)
19. [Documenten](#19-documenten)
20. [Instellingen, rollen en rechten](#20-instellingen-rollen-en-rechten)
21. [Personeelsapp](#21-personeelsapp)
22. [Klantportaal](#22-klantportaal)
23. [Veiligheid, privacy en zichtbaarheid](#23-veiligheid-privacy-en-zichtbaarheid)
24. [Dagelijkse voorbeeldscenario's](#24-dagelijkse-voorbeeldscenarios)
25. [Smoke tests en gebruikerstests](#25-smoke-tests-en-gebruikerstests)
26. [Acceptatiecontrole per rol](#26-acceptatiecontrole-per-rol)
27. [Begrippenlijst](#27-begrippenlijst)

---

## 1. Inleiding

Het Veele Services Platform is ontwikkeld als centrale digitale werkomgeving voor de dienstverlening van Veele Services. Het platform brengt klanten, objecten, aanvragen, werkbonnen, planning, personeel, rapportages, facturen, betalingen, documenten, tickets en meldingen samen in een samenhangend systeem.

De handleiding is bedoeld voor drie situaties:

1. **Overdracht:** Veele Services kan zien welke onderdelen beschikbaar zijn en hoe deze bedoeld zijn.
2. **Gebruik:** management, planning, administratie, personeel en klanten kunnen stapsgewijs leren werken met het platform.
3. **Acceptatietest:** Veele Services kan controleren of de dagelijkse processen goed aansluiten op de praktijk.

De tekst is bewust praktisch geschreven. Waar mogelijk wordt uitgelegd wat een scherm doet, welke acties een gebruiker kan uitvoeren, wanneer een actie gebruikt wordt en welke controlepunten belangrijk zijn.

---

## 2. Wat is het Veele Services Platform?

Het Veele Services Platform is een operationeel SaaS-platform voor schoonmaak, beveiliging en facilitaire dienstverlening. Het platform ondersteunt de volledige keten van dienstverlening:

| Stap | Betekenis |
| --- | --- |
| Klant | De opdrachtgever waarvoor Veele Services werkt |
| Object | De locatie of het pand waar werk wordt uitgevoerd |
| Aanvraag | Een verzoek voor werkzaamheden |
| Werkbon | De operationele opdracht die gepland en uitgevoerd wordt |
| Planning | Het koppelen van werkbonnen aan medewerkers en tijdvakken |
| Uitvoering | Het uitvoeren van de werkzaamheden door personeel |
| Rapportage | Vastleggen wat is gedaan, inclusief notities en bijlagen |
| Facturatie | Omzetten van goedgekeurde werkzaamheden naar factuurvoorstellen en facturen |
| Betaling | Betaling door de klant, onder andere via het klantportaal |

Het platform bestaat uit drie hoofdonderdelen:

1. **Backoffice**
   Voor management, planning, administratie en beheerders van Veele Services.

2. **Personeelsapp**
   Voor medewerkers die opdrachten uitvoeren, beschikbaarheid doorgeven, werkbonnen bekijken, werkzaamheden starten/afronden en rapporteren.

3. **Klantportaal**
   Voor klanten die objecten beheren, aanvragen indienen, statussen volgen, offertes beoordelen, rapportages bekijken, facturen betalen en tickets plaatsen.

Daarnaast bevat het platform ondersteunende onderdelen zoals e-mail, pushmeldingen, nieuws, documenten, tickets, rollen, rechten, auditlogging en instellingen.

---

## 3. Voor wie is het platform bedoeld?

### 3.1 Management

Management gebruikt het platform om overzicht te houden over de operatie. Denk aan open opdrachten, capaciteit, rapportages die wachten op controle, financiele voortgang, tickets, meldingen en risico's.

Management ziet vooral:

- operationele dashboards;
- klant- en objectinformatie;
- opdrachtstatussen;
- planningssignalen;
- rapportages en kwaliteitscontrole;
- facturen en openstaande posten;
- tickets en klachten;
- auditlog en beheerinstellingen.

### 3.2 Planning

Planning gebruikt het platform dagelijks om werkbonnen te beoordelen, capaciteit te controleren, medewerkers te selecteren, interessepeilingen te starten en werkbonnen in te plannen.

Planning werkt vooral met:

- opdrachten;
- het digitale planbord;
- slimme planning;
- personeelsbeschikbaarheid;
- verlof en ziekte;
- vaste teams;
- objectervaring;
- meldingen richting medewerkers.

### 3.3 Administratie

Administratie gebruikt het platform voor facturatie, betalingen, financiele controle, documenten en verzamelfacturen.

Administratie werkt vooral met:

- factuurvoorstellen;
- facturen;
- betalingsstatussen;
- verzamelfacturen;
- Mollie-betalingen;
- documenten;
- rapportages die als basis dienen voor facturatie.

### 3.4 Personeel

Personeel gebruikt de mobiele personeelsapp. De app is bedoeld voor gebruik onderweg en op locatie.

Medewerkers kunnen:

- hun planning bekijken;
- open opdrachten bekijken;
- interesse tonen voor opdrachten;
- werkbonnen openen;
- werkzaamheden starten;
- taken afvinken;
- meerwerk en materiaal registreren;
- rapportagenotities toevoegen;
- foto's en video's toevoegen;
- werkbonnen afronden of afmelden;
- beschikbaarheid en verlof beheren;
- berichten, meldingen en nieuws lezen.

### 3.5 Klanten

Klanten gebruiken het klantportaal om hun dienstverlening bij Veele Services te volgen en te beheren.

Klanten kunnen:

- hun dashboard bekijken;
- objecten beheren;
- nieuwe aanvragen indienen;
- opdrachten volgen;
- offertes bekijken en akkoord geven;
- rapportages bekijken;
- facturen bekijken en betalen;
- documenten downloaden;
- meldingen lezen;
- tickets plaatsen en volgen.

---

## 4. De hoofdgedachte: alles draait om de werkbon

De centrale gedachte van het platform is dat de **werkbon** het hart van de operatie is. Een werkbon verbindt de klant, het object, de werkzaamheden, de planning, de medewerker, de rapportage en de factuur.

Een werkbon kan in verschillende fases zitten. Bijvoorbeeld:

- aangevraagd;
- beoordeeld;
- geoffreerd;
- akkoord;
- planbaar;
- ingepland;
- gezien door medewerker;
- gestart;
- afgerond;
- afgemeld;
- gecontroleerd;
- factureerbaar;
- gefactureerd;
- betaald;
- afgehandeld.

Niet elke organisatie gebruikt altijd elke stap even uitgebreid. Het platform is daarom ingericht om zowel eenvoudige als uitgebreidere processen te ondersteunen.

Voor Veele Services betekent dit praktisch:

1. Een klant of backoffice maakt een aanvraag aan.
2. Veele Services beoordeelt of de opdracht uitgevoerd kan worden.
3. Planning controleert capaciteit en geschikte medewerkers.
4. Eventueel wordt een offerte gemaakt.
5. Na akkoord wordt de werkbon gepland.
6. De medewerker voert de werkbon uit.
7. Rapportage, meerwerk en materiaal worden vastgelegd.
8. Management of administratie controleert de afronding.
9. Er ontstaat een factuurvoorstel of factuur.
10. De klant betaalt.

---

## 5. Rollen binnen het platform

Het platform werkt met rollen en rechten. Een rol bepaalt welke onderdelen een gebruiker mag zien en welke acties hij of zij mag uitvoeren.

### 5.1 Voorbeelden van rollen

| Rol | Voorbeeldgebruik |
| --- | --- |
| Management | Overzicht, controle, rapportage, instellingen |
| Planning | Werkbonnen plannen, capaciteit bekijken, medewerkers koppelen |
| Administratie | Facturen, betalingen, documenten en financiele controle |
| Teamleiding | Medewerkers ondersteunen, werkbonnen controleren |
| Personeel | Werkbonnen uitvoeren en rapporteren |
| Klantgebruiker | Klantportaal bekijken en aanvragen volgen |
| Beheerder | Rollen, rechten, instellingen en gebruikers beheren |

### 5.2 Waarom rollen belangrijk zijn

Rollen zorgen ervoor dat gebruikers alleen zien wat voor hun werk nodig is. Een klant ziet bijvoorbeeld geen interne notities, geen interne planningsinformatie en geen personeelsnamen in klantgerichte rapportages. Een medewerker ziet alleen eigen planning, eigen werkbonnen en passende open opdrachten. Management kan meer informatie zien omdat die rol verantwoordelijk is voor controle en aansturing.

---

## 6. Hoofdproces van aanvraag tot betaling

Dit hoofdstuk beschrijft de standaardroute door het platform.

### 6.1 Stap 1: klant en object

Een opdracht begint meestal bij een klant en een object. Het object is de locatie waar de werkzaamheden plaatsvinden. Voorbeelden:

- appartementencomplex;
- kantoor;
- zorglocatie;
- evenemententerrein;
- distributiehal;
- parkeergarage;
- winkelpand.

Een goed ingevuld object bevat:

- objectnaam;
- adresgegevens;
- plaats;
- contactpersoon;
- telefoonnummer;
- sector;
- toegangsinformatie;
- sleutelinformatie;
- bijzondere instructies;
- vaste teams of voorkeursmedewerkers;
- documenten en historie.

### 6.2 Stap 2: aanvraag

Een aanvraag kan via het klantportaal of via backoffice worden aangemaakt. De aanvraag beschrijft wat de klant nodig heeft.

Voorbeelden:

- extra schoonmaak;
- beveiliging tijdens een evenement;
- facilitaire ondersteuning;
- periodieke controle;
- storing of incident;
- spoedopdracht.

### 6.3 Stap 3: beoordeling en capaciteit

Veele Services beoordeelt de aanvraag. Daarbij kan het platform helpen met een capaciteitscheck:

- welke sector hoort erbij;
- hoeveel medewerkers zijn nodig;
- welke functies of certificaten zijn nodig;
- welke medewerkers zijn beschikbaar;
- welke medewerkers passen het best;
- zijn er conflicten met bestaande planning;
- is verlof of ziekte relevant;
- is een interessepeiling nodig.

Deze functie is beschikbaar als onderdeel van **slim plannen** en is bedoeld om planning en management sneller inzicht te geven.

### 6.4 Stap 4: offerte of akkoord

Als de aanvraag prijsafspraken nodig heeft, kan Veele Services een offerte maken. De klant kan de offerte bekijken in het klantportaal en akkoord geven of afwijzen.

Als er geen offerte nodig is, kan de opdracht direct worden goedgekeurd en planbaar worden gemaakt.

### 6.5 Stap 5: planning

Planning koppelt een of meerdere medewerkers aan de werkbon. Bij opdrachten waarbij meerdere medewerkers nodig zijn, ondersteunt het platform teambezetting.

Planning kan:

- open werkbonnen bekijken;
- geschikte medewerkers bekijken;
- medewerkers handmatig selecteren;
- interessepeilingen starten;
- medewerkers als reserve markeren;
- werkbonnen verplaatsen;
- werktijden aanpassen;
- conflicten controleren.

### 6.6 Stap 6: uitvoering

De medewerker ziet de werkbon in de personeelsapp. Bij het openen wordt zichtbaar:

- opdrachtnummer;
- datum en tijd;
- object;
- plaats;
- contactgegevens;
- werkzaamheden;
- klantopmerkingen;
- status;
- taken;
- meerwerk;
- materiaal;
- rapportage.

De medewerker kan de werkbon starten, uitvoeren en afronden.

### 6.7 Stap 7: rapportage

Tijdens of na uitvoering maakt de medewerker rapportagenotities. Een notitie kan tekst bevatten en is voorbereid op media zoals foto's en video's. In klantgerichte weergave wordt Veele Services als uitvoerder getoond; backoffice kan intern zien welke medewerker de notitie heeft geplaatst.

### 6.8 Stap 8: facturatie en betaling

Na goedkeuring van rapportage kan administratie een factuurvoorstel controleren. Taken, meerwerk, materiaal en bedragen kunnen worden meegenomen. Daarna kan een losse factuur of verzamelfactuur ontstaan.

Klanten kunnen facturen bekijken en betalen via het klantportaal.

---

## 7. Backoffice voor Veele Services

De backoffice is het hoofdscherm voor Veele Services. De backoffice is desktop-first ontworpen, omdat management, planning en administratie meestal met grotere schermen werken.

### 7.1 Navigatie

De backoffice bevat een zijmenu met de belangrijkste modules:

- Dashboard;
- Planning;
- Opdrachten;
- Offertes;
- Klanten;
- Objecten;
- Personeel;
- Verlof-inbox;
- Rapporten;
- Facturen;
- Documenten;
- Tickets;
- Nieuws;
- Instellingen.

De header bevat een zoekbalk, paginatitel en profielmenu. De sidebar kan op desktop worden ingeklapt naar iconen, zodat het planbord of andere brede schermen meer ruimte krijgen.

### 7.2 Algemene werkwijze

Een backofficegebruiker werkt meestal vanuit een van drie invalshoeken:

1. **Vanuit klant:** klant openen, objecten bekijken, lopende opdrachten controleren.
2. **Vanuit opdracht:** werkbon openen, status en planning controleren.
3. **Vanuit planning:** open werkbonnen plaatsen bij beschikbare medewerkers.

### 7.3 Controlepunten tijdens acceptatietest

Controleer in de backoffice:

- of de sidebar op desktop goed inklapt en uitklapt;
- of de header overal dezelfde structuur heeft;
- of de zoekfunctie naar de juiste module verwijst;
- of de gebruiker alleen modules ziet waarvoor hij rechten heeft;
- of detailpagina's niet leeg of fout laden;
- of statussen begrijpelijk zijn voor niet-technische gebruikers.

---

## 8. Managementdashboard

Het dashboard geeft een operationeel overzicht van de stand van zaken. Het doel is dat management snel ziet waar aandacht nodig is.

### 8.1 Wat toont het dashboard?

Het dashboard bevat of ondersteunt stuurinformatie zoals:

- omzet;
- open opdrachten;
- spoedopdrachten;
- afgemelde opdrachten;
- rapportages in controle;
- open facturen;
- betaalstatus;
- personeelscapaciteit;
- certificaten die binnenkort verlopen;
- tickets en incidenten;
- planning-signalen.

### 8.2 Hoe gebruikt management het dashboard?

1. Open de backoffice.
2. Ga naar **Dashboard**.
3. Bekijk de tegels en signalen.
4. Klik door naar een module wanneer een tegel aandacht vraagt.
5. Controleer dagelijks openstaande acties, tickets en rapportages.

### 8.3 Voorbeeldscenario

Management ziet dat er meerdere rapportages wachten op controle. Vanuit het dashboard klikt management door naar rapportages, controleert de inhoud en keurt de rapportages goed of vraagt correcties aan. Daarna kan administratie de facturatie voorbereiden.

---

## 9. Klantenbeheer

Klantenbeheer is bedoeld om alle informatie rond een opdrachtgever centraal bij te houden.

### 9.1 Klantenlijst

In de klantenlijst kan Veele Services klanten zoeken en openen. Afhankelijk van rechten kan een gebruiker klanten aanmaken of wijzigen.

Een klant bevat onder andere:

- bedrijfsnaam;
- type klant;
- contactgegevens;
- gekoppelde gebruikers;
- objecten;
- opdrachten;
- tickets;
- documenten;
- facturen;
- betalingen;
- interne notities;
- klantzichtbare notities;
- historie.

### 9.2 Klantdetailpagina als mini CRM

De klantdetailpagina is ingericht als mini CRM. Het doel is dat management, planning en administratie direct antwoord krijgen op vragen zoals:

- Wie is de klant?
- Welke objecten horen bij deze klant?
- Welke opdrachten lopen er?
- Welke aanvragen staan open?
- Zijn er open tickets?
- Zijn er open facturen?
- Welke documenten horen bij deze klant?
- Welke interne aandachtspunten zijn er?

### 9.3 Interne en klantzichtbare informatie

Het platform maakt onderscheid tussen interne informatie en klantzichtbare informatie.

| Type informatie | Zichtbaar voor klant? | Voorbeeld |
| --- | --- | --- |
| Interne notitie | Nee | "Planning let op: ingang via achterzijde" |
| Klantzichtbare notitie | Ja | "Volgende onderhoudsronde gepland" |
| Interne rapportagecontrole | Nee | Beoordeling door management |
| Goedgekeurde rapportage | Ja | Samenvatting van uitgevoerde werkzaamheden |

### 9.4 Stappen: klant controleren

1. Ga naar **Klanten**.
2. Zoek op klantnaam.
3. Open de klant.
4. Controleer contactgegevens.
5. Controleer gekoppelde objecten.
6. Controleer open opdrachten en tickets.
7. Controleer facturen en betalingen.
8. Voeg waar nodig interne of klantzichtbare notities toe.

---

## 10. Objectbeheer

Objecten zijn de locaties waar Veele Services werkzaamheden uitvoert. Objectbeheer is belangrijk omdat planning, uitvoering, rapportage en facturatie vaak aan een object gekoppeld zijn.

### 10.1 Wat staat op een object?

Een object kan onder andere bevatten:

- objectnaam;
- klant;
- adres;
- postcode;
- plaats;
- regio;
- sector;
- contactpersoon;
- telefoonnummer;
- sleutel- en toegangsinformatie;
- objectnotities;
- vaste teams;
- voorkeursmedewerkers;
- documenten;
- historie;
- performancegegevens.

### 10.2 Objecthistorie

Objecthistorie helpt om te zien wat er eerder op een locatie is gebeurd. Denk aan:

- eerdere opdrachten;
- rapportages;
- incidenten;
- tickets;
- foto's en bijlagen;
- open acties.

### 10.3 Objectperformance

Objectperformance geeft inzicht in hoe het object operationeel loopt. Voorbeelden:

- aantal opdrachten;
- afgeronde opdrachten;
- niet-afgeronde opdrachten;
- incidenten;
- open tickets;
- open acties;
- recente rapportages.

### 10.4 Vaste teams en voorkeursmedewerkers

Voor sommige objecten is het wenselijk dat dezelfde medewerkers terugkomen. Het platform ondersteunt vaste teams en voorkeursmedewerkers. Deze informatie kan gebruikt worden bij planning en slimme matching.

### 10.5 Controlepunten tijdens acceptatietest

Controleer per object:

- of adresgegevens juist worden getoond;
- of gevoelige toegangsinformatie niet zichtbaar is voor klanten wanneer dat niet de bedoeling is;
- of historie en performance logisch gevuld worden;
- of vaste teams zichtbaar zijn voor planning;
- of objecten aan de juiste klant gekoppeld zijn.

---

## 11. Opdrachten en werkbonnen

Opdrachten en werkbonnen vormen het operationele hart van het platform.

### 11.1 Opdrachtenlijst

In de opdrachtenlijst ziet Veele Services opdrachten en werkbonnen. De lijst ondersteunt statusinzicht en zoeken/filteren.

Belangrijke informatie:

- opdrachtnummer;
- klant;
- object;
- sector;
- geplande datum;
- tijdslot;
- status;
- prioriteit;
- gekoppelde medewerkers;
- taken;
- capaciteit en matching.

### 11.2 Werkbonnummering

Werkbonnen gebruiken een herkenbaar nummer op basis van sector, jaar, maand en volgnummer. Voorbeelden:

- `SCH-2026-0600001` voor schoonmaak;
- `BEV-2026-0600002` voor beveiliging;
- `FAC-2026-0600003` voor facilitair.

Het nummer helpt om snel te herkennen in welke sector de werkbon valt en in welke periode deze is aangemaakt.

### 11.3 Opdrachtdetail

Op de opdrachtdetailpagina staat informatie over:

- klant;
- object;
- regio;
- datum;
- tijdslot;
- status;
- medewerkers;
- taken;
- documenten;
- capaciteit en matching;
- statuswijzigingen.

### 11.4 Statussen

Statussen zijn bedoeld om duidelijk te maken waar de opdracht zich in het proces bevindt. Voorbeelden:

| Status | Betekenis |
| --- | --- |
| Aangevraagd | De opdracht is ingediend |
| Goedgekeurd | Veele Services heeft de opdracht beoordeeld |
| Planbaar | De opdracht kan ingepland worden |
| Ingepland | Er is personeel gekoppeld |
| Gezien | De medewerker heeft de werkbon geopend |
| In uitvoering | De medewerker is gestart |
| Afgerond | De werkbon is succesvol afgerond |
| Afgemeld | De werkbon kon niet volledig worden uitgevoerd |
| Rapportage controle | De rapportage wacht op beoordeling |
| Factureerbaar | De opdracht kan financieel verwerkt worden |
| Gefactureerd | Er is een factuur gemaakt |
| Betaald | De factuur is betaald |

### 11.5 Controlepunten

Tijdens acceptatietesten is het belangrijk om te controleren:

- of statussen logisch veranderen;
- of klanten alleen klantgeschikte informatie zien;
- of personeel alleen eigen werkbonnen ziet;
- of meerdere medewerkers op een werkbon mogelijk zijn;
- of wijzigingen in planning zichtbaar worden in de personeelsapp.

---

## 12. Offertes en klantakkoord

Offertes worden gebruikt wanneer een klant eerst akkoord moet geven op kosten of voorwaarden.

### 12.1 Offerteproces

1. Veele Services beoordeelt een aanvraag.
2. Taken, prijzen en voorwaarden worden vastgelegd.
3. De offerte wordt klaargezet voor de klant.
4. De klant bekijkt de offerte in het klantportaal.
5. De klant geeft akkoord of wijst af.
6. Bij akkoord wordt de opdracht planbaar of kan planning verder.

### 12.2 Voor de klant

De klant ziet in het klantportaal:

- offerte-informatie;
- werkzaamheden;
- prijs;
- status;
- mogelijkheid om akkoord te geven of af te wijzen.

### 12.3 Controlepunt tijdens acceptatie

Test minimaal een volledige offerteflow:

1. Maak een aanvraag aan.
2. Maak een offerte.
3. Laat een klantgebruiker inloggen.
4. Laat de klant akkoord geven.
5. Controleer of de opdracht daarna correct verder kan in planning.

---

## 13. Planning en slim plannen

Planning is een van de belangrijkste onderdelen van het platform. Het planbord is bedoeld als dagelijkse cockpit voor planning.

### 13.1 Digitaal planbord

Het planbord toont medewerkers en geplande werkbonnen. Het bord ondersteunt:

- datumselectie;
- zoeken;
- filters;
- 24-uurs planning;
- actuele tijdlijn;
- openstaande werkbonnen;
- statuskleuren;
- medewerkers;
- beschikbaarheid;
- matchinformatie;
- teambezetting;
- verplaatsen en plannen van werkbonnen.

Openstaande werkbonnen zijn beschikbaar via een compacte werkvoorraad. Hierdoor blijft het planbord breed en overzichtelijk.

### 13.2 Sidebar inklappen

Op desktop kan de sidebar worden ingeklapt naar iconen. Dit is vooral handig op het planbord, omdat planning veel horizontale ruimte nodig heeft.

Stappen:

1. Open de backoffice.
2. Ga naar **Planning**.
3. Gebruik de knop in de header om de sidebar in te klappen.
4. Gebruik dezelfde knop om de sidebar weer uit te klappen.

### 13.3 Slim plannen

Slim plannen helpt planning om geschikte medewerkers te vinden. Het systeem kijkt naar harde voorwaarden en matchcriteria.

Voorbeelden van harde voorwaarden:

- medewerker is actief;
- medewerker is niet ziek;
- medewerker heeft geen verlof;
- medewerker is beschikbaar;
- medewerker heeft geen overlappende planning;
- medewerker past bij de sector;
- medewerker heeft de juiste rol of functie;
- verplichte certificaten, diploma's of kennis zijn aanwezig;
- regio past bij object of opdracht.

Daarna kan een matchscore worden gebruikt. De score is uitlegbaar, zodat planning kan zien waarom iemand goed of minder goed past.

### 13.4 Capaciteitsblok

Bij opdrachten kan een capaciteitsblok zichtbaar zijn. Dit geeft bijvoorbeeld aan:

- hoeveel medewerkers nodig zijn;
- hoeveel geschikte medewerkers beschikbaar zijn;
- hoeveel topmatches er zijn;
- hoeveel blokkades er zijn;
- of capaciteit voldoende is.

### 13.5 Interessepeiling

Planning kan medewerkers uitnodigen voor een interessepeiling. Dit is geen definitieve planning. Het betekent alleen dat de medewerker kan aangeven of hij of zij interesse heeft.

Medewerkerreacties kunnen zijn:

- uitgenodigd;
- bekeken;
- interesse;
- niet beschikbaar;
- vraag gesteld;
- geselecteerd;
- reserve;
- bevestigd;
- verlopen.

### 13.6 Belangrijke regel

In de huidige opzet plant het systeem niet volledig automatisch. Planning blijft verantwoordelijk voor definitieve plaatsing. Dat is bewust, omdat planning de operationele context kent en uitzonderingen kan beoordelen.

### 13.7 Controlepunten tijdens acceptatie

Controleer:

- of het planbord binnen de viewport blijft;
- of alleen het bord zelf horizontaal scrollt;
- of de actuele tijd correct zichtbaar is;
- of open werkbonnen via de werkvoorraad te gebruiken zijn;
- of statuskleuren logisch zijn;
- of medewerkers met goede match bovenaan komen bij een geselecteerde werkbon;
- of meerdere medewerkers op een werkbon gekoppeld kunnen worden.

---

## 14. Personeelsbeheer

Personeelsbeheer bevat de dossiers van medewerkers.

### 14.1 Personeelslijst

In de personeelslijst kan Veele Services medewerkers zoeken, bekijken en beheren.

Een personeelsdossier kan bevatten:

- naam;
- e-mailadres;
- telefoonnummer;
- adresgegevens;
- functie/rol;
- sector;
- regio;
- contractinformatie;
- beschikbaar voor planning;
- profielinformatie;
- gekoppelde objecten;
- certificaten;
- diploma's;
- kennisgebieden;
- documenten.

### 14.2 Uitnodigen van medewerkers

Medewerkers kunnen toegang krijgen tot de personeelsapp. Bij uitnodiging ontvangt de medewerker een tijdelijk wachtwoord of instructie om in te loggen, afhankelijk van de gekozen inrichting.

Bij eerste gebruik kan gevraagd worden om het wachtwoord te wijzigen.

### 14.3 Certificaten, diploma's en kennis

Voor planning is het belangrijk om vast te leggen welke kwalificaties medewerkers hebben.

Voorbeelden:

- beveiligingsdiploma;
- schoonmaakcertificaat;
- BHV;
- VCA;
- objectinstructie;
- afzuigsysteemreiniging;
- glasbewassing;
- facilitair materiaalgebruik.

Kwalificaties kunnen verloopdatums hebben. Dit helpt planning om te voorkomen dat iemand wordt ingepland op een opdracht waarvoor een verlopen certificaat vereist is.

### 14.4 Verlof en ziekte

De backoffice bevat een verlof-inbox. Medewerkers kunnen verlof aanvragen via de personeelsapp. Planning of management kan aanvragen beoordelen.

Controleer tijdens acceptatie:

- of open aanvragen zichtbaar zijn;
- of gesloten aanvragen zichtbaar blijven;
- of verlopen aanvragen logisch worden weergegeven;
- of verlof planning blokkeert waar nodig.

---

## 15. Rapportages, meerwerk en materiaal

Rapportage legt vast wat op locatie is gebeurd.

### 15.1 Rapportagenotities

Een medewerker kan notities toevoegen aan een werkbon. Elke notitie kan een tijdstip hebben en kan worden gebruikt om werkzaamheden, bijzonderheden of opmerkingen vast te leggen.

Belangrijk:

- klantgerichte weergave toont Veele Services als uitvoerder;
- backoffice kan intern zien welke medewerker de notitie heeft geplaatst;
- notities kunnen voorbereid zijn voor bijlagen zoals foto's en video's;
- interne opmerkingen mogen niet naar klanten.

### 15.2 Taken en checklist

Werkbonnen kunnen taken bevatten. Een medewerker kan werkzaamheden afvinken. Dit helpt om te controleren of alle afgesproken onderdelen zijn uitgevoerd.

### 15.3 Meerwerk

Meerwerk is extra werk dat op locatie wordt bepaald. In de personeelsapp kan meerwerk worden vastgelegd. Het platform kan daarbij rekening houden met tijd en kosten.

Voorbeelden:

- extra schoonmaakronde;
- vervangen van klein materiaal;
- aanvullende controle;
- extra beveiligingsuur;
- spoedondersteuning.

### 15.4 Materiaal en verbruik

Materiaal of verbruik kan worden vastgelegd bij een werkbon. Dit kan later relevant zijn voor rapportage of facturatie.

### 15.5 Afronden of afmelden

Een medewerker kan een werkbon afronden wanneer de werkzaamheden klaar zijn. Als de werkzaamheden niet afgerond kunnen worden, kan de medewerker afmelden met een reden.

Voorbeelden van redenen:

- klant niet aanwezig;
- geen toegang tot object;
- sleutel of toegangscode werkt niet;
- klant niet akkoord op locatie;
- tijd tekort;
- meerwerk nodig;
- materiaal ontbreekt;
- onveilige situatie;
- opdrachtinformatie onduidelijk;
- locatie annuleert op locatie.

---

## 16. Facturen, betalingen en verzamelfacturen

Facturatie vormt de verbinding tussen uitgevoerde werkzaamheden en financiele afhandeling.

### 16.1 Factuurvoorstellen

Na controle van rapportage kan een factuurvoorstel ontstaan. Een factuurvoorstel is nog geen definitieve factuur. Administratie kan controleren:

- welke opdracht wordt gefactureerd;
- welke taken zijn uitgevoerd;
- welk meerwerk is geregistreerd;
- welk materiaal is gebruikt;
- welk btw-percentage geldt;
- welk totaalbedrag klopt.

### 16.2 Losse factuur

Een losse factuur hoort bij een opdracht of werkbon.

### 16.3 Verzamelfactuur

Een verzamelfactuur bundelt meerdere opdrachten. Dit is handig wanneer een klant meerdere werkbonnen in een periode wil ontvangen op een factuur.

Een verzamelfactuur kan rekening houden met:

- klant;
- periode;
- object;
- opdrachten;
- meerwerk;
- materiaal;
- btw;
- kortingen;
- toeslagen;
- betaalstatus.

### 16.4 Betalen via klantportaal

Klanten kunnen facturen en betalingen bekijken in het klantportaal. Betalingen kunnen gekoppeld zijn aan een betaalprovider. De betaalstatus wordt gebruikt om de financiele afhandeling te volgen.

### 16.5 Controlepunten

Controleer tijdens acceptatie:

- of facturen niet dubbel worden aangemaakt;
- of verzamelfacturen geen opdrachten dubbel opnemen;
- of bedragen kloppen;
- of btw correct wordt weergegeven;
- of klantgerichte PDF's geen interne informatie bevatten;
- of betaling terugkomt in de juiste status.

---

## 17. Tickets, berichten en meldingen

Het platform bevat meerdere communicatievormen.

### 17.1 Meldingen

Meldingen zijn korte berichten over acties of gebeurtenissen. Voorbeelden:

- nieuwe opdracht;
- planning aangepast;
- rapportage beschikbaar;
- offerte klaar;
- ticketreactie;
- factuur beschikbaar;
- certificaat verloopt binnenkort.

Meldingen kunnen zichtbaar zijn in het platform en waar ingesteld ook via e-mail of pushmelding.

### 17.2 Tickets

Tickets zijn bedoeld voor vragen of meldingen die opgevolgd moeten worden. Een ticket is meer gestructureerd dan een chatbericht.

Tickets kunnen ontstaan vanuit:

- klant;
- object;
- opdracht;
- personeel;
- planning;
- backoffice;
- intern overleg.

### 17.3 Berichten in de personeelsapp

Medewerkers kunnen via berichten/tickets communiceren met planning, management of backoffice. Wanneer een medewerker bij een werkbon een vraag stelt, kan dit aan de ticketflow gekoppeld worden.

### 17.4 Klanttickets

Klanten kunnen tickets aanmaken in het klantportaal. Klanten zien alleen tickets die voor hun klantomgeving bedoeld zijn.

### 17.5 Interne tickets

Interne tickets blijven zichtbaar voor backofficegebruikers en worden niet aan klanten getoond.

---

## 18. Nieuws en communicatie

Het platform bevat een nieuwssysteem.

### 18.1 Nieuws in backoffice

Backoffice kan nieuwsberichten aanmaken en beheren. Nieuws kan gericht zijn op medewerkers, klanten, groepen of sectoren.

Een nieuwsbericht kan bevatten:

- titel;
- inhoud;
- categorie;
- publicatiestatus;
- doelgroep;
- hero-afbeelding;
- opmaak via editor.

### 18.2 Nieuws in personeelsapp

Medewerkers zien nieuws in de personeelsapp. Nieuwsberichten kunnen worden geopend voor volledige inhoud.

### 18.3 Toepassing

Nieuws kan gebruikt worden voor:

- interne mededelingen;
- werkinstructies;
- planningupdates;
- veiligheidsinformatie;
- personeelsnieuws;
- aankondigingen richting klanten.

---

## 19. Documenten

Documenten ondersteunen het delen van bestanden binnen het platform.

### 19.1 Documenttypen

Documenten kunnen gekoppeld zijn aan:

- klant;
- object;
- opdracht;
- rapportage;
- factuur;
- personeelsdossier;
- certificaat;
- loonstrook;
- algemene documentatie.

### 19.2 Zichtbaarheid

Niet elk document is voor iedereen zichtbaar. Documentzichtbaarheid hangt af van rol en relatie.

Voorbeelden:

- klant ziet alleen eigen klantdocumenten;
- personeel ziet alleen eigen personeelsdocumenten en relevante opdrachtbijlagen;
- management kan documenten beheren volgens rechten;
- loonstroken zijn strikt persoonsgebonden.

### 19.3 Controlepunt

Controleer tijdens acceptatie altijd met twee verschillende klanten en twee verschillende medewerkers of documenten correct afgeschermd zijn.

---

## 20. Instellingen, rollen en rechten

Instellingen bepalen hoe het platform gebruikt wordt.

### 20.1 Organisatie

Organisatie-instellingen bevatten algemene gegevens en voorkeuren van Veele Services.

### 20.2 Sectoren

Sectoren worden gebruikt om opdrachten, medewerkers en taakcodes te categoriseren. Voor Veele Services zijn minimaal relevant:

- Schoonmaak;
- Beveiliging;
- Facilitair.

### 20.3 Taakcodes

Taakcodes beschrijven standaard werkzaamheden. Ze kunnen gebruikt worden bij offertes, werkbonnen, rapportage en planning.

Taakcodes kunnen gekoppeld worden aan:

- sector;
- standaardduur;
- prijs;
- functievereisten;
- certificaten;
- diploma's;
- kennisgebieden.

### 20.4 Slim plannen

In de instellingen voor slim plannen kunnen sectorregels en matchwegingen worden beheerd. Per sector kan worden ingesteld hoe zwaar onderdelen meetellen, zoals:

- beschikbaarheid;
- functie;
- certificaten/diploma's/kennis;
- regio;
- objectervaring;
- urenbelasting;
- spoedbeschikbaarheid;
- vaste teams;
- voorkeuren.

### 20.5 Mail en notificaties

Mail- en notificatie-instellingen bepalen hoe berichten worden verzonden en welke templates gebruikt worden. Dit is beschikbaar voor test en beheer.

### 20.6 Rollen en rechten

Beheerders kunnen rollen en rechten gebruiken om te bepalen welke modules zichtbaar zijn. Dit is belangrijk voor privacy en dagelijks gebruiksgemak.

### 20.7 Activiteitslog

De activiteitslog helpt om belangrijke acties terug te vinden. Denk aan wijzigingen in rollen, klanten, objecten, opdrachten, documenten en gevoelige gegevens.

---

## 21. Personeelsapp

De personeelsapp is bedoeld voor dagelijks gebruik door medewerkers. De app is mobile-first ontworpen en geschikt voor PWA-gebruik. Native app-ondersteuning is beschikbaar ter test wanneer de app als native Android-app wordt geinstalleerd.

### 21.1 Navigatie

De bottomnav bevat:

- Home;
- Nieuws;
- Planning;
- Uren;
- Meer.

Via **Meer** kan de medewerker onder andere naar:

- instellingen;
- berichten;
- open opdrachten;
- documenten;
- verlof;
- beschikbaarheid;
- profiel.

### 21.2 Home

De homepagina toont:

- begroeting;
- eerstvolgende dienst;
- snelle acties;
- nieuws of meldingen;
- toegang tot planning en uren.

Als er geen dienst gepland is, kan de app dit duidelijk tonen en verwijzen naar open diensten.

### 21.3 Mijn planning

De planning toont diensten per dag. De weekbalk laat dagen zien en de huidige dag kan actief zijn. Werkbonnen tonen onder andere:

- werkbonnummer;
- tijd;
- object;
- contactpersoon;
- adres;
- telefoonnummer;
- status.

De planning is bedoeld om realtime of bijna realtime wijzigingen te tonen wanneer planning een dienst verplaatst of aanpast. Dit is een belangrijk controlepunt tijdens acceptatie.

### 21.4 Werkbondetail

Wanneer een medewerker een werkbon opent, ziet hij of zij:

- statuslijn;
- klant- en objectgegevens;
- contactpersoon;
- adres;
- telefoonnummer;
- opmerkingen;
- tabbladen Home, Werkzaamheden en Rapportage.

### 21.5 Statuslijn

De statuslijn helpt om de voortgang vast te leggen.

| Stap | Betekenis |
| --- | --- |
| Gezien | Medewerker heeft de werkbon geopend |
| Gestart | Medewerker begint de werkzaamheden |
| Afgerond | Werkzaamheden zijn klaar of afgemeld |

Als de bon niet succesvol afgerond kan worden, wordt dit zichtbaar als afmelding.

### 21.6 Werkzaamheden

Het tabblad werkzaamheden toont:

- taken/checklist;
- meerwerk;
- materiaal/verbruik;
- totaal meerwerk;
- totaal materiaal.

Meerwerk en materiaal kunnen worden toegevoegd of aangepast, afhankelijk van rechten en status.

### 21.7 Rapportage

Rapportage bestaat uit losse notities. Elke notitie heeft datum en tijdstip. Een notitie kan later ook bijlagen bevatten zoals foto's of video's.

Voor klanten wordt de uitvoerder als Veele Services getoond. Backoffice kan intern zien wie de notitie heeft geplaatst.

### 21.8 Afronden

Bij afronden krijgt de medewerker een overzicht van:

- werkzaamheden;
- meerwerk;
- materialen;
- rapportage;
- eventuele bijlagen;
- eventueel handtekeningvak.

Wanneer een klantondertekening verplicht is, moet de klant akkoord geven op locatie. Dit is afhankelijk van afspraken met de klant.

### 21.9 Niet afgerond / afmelden

Als werkzaamheden niet afgerond zijn, kiest de medewerker een reden en vult eventueel een toelichting in.

Voorbeelden:

- klant niet aanwezig;
- geen toegang;
- materiaal ontbreekt;
- onveilige situatie;
- tijd tekort.

### 21.10 Open opdrachten en interesse

Open opdrachten tonen werkbonnen waarvoor de medewerker mogelijk geschikt is. Bij interessepeilingen kan de medewerker:

- interesse tonen;
- aangeven niet beschikbaar te zijn;
- een vraag stellen.

Interesse is geen definitieve planning. Planning selecteert daarna handmatig.

### 21.11 Beschikbaarheid

Medewerkers kunnen beschikbaarheid doorgeven. De beschikbaarheidspagina toont een kalender en ingevoerde dagen.

Medewerkers kunnen:

- tijden invullen;
- beschikbaarheid bewerken;
- herhaling kiezen;
- spoedbeschikbaarheid aangeven.

### 21.12 Verlof

Medewerkers kunnen verlof aanvragen. De pagina toont open, gesloten en verlopen aanvragen waar beschikbaar. Planning of management beoordeelt de aanvraag.

### 21.13 Uren

De urenpagina toont werkzaamheden per week. Per dag kunnen gewerkte werkbonnen worden bekeken. Uren worden per dag opgeteld.

### 21.14 Meldingen en instellingen

Meldingen tonen operationele berichten. Instellingen bevatten profiel, beveiliging en meldingsvoorkeuren. Pushmeldingen kunnen via web push of native push beschikbaar zijn, afhankelijk van het apparaat en de installatievorm.

### 21.15 Native app

De personeelsapp is voorbereid voor native gebruik via Android. Native push is beschikbaar ter test wanneer de app als native applicatie is geinstalleerd en meldingen zijn toegestaan.

Controlepunten:

- app opent correct;
- login werkt;
- meldingsprompt verschijnt wanneer push wordt geactiveerd;
- lokale token wordt opgeslagen;
- pushmelding komt aan;
- toggles voor meldingen werken logisch;
- PWA en native app blijven functioneel.

---

## 22. Klantportaal

Het klantportaal is bedoeld voor klanten van Veele Services. Het portaal is mobile-first, maar ook geschikt voor desktopgebruik.

### 22.1 Navigatie

De bottomnav bevat:

- Home;
- Objecten;
- Aanvragen;
- Meldingen;
- Meer.

Op desktop is er een uitgebreidere zijbalknavigatie.

### 22.2 Dashboard

Het dashboard toont een overzicht van actuele informatie:

- open aanvragen;
- rapportages;
- open facturen;
- objecten;
- recente activiteit;
- snelle acties.

### 22.3 Objecten

Klanten kunnen objecten bekijken en waar toegestaan nieuwe objecten aanmaken. Objectinformatie bevat onder andere:

- naam;
- adres;
- plaats;
- contactpersoon;
- telefoonnummer;
- objectdetails;
- opmerkingen.

### 22.4 Aanvragen

Klanten kunnen een nieuwe aanvraag indienen voor een object. De klant kiest het type dienst of sector en vult de benodigde informatie in.

Stappen:

1. Ga naar **Aanvragen**.
2. Kies het object.
3. Kies de gewenste dienst of sector.
4. Vul datum, tijd en omschrijving in.
5. Verstuur de aanvraag.
6. Volg de status in het portaal.

### 22.5 Opdrachten volgen

Klanten kunnen opdrachten en werkbonnen volgen. Zij zien klantgerichte informatie zoals status, object, planning en rapportage. Interne planningnotities en personeelsnamen worden niet getoond.

### 22.6 Offertes

Als voor een aanvraag een offerte nodig is, kan de klant deze bekijken en akkoord geven of afwijzen. Na akkoord kan Veele Services de opdracht verder plannen.

### 22.7 Rapportages

Klanten kunnen goedgekeurde rapportages bekijken. Rapportages tonen wat is uitgevoerd, zonder interne notities of interne personeelsinformatie.

### 22.8 Facturen en betalingen

Klanten kunnen facturen bekijken. Waar betaling beschikbaar is, kan de klant direct betalen via het portaal. Ook betaalstatussen zijn zichtbaar.

### 22.9 Tickets

Klanten kunnen vragen stellen of meldingen aanmaken via tickets. Een ticket blijft gekoppeld aan de klant en kan eventueel aan een object of opdracht gekoppeld zijn.

### 22.10 Documenten

Documenten die voor de klant bedoeld zijn, zijn beschikbaar in het portaal. Klanten zien alleen documenten die aan hun klantomgeving gekoppeld zijn.

### 22.11 Profiel, beveiliging en instellingen

Klanten kunnen profiel- en beveiligingsgegevens beheren. Notificatie- en e-mailvoorkeuren kunnen via instellingen beschikbaar zijn.

---

## 23. Veiligheid, privacy en zichtbaarheid

Veiligheid en privacy zijn belangrijk omdat het platform klantgegevens, personeelsgegevens, objectinformatie, documenten, facturen en rapportages bevat.

### 23.1 Klantafscherming

Een klantgebruiker mag alleen gegevens zien van klanten waaraan hij of zij gekoppeld is. Dit betekent:

- klant A ziet geen objecten van klant B;
- klant A ziet geen facturen van klant B;
- klant A ziet geen tickets van klant B;
- klant A ziet geen documenten van klant B.

### 23.2 Personeelsafscherming

Een medewerker mag alleen eigen of passende informatie zien:

- eigen planning;
- eigen werkbonnen;
- eigen uren;
- eigen documenten;
- passende open opdrachten;
- eigen verlof en beschikbaarheid.

### 23.3 Interne informatie

Interne informatie blijft intern. Voorbeelden:

- interne notities;
- interne rapportagecontrole;
- interne objectinformatie;
- managementcommentaar;
- interne ticketnotities;
- auditlog.

### 23.4 Klantgerichte rapportage

In klantgerichte rapportages wordt Veele Services als uitvoerder getoond. Personeelsnamen worden niet standaard aan klanten getoond.

### 23.5 Auditlog

Gevoelige acties kunnen worden vastgelegd in de auditlog. Dit helpt bij controle en terugzoeken van wijzigingen.

Voorbeelden:

- gebruiker gewijzigd;
- rol gewijzigd;
- klant gewijzigd;
- object gewijzigd;
- opdracht gewijzigd;
- personeel ingepland;
- rapportage goedgekeurd;
- factuur aangemaakt;
- document bekeken of gedownload.

---

## 24. Dagelijkse voorbeeldscenario's

### 24.1 Scenario: klant vraagt extra schoonmaak aan

1. Klant logt in op het klantportaal.
2. Klant kiest **Aanvragen**.
3. Klant selecteert een object.
4. Klant kiest schoonmaak.
5. Klant vult datum, tijd en omschrijving in.
6. Veele Services ontvangt de aanvraag in backoffice.
7. Planning controleert capaciteit.
8. Veele Services maakt eventueel een offerte.
9. Klant geeft akkoord.
10. Planning koppelt medewerkers.
11. Medewerker voert de werkbon uit.
12. Rapportage wordt gecontroleerd.
13. Administratie maakt factuur.
14. Klant betaalt via portaal.

### 24.2 Scenario: planning zoekt personeel voor spoedopdracht

1. Planning opent de opdracht.
2. Capaciteit en matching worden bekeken.
3. Planning ziet geschikte medewerkers.
4. Planning stuurt een interessepeiling naar topmatches of spoedpool.
5. Medewerkers tonen interesse.
6. Planning selecteert medewerkers.
7. Werkbon wordt ingepland.
8. Medewerkers ontvangen melding.

### 24.3 Scenario: medewerker meldt werkbon af

1. Medewerker opent werkbon.
2. Medewerker start de werkbon.
3. Medewerker merkt dat werkzaamheden niet uitgevoerd kunnen worden.
4. Medewerker kiest **Afronden** en daarna **Nee**.
5. Medewerker kiest reden, bijvoorbeeld "Geen toegang tot object".
6. Medewerker vult toelichting in.
7. Werkbon wordt afgemeld.
8. Planning ziet dit in backoffice.

### 24.4 Scenario: klant stelt vraag over factuur

1. Klant opent klantportaal.
2. Klant gaat naar meldingen of tickets.
3. Klant maakt een ticket aan.
4. Backoffice ziet het ticket.
5. Administratie of management reageert.
6. Klant ziet reactie in het klantportaal.

---

## 25. Smoke tests en gebruikerstests

Deze tests zijn bedoeld om snel te controleren of de belangrijkste onderdelen werken.

### 25.1 Algemene smoke test

| Test | Verwacht resultaat |
| --- | --- |
| Login backoffice | Gebruiker komt op dashboard |
| Login personeelsapp | Medewerker komt op homepagina |
| Login klantportaal | Klant komt op klantdashboard |
| Navigatie backoffice | Alle toegestane modules laden |
| Navigatie personeelsapp | Bottomnav werkt |
| Navigatie klantportaal | Bottomnav en desktopmenu werken |
| Uitloggen | Sessie wordt beeindigd |

### 25.2 Backoffice smoke test

1. Open dashboard.
2. Open klantenlijst.
3. Open klantdetail.
4. Open objectenlijst.
5. Open objectdetail.
6. Open opdrachtenlijst.
7. Open opdrachtdetail.
8. Open planning.
9. Klap sidebar in en uit.
10. Open werkvoorraad op planbord.
11. Open rapportages.
12. Open facturen.
13. Open tickets.
14. Open instellingen.

Controleer:

- geen serverfouten;
- geen lege pagina's zonder uitleg;
- statuslabels zijn begrijpelijk;
- klantinformatie en interne informatie zijn gescheiden.

### 25.3 Personeelsapp smoke test

1. Login als medewerker.
2. Open home.
3. Open planning.
4. Open een werkbon.
5. Markeer als gezien door openen.
6. Start werkbon.
7. Vink taak af.
8. Voeg rapportagenotitie toe.
9. Voeg meerwerk toe.
10. Voeg materiaal toe.
11. Rond af of meld af.
12. Open meldingen.
13. Open berichten.
14. Open beschikbaarheid.
15. Open verlof.
16. Open uren.

Controleer:

- alle pagina's hebben dezelfde mobiele stijl;
- bottomnav blijft bruikbaar;
- meldingen verschijnen logisch;
- medewerker ziet geen werkbonnen van anderen;
- pushmelding werkt op ondersteunde apparaten.

### 25.4 Klantportaal smoke test

1. Login als klant.
2. Open dashboard.
3. Open objecten.
4. Maak een object aan indien toegestaan.
5. Maak een aanvraag aan.
6. Open opdrachten.
7. Open offertes.
8. Geef akkoord op een offerte.
9. Open rapportages.
10. Open facturen.
11. Open betaling.
12. Open documenten.
13. Maak een ticket aan.
14. Open profiel en instellingen.

Controleer:

- klant ziet alleen eigen data;
- klant ziet geen interne notities;
- klant ziet geen personeelsnamen in rapportages;
- factuurbedragen zijn begrijpelijk;
- tickets blijven binnen klantcontext.

### 25.5 Complete end-to-end test

Voer een volledige keten uit:

1. Maak klant aan.
2. Maak object aan.
3. Maak aanvraag aan.
4. Beoordeel aanvraag in backoffice.
5. Controleer capaciteit.
6. Maak offerte.
7. Laat klant akkoord geven.
8. Plan medewerker.
9. Laat medewerker werkbon starten.
10. Laat medewerker taken afronden.
11. Voeg rapportage toe.
12. Voeg meerwerk en materiaal toe.
13. Rond werkbon af.
14. Keur rapportage goed.
15. Maak factuurvoorstel.
16. Maak factuur.
17. Laat klant betalen.
18. Controleer status op betaald.

---

## 26. Acceptatiecontrole per rol

### 26.1 Management

Controleer:

- dashboardinformatie;
- klantoverzicht;
- objectoverzicht;
- open opdrachten;
- rapportages in controle;
- tickets;
- managementmeldingen;
- auditlog;
- rollen en rechten.

### 26.2 Planning

Controleer:

- planbord;
- sidebar inklappen;
- open werkbonnen;
- 24-uurslijn;
- huidige tijdlijn;
- matchscores;
- interessepeilingen;
- meerdere medewerkers per werkbon;
- herplanning;
- verlof/ziekte-impact.

### 26.3 Administratie

Controleer:

- rapportage naar factuurvoorstel;
- losse factuur;
- verzamelfactuur;
- btw;
- openstaande posten;
- betalingsstatus;
- PDF-download;
- klantportaalweergave van facturen.

### 26.4 Personeel

Controleer:

- login;
- planning;
- open opdrachten;
- interesse tonen;
- werkbon openen;
- start/afrondstatus;
- rapportage;
- meerwerk;
- materiaal;
- verlof;
- beschikbaarheid;
- meldingen;
- berichten.

### 26.5 Klant

Controleer:

- login;
- dashboard;
- objecten;
- aanvraag indienen;
- offerte akkoord;
- opdrachtstatus;
- rapportage bekijken;
- factuur bekijken;
- betalen;
- ticket aanmaken;
- documenten bekijken.

---

## 27. Begrippenlijst

### Aanvraag

Een verzoek van een klant of backoffice voor werkzaamheden. Een aanvraag kan later een opdracht of werkbon worden.

### Acceptatietest

Een testfase waarin Veele Services controleert of het platform in de praktijk werkt zoals verwacht.

### Auditlog

Een overzicht waarin belangrijke acties worden vastgelegd, zoals wijzigingen aan klanten, rollen, opdrachten of documenten.

### Backoffice

Het beheerportaal voor Veele Services. Management, planning en administratie werken hier dagelijks.

### Beschikbaarheid

De tijden waarop een medewerker aangeeft te kunnen werken.

### Capaciteitscheck

Een controle die laat zien of er voldoende geschikte en beschikbare medewerkers zijn voor een opdracht.

### Certificaat

Een bewijs dat een medewerker een bepaalde bevoegdheid of training heeft.

### Document

Een bestand dat gekoppeld kan zijn aan een klant, object, opdracht, medewerker, rapportage of factuur.

### Factuur

Een financieel document waarmee kosten bij de klant in rekening worden gebracht.

### Factuurvoorstel

Een concept voor een factuur dat administratie nog kan controleren voordat het definitief wordt.

### Gebruiker

Iemand die toegang heeft tot het platform.

### Interessepeiling

Een uitnodiging aan medewerkers om aan te geven of zij interesse hebben in een opdracht. Dit is nog geen definitieve planning.

### Klantportaal

Het portaal waar klanten hun objecten, aanvragen, opdrachten, rapportages, facturen, betalingen, documenten en tickets kunnen bekijken.

### Klantzichtbare informatie

Informatie die veilig aan klanten getoond mag worden.

### Matchscore

Een score die helpt om te bepalen hoe goed een medewerker past bij een opdracht.

### Meerwerk

Extra werkzaamheden die bovenop de oorspronkelijke opdracht worden uitgevoerd.

### Meldingen

Korte berichten over gebeurtenissen, acties of updates binnen het platform.

### Native app

Een app die als echte mobiele applicatie op Android wordt geinstalleerd. De personeelsapp is voorbereid op native gebruik.

### Object

Een locatie, gebouw, terrein of pand waar Veele Services werkzaamheden uitvoert.

### Offerte

Een prijsvoorstel dat de klant kan accepteren of afwijzen.

### Opdracht

Een opdracht beschrijft wat uitgevoerd moet worden. In de praktijk is dit sterk gekoppeld aan de werkbon.

### Personeelsapp

De mobiele app voor medewerkers van Veele Services.

### Planning

Het koppelen van werkbonnen aan medewerkers, datum en tijd.

### Rapportage

De vastlegging van uitgevoerde werkzaamheden, notities, bijzonderheden en eventuele bijlagen.

### Rechten

Toestemmingen die bepalen wat een gebruiker mag zien of doen.

### Reserve

Een medewerker die nog niet definitief is ingepland, maar beschikbaar kan zijn als vervanging of extra bezetting.

### Rol

Een set rechten voor een type gebruiker, zoals management, planning, administratie, personeel of klant.

### Sector

Een categorie dienstverlening, zoals schoonmaak, beveiliging of facilitair.

### Slim plannen

De planningslaag die helpt om geschikte medewerkers te vinden op basis van beschikbaarheid, sector, rol, certificaten, regio, objectervaring en andere factoren.

### Smoke test

Een korte basistest om te controleren of de belangrijkste onderdelen van het platform werken.

### Taak

Een onderdeel van een werkbon dat uitgevoerd moet worden.

### Taakcode

Een standaardtaak met eigenschappen zoals sector, duur, prijs en vereisten.

### Ticket

Een gestructureerde vraag, melding of opvolgactie tussen klant, medewerker of backoffice.

### Verzamelfactuur

Een factuur waarin meerdere opdrachten of werkbonnen gebundeld worden.

### Werkbon

De operationele opdracht die gepland, uitgevoerd, gerapporteerd en gefactureerd wordt. De werkbon is het centrale begrip in het Veele Services Platform.

---

## Slotopmerking

Deze handleiding versie 1.0 is bedoeld als officiele gebruikersbasis voor Veele Services. Het document kan worden gebruikt tijdens interne training, klantdemonstraties en acceptatietesten. Naarmate het platform verder wordt gevalideerd en uitgebreid, kan deze handleiding worden aangevuld met screenshots, rol-specifieke instructiekaarten en productieafspraken.
