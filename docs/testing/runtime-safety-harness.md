# Fieldgrid Runtime Safety Harness

This harness is the first executable runtime safety layer for Fieldgrid that does not use staging, production, provider secrets, or live Supabase projects.

It runs against an ephemeral PostgreSQL 17 database with explicit local compatibility shims for Supabase-specific schema features:

- roles: `anon`, `authenticated`, `service_role`
- schema/functions: `auth.users`, `auth.uid()`, `auth.jwt()`
- storage scaffolding: `storage.buckets`, `storage.objects`, `storage.foldername(text)`

Compatibility limits are intentional and reported in `artifacts/runtime-safety-harness/reports/setup.json`. The local shims are enough to compile and exercise SQL migrations, PostgreSQL RLS policies, tenant fixtures, and the local Express API middleware. They are not proof of Supabase GoTrue, Supabase Storage object runtime, signed URLs, JWKS, provider webhooks, e-mail delivery, Mollie, DNS, or staging behavior.

After migrations, the local harness grants `authenticated` SELECT on `public.personnel` and the non-`assignment_personnel` assignment/customer workflow tables so PostgreSQL can exercise RLS policies in the local shim environment. This is not an application migration and does not grant any `assignment_personnel` privilege.

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
- `pnpm fieldgrid:runtime-safety:rls`: authenticated RLS checks using `SET LOCAL ROLE authenticated`, `row_security = on`, local JWT GUC shims, `aclexplode`, and `has_table_privilege`. In Phase B, `PUBLIC`, `anon`, and `authenticated` have no direct `assignment_personnel` table privileges. `service_role` keeps only SELECT/INSERT/UPDATE/DELETE. The RLS harness simulates historical broad ACL drift, reruns Phase-A.1 plus Phase-B migrations, proves direct table access is closed, proves service-role CRUD plus trigger invariants, and exercises assignments, tasks, extra work, photos, reports, report notes, attachments, material usage, objects, Tenant A/B isolation, selected tenant fail-closed behavior, customer policy regressions, and the current schema invariant that one auth user cannot have multiple `personnel` rows across tenants because `personnel.user_id` is unique.
- `pnpm fieldgrid:runtime-safety:previous-release-compatibility`: deployment compatibility checks for rollbackrelease `132e7d0705f0192d6ec4a28195f192850574447d`. This lane includes a static callsite audit, but its pass/fail signal also runs real PostgreSQL queries for the previous release server-action patterns and authenticated RLS queries for assignments, tasks, photos, and reports.
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
- a multi-tenant user linked to Tenant A and Tenant B through tenant membership fixtures;
- a separate Phase-B RLS assertion that duplicate `personnel.user_id` rows across tenants are schema-blocked;
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
- `Runtime Safety Harness / phase-b-previous-release-database-compatibility`
- `Runtime Safety Harness / api-runtime`

Do not merge a PR when one of these checks is missing, skipped, cancelled, or red. Do not substitute static source inspection for a failed database, API, RLS, or storage scaffold layer.

## Rollback

Rollback is a normal app/code revert of the workflow, scripts, package commands, and docs. The forward-only `assignment_personnel` database guard and Phase-B ACL closure are intentionally safe to leave in place after an app revert because they do not rewrite or delete business data.

Phase B closes authenticated direct SELECT on `assignment_personnel`; rollbackrelease `132e7d0705f0192d6ec4a28195f192850574447d` remains compatible because its normal personnel assignment/task/photo/report flows are server-action/database queries and not browser/PostgREST direct `assignment_personnel` table calls. The explicit `phase-b-previous-release-database-compatibility` lane proves those server-side query shapes against the post-Phase-B schema and separately proves authenticated RLS policy access when a selected `tenant_id` claim is present.

The branch `codex/assignment-personnel-direct-access-close-phase2-prep` remains a reference snapshot only. It must not be merged directly because it rewrites the already-applied migration `20260712130000_assignment_personnel_tenant_guard.sql`. Phase B is rebuilt here as a new forward-only migration from current main.

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

The Phase-B migration also hardens `public.personnel_assigned_to_assignment(uuid)` as a minimal `SECURITY DEFINER` helper. Missing, empty, malformed, or wrong `tenant_id` claims fail closed for direct authenticated RLS/PostgREST paths. Normal personnel app reads continue through tenant-scoped server actions.
