# Fieldgrid Role Permission Matrix

Access levels: none, aggregate_only, metadata_only, masked_read, full_read, create, update, delete, export, approve_access, break_glass.

## Platform-side roles
- platform_owner: contractual platform owner. Can approve sensitive access and use break-glass with reason; should still use least privilege.
- platform_admin: platform operations. No default full tenant financial/private access.
- platform_finance: SaaS billing and finance operations. Tenant financial records are metadata/aggregate unless approved.
- platform_support: masked support diagnostics only.
- platform_developer: no production sensitive data by default; metadata/debug health only.
- external_developer: no production sensitive data.
- security_auditor: audit/security logs, no tenant business data except metadata required for investigation.

## Tenant-side roles
- tenant_owner: owns tenant data and approvals.
- tenant_admin: broad operational admin, not all finance by default unless granted.
- tenant_finance / tenant_bookkeeper: tenant financial full read/export.
- tenant_manager: planning/operations and masked contacts.
- tenant_staff: assigned work only, no financial exports.
- tenant_readonly: read-only operational/masked data.
- tenant_support_contact: support/audit metadata contact.

## Matrix summary
| Area | platform_owner | platform_admin | platform_finance | platform_support | platform_developer | external_developer | security_auditor | tenant_owner | tenant_admin | tenant_finance | tenant_manager | tenant_staff | tenant_bookkeeper |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Tenant profile | full/update/approve | full/update | metadata | metadata | metadata | none | metadata | full/update | full/update | metadata | metadata | none | metadata |
| Tenant subscription | full/update | full | full | metadata | none | none | metadata | metadata | none | none | none | none | none |
| Platform billing | full | metadata | full | none | none | none | audit metadata | none | none | none | none | none | none |
| Financial dashboard | aggregate/approve | aggregate | aggregate | none | none | none | none | full/export | metadata | full | none | none | full |
| Payments/invoices/refunds | metadata/approve | metadata | metadata | masked | none | none | audit only | full/export | metadata | full/export | none | none | full/export |
| Payouts/bank details | approve/break_glass | none | none | none | none | none | audit only | full | none | full where tenant policy permits | none | none | full where tenant policy permits |
| Customers/contacts | masked/approve | masked | none | masked | none | none | audit only | full/export | full/export | masked | masked | none | masked |
| Staff/employees | masked/approve | masked | none | masked | none | none | audit only | full/export | full/update | masked | masked | own/assigned | none |
| Operational planning | metadata | metadata | none | metadata | none | none | audit only | full | full | none | full/update | assigned update | none |
| Reports | metadata | metadata | metadata | metadata | none | none | audit only | full/export | full/export | full/export | full | own/create | full/export |
| Attachments | approve | metadata only | none | metadata only | none | none | audit only | full | full | full if financial | full for operations | assigned upload | financial docs if allowed |
| Exports | approve | none default | platform billing only | none | none | none | audit export only | all tenant | role-based | finance | no sensitive finance | none finance | finance |
| Audit/security logs | full | metadata | none | none | none | none | full | tenant summary | metadata | finance events | none | none | finance events |
| Support diagnostics | full | full | metadata | full masked | metadata | none | metadata | tenant-visible support logs | metadata | metadata | metadata | none | metadata |
| Webhook/payment diagnostics | masked/approve | masked | masked | masked | none | none | audit only | metadata/full tenant finance | none | metadata/full | none | none | metadata/full |
| API keys/secrets | break_glass only | none | none | none | none | none | audit only | tenant-owned keys only if feature exists | none | none | none | none | none |
| Production debug tools | break_glass | none | none | none | metadata/non-prod | none | audit only | none | none | none | none | none | none |

The enforceable code representation is `FIELDGRID_PERMISSION_MATRIX` in `lib/db/src/security-permissions.ts`.
