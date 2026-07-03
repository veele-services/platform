# Fieldgrid Sprint 8 - Payments, batches en audit wave 3/4

Datum: 2026-07-03  
Status: uitgevoerd op branch `codex/sprint-8-payments-audit-20260703`.  
Gerelateerd: `docs/fieldgrid-saas-masterplan.md`, `docs/fieldgrid-data-classification.md`, `docs/fieldgrid-cross-tenant-testmatrix.md`.

## Doel

Paymentflows en audit als SaaS-grens hard maken zonder staging-data te resetten.

Sprint 8 volgt deze vaste besluiten:

- `payments`, `customer_payment_batches` en `customer_payment_batch_items` krijgen een directe tenantgrens via `tenant_id`.
- `audit_log` krijgt een nullable `tenant_id`, zodat tenant-audit kan worden gescheiden van platform/global audit.
- Bestaande staging-data wordt teruggevuld via invoices, customers, batches en resource-specifieke audit-id's.
- Nieuwe payment- en batchrows mogen niet cross-tenant ontstaan wanneer invoice, customer, object of batch niet bij dezelfde tenant horen.
- Support audit blijft in `support_access_audit_log`; deze sprint maakt de algemene `audit_log` tenant-aware.

## Scope uitgevoerd

- `payments.tenant_id` toegevoegd in schema-export.
- `customer_payment_batches.tenant_id` toegevoegd in schema-export.
- `customer_payment_batch_items.tenant_id` toegevoegd in schema-export.
- `audit_log.tenant_id` toegevoegd in schema-export.
- Tenant-indexen toegevoegd voor payment, batch, batch item en audit reads.
- Staging-safe migratie `063_payments_batches_audit_tenant_scope.sql` toegevoegd.
- Backfillvolgorde toegevoegd:
  - payments via invoice, daarna assignment fallback;
  - customer payment batches via customer;
  - batch items via batch, daarna invoice/assignment fallback;
  - audit log via `metadata.tenantId` en daarna resource-specifieke ids.
- `NOT VALID` foreign keys naar `tenants` toegevoegd.
- Write-time tenant consistency triggers toegevoegd:
  - `trg_payments_set_tenant_id`;
  - `trg_customer_payment_batches_set_tenant_id`;
  - `trg_customer_payment_batch_items_set_tenant_id`;
  - `trg_audit_log_set_tenant_id`.
- Backoffice payments-action direct tenant-bound gemaakt:
  - payment history filtert op `payments.tenant_id` en `invoices.tenant_id`;
  - Mollie payment create schrijft tenantcontext in payment, Mollie metadata en audit;
  - Mollie webhook-afhandeling update alleen payment, invoice en assignment binnen dezelfde tenant;
  - customer payment listing filtert op `payments.tenant_id` en `invoices.tenant_id`.

## Auditcontract

`audit_log.tenant_id` blijft bewust nullable:

- tenantdata krijgt waar mogelijk `tenant_id` via directe insert, metadata of trigger-inferentie;
- platform-only/global audit mag `tenant_id IS NULL` blijven;
- support access audit blijft platform/support-specifiek in `support_access_audit_log`;
- tenant-admin auditviews mogen alleen `audit_log` rows tonen met de eigen `tenant_id`;
- platform/support auditviews mogen platform-only rows tonen, maar niet via gewone tenant-admin routes.

## Bewuste grenzen

- Geen automatische payment-provider productisering buiten bestaande Mollie-flow.
- Geen volledige tenant-admin audit UI in deze sprint.
- Geen RLS-policyfinalisatie in deze sprint; dit legt schema, backfill en write-time consistency vast.
- `audit_log.tenant_id` wordt niet `NOT NULL`, omdat platform/global audit legitiem geen tenant heeft.
- `NOT VALID` foreign keys worden pas gevalideerd na lege-db en staging-copy migratiesmoke.

## Acceptatie en test-id's

Sprint 8 raakt deze canonieke test-id's:

- `FG-DATA-008`
- `FG-DATA-009`
- `FG-AUDIT-002`
- `FG-AUDIT-003`
- `FG-AUDIT-004`
- `FG-AUDIT-005`
- `FG-MIG-001`
- `FG-MIG-002`

Statische bewaking: `tests/fieldgrid-sprint-8-payments-audit.test.mjs`.

Echte runtime-bewijsvoering blijft verplicht voor SaaS-acceptatie:

- Tenant B kan Tenant A payment niet lezen of updaten.
- Payment webhook kan geen invoice in een andere tenant markeren.
- Batch item met batch en invoice uit verschillende tenants faalt door database-trigger.
- Tenant-admin ziet alleen auditregels van eigen tenant.
- Platform/support audit blijft gescheiden van gewone tenant-admin audit.
- Migratie slaagt op lege database en staging-copy.

## Implementatiecontract

- Nieuwe payment- en batchrecords krijgen altijd `tenant_id`.
- Paymentstatus/webhook updates gebruiken tenantcontext uit het paymentrecord.
- Batch items moeten dezelfde tenant hebben als batch en invoice.
- Audit insert mag tenant expliciet meegeven, of tenant laten infereren via `metadata.tenantId` of resource-id.
- Onopgeloste legacy-rijen worden gerapporteerd en mogen niet stil worden genegeerd.

## Volgende sprint

Sprint 9 bouwt tenant task codes, prijzen en sector-economie:

- `tenant_task_codes` ontwerpen en migreren;
- prijshistorie ontwerpen;
- code uniqueness per tenant bepalen;
- prijs snapshotten voor offertes/facturen;
- sector guards voor task codes en planning intelligence afronden.
