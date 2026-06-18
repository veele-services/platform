# Self-hosted deploy flow

## Branch roles

- `main`: integration branch for reviewed feature work.
- `staging`: deploy branch for acceptance testing at `https://staging.veele.dgwebservices.nl`.
- `production`: live deploy branch at `https://app.veele.dgwebservices.nl`.

## Promotion path

Normal path:

1. Merge feature work into `main`.
2. Promote `main` into `staging`.
3. Validate staging.
4. Promote `staging` into `production`.

Emergency path:

1. Create `hotfix/*`.
2. Merge `hotfix/*` into `production`.
3. Back-merge the hotfix into `main` and `staging`.

The `Promotion Guard` workflow enforces the normal release flow on pull requests into `staging` and `production`.

## Deploy workflow contract

The deploy workflow is `.github/workflows/deploy.yml`. It handles both deploy branches:

- `staging` deploys to the GitHub `staging` environment.
- `production` deploys to the GitHub `production` environment.

The workflow runs on `[self-hosted, linux, x64, veele]` and performs this sequence:

1. Check out the repository at the pushed commit.
2. Verify the runner runtime.
3. Create a timestamped release directory under `/var/www/veele/<environment>/releases`.
4. Write the environment file from GitHub environment variables and secrets.
5. Install dependencies with `pnpm install --frozen-lockfile --prod=false`.
6. Build the workspace with `pnpm build`.
7. Run database migrations against the environment `DATABASE_URL`.
8. Activate the release by updating `/var/www/veele/<environment>/current`.
9. Restart the matching systemd service(s) and reload Caddy.
10. Clean up old releases.

The workflow no longer SSHes into the VPS. Deployment happens on the self-hosted runner that already has local filesystem and service-manager access.

## Self-hosted runner labels

The deploy workflow selects the shared Veele runner labels:

- `runs-on: [self-hosted, linux, x64, veele]`

The `Promotion Guard` workflow uses `runs-on: self-hosted` because it is not environment-specific.

## GitHub environments

Create two GitHub environments:

- `staging`
- `production`

Each environment must define these secrets:

- `DATABASE_URL`: Postgres connection string for this environment.
- `JWT_SECRET`: secret used for signed JWTs.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon key used by browser-safe clients.
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL used by browser-safe clients.
- `SESSION_SECRET`: session signing secret.
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key. Server-side only; never expose this in client code.

Required when payments, webhooks, e-mail, or scheduled admin routes are enabled:

- `MOLLIE_API_KEY`: Mollie API key for payment creation and webhook reconciliation.
- `MOLLIE_WEBHOOK_SECRET`: HMAC secret expected in `x-mollie-signature`.
- `ADMIN_API_SECRET`: bearer token used by `/api/admin/payment-reminders` and `/api/admin/expired-quotes`.
- `RESEND_API_KEY`: Resend API key for transactional e-mail.

Optional secret:

- `SUPABASE_JWT_SECRET`: fallback JWT secret for the API server if JWKS via `SUPABASE_URL` is not used.

Each environment must define these variables:

- `APP_ENV`: `staging` or `production`.
- `APP_URL`: public URL for the environment, for example `https://staging.veele.dgwebservices.nl` or `https://app.veele.dgwebservices.nl`.
- `NEXT_PUBLIC_APP_URL`: public browser URL for the frontend; normally the same value as `APP_URL`.
- `BASE_PATH`: optional base path used by the application and written to `.env`.
- `NODE_ENV`: normally `production`.
- `PORT`: runtime port for this environment.

Optional variable:

- `NEXT_PUBLIC_APP_NAME`: browser-safe app display name.
- `SITE_URL`: canonical URL used by API-server e-mail links. Defaults to `APP_URL`.
- `NEXT_PUBLIC_SITE_URL`: canonical browser URL for PWA e-mail links. Defaults to `NEXT_PUBLIC_APP_URL` or `APP_URL`.
- `LOG_LEVEL`: API-server log level. Defaults to `info`.
- `MOLLIE_WEBHOOK_URL`: explicit Mollie callback URL if auto-derived URLs are not correct.
- `RESEND_FROM_EMAIL`: sender identity, for example `Veele <noreply@example.nl>`.

Optional multi-service deploy variables:

- `BACKOFFICE_SERVICE_NAME`: systemd service for the backoffice. Defaults to `SERVICE_NAME` (`veele-staging` or `veele-production`).
- `PERSONEEL_SERVICE_NAME`: systemd service for `@workspace/personeel-pwa`; if omitted, not restarted by deploy.
- `KLANT_SERVICE_NAME`: systemd service for `@workspace/klant-pwa`; if omitted, not restarted by deploy.
- `API_SERVICE_NAME`: systemd service for `@workspace/api-server`; if omitted, not restarted by deploy.
- `BACKOFFICE_PORT`: runtime port for backoffice. Defaults to `PORT`.
- `PERSONEEL_PORT`: runtime port for personnel PWA.
- `KLANT_PORT`: runtime port for customer PWA.
- `API_PORT`: runtime port for API server.

The deploy job writes all configured secrets and variables into the shared
environment file at `/var/www/veele/<environment>/shared/.env`. For multi-service
deploys, each systemd unit should set its own `PORT` from the matching
`*_PORT` value, while all services can share the rest of the environment file.

The deploy wrapper receives GitHub metadata as arguments:

```text
--environment <staging|production>
--repository <owner/name>
--ref <branch>
--sha <commit>
--run-id <github-run-id>
--run-attempt <github-run-attempt>
```

It also inherits the GitHub environment secrets and variables listed above, so it can write runtime environment files or update process manager configuration without storing secrets in the repository.

## Database migrations

Database schema changes are managed through `@workspace/db` with Drizzle:

- Generate committed migration files with `pnpm run db:generate`.
- Deploy workflows apply committed migrations with `pnpm run db:migrate`.
- Do not use `push-force` in deploy workflows.
- Hand-written Supabase SQL migrations in `lib/db/migrations/*.sql` are applied once and tracked in `drizzle.veele_sql_migrations`.

The migration step runs after validation/build and before deployment. If migrations fail, deployment stops.

### Existing database baseline

The current staging and production databases were created before Drizzle migration history was tracked. Before deploy migrations can run safely, baseline each environment once:

1. Run `Database Inspect` for `staging` and `production`.
2. Confirm both schemas match the committed app schema.
3. Run `Database Baseline` for `staging` with `confirm` set to `baseline`.
4. Run `Database Baseline` for `production` with `confirm` set to `baseline`.
5. Deploy `staging` and confirm `pnpm run db:migrate` reports no unexpected changes.
6. Deploy `production`.

The baseline workflow creates migration history records only. It does not create, drop, or alter application tables. It refuses to baseline an empty or mismatched database.

## Database inspection

Use the GitHub Actions `Database Inspect` workflow before any reset or baseline migration work.

1. Open GitHub Actions.
2. Select `Database Inspect`.
3. Click `Run workflow`.
4. Choose `staging` first.
5. Download the `database-inspection-<environment>-<run-id>` artifact.
6. Repeat for `production` only after staging has produced a useful report.

The inspection workflow uses the selected GitHub environment's `DATABASE_URL` secret. It does not print or export the connection string, and it does not read table data. The report contains schema metadata: schemas, relations, columns, constraints, indexes, policies, triggers, functions, enums, extensions, views, Drizzle migration history if present, and estimated row counts from PostgreSQL metadata.

The wrapper should validate:

- the requested environment matches the runner/deploy path
- the requested branch is allowed for that environment
- the requested commit exists in the repository
- the deploy path is environment-specific
- the release is logged with commit SHA and GitHub run metadata

## Branch protection

Recommended repository rules:

- block direct pushes to `staging` and `production`
- require pull requests for `staging` and `production`
- require the `Promotion Guard` check to pass
- require environment approval for `production`
- require the deploy workflows to pass before merge completion where applicable

## Scheduled jobs

Use [systemd-timers.md](./systemd-timers.md) to enable the API-server jobs for
expired quotes and payment reminders after `API_SERVICE_NAME`, `API_PORT`, and
`ADMIN_API_SECRET` are configured.
