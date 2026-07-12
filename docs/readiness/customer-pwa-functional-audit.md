# Customer PWA Functional Audit

Date: 2026-07-12
Task type: audit-only, with documentation and executable source-contract reproduction tests.
Scope: customer PWA from account activation through payment and aftercare.

## Evidence Layer

This audit is based on repository source inspection and static `node:test` contracts. It did not use staging, live Supabase, Mollie, email, push, DNS, VPS access, browser sessions, database runtime, RLS runtime, Storage runtime, or workflow dispatches.

The new executable test is `tests/security/customer-pwa-functional-contracts.test.mjs`. It reproduces current source-level contracts and known gaps. It is not runtime proof.

## System Boundaries

- Authenticated actor: Supabase auth user resolved through the customer PWA session.
- Trusted tenant source: verified request host through `tenant_domains`, active tenant status, and `customer_portal` entitlement.
- Trusted customer source: `customer_users` row selected by host tenant plus `user_id` or unclaimed matching email.
- Parent tenant binding: most customer reads start from `customer_users`, `customers`, or `assignments`.
- Child entities: object contacts, assignment tasks, photos, quote lines, invoice lines, payments, tickets, and notifications depend on parent or joined tenant context unless they carry their own tenant column.

## End-to-End Trace

| Step | Current behavior | Main risk or gap |
| --- | --- | --- |
| Account activation | Backoffice invite provisions/links `customer_users`; first customer login can claim an unclaimed email row. | Same auth user can be linked to more than one customer in one tenant; runtime identity uses `.limit(1)` without deterministic choice or ambiguity failure. |
| Login | Login accepts any valid Supabase credentials; customer binding happens after session creation. | Wrong host with valid credentials can create a confusing session; data access is mostly downstream-guarded, but login is not tenant-bound. |
| Recovery | Reset request is host/customer scoped; completion only requires current Supabase user session. | Completion does not re-check host tenant, customer link, portal metadata, or reset expiry in the action. |
| Profile and contacts | Profile and contact update use `getMyCustomerIdentity()` and tenant/customer filters. | Good source-level scoping; no runtime cross-tenant proof in this task. |
| Objects | Object list/detail/update filter by identity customer and tenant. | Child contacts are fetched/updated through parent object context, not independent tenant fields. |
| Assignment request | Customer request validates object, customer, tenant, sector relation, inserts tenant from identity, and emits a management event. | Backoffice assignment create/update paths need their own object/customer/tenant mismatch protection outside this audit-only PR. |
| Backoffice receives request | Requested assignments are visible through tenant-filtered backoffice lists. | No runtime proof that every notification path is delivered. |
| Status changes | Customer assignment reads are customer/tenant scoped. | Quote approval sets assignment to `plannable`, not `scheduled`; product wording should be explicit. |
| Quote appears and approve/reject | Quote list/PDF/action paths are customer/assignment scoped and hide draft quotes. | Finance/module-off direct server actions and routes are not enforced beyond `customer_portal`. |
| Approved photos | Assignment detail returns only `isApproved` photos and signs tenant-bound storage paths. | App query relies on parent assignment and storage-path guard, not explicit photo tenant predicate. |
| Reports | Customer report list returns approved reports only and avoids internal note fields. | Report content is the customer-visible body; no separate customer-approved summary field. Reporting module direct access is not server-gated. |
| Invoice visibility and PDF | Invoice list/detail/PDF filter by customer and tenant through customer/assignment joins; invoice PDF download is audited. | Batch PDF lacks audit; finance module direct access is not server-gated. |
| Payment initiation | Customer payments check customer/tenant invoice ownership and open invoice status before Mollie creation. | No finance/payment-settings guard, no provider idempotency key, no transaction around provider creation and local insert. |
| Redirect/result | Pay redirect checks payment tenant, invoice customer, invoice tenant, and open payment status. | Result page is status display only; canonical reconciliation depends on webhook. |
| Webhook/reconciliation | Webhook refetches Mollie status and updates by `molliePaymentId`. | Missing metadata comparison to tenant/customer/invoice; unsigned fallback if webhook secret absent; orphan provider payment is logged and acknowledged. |
| Tickets | Ticket list/detail/create/reply/status are customer/tenant scoped. | Customer-origin ticket domain events have no explicit recipients and `audit: false`, so delivery/auditability are weak. |
| Notifications | Persisted notifications are customer/tenant scoped; synthetic notifications derive from scoped invoices, quotes, reports, and assignments. | Customer notification preferences are saved but not consumed by the central event emitter. |
| Settings | Preferences are read via customer/tenant join and updated by customer id. | Preference updates are not audited and preference rows rely on globally unique customer ids. |
| Module-off behavior | `customer_portal` module gates the portal identity. Desktop navigation hides some disabled modules. | Mobile More and direct server actions/routes for finance, documents, reporting, quotes, payments, and PDFs are not feature-module gated. |
| Suspended tenant | Host tenant resolution requires `trial` or `active` tenants. | Existing provider webhooks can still reconcile by provider id after suspension; expected behavior should be documented. |

## Consolidated Findings

1. **Identity ambiguity:** a customer auth user linked to multiple customers in one tenant gets the first matching `customer_users` row. The required product contract is unresolved: either one active customer context per auth user per tenant, or explicit customer context selection.
2. **Wrong-host session:** login and middleware validate Supabase session, not tenant membership for the current host. Data reads usually fail closed later, but session creation on the wrong host is allowed.
3. **Module gate drift:** `customer_portal` is server-enforced, but finance, documents, reporting, quotes, and payment actions are not consistently server-enforced for direct URLs and server actions.
4. **Assignment object/customer mismatch risk:** customer-created assignment requests are well-bound, but backoffice assignment mutation paths still need object/customer/tenant consistency enforcement.
5. **Quote status mismatch:** customer quote approval changes assignment status to `plannable`; the requested trace says "scheduled". This needs product clarification or a future implementation change.
6. **Payment reliability gaps:** customer payment creation lacks tenant payment-setting checks, server-side idempotency, and provider/local atomicity. Batch payments may conflict with existing payment tenant triggers when `invoice_id` is null.
7. **Webhook reconciliation gaps:** webhook lookup is global by Mollie id and does not compare provider metadata to local tenant/customer/invoice records. Orphan provider payments return `200` without durable recovery.
8. **Aftercare audit/delivery gaps:** customer-created ticket events do not name recipients and are not audited; notification preferences are not enforced by `emitDomainEvent()`.
9. **Runtime proof gap:** existing tests are primarily static source contracts. Cross-tenant UUID probes, disabled-module behavior, RLS, Storage, browser, payment provider, and staging evidence remain unproven.

## Existing Test Layers

- Static source guard: existing `tests/*.test.mjs` source inspections for host binding, cookie scope, quote visibility, invoice PDF audit, payment tenant scope, module harmonization, and tenant hardening.
- Fixture simulation: sprint portal acceptance fixture uses in-memory scenarios.
- Missing layers for this audit: API/server-action runtime, database integration, RLS runtime, Storage runtime, browser/E2E, provider webhook runtime, and staging evidence.

## Required Future Runtime Evidence

- Wrong-host valid-cookie and valid-credential attempts.
- Multi-customer same-auth-user activation and selection behavior.
- Cross-tenant UUID probes for objects, assignments, quotes, reports, invoices, PDFs, payments, tickets, notifications, documents, and settings.
- Direct server actions and routes while finance, documents, reporting, notifications, and customer portal modules are disabled.
- Suspended tenant access for PWA routes and provider webhook reconciliation.
- Duplicate payment clicks and concurrent payment requests.
- Orphan provider payment reconciliation and webhook metadata mismatch.
- Approved-only photo Storage signing under real Storage/RLS.

## Migration Notes

No migration was created, modified, renamed, deleted, or executed. Fixes for assignment object/customer constraints, payment idempotency, batch payment trigger compatibility, webhook reconciliation storage, or customer-visible report fields may require future forward-only migrations.

## Rollback Notes

This PR is audit-only. Rollback is limited to removing the two readiness documents and the static contract test. No runtime behavior, database schema, workflow, deployment script, dependency, or lockfile should change.
