# Website module — forms, submissions and lead conversion

Phase 6 provides one server-owned processing boundary for managed Fieldgrid
sites and custom Next.js sites. A tenant website always submits to its own host:

```text
POST https://<tenant-host>/api/website-forms/<form-id>/submissions
```

The edge keeps `/api/*` owned by the platform API. The API resolves the exact
verified request host to one active tenant and site before it reads a form or
writes a submission. The browser never receives database credentials or direct
table access.

## Public contract

Managed publications contain only the immutable public form definition:
identifier, locale, kind, labels, selected fields, submit label and success
message. Notification recipients are not published. Managed submissions are
validated against the form definition in the exact active publication, so a
later authoring edit cannot silently change the live form contract.

Custom Next.js delivery uses the same endpoint. The custom application obtains
the published form identifier from its controlled configuration or backoffice
and should send JSON with a stable idempotency key:

```ts
await fetch(`/api/website-forms/${formId}/submissions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID(),
  },
  body: JSON.stringify({
    data: {
      name: "Ada Lovelace",
      email: "ada@example.com",
      message: "Ik ontvang graag meer informatie.",
    },
  }),
});
```

The key must remain stable for a retry of the same user action. Reusing it with
different data returns HTTP 409. The API accepts only configured, allowlisted
fields and enforces field and total-body limits. Cross-site browser posts,
unverified hosts and unpublished custom forms fail closed.

## Anti-spam and privacy

- A visually hidden honeypot makes automated submissions indistinguishable
  from accepted requests without creating inbox noise.
- A durable PostgreSQL bucket allows at most ten requests per form and
  pseudonymous requester per ten minutes.
- `WEBSITE_FORM_HASH_SECRET` must contain at least 32 characters. It HMACs the
  request signal and idempotency key before storage.
- Raw IP addresses, forwarding headers and user-agent strings are not stored.
- Request bodies and submission payloads are not written to application logs.
- Direct `anon` and `authenticated` access to all Phase 6 tables is revoked;
  RLS remains enabled as defense in depth.

## Durability and notifications

The submission and its `received` event commit before an e-mail attempt starts.
Provider failure therefore never loses the request. Notification state remains
`pending`, `sending` or `failed` and can be retried from the tenant inbox.
Terminal `sent` and `skipped` states cannot be moved backwards. Notification
events store provider identity but do not duplicate the contact payload.

Configure `WEBSITE_FORM_HASH_SECRET` on the API server before enabling public
forms. E-mail delivery follows the existing tenant/platform provider hierarchy;
the recipient is configured per form.

## Inbox and lead conversion

Backoffice permissions are split:

- `website_forms:read/write` for definitions;
- `website_submissions:read/write` for inbox processing;
- `customers:write` is additionally required to convert a submission.

Conversion locks the tenant-owned submission. If it already has a customer, the
same customer identifier is returned without creating another record. A first
conversion creates a CRM customer with status `lead`, links it to the
submission, and appends both a submission event and audit event in the same
transaction. An existing customer e-mail is not merged automatically.

## Retention and deletion

New submissions receive a default retention deadline of 365 days. The deadline
is immutable on the original record. Tenant users with submission write access
may explicitly erase personal data earlier when policy or a data-subject
request requires it.

Erasure is irreversible and:

- archives the submission;
- replaces the payload with an empty object;
- clears copied name, e-mail and phone fields;
- records actor and timestamp;
- keeps the non-PII lifecycle timeline and, when conversion occurred, the CRM
  customer link.

Database rows are not hard-deleted through the product flow. This preserves
proof of receipt, processing and erasure without retaining the original form
content. Operational automation may select rows whose `retention_until` has
passed and invoke the same audited redaction command; Phase 6 does not add a
general scheduler.
