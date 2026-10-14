# Signature Grid — marketingoverdracht aan Codex

Auditdatum: 14 oktober 2026. Brongegevens: de lokale, ongewijzigde Sites-checkout `/workspace/sites/fieldgrid-premium-concepts`, commit `c78377808dc560f4b8c2288b69dfe504845d8c94`. `git status --short` was leeg tijdens deze audit. Dit document is een broncode-audit; er is voor deze overdracht geen nieuwe browser- of productieformulierproef uitgevoerd.

**Leidend ontwerp:** de uitgewerkte Signature Grid-website in Sites en de bijgeleverde broncode. Integreer het ontwerp in de echte Fieldgrid-repo zonder herontwerp naar de huidige repo-stijl. De bestaande repo is leidend voor authenticatie, autorisatie, infrastructuur en bedrijfslogica; Sites is leidend voor de zichtbare UI/UX, inhoud, interacties en de hieronder vastgelegde volgorde. Er is één definitieve marketingrichting: Signature Grid. De andere concepten worden niet als keuze teruggebracht.

**Productiedoel:** de marketingwebsite moet op **https://www.fieldgrid.nl** komen. De Sites-URL `https://fieldgrid-premium-concepts.dgwebserv.chatgpt.site` is uitsluitend de ontwerp- en acceptatiereferentie. Behoud bestaande platform- en tenantadressen. Deze overdracht voert geen DNS-, hosting- of domeinmutaties uit.

## 1. Bronnen en verantwoordelijkheden

Alle bronpaden in deze tabel zijn relatief aan de marketingcheckout en de meegeleverde marketingbroncode.

| Bron | Over te nemen verantwoordelijkheid |
| --- | --- |
| `app/page.tsx` | Signature-homepage binnen de gedeelde chrome; homepage-JSON-LD. |
| `app/[...path]/page.tsx` | Complete route-resolutie, metadata en legacyredirects. |
| `components/site-chrome.tsx` | Aankondigingsbalk, sticky header, native mega-menu's, mobiel menu, beide conversie-CTA's, footer en sluitgedrag. |
| `components/homes/Signature.tsx` | Definitieve hero, sectievolgorde, perspectieftabs, onboardingvoorbeeld en homepage-inhoud. |
| `components/homes/Signature.module.css` | Exacte homepageverhoudingen, grid, kleurgebruik, gelaagde schaduwen, decoratie en responsive varianten. |
| `app/globals.css` | Globale ontwerptokens, fonts, navigatie, knoppen, cards, detailpagina's, demo's, motion en responsive regels. Neem ook de latere 'Signature Grid — final brand system'-overrides mee. |
| `components/sections.tsx` | Eerste vijf sectorcards, beveiliging/evenementen als uitbreiding, afsluitend dubbel CTA-blok. |
| `components/ui.tsx` | `Reveal`, `ButtonLink`, `SectionHeading`, toegankelijke FAQ-accordion. |
| `components/detail-pages.tsx` | Sector- en productdetailtemplates: breadcrumbs, hero, voordelen, lange copy, werkstappen, demo, FAQ en gerelateerde pagina's. |
| `components/standard-pages.tsx` | Branche- en platformoverzicht, werkwijze, over, interactieve demo en prototypeprivacy. |
| `lib/content.ts` | Volledige Nederlandstalige sector- en productcopy, meta's, koppen, voordelen, praktijkvoorbeelden en FAQ's. Dit bestand is de inhoudelijke bron, niet slechts een wireframe. |
| `components/product-demo.tsx` | Interactieve voorbeelden van planning, werkbon, klantportaal en de mobiele personeelsapp. |
| `components/conversion-pages.tsx` | Aanvraag proefperiode, telefonische kennismaking/productdemo, beschikbaarheid, validatie en ontvangstbevestiging. |
| `components/conversion-pages.module.css` | Premium layout en alle toestanden van conversiepagina's. |
| `lib/crm-proxy.ts`, `app/api/crm/intake/route.ts`, `app/api/crm/availability/route.ts` | Sites-specifieke serverproxy van marketingformulieren naar het CRM. Vervang de transportadapter bij productie-integratie, behoud het gedrag. |
| `lib/seo.ts`, `lib/concepts.ts`, `app/layout.tsx`, `app/robots.ts` | Metadata, canonicals, social previews, JSON-LD en bewust geblokkeerde prototype-indexatie. Productieaanpassing expliciet vereist. |
| `public/branding/*`, `public/fonts/*`, `public/images/*` | Te behouden logo's, fonts en visuele assets. |
| `app/not-found.tsx` | Herkenbare Fieldgrid-404 met werkende terugweg. |

De huidige Sites-stack gebruikt React 19.2.6, Next-conventies 16.3.4 boven Vinext 1.0.0-beta.5/Vite 8.0.13, TypeScript 5.9.3, Tailwind 4.2.1, CSS Modules, Motion 14.0.0 en Lucide. Deze versies beschrijven de bron; ze zijn geen opdracht om de productierepo ongecontroleerd te upgraden. Port de UI naar de bestaande stack wanneer dat technisch nodig is, met behoud van het uiterlijk en gedrag. Neem Sites-build-, hosting- en connectorhulpcode niet als productiedomeinlogica over.

## 2. Volledige routematrix

Er zijn 23 inhoudelijke routes. De routes moeten rechtstreeks te openen en te vernieuwen zijn, met echte documentlinks, correcte HTTP-status en eigen metadata.

| Route op `https://www.fieldgrid.nl` | Inhoud |
| --- | --- |
| `/` | Definitieve Signature Grid-homepage |
| `/branches` | Alle sectoren |
| `/branches/schoonmaak` | Schoonmaak |
| `/branches/glasbewassing` | Glasbewassing |
| `/branches/facilitair` | Facilitaire dienstverlening |
| `/branches/groenonderhoud` | Groenonderhoud |
| `/branches/vastgoedservice` | Vastgoedservice |
| `/branches/beveiliging` | Verticale uitbreiding, expliciet in ontwikkeling |
| `/branches/evenementen` | Verticale uitbreiding, expliciet in ontwikkeling |
| `/platform` | Overzicht van het product |
| `/platform/planning` | Planning |
| `/platform/werkbonnen` | Digitale werkbonnen |
| `/platform/objecten` | Klanten & Object 360 |
| `/platform/personeelsapp` | Personeelsapp |
| `/platform/klantportaal` | Klantportaal |
| `/platform/onboarding` | Personeel & onboarding |
| `/platform/offertes-facturatie` | Offertes & facturatie |
| `/werkwijze` | Van inrichting tot gebruik |
| `/over` | Over Fieldgrid |
| `/demo` | Interactieve productdemo |
| `/proberen` | Aanvraag 30 dagen gratis proefperiode |
| `/afspraak` | Telefonische afspraak of productdemo; `?type=demo` selecteert Productdemo |
| `/privacy` | Momenteel prototypeprivacy; voor productie herschrijven naar feitelijke productiegegevensverwerking |

Legacy-prefixen `/signature`, `/horizon`, `/atlas`, `/flow` en `/people`, inclusief onderliggende paden, krijgen permanentRedirect naar hetzelfde pad zonder het prefix. Er komen geen afzonderlijke designs, conceptkeuzepagina's of dode menu-items terug. Onbekende routes leveren een echte 404.

## 3. Onveranderlijk ontwerpcontract

### Branding en visuele taal

- Behoud `public/branding/logo.svg`, `icon.svg` en `wordmark.svg`; de afbeelding is het echte merkmateriaal, geen typografisch nagemaakte vervanging.
- Lokale fonts: `public/fonts/poppins.ttf` voor koppen en `inter.ttf` voor lopende tekst en UI; `font-display: swap`.
- Basiskleuren: navy `#092848`, groen `#368341`, ink `#152f40`, muted `#62717b`, line `#dde5e3`, paper `#fbfcfa`, mint `#edf5ed`, soft `#f2f5f3`. Extra blauw `#0d2e50`, lichtblauw `#eaf1f8`.
- Behoud de zachte gelaagde schaduwen (`--shadow-xs` t/m `--shadow-lg`), lichte randen, transparante highlights, subtiele gradients, ronde cards, ruime witruimte en afwisselende blauwe/groene accenten.
- De hero heeft een tweekoloms compositie, rustige gridachtergrond, asymmetrische product-/fototegels en op mobiel een bewuste stapeling. Niet vervangen door een generieke stockfoto met tekstoverlay.
- Behoud de dubbele CTA-hiërarchie: **Probeer nu 30 dagen gratis** → `/proberen`, **Plan een afspraak in** → `/afspraak`. De kortere labelvarianten in header/footer zijn bewust; alle bestemmingen blijven consistent.
- Native disclosure-menu's (`details`/`summary`) voor desktop en mobiel, één menu tegelijk open, sluiten met Escape, klikken buiten het menu en navigatie. Alle product- en brancheroutes zijn bereikbaar in header en footer.
- Behoud toetsenbordfocus, skiplink, tabrollen, geselecteerde toestanden, FAQ-expanded state, form labels, foutmeldingen, laadstatussen en successtatussen.
- Motion is ondersteunend: Reveal eenmaal bij in beeld komen, kleine hoververplaatsingen, 0,6 seconde reveal, geringe vertraging per card. Respecteer `prefers-reduced-motion`; inhoud mag niet permanent onzichtbaar worden bij ontbrekende animatie/hydration.
- CSS bevat bewuste breekpunten voor onder andere 1180/960/900/640/580/380 px. Vergelijk minimaal desktop 1440 px, tablet 768 px en mobiel 390 px. Behoud contentvolgorde, leesbaarheid en bereikbaarheid; geen horizontale paginascroll.

### Exacte homepagevolgorde

1. Aankondigingsbalk en navigatie via SiteChrome.
2. Hero: **Je mensen. Je locaties. Alles verbonden.** met twee CTA's en product-/fotogrid.
3. Verbindingsstrook kantoor–medewerker–klant.
4. **Eén opdracht. Drie perspectieven.** met tabs Voor kantoor / Voor je team / Voor je klant.
5. **Jouw vak. Jouw ritme. Eén basis.** met de eerste vijf sectoren in bovengenoemde volgorde.
6. **Gemaakt voor de werkdag — Sterk op kantoor. Net zo sterk op locatie.** met personeelsapp/telefoonvisual.
7. **Iedereen op dezelfde pagina — Op kantoor bedacht. Buiten goed uitgevoerd.**: donkerblauwe sectie met drie rolcards. Deze sectie staat dus direct onder Gemaakt voor de werkdag, conform de expliciete gebruikerscorrectie.
8. Onboarding: **Een nieuwe collega. Een warm welkom. Een heldere start.** met interactieve checklist en voortgang.
9. Werkstroom: **Van eerste aanvraag tot goed afgerond werk.** met vier stappen.
10. Eigen branding: **Eén platform. Jouw uitstraling.**
11. Beveiliging en evenementen als verticale uitbreiding in ontwikkeling.
12. Homepage-FAQ.
13. Afsluitend donkerblauw CTA-blok met beide CTA's; daarna volledige footer.

### Assets

De bron bevat twaalf WebP-bestanden: `schoonmaak`, `glasbewassing`, `facilitair`, `groenonderhoud`, `vastgoedservice`, `beveiliging`, `evenementen`, `kantoor-planning`, `onboarding`, `people`, `horizon`, `atlas`. Namen `horizon`/`atlas` zijn assetnamen, geen opdracht om oude concepten opnieuw te publiceren. Neem gebruikte beelden en hun crops, alt-teksten, overlays en objectposition over. Beelden zijn ontwerp-/illustratiebeelden; presenteer afgebeelde mensen of gebouwen niet als bewezen klanten of echte medewerkers. Verwijder ongebruikte boilerplate-iconen alleen na referentiecontrole.

## 4. Copy, SEO en productiehost

Neem de uitgebreide copy uit `lib/content.ts` en de componenten over. De vijf kernsectoren hebben eigen praktijkverhalen, uitdagingen, voordelen, werkstappen en FAQ's. Beveiliging en evenementen blijven zichtbaar als ontwikkelrichting; geen belofte van reeds geleverde rusttijdregels, patrouilles, incidentafhandeling, accreditatie, zone-/postbeheer of diensten over middernacht. Ook geen ongefundeerde claims over automatische routeoptimalisatie, weersgestuurde herplanning of salarisadministratie toevoegen.

Productie-integratie moet de bestaande semantische structuur, Nederlandstalige headings en `lang="nl"`, individuele titles/descriptions, breadcrumbs en gerelateerde links behouden. `lib/seo.ts` bevat canonical, Open Graph, Twitter cards, WebPage/BreadcrumbList en op de home SoftwareApplication-context. Het ontbreken van echte prijs-/ratinggegevens is geen reden om verzonnen structured data toe te voegen.

**Verplicht bij productie:**

- Verander de gecentraliseerde `siteOrigin` in `lib/concepts.ts` naar `https://www.fieldgrid.nl`; metadataBase, canonicals, JSON-LD `@id`/url/breadcrumbs, OG-URL's en sitemap moeten naar dit domein wijzen. Een marketingroute `/platform` is productuitleg en verandert geen bestaand app-/tenantadres.
- Interne marketinglinks blijven relatieve first-party links op www.fieldgrid.nl. Controleer op achtergebleven Sites-URL's in publieke UI, metadata en redirects. De interne CRM-transportbestemming moet naar het echte backendcontract worden aangepast, niet naar het prototype blijven verwijzen.
- Er is momenteel **geen sitemap-route**. Voeg in de productierepo een sitemap toe voor de indexeerbare marketingroutes; sluit technische endpoints en noindex-routes uit.
- De ontwerpomgeving blokkeert indexatie bewust: `app/layout.tsx` heeft `index:false, follow:false`, `app/robots.ts` disallow `/`. Behoud dit voor preview/staging; pas het voor het productiedomein doelbewust aan. Verwijder noindex niet blind voor alle omgevingen.
- Schrijf `/privacy` om zodra echte productieformulieren live gaan, zodat het de feitelijke verantwoordelijke, doeleinden, bewaartermijnen, rechten en gebruikte diensten beschrijft. De huidige tekst zegt terecht dat dit een prototype is; die mag niet ongewijzigd als productiebeleid worden gepresenteerd.

## 5. Conversie- en CRM-contract

### Proefperiode

Drie stappen in `/proberen`: organisatie (bedrijf, branche, teamgrootte, doel), kennismaken (naam, zakelijk e-mailadres, optioneel telefoonnummer), controle en verzenden. Teruggaan/wijzigen behoudt invoer. De bestaande prototypesuccesscreen vermeldt nadrukkelijk dat een **aanvraag** is geregistreerd; er wordt nog geen account of abonnement aangemaakt. Bouw automatische proefaccountactivatie alleen als aparte, bewust aangesloten productiefunctie.

### Afspraak en demo

Twee stappen in `/afspraak`: onderwerp + datum + beschikbaar tijdslot, daarna naam/bedrijf/e-mail/verplicht telefoonnummer/optioneel gespreksonderwerp. Onderwerpen zijn Kennismaking (`appointment`) en Productdemo (`demo`). **Uitsluitend telefonisch, 30 minuten. Videogesprek is verwijderd en mag nergens terugkomen als keuze, icoon, tekst of standaardwaarde.** `?type=demo` selecteert de productdemo vooraf.

Tijdzone is `Europe/Amsterdam`, niet de tijdzone van de server of browser. De beschikbaarheid komt live uit het CRM. Datumwijziging wist een ongeldige tijdselectie; laad-/lege-/foutstatus hebben eigen UI en opnieuw-ladenactie. De formulierflow toont pas een geslaagd resultaat na een succesvolle serverresponse met echte identifiers. Bij 409 gaat de gebruiker terug naar moment kiezen en worden slots opnieuw opgehaald.

### API-vorm

| Endpoint | Contract |
| --- | --- |
| `GET /api/crm/availability?date=YYYY-MM-DD` | Responsobject met `date` en `slots: string[]`, tijden in HH:mm. UI valideert het schema en de overeenkomende datum. |
| `POST /api/crm/intake` | JSON met `kind: appointment | demo | trial`, `name`, `company`, `email`, `phone`, optioneel `sector`, `team`, `goal`, `message`, `date`, `time`, plus `idempotencyKey`. |
| Intake-succes | `ok:true`, `leadId`, `requestId`, bij afspraak `appointmentId`, eventueel `notificationStatus`. |
| Intake-fout | Passende niet-2xx-status en veilig `error`-bericht; behoud invoer en herhaalbaarheid. |

Dubbele klikken worden client-side onderdrukt; dezelfde poging houdt bij onzeker netwerkresultaat dezelfde idempotency key. Inhoudelijk wijzigen creëert een nieuwe key. Behoud server-side idempotentie en atomaire reserveringen in de echte backend: frontendbescherming alleen is onvoldoende.

De Sites-proxy leest een server-only `FIELDGRID_CRM_SERVICE_TOKEN`, gebruikt een vaste upstreamorigin, `redirect: manual`, 20 seconden upstreamtimeout en `Cache-Control: no-store`. De browser krijgt geen beheertoken. POST vereist JSON, maximaal 20.000 tekens/bytes-controle zoals geïmplementeerd, en weigert een aanwezige afwijkende Origin. Ongeldige datum, ontbrekende configuratie en niet-JSON upstreamresponse krijgen gecontroleerde fouten. De huidige Origin-check is geen volledige abuse-/botbeveiliging; productie heeft eigen servervalidatie, limieten, rate limiting en passende openbare intake-autorisatie nodig. **Kopieer geen Sites-owner/bypass-token of productiesecrets naar broncode, clientbundle of overdracht.**

Gebruik in de productierepo de bestaande globale SendGrid-/notificatievoorziening en expliciete platformbeheerderregistratie. Geen nieuw CRM-specifiek ontvangerformulier en geen arbitraire eerste klantgebruiker als beheerder. De marketingreceipt moet `accepted` onderscheiden van daadwerkelijke bezorging; `pending_config`, `failed`, `queued/sending` en demo zijn geen verzonden mail. Externe agenda-synchronisatie bestaat nog niet in dit prototype. De UI vermeldt alleen de werkelijk gerealiseerde afspraakregistratie en integratiestatus.

## 6. Acceptatiecriteria voor Codex

- Alle 23 routes en legacyredirects renderen, direct openen/vernieuwen werkt, 404 is echt 404. Elke header-, mega-menu-, mobiel-menu-, footer-, card-, breadcrumb- en CTA-link heeft een geldige bestemming.
- Visuele vergelijking met Sites op desktop/tablet/mobiel: logo, fonts, kleuren, spacing, cardgrids, foto's/crops, zachte schaduwen, blauwe banden, componentvormen, formulierstates en motion blijven herkenbaar gelijk. Geen terugval naar de standaard UI van de bestaande repo.
- De donkerblauwe Iedereen-op-dezelfde-pagina-sectie staat direct na Gemaakt-voor-de-werkdag. Er is alleen Signature Grid als marketingdesign.
- Hoofd-CTA's werken overal. `/demo` heeft zowel de interactieve demo als een persoonlijke demo-CTA naar `/afspraak?type=demo`.
- Keyboardtests: menu openen/sluiten, Escape, focus na formulierstap, perspectief-/demotabs met pijltjestoetsen, FAQ, en focusmarkering. Reduced-motion blijft leesbaar en bruikbaar.
- Formulieren registreren testaanvragen in het echte CRM-model, bewaren invoer bij fout en tonen geen schijnsucces. Nieuwe aanvraag verschijnt in de pipeline met juiste bron/type/contactinformatie. Proefperiode, kennismaking en demo worden afzonderlijk getest.
- Raceproef met twee aanvragen voor hetzelfde slot: maximaal één afspraak; tweede poging krijgt 409 en bruikbare hervatting. Dubbele retry met dezelfde idempotency key levert geen dubbele aanvraag/lead/afspraak of mail op.
- Telefonisch is de enige afspraakvorm, telefoon verplicht voor afspraak/demo. Beschikbaarheid, datumgrenzen en Nederlandse zomertijd worden in Europe/Amsterdam afgehandeld.
- Globale SendGrid-flow gebruikt bestaande platformbeheerder en de centrale dispatch-/logginglogica. API-acceptatie wordt niet als bezorging gepresenteerd. In test/staging worden geen echte derden gemaild.
- Geen beheertokens in HTML, source maps, JS-bundles, git of documentatie. Alleen passende openbare intake-endpoints zijn vanuit de marketingwebsite bereikbaar; CRM-beheer blijft beschermd.
- Productiehost is www.fieldgrid.nl; canonical, OG, JSON-LD en sitemap sluiten daarop aan. Staging blijft noindex. Productieprivacy komt overeen met daadwerkelijke gegevensverwerking.

## 7. Grenzen van het aangeleverde prototype

De interactieve productdemo's, plannings-/werkbonvoorbeelden, telefoonmockup en onboardingchecklist zijn lokale UI-demonstraties en schrijven niet naar de operationele planning of personeelsdatabase. De drie conversieformulieren zijn wel verbonden met een persistent prototype-CRM. Een gratis proefaccount, abonnement, externe Google-/Microsoft-agendasynchronisatie en echte mailbezorging zijn geen impliciet afgeronde productiefuncties. De genoemde functionaliteit op de marketingpagina's moet bij integratie worden getoetst aan bestaande productierechten en modules; vorm en copy niet reduceren tot lege placeholders om technische koppelingen te omzeilen.

De bron bevat ontwerpcontent en demonstratiegegevens. Neem geen CRM-prototypeklantdata, tokens, lokale databases, buildcache of omgevingbestanden op in productie. Behoud uitsluitend bron, assets en veilige configuratievoorbeelden. De Sites-preview is de visuele referentie; de oplevering moet uiteindelijk werken op de echte repo en het juiste productiedomein.

## Hostrouting is een functionele integratie, niet alleen een canonicalwijziging

Lees `docs/02-DELTA-TEN-OPZICHTE-VAN-REPO.md`: `lib/tenancy/hostname.ts` classificeert www momenteel als tenant. Introduceer expliciete marketinghostclassificatie vóór tenantresolutie, behoud `APP_URL=https://fieldgrid.nl` en de bestaande platform-/tenantlinks. `/platform` op www is de productuitleg; `/platform` op fieldgrid.nl is beveiligd platformbeheer. Isoleer beide in host- en routemapping. Laat `Inloggen` naar de bestaande platformlogin op https://fieldgrid.nl/login leiden. Geen algemene redirect van alle fieldgrid.nl-paden naar www, omdat dit login, API's en webhooks kan breken.

Gebruik hostafhankelijke rewrite/dispatch naar een uniek intern marketingpad vóór de bestaande logincontrole. Een Next-routegroep alleen verandert de URL niet en lost de dubbele `/platform`-route dus niet op. `lib/auth/session-signal.ts::isProtectedPage` markeert momenteel ieder pad onder `/app`, `/staff`, `/klant` en `/platform` als beschermd; `proxy.ts` zet daarvoor headers en voert logincontrole uit. Alleen www als host herkennen is daarom onvoldoende: productuitleg op www zou nog steeds als privé worden behandeld.

Kies een aparte interne marketingroute, pas de hostafhankelijke verwerking vóór die guard toe en behoud de oorspronkelijke private platformguard. De publieke allowlist is begrensd; directe toegang tot interne marketingpaden op andere hosts geeft geen bypass. De marketinghost mag nooit CRM-beheer of andere private routes anoniem blootleggen. Test expliciet `www.fieldgrid.nl/platform` anoniem als productpagina, `fieldgrid.nl/platform` anoniem als beschermd beheer en interne rewritepaden op verkeerde hosts als geweigerd. De codekeuze mag verschillen zolang de publieke paden, beveiligingsgrenzen en UI gelijk blijven. Er is geen productie-DNS/TLS-status vastgesteld in dit pakket.
