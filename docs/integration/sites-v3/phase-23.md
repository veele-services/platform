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

De taakcheckboxes en direct zichtbare rapportnotitie volgen de bron. Tijdverlenging, taakresultaatdetails, meerwerk en kosten staan onder de aanvullende uitvoeringsbediening. Incident, bijlagen, klantzichtbaarheid en de werkelijke rapportgeschiedenis blijven afzonderlijk bereikbaar. Onbewaarde notities blijven de bestaande sluit-/afrondcontrole blokkeren. De verpakte browserproef vond een dubbele CSS-centrering tussen Radix/Tailwind en het bronframe; de onafhankelijke `translate` wordt binnen dit frame expliciet uitgeschakeld, zodat alleen de broncentrering geldt.

Een rapportversie kan via actuele gegevens zichtbaar worden voordat de oorspronkelijke indienactie geheel is afgerond. De afrondingsdialoog krijgt daarom de werkelijke pendingstatus van de rapportindiening. Sluiten blijft tijdens die actie geblokkeerd en de rapportweergave meldt `aria-busy`. De browserproef houdt één echte serverresponse tijdelijk vast, controleert de sluitblokkade en wacht op bevestigde verwerking voordat hij verdergaat. Rapportmutaties, versies, documenten en idempotentie blijven native.

Personeelsdocumenten bevatten de oorspronkelijke afgeschermde bytes. Een niet ondersteund voorbeeldtype opent niet inline en kan via de bestaande download worden opgehaald. De personeelsbinding of zichtbaarheid wordt ook na het lezen van het bestand opnieuw gecontroleerd. Een browservoorbeeld is geen gegenereerd demodocument.

De bron biedt rechtstreeks ‘Technische support’. Binnen het bestaande personeel → tenant → Fieldgrid-model ontvangt de tenant de melding. De interface licht deze grens toe. Er wordt geen technische medewerkerrol, verborgen scope of onbeoordeelde doorgifte toegevoegd.

Uitlegbanners blijven aan de bestaande accountregistratie gekoppeld en gebruiken de bronpresentatie met bruikbare productietekst. Prototypeuitleg over lokale demo-opslag wordt niet gepubliceerd. PWA- en onboardingvensters behouden hun bestaande apparaatgebonden bediening.

## Bewijsstatus

De eerste echte SMTP/OTP-proef vond een bestaande overgangsfout: Next kon de eerste beveiligde serverrender na een Server Action-redirect tegen de interne platformorigin uitvoeren. Daardoor verschilde de presentatie-sessiesleutel van de daaropvolgende tenantaanvraag en werd de eenmalige PWA-herinnering te vroeg verbruikt. Het nieuwe formulier navigeert na geslaagde OTP-verificatie en actuele serverautorisatie op de browserorigin naar de gecontroleerde lokale bestemming. Bestaande open formulieren behouden hun redirectprotocol. APP_URL, hostroutering, sessierechten en de installatiecyclus zijn niet verruimd. Voor vier werkruimten en geweigerde bestemmingen zijn gerichte regressies toegevoegd; de echte browsercyclus wordt opnieuw gecontroleerd op het verpakte artifact.

Lint en TypeScript zijn tijdens implementatie gecontroleerd. De echte browserketens, bekeken bronvergelijkingen, private-filecontroles, native regressies en releasegates zijn nog niet afgerond. Er is nog geen deployment of liveacceptatie voor deze fase.

De aanvullende visuele browsercontrole vond horizontale overflow bij nieuws: de bestaande paginatie was als derde kind in het tweekoloms nieuwsgrid geplaatst. De paginatie staat nu onder het grid. Het informatiepaneel gebruikt de originele brontekst en bronstructuur. De nieuws-, leesregistratie- en paginatiefuncties blijven native. De volledige vergelijking wordt na deze correctie opnieuw uitgevoerd.

De verlofpresentatie gebruikt de oorspronkelijke knop met tekst en het oorspronkelijke driekaartengrid, zonder de extra minimale hoogten, voetregels en dubbele gridafstanden uit de eerdere personeelsstijl. De herhaalde toelichting onder de lijst staat al bij de titel en blijft daar beschikbaar. De broneyebrow is PERSONEEL. De tweede verlofmetric blijft bewust ‘Goedgekeurd’: de native bron bevat ook toekomstig goedgekeurd verlof en dat mag niet ten onrechte ‘Opgenomen’ heten. Rechten, aanvragen, saldoberekening en besluitvorming wijzigen niet.
