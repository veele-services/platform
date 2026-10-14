# Volledige schermen- en actiematrix

Deze matrix is een implementatie- en acceptatielijst voor de uitvoerende Codex, opgesteld aan de hand van de meegeleverde Sites-broncode. **De rijen zijn nog geen bewijs van een productie-implementatie, browsercontrole of geslaagde test.** Gebruik ze samen met `docs/03`, `docs/04`, `docs/05` en de afvinklijst in `docs/07`.

De vastgezette bronnen zijn marketing `c78377808dc560f4b8c2288b69dfe504845d8c94` en platform `3999c85b76aecf729f3b2bba86e1535255915848`. Paden met **M/** betekenen `source/marketing/`; **P/** betekent `source/platform/`. Overnemen betekent de bestaande componentstructuur, copy, assets, CSS, toestanden en interacties als uitgangspunt gebruiken. Geen herontwerp en geen schermen reconstrueren uit alleen een screenshot.

## 1. Host, route en bewijsregels

| Onderdeel | Vast uitgangspunt | Te leveren acceptatiebewijs |
| --- | --- | --- |
| Publieke website | `https://www.fieldgrid.nl`, uitsluitend Signature Grid | Alle 23 onderstaande pagina's rechtstreeks openen en vernieuwen op de marketinghost; navigatie en metadata kloppen. |
| Platformbeheer | Bestaande platformhost `https://fieldgrid.nl`; `/platform` blijft privé | Anoniem geen beheerdata; bevoegde platformbeheerder krijgt echte CRM- en platformgegevens. |
| Tenant, personeel en klant | Bestaande tenantadressen, rechten en daadwerkelijke router van de repository behouden | Geen cross-tenant gegevens, geen toegang op grond van een lokaal gekozen demorol. |
| Dubbele `/platform` | Op www productuitleg; op de platformhost geauthenticeerd beheer | Hostafhankelijke dispatch vóór de bestaande logincontrole; verkeerde host of direct intern rewritepad geeft geen bypass. Zie `docs/02` en `docs/05`. |
| Previewroutes | Platform-Sites gebruikt `#/app/...`, `#/platform/...` en portalweergaven in lokale state | Productie gebruikt echte bestaande routes, record-ID's en servermutaties. De onderstaande Sites-route is een referentie, geen verplichting om een hashrouter te installeren. |
| Gedeelde vormgeving | Exacte fonteigenschappen, witruimte, grids, kleuren, foto's/crops, zachte schaduwen, blauwe accenten, motion, dialogs en responsive states | Vergelijk referentie en implementatie met gelijke fictieve data, viewport, rol en open/gesloten toestand. Noteer waargenomen afwijkingen. |
| Integratiegrens | Bestaande repository is leidend voor authenticatie, tenantisolatie, datamodel, notificatiebeleid en deployment; Sites voor UI/UX | Geen browserlocalStorage als productiedatabase, geen Sites-ownerfallback als productieautorisatie en geen demo-entiteiten over echte gegevens schrijven. |

`APP_URL=https://fieldgrid.nl` blijft de bestaande applicatiebasis. Maak geen tenant met slug `www` en plaats geen algemene redirect voor alle root-hostpaden. Het www-doel is een expliciete eerdere gebruikerskeuze; het verwijzen naar “fieldgrid.nl” in de totaalopdracht verandert die domeinverdeling niet.

Voor elke acceptatie-ID hieronder vult Codex de werkelijke productie-/stagingroute, implementatiecommit, controleresultaat en bewijs in. Onderscheid **gebouwd**, **getest**, **gedeployed** en **live functioneel geverifieerd**.

## 2. Website: alle 23 pagina's

Alle routes in deze tabel horen bij `https://www.fieldgrid.nl`. Gedeelde route-resolutie: `M/app/page.tsx` en `M/app/[...path]/page.tsx`; gedeelde chrome: `M/components/site-chrome.tsx`.

| ID | Route / pagina | Primaire bron | Te behouden UI/UX en inhoud | Interactie, integratie en acceptatie |
| --- | --- | --- | --- | --- |
| W01 | `/` — Signature Grid | `M/components/homes/Signature.tsx`, `Signature.module.css`, `M/components/sections.tsx` | Volledige hero met product-/fotogrid, alle secties en lange copy; zie volgorde hieronder | Beide CTA's, perspectieftabs, demo, onboardingchecklist, FAQ en alle cards werken; plaatsing van de twee verplaatste secties exact controleren. |
| W02 | `/branches` | `M/components/standard-pages.tsx` → `BranchesPage`, `M/lib/content.ts` | Brancheoverzicht met vijf kernsectoren en twee ontwikkelrichtingen | Alle zeven branchecards openen het juiste detail; geen oude conceptkeuze. |
| W03 | `/branches/schoonmaak` | `M/components/detail-pages.tsx` → `SectorPage`, `M/lib/content.ts` | Schoonmaakcopy, eigen beeld, voordelen, praktijk, stappen en FAQ | Breadcrumbs, relevante productlinks en beide conversieroutes werken; eigen titel/description. |
| W04 | `/branches/glasbewassing` | Dezelfde `SectorPage`, eigen sectorrecord | Glasbewassingcopy, sectorspecifieke foto en voorbeelden | Geen gekopieerde schoonmaaktekst of verkeerde gerelateerde links; formulierbestemmingen werken. |
| W05 | `/branches/facilitair` | Dezelfde `SectorPage`, eigen sectorrecord | Facilitaire dienstverlening, locatiecontext en eigen lange copy | Correcte sectorselectie/content en metadata; volledige template zichtbaar. |
| W06 | `/branches/groenonderhoud` | Dezelfde `SectorPage`, eigen sectorrecord | Groenonderhoud, eigen beeld, praktijk en FAQ | Links en CTA's werken; geen aanvullende onbewezen productclaims. |
| W07 | `/branches/vastgoedservice` | Dezelfde `SectorPage`, eigen sectorrecord | Vastgoedservice, klantlocaties en eigen inhoud | Eigen metadata, gerelateerde producten, leesbare mobiele content. |
| W08 | `/branches/beveiliging` | Dezelfde `SectorPage`, eigen sectorrecord | Verticale uitbreiding met de bestaande aanduiding in ontwikkeling | Afspraken-CTA werkt; sectorspecifieke functies niet als reeds gebouwd presenteren. |
| W09 | `/branches/evenementen` | Dezelfde `SectorPage`, eigen sectorrecord | Evenementen als ontwikkelrichting, eigen foto en inhoud | Ontwikkelstatus zichtbaar houden, ook in menu/context; juiste contactbestemming. |
| W10 | `/platform` | `M/components/standard-pages.tsx` → `PlatformPage` | Publiek productoverzicht met productonderdelen en verbonden werkdag | Anoniem bereikbaar op www; links naar de zeven productdetails, geen privédashboard. |
| W11 | `/platform/planning` | `M/components/detail-pages.tsx` → `ProductPage`, `M/lib/content.ts` | Planningtemplate, eigen copy, voordelen, demo en FAQ | Directe route/refresh, demo-interactie, gerelateerde product- en CTA-links. |
| W12 | `/platform/werkbonnen` | Dezelfde `ProductPage`, eigen productrecord | Digitale werkbonnen en uitvoeringscontext | Juiste content en productdemo; niets schrijft vanuit de publieke demo naar echte werkbonnen. |
| W13 | `/platform/objecten` | Dezelfde `ProductPage`, eigen productrecord | Klanten & Object 360 | Eigen content en links, behoud de in de copy beschreven functionele grenzen. |
| W14 | `/platform/personeelsapp` | Dezelfde `ProductPage`, eigen productrecord | Personeelsapp en mobiele werkdag | Mobiele presentatie, CTA's en gerelateerde onboarding-/werkboninformatie. |
| W15 | `/platform/klantportaal` | Dezelfde `ProductPage`, eigen productrecord | Klantportaal, locaties en terugkoppeling | Eigen demo en links; publieke visual is geen toegang tot klantdata. |
| W16 | `/platform/onboarding` | Dezelfde `ProductPage`, eigen productrecord | Personeel & onboarding, eigen onboardingbeeld | Complete content/FAQ en koppeling naar personeelsapp; geen fictieve accountactivatie. |
| W17 | `/platform/offertes-facturatie` | Dezelfde `ProductPage`, eigen productrecord | Offertes & facturatie | Behoud bestaande productnuances; CTA's en breadcrumbs werken. |
| W18 | `/werkwijze` | `M/components/standard-pages.tsx` → `WorkflowPage` | Procesuitleg van inrichting tot gebruik | Volledige stappen en gerelateerde links; beide vervolgroutes beschikbaar. |
| W19 | `/over` | `M/components/standard-pages.tsx` → `AboutPage` | Over Fieldgrid, merkverhaal en bijbehorende compositie | Eigen metadata; werkende contact-/vervolglinks, geen lege placeholdertekst. |
| W20 | `/demo` | `M/components/standard-pages.tsx` → `DemoPage`, `M/components/product-demo.tsx` | Interactieve productdemo met de bestaande tabs en voorbeelduitvoering | Tabwissel en voorbeeldinteracties werken; persoonlijke demo gaat naar `/afspraak?type=demo`. |
| W21 | `/proberen` | `M/components/conversion-pages.tsx` → `TrialPage`, bijbehorende CSS Module | Drie stappen: organisatie, kennismaken, controleren; eigen illustratieve panelen en receipt | Valideren, teruggaan met behoud invoer, werkelijk registreren in CRM; na succes een aanvraag bevestigen, geen niet-bestaand proefaccount. |
| W22 | `/afspraak` en `?type=demo` | `M/components/conversion-pages.tsx` → `AppointmentPage`, bijbehorende CSS Module | Twee stappen: onderwerp/moment en contactgegevens; kennismaking of productdemo | Uitsluitend telefonisch, 30 minuten; telefoon verplicht. Live slots, fout/lege/loading states, 409-herstel en receipt; query kiest Productdemo vooraf. |
| W23 | `/privacy` | `M/components/standard-pages.tsx` → `PrivacyPage` | Bestaande pagina-opmaak en leesstructuur | Vóór productie de prototypeprivacy vervangen door feitelijke productie-inhoud; geen prototypeverklaring als definitief beleid publiceren. |

### Homepagevolgorde en interactieve onderdelen

De volgorde van W01 is bindend: **hero → verbindingsstrook → drie perspectieven → vijf kernsectoren → Gemaakt voor de werkdag → donkerblauw Iedereen op dezelfde pagina → onboarding → werkstroom → eigen branding → beveiliging/evenementen → FAQ → dubbel CTA-blok → footer**. Aankondigingsbalk en navigatie blijven erboven.

| ID | Onderdeel / bron | UI/UX en actie | Controle |
| --- | --- | --- | --- |
| W24 | Alle pagina's: `M/components/site-chrome.tsx` | Logo naar home; desktop-megamenu's en mobiel menu; één disclosure tegelijk; sluiten bij Escape, buitenklik en navigatie; sticky-headerstate; footer | Elke menu-, footer- en onderliggende link heeft een concrete bestemming. Toetsenbord en mobiel blijven bruikbaar. |
| W25 | Gedeelde CTA's: `M/components/ui.tsx`, `sections.tsx`, `site-chrome.tsx` | “Probeer nu 30 dagen gratis” naar `/proberen`; “Plan een afspraak in” naar `/afspraak`; bestaande kortere headerlabels behouden | Controleer iedere voorkomende CTA, niet alleen de hero. Een persoonlijke demo kiest het juiste querytype. |
| W26 | Perspectieven/demo: `M/components/homes/Signature.tsx`, `M/components/product-demo.tsx` | Voor kantoor / Voor je team / Voor je klant; demo planning/werkbon/klant; mobiele personeelsappvisual | Selectiestatus, inhoud en toetsenbordpijlen volgen dezelfde keuze; demo blijft veilig demonstratief. |
| W27 | Onboarding/FAQ: `M/components/homes/Signature.tsx`, `M/components/ui.tsx` | Checklist met voortgang; bestaande FAQ-disclosures en revealpresentatie | Voortgang reageert op de checklist; FAQ opent/sluit; reduced motion laat alle inhoud leesbaar. |
| W28 | Sector-/producttemplates: `M/components/detail-pages.tsx`, `M/lib/content.ts` | Breadcrumbs, beeldhero, voordelen, lange tekst, stappen, demo, FAQ, gerelateerde pagina's | Geen weggelaten secties of generieke vultekst; broncopy en beeldcrops per record behouden. |
| W29 | Routing/404: `M/app/[...path]/page.tsx`, `M/app/not-found.tsx` | Legacy-prefixen `signature`, `horizon`, `atlas`, `flow`, `people` permanent naar hetzelfde pad zonder prefix | Ook onderliggende oude paden testen; onbekend pad echte 404 met werkende terugweg. Geen oude designs opnieuw activeren. |
| W30 | SEO/merkassets: `M/lib/seo.ts`, `lib/concepts.ts`, `app/layout.tsx`, `app/robots.ts`, `public/` | Lokale Poppins/Inter, echte SVG-logo's, 12 WebP-assets, alt-teksten, semantische headings, metadata en JSON-LD | Productie-origin www; sitemap toevoegen; uitsluitend productie indexeerbaar. Sites-origin/preview-noindex niet onbedoeld meenemen naar live. |

## 3. Publieke formulieren naar CRM en beheerdersmelding

De Sites-transportadapter staat in `M/lib/crm-proxy.ts`, `M/app/api/crm/intake/route.ts` en `M/app/api/crm/availability/route.ts`. De platformreferentie staat in `P/app/api/crm/route.ts`, `P/app/api/crm/[...path]/route.ts`, `P/lib/crm-server.ts`, `P/lib/crm-availability.ts`, `P/lib/platform-mail.ts` en `P/db/schema.ts`. Deze adapter en D1-schema zijn referenties voor gedrag; productie gebruikt de bestaande repository-infrastructuur.

| ID | Actie | Vereiste integratie | Acceptatie |
| --- | --- | --- | --- |
| I01 | Proefperiode versturen | `kind=trial`; organisatie, branche, team, doel, contactgegevens; lead + nieuwe aanvraagsnapshot + opvolging + historie + centraal notificatie-event | Successcreen pas na echte commit. Geen afspraak of account automatisch verzinnen. Aanvraag staat daarna in CRM en overzicht. |
| I02 | Kennismaking/demo versturen | `kind=appointment/demo`; contactgegevens en Amsterdam-slot; dezelfde registraties plus afspraakreservering | Afspraak en demo afzonderlijk controleren; geen video-optie of achtergebleven video-validatie; server weigert ontbrekende telefoon. |
| I03 | Tijdslot ophalen/kiezen | `GET /api/crm/availability?date=YYYY-MM-DD`; alleen openbare beschikbaarheid, geen persoonsgegevens | Datumwijziging verwijdert oude selectie; stale responses overschrijven geen nieuwe datum; fout/geen slots/opnieuw laden zijn bruikbaar. |
| I04 | Dubbel klikken, time-out en opnieuw proberen | Serveridempotentie en atomaire transactie; gewijzigde payload bij bestaande sleutel geeft conflict | Eén aanvraag/afspraak/taak/delivery bij dezelfde poging; formulierinvoer blijft bewaard; geen schijnsucces bij onzekere response. |
| I05 | Herhaalde interesse van dezelfde relatie | Bestaande lead koppelen op de afgesproken bedrijfs-/e-mailnormalisatie; iedere intake heeft eigen blijvende snapshot | Een latere wijziging in het leaddossier overschrijft eerder ontvangen contact-/aanvraaggegevens niet. |
| I06 | Agenda openen en beschermen | Werkdagen, uren, buffer, voorlooptijd, horizon en blokkades uit CRM; UTC-opslag en `Europe/Amsterdam`-presentatie | Concurrente/overlappende reserveringen, zomertijd en wintertijd controleren; één geldig slot kan niet dubbel worden verkocht. |
| I07 | Mail aan platformbeheerder | Bestaande globale SendGrid-configuratie, centrale policy/transport/worker, expliciete primaire platformbeheerderregistratie | Geen nieuw CRM-adresveld, geen providerkey in browser, geen willekeurige eerste Auth-user. Platformmelding zonder klanttenant correct door centrale deliveryketen. |
| I08 | Mailstatus en herstel | Duurzame outbox/delivery; ontbrekende configuratie, blokkade, fout, queued/sending, accepted en onzekere uitkomst afzonderlijk behandelen | Intake blijft bewaard bij mailfout. `accepted` is geen bezorgbewijs; retry is beleidsmatig veilig en dupliceert niet blind. |

De bestaande centrale worker accepteert op de vastgezette repo-baseline niet overal een lege tenantcontext. De uitvoerende Codex moet dit expliciet oplossen en testen voor platform-CRM; geen fictieve tenant-ID of omzeiling van centraal beleid. Zie de concrete repo-analyse in `docs/02` en het integratiecontract in `docs/04`.

## 4. Platformoverzicht, CRM-kaarten en acht acties

Primaire bronnen: `P/src/ExistingDashboards.tsx`, `P/src/CRMOverview.tsx`, `P/src/crm-overview.css`. Sites-referentie: `#/platform` / `#/platform/overview`.

| ID | Schermdeel | Te behouden UI/UX / actie | Integratie en acceptatie |
| --- | --- | --- | --- |
| C01 | Platformoverzicht | Header → vier platformmetrics → vier CRM-kaarten → Aandacht nodig/Supportcockpit → Tenantoverzicht/Platformacties | Exact deze volgorde en desktop/mobile grids. Geen terugkeer van de verwijderde groepskop, introductie, “Alle gegevens”-selector of losse refreshknop. |
| C02 | Actieve pipeline | Aantal, potentiële maandwaarde, actieve fasebalken, gewonnen/verloren; Open pipeline | Won/lost uitgesloten van actief. Fasebalken openen in de referentie pipeline zonder extra fasefilter; geen omzetlabel voor potentiële waarde. |
| C03 | Recente aanvragen | Hoogstens drie nieuwste aanvraagsnapshots; rij en footer doorklikbaar | Rij opent Aanvragen met hetzelfde leaddossier; legacy lege snapshotvelden hebben correcte fallback. |
| C04 | Afspraken | Eerstvolgende niet-geannuleerde afspraken, bevestigingsstatus en datumblok | Rij opent Agenda met gekoppeld dossier; footer opent agenda. Gedeelde definitie van toekomstig gebruiken in kaart en CRM-teller. |
| C05 | Opvolging | Open taken en volgende leadcontactmomenten, datum en achterstalligheid | Taak naar Opvolging, leadmoment naar Pipeline, juiste dossierselectie; Amsterdam-kalenderdatum. |
| C06 | Laden/verversen/fout/lege data | Bestaande loading, empty, fout met retry, refreshfout met laatste data en herkenbare voorbeeldlabels | Veilige datarefetch bij focus en circa 30 seconden/zichtbaarheid of gelijkwaardige bestaande infrastructuur; geen handmatige groepsrefresh toevoegen. |
| C07 | Aandacht en Support | Bestaande feiten en links naar organisaties/support | Feiten uit echte status; support blijft expliciet gedeelde supportcontext, geen onbeperkte tenantinzage. |
| C08 | Tenantoverzicht | Recente tenants, status, tenantdetail en “Alle tenants” | Echte record-ID's en bevoegde navigatie; geen hardgecodeerde voorbeeldorganisatie. |

| ID | Platformactie | Sites-doel | Werkend resultaat in productie |
| --- | --- | --- | --- |
| A01 | Nieuwe lead | `#/platform/crm?action=new-lead` | Nieuwe-leaddialoog direct geopend. |
| A02 | Afspraak plannen | `#/platform/crm?tab=agenda&action=new-appointment` | Afspraakdialoog direct geopend, leadkeuze; zonder lead eerst contact toevoegen. |
| A03 | Aanvragen bekijken | `#/platform/crm?tab=requests` | Aanvragenlijst en dossierdoorklikken. |
| A04 | Opvolging | `#/platform/crm?tab=tasks` | CRM-takenlijst. |
| A05 | Beschikbaarheid | `#/platform/crm?tab=settings` | Agenda-instellingen en centrale meldingscontext. |
| A06 | Tenant onboarden | `startWizard()` / `#/platform/onboarding` | Bestaande zesstappen-onboarding behouden, gekoppeld aan echte provisioning. |
| A07 | Huisstijl beheren | Geselecteerde tenant → detailtab `branding` | Huisstijl van die tenant; Fieldgrid-platformchrome blijft ongewijzigd. |
| A08 | Templates beheren | `#/platform/templates` | Bestaand tenantgebonden templatebeheer. |

Dit zijn exact acht tegels. De extra ondersteunde directe CRM-actie `action=new-task` is geen negende tegel. Behoud haar routegedrag waar gebruikt, zonder de goedgekeurde kaartindeling te wijzigen.

## 5. Volledig CRM

Bronnen: `P/src/CRM.tsx`, `P/src/crm.css`, `P/src/crm-types.ts`, genoemde serverbestanden. De vijf hoofdtabwaarden zijn `pipeline`, `requests`, `agenda`, `tasks` en `settings`.

| ID | Sites-route / scherm | UI/UX en interacties | Data-/rechtenintegratie en acceptatie |
| --- | --- | --- | --- |
| R01 | `#/platform/crm` — Pipeline | Eigen heading, vier CRM-metrics, zoek/type/eigenaar/gegevensfilters, reset, bord/lijst; zeven fases `new`, `contacted`, `scheduled`, `proposal`, `trial`, `won`, `lost` | Filters en tellingen gebruiken echte data; fasewissel blijft bewaard na refresh. Drag/drop én alternatief via dossier. Overvolle borden scrollen binnen hun eigen container. |
| R02 | Leaddossier | Tabs Overzicht en Notities & tijdlijn; fase, eigenaar, potentiële maandwaarde, volgend contactmoment; aanvragen, afspraken en taken met context | Verplicht platformrecht; correcte lead-ID; wijzigingen, notities en nieuwe opvolgtaak werkelijk opslaan en opnieuw ophalen; aanvraaghistorie niet herschrijven. |
| R03 | Nieuwe lead | Bedrijf, contactpersoon, e-mail, telefoon, branche, eigenaar; bestaande dialoog/foutstatus | Servervalidatie en duurzame registratie. Directe A01-route en reguliere knop geven hetzelfde resultaat. |
| R04 | `?tab=requests` — Aanvragen | Zoeken, aanvraagtypefilter, type/bron/contactgegevens, mailstatus en dossierdoorklikken | Iedere intake afzonderlijk tonen, inclusief herhaalde aanvraag bij één lead; originele snapshots en juiste type behouden. |
| R05 | `?tab=agenda` — Agenda | Week-/lijstweergave, datum, vorige/volgende week, Vandaag; afspraak openen/beheren | Werkelijke beschikbaarheid en afspraken; geen persoonsgegevens in publieke slotresponse. Juiste Amsterdamdatum en tijd. |
| R06 | Nieuwe/bestaande afspraak | Lead kiezen; datum/vrij tijdslot; bevestigen, verplaatsen, annuleren met bevestiging; ICS-export waar beschikbaar | Atomaire slotmutatie. Bij verplaatsconflict blijft oude afspraak staan; annuleren maakt slot vrij. ICS is export, geen bewijs van Google-/Microsoft-synchronisatie. |
| R07 | `?tab=tasks` — Opvolging | Filteren, taak aanmaken/bewerken, datum/eigenaar/lead, afronden/heropenen; dossierdoorklikken | Mutaties server-side; dezelfde taak in overzicht en dossier. Bestaande deadlines en achterstalligheid consistent. |
| R08 | `?tab=settings` — Beschikbaarheid | Werkdagen, start/eind, buffer, minimaal vooraf boeken, boekingshorizon, vaste duur 30 minuten telefonisch, blokdagen toevoegen/verwijderen | Opslaan heeft effect op de publieke website. Blokkade voorkomt nieuwe reserveringen; bestaande afspraken blijven totdat ze bewust worden verplaatst/geannuleerd. |
| R09 | `?tab=settings` — Mail & beschikbaarheid | E-mailmeldingen aan/uit; automatisch gekoppelde beheerder; zichtbare status van globale SendGrid-service | Globale identiteit/configuratie lezen; geen nieuw ontvanger- of credentialformulier. Bevoegde wijziging van meldingsvoorkeur met audit. |
| R10 | Mailregistratie / beheerdersmelding | Statusfilter, melding openen, vastgelegde inhoud/ontvanger, gekoppeld leaddossier, passende retryactie | Werkelijke centrale deliverystatus. Geaccepteerde historische ontvanger niet herschrijven bij latere accountwijziging. Onzekere uitkomst niet blind opnieuw verzenden. |
| R11 | Leeg/loading/fout/voorbeeldtoestanden | Bestaande feedback, disabled acties tijdens mutatie, herstelbare fouten, voorbeeldbadges en voorbeeldbeheer | Voorbeelden duidelijk afzonderlijk; voorbeeldbeheer mag geen echte aanvragen verwijderen of echte mails veroorzaken. Prototypefixtures niet als productieklanten importeren. |

## 6. Bestaand platformbeheer rondom CRM

Alle onderstaande platformweergaven staan in `P/src/ExistingDashboards.tsx`; gekoppelde beheeridentiteit in `P/src/PlatformAdminAccount.tsx`. Styling komt ook uit `P/src/app/platform/platform.css`, `platform-consistency.css` en `P/src/existing-dashboards.css`.

| ID | Sites-route / scherm | UI/UX en acties | Productie-inpassing en acceptatie |
| --- | --- | --- | --- |
| P01 | `#/platform/tenants` | Zoekbare tenanttabel, status/modules/medewerkers, paginatie, detail, Nieuwe tenant | Echte tenants en serverrechten; bestaande uitgebreide velden/lifecycle niet terugbrengen tot demokolommen. |
| P02 | `#/platform/detail` | Tenanthero; tabs Overzicht, Huisstijl, Modules, Communicatie, Domein | Productieroute bevat een echte stabiele tenantselectie. Activeren/pauzeren, palette, whitelabel, moduleafhankelijkheden, afzender en domein werken via bestaand beheer. |
| P03 | `#/platform/onboarding` | Zes stappen Organisatie, Beheerder, Huisstijl, Modules, Communicatie, Controleren; terug/wijzigen/validatie | Echte tenantprovisioning en uitnodiging volgens bestaande procedure; lokale voorbeeldmelding niet als voltooid productieaccount tonen. |
| P04 | `#/platform/templates` | Tenantkeuze, templatelijst, berichteditor, tokens en live preview | Tenantgebonden revisies en centrale verzendregels behouden; opslaan is geen testmailversturen. |
| P05 | `#/platform/support` | Supporttickets, status, toegewezen persoon, openen en antwoord-/statusflow | Werkelijke gedeelde tickets, rechten, berichten en audit; geen automatische brede tenantinzage. |
| P06 | `#/platform/supportsettings` | Reactietermijn en standaardverantwoordelijke | Bestaande instellingen duurzaam bewaren en in relevante supportflow gebruiken. |
| P07 | `#/platform/productbeheer` | V1-modules, doorklikken, roadmap-/updatepaneel | Echte modules/entitlements en hun afhankelijkheden behouden; geen demoflag als productierecht. |
| P08 | `#/platform/team` en platformaccount | Beheerderrij met bestaande accountidentiteit; supportmedewerker toevoegen/bekijken | Primaire beheerder expliciet bepalen; supportrechten apart. Uitnodiging/lifecycle koppelen aan echte accounts, geen lokale naamrij als geslaagde uitnodiging. |
| P09 | `#/platform/kennisbank`, `#/platform/notificaties` | Artikelen/berichten, panels en detailvensters; topbarbel | Bestaande content, leesrechten en notificatielifecycle aansluiten; CRM-bel gaat naar aanvragen zoals in bron. |

## 7. Tenantbackoffice en management

Shell/routing: `P/src/App.tsx`; gedeelde tabs/headers/modals: `P/src/ui.tsx`, `P/src/components/fieldgrid/`, `P/src/app/` en `P/src/prototype.css`. Productie houdt de bestaande tenant-URL's en rechten. De preview-toolbar, demorolwisselaar, vaste persoonsnamen, demo-reset en browserstorage worden niet als productiefunctie overgenomen.

| ID | Sites-route / scherm | Primaire bron en UI/UX | Integratie en acceptatie |
| --- | --- | --- | --- |
| T01 | `#/app/overzicht` | `P/src/Management.tsx` → `Overview`, `ExistingDashboards.tsx` → `OperationalOverview`; geïntegreerde operationele en managementmetrics, trend, acties en verdieping | Eén bestaand `/app`-overzicht behouden; echte aggregaties en bronlinks. Geen tweede los dashboard dat gegevens anders telt. |
| T02 | `#/app/aanvragen` | `ExistingDashboards.tsx`; Aanvragen & offertes, tabs Alle dossiers/Aanvragen/Offertes, filters en dossier | Bestaande commerciële tenantintake, offertevelden, lifecycle en mutaties behouden. Dit domein is niet het nieuwe platform-CRM. |
| T03 | `#/app/planning` | `ExistingDashboards.tsx`; planbord en gekoppelde werkbonnen | Bestaande planning, toewijzing, navigatie en dossiers behouden; demo vervangt geen rijk operationeel planbord. |
| T04 | `#/app/werkbonnen`, `#/app/rapporten` | `ExistingDashboards.tsx`; werkbonnen en rapportcontrole | Echte werkboncyclus, uitvoering, beoordeling, correctie en bronkoppelingen; geen vereenvoudigde lokale status als volledige verwerking. |
| T05 | `#/app/taken` | `ExistingDashboards.tsx`; Taken & tarieven | Bestaande taak-/tariefgegevens, geldige mutaties en rechten behouden. Niet verwarren met CRM-opvolgtaken. |
| T06 | `#/app/klanten`, `#/app/objecten`, `#/app/personeel` | `ExistingDashboards.tsx` → `EntityPage`; zoeken/status/sorteren/pagineren, nieuw/bewerken, dossier Overzicht/Documenten/Opvolging | Echte relaties en record-ID's; object-klantbinding en personeelsrechten. Demo vervangt geen bestaande velden, documenten of dossiers. |
| T07 | `#/app/facturen` | `ExistingDashboards.tsx`; factuuroverzicht en bron/detailinteracties | Bestaande facturatie, documenten, betaalstatus en lifecycle behouden; lokale demonstratie is geen boekhouding. |
| T08 | `#/app/opvolging` | `P/src/Management.tsx` → `ControlCenter`; vandaag/week/achterstallig/mijn/zonder eigenaar/uitgesteld/afgerond, bronnen, toewijzing, uitstellen/afronden, nieuwe actie | Eén gedeelde actie-/dossierregistratie met audit en revisiecontrole; bronwijziging en cockpit blijven consistent. |
| T09 | `#/app/sla` | `P/src/FinanceSLA.tsx` → `SLAView`; metrics, filters, serviceafspraakdetail, contractversie en historie | De bestaande ticketklok hergebruiken; geen tweede SLA-timer met afwijkende pauzes/deadlines. |
| T10 | `#/app/omzet` | `P/src/FinanceSLA.tsx` → `FinanceView`; categorieën, bronregels, controle-uitkomst en onderbouwing | Nog te factureren, te controleren en onbetaald onderscheiden; echte bronallocatie en financiële rechten. |
| T11 | `#/app/indexatie` | `P/src/FinanceSLA.tsx` → `IndexationView`; concept, goedkeuring, verwerking, tarief/percentage/ingangsdatum en historie | Versies en rolgebonden goedkeuring; verwerking via bestaande contract-/tarieflogica, geen lokale optelling. |
| T12 | `#/app/besluiten` | `P/src/Governance.tsx` → `DecisionsView`; concept/vaststellen/herzien, toegangsscope, bron, motivering en vervolgactie | Dossierautoriteit, versiehistorie, beperkte scopes en echte gekoppelde opvolging. |
| T13 | `#/app/compliance` | `P/src/Governance.tsx` → `ComplianceView`; eis, bewijs, verloopdatum, eigenaar, beoordeling en afgeschermde dossierstate | Echte private bestanden en serverrechten; een ingevulde bestandsnaam is geen upload. |
| T14 | `#/app/weekrapport` | `P/src/Governance.tsx` → `ReportsView`; periode, toelichting, snapshot, archief, bekijken, PDF en rapportplanning | Onveranderlijke opgeslagen snapshot, consistente metrics en echte jobs. Lokale planningsinstelling bewijst geen verzonden rapport. |
| T15 | `#/app/nieuws`, `#/app/kennisbank`, `#/app/updates` | `P/src/App.tsx` → `InformationView`; bestaande tabellen/artikeldetails | Echte content en module-/rolrechten; geen demoberichten als volledige kennisbankimport. |
| T16 | `#/app/gebruikers`, `#/app/instellingen` | `P/src/App.tsx` → `RolesView`, `SettingsView`; rollenoverzicht, huisstijl/organisatie | Werkelijke roltoekenning en alle bestaande instellingen behouden; opgeslagen tenantpalet werkt in backoffice/staff/klant, niet in Fieldgrid-platformchrome. |
| T17 | Shell, zoeken, meldingen en bronvenster | `P/src/App.tsx` → `SourceDetail`; responsive navigatie, globale zoekresultaten, accountmenu, brongegevens/Opvolging | Echte brongebaseerde doorklikken en zoekscope; vertrouwelijke financiële/HR-/compliancedata nooit via detaildialoog of ID-wissel uitlekken. |

Aanvullende bestaande management-/rechtenvereisten blijven van kracht via `reference/historisch-v2/`, voor zover ze niet door de actuele Sites-presentatie of expliciete nieuwe beslissingen zijn vervangen. De beperktere previewdata zijn geen opdracht om de productiediepte te verwijderen.

## 8. Personeelsapp en klantportaal

Beide presentatie-adapters staan in `P/src/Portals.tsx`. Personeelsstyling: `P/src/portal-source/staff.css` en `staff-consistency.css`; klantstyling: `customer-portal.css` en `customer-consistency.css`; gedeelde previewaanvulling `P/src/portals-demo.css`.

De preview selecteert onderstaande schermen intern via `view` onder `#/staff` of `#/klant`. De genoemde view-ID's zijn daarom **geen bewezen zelfstandige URL's**. Koppel ze aan de bestaande productieroutes en persistente gegevens zonder de goedgekeurde shells of mobiele navigatie te vervangen.

| ID | Omgeving / view | Zichtbaar scherm en acties | Productie-inpassing en acceptatie |
| --- | --- | --- | --- |
| S01 | Staff `planning` | Dagplanning, weekstrip, vorige/volgende dag, werkbon openen; detailtabs Overzicht/Werkzaamheden/Rapport en rapportnotitie | Alleen toegewezen werk, echte instructies/contact/uitvoering; bestaande uitvoeringsflow en offline/PWA-afspraken behouden. |
| S02 | Staff `uren` | Mijn uren, weekoverzicht, urencorrectie met datum/tijden/reden | Werkelijke urenregistratie en aanvraag/goedkeuringsflow; geen ongetoetste lokale wijziging van betaalde uren. |
| S03 | Staff `verlof`, `beschikbaarheid` | Verlofaanvragen en nieuwe aanvraag; vaste beschikbaarheidsweek | Eigen medewerkerbinding, echte opslag en relevante planning/goedkeuring; datums en status kloppen. |
| S04 | Staff `documenten` | Documentenlijst en documentvoorbeeld | Echte afgeschermde bestanden/downloads; geen fictieve preview als geleverd personeelstuk. |
| S05 | Staff `nieuws`, `knowledge`, `updates`, `tickets` | Nieuws en gelezenstatus, kennisbank, updates, tickets met detail-/contactflow | Echte geautoriseerde content en support; medewerker ziet alleen toegestane gegevens. |
| S06 | Staff `instellingen`, `profiel`, `meer` en overlays | Profiel/meldingen/account; mobiel Meer; notificaties; installatie-uitleg | Eigen profiel en echte accountinstellingen; PWA-installatiegedrag koppelen aan bestaande implementatie. Prototypeaccount niet hardcoderen. |
| K01 | Klant `dashboard` | Cockpit, eerstvolgende afspraak, objecten, recente activiteit en snelle acties | Account-/objectgebonden samenvatting uit echte data; doorklikken houdt klantcontext. |
| K02 | Klant `objects` | Mijn objecten, objectdetail, contact/instructies, object toevoegen | Bestaande objectrechten en eventuele aanvraag/beoordeling behouden; klant kan geen willekeurige tenantlocatie overnemen. |
| K03 | Klant `appointments` | Gepland/Uitgevoerd, afspraakdetail en instructie voor afspraak | Alleen eigen afspraken; instructies en werkboninformatie volgens bestaande toegestane projectie. Geen toegang tot interne staffnotities. |
| K04 | Klant `reports` | Rapportenlijst en rapportvoorbeeld | Werkelijke vrijgegeven rapporten en beveiligde downloads; geen intern rapport blootleggen. |
| K05 | Klant `invoices` | Facturen, status, factuur bekijken en betaalvoorbeeld | Echte factuur/PDF/betaalroute; demo-“betalen” nooit als ontvangen betaling opslaan. |
| K06 | Klant `requests` | Diensten & aanvragen, dienst/object/frequentie/voorkeursdatum/omschrijving, aanvraagdetail | Echte tenantaanvraag met klantbinding; gescheiden van het platform-CRM voor Fieldgrid-verkoop. |
| K07 | Klant `tickets`, `news` | Tickets en nieuws met details | Bestaande klantgebonden tickets/content en echte berichtregistratie. |
| K08 | Klant `profile`, `more`, `knowledge`, `updates`, `notifications` | Mijn gegevens, e-mailvoorkeuren, Meer en content/meldingen | Werkelijke accountvoorkeuren en rechten; mobiele links werken en server beschermt iedere onderliggende resource. |

## 9. Minimale integrale acceptatiescenario's

Deze scenario's verbinden de rijen; ze vervangen de volledige acceptatielijst in `docs/07` niet.

1. **Bezoeker → proefperiode → CRM:** open www-home op mobiel, volg CTA, doorloop alle drie stappen, registreer eenmaal, open dezelfde aanvraag en lead in platformbeheer, controleer opvolging en centrale deliveryregistratie. Een onbevoegde gebruiker kan dat dossier niet openen.
2. **Bezoeker → afspraak/demo → agenda:** kies live slot in Amsterdamtijd, verstuur telefonisch gesprek, vind afspraak op kaart en week/lijstagenda; bevestig, verplaats, exporteer ICS, annuleer en controleer vrijgekomen beschikbaarheid. Race en retry leveren geen dubbele reservering.
3. **Platformoverzicht → acht acties:** controleer de definitieve kaartvolgorde en het ontbreken van de verwijderde groepskop; klik alle acht acties door, inclusief directe dialogs en bestaande tenant-/huisstijl-/templateflow.
4. **Websitebreed:** bezoek de 23 routes rechtstreeks en via menu/footer/gerelateerde links; inspecteer beide CTA's, metadata, 404, legacyredirects, responsive states en reduced motion. Publiek `/platform` op www blijft los van privé `/platform` op de platformhost.
5. **Bestaande app blijft compleet:** open operationeel planbord en dossiers, voer een geautoriseerde managementactie uit, bekijk hetzelfde relevante gegeven via de passende staff-/klantprojectie; bevestig dat extra tenant-/HR-/financiële informatie afgeschermd blijft.

## 10. Expliciete open productiepunten

De broncode bevat het volledige ontwerp en de beschreven prototype-interacties. Voor een echte oplevering moeten nog aantoonbaar worden aangesloten of geverifieerd: hostdispatch, productie-SEO/privacy, echte repo-datamodellen en serverrechten, centrale platformmail zonder klanttenant, atomaire agenda-/intake-integratie, bestaande operationele functionaliteit en relevante releasegates. Externe calendarsynchronisatie, automatische trialaccountactivatie, echte mailbezorging en live DNS/TLS zijn niet door het bestaan van deze bron bewezen. Maak hierover geen positieve statusclaim zonder afzonderlijk bewijs.
