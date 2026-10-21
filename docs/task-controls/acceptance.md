# Acceptatiematrix taakgerichte controles

Bronbasis: `7398d6cb7f2a2cf75eb22a8b33aa7726fa827eb6`.
Deze matrix verwijst naar echte database- en browsercontroles. De CI-run blijft
de vereiste releasegate voor de uiteindelijke commit. A40 wordt pas afgerond met
de workflow- en healthcheckuitkomst; lokale acceptatie is geen deploybevestiging.

DB-suite: `scripts/test-task-controls.mjs`. Concurrency-suite:
`scripts/test-task-controls-concurrency.mjs`. Beide draaien tegen de bestaande
begrensde lokale harness; productdata en staging krijgen geen fictieve seed.
De volledige bestaande `pnpm test:db`-keten blijft verplicht.

| ID | Vereiste | Resultaat | Controle en bewijs |
| --- | --- | --- | --- |
| A01 | Een oude eenvoudige taak en oude werkbon zonder nieuwe configuratie blijven correct werken. | Geslaagd in gerichte lokale verificatie; CI vereist | Oude catalogus/werkbon + historische upgrade; `scripts/test-task-catalogue.mjs`, `scripts/test-work-orders.mjs`, `scripts/test-work-orders-upgrade.mjs`. |
| A02 | Nieuwe taakconfiguratie is bereikbaar vanuit het actuele `/app/taken`; wijzigingen zijn na verversen opgeslagen. | Geslaagd in gerichte lokale verificatie; CI vereist | Native editor en opgeslagen configuratie; `tests/e2e/task-controls.spec.ts`, `catalogue-*.png`. |
| A03 | Een omschrijving via het verkorte taakdetail aanpassen wist geen uitvoeringsconfiguratie of checklistbinding. | Geslaagd in gerichte lokale verificatie; CI vereist | Verkorte omschrijvingsmutatie en immutable revisie; `scripts/test-task-controls.mjs`. |
| A04 | Algemene, hoeveelheid-, ruimte- en itemtaak gebruiken dezelfde catalogus en werkbonketen. | Geslaagd in gerichte lokale verificatie; CI vereist | Vier toepassingsvormen door native save_work_order; `scripts/test-task-controls.mjs`. |
| A05 | 450 m² genereert één taak/eindcontrole; normberekening is 90 minuten, geen 450 formulieren. | Geslaagd in gerichte lokale verificatie; CI vereist | Opgeslagen 450 m² / 0,2 min per m² / één eindcontrole; dezelfde DB-suite. |
| A06 | Drie ruimtes krijgen drie onafhankelijke checklists; ontbrekende toegang houdt de juiste restscope open. | Geslaagd in gerichte lokale verificatie; CI vereist | Drie instanties, 300/450 m² en niet-toegankelijke ruimte; DB-suite en `staff-cleaning-*.png`. |
| A07 | Acht apparaten krijgen acht onafhankelijke instanties van dezelfde checklistversie. | Geslaagd in gerichte lokale verificatie; CI vereist | Acht verschillende checklist-ID’s op dezelfde revisie; DB-suite en servicebrowserketen. |
| A08 | Meer dan 20 doelen werkt met gepagineerde uitvoering zonder de oude bonchecklistlimiet te misbruiken. | Geslaagd in gerichte lokale verificatie; CI vereist | Dertig doelen, pagina’s van 25/5 checklists; DB-suite. |
| A09 | Verkeerde/ontbrekende modelvariant wordt niet stil gekoppeld aan een willekeurige checklist. | Geslaagd in gerichte lokale verificatie; CI vereist | Ontbrekende modelvariant geweigerd; expliciete variant met eigen norm/checklist opgeslagen; DB-suite. |
| A10 | Taak-, variant-, checklist-, norm- en doelsnapshots blijven gelijk na latere catalogus-/itemwijzigingen. | Geslaagd in gerichte lokale verificatie; CI vereist | Bevroren norm-/variant-/item- en rapportsnapshots na catalogus- en locatiewijziging; DB-suite. |
| A11 | Uitgevoerde afgekeurde inspectie en niet uitgevoerde inspectie hebben verschillende status/volume/rapportuitkomst. | Geslaagd in gerichte lokale verificatie; CI vereist | Afgekeurd telt uitgevoerd; niet toegankelijk houdt restscope open; DB-suite en personeelsbrowserketens. |
| A12 | Verplichte en conditionele antwoorden, n.v.t.-reden en doelgebonden bewijs worden serverzijdig afgedwongen. | Geslaagd in gerichte lokale verificatie; CI vereist | RPC-controle van verplichte/conditionele antwoorden, technische limieten en doelbewijs; DB-suite en bestaande rapport/checklistregressies. |
| A13 | Eén extra item verhoogt de actuele begroting van 270 naar 300 minuten; twee extra items verhogen haar naar 330. De oorspronkelijke scope en begroting blijven bewaard. | Geslaagd in gerichte lokale verificatie; CI vereist | Eerst 300 en daarna 330 actueel, 270 oorspronkelijk; opgeslagen native begroting in DB-suite. |
| A14 | Een nieuwe reparatietaak op hetzelfde item blijft afzonderlijk van het toevoegen van een inspectiedoel. | Geslaagd in gerichte lokale verificatie; CI vereist | Afzonderlijke reparatie- en inspectietaak op hetzelfde stabiele item; scan/contexttest in DB-suite. |
| A15 | Herhaalde scan of command maakt geen dubbele doelen, uren, uitvoering, meerwerk of rapportregels. | Geslaagd in gerichte lokale verificatie; CI vereist | Gelijke scan schrijft niets; dubbele doelcommand gebruikt één receipt; DB-suite en concurrency-suite. |
| A16 | Twee passende taken bij één gescand item vragen de juiste keuze; QR verleent geen toegang. | Geslaagd in gerichte lokale verificatie; CI vereist | Twee taken voor dezelfde scan, expliciete keuze en vreemde tenant/ongepubliceerde inzet geweigerd; DB-suite. |
| A17 | Onbekend item kan bevoegd geregistreerd worden; mogelijke dubbel wordt getoond; vreemde tenant is niet uitleesbaar. | Geslaagd in gerichte lokale verificatie; CI vereist | Registratie, dubbele serienummercontrole en vreemde contextdenials; DB-suite; Object 360 Items. |
| A18 | Dezelfde medewerker kan op twee dagen dezelfde bon/taak vervolgen zonder afgesloten dagen te herschrijven. | Geslaagd in gerichte lokale verificatie; CI vereist | Historisch gesloten segment + nieuwe eigen sessie op dezelfde assignment/taak; DB-suite. |
| A19 | Persoonlijk afmelden laat collega, taakrestant en bon open; opleveren blijft een afzonderlijk gecontroleerd commando. | Geslaagd in gerichte lokale verificatie; CI vereist | Persoonlijk sluiten houdt collega en bon open; echte gezamenlijke stop/rapportindiening apart getest; DB-suite. |
| A20 | Taak-/itemwissel en pauze leveren geen overlappende of dubbel getelde arbeidsminuten. | Geslaagd in gerichte lokale verificatie; CI vereist | Atomische allocatiewissel, pauze/hervatten en één actieve bron bij concurrente starts; DB- en concurrency-suite. |
| A21 | Twee medewerkers × 30 minuten = 60 arbeidsminuten; plan-/bezoekduur blijft afzonderlijk. | Geslaagd in gerichte lokale verificatie; CI vereist | Arbeidsminuten van twee medewerkers opgeteld zonder bezoekduur te vermenigvuldigen; `lib/staff/task-time.test.ts` en DB-sessies. |
| A22 | Middernacht en beide klokwisselingen werken in Europe/Amsterdam met juiste totalen en dagtoerekening. | Geslaagd in gerichte lokale verificatie; CI vereist | Lokale dagknippen over middernacht en 23/25-uursdagen; `lib/staff/task-time.test.ts`, bestaande planningtijdtests en echte browseropslag van beide wintertijdmomenten (`visit-wintertime-390.png`). |
| A23 | Allocaties overschrijden bronuren niet; ontbrekende toerekening blijft zichtbaar als onbekend. | Geslaagd in gerichte lokale verificatie; CI vereist | Bronoverschrijding geweigerd; gesloten allocaties binnen bron en niet-toegerekende tijd zichtbaar; DB-suite. |
| A24 | Batch, direct gemeten en geschat worden onderscheiden; tien afgeleide tijden zijn geen tien onafhankelijke samples. | Geslaagd in gerichte lokale verificatie; CI vereist | Twee batchsegmenten worden één sample, schatting uitgesloten en directe metingen apart; DB-suite. |
| A25 | Fixture berekent 42 metingen / 18 bonnen, som 1522, gemiddelde 36,2, mediaan 34,5 en voorstel 35; acht bedmetingen geven onvoldoende data. | Geslaagd in gerichte lokale verificatie; CI vereist | Echte opslag van fixture: 42/18/1522, mediaan 34,5, voorstel 35; acht bedmetingen onvoldoende; DB-suite en `norm-*.png`. |
| A26 | Metingen van tenant B beïnvloeden het voorstel van tenant A niet, ook niet via directe requests of caching. | Geslaagd in gerichte lokale verificatie; CI vereist | Twintig afwijkende tenant-B-metingen met dezelfde sleutel wijzigen tenant-A-hash/som niet; directe vreemde taaklezing geweigerd; DB-suite. |
| A27 | Alleen een bevoegde gebruiker beslist met reden/ingangsdatum; de toekomstige norm verandert de huidige bon of prijs niet. | Geslaagd in gerichte lokale verificatie; CI vereist | Cap-/staffdenials, dataset-/versie-CAS en toekomstige norm met reden; DB- en concurrency-suite. |
| A28 | Een nieuwe bon vanaf 21 november begroot 310 minuten voor 8 items + 30 minuten algemeen; de bestaande bon blijft 270/330 minuten. | Geslaagd in gerichte lokale verificatie; CI vereist | Nieuwe toepassing op 22 november: 310 minuten; bestaande begroting blijft gelijk; DB-suite. |
| A29 | Afwijzen/uitstellen en gelijktijdig beslissen behouden historie en voorkomen dubbel/conflicterend besluit. | Geslaagd in gerichte lokale verificatie; CI vereist | Afwijzen/uitstellen behouden twee besluiten; gelijktijdig besluiten heeft één winnaar; DB- en concurrency-suite. |
| A30 | Wekelijkse reiniging en halfjaarlijkse inspectie van hetzelfde item behouden onafhankelijke cycli. | Geslaagd in gerichte lokale verificatie; CI vereist | Wekelijkse reiniging en zesmaandelijkse inspectie met dezelfde item-ID maar afzonderlijke taakselecties; DB-suite. |
| A31 | Herhaalde generatie maakt één occurrence; gemiste/overgeslagen en handmatig verplaatste bezoeken blijven bewaard. | Geslaagd in gerichte lokale verificatie; CI vereist | Herhaalde native generatie maakt geen duplicaat; oude lineage/operationele tests bewaren skips en lokale wijzigingen; DB-suite. |
| A32 | Extra scope/materialen/norm verhogen niet automatisch factuurprijs; bestaande allocaties blijven eenmaal. | Geslaagd in gerichte lokale verificatie; CI vereist | Echte rapportindiening/review/factuur: extra doelen zonder prijsakkoord geweigerd, na acceptatie eenmaal tegen oud tarief; materiaal/lineage/commerciële regressies. |
| A33 | Ondertekend rapport verandert niet door hernoemen/verplaatsen, nieuwe checklist of nieuwe norm. | Geslaagd in gerichte lokale verificatie; CI vereist | Opgeslagen doelrapport/hash gelijk na hernoemen/verplaatsen; bestaande echte signature- en PDF-regressies; DB-suite en `scripts/test-work-order-reports.mjs`. |
| A34 | Personeel en klant ontvangen geen ongeautoriseerde collega-antwoorden, interne notities, tarieven of normanalytics. | Geslaagd in gerichte lokale verificatie; CI vereist | Eigen antwoorden/gedeelde voortgang, verborgen bevinding ontbreekt in rapport; norm-/tenantdenials en bestaande klant/personeel-privacyregressies. |
| A35 | Een verouderde versie, retry, gewijzigde payload en gelijktijdige afronding geven gecontroleerde uitkomsten, geen dataverlies. | Geslaagd in gerichte lokale verificatie; CI vereist | Stale antwoord-/uitvoeringsversie en gewijzigde retry-payload geweigerd; echte concurrente requests; DB- en concurrency-suite. |
| A36 | Directe API/RPC-paden weigeren onbevoegde rol, ingetrokken inzet, verkeerd object en vreemde tenant. | Geslaagd in gerichte lokale verificatie; CI vereist | Directe RPC-/tabel-/kolomdenials, verkeerde context en sessie ingetrokken tijdens lockwait; DB-/concurrency-/securitycatalogussuites. |
| A37 | Schoonmaak en service zijn op 320/390/768/1440 px via bestaande schermen volledig bruikbaar. | Geslaagd in gerichte lokale verificatie; CI vereist | Acht native browserketens op 320/390/768/1440 px en een extra wintertijdcase, met lange namen, opgeslagen uitkomsten en controle op horizontale overflow; 25 screenshots in `evidence/`. |
| A38 | Er staat geen apart onderhoudsmenu in de personeelsapp; keyboard/focus/labels/modals werken. | Geslaagd in gerichte lokale verificatie; CI vereist | Bestaande werkbonmodal en Werkzaamheden → Open taak → Open controles; native tabs, labels en modalcomponenten; browserketens en bestaande toegankelijkheidsregressies. |
| A39 | Verse installatie én upgrade met oude uren, signatures, prijzen en factuurbronnen behouden integriteit. | Geslaagd in gerichte lokale verificatie; CI vereist | Schone 182-migratiereplay; upgrades vanaf 20260930142326, 20260930192516 en 20261001042234; historische handtekening/uren/review, meldingen en platformbevoegdheden behouden. |
| A40 | CI en staging draaien exact de gereviewde SHA; de publieke healthcheck bevestigt deze; productie is niet gewijzigd. | Releasegate — bevestiging in opleverbericht | Releasegate: gereviewde main-SHA bewust naar staging promoveren; bestaande workflow moet slagen en publieke healthcheck moet exact dezelfde SHA melden. Definitieve run/SHA/health-uitkomst staat in het opleverbericht. |

## Browserbewijs en beoordeling

De PNG's in [evidence](evidence/) zijn uit de actuele native applicatie met
fictieve lokale tenants. Per breedte zijn er catalogue-, service-, cleaning-,
staff-service-, staff-cleaning- en normbeelden. De aangehechte editor-/detailtabs,
de bestaande branding en de mobiele taak → doel-weergave volgen de PDF. Normen
zijn uit opgeslagen bronmetingen berekend; de UI toont geen hardcoded statistiek.
Personeel heeft geen nieuw onderhoudsmenu. De camera gebruikt browserondersteuning
met een invoerfallback; een fysieke camera is niet op alle browsers beschikbaar.

## Verificatie en beperkingen

De bestaande verplichte workflow voert audit, lint, typecheck, unit-, echte
DB-/policy-, oude upgrade-, authorization-surface/-review-, HTTP-security-,
database-lint/-advisor-, build-, standalone- en Playwrightcontroles uit.
De migratiemanifestcontrole vergelijkt 179 ongewijzigde historische hashes plus
de drie nieuwe native CLI-statementhashes. Er is geen gate of policy afgezwakt.

Volledige offline synchronisatie is niet toegevoegd. Invoer en herhaalsleutel
blijven behouden zolang het formulier open blijft; lokaal niet-bevestigde
uitvoering is geen opgeslagen serverresultaat. Offertebezoeken behouden de
geaccepteerde scope en falen bij een ambiguë bron of gedeeltelijke commerciële
cyclus, zodat de planner een expliciete bronafspraak kan maken.

Zie [architectuur](../architecture/task-controls.md),
[gebruiksinstructie](gebruik.md) en
[autorisatiereview](../security/task-controls-authorization-review.md).
Productiebranches, infrastructuur, databases, credentials en hosting worden
binnen deze opdracht niet gewijzigd.
