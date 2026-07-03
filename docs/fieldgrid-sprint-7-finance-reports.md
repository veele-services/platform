# Fieldgrid Sprint 7 - Finance en reports wave 2

Datum: 2026-07-03  
Status: uitgevoerd op branch `codex/sprint-7-finance-reports-20260703`.  
Gerelateerd: `docs/fieldgrid-saas-masterplan.md`, `docs/fieldgrid-data-classification.md`, `docs/fieldgrid-cross-tenant-testmatrix.md`.

## Doel

Downloadbare en financieel gevoelige kernrecords direct tenant-aware maken zonder staging-data te resetten.

Sprint 7 volgt deze vaste besluiten:

- `reports`, `quotes` en `invoices` krijgen een eigen tenantgrens via `tenant_id`.
- Bestaande staging-data wordt teruggevuld via sterke parentrelaties.
- Nieuwe rows mogen niet cross-tenant ontstaan wanneer assignment en customer niet bij dezelfde tenant horen.
- Bestaande parent-scoped applicatiechecks blijven als extra bescherming bestaan.
- Payments en payment batches blijven buiten scope en komen in Sprint 8.

## Scope uitgevoerd

- `reports.tenant_id` toegevoegd in schema-export.
- `quotes.tenant_id` toegevoegd in schema-export.
- `invoices.tenant_id` toegevoegd in schema-export.
- Tenant-indexen toegevoegd voor tenant, assignment, customer en invoice status reads.
- Staging-safe migratie `062_finance_reports_tenant_scope.sql` toegevoegd.
- Backfillvolgorde voor bestaande data toegevoegd:
  - reports via assignment;
  - quotes via assignment, daarna customer als fallback;
  - invoices via assignment, daarna customer als fallback.
- `NOT VALID` foreign keys naar `tenants` toegevoegd zodat bestaande staging-data inspecteerbaar blijft.
- Write-time tenant consistency triggers toegevoegd:
  - `trg_reports_set_tenant_id`;
  - `trg_quotes_set_tenant_id`;
  - `trg_invoices_set_tenant_id`.
- Triggers vullen `tenant_id` automatisch als bestaande create-paden die nog niet meesturen.
- Triggers blokkeren mismatch tussen expliciete `tenant_id`, assignment tenant en customer tenant.
- `tenant_id` wordt alleen `NOT NULL` als de backfill geen onopgeloste legacy-rijen vindt.

## PDF/download audit contract

Sprint 7 maakt de data-laag klaar voor uniforme PDF/download-audit op facturen, offertes en rapporten.

Contract voor alle bestaande en toekomstige PDF/download routes:

- Zoek het record altijd op `id + tenant_id` of op parent-scope die aantoonbaar naar dezelfde tenant terugleidt.
- Geef nooit een signed URL, PDF of downloadresponse voordat de tenantgrens is bewezen.
- Schrijf audit met minimaal tenant, actor, entity type, entity id, actie en timestamp.
- Customer-portal invoice PDF blijft customer/tenant scoped en moet onder `FG-PORTAL-C-004` en `FG-AUDIT-001` blijven vallen.
- Nieuwe quote/report PDF routes mogen pas worden toegevoegd met gekoppelde direct-ID denial tests.

## Bewuste grenzen

- Geen payments, `customer_payment_batches` of batch-items in deze sprint.
- Geen fysieke PDF/storage object-migratie in SQL.
- `NOT VALID` foreign keys worden nog niet gevalideerd zolang staging-copy niet heeft bewezen dat alle historische finance/report rows schoon zijn.
- Statische bewaking is toegevoegd; echte runtime-acceptatie blijft integration/DB/RLS bewijs.
- Parent-scoped runtimepaden blijven tijdelijk bestaan als extra guard, maar het doelmodel is directe `tenant_id` voor deze tabellen.

## Acceptatie en test-id's

Sprint 7 raakt deze canonieke test-id's:

- `FG-DATA-005`
- `FG-DATA-006`
- `FG-DATA-007`
- `FG-AUDIT-001`
- `FG-MIG-001`
- `FG-MIG-002`

Statische bewaking: `tests/fieldgrid-sprint-7-finance-reports.test.mjs`.

Echte runtime-bewijsvoering blijft verplicht voor SaaS-acceptatie:

- Tenant B kan Tenant A report-id of report/PDF-route niet openen.
- Tenant B kan Tenant A quote-id of quote/PDF-route niet openen.
- Tenant B kan Tenant A invoice-id of invoice/PDF-route niet openen.
- Download audit bevat tenant, actor, entity, actie en timestamp.
- Migratie slaagt op lege database en staging-copy.
- Insert/update met assignment/customer uit verschillende tenants faalt door database-trigger.

## Implementatiecontract

- Finance/report schemas hebben een directe `tenant_id` kolom.
- Nieuwe queries en routes gebruiken directe `tenant_id` zodra ze zelfstandig report, quote of invoice records lezen.
- Parent checks blijven toegestaan als extra controle, niet als vervanging voor het doelmodel.
- New-write compatibility wordt door de database geborgd zolang oudere create-paden nog geen `tenant_id` meesturen.
- Onopgeloste legacy-rijen worden gerapporteerd en mogen niet stil worden genegeerd.

## Volgende sprint

Sprint 8 bouwt payments, batches en audit wave 3/4:

- `payments.tenant_id`;
- `customer_payment_batches.tenant_id`;
- batch-items tenant-aware maken;
- payment webhook/status flows tenantguard geven;
- `audit_log` tenant-aware maken of splitsen in tenant audit en platform audit.
