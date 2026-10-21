# Taakgerichte controles en norminzichten

Deze uitbreiding bouwt op main `7398d6cb7f2a2cf75eb22a8b33aa7726fa827eb6`.
Het [stagingcontract](staging.md), de bestaande autorisatie en het afzonderlijke
productiecontract blijven leidend. Er veranderen geen origins, poorten,
credentials, services, runners of publicatievoorwaarden.

## Bronnen en toepassing

De bestaande taakcatalogus en immutable `task_revisions` blijven de bron.
`execution_config` bevat de toepassingsvorm (eenmaal, hoeveelheid, objectnodes
of geregistreerde items), normbasis, expliciete modelvarianten, checklistbinding,
identificatie/bewijs en kwalificaties. Kwalificaties worden aan de bestaande
`qualification_requirements` gekoppeld. Een verkorte omschrijvingsmutatie bewaart
weggelaten configuratie en eenheid. `square_metre` en `room` vullen de bestaande
eenheden aan. Oude revisies met `{}` krijgen geen verzonnen itemidentiteiten of
metingen; hun bestaande hoeveelheids-/uitvoeringsgedrag blijft behouden.

De native werkbonwizard en `save_work_order` leggen de taak-, variant-, norm- en
checklistversies vast. Normen gelden op de concrete toepassingsdatum. Voor
ruimtes/items volgt het volume uit concrete doelen; oppervlakte per ruimte kan
een eigen hoeveelheid hebben. De berekening gebruikt PostgreSQL numeric zonder
afronding per tussenstap. Een oorspronkelijke begroting blijft onveranderlijk;
de actuele begroting volgt de nog op deze bon beheerde scope. Personeelsaantal
vermenigvuldigt de taakprestatie niet.

## Doelen, checklists en historie

Private tenantgebonden tabellen bewaren items, locatiegeschiedenis, doelen en
controlerondes. Samengestelde FK's binden tenant, bon, taak, doel en uitvoering.
Iedere ronde krijgt onafhankelijke instanties uit de bestaande checklistengine.
De unieke bonbrede checklistbinding blijft apart bestaan: de twintiglimiet is
geen limiet op apparaten. Contextlezingen leveren maximaal 25 doelen en alleen
de bijbehorende checklists; oorspronkelijke selectie is begrensd op 5.000,
uitbreiding op 500 per commando.

Uitvoering, technische uitkomst en opvolging zijn afzonderlijk. Een uitgevoerde
afgekeurde controle telt als uitgevoerd. Niet bereikbaar/n.v.t. vereist een
reden en houdt restscope open totdat die wordt uitgevoerd, overgedragen of
bevoegd ingetrokken. Een hercontrole maakt een nieuwe ronde en bewaart oude
antwoorden en auteurs. Scopeoverdracht gebruikt de bestaande deel-/opvolgbon,
selecteert concrete onuitgevoerde doelen en verbindt bron en ontvanger; uren en
antwoorden worden niet gekopieerd. Intrekking en overdracht blijven zichtbaar
in de rapportbron. Stabiele item-ID's overleven hernoemen, verplaatsen en
archiveren. Een fysieke vervanger krijgt een nieuwe identiteit met expliciete
verwijzing naar zijn voorganger. Serienummers zijn zoekkenmerken, niet uniek.

QR bevat alleen de item-UUID. Een scan is een geautoriseerde lezing binnen de
actuele bon: meerdere passende taken vragen een keuze, onbekende gegevens
geven geen uitvoering of autoriteit. Scannen start geen timer of scope-mutatie.
Cameraondersteuning is optioneel; invoeren/zoeken blijft beschikbaar.

## Bezoeken, bronuren en planning

De unieke assignment per bon/medewerker, dispatches en `time_entries` blijven
behouden. Bezoeken hebben een tijdvak en concrete bezetting uit die bestaande
inzet. Persoonlijke sessies vormen nieuwe dagsegmenten. Starten vereist de
actuele eigen dispatch en bezoekdag in de tenanttijdzone. Afmelden sluit alleen
de eigen sessie en bronuren; collega, restscope en gezamenlijke oplevering
blijven open. Een afgesloten segment wordt niet opnieuw geopend. De bestaande
bijdrage-/delivery-owner-/rapport- en handtekeningvoorwaarden blijven gelden.

Bezoekplanning controleert actieve inzet, harde kwalificaties, afwezigheid en
zowel gewone opdrachten als andere bezoeken op overlap. Gestarte dagen blijven
vast; toekomstige ongestarte bezoeken kunnen met reden en versiecontrole worden
verplaatst of geannuleerd. Planbord en personeelsdagplanning projecteren de
bezoeken op dezelfde bon-ID. De oude volledige bonplanning kan een bezoekketen
niet overschrijven. De oorspronkelijke assignment wordt niet door de oude
live-planningsreflow tot één meerdaags interval samengevoegd.

Een allocatie verwijst naar eigen bestaande arbeidsuren en eventueel een
concrete controleronde. Wisselen sluit de vorige allocatie atomisch. Overlap,
verkeerde context en overschrijding van bronuren worden geweigerd. Pauze sluit
arbeidstoerekening; reis en pauze blijven hun bestaande soorten bronuren.
Niet toegerekende tijd blijft zichtbaar. Direct, batch en schatting zijn
verschillende methoden. Een segment langer dan twaalf uur vraagt beoordeling;
een open timer is nooit een geldige normmeting. Dagprojectie splitst bestaande
UTC-intervallen bij lokale middernacht, inclusief dagen van 23 en 25 uur.

## Normbesluiten en commercie

Normanalyse gebruikt uitsluitend de eigen tenant en dezelfde taak, methode,
variant, eenheid en normbasis. Alleen afgeronde, complete uitvoering met gesloten,
goedgekeurde bronuren en geldige meetkwaliteit telt mee. Segmenten en bijdragen
van medewerkers worden per werkbontaak/doel/controleronde samengevoegd; batch en
directe metingen worden afzonderlijk beoordeeld, schattingen uitgesloten.
Tien apparaten in één batch leveren geen tien onafhankelijke samples op.
Bronbonnen, uitsluitredenen, aantallen, spreiding en onderbouwing blijven zichtbaar.

Tenantinstellingen zijn versiegebonden: standaard 180 dagen, twintig directe
metingen op tien bonnen, afzonderlijk twintig batches op tien bonnen, minimaal
10% en twee minuten verschil, afronding op hele minuten. Een verlaging met
relevante afwijkingen wordt niet automatisch voorgesteld. Een besluit bewaart
actor, reden, dataset/hash en toekomstige ingangs- of herbeoordelingsdatum.
Afwijzing en uitstel bewaren historie. Hetzelfde datasetbesluit is beschermd
tegen concurrentie; uitstel kan vanaf de herbeoordelingsdatum opnieuw beoordeeld
worden. Nieuwe normen wijzigen geen bestaande bon of prijs.

Extra doelen veranderen de operationele begroting en geven geen automatisch
factuurrecht. De nieuwe commerciële hoeveelheid kan alleen via expliciete
financiële beoordeling worden geaccepteerd; offertes/contracten volgen hun
bestaande gewijzigde afspraak. Factuurallocatie controleert de oorspronkelijke
scopebron, ook over deelbonnen heen. Materiaal blijft de bestaande registratie
met optionele taak-/doelbinding, catalogussnapshot en aparte commerciële review.
Er komt geen tweede urenboek, voorraadmodule, catalogus of scheduler.

De huidige reekscommand én de bestaande worker-generator bewaren geselecteerde
taak-ID's en hun concrete doelen. Iedere occurrence gebruikt de eigen normdatum.
Wekelijkse reiniging en halfjaarlijkse controle zijn onafhankelijke bestaande
reeksen. Overgeslagen, mislukte en handmatig gewijzigde occurrences blijven
behouden. Offertebezoeken behouden hun geaccepteerde scope; ambiguë bronregels
of een poging slechts een deel van die commerciële scope te genereren falen
met een controleerbare generatie-uitzondering.

## Autorisatie en vrijgave

| Handeling | Bestaande bevoegdheid en context |
| --- | --- |
| Taakconfiguratie/normen | `backoffice.tasks.read/write` + `task_catalogue`/`task_catalogue_command`, planningmodule, actieve sessie |
| Items lezen/beheren | `backoffice.objects.read/write` + `object_dossier`/`save_object_dossier`, concrete tenant/klant/object |
| Werkbonselectie/extra scope | `backoffice.work_orders.write` + `save_work_order`, geldige bon en bewerkbare rapportstatus |
| Controles | Bestaande `record_task_execution`-bevoegdheid, of eigen actuele dispatch/inzet/actieve bezoeksessie |
| Bezoekplanning | Bestaande werkbon-schrijf- en `change_work_order_planning`-bevoegdheid |
| Extra prijsakkoord | Bestaande commerciële/finance-schrijfbevoegdheid en expliciet afspraakbewijs |
| Hercontrole/rapportcorrectie | Bevoegd beheer; nieuwe ronde of bestaande gecontroleerde rapportcorrectie |

Private tabellen hebben forced RLS en geen rechtstreekse API-grants, ook niet
voor service_role. Publieke RPC's zijn uitsluitend aan authenticated verleend
en controleren opnieuw sessie, module, capabilities, tenant en object/bon.
Na transactielock worden actuele bevoegdheden opnieuw gecontroleerd. Nieuwe
bevroren werkbontaakkolommen hebben geen directe authenticated insert/update;
oude formulieren behouden hun bestaande kolomrechten. Directe revisie-insert
valideert eveneens configuratie en eenheid.

Medewerkers ontvangen gedeelde voortgang en eigen antwoorden, zonder
collega-antwoorden, verborgen bevindingen, tarieven of normanalyse. Item-360 is
voor personeel beperkt tot de actuele eigen boncontext. Klanten ontvangen de
bestaande vrijgegeven rapportprojectie en bindingscontrole. Het bestaande
rapportversie/hash/handtekening/PDF-mechanisme bewaart klantveilige doelnotities,
versies, uitzonderingen en toegestaan materiaal. Interne bevindingen en auteurs
worden niet automatisch klantzichtbaar.

Volledige offline synchronisatie is niet toegevoegd. Een mislukte/netwerkmutatie
krijgt geen succesmelding; het formulier behoudt invoer en herhaalsleutel zolang
het geopend blijft. Er is geen belofte van duurzaam opgeslagen offline uitvoering.

De forward migration is `20261020234321_task_execution_controls.sql`; toegepaste
migraties blijven onveranderd. Fresh/upgrade, API-/policy-, concurrency-, rapport-,
financiële en browsercontroles staan in de [acceptatiematrix](../task-controls/acceptance.md).
Promotie blijft uitsluitend de bestaande gereviewde main → staging-route met
exacte SHA-controle. Deze opdracht voert geen productiepromotie uit.
