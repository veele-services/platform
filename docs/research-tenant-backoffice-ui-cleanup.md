# Research tenant backoffice UI cleanup

Datum: 2026-07-05  
Scope: tenant backoffice in `artifacts/backoffice/src/app/(dashboard)` en de bijbehorende componenten in `artifacts/backoffice/src/components`  
Doel: grondig vastleggen hoe de tenant backoffice professioneler, rustiger, consistenter en enterprise-waardiger wordt zonder businesslogica of datamodel in deze onderzoeksstap te wijzigen.

## 1. Samenvatting

De tenant backoffice is functioneel breed en de meeste canonieke workflows bestaan al: dashboard, klanten, objecten, opdrachten, planning, personeel, rapportages, tickets, facturen, documenten, taakcodes, kwalificaties, materiaal, inventaris, instellingen, rollen, auditlog en notificaties. De grootste kwaliteitssprong zit daarom niet in een volledige UI-rebuild, maar in het normaliseren van patronen.

De belangrijkste observaties:

- Er bestaan al goede moderne patronen in onder andere `CustomersView`, `PersonnelView`, `TaskCodesView`, `CustomerDetailActions` en `PersonnelDetailActions`: sheets voor create/edit, dropdownmenu's voor rijacties, `AlertDialog` voor risicovolle acties en badgecomponenten voor status.
- Andere schermen gebruiken nog permanente formulieren naast tabellen, losse `veele-card` containers, inline filters, raw `confirm()` of zichtbare rijacties. Daardoor voelt het product wisselend in rust, dichtheid en kwaliteit.
- De pagina's met de meeste visuele druk zijn het tenantdashboard, materiaalbeheer, inventarisbeheer, facturen, tickets, personeelsdetail, opdrachtdetail en de instellingenmodules met veel formulieren.
- De app mist een expliciete set enterprise backoffice primitives: `TenantPageShell`, `TenantPageHeader`, `TenantToolbar`, `TenantFilterDrawer`, `TenantDataTable`, `TenantStatusBadge`, `TenantDetailDrawer`, `TenantActionMenu`, `TenantConfirmDialog`, `TenantSummaryStrip` en `TenantFormSection`.
- Mobiel en tablet zijn deels responsive, maar vaak door stapeling van dezelfde desktopcontent. Voor enterprise-kwaliteit moeten lijstschermen bewust overschakelen naar compacte cards of table-to-card rows, niet alleen horizontaal scrollen.

Aanbevolen aanpak: eerst shared UI-primitives en richtlijnen neerzetten, daarna per domein schermen normaliseren. Begin met de grootste dagelijkse workflows: dashboard, klanten/objecten/opdrachten, planning/personeel en finance. Daarna instellingen en admin-heavy pagina's.

## 2. Onderzochte code-oppervlakken

Belangrijkste routes:

- `artifacts/backoffice/src/app/(dashboard)/page.tsx`
- `artifacts/backoffice/src/app/(dashboard)/customers`
- `artifacts/backoffice/src/app/(dashboard)/objects`
- `artifacts/backoffice/src/app/(dashboard)/assignments`
- `artifacts/backoffice/src/app/(dashboard)/planning`
- `artifacts/backoffice/src/app/(dashboard)/personnel`
- `artifacts/backoffice/src/app/(dashboard)/reports`
- `artifacts/backoffice/src/app/(dashboard)/tickets`
- `artifacts/backoffice/src/app/(dashboard)/invoices`
- `artifacts/backoffice/src/app/(dashboard)/quotes`
- `artifacts/backoffice/src/app/(dashboard)/documents`
- `artifacts/backoffice/src/app/(dashboard)/materials`
- `artifacts/backoffice/src/app/(dashboard)/inventory`
- `artifacts/backoffice/src/app/(dashboard)/settings`
- `artifacts/backoffice/src/app/(dashboard)/instellingen`

Belangrijkste componentfamilies:

- Layout: `DashboardHeader`, `MobileHeader`, `Sidebar`, `SidebarOverlay`, `TenantSwitcher`.
- Klanten/objecten: `CustomersView`, `CustomerProfileHeader`, `CustomerTabs`, `ObjectsView`, `ObjectDetailTabs`, `ObjectDetailActions`.
- Opdrachten/planning: `AssignmentsView`, `AssignmentDetailActions`, `PlanningView`, `PlanningBoardView`, `PlanningDayView`, `PlanningMonthView`, `PlanningPersonnelDrawer`.
- Personeel: `PersonnelView`, `SlimProfielPanel`, `PersonnelDetailActions`, `BeschikbaarheidView`, `VerlofInboxView`, `PersonnelPortalAccessCard`.
- Finance: `InvoicesView`, `InvoiceActions`, `CollectiveInvoicePanel`, `QuotesView`, `QuoteActions`, `ReportsView`, `ReportActions`.
- Documenten/tickets: `DocumentsView`, ticketroutes met `TicketBadges`, `ReplyForm`, `StatusActions`.
- Materiaal/inventaris: `MaterialsView`, `MaterialDetailView`, `MaterialsDashboardView`, `InventoryView`, `InventoryDetailView`, `InventoryDashboardView`, `InventoryIssueStatusPanel`.
- Instellingen: `SettingsTabs`, `GebruikersView`, `RollenView`, `RolDetailView`, `TaskCodesView`, `QualificationsView`, `ActiviteitslogView`, `NotificatiesView`, `MailSettingsView`, `OrganisatieForm`.

## 3. Overkoepelende problemen

### 3.1 Te veel containers

Veel pagina's bestaan uit meerdere losse `veele-card` blokken. Dat werkt voor eenvoudige widgets, maar op operationele pagina's geeft het een druk dashboardgevoel. Vooral detailpagina's stapelen context, acties, formulieren, tabellen en sidebars in afzonderlijke kaarten.

Richtlijn:

- Gebruik een kaart alleen voor herhaalde items, modals, detailpanelen of een afgebakend datablok.
- Gebruik voor pagina-opbouw liever full-width secties met een constrained inner layout.
- Vervang "kaart naast tabel met formulier" door een tabel met actieknop die een sheet opent.

### 3.2 Filters zijn inconsistent

Sommige lijsten hebben een rijke filterervaring met actieve filterchips en een sheet. Andere pagina's tonen alle filters inline in een kaart of toolbar. Dat geeft verschillende verwachtingen en op mobiel te veel verticale druk.

Richtlijn:

- Basisfilter: zoekveld + primaire statusselectie + knop "Filters".
- Geavanceerde filters in `TenantFilterDrawer`.
- Toon actieve filters als compacte chips onder de toolbar.
- Op mobiel: zoekveld op eigen rij, filters in drawer, primaire actie als vaste knop rechts of onderaan toolbar.

### 3.3 Acties zijn inconsistent

Er is een mix van zichtbare knoppen per rij, dropdownmenu's, inline forms, raw `confirm()` en `AlertDialog`. Enterprise UI moet voorspelbaar zijn, zeker bij destructieve of externe acties zoals e-mail, betaling, portaluitnodiging, support, archiveren of verwijderen.

Richtlijn:

- Rijacties altijd via `TenantActionMenu`.
- Primaire pagina-actie rechts in `TenantPageHeader`.
- Destructieve acties altijd via `TenantConfirmDialog`.
- Bulkacties verschijnen alleen wanneer selectie actief is.
- Exportacties onder een menu "Exporteren", niet als losse knoppen naast de primaire actie.

### 3.4 Detailschermen zijn te verschillend

Klanten en objecten hebben tabs. Personeel heeft een losse detailpagina plus een `SlimProfielPanel` in de lijst. Planning heeft drawers. Tickets en finance hebben veel detailkaarten. Er is geen eenduidige keuze wanneer iets een detailpagina, drawer of modal is.

Richtlijn:

- Lijst -> snelle inspectie: `TenantDetailDrawer`.
- Lijst -> diepe workflow of veel tabs: detailpagina.
- Create/edit: `Sheet`.
- Confirm/status transition: `Dialog` of compacte action card in de detailheader.
- Lange formulieren opdelen met `TenantFormSection`.

### 3.5 Statuslabels en badges verschillen per domein

Er is al `ProcessStatusBadge` voor opdrachten, offertes en rapportages. Daarnaast bestaan lokale badges voor klanten, tickets, materiaal, inventaris, beschikbaarheid, rollen en instellingen. Visueel is dit niet altijd consistent.

Richtlijn:

- Maak een centrale status-taxonomie:
  - Neutral: concept, info, gepland.
  - Success: actief, goedgekeurd, betaald, beschikbaar.
  - Warning: wacht op controle, verloopt binnenkort, deels beschikbaar.
  - Danger: geblokkeerd, verlopen, achterstallig, storing.
  - Muted: gearchiveerd, inactief.
- Statusbadge heeft altijd dezelfde radius, hoogte, font size en iconoption.
- Gebruik een apart `PriorityBadge` voor urgentie; meng prioriteit niet in statuskleur.

### 3.6 Mobiel is nog te veel desktop-stapeling

De layout is responsive, maar complexe pagina's blijven op mobiel vaak bestaan uit zware tabellen of kaarten die onder elkaar vallen. Voor klanten, personeel, opdrachten, tickets, facturen, materiaal en inventaris moet mobiel een eigen compact patroon krijgen.

Richtlijn:

- Tabellen worden op mobiel table-to-card rows met maximaal drie zichtbare metadataregels en een action menu.
- Filterdrawer is default op mobiel.
- Detailpagina's krijgen een sticky compact header met titel, status en primaire actie.
- Tabnavigatie wordt horizontaal scrollbaar of een select-menu bij meer dan vijf tabs.

## 4. Gewenst basispatroon per pagina

Elke tenant backoffice pagina volgt dit patroon:

1. `TenantPageShell`
   - Max-width, consistente verticale spacing, mobile padding, eventueel page-level loading/error/empty state.

2. `TenantPageHeader`
   - Breadcrumb/context optioneel.
   - Titel, subtitle, primaire status/context.
   - Rechts: primaire actie, secundaire acties in dropdown.

3. `TenantToolbar`
   - Zoekveld.
   - Een of twee kernfilters.
   - Knop "Filters".
   - Export/actions dropdown.
   - Actieve filterchips.

4. `TenantContent`
   - Voor lijstschermen: `TenantDataTable` op desktop, responsive row cards op mobiel.
   - Voor dashboards: `TenantSummaryStrip` + maximaal twee focuspanelen boven de fold.
   - Voor detailpagina's: `TenantDetailHeader` + tabs/sections.

5. `TenantOverlayLayer`
   - Create/edit sheets.
   - Detail drawers.
   - Confirm dialogs.
   - Form dialogs.

## 5. Pagina-audit

### 5.1 Dashboard

Route: `/`

- Huidige functie: operationeel overzicht met statistieken, financiele signalen, betalingen, planning, admin panels, recente opdrachten, actiepunten, beschikbaarheid en activity feed.
- Huidige structuur: veel `veele-card` widgets in meerdere grids; veel links en secundaire acties direct zichtbaar.
- Problemen: de eerste viewport heeft geen heldere focus; te veel kaarten strijden om aandacht; management, planning, finance en admin staan door elkaar; mobiel wordt een lange scroll.
- Advies: maak een rustig `DashboardCommandCenter` met een summary strip, een "Vandaag aandacht nodig" paneel, een "Werkstroom" paneel en secundaire widgets lager op de pagina.
- Aanbevolen componenten: `TenantSummaryStrip`, `ActionInboxPanel`, `DashboardSection`, `MetricTile`, `WorkQueueList`.
- Prioriteit: P0.
- Complexiteit: Hoog.

### 5.2 Klantenlijst

Route: `/customers`

- Huidige functie: klanten zoeken, filteren, exporteren, bulkacties, aanmaken en beheren.
- Huidige structuur: volwassen table view met search, filtersheet, actieve chips, dropdownmenu's, create/edit sheet en confirm dialog.
- Problemen: toolbar is nog druk door exportknoppen; lijst en filters zijn beter dan veel andere pagina's maar niet als shared pattern hergebruikt; tekst/copy rond filter wissen moet worden nagekeken.
- Advies: gebruik dit scherm als basis voor `TenantDataTable`, maar trek toolbar, active filter chips, exportmenu en bulkbar los naar gedeelde componenten.
- Aanbevolen componenten: `TenantToolbar`, `TenantFilterDrawer`, `TenantDataTable`, `TenantBulkActionBar`, `TenantActionMenu`.
- Prioriteit: P1.
- Complexiteit: Middel.

### 5.3 Klantdetail

Route: `/customers/[id]`

- Huidige functie: volledig klantdossier met overzicht, contacten, objecten, opdrachten, facturen, betalingen, rapporten, documenten, notities, tickets en geschiedenis.
- Huidige structuur: profielheader, actions, tabbar met counts, per tab aparte content.
- Problemen: veel tabs en counts kunnen onrustig worden; overzicht bevat veel context; tabnavigatie moet mobiel beter; klantacties en tabacties kunnen consequenter.
- Advies: maak `TenantDetailHeader` en `TenantDetailTabs`; groepeer tabs in "Overzicht", "Werk", "Finance", "Communicatie", "Historie" bij smalle schermen.
- Aanbevolen componenten: `TenantDetailHeader`, `TenantResponsiveTabs`, `TenantRelatedTable`, `TenantTimeline`.
- Prioriteit: P1.
- Complexiteit: Middel/hoog.

### 5.4 Objectenlijst

Route: `/objects`

- Huidige functie: objecten zoeken, filteren, aanmaken, bewerken en verwijderen.
- Huidige structuur: page header, enkele inline filters, table, dropdown row actions, sheet en confirm dialog.
- Problemen: minder volwassen filterervaring dan klanten; service type en regio staan altijd inline; geen gedeelde active-filter chips; layout voelt iets ouder.
- Advies: gelijk trekken met klantenlijst en `TenantToolbar`; objecttype/regio/status naar filterdrawer.
- Aanbevolen componenten: `TenantToolbar`, `TenantDataTable`, `TenantActionMenu`, `ObjectQuickDrawer`.
- Prioriteit: P1.
- Complexiteit: Middel.

### 5.5 Objectdetail

Route: `/objects/[id]`

- Huidige functie: objectdossier met details, contacten, personeel, services, materiaal en inventaris.
- Huidige structuur: kaartachtige detailheader, `ObjectDetailTabs`, tabcontent en panels.
- Problemen: detailheader gebruikt nog losse card; materiaal/inventaris panels kunnen visueel zwaar worden; tabs moeten mobiel compacter.
- Advies: maak dezelfde detailheader/tabs als klantdetail en voeg compacte related-panels toe.
- Aanbevolen componenten: `TenantDetailHeader`, `TenantResponsiveTabs`, `TenantRelatedPanel`, `InventoryMiniTable`.
- Prioriteit: P2.
- Complexiteit: Middel.

### 5.6 Opdrachten en werkbonnen

Route: `/assignments`

- Huidige functie: opdrachten zoeken, filteren, sorteren, aanmaken, bewerken en status volgen.
- Huidige structuur: table view met meerdere inline filters, status/priority/report badges, row action menu, create/edit sheet.
- Problemen: veel filters permanent zichtbaar; meerdere badges per rij maken de tabel druk; status en rapportstatus concurreren; mobiel wordt breed.
- Advies: zoek + status als basis; prioriteit, rapportstatus en regio naar drawer; op mobiel card rows met opdrachtcode, klant, datum, status en actie.
- Aanbevolen componenten: `TenantToolbar`, `TenantStatusBadge`, `TenantPriorityBadge`, `TenantDataTable`, `AssignmentMobileCard`.
- Prioriteit: P0.
- Complexiteit: Middel.

### 5.7 Opdrachtdetail

Route: `/assignments/[id]`

- Huidige functie: dossier voor opdracht, planning, klant/object, personeel, taken, rapportage, documenten, materiaal/inventaris en statusovergangen.
- Huidige structuur: veel server-loaded data, meerdere `veele-card` secties en `AssignmentDetailActions` met status/personeel/taken/edit sheet.
- Problemen: detailpagina is functioneel sterk maar visueel zwaar; acties staan verspreid; statuswijziging is een apart blok; planning readiness en bijlagen concurreren.
- Advies: maak bovenaan een `AssignmentWorkHeader` met status, datum, klant/object en primaire volgende actie; verplaats status, personeel en taken naar een rechter `WorkflowPanel` op desktop en sections op mobiel.
- Aanbevolen componenten: `AssignmentWorkHeader`, `WorkflowActionPanel`, `TenantDetailSection`, `TenantTimeline`.
- Prioriteit: P0.
- Complexiteit: Hoog.

### 5.8 Planning week/dag/maand

Route: `/planning`

- Huidige functie: planning bekijken in week-, dag- en maandcontext, conflicten zien, opdrachten plannen en personeel toewijzen.
- Huidige structuur: navigatie, conflictbanner, view toggles, filters en planninggrid; create assignment sheet; personeeldrawer.
- Problemen: navigatie, filters, toggles en acties staan dicht op elkaar; weekgrid is complex; create actie per dag kan visueel herhalen.
- Advies: splits in `PlanningCommandBar`, `PlanningConflictStrip`, `PlanningCanvas`; maak filters als drawer en dagacties als contextmenu.
- Aanbevolen componenten: `PlanningCommandBar`, `PlanningFilterDrawer`, `PlanningConflictStrip`, `PlanningDetailDrawer`.
- Prioriteit: P0.
- Complexiteit: Hoog.

### 5.9 Kanbanbord / smart planning board

Route: `/planning` met board-componenten

- Huidige functie: werkbonnen en medewerkers matchen, drag-and-drop plannen, matchscores en geschiktheid zien.
- Huidige structuur: `PlanningBoardView` met rijke board UI, dropdowns, drawers, cards en matchinformatie.
- Problemen: zeer hoge informatiedichtheid; cards tonen veel requirements; zijpanelen en board moeten tabletvriendelijker; legenda en filters moeten rustiger.
- Advies: maak board cards strikt compact met progressive disclosure; details in drawer; filters en legenda in collapsible panels.
- Aanbevolen componenten: `PlanningBoardCard`, `PlanningBoardToolbar`, `PlanningCandidateDrawer`, `PlanningLegendPopover`.
- Prioriteit: P0.
- Complexiteit: Hoog.

### 5.10 Personeelslijst

Route: `/personnel`

- Huidige functie: medewerkers zoeken, filteren, beheren, bulkstatus wijzigen en slim profiel bekijken.
- Huidige structuur: table met inline filters, sheet, dropdown row actions, bulkbar, delete dialog en `SlimProfielPanel`.
- Problemen: vijf filters permanent zichtbaar; veel kolommen; rij klik opent panel terwijl rijacties ook aanwezig zijn; badges verschillen van andere domeinen.
- Advies: verplaats filters naar drawer, beperk default kolommen en maak het slim profiel een standaard `TenantDetailDrawer`.
- Aanbevolen componenten: `TenantToolbar`, `TenantDataTable`, `PersonnelDetailDrawer`, `AvailabilityBadge`, `CompetencyBadgeGroup`.
- Prioriteit: P0.
- Complexiteit: Middel/hoog.

### 5.11 Personeelsdetail

Route: `/personnel/[id]`

- Huidige functie: medewerkerprofiel, beschikbaarheid/verlof, portaltoegang, documenten, opdrachten, materiaal/inventaris en historie.
- Huidige structuur: lange detailpagina met meerdere cards en embedded `BeschikbaarheidView`.
- Problemen: alle subdomeinen staan onder elkaar; beschikbaarheid is belangrijk maar neemt veel ruimte; portaltoegang en documenten voelen als losse modules.
- Advies: introduceer tabs of section nav: "Profiel", "Planning", "Beschikbaarheid", "Kwalificaties", "Portal", "Materiaal", "Historie".
- Aanbevolen componenten: `TenantDetailHeader`, `TenantSectionNav`, `PersonnelAvailabilityPanel`, `PortalAccessPanel`.
- Prioriteit: P1.
- Complexiteit: Hoog.

### 5.12 Beschikbaarheid

Route/component: onderdeel van `/personnel/[id]` via `BeschikbaarheidView`

- Huidige functie: weekbeschikbaarheid, verlofperiodes, ziekte/verlofstatus en aanvragen beheren.
- Huidige structuur: cards, switches, tabellen en formulieren; gebruikt op sommige acties raw `confirm()`.
- Problemen: veel bediening in een detailpagina; confirm-pattern is inconsistent; verlof/ziekte/status en weekrooster zijn visueel gelijkwaardig terwijl ze andere urgentie hebben.
- Advies: maak een availability submodule met summary bovenaan, rooster als hoofdblok, verlofperiodes in table en acties in dialogs.
- Aanbevolen componenten: `AvailabilitySummary`, `AvailabilityWeekGrid`, `LeavePeriodTable`, `TenantConfirmDialog`.
- Prioriteit: P1.
- Complexiteit: Middel/hoog.

### 5.13 Verlof en ziekte inbox

Route: `/personnel/verlof`

- Huidige functie: open verlofaanvragen beoordelen.
- Huidige structuur: eenvoudige tabel met approve/reject acties.
- Problemen: mist dezelfde page header/toolbar als andere inboxen; op mobiel moet het table-to-card worden; approve/reject moeten duidelijke confirmation/toast states houden.
- Advies: modelleer als `ActionInbox`: filters op status/periode, compacte cards op mobiel, detaildrawer voor aanvraagcontext.
- Aanbevolen componenten: `TenantActionInbox`, `LeaveRequestCard`, `LeaveRequestDetailDrawer`.
- Prioriteit: P1.
- Complexiteit: Middel.

### 5.14 Rapportages

Route: `/reports`

- Huidige functie: rapportages zoeken, filteren en openen voor controle.
- Huidige structuur: relatief rustige zoek/status filters en table.
- Problemen: mist gedeelde toolbar en detail preview; statusfilter staat inline; rapportagecontrole is niet als inbox gepresenteerd.
- Advies: positioneer als controle-inbox met status chips en preview drawer.
- Aanbevolen componenten: `TenantToolbar`, `ReportReviewInbox`, `ReportPreviewDrawer`.
- Prioriteit: P1.
- Complexiteit: Middel.

### 5.15 Rapportagecontrole

Route: `/reports/[id]`

- Huidige functie: rapport lezen, materiaal controleren, goedkeuren/afwijzen, notities en PDF/context bekijken.
- Huidige structuur: meerdere detailcards en `ReportActions`; materiaalapproval panel kan erbij komen.
- Problemen: controleactie staat niet altijd direct genoeg in beeld; context, inhoud en approve/reject zijn veel losse blokken.
- Advies: maak een review layout met links rapportinhoud, rechts vaste review sidebar met status, checks, materiaal en acties.
- Aanbevolen componenten: `ReviewShell`, `ReviewSidebar`, `ReportContentPanel`, `ApprovalChecklist`.
- Prioriteit: P0.
- Complexiteit: Hoog.

### 5.16 Tickets

Route: `/tickets`

- Huidige functie: klant- en personeelstickets zoeken, filteren en opvolgen.
- Huidige structuur: drie KPI cards, filterform en lijst met ticketcards.
- Problemen: tickets voelen meer als contentfeed dan enterprise inbox; KPI's nemen ruimte; cards zijn verbose; table/split inbox ontbreekt.
- Advies: maak een support-inbox met linker lijst, rechter preview op desktop, card rows op mobiel en SLA/priority duidelijk.
- Aanbevolen componenten: `TicketInboxShell`, `TicketListRow`, `TicketPreviewPane`, `PriorityBadge`, `SlaBadge`.
- Prioriteit: P0.
- Complexiteit: Hoog.

### 5.17 Ticketdetail

Route: `/tickets/[kind]/[id]`

- Huidige functie: ticketcontext, berichten, statuswijziging en reply.
- Huidige structuur: meerdere `veele-card` secties, statusactions en replyform.
- Problemen: conversatie en metadata zijn nog veel aparte containers; reply hoort sticky/onderaan duidelijk; statuswijziging kan compacter.
- Advies: conversational layout: message timeline centraal, metadata/status rechts, reply composer sticky onderaan.
- Aanbevolen componenten: `TicketConversation`, `TicketMetadataPanel`, `TicketReplyComposer`.
- Prioriteit: P1.
- Complexiteit: Middel/hoog.

### 5.18 Facturen

Route: `/invoices`

- Huidige functie: facturen zoeken, status volgen, betalingsherinneringen sturen, betaallinks kopieren, verzamelfacturen maken.
- Huidige structuur: herinneringsalert, summary cards, `CollectiveInvoicePanel`, filtercard en table.
- Problemen: veel finance-functionaliteit boven de lijst; betaallink is zichtbaar als rijactie; summary en collective panel maken de eerste viewport zwaar.
- Advies: maak facturen een finance inbox; summary strip compact; verzamelfactuur als aparte mode/sheet; rijacties in dropdown.
- Aanbevolen componenten: `FinanceSummaryStrip`, `TenantToolbar`, `InvoiceActionMenu`, `CollectiveInvoiceSheet`.
- Prioriteit: P0.
- Complexiteit: Hoog.

### 5.19 Factuurdetail

Route: `/invoices/[id]`

- Huidige functie: factuurdetails, regels, betalingen, e-mail, PDF, betaallink en status.
- Huidige structuur: veel cards plus `InvoiceActions` met alert dialogs.
- Problemen: acties, betaalhistorie en factuurregels concurreren; status/bedrag moet sterker in header; history kan lager.
- Advies: detailheader met bedrag/status/vervaldatum; regels als hoofdsectie; rechter action panel voor verzenden, link, herinneringen en PDF.
- Aanbevolen componenten: `FinanceDetailHeader`, `InvoiceLineTable`, `InvoiceActionPanel`, `PaymentTimeline`.
- Prioriteit: P1.
- Complexiteit: Middel/hoog.

### 5.20 Verzamelfacturen en betalingen

Route/component: onderdeel van `/invoices` via `CollectiveInvoicePanel` en payment/reminder flows

- Huidige functie: facturen selecteren en batch/verzamelfactuur maken; betalingen en reminders volgen.
- Huidige structuur: permanent panel met kandidaten, batchinformatie en acties.
- Problemen: batch-flow is te aanwezig voor gebruikers die alleen facturen willen controleren; selectie- en batchlogica vraagt een wizard of sheet.
- Advies: verplaats naar "Verzamelfactuur maken" wizard; betalingsoverzicht als tab of filter binnen facturen.
- Aanbevolen componenten: `CollectiveInvoiceWizard`, `PaymentStatusFilter`, `PaymentTimeline`.
- Prioriteit: P1.
- Complexiteit: Hoog.

### 5.21 Offertes

Route: `/quotes` en `/quotes/[id]`

- Huidige functie: offertes zoeken, status volgen, detail bekijken en goedkeuren/afwijzen.
- Huidige structuur: summary cards, filtercard, table; detail met cards, regels en `QuoteActions`.
- Problemen: vergelijkbaar met facturen maar minder complex; summary cards maken lijst zwaarder dan nodig; actions op detail kunnen naar panel.
- Advies: gelijk trekken met finance patroon voor facturen.
- Aanbevolen componenten: `FinanceSummaryStrip`, `QuoteActionMenu`, `FinanceDetailHeader`.
- Prioriteit: P2.
- Complexiteit: Middel.

### 5.22 Documenten

Route: `/documents`

- Huidige functie: documenten filteren, uploaden, downloaden en verwijderen.
- Huidige structuur: entity filters, uploadknop met inline uploadformulier, zichtbare download/delete knoppen en raw confirm.
- Problemen: inline uploadform is zwaar; delete gebruikt raw `confirm()`; filtertabs kunnen te veel worden; rijacties zijn niet consistent.
- Advies: upload in sheet, delete via `TenantConfirmDialog`, row actions in dropdown, filters in toolbar.
- Aanbevolen componenten: `DocumentUploadSheet`, `TenantActionMenu`, `TenantConfirmDialog`, `DocumentTypeFilter`.
- Prioriteit: P0.
- Complexiteit: Middel.

### 5.23 Taakcodes

Route: `/settings/task-codes`

- Huidige functie: taakcodes zoeken, filteren, aanmaken, bewerken, activeren/deactiveren en verwijderen.
- Huidige structuur: moderne table, dropdown actions, create/edit sheet en confirm dialog.
- Problemen: filters nog inline; route zit onder `/settings` terwijl veel instellingen onder `/instellingen` zitten; styling kan gedeeld worden.
- Advies: gebruik als tweede referentie naast klantenlijst voor shared table/action patterns.
- Aanbevolen componenten: `TenantToolbar`, `TenantDataTable`, `TenantActionMenu`.
- Prioriteit: P2.
- Complexiteit: Laag/middel.

### 5.24 Certificaten, diploma's en kennis

Route: `/instellingen/kwalificaties`

- Huidige functie: kwalificatiecatalogus, verlopen/verloopt binnenkort, koppelingen met personeel, rollen en taakcodes.
- Huidige structuur: summary cards, inline create form, grids met lijstjes en meerdere linkformulieren.
- Problemen: veel beheerfuncties op een pagina; inline forms maken het druk; delete/toggle acties zijn zichtbare kleine knoppen.
- Advies: splits in catalogus, personeelskoppelingen en taakcode-eisen via tabs; create/edit in sheets; summary als compacte health strip.
- Aanbevolen componenten: `QualificationCatalogTable`, `QualificationLinkDrawer`, `TenantSummaryStrip`.
- Prioriteit: P1.
- Complexiteit: Hoog.

### 5.25 Materiaalbeheer

Route: `/materials`, `/materials/[id]`, `/materials/dashboard`

- Huidige functie: materialen beheren, voorraadmutaties registreren, gebruik/stock dashboard en detailhistorie bekijken.
- Huidige structuur: lijst met filters en tabel naast permanente formulieren voor nieuw materiaal en voorraadmutatie; detail met stats, history en updateform; dashboard met veel cards/tables.
- Problemen: permanente formulieren maken het scherm onrustig; voorraadmutatie hoort contextueel; detailpagina heeft veel cards en sidebar; dashboard heeft veel gelijkwaardige panelen.
- Advies: lijst wordt hoofdscherm; nieuw materiaal en voorraadmutatie naar sheets/dialogs; detail krijgt header + tabs "Overzicht", "Voorraad", "Gebruik", "Historie".
- Aanbevolen componenten: `MaterialActionMenu`, `MaterialCreateSheet`, `StockMutationDialog`, `MaterialDetailTabs`.
- Prioriteit: P0.
- Complexiteit: Hoog.

### 5.26 Inventarisbeheer

Route: `/inventory`, `/inventory/[id]`, `/inventory/dashboard`, `/inventory/issues`, `/inventory/issues/[id]`

- Huidige functie: inventarisitems beheren, locaties koppelen, QR, onderhoud, storingen, dashboard en issue-afhandeling.
- Huidige structuur: lijst met tabel naast permanent create form; detail met stats, documenten, update form; dashboards met cards/tables; issue panel met status/maintenance forms.
- Problemen: dezelfde formulierdruk als materiaalbeheer; detail/update forms staan te prominent; storingen en onderhoud vragen een service-desk patroon; QR/documenten horen in actions/drawers.
- Advies: shared patroon met materiaalbeheer; issue-afhandeling als ticket/review layout; onderhoud als timeline.
- Aanbevolen componenten: `InventoryCreateSheet`, `InventoryDetailTabs`, `InventoryIssueWorkflowPanel`, `MaintenanceTimeline`.
- Prioriteit: P0.
- Complexiteit: Hoog.

### 5.27 Instellingen overzicht

Route: `/settings` en `/instellingen/*`

- Huidige functie: ingang naar organisatie, gebruikers, rollen, sectoren, notificaties, mail, taakcodes, auditlog en modules.
- Huidige structuur: settings tabs en losse kaarten/forms per subpagina.
- Problemen: twee routeprefixen (`/settings` en `/instellingen`) maken mentaal model minder rustig; settings tabs kunnen druk worden; subpagina's hebben elk eigen layout.
- Advies: kies een canonieke settings route voor UI en behoud redirects indien nodig; maak `SettingsSectionShell` met consistente header, tabs en save footer.
- Aanbevolen componenten: `SettingsSectionShell`, `SettingsSaveBar`, `SettingsFormSection`.
- Prioriteit: P1.
- Complexiteit: Middel/hoog.

### 5.28 Gebruikers

Route: `/instellingen/gebruikers`

- Huidige functie: gebruikers uitnodigen, rollen beheren, status activeren/deactiveren.
- Huidige structuur: permanent invite form boven table, table met inline role editing en raw `confirm()` bij deactiveren.
- Problemen: invite form neemt veel ruimte; raw confirm; rollen wijzigen in tabel kan druk en foutgevoelig zijn.
- Advies: uitnodigen in sheet; gebruiker detail/action drawer; statuswijziging via confirm dialog; rollen via edit dialog.
- Aanbevolen componenten: `UserInviteSheet`, `UserActionMenu`, `TenantConfirmDialog`, `RoleAssignmentDialog`.
- Prioriteit: P0.
- Complexiteit: Middel/hoog.

### 5.29 Rollen en permissies

Route: `/instellingen/rollen`, `/instellingen/rollen/[id]`

- Huidige functie: systeemrollen/custom rollen bekijken, aanmaken, verwijderen en permissies beheren.
- Huidige structuur: create form in card, roles table, custom modal; detail met permissiegroepen en metadata form.
- Problemen: create form is permanent; custom modal niet volledig gelijk aan shared dialog style; permissiematrix kan op mobiel zwaar worden.
- Advies: role create/edit in sheet; permissies als grouped accordions met search; sticky save/status.
- Aanbevolen componenten: `RoleCreateSheet`, `PermissionMatrix`, `SettingsSaveBar`.
- Prioriteit: P1.
- Complexiteit: Hoog.

### 5.30 Auditlog

Route: `/instellingen/activiteitslog`

- Huidige functie: events zoeken en filteren op module, rol en datum.
- Huidige structuur: inline filters en table.
- Problemen: filters nemen horizontaal ruimte; eventdetails zijn beperkt; export/audit review ontbreekt als patroon.
- Advies: maak auditlog een specialized `TenantDataTable` met detaildrawer en filterdrawer.
- Aanbevolen componenten: `AuditFilterDrawer`, `AuditEventDrawer`, `TenantDataTable`.
- Prioriteit: P1.
- Complexiteit: Middel.

### 5.31 Notificaties

Route: `/instellingen/notificaties`

- Huidige functie: notificatie-events, kanalen, templates, ontvangers en test/instellingen beheren.
- Huidige structuur: veel sections, summary counts, event editor, templates en recipient settings in kaarten.
- Problemen: veel complexe form state tegelijk zichtbaar; template preview en kanaalinstellingen moeten rustiger; mobiel wordt lang.
- Advies: splits in event list links en editor rechts op desktop; op mobiel event list en editor als navigatie; gebruik sticky save bar.
- Aanbevolen componenten: `NotificationEventList`, `NotificationEventEditor`, `TemplatePreviewPanel`, `SettingsSaveBar`.
- Prioriteit: P1.
- Complexiteit: Hoog.

### 5.32 Mail, organisatie, sectoren en klanttypes

Routes: `/instellingen/mail`, `/instellingen/organisatie`, `/instellingen/sectoren`, `/instellingen/klanttypes`

- Huidige functie: tenantbranding, SMTP, domeinachtige instellingen, sectoren en klanttypes beheren.
- Huidige structuur: meerdere cards/forms, inline add/edit rows bij sectoren/klanttypes.
- Problemen: inline add/edit maakt tabellen onrustig; lange forms missen save affordance; SMTP test en branding preview kunnen beter gescheiden.
- Advies: settings forms in sections met sticky save; sectoren/klanttypes als tables met create/edit sheet.
- Aanbevolen componenten: `SettingsFormSection`, `SettingsSaveBar`, `SmallEntityManager`.
- Prioriteit: P2.
- Complexiteit: Middel.

### 5.33 Nieuws en profiel

Routes: `/news`, `/profile`

- Huidige functie: tenantnieuws beheren en eigen profiel bekijken.
- Huidige structuur: nieuws heeft eigen editor/list layout; profiel is eenvoudige accountpagina.
- Problemen: nieuws is functioneel rijk en kan van dezelfde list/detail/editor patronen profiteren; profiel is relatief laag risico.
- Advies: nieuws pas na de kernflows normaliseren; profiel alleen polishen met shared page header.
- Aanbevolen componenten: `ContentListEditor`, `TenantPageHeader`.
- Prioriteit: P3.
- Complexiteit: Laag/middel.

## 6. Componentvoorstel

### 6.1 Layout primitives

- `TenantPageShell`: page spacing, width, mobile padding, empty/loading/error state slots.
- `TenantPageHeader`: titel, subtitel, breadcrumbs, badges, primary action, secondary actions.
- `TenantSection`: niet-card page section met title/description/action.
- `TenantSummaryStrip`: maximaal 3 tot 5 kernmetingen, compact en scanbaar.
- `TenantResponsiveTabs`: desktop tabs, mobile select of horizontaal scrollbare tabs.

### 6.2 Data primitives

- `TenantToolbar`: search, primary filter, filterdrawer trigger, export/action menu.
- `TenantFilterDrawer`: generieke drawer met apply/reset en active filter count.
- `TenantActiveFilters`: chips voor actieve filters.
- `TenantDataTable`: desktop table, mobile row cards, empty state, loading skeleton.
- `TenantPagination`: consistente pagination.
- `TenantBulkActionBar`: alleen zichtbaar bij selectie.

### 6.3 Action primitives

- `TenantActionMenu`: row/context actions met destructive styling.
- `TenantConfirmDialog`: confirm voor delete/archive/deactivate/send external.
- `TenantActionPanel`: rechter paneel voor detailpagina's met de volgende workflowstap.
- `TenantStatusTransition`: compacte statuswijziging met reden/notitie indien nodig.

### 6.4 Detail en form primitives

- `TenantDetailHeader`: status, metadata, eigenaar/context, primary action.
- `TenantDetailDrawer`: snelle inspectie vanuit een lijst.
- `TenantFormSheet`: create/edit form wrapper met vaste footer.
- `TenantFormSection`: label, description, fields en validatie.
- `TenantTimeline`: audit/history/messages.

### 6.5 Domain primitives

- `WorkQueueList`: taken die aandacht vragen.
- `ReviewShell`: rapportage/factuur/offerte review layout.
- `PlanningCommandBar`: datum, view mode, filters en create.
- `TicketInboxShell`: lijst/preview/conversatie.
- `FinanceDetailHeader`: bedrag, status, vervaldatum, klant en primary action.
- `InventoryIssueWorkflowPanel`: status, onderhoud, documenten en opvolging.

## 7. UI-regels

### Headers

- Elke pagina heeft precies een duidelijke primaire actie.
- Secundaire acties staan in een menu.
- Detailheaders tonen status en belangrijkste metadata naast de titel.
- Breadcrumbs zijn subtiel en alleen nodig bij diepe routes.

### Filters

- Toon maximaal twee filters inline: search en belangrijkste status.
- Alles daarbuiten naar `TenantFilterDrawer`.
- Actieve filters zijn zichtbaar als chips.
- Reset filters is altijd beschikbaar zodra er een filter actief is.

### Acties

- Rijacties via driepunt-menu.
- Destructieve acties altijd met `TenantConfirmDialog`.
- Externe acties zoals mail, portaluitnodiging, betaallink en reminder hebben bevestiging of duidelijke success/failure toast.
- Bulkacties verschijnen alleen na selectie.

### Tabellen

- Desktop: compacte tabel met vaste statuskolom en action menu rechts.
- Tablet/mobiel: row cards, geen horizontale scroll tenzij data echt tabulair is.
- Lange tekst afkappen met tooltip of secondary line.
- Status en prioriteit niet in dezelfde kleurbetekenis mengen.

### Forms

- Geen permanente create/edit forms naast een hoofdtable.
- Create/edit in sheet; korte confirm flows in dialog.
- Lange settingsformulieren krijgen sections en sticky save bar.
- Validatiefouten onder velden en een compacte samenvatting bovenaan bij submit.

### Mobile responsiveness

- Shell behoudt sidebar/drawer, maar pagina's moeten eigen mobile view hebben.
- Tables -> cards.
- Tabs -> select/horizontal scroll.
- Detail action panels -> onder header of sticky bottom action group.
- Planning board krijgt eigen compact mode en drawer-first interacties.

## 8. Prioriteitenlijst

P0 - direct oppakken:

- Shared primitives: `TenantPageShell`, `TenantPageHeader`, `TenantToolbar`, `TenantDataTable`, `TenantActionMenu`, `TenantConfirmDialog`.
- Dashboard rustiger maken.
- Opdrachtenlijst en opdrachtdetail normaliseren.
- Planning command bar en board/personeeldrawer polish.
- Personeelslijst met filterdrawer en detaildrawer.
- Tickets als inbox.
- Facturen/verzamelfacturen minder zwaar maken.
- Documenten raw confirm en upload inline oplossen.
- Materiaal/inventaris permanente formulieren vervangen door sheets/dialogs.
- Gebruikers raw confirm en invite form vervangen.

P1 - volgende tranche:

- Klantdetail en objectdetail detailheaders/tabs normaliseren.
- Personeelsdetail en beschikbaarheid/verlof structureren.
- Rapportagecontrole als review layout.
- Notificaties als event list + editor.
- Rollen/permissies als matrix met create sheet.
- Auditlog detaildrawer/filterdrawer.
- Kwalificaties splitsen in catalogus/koppelingen/eisen.

P2 - polish en consistentie:

- Objectenlijst volledig gelijk trekken met klantenlijst.
- Offertes gelijk trekken met finance patroon.
- Taakcodes als referentiecomponent omzetten naar shared primitives.
- Mail, organisatie, sectoren en klanttypes naar settings shell.
- Materiaal/inventaris dashboards compacter maken.

P3 - later:

- Nieuws editor/list normaliseren.
- Profielpagina polishen.
- Kleine copy- en empty-state verbeteringen door alle pagina's heen.

## 9. Uitvoerbare fases

### Fase 1 - UI primitives en richtlijnen

Doel: de basiscomponenten toevoegen zonder bestaande pagina's massaal te wijzigen.

Taken:

- Bouw `TenantPageShell`, `TenantPageHeader`, `TenantToolbar`, `TenantFilterDrawer`, `TenantActiveFilters`, `TenantActionMenu`, `TenantConfirmDialog`.
- Leg statuskleur-taxonomie vast.
- Documenteer table-to-card mobile gedrag.
- Migreer nog geen zware pagina's behalve eventueel een kleine referentiepagina.

Acceptatie:

- Typecheck groen.
- Story/usage voorbeelden in code of docs.
- Geen businesslogica gewijzigd.

### Fase 2 - Lijstschermen standaardiseren

Doel: de belangrijkste lijsten krijgen dezelfde toolbar, filters, table, mobile cards en row actions.

Schermen:

- `/customers`
- `/objects`
- `/assignments`
- `/personnel`
- `/reports`
- `/documents`
- `/settings/task-codes`

Acceptatie:

- Elke lijst heeft search + filterdrawer + active chips.
- Row actions zijn dropdowns.
- Destructieve acties gebruiken `TenantConfirmDialog`.
- Mobiel gebruikt row cards of bewezen bruikbare scroll.

### Fase 3 - Dashboard command center

Doel: tenantdashboard rustiger en besluitgerichter maken.

Taken:

- Vervang card-wolk door summary strip + action inbox + twee focuspanelen.
- Groepeer planning, finance, tickets en admin-signalen.
- Verplaats secundaire widgets lager.
- Maak mobiel eerst: korte actie-inbox bovenaan.

Acceptatie:

- Eerste viewport toont maximaal 1 primary focus en 3-5 kernmetingen.
- Geen losse modulecards zonder duidelijke actie.

### Fase 4 - Detailpagina's dossierpatroon

Doel: klant-, object-, opdracht-, personeel-, factuur-, offerte- en rapportdetails krijgen een gedeelde dossierstructuur.

Schermen:

- `/customers/[id]`
- `/objects/[id]`
- `/assignments/[id]`
- `/personnel/[id]`
- `/invoices/[id]`
- `/quotes/[id]`
- `/reports/[id]`

Acceptatie:

- Detailheader met status/context/actions.
- Tabs of section nav consistent.
- Workflow-acties in action panel.
- Mobile detailheader blijft compact en bruikbaar.

### Fase 5 - Planning en tickets als workbench

Doel: twee complexe operationele workflows krijgen eigen enterprise workbench.

Schermen:

- `/planning` inclusief week, dag, maand en board.
- `/tickets` en `/tickets/[kind]/[id]`.

Acceptatie:

- Planning heeft command bar, conflict strip, filterdrawer en detaildrawer.
- Tickets heeft inbox layout, preview/detail en reply composer.
- Tablet/mobiel werkt zonder horizontale stress.

### Fase 6 - Finance review en batch flows

Doel: finance voelt als professionele administratieflow in plaats van losse panels.

Schermen:

- `/invoices`
- `/invoices/[id]`
- `CollectiveInvoicePanel`
- `/quotes`
- `/quotes/[id]`

Acceptatie:

- Summary strip compact.
- Verzamelfacturen via wizard/sheet.
- Betaallink/reminder/PDF/e-mail in action menus of action panels.

### Fase 7 - Materiaal en inventaris

Doel: materiaal en inventaris worden rustige beheerworkflows.

Schermen:

- `/materials`
- `/materials/[id]`
- `/materials/dashboard`
- `/inventory`
- `/inventory/[id]`
- `/inventory/dashboard`
- `/inventory/issues`
- `/inventory/issues/[id]`

Acceptatie:

- Geen permanente create/update forms naast hoofdtabellen.
- Create/edit/mutatie/maintenance in sheet/dialog.
- Details met tabs, timeline en action panel.
- Issues volgen ticket/review patroon.

### Fase 8 - Instellingen en admin-heavy pagina's

Doel: instellingen voelen als een samenhangende adminmodule.

Schermen:

- `/settings`
- `/instellingen/gebruikers`
- `/instellingen/rollen`
- `/instellingen/rollen/[id]`
- `/instellingen/activiteitslog`
- `/instellingen/notificaties`
- `/instellingen/kwalificaties`
- `/instellingen/mail`
- `/instellingen/organisatie`
- `/instellingen/sectoren`
- `/instellingen/klanttypes`
- `/instellingen/slim-plannen`

Acceptatie:

- Settings shell met consistente tabs/section headers.
- Sticky save bar voor lange forms.
- Create/edit via sheets.
- Audit/notificatie/rollen hebben detaildrawers of matrices.

### Fase 9 - Mobile QA en visual consistency pass

Doel: alle kernflows voldoen op desktop, tablet en mobiel.

Taken:

- Playwright screenshots voor 390px, 768px, 1440px.
- Controleer header/sidebar, filters, tables/cards, sheets, dialogs en sticky action panels.
- Controleer tekstoverlap, empty states en action hit targets.
- Maak visuele regressielijst en los polish issues op.

Acceptatie:

- Geen overlappende tekst.
- Geen onbedoelde horizontale scroll op lijstschermen.
- Primaire acties zijn zichtbaar op mobiel.
- Dropdowns/sheets/dialogs sluiten correct.

## 10. Concrete implementatieprompts

### Prompt 1 - UI primitives

Start met fase 1 uit `docs/research-tenant-backoffice-ui-cleanup.md`. Voeg gedeelde tenant backoffice UI-primitives toe voor page shell, page header, toolbar, filterdrawer, active filter chips, action menu, confirm dialog en datatable-basis. Wijzig nog geen businesslogica. Gebruik bestaande shadcn/ui componenten en bestaande stylingtokens. Voeg een kleine referentie-integratie toe op een laag-risico pagina als dat nodig is. Run typecheck/build voor backoffice en commit op een versiebranch met PR naar main.

### Prompt 2 - Lijstschermen

Start met fase 2 uit `docs/research-tenant-backoffice-ui-cleanup.md`. Migreer klanten, objecten, opdrachten, personeel, rapportages, documenten en taakcodes naar dezelfde toolbar, filterdrawer, active filters, row action menu, confirm dialog en responsive table/card pattern. Behoud alle bestaande server actions en queryparameters. Run typecheck/build en maak een PR naar main.

### Prompt 3 - Dashboard

Start met fase 3 uit `docs/research-tenant-backoffice-ui-cleanup.md`. Maak het tenantdashboard rustiger: summary strip, action inbox, planning/finance/ticket focuspanelen en secundaire widgets lager op de pagina. Geen datamodelwijzigingen. Controleer desktop/tablet/mobile screenshots. Commit en open PR naar main.

### Prompt 4 - Dossierpagina's

Start met fase 4 uit `docs/research-tenant-backoffice-ui-cleanup.md`. Normaliseer klantdetail, objectdetail, opdrachtdetail, personeelsdetail, factuurdetail, offertedetail en rapportagedetail met gedeelde detailheader, tabs/section nav en action panel. Behoud bestaande permissions en datafetching. Run typecheck/build en maak PR.

### Prompt 5 - Planning en tickets

Start met fase 5 uit `docs/research-tenant-backoffice-ui-cleanup.md`. Maak planning en tickets enterprise workbenches: planning command bar/filterdrawer/conflict strip/detaildrawer; tickets inbox/preview/conversation/reply composer. Behoud drag-and-drop en ticketacties. Test desktop/tablet/mobile en maak PR.

### Prompt 6 - Finance

Start met fase 6 uit `docs/research-tenant-backoffice-ui-cleanup.md`. Maak facturen, verzamelfacturen, betalingen en offertes consistent met het finance patroon: compact summary, action menus/panels en batch wizard/sheet. Behoud bestaande betaal- en e-mailflows. Run typecheck/build en maak PR.

### Prompt 7 - Materiaal en inventaris

Start met fase 7 uit `docs/research-tenant-backoffice-ui-cleanup.md`. Verwijder permanente create/update formulieren uit materiaal- en inventarislijsten en verplaats ze naar sheets/dialogs. Maak detailpagina's tabbed en issues review/ticket-achtig. Behoud alle bestaande server actions. Run typecheck/build en maak PR.

### Prompt 8 - Instellingen

Start met fase 8 uit `docs/research-tenant-backoffice-ui-cleanup.md`. Maak een consistente settings shell voor gebruikers, rollen, auditlog, notificaties, kwalificaties, mail, organisatie, sectoren, klanttypes en slim plannen. Gebruik sticky save bars, create/edit sheets en confirm dialogs. Run typecheck/build en maak PR.

### Prompt 9 - Mobile QA

Start met fase 9 uit `docs/research-tenant-backoffice-ui-cleanup.md`. Voer een mobile/tablet/desktop QA pass uit op alle tenant backoffice kernflows. Gebruik Playwright screenshots, controleer tekstoverlap, horizontale scroll, dropdowns, sheets, dialogs, table-to-card gedrag en sticky action panels. Los polish issues op en maak PR.

## 11. Definition of done voor toekomstige UI-fases

Een UI-fase is pas klaar als:

- TypeScript groen is.
- Backoffice build groen is.
- Geen businesslogica of permissions zijn gewijzigd zonder expliciete reden.
- Alle gewijzigde routes op desktop, tablet en mobiel visueel gecontroleerd zijn.
- Destructieve acties via confirm dialog lopen.
- Filters en queryparameters backwards compatible blijven.
- Empty, loading, error en no-permission states niet slechter zijn geworden.
- Er minimaal een korte PR-samenvatting is met gewijzigde routes en screenshots/QA-notities.

## 12. Conclusie

De tenant backoffice hoeft niet opnieuw ontworpen te worden vanaf nul. De functionele dekking is juist sterk. De beste volgende stap is systematisch opruimen: shared primitives, minder containers, consequente filters/actions, responsive list/detail patterns en daarna domein voor domein migreren. Zo blijft de bestaande applicatie bruikbaar terwijl de ervaring stap voor stap rustiger, professioneler en enterprise-waardig wordt.
