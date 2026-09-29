<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Fieldgrid V1 architecture rules

These rules are non-negotiable unless the repository owner explicitly replaces
the architecture in a later request.

## Canonical staging architecture

- `docs/architecture/staging.md` is the canonical specification for the first
  Fieldgrid V1 environment. Update that document before implementing a
  conflicting runtime or deployment change.
- Fieldgrid V1 is a new implementation. Legacy applications, migrations,
  deployment layouts, ports, Caddy routes, services and credentials are not an
  architectural source and must not be copied into V1.
- `main` is the source/development branch and never deploys automatically.
- `staging` is the explicit staging-promotion branch. Do not develop directly
  on it; promote a reviewed `main` commit deliberately.
- Do not create a `production` branch, production workflow or production
  runtime until staging has been completed and accepted and the repository
  owner explicitly starts that phase.

## Fixed staging contract

- Public platform origin: `https://staging.fieldgrid.nl`.
- Tenant origin: `https://{slug}.staging.fieldgrid.nl`.
- A tenant is resolved only from the hostname. Unknown, malformed or inactive
  tenant slugs fail closed and must never fall back to another tenant.
- Tenant workspaces live on the same tenant origin at `/app` (backoffice) and
  `/staff` (personnel). A customer portal is deferred beyond the current V1.
- Next.js listens only on `127.0.0.1:3301`.
- The deploy root is `/opt/fieldgrid/staging`; releases, shared configuration
  and the atomic `current` symlink live below that root.
- The future system service is `/etc/systemd/system/fieldgrid@.service`, with
  staging instance `fieldgrid@staging.service`.
- Caddy will later terminate TLS for the base staging hostname and its wildcard
  and proxy both to `127.0.0.1:3301`. Never expose port 3301 publicly.
- `/api/healthz` must report `status`, staging environment identity and the
  exact deployed Git SHA. A deploy is healthy only when both HTTP and SHA match.

## Environment isolation

- GitHub Environment `staging` is the sole configuration source for staging.
  Its required variables and secrets are configured. Never derive fallback
  values from legacy code, old branches, old environments or local `.env`
  files, and never ask for these values to be copied into the repository.
- When configuration inventory must be checked, inspect names only with
  `gh variable list --env staging` and `gh secret list --env staging`. Never
  retrieve, print or log secret values.
- Staging uses its own Supabase project and provider credentials.
- Production Supabase project ref `ckdtiuemeygrnujjibnw` is forbidden from
  staging. Starting, migrating and backing up must fail closed when the
  expected staging ref is missing, equals the forbidden ref or does not match
  the actual connection.
- Never commit credentials or secret values. Public configuration examples may
  contain only fixed non-secret values and unmistakable placeholders.
- Repository deployment automation and reference service/proxy configuration
  may be maintained here. Actual Caddy, systemd, VPS, runner and Supabase
  mutations remain deliberate operator actions documented by the runbook.
