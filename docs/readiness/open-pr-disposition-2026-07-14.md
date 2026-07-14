# FIELDGRID durable open PR disposition plan — 2026-07-14

Repository: `veele-services/platform`
Existing PR: `#299`
Existing branch: `feature/audit-open-prs-and-create-disposition-plan`
Canonical main before start: `42edb5664ed507ed914b8bebf8847ab1f6e39f74`
Audited old base: `f36e84dad5d1c595e4dd349ff5ce6bd439722576`

This is a durable documentation/test plan only. Do not merge, deploy, modify protected environments, access live databases, or close old PRs until the listed human action is complete.

## Durable canonical schema

Each old PR is represented only by stable, decision-relevant fields. `prDependencies` contains only real PR ordering dependencies; evidence-only PRs are not runtime dependencies. `runtimeRequirements` contains implementation proof requirements that must be satisfied at runtime review time. Transient GitHub state is intentionally excluded because it belongs at merge time.

## Disposition matrix

| PR | Title | Type | Head SHA | Runtime | Migration | Disposition | Replacement | PR dependencies | Runtime requirements | Delete branch after completion | Human action |
|---:|---|---|---|---|---|---|---|---|---|---|---|
| #279 | cross-surface functional flow map | audit/documentation | `f3717074f3547c5a26d08e297c2d9fb885f16e00` | False | False | `EXTRACT_EVIDENCE_THEN_CLOSE` | none | none | none | True | Extract useful evidence into the current register or implementation backlog, then close PR #279 after reviewer confirmation. |
| #280 | old runtime entrypoint inventory | tooling | `3bfc31d95983cf058464af573775e2a6b77c5271` | False | False | `SUPERSEDED_CLOSE` | #302 | #302 | none | True | After PR #302 is merged, close PR #280 as superseded and link to #302. |
| #281 | auth provider boundary ADR | architecture/documentation | `9514e926b8449b6a0c8cc871ed7bd2aa2b994f4c` | False | False | `SUPERSEDED_CLOSE` | #298 | #298 | none | True | After PR #298 is merged, close PR #281 as superseded and link to #298. |
| #282 | platform administration audit | audit/documentation | `5ed1bc48893cb1ec05ee0dd572ad7c76b64bb850` | False | False | `EXTRACT_EVIDENCE_THEN_CLOSE` | none | none | none | True | Extract useful findings into the current register or implementation backlog, then close PR #282 after reviewer confirmation. |
| #283 | customer PWA audit | audit/documentation | `86867013c1082b7377e99195dfadabd48acb1419` | False | False | `EXTRACT_EVIDENCE_THEN_CLOSE` | none | none | none | True | Extract useful findings into the current register or implementation backlog, then close PR #283 after reviewer confirmation. |
| #284 | interest selection/scheduling | implementation | `920fd658a0d4612086d508174574721c6b80b8ef` | True | False | `RETAIN_REBASE_COMPLETE` | none | none | rebase onto current main; reconcile with the canonical tenant-bound assignment command layer; PostgreSQL concurrency proof for simultaneous final-slot selection; Tenant A/B database isolation; API/server-action runtime proof; browser proof for planning, personnel and customer visibility; idempotent retry and no duplicate assigned link; notification/outbox behavior proven separately | False | Retain PR #284, rebase it onto current main, satisfy the listed runtime requirements, and complete review before merge consideration. |
| #285 | tenant backoffice audit | audit/documentation | `7511251b702599517a48fe25bb819bcccce1a2c0` | False | False | `EXTRACT_EVIDENCE_THEN_CLOSE` | none | none | none | True | Extract useful findings into the current register or implementation backlog, then close PR #285 after reviewer confirmation. |
| #286 | credential challenge/reset | implementation with migration | `1810a20b9092623c420a23e1c6363694e63148bc` | True | True | `REBUILD_FROM_CURRENT_MAIN` | none | #298 | rebuild from current main; recreate migration in current forward-only migration order; challenge and reset-grant database concurrency; RLS and ACL proof; per-IP, per-account and per-tenant rate limits; complete session revocation; admin step-up or MFA; provider mock; browser E2E; staging smoke | False | Rebuild PR #286 from current main, recreate the migration in current forward-only order, satisfy the listed runtime requirements, and continue only through the rebuilt implementation path. |
| #287 | personnel PWA audit | audit/documentation | `bb2772eb8e9e586eaedec1f14a993f77cb62cd68` | False | False | `EXTRACT_EVIDENCE_THEN_CLOSE` | none | none | none | True | Extract useful findings into the current register or implementation backlog, then close PR #287 after reviewer confirmation. |
| #288 | assignment P0 evidence | reproduction | `2253f4bf857cc1e33112ac2c0ad0268e6d08a700` | False | False | `EXTRACT_EVIDENCE_THEN_CLOSE` | none | none | none | True | Extract the reproduction evidence into the current register or implementation backlog, then close PR #288 after reviewer confirmation. |
| #289 | atomic personnel availability | implementation | `cb9a92ab2fbf57a9f7fdc883dc86ff9d1ade890d` | True | False | `RETAIN_REBASE_COMPLETE` | none | none | rebase onto current main; atomic PostgreSQL transaction proof; simultaneous save concurrency; stale updatedAt conflict; overlap validation; Tenant A/B isolation; API/server-action runtime; browser E2E | False | Retain PR #289, rebase it onto current main, satisfy the listed runtime requirements, and complete review before merge consideration. |
| #290 | finance/webhook/worker integrity | reproduction | `cde9bc640598ff3febd561bb97c4a4ed2374a4a6` | False | False | `EXTRACT_EVIDENCE_THEN_CLOSE` | none | none | none | True | Extract useful evidence into the current register or implementation backlog, then close PR #290 after reviewer confirmation. |
| #292 | multi-person execution model | architecture | `ce9055f007117d5e938e0af202f8b99c00a82022` | False | False | `PARK_ARCHITECTURE` | none | none | none | False | Park PR #292 as architecture reference material and revisit during the multi-person execution design review. |
| #293 | old pre-Phase-B register | documentation/register | `9e2e708eee1c3c684b6bdb8ac22f2945540dbc2b` | False | False | `SUPERSEDED_CLOSE` | #297 | #297 | none | True | After PR #297 is merged, close PR #293 as superseded and link to #297. |

## Integration waves

### Wave 1
- #300
- #302
- #298

### Wave 2
- #299

### Wave 3
- Rebase #297.
- Validate #297 against merged #299.
- Merge #297.

### Wave 4
- #301 only after all its workflows are green.

## Post-replacement closures
- Close #280 after #302.
- Close #281 after #298.
- Close #293 after #297.

## Evidence closure rule
Audit/reproduction PRs may be closed only after their useful evidence is represented in the current register or implementation backlog.
