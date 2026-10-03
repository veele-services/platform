# Staging worker recovery — 3 October 2026

## Diagnosis

[Run 37084124467](https://github.com/veele-services/platform/actions/runs/37084124467)
targeted `916ab0ec1ae9dbffe78f436c6d0a64dcb8e01a58`.

- Attempt 1 passed verification, host preflight, hosted preparation, backup,
  migrations and attestation validation. The broker activated the release at
  01:21:08 UTC and exact-SHA public health passed at 01:21:11 UTC.
- The worker timer was still paused after the earlier runtime transition. The
  read-only worker gate waited ten minutes and failed at 01:31:12 UTC. Because
  that gate shared the `deploy` job with activation, GitHub marked the whole
  deployment job failed even though activation had succeeded.
- Attempt 2 reran deployment at 20:44 UTC but reused the 01:20 UTC handoff.
  Its signed timestamps exceeded the broker's six-hour limit, so it failed
  before activation. Even fresh attestations would not authorize replaying an
  already installed SHA. Both broker protections behaved as designed.
- A direct public health check at 21:00 UTC returned HTTP 200, `status=ok`,
  `environment=staging`, the exact SHA above, `database=ready` and
  `scanner=ready`. This establishes current web/scanner health, not worker
  success or completion of the skipped acceptance tests.

The original operational cause was the paused timer; the workflow defect was
coupling retryable worker observation to one-time release activation.

## Forward fix

The workflow now puts worker observation in its own `worker-acceptance` job,
between successful activation and hosted acceptance. It first rechecks the
exact release's public health. Retrying a failed worker or acceptance job
therefore leaves the successful activation untouched. The worker gate still
requires a successful invocation started after the web service activation.
No runner privilege, credential boundary, broker freshness limit or
installed-release replay protection changes.

Hosted preparation uses an artifact name scoped to the run and preparation
attempt, and exposes its artifact ID to deployment. This allows a complete
retry before activation to create fresh immutable evidence without colliding
with an earlier attempt's artifact.

## Resume the existing staging worker

After checking the installed release and web health, the VPS operator resumed
the existing `fieldgrid-worker@staging.timer` manually. The workflow runner was
not granted service-management privileges. A new promotion must still prove a
fresh successful worker execution through the read-only `worker-acceptance`
job before hosted acceptance can start.

After recovery, promote the reviewed forward-fix commit from `main` to
`staging`. The original run remains historical failed evidence. Require a
successful new workflow including worker and hosted acceptance, and confirm
public health reports the new commit. Record the resulting run, SHA and worker
evidence here when available.
