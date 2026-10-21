# Taakgerichte controles — delta en uitvoering

Bron: `7398d6cb7f2a2cf75eb22a8b33aa7726fa827eb6` (main en staging op 21 oktober 2026). De opgehaalde main bevat geen verschillen ten opzichte van de overdracht. Productie is buiten scope.

| Bestaande bron | Hergebruik | Uitbreiding | Verificatie |
| --- | --- | --- | --- |
| `/app/taken`, `SitesTasksList`, `CatalogueDialog`, `task_catalogue_command` | Catalogus, nummering, rechten, revisies en retries | Uitvoeringsconfiguratie, eenheid/normbasis, gepubliceerde checklistbinding en drie aangehechte tabs | Opslag, immutable revisies, verkorte omschrijvingsmutatie en financiële grenzen |
| `save_work_order`, wizard, `work_order_tasks` | Klant/object, commerciële bron, taak-ID, scopes en planning | Serverberekende norm/snapshots, concrete doelkoppelingen en oorspronkelijke/actuele begroting | Schoonmaak 135 min, service 270/330 min, niet afgeronde tussenstappen |
| `work_order_checklists`, antwoorden, template-editor | Vaste vragenversie, voorwaarden, bewijs en afgeschermde antwoorden | Afzonderlijke bon-, taak- en doelinstanties met eigen unieke sleutels | Acht en >20 onafhankelijke instanties, versieconflicten en n.v.t. |
| Object 360 en objectnodes | Klant/object/ruimte-identiteit en toegangsgrenzen | Stabiele items, historie, zoeken en contextuele selectie | Verplaatsen/archiveren, dubbele serienummers, tenantdenials |
| Personeelswerkbon en `record_task_execution` | Bestaande modal, samenwerking, taakresultaten en rapportoplevering | Uitvoering per doel met gescheiden uitkomst/opvolging | Uitgevoerd-afgekeurd versus niet bereikbaar; rapportblokkades |
| Assignments, dispatches en `time_entries` | Eén assignment per medewerker/bon, bronuren en delivery-owner | Bezoeken/persoonlijke dagsegmenten en brongebonden allocatie | Collega-onafhankelijk sluiten, tweede dag, overlap en DST |
| Contract-/herhaalketen | Begrensde generatie, occurrence en uitzonderingen | Taakgebonden selecties en cycli | Idempotente generatie en onafhankelijke taakcycli |
| Rapportversies, hash, PDF en financiële allocaties | Bestaande klantprojectie, ondertekening, review en prijsbron | Klantveilige doel-/versiesnapshots | Snapshot na hernoemen/verplaatsen; geen dubbele facturatie |
| Tenanttaakdetail | Eén gezaghebbende norm | Vergelijkbare bronmetingen, statistieken, besluiten en toekomstige normversies | Exacte fixture, minimumvoorwaarden, bronversie en toekomstige datum |

## Ontwerpgrenzen

Nieuwe gegevens gebruiken samengestelde tenant-FK's, beperkte projecties en bestaande functiepermissies. Nieuwe private tabellen krijgen RLS en geen directe API-grants. Commands valideren sessie, module, context, versie en payloadgebonden herhaalsleutel. Er komt geen tweede catalogus, urenboek, personeelsmenu of scheduler. Historische gegevens worden niet als itemmetingen geïnterpreteerd. Onbekende modellen kiezen nooit stil een variant.

Normgrondslag blijft gescheiden van prijsgrondslag. Een doelcontrole kan uitgevoerd zijn met een afwijking; niet-uitvoerbare scope telt niet als gecontroleerd. Oorspronkelijke scope en normbegroting blijven vast. Persoonlijke dagafmelding blijft gescheiden van definitieve bijdrage en gezamenlijke oplevering.

Release via bestaande main-review en stagingpromotie. Geen bestaande migratie wijzigen, tenantdatabase resetten, productie promoveren of infrastructuur aanpassen. Alle A01–A40 criteria worden afzonderlijk beoordeeld; ontbrekend bewijs wordt niet als geslaagd geregistreerd.
