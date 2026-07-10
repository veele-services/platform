# Fieldgrid Invoice Canon - Sprint 0 Baseline

Datum: 2026-07-10
Branch baseline: `main`

## Doel

Sprint 0 legt vast wat de huidige factuurmodule doet voordat de canon-wijzigingen worden gebouwd. Deze sprint verandert nog geen businesslogica. De regressietests in deze sprint bewaken de bestaande factuurflows totdat latere sprints deze bewust vervangen door de nieuwe canon-flow.

## Huidige factuurflows

### Conceptfactuur aanmaken

- Bron: `artifacts/backoffice/src/app/actions/invoices.ts`.
- `createInvoice` vereist `invoices:write`.
- De huidige tenant wordt via `requireCurrentTenantId()` bepaald.
- De opdracht moet bij de huidige tenant horen en vanuit de statusflow naar `invoice_ready` mogen.
- Er mag geen bestaande factuur met status `draft`, `sent` of `paid` voor dezelfde opdracht zijn.
- De actie rekent `vatAmount` en `totalAmount` live uit op basis van formulierinvoer.
- De factuur wordt als `draft` opgeslagen.
- De opdracht wordt direct naar `invoice_ready` gezet.
- Er wordt auditlog geschreven met actie `create_invoice`.

### Verzenden

- Bron: `markInvoiceSent`.
- Alleen `draft` mag naar `sent`.
- Tenant-scope loopt via `getInvoiceAssignmentForCurrentTenant`.
- De gekoppelde opdracht wordt naar `invoiced` gezet.
- Auditlog: `mark_invoice_sent`.
- Workflow event: `invoice_sent`.

### Betaald markeren

- Bron: `markInvoicePaid`.
- Alleen `sent` mag naar `paid`.
- `paidDate` wordt gezet op vandaag.
- De gekoppelde opdracht wordt eerst naar `paid` en daarna naar `closed` gezet.
- Auditlog: `mark_invoice_paid`.
- Workflow event: `invoice_paid`.

### Annuleren

- Bron: `cancelInvoice`.
- Alleen `draft` en `sent` mogen naar `cancelled`.
- De gekoppelde opdracht wordt teruggezet naar `report_approved`, zodat opnieuw gefactureerd kan worden.
- Auditlog: `cancel_invoice`.

### E-mail en PDF

- Bron: `emailInvoice`, `artifacts/backoffice/src/lib/invoice-pdf.ts`, `artifacts/klant-pwa/src/lib/invoice-pdf.ts`.
- E-mail mag alleen bij status `sent`.
- De backoffice genereert de PDF via `generateInvoicePdf`.
- Het klantportaal genereert PDF via `generateCustomerInvoicePdf`.
- PDF-regels worden nu live opgebouwd vanuit opdrachtdata/proposaldata; er is nog geen definitieve line-item snapshot.
- PDF gebruikt wel tenant brandingnaam, maar nog geen volledige snapshot van bedrijfsgegevens, betaalgegevens of template-instellingen.

### Mollie

- Bron: `artifacts/backoffice/src/app/actions/payments.ts`.
- Betaallink kan alleen voor status `sent`.
- `MOLLIE_API_KEY` is runtime-secret.
- Betalingen worden in `payments` opgeslagen met `tenantId`, `invoiceId`, Mollie-id, bedrag en checkout URL.
- Webhookflow markeert betaling/factuur betaald via tenant-guarded lookups.

## Huidige nummering, triggers en constraints

### Schema

- Bron: `lib/db/src/schema/invoices.ts`.
- `INVOICE_STATUSES` is nu: `draft`, `sent`, `paid`, `cancelled`.
- `invoiceNumber` is `varchar(30).notNull().unique().$defaultFn(() => "")`.
- `insertInvoiceSchema` omit `invoiceNumber`.
- De schema-comment verwijst naar `trg_invoices_set_number` en `FACT-YYYY-NNNN`, maar in de SQL-migraties is geen `trg_invoices_set_number` gevonden.

### Migraties

- De gegenereerde basismigratie maakt `invoice_number varchar(30) NOT NULL` met globale unique constraint `invoices_invoice_number_unique`.
- Latere tenant-hardening voegt `tenant_id`, tenant-indexen en de trigger `trg_invoices_set_tenant_id` toe.
- `062_post_migration_tenant_hardening.sql` voegt een `invoices_tenant_id_required_check` toe.
- Er is nog geen canon-nummeringstabel, sequence-tabel, finalization snapshot of tenant-scoped partial unique invoice-number index.

## Veilig te migreren data in latere sprints

- Bestaande facturen met `invoice_number` moeten hun nummer behouden.
- Bestaande facturen met status `sent` of `paid` moeten als administratief definitief worden behandeld bij backfill.
- Bestaande `draft` facturen hebben nu al een nummer; latere migratie moet expliciet bepalen of dit legacy nummer behouden blijft of alleen nieuw gedrag `draft` zonder nummer afdwingt.
- Bestaande `payments`, `customer_payment_batches` en auditlogs zijn tenant-aware via hardeningmigraties en mogen niet opnieuw aan een andere tenant gekoppeld worden.
- Bestaande PDF-downloadroutes moeten blijven werken voor backoffice en klantportaal.

## Canon-gaps voor vervolgsprints

- Drafts mogen volgens canon geen officieel factuurnummer krijgen.
- Nummering moet tenant-scoped zijn, niet globaal unique.
- Nummering moet configureerbaar zijn met prefix, format, padding, startnummer en resetperiode.
- Nummerclaim moet transaction-safe zijn.
- Finaliseren moet snapshots vastleggen van bedrijfsgegevens, instellingen, betaalgegevens en regels.
- PDF moet snapshot-based worden.
- `/instellingen/facturen` bestaat nog niet.
- Mollie-/betaalinstellingen horen tenant-beheerbaar te worden.
- Preview/test-PDF moet geen officieel nummer claimen.

## Sprint 0 tests

Toegevoegd:

- `tests/fieldgrid-invoice-canon-current-flow.test.mjs`
- `tests/fieldgrid-invoice-canon-current-pdf.test.mjs`
- `tests/fieldgrid-invoice-canon-current-numbering.test.mjs`

Deze tests documenteren de huidige werking en maken regressies zichtbaar voordat de canon-wijzigingen stapsgewijs worden ingevoerd.
