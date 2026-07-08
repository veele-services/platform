# Full Integration Prompt — Fieldgrid Sensitive Tenant Data Access

Use this prompt for the next implementation pass. The previous PR created the foundation, but it must be integrated into actual runtime paths before Fieldgrid can claim full GDPR-ready, least-privilege tenant-data access control.

## Background

Fieldgrid is a multi-tenant SaaS platform. Tenant financial data, personal data, employee/staff data, attachments, logs, payment metadata, invoices, exports and support diagnostics must not be casually visible to platform staff or developers. Tenant data belongs to the tenant. Platform access must be explicit, limited, justified, logged, masked by default and approved where required.

The previous PR added these building blocks:

- Data classification and scope mapping: `lib/db/src/security-data-classification.ts`.
- Permission matrix and decision helpers: `lib/db/src/security-permissions.ts`.
- Masking and safe log-redaction helpers: `lib/db/src/security-masking.ts`.
- Sensitive audit helper: `lib/db/src/security-audit.ts`.
- Sensitive access request/grant schema: `lib/db/src/schema/sensitive-access.ts`.
- Additive sensitive-access migration: `lib/db/migrations/20260708120000_sensitive_data_access_controls.sql`.
- Security/GDPR documentation under `docs/security/`.

Important: that work is a foundation only. It is not full runtime integration yet.

## Primary objective

Strictly integrate the sensitive-data access model into all high-risk Fieldgrid runtime paths. Do not only add documentation or string/contract tests. Modify actual data loaders, server actions, route handlers, exports and UI where needed.

The definition of done is that platform-admin, support, developer, tenant and export flows are server-side enforced according to the documented model.

## Grounding documents to read first

Read these files before making changes:

1. `docs/security/DATA_ACCESS_AUDIT.md`
   - Shows current architecture, sensitive data locations, broad-access risks and the explicit note that every high-risk route/action/export still needs wiring.
2. `docs/security/DATA_CLASSIFICATION.md`
   - Defines Level 0–6 data and entity-level classification.
3. `docs/security/ROLE_PERMISSION_MATRIX.md`
   - Defines platform and tenant roles plus access levels.
4. `docs/security/SENSITIVE_ACCESS_POLICY.md`
   - Defines approval categories A–E, approval rules and lifecycle.
5. `docs/security/AUDIT_LOGGING.md`
   - Defines which actions must be logged and which metadata is required.
6. `docs/security/GDPR_PREPARATION_NOTES.md`
   - Legal/GDPR preparation assumptions and open questions.
7. `docs/security/INTERNAL_ACCESS_POLICY_DRAFT.md`
   - Plain-language internal operating policy.

## Code primitives to use

Use the existing primitives rather than creating a parallel system:

- `authorizeFieldgridAccess` and `assertFieldgridAccess` from `lib/db/src/security-permissions.ts`.
- `FIELDGRID_SCOPE_CLASSIFICATION`, `requiresSensitiveAccess`, `requiresMasking` from `lib/db/src/security-data-classification.ts`.
- `maskEmail`, `maskPhone`, `maskIban`, `maskName`, `maskPaymentProviderId`, `maskAddress`, `maskReference`, `redactLogMetadata` from `lib/db/src/security-masking.ts`.
- `writeSensitiveAuditLog` and `buildSensitiveAuditMetadata` from `lib/db/src/security-audit.ts`.
- `sensitiveAccessRequestsTable` and `sensitiveAccessGrantsTable` from `lib/db/src/schema/sensitive-access.ts`.
- Existing tenant, platform and support access helpers in `lib/db/src/platform-access.ts`, `artifacts/backoffice/src/lib/auth/*`, and existing server actions.

If the primitives need refactoring to fit real runtime usage, improve them. Do not bypass them.

## Inline-review issues to address from the previous PR

The previous implementation was not sufficient because it mostly added docs and central helpers, but did not integrate them into high-risk code paths. Address these concrete problems:

1. The permission matrix is not yet used by actual backoffice, API, export or platform-admin routes.
2. Sensitive grant tables exist but there are no actual request/approve/deny/grant/revoke server actions and no UI flow.
3. Platform-admin and support surfaces still need safe DTOs and masking at the data-loader level.
4. Exports and PDF downloads still need explicit permission checks plus sensitive audit logging.
5. Existing support access may still imply broad read access unless every sensitive route interprets it as masked/diagnostic only.
6. Tests currently assert helper presence; add behavior tests that exercise real decision paths or real route/action helpers.
7. Documentation says what should happen; runtime code must now actually enforce it.

## Required implementation work

### 1. Identify high-risk runtime paths

Inspect actual code, not just docs. At minimum inspect and categorize:

- `artifacts/backoffice/src/app/actions/platform*.ts`
- `artifacts/backoffice/src/app/actions/customers.ts`
- `artifacts/backoffice/src/app/actions/personnel.ts`
- `artifacts/backoffice/src/app/actions/invoices.ts`
- `artifacts/backoffice/src/app/actions/payments.ts`
- `artifacts/backoffice/src/app/actions/quotes.ts`
- `artifacts/backoffice/src/app/actions/reports.ts`
- `artifacts/backoffice/src/app/actions/documents.ts`
- `artifacts/backoffice/src/app/actions/dashboard.ts`
- `artifacts/backoffice/src/app/actions/support-mode.ts`
- `artifacts/backoffice/src/lib/invoice-pdf.ts`
- `artifacts/backoffice/src/lib/quote-pdf.ts`
- customer/personnel portal API and server actions where documents, invoices, reports, assignments or tickets are exposed.
- API server route/middleware files under `artifacts/api-server/src`.

Produce/update a checklist document that maps each high-risk path to:

- data scope,
- classification level,
- tenant-owned/platform-owned,
- required role/access level,
- whether masking is required,
- whether export is allowed,
- whether audit logging is required,
- integration status.

Prefer updating `docs/security/DATA_ACCESS_AUDIT.md` or creating `docs/security/RUNTIME_ACCESS_INTEGRATION_CHECKLIST.md`.

### 2. Add an application-level sensitive access service

Create a focused runtime service, for example:

- `lib/db/src/sensitive-access.ts`, or
- `artifacts/backoffice/src/lib/security/sensitive-access.ts` if it needs request/session context.

It should support:

- creating sensitive access requests,
- approving requests,
- denying requests,
- creating short-lived grants when approved,
- revoking grants,
- checking active grants by user, tenant, scope and permission,
- checking expiry,
- writing audit rows for request/approve/deny/revoke/use,
- refusing missing/short reasons,
- refusing break-glass without reason,
- refusing platform-admin full sensitive data access without active grant.

Do not expose secrets or raw sensitive payloads through this service.

### 3. Wire authorization into high-risk server actions/loaders

Every high-risk server action must do all of the following server-side:

1. Resolve actor identity, platform role or tenant role.
2. Resolve tenant context.
3. Verify tenant scope for the target resource.
4. Map the operation to a `FieldgridDataScope`.
5. Call `authorizeFieldgridAccess` or `assertFieldgridAccess`.
6. Apply masking or field omission before returning data.
7. Write a sensitive audit log when classification/export policy requires it.

Start with these priority integrations:

- Platform tenant detail and dashboards: return only tenant metadata, aggregate finance and masked customer/personnel summaries.
- Platform/support customer views: masked contact data unless approved.
- Platform/support personnel views: masked staff data unless approved.
- Platform/support invoice/payment views: aggregate or metadata/masked only unless approved.
- Document download/open actions: require role access and audit Level 5 access.
- Invoice/quote/report PDF generation: tenant-role export checks and audit.
- CSV/Excel/export actions: deny platform-side tenant sensitive exports by default; permit tenant finance/bookkeeper/admin only per matrix.

### 4. Build safe DTOs for platform-admin/support surfaces

Do not pass raw Drizzle rows containing sensitive fields into frontend props where platform roles do not need them.

Create explicit DTO builders, for example:

- `toPlatformTenantSummaryDto`
- `toPlatformCustomerMaskedDto`
- `toPlatformPersonnelMaskedDto`
- `toPlatformInvoiceMetadataDto`
- `toPlatformPaymentDiagnosticDto`
- `toTenantFinanceInvoiceDto`

DTO rules:

- Platform admin/support: no full email/phone/address/payment provider IDs/checkout URLs/customer notes/private notes/bank data by default.
- Tenant finance/bookkeeper/owner: full tenant financial data where permitted.
- Tenant staff: no finance export and no unrelated customer/personnel private data.
- Developers/external developers: no production sensitive tenant data.

### 5. Implement actual UI flows

Add UI only after server enforcement exists.

Minimum UI work:

- Request sensitive access button/panel on platform/support screens where masked data is insufficient.
- Request form with tenant, data scope, reason, ticket/reference and duration.
- Approval/denial screen for platform owner/security auditor and tenant owner where applicable.
- Active sensitive-access banner showing scope and expiry.
- Clear warning before sensitive view/export.
- Audit trail surface for platform owner/security auditor.

All UI actions must call server actions that enforce authorization and audit. Frontend hiding is not sufficient.

### 6. Export hardening

Inventory every export/PDF route. For each:

- classify exported data,
- require tenant role or approved platform sensitive access,
- deny platform-side sensitive tenant exports by default,
- mask where only masked export is allowed,
- write `writeSensitiveAuditLog` with `exportDownload: true`,
- ensure generated filenames/metadata do not leak customer/payment details unnecessarily.

### 7. Log and error hardening

Search for logging of raw payloads or objects in high-risk paths. Replace with safe metadata.

Do not log:

- raw webhook/payment payloads,
- checkout URLs,
- full emails/phones/addresses where not required,
- bank/IBAN data,
- authorization headers,
- API keys/tokens/secrets,
- invoice PDFs or document contents.

Use `redactLogMetadata` and masking helpers.

### 8. Database and RLS follow-up

Apply and validate the migration:

- `lib/db/migrations/20260708120000_sensitive_data_access_controls.sql`.

Then verify:

- RLS is enabled on the new tables,
- anon/authenticated direct privileges are revoked,
- server-side/service-role code is the only path to mutate sensitive access requests/grants,
- existing tenant-owned sensitive tables have tenant_id and safe indexes,
- no new broad public/authenticated policies are introduced.

If any sensitive table still lacks tenant_id or has weak RLS, document and fix with additive migrations.

### 9. Tests to add

Do not rely only on string-presence tests. Add behavior tests where possible.

Required coverage:

- platform_admin cannot full-read tenant payments/invoices without an active sensitive grant.
- platform_support receives masked customer/payment/personnel DTOs by default.
- platform_developer and external_developer cannot access production sensitive tenant data.
- tenant_finance/tenant_bookkeeper can read/export own-tenant financial details.
- tenant_staff cannot export financial data.
- cross-tenant resource IDs are rejected even if the user has permissions in another tenant.
- sensitive access request approval creates a temporary grant.
- expired/revoked grants no longer authorize access.
- break-glass requires a non-empty reason, is time-limited and writes audit.
- document/download/export/PDF actions write audit rows.
- API/server-action responses omit or mask sensitive fields for platform roles.

### 10. Acceptance criteria

The implementation is not complete until all of the following are true:

- High-risk server actions and route handlers call centralized authorization.
- Platform admin/support screens use safe DTOs and masking by default.
- Sensitive access request/approval/grant/revoke lifecycle works in code, not just schema.
- Break-glass is an explicit audited flow.
- Exports/PDFs are role-checked and audited.
- Tenant users remain scoped to their own tenant.
- Sensitive logs are redacted.
- Behavior tests prove the important restrictions.
- Documentation checklist identifies remaining legal/business decisions separately from implementation gaps.

## Do not do

- Do not create a new `super_admin` bypass.
- Do not rely on frontend hiding.
- Do not make destructive migrations.
- Do not expose secrets, service-role keys or raw webhook payloads.
- Do not return raw database rows to platform-admin/support client components if they include sensitive fields.
- Do not weaken existing tenant functionality; preserve it behind correct role checks.
- Do not mark the task complete if only docs/helpers/tests were added without runtime integration.

## Recommended implementation order

1. Audit high-risk code paths and create/update the runtime integration checklist.
2. Refactor `security-permissions.ts` if needed for real-world ergonomics while preserving default-deny.
3. Implement sensitive access service and server actions.
4. Build DTO/masking layer for platform/support loaders.
5. Wire platform tenant detail, customer, personnel, invoice/payment and document actions.
6. Harden exports/PDF/downloads.
7. Add UI for request/approval/active grant/audit trail.
8. Add behavior tests and migration/RLS checks.
9. Run `pnpm test`, `pnpm run typecheck`, and relevant focused security scripts.
10. Update docs with completed integrations and remaining legal decisions.
