# Secure dossier and live execution — 6 October 2026

Owner request: secure inline dossier access; a single customer delivery by the
first planned employee; individual execution, free time extensions and live
planning; consistent cards and contextual help; tenant identity everywhere.

Personnel page titles, subtitles and content keep their current positions per
the owner's follow-up. Extra explanatory text becomes contextual help.

## Implementation checklist

- [x] Inline dossier, email OTP <= 2 minutes, viewing <= 5 minutes, live guards.
- [x] Primary employee delivery, shared costs/notes, privacy-safe customer report.
- [x] Work activities, free +15-minute extensions and auditable report timeline.
- [x] Live actual intervals, reflow, missed windows and urgent planner notices.
- [x] Shared cards/actions/rows, accessible help, backoffice/customer page heads.
- [x] Tenant logos/colours, optional small product attribution in email/sidebar.
- [x] Targeted security/database/browser checks and unchanged mandatory release gates.

## Execution and reporting contract

The earliest planned active assignment owns customer delivery (ties: assignment
creation time, then the historical lead for ambiguous legacy ties, then ID). Other employees can stop and complete their own
assignment without a signature. Existing task/checklist/instruction completion,
report immutability, signature hash binding and management review remain enforced.
Customer documents combine customer-visible contributions without staff names.
Internal documents retain attribution. Adding 15 minutes changes only execution
expectations, never task prices, invoice quantities or billing approval.

Reality is recorded per assignment. Running intervals grow with server time;
completed intervals use actual stop time. Subsequent unstarted assignments move
forward with known travel. An impossible customer window returns the affected
unstarted assignment to planning with a deduplicated urgent notice; begun work
is never displaced. Unknown travel is explicitly signalled for planner review.

## Authorization review

Reviewed entrypoints and database definitions on 6 October 2026:

- Dossier entrypoints use the hostname-derived tenant and current Auth session.
  A service-only operation confirms email delivery before accepting a two-minute,
  single-use challenge. Grants bind actor, session, object, visit and live
  assignment/version fingerprint, expire within five minutes, and never bypass
  item scope. Staff direct dossier RPCs require a grant too. Pending challenges
  survive switching to email; active content is hidden/revoked on blur, offline,
  expiry, context change and unmount. No code, grant or dossier is persisted.
- Reporting retains current staff entitlement, dispatch, session, task/checklist
  validation, immutable snapshots, image scanning and signature content hashes.
  Only the first planned active employee can submit/capture the combined report.
  Secondary employees retain their own stop and contribution projection. Primary
  drafts/timelines aggregate only customer-visible colleague contributions;
  private colleague notes/costs remain excluded. Customer copies have no employee
  identity fields. Approved extra-work prices are explicit; pending work has no
  billed total. The free-time ledger changes no financial task fields.
- Live planning takes the existing tenant advisory lock. Public planboard reads
  authorize before refresh. Staff extensions require current execution authority,
  own active assignment, exact version and actor-bound retry keys. The worker is
  service-only. Derived movement respects existing availability/overlap guards,
  preserves deliberately planned order bounds on unrelated reads, and returns affected future assignments instead of
  weakening guards. Warning delivery rechecks tenant module, recipient role,
  active assignment/window and source cause, with per-assignment deduplication.
- New ledgers use forced RLS with no browser or service-role table grants. History
  triggers record only bounded event metadata, never deleted private note bodies
  or dossier values; a cascading parent deletion cannot recreate history.
- Email identity reads only the already authorized delivery/context tenant,
  checks the platform-controlled white-label flag, fails closed when unavailable,
  and retains centrally controlled message content and frozen delivery evidence.
  Platform recipients retain platform identity. Tenant recipients use tenant
  identity, including support mail. Existing provider permits, no-tracking OTPs,
  recipient scope, uncertain-send suppression and safe mail previews remain.
- Shared headers, tooltips, cards, theme portals and modal adapters change
  presentation only; resource routes, actions, data scopes and auth flows remain.
  Native-dialog help is portalled inside its top-layer dialog. Personnel page
  header/content placement is preserved. Existing validation/error text remains
  visible rather than being hidden in contextual help.

Evidence: `scripts/test-object360.mjs`, `scripts/test-live-planning.mjs`,
`scripts/test-work-order-reports.mjs`, `scripts/test-release-security.mjs`,
`scripts/test-security-catalog.mjs`, `tests/e2e/staff-dossier-access.spec.ts`,
`tests/e2e/staff-popups.spec.ts`, `tests/e2e/planboard.spec.ts`,
`tests/e2e/run-ticket-delivery.ts`, `lib/communications/email.test.ts`,
`lib/communications/tenant-email-brand.test.ts`,
`lib/work-orders/report-pdf.test.ts` and the unchanged mandatory release suite.

## Local validation and release gates

Clean migration replay and the immutable statement manifest pass. Targeted
object-access, live-planning, reporting, release-privacy and real Auth/Data API/
Storage checks pass, including wrong actor/session, expired/replayed codes,
colleague-private contributions and unrelated untouched planning. Lint and
TypeScript checks pass. Browser coverage exercises responsive work-order
windows, contextual help, inline email confirmation, handover, existing
commercial/ticket flows and saved appointment preferences. Intended visual
references were inspected without increasing comparison thresholds.

The unchanged pull-request CI verifies the full unit/database/browser suites,
security inventory, scanner and release artifact. Staging is promoted only from
reviewed main history; its existing workflow repeats verification, checks the
host contract, prepares a guarded release and validates worker/HTTP acceptance.
An activation is successful only when both platform and tenant health checks
report the selected exact Git SHA. No production runtime is introduced.
