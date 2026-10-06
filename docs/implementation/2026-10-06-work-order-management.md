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
