# Work-order management and task catalogue

## Completed staff contributions

A stopped employee contribution is read-only, even while colleagues continue.
Staff report/cost and task mutation authorization checks the caller's assignment
and the open report state on the server. Management corrections keep their
existing authority. Submitted and approved reports expose no resume action.
The first scheduled employee can finish a still pending customer handover after
stopping their timer; that does not reopen their work or report contributions.

Validation: `lib/staff/work-order-completion.test.ts` checks the action matrix.
`scripts/test-work-order-reports.mjs` checks rejected post-stop costs/tasks and
retained delivery authority, with real local database authorization.

## Tenant work-order management

The dossier uses the shared section headers, quiet cards, aligned actions and
underlined tabs. Overview contains appointment, contact and team information;
communication retains requests, documents and follow-up; related orders remain
under tasks; report exceptions remain under report review. Existing task,
attachment, PDF, checklist, finance, template and history flows are retained.

Tenant administrators and management can remove an active employee with a
required reason. The command checks a live session, tenant, module, role and
order version, stops that employee's open clock, revokes dispatch access and
releases unfinished assigned tasks. Completed work attribution, hours and audit
history remain. Other employees' active work continues. Closed contributions and
submitted deliveries cannot be removed without the existing correction process.

Status changes use the existing release, cancellation and report-review commands.
Management can return scheduled work to planning or reopen an unstarted returned
order for explicit replanning. Live planning preserves a deliberate management
return and the existing untouched-order bounds. Actual starts, completion and
signature checks cannot be fabricated through the status selector. Frozen orders
remain read-only. Actor/tenant/payload-bound mutation IDs make retries safe.

After saving a management action or wizard change, dossier actions stay disabled
through the RSC refresh. This prevents a rapid next action from submitting the
previous order version. The browser regression delays refresh requests by 600 ms
and performs removal, release, return and replanning in immediate succession.

## Task catalogue

Taken, Categorieën, Meerwerk and Templates are separate tabs. The catalogue uses
rows with edit/archive actions and a top-right add button. A two-step dialog
creates or revises tasks; input is preserved when going back. Category prefixes
generate tenant-scoped codes such as SCH-001. Numbering is serialized, skips old
code collisions and consumes no second number on a retry. Prefix edits affect
future tasks; existing codes remain unchanged. Existing uncategorized tasks can
be assigned a category when edited.

Every task edit creates a new immutable revision. Existing orders retain their
original price, duration and evidence requirements. Optional extra-work, photo
and customer-signature requirements follow the revision. Report validation
requires a customer-visible photo when required; task signature requirements
upgrade the effective delivery policy without weakening the existing signature
validation. Historical extra-work rules remain available to their existing orders.

Read access uses the live planning authority, including finance. Writes require
the existing task-management authority. Catalogue prices are projected only for
commercial roles; planners cannot read or overwrite existing rates. Cross-tenant
categories, stale versions and unprivileged direct writes fail closed. The new
table has forced RLS, authenticated scoped reads and no direct write grants.

## Settings and notifications

Settings are grouped into Huisstijl & afzender, Reizen, Personeelsnummering and
Ondertekening. Panels stay mounted so unsaved branding input survives tab changes.
Colour fields use their natural compact height. Notifications retain all inbox,
outbox, scheduled, automatic, template, delivery, permission and preference routes
with consistent tabs, card headers and aligned actions. Existing branding CAS,
logo scanning, module gates and notification authority remain in place.

## Validation

- Staff action matrix: 5 unit tests.
- Staff report authorization: 23 database tests, including stopped contributions.
- Catalogue, management and live planning: focused database tests cover numbering,
  retries, CAS, immutable revisions, role and tenant denial, masked prices,
  photo/signature enforcement, employee removal, status changes, actual clocks and
  untouched planning bounds.
- Browser: task/category create-edit-archive, wizard draft preservation and layout
  at 320/390/1440 pixels; settings draft preservation; management removal and
  release/return/replan; notification and branding regression flows; completed
  staff order without mutation/resume controls.
- Clean local migration replay and immutable manifest verification; lint,
  typecheck and explicit authorization-surface review. Full CI and hosted staging
  acceptance remain mandatory before the promoted release is considered healthy.
