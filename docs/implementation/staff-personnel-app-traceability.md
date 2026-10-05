# Personeelsapp: implementatie en traceability

Status: geïmplementeerde V1-scope, met expliciete bewijsgrenzen
Peildatum: 2026-10-05

## Doel en bron van waarheid

Dit document koppelt de aangeleverde personeelsapp-prototypeflow aan de code die
daadwerkelijk in Fieldgrid is opgenomen. Het prototype bepaalt de gewenste
bediening en uitstraling; autorisatie, privacy en bedrijfslogica blijven
server-side Fieldgrid-contracten. Dit document is daarom geen alternatieve
productspecificatie en ook geen bewijs van een stagingdeployment. Een release
is pas staging-geaccepteerd wanneer de exacte gepromoveerde Git-SHA de volledige
workflow en publieke healthcheck doorloopt.

De belangrijkste implementatiebronnen zijn:

- app/staff/page.tsx, app/staff/layout.tsx en app/staff/staff.css voor de
  beveiligde route, huisstijl en responsive layout;
- components/fieldgrid/staff/personnel-app.tsx voor planning, nieuws, uren,
  personeelszaken, profiel en onboarding;
- components/fieldgrid/staff-app.tsx voor de vierdelige werkbon, uitvoering,
  rapportage en ondertekening;
- components/fieldgrid/staff/route-shell.tsx en route-shell-client.tsx voor
  dezelfde shell rond tickets en notificaties;
- app/staff/actions.ts voor gevalideerde serveracties;
- lib/staff/workspace.ts en lib/data/workspace.ts voor de strikte browser-DTO;
- supabase/migrations/20261004220000_staff_personnel_app.sql voor opslag,
  policies, projectie, commando-RPC's, audit en realtime-invalidatie;
- supabase/tests/database/staff_personnel_app.sql, lib/staff/*.test.ts en de
  personeelsflows in tests/e2e/fieldgrid.spec.ts voor geautomatiseerde dekking.

## Toegangs- en privacycontract

/staff is alleen beschikbaar bij een actieve objectsessie, tenantmodule
personeel, tenantrol staff en een actieve eigen personeelskaart. Ontbreken module
of rol, dan redirect de route naar /app. Een ontbrekende of inactieve
personeelskaart geeft geen andere medewerker of generieke backofficegegevens
terug, maar een afgesloten eigen scherm.

De browser ontvangt uitsluitend staff_workspace(target_tenant). Deze
security-definer-RPC projecteert een expliciete allowlist en is begrensd tot:

- de eigen personeelskaart, eigen uren, beschikbaarheid, verlof, dagreviews,
  dienstinteresse en employee-visible documenten;
- de eigen actuele of teruggemelde assignments en de werkbonnen, klanten,
  objecten en contactsnapshots die daar werkelijk bij horen;
- eigen rapportregels en uploads, plus werkbonbrede gegevens die voor de
  uitvoering of rapportage nodig zijn;
- alleen veilige reisinformatie; oorsprong, bestemming en actorvelden blijven
  buiten de staff-projectie;
- materiaal- en onkostengegevens alleen wanneer de rapportagemodule actief is.

parseStaffWorkspaceProjection() valideert daarna iedere rij met een strict
Zod-schema en controleert tenant-, personeels-, assignment- en werkbonrelaties.
Een extra veld zoals user_id, author_user_id, storagepad, HR-actor of reisadres
maakt de hele projectie ongeldig. De browser verruimt de databasegrens dus niet
stilzwijgend wanneer later een kolom wordt toegevoegd.

Voor realtime staat van deze personeels- en planningsbronnen uitsluitend de
grove tenantrij `staff_workspace_revisions` in de publicatie. Een actieve,
geautoriseerde medewerker kan zijn tenantrij lezen via module personeel,
staffrol en een eigen actieve personeelskaart; een planner alleen via module
planning en `planning_access`. `work_orders` en de overige rijke brontabellen
zijn niet gepubliceerd. Staff refetcht na een revisionevent `staff_workspace`;
het planbord gebruikt hetzelfde signaal om via zijn serveractie de begrensde
`get_planboard`-projectie opnieuw op te halen.

## Prototype naar implementatie

### Shell, navigatie en responsive gedrag

| Prototypegedrag | Werkelijke implementatie | Server-/privacygrens |
| --- | --- | --- |
| Fieldgrid-huisstijl, desktopzijbalk, tabletvariant en mobiele topbar/bottom-nav | PersonnelApp, StaffRouteShellClient en staff.css; breakpoints op 1200, 1000, 800, 600 en 370 px | Branding wordt tenantgebonden geladen; er staat geen demoaccount of hardcoded tenantdata in de UI. |
| Planning, Nieuws, Uren, Tickets en Meer plus Verlof, Beschikbaarheid, Documenten, Profiel en Instellingen | Hoofdviews in personnel-app.tsx; tickets en notificaties behouden de personeels-shell via StaffRouteShell | Iedere route hergebruikt de ingelogde tenantcontext en staff-workspace. |
| Profielmenu consistent en bruikbaar met toetsenbord | Gecontroleerd menu met Escape, buitenklik, focusverlies, pijlen, Home/End en focusreturn | Uitloggen blijft een serverroute; menu-inhoud verleent geen rechten. |
| Compacte online-/syncstatus | offline, connecting, syncing en current in hoofd- en subshell | Realtime is alleen invalidatie; de actuele gegevens komen opnieuw uit de begrensde serverprojectie. |
| Vaste dialogafmeting en bruikbare mobiele variant | Personeelsdialogs en geneste werkbonformulieren zijn 860 px × 90dvh, met vaste buitenmaat, scrollende body en vaste/sticky footer; tot en met 600 px fullscreen | Open formulieren worden niet naar een publieke of tijdelijke datalaag gekopieerd. |
| Personeelslogin met e-mailcode | Een apart /staff-loginpad vraagt een eenmalige zescijferige code aan en verifieert die via Supabase Auth; resend heeft een zichtbare cooldown | Geen nieuwe gebruiker wordt aangemaakt, onbekende accounts krijgen dezelfde response en na verificatie wordt de staffrol opnieuw server-side gecontroleerd. |

Voor staging is dit tevens een providercontract: de hosted Supabase Magic
Link-template moet `{{ .Token }}` bevatten en mag geen credentialdragende link
tonen; bij de signed Send Email Hook maakt de Fieldgrid-route dezelfde codemail.
De exacte operatorinstelling en fallbackgrens staan in
`docs/deployment/mail-hooks.md`. Een applicatiedeploy configureert dit hosted
sjabloon niet automatisch.

De Playwright-suite bevat een responsive personeelsflow op 320, 390, 768 en
1440 px, inclusief horizontale-overflowcontrole, werkbontabs, mobiele navigatie,
weekuren en focus/return van de verlofmodal.

### Planning en werkbonkaart

| Prototype-eis | Werkelijke implementatie | Gezaghebbende bron |
| --- | --- | --- |
| Weeknavigatie met dagselectie | Vorige/volgende week, werkindicator, toetsen links/rechts en touch-swipe | Eigen assignments uit staff_workspace |
| Lijst- en agendaweergave | Schakelaar bewaart dezelfde geselecteerde dag en opent dezelfde werkbon | Eigen werkbon-/assignmentprojectie |
| Tijd linksboven | Vóór start gepland begin–einde; na start uitsluitend het eigen werkelijke interval; pauze blijft een status | assignmentInterval() presenteert alleen; PostgreSQL klokt de lifecycle |
| Titel, klant/object, adres, telefoon en werkbonnummer | Kaart gebruikt het gekoppelde object, de klant en assignmentgebonden contactsnapshot; nummer staat in de kaartmetadata | Geen generieke klant- of contactenlijst voor staff |
| Contact, route en beveiligde toegang als compacte acties | Afzonderlijke vaste dialogen tonen alleen de opdrachtgebonden contactsnapshot en veilige routecontext; de beveiligde detailactie blijft achter de bestaande object-/werkbonauthorisatie | Externe route opent alleen een opgebouwde HTTPS Maps-URL; geheime objectgegevens komen niet in een routequery of generieke projectie. |
| Nieuwe planning zonder handmatig herladen | Tenantrevision-event gevolgd door een verse staff_workspace-projectie | Zie staff-realtime-and-release.md |
| Teruggemelde opdracht blijft vindbaar | Eigen returned assignment blijft als read-only historie zichtbaar | De projectie-uitzondering geeft geen nieuwe uitvoerings- of storagebevoegdheid |

### Werkbon, uitvoering en tijd

De actieve werkbon heeft de vier prototypetabs **Overzicht**, **Taken**,
**Tijd & status** en **Rapport**. Overzicht bevat status, klant/object, planning,
adres, daginstructies, bezoeksignalen en ticket-/reiscontext. Taken ondersteunt
checklistuitvoering, deelresultaat, toegestaan meerwerk en een vrije
meerwerkvoorstel-flow. Tijd & status toont de eigen werk- en reisregels plus het
assignmentgebonden statusverloop met reden en toelichting.

| Personeelsactie | Servercommando en effect |
| --- | --- |
| Openen | transition_work_order met open; markeert alleen de eigen inzet als gezien. |
| Vertrekken | travel; opent server-side één reis-tijdregel. |
| Starten | start; sluit een open reisregel en opent zonder overlap een werkregel. |
| Pauzeren / hervatten | pause en resume; sluiten/openen de juiste tijdsoort en bewaren het eigen werkelijke begin. |
| Mijn inzet stoppen | stop; sluit alleen de eigen open tijdregel en assignment. Het gezamenlijke rapport is een aparte stap. |
| Werk afronden | Een begeleide flow controleert eerst eigen open taken en onopgeslagen rapportconcepten, stopt daarna versioned de eigen inzet en opent binnen dezelfde dialoog rapport, ondertekening of klant-afwezig. |
| Terugmelden | return met server-side allowlist van redenen en verplichte concrete toelichting; te lange of onbekende invoer faalt. |
| Toegestaan meerwerk | Bestaande add_extra_work-flow voor vooraf toegestane regels. |
| Vrij meerwerk voorstellen | staff_request_extra_work; vereist een actieve eigen opdracht, reden, 5–480 minuten in stappen van vijf en optioneel een voorstelbedrag; retry is idempotent. |

Alle mutaties controleren opnieuw module, tenant, eigen actieve assignment,
lifecycle en waar van toepassing verwachte versie/idempotency key. Een knop in
de client is nooit de autorisatiegrens.

### Rapportage en ondertekening

| Prototype-eis | Werkelijke implementatie | Integriteitsgrens |
| --- | --- | --- |
| Rapportnotities en incidenten | Aanmaken gebruikt één stabiele mutatiesleutel; de rapportregel, alle bijlagemetadata, audit en command receipt finaliseren atomair. Wijzigen en soft-deleten blijven versioned commando's | Actieve eigen opdracht en bewerkbare rapportstatus worden server-side opnieuw gecontroleerd; rechtstreekse staff-inserts zijn niet toegestaan |
| Foto's en PDF | Maximaal 5 per bericht, maximaal 10 MB, JPG/PNG/WebP/PDF; inhoudsvalidatie, normalisatie en virusscan vóór finalize | Private buckets; deterministic stagingpad en scannerreceipt moeten exact passen bij objectversie, MIME, grootte en SHA-256. Niet-gecommitte bytes krijgen best-effort cleanup; download loopt via de geautoriseerde route |
| Materialen en onkosten | Toevoegen/verwijderen met customer-visible keuze, versionering en report-lock | Private materiaalfinance blijft buiten publieke tabellen/projecties |
| Gezamenlijk opleverrapport | Pas na het sluiten van de vereiste uitvoeringssegmenten; immutable snapshot, rapportversie en SHA-256-contenthash | Rapportindienen verandert geen eigen stop- of tijdgegevens |
| Exact document tonen vóór klanttekent | staff_report_signature_preview levert alleen de actuele, hash-gecontroleerde customer_copy; de UI rendert die versie en haar opgenomen bijlagen vóór tekenen | Strict snapshotschema, actuele rapportversie, execution session, assignment en signature policy worden opnieuw gecontroleerd |
| Bijlage uit de ondertekenweergave | /api/files/work-order-report/[id]?signatureHash=... autoriseert via staff_report_signature_preview_file | Een intern of niet in de snapshot opgenomen bestand wordt geweigerd |
| Handtekening vastleggen | Prepare → gescande private PNG-upload → finalize, gebonden aan rapport-id, versie, soort en contenthash | Verkeerde of gewijzigde hash faalt gesloten; retry gebruikt dezelfde intent |
| Klant afwezig | Eigen formulier met verplichte reden via staff_report_customer_absent | Alleen in waiting_signature, exact rapport/hash, één idempotente uitzondering en rapportgebonden opvolgmelding |

Een open rapportnotitie wordt niet stilzwijgend weggegooid: tabwissel,
sheet-close en rapportindienen vragen om bevestiging of blokkeren totdat het
concept bewust is afgehandeld.

`staff_report_upload_allowed` is daarbij alleen de actuele read-only
autorisatie voor de server-side scan/publicatie. Pas
`staff_finalize_report_entry` maakt de notitie zichtbaar. Een identieke retry
levert de opgeslagen command receipt; dezelfde sleutel met gewijzigde inhoud
wordt geweigerd. Daarmee bestaat er geen geautoriseerde tussentoestand met wel
een zichtbare parent maar slechts een deel van de bijlagemetadata.

### Uren en personeelszaken

| Functie | Implementatie en servergedrag |
| --- | --- |
| Mijn uren | Prototype-indeling met drie dagtotalen, tijdlijn met locatie/duur, correctiekeuze, pauze/totaal, weekzijbalk en blijvende registratie-uitleg. Weekdagen zijn selecteerbaar; weekenddagen verschijnen bij geregistreerde uren of selectie. Weeknavigatie blijft beschikbaar. Lege dagen tonen dezelfde structuur met nulwaarden. Totalen tellen alleen geregistreerde tijd; lopende regels verversen elke minuut. |
| Werkdag sluiten/bevestigen | staff_day_command; open tijdregels blokkeren sluiten, open correcties blokkeren bevestigen, exacte retries leveren hetzelfde resultaat. |
| Correctieverzoek medewerker | Alleen voor een gesloten eigen tijdregel en verwachte versie; de medewerker geeft gecorrigeerde begin-/eindtijd of duur plus reden op. Het verzoek bewaart bron- en doelsnapshot, wordt niet dubbel pending aangemaakt en verandert de bronregel of dagstaat nog niet. |
| Correctiebeoordeling management/HR | Het personeelsdossier toont oorspronkelijk en gevraagd interval, reden en status. Tenant admin, management of HR kan de exacte versie toepassen of met verplichte toelichting afwijzen via review_staff_time_correction. |
| Verlof | Prototype-kop met aanvraagknop rechts, drie saldokaarten, één aanvraaglijst en uitleg met 24px tussenruimte. Aanvragen, status en aangevraagde/goedgekeurde uren bekijken en een pending aanvraag intrekken; overlapguard, contractafgeleide minuten, lokale datumgrenzen en idempotentie staan in de database. Goedkeuring maakt atomair een availability-blok. |
| Verlofsaldo | Jaarrecht en overdracht zijn management-owned en versioned; beschikbaar, goedgekeurd en in behandeling worden uit entitlement plus goedgekeurde/aangevraagde minuten berekend. |
| Beschikbaarheid | Weekdagen/tijden, dag/avond/nacht, weekend, feestdagen en planningsnotitie; alleen bewerkbaar als management selfservice heeft vrijgegeven. UI én RPC controleren dit. |
| Nieuws | Alleen gepubliceerde staff-aankondigingen, met eigen gelezenstatus. |
| Tickets en notificaties | Bestaande beveiligde routes in dezelfde personeels-shell; inbox, voorkeuren en push-control blijven beschikbaar. |
| Documenten | Alleen employee-visible en niet dossier-managed eigen documenten, via de bestaande private downloadgrens. |
| Profiel | Naam, roepnaam, telefoon, mobiel, geboortedatum, woonadres, noodcontact, vervoer en reisbeperkingen met optimistic concurrency. Login-e-mail is readonly en ontbreekt uit iedere write-allowlist. |
| Open diensten | Alleen eligible open diensten; eigen interesse kan worden aangemeld of ingetrokken. |

Verlofrecht wordt niet uit een UI-standaard verzonnen. Management legt per jaar
het recht en de overdracht vast; de database berekent aanvraaguren uit het
actuele contract en trekt uitsluitend werkelijk goedgekeurde vakantieminuten af.

Het urencorrectiepad is end-to-end snapshotgedreven. De staffactie legt de
oorspronkelijke tijdregel inclusief versie en dagstatus vast, samen met het
exacte gewenste interval. Het personeelsdossier leest alleen verzoeken van de
geselecteerde medewerker en geeft de reviewer geen vrije tijdmutatie buiten dat
voorstel.

Bij goedkeuring vergrendelt de RPC verzoek, bronregel en dagstaat in één
transactie. Zij controleert opnieuw requestversie, volledige bronsnapshot,
lokale werkdag en overlap met andere tijdregels en past daarna uitsluitend de
vastgelegde begin- en eindtijd toe. Een eerder confirmed of
correction_requested dag gaat terug naar closed; de medewerker moet de
gewijzigde dag daarna expliciet opnieuw bevestigen. Bij afwijzing veranderen
bronregel en dagstaat niet en is een feitelijke reviewtoelichting verplicht.
Beide beslissingen bewaren reviewer/tijdstip, verhogen de verzoekversie en
schrijven één before/after-auditevent. Stale request- of bronversies en overlap
falen atomisch zonder halve beoordeling.

### Onboarding

De onboarding is hervatbaar en bestaat uit vijf stappen, of zes wanneer
management availability-selfservice heeft vrijgegeven. Iedere tussenstap wordt
met zowel onboarding_version als de canonieke personeelsversie opgeslagen.
Afronden is één database-transactie met centrale meldingsvoorkeuren; een stale
notification revision rolt de hele afronding terug.

De geïmplementeerde velden zijn:

- voornaam/achternaam, roepnaam, verplicht mobiel, tweede telefoonnummer,
  optionele geboortedatum, volledig woonadres en noodcontact;
- readonly login-e-mail, die ook niet in het onboardingconcept mag voorkomen;
- negen vervoerswijzen: auto, bedrijfsbus, motor, scooter, fiets, e-bike,
  openbaar vervoer, lopen en anders;
- vertrek vanaf woonadres, actieve vestiging of volledig alternatief adres;
- terugkeer naar vertrekpunt, eigen vervoer, carpool, rijbewijs/categorieën en
  reisbeperkingen;
- conditionele beschikbaarheid met weektijden en dienstvoorkeuren;
- push/e-mail, stil venster, timezone en voorkeuren per meldingstype, gekoppeld
  aan de centrale notificatievoorkeuren;
- afzonderlijke bevestigingen voor profiel, conditionele beschikbaarheid,
  meldingen, privacy-informatie en toepasselijke gebruiksvoorwaarden.

De UI bevat focus trapping/return, blokkeert achtergrondscroll en kan uitloggen
zonder de opgeslagen voortgang te verliezen. Playwright bevat een scenario dat
een tussenstap opslaat, na reload hervat, alle conditionele stappen doorloopt en
na afronding ook na reload op de planning blijft.

## Bewuste product- en privacygrenzen

Deze grenzen zijn onderdeel van de implementatie en geen ontbrekende demo-data:

1. **Geen geïnferreerde payroll-gaten.** De app toont en totaliseert uitsluitend
   werkelijk geregistreerde tijdregels. Zij maakt geen betaalde other-tijd of
   loonrecht aan om een dag visueel “vol” te maken en labelt totalen daarom als
   geregistreerde tijd.
2. **Een niet-goedgekeurd voorstelbedrag blijft intern.** Vrij meerwerk krijgt
   commercieel unit_price_cents = 0 en status awaiting_review. De reden blijft
   intern bij de toegewezen werkbon; alleen de maker ziet het voorstelbedrag in
   de staff-DTO. Het bedrag komt niet in de klantondertekenweergave.
3. **Geen eigenaarschap raden.** Historische rapportversies zonder vastgelegde
   expense-ownership tonen in de gewone own_contribution-projectie geen
   onkosten. De aparte exact gehashte klantkopie bevat wel alle destijds
   customer-visible onkosten.
4. **Geen offline mutatiequeue.** Offline blijft de laatst geladen snapshot
   zichtbaar en wordt de status getoond; een niet-bevestigde actie moet na
   verbinding opnieuw worden uitgevoerd. Server-idempotentie voorkomt dubbele
   verwerking van dezelfde bevestigde opdracht.
5. **Geen formeel beleid verzinnen.** Onboarding legt uit welke categorieën de
   app gebruikt, maar verwijst voor formele privacyinformatie en voorwaarden
   naar de organisatie; er is geen hardcoded juridisch document of fictieve URL.

## Geautomatiseerd bewijs op de implementatiewerkboom

| Controle | Vastgesteld resultaat | Wat dit bewijst |
| --- | --- | --- |
| pnpm db:reset | Geslaagd op 2026-10-04 | Alle migraties, inclusief 20261004220000_staff_personnel_app.sql, passen vanaf een schoon lokaal schema toe. |
| pnpm exec supabase test db supabase/tests/database/staff_personnel_app.sql | 138/138 pgTAP-asserties geslaagd op 2026-10-05 | Hervatbare onboarding/notifications, profiel/vervoer, verlof, werkdag, urencorrectieaanvraag en managementreview met autorisatie/concurrency/audit/herbevestiging, lifecycle, travel, return, kosten, vrije meerwerkflow, rapport/hash, previewbestanden, klant-afwezig en realtime/RLS-grenzen. |
| Volledige lokale pgTAP-suite | 398/398 asserties geslaagd | De personeelsmigratie blijft compatibel met de overige databasecontracten. |
| Gerichte Vitest: staff time/workspace, report PDF en uploadtests | Gerichte runs groen; de kernrun telde 18/18 tests | Tijd/DST, strikte DTO, customer-document/PDF-pariteit en uploadlimieten/cleanup. |
| lib/customers/profile-action.test.ts | 3/3 geslaagd na bijgewerkte RPC-mock | De gedeelde rapport-RPC-helper breekt de klantprofielacties niet. |
| pnpm typecheck | Geslaagd | De actuele TypeScript- en gegenereerde databasecontracten sluiten aan. |
| pnpm lint + pnpm test | Geslaagd; 821/821 tests in 101 bestanden op 2026-10-05 | Volledige lint- en unitregressie, inclusief profielherstel en uploadautorisatie vóór verwerking. |
| pnpm test:security:http | 10/10 geslaagd op 2026-10-05 | Echte lokale Auth-, Data API-, Storage-, Realtime- en ClamAV-grenzen, inclusief intrekking. |
| Database lint + security advisors | Geen fouten of securitywaarschuwingen | Definitieve lokale functies en grants. |
| Playwright staff-login + directe niet-auth fixture | Echte lokale Mailpit-codeflow 1/1 en personeels-PWA 1/1 geslaagd | De authspec gebruikt e-mailcode en bewaart geen trace/screenshot/video; overige browserflows verbruiken geen OTP-mailquota maar installeren een gewone lokale Supabase-gebruikerssessie zonder applicatie-bypass. |

Daarnaast staan in tests/e2e/fieldgrid.spec.ts gerichte browserscenario's voor
responsive personeelsnavigatie, werkbonmodal, uren/verlof, onboarding-resume en
een echte planner→staff realtime-update zonder paginareload. Deze scenario's
zijn lokaal groen, inclusief tweemaal beschikbaarheid opslaan na onboarding.
De bijgewerkte compacte-filterproef voor resources en planbord is 6/6 groen.
Aanwezigheid van een test is niet hetzelfde als een groene release-uitvoering; de uiteindelijke
CI-run en staging health-SHA blijven het bewijs voor de te promoten commit.
