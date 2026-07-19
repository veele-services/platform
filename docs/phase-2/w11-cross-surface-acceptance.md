# Fieldgrid Phase 2 W11 cross-surface acceptance

W11 proves Phase 2 as one product across backoffice, planboard, personnel PWA,
customer portal, credential recovery, PostgreSQL/RLS, and local PostgREST.

## Sub-agent evidence ownership

1. **PostgreSQL/RLS fixture and integration coverage** owns deterministic Tenant A
   and Tenant B fixtures, RLS denial checks, stale-write conflict checks, and the
   fixture evidence / data-path proof artifacts.
2. **Playwright backoffice/planboard scenarios** owns planned versus actual,
   interest selection, availability conflict, multi-person aggregate state, and
   planboard browser summary evidence.
3. **Playwright personnel PWA/offline scenarios** owns independent participant
   execution, colleague mutation denial, offline replay-once, and personnel
   browser summary evidence.
4. **Playwright customer portal and credential scenarios** owns customer state
   projection, approved-only report/evidence visibility, and credential activation
   / reset denial coverage.
5. **Accessibility, artifact validator and staging runbook** owns axe/keyboard
   summaries, exact-head artifact validation, failure summary, redacted logs, and
   this staging runbook link.

## Required artifacts

- fixture evidence;
- data-path proof;
- browser summary;
- accessibility summary;
- failure summary;
- screenshots/traces only when useful;
- redacted logs.

The generated per-run evidence file is
`artifacts/fieldgrid-phase2-runtime/runtime-acceptance.json`. It is a CI artifact,
not a committed result. `pnpm fieldgrid:phase2-w11` collects only observed
runtime sources and `pnpm fieldgrid:phase2-w11:check` validates their exact-head
provenance against `schemas/fieldgrid-phase2-runtime-evidence.schema.json`.

## Acceptance journeys

| Journey | Required proof |
| --- | --- |
| Planned versus actual execution | planned values preserved, actual start/completion observed, planboard/personnel/customer projections correct |
| Interest selection | select first candidate, partially staffed, select final candidate, scheduled, planboard/personnel/customer projections updated |
| Availability conflict | unavailable/sick person cannot be selected, stale availability edit conflicts safely |
| Multi-person execution | two participants start and complete independently, aggregate assignment state is correct, participant cannot mutate colleague execution |
| Offline replay | personnel starts/completes while offline, reconnect replays once, no duplicate evidence |
| Customer visibility | customer observes scheduled/in-progress/completed, only approved reports/evidence visible |
| Credential recovery | activation/reset succeeds, invalid/expired/replayed challenges denied |
| Tenant guards | Tenant A cannot read or mutate Tenant B across all journeys |
| Durable unassignment | pre-start audit history/actor/reason retained, active count updated, post-start removal denied |
| Realtime | management/personnel/customer events, monotonic versions, scrubbing and forbidden-recipient denial |
| Accessibility | desktop/mobile axe scans, keyboard, focus, labels, associated errors and dialog behavior |

## CI runtime contract

The Phase 2 acceptance job uses PostgreSQL 17, real pinned PostgREST, real local
applications, deterministic fixtures, no live provider, no service-role browser
variable, and exact-head artifact validation before artifact upload.
