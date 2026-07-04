# Fieldgrid Sprint 14 - Usage, branding en operational readiness

Datum: 2026-07-04
Status: geimplementeerd met `runtime-proof-open` voor Playwright/integration bewijs.
Scope: platform-admin tenantdetail, usage dashboard, branding preview en operational readiness.

## Oplevering

Sprint 14 maakt tenantgezondheid zichtbaar op de bestaande platform-admin tenantdetailpagina.

Geleverd:

- Usage dashboard met gebruikers, documenten, opdrachten, storage, downloads/PDF audit, actieve modules, sectoren, regio's, support grants en planlimieten.
- Branding preview voor Backoffice, Klantportaal, Personeelsapp, E-mail en PDF.
- Operational readiness score voor host, login, modules, sectoren, regio's, storage, PDF/downloads, migraties en audit.
- Storage-indicatie via tenant-prefixed documenten en legacy storagepaden.
- Read-only planlimieten op basis van `plan_limits` voor het actieve pakket.

## Databronnen

Deze sprint gebruikt alleen bestaande tabellen en helpers:

- `tenant_users`
- `documents`
- `assignments`
- `tenant_modules`
- `tenant_sectors`
- `tenant_regions`
- `support_access_grants`
- `audit_log`
- `support_access_audit_log`
- `plan_limits`
- `tenant_domains`
- `getTenantBranding`
- `getTenantPlanSnapshot`

Er is geen migratie nodig. De sprint schrijft geen tenantdata en past geen RLS/storage policy aan.

## Testcontract

Relevante test-id's:

- `FG-OPS-003`: usage dashboard.
- `FG-OPS-004`: branding preview.
- `FG-AUDIT-001`: download/PDF auditbewijs.
- `FG-STORAGE-001` en `FG-STORAGE-007`: tenant-prefixed storage en legacy cleanup status.
- `FG-MIG-001` t/m `FG-MIG-003`: blijven relevant voor migraties, maar deze sprint heeft geen migratie.

Automatisch toegevoegd:

- `tests/fieldgrid-sprint-14-operational-readiness.test.mjs`

Nog open als runtime bewijs:

- Playwright voor platform-admin tenantdetail met Tenant A/B/Veele fixturedata.
- Integration bewijs dat download/PDF audit-events per tenant correct worden geteld.
- Storage policy/path guessing bewijs blijft bij sprint 9/15/16 horen.

## Supabase changelog

Supabase changelog gecontroleerd op 2026-07-04: https://supabase.com/changelog.md.

Relevante conclusie: de recente Data API/RLS aandacht voor nieuwe public-tabellen raakt deze sprint niet, omdat Sprint 14 geen nieuwe tabellen of migraties toevoegt en alleen bestaande tenantdata read-only aggregeert.

## Rollback

Rollback is code-only:

- Verwijder de extra usage/readiness velden uit `platform-tenants.ts`.
- Verwijder de extra kaarten uit de tenantdetailpagina.
- Er is geen database rollback nodig.
