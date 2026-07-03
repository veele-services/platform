# Uitvoerbaar faseplan: materiaalbeheer en inventarisbeheer

Datum: 2026-07-03
Broncanon: `docs/research-material-inventory-management.md`
Status: afgerond uitvoeringsplan; productie-readiness wordt bewaakt via `docs/fieldgrid-material-inventory-production-readiness.md` en `pnpm run fieldgrid:material-inventory-phase12:check`.

## 1. Doel

Dit plan verdeelt het volledige canon voor materiaalbeheer en inventarisbeheer in uitvoerbare fases. Aan het einde van dit plan zijn beide modules volledig ontworpen, gebouwd, getest en uitgerold binnen Fieldgrid.

Eindresultaat:

- Materiaalbeheer met codes `M00001`, catalogus, voorraad, voorraadmutaties, materiaal op werkbonnen, PWA-verbruik, managementgoedkeuring en facturatie.
- Inventarisbeheer met codes `I000001`, locatiebeheer, QR-code, scanning, werkbonkoppeling, verhuur/facturatie, storingen, onderhoud en keuringen.
- Tenant-isolatie, RBAC, module-entitlements, auditlog, notificaties, storage en dashboards zijn volledig aangesloten.

## 2. Releaseprincipes

Tijdens alle fases gelden deze regels:

- Staging moet zo veel mogelijk bereikbaar blijven.
- Geen destructieve migraties zonder backfill en validatie.
- Nieuwe kolommen eerst veilig toevoegen, daarna pas hard maken.
- Oude flows blijven werken tot de nieuwe flow bewezen werkt.
- Elke fase is apart deploybaar.
- Elke fase voegt tests toe die passen bij het risico.
- Tenant A/B/Veele isolatie blijft verplicht.
- Geen Veele-hardcoded logica.
- Nieuwe runtime-data krijgt `tenant_id` en geen fallback naar `DEFAULT_TENANT_ID`.
- Module checks, permissies en tenant checks zijn verplicht bij elke route/action/API.

## 3. Faseoverzicht

| Fase | Naam | Resultaat |
| --- | --- | --- |
| 0 | Canon en voorbereiding | Besluiten, taken, risico's en testbasis vastgelegd |
| 1 | Module- en schemafundering | Modules, permissions, tabellen, sequences en migraties bestaan |
| 2 | Materiaalcatalogus en voorraadbasis | Backoffice kan materialen en voorraad beheren |
| 3 | Materiaal op werkbon en PWA | Personeel kan materiaal registreren en voorraad verbruiken |
| 4 | Bon-goedkeuring en materiaal-facturatie | Management bepaalt prijs, klantzichtbaarheid en facturatie |
| 5 | Inventarisbasis | Inventarisitems, codes, locatie en dossiers werken |
| 6 | Inventaris op werkbon en verhuur | Inventaris kan gebruikt/verhuurd en financieel beoordeeld worden |
| 7 | QR-code en scanflow | QR-scanning werkt veilig in PWA/backoffice |
| 8 | Storingen, onderhoud en keuringen | Issues, maintenance, inspections en opvolging werken |
| 9 | Documenten, media, audit en notificaties | Bestanden, logging en signalen zijn compleet geintegreerd |
| 10 | Dashboards, rapportage en exports | Managementoverzichten en rapportages zijn bruikbaar |
| 11 | Hardening, tests en staging rollout | Echte SaaS-isolatie en migraties zijn bewezen |
| 12 | Afronding en productie-readiness | Oude paden opgeschoond, canon bijgewerkt, plan klaar |

## 4. Fase 0: Canon en voorbereiding

### Doel

Alle functionele keuzes en technische grenzen definitief vastleggen voordat runtime-code wordt gebouwd.

### Taken

- Onderzoeksdocument afronden.
- Uitvoerbaar faseplan toevoegen.
- Testmatrix toevoegen.
- Productbesluiten vastleggen:
  - materiaalcodes `M00001`;
  - inventariscodes `I000001`;
  - materiaal wordt financieel beoordeeld tijdens bon-/rapportgoedkeuring;
  - personeel voert geen prijzen in;
  - `Overig` blijft mogelijk;
  - management mag regels op `EUR 0,00` zetten;
  - klantzichtbaarheid is per regel;
  - reden is verplicht bij prijs- of facturatieaanpassing;
  - voorraad en facturatie blijven gescheiden;
  - negatieve voorraad mag, maar moet zichtbaar gesignaleerd worden;
  - inventaris kan bij verhuur factureerbaar zijn.

### Acceptatie

- `docs/research-material-inventory-management.md` bestaat.
- `docs/plan-material-inventory-management.md` bestaat.
- `docs/testmatrix-material-inventory-management.md` bestaat.
- Geen runtime-code gewijzigd.
- Open vragen zijn niet blokkerend voor fase 1.

## 5. Fase 1: Module- en schemafundering

### Doel

De technische fundering leggen zonder volledige UI-workflows te bouwen.

### Taken

- Voeg module keys `materials` en `inventory` toe.
- Voeg module-permission mappings toe.
- Voeg basispermissies toe.
- Voeg `tenant_sequences` toe voor `M00001` en `I000001`.
- Voeg materiaal-tabellen toe:
  - `material_categories`;
  - `materials`;
  - `stock_locations`;
  - `material_stock_balances`;
  - `material_stock_movements`.
- Voeg inventaris-tabellen toe:
  - `inventory_categories`;
  - `inventory_items`;
  - `inventory_movements`;
  - `inventory_issues`;
  - `inventory_maintenance_events`;
  - `assignment_inventory_items`.
- Breid `assignment_material_usage` veilig uit.
- Backfill bestaande usage tenant-id via assignments.
- Breid document entity types uit.
- Voeg RLS skeleton en tenantconsistentie toe.

### Tests

- Typecheck.
- Migratie smoke op lege database.
- Migratie smoke op staging-copy.
- Static schema tests.
- Basis cross-tenant DB tests.

### Acceptatie

- Nieuwe schema's bestaan en exporteren correct.
- Oude PWA-materiaalflow blijft werken.
- Bestaande stagingdata blijft behouden.
- Migraties zijn herhaalbaar en staging-safe.

## 6. Fase 2: Materiaalcatalogus en voorraadbasis

### Doel

Backoffice kan materialen beheren en voorraad per object/personeel zien en muteren.

### Taken

- Bouw `/materials`.
- Bouw materiaal aanmaken/bewerken/archiveren.
- Genereer materiaalcodes als `M00001` per tenant.
- Bouw `/materials/[id]` met basisgegevens, voorraad, mutaties en verbruikshistorie.
- Bouw voorraadlocatiebeheer voor object en personeel.
- Bouw voorraad ontvangen, corrigeren en verplaatsen.
- Bouw negatieve voorraad signalering.
- Voeg objectdetail tab `Materiaal / Voorraad` toe.
- Voeg personeelsdetail panel/tab `Materiaal / Voorraad` toe.
- Voeg auditlogs toe.

### Tests

- Tenant A ziet geen materialen van Tenant B.
- Productcode is tenant-uniek.
- Gearchiveerd materiaal blijft zichtbaar in historie.
- Voorraadmutatie past balans aan.
- Negatieve voorraad toont waarschuwing.
- Dossierweergave toont alleen eigen tenantdata.

### Acceptatie

- Backoffice kan materiaalcatalogus en voorraad beheren.
- Voorraad op objecten en personeel is zichtbaar.

## 7. Fase 3: Materiaal op werkbon en PWA

### Doel

Personeel kan materiaal op een werkbon registreren via productcode, cataloguskeuze of `Overig`, met optioneel voorraadverbruik.

### Taken

- Breid PWA `Materiaal / Verbruik` uit.
- Voeg product zoeken op naam/code toe.
- Voeg `Overig` toe.
- Voeg `Uit voorraad gebruiken` toe.
- Laat bronlocatie kiezen wanneer voorraad wordt verbruikt.
- Schrijf geregistreerde velden naar `assignment_material_usage`.
- Schrijf voorraadmutatie wanneer `uses_stock = true`.
- Ondersteun offline queue met idempotency key.
- Toon geen prijsvelden aan personeel.
- Houd legacy materiaalregels leesbaar.

### Tests

- Personeel kan alleen materiaal boeken op eigen opdracht.
- Personeel kan geen prijs invullen.
- `Overig` kan worden opgeslagen.
- Catalogusmateriaal slaat code snapshot op.
- Voorraadverbruik verlaagt voorraad.
- Offline dubbele sync maakt geen dubbele mutatie.
- Direct ID guessing faalt.

### Acceptatie

- PWA-materiaalregistratie werkt mobile-first.
- Voorraadverbruik is optioneel en gescheiden van facturatie.

## 8. Fase 4: Bon-goedkeuring en materiaal-facturatie

### Doel

Management kan tijdens bon-/rapportgoedkeuring materiaalregels financieel beoordelen en corrigeren.

### Taken

- Voeg blok `Materiaal en inventaris` toe aan bon-/rapportgoedkeuring.
- Toon registratie, productcode of `Overig`, voorraadstatus, voorgestelde prijs, klantzichtbaarheid en factureerbaarheid.
- Laat management aanpassen:
  - aantal;
  - omschrijving;
  - eenheid;
  - verkoopprijs per stuk;
  - BTW;
  - factureerbaar;
  - klantzichtbaar.
- Reden verplicht maken bij prijs- of facturatiewijziging.
- Ondersteun `EUR 0,00`.
- Maak optionele voorraadcorrectie mogelijk zonder automatische koppeling aan financiele wijziging.
- Pas factuurvoorstel aan: alleen goedgekeurde factureerbare regels.
- Auditlog voor goedkeuring, prijswijziging, klantzichtbaarheid en factuurdoorstroom.

### Tests

- Management kan prijs op `EUR 0,00` zetten met reden.
- `EUR 0,00` is klantzichtbaar alleen bij `customer_visible = true`.
- Niet-goedgekeurde regels komen niet op factuurvoorstel.
- Niet-factureerbare regels komen niet op factuurvoorstel.
- Prijswijziging wijzigt fysieke voorraad niet automatisch.
- Personeel kan goedkeuringsvelden niet muteren.

### Acceptatie

- Materiaal kan veilig en controleerbaar financieel worden verwerkt.

## 9. Fase 5: Inventarisbasis

### Doel

Backoffice kan inventarisitems beheren met code, status, locatie en dossierweergave.

### Taken

- Bouw `/inventory`.
- Bouw inventarisitem aanmaken/bewerken/archiveren.
- Genereer inventariscodes als `I000001` per tenant.
- Bouw `/inventory/[id]`.
- Voeg locatiebeheer voor object en personeelslid toe.
- Voeg locatiegeschiedenis toe.
- Voeg statusbeheer toe.
- Voeg objectdetail tab `Inventaris` toe.
- Voeg personeelsdetail panel/tab `Inventaris` toe.

### Tests

- Inventariscode is tenant-uniek.
- Tenant A ziet geen inventaris van Tenant B.
- Item kan niet worden gekoppeld aan object/personeel van andere tenant.
- Locatiewijziging schrijft historie.
- Gearchiveerd item blijft historisch zichtbaar.

### Acceptatie

- Inventarisbeheer werkt intern in backoffice.

## 10. Fase 6: Inventaris op werkbon en verhuur

### Doel

Inventaris kan aan opdrachten worden gekoppeld en optioneel als verhuur of doorbelasting worden beoordeeld.

### Taken

- Voeg inventaris toevoegen aan werkbon toe.
- Voeg PWA-koppeling toe waar toegestaan.
- Voeg usage types toe: gebruikt, verhuurd, uitgegeven, retour, defect geconstateerd.
- Voeg financiele velden toe op `assignment_inventory_items`.
- Toon inventarisregels in bon-/rapportgoedkeuring.
- Laat management factureerbaarheid, klantzichtbaarheid, prijs, BTW en reden bepalen.
- Factuurvoorstel kan goedgekeurde factureerbare inventarisregels meenemen.

### Tests

- Inventaris is standaard niet factureerbaar.
- Management kan verhuur factureerbaar maken.
- Klant ziet inventaris alleen bij `customer_visible = true`.
- Onbevoegde gebruiker kan inventaris niet aan opdracht koppelen.
- Factuurvoorstel neemt alleen goedgekeurde factureerbare inventarisregels mee.

### Acceptatie

- Inventaris kan operationeel en financieel op werkbonnen worden gebruikt.

## 11. Fase 7: QR-code en scanflow

### Doel

Inventarisitems kunnen veilig worden gescand via QR-code.

### Taken

- Voeg `qr_token` generatie toe.
- Render QR-code als SVG/printbare view.
- Bouw scanroute met opaque token.
- Bouw PWA scanpagina.
- Voeg handmatige code-invoer als fallback toe.
- Login redirect bij niet-ingelogde gebruiker.
- Veldniveau-autorisatie na scan.
- QR-token rotatie voorbereiden.
- Auditlog voor scan events.

### Tests

- QR-url zonder login toont geen data.
- Onbekende token lekt geen data.
- Bevoegd personeel ziet toegestaan detail.
- Onbevoegde gebruiker ziet geen itemdetails.
- Scan wordt auditgelogd.
- Token is niet gelijk aan database-id.

### Acceptatie

- QR-scanning is veilig bruikbaar.

## 12. Fase 8: Storingen, onderhoud en keuringen

### Doel

Inventaris krijgt opvolging voor storingen, onderhoud en keuringen.

### Taken

- Bouw storing melden vanuit PWA.
- Bouw foto/video toevoegen bij storing.
- Bouw backoffice storingsoverzicht.
- Bouw storingdetail en opvolging.
- Voeg statusflow toe.
- Bouw onderhoud/keuring registreren.
- Voeg documenten/bewijsstukken toe.
- Toon open storingen op inventarisdetail, objectdossier en personeelsdossier.
- Voeg notificaties toe.
- Koppel optioneel aan message threads.

### Tests

- Personeel kan storing melden voor toegestaan item.
- Personeel kan geen storing melden op item van andere tenant.
- Open storing verschijnt op relevante dossiers.
- Oplossen schrijft auditlog.
- Verlopen keuring wordt gesignaleerd.
- Storage voor foto's is tenant-bound.

### Acceptatie

- Inventaris heeft operationele opvolging en onderhoudshistorie.

## 13. Fase 9: Documenten, media, audit en notificaties

### Doel

Ondersteunende platformlagen zijn volledig aangesloten.

### Taken

- Gebruik document entity types voor materiaal en inventaris.
- Bouw uploads voor materiaalafbeelding, inventarisfoto, inventarisdocument, onderhoudsbewijs en storingmedia.
- Voeg signed URL checks toe.
- Centraliseer auditlog voor gevoelige acties.
- Voeg notifications en event settings toe.
- Voeg security/download logging toe.

### Tests

- Storage path guessing faalt.
- Signed URL werkt alleen met rechten.
- Download van gevoelig document wordt gelogd.
- Notificaties worden tenant-scoped aangemaakt.
- Customer ziet geen interne media.

### Acceptatie

- Media, audit en notificaties zijn productiegeschikt aangesloten.

## 14. Fase 10: Dashboards, rapportage en exports

### Doel

Management krijgt overzicht en stuurinformatie.

### Taken

- Materiaaldashboard: lage voorraad, negatieve voorraad, verbruik, pending goedkeuringen.
- Inventarisdashboard: status, defecten, open storingen, verlopen keuringen, verhuur/gebruiksregels.
- Objectrapportage uitbreiden met klantzichtbare materiaalregels.
- Facturatierapportage uitbreiden.
- Exports toevoegen.
- Performance-indexen controleren.

### Tests

- Dashboardqueries zijn tenant-scoped.
- Klantzichtbare rapportage toont alleen toegestane regels.
- Exports bevatten geen data van andere tenants.
- Grote datasets blijven performant genoeg.

### Acceptatie

- Management kan materiaal en inventaris sturen via dashboards en rapportages.

## 15. Fase 11: Hardening, tests en staging rollout

### Doel

Bewijzen dat de modules SaaS-veilig en staging-stabiel zijn.

### Taken

- Bouw fixtures voor demo-a, demo-b en veele als gewone tenant.
- Bouw cross-tenant integration tests.
- Bouw Playwright host-first tests.
- Bouw PWA tests voor materiaal en QR-scan.
- Bouw DB/RLS tests.
- Bouw storage signed-url tests.
- Bouw migratie smoke workflow op lege DB en staging-copy.
- Test rollen, customer visibility, denial paths, factuurdoorstroom, auditlog en notifications.

### Minimum green before staging

- Typecheck groen.
- Build groen.
- Unit/integration tests groen.
- Migratie smoke leeg groen.
- Migratie smoke staging-copy groen.
- Cross-tenant tests groen.
- PWA materiaal happy/denial groen.
- QR scan happy/denial groen.
- Factuurvoorstel materiaal/inventaris groen.

### Acceptatie

- Nieuwe modules zijn aantoonbaar tenant-safe.

## 16. Fase 12: Afronding en productie-readiness

### Doel

Het gehele plan afronden en technische schuld uit de overgang verwijderen.

### Taken

- Oude legacy materiaalvelden niet meer runtime gebruiken, behalve als historische fallback.
- Nullable overgangskolommen valideren en waar veilig hard maken.
- Oude vrije tekst flows alleen nog als `Overig` ondersteunen.
- Docs bijwerken.
- Monitoring toevoegen voor negatieve voorraad, QR-denials, cross-tenant denials, migratiefouten en voorraadconflicten.
- Productie rollout checklist maken.
- Voeg `docs/fieldgrid-material-inventory-production-readiness.md` toe als productie-readinesscanon.
- Voeg `scripts/fieldgrid-material-inventory-phase12-readiness.mjs` toe als uitvoerbare readinesscheck.
- Bewaak fase 12 met `tests/fieldgrid-material-inventory-phase12.test.mjs` en de handmatige fase-12 workflow.

### Acceptatie

- Materiaalbeheer is compleet.
- Inventarisbeheer is compleet.
- Alle canonbesluiten zijn geimplementeerd.
- Alle migraties zijn staging-safe bewezen.
- Alle securitygrenzen zijn getest.
- Documentatie en testmatrix zijn actueel.
- Het plan is afgerond.
- Production-readiness is vastgelegd in `docs/fieldgrid-material-inventory-production-readiness.md`.
- `pnpm run fieldgrid:material-inventory-phase12:check` bewaakt de productie-readinesscanon.

## 17. Eindcriteria

Het gehele plan is klaar wanneer:

- `materials` en `inventory` als modules bestaan.
- Materiaalproducten codes `M00001` gebruiken.
- Inventarisitems codes `I000001` gebruiken.
- Personeel materiaal kan registreren zonder prijzen te zien.
- Personeel `Overig` kan registreren.
- Personeel optioneel voorraad kan verbruiken.
- Voorraad per object en personeelslid werkt.
- Negatieve voorraad mogelijk is en duidelijk wordt gesignaleerd.
- Management tijdens bon-goedkeuring materiaalregels kan aanpassen.
- Management regels op `EUR 0,00` kan zetten met reden.
- Klantzichtbaarheid per regel werkt.
- Alleen goedgekeurde factureerbare regels naar factuurvoorstel gaan.
- Inventarisitems kunnen worden beheerd en gelokaliseerd.
- Inventaris kan aan objecten en personeelsleden worden gekoppeld.
- Inventaris kan aan werkbonnen worden gekoppeld.
- Inventaris kan bij verhuur factureerbaar worden gemaakt.
- QR-code scanning veilig werkt.
- Inventarisstoringen, onderhoud en keuringen werken.
- Documenten/media tenant-bound zijn.
- Auditlog gevoelige acties vastlegt.
- Notificaties en dashboards werken.
- Cross-tenant, RLS, storage, PWA en facturatie tests groen zijn.
- Staging is zonder datareset door alle fases heen gekomen.
- Fase 12 readiness is groen voordat productiepromotie plaatsvindt.
