# Werkbonnen als centraal uitvoeringsdossier

Deze analyse hoort bij de werkbonopdracht van 30 september 2026. Uitgangspunt is commit `ef10056733a5c89f1636a1b4cf133f86cd58ce7e`, een schone `main`-werkboom. Het doel is de bestaande werkbonketen uit te breiden, niet een tweede administratie te bouwen. Deze pagina houdt implementatie en aantoonbaar testbewijs gescheiden.

## Gecontroleerde uitgangssituatie

| Onderdeel | Concrete bron | Bestaand gedrag | Wijziging | Afnemers | Validatie |
| --- | --- | --- | --- | --- | --- |
| Werkbonlijst | `app/app/[view]/page.tsx`, `backoffice-shell.tsx`, `lib/data/workspace.ts` | Kanban, maximaal 500 bonnen | Serverlijst, filters, zesstapswizard | Backoffice | Databasepaginering, browser op 320/375/desktop |
| Dossier | `app/app/werkbonnen/[workOrderId]/page.tsx` | Eén lange pagina met brede workspacegegevens | Zeven tabs, gerichte projecties en financiële afscherming | Alle 360-dossiers en planbord | Dezelfde ID, geen financiële payload zonder rechten |
| Inzet | `work_order_assignments`, `change_work_order_planning`, `lib/planning` | Meerdere medewerkers met eigen intervallen bestaan al | Keuze één inzet of heel bezoek; bonmetadata en bezettingssignalering | Planbord en personeelsapp | Verschillende tijden, overlap, versieconflict |
| Uitvoering | `transition_work_order`, `app/staff/actions.ts` | Eigen timers maar afronding geblokkeerd door taken/handtekening | Eigen tijd stoppen scheiden van rapport indienen | Personeelsapp, uren en rapportcontrole | Twee medewerkers, pauze, retries |
| Taken | `work_order_tasks`, `record_task_execution` | Gedeelde taak en werkelijk uitgevoerde hoeveelheid | Templates, checklistinstanties en restscope | Planning, uitvoering, facturatie | Geen vermenigvuldiging met ploegomvang |
| Rapport | `report_entries`, `signatures`, `review_work_order` | Bewerkbare notities; numeriek versienummer zonder inhoudssnapshot | Onveranderlijke klantveilige versie, hash, PDF, versiegebonden ondertekening | Personeelsapp, backoffice en klantdocumenten | Lege/verouderde signature geweigerd; review en facturatie afgedwongen |
| Commercieel | `commercial_command`, `agreement_scope_guard`, `object_visit_requests` | Akkoord en contractversies bewaard; verzoek per bezoek | Dezelfde herkomst bij splitsen/opvolgen, geen nieuw prijsakkoord afleiden uit rapport | Offertes, contracten, Object 360 | Bron- en prijsbehoud, exact meerwerkakkoord |
| Facturatie | `create_execution_invoice`, `invoice_source_guard`, `invoice_lines` | Exacte taakallocatie en gedeeltelijke uitvoering | Rapportcontrole en gedeelde scopegrenzen | Rapportcontrole en facturen | Gelijktijdige/repeated facturatie, geen dubbele vaste prijs |
| Reeksen | `commercial_next_visit` | Expliciet volgend bezoek, geen gestructureerde reeks | Beperkte reeks met stabiele occurrences en overslaan | Werkbonnen, planning | Retry, maandgrenzen, tijdzone en uitzonderingen |
| Toegang | `private.has_role`, `object_session_active`, dispatches, RLS | Bestaande rollen, toegewezen bonnen en Object 360-kluis | Gericht serverprojecteren en schrijfrechten voor nieuwe records | Alle schermen en directe API | Cross-tenant, directe IDs, personeel zonder financiële rechten |
| Release | `.github/workflows/ci.yml`, `deploy-staging.yml`, `_verify.yml` | `main` is alleen CI; bewuste promotie naar bestaande `staging` | Bestaand gecontroleerd pad behouden | Staging | CI exact SHA, backup, migraties, health SHA en smoke |

## Gezaghebbende gegevens en grenzen

`work_orders` blijft het uitvoeringspakket. Een bezoek gebruikt de bestaande planningstijden en individuele `work_order_assignments`. Die inzet blijft eigenaar van de eigen uren; de ploegomvang vermenigvuldigt geen taakhoeveelheden of vaste prijs. De bestaande uitvoeringsstatus blijft compatibel voor oude afnemers. Planning, rapportbeoordeling en factuurallocatie hebben afzonderlijke bronnen; betaling wordt uitsluitend van facturen afgeleid.

De keten is werkbon → individuele inzet → bestaand planbord en personeelsapp → onveranderlijke rapportversie → controle → factureerbare prestatie. Een klantinstructie blijft dezelfde `object_visit_requests`-registratie: beoordeling bepaalt reguliere scope of afzonderlijk goed te keuren meerwerk. Alleen goedgekeurde uitvoeringsprestaties worden gefactureerd. Contractuele periodefacturatie blijft een apart bestaand contractproces.

Een rapportversie bevat uitsluitend klantzichtbare inhoud. De bestaande personeelsapp toont die versie en legt de handtekening vast; de backoffice ontvangt en beoordeelt het resultaat. Backoffice en klantportaal krijgen geen tekenveld of vervangende signature-upload. Een rapporthandtekening geldt niet als prijsakkoord voor meerwerk.

Nieuwe records zijn alleen nodig voor versioneerde werkbon/checklisttemplates, checklistinstanties en antwoorden, rapportversies en signature-intents, rolgebonden boncontacten, scopeoverdrachten/bonrelaties, reeksinstanties en beperkt materiaalgebruik/uitzonderingen. Bestaande opdrachten, klantdossiers, offertes, taken, rapportregels, signatures en facturen worden niet gekopieerd naar een concurrerend domein.

## Rechten en gegevensbehoud

Beheer/planning gebruikt de bestaande rollen tenant_admin, management en planner; financieel lezen en financiële beslissingen vereisen tenant_admin, management of finance. HR-lidmaatschap alleen geeft geen commerciële boninzage. Uitvoering en signaturevastlegging vereisen daarnaast een actieve eigen personeelsinzet en personeelsappbevoegdheid. Een platformbeheerder krijgt geen algemene tenantinzage buiten de bestaande gecontroleerde supportvoorziening.

De huidige database heeft al individuele toewijzingen, ook voor één-medewerkerbonnen. Er is daarom geen kunstmatige backfill van dubbele assignments nodig. Nieuwe migraties behouden IDs, uren, oude rapportregels, handtekeningen en factuurallocaties. Oude signatures krijgen geen verzonnen rapporthash; niet-reproduceerbare historische versies worden als historisch behandeld. Gepubliceerde templates en ondertekende inhoud blijven bewaard. De app gebruikt nieuwe services, maar bestaande statuslezers blijven ondersteund.

## Werkplan en bewijsstatus

| Eisgroep | Bij aanvang | Aanpak en afhankelijkheid | Testbewijs |
| --- | --- | --- | --- |
| Lijst, wizard, tabs, contactsnapshot | Gedeeltelijk | Bestaande lijstcomponenten en canonieke dossierroute | `test-work-orders.mjs`, `work-orders.spec.ts`: echte opslag, twee inzetten, URL-context, mobiele tabel |
| Templates en checklists | Te bouwen | Gepubliceerde versies, servervalidatie, lege bonantwoorden | Database en browser: zes vraagtypen, conditionele vragen, onveranderlijke versie en nieuw concept |
| Multi-inzet en individuele uitvoering | Gedeeltelijk | Bestaande planningtransactie en eigen timers behouden | `test-planboard.mjs`, `test-work-order-reports.mjs`: eigen stop/pauze, gelijktijdigheid en versiecontrole |
| Rapport, ondertekening, vrijstelling | Gedeeltelijk | Inhoudssnapshot en actuele actor/versiecontrole | Rapportdatabase, PNG-decodering en PDF-tests; alleen actieve eigen uitvoeringscontext kan vastleggen |
| Deelbon, opvolgbon, duplicaat | Te bouwen | Transactie, scope-identiteit, schone uitvoering | `test-work-order-lineage.mjs`: scopebehoud, retry, schone kopie, historisch gefactureerde bron |
| Reeks en uitzonderingen | Gedeeltelijk | Bounded generatie, expliciete skip en geen historieoverschrijving | Zeswekenvenster, maand-/weekpatroon, skip en handmatig gewijzigde occurrence |
| Meerwerk en facturatie | Bestaand met uitbreidingen | Bestaand akkoord en allocatie; rapport- en scopeguards toevoegen | Commerciële, Object 360- en dossierketentests; vaste prijs en hoeveelheid eenmaal |
| Mobiele lokale conceptqueue | Ontbreekt | Bestaande PWA heeft alleen offline-scherm. Dit is een personeelsappafhankelijkheid, geen afgeronde backofficefunctie | Geen bestaand queuebewijs |
| Autorisatie, bestanden, PDF | Gedeeltelijk | Gerichte DTO, RPC, private recordgebonden downloads | Authenticated databasepolicies, actuele binding/dispatch, interne-canarytests en PDF-unitcontroles |
| Upgrade en release | Bestaand proces | Lokaal query-first, forward migratie, fresh/upgrade-tests, main CI en stagingpromotie | Verse installatie en upgrade met bestaande uren, signatures en factuurbronnen lokaal geslaagd; remote release volgt pas na CI |

Werkvolgorde: kerncontracten en schema; parallel lijst/dossier, rapportketen en scope/series; geïntegreerde typecheck en tests; verse installatie en upgrade; productiebuild; commit en main-CI; bewuste exact-SHA-stagingpromotie; workflow en publieke healthcheck; gecontroleerde rooktest zonder echte klantmails of financiële transacties.

## Acceptatiematrix van de bouwopdracht

De nummers verwijzen naar hoofdstuk 27 van de opdracht. Databasecontroles gebruiken echte `authenticated` rollen, actuele `auth.sessions`, tenantlidmaatschappen en toewijzingen; niet alleen verborgen knoppen.

| Eis | Code en verantwoordelijk contract | Controle |
| --- | --- | --- |
| 1, 2, 3, 6, 25 | Gerichte werkbon-/personeelsprojecties, relatiechecks, private uploads en recordgebonden downloadroutes | Werkbon-, rapport-, planning-, klant-, object- en RLS-suites; vreemde tenant/medewerker en ingetrokken klantbinding |
| 4, 5, 11 | Individuele `work_order_assignments` en `transition_work_order`; rapportindiening apart | Twee medewerkers, eigen stop/pauze, geen doorlopende uren bij ontbrekende handtekening; browser 180 arbeidsminuten versus 120 bezoekminuten |
| 7, 8, 9 | Templateversies, checklistinstanties, antwoord-CAS en servervalidatie | Verplichte/conditionele vragen, n.v.t.-reden, bewijs, oude versie blijft behouden |
| 10, 12, 13, 14, 15, 16, 27, 28 | Rapport-snapshot/hash, signature-intent, servergecontroleerd finaliseren, actuele review, afzonderlijke vrijstelling | Rapporttests: lege PNG, oude hash, ingetrokken dispatch, beheer zonder uitvoeringscontext, correctie en nieuwe versie; PDF toont vastlegger en inhoudsreferentie |
| 17, 20 | Bestaande akkoord-/contractbron plus scope- en factuurguards | Commerciële en dossierketenregressie; gesplitste vaste prijs wordt niet vermenigvuldigd |
| 18, 19 | Bonrelatie en scopeoverdracht, transactie en command receipt | Herhaalverzoek, maximale diepte, resterende hoeveelheid, lege uitvoering/antwoorden van opvolgbon |
| 21 | Reeksdefinitie en unieke occurrence per reeks/datum | Begrensde generatie, zes weken, expliciet overslaan en handmatig verplaatste bon behouden |
| 22 | Eén `work_orders`-ID en bestaande inzet in lijst, dossier, planbord en app | Databaseketens, canonieke links en individuele planbordwijziging in browser |
| 23 | Herhaalsleutels voor tijd/rapport/signature/communicatie | Database-retries en browserreplay; een duurzame offline uploadqueue is nog niet aanwezig (zie grens hieronder) |
| 24 | `report-model.ts`, `report-pdf.ts`, hashgebonden snapshot/assets | Interne gegevens uitgesloten, conditionele vragen, klantzichtbare materialen, PDF-paginering en onveranderlijke bijlagen |
| 26 | Werkbontabel, filterpopover, wizard en zeven dossier-tabs | Browser op 320/375/1440 pixels, toetsenbordbediening, laad-/foutweergave en filterterugkeer |

## Configuratie en bewuste grenzen

Er zijn geen nieuwe providerkeys of stagingsecrets nodig. Rapporten, foto's en PDF's gebruiken de bestaande private buckets. De signaturebucket accepteert voor nieuwe bestanden uitsluitend gevalideerde PNG; historische bestandsrecords worden niet verwijderd. Werkbon- en ondertekeninstellingen staan per tenant/object in de applicatie; het platform bevat geen tenantnaam of diensten als vaste configuratie.

Een reeks genereert expliciet maximaal zes weken; er is geen nieuwe onbeheerde scheduler. Materiaalgebruik is een beperkte registratielijst, geen voorraad-, inkoop- of reserveringssysteem. Garantie/herstel is niet automatisch een nieuw betaalakkoord. De aparte offline concept- en uploadqueue in de personeelsapp blijft een zichtbare afhankelijkheid: online retries zijn beschermd, maar offline invoer is niet als duurzaam opgeslagen te beschouwen.

De rapport-PDF bewaart de tenantnaam en huisstijlkleuren in de inhoudssnapshot. Een tenantlogo wordt niet in het rapport opgenomen; het huidige, later wijzigbare logo wordt dus ook niet achteraf in historische rapporten geladen. De mobiele schermuitbreiding en duurzame offline queue vallen volgens hoofdstuk 13 van de opdracht buiten deze backoffice-uitbreiding; de bestaande personeelsapp is wel aangepast voor compatibele eigen timers, rapportindiening en ondertekening.

De bestaande stagingworkflow voert na activatie de drie werkbondatabasesuites uit met `FIELDGRID_STAGING_SMOKE=1`. De testharness accepteert alleen de stagingbranch in GitHub Actions, de canonieke URL en het verwachte niet-productieproject. Hij dwingt TLS met certificaat- en hostnaamcontrole af; queryparameters mogen het gecontroleerde doel niet omleiden. Een read-only verbindingscontrole draait vóór build, backup en migraties. Alle fictieve klanten, gebruikers, bonnen, rapporten en factuurregels zitten in een niet-gecommitteerde transactie die wordt teruggedraaid; mail-/notificatie-outboxregels worden nooit zichtbaar voor de worker. Een expliciete commit wordt door deze harness geweigerd. Browsertests blijven op de geïsoleerde lokale sandbox draaien; ze gebruiken geen echte stagingklant.

De databaseclient vertrouwt daarnaast het publieke `scripts/certs/supabase-root-2021.crt`, niet een private sleutel of nieuw secret. Bron: [Supabase-dashboardconfiguratie](https://github.com/supabase/supabase/blob/2cb70302b041b7e080917d5125b731de3de9f2e2/apps/studio/hooks/custom-content/custom-content.json#L63), [officiële CA-download](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt) en [TLS-documentatie](https://supabase.com/docs/guides/platform/ssl-enforcement). `prod` in die downloadnaam duidt Supabase-hosting aan, niet Fieldgrid-productie. Het certificaat verloopt op 26 april 2031; de SHA-256-fingerprint is `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`. Tests bewaken fingerprint, geldigheid en behoud van TLS-instellingen door de driver. Bij verbindingsfouten worden uitsluitend toegestane foutcodes gemeld, nooit de oorspronkelijke fouttekst of credentials.

## Gebruik en beheer

- Open **Werkbonnen** voor de lijst en de zesstapswizard. Dezelfde bon opent vanuit Klant 360, Object 360 en het planbord. Filters en tabblad blijven in de URL behouden.
- Beheer werkbon- en checklisttemplates via **Taken & tarieven → Templates**. Publiceer een versie voordat deze op nieuwe bonnen wordt gebruikt. Een wijziging van een gepubliceerde template maakt een nieuw concept; bestaande bonnen houden hun eigen versie en antwoorden.
- Stel de ondertekenstandaard bij de tenant in. Een object, template of expliciet bevoegde boninstelling kan daarvan afwijken; het rapport toont welke instelling geldt. Een wijziging na vrijgave vereist een reden. Vrijstellen is een afzonderlijke beheeractie, geen vervangende handtekening.
- Wijs medewerkers met eigen intervallen toe. Bij meerdere medewerkers kiest de planner vóór verplaatsen tussen **Alleen deze inzet** en **Het hele bezoek**. De medewerker stopt alleen de eigen tijd; rapportindiening en ondertekening volgen los daarvan.
- Gebruik het bondossier voor splitsen en opvolgen. Alleen resterende scope wordt overgedragen; uitvoering, antwoorden en ondertekening van de bron worden niet gekopieerd. Een duplicaat begint eveneens met een lege uitvoering en vraagt expliciete controle van de commerciële basis.
- Genereer terugkerende bezoeken bewust voor maximaal zes weken. Overgeslagen en handmatig verplaatste bezoeken blijven bij herhalen behouden.
- Vraag bij gewijzigde klantzichtbare uitvoering eerst een rapportcorrectie. Bestaande versies en bewijsbestanden blijven onveranderlijk. Nieuwe interne opmerkingen en private bijlagen blijven mogelijk zonder het aangeboden rapport te veranderen.
- Controleer en keur de actuele rapportversie goed voordat prestaties worden vrijgegeven voor facturatie. Een rapporthandtekening vervangt geen ontbrekend meerwerkakkoord.

## Lokaal opleverbewijs — 30 september 2026

- ESLint, TypeScript en geoptimaliseerde productiebuild: geslaagd.
- Unitcontroles: 31 bestanden, 180 tests geslaagd.
- Database/policies: 228 pgTAP-controles en 105 Node-integratietests geslaagd op een verse database.
- Browser: 33 Chromium-flows geslaagd, inclusief de commerciële keten, alle 360-dossiers, planbord, reistijden, werkbonwizard en templatebeheer. De werkbonflow controleert ook private PNG/PDF-opslag, geautoriseerd downloaden, een herhaalde upload en mobiele breedtes.
- Upgrade: baseline `20260930142326` gevuld met herkenbare historische fixtures; alle vier werkbonmigraties toegepast en behoud van IDs, goedgekeurde uren, bestaande signature/hash, review en prijsbron geverifieerd. Geen historische rapportinhoud of ondertekening verzonnen.
- De dossierketen gebruikt nu echte personeelsauthenticatie voor eigen stop en rapportindiening, gevolgd door backofficegoedkeuring en gedeeltelijke facturatie tegen het afgesproken tarief.
- Database-lint en advisors uitgevoerd: de bestaande volatiliteitswaarschuwing bij `object_visit_context` en zes bestaande Object 360-policyperformancewaarschuwingen blijven gemeld; er zijn geen nieuwe werkbonmeldingen.
- Releasebewijs blijft de exact-SHA GitHub-CI en stagingworkflow, gevolgd door de publieke release-healthcheck. Een lokale geslaagde check is geen claim dat staging al gedeployd is.

## Externe documentatie gecontroleerd

De lokale Next 16.3.6-documentatie voor layouts/pages en servermutaties is gelezen. Supabase RLS en private-storage-documentatie en de changelog zijn geraadpleegd. De PostgreSQL 15.19/17.11-waarschuwing betreft legacy pgcrypto-ciphers, ltree en bepaalde float-GiST-indexen, niet een nieuwe onderteken-API; deze opdracht wijzigt geen databaseversie of cipher. Bronnen: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals), [PostgreSQL changelog](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).
