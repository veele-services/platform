# Dossier 360 — shared operational chain

This alignment extends the existing dossiers. It does not introduce new global
roles, a role editor, a second planning system or a second file store. Existing
authorization remains authoritative; role management remains future work.

## Sources and relationships

| Concept | Authoritative source | Consumers |
| --- | --- | --- |
| Employee, account, evidence and availability | `personnel`, membership/account binding, certificates and existing personnel dossier tables | Personnel dossier, assignment eligibility, planning |
| Customer, contacts and portal identity | `customers`, `customer_contacts`, existing customer-account bindings | Customer and object dossier, portal, invoice |
| Signed customer agreement | `customer_agreements`, `customer_agreement_lines` | Customer dossier, object programme, execution snapshot |
| Site and structure | `objects`, `object_nodes` | Object dossier and visit snapshots |
| Catalogued service and requirements | Existing task revisions, qualification catalog and requirements | Programme, planning, execution |
| Concrete visit and crew | `work_orders`, `work_order_assignments`, `dispatches` | All dossiers, day planboard and staff portal |
| Visit request and consent | `object_visit_requests`, `object_request_proposals` | Customer dossier/portal, object dossier, exact work order |
| Execution and review | `work_order_tasks`, report entries and review decisions | Staff, work-order detail, finance |
| Billable quantity | `invoice_lines.work_order_task_id`, quantity and source snapshot | Individual/grouped invoices; retry-safe invoice creation |
| Private document identity | `dossier_documents` and its original metadata/version row | Authorized context links; bytes remain in original private bucket |
| Follow-up and history | Invoker-rights `dossier_chain` projection of original records/events | `/app/opvolging` and filtered dossier tabs |
| Physical-access secrets | Existing isolated vault, challenge and grant tables | Online, assignment- and session-bound access only |

IDs are reused; there is no name/email-based merging. The forward migration
registers existing document IDs without copying files. Personnel documents cannot
acquire customer/object context through this registry. Registry RLS additionally
requires a current session and access to the original source. Downloads proxy
private bytes through authenticated, no-store endpoints; URLs are not permission.
Object visit downloads retain their exact-visit policy.

## Agreement → execution → invoice

Upload actual evidence at the customer, then register an agreed period, identified
approver, approval date and one or more lines linked to exact object/catalog
revisions. This records supplied evidence; it is not an electronic-signature
verification service. Changes create a successor version; concurrent successors
are rejected. Link the line to the object's work programme.

New regular execution tasks resolve that programme for the whole visit period.
Ambiguous or expired contract links are rejected rather than silently selecting a
different price. Existing tasks retain their original commercial snapshot. The
snapshot contains consent metadata, never vault values. Updating an agreement
does not silently update the work programme or previously released work.

A visit request remains a separate source, linked to its concrete task. Regular
attention inside scope has no extra price. An extra-work proposal must be accepted
on its exact current version. Report approval validates the accepted proposal or
the existing explicitly allowed extra-work rule; an unresolved changed request
blocks approval. Internal review notes are removed from non-manager payloads.

Actual execution is full, partial or not done. Partial/non-execution requires a
reason; planned and actual quantities remain distinct. The old checklist action
and new quantity action update the same source and versioned request/event.
Record follow-up explicitly; a partial result never invents a new approved visit.

`create_execution_invoice` takes an idempotency UUID and source quantities under a
tenant transaction lock. It checks review, customer, task, price, VAT, proposal,
contract limit and remaining allocated quantity. One retry returns the same
invoice. Grouping stays within one customer. Pre-alignment invoice snapshots already carrying a validated task ID count toward
allocated quantities without rewriting the historical invoice. Unresolvable
legacy source rows block another allocation pending financial reconciliation.
Source snapshots retain execution,
object and consent versions. Allocated source quantities cannot be overwritten.
The browser invoices all remaining eligible quantities from selected work orders;
the RPC also supports partial allocations. Remaining quantities keep the work
order invoice-ready. A failed PDF upload can be retried from the invoice's
**PDF herstellen** action, including after reloading the page.

## Separate status dimensions

`lib/dossiers/status.ts` supplies shared execution, action, request, commercial
and billing labels. Native employee/account/availability and evidence states stay
separate. Request review does not imply commercial acceptance; acceptance does
not imply execution; execution does not imply financial approval. Due dates are
calculated properties, not replacement statuses. Reading a notification does not
complete its task. Source mutation functions preserve actor/version/history.

`dossier_chain` is a read model, not another task table. Customer, object,
personnel and work-order filters return existing IDs and source links, constrained
by source RLS. An action changed at its source changes every projection. Personnel
items never enter customer/object projections; unauthorized counts are not added.
Object-history events are projected without their potentially confidential full
before/after payloads. HR history remains at its protected source.

## Time, qualifications and access

Business dates use the tenant timezone (default Europe/Amsterdam) and server
clock. Contract end dates are inclusive; a visit ending exactly at midnight does
not require the next day's coverage. Invoice date/year use the same business
timezone. Planning keeps its existing overlap/capacity, DST and qualification
checks. Object and personnel dossiers use the same qualification-gap RPC as the
planning chain. Uploading evidence is not verification; renewals keep history.

The existing object-vault policy remains the only source for request, verification
and reveal: current account/session, tenant, employee binding, published visit,
assignment version, object/item scope and time window. Defaults remain 60 minutes
before start, five-minute OTP and at most ten-minute reveal, capped by the visit.
See [Object 360](object-360.md) for invalidation, rotation and incident limitations.
Email OTP is re-confirmation, not a claim of independent strong MFA.

## Events, reminders and recovery

Existing outbox events, personnel reminder deliveries and object reminders are
retained. They are reliable equivalents with source/version/context identities;
the alignment does not copy their business tasks. Execution synchronization emits
one event per task version. Existing source-specific reminder rules still govern
certificate/contract deadlines, requests, instruction changes and quality actions.

The worker resolves recipients from current active accounts, memberships,
personnel, assignments and non-revoked dispatches, then checks again before push.
In-app insert retries preserve the original notification and read status. Payloads
are generic and link to the protected source; returned-report reasons are not
included. Provider failures are stored without message contents or secret values.
Personnel deliveries retain failed/uncertain states and bounded retries. A healthy
web process alone does not establish that the VPS worker timer is healthy.

## Explicit integration boundaries

- No credit-note/correction posting workflow exists in the current financial
  module. This change therefore refuses mutation/reuse of allocated quantities,
  including voided invoices, rather than fabricating a safe credit process.
  Financial corrections require that separately implemented, auditable workflow.
- Upload metadata and the existing privacy confirmations reject excluded HR and
  secret document categories. No OCR, content classifier or antivirus integration
  is connected; filename checks are not proof that file contents are safe.
- Push providers do not offer end-to-end exactly-once delivery. In-app records are
  deduplicated, but a provider-accepted push followed by an interrupted worker can
  still be delivered again. Browser receipt/read is not inferred from provider
  acceptance. Do not claim stronger delivery guarantees.
- Physical alarm/key closure is the existing explicit staff confirmation, not a
  connection to alarm hardware. The server still revokes vault access on closure.
- Local/CI scenarios use fictitious identities, an isolated database and a mail
  interceptor. Actual staging provider delivery and physical-access backup/key
  recovery still need operator acceptance with authorized test recipients.

## Verification and release

`test-dossier-alignment.mjs` asserts cross-context source IDs, exact consent,
contract history, concurrent invoice retries, partial allocations, recipient
revocation, session expiry and HR/tenant isolation. Existing personnel, planboard
and Object 360 suites cover qualification validity, time boundaries, assignment
replacement and OTP replay/parallel consumption. The alignment browser flow
exercises agreement upload, programme link, partial execution, report review,
invoice and customer financial deep link with responsive checks.

Rebuild the isolated local database from migrations and run lint, types, unit,
database, browser and build checks. Main must pass CI before deliberately promoting
the same SHA to the existing staging branch; staging verifies, backs up, migrates
forward and activates the release. Production, provider secrets and VPS service
configuration are outside this change.
