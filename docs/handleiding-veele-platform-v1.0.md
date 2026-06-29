# Veele Services Platform - Handleiding en Analyse v1.0

Datum: 22 juni 2026  
Versie: 1.0  
Scope: Backoffice, personeelsapp, klantenportaal en centrale processen  
Doelgroep: management, planning, administratie, personeel en klantbeheerders

---

## Inhoudsopgave

1. Doel van het platform
2. Korte samenvatting voor Veele Services
3. Analyse ten opzichte van de canon
4. Wat kan er nu al?
5. Wat moet nog gebeuren?
6. De hoofdworkflow van Veele Services
7. Backoffice handleiding
8. Personeelsapp handleiding
9. Klantenportaal handleiding
10. Slim plannen
11. Notificaties, e-mail en pushmeldingen
12. Veiligheid en rechten
13. Dagelijkse werkwijze per afdeling
14. Aanbevolen testplan voor staging
15. Release- en beheerafspraken
16. Begrippenlijst

---

## 1. Doel van het platform

Het Veele Services Platform is bedoeld als centrale werkomgeving voor de dagelijkse operatie van Veele Services.

Het platform vervangt losse communicatie en administratie via WhatsApp, Excel, e-mail, losse documenten en handmatige planning. Alle belangrijke onderdelen komen samen in een vaste keten:

```text
Klant
-> Sector
-> Object
-> Opdracht / werkbon
-> Taken
-> Personeel
-> Rapportage
-> Factuur
-> Betaling
```

De opdracht of werkbon is de kern van het systeem. Vanuit een opdracht ontstaat planning, uitvoering, rapportage, facturatie en uiteindelijk betaling.

Het platform bestaat uit drie hoofdonderdelen:

- Backoffice: voor management, planning en administratie.
- Personeelsapp: voor medewerkers in het veld.
- Klantenportaal: voor klanten van Veele Services.

---

## 2. Korte samenvatting voor Veele Services

De basis van het platform is inmiddels breed aanwezig. De backoffice bevat klantbeheer, objectbeheer, opdrachten, planning, personeel, offertes, rapporten, facturen, documenten, nieuws, tickets, instellingen, rollen, sectoren, taakcodes, mailinstellingen en notificaties.

De personeelsapp bevat de belangrijkste mobiele flows: planning, werkbon bekijken, werkbon starten, werkzaamheden afronden of afmelden, rapportage-notities, meerwerk, materiaal, documenten, beschikbaarheid, verlof, urenoverzicht, nieuws, meldingen, tickets en profielinstellingen.

Het klantenportaal bevat klantdashboard, objecten, object aanmaken, opdrachten aanvragen, opdrachtstatus bekijken, offertes beoordelen, rapporten, facturen, betalingen via Mollie, betaalbatches, documenten, meldingen, tickets, profiel, beveiliging en voorkeuren.

De nieuwe slimme-planninglaag is toegevoegd als semi-automatische advieslaag. Het systeem kan bij een aanvraag capaciteit berekenen, geschikte medewerkers vinden, topmatches tonen en interessepeilingen starten. Planning blijft in de MVP altijd eindverantwoordelijk.

Belangrijk: veel onderdelen zijn technisch aanwezig, maar moeten op staging nog procesmatig getest worden met echte demo-data. Vooral de volledige keten klant -> aanvraag -> offerte -> akkoord -> planning -> uitvoering -> rapport -> factuur -> betaling moet meerdere keren worden doorgelopen voordat productie betrouwbaar is.

---

## 3. Analyse ten opzichte van de canon

### 3.1 Canon: klanten als centrale bron

Canon-eis:

Een klant is niet alleen een naam en telefoonnummer, maar een complete operationele omgeving met objecten, opdrachten, rapporten, facturen, betalingen, documenten, tickets, contacten, notities en historie.

Huidige stand:

- Klantbeheer is aanwezig in de backoffice.
- Klanten hebben statussen, klanttypes, contactpersonen, objecten, opdrachten, rapporten, facturen, betalingen, documenten, notities en historie.
- Klantportaaltoegang is niet meer alleen afhankelijk van het e-mailadres op de klantkaart; er is een apart klantgebruikermodel.
- Klanten kunnen in het klantenportaal hun eigen objecten en aanvragen bekijken.

Restpunten:

- De klantdetailpagina moet in dagelijkse praktijk nog volledig worden gevalideerd als "mini CRM".
- Interne notities en klantzichtbare informatie moeten per scherm gecontroleerd blijven.
- Alle klantgerichte query's moeten definitief tenant- en klant-scope gecontroleerd worden.

### 3.2 Canon: objecten als werklocaties

Canon-eis:

Objecten zijn de locaties waar werk wordt uitgevoerd. Ze bevatten adresgegevens, contactpersonen, sleutelinformatie, toegangsinstructies, sectoren, gekoppeld personeel en historie.

Huidige stand:

- Objectbeheer is aanwezig in backoffice en klantenportaal.
- Klanten kunnen objecten aanmaken en aanpassen.
- Objecten kunnen contactpersonen, sectoren, toegangsinformatie, sleutelinformatie en gekoppelde gegevens bevatten.
- Objecten zijn gekoppeld aan opdrachten, rapporten en documenten.

Restpunten:

- Objecthistorie, objectperformance en vaste teams per object verdienen nog verdere uitwerking.
- In productie moet worden gecontroleerd of klanten alleen hun eigen objecten zien.

### 3.3 Canon: opdrachten als centrale entiteit

Canon-eis:

Opdrachten zijn leidend. Niet de dienst, maar de opdracht bepaalt planning, taken, rapportage en facturatie.

Huidige stand:

- Opdrachten zijn aanwezig in backoffice, personeelsapp en klantenportaal.
- Klanten kunnen aanvragen doen voor objecten.
- Backoffice kan opdrachten beheren, taakcodes koppelen, statussen wijzigen en personeel plannen.
- Werkbonnummers volgen het gewenste sector- en maandmodel.
- Statusovergangen zijn aanwezig voor aanvraag, offerte, planning, uitvoering, rapportage, facturatie en betaling.

Restpunten:

- De hele lifecycle moet op staging nog als vaste acceptatietest worden doorlopen.
- Sommige statussen zijn technisch aanwezig, maar moeten in de UI nog consequent als processtap zichtbaar blijven.
- Automatische factuurvoorstellen na rapportgoedkeuring moeten procesmatig gecontroleerd worden.

### 3.4 Canon: planningregels

Canon-eis:

Planning mag alleen medewerkers tonen die beschikbaar zijn, niet ziek zijn, geen verlof hebben, geen conflict hebben, de juiste rol hebben, de juiste sector hebben, certificaten/kennis hebben en in de juiste regio passen.

Huidige stand:

- Het planbord toont medewerkers en werkbonnen.
- Geschiktheid, beschikbaarheid, verlof, ziekte, sector, rol, regio en conflicten worden meegenomen.
- Bij selectie van een werkbon kunnen geschikte medewerkers bovenaan worden geplaatst.
- Er is nu een centrale slimme-planningservice toegevoegd voor capaciteit en matchscore.

Restpunten:

- Certificaten, diploma's en kennis moeten als datamodel en beheerproces nog verder worden gevuld en getest.
- Sectorgewichten en anti-spamregels voor interessepeilingen moeten nog een beheerscherm krijgen.
- Realtime updates op het planbord moeten op staging worden gevalideerd.

### 3.5 Canon: personeelsapp mobile-first

Canon-eis:

Medewerkers moeten hun diensten, open opdrachten, beschikbaarheid, verlof, uren, rapportages, documenten en profiel mobiel kunnen beheren.

Huidige stand:

- Personeelsapp heeft een mobiele Veele-styling met vaste header en bottomnav.
- Planning, open opdrachten, beschikbaarheid, verlof, uren, rapportage, documenten, nieuws, meldingen, tickets, profiel en beveiliging zijn aanwezig.
- Werkbonnen kunnen worden gezien, gestart, afgerond of afgemeld.
- Meerwerk, materiaal en rapportage-notities zijn aanwezig.
- Browser push en in-app meldingen zijn toegevoegd.
- Capacitor-wrapper is voorbereid voor native Android.

Restpunten:

- Native push via Capacitor/FCM is nog niet af. Web Push werkt in browser/PWA-modus; native Android vereist Firebase en device tokens.
- Offline gedrag is voorbereid, maar nog niet volledig als robuuste offline queue afgerond.
- Media-upload voor foto's en video's moet onder slechte verbinding worden getest.

### 3.6 Canon: klantportaal mobile-first en desktop bruikbaar

Canon-eis:

Klanten moeten objecten, aanvragen, offertes, rapporten, facturen, betalingen, documenten en meldingen kunnen beheren.

Huidige stand:

- Klantenportaal bevat dashboard, objecten, aanvragen, opdrachten, offertes, rapporten, facturen, betalingen, documenten, meldingen, tickets, profiel, beveiliging en voorkeuren.
- Klant kan objecten aanmaken.
- Klant kan voor een object een opdracht aanvragen.
- Klant kan offertes goedkeuren of afwijzen.
- Klant kan facturen betalen via Mollie, inclusief meerdere facturen in een betaalbatch.

Restpunten:

- Het klantportaal moet nog uitgebreid getest worden op desktop en mobiele PWA.
- PDF-downloads en rapportweergave moeten met echte data worden gecontroleerd.
- Verzamelfacturen zijn als betaling/batchconcept aanwezig, maar moeten financieel en administratief nog definitief worden uitgewerkt.

### 3.7 Canon: notificaties en communicatie

Canon-eis:

Het platform moet e-mail, meldingen, push, nieuws en tickets ondersteunen.

Huidige stand:

- Centrale event-service is aanwezig.
- In-app notificaties, e-mail queue en push queue zijn aanwezig.
- Backoffice kan notificatie-instellingen beheren.
- E-mailsjablonen en stijlinstellingen zijn aanwezig.
- Handmatige notificaties kunnen naar doelgroepen worden gestuurd.
- Nieuws is aanwezig voor personeel en backoffice.
- Personeels- en klanttickets zijn aanwezig.

Restpunten:

- E-mail worker en push worker moeten als timer of service stabiel worden ingericht op staging en production.
- Management-notificaties verdienen nog een expliciet eigen model.
- Native app push via FCM moet nog worden toegevoegd als de personeelsapp echt native wordt uitgerold.

### 3.8 Canon: veiligheid

Canon-eis:

RLS-first, dynamische rechten, geen interne gegevens zichtbaar voor klanten, audit logging op gevoelige acties.

Huidige stand:

- Supabase Auth wordt gebruikt.
- Rollen en rechten zijn configureerbaar in backoffice.
- RLS en storage hardening zijn deels toegevoegd en gedocumenteerd.
- Audit log en domain events bestaan.
- Klantgebruikers zijn losgetrokken van alleen klant-e-mailadres.
- Documenten en foto's hebben private storage policies waar nodig.

Restpunten:

- Alle bestaande queries moeten per module nog volledig tenant-aware worden gecontroleerd.
- Storage policies moeten op staging via Database Inspect en Supabase dashboard worden bevestigd.
- Audit logging moet per gevoelige actie consequent worden gecontroleerd.

---

## 4. Wat kan er nu al?

### 4.1 Backoffice

De backoffice kan op dit moment de basisoperatie ondersteunen:

- Klanten beheren.
- Klanttypes beheren.
- Contactpersonen beheren.
- Objecten beheren.
- Objectcontacten beheren.
- Personeel beheren.
- Personeel uitnodigen.
- Rollen en rechten beheren.
- Sectoren beheren.
- Taakcodes beheren.
- Beschikbaarheid en verlof beheren.
- Opdrachten aanmaken en beheren.
- Opdrachten koppelen aan klanten, objecten, sectoren en taakcodes.
- Planning bekijken en medewerkers plaatsen.
- Slimme capaciteitscheck uitvoeren.
- Interessepeilingen naar medewerkers starten.
- Offertes maken, verzenden, goedkeuren en afwijzen.
- Rapporten bekijken, goedkeuren en afwijzen.
- Facturen maken, verzenden, betaald zetten en annuleren.
- Betalingen via Mollie verwerken.
- Documenten uploaden en delen via rechten.
- Nieuwsberichten maken met doelgroepselectie.
- Tickets van klanten en personeel behandelen.
- Mail- en notificatie-instellingen beheren.
- Activiteitenlog bekijken.

### 4.2 Personeelsapp

Medewerkers kunnen op dit moment:

- Inloggen.
- Hun homepagina bekijken.
- Hun planning bekijken.
- Een werkbon openen.
- Een werkbon van ongezien naar gezien laten gaan.
- Een werkbon starten.
- Taken/checklist bekijken.
- Meerwerk toevoegen vanuit taakcodes.
- Materiaal/verbruik registreren.
- Rapportage-notities toevoegen.
- Bijlagen bij rapportage-notities bekijken.
- Een werkbon afronden.
- Een werkbon afmelden wanneer deze niet afgerond kan worden.
- Open opdrachten bekijken.
- Interesse tonen of afwijzen bij uitnodigingen.
- Beschikbaarheid invullen.
- Verlof aanvragen.
- Uren per week bekijken.
- Documenten bekijken.
- Nieuws lezen.
- Meldingen beheren.
- Tickets maken en beantwoorden.
- Profielgegevens aanpassen.
- Wachtwoord wijzigen.
- Pushmeldingen activeren of uitschakelen in browser/PWA-modus.

### 4.3 Klantenportaal

Klanten kunnen op dit moment:

- Inloggen.
- Dashboard bekijken.
- Objecten bekijken.
- Objecten aanmaken en aanpassen.
- Opdrachten aanvragen voor een object.
- Opdrachtstatus bekijken.
- Offertes bekijken.
- Offertes goedkeuren of afwijzen.
- Rapporten bekijken.
- Facturen bekijken.
- Een factuur betalen via Mollie.
- Meerdere facturen tegelijk als betaalbatch betalen.
- Documenten bekijken.
- Meldingen beheren.
- Tickets aanmaken en beantwoorden.
- Contact- en profielgegevens beheren.
- Wachtwoord wijzigen.
- Portaalvoorkeuren aanpassen.

---

## 5. Wat moet nog gebeuren?

### 5.1 Hoogste prioriteit

1. Staging volledig valideren met echte demo-data.
2. Database migration `040_smart_planning.sql` controleren via deploy en Database Inspect.
3. Volledige workflow testen:
   - klant maakt object;
   - klant maakt aanvraag;
   - backoffice ziet capaciteitscheck;
   - backoffice maakt offerte;
   - klant keurt offerte goed;
   - planning plaatst medewerker;
   - medewerker start en rondt werkbon af;
   - rapport wordt goedgekeurd;
   - factuur wordt gemaakt;
   - klant betaalt via Mollie;
   - opdracht wordt gesloten.
4. E-mail en push workers vast inrichten als systemd timer of service.
5. RLS, tenant-scope en storage policies per module nalopen.

### 5.2 Productafwerking

- Backoffice dashboards verder vullen met operationele stuurinformatie.
- Slim-plannen UI uitbreiden met sectorregels, anti-spamregels, rondegeschiedenis en automatische reminders.
- Medewerkerreactie "vraag gesteld" koppelen aan ticketflow.
- Certificaten, diploma's en kennis expliciet beheren in personeel en taakcodes.
- Klantportaal desktopweergave verder verfijnen.
- Financiele afhandeling van verzamelfacturen definitief maken.
- Rapport- en factuur-PDF's visueel valideren.
- Native push via Capacitor/FCM toevoegen.
- Offline queue voor personeel verder afronden.
- Management-notificaties als eigen inbox uitwerken.

### 5.3 Technische hardening

- Alle queries controleren op `tenant_id`.
- Klantqueries controleren op `customer_users`.
- Personeelsqueries controleren op `personnel.user_id`.
- Interne notities nooit aan klanten tonen.
- Storage uploads server-side blijven valideren.
- Audit logging consequent maken voor alle gevoelige acties.
- Release-smoke-test verplicht maken voor staging en production.

---

## 6. De hoofdworkflow van Veele Services

Dit is de dagelijkse hoofdroute door het platform.

### Stap 1: Klant en object

Een klant staat in de backoffice. Onder die klant staan een of meer objecten. Een object is een locatie waar Veele Services werk uitvoert, bijvoorbeeld een VvE, kantoor, restaurant, parkeergarage of zorglocatie.

### Stap 2: Aanvraag

Een opdracht begint als aanvraag. De aanvraag kan komen van:

- de klant via het klantenportaal;
- backoffice namens de klant;
- planning of management.

De aanvraag bevat minimaal:

- klant;
- object;
- sector;
- gewenste datum en tijd;
- omschrijving;
- gewenste werkzaamheden;
- aantal benodigde medewerkers;
- eventuele taakcodes.

### Stap 3: Capaciteitscheck

Het systeem berekent of de opdracht waarschijnlijk uitvoerbaar is.

Er wordt gekeken naar:

- sector;
- rol/functie;
- taakcodes;
- regio;
- datum en tijd;
- beschikbaarheid;
- verlof;
- ziekte;
- bestaande planning;
- benodigde kennis of certificaten;
- matchscore.

De backoffice ziet daarna een kleur:

- Groen: capaciteit lijkt voldoende.
- Oranje: mogelijk voldoende, maar vraagt aandacht.
- Rood: capaciteit lijkt onvoldoende of eisen ontbreken.

### Stap 4: Offerte of directe goedkeuring

Als er een prijsopgave nodig is, maakt Veele een offerte. De klant ontvangt deze in het portaal en kan akkoord gaan of afwijzen.

Als er geen offerte nodig is, kan backoffice de opdracht intern goedkeuren.

### Stap 5: Planning

Planning kiest medewerkers. Slim plannen toont geschikte kandidaten en interesse. Planning kan medewerkers definitief plaatsen of als reserve markeren.

### Stap 6: Uitvoering

De medewerker ziet de werkbon in de personeelsapp. Bij openen wordt de bon als gezien gemarkeerd. Bij start legt de app de actuele starttijd vast. Na uitvoering kan de medewerker afronden of afmelden.

### Stap 7: Rapportage

De medewerker maakt rapportage-notities. Een notitie kan tekst en bijlagen bevatten. Backoffice beoordeelt de rapportage.

### Stap 8: Facturatie

Na goedkeuring kan de opdracht factureerbaar worden. Administratie maakt of controleert de factuur. De klant kan deze in het klantenportaal betalen.

### Stap 9: Afsluiten

Na betaling en afronding wordt de opdracht gesloten. De historie blijft beschikbaar bij klant, object, rapportage, factuur en betaling.

---

## 7. Backoffice handleiding

### 7.1 Dashboard

Het dashboard geeft een operationeel overzicht. Hier ziet Veele snel:

- nieuwe aanvragen;
- opdrachten die ingepland moeten worden;
- opdrachten in uitvoering;
- afgeronde opdrachten;
- open opdrachten;
- omzet;
- openstaande facturen;
- achterstallige facturen;
- recente activiteit;
- personeelsbeschikbaarheid.

Gebruik het dashboard als startpunt voor de dag. Planning gebruikt vooral de open en planbare opdrachten. Administratie kijkt naar facturen en betalingen. Management kijkt naar activiteit, omzet en capaciteitsdruk.

### 7.2 Klanten

De klantenmodule is de mini-CRM van Veele Services.

Per klant kan Veele beheren:

- bedrijfsnaam;
- juridische gegevens;
- btw-nummer;
- KvK-nummer;
- website;
- e-mail;
- telefoon;
- klanttype;
- status;
- accountmanager;
- contactpersonen;
- objecten;
- opdrachten;
- rapporten;
- facturen;
- betalingen;
- documenten;
- notities;
- historie.

Belangrijk: interne notities zijn alleen voor Veele. Informatie die klanten mogen zien moet bewust in klantzichtbare velden of documenten terechtkomen.

### 7.3 Klanttypes

Klanttypes maken het mogelijk klanten te groeperen, bijvoorbeeld:

- VvE;
- horeca;
- zorg;
- gemeente;
- eventlocatie;
- vastgoedbeheer;
- particulier.

Gebruik klanttypes voor overzicht, filters en rapportages.

### 7.4 Objecten

Een object is een locatie of gebouw waar werk wordt uitgevoerd.

Per object kan Veele beheren:

- objectnaam;
- klant;
- adres;
- postcode;
- plaats;
- regio;
- sectoren;
- contactpersoon;
- telefoonnummer;
- toegangsinformatie;
- sleutelinformatie;
- opmerkingen;
- gekoppeld personeel;
- opdrachten;
- rapporten;
- documenten.

Een object moet zo compleet mogelijk zijn. Hoe beter het object is ingevuld, hoe minder vragen medewerkers op locatie hebben.

### 7.5 Sectoren

Sectoren zijn de dienstgebieden van Veele Services. De hoofdsectoren zijn:

- Schoonmaak;
- Beveiliging;
- Facilitair.

Sectoren worden gebruikt bij:

- opdrachten;
- taakcodes;
- personeelsgeschiktheid;
- slimme planning;
- filters;
- klantportaal-aanvragen.

### 7.6 Taakcodes

Taakcodes zijn standaardwerkzaamheden. Een taakcode kan bevatten:

- code;
- naam;
- sector;
- omschrijving;
- prijs;
- duur;
- vereiste rol;
- vereiste certificaten;
- vereiste kennis;
- foto verplicht ja/nee;
- rapportage verplicht ja/nee;
- factureerbaar ja/nee.

Taakcodes zorgen ervoor dat offertes, opdrachten, planning, uitvoering en facturatie op dezelfde basis werken.

### 7.7 Opdrachten

De opdrachtenmodule is het hart van het platform.

Een opdracht bevat:

- opdrachtnummer;
- klant;
- object;
- sector;
- gewenste datum en tijd;
- status;
- benodigde medewerkers;
- taakcodes;
- gekoppeld personeel;
- rapportage;
- offerte;
- factuur;
- notificaties;
- historie.

Typische statussen zijn:

- aangevraagd;
- in beoordeling;
- offerte voorbereiden;
- wacht op akkoord;
- akkoord;
- planbaar;
- ingepland;
- gezien;
- gestart;
- afgerond;
- afgemeld;
- rapport ingediend;
- rapport goedgekeurd;
- factureerbaar;
- gefactureerd;
- betaald;
- gesloten.

Niet elke opdracht hoeft alle stappen te doorlopen. Een kleine opdracht kan direct goedgekeurd worden. Een grotere opdracht kan eerst een offerte nodig hebben.

### 7.8 Capaciteit en matching

Op de opdrachtdetailpagina staat het blok "Capaciteit en matching".

Hier ziet Veele:

- hoeveel medewerkers nodig zijn;
- hoeveel medewerkers geschikt zijn;
- hoeveel medewerkers beschikbaar zijn;
- hoeveel topmatches er zijn;
- hoeveel interesse hebben getoond;
- hoeveel conflicten er zijn;
- hoogste matchscore;
- advieskleur.

De kandidatenlijst toont waarom iemand wel of niet geschikt is, bijvoorbeeld:

- beschikbaar;
- sector match;
- regio match;
- certificaat geldig;
- geen conflict;
- deze week al veel uren;
- geen beschikbaarheid in tijdvak.

Acties:

- capaciteit herberekenen;
- topmatches uitnodigen;
- volgende ronde starten;
- spoedpool uitnodigen;
- kandidaat selecteren;
- kandidaat als reserve markeren;
- kandidaat definitief plannen.

### 7.9 Planning

Het planbord is bedoeld als digitaal planbord.

Planning ziet:

- medewerkers;
- tijden;
- ingeplande werkbonnen;
- open werkbonnen;
- filters;
- statuskleuren;
- beschikbaarheid;
- geschiktheidsbadges.

Wanneer een werkbon geselecteerd wordt, kan het planbord geschikte medewerkers bovenaan tonen. Dit maakt plaatsen sneller.

Een werkbon kan worden ingepland door een medewerker te kiezen of de bon naar een medewerker te plaatsen. Planning moet altijd controleren of de medewerker echt past bij sector, rol, tijdvak en opdracht.

### 7.10 Personeel

De personeelsmodule bevat medewerkers en flexmedewerkers.

Per medewerker kan Veele beheren:

- naam;
- e-mail;
- telefoon;
- adresgegevens;
- functie/rol;
- sectoren;
- contractgegevens;
- beschikbaar voor planning;
- status;
- gekoppelde objecten;
- portaaltoegang;
- profielinformatie.

Medewerkers kunnen worden uitgenodigd voor de personeelsapp. Bij eerste uitnodiging kan een tijdelijk wachtwoord worden verstuurd. De medewerker moet dit bij eerste login wijzigen.

### 7.11 Verlof en beschikbaarheid

Backoffice kan verlofaanvragen zien, goedkeuren of afwijzen. Beschikbaarheid wordt gebruikt bij planning en slimme matching.

Belangrijk verschil:

- Beschikbaarheid betekent: medewerker kan in principe werken.
- Verlof betekent: medewerker mag niet ingepland worden.
- Ziekte betekent: medewerker mag niet ingepland worden.

### 7.12 Offertes

Offertes worden gebruikt wanneer de klant eerst akkoord moet geven op prijs of werkzaamheden.

Backoffice kan:

- offerte maken;
- taken en prijzen controleren;
- offerte verzenden;
- offerte laten goedkeuren door klant;
- offerte afwijzing verwerken;
- verlopen offertes verwerken.

Na akkoord kan de opdracht planbaar worden.

### 7.13 Rapporten

Rapporten komen voort uit uitgevoerde werkbonnen.

Backoffice kan:

- rapporten bekijken;
- rapportnotities lezen;
- bijlagen bekijken;
- rapport goedkeuren;
- rapport afwijzen met reden.

Een goedgekeurd rapport kan richting klant zichtbaar worden en kan de basis zijn voor facturatie.

### 7.14 Facturen en betalingen

Administratie kan:

- facturen bekijken;
- facturen maken vanuit opdrachten;
- facturen verzenden;
- facturen betaald zetten;
- facturen annuleren;
- betalingsherinneringen versturen;
- Mollie betalingen verwerken;
- betaalhistorie bekijken.

Het klantenportaal ondersteunt betaling via Mollie.

### 7.15 Documenten

Documenten kunnen gekoppeld worden aan klanten, objecten, opdrachten, personeel of rapporten.

Voorbeelden:

- contracten;
- instructies;
- foto's;
- rapporten;
- facturen;
- certificaten;
- toegangsinstructies.

Documenten zijn niet automatisch voor iedereen zichtbaar. Rechten bepalen wie een document kan zien.

### 7.16 Nieuws

Backoffice kan nieuwsberichten maken voor bepaalde doelgroepen.

Mogelijke doelgroepen:

- alle medewerkers;
- bepaalde sectoren;
- klanten;
- specifieke personen;
- managementgroepen.

Een nieuwsbericht kan een hero-afbeelding hebben en tekst via een editor.

### 7.17 Tickets

Tickets zijn bedoeld voor vragen, meldingen en opvolging. Het is meer een ticketsysteem dan een chat.

Voorbeelden:

- vraag van medewerker;
- vraag van klant;
- klacht;
- factuurvraag;
- melding over object;
- vraag over planning;
- extra werk verzoek.

Backoffice kan tickets openen, beantwoorden, sluiten en heropenen.

### 7.18 Instellingen

In instellingen beheert Veele onder andere:

- organisatiegegevens;
- logo;
- rollen en rechten;
- gebruikers;
- sectoren;
- klanttypes;
- taakcodes;
- mailinstellingen;
- notificatie-instellingen;
- e-mailstijl;
- activiteitslog.

Deze instellingen bepalen hoe het platform zich gedraagt. Wijzigingen in rollen, mail en notificaties moeten zorgvuldig getest worden.

---

## 8. Personeelsapp handleiding

### 8.1 Home

De homepagina toont:

- begroeting;
- eerstvolgende dienst;
- snelle acties;
- nieuws of meldingen;
- vaste bottomnav.

De medewerker gebruikt deze pagina als startpunt.

### 8.2 Planning

De planning toont diensten en werkbonnen. Een werkbon bevat:

- opdrachtnummer;
- datum;
- tijd;
- objectnaam;
- plaats;
- status;
- klant/contactinformatie waar nodig.

Bij het openen van een werkbon wordt deze als gezien gemarkeerd. Planning kan daardoor zien dat de medewerker de opdracht heeft bekeken.

### 8.3 Werkbon details

Een werkbon heeft tabbladen zoals:

- Home;
- Werkzaamheden;
- Rapportage.

Op de home-tab ziet de medewerker:

- statuslijn;
- klant/objectgegevens;
- contactpersoon;
- adres;
- telefoonnummer;
- klantopmerkingen.

### 8.4 Statuslijn

De statuslijn bestaat uit drie hoofdstatussen:

1. Gezien.
2. Gestart.
3. Afgerond of afgemeld.

De medewerker moet de bon eerst starten voordat deze kan worden afgerond of afgemeld.

Bij starten vraagt de app bevestiging:

"Weet je zeker dat je aan de werkzaamheden gaat beginnen?"

Als de medewerker bevestigt, wordt de actuele starttijd vastgelegd.

### 8.5 Werkzaamheden

Op de werkzaamheden-tab ziet de medewerker:

- taken/checklist;
- meerwerk;
- materiaal/verbruik.

Taken kunnen worden afgevinkt. Meerwerk en materiaal kunnen worden toegevoegd volgens de ingestelde taakcodes en materialen.

### 8.6 Meerwerk

Meerwerk is werk dat op locatie met de klant wordt bepaald. Het hoeft niet als aparte aanvraag te worden gedaan.

De medewerker kan meerwerk toevoegen. Daarbij kunnen tijd en kosten worden opgebouwd op basis van taakcodes.

### 8.7 Materiaal

Materiaal of verbruik kan worden geregistreerd. Denk aan schoonmaakmiddelen, onderdelen of andere verbruiksmaterialen.

### 8.8 Rapportage

Rapportage bestaat uit losse notities. Elke notitie heeft:

- datum;
- tijd;
- auteur;
- tekst;
- eventuele foto of video als bijlage.

Een rapportage is dus geen lange samenvatting, maar een tijdlijn van notities.

### 8.9 Afronden

Als het werk klaar is, drukt de medewerker op afronden.

De app vraagt:

"Zijn alle werkzaamheden afgerond?"

Bij "Ja" ziet de medewerker een overzicht:

- werkzaamheden;
- meerwerk;
- materialen;
- rapportage;
- eventuele handtekening klant;
- bevestigknop.

Als handtekening verplicht is voor deze klant of opdracht, moet de klant tekenen voordat de bon definitief wordt afgerond.

### 8.10 Afmelden / niet afgerond

Als het werk niet klaar is, kiest de medewerker "Nee".

De app toont een overzicht en vraagt om een reden.

Standaardredenen:

- klant niet aanwezig;
- geen toegang tot object;
- sleutel/toegangscode werkt niet;
- klant niet akkoord op locatie;
- tijd tekort;
- meerwerk nodig;
- materiaal/middelen ontbreken;
- onveilige situatie;
- opdrachtinformatie onduidelijk of onvolledig;
- klant/locatie annuleert op locatie;
- overig.

Daarbij kan de medewerker een opmerking invullen.

### 8.11 Open opdrachten

Open opdrachten zijn opdrachten waarvoor medewerkers interesse kunnen tonen. Dit is nog geen definitieve planning.

De medewerker kan:

- interesse tonen;
- aangeven niet beschikbaar te zijn;
- eventueel een vraag stellen.

Planning kiest daarna wie definitief geplaatst wordt.

### 8.12 Beschikbaarheid

De beschikbaarheidspagina toont een maandkalender.

De medewerker kan per dag invullen:

- beschikbaar vanaf;
- beschikbaar tot;
- herhaling;
- spoedbeschikbaar ja/nee.

De tenant kan later instellen tot hoeveel dagen vooruit beschikbaarheid ingevuld mag worden.

### 8.13 Verlof

Medewerkers kunnen verlof aanvragen. Backoffice keurt verlof goed of wijst het af.

Goedgekeurd verlof blokkeert planning.

### 8.14 Uren

De urenpagina toont per week de gewerkte opdrachten. Per dag ziet de medewerker het totaal aantal uren en kan de dag worden opengeklapt om de onderliggende werkbonnen te zien.

### 8.15 Nieuws

Nieuws toont berichten vanuit Veele Services. Een bericht kan een afbeelding, titel en inhoud hebben.

### 8.16 Meldingen

Meldingen tonen belangrijke updates, bijvoorbeeld:

- nieuwe planning;
- gewijzigde werkbon;
- ticketreactie;
- nieuws;
- reminder.

De medewerker kan meldingen lezen, ongelezen zetten of wissen.

### 8.17 Berichten / tickets

Berichten zijn tickets. Een medewerker kan een vraag of melding starten en backoffice kan daarop reageren.

Dit is bedoeld voor opvolgbare communicatie, niet als losse chat.

### 8.18 Documenten

Medewerkers kunnen documenten bekijken die voor hen beschikbaar zijn.

### 8.19 Profiel en beveiliging

De medewerker kan beheren:

- NAW-gegevens;
- telefoonnummer;
- profielfoto;
- wachtwoord;
- beveiligingsinstellingen;
- notificatievoorkeuren.

---

## 9. Klantenportaal handleiding

### 9.1 Dashboard

Het dashboard geeft de klant overzicht over:

- open aanvragen;
- rapportages;
- open facturen;
- objecten;
- recente activiteit;
- meldingen.

De klant hoeft geen bedrijf te kiezen. Het account hoort bij de klantorganisatie.

### 9.2 Objecten

De klant kan objecten bekijken en aanmaken.

Bij een object worden vastgelegd:

- objectnaam;
- adres;
- postcode;
- plaats;
- sectoren;
- contactpersoon;
- telefoonnummer;
- toegangsinformatie;
- sleutelinformatie;
- aanvullende opmerkingen.

Objectinformatie helpt Veele om sneller en beter te plannen.

### 9.3 Aanvragen

De klant kan voor een object een nieuwe opdracht aanvragen.

De aanvraag bevat:

- object;
- sector;
- gewenste datum en tijd;
- omschrijving;
- urgentie;
- eventuele bijlagen of opmerkingen.

De aanvraag komt binnen bij Veele Services en wordt behandeld door backoffice.

### 9.4 Opdrachtstatus

De klant kan de status van aanvragen en opdrachten volgen.

Voorbeelden:

- aanvraag ontvangen;
- in behandeling;
- offerte beschikbaar;
- akkoord;
- ingepland;
- uitgevoerd;
- rapport beschikbaar;
- gefactureerd;
- betaald.

### 9.5 Offertes

Als Veele een offerte maakt, ziet de klant deze in het portaal. De klant kan:

- de offerte bekijken;
- akkoord geven;
- afwijzen met reden.

Na akkoord kan de opdracht verder worden gepland.

### 9.6 Rapporten

Klanten zien alleen goedgekeurde rapporten. Interne notities en personeelsinformatie blijven verborgen.

Een rapport kan bestaan uit:

- uitgevoerde werkzaamheden;
- rapportage-notities;
- bijlagen;
- foto's;
- status;
- datum en object.

### 9.7 Facturen

De klant kan facturen bekijken met:

- factuurnummer;
- datum;
- bedrag;
- status;
- vervaldatum;
- betaalmogelijkheid;
- PDF.

### 9.8 Betalingen

Betalingen verlopen via Mollie.

De klant kan:

- een losse factuur betalen;
- meerdere facturen tegelijk betalen als betaalbatch;
- betaalhistorie bekijken.

### 9.9 Documenten

Klanten kunnen documenten bekijken die voor hen beschikbaar zijn, zoals rapporten, facturen, contracten of instructies.

### 9.10 Meldingen

Klanten ontvangen meldingen over relevante gebeurtenissen, zoals:

- nieuwe offerte;
- rapport beschikbaar;
- factuur open;
- betaling ontvangen;
- reactie op ticket.

### 9.11 Tickets

Klanten kunnen tickets aanmaken voor vragen of meldingen.

Voorbeelden:

- factuurvraag;
- klacht;
- extra aanvraag;
- melding over object;
- vraag over planning.

Backoffice kan tickets behandelen en sluiten.

### 9.12 Profiel, beveiliging en voorkeuren

Klanten kunnen hun contactgegevens, wachtwoord, beveiliging en notificatievoorkeuren beheren.

---

## 10. Slim plannen

Slim plannen is een advieslaag voor planning en management.

### 10.1 Wat doet slim plannen?

Bij een aanvraag berekent het systeem:

- hoeveel medewerkers nodig zijn;
- welke sector geldt;
- welke taakcodes gelden;
- welke rol of functie nodig is;
- welke certificaten of kennis nodig zijn;
- welke medewerkers geschikt zijn;
- welke medewerkers beschikbaar zijn;
- wie al gepland is;
- wie verlof heeft;
- wie ziek is;
- wie een conflict heeft;
- wie het beste past.

### 10.2 Harde filters

Een medewerker valt af als een harde eis niet klopt.

Voorbeelden:

- medewerker is niet actief;
- medewerker is ziek;
- medewerker heeft verlof;
- medewerker is niet beschikbaar;
- medewerker heeft al een opdracht op hetzelfde tijdstip;
- medewerker hoort niet bij de sector;
- medewerker heeft niet de juiste rol;
- medewerker mist verplicht certificaat;
- medewerker valt buiten de regio.

### 10.3 Matchscore

Na de harde filters krijgen kandidaten een score.

De score kijkt onder andere naar:

- beschikbaarheid;
- kwalificaties;
- regio;
- objectervaring;
- urenbelasting;
- spoedbeschikbaarheid;
- responsbetrouwbaarheid;
- voorkeuren.

Planning ziet niet alleen een percentage, maar ook de uitleg.

### 10.4 Interessepeiling

Planning kan een ronde starten.

Voorbeeld:

- ronde 1: top 5 kandidaten;
- ronde 2: volgende kandidaten;
- spoedronde: bredere groep.

De medewerker ontvangt een melding en kan interesse tonen. Interesse is geen definitieve planning. Planning kiest daarna wie geplaatst wordt.

### 10.5 Reserve

Planning kan iemand als reserve markeren. Een reserve is nog niet definitief ingepland, maar kan nodig zijn bij ziekte, uitval of spoed.

### 10.6 MVP-regel

In deze versie plant het systeem niemand automatisch. Het systeem adviseert, maar planning beslist.

---

## 11. Notificaties, e-mail en pushmeldingen

### 11.1 Soorten meldingen

Het platform ondersteunt:

- in-app meldingen;
- e-mail;
- browser push;
- later native push via Capacitor/FCM.

### 11.2 In-app meldingen

In-app meldingen verschijnen in het portaal of de app. Ze zijn altijd zichtbaar binnen het platform.

### 11.3 E-mail

E-mail wordt verstuurd via ingestelde mailconfiguratie. Backoffice kan mailinstellingen en templates beheren.

### 11.4 Browser push

Browser push werkt in de PWA/browser wanneer:

- de gebruiker toestemming heeft gegeven;
- de browser push ondersteunt;
- de VAPID keys correct staan;
- de push worker draait.

### 11.5 Native push

Als de personeelsapp als echte native Android app wordt verpakt met Capacitor, is Web Push niet genoeg. Dan is Firebase Cloud Messaging nodig.

Nodig:

- Firebase project;
- Android app met package `nl.veeleservices.personeel`;
- `google-services.json`;
- opslag van native device tokens;
- FCM-verzending in de centrale notificatieservice.

### 11.6 Templates en shortcodes

Templates kunnen shortcodes gebruiken, bijvoorbeeld:

- `{{recipient.name}}`;
- `{{customer.name}}`;
- `{{assignment.number}}`;
- `{{object.name}}`;
- `{{quote.amount}}`;
- `{{invoice.number}}`.

Shortcodes maken berichten persoonlijk en herbruikbaar.

---

## 12. Veiligheid en rechten

### 12.1 Rollen en rechten

Veele kan rollen beheren zoals:

- management;
- administratie;
- planning;
- teamlead;
- medewerker;
- flexmedewerker;
- klant;
- support.

Rechten bepalen welke modules iemand mag zien of aanpassen.

### 12.2 Klantafscherming

Klanten mogen alleen hun eigen informatie zien. Interne notities, interne personeelsinformatie en managementvelden mogen niet zichtbaar zijn.

### 12.3 Personeelsafscherming

Medewerkers mogen alleen hun eigen opdrachten, documenten, meldingen en profielinformatie zien.

### 12.4 Audit log

Gevoelige acties moeten gelogd worden, bijvoorbeeld:

- gebruiker uitnodigen;
- rechten wijzigen;
- klant wijzigen;
- object wijzigen;
- opdracht wijzigen;
- rapport goedkeuren;
- factuuractie;
- betaling verwerken;
- notificatie versturen.

### 12.5 Storage

Documenten en foto's staan in Supabase Storage. Niet alle bestanden zijn openbaar. Veel documenten moeten via server action of tijdelijke downloadlink worden opgehaald.

---

## 13. Dagelijkse werkwijze per afdeling

### 13.1 Management

Management gebruikt vooral:

- dashboard;
- klanten;
- opdrachten;
- capaciteit en matching;
- rapporten;
- facturen;
- tickets;
- instellingen;
- activiteitslog.

Dagelijkse vragen:

- Welke aanvragen zijn nieuw?
- Waar is capaciteitsrisico?
- Welke offertes wachten op akkoord?
- Welke rapporten wachten op controle?
- Welke facturen staan open?
- Welke klachten of tickets vragen aandacht?

### 13.2 Planning

Planning gebruikt vooral:

- opdrachten;
- planbord;
- capaciteit en matching;
- beschikbaarheid;
- verlof;
- personeelsprofielen;
- interessepeilingen.

Dagelijkse vragen:

- Welke opdrachten zijn planbaar?
- Welke medewerkers zijn geschikt?
- Wie is beschikbaar?
- Wie heeft interesse getoond?
- Welke werkbonnen zijn gezien?
- Welke werkbonnen zijn gestart of afgerond?

### 13.3 Administratie

Administratie gebruikt vooral:

- klanten;
- offertes;
- rapporten;
- facturen;
- betalingen;
- betalingsherinneringen;
- documenten.

Dagelijkse vragen:

- Welke rapporten zijn goedgekeurd?
- Welke opdrachten zijn factureerbaar?
- Welke facturen zijn open?
- Welke betalingen zijn binnen?
- Welke facturen zijn achterstallig?

### 13.4 Personeel

Personeel gebruikt vooral:

- home;
- planning;
- werkbonnen;
- rapportage;
- beschikbaarheid;
- verlof;
- uren;
- meldingen;
- tickets.

Dagelijkse vragen:

- Wat is mijn volgende dienst?
- Waar moet ik heen?
- Wat moet ik doen?
- Kan ik de bon starten?
- Is alles afgerond?
- Moet ik iets rapporteren?

### 13.5 Klanten

Klanten gebruiken vooral:

- dashboard;
- objecten;
- aanvragen;
- offertes;
- rapporten;
- facturen;
- betalingen;
- tickets.

Dagelijkse vragen:

- Wat is de status van mijn aanvraag?
- Is mijn offerte klaar?
- Is het werk uitgevoerd?
- Waar vind ik het rapport?
- Welke facturen staan open?
- Kan ik een melding doen?

---

## 14. Aanbevolen testplan voor staging

### 14.1 Basiscontrole

Controleer na deploy:

- backoffice opent;
- personeelsapp opent;
- klantenportaal opent;
- login werkt op alle drie;
- healthcheck werkt;
- database migraties zijn uitgevoerd;
- API-server draait;
- e-mail en push worker zijn bereikbaar.

### 14.2 Complete testflow

Voer deze flow minimaal eenmaal volledig uit:

1. Maak klant aan.
2. Maak object aan.
3. Maak taakcodes aan of controleer bestaande taakcodes.
4. Maak aanvraag aan vanuit klantenportaal.
5. Controleer capaciteitscheck in backoffice.
6. Nodig topmatches uit.
7. Toon interesse vanuit personeelsapp.
8. Selecteer medewerker in backoffice.
9. Maak offerte.
10. Keur offerte goed als klant.
11. Plan opdracht.
12. Open werkbon als medewerker.
13. Start werkbon.
14. Voeg rapportage toe.
15. Voeg eventueel meerwerk en materiaal toe.
16. Rond werkbon af.
17. Keur rapport goed.
18. Maak factuur.
19. Betaal factuur via Mollie testmodus.
20. Controleer status en historie.

### 14.3 Veiligheidstest

Controleer:

- klant A ziet geen data van klant B;
- medewerker ziet geen opdrachten van andere medewerkers;
- interne notities zijn niet zichtbaar voor klanten;
- documenten zijn niet vrij toegankelijk zonder rechten;
- rollen beperken toegang correct;
- audit log schrijft gevoelige acties.

### 14.4 Notificatietest

Controleer:

- handmatige notificatie naar medewerker;
- handmatige notificatie naar klant;
- e-mail queue;
- push queue;
- inboxmelding;
- meldingen lezen/ongelezen/wissen;
- high-priority push bij spoed.

---

## 15. Release- en beheerafspraken

### 15.1 Staging

Staging is bedoeld voor testen en acceptatie. Nieuwe functionaliteit gaat eerst naar staging.

Staging URL:

```text
https://staging.veele.dgwebservices.nl
```

### 15.2 Production

Production is de live omgeving.

Production URL:

```text
https://app.veele.dgwebservices.nl
```

### 15.3 Branches

- `staging`: automatische deploy naar staging.
- `production`: automatische deploy naar production.

### 15.4 Database migraties

Databasewijzigingen lopen mee met deploy workflows via migraties. Gebruik geen handmatige schema-aanpassingen in productie zonder migratie.

### 15.5 Production-regel

Een wijziging mag pas naar production nadat:

- staging deploy groen is;
- migraties op staging goed zijn gegaan;
- smoke test is gedaan;
- hoofdflow is gecontroleerd;
- geen kritieke fouten openstaan.

---

## 16. Begrippenlijst

### Aanvraag

Een verzoek van een klant of backoffice om werk uit te voeren. Een aanvraag kan later een opdracht of werkbon worden.

### Audit log

Een logboek waarin belangrijke acties worden vastgelegd. Dit helpt bij controle en veiligheid.

### Backoffice

De beheeromgeving voor Veele Services. Hier werken management, planning en administratie.

### Capaciteitscheck

Een automatische controle of er genoeg geschikte en beschikbare medewerkers zijn voor een opdracht.

### Caddy

De webserver/reverse proxy die domeinen doorstuurt naar de juiste applicaties op de server.

### Certificaat

Een bewijs dat een medewerker bepaald werk mag of kan uitvoeren, bijvoorbeeld in beveiliging.

### Drizzle

De database-tool waarmee het platform tabellen en migraties beheert.

### E-mail template

Een standaard e-mailbericht dat automatisch gevuld kan worden met gegevens via shortcodes.

### Factuur

Het betaalverzoek aan de klant voor uitgevoerde of afgesproken werkzaamheden.

### FCM

Firebase Cloud Messaging. Dit is nodig voor native pushmeldingen in een echte Android app.

### Interessepeiling

Een uitnodiging aan medewerkers om aan te geven of zij beschikbaar en geinteresseerd zijn voor een opdracht.

### Klantenportaal

De omgeving waar klanten objecten, aanvragen, offertes, rapporten, facturen, betalingen en tickets kunnen beheren.

### Matchscore

Een score die aangeeft hoe goed een medewerker past bij een opdracht.

### Migratie

Een gecontroleerde databasewijziging die via de deploy wordt uitgevoerd.

### Mollie

De betaalprovider waarmee klanten online facturen kunnen betalen.

### Notificatie

Een melding in de app, per e-mail of via push.

### Object

Een locatie of gebouw waar Veele Services werk uitvoert.

### Opdracht

Het werk dat uitgevoerd moet worden voor een klant op een object.

### Personeelsapp

De mobiele app/PWA voor medewerkers.

### PWA

Progressive Web App. Een website die zich op telefoon of tablet als app kan gedragen.

### Pushmelding

Een melding die buiten de app zichtbaar kan worden op telefoon of desktop.

### RBAC

Role Based Access Control. Een rechtensysteem op basis van rollen.

### Rapportage

De verslaglegging van uitgevoerde werkzaamheden, meestal met notities en bijlagen.

### Reserve

Een medewerker die achter de hand staat voor een opdracht, maar nog niet definitief gepland is.

### RLS

Row Level Security. Databasebeveiliging die bepaalt welke rijen een gebruiker mag zien.

### Sector

Een dienstgebied, bijvoorbeeld Schoonmaak, Beveiliging of Facilitair.

### Self-hosted runner

Een eigen GitHub Actions runner op de Veele-server die builds en deploys uitvoert.

### Shortcode

Een invulveld in een template, bijvoorbeeld `{{recipient.name}}`.

### Slim plannen

De planningslaag die capaciteit berekent, medewerkers filtert en matchscores toont.

### SMTP

Techniek om e-mails te versturen via een mailserver.

### Supabase

Het platform dat database, login, opslag en beveiliging levert.

### Taakcode

Een standaardwerkzaamheid met prijs, duur, sector en vereisten.

### Tenant

Een organisatieomgeving binnen het platform. In dit geval is Veele Services de hoofdtenant.

### Ticket

Een opvolgbaar bericht of vraag van klant, medewerker of backoffice.

### VAPID

Sleutels die nodig zijn voor browser pushmeldingen.

### Werkbon

De uitvoerbare opdracht voor de medewerker op locatie.

### Webhook

Een automatische melding van een extern systeem, bijvoorbeeld Mollie die doorgeeft dat een betaling is gelukt.

