# Customer Visibility Audit v1

Date: 2026-06-23
Scope: TAAK-22 - interne notities en klantzichtbaarheid.

## Checked surfaces

- Customer portal assignment list and assignment detail.
- Customer portal reports overview and report cards.
- Customer portal customer tickets and ticket detail.
- Customer invoice PDF route.
- Customer collective invoice PDF route.
- Customer-facing action/API mappers for assignments, reports and tickets.

## Rules enforced in code

- Customer reports only expose `customerVisibleSummary`, sourced from the approved report content.
- Report management feedback (`reports.notes`) is not selected or returned by customer portal actions.
- Report submitter/reviewer identifiers are not selected or returned by customer portal actions.
- Customer work order tasks expose `customerDescription`, sourced from task code/name, not `assignment_tasks.notes`.
- Customer ticket messages preserve real internal author names in the database, but customer-facing mappers return `Veele Services` for non-customer authors.
- Customer-visible work order photos remain limited to explicitly approved photos.
- Customer invoice PDFs use invoice, assignment, task code, extra work and material line data only; internal notes are not selected in the customer routes.

## Internal-only fields

These fields must stay backoffice-only unless a future migration introduces a separate explicit customer-visible field:

- `assignments.notes`
- `assignments.completion_notes`
- `assignment_tasks.notes`
- `assignment_material_usage.notes`
- `reports.notes`
- `reports.submitter_notes`
- `reports.submitted_by`
- `reports.reviewed_by`
- customer/backoffice ticket internal author names for non-customer authors

## Follow-up recommendation

When the next database hardening pass runs, add explicit customer-facing columns where product text needs editorial approval, for example:

- `reports.customer_visible_summary`
- `assignment_tasks.customer_description`
- `assignment_extra_work.customer_description`

Until then, customer-facing code must continue to map from approved source fields and avoid selecting internal note columns.
