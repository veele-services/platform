# Neutral inquiry contract 1.0.0

This is a proposed Veele website contract, based on `veele-content-research.json` dated 4 October 2026. No Fieldgrid API, repository, credentials, endpoint, authentication method or product model has been inspected. Compatibility remains unverified. The local schema is deliberately owned by the website; a future server adapter must map it to an actual documented destination.

`inquiry.schema.json` uses JSON Schema draft 2020-12. `example-inquiry.json` is synthetic data with a reserved example email address. `mode: "draft"` permits incomplete steps and optional contact details. `mode: "submission"` enables completeness checks before a real send; the value does **not** mean the inquiry was sent. Unknown values are omitted, never encoded as zero, empty strings or invented facts. No prices, quote totals, booking status or availability promises belong in this contract.

## Five input steps plus a review screen

| Step | Required to continue/review | Optional/conditional fields |
|---|---|---|
| 1. Services | One or more of `cleaning`, `security`, `facilities` | Multiple services produce one inquiry. |
| 2. Location | `location.type`, `city`; initialize editable `country` to `NL` | Exact address, postcode and venue are optional. Require `otherType` only for `type: other`. |
| 3. Tasks | At least one `requestedTasks` value per selected service; `discuss` is a valid choice by itself | See service fields below. Require `otherTask` only when `other` is selected. |
| 4. Planning | `planning.type`: `once`, `recurring`, `event` or `discuss` | Date, cadence, days, times and notes can remain unknown. Show cadence only for recurring work. |
| 5. Contact and review | A readable summary; contact can remain absent for copy/email-app actions | A future actual send requires `preferredChannel` plus its matching email/phone. Name and organization remain optional. |

Steps 1–4 never require personal contact data. Public labels stay Dutch; transmitted enum values stay stable. `cleaning` = Schoonmaak, `security` = Beveiliging, `facilities` = Facilitaire ondersteuning. These fields represent the visitor's wishes, not approved scope. Do not infer a service from location or auto-select a suggested extra task. Changing selected services must delete the deselected service's task branch. Changing task selections must delete now-hidden task-specific values.

## Conditional service fields

| Service | `requestedTasks` values | Optional questions |
|---|---|---|
| Cleaning | `office`, `common_areas`, `shop`, `home_handover`, `hospitality`, `glass`, `periodic_floor`, `other`, `discuss` | `areaM2` (estimate), `floorCount`, `spaces`; ask `glassAccess` only when `glass` is selected. |
| Security | `object`, `mobile_patrol`, `event_security`, `retail`, `hospitality`, `reception`, `personal_protection`, `chauffeur`, `other`, `discuss` | `coverage` desired task emphasis, `staffEstimate` only if the visitor knows it; `expectedVisitors` useful for events/hospitality. |
| Facilities | `hospitality_support`, `event_staff`, `bar`, `guest_reception`, `setup_breakdown`, `catering_support`, `toilet_cleaning`, `other`, `discuss` | `staffEstimate`, `expectedVisitors` for the relevant gathering; ask `toiletCount` only for `toilet_cleaning`. |

`notes` (up to 1,500 characters) belongs to each service; top-level `message` (up to 2,000) covers the overall request. Do not ask for alarm codes, access credentials, identity documents or detailed personal threat information in the public wizard. For personal protection/chauffeur requests, a short description plus a contact route suffices. Free-text fields are plain text, never executable HTML. The schema's numeric ceilings are input-abuse limits, not service capacity claims. Reception remains available in the published security offering; guest reception is also a facilities task. Avoid duplicate automatic selections.

## Validation and normalization

1. Trim input, remove empty optional values, deduplicate selections and preserve intentional newlines. Keep meaningful text and accents. Do not silently rewrite a city or infer a precise address.
2. Validate with this exact schema on the server as well as in the browser. Enable format assertions for `uuid`, `date`, `date-time` and `email`; many schema validators treat formats as annotations by default. Reject unknown keys. Enforce a 32 KiB JSON request-body limit independently of the schema.
3. Validate after normalization. The browser can hold incomplete controls between changes; validate each completed step before advancing and the whole `submission` object before delivery. A no-contact summary remains `draft`, even when steps 1–4 are complete.
4. Additional semantic checks: valid country code; NL postcode, when supplied, is normalized to `1234 AB` and must match four digits followed by two letters; phone must have 7–15 digits after punctuation removal. Do not invent a country prefix. Email validation checks syntax, not mailbox ownership.
5. Dates must be real calendar dates. When both exist, `endDate >= startDate`. For each time window, `endDate` defaults to its `date`; compare full local start/end values and require end after start. Overnight work requires an explicit next-day `endDate`. Interpret times in `Europe/Amsterdam`, including daylight-saving ambiguity. Do not fabricate a UTC instant for an ambiguous local time. No date is required when the visitor wants to discuss timing. An elapsed requested date warrants a correction prompt, not a fabricated new date.
6. `discuss` is exclusive within each `requestedTasks` array. `other` needs a short description at submission. Numeric estimates must be positive; omit unknown quantities. HTML-escape the summary, email view and all rendered server errors. Map field errors to JSON Pointers and concise Dutch labels.
7. Treat user data as private inquiry content. Avoid third-party analytics values, raw request logging and default persistence of free text/contact in localStorage. Browser memory is sufficient for this prototype. A future saved-draft feature needs an explicit retention decision and appropriate user copy.

## Delivery adapter boundary

The current prototype should expose functional copy-summary and `mailto:` actions. Label them **Kopieer samenvatting** and **Open uw aanvraag als e-mail**. Opening a mail app does not send the message; never show a sent/received confirmation for those actions. Encode subject/body safely, and offer copy when the body is too long or a mail app cannot open.

Implement a future adapter on the server, behind a first-party route whose real path is chosen only during implementation. Do not put destination credentials in the browser. The interface is conceptual TypeScript, independent of any destination API:

```ts
type InquirySubmission = ValidatedInquiry & { mode: "submission" };
type FieldError = { path: string; code: string; message: string };
type DeliveryResult =
  | { status: "accepted"; receiptId: string; receivedAt: string }
  | { status: "rejected"; errors: FieldError[] }
  | { status: "unavailable"; retryAfterSeconds?: number }
  | { status: "indeterminate"; correlationId: string };

interface InquiryDeliveryAdapter {
  submit(
    inquiry: InquirySubmission,
    context: { idempotencyKey: string; signal?: AbortSignal }
  ): Promise<DeliveryResult>;
}
```

`ValidatedInquiry` is generated from/checked against this schema; the TypeScript notation alone supplies no runtime validation. Application code builds the summary separately and invokes the adapter only on an explicit Send action. Without a configured working receiver, omit/disable real sending with honest copy and retain copy/mail actions. A demo adapter must never return a fabricated `accepted` result.

The server revalidates and applies rate limiting, configured-origin checks and appropriate anti-abuse controls. It owns authentication and destination mapping. Generate an idempotency key per confirmed payload; reuse it across retries of that identical payload. Bind the key to a canonical payload digest and reject reuse for changed data. Generate a new key when the user edits and resubmits. Persist accepted receipts long enough to prevent retry duplicates; settle retention with the real system. If the destination lacks idempotency support, the first-party server must provide it before automatic retries are enabled.

Only map a real acknowledged, durably accepted intake to `accepted`, with its real receipt/time. This means an inquiry was received, not that work was booked or an offer issued. Distinguish a validation rejection from temporary unavailability. A timeout after transmission is `indeterminate` until an idempotency/status lookup resolves it; do not assert failure or trigger an unprotected retry. Retry transient errors only under the agreed idempotency strategy and honor retry delays. Logs use correlation IDs and redacted failure categories, not contact/task content.

## Before connecting Fieldgrid

Obtain its actual API/version and sandbox access, then verify: authentication and secret rotation; supported intake object; required fields and identifier formats; service/taxonomy mapping; whether a lead, request or work order is the correct target; contact matching behavior; datetime/time-zone handling; error format; rate limits; idempotency and lookup semantics; receipt guarantees; data retention; permitted integration and notification behavior. Do not create bookings, clients, staff assignments or outbound notifications without an explicit documented mapping and authorized product behavior.

Keep destination IDs, credentials and integration metadata outside the visitor payload. Preserve the original neutral payload or a privacy-appropriate source record with its schema version for troubleshooting. Unsupported optional fields require an explicit mapping policy; do not silently discard selected services. Require a sandbox round-trip with cleaning-only, security-only, facilities-only and mixed-service requests, validation failures, missing contact, changed selection, duplicate retries and ambiguous delivery. Promote the adapter only after these checks pass.

Contract changes use semantic versions. A changed required field, enum meaning or removed enum is breaking. Since unknown keys are rejected, additive fields need a negotiated schema version and receiver support; do not assume old receivers accept them. The neutral payload version and any future destination API version are separate.

## Implemented prototype boundary

The public wizard has five input steps and a sixth editable summary. It requires a name and at least one valid email address or phone number before the summary; the neutral schema remains more permissive for draft records. Leaving task chips empty maps explicitly to `discuss`, matching the visible instruction. General task notes apply to each selected service. A visitor estimate applies only to the selected security/facilities branches.

`dist/assets/request-contract.js` exports `buildInquiry`, `validateState`, `summaryGroups`, `summaryText`, and an unconfigured `deliveryAdapter`. The browser exposes `window.VeeleInquiry.getPayload()`, `getSummary()` and `validate()`. These are integration boundaries for review; they do not POST to a server. `getPayload()` returns `mode: draft`. Deselected service branches and hidden numeric values are removed. Known time windows carry Europe/Amsterdam and explicit overnight end dates; partial timing wishes are preserved in planning notes. Both contact methods may be supplied; email is the proposed preferred channel when present and should be confirmed during the real connection.

To connect: implement a server route and the adapter using the real Fieldgrid contract, revalidate on the server, and replace the current user-reviewed mail action only after an actual accepted response can be shown. The prototype adapter always returns `unavailable`. No token belongs in these static browser assets.
