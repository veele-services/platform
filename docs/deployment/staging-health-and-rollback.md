# Staging Health Gate And Symlink Rollback

This runbook defines the staging-only post-deploy health gate added to the deploy workflow. It does not dispatch a workflow, access staging, read live secrets or run down migrations. The production deploy path remains the existing direct symlink activation and service restart path from `origin/main`; the new activation script and health gate are guarded to reject non-staging use.

The scripts are Linux deployment tooling. They run under `bash` on the self-hosted Linux runner and use GNU `mv -T` for atomic symlink replacement.

## Activation Contract

1. The release directory is prepared, dependencies are installed and static release checks pass.
2. Build and database migrations must succeed before activation.
3. The activation script records the previous `current` symlink target.
4. The new release writes `.fieldgrid-release-sha` with the expected Git SHA.
5. `scripts/fieldgrid-atomic-release-activate.sh` atomically moves `current` to the new release.
6. The health gate restarts exactly the four core services, plus the website
   runtime and independent marketing runtime when their complete service/port
   pairs are configured, and reloads Caddy before checking the new release.
7. `scripts/fieldgrid-deploy-health-gate.sh` verifies symlink state, SHA marker, services, ports, local endpoints and public endpoints.
8. On health failure, the health gate restores the previous symlink, restarts the same services, reloads Caddy and verifies rollback health.
9. The failed release directory and health evidence JSON are preserved under the release/shared artifact path.
10. The workflow fails after rollback so the deployment is visibly blocked.

## Required Staging Configuration

The workflow passes these values from GitHub environment variables:

| Variable                                                                                      | Purpose                                          |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `BACKOFFICE_SERVICE_NAME`, `PERSONEEL_SERVICE_NAME`, `KLANT_SERVICE_NAME`, `API_SERVICE_NAME` | The four systemd services to verify and restart. |
| `BACKOFFICE_PORT`, `PERSONEEL_PORT`, `KLANT_PORT`, `API_PORT`                                 | Local listening ports to verify.                 |
| `BACKOFFICE_PUBLIC_URL`, `PERSONEEL_PUBLIC_URL`, `KLANT_PUBLIC_URL`, `API_PUBLIC_URL`         | Public endpoints for post-activation checks.     |
| `WEBSITE_SERVICE_NAME`, `MARKETING_SERVICE_NAME`                                              | Optional staging website service pairs.          |
| `WEBSITE_PORT`, `MARKETING_PORT`                                                              | Their unique localhost-only ports.               |
| `WEBSITE_PUBLIC_HEALTH_URL`, `MARKETING_PUBLIC_HEALTH_URL`                                    | Exact public `/healthz` process probes.          |
| `FIELDGRID_DEPLOY_HEALTH_ATTEMPTS`                                                            | Retry attempts per health check.                 |
| `FIELDGRID_DEPLOY_HEALTH_RETRY_SECONDS`                                                       | Delay between retries.                           |
| `FIELDGRID_DEPLOY_CURL_MAX_TIME_SECONDS`                                                      | Per-request curl timeout.                        |

Endpoint lists can be overridden with newline-separated `name|url|mode` entries via `FIELDGRID_DEPLOY_LOCAL_ENDPOINTS`, `FIELDGRID_DEPLOY_API_ROOT_ENDPOINTS` and `FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS`. Supported modes are:

- `exact-200`: only HTTP 200 is healthy. Personnel, customer and API healthz probes use this mode locally and publicly.
- `login`: HTTP 200 and the explicitly documented login-safe redirects 301, 302, 303, 307 and 308 are healthy. Backoffice `/login` uses this mode locally and publicly.
- `api-root-404`: only the deliberately expected API-root HTTP 404 is healthy.

Default local probes are exactly four core service endpoints. Staging website
activation adds two explicit endpoints:

| Surface                   | Local probe                                            |
| ------------------------- | ------------------------------------------------------ |
| Backoffice                | `http://127.0.0.1:${BACKOFFICE_PORT}/admin/login`      |
| Personnel PWA             | `http://127.0.0.1:${PERSONEEL_PORT}/personeel/healthz` |
| Customer PWA              | `http://127.0.0.1:${KLANT_PORT}/klant/healthz`         |
| API                       | `http://127.0.0.1:${API_PORT}/api/healthz`             |
| Website (optional pair)   | `http://127.0.0.1:${WEBSITE_PORT}/healthz`             |
| Marketing (optional pair) | `http://127.0.0.1:${MARKETING_PORT}/healthz`           |

API-root is checked as a separate classification probe. HTTP 404 is accepted only for endpoints whose mode is `api-root-404`; 404 remains a failure for `exact-200` service endpoints. Public API root is not also added to the public healthz endpoint group, so the API root contract is checked once.

The gate requires exactly four services, ports and local/public endpoints by
default, exactly five when the website pair is configured, or exactly six when
both website pairs are configured. Any partial pair fails closed.
Evidence JSON is machine-readable, written with mode `0640`, and records only
URL origins in endpoint details.

## Rollback Boundaries

Rollback is application-level only:

- The gate restores the previous release symlink.
- The gate restarts the configured services and reloads Caddy.
- The gate never runs a down migration automatically.
- If a database migration is not backward compatible, the previous app release may be incompatible with the migrated schema. Treat that as a release blocker and use a database restore plan or a forward fix.

Migration failures before activation leave the existing `current` symlink untouched. Health failures after activation preserve the failed release and evidence logs for diagnosis.

## Operator Stop Rules

Stop the deploy before activation when any of these are true:

- The release contains a forward-only schema change that has not been proven backward compatible with the previous app release.
- The previous `current` target is missing, outside `$BASE_DIR/releases`, or lacks `.fieldgrid-release-sha`.
- Fewer or more than four service names, ports or local service endpoints are configured.
- Public endpoint variables contain signed or tokenized paths instead of plain service origins.
- Any service restart, Caddy reload, health check or rollback health check fails.

## Local Test Command

```bash
pnpm fieldgrid:deploy-health-gate:test
```

The test suite uses temporary release directories and mocked `systemctl`, `ss`, `curl` and `sleep` commands. It covers healthy activation, service failure, missing port, public 502, exact healthz HTTP status handling, allowed API-root 404, API-root 200 rejection, rollback success, rollback health failure, missing previous release and migration failure before activation.

The PR-only CI workflow also runs `pnpm fieldgrid:test:baseline-differential`. That gate checks out the current `origin/main` SHA in a separate clean worktree, uses the same Node 24, pnpm 11.5.2 and frozen install, and directly runs every enumerated root `tests/*.test.mjs` file for main and the candidate. The candidate file set must be a superset, its executed-test count may not decrease, and skips may not increase without an explicit allowlist. The gate reports main failures, candidate failures, common failures and candidate-only failures. It may pass with proven identical baseline failures, but that is reported as `baseline differential`; it is not evidence that the full root test suite is green.
