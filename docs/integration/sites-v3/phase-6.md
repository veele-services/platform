# Managementweekrapport met vaste versies en echte weekplanning

Lokaal geïmplementeerd en getest; niet gedeployed of live geverifieerd. T14 gebruikt `/app/weekrapport`, de route en compositie van de Sites-bron: introductiekaart, planningkaart, actuele kerncijfers, archief, samenstellen, opgeslagen rapport, PDF en planningdialoog. De bestaande rapportcontrole bij werkbonnen blijft een afzonderlijk proces.

## Hergebruik en uitbreiding

| Onderdeel | Keuze | Concrete aansluiting |
| --- | --- | --- |
| Presentatie | Overnemen | `ReportsView` uit `Governance.tsx`, bestaande overgenomen tokens, fonts, cards, tabbladen en dialoogcomponenten. |
| Acties | Uitbreiden | Dezelfde native dossierbranches, afsluitstatussen, oorspronkelijke deadlines en uitstelregels als Opvolging; geen invoker-RPC onder een definer. |
| SLA | Hergebruiken | Werkelijke normversies, unieke bezoeken, bestaande ticketklokken, pauzes en bronautorisatie. Geen verzonnen 100% bij afwezige metingen. |
| Financieel | Hergebruiken | Canonieke factureerbare bronregels, nog te beoordelen uitvoering en resterende definitieve facturen; betalingen tellen uitsluitend in die laatste categorie. |
| Compliance en besluiten | Hergebruiken | Actuele bewijs-, classificatie- en dossierregels en daadwerkelijk vastgestelde besluiten. |
| Rapportversies | Nieuw | Private, onveranderlijke momentopnamen met vaste cijfers, toelichting, peildatum, huisstijl, profiel, bronreferenties en audit. |
| Weekplanning | Uitbreiden | De bestaande achtergrondworker verwerkt begrensde taken met één run per lokale week en één rapport/notificatieverzoek per ontvanger. |
| Berichten | Hergebruiken | Centraal catalogus-/templatebeheer, policy, outbox, in-app, providerlease en de bestaande globale maildienst. Geen extra mailconfiguratie. |

## Werkelijke cijfers en afscherming

De server bepaalt alle cijfers binnen één consistente bronprojectie. De browser levert uitsluitend periodetitel en toelichting. De titel is een omschrijving, geen historisch transactiefilter. Versies krijgen onder een tenantlock een opeenvolgend nummer; identieke herhaalverzoeken leveren hetzelfde rapport op. De private tabellen hebben geforceerde RLS en geen rechtstreekse grants voor anon, authenticated of service_role. Een opgeslagen rapport kan niet worden gewijzigd of verwijderd via de applicatie.

Achtergrondverwerking gebruikt expliciete, actuele gebruikers-, lidmaatschaps-, profiel-, module- en bronrechten. Er worden geen gebruikers-JWT's of eigenaarsrollen gefabriceerd. De interne projecties zijn met de bestaande native autorisatie vergeleken, inclusief verschillende compatibiliteitsrollen en ingetrokken capabilities. Bij rapporten worden de gebruiker van het toegangsprofiel en de werkelijk initiërende gebruiker afzonderlijk vastgelegd. Een systeemtaak heeft geen menselijke actor; de echte systeemactie krijgt een eigen auditrecord. De voorwaartse metadatareconciliatie gebruikt uitsluitend de oorspronkelijke handmatige auditbewijzen en verandert geen snapshot, datum, versie of broninformatie.

Archief en PDF vereisen de huidige rapportrechten en het daadwerkelijke profiel, de huidige eigenaar of de oorspronkelijke profielgebruiker. De vastgelegde leesrechten en classificatie moeten nog toegestaan zijn. Concrete ticketreferenties worden opnieuw via de bestaande ticketautorisatie gecontroleerd; dezelfde rolnaam geeft geen toegang tot afgeschermde tickets. Verminderde rechten kunnen een oude bredere rapportversie afschermen. De PDF-route controleert de toegang opnieuw na het renderen, gebruikt de vaste huisstijl/tijdstempel en geeft alleen private, niet te cachen bytes terug. Geopende privé-informatie verdwijnt bij ingetrokken toegang.

## Planning en aflevering

Alleen de huidige eigenaar beheert dag, tijd en doelgroep. Planning heeft revisies en volgt de tenanttijdzone. De volgende uitvoering ligt in de toekomst; zomer- en wintertijd leveren één lokale weekuitvoering op. Meerdere workers kunnen geen dubbele weekrun of ontvangersnapshot maken. Aanpassen/uitschakelen annuleert nog niet uitgevoerde taken. Een voormalige eigenaar kan een planning niet laten doorlopen zonder beoordeling door de huidige eigenaar.

Iedere ontvanger krijgt een eigen momentopname binnen de actuele rechten. De melding bevat alleen een beveiligde link, geen financiële/HR-cijfers en geen PDF-bijlage. Werkelijk klaarzetten, centrale voorbereiding, in-app aflevering en actuele broncontrole zijn afzonderlijk getest. Een aangemaakt notificatieverzoek bewijst geen externe mailbezorging. De bestaande worker verzorgt daarvoor de bestaande centrale transport- en providercontroles, inclusief voorkeuren, uitstel en onzekere aflevering. Een ingetrokken rapportrecht sluit ook de inbox-RPC, rechtstreekse notificatie-RLS en de actielink af.

## Visuele en functionele verificatie

De gekoppelde browser gebruikt echte lokale Supabase Auth, SSR, API, Data API voor de servicejob, opgeslagen rapporten, herladen, een reproduceerbare echte PDF en browserdownload. Bron en implementatie zijn op 1440, 768 en 390 px vastgelegd en bekeken, met afzonderlijke vensters voor samenstellen, rapport en planning.

De screenshotcontrole gebruikt rechtstreeks Chrome CDP. De tijdelijke screenshotstylesheet van Playwright kon in de nonce-beveiligde applicatie een geladen Poppins-lettertype vervangen door het systeemlettertype. De rechtstreekse opname injecteert geen stijlen en wijzigt geen inhoud of afmetingen. Dit herstelt de meetmethode; een koude productiebuild en de definitieve volledige shellvergelijking blijven aparte releasecontroles.

Noodzakelijke, minimale integratieverschillen: de demonstratiedatum en -cijfers zijn actuele geautoriseerde gegevens; zonder afspraken verschijnt een streep met uitleg; teksten over lokale simulatie zijn vervangen door de echte planning en aflevering; echte fout-/rechtencontrole en archiefpaginatie zijn toegevoegd. De periodetitel wordt niet als historisch filter voorgesteld. Het overzicht en de overige 105 scope-rijen houden hun afzonderlijke acceptatiegrens.

Zie `evidence/phase-6/` voor de actuele testuitvoer, bekeken bronparen en functionele vensters. Migraties 157–160 zijn uitsluitend op de geïdentificeerde lokale stack vastgelegd/toegepast. De oorspronkelijke 138 baselinemigraties zijn ongewijzigd. Volledige replay/upgrade, definitieve beveiligingsinventarisatie en de overige schermen blijven vereist vóór release.
