# Fieldgrid klantportaal en personeelsapp roadmap

Datum: 2026-07-05
Status: uitvoerbare roadmap op basis van statische analyse
Scope: `artifacts/klant-pwa`, `artifacts/personeel-pwa`
Gerelateerd: `docs/research-tenant-backoffice-ui-cleanup.md`, `docs/fieldgrid-platform-admin-roadmap.md`

## 1. Doel

Deze roadmap zet de analyse van het klantportaal en de personeelsapp om in concrete, uitvoerbare taken. Het doel is:

- broken links en route-risico's wegnemen;
- placeholder- en onafgemaakte productiefunctionaliteit expliciet maken;
- notificaties veilig per doelgroep laten routeren;
- raw browser dialogs vervangen door consistente enterprise UI;
- klantportaal professioneler, rustiger en consistenter maken;
- personeelsapp sterker maken op tablet en desktop zonder de mobiele werkvloerflow te verzwaren;
- alle kernflows afsluiten met reproduceerbare desktop, tablet en mobile QA.

## 2. Uitgangspunten

- Er wordt geen businesslogica verwijderd zonder expliciete productkeuze.
- Bestaande server actions, permissions, tenant-scope en moduleflags blijven leidend.
- Klantportaal en personeelsapp krijgen elk hun eigen UX-patronen, maar delen dezelfde kwaliteitslat: rustige informatiehierarchie, voorspelbare acties, consistente states en geen onbedoelde 404-links.
- Runtime links worden per doelgroep opgebouwd. Een backoffice-link mag niet in klant- of personeelsnotificaties terechtkomen.
- Elke fase wordt als aparte versiebranch uitgevoerd en eindigt met typecheck, relevante build en, waar UI geraakt wordt, screenshots.

## 3. Huidige status uit analyse

### 3.1 Wat goed staat

- Beide apps hebben een brede functionele basis.
- `klant-pwa` bevat routes voor dashboard, login, wachtwoord reset, objecten, opdrachten, aanvraagflow, facturen, betalingen, offertes, rapporten, documenten, meldingen/tickets, profiel, beveiliging en instellingen.
- `personeel-pwa` bevat routes voor dashboard, planning/opdrachten, openstaande opdrachten, werkbonnen, afronden, materiaal, inventaris, meerwerk, uren, beschikbaarheid, verlof, berichten, meldingen, instellingen, beveiliging, documenten, profiel, nieuws en scanflows.
- Er is geen brede productie-mockdata gevonden.
- De development accounts in de personeelslogin zijn alleen development-only.
- TypeScript typechecks voor beide apps slagen.

### 3.2 Belangrijkste risico's

- Sommige domain-events en notificaties gebruiken backoffice-achtige hrefs zoals `/assignments/...`, `/tickets/customer/...` of `/tickets/personnel/...`.
- Persisted notificaties linken direct naar `row.href`, waardoor verkeerde doelgroep-links een 404 kunnen veroorzaken.
- Enkele flows gebruiken `window.confirm`, `confirm()` of `window.alert`.
- MFA in de personeelsapp toont nog een echte "nog niet beschikbaar" melding.
- Het klantdashboard is functioneel maar druk en niet volledig tenant-branding-aware.
- De personeelsapp is sterk mobiel, maar desktop/tablet voelt op meerdere plekken als een opgeschaalde mobiele layout.

## 4. Prioriteiten

### P0 - Direct oppakken

- Route- en notificatiehrefs per doelgroep normaliseren.
- Persisted notificatiehrefs sanitiseren.
- Raw browser dialogs vervangen door app-dialogs/toasts/sheets.
- MFA-stub oplossen of feature-flaggen.
- Personeelsapp desktopnavigatie aanvullen met ontbrekende hoofdroutes.

### P1 - Volgende tranche

- Klantportaal gedeelde UI-primitives introduceren.
- Klantdashboard rustiger en enterprise-waardiger maken.
- Klant finance, support, objecten, opdrachten, documenten en rapportages naar consistente patronen brengen.
- Personeelsapp tablet/desktop workbench voor planning en werkbonnen.
- Offline coverage van personeelsacties auditen en aanvullen.

### P2 - Polish en consistentie

- Copy, empty states en tenant-branding door klantportaal heen aanscherpen.
- Support/tickets prominenter positioneren.
- Finance groeperen tot een duidelijk werkgebied.
- Objectbeheer voorzien van governance en approval-statussen.
- Personeelsinstellingen/profiel/beveiliging samenbrengen in een consistente settings shell.

### P3 - Later

- SLA's en statusindicaties uitbreiden.
- Export/download centrum voor klantdocumenten, facturen en rapportages.
- Notificatievoorkeuren verder verfijnen.
- Geavanceerde analytics voor portaalgebruik.

## 5. Uitvoerbare fases

### Fase 0 - Baseline QA en route-inventaris

Doel: een reproduceerbare nulmeting vastleggen voordat UI en routing worden aangepast.

Taken:

- CP-00.1 Inventariseer alle routes in `artifacts/klant-pwa/src/app`.
- CP-00.2 Inventariseer alle routes in `artifacts/personeel-pwa/src/app`.
- CP-00.3 Maak een matrix met route, doelgroep, auth-status, moduleflag en verwachte navigatie-ingang.
- CP-00.4 Run typecheck voor beide apps met de juiste Node-versie.
- CP-00.5 Maak Playwright screenshots op staging of lokale seedomgeving voor mobiel, tablet en desktop.
- CP-00.6 Leg alle 404's, redirectloops, layoutoverlap en horizontale scroll vast.

Acceptatiecriteria:

- Route-matrix bestaat in docs of test-output.
- Typechecks zijn groen.
- Screenshotset bevat minimaal dashboard, lijstpagina, detailpagina, instellingen/security en notificaties per app.

### Fase 1 - Route safety en notificatiehrefs

Doel: voorkomen dat klant- of personeelsgebruikers naar backoffice-routes of dode routes gestuurd worden.

Taken:

- CP-01.1 Introduceer een centrale route-helper per doelgroep: backoffice, customer en personnel.
- CP-01.2 Normaliseer klant-ticket hrefs: klantportaal gebruikt `/meldingen/tickets/[id]`.
- CP-01.3 Normaliseer klant-opdracht hrefs: klantportaal gebruikt `/opdrachten/[id]`.
- CP-01.4 Normaliseer personeels-ticket hrefs: personeelsapp gebruikt `/berichten/[id]`.
- CP-01.5 Laat management-events expliciet een backofficeHref gebruiken in plaats van een generieke `href`.
- CP-01.6 Sanitize persisted klantnotificaties voordat ze aan UI-links worden doorgegeven.
- CP-01.7 Sanitize persisted personeelsnotificaties voordat ze aan UI-links worden doorgegeven.
- CP-01.8 Voeg tests toe voor route mapping en onbekende href fallback.

Bestanden om te controleren:

- `artifacts/klant-pwa/src/actions/tickets.ts`
- `artifacts/klant-pwa/src/actions/assignments.ts`
- `artifacts/klant-pwa/src/actions/notifications.ts`
- `artifacts/personeel-pwa/src/actions/messages.ts`
- `artifacts/personeel-pwa/src/actions/notifications.ts`
- `artifacts/personeel-pwa/src/actions/inventory-issues.ts`

Acceptatiecriteria:

- Klantnotificaties linken nooit naar `/assignments`, `/tickets/customer` of backoffice-only routes.
- Personeelsnotificaties linken nooit naar `/tickets/personnel` of backoffice-only routes.
- Onbekende of lege href valt terug naar een veilige inboxroute.
- Typecheck en relevante tests zijn groen.

### Fase 2 - Raw dialogs vervangen

Doel: browser-native confirms en alerts vervangen door consistente app UI.

Taken:

- CP-02.1 Voeg of hergebruik een klantportaal confirm dialog/toast patroon.
- CP-02.2 Voeg of hergebruik een personeelsapp confirm dialog/toast/bottom-sheet patroon.
- CP-02.3 Vervang `confirm()` in openstaande opdrachten interesse/niet-beschikbaar flow.
- CP-02.4 Vervang `window.confirm` in werkbon status-start flow.
- CP-02.5 Vervang `window.alert` in betaalactie foutafhandeling door toast of inline error.
- CP-02.6 Controleer keyboard focus, escape sluiten en mobile sheetgedrag.

Bestanden om te controleren:

- `artifacts/personeel-pwa/src/app/(app)/openstaand/ApplyButton.tsx`
- `artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/WorkOrderStatusProgress.tsx`
- `artifacts/klant-pwa/src/components/PaymentActionButton.tsx`

Acceptatiecriteria:

- Geen raw `confirm()` of `window.alert()` meer in klant- en personeelsproductieflows.
- Destructieve of statuswijzigende acties hebben duidelijke titel, uitleg en primaire/secundaire actie.
- Mobile screenshots tonen geen layoutoverlap.

### Fase 3 - Auth, security en onafgemaakte functies

Doel: zichtbare securityfunctionaliteit afronden of tijdelijk eerlijk verbergen.

Taken:

- CP-03.1 Beslis of MFA in personeelsapp nu live moet.
- CP-03.2 Als live: implementeer Supabase TOTP enrollment, verify, recovery en disable flow.
- CP-03.3 Als nog niet live: verberg MFA achter featureflag en toon geen "nog niet beschikbaar" productieblok.
- CP-03.4 Controleer klantportaal security pagina op vergelijkbare onafgemaakte states.
- CP-03.5 Controleer dat development login accounts nooit in productie renderen.
- CP-03.6 Controleer raw anchors met basePath, zoals `/personeel/wachtwoord-vergeten`, en vervang waar nodig door consistente Next links.

Bestanden om te controleren:

- `artifacts/personeel-pwa/src/app/(app)/beveiliging/MfaSettings.tsx`
- `artifacts/personeel-pwa/src/components/LoginForm.tsx`
- `artifacts/personeel-pwa/src/app/not-found.tsx`
- `artifacts/klant-pwa/src/app/(app)/beveiliging`

Acceptatiecriteria:

- Geen zichtbare security-placeholder in productie.
- Wachtwoord-reset links werken correct achter basePath en Caddy-routing.
- Login en security flows zijn getest op mobiel en desktop.

### Fase 4 - Klantportaal informatiearchitectuur

Doel: het klantportaal rustiger en logischer ordenen.

Taken:

- CP-04.1 Herdefinieer de hoofdnavigatie rond dagelijkse klanttaken: Home, Opdrachten, Objecten, Support, Financieel, Documenten.
- CP-04.2 Groepeer Facturen, Betalingen en Offertes onder een financieel werkgebied of consistente finance shell.
- CP-04.3 Maak Support/Tickets prominenter en laat "Contact opnemen" direct naar nieuw ticket of support inbox gaan.
- CP-04.4 Trek terminologie gelijk: kies bewust tussen Opdrachten, Afspraken en Aanvragen.
- CP-04.5 Bepaal welke items in mobile bottom nav thuishoren en welke in "Meer".
- CP-04.6 Documenteer moduleflagged routes en lege states per module.

Acceptatiecriteria:

- Klant kan binnen twee klikken naar opdrachtstatus, open factuur, ticket en document.
- Desktop en mobiel gebruiken dezelfde mentale structuur.
- Geen dubbelzinnige labels voor hetzelfde concept.

### Fase 5 - Klantdashboard rustiger maken

Doel: het klantdashboard ombouwen van druk kaartoverzicht naar rustig enterprise startscherm.

Taken:

- CP-05.1 Vervang losse KPI-kaarten door een compacte summary strip.
- CP-05.2 Voeg een "Actie nodig" inbox toe met maximaal vijf concrete acties.
- CP-05.3 Maak focuspanelen voor Opdrachten, Financieel en Support.
- CP-05.4 Verplaats secundaire widgets zoals recente documenten, rapportages en objecten lager op de pagina.
- CP-05.5 Maak begroeting dynamisch op basis van tijd.
- CP-05.6 Vervang hardcoded "Veele Services" door tenant branding/tenantnaam.
- CP-05.7 Laat "Spoedaanvraag" urgentie vooraf invullen of hernoem de actie.
- CP-05.8 Maak empty states zakelijk, kort en actiegericht.

Bestanden om te controleren:

- `artifacts/klant-pwa/src/app/(app)/page.tsx`
- `artifacts/klant-pwa/src/components/PageShell.tsx`
- `artifacts/klant-pwa/src/components/MobilePageShell.tsx`

Acceptatiecriteria:

- Dashboard is scanbaar binnen tien seconden.
- Eerste viewport bevat status, urgente acties en primaire vervolgstappen.
- Geen hardcoded Veele-copy in generieke SaaS-klantportal UI.
- Mobile screenshot heeft geen overvolle kaartstapeling.

### Fase 6 - Klantportaal shared UI-primitives

Doel: lijst- en detailpagina's consistent maken zonder businesslogica te herschrijven.

Taken:

- CP-06.1 Voeg `PortalPageShell` of breid bestaande `PageShell` uit.
- CP-06.2 Voeg `PortalPageHeader` toe met titel, subtitle, status/context en primaire actie.
- CP-06.3 Voeg `PortalToolbar` toe voor zoeken, kernfilter en filterknop.
- CP-06.4 Voeg `PortalFilterSheet` toe voor geavanceerde filters.
- CP-06.5 Voeg `PortalActiveFilterChips` toe.
- CP-06.6 Voeg `PortalDataList` toe met desktop table en mobile card pattern.
- CP-06.7 Voeg `PortalActionMenu` toe voor rijacties.
- CP-06.8 Voeg `PortalConfirmDialog` toe voor risicovolle acties.
- CP-06.9 Integreer als referentie eerst een laag-risico pagina.

Acceptatiecriteria:

- Nieuwe primitives gebruiken bestaande stylingtokens.
- Geen datamodelwijzigingen.
- Referentiepagina werkt op desktop, tablet en mobiel.

### Fase 7 - Klantportaal kernlijsten normaliseren

Doel: objecten, opdrachten, facturen, documenten, rapportages en tickets consistent laten werken.

Taken:

- CP-07.1 Migreer objectenlijst naar shared toolbar, filters, mobile cards en action menu.
- CP-07.2 Migreer opdrachtenlijst naar hetzelfde patroon.
- CP-07.3 Migreer facturen/betalingen/offertes naar finance list pattern.
- CP-07.4 Migreer documenten naar document list pattern met upload/download acties.
- CP-07.5 Migreer rapportages naar review/download pattern.
- CP-07.6 Migreer meldingen/tickets naar support inbox pattern.
- CP-07.7 Controleer queryparameters en server actions blijven gelijk.

Acceptatiecriteria:

- Alle kernlijsten hebben consistente zoek/filter/action UX.
- Mobiel gebruikt cards in plaats van horizontale tabellen.
- Geen bestaande actie of filter verdwijnt.

### Fase 8 - Klant supportcentrum

Doel: tickets en contact volwassen neerzetten als enterprise supportgebied.

Taken:

- CP-08.1 Maak `/meldingen/tickets` een echte support inbox.
- CP-08.2 Voeg filters toe voor status, prioriteit, object/opdracht en datum.
- CP-08.3 Maak ticketdetail rustiger met conversation timeline en reply composer.
- CP-08.4 Voeg duidelijke "Nieuw ticket" flow toe vanaf dashboard, objectdetail en opdrachtdetail.
- CP-08.5 Maak SLA/statuscopy voorbereid op toekomstige SLA's.
- CP-08.6 Controleer bijlagen/uploadstatus en foutstates.

Acceptatiecriteria:

- Klant kan zonder zoeken een vraag stellen over object, opdracht, factuur of algemeen onderwerp.
- Ticketdetail leest als een supportgesprek, niet als losse kaarten.
- Notifications linken naar juiste ticketdetailroute.

### Fase 9 - Klant finance werkgebied

Doel: facturen, betalingen en offertes samenbrengen tot een helder financieel werkgebied.

Taken:

- CP-09.1 Ontwerp finance summary: openstaand saldo, vervallen, binnenkort te betalen, laatste betaling.
- CP-09.2 Maak facturenlijst compacter met status, bedrag, vervaldatum en acties.
- CP-09.3 Integreer batchbetaling als wizard/sheet in plaats van zwaar los blok.
- CP-09.4 Trek offertes gelijk met finance patroon.
- CP-09.5 Voeg duidelijke PDF/download/export acties toe.
- CP-09.6 Controleer bestaande betaal- en e-mailflows blijven intact.

Acceptatiecriteria:

- Klant ziet direct wat betaald moet worden.
- Offertes, facturen en betalingen voelen als een familie.
- Betalen en downloaden zijn de dominante acties, niet losse secundaire knoppen overal.

### Fase 10 - Klant objecten, opdrachten, documenten en rapportages

Doel: operationele klantflows logischer maken.

Taken:

- CP-10.1 Voeg governance toe aan klant objectcreatie: concept, pending review of goedgekeurd.
- CP-10.2 Maak objectdetail tabbed of section-based: overzicht, opdrachten, documenten, rapportages, tickets.
- CP-10.3 Maak opdrachtdetail tabbed of section-based: status, planning, rapportage, documenten, support.
- CP-10.4 Maak rapportages filterbaar op object, opdracht, type en datum.
- CP-10.5 Maak documenten filterbaar op object, opdracht, type en datum.
- CP-10.6 Voeg consistente empty states en upload/download states toe.

Acceptatiecriteria:

- Klant begrijpt verschil tussen object, opdracht, rapportage en document.
- Nieuwe objecten worden niet stilzwijgend operationeel actief zonder reviewkeuze.
- Documenten en rapportages zijn vindbaar zonder lange lijstscroll.

### Fase 11 - Personeelsapp navigatie en desktop/tablet shell

Doel: personeelsapp logisch maken op mobiel, tablet en desktop.

Taken:

- CP-11.1 Voeg Berichten toe aan desktop sidebar.
- CP-11.2 Voeg Nieuws toe aan desktop sidebar of profiel/meer-menu met duidelijke ingang.
- CP-11.3 Voeg Meldingen en Instellingen logisch toe aan desktop layout.
- CP-11.4 Trek desktop en mobile labels gelijk.
- CP-11.5 Controleer bottom nav: Home, Planning, Uren, Meldingen/Berichten, Meer.
- CP-11.6 Verminder dubbele headerlogica tussen algemene layout en opdrachtdetail waar mogelijk.
- CP-11.7 Maak tablet max-width ruimer waar werkbench-content dat nodig heeft.

Bestanden om te controleren:

- `artifacts/personeel-pwa/src/components/AppLayout.tsx`
- `artifacts/personeel-pwa/src/components/MobileHeader.tsx`
- `artifacts/personeel-pwa/src/components/BottomNav.tsx`
- `artifacts/personeel-pwa/src/app/(app)/meer`

Acceptatiecriteria:

- Alle hoofdmodules zijn op desktop zichtbaar of logisch bereikbaar.
- Mobiel blijft compact en werkvloergericht.
- Tablet gebruikt beschikbare breedte beter dan een smalle telefoonkolom.

### Fase 12 - Personeel planning en werkbon workbench

Doel: planning en opdrachtuitvoering op tablet/desktop enterprise-waardiger maken.

Taken:

- CP-12.1 Maak planning command bar met datum, statusfilter, zoek/filter en view mode.
- CP-12.2 Maak planning cards compacter en statusduidelijker.
- CP-12.3 Bouw opdrachtdetail op als workbench: status/next action, object/contact, checklist, materiaal/inventaris, rapportage.
- CP-12.4 Op tablet/desktop: toon context en acties naast elkaar in plaats van alle kaarten onder elkaar.
- CP-12.5 Maak primaire actie sticky maar niet overlappend.
- CP-12.6 Vervang risicovolle statuswijzigingen door confirm sheet/dialog uit fase 2.

Acceptatiecriteria:

- Monteur ziet direct wat de volgende actie is.
- Objectadres, contact, toegangsinformatie en checklist zijn zonder zoeken zichtbaar.
- Desktop/tablet screenshots tonen geen smalle, verloren mobiele layout.

### Fase 13 - Personeel openstaande opdrachten en berichten

Doel: interesse, niet-beschikbaar en vragen stellen professioneler maken.

Taken:

- CP-13.1 Vervang interesse/niet-beschikbaar confirms door bottom sheets.
- CP-13.2 Voeg duidelijke feedback toe na interesse of afwijzing.
- CP-13.3 Maak "vraag stellen" flow consistent met berichten/tickets.
- CP-13.4 Normaliseer berichtdetail als conversation timeline.
- CP-13.5 Controleer notifications naar berichtenroute.
- CP-13.6 Maak openstaande opdrachten filterbaar en scanbaar op mobiel.

Acceptatiecriteria:

- Personeelslid kan zonder twijfel interesse tonen, afwijzen of een vraag stellen.
- Berichtflow voelt als een inbox, niet als een verborgen detailpagina.
- Geen verkeerde ticketroutes in personeelsnotificaties.

### Fase 14 - Personeel offline coverage en werkvloerbetrouwbaarheid

Doel: alle kritieke werkvloeracties consistent offline-safe of expliciet online-only maken.

Taken:

- CP-14.1 Audit offline queue dekking voor start werk.
- CP-14.2 Audit offline queue dekking voor checklisttaken.
- CP-14.3 Audit offline queue dekking voor materiaalgebruik.
- CP-14.4 Audit offline queue dekking voor inventarisissues.
- CP-14.5 Audit offline queue dekking voor meerwerk.
- CP-14.6 Audit offline queue dekking voor rapportnotities en foto's.
- CP-14.7 Audit offline queue dekking voor afronden/closeout.
- CP-14.8 Voeg duidelijke pending/sync failed/synced states toe.
- CP-14.9 Maak online-only acties expliciet en blokkeerbaar met nette copy.

Acceptatiecriteria:

- Elke kritieke actie heeft een gedocumenteerde offline-status.
- Offline acties geven feedback en sync-status.
- Geen stille dataverliesroutes bij tijdelijk netwerkverlies.

### Fase 15 - Settings, profiel en beveiliging consistent maken

Doel: profiel, notificaties, beveiliging en instellingen per app als coherent settingsgebied neerzetten.

Taken:

- CP-15.1 Maak settings shell voor klantportaal.
- CP-15.2 Maak settings shell voor personeelsapp.
- CP-15.3 Groepeer profiel, notificaties, wachtwoord, MFA en voorkeuren.
- CP-15.4 Voeg sticky save bars toe waar formulieren lang zijn.
- CP-15.5 Vervang losse success/error copy door consistente toast/inline feedback.
- CP-15.6 Controleer alle security copy op productiegeschiktheid.

Acceptatiecriteria:

- Gebruiker vindt profiel, wachtwoord, notificaties en beveiliging op een voorspelbare plek.
- Geen onafgemaakte securityfunctionaliteit zichtbaar zonder featureflag.
- Formulieren zijn bruikbaar op mobiel.

### Fase 16 - Eind-QA en releasegate

Doel: alle aangepaste portaalflows visueel en functioneel valideren.

Taken:

- CP-16.1 Run typecheck voor `@workspace/klant-pwa`.
- CP-16.2 Run typecheck voor `@workspace/personeel-pwa`.
- CP-16.3 Run build voor beide apps.
- CP-16.4 Maak Playwright screenshots voor klantportaal:
  - dashboard;
  - objecten;
  - objectdetail;
  - opdrachten;
  - opdrachtdetail;
  - aanvraagflow;
  - facturen/betalingen/offertes;
  - documenten;
  - rapportages;
  - meldingen/tickets;
  - profiel/security/settings.
- CP-16.5 Maak Playwright screenshots voor personeelsapp:
  - dashboard;
  - planning/opdrachten;
  - opdrachtdetail;
  - openstaand;
  - uren;
  - beschikbaarheid/verlof;
  - berichten;
  - meldingen;
  - documenten;
  - profiel/security/settings;
  - nieuws.
- CP-16.6 Controleer tekstoverlap, horizontale scroll, dropdowns, sheets, dialogs, sticky panels en mobile nav.
- CP-16.7 Test notification hrefs met klant-, personeel- en backoffice-doelgroep.
- CP-16.8 Leg resterende issues vast als P1/P2 backlog.

Acceptatiecriteria:

- Geen bekende broken links in klant- of personeelsnavigatie.
- Geen raw browser dialogs in kernflows.
- Geen zichtbare productie-placeholder voor security.
- Desktop, tablet en mobiel zijn leesbaar en bruikbaar.
- Typecheck en build zijn groen.

## 6. Aanbevolen volgorde

1. Fase 0 - Baseline QA en route-inventaris.
2. Fase 1 - Route safety en notificatiehrefs.
3. Fase 2 - Raw dialogs vervangen.
4. Fase 3 - Auth, security en onafgemaakte functies.
5. Fase 4 - Klantportaal informatiearchitectuur.
6. Fase 5 - Klantdashboard rustiger maken.
7. Fase 6 - Klantportaal shared UI-primitives.
8. Fase 7 - Klantportaal kernlijsten normaliseren.
9. Fase 8 - Klant supportcentrum.
10. Fase 9 - Klant finance werkgebied.
11. Fase 10 - Klant objecten, opdrachten, documenten en rapportages.
12. Fase 11 - Personeelsapp navigatie en desktop/tablet shell.
13. Fase 12 - Personeel planning en werkbon workbench.
14. Fase 13 - Personeel openstaande opdrachten en berichten.
15. Fase 14 - Personeel offline coverage en werkvloerbetrouwbaarheid.
16. Fase 15 - Settings, profiel en beveiliging consistent maken.
17. Fase 16 - Eind-QA en releasegate.

## 7. Concrete "done" definitie voor de hele roadmap

De roadmap is afgerond wanneer:

- alle doelgroep-links via centrale route helpers lopen;
- notificaties nooit meer naar verkeerde doelgroep-routes verwijzen;
- klantportaal dashboard en kernflows rustiger en consistenter zijn;
- personeelsapp op mobiel, tablet en desktop logisch navigeerbaar is;
- planning en werkbonnen op tablet/desktop als echte workbench werken;
- MFA is geimplementeerd of correct feature-flagged;
- raw browser dialogs uit kernflows zijn verdwenen;
- typecheck/build groen zijn voor beide apps;
- Playwright screenshots aantonen dat desktop, tablet en mobiel geen overlap, horizontale scroll of kapotte sticky UI bevatten.
