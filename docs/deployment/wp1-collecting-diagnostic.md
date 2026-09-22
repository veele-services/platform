# WP1 collecting diagnostic (not reset authorization)

## What changed

Use **Fieldgrid WP1 Collecting Diagnostic**, not the older Clean Base Preflight
`diagnose` operation. This is a separate diagnostic-only contract and artifact.
The existing apply/verify path and payment cleanup eligibility remain unchanged.
The original three-file payment exemption in PR #523 is withdrawn in this change.

The diagnostic collects independent source checks in one run: table reads,
catalog coverage, migration journals, delete/preserve policy, FK references,
canonical tenant management, every observed payment and batch, Auth identities,
Storage buckets/downloads and staging writer state/permissions. All live source
SQL uses a read-only transaction. Each SQL subcheck has a savepoint; failed
savepoint or rollback cleanup is reported rather than swallowed. Missing or
failed prerequisites remain NOT_TESTED, never PASS.

Payment classification is an observation, not a cleanup exemption. Historical
seed signatures (including synthetic `paid` rows) are reported separately from
real provider references. Test-provider GETs are performed independently per
payment, capped at 100 lookups. Exceeding a bound leaves explicit NOT_TESTED
findings and diagnosticComplete=false. No Mollie mutation or live API key is
used. Files, identifiers, metadata and keys never enter public reports.

The dump does not depend on payment eligibility, manager availability or writer
permissions. It uses the same exported read snapshot as observed source data.
A backup/restore problem therefore no longer stays hidden behind a payment error.

## Disposable-copy boundary

The copy worker is spawned with unprivileged user, network and PID namespaces:
`unshare --user --map-current-user --net --pid --fork --kill-child=SIGKILL --mount-proc`.
It receives no source database URL, provider credential, JWT, mail credential or
GitHub token. Its HOME is the private temporary directory. It verifies that the
network namespace differs from its parent and that only loopback is present.
No fallback to the host network is allowed.

It reuses the existing unprivileged PostgreSQL 17 restore helper, restores into a
new loopback-only cluster and checks the actual database, server port, major
version and data_directory against that newly created cluster before any DDL or
DML. Data/catalog/journal fingerprints are compared with the source snapshot.

Mechanical rehearsal is separate from live authorization. On this copy only,
reviewed history guards are suspended, fixed classified tables are deleted with
per-table savepoints, queues are cleared, guards are restored, and the existing
canonical bootstrap and verifier are invoked. Independent delete failures are
collected; dependent bootstrap/verify stages remain NOT_TESTED. Preserved rows,
catalog and journals are checked, then the entire rehearsal transaction is
rolled back and its original fingerprints compared again. No live reset bypass
flag is introduced. Copy PostgreSQL processes cannot survive PID namespace exit.

## Runner prerequisites

Existing protected staging secrets/variables, certificate, migration/runtime
principal separation and exact-main validation are reused. The host also needs
`unshare` and `ip`, with unprivileged user/network/PID namespaces enabled for the
runner. No new sudo/root privileges are requested. An unsupported namespace is
reported as COPY_NAMESPACE_OR_WORKER_UNAVAILABLE; source, payments, Auth, Storage
and backup results still remain available. This limitation must be resolved
without relaxing network isolation before claiming copy rehearsal is complete.

Source connection failures block source-dependent checks, not independent
provider/service inventory. Invalid source identity, environment, TLS or exact
main CI is a hard stop before protected resource access.

## Start after normal review, merge and green exact-main CI

Workflow: `.github/workflows/fieldgrid-v1-wp1-diagnostic.yml`

Inputs:

- `expected_main_sha`: exact current reviewed, green main commit;
- `confirmation`: `fieldgrid-wp1-collect-only-v1`.

There is no apply or mode input. Do not change main protection, force a merge or
run the old diagnose expecting collecting behavior. Existing GitHub Actions
staging concurrency prevents overlap with reset/deploy operations.

## Read the result

The job summary and artifact `wp1-collecting-diagnostic-<run>-<attempt>` contain
only `result.json` and `summary.md`. Dumps, Storage bytes and copy input/output
remain private and are removed at the end. They are never uploaded as artifacts.

- `collectionFinished`: the collector reached its final report;
- `diagnosticComplete`: no planned check remained NOT_TESTED;
- `status=findings`: one or more failures or untested dependencies exist;
- `resetAuthorized=false` and `readyForReset=false`: always, even for all PASS;
- `resetReadiness=NOT_EVALUATED`: a collecting run cannot authorize a reset.

A successful Actions job means the collection completed, not that a reset is
safe. An incomplete collection exits nonzero after writing available evidence.
A preparation failure emits a minimal explicit incomplete report.

Scope checks show every reviewed application relation's current delete/preserve
classification and observed count. Auth identities and website/configuration
resources retained by the existing reset are visible exceptions, not silently
claimed to be removed. Agree the complete cleanup policy using this evidence
before implementing grouped reset changes.

## Verification

Local deterministic tests inject simultaneous domain/provider faults, recover
SQL savepoints, prove read-only capability surfaces, exercise pagination and
confirm namespace credential stripping and no unsafe fallback. The existing
main exact-head PostgreSQL 17 lane additionally runs the real read-only SQL
fault/recovery test. Existing apply evidence validators reject this different
workflow, mode and artifact contract.

The actual staging snapshot, namespace availability, dump/restore and mechanical
copy results are established by the protected diagnostic run, not by source
inspection or a green unit-test badge. Never describe an unexecuted stage as
proven and never promise that all future runtime failures have been discovered.
