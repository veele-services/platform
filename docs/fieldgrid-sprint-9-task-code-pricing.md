# Fieldgrid Sprint 9 - Tenant task codes, prijzen en sector-economie

Datum: 2026-07-03  
Status: uitgevoerd op branch `codex/sprint-9-task-code-pricing-20260703`.  
Gerelateerd: `docs/fieldgrid-saas-masterplan.md`, `docs/fieldgrid-data-classification.md`, `docs/fieldgrid-cross-tenant-testmatrix.md`.

## Doel

Taakcodes en prijzen SaaS-productklaar maken zonder staging-data te resetten.

Sprint 9 volgt deze vaste besluiten:

- Bestaande `task_codes` blijven compatibel voor huidige backoffice-schermen.
- `task_codes.code` wordt per tenant uniek in plaats van globaal uniek.
- `tenant_task_codes` wordt de tenant override-laag voor code, naam, sector, planningvereisten en invoiceable-status.
- `tenant_task_code_prices` bewaart tenant-specifieke prijshistorie.
- `assignment_tasks` bewaart code-, naam-, prijs- en invoiceable-snapshots zodat offertes en facturen historisch stabiel blijven.
- Sectoren blijven harde tenantconfiguratie: taakcodes met sector buiten of disabled voor de tenant worden op toekomstige writes geweigerd.

## Scope uitgevoerd

- Schema-export uitgebreid met:
  - `tenantTaskCodesTable`;
  - `tenantTaskCodePricesTable`;
  - per-tenant unieke `task_codes` code-index;
  - assignment task snapshotkolommen.
- Staging-safe migratie `064_tenant_task_codes_prices.sql` toegevoegd.
- Bestaande task codes worden teruggevuld naar `tenant_task_codes`.
- Bestaande huidige prijzen worden teruggevuld naar `tenant_task_code_prices`.
- Bestaande assignment task rows krijgen snapshots waar task-code context bekend is.
- Nieuwe of gewijzigde `task_codes` synchroniseren automatisch naar tenant task codes en prijs-historie.
- Nieuwe of gewijzigde assignment task rows valideren task-code tenant, sector en snapshotten de actuele prijs.
- Factuurvoorstellen gebruiken assignment task snapshots met fallback naar oude task-code velden.
- Offertevoorstellen en offertetaken gebruiken assignment task snapshots met fallback naar oude task-code velden.

## Contract

Runtimegedrag vanaf deze sprint:

- Een code mag in Tenant A en Tenant B dezelfde tekst hebben.
- Een code mag binnen dezelfde tenant niet dubbel voorkomen.
- Een tenant task code mag alleen een sector gebruiken die voor die tenant bestaat en enabled is.
- Een assignment task mag geen task code of tenant task code uit een andere tenant gebruiken.
- Een assignment task snapshot wordt gezet bij insert/update van assignment, task code of tenant task code.
- Latere prijswijzigingen op een task code wijzigen bestaande assignment task snapshots niet.
- Factuur- en offertevoorstellen lezen eerst snapshotvelden en gebruiken alleen fallback voor legacy/ongesnapshotte rijen.

## Bewuste grenzen

- Geen uitgebreide prijswizard.
- Geen commerciële prijsoptimalisatie.
- Geen platform-admin UI voor tenant task-code overrides in deze sprint.
- Geen volledige rewrite van bestaande taakcode-backoffice; sync-triggers houden de nieuwe tabellen actueel.
- Geen echte Tenant A/B/Veele integration-test in deze PR, omdat deze sprint nog binnen de bestaande statische testbasis blijft.

## Acceptatie en test-id's

Sprint 9 raakt deze canonieke test-id's:

- `FG-SECTOR-001`
- `FG-SECTOR-002`
- `FG-SECTOR-003`
- `FG-SECTOR-006`
- `FG-DATA-006`
- `FG-DATA-007`
- `FG-MIG-001`
- `FG-MIG-002`

Statische bewaking: `tests/fieldgrid-sprint-9-task-code-pricing.test.mjs`.

Echte runtime-bewijsvoering blijft verplicht voor SaaS-acceptatie:

- Tenant A en Tenant B mogen dezelfde task-code `code` gebruiken zonder conflict.
- Duplicate code binnen dezelfde tenant faalt.
- Task code met Tenant B sector in Tenant A faalt.
- Assignment task met task code uit andere tenant faalt.
- Prijswijziging na assignment task aanmaak wijzigt bestaand offerte/factuurvoorstel niet.
- Veele gedraagt zich als gewone tenant in dezelfde tests.
- Migratie slaagt op lege database en staging-copy.

## Volgende sprint

Sprint 10 bouwt portalen, branding en tenantervaring:

- branding resolver per tenant;
- Veele-default teksten scheiden van Fieldgrid platform defaults;
- klantportaal en personeelsapp module/branding/storage acceptance.
