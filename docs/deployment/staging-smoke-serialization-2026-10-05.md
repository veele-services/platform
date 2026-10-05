# Hosted acceptance serialization — 5 October 2026

Release `5ffaa6dbba1997ee66d256e794eca3e573b80dff` passed main CI, full staging
verification, host preflight, preparation/migrations, atomic activation and fresh
worker acceptance. Public health at 03:32 UTC was HTTP 200 with that exact SHA,
database/scanner ready. Workflow `37258310370` nevertheless failed its final
hosted ticket smoke; do not describe the whole workflow as green.

The first failure was SQLSTATE `57014` during ticket creation in
`scripts/test-ticket-delivery.mjs:72`. Its database stack identifies the shared
transaction advisory lock `fieldgrid-notification-policy`, acquired by
`private.notification_enqueue`. The concurrently running rollback-only
`test-tickets.mjs` suite held this lock until its transaction ended and took
175.7s on the hosted connection. The delivery suite timed out after waiting;
its dependent failures are not independent evidence of thirteen product faults.
Local CI passes quickly enough to conceal this cross-fixture contention.

The repair serializes files in both remote rollback-only smoke invocations with
Node's `--test-concurrency=1`. It retains all five suites, every assertion,
timeout, staging project/TLS guard, exact-SHA check and rollback-only connection
restriction. It does not change runtime SQL/permissions, invoke a provider or
alter Caddy/systemd/Supabase configuration. Application health is not substituted
for final acceptance. A new reviewed main commit and full promotion are required;
the already activated broker handoff must not be replayed.

`lib/operations/staging-smoke.test.ts` prevents losing serialization, probes or
guards (2/2 passed). A real local two-client transaction probe acquired the exact
shared policy lock, demonstrated SQLSTATE `57014` for the concurrent transaction
with a bounded 250ms timeout, then acquired it successfully after the first
rollback. Both transactions were rolled back; no durable fixture was written.

At 03:44 UTC the unchanged five suites passed with the proposed invocation:

```text
node --test --test-concurrency=1 scripts/test-work-orders.mjs scripts/test-work-order-reports.mjs scripts/test-work-order-lineage.mjs scripts/test-tickets.mjs scripts/test-ticket-delivery.mjs
66 passed, 0 failed, 0 skipped (9.6s, isolated local database)
```

The local database also contains the in-progress additive customer identity
migration; the fix PR and its clean CI contain no customer implementation or
migration. Hosted acceptance and new exact-SHA promotion are still required.

Additional local checks: `pnpm lint`, `pnpm typecheck`, `pnpm security:review`
(885 completed surfaces), `git diff --check`, and
`pnpm exec vitest run lib/operations lib/auth/authorization-review.test.ts`
(61 tests in 10 files) all passed. The workflow operation surface was reviewed
and its exact source/fingerprint updated; no customer catalog changes are part
of this releasefix.
