# Environment isolation and staging wildcard TLS

Status: operator runbook. This procedure is intentionally staging-first and
does not authorize database deletion, production deployment or production
configuration changes.

## Invariants

- Staging uses `APP_ENV=staging`, `TARGET_ENVIRONMENT=staging`, the expected
  staging Supabase project and only Fieldgrid-owned application hosts below
  `*.staging.fieldgrid.nl`.
- Production uses `APP_ENV=production`, `TARGET_ENVIRONMENT=production`, its
  separately recorded Supabase project and never accepts
  `*.staging.fieldgrid.nl`.
- Managed tenant domains have exactly one tenant label. For example:
  `veeleservices.staging.fieldgrid.nl` in staging and
  `veeleservices.fieldgrid.nl` in production.
- Externally owned custom domains remain `custom_domain` records. They are
  routable only after domain verification and TLS activation, and recovery
  links require an explicit `FIELDGRID_RECOVERY_ALLOWED_ORIGINS` entry.
- Database access, migrations and seed commands fail before opening a
  connection when the database URL, public Supabase URL, expected project,
  target or application environment disagree.
- Core services and website runtimes must expose the same exact release SHA
  before staging acceptance succeeds.

## Mandatory database identity proof

Do not empty, restore or migrate either environment until this proof is green.

1. In the GitHub `production` environment, set the non-secret variable
   `SUPABASE_PROJECT_REF` to the exact production Supabase project reference.
   This is the lowercase identifier in the production project URL before
   `.supabase.co`. Do not paste the database password or complete database URL
   into the variable.
2. Open GitHub Actions and dispatch **Environment Isolation Preflight** from an
   exact reviewed commit.
3. Enter `compare-staging-production-databases`.
4. Require all three jobs to pass:
   - staging identity;
   - production identity;
   - distinct-project comparison.

The workflow emits only irreversible SHA-256 fingerprints. It never prints the
project references, database URLs or credentials. An identical fingerprint
stops the process immediately.

## Staging configuration after code promotion

Record the exact staging SHA. Update only the GitHub `staging` environment:

- `FIELDGRID_CUSTOM_EXPECTED_HOST`:
  `veeleservices.staging.fieldgrid.nl`;
- `NEXT_PUBLIC_MARKETING_SITE_URL`:
  `https://veeleservices.staging.fieldgrid.nl`;
- custom origin:
  `https://veeleservices-origin.staging.fieldgrid.nl`;
- route key:
  `veeleservices_staging_primary`;
- route release:
  `git-commit:<EXACT_STAGING_SHA>`.
- `FIELDGRID_RECOVERY_ALLOWED_ORIGINS`: only verified external custom domains
  that must receive staging recovery links. Managed
  `*.staging.fieldgrid.nl` tenant domains do not need to be listed.

Do not copy these values into production. Do not use the retired
`veele.staging.fieldgrid.nl` hostname.

## One root action for wildcard TLS

Prerequisites:

- the reviewed commit is already the active staging release;
- `/var/www/veele/staging/current/.fieldgrid-release-sha` equals the recorded
  SHA;
- Caddy includes `dns.providers.cloudflare`;
- the Cloudflare token can edit DNS for `fieldgrid.nl` and read that zone.

Run as root:

```bash
set -euo pipefail
expected="EXACT_STAGING_SHA"

bash \
  /var/www/veele/staging/current/scripts/fieldgrid-staging-wildcard-tls-bootstrap.sh \
  --install \
  --source-dir /var/www/veele/staging/current \
  --expected-sha "$expected"
```

If prompted, paste only the Cloudflare API token and press Enter. The prompt
does not display the token. Do not paste the token into chat, GitHub logs or a
shell command.

The script:

1. verifies the exact active staging SHA;
2. installs only the reviewed staging Caddy, systemd and sudoers assets;
3. stores the token outside the repository with mode `0600`;
4. validates the full Caddy configuration in the Caddy service environment;
5. restarts Caddy only after validation;
6. rolls the configuration back on failure;
7. proves wildcard DNS and TLS against a random unbound staging hostname and
   requires HTTP `404`.

## Final staging verification

After the root bootstrap:

1. dispatch **Website Staging Stack Deploy** for the exact staging SHA;
2. use confirmation `website-staging-stack-only`;
3. require exact core and website release markers;
4. dispatch **Website Staging Acceptance** for that same SHA;
5. verify:
   - `https://veeleservices.staging.fieldgrid.nl/admin`;
   - `https://veeleservices.staging.fieldgrid.nl/personeel`;
   - `https://veeleservices.staging.fieldgrid.nl/klant`;
   - `https://veeleservices.staging.fieldgrid.nl`;
   - a random unknown `*.staging.fieldgrid.nl` host returns `404` with valid
     TLS.

Production remains untouched throughout this runbook.
