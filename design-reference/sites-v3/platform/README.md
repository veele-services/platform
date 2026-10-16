# Fieldgrid — integraal platformprototype

Dit Sites-project bundelt tenantbackoffice, personeelsapp, klantportaal en platformbeheer, met een geïntegreerde managementcockpit. De bestaande operationele dashboards gebruiken fictieve gegevens en lokale browseropslag. Het CRM in platformbeheer gebruikt een blijvende D1-database en ontvangt websiteaanvragen via een serverkoppeling.

## Bron en hergebruik

Visuele basis: `veele-services/platform`, branch `main`, commit `9630c8f74a02cef98a12d213ec2ed87f8365afd4`, uitgelezen op 14 oktober 2026 (Europe/Amsterdam). De oorspronkelijke GitHub-repository is niet gewijzigd.

Overgenomen bronbestanden omvatten de dashboard-CSS, typografieschaal, backoffice- en platformadapters, personeels- en klantportaalstijlen, gedeelde `PageHeading` en `ContentTabs`, `components/ui/chart.tsx`, merkpaletfuncties en merkassets. De merkpaletimport is lokaal aangepast naar dezelfde twee constanten. `HelpTip` is lokaal geïmplementeerd. Shells en domeinschermen zijn als presentatie-adapters op de bron gebaseerd en gebruiken mockdata in plaats van serverloaders en serveracties.

## Ingangen

- `#/app/overzicht`: één startscherm met operationeel overzicht, managementcijfers, grafiek en urgente acties
- Lege hash, `#/app` en de oude `#/app/cockpit` verwijzen naar ditzelfde overzicht.
- `#/staff`: personeelsapp
- `#/klant`: klantportaal
- `#/platform`: platformbeheer
- `#/platform/crm`: CRM-pipeline; `?tab=agenda` opent de agenda, `?tab=settings` beschikbaarheid en meldingen.

De bovenbalk wisselt omgeving en demorol. Herstellen brengt lokale voorbeeldgegevens terug.

## Nieuwe managementfuncties

- Control Center bovenop brongekoppelde opvolgacties; vandaag, week, achterstallig, mijn acties, zonder verantwoordelijke, uitgesteld en afgerond.
- SLA-bewaking met contractversie en geschiedenis; ticketgebeurtenissen gebruiken één vaste demoklok.
- Prijsindexatie via concept, voorstel, goedkeuring en verwerking, met versiehistorie.
- Omzetbewaking houdt bevestigd factureerbare restwaarden, financiële controles en onbetaalde facturen gescheiden. Binnen vaste prijs afgehandelde regels behouden hun oorspronkelijke bedrag in het archief.
- Beslisnotities met aanleiding, motivering, rolgebonden zichtbaarheid, vaststelling, revisies en enkelvoudige vervolgactie.
- Compliance-eisen onderscheiden vereiste bewijzen, gekoppelde bestandsnamen, verval en beoordeling.
- Managementweekrapport met dezelfde meetdefinities, onveranderlijke momentopnamen, archief en downloadbare tenant-PDF.

## Grenzen

De operationele demomodules hebben geen echte serveraggregaties, uploads, providerbetalingen of achtergrondtaken. Het toegevoegde CRM heeft wel serveropslag, agendareserveringen en een notificatie-outbox. De Site is owner-private; de native Sites-toegangsgrens beschermt alle CRM-routes. Rolkeuze demonstreert zichtbaarheid; in productie zijn serverautorisatie en tenantisolatie nodig. Bestandsselectie bewaart alleen de voorbeeldnaam. Betalingen en rapportplanning zijn expliciet simulaties. De peildatum van de demo is 14 oktober 2026. Periodeselectie in de bezoekgrafiek filtert de aanwezige bezoekrecords. Cockpitacties en financiële kaarten tonen de stand per peildatum. Rapportperiodetekst is een label en geen historische reconstructie.

## Controle

- `node node_modules/typescript/bin/tsc --noEmit` en de Sites buildhelper: typecontrole en Vinext-productiebouw.
- `pnpm test`: 29 niet-browserrendercontroles voor schermen en rollen; gedeelde financiële en actie-invarianten.
- Werkelijke PDF-generatie apart gecontroleerd op geldigheid, tekst, metadata en afscherming van ruimere rapportrollen.
- Browser- en screenshotcontrole niet uitgevoerd: de ondersteunde browser-previewinfrastructuur was niet beschikbaar.

## Sites

Identiteit en Worker/D1-publicatieconfiguratie staan in `.openai/hosting.json`. De Sites-bronrepository bewaart dit project. Het oorspronkelijke platformdeployproces, staging en productie zijn niet aangepast.

## CRM en websitekoppeling

De bestaande `src/`-dashboardbron is in een Vinext-shell opgenomen. API-routes staan onder `/api/crm`; de database wordt beheerd via `db/schema.ts` en de schema-only migraties in `drizzle/`. Websiteformulieren sturen server-side naar dit private platform. Het bestaande Sites-servicetoken staat uitsluitend als runtime secret `FIELDGRID_CRM_SERVICE_TOKEN` in de marketing-Site. Alleen intake en beschikbaarheid worden doorgegeven. Maak deze platform-Site niet publiek zonder aanvullende serverautorisatie.

- Aanvraagtypen: telefonische kennismaking, telefonische productdemo en proefaanvraag; proefaanvragen activeren geen account.
- Leadontdubbeling op e-mailadres en organisatie, aparte aanvraagsnapshots, stabiele idempotentiesleutels en atomaire slotreserveringen.
- Agenda in Europe/Amsterdam, vrijgegeven weekdagen/werktijden, boekingshorizon, minimale voorbereidingstijd, buffer en geblokkeerde datums. Een afspraak reserveert de interne agenda; ICS is een download, geen Google/Outlook-synchronisatie.
- Iedere intake maakt een opvolgtaak en een notificatierecord. Het CRM hergebruikt de globale Fieldgrid-configuratie `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `SENDGRID_FROM_NAME` en `SENDGRID_API_BASE`. De ontvanger is de bestaande primaire platformbeheerder (`FIELDGRID_ADMIN_EMAIL`), met het geregistreerde owner-account als fallback binnen deze owner-private Sites-demo. Er is geen apart CRM-adres of tweede providerconfiguratie. Alleen de voorkeur voor CRM-meldingen staat in het CRM. Zonder configuratie blijft de melding zichtbaar als `pending_config`. HTTP 202 wordt `accepted`, niet `delivered`; er wordt geen bezorging verzonnen.
- Voorbeeldgegevens worden alleen op expliciet verzoek geladen, zijn herkenbaar gemarkeerd en versturen nooit mail. De browserdemoreset wist geen CRM-records.

Mailreferentie: https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send

## Platformoverzicht en centrale notificaties

Het overzicht toont eerst Aandacht nodig / Supportcockpit, vervolgens vier CRM-kaarten (pipeline, nieuwe aanvragen, komende afspraken, opvolging), daarna Tenantoverzicht / Platformacties. De CRM-kaarten halen de actuele CRM-records op; voorbeelden zijn herkenbaar en uitfilterbaar. Acties openen de betreffende CRM-tab of een nieuwe-lead/afspraak/taakdialoog.

Bij integratie in `veele-services/platform` hergebruik `lib/providers/sendgrid.ts`, de bestaande notificatiepolicy/transportregistratie en de geldige primaire `platform_admins`-identiteit. De eerste willekeurige Auth-gebruiker is geen beheerdersselectie. De Sites-demo heeft een aparte runtime en ontvangt geen productiegeheimen uit die repository. De automatisch vastgelegde eigenaaridentiteit is alleen geldig binnen de huidige owner-private Sitegrens; uitbreiding van publiek/toegang vereist expliciete rolcontrole.
