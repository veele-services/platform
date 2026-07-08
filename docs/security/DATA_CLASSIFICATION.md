# Fieldgrid Data Classification

## Levels
- Level 0 — Public / non-sensitive: marketing content, public labels, generic help content.
- Level 1 — Platform operational metadata: tenant name/status/plan/modules/subscription state.
- Level 2 — Tenant operational data: jobs, planning, tasks, objects, project status, non-sensitive notes.
- Level 3 — Personal data: names, emails, phone numbers, addresses, customer contacts, employees, profiles.
- Level 4 — Sensitive financial data: invoices, payments, refunds, amounts, VAT, provider IDs, debtor details.
- Level 5 — Highly sensitive/confidential data: bank details, private documents, contracts, confidential notes, security logs, encrypted provider config.
- Level 6 — Restricted system/security data: service keys, DB credentials, auth secrets, encryption keys, raw security events.

## Classification table
| Entity/table/model | Fields | Level | Owner | Personal | Financial | Default platform visibility | Default tenant visibility | Masking | Export | Audit | Retention/GDPR notes |
|---|---|---:|---|---|---|---|---|---|---|---|---|
| tenants | id, slug, name, status, plan_key | 1 | Platform | no | no | metadata/full for owner/admin | owner/admin metadata | no | platform ops only | changes | SaaS account metadata |
| tenant_users / tenant roles | user_id, role, status | 3 | Tenant | yes | no | masked/metadata | tenant owner/admin | user IDs masked in lists | tenant owner only | role changes | employment/user access record |
| platform_users | user_id, role, status | 5 | Platform | yes | no | owner/security auditor | none | mask user identifiers | no | all changes | internal access governance |
| customers | name, email, phone, addresses, type | 3 | Tenant | yes | maybe | masked for support/admin | role-based full | email/phone/address | tenant admin/finance only | platform views/exports | data subject/customer deletion |
| customer_contacts | name, email, phone, function | 3 | Tenant | yes | no | masked | role-based full | yes | tenant admin only | platform views/exports | contact DSAR/deletion |
| customer_notes | notes | 5 | Tenant | possible | possible | none unless approved | management only | hidden by default | no by default | every view | may contain special/confidential data |
| objects/object_contacts | location, addresses, contact people | 3 | Tenant | yes | no | metadata/masked | role-based | addresses/contact details | tenant roles | platform views | location privacy |
| personnel | employee names, email, phone, sector/status | 3 | Tenant | yes | no | masked | tenant admin/manager | yes | tenant admin only | platform views/exports | employee rights/retention |
| qualifications/availability/leave | skills, availability, leave periods | 3 | Tenant | yes | no | none/masked diagnostics | role-based | employee identifiers | limited | views/changes | employment data retention |
| assignments/planning/tasks | job details, notes, status | 2/3 | Tenant | possible | no | metadata only | role-based | notes with personal data | tenant manager/admin | cross-tenant/export | operational retention |
| reports | work notes, signatures/photos, materials | 3/4 | Tenant | yes | maybe | metadata/masked | role-based | names/photos/amounts | tenant admin/finance | views/exports | evidence/photos retention |
| invoices | invoice number, customer, amounts, VAT, due/paid dates | 4 | Tenant | possible | yes | aggregate/metadata only | tenant finance/bookkeeper | customer/ref partial | tenant finance/bookkeeper | all platform/export | legal invoice retention |
| payments | Mollie ID, amount, status, checkout URL, paid_at | 4/5 | Tenant | possible | yes | masked diagnostics only | tenant finance | provider IDs/checkout URL | tenant finance only | all platform/export/webhook | payment provider retention |
| customer_payment_batches | batch totals, debtors, invoice grouping | 4 | Tenant | possible | yes | aggregate only | tenant finance | customer refs | tenant finance | all views/exports | debtor/payment retention |
| quotes | quoted amounts, customer, notes | 4 | Tenant | possible | yes | metadata only | tenant finance/admin | customer refs | tenant finance/admin | platform/export | commercial confidentiality |
| documents | filename, storage_path, entity links | 5 | Tenant | possible | possible | metadata only/approved access | role-based | names/paths | limited | open/download/export | attachment deletion policy |
| assignment_photos/media | paths, approvals, uploader | 5 | Tenant | yes | no | none unless support grant | role/customer approval | paths/uploader | no default | open/download | image personal data risk |
| audit_log | actor, action, resource, metadata | 5/6 | Tenant/Platform | yes | possible | security auditor/owner | tenant owner metadata | actor IDs where needed | no default | immutable | security/legal retention |
| support_access_grants/log | reason, grant, platform user | 5 | Platform | yes | possible | owner/security auditor | tenant notification summary | platform user IDs | no | all | access governance evidence |
| sensitive_access_requests/grants | request reason, scope, approvals | 5 | Platform/Tenant | yes | possible | owner/security auditor | tenant owner where relevant | requester IDs | no | all | approval evidence |
| platform_email_providers | encryptedConfigJson, SMTP status | 6 | Platform | no | no | owner only | none | never reveal config | no | all access | secrets rotation |
| email_delivery_log | recipient, subject, provider message id | 3/5 | Mixed | yes | possible | masked diagnostics | tenant admin limited | email/subject as needed | no default | failed delivery/debug | email log retention |
| webhooks/payment diagnostics | raw provider payloads, IDs | 5 | Platform/Tenant | possible | yes | masked diagnostics | tenant finance status only | payload/provider IDs | no | all access | never log raw payloads |
| API keys/secrets/env | keys, tokens, DB URL | 6 | Platform | no | no | never UI-readable | none | not applicable | never | all attempts | secrets handling policy |
