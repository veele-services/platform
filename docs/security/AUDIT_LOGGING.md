# Audit Logging Policy

Fieldgrid keeps append-only audit evidence in `audit_log`, support-specific events in `support_access_audit_log`, and sensitive approval/grant evidence in `sensitive_access_requests` / `sensitive_access_grants`.

## Must be logged
- Viewing sensitive financial details.
- Viewing customer or employee personal details from platform side.
- Viewing bank/payout details.
- Exporting financial/customer/personnel data.
- Creating refunds or changing payment/invoice data.
- Opening/downloading attachments.
- Break-glass access.
- Approving/denying/revoking sensitive access.
- Viewing security logs.
- Changing roles/permissions.
- Impersonation/support mode.

## Required fields
user_id, tenant_id, role, action, resource_type, resource_id, data_classification_level, access_type, reason, approval_request_id, IP/session/user-agent when available, timestamp, export/download flag and redacted before/after metadata for writes.

## Logging safety
Never log full payment payloads, authorization headers, tokens, secrets, bank details, full checkout URLs, invoice PDFs, full addresses or unnecessary full names/emails/phones. Use `redactLogMetadata` and masking helpers.
