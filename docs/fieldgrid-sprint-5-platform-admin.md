# Fieldgrid Sprint 5 - Platform-admin MVP beheer

Datum: 2026-07-03  
Status: uitgevoerd op branch `codex/sprint-5-platform-admin-mvp-20260703`.  
Gerelateerd: `docs/fieldgrid-saas-masterplan.md`, `docs/fieldgrid-cross-tenant-testmatrix.md`, `docs/fieldgrid-rbac-permission-matrix.md`.

## Doel

De eerste bruikbare platform-admin beheerlaag bouwen waarmee tenants zonder SQL beheerd kunnen worden.

Sprint 5 volgt direct op Sprint 4:

1. platform-admin blijft gescheiden van tenant-admin;
2. gewone tenantgebruikers mogen platformroutes nooit gebruiken;
3. support access blijft expliciet en geaudit;
4. lifecycle- en configuratie-acties blijven staging-safe en gebruiken bestaande tabellen.

## Scope uitgevoerd

- Platform-admin tenantlijst uitgebreid met plan, status en detailnavigatie.
- Tenant create-flow toegevoegd voor tenant-shell met slug, plan en optioneel domein.
- Tenant detailpagina toegevoegd onder `/platform/tenants/[tenantId]`.
- Tenant lifecycle acties toegevoegd:
  - suspend;
  - reactivate;
  - archive.
- Domeinbeheer toegevoegd:
  - domein toevoegen;
  - domein verifieren;
  - primair domein zetten;
  - domein verwijderen.
- Planbeheer toegevoegd met actieve subscription-wissel en `tenants.plan_key` update.
- Modulebeheer toegevoegd met manual overrides en dependency-validatie:
  - dependency moet aan staan voordat afhankelijke module aan kan;
  - module kan niet uit als een effectieve afhankelijke module nog aan staat.
- Sectorbeheer toegevoegd:
  - sector aan/uit;
  - defaultsector;
  - single/multi mode;
  - max sectors;
  - enforce flag.
- Support grants UI toegevoegd op tenant detail:
  - grant aanmaken;
  - actieve grant openen;
  - grant revoken;
  - auditregels tonen.
- Basis usage-overzicht toegevoegd voor tenantbeheer en supporttriage.

## Bewuste grenzen

- Geen schema- of migratiewijzigingen.
- Geen volledige provisioning/onboarding wizard; dat blijft Sprint 11.
- Nieuwe tenant-create maakt een tenant-shell, geen volledige owner invite/provisioning flow.
- Platform audit gebruikt voorlopig de bestaande support/platform auditlog helper totdat de tenant/platform audit split in Sprint 8 wordt gebouwd.
- Geen billing-provider of automatische abonnementsfacturatie.
- Geen self-service signup.

## Acceptatie en test-id's

Sprint 5 raakt deze canonieke test-id's:

- `FG-PLATFORM-001`
- `FG-PLATFORM-002`
- `FG-PLATFORM-003`
- `FG-PLATFORM-004`
- `FG-PLATFORM-005`
- `FG-PLATFORM-006`
- `FG-SUPPORT-002`
- `FG-SUPPORT-005`
- `FG-AUDIT-003`
- `FG-MODULE-006`
- `FG-MODULE-008`
- `FG-SECTOR-004`
- `FG-SECTOR-005`

Statische bewaking: `tests/fieldgrid-sprint-5-platform-admin.test.mjs`.

Echte runtime-bewijsvoering blijft verplicht voor SaaS-acceptatie:

- platform owner/admin kan `/platform` en tenant detail openen;
- inactive platform admin faalt;
- gewone tenant user faalt op platformroutes;
- lifecycle acties zijn transactioneel en geaudit;
- module dependency blocks werken runtime;
- support grant create/revoke schrijft audit;
- sector disable faalt als data de sector nog gebruikt.

## Implementatiecontract

- Alle platform tenant admin actions gebruiken `requirePlatformAdmin()`.
- Platform support users krijgen geen tenantbeheer; ze zien alleen eigen supportgrants uit Sprint 4.
- Tenant create gebruikt bestaande tabellen: `tenants`, `tenant_subscriptions`, `tenant_domains`, `tenant_sector_settings`.
- Lifecycle update wijzigt `tenants.status`, `is_active` en auditvelden.
- Plan update wijzigt `tenants.plan_key` en vervangt actieve/trial subscription door een nieuwe manual active subscription.
- Module update schrijft naar `tenant_modules` met `source = manual`.
- Domain update raakt alleen niet-platform-reserved tenant domains.
- Sector update gebruikt bestaande tenant-sector policy en blokkeert default/in-use sector disable.
- Geen globale roles worden gebruikt voor platform-admin tenantbeheer.

## Volgende sprint

Sprint 6 start de data-normalisatie en storage wave 1:

- `documents.tenant_id` staging-safe backfill;
- shared storage path validator;
- tenant-prefixed document storage;
- upload/download/delete guards en storage tests.
