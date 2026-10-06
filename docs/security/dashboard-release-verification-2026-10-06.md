# Dashboard, oplevering en accountuitleg — 6 oktober 2026

Bronreview van de wijzigingen ten opzichte van `21d2abff329279308fad55dad9f430e030ee2153`.
De controles betreffen de actuele bron en een schone lokale replay van 125 migraties.
De inventaris is metadata; onderstaande actor- en resourcecontroles vormen het inhoudelijke bewijs.

## Oplevering en checklistbeheer

`20261006200000_completion_report_invariant.sql` bewaakt iedere schrijver naar de werkbonstatus, inclusief oude clients. Een gesloten eigen tijdregistratie is geen ingediende oplevering. `completed` vereist de actuele vastgelegde rapportversie in review/approved, de effectieve ondertekenafspraak, gesloten inzetten en geen open klokken. Voortijdige operationele statussen worden met auditregistratie hersteld. Goedkeuring, facturatie, rapportinhoud en historische handtekeningen worden niet herschreven. Herhaalde bestaande opdrachten blijven idempotent; nieuwe rapporten of handtekeningen na gereedmelding worden geweigerd.

`attach_work_order_checklist` herhaalt actuele sessie-, tenant-, rol- en modulecontrole, vergrendelt de opdracht, controleert versie en exacte herhaalsleutel en kopieert uitsluitend een eigen gepubliceerde checklist. Vastgelegde opleveringen vereisen eerst correctie. Bronreview van grants/search_path en regressies in `scripts/test-work-orders.mjs`, `scripts/test-work-order-reports.mjs`, `scripts/test-work-order-rpc-guards.mjs` en `tests/e2e/staff-popups.spec.ts`.

## Intern controledossier en klantkopie

`work_order_dossier` behoudt zijn backoffice-actorgrens en tenantfilter. Namen en leesbare acties worden uit bevoegde dossierbronnen samengesteld; staff kan dit managementdossier niet opvragen. Financiële velden blijven uitsluitend voor financiële bevoegdheid beschikbaar. `loadReportReviewDossier` controleert daarnaast rapportagemodule, actuele tenant, management/finance-rol en RPC-canReview. De tabs tonen echte notities, uren, taakresultaten, checklists, bijlagen, handtekeningen en kosten. De expliciete klantprojectie bevat uitsluitend de vrijgegeven rapportvelden en bestanden, zonder interne notities, privégegevens of technische hashes.

Bewijs: `scripts/test-work-order-reports.mjs`, `lib/work-orders/report-pdf.test.ts`, `lib/work-orders/history.test.ts`, `lib/work-orders/financial-summary.test.ts` en de echte stop/indien/goedkeur/factuurroute in `tests/e2e/dossier-alignment.spec.ts`.

## Concepten, definitieve facturen en bestanden

`execution_invoice_concepts` is alleen voor actuele financiële toegang en active tenant/planning/finance beschikbaar. De eigen actuele goedgekeurde uitvoering vormt de bron. Gealloceerde hoeveelheden, onduidelijke oude bronregels, onopgeloste verzoeken, afwijkende goedgekeurde voorstellen en periodieke facturatie worden uitgesloten. Kortingen en btw volgen de bestaande canonieke afronding. Lezen maakt geen factuur, nummerreservering of mutatie aan. Definitief maken gebruikt het bestaande `create_execution_invoice`-commando, dat bron en concurrentie opnieuw controleert; opgeslagen facturen en hun PDF-hashes blijven immutabel.

De twee nieuwe bestandsroutes verifiëren UUID, actuele hostname-tenant, financiële rol/module en de daadwerkelijke bron. Definitieve bestanden gebruiken de bestaande `customer_file_access`-grens, exacte tenant/factuurnamespace, SHA en malwarecontrole. Concepten controleren hun autorisatie en bron nogmaals na het renderen. Beide geven privé/no-store headers; anonieme of onbevoegde verzoeken krijgen geen bytes. Logo's worden uitsluitend uit het eigen gescande brandingpad gelezen. Nieuwe PDF's gebruiken Fieldgrid als standaard en de vastgelegde tenanthuisstijl waar aanwezig. Een beschadigde historische afbeelding valt terug op het Fieldgrid-woordmerk.

Bewijs: concept-/boekingspariteit, vreemde tenant, personeel, anoniem, service en ingetrokken lidmaatschap in `scripts/test-work-order-reports.mjs`; daadwerkelijke inline-PDF en anonieme weigering in `tests/e2e/dossier-alignment.spec.ts`; logo, lange facturen en fallback in `lib/pdf/invoice.test.ts`.

## Paginatie, notificaties en portalen

De drie lijst-RPC's wijzigen uitsluitend begrensde paginagrootte en offset met behoud van bestaande actor-, tenant- en filtergrenzen. 37 echte rijen worden zonder duplicatie doorlopen in `scripts/test-list-pagination.mjs`; browsercontrole gebruikt 35 echte klanten, blijvende voorkeuren en lege lijsten. Volledige clientcollecties worden met stabiele id-ties via bestaande RLS-clients gelezen. Financiële concepten worden aanvullend alleen binnen de actuele financiële tenant opgehaald.

Compacte notificaties hergebruiken dezelfde workspace-actor/detail-RPC's. De verzoekpoort verwerpt achterhaalde antwoorden. Lezen/archiveren veranderen geen bronstatus. Directe routes blijven beschikbaar en sluiten keert terug naar de inbox; lokaal openen behoudt filters/pagina. Bericht- en bestandsacties, private bestandscontrole, personeelsgrenzen en klantenbindingen blijven in de bestaande server/RPC-laag.

Bewijs: `tests/e2e/list-consistency.spec.ts`, `tests/e2e/notifications.spec.ts`, `tests/e2e/work-orders.spec.ts`, `tests/e2e/planboard.spec.ts`, `tests/e2e/customer-portal.spec.ts` en de bestaande actor/resource-regressies.

## Accountbrede uitleg

`account_guide_dismissals` bevat alleen auth-user, een van 65 vaste functiecodes en leestijdstip. De tabel heeft RLS én FORCE, uitsluitend eigen sessiegebonden SELECT en geen browser-DML-grant. De twee authenticated-only RPC's gebruiken auth.uid(), actuele bestaande sessie en lege search_path; geen client kan een ander account als doel opgeven. Anoniem/service, vreemde sessie, verlopen/verwijderde sessie, geblokkeerde gebruiker en willekeurige functiecode worden geweigerd. Klantaccounts hebben hiervoor geen algemene tenantrol nodig en krijgen geen nieuwe bedrijfsbevoegdheden.

De provider is aan de bestaande geverifieerde browsersessie gebonden, verwerpt achterhaalde laadresultaten en wist presentatie bij accountwisseling. Sluiten verbergt de banner pas na een bevestigde database-opslag; transportfouten houden uitleg en retry zichtbaar. Een nieuw apparaat leest de accountregistratie opnieuw. Banners staan bij de vaste pagina's/functies van backoffice, personeel en klant, met aanvullende uitleg voor uitvoering, ondertekening en controledetails.

Bewijs: `scripts/test-account-guides.mjs` controleert twee accounts, onafhankelijke sessies, idempotentie, eigen RLS, directe DML-weigering en ingetrokken sessies. `tests/e2e/account-guides.spec.ts` controleert echte opslag, transportfout/retry, herladen, nieuwe browsercontext en 320/390/1440px. De klantportaalregressie controleert dezelfde persistentie met een uitsluitend klantgebonden identiteit.

## Releasecontrole

Lint, TypeScript, volledige unit-, database- en browserregressies en productiebuild worden als releasepoorten uitgevoerd. Structurele security-inventaris en ieder gewijzigd ledger-item worden aan hun actuele inhoudshash en concrete bewijsverwijzingen gekoppeld. De stagingworkflow herhaalt de volledige verificatie vóór backup, migratie en uitrol. Operationele acceptatie vereist HTTP 200 én exact de gepromoveerde Git-SHA via `/api/healthz`; lokale tests bewijzen geen staginguitrol.

Lokale verificatie: 1.459 unitcases, 398 pgTAP-asserties, 425 Node-databasecases, 10 echte HTTP-securitycases en 90 browserflows zijn uitgevoerd. De regressies door gewijzigde statusverwachtingen, actieve versus gecachete Next-pagina's en PDF-metadata zijn gecorrigeerd en gericht opnieuw geslaagd. De volledige verplichte CI herhaalt alle suites op de uiteindelijke commit. Lint, TypeScript, productiebuild, de manifestcontrole van alle 125 migraties en het security-ledger met 1.019 expliciet beoordeelde oppervlakken slagen lokaal.

De managementcontrole doorloopt alle dossier-tabs met interne en klantzichtbare notities, controleert de afgeschermde klantkopie, maakt de automatisch getoonde factuur definitief en leest de opgeslagen privé-PDF. Op 390 en 1.440 pixels liggen ook de daadwerkelijke modalgrenzen volledig binnen het scherm. De professionele rapport- en factuur-PDF's en de gewijzigde schermafbeeldingen zijn visueel gecontroleerd.
