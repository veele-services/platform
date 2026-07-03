# Research: materiaalbeheer en inventarisbeheer

Datum: 2026-07-03
Branch: staging
Status: onderzoeks- en ontwerpdocument. Geen runtime-functionaliteit in deze taak.

## 1. Samenvatting

Fieldgrid heeft al een sterke operationele kern rond tenant, klanten, objecten, personeel, opdrachten, uitvoering, rapportage en facturatie. Materiaalbeheer en inventarisbeheer passen logisch in die keten, maar ze moeten verschillend worden ontworpen:

- Materiaalbeheer gaat over verbruiksartikelen met voorraad, voorraadlocaties, mutaties, werkbonverbruik en optionele facturatie.
- Inventarisbeheer gaat over unieke, traceerbare bedrijfsmiddelen met een inventariscode, status, locatiegeschiedenis, QR-code, onderhoud, keuringen en storingen.

Belangrijkste bevindingen uit de huidige codebase:

- Er bestaat al `assignment_material_usage` en een personeels-PWA-flow voor `Materiaal / Verbruik` op werkbonnen. Die flow is nu vrije tekst met hoeveelheid, prijs en opmerking. Er is nog geen productcatalogus, voorraadbalans, voorraadmutatie, voorraadlocatie, materiaalgoedkeuring of directe productkoppeling.
- Factuurvoorstellen nemen huidig materiaalverbruik al mee via `calculateInvoiceProposalForAssignment`. Dat is waardevol, maar moet worden uitgebreid met goedkeuring, factureerbaarheid, prijs-snapshots en tenant-veilige productkoppelingen.
- Er is nog geen dedicated module key voor `materials` of `inventory` in `FIELDGRID_MODULE_KEYS` en geen module-permission mapping voor materiaal of inventaris.
- Documenten bestaan generiek via `documents`, maar `DocumentEntityType` kent nog geen `material`, `inventory_item`, `inventory_issue` of vergelijkbare entiteiten.
- Tickets bestaan voor klant- en personeelscommunicatie. Inventarisstoringen kunnen deels op die patronen aansluiten, maar hebben waarschijnlijk extra context nodig: `inventory_item_id`, storingstatus, ernst, onderhoudsopvolging en eventueel een aparte issue-laag.
- RLS-patronen bestaan voor management, customer membership en personnel-assignment access. De nieuwe modules moeten dezelfde grenzen volgen en bij voorkeur overal directe `tenant_id` gebruiken.
- Storage is gecanoniseerd rond tenantgebonden paden via `buildTenantStoragePath` en `getTenantBoundStoragePath`. Materiaalafbeeldingen, inventarisfoto's, QR-labels en onderhoudsbewijzen moeten hierop aansluiten.

Aanbevolen architectuur:

- Voeg twee tenant modules toe: `materials` en `inventory`.
- Geef alle kern-tabellen een directe `tenant_id`, ook wanneer er een parentrelatie bestaat.
- Gebruik een generiek locatieconcept voor voorraad en inventaris, zodat MVP objecten en personeelsleden ondersteunt, maar later voertuigen, magazijnen, kantoren en tijdelijke locaties aankan.
- Laat materiaalvoorraad bestaan uit een actuele balans plus een append-only mutatielog. De balans is voor snelheid en UI; de mutaties zijn de auditbare waarheid.
- Gebruik voor inventaris een stabiele, per tenant unieke inventariscode zoals `INV000001`, plus een opaque QR-token dat niet gelijk is aan de database-id.
- Maak klanten standaard blind voor materiaal en inventaris, behalve materiaalregels die expliciet klantzichtbaar of factureerbaar worden op rapportage/factuur.
- Houd inventarisgebruik standaard niet factureerbaar. Storingen of onderhoud kunnen wel leiden tot een ticket, taak of nieuwe opdracht.

## 2. Analyse huidige codebase

### 2.1 Modules en entitlements

Huidige module keys in `lib/db/src/schema/modules.ts`:

- `customers`
- `objects`
- `personnel`
- `assignments`
- `planning`
- `reporting`
- `documents`
- `finance`
- `customer_portal`
- `personnel_portal`
- `notifications`
- `smart_planning`

Nog ontbrekend:

- `materials`
- `inventory`

`lib/db/src/module-permissions.ts` bevat de centrale resource-naar-module mapping voor permissies. Daar staan nog geen resources voor materiaal of inventaris in. Nieuwe resources moeten hier worden toegevoegd zodat API, backoffice, portalen en jobs dezelfde modulegrens gebruiken.

Aanbevolen module mapping:

| Resource | Module |
| --- | --- |
| `materials` | `materials` |
| `material_categories` | `materials` |
| `material_stock_locations` | `materials` |
| `material_stock_balances` | `materials` |
| `material_stock_movements` | `materials` |
| `assignment_material_usage` | `materials` |
| `inventory` | `inventory` |
| `inventory_categories` | `inventory` |
| `inventory_items` | `inventory` |
| `inventory_movements` | `inventory` |
| `inventory_maintenance` | `inventory` |
| `inventory_inspections` | `inventory` |
| `inventory_issues` | `inventory` |
| `assignment_inventory_items` | `inventory` |

### 2.2 RBAC en permissies

De codebase gebruikt permissies als `resource:action`, met runtime RBAC via tenantrollen. Nieuwe permissies moeten dus als gewone tenant-permissies worden toegevoegd. Globale rollen blijven templates, maar runtime-toegang loopt via tenantrollen.

Belangrijke ontwerpkeuze:

- RBAC geeft rechten.
- Modules bepalen of een domein voor de tenant actief is.
- Tenant-scope bepaalt welke data zichtbaar is.
- PWA-context bepaalt of personeel toegang heeft tot een opdracht, object, eigen dossier of uitgegeven inventaris.

### 2.3 Tenant-scope in vergelijkbare tabellen

Relevante bestaande patronen:

- `assignments.tenant_id` is verplicht en is het centrale tenantanker voor werkbonnen.
- `objects.tenant_id` is verplicht, maar heeft nog een default naar `DEFAULT_TENANT_ID`. Voor nieuwe tabellen moet dit niet worden overgenomen.
- `personnel.tenant_id` is verplicht, ook nog met default. Nieuwe tabellen moeten expliciet tenant-aware inserts afdwingen.
- `documents.tenant_id` bestaat, maar is nullable in het schema. Voor nieuwe gevoelige documentkoppelingen moet tenant-id expliciet worden gezet en gevalideerd.
- `assignment_photos.tenant_id` en `assignment_report_note_attachments.tenant_id` bestaan maar zijn nullable. Dit is een bestaand overgangspatroon, geen ideaal nieuw patroon.
- `reports`, `quotes`, `invoices`, `payments` hebben tenant-id maar sommige velden zijn nog nullable vanwege eerdere migratiefases. Nieuwe materiaal- en inventarisdata moet direct strenger worden ontworpen.

Aanbevolen principe voor deze modules:

- Alle hoofdtabeldata krijgt `tenant_id not null` zonder default naar een globale tenant.
- Childtabellen krijgen ook `tenant_id not null` als ze gevoelige runtime-data bevatten.
- Parent-scope is alleen acceptabel voor pure join-tabellen als triggers of constraints tenantconsistentie afdwingen.

### 2.4 Werkbonnen en materiaalverbruik

`lib/db/src/schema/assignments.ts` bevat al:

- `assignments`
- `assignment_personnel`
- `assignment_tasks`
- `assignment_extra_work`
- `assignment_photos`
- `assignment_material_usage`
- `assignment_report_notes`
- `assignment_report_note_attachments`

Bestaand `assignment_material_usage` model:

- `assignment_id`
- `name`
- `quantity`
- `unit_price`
- `unit_label`
- `notes`
- `created_by`
- timestamps

Beperkingen:

- Geen `tenant_id`.
- Geen `material_id`.
- Geen voorraadlocatie.
- Geen voorraadmutatie.
- Geen goedkeuringsstatus.
- Geen factureerbaar-vlag per gebruiksregel.
- Geen kostprijs/verkoopprijs-snapshot vanuit productcatalogus.
- Geen klantzichtbaarheid.
- Geen directe auditkoppeling.

De personeels-PWA heeft al:

- `artifacts/personeel-pwa/src/actions/materials.ts`
- `artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/materiaal/page.tsx`
- `MaterialEditor`

Deze flow controleert of het personeelslid aan de opdracht is gekoppeld en blokkeert bewerken zodra de werkbon in latere statussen zit. Dat is een goede basis voor MVP-uitbreiding.

### 2.5 Factuurvoorstellen

`artifacts/backoffice/src/lib/invoice-proposals.ts` leest huidig materiaalverbruik mee in factuurvoorstellen. Materiaalregels worden nu factureerbaar als quantity en unit price groter dan nul zijn.

Voor de nieuwe module moet dit strakker:

- Product bepaalt standaard factureerbaar ja/nee.
- Gebruik krijgt een snapshot van prijs, eenheid en BTW-instelling.
- Administratie keurt materiaalverbruik goed.
- Alleen goedgekeurde factureerbare regels worden opgenomen in factuurvoorstellen.
- Een factuurregel moet terug te herleiden zijn naar de materiaalgebruiksregel.

### 2.6 Documenten, media en storage

`documents` bestaat met:

- `tenant_id`
- `entity_type`
- `entity_id`
- `storage_path`
- metadata

Huidige `DocumentEntityType`:

- `assignment`
- `customer`
- `personnel`
- `object`
- `general`

Voor materiaal en inventaris zijn extra entity types nodig:

- `material`
- `inventory_item`
- `inventory_issue`
- `inventory_maintenance`

Storage helper:

- `buildTenantStoragePath(tenantId, parts)`
- `getTenantBoundStoragePath(path, tenantId)`

Advies:

- Materiaalafbeeldingen: `tenant/{tenantId}/materials/{materialId}/images/...`
- Inventarisfoto's: `tenant/{tenantId}/inventory/{inventoryItemId}/images/...`
- Inventarisdocumenten: `tenant/{tenantId}/inventory/{inventoryItemId}/documents/...`
- QR-label exports: `tenant/{tenantId}/inventory/{inventoryItemId}/labels/...`

Signed URLs mogen alleen na autorisatie worden gemaakt en downloads van gevoelige documenten moeten auditloggen.

### 2.7 Tickets en storingen

Er bestaan klant- en personeelstickets:

- `customer_message_threads`
- `customer_message_entries`
- `personnel_message_threads`
- `personnel_message_entries`

Deze zijn bruikbaar als patroon voor communicatie, maar inventarisstoringen hebben extra domeinvelden nodig:

- inventarisitem
- ernst
- storingstatus
- locatie/context
- foto/video
- opvolging
- oplossing
- onderhoudsrelatie

Advies:

- MVP: introduceer `inventory_issues` als domeintabel voor storing en opvolging.
- Koppel optioneel naar een bestaand personnel/customer message thread wanneer communicatie nodig is.
- Later kan dit worden samengevoegd in een generieke ticketmodule, maar dat is groter dan deze module.

### 2.8 Notificaties

Het notificatiesysteem heeft event settings, dispatches, delivery queue, push subscriptions en native push tokens. Dit is geschikt voor materiaal- en inventarissignalen.

Nieuwe event keys kunnen onder meer zijn:

- `material_stock_low`
- `material_stock_empty`
- `material_usage_submitted`
- `material_usage_pending_approval`
- `material_usage_approved`
- `inventory_inspection_due`
- `inventory_inspection_overdue`
- `inventory_issue_reported`
- `inventory_issue_resolved`
- `inventory_item_moved`
- `inventory_item_lost`

### 2.9 Auditlog

`audit_log` is append-only en tenant-aware, met nullable tenant-id voor platform/global audit. Nieuwe moduleacties moeten hierin worden opgenomen. Voor tenantacties hoort `tenant_id` altijd gevuld te zijn.

### 2.10 Backoffice UI

Objectdetail heeft al een tabstructuur met:

- Overzicht
- Diensten
- Details
- Contacten

Daar passen nieuwe tabs logisch bij:

- Materiaal / Voorraad
- Inventaris

Personeelsdetail is nu meer een dossierpagina met kaarten, gekoppelde objecten, opdrachten en documenten. Daar kan materiaal/inventaris eerst als panel worden toegevoegd, later eventueel als tabstructuur.

### 2.11 Personeels-PWA

De PWA heeft al een mobiele werkbonpagina met tabs:

- Home
- Werkzaamheden
- Rapportage

Binnen `Werkzaamheden` staan al taakchecklist, meerwerk en materiaal. Materiaal kan dus worden doorontwikkeld naar catalogusselectie en voorraadverbruik. Inventaris kan worden toegevoegd via:

- scanactie in de werkbon
- inventarisdetail na QR-scan
- storing melden
- gekoppelde inventaris op de werkbon
- eventueel `Mijn inventaris`

## 3. Functionele requirements materiaalbeheer

### 3.1 Productcatalogus

Een tenant moet producten kunnen beheren. Producten zijn verbruiksartikelen en moeten archiveerbaar zijn in plaats van fysiek verwijderbaar wanneer ze ooit zijn gebruikt.

Minimale velden:

- `tenant_id`
- productcode of materiaalcode
- productnaam
- categorie
- omschrijving
- eenheid
- optionele kostprijs
- optionele verkoopprijs of verbruikskosten
- BTW-percentage of BTW-type indien relevant
- leverancier optioneel
- leverancier-artikelnummer optioneel
- barcode of QR optioneel
- afbeelding optioneel
- actief/inactief
- minimumvoorraad optioneel
- maximumvoorraad optioneel
- standaard factureerbaar ja/nee
- opmerkingen
- auditvelden
- archiefvelden

Advies:

- Soft delete via `archived_at` en `is_active`.
- Unieke productcode per tenant.
- Barcode uniek per tenant wanneer gevuld.
- Productprijzen snapshotten op usage-regels, niet live lezen bij facturatie.

### 3.2 Voorraadlocaties

MVP moet minimaal ondersteunen:

- object
- personeelslid

Het datamodel moet later kunnen uitbreiden naar:

- voertuig
- magazijn
- kantoor
- tijdelijke locatie

Advies:

Gebruik een generiek locatieconcept, bijvoorbeeld `stock_locations`, met type en optionele referenties. Daarmee kan materiaalvoorraad en inventarislocatie op hetzelfde concept aansluiten.

Locatietypes:

- `object`
- `personnel`
- `vehicle`
- `warehouse`
- `office`
- `temporary`

Voor MVP worden alleen `object` en `personnel` actief in UI getoond.

### 3.3 Voorraad per product per locatie

De tenant moet kunnen zien:

- totale voorraad per product
- voorraad per object
- voorraad per personeelslid
- minimumvoorraad per product of locatie
- maximumvoorraad per product of locatie
- laatste mutatie
- status: voldoende, laag, leeg
- gekoppelde werkbonnen waar verbruik is geregistreerd

Advies:

- Sla actuele balans op in `material_stock_balances`.
- Leg elke wijziging vast in `material_stock_movements`.
- Herberekening uit mutaties blijft mogelijk, maar de UI leest de balans.

### 3.4 Materiaal in objectdossier

Objectdetail krijgt tab of sectie `Materiaal / Voorraad`.

Toont:

- producten op dit object
- aantallen
- eenheid
- minimumvoorraad
- status
- laatste aanvulling
- laatste verbruik
- recente mutaties
- acties afhankelijk van rechten: aanpassen, aanvullen, verplaatsen, mutatiehistorie bekijken

### 3.5 Materiaal in personeelsdossier

Personeelsdetail krijgt panel of tab `Materiaal / Voorraad`.

Toont:

- producten bij dit personeelslid
- aantallen
- status
- laatste mutatie
- gekoppelde werkbonnen waaruit verbruik komt
- acties afhankelijk van rechten: aanpassen, overdragen, mutatiehistorie bekijken

### 3.6 Voorraadmutaties

Elke voorraadwijziging wordt een mutatie.

Mutatietypes:

- `added`
- `used`
- `corrected`
- `transferred`
- `received`
- `returned`
- `damaged`
- `lost`
- `written_off`
- `used_on_assignment`

Elke mutatie bevat:

- `tenant_id`
- `material_id`
- `from_stock_location_id`
- `to_stock_location_id`
- `quantity`
- `movement_type`
- `reason`
- `assignment_id` optioneel
- `assignment_material_usage_id` optioneel
- `personnel_id` optioneel
- `created_by`
- `created_at`
- `notes`

Regels:

- Quantity is altijd positief op mutatieniveau; richting komt uit type en from/to.
- Voorraad mag standaard niet negatief worden.
- Correcties vereisen aparte permissie.
- Een transfer schrijft idealiter een uitgaande en inkomende balanswijziging binnen dezelfde transactie.

### 3.7 Materiaalverbruik op werkbon

Personeel kan tijdens of na uitvoering materiaal toevoegen:

- product zoeken of scannen
- aantal invullen
- bronlocatie kiezen, standaard eigen voorraad of objectvoorraad
- opmerking toevoegen
- foto optioneel
- opslaan, ook offline waar mogelijk

Bij opslaan:

- `assignment_material_usage` wordt aangemaakt met tenant-id, product-id, snapshots en status.
- Bij directe voorraadkoppeling wordt een `material_stock_movement` aangemaakt.
- Bij offline opslaan wordt synchronisatie gecontroleerd op voorraadconflicten.

Werkbon toont `Materiaal / Verbruik` met:

- product
- aantal
- eenheid
- bronlocatie
- status voorraadmutatie
- factureerbaar ja/nee
- goedkeuringsstatus

### 3.8 Facturatie van materiaalverbruik

Materiaal hoeft niet automatisch factureerbaar te zijn.

Aanbevolen workflow:

1. Product heeft `default_invoiceable`, verkoopprijs en BTW-type.
2. Personeel registreert verbruik.
3. Gebruik krijgt snapshots: naam, eenheid, verkoopprijs, kostprijs, BTW.
4. Administratie ziet materiaalverbruik in rapport-/factuurvoorstelcontrole.
5. Administratie keurt regel goed, wijzigt eventueel factureerbaarheid of prijs.
6. Alleen goedgekeurde factureerbare regels gaan naar factuurvoorstel.
7. Factuurregel bewaart verwijzing naar materiaalgebruik.

Bestaande `createInvoiceProposalForAssignment` kan worden uitgebreid. Het huidige gedrag, alle materiaalregels met prijs groter dan nul meenemen, moet worden vervangen door een goedkeuringsgate.

## 4. Functionele requirements inventarisbeheer

### 4.1 Inventarisitem

Inventarisitems zijn unieke bedrijfsmiddelen. Ze worden gevolgd door code, status, locatie, historie en documenten.

Minimale velden:

- `tenant_id`
- unieke inventariscode
- naam
- categorie
- type
- merk
- model
- serienummer
- aanschafdatum
- aanschafwaarde optioneel
- status
- huidige locatie
- gekoppeld object optioneel
- gekoppeld personeelslid optioneel
- QR-token
- afbeelding
- documenten
- opmerkingen
- eerstvolgende keuringsdatum
- laatste keuringsdatum
- onderhoudsinterval optioneel
- garantie tot optioneel
- actief/inactief
- archiefvelden

### 4.2 Inventariscode

Advies:

- Gebruik per tenant een generieke oplopende code: `INV000001`, `INV000002`, enzovoort.
- Houd de code stabiel, ook bij categorie- of naamwijziging.
- Gebruik categorie-afhankelijke prefixes pas later als optionele configuratie.
- Maak codegeneratie transactie-veilig via een tenant sequence of een aparte `tenant_sequences` tabel.

Reden:

- Generieke codes zijn eenvoudiger, minder foutgevoelig en werken voor alle tenants.
- Categorieprefixen klinken mooi, maar worden lastig bij hercategoriseren.

### 4.3 QR-code

Elke inventarisitem krijgt een QR-code die verwijst naar een veilige Fieldgrid-route.

Advies:

- Sla een opaque token op, bijvoorbeeld `qr_token`, niet de raw database-id in de QR-url.
- Routevoorbeeld backoffice/PWA: `/inventory/scan/{token}` of `/inventaris/scan/{token}`.
- Niet-ingelogde gebruiker ziet login en wordt daarna teruggeleid.
- Ingelogde gebruiker zonder rechten ziet een duidelijke geen-toegang melding.
- QR-code kan als SVG worden gegenereerd voor printkwaliteit; PNG/PDF-labels kunnen als export volgen.
- QR-token moet roteerbaar zijn bij verlies of misbruik.

QR-flow:

1. Tenant maakt inventarisitem aan.
2. Fieldgrid genereert inventariscode en QR-token.
3. UI toont QR-code.
4. Tenant print label.
5. Personeel scant label.
6. App controleert login, tenantcontext, module, permissie en relatie tot item.
7. Detailpagina toont alleen toegestane gegevens.
8. Acties zoals storing melden worden apart geautoriseerd.

### 4.4 Locatie van inventaris

Aanbevolen model:

- Een inventarisitem heeft een huidige locatie.
- Locatiegeschiedenis wordt vastgelegd via `inventory_movements`.
- Huidige locatie kan object, personeelslid, voertuig, magazijn, kantoor of tijdelijke locatie zijn.
- MVP ondersteunt object en personeelslid.

Velden op item:

- `current_stock_location_id`
- optioneel denormalized `current_object_id`
- optioneel denormalized `current_personnel_id`

Denormalisatie is nuttig voor snelle filters en dossierweergave, maar moet door triggers of transacties consistent worden gehouden.

### 4.5 Inventaris in objectdossier

Objectdetail krijgt tab of sectie `Inventaris`.

Toont:

- inventarisitems gekoppeld aan object
- inventariscode
- naam
- categorie
- status
- eerstvolgende keuring
- open storing ja/nee
- laatste onderhoud
- acties: bekijken, verplaatsen, storing melden, onderhoud toevoegen

### 4.6 Inventaris in personeelsdossier

Personeelsdetail krijgt panel of tab `Inventaris`.

Toont:

- inventaris uitgegeven aan personeelslid
- inventariscode
- naam
- status
- uitgiftedatum
- retourdatum indien aanwezig
- open storingen
- acties: bekijken, retour melden, storing melden

### 4.7 Inventarisdetailpagina

Backoffice-detail toont:

- basisgegevens
- inventariscode
- QR-code
- huidige locatie
- object/personeel-koppeling
- status
- foto's
- documenten
- keuringsdatum
- onderhoudsinterval
- storingshistorie
- onderhoudshistorie
- verplaatsingshistorie
- auditlog
- gekoppelde werkbonnen/opdrachten
- opmerkingen

Personeels-PWA-detail toont minder:

- naam
- code
- status
- locatiecontext voor de opdracht
- veilige instructies
- storing melden
- foto/opmerking toevoegen
- onderhoudscontrole registreren indien toegestaan

Personeel ziet geen aanschafwaarde of kostprijzen zonder expliciete permissie.

### 4.8 Statusmodel

Aanbevolen statussen:

- `available`
- `in_use`
- `assigned_to_object`
- `assigned_to_personnel`
- `maintenance`
- `defect`
- `out_of_service`
- `lost`
- `disposed`
- `archived`

UI-labels kunnen Nederlands zijn, databasewaarden blijven generiek Engels.

### 4.9 Keuringen en onderhoud

Inventarisitems kunnen onderhoud en keuringen krijgen.

Benodigde velden of records:

- eerstvolgende keuring
- laatste keuring
- keuringsinterval
- onderhoudsinterval
- onderhoudsstatus
- onderhoudsnotities
- document/bewijs
- herinnering nodig ja/nee

Managementviews:

- binnenkort te keuren
- keuring verlopen
- open storing
- defect
- buiten gebruik

Advies:

- Gebruik aparte `inventory_maintenance_events` voor historie.
- Bewaar op `inventory_items` alleen de actuele samenvatting voor snelle filters.

### 4.10 Storingen

Personeel moet via PWA een storing kunnen melden na scan of vanuit opdracht.

Storing bevat:

- `tenant_id`
- `inventory_item_id`
- assignment/context optioneel
- object/personnel/context optioneel
- datum/tijd
- melder
- omschrijving
- ernst
- foto/video
- status
- opvolging
- opgelost door
- opgelost op
- notitie

Statussen:

- `new`
- `in_progress`
- `waiting_supplier`
- `resolved`
- `unresolvable`
- `cancelled`

Advies:

- Start met `inventory_issues` als domeintabel.
- Koppel later of optioneel aan bestaande message thread voor communicatie.
- Maak van ernstige storing automatisch een notificatie naar backoffice.

### 4.11 Inventaris koppelen aan werkbon

Voorbeelden:

- machine gebruikt bij opdracht
- ladder gebruikt bij werkzaamheden
- portofoon uitgegeven voor evenement
- defect geconstateerd tijdens opdracht

Benodigde functies:

- inventarisitem toevoegen aan werkbon
- status of usage type opslaan
- storing melden vanuit werkbon
- foto toevoegen
- eventueel onderhoudstaak genereren

Advies:

- Introduceer `assignment_inventory_items` als join-tabel.
- Houd gebruik en locatieverplaatsing gescheiden. Een item kan worden gebruikt op opdracht zonder van locatie te wijzigen.

## 5. Datamodelvoorstel

### 5.1 Materiaalcategorieen

Tabel: `material_categories`

Doel: tenant-specifieke categorisering van verbruiksartikelen.

Belangrijkste kolommen:

- `id uuid pk`
- `tenant_id uuid not null`
- `parent_id uuid null`
- `name varchar not null`
- `slug varchar not null`
- `description text null`
- `sort_order integer not null default 0`
- `is_active boolean not null default true`
- `archived_at timestamptz null`
- `created_by uuid null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraints en indexes:

- unique `(tenant_id, slug)`
- index `(tenant_id, is_active)`
- FK `tenant_id` naar tenants
- FK `parent_id` naar dezelfde tabel

RLS:

- Tenant management met `materials:view` kan lezen.
- `materials:manage` kan muteren.

### 5.2 Materialen

Tabel: `materials`

Doel: productcatalogus voor verbruiksartikelen.

Belangrijkste kolommen:

- `id uuid pk`
- `tenant_id uuid not null`
- `category_id uuid null`
- `code varchar not null`
- `name varchar not null`
- `description text null`
- `unit varchar not null`
- `cost_price numeric null`
- `sale_price numeric null`
- `vat_rate numeric null`
- `vat_type varchar null`
- `supplier_name varchar null`
- `supplier_item_number varchar null`
- `barcode varchar null`
- `image_document_id uuid null`
- `is_active boolean not null default true`
- `archived_at timestamptz null`
- `min_stock numeric null`
- `max_stock numeric null`
- `default_invoiceable boolean not null default false`
- `notes text null`
- `created_by uuid null`
- timestamps

Constraints en indexes:

- unique `(tenant_id, code)`
- partial unique `(tenant_id, barcode)` where barcode is not null
- index `(tenant_id, category_id)`
- index `(tenant_id, is_active)`
- check prices >= 0

Soft delete:

- Fysiek verwijderen alleen als nooit gebruikt.
- Anders archiveren.

### 5.3 Voorraadlocaties

Tabel: `stock_locations`

Doel: generieke voorraad- en inventarislocaties.

Kolommen:

- `id uuid pk`
- `tenant_id uuid not null`
- `location_type varchar not null`
- `name varchar not null`
- `object_id uuid null`
- `personnel_id uuid null`
- `vehicle_id uuid null` later
- `warehouse_id uuid null` later
- `office_id uuid null` later
- `temporary_label varchar null`
- `is_active boolean not null default true`
- `archived_at timestamptz null`
- timestamps

Constraints:

- `location_type` in `object`, `personnel`, `vehicle`, `warehouse`, `office`, `temporary`
- Voor MVP: objectlocatie moet object_id hebben, personnellocatie moet personnel_id hebben.
- Tenant van object/personnel moet matchen met `stock_locations.tenant_id`. Dit kan via trigger of via composite constraints zodra parenttabellen composite unique tenant/id hebben.

Indexes:

- `(tenant_id, location_type)`
- `(tenant_id, object_id)`
- `(tenant_id, personnel_id)`

### 5.4 Materiaalvoorraadbalans

Tabel: `material_stock_balances`

Doel: actuele voorraad per materiaal per locatie.

Kolommen:

- `id uuid pk`
- `tenant_id uuid not null`
- `material_id uuid not null`
- `stock_location_id uuid not null`
- `quantity numeric not null default 0`
- `min_stock_override numeric null`
- `max_stock_override numeric null`
- `last_movement_at timestamptz null`
- timestamps

Constraints:

- unique `(tenant_id, material_id, stock_location_id)`
- check `quantity >= 0`, tenzij tenant later bewust negatieve voorraad toestaat
- tenantconsistentie tussen material, location en balance

Indexes:

- `(tenant_id, material_id)`
- `(tenant_id, stock_location_id)`
- `(tenant_id, quantity)` voor lage voorraad filters

### 5.5 Materiaalvoorraadmutaties

Tabel: `material_stock_movements`

Doel: append-only voorraadhistorie.

Kolommen:

- `id uuid pk`
- `tenant_id uuid not null`
- `material_id uuid not null`
- `from_stock_location_id uuid null`
- `to_stock_location_id uuid null`
- `quantity numeric not null`
- `movement_type varchar not null`
- `reason text null`
- `assignment_id uuid null`
- `assignment_material_usage_id uuid null`
- `personnel_id uuid null`
- `created_by uuid not null`
- `created_at timestamptz not null`
- `notes text null`

Constraints:

- check `quantity > 0`
- movement type bepaalt of from/to verplicht is
- tenantconsistentie over alle referenties

Indexes:

- `(tenant_id, material_id, created_at desc)`
- `(tenant_id, from_stock_location_id, created_at desc)`
- `(tenant_id, to_stock_location_id, created_at desc)`
- `(tenant_id, assignment_id)`

### 5.6 Werkbonmateriaalgebruik

Bestaande tabel: `assignment_material_usage`

Aanbevolen uitbreiding of migratie:

- `tenant_id uuid not null` na backfill
- `material_id uuid null`
- `stock_location_id uuid null`
- `material_code_snapshot varchar null`
- `material_name_snapshot varchar not null`
- `unit_snapshot varchar null`
- `cost_price_snapshot numeric null`
- `sale_price_snapshot numeric null`
- `vat_rate_snapshot numeric null`
- `invoiceable boolean not null default false`
- `customer_visible boolean not null default false`
- `approval_status varchar not null default 'pending'`
- `approved_by uuid null`
- `approved_at timestamptz null`
- `invoice_id uuid null` of later `invoice_line_id`
- `stock_movement_id uuid null`
- `photo_document_id uuid null`

MVP-migratie:

- Backfill `tenant_id` via `assignments.tenant_id`.
- Houd bestaande `name` en `unit_price` tijdelijk voor compatibiliteit.
- Nieuwe code schrijft snapshots.
- Oude vrije tekst blijft zichtbaar als legacy material usage.

### 5.7 Inventariscategorieen

Tabel: `inventory_categories`

Doel: tenant-specifieke categorisering van inventarisitems.

Kolommen vergelijkbaar met `material_categories`, optioneel met:

- `default_maintenance_interval_days`
- `default_inspection_interval_days`
- `code_prefix` later optioneel

### 5.8 Inventarisitems

Tabel: `inventory_items`

Doel: unieke traceerbare bedrijfsmiddelen.

Kolommen:

- `id uuid pk`
- `tenant_id uuid not null`
- `code varchar not null`
- `category_id uuid null`
- `name varchar not null`
- `type varchar null`
- `brand varchar null`
- `model varchar null`
- `serial_number varchar null`
- `purchase_date date null`
- `purchase_value numeric null`
- `status varchar not null default 'available'`
- `current_stock_location_id uuid null`
- `current_object_id uuid null`
- `current_personnel_id uuid null`
- `qr_token varchar not null`
- `qr_generated_at timestamptz null`
- `image_document_id uuid null`
- `next_inspection_date date null`
- `last_inspection_date date null`
- `inspection_interval_days integer null`
- `maintenance_interval_days integer null`
- `warranty_until date null`
- `customer_visible boolean not null default false`
- `is_active boolean not null default true`
- `archived_at timestamptz null`
- `notes text null`
- `created_by uuid null`
- timestamps

Constraints:

- unique `(tenant_id, code)`
- unique `(tenant_id, qr_token)`
- partial unique `(tenant_id, serial_number)` where serial_number is not null and active if desired
- status in allowed set
- tenantconsistentie met current location/object/personnel

Indexes:

- `(tenant_id, status)`
- `(tenant_id, category_id)`
- `(tenant_id, current_stock_location_id)`
- `(tenant_id, current_object_id)`
- `(tenant_id, current_personnel_id)`
- `(tenant_id, next_inspection_date)`

### 5.9 Inventarisbewegingen

Tabel: `inventory_movements`

Doel: locatiegeschiedenis van inventarisitems.

Kolommen:

- `id uuid pk`
- `tenant_id uuid not null`
- `inventory_item_id uuid not null`
- `from_stock_location_id uuid null`
- `to_stock_location_id uuid null`
- `movement_type varchar not null`
- `assignment_id uuid null`
- `reason text null`
- `created_by uuid not null`
- `created_at timestamptz not null`
- `notes text null`

Indexes:

- `(tenant_id, inventory_item_id, created_at desc)`
- `(tenant_id, to_stock_location_id)`
- `(tenant_id, assignment_id)`

### 5.10 Inventaris onderhoud en keuringen

Tabel: `inventory_maintenance_events`

Doel: onderhouds- en keuringshistorie.

Kolommen:

- `id uuid pk`
- `tenant_id uuid not null`
- `inventory_item_id uuid not null`
- `event_type varchar not null` zoals inspection, maintenance, repair
- `status varchar not null`
- `scheduled_at timestamptz null`
- `due_date date null`
- `performed_at timestamptz null`
- `performed_by uuid null`
- `notes text null`
- `document_id uuid null`
- `created_by uuid not null`
- timestamps

### 5.11 Inventarisstoringen

Tabel: `inventory_issues`

Doel: storingen en meldingen rond inventaris.

Kolommen:

- `id uuid pk`
- `tenant_id uuid not null`
- `inventory_item_id uuid not null`
- `assignment_id uuid null`
- `object_id uuid null`
- `personnel_id uuid null`
- `reported_by uuid not null`
- `severity varchar not null default 'normal'`
- `status varchar not null default 'new'`
- `description text not null`
- `resolution_notes text null`
- `resolved_by uuid null`
- `resolved_at timestamptz null`
- `message_thread_id uuid null` later optioneel
- timestamps

Indexes:

- `(tenant_id, status)`
- `(tenant_id, inventory_item_id)`
- `(tenant_id, assignment_id)`
- `(tenant_id, reported_by)`

### 5.12 Inventaris op werkbon

Tabel: `assignment_inventory_items`

Doel: inventarisitems koppelen aan opdrachtgebruik.

Kolommen:

- `id uuid pk`
- `tenant_id uuid not null`
- `assignment_id uuid not null`
- `inventory_item_id uuid not null`
- `usage_type varchar not null default 'used'`
- `notes text null`
- `attached_by uuid not null`
- `attached_at timestamptz not null`

Constraints:

- unique `(tenant_id, assignment_id, inventory_item_id)`
- tenantconsistentie tussen assignment en item

## 6. UI/UX voorstel backoffice

### 6.1 Navigatie

Voeg twee module-items toe wanneer modules actief zijn:

- Materiaal
- Inventaris

Toon ze alleen als de tenantmodule actief is en gebruiker permissie heeft.

### 6.2 Materiaaloverzicht

Routevoorstel: `/materials`

Functies:

- lijst producten
- zoeken op code, naam, categorie, barcode, leverancier
- filters: actief, lage voorraad, leeg, categorie, leverancier
- kolommen: code, naam, categorie, eenheid, totale voorraad, lage voorraad status, standaard factureerbaar, actief
- bulkacties later: export, archiveren
- CTA: materiaal toevoegen

### 6.3 Materiaaldetail

Routevoorstel: `/materials/[id]`

Tabs of secties:

- Overzicht
- Voorraad per locatie
- Mutaties
- Verbruik op werkbonnen
- Prijzen/facturatie
- Documenten/afbeelding
- Audit

Acties:

- bewerken
- voorraad ontvangen
- voorraad corrigeren
- voorraad verplaatsen
- archiveren

### 6.4 Materiaalverbruik controle

Routevoorstel: `/materials/usage` of onderdeel van rapport/facturatie.

Doel:

- alle pending usage-regels controleren
- goedkeuren/afwijzen
- factureerbaarheid wijzigen
- prijs corrigeren
- naar factuurvoorstel laten doorstromen

### 6.5 Lage voorraad signalen

Routevoorstel: `/materials/stock-alerts`

Toont:

- product
- locatie
- huidige voorraad
- minimum
- laatste verbruik
- aanbevolen actie

### 6.6 Inventarisoverzicht

Routevoorstel: `/inventory`

Functies:

- lijst inventarisitems
- zoeken op code, naam, serienummer, QR, categorie
- filters: status, locatie, object, personeel, keuring verlopen, defect, open storing
- kolommen: code, naam, categorie, status, locatie, volgende keuring, open storing
- CTA: inventarisitem toevoegen

### 6.7 Inventarisdetail

Routevoorstel: `/inventory/[id]`

Tabs of secties:

- Overzicht
- QR-code
- Locatiehistorie
- Storingen
- Onderhoud/keuringen
- Documenten/foto's
- Gekoppelde opdrachten
- Audit

Acties:

- bewerken
- verplaatsen
- toewijzen aan object
- toewijzen aan personeel
- storing melden
- onderhoud toevoegen
- QR-label downloaden/printen
- archiveren

### 6.8 Objectdossier

Objectdetail krijgt twee extra tabs:

- `Materiaal / Voorraad`
- `Inventaris`

Materiaal-tab:

- balans per product op dit object
- lage voorraad signalen
- recente mutaties
- gebruikshistorie op opdrachten voor dit object

Inventaris-tab:

- inventarisitems op dit object
- status en keuring
- open storingen
- acties voor beheer

### 6.9 Personeelsdossier

Personeelsdetail krijgt eerst panelen, later eventueel tabs:

- `Materiaal / Voorraad`
- `Inventaris`

Materiaalpanel:

- voorraad bij personeelslid
- laatste mutaties
- verbruikt op werkbonnen

Inventarispanel:

- uitgegeven inventaris
- status
- uitgiftedatum
- open storingen

## 7. UI/UX voorstel personeels-PWA

### 7.1 Werkbon materiaal

Bestaande `Materiaal / Verbruik` wordt uitgebreid:

- product zoeken in catalogus
- barcode/QR scannen optioneel
- bronlocatie kiezen
- aantal invoeren
- offline opslaan
- synchronisatieconflicten duidelijk tonen
- geen kostprijs tonen zonder permissie
- verkoopprijs alleen tonen als toegestaan

### 7.2 Mijn materialen

Routevoorstel: `/materialen` of `/mijn-materialen`

Toont:

- voorraad gekoppeld aan ingelogd personeelslid
- lage voorraad
- snelle actie: gebruik op werkbon, retour, melding voorraadverschil

### 7.3 Inventaris scannen

Routevoorstel: `/inventaris/scannen`

Functies:

- camera-scan via browser waar ondersteund
- handmatige code-invoer als fallback
- na scan naar detail of login
- geen data lekken voor onbevoegden

### 7.4 Inventarisdetail mobiel

Toont alleen toegestane velden:

- naam
- inventariscode
- status
- veilige locatiecontext
- instructies
- gekoppelde opdracht indien relevant
- open storing melding

Acties afhankelijk van rechten:

- storing melden
- foto toevoegen
- opmerking toevoegen
- onderhoud/controle registreren
- koppelen aan werkbon
- verplaatsing aanvragen

### 7.5 Offline impact

Materiaalregistratie heeft al offline queue-patronen. Uitbreiding vereist:

- productcatalogus cache voor recente producten of toegewezen voorraad
- lokale draft usage-regels
- conflictresolutie wanneer voorraad tijdens offline periode verandert
- idempotency key per offline actie

Inventaris-scans kunnen beperkt offline werken:

- QR-code kan lokaal alleen bekende items openen als ze gecachet zijn.
- Nieuwe storingen offline opslaan kan, maar moet bij sync opnieuw autoriseren.
- Gevoelige documenten blijven online-only.

## 8. Impact klantportaal

Standaard advies:

- Klanten zien geen inventaris.
- Klanten zien materiaal alleen wanneer het onderdeel wordt van een goedgekeurd rapport of factuur.
- Klanten zien geen kostprijs.
- Klanten zien verkoop/verbruik alleen als tenant dit expliciet klantzichtbaar of factureerbaar maakt.

Mogelijke latere uitbreiding:

- Objectrapportage toont klantzichtbare inventarisstatus, bijvoorbeeld keuringsstatus van klantgebonden middelen, alleen als tenant dit modulematig aanzet.

## 9. Rechten en permissies

### 9.1 Materiaalpermissies

Aanbevolen permissies:

- `materials:view`
- `materials:manage`
- `materials:create`
- `materials:update`
- `materials:archive`
- `materials:view_stock`
- `materials:adjust_stock`
- `materials:transfer_stock`
- `materials:view_costs`
- `materials:view_sale_prices`
- `materials:use_on_assignment`
- `materials:approve_usage`
- `materials:invoice_usage`

Roladvies:

- Owner/admin: alles.
- Planner/operationeel beheer: view, gebruik controleren, voorraad verplaatsen/aanpassen afhankelijk van tenantbeleid.
- Finance: view sale prices, approve usage, invoice usage.
- Personeel: use on assignment, beperkte view van eigen voorraad, geen kostprijs.
- Klant: geen directe permissie, alleen via rapport/factuur zichtbaarheid.

### 9.2 Inventarispermissies

Aanbevolen permissies:

- `inventory:view`
- `inventory:manage`
- `inventory:create`
- `inventory:update`
- `inventory:archive`
- `inventory:assign_to_object`
- `inventory:assign_to_personnel`
- `inventory:transfer`
- `inventory:generate_qr`
- `inventory:view_costs`
- `inventory:scan`
- `inventory:report_issue`
- `inventory:resolve_issue`
- `inventory:view_maintenance`
- `inventory:manage_maintenance`

Roladvies:

- Owner/admin: alles.
- Planner/operationeel beheer: view, assign, transfer, issues, maintenance.
- Finance: view costs indien nodig.
- Personeel: scan, beperkte view, report issue, foto/opmerking toevoegen.
- Klant: standaard niets.

## 10. RLS en security advies

### 10.1 Tenant-isolatie

Elke nieuwe tabel moet tenant-aware zijn. Voorkeur:

- `tenant_id not null`
- geen default naar `DEFAULT_TENANT_ID`
- index op tenant-id
- tenantconsistentie bij elke parentreferentie
- RLS policies die tenant membership, support grant en platform/admin grenzen respecteren

### 10.2 Backoffice

Backoffice-gebruikers krijgen toegang via tenantrollen en module-entitlements.

Serveracties moeten altijd controleren:

- ingelogd
- tenantcontext
- module actief
- permissie
- entiteit hoort bij tenant

### 10.3 Personeel

Personeel mag materiaal/inventaris zien wanneer:

- het eigen personeelsprofiel actief is
- de data aan een eigen opdracht, eigen personeelslocatie, of toegestane objectcontext hangt
- de module actief is
- de specifieke permissie aanwezig is of via PWA basisrol is toegestaan

Voor inventaris QR-scan:

- QR-token geeft nooit directe data zonder login.
- Token moet alleen worden opgelost na auth.
- Detail response moet veldniveau-filtering toepassen.

### 10.4 Klanten

Klanten zien standaard niets van inventaris en geen interne materiaalvoorraad.

Alleen toegestaan:

- materiaalregels op goedgekeurde rapportage/factuur wanneer `customer_visible` of invoice status dat toestaat
- nooit kostprijs
- geen voorraadlocaties van personeel

### 10.5 Storage

Alle materiaal- en inventarisbestanden moeten tenantgebonden paden gebruiken.

Vereisten:

- path moet canonical tenant prefix hebben
- signed URL alleen na permissiecheck
- QR-label downloads alleen voor bevoegde gebruikers
- gevoelige downloads auditloggen
- path guessing tests toevoegen

### 10.6 Negatieve voorraad en race conditions

Voorraadmutaties moeten transactioneel worden verwerkt:

- lock de balansrij voor update
- controleer hoeveelheid
- schrijf mutatie
- update balans
- commit

Bij offline sync:

- server beslist definitief
- bij conflict duidelijke melding: voorraad onvoldoende of product niet meer actief
- idempotency voorkomt dubbele mutaties

## 11. Auditlog advies

Log minimaal:

Materiaal:

- materiaal aangemaakt
- materiaal gewijzigd
- materiaal gearchiveerd
- voorraad aangepast
- voorraad verplaatst
- materiaal verbruikt op werkbon
- materiaal goedgekeurd voor facturatie
- materiaal afgewezen voor facturatie
- materiaalregel opgenomen in factuurvoorstel

Inventaris:

- inventarisitem aangemaakt
- inventarisitem gewijzigd
- inventarisitem gearchiveerd
- inventarisitem verplaatst
- inventarisitem toegewezen aan object
- inventarisitem toegewezen aan personeel
- QR-code gegenereerd
- QR-token geroteerd
- inventarisitem gescand
- storing gemeld
- storing opgelost
- keuring toegevoegd
- onderhoud toegevoegd
- document bekeken of gedownload indien gevoelig

Auditmetadata moet onder meer bevatten:

- tenant-id
- actor
- resource
- resource-id
- oude en nieuwe status waar relevant
- assignment/object/personnel context waar relevant

## 12. Notificaties en signalen

### 12.1 Materiaal

Signalen:

- voorraad onder minimum
- voorraad leeg
- product bijna op bij object
- product bijna op bij personeelslid
- verbruik geregistreerd
- verbruik wacht op goedkeuring
- opvallend hoog verbruik
- voorraadcorrectie boven drempel

Kan via bestaand notificatiesysteem met nieuwe event settings.

### 12.2 Inventaris

Signalen:

- keuring verloopt binnenkort
- keuring verlopen
- storing gemeld
- item defect
- item verplaatst
- item kwijt
- retour nodig
- onderhoud nodig

Aanbevolen ontvangers:

- management/backoffice voor voorraad en storingen
- toegewezen personeelslid bij uitgegeven inventaris
- eventueel klant alleen bij expliciete klantzichtbare melding

## 13. Rapportage en facturatie-impact

### 13.1 Werkbon

Werkbon krijgt:

- materiaalverbruikregels
- gekoppelde inventarisitems
- storingsmeldingen vanuit inventaris
- foto's en opmerkingen

### 13.2 Rapportage

Rapportage kan tonen:

- gebruikt materiaal
- klantzichtbare materiaalregels
- eventueel inventarisincidenten die tijdens uitvoering zijn gemeld

Niet tonen:

- kostprijzen
- interne voorraadlocaties
- interne inventariswaarde

### 13.3 Factuurvoorstel

Materiaalverbruik kan factureerbaar zijn. Advies:

- Factuurvoorstel leest alleen goedgekeurde usage-regels.
- Prijs, eenheid en BTW komen uit snapshots.
- Administratie behoudt laatste controle.
- Factuurregel verwijst naar usage-id.

Inventarisgebruik is standaard niet factureerbaar. Uitzonderingen kunnen later via regels of contracten worden toegevoegd.

## 14. QR-code en scanflow advies

### 14.1 Generatie

- Genereer `qr_token` bij aanmaken inventarisitem.
- Token is lang, random en tenant-uniek.
- QR-url bevat token, niet raw id.
- QR kan on demand als SVG worden gerenderd.
- PNG/PDF-label export volgt in latere fase.

### 14.2 Scan route

Routevoorstel:

- Publieke entry: `/inventory/scan/{token}`
- Na login: resolve token en redirect naar toegestane detailroute
- Backoffice detail: `/inventory/{id}`
- PWA detail: `/inventaris/{id}` of `/inventaris/scan/{token}`

### 14.3 Autorisatie

Stappen:

1. Auth check.
2. Token lookup.
3. Tenantcontext bepalen via host-first resolver.
4. Controleer item tenant.
5. Controleer module `inventory`.
6. Controleer permissie of personeelsrelatie.
7. Filter velden op rol.
8. Audit scan event.

### 14.4 Niet ingelogd of onbevoegd

- Niet ingelogd: login tonen, daarna terug naar scanroute.
- Geen rechten: melding zonder itemdetails.
- Token onbekend: generieke melding, eventueel support/backoffice event.
- Item gearchiveerd: melding afhankelijk van rechten.

## 15. Implementatiefases

### Fase 0: Onderzoek en canon

Deze taak.

Output:

- `docs/research-material-inventory-management.md`

Geen runtime-code.

### Fase 1: Module- en schemafundering

Doel:

- modules `materials` en `inventory`
- permissies en module mapping
- basistabellen en migraties
- RLS skeleton
- document entity types uitbreiden

Taken:

- Voeg module keys toe.
- Voeg permissions toe.
- Voeg `material_categories`, `materials`, `stock_locations`, `material_stock_balances`, `material_stock_movements` toe.
- Voeg `inventory_categories`, `inventory_items`, `inventory_movements`, `inventory_maintenance_events`, `inventory_issues`, `assignment_inventory_items` toe.
- Backfill alleen waar nodig en staging-safe.
- Voeg tenantconsistentie checks/triggers toe.

Acceptatie:

- Migratie draait op lege DB en staging-copy.
- Geen bestaande stagingdata resetten.
- Module default kan aan blijven voor alle tenants indien tijdelijke toegang gewenst is.

### Fase 2: Materiaalcatalogus en voorraadbasis

Doel:

- productcatalogus
- objectvoorraad
- personeelsvoorraad
- voorraadmutaties
- object- en personeelsdossier panels

Taken:

- Backoffice materiaaloverzicht.
- Product aanmaken/bewerken/archiveren.
- Voorraad ontvangen, corrigeren, verplaatsen.
- Materiaaldetail met locaties en mutaties.
- Objectdetail tab `Materiaal / Voorraad`.
- Personeelsdetail panel `Materiaal / Voorraad`.

Acceptatie:

- Tenant A ziet geen materiaal van Tenant B.
- Product kan niet fysiek verdwijnen als gebruikt.
- Voorraad kan niet onder nul door normale flow.

### Fase 3: Materiaal op werkbon en PWA

Doel:

- bestaande PWA materiaalverbruik uitbreiden naar catalogus/voorraad.

Taken:

- Productselectie in PWA.
- Bronlocatie kiezen.
- Usage-regel met snapshots schrijven.
- Voorraadmutatie schrijven.
- Offline queue uitbreiden met idempotency en conflictmelding.
- Backoffice assignment-detail toont materiaalverbruik.

Acceptatie:

- Personeel kan alleen materiaal boeken op eigen opdracht.
- Direct ID guessing faalt.
- Offline dubbel syncen maakt geen dubbele mutatie.

### Fase 4: Materiaalcontrole en facturatie

Doel:

- goedkeuringsflow en facturatie-integratie.

Taken:

- Pending material usage overzicht.
- Goedkeuren/afwijzen.
- Factureerbaar aanpassen.
- Factuurvoorstel gebruikt alleen goedgekeurde regels.
- Auditlog toevoegen.

Acceptatie:

- Niet-goedgekeurd materiaal komt niet op factuurvoorstel.
- Kostprijzen niet zichtbaar zonder permissie.
- Prijswijziging in product wijzigt historische usage niet.

### Fase 5: Inventarisbasis

Doel:

- inventarisitems, locatie, object/personeelsdossier, statusbeheer.

Taken:

- Inventarisoverzicht.
- Inventarisitem aanmaken/bewerken/archiveren.
- Inventariscode genereren.
- Locatie toewijzen aan object/personeel.
- Locatiegeschiedenis.
- Objectdetail tab `Inventaris`.
- Personeelsdetail panel `Inventaris`.

Acceptatie:

- Inventariscode uniek per tenant.
- Item kan niet naar object/personeel van andere tenant.
- Gearchiveerde items blijven historisch zichtbaar.

### Fase 6: QR-code en scanning

Doel:

- QR-code veilig genereren, printen en scannen.

Taken:

- QR-token en QR-rendering.
- QR-label download.
- Scanroute met login redirect.
- Personeels-PWA scanpagina.
- Veldniveau-autorisatie.
- Audit scan event.

Acceptatie:

- Token lekt geen data zonder auth.
- Onbevoegde gebruiker ziet geen itemdetails.
- Personeel ziet alleen toegestane informatie.

### Fase 7: Storingen, onderhoud en keuringen

Doel:

- issue- en onderhoudsflow.

Taken:

- Storing melden vanuit PWA.
- Foto/video koppelen.
- Backoffice storingsoverzicht.
- Onderhoud/keuring registreren.
- Notificaties voor verlopen keuringen en nieuwe storingen.
- Optionele koppeling met tickets.

Acceptatie:

- Storing is tenant-safe.
- Open storing verschijnt op inventarisdetail en object/personeelsdossier.
- Keuring verlopen wordt gesignaleerd.

### Fase 8: Dashboards en optimalisatie

Doel:

- managementoverzichten en reporting.

Taken:

- Materiaalverbruik dashboard.
- Lage voorraad dashboard.
- Inventarisstatus dashboard.
- Verlopen keuringen dashboard.
- Exportmogelijkheden.
- Performance indexes controleren.

Acceptatie:

- Dashboardqueries zijn tenant-scoped.
- Grote tenants blijven performant.

## 16. MVP-afbakening

### Materiaal MVP

Wel:

- productcatalogus
- object- en personeelsvoorraad
- voorraadmutaties
- PWA materiaalverbruik op werkbon
- basale goedkeuring voor factuurvoorstel
- object/personeelsdossier overzicht

Niet in MVP:

- leveranciersbeheer als aparte module
- inkooporders
- automatische bestelvoorstellen
- uitgebreide barcode/QR voorraadscanner
- geavanceerde verbruiksanalyse

### Inventaris MVP

Wel:

- inventarisitems
- inventariscode
- object/personeel locatie
- statusbeheer
- QR-code basis
- PWA scan en storing melden
- onderhoud/keuring basis
- object/personeelsdossier overzicht

Niet in MVP:

- native labelprinter-integratie
- complexe verhuur/facturatieregels
- volledige asset depreciation
- uitgebreide fleet/vehicle module
- generieke ticketmodule rewrite

## 17. Risico's en aandachtspunten

### 17.1 Tenant-lekken

Risico: nieuwe tabellen of joins vergeten tenant-id.

Mitigatie:

- Directe `tenant_id` op alle runtime-tabellen.
- Tenantconsistentie tests.
- RLS policies.
- Cross-tenant integration tests.

### 17.2 Voorraadconflicten

Risico: dubbele mutaties of negatieve voorraad bij gelijktijdige acties/offline sync.

Mitigatie:

- Transactionele voorraadmutatie.
- Row locks op balans.
- Idempotency keys voor offline acties.
- Conflict UI.

### 17.3 Facturatiefouten

Risico: materiaal komt onbedoeld op factuur of met verkeerde prijs.

Mitigatie:

- Goedkeuringsstatus.
- Prijs-snapshots.
- Alleen goedgekeurde regels factureren.
- Auditlog.

### 17.4 QR-data lek

Risico: QR-url toont details zonder autorisatie.

Mitigatie:

- Opaque token.
- Auth verplicht voor detail.
- Geen itemdetails op foutpagina.
- Token rotatie.
- Audit scan.

### 17.5 Te groot ontwerp in een keer

Risico: materiaal en inventaris tegelijk volledig bouwen maakt staging instabiel.

Mitigatie:

- Fases strikt houden.
- Staging bereikbaar houden.
- Per fase migratie smoke op staging-copy.
- Backward compatible migraties.

## 18. Open vragen

1. Moeten `materials` en `inventory` standaard aan staan voor alle tenants of alleen handmatig per tenant?
2. Mag personeel verkoopprijs zien of alleen materiaalnaam/aantal?
3. Moet voorraad negatief mogen worden als tijdelijke uitzondering?
4. Wil men in MVP voertuig/magazijn als locatie al zichtbaar maken of alleen datamodel voorbereiden?
5. Moet inventaris klantzichtbaar kunnen zijn per item, per categorie of alleen later?
6. Moet QR-label export direct PDF ondersteunen of is SVG/printview genoeg voor MVP?
7. Moeten inventarisstoringen in bestaande personnel tickets landen of eerst in eigen `inventory_issues`?
8. Moet materiaalverbruik altijd gekoppeld worden aan voorraad, of mag vrije tekst legacy blijven bestaan?
9. Moet materiaalgoedkeuring gekoppeld worden aan rapportgoedkeuring of aan een aparte finance stap?
10. Welke BTW-types moeten tenantbreed beschikbaar zijn?

## 19. Antwoorden op onderzoeksvragen

1. Welke bestaande tabellen/modules kunnen hergebruikt worden?

   Herbruikbaar zijn `assignments`, `assignment_personnel`, `assignment_material_usage`, `assignment_tasks`, `assignment_extra_work`, `assignment_photos`, `assignment_report_notes`, `reports`, `invoices`, `quotes`, `documents`, `audit_log`, `notifications`, `customer_message_threads`, `personnel_message_threads`, `modules`, `tenant_modules`, `permissions` en tenant RBAC.

2. Is er al material usage/verbruik aanwezig?

   Ja. `assignment_material_usage` bestaat en de personeels-PWA heeft een werkbonpagina voor materiaalverbruik. Het model is nog vrije tekst en moet worden uitgebreid naar catalogus, voorraad en approval.

3. Is er al een document/media model dat geschikt is voor inventarisfoto's?

   Ja, `documents` en tenant-bound storage helpers zijn bruikbaar. `DocumentEntityType` moet worden uitgebreid met materiaal- en inventarisentiteiten. Assignment media kan als patroon dienen, maar nieuwe data moet direct tenant_id verplicht zetten.

4. Bestaat er al ticketflow die storingen kan dragen?

   Er bestaan klant- en personeelsticket/message-thread patronen. Voor inventarisstoringen is een aparte `inventory_issues` tabel aanbevolen, eventueel gekoppeld aan message threads.

5. Hoe werkt tenant_id nu in vergelijkbare modules?

   Kernentiteiten hebben tenant-id, maar sommige oudere tabellen zijn nullable of hebben default tenant fallback. Nieuwe materiaal- en inventaristabellen moeten strenger zijn: direct `tenant_id not null` zonder default fallback.

6. Hoe worden objecten en personeel nu gekoppeld?

   Objecten hebben `tenant_id` en `customer_id`. Personeel heeft `tenant_id` en optioneel `user_id`. Opdrachten koppelen personeel via `assignment_personnel`.

7. Hoe worden werkbonnen/opdrachten nu opgebouwd?

   `assignments` is de hoofdentiteit met klant, object, status en planning. Taken staan in `assignment_tasks`, meerwerk in `assignment_extra_work`, materiaalverbruik in `assignment_material_usage`, foto's en notities in aparte assignment-tabellen.

8. Waar moet materiaalverbruik op de werkbon komen?

   In de bestaande PWA-tab `Werkzaamheden`, binnen `Materiaal / Verbruik`. Backoffice toont het op assignment-detail en in rapport/factuurcontrole.

9. Moet voorraad als actuele balans worden opgeslagen of uit mutaties worden berekend?

   Beide. Mutaties zijn de auditbare waarheid; balans is nodig voor performance, lage voorraad signalen en snelle UI.

10. Hoe voorkomen we dubbele of negatieve voorraad?

   Door transacties, row locks op balans, idempotency keys voor offline sync, checks op quantity en permissies voor correcties. Negatieve voorraad standaard blokkeren.

11. Hoe genereren we inventariscodes?

   Per tenant via een transactie-veilige sequence, standaard `INV000001`. Categorie-afhankelijke prefixen later optioneel.

12. Hoe genereren we QR-codes?

   Genereer een opaque QR-token en render een QR-code naar een scanroute. SVG als basis, PNG/PDF-labels als export.

13. Welke QR-scan route is veilig?

   Een route met token, bijvoorbeeld `/inventory/scan/{token}`, die pas na auth en permissiecontrole itemdetails toont.

14. Moet QR scan werken in PWA of native app?

   MVP in PWA via browser camera waar ondersteund, met handmatige code-invoer als fallback. Native optimalisatie kan later.

15. Welke permissies zijn minimaal nodig?

   Voor materiaal: view, manage, adjust stock, transfer stock, use on assignment, approve usage, invoice usage, view costs. Voor inventaris: view, manage, transfer, generate QR, scan, report issue, resolve issue, manage maintenance, view costs.

16. Welke onderdelen zijn MVP en welke later?

   MVP: catalogus, voorraad op object/personeel, werkbonverbruik, basisfacturatie, inventarisitems, code, QR, scan, storing, onderhoud/keuring basis. Later: inkoop, leveranciersmodule, voertuigen/magazijnen UI, geavanceerde analytics, native labelprinter, depreciation.

17. Welke migraties zijn nodig?

   Nieuwe tabellen voor materiaal, voorraad, inventaris, movements, issues en maintenance. Uitbreiding/backfill van `assignment_material_usage`. Uitbreiding van documents entity types, modules en permissions. RLS policies en tenantconsistentie triggers.

18. Welke UI-routes zijn nodig?

   Backoffice: `/materials`, `/materials/[id]`, `/materials/usage`, `/inventory`, `/inventory/[id]`, QR print/download, object/personnel dossier tabs. PWA: werkbon materiaal, `/inventaris/scannen`, inventarisdetail, storing melden, eventueel `Mijn materialen` en `Mijn inventaris`.

19. Welke risico's zijn er?

   Tenant-lekken, voorraadconflicten, onbedoelde facturatie, QR-data lekken, te grote migraties, offline sync duplicaten, onvoldoende veldniveau-autorisatie.

20. Welke acceptatietests zijn nodig?

   Cross-tenant tests, direct ID guessing, PWA personnel assignment access, customer denial, storage path guessing, signed URL auth, material invoice approval, negative stock prevention, QR auth/denial, migration smoke op lege DB en staging-copy.

## 20. Acceptatiecriteria voor implementatie

Een technische fase is pas klaar wanneer:

- Nieuwe tabellen tenant_id correct vullen.
- Tenant A geen data van Tenant B kan lezen of muteren.
- Personeel alleen toegestane werkbon/object/eigen voorraad of eigen inventaris ziet.
- Klanten geen inventaris of interne voorraad zien.
- QR-scan zonder rechten geen data lekt.
- Storagepaden tenant-bound zijn.
- Materiaalverbruik niet ongecontroleerd factureert.
- Auditlog gevoelige acties vastlegt.
- Migraties werken op lege DB en staging-copy.
- Staging bereikbaar blijft tijdens rollout.

## 21. Concrete vervolgtaken voor Codex

### Prompt Fase 1

Implementeer de module- en schemafundering voor materiaalbeheer en inventarisbeheer. Voeg modules, permissions, module mapping, Drizzle schema exports, staging-veilige migraties, RLS skeleton en document entity types toe. Geen UI behalve eventueel minimale type-integratie. Draai typecheck/test waar mogelijk en commit naar main/staging volgens release-afspraak.

### Prompt Fase 2

Implementeer materiaalcatalogus en voorraadbasis in de backoffice. Bouw productoverzicht, productdetail, voorraad per object/personeel, mutaties, objectdossier-tab en personeelsdossier-panel. Houd alle data tenant-scoped en voeg cross-tenant tests toe.

### Prompt Fase 3

Breid de bestaande personeels-PWA materiaalflow uit met catalogusselectie, bronlocatie, voorraadmutatie, snapshots en offline idempotency. Zorg dat legacy vrije-tekst materiaal zichtbaar blijft. Voeg tests toe voor personeelstoegang en voorraadconflicten.

### Prompt Fase 4

Bouw materiaalgoedkeuring en facturatie-integratie. Alleen goedgekeurde factureerbare materiaalregels mogen naar factuurvoorstellen. Voeg auditlog, prijs-snapshots en finance tests toe.

### Prompt Fase 5

Implementeer inventarisbasis: inventarisitems, inventariscodegeneratie, locatiekoppeling aan object/personeel, statusbeheer, inventarisoverzicht, inventarisdetail, objectdossier-tab en personeelsdossier-panel.

### Prompt Fase 6

Implementeer QR-code en scanflow voor inventaris. Gebruik opaque tokens, login redirect, PWA scanpagina, veldniveau-autorisatie, QR-label export en auditlogging. Voeg denial tests toe.

### Prompt Fase 7

Implementeer inventarisstoringen, onderhoud en keuringen. Bouw PWA storing melden, backoffice issue-overzicht, onderhoudshistorie, notificaties en keuring-signalen. Koppel waar zinvol aan bestaande ticket/message patterns.

### Prompt Fase 8

Bouw dashboards en optimalisaties voor materiaal en inventaris: lage voorraad, materiaalverbruik, defecte inventaris, verlopen keuringen, export en performance-index checks.
