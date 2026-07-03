# Research: materiaalbeheer en inventarisbeheer

Datum: 2026-07-03
Branch: staging
Status: onderzoeks- en ontwerpdocument. Geen runtime-functionaliteit in deze taak.

## 1. Samenvatting

Fieldgrid krijgt twee nieuwe tenantmodules:

- `materials`: materiaalbeheer voor verbruiksartikelen, voorraad, voorraadmutaties, materiaalverbruik op werkbonnen en facturatiecontrole.
- `inventory`: inventarisbeheer voor unieke bedrijfsmiddelen, locatie, QR-code, storingen, onderhoud, keuringen en eventueel verhuur/facturatie.

De modules sluiten aan op de bestaande Fieldgrid-keten:

`Tenant -> Klanten -> Objecten -> Werkbonnen / Opdrachten -> Taken -> Personeel -> Uitvoering -> Rapportage -> Facturatie`

Belangrijkste codebase-bevindingen:

- Er bestaat al `assignment_material_usage` in `lib/db/src/schema/assignments.ts`.
- De personeels-PWA heeft al een mobiele flow voor `Materiaal / Verbruik` op werkbonnen.
- Het bestaande materiaalverbruik is nog vrije tekst met hoeveelheid en prijs, zonder catalogus, productcode, voorraadlocatie, voorraadmutatie, directe tenantkolom of goedkeuringsflow.
- Factuurvoorstellen lezen materiaalverbruik al mee via `calculateInvoiceProposalForAssignment`, maar dat moet strakker worden: alleen door management goedgekeurde materiaalregels mogen financieel doorstromen.
- Er zijn nog geen module keys `materials` en `inventory` in `FIELDGRID_MODULE_KEYS`.
- Er zijn nog geen module-permission mappings voor materiaal of inventaris.
- Documenten, auditlog, notifications, tenant-bound storage helpers, customer/personnel tickets en RLS-patronen kunnen worden hergebruikt.

## 2. Vastgelegde productbesluiten

Deze besluiten zijn leidend voor implementatie.

### 2.1 Goedkeuring en facturatie van materiaal

Materiaal wordt financieel beoordeeld tijdens bon-/rapportgoedkeuring door management.

Management moet per materiaalregel kunnen aanpassen:

- aantal;
- omschrijving;
- eenheid;
- verkoopprijs per stuk;
- BTW;
- factureerbaar ja/nee;
- klantzichtbaar ja/nee.

Management mag een materiaalregel dus:

- op `EUR 0,00` zetten;
- een verkoopprijs toevoegen;
- een bestaande prijs aanpassen;
- niet factureerbaar maken;
- wel of niet zichtbaar maken voor de klant.

Als een materiaalregel op `EUR 0,00` wordt gezet, blijft die alleen zichtbaar voor de klant wanneer `customer_visible = true` staat. `EUR 0,00` betekent dus niet automatisch verbergen.

Prijsinvoer is per stuk, niet als totaalbedrag. Het totaal wordt berekend uit goedgekeurd aantal maal goedgekeurde verkoopprijs per stuk.

Elke handmatige prijs- of factureerbaarheidswijziging vereist een reden.

### 2.2 Personeelsinvoer

Personeel vult in de PWA geen bedragen in. Personeel registreert maximaal:

- productcode of materiaalkeuze;
- materiaalnaam wanneer `Overig` wordt gebruikt;
- aantal;
- eenheid waar nodig;
- bronlocatie of verbruiksactie waar relevant;
- opmerking;
- foto optioneel.

Personeel mag vrije tekst blijven toevoegen via `Overig`. Management bepaalt bij bon-goedkeuring of daar kosten aan hangen en kan de regel eventueel koppelen aan een bestaand of nieuw materiaalproduct.

### 2.3 Voorraadverbruik

Er moet een verbruiksoptie komen waarmee personeel kan aangeven dat materiaal echt uit voorraad wordt gepakt. Voorbeeld: iemand pakt een rol, klikt `verbruik`, en de voorraad gaat omlaag.

Materiaalregistratie en voorraadmutatie blijven bewust gescheiden:

- geregistreerd verbruik beschrijft wat op de werkbon is gebruikt;
- voorraadmutatie beschrijft wat fysiek uit voorraad is gegaan;
- facturatie beschrijft wat klantzichtbaar/factureerbaar wordt.

Management krijgt optioneel de mogelijkheid om bij correctie ook voorraad aan te passen, maar een financiële wijziging mag niet automatisch fysieke voorraad herschrijven.

Negatieve voorraad mag mogelijk zijn. Het systeem moet negatieve voorraad ondersteunen, maar zichtbaar signaleren. Dit voorkomt dat personeel vastloopt wanneer voorraad administratief nog niet is bijgewerkt.

### 2.4 Rollen die materiaal mogen goedkeuren

Materiaal goedkeuren, prijzen aanpassen en factureerbaarheid bepalen mag door:

- eigenaar;
- admin;
- finance;
- management.

Deze rechten moeten via tenantrollen worden afgedwongen, niet via hardcoded rollen.

### 2.5 Klantzichtbaarheid

Klantzichtbaarheid is per materiaalregel instelbaar.

Klanten zien:

- alleen klantzichtbare materiaalregels;
- nooit kostprijzen;
- alleen verkoopprijs of `EUR 0,00` als de regel zichtbaar is;
- geen interne voorraadlocaties;
- geen personeelsvoorraad.

### 2.6 Inventaris en verhuur

Inventarisgebruik kan in bepaalde gevallen factureerbaar zijn, bijvoorbeeld verhuur van materiaal, machines of hulpmiddelen.

Daarom krijgt inventaris op werkbonnen later ook een financiële laag:

- inventarisitem gebruikt/verhuurd op opdracht;
- factureerbaar ja/nee;
- klantzichtbaar ja/nee;
- verkoopprijs/verhuurprijs per stuk/per periode;
- reden bij handmatige prijswijziging;
- goedkeuring tijdens bon-/rapportgoedkeuring.

Inventaris blijft standaard intern, tenzij expliciet klantzichtbaar of factureerbaar gemaakt.

### 2.7 Codeformats

Alle catalogusmaterialen en inventarisitems krijgen een tenant-unieke code.

Vastgelegde formats:

- Materiaalproduct: `M00001`, `M00002`, enzovoort.
- Inventarisitem: `I000001`, `I000002`, enzovoort.

Interpretatie:

- `M` staat voor materiaal.
- `I` staat voor inventarisitem/bedrijfsmiddel.

Codes zijn per tenant uniek, stabiel en worden niet hergebruikt na archiveren.

## 3. Analyse huidige codebase

### 3.1 Modules en entitlements

Huidige module keys:

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

Nog nodig:

- `materials`
- `inventory`

Aanbevolen resource-naar-module mapping:

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

### 3.2 Bestaand materiaalverbruik

Bestaand `assignment_material_usage` bevat nu vooral:

- `assignment_id`
- `name`
- `quantity`
- `unit_price`
- `unit_label`
- `notes`
- `created_by`
- timestamps

Beperkingen:

- geen `tenant_id`;
- geen `material_id`;
- geen productcode;
- geen voorraadlocatie;
- geen voorraadmutatie;
- geen goedkeuringsstatus;
- geen aparte geregistreerde versus goedgekeurde hoeveelheid;
- geen klantzichtbaarheid;
- geen reden bij prijswijziging.

### 3.3 Werkbon en PWA

De personeels-PWA heeft al:

- werkbon detail;
- tab `Werkzaamheden`;
- kaart `Materiaal / Verbruik`;
- materiaal toevoegen;
- offline queue patroon;
- check dat personeel aan de opdracht gekoppeld is.

Dit moet worden uitgebreid in plaats van volledig nieuw gebouwd.

### 3.4 Rapportage en factuurvoorstel

De bestaande factuurvoorstelcode neemt materiaalregels mee wanneer er een positieve prijs is. Dat wordt vervangen door een expliciete goedkeuringsgate.

Nieuwe regel:

- alleen `approval_status = approved` en `invoiceable = true` mag naar factuurvoorstel;
- klantzichtbaarheid wordt apart bepaald via `customer_visible`;
- prijs komt uit goedgekeurde snapshots, niet live uit de catalogus.

### 3.5 Documenten, media en storage

Bestaande `documents` kan worden hergebruikt, maar entity types moeten worden uitgebreid met:

- `material`;
- `inventory_item`;
- `inventory_issue`;
- `inventory_maintenance`.

Storage moet tenant-bound blijven via de bestaande storage helpers.

Aanbevolen paden:

- `tenant/{tenantId}/materials/{materialId}/images/...`
- `tenant/{tenantId}/inventory/{inventoryItemId}/images/...`
- `tenant/{tenantId}/inventory/{inventoryItemId}/documents/...`
- `tenant/{tenantId}/inventory/{inventoryItemId}/labels/...`

### 3.6 Tickets, storingen en onderhoud

Bestaande customer/personnel message threads zijn bruikbaar als patroon, maar inventarisstoringen hebben eigen domeinvelden nodig.

Advies:

- start met `inventory_issues` als domeintabel;
- koppel optioneel later aan message threads;
- gebruik notifications voor opvolging.

## 4. Functionele requirements materiaalbeheer

### 4.1 Productcatalogus

Een tenant beheert materialen als productcatalogus.

Minimale velden:

- `tenant_id`;
- materiaalcode, format `M00001`;
- naam;
- categorie;
- omschrijving;
- eenheid;
- kostprijs optioneel;
- verkoopprijs optioneel;
- BTW-type of BTW-percentage;
- leverancier optioneel;
- leverancier-artikelnummer optioneel;
- barcode/QR optioneel;
- afbeelding optioneel;
- actief/inactief;
- minimumvoorraad optioneel;
- maximumvoorraad optioneel;
- standaard factureerbaar ja/nee;
- opmerkingen;
- auditvelden;
- archiefvelden.

Producten worden bij voorkeur gearchiveerd in plaats van verwijderd zodra ze ooit zijn gebruikt.

### 4.2 Voorraadlocaties

MVP ondersteunt minimaal:

- object;
- personeelslid.

Datamodel moet voorbereid zijn op:

- voertuig;
- magazijn;
- kantoor;
- tijdelijke locatie.

Aanbevolen locatieconcept:

- generieke `stock_locations` met `location_type`;
- voor MVP alleen UI voor `object` en `personnel`;
- later uitbreidbaar zonder nieuwe voorraadtabellen.

### 4.3 Voorraadbalans en mutaties

Voorraad bestaat uit:

- actuele balans per materiaal per locatie;
- append-only mutatielog.

Balans is voor snelle UI. Mutaties zijn de auditbare waarheid.

Mutatietypes:

- `added`;
- `used`;
- `corrected`;
- `transferred`;
- `received`;
- `returned`;
- `damaged`;
- `lost`;
- `written_off`;
- `used_on_assignment`.

Negatieve voorraad wordt ondersteund, maar moet als waarschuwing zichtbaar worden. Er moet onderscheid zijn tussen:

- toegestaan negatief vanwege operationele snelheid;
- lage voorraad;
- lege voorraad;
- administratieve correctie nodig.

### 4.4 Materiaal op werkbon

Personeel kan materiaal registreren op een opdracht.

Keuzes:

- bestaand materiaal selecteren via code/zoekfunctie;
- `Overig` kiezen voor vrije tekst;
- optioneel voorraadverbruik aanklikken;
- bronlocatie kiezen indien voorraad wordt afgeboekt;
- aantal invullen;
- opmerking/foto toevoegen.

Bij catalogusmateriaal:

- `material_id` wordt gevuld;
- `material_code_snapshot` wordt gevuld;
- productnaam en eenheid worden gesnapshot.

Bij `Overig`:

- `material_id` blijft leeg;
- vrije tekstnaam wordt opgeslagen;
- management kan later koppelen aan bestaand/nieuw materiaal of als vrije tekstregel afhandelen.

### 4.5 Bon-goedkeuring materiaal

Tijdens bon-/rapportgoedkeuring ziet management alle materiaalregels.

Per regel toont de UI:

- geregistreerde invoer van personeel;
- productcode of `Overig`;
- geregistreerd aantal;
- geregistreerde eenheid;
- gekoppelde voorraadmutatie indien aanwezig;
- voorgestelde verkoopprijs;
- goedgekeurd aantal;
- goedgekeurde verkoopprijs per stuk;
- BTW;
- factureerbaar;
- klantzichtbaar;
- reden bij wijziging.

Management kan:

- regel goedkeuren;
- regel afwijzen voor facturatie;
- prijs op `EUR 0,00` zetten;
- prijs toevoegen;
- aantal aanpassen voor facturatie;
- omschrijving aanpassen;
- BTW aanpassen;
- klantzichtbaarheid aan/uit zetten;
- voorraadcorrectie optioneel starten.

Belangrijk: fysieke verbruikshoeveelheid en factureerbare hoeveelheid blijven apart.

## 5. Functionele requirements inventarisbeheer

### 5.1 Inventarisitem

Inventarisitems zijn unieke bedrijfsmiddelen.

Minimale velden:

- `tenant_id`;
- inventariscode, format `I000001`;
- naam;
- categorie;
- type;
- merk;
- model;
- serienummer;
- aanschafdatum;
- aanschafwaarde optioneel;
- status;
- huidige locatie;
- gekoppeld object optioneel;
- gekoppeld personeelslid optioneel;
- QR-token;
- afbeelding;
- documenten;
- opmerkingen;
- eerstvolgende keuringsdatum;
- laatste keuringsdatum;
- onderhoudsinterval optioneel;
- garantie tot optioneel;
- actief/inactief;
- archiefvelden.

### 5.2 Inventariscode

Inventariscodes worden per tenant gegenereerd als:

- `I000001`;
- `I000002`;
- enzovoort.

De code is stabiel, tenant-uniek en wordt niet hergebruikt na archiveren.

### 5.3 QR-code

Elk inventarisitem krijgt een QR-token en QR-code.

Vereisten:

- QR-url bevat geen raw database-id;
- gebruiker moet inloggen voordat details zichtbaar zijn;
- token lookup gebeurt tenant- en permissie-aware;
- onbevoegde gebruikers zien geen itemdetails;
- scan wordt auditgelogd;
- token moet later roteerbaar zijn.

### 5.4 Inventarislocatie

Een inventarisitem heeft een huidige locatie en locatiegeschiedenis.

MVP-locaties:

- object;
- personeelslid.

Later:

- voertuig;
- magazijn;
- kantoor;
- tijdelijk.

### 5.5 Inventaris op werkbon en verhuur

Inventaris kan aan een opdracht worden gekoppeld.

Voorbeelden:

- machine gebruikt op opdracht;
- ladder gebruikt bij werkzaamheden;
- portofoon uitgegeven voor evenement;
- machine verhuurd aan klant;
- defect geconstateerd tijdens opdracht.

Omdat inventaris ook verhuurbaar kan zijn, krijgt de werkbonkoppeling optioneel financiële velden:

- factureerbaar ja/nee;
- klantzichtbaar ja/nee;
- prijs per stuk/per periode;
- goedgekeurd aantal of periode;
- BTW;
- reden bij wijziging;
- goedkeuringsstatus.

Standaard blijft inventaris intern en niet factureerbaar.

## 6. Datamodelvoorstel

### 6.1 `material_categories`

Doel: tenant-specifieke materiaalcategorieen.

Kernkolommen:

- `id uuid pk`;
- `tenant_id uuid not null`;
- `parent_id uuid null`;
- `name varchar not null`;
- `slug varchar not null`;
- `description text null`;
- `is_active boolean not null default true`;
- `archived_at timestamptz null`;
- timestamps.

Constraints:

- unique `(tenant_id, slug)`.

### 6.2 `materials`

Doel: catalogusmateriaal.

Kernkolommen:

- `id uuid pk`;
- `tenant_id uuid not null`;
- `code varchar not null`, format `M00001`;
- `category_id uuid null`;
- `name varchar not null`;
- `description text null`;
- `unit varchar not null`;
- `cost_price numeric null`;
- `sale_price numeric null`;
- `vat_rate numeric null`;
- `vat_type varchar null`;
- `supplier_name varchar null`;
- `supplier_item_number varchar null`;
- `barcode varchar null`;
- `image_document_id uuid null`;
- `is_active boolean not null default true`;
- `archived_at timestamptz null`;
- `min_stock numeric null`;
- `max_stock numeric null`;
- `default_invoiceable boolean not null default false`;
- `notes text null`;
- `created_by uuid null`;
- timestamps.

Constraints:

- unique `(tenant_id, code)`;
- partial unique `(tenant_id, barcode)` where barcode is not null;
- prijzen >= 0.

### 6.3 `tenant_sequences`

Doel: tenant-veilige codegeneratie.

Kernkolommen:

- `tenant_id uuid not null`;
- `sequence_key varchar not null`, bijvoorbeeld `material_code` of `inventory_code`;
- `next_value integer not null`;
- timestamps.

Constraints:

- unique `(tenant_id, sequence_key)`.

Gebruik:

- materiaalcode: `M` + 5 cijfers;
- inventariscode: `I` + 6 cijfers.

### 6.4 `stock_locations`

Doel: generieke locaties voor materiaalvoorraad en inventaris.

Kernkolommen:

- `id uuid pk`;
- `tenant_id uuid not null`;
- `location_type varchar not null`;
- `name varchar not null`;
- `object_id uuid null`;
- `personnel_id uuid null`;
- toekomstige `vehicle_id`, `warehouse_id`, `office_id`;
- `temporary_label varchar null`;
- `is_active boolean not null default true`;
- timestamps.

### 6.5 `material_stock_balances`

Doel: actuele voorraad per materiaal per locatie.

Kernkolommen:

- `tenant_id uuid not null`;
- `material_id uuid not null`;
- `stock_location_id uuid not null`;
- `quantity numeric not null default 0`;
- `min_stock_override numeric null`;
- `max_stock_override numeric null`;
- `last_movement_at timestamptz null`.

Constraints:

- unique `(tenant_id, material_id, stock_location_id)`.

Negatieve quantity is toegestaan als tenantbeleid dat toelaat. MVP mag dit toestaan, maar UI moet waarschuwingen tonen.

### 6.6 `material_stock_movements`

Doel: append-only voorraadmutaties.

Kernkolommen:

- `tenant_id uuid not null`;
- `material_id uuid not null`;
- `from_stock_location_id uuid null`;
- `to_stock_location_id uuid null`;
- `quantity numeric not null`;
- `movement_type varchar not null`;
- `reason text null`;
- `assignment_id uuid null`;
- `assignment_material_usage_id uuid null`;
- `personnel_id uuid null`;
- `created_by uuid not null`;
- `created_at timestamptz not null`;
- `notes text null`.

### 6.7 Uitbreiding `assignment_material_usage`

Aanbevolen nieuwe velden:

- `tenant_id uuid not null` na backfill;
- `material_id uuid null`;
- `material_code_snapshot varchar null`;
- `registered_name text not null`;
- `registered_quantity numeric not null`;
- `registered_unit_label varchar null`;
- `stock_location_id uuid null`;
- `stock_movement_id uuid null`;
- `uses_stock boolean not null default false`;
- `is_other boolean not null default false`;
- `approved_name text null`;
- `approved_quantity numeric null`;
- `approved_unit_label varchar null`;
- `approved_unit_price numeric null`;
- `approved_vat_rate numeric null`;
- `invoiceable boolean not null default false`;
- `customer_visible boolean not null default false`;
- `approval_status varchar not null default 'pending'`;
- `approved_by uuid null`;
- `approved_at timestamptz null`;
- `approval_reason text null`;
- `invoice_id uuid null` of later `invoice_line_id`;
- `photo_document_id uuid null`.

Legacy velden blijven tijdelijk bestaan totdat alle UI en facturatie op de nieuwe velden zit.

### 6.8 `inventory_categories`

Doel: tenant-specifieke inventariscategorieen.

Kernkolommen vergelijkbaar met materiaalcategorieen, optioneel met default onderhouds- en keuringsintervallen.

### 6.9 `inventory_items`

Doel: unieke bedrijfsmiddelen.

Kernkolommen:

- `tenant_id uuid not null`;
- `code varchar not null`, format `I000001`;
- `category_id uuid null`;
- `name varchar not null`;
- `type varchar null`;
- `brand varchar null`;
- `model varchar null`;
- `serial_number varchar null`;
- `purchase_date date null`;
- `purchase_value numeric null`;
- `status varchar not null default 'available'`;
- `current_stock_location_id uuid null`;
- `current_object_id uuid null`;
- `current_personnel_id uuid null`;
- `qr_token varchar not null`;
- `qr_generated_at timestamptz null`;
- `image_document_id uuid null`;
- `next_inspection_date date null`;
- `last_inspection_date date null`;
- `inspection_interval_days integer null`;
- `maintenance_interval_days integer null`;
- `warranty_until date null`;
- `customer_visible boolean not null default false`;
- `is_active boolean not null default true`;
- `archived_at timestamptz null`;
- `notes text null`;
- timestamps.

Constraints:

- unique `(tenant_id, code)`;
- unique `(tenant_id, qr_token)`;
- optional partial unique `(tenant_id, serial_number)`.

### 6.10 `inventory_movements`

Doel: locatiegeschiedenis.

Kernkolommen:

- `tenant_id uuid not null`;
- `inventory_item_id uuid not null`;
- `from_stock_location_id uuid null`;
- `to_stock_location_id uuid null`;
- `movement_type varchar not null`;
- `assignment_id uuid null`;
- `reason text null`;
- `created_by uuid not null`;
- `created_at timestamptz not null`.

### 6.11 `inventory_issues`

Doel: storingen/meldingen rond inventaris.

Kernkolommen:

- `tenant_id uuid not null`;
- `inventory_item_id uuid not null`;
- `assignment_id uuid null`;
- `object_id uuid null`;
- `personnel_id uuid null`;
- `reported_by uuid not null`;
- `severity varchar not null default 'normal'`;
- `status varchar not null default 'new'`;
- `description text not null`;
- `resolution_notes text null`;
- `resolved_by uuid null`;
- `resolved_at timestamptz null`.

### 6.12 `inventory_maintenance_events`

Doel: onderhouds- en keuringshistorie.

Kernkolommen:

- `tenant_id uuid not null`;
- `inventory_item_id uuid not null`;
- `event_type varchar not null`;
- `status varchar not null`;
- `scheduled_at timestamptz null`;
- `due_date date null`;
- `performed_at timestamptz null`;
- `performed_by uuid null`;
- `notes text null`;
- `document_id uuid null`.

### 6.13 `assignment_inventory_items`

Doel: inventaris koppelen aan opdrachten en optioneel factureren/verhuren.

Kernkolommen:

- `tenant_id uuid not null`;
- `assignment_id uuid not null`;
- `inventory_item_id uuid not null`;
- `usage_type varchar not null default 'used'`;
- `registered_quantity numeric null`;
- `registered_period_label varchar null`;
- `invoiceable boolean not null default false`;
- `customer_visible boolean not null default false`;
- `approved_quantity numeric null`;
- `approved_unit_price numeric null`;
- `approved_vat_rate numeric null`;
- `approval_status varchar not null default 'pending'`;
- `approval_reason text null`;
- `attached_by uuid not null`;
- `attached_at timestamptz not null`;
- `notes text null`.

## 7. UI/UX voorstel backoffice

### 7.1 Materiaal

Routes:

- `/materials`;
- `/materials/[id]`;
- `/materials/usage`;
- objectdetail tab `Materiaal / Voorraad`;
- personeelsdetail panel/tab `Materiaal / Voorraad`.

Schermen:

- materiaaloverzicht;
- productdetail;
- product aanmaken/bewerken;
- voorraad per locatie;
- voorraadmutaties;
- materiaalverbruik ter controle;
- lage voorraad signalen;
- materiaal per object;
- materiaal per personeelslid.

### 7.2 Bon-goedkeuring

De bon-goedkeuringspagina krijgt een blok `Materiaal en inventaris`.

Voor materiaalregels:

- toon geregistreerd door personeel;
- toon productcode of `Overig`;
- toon voorraadstatus;
- laat management verkoopprijs per stuk, aantal, BTW, facturatie en klantzichtbaarheid bepalen;
- vraag verplichte reden bij prijs/facturatie-aanpassing.

Voor inventarisregels:

- toon inventariscode;
- toon gebruik/verhuur/context;
- laat management optioneel verhuurprijs/facturatie bepalen;
- standaard niet factureerbaar.

### 7.3 Inventaris

Routes:

- `/inventory`;
- `/inventory/[id]`;
- `/inventory/[id]/qr` of detailsectie;
- objectdetail tab `Inventaris`;
- personeelsdetail panel/tab `Inventaris`.

Schermen:

- inventarisoverzicht;
- inventarisdetail;
- inventaris aanmaken/bewerken;
- QR-code bekijken/downloaden/printen;
- locatie wijzigen;
- storingsoverzicht;
- onderhoud/keuringen;
- inventaris per object;
- inventaris per personeelslid.

## 8. UI/UX voorstel personeels-PWA

### 8.1 Materiaal op werkbon

Personeel ziet in de werkbon:

- bestaand `Materiaal / Verbruik`;
- product zoeken op naam/code;
- knop `Overig`;
- verbruiksoptie `Uit voorraad gebruiken`;
- voorraadlocatie kiezen als voorraad wordt gebruikt;
- aantal invoeren;
- opmerking/foto.

Personeel ziet geen prijzen.

### 8.2 Mijn materialen

Later scherm:

- eigen voorraad;
- lage voorraad;
- verbruik melden;
- retour/overdracht aanvragen.

### 8.3 Inventaris scannen

PWA route:

- `/inventaris/scannen`;
- camera-scan waar beschikbaar;
- handmatige code-invoer als fallback;
- login redirect;
- geen data zonder rechten.

### 8.4 Inventarisdetail mobiel

Personeel ziet afhankelijk van rechten:

- naam;
- inventariscode;
- status;
- veilige locatiecontext;
- gekoppelde opdracht;
- storing melden;
- foto/opmerking toevoegen;
- onderhoud/controle registreren indien toegestaan.

## 9. Rechten en permissies

### 9.1 Materiaal

Aanbevolen permissies:

- `materials:view`;
- `materials:manage`;
- `materials:create`;
- `materials:update`;
- `materials:archive`;
- `materials:view_stock`;
- `materials:adjust_stock`;
- `materials:transfer_stock`;
- `materials:view_costs`;
- `materials:view_sale_prices`;
- `materials:use_on_assignment`;
- `materials:approve_usage`;
- `materials:invoice_usage`.

Approvers voor materiaalprijzen en facturatie:

- eigenaar;
- admin;
- finance;
- management.

### 9.2 Inventaris

Aanbevolen permissies:

- `inventory:view`;
- `inventory:manage`;
- `inventory:create`;
- `inventory:update`;
- `inventory:archive`;
- `inventory:assign_to_object`;
- `inventory:assign_to_personnel`;
- `inventory:transfer`;
- `inventory:generate_qr`;
- `inventory:view_costs`;
- `inventory:scan`;
- `inventory:report_issue`;
- `inventory:resolve_issue`;
- `inventory:view_maintenance`;
- `inventory:manage_maintenance`;
- `inventory:approve_billing`;
- `inventory:invoice_usage`.

## 10. RLS en security advies

Elke nieuwe runtime-tabel krijgt:

- `tenant_id not null`;
- geen default naar `DEFAULT_TENANT_ID`;
- tenant-indexen;
- tenantconsistentie op parentrelaties;
- RLS volgens bestaande patronen.

Securitygrenzen:

- backoffice via tenantrollen en modules;
- personeel via eigen profiel, gekoppelde opdracht, eigen voorraad of uitgegeven inventaris;
- klant alleen via expliciete klantzichtbaarheid;
- support/platform via bestaande support/platform-grenzen;
- QR-token nooit als autorisatie gebruiken, alleen als lookup na login.

Storage:

- altijd tenant-bound paths;
- signed URLs alleen na permissiecheck;
- gevoelige downloads auditloggen.

## 11. Auditlog advies

Log minimaal:

Materiaal:

- materiaal aangemaakt/gewijzigd/gearchiveerd;
- voorraad aangepast/verplaatst/verbruikt;
- materiaal op werkbon geregistreerd;
- `Overig` regel aangemaakt;
- materiaal gekoppeld aan product;
- materiaal goedgekeurd;
- prijs op `EUR 0,00` gezet;
- prijs handmatig aangepast;
- klantzichtbaarheid aangepast;
- voorraadcorrectie vanuit bon-goedkeuring.

Inventaris:

- inventarisitem aangemaakt/gewijzigd/gearchiveerd;
- inventaris verplaatst/toegewezen;
- QR-code gegenereerd/geroteerd;
- inventaris gescand;
- inventaris gekoppeld aan opdracht;
- inventaris verhuur/facturatie goedgekeurd;
- storing gemeld/opgelost;
- keuring/onderhoud toegevoegd;
- document bekeken/gedownload indien gevoelig.

## 12. Notificaties en signalen

Materiaal:

- voorraad onder minimum;
- voorraad leeg;
- negatieve voorraad;
- verbruik geregistreerd;
- verbruik wacht op goedkeuring;
- opvallend hoog verbruik;
- voorraadcorrectie nodig.

Inventaris:

- keuring verloopt binnenkort;
- keuring verlopen;
- storing gemeld;
- item defect;
- item verplaatst;
- item kwijt;
- retour nodig;
- onderhoud nodig.

## 13. Rapportage en facturatie-impact

### 13.1 Materiaal

Materiaalverbruik komt in drie lagen:

1. Registratie door personeel.
2. Managementgoedkeuring tijdens bon-/rapportgoedkeuring.
3. Factuurvoorstel na goedkeuring.

Alleen goedgekeurde factureerbare regels gaan naar factuurvoorstel.

Klantzichtbaarheid is apart:

- een regel kan zichtbaar zijn met `EUR 0,00`;
- een regel kan factureerbaar zijn en zichtbaar;
- een regel kan intern blijven.

### 13.2 Inventaris

Inventarisgebruik is standaard intern.

Wanneer inventaris wordt verhuurd of doorbelast:

- management keurt dit tijdens bon-/rapportgoedkeuring;
- prijs is per stuk/per afgesproken periode;
- klantzichtbaarheid is per regel instelbaar;
- reden is verplicht bij handmatige prijswijziging.

## 14. QR-code en scanflow

QR-flow:

1. Inventarisitem krijgt `I000001`-achtige code en opaque QR-token.
2. QR verwijst naar scanroute.
3. Niet-ingelogde gebruiker wordt naar login gestuurd.
4. Na login wordt tenantcontext host-first bepaald.
5. Token wordt tenant-aware opgelost.
6. Module en permissies worden gecontroleerd.
7. Detail wordt veldniveau gefilterd.
8. Scan wordt auditgelogd.

## 15. Implementatiefases

### Fase 1: Module- en schemafundering

- Modules `materials` en `inventory`.
- Permissions en module mapping.
- `tenant_sequences` voor `M00001` en `I000001`.
- Basistabellen materiaal, voorraad, inventaris, issues en maintenance.
- Uitbreiding `assignment_material_usage` met tenant/backfill en nieuwe approvalvelden.
- RLS skeleton en tenantconsistentie.

### Fase 2: Materiaalcatalogus en voorraadbasis

- Productcatalogus.
- Materiaalcodes `M00001`.
- Objectvoorraad.
- Personeelsvoorraad.
- Voorraadmutaties.
- Negatieve voorraad toestaan maar signaleren.
- Object- en personeelsdossier.

### Fase 3: Materiaal op werkbon en PWA

- Productcode zoeken/selecteren.
- `Overig` toevoegen.
- `Uit voorraad gebruiken` flow.
- Geen prijsinvoer door personeel.
- Offline idempotency.
- Legacy materiaal zichtbaar houden.

### Fase 4: Bon-goedkeuring en facturatie materiaal

- Managementblok tijdens bon-/rapportgoedkeuring.
- Aantal/omschrijving/eenheid/prijs/BTW/factureerbaar/klantzichtbaar aanpassen.
- Verplichte reden bij wijzigingen.
- `EUR 0,00` ondersteunen.
- Factuurvoorstel gebruikt alleen goedgekeurde factureerbare regels.

### Fase 5: Inventarisbasis

- Inventarisitems.
- Inventariscodes `I000001`.
- Locatiekoppeling object/personeel.
- Locatiegeschiedenis.
- Object- en personeelsdossier.
- Statusbeheer.

### Fase 6: Inventaris op werkbon en verhuur

- Inventaris koppelen aan opdracht.
- Verhuur/facturatievelden.
- Managementgoedkeuring bij bon.
- Klantzichtbaarheid per inventarisregel.

### Fase 7: QR-code en scanning

- QR-token.
- QR-code renderen.
- PWA scanpagina.
- Login redirect.
- Veldniveau autorisatie.
- Audit scan events.

### Fase 8: Storingen, onderhoud en keuringen

- Storing melden vanuit PWA.
- Backoffice issue-overzicht.
- Onderhoud/keuring registreren.
- Notificaties.
- Documenten/foto's.

### Fase 9: Dashboards en optimalisatie

- Materiaalverbruik dashboard.
- Lage/negatieve voorraad dashboard.
- Inventarisstatus dashboard.
- Verlopen keuringen dashboard.
- Export.
- Performance-index checks.

## 16. MVP-afbakening

Materiaal MVP:

- materiaalcodes `M00001`;
- catalogus;
- object- en personeelsvoorraad;
- materiaal op werkbon;
- `Overig`;
- voorraadverbruik;
- bon-goedkeuring;
- prijs `EUR 0,00` of handmatig per stuk;
- klantzichtbaarheid per regel;
- factuurvoorstelintegratie.

Inventaris MVP:

- inventariscodes `I000001`;
- inventarisitems;
- locatie object/personeel;
- statusbeheer;
- QR-basis;
- inventaris op werkbon;
- storing melden;
- onderhoud/keuring basis;
- optionele verhuur/facturatie na managementgoedkeuring.

## 17. Risico's en mitigatie

Tenant-lekken:

- directe tenant-id;
- RLS;
- cross-tenant tests;
- tenantconsistentie triggers.

Facturatiefouten:

- approval gate;
- prijs-snapshots;
- verplichte reden;
- auditlog;
- factuurvoorstel alleen uit goedgekeurde regels.

Voorraadverschillen:

- voorraad en facturatie apart houden;
- negatieve voorraad signaleren;
- correctieflow;
- idempotency bij offline sync.

QR-lek:

- opaque token;
- auth verplicht;
- geen details bij foutmelding;
- scan audit.

## 18. Resterende open vragen

1. Moeten `materials` en `inventory` direct standaard actief staan voor alle tenants?
2. Welke BTW-types moeten tenantbreed beschikbaar zijn?
3. Moet `Overig` verplicht aan een catalogusmateriaal worden gekoppeld voordat het factureerbaar mag zijn, of mag vrije tekst factureerbaar blijven?
4. Moet negatieve voorraad tenantbreed altijd toegestaan zijn, of per materiaal/locatie configureerbaar?
5. Welke verhuur-eenheden zijn nodig voor inventaris: per stuk, per dag, per week, per opdracht, of handmatig?
6. Moet QR-label export in MVP al PDF ondersteunen, of is printbare SVG/HTML voldoende?

## 19. Acceptatietests

Minimaal nodig:

- Tenant A kan materiaal/inventaris van Tenant B niet lezen.
- Personeel kan alleen materiaal boeken op eigen opdracht.
- Personeel kan geen prijzen invoeren of zien zonder rechten.
- Management kan materiaalregel op `EUR 0,00` zetten met reden.
- Klant ziet `EUR 0,00` regel alleen bij `customer_visible = true`.
- `Overig` kan worden geregistreerd en door management geprijsd.
- Voorraadverbruik verlaagt voorraad.
- Negatieve voorraad wordt toegestaan en zichtbaar gesignaleerd.
- Financiele correctie wijzigt fysieke voorraad niet automatisch.
- Alleen goedgekeurde factureerbare materiaalregels komen op factuurvoorstel.
- Inventariscode is tenant-uniek als `I000001`.
- Materiaalcode is tenant-uniek als `M00001`.
- QR-scan zonder auth lekt geen data.
- Onbevoegde scan toont geen itemdetails.
- Inventarisverhuur kan pas na managementgoedkeuring factureren.
- Migraties werken op lege DB en staging-copy.

## 20. Concrete vervolgtaken voor Codex

### Prompt Fase 1

Implementeer module- en schemafundering voor materiaalbeheer en inventarisbeheer volgens dit document. Voeg `materials`, `inventory`, permissions, module mapping, `tenant_sequences`, tabellen, schema exports, RLS skeleton, document entity types en staging-veilige migraties toe. Geen volledige UI behalve minimale type-integratie.

### Prompt Fase 2

Bouw materiaalcatalogus en voorraadbasis met `M00001` codes, object-/personeelsvoorraad, mutaties, negatieve voorraad signalering en dossieroverzichten.

### Prompt Fase 3

Breid de personeels-PWA materiaalflow uit met productcode zoeken, `Overig`, `Uit voorraad gebruiken`, voorraadmutatie, offline idempotency en geen prijsvelden voor personeel.

### Prompt Fase 4

Bouw bon-goedkeuring voor materiaal: management kan aantal, omschrijving, eenheid, prijs per stuk, BTW, factureerbaarheid en klantzichtbaarheid aanpassen met verplichte reden. Integreer alleen goedgekeurde regels in factuurvoorstellen.

### Prompt Fase 5

Bouw inventarisbasis met `I000001` codes, object-/personeelslocatie, status, dossieroverzichten en locatiegeschiedenis.

### Prompt Fase 6

Bouw inventaris op werkbon inclusief verhuur/facturatie-opties, managementgoedkeuring en klantzichtbaarheid per regel.

### Prompt Fase 7

Bouw QR-code en scanflow met opaque tokens, login redirect, PWA scanner, veldniveau-autorisatie en auditlogging.

### Prompt Fase 8

Bouw inventarisstoringen, onderhoud, keuringen, notificaties, documenten/foto's en dashboards.
