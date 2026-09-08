# 03 — Pagina’s, functies, informatiearchitectuur en acties

`manifests/routes.json` bevat de presentatiecompositie van 75 dashboardpagina’s en 4 authpagina’s: archetype, states, responsive patroon en uitsluitend machineverwijzingen naar capability- en actie-ID’s. `manifests/production-inventory.json` is de enige machineleesbare bron voor bestaande productiefeatures, labels, uitvoerbare acties, exacte permission-/module-/featuregates en bronsymbolen. De gate vergelijkt beide inventarissen 1:1 met de echte App Router en eist per route exact alle productiecapabilities plus alle productie-acties, gegroepeerd naar `primary`, `secondary` en `destructive`, in inventarisvolgorde. Per routeactie moet bovendien minimaal één gekoppeld action- of componentsymbool vanaf exact die App Router-page statisch bereikbaar zijn; de controle volgt relatieve imports, `@/`-aliases, `index`-resolutie, named/default re-exports en grenzen naar clientcomponenten. Alleen wanneer een actie volledig in de page zelf leeft, geldt het gedeclareerde pagesymbool als route-eigen bewijs.

Deze scheiding is hard: vrije capability- en actielabels in `routes.json` zijn verboden en autoriseren geen nieuw businessgedrag. `capabilityIds` verwijst uitsluitend naar alle route-eigen `existingProduction.capabilities`; `primaryActionIds`, `secondaryActionIds` en `destructiveActionIds` verwijzen uitsluitend naar alle route-eigen `existingProduction.actions`. Labels, plaatsing, beschikbaarheid en gedrag worden nooit gedupliceerd. Een uitvoerende agent rendert iedere productiecapability en -actie precies eenmaal onder de gedeclareerde soort, plaatsing en gates. Nieuwe businessfunctionaliteit vraagt een afzonderlijk productcontract. `fieldflowNewContract` gaat hier dus over UI, UX, responsive transformatie en feedbackstates—niet over verzonnen domeinfeatures of -acties.

Het effectieve statecontract per route is de union van de vier globale states, archetypestates, routespecifieke states en—bij een productie-mutation—`saving`, `success` en `mutation-error`. Daardoor zijn `filtered-empty`, validatiefouten en mutatiefouten machine-afdwingbaar zonder dezelfde lijst op tientallen routes te dupliceren.

## 1. Informatiearchitectuur

Behoud URL’s en deeplinks. Herorganiseer de navigatie taakgericht:

| Groep                 | Primaire bestemmingen                                                |
| --------------------- | -------------------------------------------------------------------- |
| Dagelijkse operatie   | Vandaag, Planbord, Opdrachten                                        |
| Relaties en locaties  | Klanten, Objecten en locaties                                        |
| Mensen en middelen    | Medewerkers, Verlof en beschikbaarheid, Materialen, Bedrijfsmiddelen |
| Kwaliteit en bewijs   | Quality en checklists, Rapporten, Documenten                         |
| Financieel            | Offertes, Facturen en betalingen                                     |
| Contact en publicatie | Tickets en verzoeken, Nieuws en berichten, Websitebeheer             |
| Organisatiebeheer     | Instellingen                                                         |
| Ondersteunend         | Profiel, Help, Roadmap, Releases                                     |

Regels:

- navigatie komt uit één registry;
- hoofdroute, subroute, breadcrumb, helpcontext en command-palette-item delen dezelfde definitie;
- permission én module-entitlement bepalen zichtbaarheid;
- directe route blijft server-side beschermd;
- badges tonen alleen betrouwbare permission-aware tellingen;
- een route mag bereikbaar zijn zonder primair sidebaritem, maar nooit orphaned;
- `analysis` uit het prototype is niet productiefunctionaliteit.

`manifests/navigation-contract.json` is voor Fieldflow de machineleesbare
presentatieautoriteit bovenop de productie-routebeveiliging. Het legt voor alle
79 routes exact `parentId`, taakgroep, gedeelde volgorde, label, icoon,
match-prefixes, breadcrumb, helpcontext, zoekcontext en releasezichtbaarheid
vast. Desktop-sidebar, mobiele navigatie en command palette filteren eerst op de
bestaande permission-, module- en featuregates en behouden daarna dezelfde
relatieve manifestvolgorde; geen van deze consumers mag routes lokaal
hergroeperen of hernoemen. Een verborgen tenantroute heeft altijd een
parentketen naar een zichtbare primaire of ondersteunende route. Alleen
`auth-login` is een parentloze verborgen flowroot; de overige authflows hangen
er expliciet onder. Het contract bevat exact 18 primaire, 4 ondersteunende en
57 verborgen routes. Routepatronen winnen van prefixes; bij dynamische
overlap worden segmenten van links naar rechts vergeleken en wint op het eerste
verschil een statisch segment van een parametersegment. Zichtbaarheid evalueert
altijd de volledige `routeAvailability` uit `production-inventory.json`, dus
`allPermissions`, `anyPermissions`, modules, featureflags, planentitlements,
tenantsettings en samengestelde `anyOf`-clausules; één afgevlakte permission of
de informatieve `navigationModule` is nooit voldoende. Op een verborgen
detailroute klimt alleen de actieve navigatiemarkering via `parentId` naar de
dichtstbijzijnde na filtering zichtbare voorouder. De breadcrumb blijft juist
de volledige keten tot de exact gematchte detailroute tonen.

## 2. Actiehiërarchie

### Paginaniveau

- maximaal één actuele primaire headertaak rechts; wanneer de productie-inventaris geen primaire headeractie declareert wordt er geen verzonnen;
- andere `primary`-acties behouden hun exacte inventoryplaatsing, bijvoorbeeld panel, wizard of formulierfooter;
- één hoogfrequente secundaire actie mag zichtbaar;
- overige acties onder “Meer”;
- exportacties onder “Exporteren”;
- contextuele create-acties openen Sheet of Wizard;
- acties worden per specifieke permission berekend.

### Lijstniveau

- recordidentiteit opent het dossier;
- kebabmenu voor wijzigen/dupliceren/status;
- destructieve actie na divider en via AlertDialog;
- bulkacties verschijnen pas bij selectie;
- selectiebar toont aantal, clear en toegestane acties;
- mobiel behoudt dezelfde acties in cardmenu.

### Dossierniveau

- primaire actie = geldige volgende workflowstap;
- desktop action rail;
- mobiel één 44px trigger naar bottom action Sheet;
- statusverandering, annuleren, afwijzen en ontkoppelen behouden verplichte reden;
- onderliggende tabs/secties tonen uitsluitend toegestane functies.

### Formulierniveau

- Save als primary;
- Cancel als secondary;
- destructive buiten normale savegroep;
- autosave alleen waar domeincontract dit al betrouwbaar ondersteunt;
- submit blijft idempotent en toont pending/success/error.

## 3. Dashboard

Routes: `/`.

Brongetrouw behouden:

- permission-aware KPI-samenvattingen en aandachtslinks;
- persona-focus voor Planning, Administratie, Management en Alles;
- weekplanning en capaciteitscontext;
- recente opdrachten en browserlokale recent-bekeken context;
- personeelsbeschikbaarheid;
- release-informatie en recente activiteit;
- handmatige refresh en contextuele Open-links.

Calm-compositie:

1. Permission-aware metrics uit de bestaande loaders.
2. Eén aandachtinbox met uitsluitend bestaande contextlinks.
3. Persona-focus.
4. Weekplanning en bezetting.
5. Recente opdrachten en context.
6. Beschikbaarheid.
7. Releases en activiteit.

Er is nu geen generieke create-quick-actionset voor opdracht, klant of document, geen zelfstandige “live work stream” en geen generieke supportbanner. Fieldflow verzint die acties niet.

Een dataloadfout mag niet als geldige nul/lege waarde worden getoond. Gebruik partiële errorboundary met retry en een zichtbare “gegevens niet beschikbaar”-state.

## 4. Planning

Route: `/planning`.

Volledige specificatie staat in hoofdstuk 04. Productie heeft nu bord/dag, een losse dagtimeline, maand en een featureflag-afhankelijke kaart. Een echte weekview, genormaliseerde `view=`-URL's, interactiedefer bij realtime en offline/degraded feedback zijn expliciet `fieldflowNewContract`. Na uitvoering zijn vijf werkende views vereist:

- `?view=board&date=YYYY-MM-DD`;
- `?view=day&date=YYYY-MM-DD`;
- `?view=week&date=YYYY-MM-DD`;
- `?view=month&date=YYYY-MM-DD`;
- `?view=map&date=YYYY-MM-DD`.

Oude bereikbare `?day=`- en `?month=`-links worden compatibel genormaliseerd; er wordt geen bestaande `?week=`-implementatie verondersteld. Filters blijven behouden bij view- en datumnavigatie. Op het huidige bord bestaat geen primaire “Nieuwe opdracht”-actie en geen “Bordinstellingen”; alleen de dagweergave heeft create. De productie-inventaris bepaalt per view welke controls werkelijk bestaan.

## 5. Opdrachten

Routes:

- `/assignments`;
- `/assignments/[id]`;
- `/assignments/[id]/inventory`.

### Lijst

- zoeken;
- filters status, prioriteit, rapportstatus, regio;
- sortering titel, datum, created, status, prioriteit;
- paginering 25;
- saved views, kolommen, density;
- selectie en bulkannulering met reden;
- create/edit Sheet;
- rij- en bulkannulering, niet archiveren;
- desktoprijen en mobiele cards;
- `?create=1` deeplink blijft werken.

### Dossier

Permission-aware secties:

- Werkbon;
- Gegevens;
- Planning;
- Offerte;
- Rapport;
- Factuur;
- Bijlagen.

Behoud:

- volledige statusstepper;
- klant, object, locatie, contacten, instructies en beveiliging;
- taken;
- planning readiness, capaciteit en kandidaten;
- interesse-uitvraag en rondes;
- offerte-, rapport-, factuur- en documentenacties; inventariskoppeling leeft op de aparte `/assignments/[id]/inventory`-route;
- workflow side effects: audit, notificaties, checklists en revalidation;
- signed/locked contracten.

Statusketen blijft domeingestuurd: requested, review, quote preparation, approval, plannable, scheduled, seen, en route, in progress, completion/report/invoice/payment/closed en cancelled.

## 6. Klanten

Routes: `/customers`, `/customers/[id]`.

### Lijst

- search;
- sector, klanttype, status, plaats, land, accountmanager en datumbereik;
- sortering naam, plaats, created;
- selectie/bulkstatus;
- CSV/PDF-export;
- create/edit;
- actief/inactief/delete volgens rechten;
- DataViewvoorkeuren.

### Dossier

- Overzicht;
- Contacten;
- Objecten;
- Opdrachten;
- Facturen;
- Betalingen;
- Rapporten;
- Documenten;
- Notities;
- Historie;
- Dossier360;
- portalgebruikers/invite;
- contact- en notitie-CRUD;
- geocoding;
- klanttype en lifecycle.

Mobiel groepeert veel secties in een selector, maar verwijdert geen content.

## 7. Objecten en locaties

Routes: `/objects`, `/objects/[id]`.

Lijst:

- KPI’s, zoek, klant, servicetype, regio en status;
- sorteren/pagineren;
- create/edit;
- bulkstatus;
- saved views;
- desktoprij/mobiele card.

Dossier:

- Overzicht;
- diensten;
- read-only materiaal- en inventarissamenvattingen;
- Details;
- Contacten;
- Toegang en veiligheid;
- vaste medewerkers;
- Dossier360;
- security feature/permission, OTP, lock/unlock en versioning.

Restricted securitydata komt nooit in clientpayload of DOM zonder permissie.

## 8. Medewerkers, beschikbaarheid en verlof

Routes:

- `/personnel`;
- `/personnel/[id]`;
- `/personnel/[id]/materials`;
- `/personnel/verlof`.

Lijst:

- search, rol, sector, regio, type en status;
- sorteren, pagineren, kolommen, density, saved views;
- portalstatus, beschikbaarheid en certificaten;
- create/edit, quick inspect en dossier;
- bulkstatus; portaaluitnodiging is uitsluitend een detailactie.

Dossier, als één scrollbare pagina en niet als fictieve tabset:

- profiel/dienstverband;
- beschikbaarheid;
- kwalificaties;
- opdrachten;
- gekoppelde objecten;
- read-only materiaal- en inventarispanels;
- documenten;
- portalaccount/invite/block;
- Dossier360-notities en timeline.

Verlof is momenteel uitsluitend een pending inbox met Goedkeuren/Afwijzen. Kalender, alle-statusregister, conflict-/capaciteitsinzicht en beschikbaarheidsaanpassing zijn geen bestaande routefeatures en worden niet stil toegevoegd. De zichtbare buttons moeten bovendien alsnog correct door `personnel:write` worden gegated.

## 9. Materialen

Routes:

- `/materials`;
- `/materials/[id]`;
- `/materials/dashboard`;
- `/personnel/[id]/materials`.

Brongetrouw behouden, met actielocatie:

- catalogus met naam, code, barcode, categorie en status;
- voorraad per locatie;
- minimum/maximum en lage/negatieve voorraad;
- ontvangen, corrigeren en overboeken;
- stock received/corrected/transferred vanuit de lijst; het personeelsmateriaalpad is read-only;
- inkoop/verkoop, btw, leverancier en factureerbaar;
- mutaties/gebruik en twee specifieke dashboard-CSV's;
- documenten en historie.

De bestaande brede `min-w-[980px]`-tabel wordt DataView + mobiele cards. Permissions worden apart doorgegeven voor create, update, adjust, transfer, archive en manage.

## 10. Bedrijfsmiddelen/inventaris

Routes:

- `/inventory`;
- `/inventory/[id]`;
- `/inventory/[id]/qr`;
- `/inventory/dashboard`;
- `/inventory/issues`;
- `/inventory/issues/[id]`;
- `/assignments/[id]/inventory`.

Brongetrouw behouden, verdeeld over register/detail/issues/opdrachtkoppeling:

- traceerbare items, code/serienummer/categorie/status;
- locatie/toewijzing en mutatietijdlijn;
- beschikbaar, in gebruik, onderhoud, defect, verloren, disposed en archived;
- QR tonen/printen/roteren;
- onderhoud en inspecties;
- read-only issue-inbox; status/resolution/maintenance/documentbewijs op issue-detail;
- opdrachtkoppeling/approval;
- documenten;
- dashboard met status-/werkbongebruik-CSV; geen generieke registerexport.

Het QR-detail biedt alleen Print label, token roteren en terug; geen download- of kopieerlink. Register/detail bieden geen fictieve bulk-, assign-, “nieuwe melding”- of “plan onderhoud”-actie als daar geen bronactie voor bestaat.

Ook hier: geen brede `canWrite`; create/update/archive/manage/resolve/maintenance/approve zijn afzonderlijke capabilities. De `min-w-[1050px]`-tabel krijgt cards.

## 11. Quality en checklists

Route: `/settings/checklists`.

- templates;
- versions;
- sections/fields;
- contextbindings;
- prioriteitsuitleg;
- preview;
- review;
- publish;
- upgrade/duplicate;
- assignment reconciliation, retry en waive;
- immutable published versions.

Create/edit in editor; publish, published-version dupliceren en template archiveren zijn gescheiden en permission-aware. Er is geen “Review aanvragen” of “Concept verwijderen”-actie in de huidige bron.

## 12. Rapporten

Routes: `/reports`, `/reports/[id]`.

- register: search, status, loader-deeplink `customerId`, paginering, responsive rij/cards en rapport openen;
- register is read-only: geen Nieuw rapport, reviewqueue, export of conceptdelete;
- detail: opdracht-/klantcontext, antwoorden, uren, ondertekening, notities, bijlagen, materiaalapproval en links;
- alleen een ingediend rapport kan op detail worden goedgekeurd/afgewezen; alleen approved krijgt PDF;
- geen detail edit-/submit-/deleteactie wordt verzonnen.

## 13. Documenten

Route: `/documents`.

- search;
- categorieën algemeen/opdracht/klant/medewerker/object/materiaal/inventaris/issue/onderhoud;
- bestand, MIME, entiteit, uploader, grootte en datum;
- upload, download signed URL en delete confirm;
- desktoplijst en mobiele cards.

Vervang invoer van een ruwe entiteit-UUID door een permission-aware zoekbare entitypicker. Het servercontract blijft ID-gebaseerd.

Preview, rename, een bestaande koppeling wijzigen, versiehistorie en export bestaan niet en worden niet als behouden feature gepresenteerd.

## 14. Offertes

Routes: `/quotes`, `/quotes/[id]`.

- register: search, status en paginering;
- draft/sent/approved/rejected/expired;
- register is read-only met CSV en links naar offerte, opdracht en PDF; create gebeurt alleen vanuit een opdracht;
- detail toont regels, bedragen, belasting, notities, vervaldatum en context;
- concept kan worden verstuurd, verzonden kan worden goedgekeurd/afgewezen, en PDF blijft beschikbaar;
- geen list-create, duplicate, withdraw, archive, detail-edit of “Maak opdracht”-actie wordt verzonnen.

## 15. Facturen en betalingen

Routes: `/invoices`, `/invoices/[id]`.

- register: financiële metrics, search/status/paginering, overdue reminders, verzamelfactuurwizard, CSV, PDF-/opdracht-/betaallinks;
- een gewone factuur wordt alleen vanuit een opdracht aangemaakt; geen losse “Nieuwe factuur”;
- detail: finaliseren, finaliseren en verzenden/markeren als verzonden, betaallink maken/kopiëren, verzonden factuur mailen, betaald markeren, PDF en annuleren met verplichte reden;
- geen generieke rij-send, manual-payment, line-edit, detailreminder of creditnota-UI wordt verzonnen.

Juridische documentbranding wordt bij finalisatie gesnapshot en verandert niet met een latere UI-themechange.

## 16. Tickets

Routes: `/tickets`, `/tickets/[kind]/[id]`.

- klant- en medewerkerbron;
- search/status/source;
- KPI en unread;
- masterlist + eerste-resultaatpreview;
- detailcontext en metadata;
- requester en gekoppelde opdracht;
- gesprekstimeline;
- reply en statusselect `open`, wachtend of gesloten;
- gekoppelde opdracht openen;
- closed state.

Er is geen tenant-createflow, toewijzing, prioriteitsmutatie, attachmentcomposer, read-action of realtime-inbox in de bestaande productlogica; Fieldflow mag deze niet verzinnen.

## 17. Nieuws

Route: `/news`.

- master/detail editor;
- lokale title/excerpt-search, select en create;
- titel, slug, excerpt, rich text;
- hero upload/remove;
- doelgroep iedereen/medewerkers/klanten/sectoren/specifieke records/klanttypen;
- draft/scheduled/published/archived;
- opslaan, publiceren/plannen via status en datum, en archiveren;
- read/write/send/delete permissions.

Een los previewpaneel, statusfilter en read metrics bestaan niet op deze route.

## 18. Websitebeheer

Routes:

- `/website`;
- `/website/pages`, `/website/pages/[id]`;
- `/website/blog`, `/website/blog/new`, `/website/blog/[id]`;
- `/website/forms`;
- `/website/submissions`, `/website/submissions/[id]`;
- `/website/navigation`;
- `/website/redirects`;
- `/website/review`;
- `/website/settings`.

Brongetrouw behouden:

- managed/custom delivery en initialization;
- pagina metadata en section canvas;
- section create/edit/delete/reorder;
- navigation header/footer/legal en revision;
- redirects;
- blogtaxonomy, TipTap, status en publish;
- form definitions, fields en notifications;
- submissions lifecycle, convert/retry/redact;
- immutable publication candidate, conceptpreview en tweestaps prepare/activate.

Routegrenzen zijn expliciet: pages hebben geen directe preview/publish/archive; navigatie verplaatst met omhoog/omlaag en niet drag-and-drop; redirects hebben geen Testen/Importeren; forms hebben geen veldreorder/preview; submissions-list muteert niets; website-settings beheert geen domeinen/runtime/publicatie. Het detail van iedere bestaande actie en gate staat in `production-inventory.json`.

`WebsiteTabs` toont alleen tabs waarvoor granular read permission bestaat. Publicatiecontrols volgen aparte publishpermissions.

## 19. Instellingen

Routes:

- `/settings`;
- `/instellingen/organisatie`;
- `/instellingen/branding`;
- `/instellingen/gebruikers`;
- `/instellingen/rollen`, `/instellingen/rollen/[id]`;
- `/instellingen/sectoren`;
- `/instellingen/klanttypes`;
- `/instellingen/kwalificaties`;
- `/instellingen/facturen`;
- `/instellingen/mail`;
- `/instellingen/notificaties`;
- `/instellingen/slim-plannen`;
- `/instellingen/activiteitslog`;
- `/instellingen/productervaring`;
- `/settings/task-codes`;
- `/settings/checklists`.

De hub/index/tabs hebben exact dezelfde permissionlogica als de routepagina’s. Branding, Kwalificaties en Productervaring mogen niet ontbreken; Taakcodes verschijnt alleen met read permission.

Functionaliteit:

- organisatie/adres/KvK/btw;
- branding uit hoofdstuk 02;
- gebruikers/invites/status/rollen;
- rollen en permissionmatrix;
- sectoren/klanttypen;
- kwalificatiecatalogus plus medewerker-/rol-/taakcodekoppelingen; catalogusitems worden niet bewerkt maar toegevoegd, geactiveerd, gedeactiveerd of verwijderd;
- factuurnummering, termijnen, tax en reminders;
- mailprovider/sender/test;
- notification events/channels/templates/shortcodes, gerichte handmatige melding en e-mailstijl; geen digest of Alles aan/uit;
- slim-plannen per-sector weights/drempels/rondes/interval/reminder/cooldown/noodoverride; geen generieke raster-/travel-editor of scorepreview;
- audit search, module/rol/datumfilter en detail; geen export of los actionfilter;
- exact drie productexperienceflags;
- taakcodes, facturatie, rollen en requirements;
- checklists.

### P0 RBAC-correctie

De huidige rollenpagina’s gebruiken legacy `rolesTable/rolePermissionsTable/userRolesTable`, terwijl effectieve runtimepermissions en gebruikersbeheer tenanttabellen gebruiken. Vóór visuele acceptatie:

- rollenroutes gebruiken `listTenantRoles`, `getTenantRole`, `createTenantRole`, `updateTenantRole`, `updateTenantRolePermissions`, `deleteTenantRole` en `resetTenantSystemRolesToTemplates`;
- permissionmatrix toont de werkelijk effectieve tenantpermissions;
- bestaande legacy/live bindings worden geïnventariseerd;
- eventueel benodigde datareconciliatie is een aparte reviewed migratie met backup, audit en rollback;
- tests bewijzen dat een wijziging in Rollen direct hetzelfde model beïnvloedt dat `hasPermission` leest.

## 20. First-run

Route: `/first-run`.

De pagina combineert readiness/statistieken/warnings met inline organisatie-, branding-, regio- en defaultvelden. Sectoren, gebruikers en modules zijn tellingen/links, geen ingebouwde editors. Bestaande acties zijn Concept opslaan, afzonderlijke stap gereedmelden, Afronden en Overslaan; er is geen Testmail of generiek “Opslaan en doorgaan”. Links verwijzen naar tenantbestemmingen; branding naar `/instellingen/branding`, niet een legacy logo-editor. Alle nieuwe Fieldflow-copy wordt Nederlands; bestaande Engelse restcopy wordt als paritybug hersteld.

## 21. Profiel, auth en productondersteuning

Routes:

- `/profile`;
- `/login`;
- `/profiel-instellen`;
- `/wachtwoord-vergeten`;
- `/reset-wachtwoord`;
- `/help`, `/help/[slug]`;
- `/help/beheer`, `/help/beheer/nieuw`, `/help/beheer/[articleId]`, `/help/beheer/feedback`;
- `/roadmap`, `/roadmap/new`, `/roadmap/[itemId]`;
- `/releases`, `/releases/[slug]`.

Brongetrouw behouden:

- host-aware login en veilig `next`-pad;
- profile completion;
- twee-staps wachtwoordherstel met niet-enumererende e-mail, OTP-codecontrole, recoverysession en activationvariant;
- kennisbanksearch/autocomplete/categories/featured/related/feedback;
- KB editor, status/archive, media en vaste-window-inzichten indien `kb:manage`, module én tenant authoring-setting dit toestaan;
- roadmapstatus, votes, comments, requests en historie;
- releases/media; read receipt ontstaat automatisch bij openen, zonder fictieve markeer-/dismissactie.

Profiel wijzigt uitsluitend de eigen naam; e-mail/rol zijn read-only en de enige secundaire route is Naar instellingen. Roadmap gebruikt `roadmap:submit_request`, `roadmap:comment` en `roadmap:vote` en heeft geen filters, follow of comment-delete. Releases vereisen `releases:view` plus de module. De exacte actie- en entitlementmatrix staat in `production-inventory.json`.

Authforgot/reset/profile-completion krijgen dezelfde dynamische tenantbranding als login.

## 22. Permissionreconciliatie

Harde regel: UI-capability en actionguard noemen dezelfde specifieke permission.

Bekende mismatches die vóór release gesloten moeten zijn:

- delete customer/object/personnel/assignment/document gebruikt nu op delen `*:write` in plaats van de bestaande `*:delete`;
- materials create/update/adjust/transfer/archive/manage zijn in de UI te grof samengevoegd;
- inventory create/update/archive/manage/resolve/maintenance idem;
- SettingsTabs wijkt af van page guards;
- WebsiteTabs filtert subpermissions niet;
- rollenbeheer schrijft niet naar het runtime-tenantmodel.

Maak een permissiontestmatrix per zichtbare actie:

```text
permission afwezig → control afwezig of disabled met uitleg
permission aanwezig → control zichtbaar
directe forged action zonder permission → server weigert
permission aanwezig, module uit → route/action weigert
supportmodus → expliciete context + audit
```

## 23. Statepariteit

Iedere route bewijst:

- initial loading;
- populated;
- empty;
- filtered empty voor lijsten;
- permission denied;
- not found voor detail;
- mutation pending;
- success;
- validation error;
- recoverable server error;
- stale/concurrent conflict waar mutaties versioned zijn;
- offline/realtime degraded waar live data relevant is.

Een bestaande helper die exceptions stil naar `[]`, `0` of `null` omzet moet error en legitiem leeg van elkaar onderscheiden.
