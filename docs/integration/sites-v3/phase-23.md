# Personeelsportaal: bronpresentatie en native processen

Deze fase behandelt S01 t/m S06. Implementatie is in uitvoering; browseracceptatie, deployment en livecontrole zijn afzonderlijke stappen.

| Onderdeel | Keuze | Implementatie |
| --- | --- | --- |
| Portalstijlen | Hergebruiken | Ongewijzigde declaraties uit de meegeleverde staff-/klantstijlen, tabbladen, prototypeframe en portals-demo. Selector- en fontaliassen isoleren de cascade. `scripts/sync-sites-portal-presentation.mjs` genereert de afgeleide stylesheet reproduceerbaar. |
| Planning | Uitbreiden | Bronklassen/DOM voor dagnavigatie, weekstrip en resultaatregel. De native toegewezen bonnen, actuele status, contacten, agenda en paginatie blijven leidend. |
| Werkbonvenster | Uitbreiden | Bronframe, adresregel, drie primaire tabs, geplande/uitvoeringskaarten en echte contact/instructies. Native taak-, rapport-, dossier-, reis-, kosten-, pauze-, afrond- en ondertekenacties blijven bereikbaar. |
| Uren | Uitbreiden | Bronstatistieken, samenvatting en weekoverzicht op echte tijdregistraties. Correcties blijven aanvragen; native registratiecontrole en dagakkoord blijven bereikbaar. |
| Verlof | Uitbreiden | Bronkaarten en compacte aanvraagregels. Saldo, meerjarenberekening, aanvragen, intrekken en beoordeling blijven native. |
| Beschikbaarheid | Uitbreiden | Broncheckbox en tijdvelden per dag, met native bewerktoestemming, versies, validatie en overige planningsvoorkeuren. |
| Documenten | Uitbreiden | Bronlijst en detailvenster met werkelijk privébestand. Inline is beperkt tot PDF en gangbare rasterafbeeldingen; dezelfde scan-, bron-, scope- en dubbele autorisatiecontrole blijft verplicht. Download blijft beschikbaar. |
| Profiel/instellingen | Uitbreiden | Gedeelde brontabs met eigen naam en echte voorkeuren; aanvullende contact-, adres-, noodcontact- en vervoersvelden blijven bereikbaar. Geen bedrijfsdata uit localStorage. |
| Routeshell | Uitbreiden | Dezelfde bronframe, actuele eigen personeelsnaam en gedeeld accountmenu op tickets, kennisbank, updates en notificaties. |
| Informatie | Uitbreiden | Bronkaarten voor geautoriseerde kennisartikelen en releases; stabiele native links, uitgebreide artikelen en bestaande productinformatie blijven behouden. |
| Tickets | Uitbreiden | Bronroutekaarten/lijst en gedeeld bronvenster met echte ticketdetails, reacties, bijlagen en actuele rechten. De medewerker meldt aan de tenant; de tenant deelt noodzakelijke technische informatie expliciet met Fieldgrid. |
| PWA/onboarding | Hergebruiken | Bestaande installatiecontroller, manifest, iconen/splash, uitnodiging/OTP, browserinstructies en account-/sessiegebonden herinneringscyclus. Geen demo-installatie of demo-account. |

## Minimale integratieverschillen

De bron zet een lokale vlag voor een hele werkdag. De huidige uitvoering is gekoppeld aan werkbonnen/inzetten. ‘Werkdag starten’ opent daarom de echte planning; de medewerker start de concrete inzet. Lopende registratie wordt bij de werkbon gepauzeerd/hervat. De native dagcontrole blijft onder ‘Registraties en urenbeoordeling’ bereikbaar.

De bron bevat vereenvoudigde werkbonacties en een demonstratieherstart. Deze vervangen geen vrijgave, toegewezen inzet, meerwerkbeoordeling, gecontroleerde rapportoplevering of ondertekening. Voor deze aanvullende processen blijven echte bediening en statuscontrole beschikbaar. Het werkbonframe gebruikt de bestaande toegankelijke Radix-dialogen, met dezelfde bronklassen en frame-indeling, zodat geneste uitvoeringsvensters hun focus en bediening behouden.

Personeelsdocumenten bevatten de oorspronkelijke afgeschermde bytes. Een niet ondersteund voorbeeldtype opent niet inline en kan via de bestaande download worden opgehaald. De personeelsbinding of zichtbaarheid wordt ook na het lezen van het bestand opnieuw gecontroleerd. Een browservoorbeeld is geen gegenereerd demodocument.

De bron biedt rechtstreeks ‘Technische support’. Binnen het bestaande personeel → tenant → Fieldgrid-model ontvangt de tenant de melding. De interface licht deze grens toe. Er wordt geen technische medewerkerrol, verborgen scope of onbeoordeelde doorgifte toegevoegd.

Uitlegbanners blijven aan de bestaande accountregistratie gekoppeld en gebruiken de bronpresentatie met bruikbare productietekst. Prototypeuitleg over lokale demo-opslag wordt niet gepubliceerd. PWA- en onboardingvensters behouden hun bestaande apparaatgebonden bediening.

## Bewijsstatus

Lint en TypeScript zijn tijdens implementatie gecontroleerd. De echte browserketens, bekeken bronvergelijkingen, private-filecontroles, native regressies en releasegates zijn nog niet afgerond. Er is nog geen deployment of liveacceptatie voor deze fase.
