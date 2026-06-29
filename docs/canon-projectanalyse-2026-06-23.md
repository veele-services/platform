# Veele Services Platform - Projectanalyse t.o.v. canon

Datum: 23 juni 2026  
Versie: 1.0  
Doelgroep: intern Veele Services / DG Webservices  
Bronnen: canon, huidige repositorystructuur, bestaande auditdocumenten en aanwezige backoffice-, personeelsapp-, klantportaal- en API-modules.

---

## 1. Samenvatting

Het Veele Services Platform is inmiddels veel verder dan een eerste prototype. De repository bevat drie duidelijke productoppervlakken: een backoffice voor management, planning en administratie, een personeelsapp voor medewerkers in het veld en een klantportaal voor opdrachtgevers. Daarnaast zijn er gedeelde datamodellen, workflows, notificaties, documenten, facturatie, tickets, slimme planning, auditlogging, opslagbeveiliging, realtime-voorbereiding, offline-voorbereiding en deploy-inrichting.

Ten opzichte van de canon is de kernbelofte aanwezig: de opdracht of werkbon staat centraal en vormt de keten van klant, object, aanvraag, planning, uitvoering, rapportage, facturatie en betaling. De belangrijkste modules uit de canon zijn herkenbaar terug te vinden in de codebase.

De grootste resterende aandachtspunten zitten niet meer in het ontbreken van basale schermen, maar in volwassen productafwerking: end-to-end acceptatietesten met echte scenario's, verdere validatie van realtime/offline gedrag, volledige worker-operatie op serverniveau, complete financiële randgevallen, native push voor een toekomstige native app, en live verificatie van privacygrenzen in de stagingdatabase.

---

## 2. Hoofdlijn uit de canon

De canon beschrijft het platform als een centrale digitale werkomgeving voor schoonmaak, beveiliging en facilitair werk. De keten is:

Klant -> Sector -> Object -> Opdracht/Werkbon -> Taken -> Personeel -> Uitvoering -> Rapportage -> Facturatie/Betaling.

De canon maakt ook duidelijk dat "opdracht/werkbon" het centrale begrip is. Een dienst is slechts een geplande uitvoering van een opdracht. Alles moet dus om de werkbon heen draaien: planning, taken, personeel, foto's, rapportage, meerwerk, materiaal, factuur en betaling.

Die lijn is in het project grotendeels gevolgd. In de repository is de opdracht inderdaad de centrale koppeling tussen klant, object, planning, personeel, rapportage, offerte, factuur en betaling.

---

## 3. Wat is aanwezig per platformonderdeel?

### 3.1 Backoffice

De backoffice bevat de belangrijkste beheerschermen uit de canon:

- dashboard voor operationele stuurinformatie;
- klantbeheer;
- klantdetailpagina als mini CRM;
- klanttypes;
- objectbeheer;
- objectdetailpagina met historie, performance en vaste teams;
- opdracht- en werkbonbeheer;
- opdrachtstatussen en workflowstappen;
- offertes;
- planning en digitaal planbord;
- slimme planning met capaciteit, kandidaten en interessepeilingen;
- personeelsbeheer;
- verlof;
- beschikbaarheid;
- sectoren;
- taakcodes;
- certificaten, diploma's en kennis;
- rapportages;
- facturen;
- verzamelfacturen/betaalbatches;
- betalingen;
- documenten;
- nieuws;
- tickets;
- notificatiebeheer;
- mailinstellingen;
- rollen en rechten;
- auditlog;
- organisatie-instellingen.

De backoffice is desktop-first opgezet en sluit qua routes en componenten goed aan op de canon. De meeste dagelijkse beheertaken hebben een eigen scherm of actie.

### 3.2 Personeelsapp

De personeelsapp bevat de belangrijkste mobiele onderdelen:

- homepagina;
- mijn planning;
- open opdrachten;
- werkbondetail;
- statuslijn voor gezien, gestart en afgerond/afgemeld;
- taken/checklist;
- rapportagenotities;
- foto- en video-uploadbasis;
- meerwerk;
- materiaal/verbruik;
- afrondscherm;
- afmeldflow bij niet afgerond;
- beschikbaarheid;
- verlof;
- urenoverzicht per week;
- nieuws;
- meldingen;
- berichten/tickets;
- documenten;
- profiel;
- wachtwoord en beveiliging;
- notificatievoorkeuren;
- browser push;
- native push-voorbereiding;
- offline queue-basis;
- Capacitor-voorbereiding.

De mobiele stijl is in lijn gebracht met de Veele-identiteit, met een vaste header, bottomnav en kaartachtige mobiele schermen.

### 3.3 Klantportaal

Het klantportaal bevat de hoofdonderdelen uit de canon:

- dashboard;
- objecten;
- object aanmaken;
- objectdetails;
- opdracht aanvragen;
- opdrachten bekijken;
- opdrachtstatus volgen;
- offertes bekijken en beoordelen;
- rapportages bekijken;
- facturen bekijken;
- facturen betalen;
- verzamelfacturen/betaalbatches;
- betalingen;
- documenten;
- meldingen;
- tickets;
- profiel;
- beveiliging;
- instellingen/voorkeuren.

Het portaal is mobiel bruikbaar en desktop verder verfijnd. Belangrijk is dat klantgerichte data inmiddels expliciet via klantkoppelingen wordt afgeschermd.

### 3.4 API-server en automatisering

De API-server ondersteunt:

- healthcheck;
- Mollie-webhooks;
- verlopen offertes;
- betalingsherinneringen;
- e-mailnotificaties;
- pushnotificaties;
- notificatieworker;
- admin endpoints voor worker-runs;
- native push-voorbereiding;
- klant-API-routes.

De worker- en queuebasis is aanwezig, maar moet operationeel via systemd timer/service of cron op staging en production blijven draaien.

---

## 4. Canonvergelijking per domein

### 4.1 Klantenbeheer

Aanwezig:

- klantgegevens;
- contactpersonen;
- klanttypes;
- gekoppelde gebruikers;
- objecten;
- opdrachten;
- rapportages;
- tickets;
- facturen;
- betalingen;
- documenten;
- interne en klantzichtbare notities;
- tijdlijn/historie;
- openstaande acties.

Status: grotendeels gerealiseerd.

Resterend:

- dagelijkse gebruikersvalidatie op echte data;
- visuele polish na gebruik door management/planning;
- eventueel verdere rapportagefilters op klantniveau.

### 4.2 Objectbeheer

Aanwezig:

- objectgegevens;
- adresgegevens;
- klantkoppeling;
- sector;
- contactpersonen;
- toegangsinformatie;
- objecthistorie;
- performance-indicatoren;
- vaste teams en voorkeursmedewerkers;
- objectervaring voor planning.

Status: gerealiseerd als basis en uitgebreid naar canonrichting.

Resterend:

- validatie van privacy rond gevoelige objectinformatie;
- verdere praktische verfijning van vaste teams na gebruik in planning.

### 4.3 Opdrachten en werkbonnen

Aanwezig:

- aanvraagflow;
- opdrachtbeheer;
- werkbonnummers volgens sector/jaar/maand/volgnummer;
- taakcodes;
- taken;
- sectoren;
- planning;
- personeel koppelen;
- rapportage;
- meerwerk;
- materiaal/verbruik;
- statusflow;
- offerte;
- factuur;
- betaling.

Status: kern gerealiseerd.

Resterend:

- volledige procesmatige acceptatietest van aanvraag tot betaling;
- extra validatie van uitzonderingsflows zoals annulering, afmelding, offertewijziging en herplanning.

### 4.4 Planning en slim plannen

Aanwezig:

- digitaal planbord;
- open werkbonnen;
- medewerkers zichtbaar op planning;
- filters;
- drag/planningacties voorbereid;
- pastelachtige afspraakkleuren;
- meerdere personeelsleden per opdracht;
- matchdata;
- capaciteit en kandidaten;
- sectorregels;
- interessepeilingen;
- rondegeschiedenis;
- anti-spamregels;
- kandidaatstatus "vraag gesteld" gekoppeld aan tickets;
- vaste teams/objectervaring als planningssignaal.

Status: sterke basis aanwezig.

Resterend:

- realistische stresstest met veel medewerkers en werkbonnen;
- verdere performance-optimalisatie voor grote planningsdagen;
- live validatie van realtime updates wanneer planning wijzigingen doorvoert.

### 4.5 Personeel

Aanwezig:

- personeelsdossiers;
- personeelsrollen;
- sectoren;
- beschikbaarheid;
- verlof;
- planning;
- documenten;
- profiel;
- telefoon/NAW/profielfoto;
- beveiligingsinstellingen;
- meldingsinstellingen;
- certificaten/diploma's/kennis;
- werkbonuitvoering;
- rapportages;
- urenoverzicht.

Status: grotendeels aanwezig.

Resterend:

- ziekte/herstel als volledig operationeel scherm verder uitwerken indien Veele dit dagelijks wil gebruiken;
- loonstroken als eigen proces verder concretiseren indien dit buiten algemene documenten moet vallen;
- native app-distributie wanneer Capacitor-app echt wordt uitgerold.

### 4.6 Rapportages, foto's en media

Aanwezig:

- rapportagenotities;
- datum/tijd bij notities;
- bijlagen bij rapportagenotities;
- foto- en video-uploadbasis;
- rapportagecontrole;
- rapportage-PDF;
- klantzichtbaarheid via Veele Services als uitvoerder.

Status: functioneel aanwezig.

Resterend:

- testen met grote video's en slechte verbinding;
- volledige visuele PDF-validatie met echte klantdata;
- bepalen welke bijlagen klantzichtbaar zijn per rapporttype.

### 4.7 Facturatie en betalingen

Aanwezig:

- facturen;
- factuurdetails;
- factuur-PDF;
- betaalstatus;
- Mollie-betalingen;
- betaalbatches;
- verzamelfactuur-PDF;
- factuurvoorstellen na rapportgoedkeuring als procesbasis.

Status: basis tot gevorderd aanwezig.

Resterend:

- financiële randgevallen verder testen: btw, kortingen, toeslagen, deelbetalingen, mislukte betalingen, dubbele facturatie;
- administratief definitieve verzamelfacturen breder valideren.

### 4.8 Tickets en communicatie

Aanwezig:

- klanttickets;
- personeelstickets;
- interne tickets;
- tickets vanuit klant, object en opdracht;
- backoffice-reacties;
- klantreacties;
- personeelsreacties;
- ticketstatussen;
- ticketnotificaties;
- berichten in personeelsapp;
- meldingen in klantportaal;
- nieuwsberichten.

Status: aanwezig en breed gekoppeld.

Resterend:

- operationeel testen van escalaties, prioriteiten en lange ticketconversaties;
- bepalen van interne SLA's en verantwoordelijkheden.

### 4.9 Notificaties, e-mail en push

Aanwezig:

- notificatie-events;
- inboxmeldingen;
- e-mailqueue;
- pushqueue;
- retry-statussen;
- workerbasis;
- browser push;
- in-app slide-in meldingen;
- high-priority pushgedrag;
- Veele notification badge/icon;
- native pushvoorbereiding via FCM;
- notificatiebeheer in backoffice;
- templates en shortcodes.

Status: technische basis aanwezig.

Resterend:

- serverconfiguratie voor worker/timer stabiel verifiëren;
- Resend/SMTP-productieconfig definitief vastleggen;
- FCM volledig aansluiten wanneer native app wordt gebouwd.

### 4.10 Realtime en offline

Aanwezig:

- realtime-eventtabellen en events;
- realtime/offline provider in personeelsapp;
- offline queue-basis voor werkbonstatus, taken, rapportage, meerwerk en materiaal;
- visuele syncstatus;
- retrybasis.

Status: voorbereid en deels functioneel.

Resterend:

- testen op echte mobiele netwerkwissels;
- conflictregels aanscherpen op basis van praktijk;
- bepalen welke klant- en backofficepagina's realtime verplicht moeten zijn.

### 4.11 Veiligheid en privacy

Aanwezig:

- tenant-aware queries;
- klanttoegang via customer_users;
- personeelstoegang via personnel.user_id;
- interne notities afgeschermd;
- klant ziet geen personeelsnamen in klantgerichte rapportages/facturen;
- storage policies gehard;
- server-side uploadvalidatie;
- auditlogging voor gevoelige acties;
- eindcontrole security/privacy gedocumenteerd.

Status: sterk verbeterd en klaar voor gecontroleerde acceptatietests.

Resterend:

- Database Inspect op staging na deploy uitvoeren om policies live te bevestigen;
- eventueel fijnmaziger auditlogging op leesacties uitbreiden.

---

## 5. Wat ontbreekt nog of verdient prioriteit?

### Hoogste prioriteit

1. Complete staging-acceptatietest uitvoeren met echte rollen: management, planning, administratie, personeel en klant.
2. De volledige keten testen: klant -> object -> aanvraag -> offerte -> akkoord -> planning -> uitvoering -> rapport -> factuur -> betaling.
3. Workerconfiguratie voor e-mail en push op serverniveau definitief controleren.
4. Database Inspect draaien voor RLS en storage policies.
5. Realtime planning en personeelsapp testen met echte wijzigingen in de backoffice.

### Productafwerking

1. Financiële randgevallen rond facturen, verzamelfacturen, btw, kortingen en mislukte Mollie-betalingen testen.
2. Media-upload testen met grote foto's/video's, slechte verbinding en retries.
3. Dashboardwidgets met meer echte operationele data valideren.
4. Object- en klantdetailpagina's in dagelijks gebruik laten beoordelen door Veele.
5. Tickets en notificaties in praktijkprocessen finetunen.

### Later of afhankelijk van bedrijfskeuze

1. Native Android/iOS-app daadwerkelijk wrappen en publiceren.
2. FCM volledig inrichten voor native push.
3. Ziekmelden/herstelmelden als eigen personeelsproces verder verdiepen.
4. Loonstroken als apart beveiligd proces uitbreiden als dit niet onder documenten mag blijven.
5. WhatsApp Business, boekhoudkoppelingen, QR/NFC, GPS en AI-planningsadvies.

---

## 6. Conclusie

De canon is voor het grootste deel omgezet naar een werkend platformfundament. Het project bevat de juiste domeinen, schermen en datamodellen voor een serieus operationeel platform. De centrale lijn van de canon is intact: de werkbon is de spil van alles.

De fase waar het project nu in zit is geen "bouwen vanaf nul" meer, maar productvolwassenheid: testen, valideren, verfijnen, hardenen en operationeel betrouwbaar maken. Vooral stagingacceptatie met echte scenario's is nu doorslaggevend. Als die testfase goed wordt uitgevoerd, kan het platform gecontroleerd richting productiegebruik groeien.
