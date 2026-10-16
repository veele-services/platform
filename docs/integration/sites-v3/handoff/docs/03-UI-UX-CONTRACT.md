# Platform — actuele Sites-UI/UX en functionele overdracht

Audit op 14 oktober 2026, Europe/Amsterdam. Dit is een broncode-audit, geen nieuw browser- of visueel testbewijs.

## Vastgezette referentie en voorrang

- Sites-project: `appgprj_6aceb2b726cc81918ba567f7d949190c`.
- Referentie-URL: `https://fieldgrid-platform.dgwebserv.chatgpt.site/#/platform`.
- Gecontroleerde checkout: `/workspace/sites/fieldgrid-platform`.
- Gecontroleerde Sites-commit: `3999c85b76aecf729f3b2bba86e1535255915848`; working tree was schoon.
- Deze actuele Sites-bron is leidend voor UI/UX: hiërarchie, compositie, kleurrollen, typografie, componenten, interacties en responsive gedrag. Geen herontwerp of vrije benadering.
- De huidige applicatierepository blijft de implementatiebasis voor echte data, autorisatie, bestaande functionele diepte, services, jobs en deployment. De Sites-runtime is geen opdracht om de app te vervangen.
- Het eerdere overdrachtspakket gebruikt Site-SHA `362f57c27c153b8c77d2c629e94a8a2eb641e66a` en applicatiebaseline `9630c8f74a02cef98a12d213ec2ed87f8365afd4`. De nieuwe platform-/CRM-bron vervangt zijn oude UI-snapshot. Bestaande management-/rechtenvereisten vervallen hierdoor niet.

## 1. Definitieve volgorde platformoverzicht

Bron: `src/ExistingDashboards.tsx`, `PlatformDashboard`, branch `view === 'overview'`; CRM-inhoud in `src/CRMOverview.tsx`.

1. Paginaheader **Platformoverzicht** met helptekst en actie **Nieuwe tenant**.
2. Vier bestaande platformmetrics: **Totaal tenants**, **Actief**, **Actieve medewerkers**, **Aangepast**.
3. Vier CRM-containers, op desktop een 2 × 2-grid, in leesvolgorde: **Actieve pipeline**, **Recente aanvragen**, **Afspraken**, **Opvolging**.
4. **Aandacht nodig** en **Supportcockpit**.
5. **Tenantoverzicht** en **Platformacties**.

De complete eerdere CRM-kopregel is verwijderd. Niet opnieuw toevoegen: eyebrow “VAN INTERESSE NAAR KLANT”, titel “Relaties & groei”, introductieregel, selector “Alle gegevens” of de losse vernieuwknop. De vier containers hebben wél hun eigen bestaande titel, eyebrow, icoon en footeractie. Een foutmelding met knop **Opnieuw proberen** en de kleine voorbeeldgegevensnotitie mogen verschijnen als de bijbehorende toestand geldt.

### Kaartinhoud en doorklikken

| Container | Brondefinitie in huidige Sites-code | Interactie |
| --- | --- | --- |
| Actieve pipeline | Leads behalve `won`/`lost`; aantal actieve leads; som `value` als **potentiële maandwaarde**; aantallen per actieve fase; gewonnen/verloren onderaan | Fasebalken en **Open pipeline** openen de pipeline. De huidige fasebalk geeft geen aparte fasefilter mee. |
| Recente aanvragen | Alle verzoeken aflopend op `createdAt`, maximaal drie rijen; snapshotbedrijf/-naam, fallback naar leaddossier bij legacy lege waarden | Rij opent Aanvragen en hetzelfde leaddossier; footer opent alle aanvragen. |
| Afspraken | Niet geannuleerd en `endsAt >= nu`, oplopend op `startsAt`, maximaal drie; nog te bevestigen herkenbaar | Rij opent Agenda en hetzelfde leaddossier; footer opent agenda. |
| Opvolging | Onvoltooide CRM-taken plus `nextActionAt` van actieve leads; op datum oplopend, zonder datum onderaan; maximaal drie rijen | Taak opent Opvolging, leadmoment opent Pipeline, met dossier waar gekoppeld. |

De datum-/tijdweergave is Nederlands, in `Europe/Amsterdam`. Achterstalligheid in de opvolgkaart vergelijkt lokale kalenderdatums. Voorbeeldrecords dragen **Voorbeeld** en doen geen mailverzending. Het overzicht toont momenteel alle gegevens; het eerder aanwezige gegevensfilter op het overzicht is bewust verwijderd. Het filter in de volledige CRM-pipeline blijft aanwezig.

`CRMOverview` haalt `/api/crm` op bij mount, iedere 30 seconden zolang de pagina zichtbaar is en bij focus. Oude verzoeken worden geannuleerd. Eerste laadstatus, lege kaarten, eerste fout met retry en vernieuwfout met behoud van laatst opgehaalde gegevens zijn aanwezig. Neem deze states en rustige verversing over; vervang polling bij productie-integratie desgewenst door de bestaande veilige invalidatie/refetch-infrastructuur zonder zichtbare UI-wijziging.

### Platformacties

| Zichtbare actie | Sites-doel | Te behouden resultaat in de echte app |
| --- | --- | --- |
| Nieuwe lead | `#/platform/crm?action=new-lead` | Nieuwe-leaddialoog direct openen. |
| Afspraak plannen | `#/platform/crm?tab=agenda&action=new-appointment` | Afspraakdialoog met leadkeuze openen; als er geen lead is eerst contactpersoon toevoegen. |
| Aanvragen bekijken | `#/platform/crm?tab=requests` | Alle websiteaanvragen. |
| Opvolging | `#/platform/crm?tab=tasks` | CRM-opvolgtaken. |
| Beschikbaarheid | `#/platform/crm?tab=settings` | Agenda en meldingsvoorkeuren. |
| Tenant onboarden | `startWizard()` | Bestaande zesstappen-onboarding. |
| Huisstijl beheren | Geselecteerde tenant, tab `branding` | Huisstijl van de gekozen tenant. |
| Templates beheren | Platformview `templates` | Bestaand templatebeheer. |

Dit zijn acht acties. Nieuwe CRM-acties komen erbij; bestaande platformacties verdwijnen niet. De echte app gebruikt echte routes en bestaande navigatie, niet de Sites-hashrouter. `CRM.tsx` ondersteunt daarnaast de directe actie `new-task`; die staat niet als negende tegel in de huidige Platformacties.

## 2. Bronnen voor UI-overname

| Sites-bron | Verantwoordelijkheid / productie-inpassing |
| --- | --- |
| `src/ExistingDashboards.tsx` | Platformshell/-navigatie, overzichtsvolgorde, tenants, detail, onboarding, support, templates, team. Inpassen in bestaande platformconsole en shell. |
| `src/CRMOverview.tsx` + `src/crm-overview.css` | De vier huidige CRM-containers en layout van onderste tenant-/actierij. |
| `src/CRM.tsx` + `src/crm.css` | Volledige pipeline, aanvragen, agenda, opvolging, instellingen, leaddossier en dialogen. |
| `src/crm-types.ts` | Frontendcontract, fases, aanvraagtypen, mailstatussen en DTO's; aansluiten op echte servermodellen. |
| `src/PlatformAdminAccount.tsx` | Bestaande beheeridentiteit in teamweergave; geen fictief `beheer@fieldgrid.example`. |
| `src/App.tsx` | Vier previewomgevingen, tenantnavigatie en gedeeld bronvenster. Shellpresentatie als referentie; demo-router, rolwisselaar en reset niet in productie kopiëren. |
| `src/Management.tsx` | Eén tenantoverzicht plus Control Center. De managementcockpit blijft in het bestaande `/app`-overzicht. |
| `src/FinanceSLA.tsx` | SLA, omzetbewaking, prijsindexatie. |
| `src/Governance.tsx` | Besluiten, documenteisen/compliance, weekrapport en PDF-presentatie. |
| `src/Portals.tsx` | Personeelsapp en klantportaal als presentatie-adapters, inclusief hun eigen navigatie en responsive gedrag. |
| `src/ui.tsx` | Gedeelde presentatiehelpers: buttons, badges, panelen, tabellen, native dialog, velden, bronlinks. Bestaande productcomponenten hergebruiken waar mogelijk. |
| `src/components/fieldgrid/content-tabs.tsx` + `content-tabs.css` | Aangehechte tabrij en één zichtbare contentcontainer; filter en inhoud vormen één geheel. |
| `src/components/fieldgrid/page-heading.tsx`, `src/components/ui/chart.tsx` | Bestaande header- en chartpresentatie, niet vervangen door nieuwe dashboardstijl. |
| `src/lib/branding/palette.ts` | Semantisch tenantpalet; in repo bestaande palette/TenantThemeProvider en centrale merkconstanten houden. |
| `public/branding/`, `public/fonts/fieldgrid/` | Bestaande Fieldgrid-/tenantassets en fontlicenties. Demo-tenantlogo niet voor alle klanten vastzetten. |

### Stylingcontract

- Inter voor lopende tekst; Poppins voor koppen; Lucide-lijniconen.
- Default Fieldgrid-kleurzaden in Sites: primair `#222C35`, accent `#41AC42`. Platformchrome blijft Fieldgrid; tenantomgevingen gebruiken hun eigen opgeslagen kleurpaar.
- `src/lib/branding/palette.ts` leidt de tokens `--brand-canvas`, `--brand-surface`, `--brand-border`, `--brand-ink`, `--brand-muted`, `--brand-action`, `--brand-action-foreground`, `--brand-accent-soft`, `--brand-accent-text`, `--brand-focus`, sidebar- en hero-kleuren af. Geen losse algemene kleurvervanging die deze rollen omzeilt.
- CRM-blauw blijft zichtbaar in iconen/datumblokjes/fasebalken. Voorbeelden uit de actuele CSS: blauw icoon `#eef4fa`/`#4279a6`, datums `#f4f8fb`/`#37688c`; amber voor achterstallig/bevestiging. Gebruik de actuele bronnen voor exacte waarden en contrast.
- Platformpanelen: rand 1px op `--brand-border`, witte kaartachtergrond, 16px afronding. CRM-overzicht voegt zachte schaduw `0 3px 13px #153a4b03` toe. Geen zwaardere schaduwen of afwijkende glazen/gradientstijl introduceren.
- CRM-grid gap 20px; kaartinhoud behoudt kleine letterhiërarchie, iconen van 39px in 11px afgerond vlak en footer tegen onderzijde. Potentiële maandwaarde blijft duidelijk gelabeld als potentieel, niet als omzet.
- `src/app/dashboard-typography.css`: `--dashboard-font-scale: .8` alleen voor typografie. Geen CSS `zoom`/layouttransform om dit te benaderen. Mobiele tekstinvoer blijft 16px.
- Focus-visible, native dialogfocus, Escape en focusherstel behouden; kaartdoorklikken zijn echte buttons/links. DnD heeft fasekeuze in dossier als alternatief.
- `prefers-reduced-motion` geldt ook voor laadspinner en transitions.

### Responsieve grenzen van de actuele CRM-presentatie

| Grens | Contract |
| --- | --- |
| > 1100px | CRM-overzicht 2 kolommen; Tenant/Acties onderaan verhouding 1 : 1.2; acties 2 kolommen. |
| ≤ 1100px | Onderste Tenant/Acties-rij stapelt; kaarten compacter; CRM nog 2 kolommen. |
| ≤ 850px | CRM-kaarten één kolom; Aandacht/Support eveneens één kolom. |
| ≤ 500px | Platformacties één kolom; foutmelding stapelt; maandwaardekaart compacter. |
| ≤ 430px | Feiten binnen Aandacht/Support één kolom. |
| Volledige CRM | `src/crm.css` heeft aanvullende grenzen 1300/800/550px; bord en weekagenda hebben eigen horizontale scrollcontainer. De hele pagina mag niet horizontaal overlopen. |

Platformshell heeft daarnaast bestaande grenzen 1300/1060/800/640px. Shell, portal- en modalgrenzen niet vervangen door één nieuw generiek breakpointstelsel.

### CSS-importketen

Actuele runtime: `app/layout.tsx` importeert `src/app/globals.css` → `backoffice-portal.css` → `shell-chrome.css` → `dashboard-system.css` → `prototype.css`. Componenten importeren de module-CSS. `ExistingDashboards.tsx` importeert `platform.css`, `platform-consistency.css`, `existing-dashboards.css` en via CRM-componenten de nieuwe CRM-stylesheets. `Portals.tsx` importeert achtereenvolgens staff-, staff-consistency-, customer-, customer-consistency- en portal-demo-stijlen. De oude `src/main.tsx` blijft meegeleverd als voormalige SPA-ingang; het actieve project is inmiddels een Vinext-shell.

Controleer de uiteindelijke cascade bij inpassing in de bestaande Next.js-app. Niet de volledige Sites-`globals.css`, dependencies, framework, hosting of demo-adapters over productie heen kopiëren. Verplaats gewenste selectors gericht en behoud hetzelfde uiterlijk.

## 3. Volledige zichtbare functies en prototypegrens

| Gebied | Huidige Sites-inhoud | Wat de echte app moet behouden / aansluiten |
| --- | --- | --- |
| Tenantoverzicht | Geïntegreerde managementmetrics, trend, prioriteitsacties, verdiepende tabs | Eén `/app`, echte serveraggregaties en brongebaseerde doorklikken; bestaande operatie behouden. |
| Control Center | Vandaag/week/achterstallig/mijn/zonder eigenaar/uitgesteld/afgerond; bronvensters, toewijzing en opvolging | Eén gedeelde dossier-/taakregistratie, echte evaluatieregels, revisiecontrole en audit. |
| SLA | Serviceafspraken, contractversie/historie, filters, detail | Bestaande ticketklok gebruiken; geen tweede timing-engine. |
| Financieel | Bevestigd nog te factureren, controle, onbetaald; indexatievoorstel/-goedkeuring/-verwerking; historie | Werkelijke bronallocatie en contractversies; geen lokale demo-optelling als productieboekhouding. |
| Governance | Beslisnotities met versies/scope, documenteisen/bewijsnaam/verval/beoordeling, weekrapport met snapshots/archief/PDF | Echte private bestanden, serverrechten, consistente meetdefinities en bestaande jobs. Bestandsnaam is geen upload. |
| Bestaande tenantmodules | Aanvragen/offertes, planbord, werkbonnen, taken/tarieven, klanten, objecten, personeel, rapportcontrole, facturen, nieuws/kennisbank/updates/rollen/instellingen | Alle echte uitgebreide dossiers, velden, mutaties, lifecycle en rechten behouden, ook wat de demo vereenvoudigt. |
| Platform | Overzicht, CRM, tenants/detail, onboarding, branding/modules/domeinen, templates, support/-instellingen, productbeheer, team, controles | Bestaande echte platformbeheerflow; geen lokale demo-entiteiten als productieserver. |
| Personeelsapp | Dagplanning, weekstrip, werkbonnen, uren, nieuws, kennisbank, updates, tickets, verlof, beschikbaarheid, documenten, instellingen | Eigen shell, mobiele navigatie, echte uitvoering/onboarding/PWA en bronrechten behouden. |
| Klantportaal | Cockpit, objecten, afspraken, rapporten, facturen, diensten/aanvragen, tickets, nieuws, gegevens | Eigen shell, object/accountbinding, downloads en afgeschermde projecties behouden. |
| Nieuw CRM | Pipeline (7 fases), bord/lijst, filters, aanvragen, agenda, taken, leaddossier/notities, centrale meldingscontext | Visuele bron en functionele flow overnemen, integreren in bestaande autorisatie/database/providerketen. |

### CRM-details die niet mogen verdwijnen

Fases zijn Nieuw → In contact → Afspraak gepland → Voorstel → Proefperiode → Gewonnen/Verloren. Handmatige leadcreatie, fasewisseling via drag/drop én dossier, verantwoordelijke, potentiële maandwaarde, volgende contactdatum, notities/tijdlijn en gekoppelde taken zijn aanwezig. De pipeline heeft zoek-, aanvraagtype-, verantwoordelijke- en voorbeeldfilters en bord-/lijstkeuze. Het leaddossier bewaart aanvragen afzonderlijk en heeft mailto-/telefoonacties.

Agenda ondersteunt week/lijst, datumnavigatie, vandaag, geannuleerd tonen, plannen, bevestigen, verplaatsen, annuleren en ICS. Afspraken zijn telefonisch, 30 minuten; **videogesprek ontbreekt bewust**. Beschikbaarheid heeft weekdagen, werktijden, buffer, minimale voorbereiding, horizon en geblokkeerde datums, in Amsterdamtijd. Een ICS-download is geen Google/Outlook-synchronisatie.

Taken ondersteunen aanmaken, bewerken, afronden/heropenen en open/achterstallig/afgerond/alles. De instellingen tonen de globale SendGrid-service en de bestaande beheeridentiteit readonly; er is geen apart CRM-e-mailadres of tweede providerconfiguratie. De keuze “CRM-meldingen” blijft een lokale voorkeur op de globale dienst. Aanvraagtypen zijn afspraak, demo en 30 dagen proberen; proefaanvraag is geen automatische provisioning.

## 4. Grenzen en integratierisico's

1. Operationele tenant-, management-, staff- en klantdata zijn fictief en overwegend lokaal opgeslagen. Rollen bovenin zijn demonstratie, geen serverbeveiliging. Demo reset wist deze lokale gegevens maar geen CRM-records.
2. CRM is anders: persistente Sites-D1-database, API-routes, intake, slotreserveringen, taken, activiteiten en notificatie-outbox. In productie integreren met de bestaande database/migratieconventie; niet een tweede D1-systeem naast Fieldgrid introduceren.
3. De Site is owner-private. Die toegangsgrens beschermt `/api/crm`; de prototypefallback naar native owner-identiteit mag niet als generiek autorisatiemodel naar een openbare app worden gekopieerd.
4. Gebruik de geregistreerde primaire platformbeheerder/`platform_admins` en bestaande authcontext. “Eerste gebruiker” betekent de reeds gebootstrapte eerste platformbeheerder, niet de eerste willekeurige Auth-rij. Geen ontvanger uit een ongevalideerd formulier of vrij CRM-veld.
5. De globale mailvariabelen en API-abstractie zijn voorbereid; de losse Sites-runtime heeft geen productie-SendGrid-geheimen. `pending_config` betekent nog niet verstuurd; HTTP 202 is provideracceptatie, geen bezorgbewijs. Gebruik in de echte app de bestaande SendGrid-/notificatiepolicy/-transport-/workerketen en geen tweede mailer.
6. Huidige previewpolling haalt de gehele CRM-state op. Productie vraagt gerichte, begrensde en geautoriseerde projecties/paginatie; totaaltellingen moeten de volledige selectie blijven vertegenwoordigen.
7. CRM-topmetric “Geplande afspraken” in `CRM.tsx` gebruikt momenteel `a.date >= vandaag`; overviewkaart gebruikt `endsAt >= nu`. Maak in productie de definitie expliciet en consistent, zonder de presentatie te veranderen.
8. Opvolgkaart combineert taken en contactmomenten. Dit zijn bewust twee soorten signalen; productie moet labels en bronidentiteit behouden en onbedoelde dubbele automatische taken vermijden.
9. Snapshotzoekfunctie in Requests zoekt momenteel deels via de actuele lead; snapshotinhoud is wel bewaard en zichtbaar. Productiezoekactie moet ook de aanvraagnaam/organisatie/bericht volgens de beoogde scope doorzoeken.
10. Bestaande demo-rapportplanning, providerbetalingen, uploads en achtergrondtaken zijn simulaties; niet als afgeronde backendfunctionaliteit rapporteren. Peildatum voor operationele demos is 14 oktober 2026; CRM gebruikt de actuele klok.
11. Prototypebalk, demorolwisselaar, reset, fake accountnamen, hardcoded demofooter, hash-router en bijbehorende toolbar-offsets horen niet in het product. Hun verwijdering mag de echte contentverhoudingen niet veranderen.

## 5. Acceptatie voor Codex

- [ ] Actuele checkout en deze Sites-SHA vastleggen; geen terugzetten van wijzigingen die later in de echte repository zijn gekomen.
- [ ] Screenshots op 1440, 1024, 768, 390 en 320px bij 100% zoom bekijken en vergelijken met dezelfde teststate/tenantkleuren. Per bewijs route, viewport, rol, state en source-SHA vermelden.
- [ ] Platformvolgorde exact: metrics → vier CRM-kaarten → Aandacht/Support → Tenant/Acties. Verwijderde kop/filter/vernieuwknop blijven weg.
- [ ] Vier CRM-kaarten, teksten, afgeronde panelen, zachte schaduw, blauw/groen/amber, iconen, footeracties en lege-/fout-/laadstates volgen de meegeleverde bron.
- [ ] Acht Platformacties openen hun bedoelde bestaande flow; nieuwe lead/afspraak openen direct de dialoog. Deep links, refresh, terug/vooruit en dossieridentiteit kloppen.
- [ ] Pipeline- en aanvragenfilters blijven binnen hun CRM-paneel. Het verwijderde overzichtsfilter komt niet terug.
- [ ] Kalenderuitsluiting voor bezette/geannuleerde slots, verplaatsen/annuleren, telefonische vorm en Amsterdamtijd werken via serverregels; geen video-optie.
- [ ] Marketingaanvraag verschijnt na succes één keer in aanvragen, gekoppelde lead, taak, agenda waar van toepassing en notificatielog. Herhaalde submit met dezelfde sleutel dupliceert niets.
- [ ] Globale SendGrid en primaire beheerder hergebruikt; geen nieuw invoerveld voor CRM-mailadres/afzender/API-key. Ontbrekende configuratie en provideracceptatie eerlijk gelabeld.
- [ ] Productieautorisatie afdwingbaar op server/database; platform-CRM zichtbaar voor passende platformbeheerder, geen toevallige tenant-/staff-/klanttoegang.
- [ ] Alle vier shells, bestaande operationele diepte en de eerdere managementeisen blijven behouden. Geen demo-adapter die echte domeinfunctionaliteit verwijdert.
- [ ] Toetsenbord, focusherstel, Escape, touch, reduced motion, 200% zoom en mobiele inputs controleren; kaart-/bord-/agendascroll blijft binnen eigen container.
- [ ] Gerichte regressietests, bestaande gates en echte bekeken browserbewijzen vastleggen. Typecheck/build/render zijn geen visuele acceptatie.

## 6. Huidige checks en documentatie die achterloopt

Aanwezige suites: `scripts/render-check.tsx` controleert 29 serverrenders/views/rollen plus gedeelde financiële-/actie-invarianten; `tests/crm-backend.test.ts` bevat CRM-server-/integriteitschecks met SQLite/mockprovider. Zij vervangen geen browsercontrole. Deze audit heeft die suites niet opnieuw uitgevoerd.

**`README.md` in de actuele Sites-snapshot bevat verouderde uitleg:** paragraaf “Platformoverzicht en centrale notificaties” noemt nog eerst Aandacht/Support, daarna CRM, en zegt dat voorbeelden op het overzicht uitfilterbaar zijn. Beide zijn achterhaald door de laatste gebruikersinstructie en actuele bron. De voorrang is deze overdracht + actuele UI-bron; niet die paragraaf. Ook generieke teksten zoals “backendacties zijn lokale demo” in oudere help-/bronpanelen zijn niet volledig voor het nieuwe persistente CRM.

Bij vergelijking met de vorige overdracht zijn de eerdere `src/Management.tsx`, `src/FinanceSLA.tsx`, `src/Governance.tsx`, `src/Portals.tsx` en de meegeleverde oude feature-CSS ongewijzigd. Gewijzigde bestaande bestanden omvatten `src/App.tsx`, `src/ExistingDashboards.tsx`, `src/app/globals.css`, package/runtimeconfiguratie en README; CRM-, API-, database- en mailbestanden zijn toegevoegd. De vorige management-/rechtendocumenten blijven inhoudelijke referentie, maar hun SHA's, het aantal bronbestanden en pure Vite/SPAreferenties zijn geen actuele pakketmetadata.

## Marketing hoort bij hetzelfde bindende contract

Voor de complete Signature Grid-UI, de 23 routes, alle beelden, content, motion, kleurrollen, homepagevolgorde en formulieren geldt `docs/05-WEBSITE-DOMEIN-SEO.md` met de exacte bron in `source/marketing/`. Voor beide bronmappen is UI/UX leidend. `source/platform/` en `source/marketing/` zijn bytegetrouwe referenties; verander ze niet bij het implementeren in de targetrepo.
