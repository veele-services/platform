# Fieldgrid UI/UX modernization — W16 staging acceptance

Report date: 26 July 2026
Candidate `origin/main`: `e19e9bc7a5ed0e446b4f95af3043066136da6f06`
Deployed `origin/staging`: `e19e9bc7a5ed0e446b4f95af3043066136da6f06`
Unchanged `origin/production`: `eedbf033ec08a12411760acf8ea7f5d5acf8cc20`
Status: blocked; staging acceptance is not signed off.

## Verified evidence

- PR #375 was squash-merged to the candidate on `main`.
- Main Exact Head Validation run
  [30176027369](https://github.com/veele-services/platform/actions/runs/30176027369)
  completed successfully with 19 successful jobs and no failed, cancelled or
  pending job.
- Staging deploy run
  [30176422862](https://github.com/veele-services/platform/actions/runs/30176422862)
  completed successfully for the exact candidate.
- Deployment evidence records the exact release marker, four active
  application services, four listening ports, local and public backoffice,
  personnel, customer and API health, and no required rollback.
- Public checks on 26 July returned HTTP 200 for:
  - `https://staging.fieldgrid.nl/personeel/healthz`;
  - `https://staging.fieldgrid.nl/klant/healthz`;
  - `https://staging.fieldgrid.nl/api/healthz`;
  - the `field-demo.fieldgrid.nl` personnel and customer runtimes.
- The non-strict dashboard audit and staging/promotion contracts pass.
- Both signed APK/AAB pairs were rebuilt from the exact candidate with a clean
  source marker; package identity, runtime config and signatures were verified.
  No artifact was uploaded to Play Console.
- Production was not deployed or modified.

## Blocking evidence gaps

| Gate                           | Current evidence                                                                                                                                                                                                                                                                                                                            | Required action                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Shared website stack           | Runs [30177953562](https://github.com/veele-services/platform/actions/runs/30177953562) and [30177983471](https://github.com/veele-services/platform/actions/runs/30177983471) failed closed before activation. The missing non-secret GitHub variables were restored; the runner still lacks `/etc/sudoers.d/veele-staging-website-stack`. | Install the reviewed sudoers file on the actual `veele-vps` runner and rerun the exact-SHA staging-only workflow.         |
| Isolated migration rehearsal   | Run [30178041496](https://github.com/veele-services/platform/actions/runs/30178041496) reached both targets, but both configured external Supabase smoke projects returned `tenant/user ... not found`.                                                                                                                                     | Replace both staging migration-smoke secrets with live disposable database URLs and rerun target `all`.                   |
| Authenticated staging snapshot | No `FIELDGRID_STAGING_SMOKE_COOKIE` or `FIELDGRID_STAGING_SMOKE_BEARER` is configured.                                                                                                                                                                                                                                                      | Supply a fresh platform-owner staging session and record the read-only snapshot.                                          |
| Cross-surface browser evidence | Platform, tenant, customer and personnel storage states are not configured.                                                                                                                                                                                                                                                                 | Supply dedicated demo accounts, then run the viewport, accessibility, permission, realtime, offline and visual scenarios. |
| Traceability                   | All 94 PB/RADIX/UX staging results remain `NOT_RUN`; strict gate fails 94 entries.                                                                                                                                                                                                                                                          | Mark an entry `PASS` only after its linked live evidence exists, then run the strict master gate.                         |
| Fieldgrid Android runtime      | Veele returns HTTP 200. `fieldgrid.nl/personeel` redirects cross-host to `www.fieldgrid.nl/personeel`, which returns HTTP 502.                                                                                                                                                                                                              | Restore the canonical Fieldgrid personnel route before Play upload or device acceptance.                                  |

## Acceptance boundary

No failed live scenario is waived by this report. No staging result is promoted
from `NOT_RUN` to `PASS` without authenticated, exact-head evidence. Production
remains outside W16.

STAGING NOT ACCEPTED
