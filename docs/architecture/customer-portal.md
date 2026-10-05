# Fieldgrid customer portal — integration contract

Status: local integration implemented; final release gates and hosted acceptance
remain separate. Concrete local findings and checks are recorded in
[`customer-portal-verification-2026-10-05.md`](../security/customer-portal-verification-2026-10-05.md).

Baseline: `5ffaa6dbba1997ee66d256e794eca3e573b80dff`, the reviewed personnel and
compact-filter release. Public staging returned HTTP 200, that exact SHA,
`status=ok`, `environment=staging`, database/scanner ready on 5 October 2026 at
03:32 UTC. Its deploy and fresh-worker gates passed; the first hosted ticket
acceptance exposed two rollback fixtures contending on the global notification
lock. The reviewed fixture-serialization fix (PR 557) was promoted only after
green main CI. Full staging workflow `37263267730`, including hosted acceptance,
then passed for `1f47c7b8621c18cd2a70b570a2ea0cda275154ad`. Public health matched
that exact SHA with database/scanner ready at 04:46 UTC. This does not prove
hosted staff OTP mailbox/provider setup or completed customer-portal features.

## Scope and identity

The supplied customer prototype is the UX reference, not a data, payment or
authorization source. All nine views and fixed-frame dialogs belong to the
existing tenant-origin `/klant`; no new service, global role or general customer
administration is introduced. Development starts after the personnel release.

An explicit tenant/customer/user account binding can exist before an object.
Its management-granted capabilities distinguish creation, own-object editing
and own contact/customer billing editing. Exact active `object_customer_bindings`
remain the resource boundary. An account, shared contact email, created ticket,
payment link or one object never grants all customer objects. A legacy binding
can supply identity, not new self-service rights. Multiple account choices stay
within the hostname tenant and must be explicit, without cross-customer fallback.

Every command and projection rechecks the current Auth session, active user,
tenant and binding/module/resource. Customer profile/contact identity is separate
from staff memberships. Login email is read from verified Auth and immutable in
CRM self-service. Manager invitation and revocation are deliberate, scoped
operations, with one-use fragments and no token logging or browser persistence.
The hostname resolver is unchanged: no automatic account-to-first-tenant
fallback is added. Local browser fixtures supply an explicit local testtenant.
The general workspace excludes vault capabilities, raw draft JSON and internal
request review/response fields; concrete visit interactions retain their
existing separately authorized domain boundaries and need their own safe DTO.

## Screen/action to authoritative-source mapping

| Screen / action | Current source and integration | Authorization / new gap | Verification |
| --- | --- | --- | --- |
| Cockpit, navigation, counters | `app/klant/page.tsx`, `getObjectActor`, `customer_object_visits`, commercial/document/notification projections | New allowlisted workspace DTO; counters and details have identical exact object/customer scope | Two tenants/customers, no internal authors in RPC/RSC/DOM, all five widths |
| First visit and resume | `customers`, `customer_contacts`, exact object bindings; no existing portal wizard | New versioned draft and idempotent atomic first object/binding; only explicit creation grant, no historical reset | Interrupted draft, stale CAS, concurrent completion/retry, immutable login email |
| Objects, edit, onsite contact | `objects`, `customer_contacts`, `object_records`; `save_object_dossier` stays management-only | Bounded customer commands, server numbering, address-source clearing, canonical history/contact links | Foreign customer/object rejected; backoffice sees persisted same source |
| Fixed instructions | `object_records`, immutable versions and staff instruction receipts | Explicit customer-visible ordinary text; no access/vault/internal instructions | Future authorized visit and backoffice share source; private instructions remain hidden |
| Appointments and visit notes | `private.customer_visit_access`, `object_visit_requests`, `submit/update/withdraw_object_*`, planning/review | Safe projection of planned/actual times, same concrete visit and existing state/CAS rules | Replanning and closure, other visit isolation, same staff/backoffice source |
| Services, grouped requests | `commercial_customer_action`, `private.commercial_intake`, `requests` | Explicit atomic group with one existing request per selected own object; no silent first-object selection | Mixed-customer/duplicate objects rejected; replay creates one group |
| Offered quotes and decisions | `commercial_customer_list`, immutable quote versions/snapshot, existing reply/decide and `commercial_customer_file` | Keep current version/validity/consent guards and customer-safe events | Expired/replaced quote denied, accept/reject/change persisted |
| Released reports / documents | `customer_portal_documents`, report `customer_copy`, private download proxies | Approved releases only; frozen safe PDF branding and reauthorization | HTTP bytes/MIME/disposition, historical hashes, no staff identity/signatures |
| Invoices and PDF | `invoices`, `invoice_lines`, `private.customer_invoice_access`, `customer_file_access`, `authorizedFileResponse` | All underlying objects must be bound; restore missing scope/hash metadata without weakening HTTP guards | Real authorized download and revoked link, partial/credited/overdue balances |
| Single/bundled payment | Existing groups/items/attempts/allocations, provider lease, verified Mollie webhook | Customer bundle authorization, integer remaining cents, cross-bundle reservation, verified tenant merchant | Concurrent/retry checkout, forged return, duplicate webhook, merchant mismatch |
| Tenant / Fieldgrid tickets | Existing `ticket_query`, `ticket_command`, upload/scan/download and audiences | Fifth workspace, own reporter only, explicit customer-safe category; no raw-table expansion | No HR/internal notes/authors, revoked file, correct route and allowed status transition |
| News / read state | Customer-directed notification campaigns and durable notification reads | No staff announcements or unauthorized campaign recipients | Customer audience, durable read and no foreign counters |
| Profile / email choices | `customers`, own `customer_contacts`, central `notification_preferences` and delivery policy | Allowlisted explicit editing capability, five groups mapped to real type preferences | Refresh persistence, no login-email/tenant-brand editing, mail worker respects choices |
| Live refresh / offline | Supabase Realtime and authorized refetch | Per-own-customer coarse revision only, reconnect/focus/20s fallback; no rich sources | Subscription isolation/revocation, input preservation and conflict, stale/offline state |

## Domain invariants

- Preserve separate request, quote, confirmed visit, execution and billing
  dimensions. A request is never a confirmed appointment.
- Object instructions are structural; appointment instructions attach to one
  concrete work order. Neither copies to another visit automatically.
- DTOs whitelist public fields and public authors; internal employee identities,
  account IDs, emails, initials, handwritten signatures, review notes and raw
  storage paths never enter customer payloads or documents. Customer authors
  retain their own name, technical replies display Fieldgrid.
- Server-owned statuses, time fields and integer-cent balances are authoritative.
  A browser redirect is not payment confirmation. Reservations are checked under
  a consistent lock order across bundles, and settlement is verified/idempotent.
- Tenant merchant identity is explicit and verified, not derived from a global
  environment key or browser metadata. Connect uses the tenant merchant's
  credentials; absent operator configuration fails closed. No real-money test.
  The initial configured-key connection uses the existing
  `tenant_provider_connections`: an operator explicitly binds one tenant to
  `secret_reference=MOLLIE_API_KEY`, its `profile_id`, mode and verification
  timestamp. The server checks `/v2/profiles/me` against that exact profile
  before checkout. One active profile cannot belong to multiple tenants.
  No connection is created by a migration or inferred from the environment.
  A different tenant merchant therefore needs its own deliberate provider
  configuration; the configured key never acts as a fallback. Each new
  customer payment freezes its profile identity for webhook verification.
- PDF source, legal supplier details, logo bytes and colors are frozen at new
  publication. Historical issued bytes/hashes remain intact. Missing legal
  tenant data is reported, never replaced by fictitious Fieldgrid NAW/IBAN.
- Current access can be revoked even though document content is immutable.
  Downloads reauthorize before and after asynchronous work; no reusable public
  Storage URLs or persistent private browser cache.
- Every dialog is at most 860px wide and 90dvh high on desktop/tablet, internally
  scrolling with a fixed footer; at <=600px it is 100vw by 100dvh. Focus/keyboard
  behavior, dirty input and source versions survive safe live refresh.
- Demo reset/login/payment outcomes/branding management/WebMCP are not shipped.

## Confirmed baseline gap

The final `20261001124500_release_security_gate.sql` definition of
`customer_file_access` returns bucket/path/name/mime but omits scope and invoice
SHA256. The actual isolated database definition confirms this. The HTTP route
requires these fields, so an authorized download can fail closed with 404.
Restore metadata in a forward migration while retaining every current access
guard, and cover the real HTTP route. Do not edit historical migrations.

## Release requirements and external boundaries

Local in-progress checks on 5 October: the customer identity/profile/object/
preferences/onboarding contracts pass 16 rollback tests; customer TypeScript
contracts/actions pass 66 unit tests, scoped lint and typecheck. These are not
browser, hosted acceptance or release evidence. Onboarding checks include
private resume, source conflicts with explicit review, atomic failure rollback,
single completion retry and preservation of other accounts' history.

The approved-report lifecycle exposed two legacy report lists retaining access
after identity revocation. The owner’s instruction to finish the complete portal
authorizes the narrowly scoped forward fix in
`20261005070000_customer_report_list_revocation.sql`: both report lists now require
same-customer live identity, while document/invoice fields and guards remain
unchanged. The actual approved-report lifecycle, including the two revocation
regressions, passes locally. Selected-account download routes additionally
reauthorize after immutable proxy byte generation or storage I/O.

Use the existing mandatory lint/type/unit/database/upgrade/authorization/real
Auth-Data API-Storage-Realtime/AV/build/browser gates. Test deterministic actual
UI against the supplied reference at 1440/1024/768/390/320px, fixed dialogs,
multi-page actual PDFs and desktop/mobile downloads. Record concrete commands,
SHA, results and deviations; presence of code is not evidence.

Only a reviewed green `main` SHA is deliberately promoted to `staging`, whose
full workflow must pass and whose public health must match that exact SHA.
Production is untouched. Provider setup, new secret inventory, Supabase Auth
template/hooks and VPS configuration remain operator actions, never secret
values committed to source. Work through all local functionality before naming
an external chain not yet end-to-end verified.

## Customer refresh boundary

The customer surface uses a separate coarse `customer_portal_revisions` row
per explicit tenant/account, not staff revision rows or rich source tables.
Its authenticated SELECT policy requires the same current own-account/session
guard; inactive tenant/account/contact/user therefore closes it. The only row
fields are tenant ID, own account ID, monotonic revision and invalidation time.
Authenticated clients receive no INSERT/UPDATE/DELETE or private revision-helper
execution rights. Subscribe to UPDATE only; no rich old-row DELETE payload.

Invalidation must follow projected public source changes and exact own bindings,
never general staff, HR, private ticket-note, secret/vault or raw audit activity.
For an account/contact revocation the UPDATE may be suppressed by the now-closed
Realtime policy. Thus the client must also reauthorize on focus/reconnect and a
20-second foreground fallback, and clear private data on denied refresh. Open
forms retain their initialized drafts/source versions and must resolve stale CAS
explicitly, not silently adopt a newer account or object version.

## Completed integration boundaries awaiting release acceptance

The new customer controller now opens account-scoped request/offer details,
versioned quote decisions and replies, scanned ticket conversations for either
the tenant or Fieldgrid, current invoice payments/resume, and real report,
invoice, offer and shared-document downloads. Legacy customer navigation enters
the same workspace. Payment return URLs report an unconfirmed return and display
only server-owned balances; a provider redirect never marks an invoice paid.

Customer tickets use canonical `tickets`, `ticket_messages`, receipts, audit,
assignment and scan pipelines. A private binding connects each ticket to the
explicit creator account. Only dedicated customer-visible, non-confidential
categories permit creation. The customer projection contains reporter-audience
messages with own customer / tenant / Fieldgrid labels, never raw assignees or
internal messages. The final installed ticket engines gain only a customer
dispatch, preserving the central notification module's later catalog and grant
filters for all other workspaces.

The scoped local rollback checks pass for portal identity/self-service and
approved reports (43 tests), commercial decisions (5), and customer tickets plus
notification permission isolation (12). New proxy/action unit checks pass (16).
These are local evidence; the browser suite and the complete deployment gates
remain authoritative for release acceptance.

The final report adapter forces `customer_copy` even for a user who also has a
staff or management role. It validates the frozen public snapshot, excludes
employee signatures and captured-by identifiers, verifies asset hashes and
reauthorizes after rendering. The original role-sensitive backoffice report
route remains separate. The real lifecycle regression covers this hybrid-role
case and subsequent customer-account revocation.

Released-report and confirmed-provider-payment transitions now feed the same
central notification engine through migration 75300. Source triggers freeze
eligible customer accounts and write an outbox event; the worker enqueues later
without taking a notification policy lock beneath a payment/invoice row lock.
Source-time suppressed channels and applicable policy/preference revisions
prevent old deferred messages from reviving after preferences change. Every
worker/read checks exact current account/contact/module/object scope again.
The real report/payment lifecycle plus these notification regressions passes
28 local tests; no hosted mail delivery or real-money payment is implied.

Payment preparation also rechecks current account, finance module, merchant and
all invoice scopes after waiting on its command and invoice locks. A three-session
local test revokes account, object binding or merchant while the caller waits and
asserts denial without additional allocations. The complete customer unit/API
suite currently passes 305 tests; the report/ticket lifecycle passes 24 and the
new payment concurrency suite passes four. The integration browser run passes
all five widths, preserved dirty input, real multi-page PDF download, durable
ticket conversation, payment return and account revocation. The latest full
release runs remain authoritative for the final commit.
