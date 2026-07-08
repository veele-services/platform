# GDPR Preparation Notes

## Personal data processed
Customer names, contact names, emails, phone numbers, addresses, portal users, employee/personnel profiles, availability/leave, qualifications, ticket messages, notification/email logs, audit actor IDs and attachment/photo content.

## Financial data processed
Invoices, invoice lines/amounts/VAT, payment statuses/provider IDs, refunds, debtor/payment batch information, quotes, materials pricing and financial reports.

## Data subjects
Tenant staff/users, tenant customers/end customers, customer contacts, platform staff/support users and possibly people shown in uploaded documents/photos.

## Tenant-owned vs platform-owned
Tenant business, customer, employee, operational, finance and attachment data is tenant-owned. Platform account metadata, SaaS subscription/admin user/access logs and platform email provider config are platform-owned.

## Platform purposes
Hosting SaaS, authentication, tenant administration, billing, support, diagnostics, security monitoring, fraud/misuse prevention, legal/compliance, backups and incident response.

## Subprocessors discovered from codebase
Supabase/Postgres/Auth/Storage, Mollie payments, email/SMTP providers, hosting/VPS/runner infrastructure and any configured analytics/error tooling if enabled.

## Retention questions
Define retention for invoices/payment records, operational assignments/reports, uploaded documents/photos, support tickets, email logs, audit logs, backups and deleted tenant exports.

## Export/delete questions
Define tenant self-service export scope, DSAR workflow, customer/personnel deletion/anonymization, invoice legal retention exceptions, attachment deletion and backup purge windows.

## Support/developer policy summaries
Support receives masked diagnostics by default and approved temporary sensitive grants when needed. Developers must not access production sensitive tenant data by default; use staging/anonymized data.

## Open legal review questions
Controller/processor split per module, lawful bases, DPA terms, tenant notification obligations for break-glass, subprocessors list, international transfers, retention schedule and incident notification wording.
