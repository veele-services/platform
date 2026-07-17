# Fieldgrid Phase 2 W11 — Post-merge staging smoke plan

Do not deploy from this task. This runbook is for a post-merge staging smoke on
`main@${GITHUB_SHA}` after the draft PR is merged by a human.

## Preconditions

1. Confirm W01 through W10 are merged into `main`.
2. Confirm the exact merge SHA is available as `main@${GITHUB_SHA}`.
3. Confirm staging secrets are present without exposing service-role credentials
   to any browser process.
4. Confirm no live provider is enabled for the smoke; use deterministic staging
   fixtures only.

## Smoke sequence

1. Run the Phase 2 W11 exact-head acceptance workflow against PostgreSQL 17,
   real PostgREST, and real applications.
2. Verify planned versus actual execution: planned 11:00–12:00, start 09:22,
   complete 09:44, with planned history still visible in planboard and personnel.
3. Verify interest selection moves from first candidate to partially staffed to
   final candidate to scheduled, and updates planboard/personnel/customer views.
4. Verify unavailable/sick personnel cannot be selected and stale availability
   edits conflict safely.
5. Verify two participants can start and complete independently, aggregate state
   completes only after required participants complete, and colleague mutation is
   denied.
6. Verify offline personnel start/complete replays once after reconnect with no
   duplicate evidence.
7. Verify the customer sees scheduled, in-progress, and completed states, while
   only approved reports/evidence are visible.
8. Verify credential activation/reset succeeds and invalid, expired, and replayed
   challenges are denied.
9. Verify Tenant A cannot read or mutate Tenant B across all journeys.

## Evidence review

Review uploaded artifacts for fixture evidence, data-path proof, browser summary,
accessibility summary, failure summary, useful screenshots/traces, and redacted
logs. If any exact-head artifact validation fails, stop and file a follow-up; do
not promote staging.
