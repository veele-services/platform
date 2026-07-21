# Quality & Checklists

## 1. Domeinmodel en levenscyclus

Fieldgrid gebruikt `assignment` als canonieke werkbon. `assignment_tasks` blijft de
bestaande werkomvang; dynamische kwaliteitscontrole staat ernaast als de module
`quality` en hergebruikt dezelfde assignment-, tenant-, personeels- en auditcanon.

Een `checklist_template` is een stabiele familie. Iedere publicatie levert een
onveranderlijke `checklist_template_version` met stabiele sectie- en item-ID's.
Een contextuele `checklist_binding` verwijst naar de nieuwste gepubliceerde of
een gepinde versie. Resolutie maakt een `assignment_checklist`: een volledige
snapshot van versie, inhoud, effectieve regels en cardinaliteitskey. Iedere
bijdragende binding blijft apart zichtbaar in `assignment_checklist_sources`.
Antwoorden en bewijs verwijzen naar een snapshotitem-ID, niet naar een label of
arraypositie.

Voor feitelijke start mag de centrale reconciliatieservice snapshots atomair
maken, aanpassen of soft-annuleren. `in_progress`, `actual_started_at` of een
checklistlock schakelt automatische compositiemutatie uit. Een wijziging wordt
dan `pending_review`; antwoorden en bewijs blijven staan. Bij afronden worden
actieve snapshots `completed`. Bij annuleren worden actieve snapshots
`cancelled`. Gepubliceerde versies en terminale historie kunnen niet via normale
paden worden gewijzigd of verwijderd.

Onmiddellijk vóór starten wordt de set gereconcilieerd en worden uitsluitend
`before_start`-verplichtingen server-side gevalideerd. De canonieke
participant-starttransactie zet daarna `actual_started_at`/`in_progress` en is
daarmee de feitelijke snapshotlock. Een mislukte of conflicterende start laat dus
geen voortijdige `locked_at` achter. Afronden en rapportindiening valideren elk
hun eigen geconfigureerde blokkeermoment. Omdat rapportindiening in Fieldgrid na
de immutable `completed`-overgang plaatsvindt, valideert afronden daarnaast ook
`before_report_submit`; de rapportactie controleert die vastgelegde uitkomst
daarna nogmaals read-only.

## 2. Prioriteitsmatrix

| Prioriteit | Context |
|---:|---|
| 1000 | handmatige binding op een concrete assignment |
| 900 | twee of meer tegelijk matchende selectors |
| 800 | specifiek object |
| 700 | tenanttaakcode of taakcode |
| 600 | klant |
| 500 | `objects.service_type` (canonieke objecttypewaarde) |
| 400 | sector |
| 300 | tenantstandaard zonder selector |

Binnen niveau 900 wint meer specificiteit. Een tie-breaker werkt alleen binnen
hetzelfde prioriteitsniveau en kan de hiërarchie niet passeren. Daarna zorgen
`created_at` en ID uitsluitend voor stabiele presentatie. Bij een exact gelijk
add/suppress-conflict blijft add veilig actief en ontstaat een persistente
configuratiewaarschuwing.

## 3. Merge-, replace- en suppress-algoritme

`resolveChecklistComposition` is de enige inhoudelijke resolver voor runtime én
preview:

1. valideer tenant, geldigheidsvenster, selectors en controleregels;
2. match alle ingevulde selectors conjunctief;
3. bepaal prioriteit, specificiteit, templateversie en cardinaliteitskey;
4. voer alleen expliciete, geldige en specifiekere `replace`/`suppress` uit;
5. groepeer op template plus cardinaliteitskey;
6. merge bronnen conservatief: `auto_attach`, `required`, handtekening en
   afwijkingstoelichting gebruiken OR; blokkeermomenten gebruiken unie; hoogste
   fotominimum wint; `skip_allowed` en `personnel_can_remove` gebruiken AND;
7. sorteer deterministisch en lever bronnen, beslissingen, vervangen/
   onderdrukte kandidaten en waarschuwingen mee.

Verschillende add-templates blijven naast elkaar bestaan. Naam- of
inhoudsgelijkheid dedupliceert nooit. Protected templates kunnen niet worden
onderdrukt. Replace/suppress zonder concreet template/family-doel, verplichte
reden of hogere specificiteit faalt veilig.

## 4. Cardinaliteitsvoorbeelden

De database-uniciteit is:

`tenant_id + assignment_id + template_id + cardinality + cardinality_key`.

- `per_work_order`: één snapshot met key `assignment:<id>`, ook als vijf taken
  dezelfde binding activeren.
- `per_object`: één snapshot voor het object van de assignment.
- `per_task_code`: één snapshot per unieke taakcode, ook bij twee regels met
  dezelfde code.
- `per_task_instance`: één snapshot per concrete `assignment_tasks.id`.

De resolver maakt dezelfde identiteit bij replay; de unieke index voorkomt
dubbele instanties onder concurrentie.

## 5. Verwijderen, detach, waiver en not-applicable

Een vervallen bron wordt gedeactiveerd. Andere actieve bronnen houden dezelfde
snapshot in stand. Een lege, onbeantwoorde pre-startsnapshot zonder bron wordt
soft-geannuleerd. Zodra antwoord of bewijs bestaat, wordt hij
`detached_pending_review`; er wordt niets verwijderd.

Personeel kan nooit een vereiste verwijderen. Het kan een afwijking/niet-
uitvoerbaar met verplichte toelichting en eventueel bewijs registreren. Een
bevoegde reviewer kan een niet-protected optionele checklist gemotiveerd
`not_applicable` maken. Een verplichte checklist vereist daarvoor `waivable`.
`waived` vereist altijd `waivable`. Protected blokkeert beide. Iedere uitzondering
bewaart reden, actor, tijd, oorspronkelijke bronnen en templateversie.

## 6. Mapping naar Fieldgrid-statussen

| Concept | Canonieke Fieldgrid-toestand | Checklistgedrag |
|---|---|---|
| voorbereiding | `requested`, `review`, `quote_preparation`, `awaiting_approval`, `approved`, `plannable` | preview en pre-start reconciliatie |
| toegewezen/ingepland | duurzame staffing, `scheduled`, `seen`, `en_route` | snapshot uiterlijk vóór start; automatische veilige reconciliatie |
| uitvoering | `in_progress` of `actual_started_at` | compositie gelockt; wijzigingen worden reviewvoorstel |
| onderbroken | participant `paused` | dezelfde snapshot/antwoorden hervatten |
| niet voltooid | `not_completed` | gedeeltelijke invoer bewaren, nog niet als definitieve completion valideren |
| afgerond en later | `completed`, rapport-, factuur-, betaal- en `closed`-statussen | snapshot/antwoorden/bewijs immutable |
| geannuleerd | `cancelled` | snapshot soft-terminaal en historisch raadpleegbaar |

Een bestaande snapshot schakelt nooit automatisch naar een nieuwere publicatie.
Een reviewer kan na preview vóór start bewust `applyNewerVersions` kiezen; na
start ontstaat ook hiervoor alleen een reviewvoorstel.

## 7. Triggerpunten

Directe, herstelbare reconciliatie is gekoppeld aan assignment-aanmaak,
contextwijziging (klant/object/sector/objecttype), taak toevoegen/verwijderen,
staffing, planbaar/status, inplannen en planbordmutaties. Direct vóór start wordt
nogmaals onder een assignment-advisory-lock gereconcilieerd en gelockt.
Templatepublicatie en binding activeren/deactiveren vullen een begrensde tenant-
queue; een request verwerkt maximaal tien records. De beheerherstelactie verwerkt
maximaal 25 en de service accepteert maximaal 100 per batch.

Handmatige assignmentbindings zijn de handmatige checklisttoevoeging. Publicatie,
bindingwijziging, bewuste versie-upgrade, reviewbesluit, waiver, afronding en
annulering worden geaudit. De repository bevat geen afzonderlijke assignment-
duplicatie- of heropeningsactie; zodra zo'n canonieke actie wordt toegevoegd,
moet die dezelfde recoverable reconciler met een unieke domeinkey aanroepen.

## 8. RLS- en permissionmodel

Alle checklisttabellen bezitten `tenant_id`; samengestelde tenanttriggers
verifiëren iedere verwijzing. Management-RLS gebruikt
`is_management_for_tenant`. Toegewezen actief personeel kan snapshots/bronnen
lezen en eigen antwoorden/bewijs schrijven via
`personnel_assigned_to_assignment`. `USING` en `WITH CHECK` binden answer/evidence
aan actor, actieve snapshot en assignment.

Permissions zijn `checklists:read`, `respond`, `write`, `publish` en `review`.
Server actions combineren permissioncontrole met de actieve tenant en herladen
assignment/checklist/item. Database-triggers weigeren item-ID's buiten de
immutable snapshot en niet-canonieke opslagpaden. Het bewijsobjectpad is exact:

`tenant/<tenant>/assignments/<assignment>/checklists/<snapshot>/<item>/<uuid>-<file>`.

Triggerfuncties met verhoogde leesrechten hebben een vaste `search_path` en geen
EXECUTE-recht voor PUBLIC/anon/authenticated/service_role. Foto- en
handtekeninginhoud wordt niet gelogd.

## 9. Migratie en herstel

`20260721120000_quality_checklists_foundation.sql` is forward-only. Er bestond
geen gestructureerde legacy-checklistdata; daarom is geen datamigratie of
destructieve wijziging aan `assignment_tasks` nodig. De migratie:

- activeert de quality-module voor bestaande plannen/tenants;
- zaait permissions en canonieke tenantrolpermissies;
- maakt tien tenanttabellen, restrict-FK's, checks, unieke sleutels en indexes;
- installeert tenant-, historie-, snapshot-, answer/evidence- en storageguards;
- installeert RLS/grants en eindigt met wees-/tenantcontrolequeries.

Herstel gebruikt `checklist_reconciliation_events` met status `pending` of
`failed`, idempotency key, retry count en foutcode. `processPending...` is
begrensd en hervatbaar. Herhaald verwerken maakt geen dubbele snapshot of audit.
Een niet-oplosbaar gestart verschil blijft `pending_review`; dat is geen retry-
fout en vereist een menselijk besluit.

Voor release: maak een backup, pas alle migraties toe op een lege PostgreSQL 17-
database en een herstelde stagingkopie, draai de tenant-A/B runtime- en RLS-
proeven, controleer de verificatiequeries, en test daarna pas browserflows op
staging. Geen down-migratie of historie-delete gebruiken.

## 10. Explain-voorbeelden

Een sectorbinding en objectbinding naar dezelfde template leveren één snapshot
met twee bronnen. Explain toont bijvoorbeeld dat `required` door de objectbron,
`minimumPhotos=3` door de sectorbron en de weergavenaam door prioriteit 800 zijn
veroorzaakt.

Een tenantstandaard "Veilig werken" plus objecttemplate "Machinekamer" levert
twee snapshots. Een specifieke object+taakcode-suppress voor "Machinekamer"
werkt alleen als het doel niet protected is en de reden bestaat. Een gelijk
suppress/add-niveau toont een waarschuwing en laat de checklist actief.

Preview toont dezelfde resolveroutput plus het diff tegen huidige snapshots.
`create/update/cancel/detach` vóór start wordt atomair toegepast; na start wordt
dezelfde verandering als `review_create/review_update/review_detach` getoond.

## Handmatige staging-scenario's

1. Maak een protected tenantstandaard, publiceer v1, koppel en controleer preview.
2. Voeg sector- en objectbron voor dezelfde template toe; verwacht één snapshot
   met twee bronnen en strengste regels.
3. Test per-task-code en per-task-instance met dubbele taakcodes.
4. Vul conditionele checkbox, meting, foto en handtekening gedeeltelijk offline,
   hervat online en controleer revisionconflict op een tweede apparaat.
5. Controleer dat afronden exacte ontbrekende items noemt en pas slaagt na bewijs.
6. Verwijder de laatste taakbron vóór start met en zonder antwoord; verwacht
   respectievelijk cancelled en detached review.
7. Wijzig een taak na start; verwacht geen stille mutatie maar review.
8. Probeer protected waiver, cross-tenant ID en niet-canoniek mediapad; verwacht
   server-/databaseweigering.
9. Publiceer v2; bestaande snapshot blijft v1. Preview en pas v2 bewust toe.
10. Rond af en probeer antwoord/snapshot/publicatie te wijzigen of verwijderen;
    alle historie blijft immutable.
