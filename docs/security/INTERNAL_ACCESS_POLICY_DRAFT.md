# Internal Access Policy Draft

Tenant data belongs to the tenant. Fieldgrid staff may only access tenant data when necessary for platform operation, billing, support, debugging, fraud/misuse prevention or legal/compliance.

## Who may access tenant data
- Tenant users access their own tenant data according to tenant roles.
- Platform support may access masked diagnostics when helping a tenant.
- Platform finance may access SaaS billing metadata and tenant finance metadata needed for billing disputes.
- Developers may not access production sensitive tenant data by default.
- External developers have no production sensitive-data access.
- Platform owner/security auditor may access audit/security evidence and approve sensitive access.

## Approval required
Full financial records, full personal contact/personnel details from platform side, private documents, bank/payout details, raw webhook payloads and security logs require approval or break-glass.

## Logging required
All sensitive views, exports, downloads, approvals, denials, role changes, payment changes and emergency access must be logged.

## Support access
Support must use a ticket/reference and reason. Show masked data first. Request sensitive access only when masked diagnostics are insufficient.

## Emergency access
Break-glass requires a reason, is time-limited, audited and should trigger tenant notification when appropriate.

## Production database access
Direct production DB access is prohibited for routine support/development. Use application flows, approved grants or audited emergency procedures. Secrets and service role keys must never be exposed in UI, logs or screenshots.

## Prohibited
Browsing tenant data out of curiosity, exporting tenant data without permission, using production data in development, sharing screenshots with personal/financial data, logging secrets/payment payloads and creating broad super-admin bypasses.
