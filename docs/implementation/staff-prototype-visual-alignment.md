# Personeelsapp: aansluiting op het meegeleverde prototype

Visuele bron: `Fieldgrid · Personeelsapp.zip`, ontvangen op 6 oktober 2026.
Het archief is buiten de repository uitgepakt. De HTML, `style.css`,
`app.js.download` en `onboarding.js.download` zijn onderzocht. Alle appviews
zijn lokaal gerenderd op mobiel en desktop, zonder de externe editor uit de
opgeslagen HTML. De democode is geen onderdeel van de echte app geworden.

## Pagina's en onderdelen

| Prototype | Bestaande app en aansluiting |
| --- | --- |
| Planning: lijst, agenda, weekstrip, werkbonnen en zijpanelen | Bestaande toegewezen werkbonnen en realtime-updates; afstanden, kolombreedtes, witte kaarten en groene actieve dag afgestemd. |
| Nieuws en artikelvenster | Rustige artikelkaarten met datum, leeshint en echte leesstatus; desktopinformatie naast de lijst. Het artikel blijft volledig te lezen en te bevestigen. |
| Mijn uren | Bestaande dagtotalen, werk/reis/pauze/overige tijd, weekoverzicht en dagacties blijven in de reeds aangesloten prototypeopbouw. |
| Verlof | Paginaheader met aanvraagknop, drie saldo-/statuskaarten, aanvragenlijst en informatieblok; aanvraag en intrekken blijven echte acties. |
| Beschikbaarheid | Vaste week met twee tijdvelden per dag, beheerstatus en informatiepanelen; bestaande vrijgave, dienstvoorkeuren en versiecontrole behouden. |
| Documenten | Witte lijst met ruime, gescheiden documentregels, documenticoon en duidelijke openactie; elk bestand gebruikt de bestaande beveiligde bestandsroute. |
| Instellingen: Mijn profiel, Meldingen, Account & toegang | Bestaande tabindeling, profiel, kanaalschakelaars, apparaatinstelling, testmelding, OTP-uitleg en uitloggen behouden. |
| Meer | Ruimere witte kaarten met groene lijniconen, ondertitels en duidelijke tap targets. Alle extra stagingonderdelen, de profielkaart en Open diensten blijven aanwezig. |
| Tickets: lijst, invoer en gesprek | De echte ticketengine blijft onder `/staff/meldingen`; lijstkaarten, titel, formulieren, gesprek en filters gebruiken de personeelsstijl. |
| Notificaties: bel, inbox, detail en voorkeuren | De echte notificatieengine en beveiligde routes blijven bestaan; de bel heeft een omlijnd tap target, popovers en vensters sluiten aan op de app. |
| Login: e-mail en code | Desktop met donkere Fieldgrid-identiteit en wit formulier; mobiel een ruim formulier. Het bestaande universele OTP-formulier en alle authacties blijven bestaan. |
| Eerste bezoek/onboarding | Bestaande wizard behoudt de horizontale stappen, header, gegroepeerde invoer en vaste acties. Alle opslag, hervatten, toestemmingen en eventuele beschikbaarheidsstap blijven werken. |
| Werkbon: overzicht, taken, tijd/status, rapport | Rustige header met nummer, object, adres en sluiten; onderstreepte tabs, twee tijdkaarten en actuele verwachting. Alle bestaande uitvoering en rapportage blijven bereikbaar. |

De prototypebasis is gehandhaafd: Inter voor tekst, Poppins voor koppen,
Lucide-lijniconen, canvas `#f2f4f6`, ink `#1a2632`, muted `#6c7884`,
outline `#e4e9ec`, accent `#41ac42`, actie `#368341`, zachte achtergrond
`#edf6ed`, radius 18 px en bescheiden schaduwen. Mobiele actieknoppen zijn
minimaal 44 px hoog; invoervelden gebruiken 16 px tekst. De layout houdt
rekening met schermbreedte, veilige schermranden en de vaste navigatie.

## Pop-ups en containers

Alle staff-popupvarianten zijn op bron, frame, scrollgebied, footer en
interactie gecontroleerd: nieuwsartikel, verlofaanvraag, urenkeuze en
correctieformulier, apparaatinstelling, accountuitleg, ticketmodule-uitleg,
ticketinvoer en ticketacties, notificatievoorkeuren, notificatie- en
filterpopovers, accountmenu, onboarding en de werkbon.

Binnen de werkbon vallen daar ook contactgegevens, route, beveiligde
objecttoegang, terugmelden, materiaal/onkosten toevoegen en verwijderen,
rapportregels bewerken/verwijderen, meerwerk, gereedmelden, rapportoplevering,
klantafwezigheid en de ondertekenvelden onder. Ondertekening blijft onderdeel
van de echte, versiegebonden rapportoplevering.

De appdialogen volgen hetzelfde prototypeframe: maximaal 860 px breed en
90dvh hoog op desktop, fullscreen tot en met 600 px, vaste header, scrollend
midden en vaste of sticky actieknoppen. Portals krijgen expliciete staffstijlen
zodat backoffice- en klantvensters hun eigen vormgeving behouden. Een genest
werkbonvenster ligt met zijn achtergrond boven de oorspronkelijke werkbon.
Lange rapporttekst heeft een eigen scrollgebied.

De browserproeven controleren concreet de werkbon, route, beveiligde toegang,
terugmelden, materiaal, onkosten, meerwerk, artikel, verlof, apparaat, account,
ticketinvoer en filters op hun schermgrenzen en bereikbare acties. Andere
popupvarianten zijn via de gedeelde containers en bronreview gecontroleerd;
niet elke toestand van een ondertekend rapport heeft een aparte screenshot.

Twee gevonden interactieproblemen zijn hersteld: een realtime-refresh past
niet opnieuw de oorspronkelijke URL-tab toe over de huidige pagina, en een
programmatisch geopend staffvenster geeft focus terug aan de opener. Een
autoFocus-invoerveld in ticketinvoer blijft daarbij behouden.

## Behouden stagingfunctionaliteit en bewuste verschillen

- Navigatie blijft **Planning, Nieuws, Mijn uren, Tickets, Meer**. Het
  accountdropdown met Profiel, Instellingen en Uitloggen blijft bovenin.
- Meer houdt **profielkaart, Verlof, Beschikbaarheid, Documenten, Profiel,
  Instellingen, Notificaties, Tickets, Open diensten en Uitloggen**.
- Planning, taakresultaten, vertrek/start/pauze/stop/terugmelden, rapportregels,
  veilige bestanden, materiaal, onkosten, meerwerk, oplevering en handtekeningen
  gebruiken dezelfde bestaande acties, revisies en autorisatiegrenzen.
- Uren, correcties, verlof, beschikbaarheid, profielopslag, dienstinteresse,
  notificatievoorkeuren en ticketgesprekken blijven echte servercommando's.
- Staging toont echte aantallen, namen, statussen, bestanden en lege toestanden.
  Voorbeeldafspraken, voorbeeldsaldo's, categorieën en contactgegevens worden
  niet uit de demo overgenomen.
- De echte OTP-flow blijft universeel onder `/login`, met achtcijferige codes,
  veilige redirects, resend-cooldown en hercontrole van toegang. De democode,
  prototypelogin en controles om tijd/status te simuleren zijn niet overgenomen.
- Pushregistratie en uploads behouden de echte browser-/provider- en scanflow.
  Browserbevestigingen voor onopgeslagen invoer blijven bestaan.
- Tickets blijft zichtbaar als de module ontbreekt, met uitleg; de link verleent
  geen extra bevoegdheden. Het prototype-label ‘Uren’ blijft volgens de expliciete
  gebruikersinstructie **Mijn uren**. De badge ‘Prototype’ hoort niet op staging.
- Extra staginggegevens en acties kunnen kaarten of vensters langer maken dan
  de demo. Zij blijven scrollbaar en worden niet verwijderd voor een screenshot.

## Gerichte controle

De gerichte Chromium-selectie omvat de personeelsopmaak, alle Meer-links,
modulegrenzen, uren en correctie, verlof, beschikbaarheid en versieconflict,
profiel en meldingsvoorkeuren, echte OTP-login, popupframes/focus, responsive
PWA, onboarding, realtimeplanning, echte ticketupload met scan en gesprek,
en echte notificatie-inboxacties. Breedtes: 320, 390, 768, 1440 en waar relevant
1920 px. Screenshotbaselines voor de gewijzigde planning en werkbon zijn
visueel beoordeeld.

Uitkomst:

- Eén productiebuild (`pnpm build`, uitgevoerd door de standaard
  Playwright-webserver) geslaagd; 18 geselecteerde browsercases direct groen.
  Eén extra popupcheck probeerde meerwerk te openen in een nog niet gestarte
  fixture. Die testvoorwaarde is gecorrigeerd met een geïsoleerde, herstelde
  uitvoeringsfixture en een aparte afrondingscheck.
- Alle 20 geselecteerde browsercases zijn vervolgens groen, verspreid over de
  productiecontrole en gerichte herhalingen voor de gewijzigde popupframes.
  De laatste kleine footer-/spacingaanpassingen zijn op de devserver getest;
  daarvoor is geen nieuwe volledige productiebuild of suite gestart.
- `pnpm typecheck`, gerichte ESLint over gewijzigde TS/TSX-bestanden,
  `pnpm security:review` (988 expliciet beoordeelde oppervlakken) en
  `git diff --check` geslaagd.
- De vier gewijzigde personeels-screenshotbaselines zijn opnieuw vastgelegd
  en visueel gecontroleerd. De ontwikkelindicator is uit screenshots gehouden;
  de bel en verbindingsstatus worden vóór de screenshot geladen afgewacht.

Dit is geen volledige repositorytestsuite of eindcontrole van de hele
wijzigingsreeks. Deze wijzigingen zijn lokaal gecommit en niet gepusht of
naar staging gedeployd.
