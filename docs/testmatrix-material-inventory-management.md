# Testmatrix: materiaalbeheer en inventarisbeheer

Datum: 2026-07-03
Broncanon: `docs/research-material-inventory-management.md`
Faseplan: `docs/plan-material-inventory-management.md`
Status: fase-0 testbasis. Geen runtime-functionaliteit.

## 1. Doel

Deze testmatrix legt vast welke security-, workflow- en acceptatietests nodig zijn voor de materiaal- en inventarismodules. Elke technische fase moet naar relevante test-id's verwijzen.

De matrix dekt:

- tenant-isolatie;
- module-entitlements;
- RBAC;
- materiaalcatalogus;
- voorraad en negatieve voorraad;
- PWA-materiaalverbruik;
- bon-/rapportgoedkeuring;
- facturatie;
- inventaris;
- QR-scanning;
- storingen, onderhoud en keuringen;
- storage, auditlog en notificaties.

## 2. Vaste tenants

| Tenant | Doel |
| --- | --- |
| `demo-a` | Tenant A voor happy paths en cross-tenant tests |
| `demo-b` | Tenant B voor denial paths |
| `veele` | Gewone tenant, geen platform-uitzondering |

## 3. Vaste actoren

| Actor | Beschrijving |
| --- | --- |
| Platform Owner | Actieve platformgebruiker voor platform/admin flows |
| Platform Admin inactive | Gedeactiveerde platform-admin voor denial paths |
| Support User no grant | Supportgebruiker zonder actieve grant |
| Support User grant A | Supportgebruiker met actieve grant voor `demo-a` |
| Tenant A Owner | Eigenaar/admin van `demo-a` |
| Tenant A Management | Managementrol van `demo-a` |
| Tenant A Finance | Finance rol van `demo-a` |
| Tenant A Planner | Planner/backoffice rol van `demo-a` |
| Tenant A Personnel | Personeelsgebruiker van `demo-a` |
| Tenant A Customer | Klantportaalgebruiker van `demo-a` |
| Tenant B Owner | Eigenaar/admin van `demo-b` |
| Tenant B Personnel | Personeelsgebruiker van `demo-b` |
| Tenant B Customer | Klantportaalgebruiker van `demo-b` |
| Veele Tenant User | Gebruiker van tenant `veele`, behandeld als gewone tenant |

## 4. Testtypes

| Type | Betekenis |
| --- | --- |
| static | Test op documentatie, exports, module keys, permissions of codepatronen |
| unit | Geisoleerde functie- of helpertest |
| integration | App/server-action/API test met databasefixtures |
| Playwright | Browser/PWA/backoffice route test |
| DB/RLS | Database- of policygerichte test |
| storage | Storage path en signed URL test |
| migration | Migratie smoke op lege DB of staging-copy |

## 5. Minimum green before staging

Voordat een fase met runtime-code naar staging gaat, moet minimaal groen zijn:

- typecheck;
- build;
- relevante unit/integration tests;
- relevante cross-tenant tests;
- migratie smoke op lege DB bij schemawijzigingen;
- migratie smoke op staging-copy bij data/backfill-wijzigingen;
- denial path voor Tenant A/B/Veele waar security geraakt wordt;
- storage signed URL tests bij bestanden/media;
- PWA happy/denial tests bij PWA-wijzigingen;
- factuurvoorstel tests bij financiele wijziging.

## 6. Module en entitlement tests

| Test-id | Actor | Context | Actie | Verwacht resultaat | Type | Fase |
| --- | --- | --- | --- | --- | --- | --- |
| MI-MOD-001 | Tenant A Owner | `materials` module actief | Open `/materials` | Materiaaloverzicht opent | Playwright/integration | 2 |
| MI-MOD-002 | Tenant A Owner | `materials` module uit | Open `/materials` | Toegang geweigerd of module-uit melding | Playwright/integration | 2 |
| MI-MOD-003 | Tenant A Owner | `inventory` module actief | Open `/inventory` | Inventarisoverzicht opent | Playwright/integration | 5 |
| MI-MOD-004 | Tenant A Owner | `inventory` module uit | Open `/inventory` | Toegang geweigerd of module-uit melding | Playwright/integration | 5 |
| MI-MOD-005 | Static | Schema | Controleer module keys | `materials` en `inventory` bestaan | static | 1 |
| MI-MOD-006 | Static | Permission mapping | Controleer resources | Nieuwe resources mappen naar juiste module | static | 1 |

## 7. Tenant-isolatie tests

| Test-id | Actor | Context | Actie | Verwacht resultaat | Type | Fase |
| --- | --- | --- | --- | --- | --- | --- |
| MI-TENANT-001 | Tenant A Owner | Materiaal van `demo-a` en `demo-b` | List materials | Alleen `demo-a` materiaal zichtbaar | integration/DB/RLS | 2 |
| MI-TENANT-002 | Tenant A Owner | Kent material id van `demo-b` | Open direct `/materials/{idB}` | 404/geen toegang | integration/Playwright | 2 |
| MI-TENANT-003 | Tenant A Owner | Inventaris van `demo-a` en `demo-b` | List inventory | Alleen `demo-a` inventaris zichtbaar | integration/DB/RLS | 5 |
| MI-TENANT-004 | Tenant A Owner | Kent inventory id van `demo-b` | Open direct `/inventory/{idB}` | 404/geen toegang | integration/Playwright | 5 |
| MI-TENANT-005 | Veele Tenant User | Veele als gewone tenant | List materials/inventory | Alleen Veele-data zichtbaar | integration | 2/5 |
| MI-TENANT-006 | Support User no grant | Geen grant | Open tenant materiaal/inventaris | Geen toegang | integration/Playwright | 2/5 |
| MI-TENANT-007 | Support User grant A | Actieve grant voor demo-a | Open demo-a materiaal/inventaris | Toegang volgens support scope, auditlog | integration | 2/5 |
| MI-TENANT-008 | Support User grant A | Probeert demo-b | Open demo-b materiaal/inventaris | Geen toegang | integration | 2/5 |

## 8. Materiaalcatalogus tests

| Test-id | Actor | Context | Actie | Verwacht resultaat | Type | Fase |
| --- | --- | --- | --- | --- | --- | --- |
| MI-MAT-001 | Tenant A Management | Nieuw materiaal | Maak product aan | Code `M00001` gegenereerd | integration | 2 |
| MI-MAT-002 | Tenant A Management | Tweede materiaal | Maak product aan | Code `M00002` gegenereerd | integration | 2 |
| MI-MAT-003 | Tenant B Management | Eerste materiaal tenant B | Maak product aan | Code `M00001` in tenant B toegestaan | integration | 2 |
| MI-MAT-004 | Tenant A Management | Bestaande code | Forceer dubbele code | Validatiefout | unit/integration | 2 |
| MI-MAT-005 | Tenant A Management | Gebruikt materiaal | Archiveer product | Product gearchiveerd, historie blijft | integration | 2 |
| MI-MAT-006 | Tenant A Personnel | Geen managementrechten | Open kostprijs | Kostprijs niet zichtbaar | integration/Playwright | 2 |
| MI-MAT-007 | Tenant A Customer | Klantportaal | Probeert materiaalcatalogus te openen | Geen toegang | Playwright | 2 |

## 9. Voorraad tests

| Test-id | Actor | Context | Actie | Verwacht resultaat | Type | Fase |
| --- | --- | --- | --- | --- | --- | --- |
| MI-STOCK-001 | Tenant A Management | Materiaal op objectlocatie | Ontvang voorraad | Balans stijgt, mutatie geschreven | integration | 2 |
| MI-STOCK-002 | Tenant A Management | Materiaal bij personeel | Verplaats naar object | Bron daalt, doel stijgt, mutaties zichtbaar | integration | 2 |
| MI-STOCK-003 | Tenant A Management | Correctie | Corrigeer voorraad | Balans aangepast, reden/audit aanwezig | integration | 2 |
| MI-STOCK-004 | Tenant A Personnel | Voorraad 0 | Verbruik 1 uit voorraad | Balans -1 toegestaan, waarschuwing zichtbaar | integration/Playwright | 3 |
| MI-STOCK-005 | Tenant A Customer | Klantportaal | Probeert voorraadlocaties te zien | Geen interne voorraad zichtbaar | Playwright | 2/3 |
| MI-STOCK-006 | Tenant A Owner | Objectdossier | Open materiaal tab | Alleen objectvoorraad voor eigen tenant | Playwright/integration | 2 |
| MI-STOCK-007 | Tenant A Owner | Personeelsdossier | Open materiaal panel | Alleen personeelsvoorraad voor eigen tenant | Playwright/integration | 2 |

## 10. PWA materiaalverbruik tests

| Test-id | Actor | Context | Actie | Verwacht resultaat | Type | Fase |
| --- | --- | --- | --- | --- | --- | --- |
| MI-PWA-MAT-001 | Tenant A Personnel | Eigen opdracht | Registreer catalogusmateriaal | Usage-regel met material id/code snapshot | Playwright/integration | 3 |
| MI-PWA-MAT-002 | Tenant A Personnel | Eigen opdracht | Registreer `Overig` | Usage-regel `is_other = true` | Playwright/integration | 3 |
| MI-PWA-MAT-003 | Tenant A Personnel | Eigen opdracht | Gebruik uit voorraad | Stock movement geschreven | integration | 3 |
| MI-PWA-MAT-004 | Tenant A Personnel | Eigen opdracht | Probeert prijs in te voeren | Geen prijsveld beschikbaar | Playwright/static | 3 |
| MI-PWA-MAT-005 | Tenant A Personnel | Opdracht van demo-b | Direct ID openen | 404/geen toegang | Playwright/integration | 3 |
| MI-PWA-MAT-006 | Tenant A Personnel | Offline draft | Sync dezelfde actie twee keer | Geen dubbele usage/mutatie | integration | 3 |
| MI-PWA-MAT-007 | Tenant A Personnel | Afgesloten opdracht | Materiaal toevoegen | Actie geblokkeerd | integration | 3 |

## 11. Bon-goedkeuring en facturatie tests

| Test-id | Actor | Context | Actie | Verwacht resultaat | Type | Fase |
| --- | --- | --- | --- | --- | --- | --- |
| MI-APPROVAL-001 | Tenant A Management | Pending materiaalregel | Goedkeur prijs 5,00 | Approved snapshot, auditlog | integration | 4 |
| MI-APPROVAL-002 | Tenant A Management | Pending materiaalregel | Zet prijs op `EUR 0,00` met reden | Approved met 0,00 en reden | integration | 4 |
| MI-APPROVAL-003 | Tenant A Management | Prijswijziging zonder reden | Opslaan | Validatiefout | unit/integration | 4 |
| MI-APPROVAL-004 | Tenant A Management | Regel `customer_visible = false` | Factuur/rapport klantview | Regel niet zichtbaar voor klant | integration/Playwright | 4 |
| MI-APPROVAL-005 | Tenant A Management | Regel `customer_visible = true`, 0,00 | Klantview | Regel zichtbaar met 0,00 | integration/Playwright | 4 |
| MI-APPROVAL-006 | Tenant A Finance | Approved invoiceable | Maak factuurvoorstel | Regel komt op voorstel | integration | 4 |
| MI-APPROVAL-007 | Tenant A Finance | Pending invoiceable | Maak factuurvoorstel | Regel komt niet op voorstel | integration | 4 |
| MI-APPROVAL-008 | Tenant A Finance | Approved not invoiceable | Maak factuurvoorstel | Regel komt niet op voorstel | integration | 4 |
| MI-APPROVAL-009 | Tenant A Personnel | Eigen usage | Probeert goedkeuringsvelden te muteren | Geen toegang | integration | 4 |
| MI-APPROVAL-010 | Tenant A Management | Wijzigt financieel aantal | Controleer voorraad | Voorraad niet automatisch gewijzigd | integration | 4 |

## 12. Inventarisbasis tests

| Test-id | Actor | Context | Actie | Verwacht resultaat | Type | Fase |
| --- | --- | --- | --- | --- | --- | --- |
| MI-INV-001 | Tenant A Management | Nieuw item | Maak inventarisitem | Code `I000001` gegenereerd | integration | 5 |
| MI-INV-002 | Tenant A Management | Tweede item | Maak inventarisitem | Code `I000002` gegenereerd | integration | 5 |
| MI-INV-003 | Tenant B Management | Eerste item tenant B | Maak inventarisitem | Code `I000001` toegestaan | integration | 5 |
| MI-INV-004 | Tenant A Management | Item naar object | Koppel aan object | Locatie en historie geschreven | integration | 5 |
| MI-INV-005 | Tenant A Management | Item naar personnel | Koppel aan personeelslid | Locatie en historie geschreven | integration | 5 |
| MI-INV-006 | Tenant A Management | Object van demo-b | Koppel item | Validatiefout/geen toegang | integration | 5 |
| MI-INV-007 | Tenant A Owner | Objectdossier | Open inventaris tab | Alleen eigen tenant inventaris | Playwright/integration | 5 |
| MI-INV-008 | Tenant A Owner | Personeelsdossier | Open inventaris panel | Alleen eigen tenant inventaris | Playwright/integration | 5 |

## 13. Inventaris op werkbon en verhuur tests

| Test-id | Actor | Context | Actie | Verwacht resultaat | Type | Fase |
| --- | --- | --- | --- | --- | --- | --- |
| MI-INV-WO-001 | Tenant A Planner | Eigen opdracht/item | Koppel inventaris aan opdracht | Joinregel aangemaakt | integration | 6 |
| MI-INV-WO-002 | Tenant A Planner | Item demo-b | Koppel aan opdracht demo-a | Geen toegang | integration | 6 |
| MI-INV-WO-003 | Tenant A Management | Inventarisregel | Laat intern | Niet klantzichtbaar/factureerbaar | integration | 6 |
| MI-INV-WO-004 | Tenant A Management | Verhuur | Maak factureerbaar met prijs en reden | Approved billing snapshot | integration | 6 |
| MI-INV-WO-005 | Tenant A Finance | Approved verhuurregel | Maak factuurvoorstel | Regel komt op voorstel | integration | 6 |
| MI-INV-WO-006 | Tenant A Customer | Customer view | Niet klantzichtbare inventaris | Niet zichtbaar | Playwright | 6 |
| MI-INV-WO-007 | Tenant A Customer | Customer view | Klantzichtbare verhuurregel | Wel zichtbaar zonder interne waarde | Playwright | 6 |

## 14. QR scan tests

| Test-id | Actor | Context | Actie | Verwacht resultaat | Type | Fase |
| --- | --- | --- | --- | --- | --- | --- |
| MI-QR-001 | Anonymous | Geldige QR-token | Open scanroute | Login redirect, geen data | Playwright | 7 |
| MI-QR-002 | Tenant A Personnel | Toegestaan item | Scan QR | Beperkt detail zichtbaar, auditlog | Playwright/integration | 7 |
| MI-QR-003 | Tenant A Personnel | Item demo-b | Scan QR | Geen itemdetails | Playwright/integration | 7 |
| MI-QR-004 | Tenant A Customer | QR-token intern item | Scan QR | Geen toegang | Playwright | 7 |
| MI-QR-005 | Tenant A Management | QR detail | Genereer label | QR bevat token, niet raw id | unit/integration | 7 |
| MI-QR-006 | Tenant A Management | Token rotatie | Roteer token | Oude token ongeldig | integration | 7 |

## 15. Storingen, onderhoud en keuringen tests

| Test-id | Actor | Context | Actie | Verwacht resultaat | Type | Fase |
| --- | --- | --- | --- | --- | --- | --- |
| MI-ISSUE-001 | Tenant A Personnel | Toegestaan item | Meld storing | Issue aangemaakt met tenant-id | integration/Playwright | 8 |
| MI-ISSUE-002 | Tenant A Personnel | Item demo-b | Meld storing | Geen toegang | integration | 8 |
| MI-ISSUE-003 | Tenant A Management | Open issue | Zet in behandeling | Status/audit bijgewerkt | integration | 8 |
| MI-ISSUE-004 | Tenant A Management | Open issue | Los op | Resolved velden en auditlog | integration | 8 |
| MI-MAINT-001 | Tenant A Management | Item | Registreer keuring | Maintenance event geschreven | integration | 8 |
| MI-MAINT-002 | Tenant A Management | Verlopen keuring | Open dashboard/detail | Verlopen signaal zichtbaar | Playwright/integration | 8/10 |
| MI-MAINT-003 | Tenant A Personnel | Storing met foto | Upload foto | Tenant-bound storage path | storage/integration | 8/9 |

## 16. Storage, audit en notificaties tests

| Test-id | Actor | Context | Actie | Verwacht resultaat | Type | Fase |
| --- | --- | --- | --- | --- | --- | --- |
| MI-STORAGE-001 | Tenant A Management | Materiaalafbeelding | Upload bestand | Path begint met tenant/{tenantId} | storage | 9 |
| MI-STORAGE-002 | Tenant A Management | Inventarisdocument | Maak signed URL | URL alleen na permissie | storage/integration | 9 |
| MI-STORAGE-003 | Tenant B User | Kent path demo-a | Vraag signed URL | Geen URL | storage/integration | 9 |
| MI-AUDIT-001 | Tenant A Management | Prijs naar 0,00 | Sla op | Auditlog met reden | integration | 4/9 |
| MI-AUDIT-002 | Tenant A Personnel | QR scan | Scan item | Auditlog scan event | integration | 7/9 |
| MI-NOTIF-001 | Tenant A Management | Lage voorraad | Trigger signaal | Tenant-scoped notification | integration | 9/10 |
| MI-NOTIF-002 | Tenant A Management | Verlopen keuring | Trigger signaal | Tenant-scoped notification | integration | 9/10 |

## 17. Dashboard en rapportage tests

| Test-id | Actor | Context | Actie | Verwacht resultaat | Type | Fase |
| --- | --- | --- | --- | --- | --- | --- |
| MI-DASH-001 | Tenant A Management | Lage/negatieve voorraad | Open dashboard | Alleen demo-a signalen | Playwright/integration | 10 |
| MI-DASH-002 | Tenant A Management | Open inventarisstoringen | Open dashboard | Alleen demo-a storingen | Playwright/integration | 10 |
| MI-REPORT-001 | Tenant A Customer | Rapport met klantzichtbaar materiaal | Open rapport | Zichtbare regels getoond | Playwright | 10 |
| MI-REPORT-002 | Tenant A Customer | Rapport met interne materiaalregel | Open rapport | Interne regel verborgen | Playwright | 10 |
| MI-EXPORT-001 | Tenant A Management | Export materiaal | Download export | Alleen demo-a data | integration | 10 |
| MI-EXPORT-002 | Tenant A Management | Export inventaris | Download export | Alleen demo-a data | integration | 10 |

## 18. Migratie tests

| Test-id | Actor | Context | Actie | Verwacht resultaat | Type | Fase |
| --- | --- | --- | --- | --- | --- | --- |
| MI-MIG-001 | CI | Lege DB | Run migraties | Slaagt zonder handwerk | migration | 1 |
| MI-MIG-002 | CI | Staging-copy | Run migraties | Slaagt zonder datareset | migration | 1 |
| MI-MIG-003 | CI | Bestaande material usage | Backfill tenant-id | Alle rows tenant-aware of gerapporteerd | migration | 1 |
| MI-MIG-004 | CI | Legacy usage | Nieuwe code leest legacy | Geen regressie PWA/rapportage | integration | 1/3 |
| MI-MIG-005 | CI | Hardening fase | Validate constraints | Geen unresolved rows of duidelijke rapportage | migration | 12 |

## 19. Fasekoppeling

| Fase | Verplichte testgroepen |
| --- | --- |
| 1 | MI-MOD, MI-TENANT basis, MI-MIG |
| 2 | MI-MAT, MI-STOCK basis, MI-TENANT |
| 3 | MI-PWA-MAT, MI-STOCK, MI-TENANT |
| 4 | MI-APPROVAL, MI-AUDIT, MI-REPORT basis |
| 5 | MI-INV, MI-TENANT |
| 6 | MI-INV-WO, MI-APPROVAL relevante facturatie |
| 7 | MI-QR, MI-AUDIT |
| 8 | MI-ISSUE, MI-MAINT, storage waar media raakt |
| 9 | MI-STORAGE, MI-AUDIT, MI-NOTIF |
| 10 | MI-DASH, MI-REPORT, MI-EXPORT |
| 11 | Alle happy en denial paden relevant voor staging |
| 12 | MI-MIG hardening, regressie en docs/static checks |

## 20. Acceptatie voor fase 0

Fase 0 is klaar wanneer:

- research-canon bestaat;
- faseplan bestaat;
- testmatrix bestaat;
- productbesluiten zijn vastgelegd;
- testmatrix bevat happy en denial paths;
- elke latere fase naar test-id's kan verwijzen;
- er is geen runtime-code aangepast.
