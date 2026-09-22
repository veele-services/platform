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
payment, capped at 100 lookups. Provider mode=test, terminal state, amount,
currency and configured profile remain hard safety checks. Historical expected
metadata drift on an otherwise-proven terminal test payment is reported as
`PAYMENT_METADATA_DRIFT_OBSERVED` and does not count as a reset-safety failure.
Exceeding a bound leaves explicit NOT_TESTED findings and
diagnosticComplete=false. No Mollie mutation or live API key is used. Files,
identifiers, metadata values and keys never enter public reports.

The dump does not depend on payment eligibility, manager availability or writer
permissions. It uses the same exported read snapshot as observed source data.
A backup/restore problem therefore no longer stays hidden behind a payment error.

## Disposable-copy boundary

The preferred copy-worker path uses unprivileged user, network and PID
namespaces:
`unshare --user --map-current-user --net --pid --fork --kill-child=SIGKILL --mount-proc`.
On hardened hosts where unprivileged user namespaces are disabled, a reviewed
root-owned helper may provide only the namespace setup. That helper creates a
network/PID/mount namespace, enables loopback and then drops to
`github-runner:veele-deploy`, clears supplementary groups, enables
`no_new_privs` and strips the environment **before repository Node code
executes**. Installation is documented in
`docs/deployment/wp1-copy-sandbox-host-setup.md`.

Both strategies give the worker no source database URL, provider credential,
JWT, mail credential or GitHub token. Its HOME is the private temporary
directory. The worker verifies that it is non-root, PID 1 in its namespace, that
the network namespace differs from its parent and that only loopback is
present. There is no host-network fallback.

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
principal separation and exact-main validation are reused. The host needs
`unshare`, `ip` and `setpriv`. The collector first tries the fully
unprivileged namespace path. If hardened host policy disables user namespaces,
it may use the narrowly scoped root-owned sandbox helper after both sudo
permission and a live helper probe pass. Do not grant generic shell, mount,
unshare, Docker or unrestricted sudo access and do not globally relax namespace
security solely for WP1.

If neither safe isolation strategy works,
`copy.host.isolation_strategy` fails while source, payments, Auth, Storage and
backup evidence remains available. Network isolation may never be bypassed to
make the rehearsal green.

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
