# Research: materiaalbeheer en inventarisbeheer

Datum: 2026-07-03
Status: fase-0 canon, ontwerp en onderzoeksdocument. Geen runtime-functionaliteit.

## 1. Samenvatting

Fieldgrid krijgt twee nieuwe tenantmodules:

- `materials`: materiaalbeheer voor verbruiksartikelen, voorraad, voorraadmutaties, materiaalverbruik op werkbonnen en facturatiecontrole.
- `inventory`: inventarisbeheer voor unieke bedrijfsmiddelen, locatie, QR-code, scanning, storingen, onderhoud, keuringen en optionele verhuur/facturatie.

De modules sluiten aan op de bestaande Fieldgrid-keten:

`Tenant -> Klanten -> Objecten -> Werkbonnen / Opdrachten -> Taken -> Personeel -> Uitvoering -> Rapportage -> Facturatie`

Belangrijkste codebase-bevindingen:

- Er bestaat al `assignment_material_usage` in het opdrachtmodel.
- De personeels-PWA heeft al een mobiele flow voor `Materiaal / Verbruik` op werkbonnen.
- Het bestaande materiaalverbruik is nog vrije tekst met hoeveelheid en prijs, zonder catalogus, productcode, voorraadlocatie, voorraadmutatie, directe tenantkolom of goedkeuringsflow.
- Factuurvoorstellen lezen materiaalverbruik al mee, maar dat moet worden vervangen door een expliciete managementgoedkeuring.
- Er zijn nog geen module keys `materials` en `inventory`.
- Er zijn nog geen module-permission mappings voor materiaal of inventaris.
- Documenten, auditlog, notifications, tenant-bound storage helpers, customer/personnel tickets en bestaande RLS-patronen kunnen worden hergebruikt.

## 2. Vastgelegde productbesluiten

Deze besluiten zijn leidend voor implementatie.

### 2.1 Codes

Alle catalogusmaterialen en inventarisitems krijgen tenant-unieke codes:

- Materiaal: `M00001`, `M00002`, enzovoort.
- Inventaris: `I000001`, `I000002`, enzovoort.

Codes zijn per tenant uniek, stabiel en worden niet hergebruikt na archiveren.

### 2.2 Materiaalgoedkeuring

Materiaal wordt financieel beoordeeld tijdens bon-/rapportgoedkeuring door management.

Management kan per materiaalregel aanpassen:

- aantal;
- omschrijving;
- eenheid;
- verkoopprijs per stuk;
- BTW;
- factureerbaar ja/nee;
- klantzichtbaar ja/nee.

Management mag een regel op `EUR 0,00` zetten, een bedrag toevoegen, een bedrag wijzigen of de regel intern houden. Een `EUR 0,00` regel blijft alleen zichtbaar voor de klant wanneer `customer_visible = true` staat.

Prijsinvoer is per stuk. Het totaal wordt berekend uit goedgekeurd aantal maal goedgekeurde verkoopprijs per stuk.

Elke handmatige prijs- of factureerbaarheidswijziging vereist een reden.

### 2.3 Personeelsinvoer

Personeel voert geen prijzen in. Personeel registreert maximaal:

- productcode of materiaalkeuze;
- materiaalnaam bij `Overig`;
- aantal;
- eenheid waar nodig;
- bronlocatie of verbruiksactie waar relevant;
- opmerking;
- foto optioneel.

`Overig` blijft mogelijk. Management bepaalt bij goedkeuring of de regel kosten krijgt en of die eventueel aan een bestaand of nieuw materiaalproduct wordt gekoppeld.

### 2.4 Voorraadverbruik

Er komt een verbruiksoptie waarmee personeel aangeeft dat materiaal echt uit voorraad wordt gepakt. Bijvoorbeeld: iemand pakt een rol, klikt `verbruik`, en de voorraad gaat omlaag.

Materiaalregistratie, voorraadmutatie en facturatie blijven gescheiden:

- registratie beschrijft wat op de werkbon is gebruikt;
- voorraadmutatie beschrijft wat fysiek uit voorraad is gegaan;
- facturatie beschrijft wat klantzichtbaar/factureerbaar wordt.

Management krijgt optioneel de mogelijkheid om bij correctie ook voorraad aan te passen, maar een financiele wijziging mag niet automatisch fysieke voorraad herschrijven.

Negatieve voorraad mag bestaan, maar moet duidelijk worden gesignaleerd.

### 2.5 Rollen

Materiaal goedkeuren, prijzen aanpassen en factureerbaarheid bepalen mag via tenantrollen door:

- eigenaar;
- admin;
- finance;
- management.

Dit mag niet hardcoded op rolnaam alleen; de runtime-bron blijft tenant-RBAC.

### 2.6 Klantzichtbaarheid

Klantzichtbaarheid is per regel instelbaar.

Klanten zien:

- alleen klantzichtbare materiaal- of inventarisregels;
- nooit kostprijzen;
- geen interne voorraadlocaties;
- geen personeelsvoorraad;
- inventaris standaard niet, tenzij expliciet klantzichtbaar/factureerbaar.

### 2.7 Inventaris en verhuur

Inventaris is standaard intern. Bij verhuur of doorbelasting kan inventaris op een werkbon financieel worden beoordeeld door management:

- factureerbaar ja/nee;
- klantzichtbaar ja/nee;
- verkoopprijs/verhuurprijs per stuk of periode;
- BTW;
- reden bij wijziging;
- goedkeuringsstatus.

## 3. Codebase-analyse

### 3.1 Modules

Huidige module keys bevatten onder meer `customers`, `objects`, `personnel`, `assignments`, `reporting`, `documents`, `finance`, `customer_portal`, `personnel_portal`, `notifications` en `smart_planning`.

Nog nodig:

- `materials`;
- `inventory`.

Nieuwe resources moeten in de centrale module-permission mapping worden opgenomen, zodat API, backoffice, portalen en jobs dezelfde modulegrens gebruiken.

### 3.2 RBAC

Fieldgrid gebruikt permissies in de vorm `resource:action`, met runtime RBAC via tenantrollen. Nieuwe permissies moeten normale tenant-permissies zijn. Globale rollen blijven templates; runtime-toegang loopt via tenantrollen.

### 3.3 Tenant-scope

Nieuwe runtime-tabellen moeten direct tenant-aware zijn:

- `tenant_id not null`;
- geen default naar `DEFAULT_TENANT_ID`;
- indexen op tenant-id;
- tenantconsistentie bij parentrelaties;
- RLS volgens bestaande patterns.

Parent-scoped is alleen tijdelijk acceptabel voor pure join-tabellen wanneer tenantconsistentie door trigger/constraint wordt afgedwongen.

### 3.4 Bestaand materiaalverbruik

Bestaande `assignment_material_usage` bevat nu globaal:

- `assignment_id`;
- `name`;
- `quantity`;
- `unit_price`;
- `unit_label`;
- `notes`;
- `created_by`;
- timestamps.

Nodige uitbreiding:

- `tenant_id`;
- `material_id`;
- `material_code_snapshot`;
- geregistreerde velden;
- goedgekeurde velden;
- `uses_stock`;
- `is_other`;
- `stock_location_id`;
- `stock_movement_id`;
- `invoiceable`;
- `customer_visible`;
- `approval_status`;
- `approval_reason`;
- auditvelden.

### 3.5 PWA

De personeels-PWA heeft al een werkbonflow met `Materiaal / Verbruik`. Die moet worden uitgebreid met catalogusselectie, productcode, `Overig`, voorraadverbruik en offline idempotency. Personeel ziet geen prijzen.

### 3.6 Facturatie

Factuurvoorstellen nemen materiaal nu al mee. Dit wordt vervangen door:

- alleen goedgekeurde regels;
- alleen factureerbare regels;
- prijs uit goedgekeurde snapshots;
- klantzichtbaarheid apart;
- auditlog op elke aanpassing.

### 3.7 Documenten en storage

Bestaande documenten en tenant-bound storage helpers kunnen worden hergebruikt. Nodige entity types:

- `material`;
- `inventory_item`;
- `inventory_issue`;
- `inventory_maintenance`.

Aanbevolen opslagpaden:

- `tenant/{tenantId}/materials/{materialId}/images/...`;
- `tenant/{tenantId}/inventory/{inventoryItemId}/images/...`;
- `tenant/{tenantId}/inventory/{inventoryItemId}/documents/...`;
- `tenant/{tenantId}/inventory/{inventoryItemId}/labels/...`.

### 3.8 Tickets en storingen

Bestaande klant- en personeelstickets zijn bruikbaar als patroon. Voor inventarisstoringen is een domeintabel `inventory_issues` nodig, optioneel later gekoppeld aan message threads.

## 4. Datamodelvoorstel

### 4.1 Materiaal

Nieuwe tabellen:

- `material_categories`;
- `materials`;
- `tenant_sequences`;
- `stock_locations`;
- `material_stock_balances`;
- `material_stock_movements`.

`materials` bevat minimaal:

- `tenant_id`;
- `code` als `M00001`;
- categorie;
- naam;
- omschrijving;
- eenheid;
- kostprijs optioneel;
- verkoopprijs optioneel;
- BTW;
- leverancier optioneel;
- barcode optioneel;
- afbeelding/document optioneel;
- actief/archiefvelden;
- minimum/maximumvoorraad;
- standaard factureerbaar;
- auditvelden.

Voorraadlocaties ondersteunen minimaal object en personeelslid, later voertuig, magazijn, kantoor en tijdelijke locatie.

Voorraad bestaat uit:

- actuele balans per materiaal per locatie;
- append-only mutatielog.

### 4.2 Werkbonmateriaal

`assignment_material_usage` wordt uitgebreid, niet destructief vervangen. Legacy regels blijven zichtbaar.

Nieuwe laag:

- geregistreerde velden door personeel;
- voorraadvelden;
- goedkeuringsvelden door management;
- facturatievelden;
- klantzichtbaarheid;
- auditvelden.

### 4.3 Inventaris

Nieuwe tabellen:

- `inventory_categories`;
- `inventory_items`;
- `inventory_movements`;
- `inventory_issues`;
- `inventory_maintenance_events`;
- `assignment_inventory_items`.

`inventory_items` bevat minimaal:

- `tenant_id`;
- `code` als `I000001`;
- categorie;
- naam;
- type/merk/model;
- serienummer;
- aanschafdata/waarde optioneel;
- status;
- huidige locatie;
- gekoppeld object/personeel;
- QR-token;
- documenten/foto;
- onderhouds- en keuringsvelden;
- actief/archiefvelden.

`assignment_inventory_items` ondersteunt operationeel gebruik en optionele verhuur/facturatie na managementgoedkeuring.

## 5. UI/UX voorstel

### 5.1 Backoffice materiaal

Routes:

- `/materials`;
- `/materials/[id]`;
- `/materials/usage`;
- objectdetail tab `Materiaal / Voorraad`;
- personeelsdetail panel/tab `Materiaal / Voorraad`.

Schermen:

- materiaaloverzicht;
- productdetail;
- aanmaken/bewerken/archiveren;
- voorraad per locatie;
- voorraadmutaties;
- materiaalverbruik ter controle;
- lage/negatieve voorraad signalen.

### 5.2 Bon-goedkeuring

Bon-/rapportgoedkeuring krijgt een blok `Materiaal en inventaris`.

Management kan daar materiaal- en inventarisregels financieel beoordelen, `EUR 0,00` kiezen, klantzichtbaarheid bepalen, BTW aanpassen en verplichte redenen vastleggen.

### 5.3 Backoffice inventaris

Routes:

- `/inventory`;
- `/inventory/[id]`;
- QR-sectie/detail;
- objectdetail tab `Inventaris`;
- personeelsdetail panel/tab `Inventaris`.

Schermen:

- inventarisoverzicht;
- inventarisdetail;
- aanmaken/bewerken/archiveren;
- QR-code bekijken/downloaden/printen;
- locatie wijzigen;
- storingsoverzicht;
- onderhoud/keuringen.

### 5.4 Personeels-PWA

Materiaal:

- product zoeken op code/naam;
- `Overig`;
- `Uit voorraad gebruiken`;
- bronlocatie;
- aantal;
- opmerking/foto;
- offline queue;
- geen prijsvelden.

Inventaris:

- QR scannen;
- handmatige code-invoer;
- detail zien afhankelijk van rechten;
- storing melden;
- inventaris aan werkbon koppelen indien toegestaan.

### 5.5 Klantportaal

Standaard geen inventaris en geen interne materiaalvoorraad. Klanten zien alleen regels die expliciet klantzichtbaar zijn gemaakt.

## 6. Rechtenmodel

Materiaalpermissies:

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

Inventarispermissies:

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

## 7. RLS en security

Verplicht:

- directe tenant-id op runtime-data;
- module checks;
- permission checks;
- entity tenant checks;
- support/platform-grenzen respecteren;
- QR-token is alleen lookup, nooit autorisatie;
- signed URLs alleen na permissiecheck;
- downloads van gevoelige documenten auditloggen.

Personeel ziet alleen data via:

- eigen actieve personeelsprofiel;
- eigen opdracht;
- eigen voorraad;
- uitgegeven inventaris;
- expliciet toegestane objectcontext.

Klanten zien alleen expliciet klantzichtbare regels en nooit kostprijzen of interne locaties.

## 8. Auditlog

Log minimaal:

- materiaal aangemaakt/gewijzigd/gearchiveerd;
- voorraad aangepast/verplaatst/verbruikt;
- materiaal op werkbon geregistreerd;
- `Overig` regel aangemaakt;
- materiaal gekoppeld aan product;
- materiaal goedgekeurd;
- prijs op `EUR 0,00` gezet;
- prijs handmatig aangepast;
- klantzichtbaarheid aangepast;
- voorraadcorrectie vanuit bon-goedkeuring;
- inventarisitem aangemaakt/gewijzigd/gearchiveerd;
- inventaris verplaatst/toegewezen;
- QR-code gegenereerd/geroteerd;
- inventaris gescand;
- inventaris gekoppeld aan opdracht;
- inventaris verhuur/facturatie goedgekeurd;
- storing gemeld/opgelost;
- keuring/onderhoud toegevoegd;
- gevoelig document bekeken/gedownload.

## 9. Notificaties

Materiaal:

- lage voorraad;
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

## 10. Implementatiefases

Het uitvoerbare faseplan staat in `docs/plan-material-inventory-management.md` en verdeelt de implementatie van fase 0 t/m fase 12.

## 11. Acceptatiecriteria voor dit canon

Dit canon is gereed wanneer:

- materiaal en inventaris duidelijk gescheiden zijn;
- alle productbesluiten zijn vastgelegd;
- codeformats `M00001` en `I000001` zijn vastgelegd;
- bon-goedkeuring, `EUR 0,00`, klantzichtbaarheid en prijsreden zijn vastgelegd;
- voorraad en facturatie gescheiden zijn;
- negatieve voorraad is benoemd;
- tenant-scope, RBAC, RLS, audit, storage en notificaties zijn beschreven;
- fases en testmatrix bestaan.
