# Fieldgrid sprint 13 - Tenant first-run wizard

Datum: 2026-07-04
Status: geimplementeerd als tenant-owner first-run wizard zonder database- of migratiewijziging.
Test-id: `FG-OPS-002`.

## Doel

Sprint 13 vervangt de minimale tenant first-run checklist door een echte owner-flow. De tenant-eigenaar kan bedrijfsgegevens, branding, regio's en basisinstellingen opslaan, de status later hervatten en readiness warnings zien voordat de tenant live gaat.

## Oplevering

- `/first-run` toont een Tenant first-run wizard met:
  - bedrijfsgegevens;
  - branding;
  - sectoren;
  - regio's;
  - gebruikers;
  - modules;
  - basisinstellingen;
  - eerste klant/object/opdracht als optionele stap.
- `saveTenantFirstRunWizardDraft` slaat tenant-gescopeerd op in bestaande tabellen:
  - `organization_settings`;
  - `tenant_regions`;
  - `tenant_first_run_state`.
- `getTenantFirstRunWizard` berekent readiness uit bestaande tenantdata:
  - actieve sectoren;
  - actieve regio's;
  - actieve tenant users;
  - actieve modules;
  - klanten, objecten en opdrachten.
- `finishTenantFirstRunWizard` rondt alleen af als alle verplichte stappen klaar zijn.
- De bestaande `completeTenantFirstRunStep` en `skipTenantFirstRun` flows blijven beschikbaar voor compatibiliteit met sprint 11.

## Stagingveiligheid

Deze sprint introduceert geen nieuwe migratie. De bestaande `tenant_first_run_state.required_steps` en `completed_steps` velden worden gebruikt om de wizardstatus meetbaar te maken. Bestaande first-run rows worden bij lezen normaliseerd naar de nieuwe verplichte stappen, zonder tenantdata te resetten.

Er zijn geen nieuwe Supabase Data API/RLS-tabellen toegevoegd. De Supabase changelog is gecontroleerd; de recente wijziging rond automatisch exposed public tables is niet van toepassing omdat sprint 13 geen nieuwe tabel introduceert.

## Acceptatie

- Owner kan een concept opslaan en later hervatten.
- Readiness score en warnings worden gevuld uit tenantdata.
- De wizard toont duidelijke open/afgeronde stappen.
- Afronden faalt server-side wanneer verplichte readiness nog ontbreekt.

## Nog open voor latere runtime proof

- Playwright-flow met `A-OWNER` op `demo-a.fieldgrid.nl`.
- Integration test die `FG-OPS-002` met echte database- en hostcontext bewijst.
- Externe tenant livegang blijft afhankelijk van sprint 14-16 operational readiness en staging smoke.
