# Fieldgrid Data Access Audit

## Scope and architecture inspected
- Monorepo with pnpm workspaces, TypeScript, Next.js backoffice/customer/personnel apps, an API server, Drizzle ORM and PostgreSQL/Supabase-style SQL migrations (`package.json`, `artifacts/*`, `lib/db/src`, `lib/db/migrations`).
- Database access is centralized through Drizzle `db` using `DATABASE_URL` in `lib/db/src/index.ts`; many runtime server paths therefore bypass browser RLS and must enforce tenant and permission checks in server code.
- Authentication uses Supabase Auth/session cookies in backoffice/customer/personnel apps (`artifacts/backoffice/src/lib/supabase/*`, `middleware.ts`) and user UUIDs stored in tenant/platform role tables.
- Authorization currently includes legacy role/permission tables (`roles`, `permissions`, `role_permissions`, `user_roles`), tenant role tables (`tenant_users`, `tenant_roles`, `tenant_user_roles`, `tenant_role_permissions`) and platform users/support grants (`platform_users`, `support_access_grants`).

## Current tenant model and isolation
- `tenants` is the primary tenant table with `slug`, status and plan metadata.
- Most major tenant-owned tables now carry `tenant_id`: customers, contacts, objects, personnel, assignments, reports, invoices, payments, documents, materials, inventory, notifications, tickets and settings.
- Multiple hardening migrations add tenant indexes, tenant-scoped uniqueness, storage path guards and RLS revocations (`050_storage_upload_hardening.sql`, `051_final_security_boundaries.sql`, `055_tenant_scoped_rbac.sql`, `062_post_migration_tenant_hardening.sql`, `070_sprint8_tenant_id_default_hardening.sql`, `092_customer_contact_email_tenant_scope.sql`).
- Important weakness: comments in older migrations explicitly rely on service-role/server access for backoffice management. That is acceptable only when server-side authorization is strict; otherwise RLS is bypassed.

## Sensitive data storage
- Financial: `invoices`, `payments`, `customer_payment_batches`, quotes, materials pricing, report material usage and payment diagnostics.
- Personal/customer: `customers`, `customer_contacts`, `customer_users`, `customer_tickets`, object contacts, addresses and notification/email logs.
- Staff/employee: `personnel`, personnel notifications/tickets, availability/leave data, qualifications and assignment-personnel links.
- Confidential attachments: `documents`, assignment photos, release/KB media and storage paths.
- Platform/security: `platform_users`, `support_access_grants`, `support_access_audit_log`, `audit_log`, platform email provider encrypted config, SMTP/mail settings and webhook/payment identifiers.

## Sensitive data display and exports
- Backoffice server actions under `artifacts/backoffice/src/app/actions` load tenant records for dashboards, customers, personnel, assignments, reports, invoices, payments, quotes, documents and platform/admin pages.
- PDF generation exists for invoices and quotes (`artifacts/backoffice/src/lib/invoice-pdf.ts`, `quote-pdf.ts`). These are financial exports and must require tenant finance/export permission plus audit logging.
- Document panels and storage download actions expose attachments; they must remain tenant-scoped and audited for Level 5 data.
- Platform dashboards and tenant switch/support mode actions can view tenant operational metadata. They must not return full nested tenant financial/customer/personnel records to platform users by default.

## Current access too broad / weak
- Platform support grants currently grant broad runtime permission keys including `invoices:read`, `payments:read` and `customer_payment_batches:read`. These should be interpreted as masked/diagnostic access unless a sensitive grant is active.
- Platform roles were previously coarse (`owner`, `admin`, `support`), making it hard to distinguish finance, developer, external developer and security auditor duties.
- Several older RLS comments say backoffice uses service role and no explicit policy is needed. This increases dependence on server-side DTO filtering and audit logging.
- Existing audit table captures action/resource metadata but did not have a standard sensitive-access payload contract for classification level, access type, reason, approval request and export/download flag.

## Safe parts found
- Tenant IDs are present on most modern tables and indexed.
- There is an existing platform support access grant model with expiry and audit log.
- Security dashboard tests and docs already combine `audit_log` and `support_access_audit_log`.
- Storage hardening migrations revoke or narrow direct browser access and prefer signed/server-mediated access.
- Customer internal notes are stored separately with management-only RLS intent.

## Refactoring completed / needed
- Completed in this change: central data classification, role/permission matrix, masking utilities, sensitive access request/grant tables, sensitive audit helper and tests.
- Still needed: wire every high-risk route/action/export to `assertFieldgridAccess`, replace platform-admin DTOs with safe summary DTOs, add UI request/approval screens and tenant notifications, and run database migration in staging/production.

## Concrete code references
- DB entry point: `lib/db/src/index.ts`.
- Tenant schema: `lib/db/src/schema/tenants.ts`.
- Platform/support access: `lib/db/src/platform-access.ts`, `lib/db/src/schema/platform-users.ts`.
- Audit schema: `lib/db/src/schema/audit-log.ts`.
- Financial schemas: `lib/db/src/schema/invoices.ts`, `lib/db/src/schema/payments.ts`, `lib/db/src/schema/customer-payment-batches.ts`.
- Customer/person schemas: `lib/db/src/schema/customers.ts`, `customer-contacts.ts`, `personnel.ts`, `objects.ts`.
- Documents/storage: `lib/db/src/schema/documents.ts`, `lib/db/src/storage-paths.ts`, storage migrations.
- Backoffice server actions: `artifacts/backoffice/src/app/actions/*`.
