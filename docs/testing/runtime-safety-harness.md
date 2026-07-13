# Fieldgrid Runtime Safety Harness

This harness is the first executable runtime safety layer for Fieldgrid that does not use staging, production, provider secrets, or live Supabase projects.

It runs against an ephemeral PostgreSQL 17 database with explicit local compatibility shims for Supabase-specific schema features:

- roles: `anon`, `authenticated`, `service_role`
- schema/functions: `auth.users`, `auth.uid()`, `auth.jwt()`
- storage scaffolding: `storage.buckets`, `storage.objects`, `storage.foldername(text)`

Compatibility limits are intentional and reported in `artifacts/runtime-safety-harness/reports/setup.json`. The local shims are enough to compile and exercise SQL migrations, PostgreSQL RLS policies, tenant fixtures, and the local Express API middleware. They are not proof of Supabase GoTrue, Supabase Storage object runtime, signed URLs, JWKS, provider webhooks, e-mail delivery, Mollie, DNS, or staging behavior.

After migrations, the local harness grants `authenticated` SELECT on `public.personnel` so PostgreSQL can evaluate the existing `assignment_personnel_own_select` rollback policy in the local shim environment. This is not an application migration and does not grant any additional `assignment_personnel` privilege.

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
- `pnpm fieldgrid:runtime-safety:db`: database integration, schema invariant, privileged assignment invariant, tenantless-write, and storage/password-reset scaffold checks.
- `pnpm fieldgrid:runtime-safety:rls`: authenticated RLS checks using `SET LOCAL ROLE authenticated`, `row_security = on`, local JWT GUC shims, `aclexplode`, and `has_table_privilege`. In Phase A.1, `PUBLIC` and `anon` have no direct `assignment_personnel` table privileges, `authenticated` keeps only temporary SELECT for rollback compatibility, and direct authenticated DML remains denied. The RLS harness first simulates historical broad ACL drift with `GRANT ALL ON TABLE public.assignment_personnel TO anon, authenticated, service_role`, reruns the forward-only Phase-A.1 ACL migration, and proves only authenticated SELECT plus service-role CRUD remain. Reads in the new app are host/server-action scoped, and writes are server/service-role commands plus the database trigger invariant.
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
- a legacy global Management-only user with no tenant membership or tenant role;
- a suspended tenant and owner;
- a module-off tenant with `customers` disabled;
- verified local tenant domains for Tenant A/B and module-off;
- expired support grant and expired owner invite;
- local expired recovery metadata because no local Supabase reset-token table exists.

## Manual Merge Gate

Until GitHub required checks can be enforced for this private repository, humans must treat these as required before merging to `main`:

- `Runtime Safety Harness / contract-static`
- `Runtime Safety Harness / unit-domain`
- `Runtime Safety Harness / security-source`
- `Runtime Safety Harness / migration-order`
- `Runtime Safety Harness / typecheck`
- `Runtime Safety Harness / build`
- `Runtime Safety Harness / diff-check`
- `Runtime Safety Harness / postgres17-migration-smoke`
- `Runtime Safety Harness / db-integration-tenant-ab`
- `Runtime Safety Harness / rls-security`
- `Runtime Safety Harness / api-runtime`

Do not merge a PR when one of these checks is missing, skipped, cancelled, or red. Do not substitute static source inspection for a failed database, API, RLS, or storage scaffold layer.

## Rollback

Rollback is a normal app/code revert of the workflow, scripts, package commands, and docs. The forward-only `assignment_personnel` databaseguard is intentionally safe to leave in place after an app revert because it only rejects invalid cross-tenant links and does not rewrite business data.

Phase A.1 deliberately keeps authenticated SELECT on `assignment_personnel`, does not drop `assignment_personnel_management_all`, does not drop `assignment_personnel_own_select`, and does not drop `personnel_read_own_assignment_personnel` when present. Staging runs migrations before app activation, and the health gate can roll back to the previous app release; that previous release still uses the old direct SELECT path. This compatibility does not claim that the cross-tenant SELECT surface is fully closed.

The branch `codex/assignment-personnel-direct-access-close-phase2-prep` is a reference snapshot only. It must not be merged directly because it rewrites the already-applied migration `20260712130000_assignment_personnel_tenant_guard.sql`. Phase B must be rebuilt later as a new forward-only migration from current main.

Required Phase-B minimum policy cleanup:

```sql
DROP POLICY IF EXISTS assignment_personnel_management_all
ON public.assignment_personnel;

DROP POLICY IF EXISTS assignment_personnel_tenant_management_all
ON public.assignment_personnel;

DROP POLICY IF EXISTS assignment_personnel_own_select
ON public.assignment_personnel;

DROP POLICY IF EXISTS personnel_read_own_assignment_personnel
ON public.assignment_personnel;
```

After that cleanup, Phase B must close all direct access for `PUBLIC`, `anon`, and `authenticated`.

Required phase-B follow-up: Close authenticated assignment_personnel SELECT after phase-A is live on staging.
