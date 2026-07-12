# Fieldgrid Runtime Safety Harness

This harness is the first executable runtime safety layer for Fieldgrid that does not use staging, production, provider secrets, or live Supabase projects.

It runs against an ephemeral PostgreSQL 17 database with explicit local compatibility shims for Supabase-specific schema features:

- roles: `anon`, `authenticated`, `service_role`
- schema/functions: `auth.users`, `auth.uid()`, `auth.jwt()`
- storage scaffolding: `storage.buckets`, `storage.objects`, `storage.foldername(text)`

Compatibility limits are intentional and reported in `artifacts/runtime-safety-harness/reports/setup.json`. The local shims are enough to compile and exercise SQL migrations, PostgreSQL RLS policies, tenant fixtures, and the local Express API middleware. They are not proof of Supabase GoTrue, Supabase Storage object runtime, signed URLs, JWKS, provider webhooks, e-mail delivery, Mollie, DNS, or staging behavior.

## Commands

Run the full harness only with a disposable local database:

```sh
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/fieldgrid_runtime_safety
export FIELDGRID_RUNTIME_SAFETY_ALLOW_RESET=1
pnpm fieldgrid:runtime-safety
```

Layer commands:

- `pnpm install --frozen-lockfile`: frozen install layer.
- `pnpm fieldgrid:migration-order-check:check`: static migration order policy.
- `pnpm fieldgrid:runtime-safety:setup`: installs local shims and runs empty database migrations.
- `pnpm fieldgrid:runtime-safety:fixtures`: loads deterministic platform, Tenant A/B, suspended, module-off, multi-tenant, expired invite/recovery/support fixtures.
- `pnpm fieldgrid:runtime-safety:db`: database integration, schema invariant, assignment exploit, tenantless-write, and RLS/storage scaffold checks.
- `pnpm --filter @workspace/api-server run build`: API build for runtime checks.
- `pnpm fieldgrid:runtime-safety:api`: local API runtime checks.
- `pnpm fieldgrid:runtime-safety:teardown`: guarded cleanup; destructive reset only happens with `FIELDGRID_RUNTIME_SAFETY_ALLOW_RESET=1`.

## Artifacts

The workflow uploads:

- `artifacts/runtime-safety-harness/logs/*.log`
- `artifacts/runtime-safety-harness/reports/*.json`
- `artifacts/runtime-safety-harness/schema/*.json`

Missing artifacts are treated as CI failure.

## Deterministic Fixture Coverage

The fixture loader creates:

- platform owner, admin, and support users;
- Tenant A owner, admin, planner, personnel, and customer;
- Tenant B owner, admin, planner, personnel, and customer;
- a multi-tenant user linked to Tenant A and Tenant B;
- a suspended tenant and owner;
- a module-off tenant with `customers` disabled;
- verified local tenant domains for Tenant A/B and module-off;
- expired support grant and expired owner invite;
- local expired recovery metadata because no local Supabase reset-token table exists.

## Manual Merge Gate

Until GitHub required checks can be enforced for this private repository, humans must treat these as required before merging to `main`:

- `Runtime Safety Harness / contract-static`
- `Runtime Safety Harness / postgres17-migration-smoke`
- `Runtime Safety Harness / runtime-security-tests`

Do not merge a PR when one of these checks is missing, skipped, cancelled, or red. Do not substitute static source inspection for a failed database, API, RLS, or storage scaffold layer.

## Rollback

This change is harness-only. Rollback is a normal revert of the workflow, scripts, package commands, and docs. No migration is added and no staging or production state is modified.
