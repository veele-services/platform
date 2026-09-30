# Fieldgrid V1 staging runbook

This runbook prepares the existing staging VPS for the new Fieldgrid V1
runtime. It does not reuse, stop or remove a legacy application. Inspect live
paths and services before every operator command and keep production out of
scope.

## 1. GitHub controls

The GitHub Environment `staging` is already populated. In repository settings:

1. Restrict the environment's deployment branches to the protected
   `staging` branch only.
2. Protect `main` and require the `Fieldgrid CI / verify / verify` check before
   merge. Do not add a production environment or branch.
3. Protect `staging` against direct development. Promotions must use a commit
   already contained in `main`.

The deploy job reads configuration only from GitHub Environment `staging`.
Never create a VPS `.env` by hand; the workflow writes the runtime file
atomically without printing its values.

## 2. VPS runtime identity and filesystem

Use a dedicated Linux identity named `fieldgrid` for both the runner service
and the application. Install Node.js 24, `rsync`, `curl`, and PostgreSQL client
tools compatible with the hosted Supabase PostgreSQL version. The runner needs
outbound HTTPS access but port 3301 must remain private.

Create these paths, owned by `fieldgrid:fieldgrid` and inaccessible to other
unprivileged users:

```text
/opt/fieldgrid/staging/releases
/opt/fieldgrid/staging/shared
/opt/fieldgrid/staging/backups
```

Install the repository templates as system units:

- `deploy/fieldgrid@.service` → `/etc/systemd/system/fieldgrid@.service`
- `deploy/fieldgrid-worker@.service` →
  `/etc/systemd/system/fieldgrid-worker@.service`
- `deploy/fieldgrid-worker@.timer` →
  `/etc/systemd/system/fieldgrid-worker@.timer`

Run `systemctl daemon-reload`, but do not enable or start either unit before the
first release and runtime file exist. The deploy starts the web instance; after
that deployment is healthy, enable the web service and enable/start the worker
timer.

Give the `fieldgrid` runner identity passwordless sudo permission for exactly:

```text
/usr/bin/systemctl restart fieldgrid@staging.service
```

Do not grant general passwordless sudo.

## 3. DNS and Caddy

Point both the base record and wildcard record at the staging VPS:

- `staging.fieldgrid.nl`
- `*.staging.fieldgrid.nl`

Adapt `deploy/Caddyfile.example` into the existing Caddy configuration. Both
hosts must preserve the original `Host` header and proxy only to
`127.0.0.1:3301`. The wildcard certificate requires Caddy's DNS challenge,
the matching DNS-provider module, and a provider token stored on the VPS—not
in Git or GitHub workflow output. Validate with `caddy validate` before a
graceful reload.

## 4. Dedicated staging runner

Register the runner at repository level under the `fieldgrid` identity with
these labels:

```text
self-hosted, Linux, X64, fieldgrid-staging
```

Do not attach `fieldgrid-staging` to a production or legacy runner. Install the
current GitHub Actions runner release (compatible with Node 24 actions) as a
boot-enabled service and verify in GitHub that it is online and idle. The
existing generic/offline legacy runner is not a fallback.

## 5. Supabase provider checks

Before promotion, verify in the dedicated staging project:

- Auth Site URL is `https://staging.fieldgrid.nl` and redirect allow-listing
  covers the intended staging tenant host pattern;
- the project is new/empty or its applied migrations are an exact prefix of the
  repository's V1 migration history, including subsequent module extensions;
- Storage has no legacy application data;
- SMTP is configured with the staging SendGrid sender if Auth email delivery
  is enabled.

Do not reset any remote database. The workflow checks all three database URLs
and both API URLs against `EXPECTED_SUPABASE_PROJECT_REF`, refuses the known
production ref, inspects migration history, builds first, creates and validates
a backup, and only then applies forward migrations.

## 6. First promotion

First push the implementation to `main` and wait for `Fieldgrid CI` to pass.
Select that exact green commit SHA and promote it without developing on
`staging`:

```bash
git fetch origin main staging
git merge-base --is-ancestor <green-main-sha> origin/main
git push origin <green-main-sha>:refs/heads/staging
```

The `Verify and deploy staging` workflow reruns the full CI suite, including
all Playwright flows. Only after that job succeeds does the environment-bound
deploy job start. It activates the exact SHA atomically and rejects a health
response unless `status`, `environment`, `database`, and `release` all match.

If activation fails, the script restores the previous code symlink. A database
migration is forward-only and is not automatically rolled back; investigate
before another promotion.

## 7. First administrator and tenant

After the first healthy deployment, select branch `staging` in GitHub Actions
and run **Bootstrap staging platform administrator** once. Sign in at the base
staging origin, open `/platform`, create the first tenant with **Nieuwe tenant**
and use its chosen slug at:

- `https://{slug}.staging.fieldgrid.nl/app`
- `https://{slug}.staging.fieldgrid.nl/staff`

Use the platform tenant detail to upload the approved tenant logo, set branding,
select modules and review the four message templates before visual acceptance.
A remaining `LOGO` placeholder means branding acceptance is incomplete.

Complete `docs/staging-acceptance.md`. Only after explicit staging acceptance
may a separate production architecture, GitHub Environment, branch and runner
be designed.
