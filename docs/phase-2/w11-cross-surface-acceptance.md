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

The canonical deterministic evidence file is
`artifacts/fieldgrid-phase2-w11/cross-surface-acceptance-evidence.json` and is
validated by `pnpm fieldgrid:phase2-w11:check`.

## Acceptance journeys

| Journey | Required proof |
| --- | --- |
| Planned versus actual execution | planned 11:00–12:00, start 09:22, complete 09:44, planboard/personnel projections correct, planned history preserved |
| Interest selection | select first candidate, partially staffed, select final candidate, scheduled, planboard/personnel/customer projections updated |
| Availability conflict | unavailable/sick person cannot be selected, stale availability edit conflicts safely |
| Multi-person execution | two participants start and complete independently, aggregate assignment state is correct, participant cannot mutate colleague execution |
| Offline replay | personnel starts/completes while offline, reconnect replays once, no duplicate evidence |
| Customer visibility | customer observes scheduled/in-progress/completed, only approved reports/evidence visible |
| Credential recovery | activation/reset succeeds, invalid/expired/replayed challenges denied |
| Tenant guards | Tenant A cannot read or mutate Tenant B across all journeys |

## CI runtime contract

The Phase 2 acceptance job uses PostgreSQL 17, real pinned PostgREST, real local
applications, deterministic fixtures, no live provider, no service-role browser
variable, and exact-head artifact validation before artifact upload.
