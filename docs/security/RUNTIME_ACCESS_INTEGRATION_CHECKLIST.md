# Runtime Access Integration Checklist

Last updated: 2026-07-08

This checklist maps the sensitive-data access model to actual runtime paths. Status labels:

- `integrated`: server-side authorization, tenant scope, masking/export audit are wired.
- `tenant-scoped`: tenant isolation exists; no platform/support sensitive surface in that path.
- `platform-metadata`: platform path returns aggregate or operational metadata only.
- `business-policy`: legal/operational decision remains; not an implementation gap.

## Central Runtime Controls

| Control | Runtime file | Status | Evidence |
| --- | --- | --- | --- |
| Sensitive access lifecycle | `lib/db/src/sensitive-access.ts` | integrated | request, approve, deny, grant, revoke, break-glass and active grant checks write sensitive audit rows |
| Permission decision model | `lib/db/src/security-permissions.ts` | integrated | platform full-read/export for sensitive tenant data requires active grant; developers stay denied |
| Backoffice runtime resolver | `artifacts/backoffice/src/lib/security/sensitive-runtime.ts` | integrated | resolves Supabase actor, platform/support mode, tenant roles, active grant and audit metadata |
| Platform/support safe DTOs | `artifacts/backoffice/src/lib/security/safe-dtos.ts` | integrated | masks customer, contact, personnel, invoice and payment diagnostics |
| Security UI flow | `artifacts/backoffice/src/app/(platform)/platform/security/page.tsx` | integrated | request, approval, denial, active grant, revoke, break-glass and audit trail panels |

## Backoffice Runtime Paths

| Path | Scope | Classification | Required access | Masking | Export/download audit | Status |
| --- | --- | ---: | --- | --- | --- | --- |
| `actions/customers.ts:listCustomers/getCustomer/listCustomerContacts` | `tenant_customers_contacts` | 3 | tenant role or platform masked/grant | platform/support masked by default | view audit when sensitive decision requires | integrated |
| `actions/customers.ts:exportCustomers/exportCustomersPdf` | `tenant_customers_contacts` | 3 | `export` | no platform export without grant | `exportDownload: true` | integrated |
| `actions/personnel.ts:listPersonnel/getPersonnel` | `tenant_staff_employees` | 3 | tenant role or platform masked/grant | platform/support masked by default | view audit when sensitive decision requires | integrated |
| `actions/invoices.ts:getInvoice/exportInvoices` | `tenant_invoices` | 4 | masked/full/export by role/grant | platform/support masked by default | `exportDownload: true` for CSV | integrated |
| `actions/quotes.ts:getQuote/exportQuotes` | `tenant_invoices` | 4 | masked/full/export by role/grant | platform/support masked by default | `exportDownload: true` for CSV | integrated |
| `actions/payments.ts:getPaymentHistory/listPaymentsForCustomer` | `tenant_payments` | 4 | masked/full by role/grant | provider IDs masked, checkout URL omitted for platform/support | sensitive view audit | integrated |
| `actions/documents.ts:getDocumentDownloadUrl` | `attachments` | 5 | `full_read` by role/grant | no platform/support download without grant | `exportDownload: true`; no storage path/filename in audit metadata | integrated |
| `api/invoices/[id]/pdf` | `tenant_invoices` | 4 | `export` | platform export requires grant | `exportDownload: true` | integrated |
| `api/quotes/[id]/pdf` | `tenant_invoices` | 4 | `export` | platform export requires grant | `exportDownload: true` | integrated |
| `api/invoices/batches/[id]/pdf` | `tenant_invoices` | 4 | `export` | platform export requires grant | `exportDownload: true`; batch and items tenant-filtered | integrated |
| `api/reports/[id]/pdf` | `reports` | 3 | `export` | platform export requires grant for sensitive classifications | `exportDownload: true`; report tenant-filtered | integrated |
| Customer subresources in `actions/customers.ts` | `tenant_customers_contacts` | 3 | tenant write/read | direct customer IDs checked against active tenant | audit rows include tenant context where mutated | integrated |

## Platform And API Runtime Paths

| Path | Data | Status | Notes |
| --- | --- | --- | --- |
| `actions/platform-tenants.ts` | tenant settings, owner invites, aggregate usage | platform-metadata | No customer/personnel/payment rows are returned by default. Owner invite emails remain platform admin operational data. |
| `actions/platform-dashboard.ts` | aggregate platform metrics | platform-metadata | No tenant sensitive row payloads. |
| `actions/platform-accelerators.ts` | platform smoke/health/run metadata | platform-metadata | Email delivery counts are aggregate. |
| `api-server/src/routes/webhooks.ts` | payment webhook processing | integrated | Raw webhook body and full Mollie IDs are not logged; audit metadata stores masked payment references. |
| `api-server/src/routes/customers.ts` | tenant API customer CRUD | tenant-scoped | API middleware resolves active tenant; route queries verify tenant/customer scope. |

## Database/RLS Checks

| Check | Status | Evidence |
| --- | --- | --- |
| Sensitive access tables are additive | integrated | `lib/db/migrations/20260708120000_sensitive_data_access_controls.sql` |
| RLS enabled and direct anon/auth privileges revoked | integrated | Migration enables RLS and revokes table privileges. |
| Service-role/server code owns mutations | integrated | UI calls server actions; no client-side mutation path exists. |
| Tenant-owned finance/customer/document rows have tenant filters in changed runtime paths | integrated | Direct ID PDF, customer, document and payment paths now include tenant context checks. |

## Tests And Verification

| Verification | Status |
| --- | --- |
| `node --test tests/fieldgrid-sensitive-runtime-behavior.test.mjs ...` | green |
| `node_modules\.bin\tsc.cmd --build` | green |
| `..\..\node_modules\.bin\tsc.cmd -p tsconfig.json --noEmit` in `artifacts/backoffice` | green |
| `..\..\node_modules\.bin\tsc.cmd -p tsconfig.json --noEmit` in `artifacts/api-server` | green |

## Remaining Business/Legal Decisions

These are not implementation gaps in the current runtime integration:

- Confirm whether tenant admins should permanently have finance export rights, or whether this remains tenant owner/finance/bookkeeper only.
- Decide whether tenant owners must approve some platform sensitive grants in addition to platform owner approval for external-customer pilots.
- Define retention periods for sensitive access audit rows and support grant evidence.
- Define production procedure for security auditor role activation; current platform runtime roles are owner/admin/support.
