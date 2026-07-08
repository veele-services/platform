# Sensitive Access Policy

## Categories
- Category A — Normal platform operational access: tenant status, plan, module state, integration health. No special approval.
- Category B — Masked support access: masked customer/payment metadata for support. Requires support reason/grant and audit.
- Category C — Sensitive tenant data access: Level 3/5 private data. Requires reason, ticket/reference and approval.
- Category D — Financial full-detail access: Level 4 tenant finance. Tenant-only by default; platform access requires explicit approval and audit.
- Category E — Break-glass emergency access: platform_owner or authorized security role only; reason, strict expiry, full audit, notification where appropriate.

## Approval decisions by data type
| Data type | Approval rule |
|---|---|
| Tenant status/plan/module metadata | No approval needed |
| Masked customer/payment support metadata | No additional approval if active support grant exists |
| Customer full contact details from platform side | Tenant owner approval, or platform owner for legal/security necessity |
| Employee/personnel full details from platform side | Tenant owner approval; platform owner for legal/security necessity |
| Invoices/payments/refunds full details | Tenant owner approval; platform owner may approve for billing dispute/compliance; dual approval preferred |
| Payout/bank/IBAN details | Break-glass or dual approval; normally tenant-only |
| Private documents/contracts/attachments | Tenant owner approval; dual approval for confidential/legal docs |
| Audit/security logs | Platform owner/security auditor; tenant owner receives tenant-visible subset |
| API keys/secrets/service credentials | Never accessible through ordinary application UI; break-glass only for rotation/incident |
| Raw webhook payloads/checkout URLs | Never show raw by default; masked diagnostics only unless approved |

## Lifecycle
1. Requester selects tenant, data scope, reason, ticket/reference and duration.
2. System computes classification and approval source.
3. Approver reviews necessity, proportionality and duration.
4. Approval creates short-lived `sensitive_access_grants` row.
5. Every view/export/action uses server-side authorization and writes audit metadata.
6. Grant expires automatically by `expires_at` or can be revoked.
7. Denial records denied_by/denied_at and returns no data.

## Expiration rules
- Masked support access: max one support session/work period.
- Financial full-detail: shortest practical window; default target under 24 hours.
- Break-glass: max 240 minutes unless platform owner documents exception outside the app.

## Audit and notification
- All Level 4+ platform access is audited with reason, classification, scope, actor, tenant, resource and export flag.
- Tenant notification is recommended for Category C/D after approval and for Category E after emergency unless prohibited by legal/security reasons.
