# Object 360 — integration and security contract

The existing objects/customers, task catalog, personnel qualifications,
work orders, assignments, dispatches, report review and finance remain the
sources of truth. A work order is a concrete visit. This feature does not
generate recurrences or introduce another planning or billing engine.

## Boundaries

- Full dossier: `/app/objecten/[objectId]?tab=…`; staff access always carries
  its concrete work-order context. Customer access at `/klant` requires an
  explicit, active user/object binding, never inferred from a contact email.
- Ordinary records, their immutable versions, hierarchy and documents are
  separate from vault items, encrypted versions, OTP challenges and grants.
- Regular follow-up creates an existing work-order task. Commercial follow-up
  requires a versioned proposal and explicit customer consent before creating
  an extra-work task. Existing report review remains mandatory before billing.
- Replanning marks visit-bound requests for review; cancellation preserves
  history. No instruction is copied to another visit automatically.
- Qualification requirements use the existing Personnel 360 catalog and
  assignment-period checks; no duplicate certificate registry.

## Customer prototype extension — 4 October 2026

The owner requested the complete customer prototype within `/klant`. Explicit
tenant/customer/account bindings now form the bootstrap contract before an
object exists; they are not inferred from an email, contact label or membership.
Management grants self-service capabilities deliberately. Existing object
bindings remain the resource boundary, including for accounts that have several
customers. A customer selection cannot override the request hostname or expand
object scope. Legacy bindings retain their rights without gaining creation or
billing/profile editing automatically.

Customer-created objects use `objects` and the existing object numbering,
address, optimistic version and history contracts. Creation and the creator's
exact object binding are one idempotent transaction. Onsite contacts use
`customer_contacts` and ordinary contact records, not a parallel portal registry.
Customer fixed instructions use `object_records` with an explicit
customer-visible marker (default false); only ordinary fixed text can be created
through self-service. Backoffice and assigned staff consume that same source.
Visit instructions remain `object_visit_requests` tied to one exact work order,
with the existing review, replanning, withdrawal and completion rules.

All new customer projections are allowlists. They expose planned and actual
times as separate server-owned fields, but no internal employee names, IDs,
emails, signatures, review notes or raw history snapshots. Public authors are
the tenant, Fieldgrid or the current customer. Vault policy and published/final
concrete-visit access are unchanged. See [the portal contract](customer-portal.md).

## Secure access

Managed Supabase Vault authenticated encryption is used for secret values and
the keyed OTP verification pepper. No decryption key or plaintext OTP is stored
in ordinary tables, repository configuration or browser bundles. Root key
rotation is an infrastructure procedure, not the object-code rotation action.
Supabase Vault is currently documented as public alpha; recovery/backup key
retention remains the operator's responsibility.

Every request, verification and read checks the live Auth session, active user,
tenant, explicit object access, exact scope and current assignment. Staff must
have an active personnel/account binding and a published, non-revoked dispatch.
Default window: 60 minutes before the assignment start through its scheduled
end. Only an identified authorized planner may extend it, with a reason and
short explicit expiry; no inactive identity, missing assignment or OTP bypass.
Changes of planning, assignment, binding or secret version invalidate old grants.
Alarm activation and key return precede definitive completion.

Default OTP lifetime is 5 minutes; viewing is at most 10 minutes and never
beyond the assignment window. Reissuing invalidates the old challenge, not the
cumulative attempt budget. Consumption is atomic and session/scope-bound.
Email contains only the verification code, not an object secret. Email OTP is
additional confirmation, **not independent strong MFA**. Provider failures fail
closed with a supervisor escalation, never plaintext fallback.

Secret routes are online-only, POST, same-origin and `Cache-Control: no-store`.
Values never enter RSC payloads, general timeline/audit, exports, reports,
notifications, browser persistence or service-worker caches. The interface
hides values on blur, page hiding, expiry and revocation. Revocation cannot erase
a code already seen by a human; incident follow-up must confirm the external
lock/alarm code has actually changed.

## External boundaries

SendGrid and private Supabase Storage reuse the current isolated environment.
No external malware scanner, physical lock controller or contract-line module
is assumed: scanning status is explicit, physical rotation requires confirmation,
and work programmes reference the existing versioned task catalog.
No separate alignment attachment was supplied; integrations are checked against
the actual codebase. No new global roles or permissions editor is included.

## Operating the dossier

1. Create a draft or active object under an existing customer; paused, draft and
   archived locations cannot receive new work orders. Archiving preserves history.
2. Manage the optional hierarchy, contacts, work programmes, safety instructions,
   quality follow-up and private document versions in the twelve URL-backed tabs.
   Previously released work orders retain ordinary object/structure snapshots.
3. Under Contact, explicitly bind a **verified existing customer account email**.
   Check its identity first. A contact email alone never gives access. The customer
   can then use `/klant` on the tenant hostname; no account invitation is implied.
4. The customer selects one concrete visit. Requests, attachments, actual read
   receipts, revisions and commercial consent remain attached to that visit.
   A linked execution task cannot be silently rewritten through a changed request.
5. Staff open the dossier from their existing work order. Work-order and planboard
   details show unread/review counts from that same authorized visit context.
   Current mandatory instruction versions must be acknowledged before completion.
6. Management/customer vault managers step up before adding or rotating secrets.
   Management grants individual items to **exact assignment IDs**, not whole teams.
   An extension by planning needs a reason and an end within four hours; it never
   grants an item, activates a user or bypasses OTP.
7. Configure existing reminder recipients in Timeline. The existing worker handles
   pending reviews, deadlines, material issues, upcoming qualification gaps and
   expiring access metadata. Instruction changes notify current assigned personnel.
   Delivery is in-app, deduplicated per event/day; notification delivery is not read
   confirmation. The existing VPS worker timer must actually run successfully.

The central tenant-settings policy is `settings.objectVault`: `beforeMinutes`
(default 60, permitted 0–120), `otpMinutes` (5, 1–5), `viewMinutes` (10, 1–10).
It uses the existing settings JSON; this release does not add a rights editor.
Every operation applies server time; datetime forms use the tenant timezone and
reject ambiguous/nonexistent DST times. Identity budgets: five requests/hour,
one/minute, ten failed verifications/hour, plus 100 requests/object/hour.

Supabase Vault is an explicit migration prerequisite; staging does not need a new
application encryption secret. Never expose its managed root key. Operators must
verify encrypted-backup recovery with the project key retention procedure before
storing real physical-access secrets. No real emails/codes are used by local/CI tests.

## Verification

Real local database tests cover tenant/object/visit isolation, optional hierarchy,
immutable versions, mandatory receipts, regular/commercial separation, concurrent
consent, private documents, exact-item staff scope, window expiry/extension,
OTP replay/concurrency/cumulative limits, logout/deactivation and replanning/rotation.
Browser flows cover the dossier at 1440/768/390/320 pixels, object creation,
private uploads/downloads, visit-bound customer edits and branded OTP delivery
through the local mail sink. Vault flows disable traces, video and screenshots.

Local deployment verification must rebuild from committed migrations, pass the
existing CI suite, then deliberately promote the same main SHA to staging. No
production promotion, legacy connection, VPS unit change or new provider credential
is part of this feature.

## Primary references

- [Supabase Vault](https://supabase.com/docs/guides/database/vault)
- [OWASP authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP transaction authorization](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html)
- [NIST authenticator guidance](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/)
