# Hosted PostgreSQL policy compatibility

Supabase owns `auth.uid()` and `auth.role()`. Hosted PostgreSQL 17 can omit the
redundant direct `postgres` EXECUTE grant while preserving the same effective
permissions through PUBLIC. The historical policy repair pinned that redundant
grant, so it could not run on this provider state.

`20260920131458_reconcile_hosted_policy_contract.sql` adds exact provider variants
without changing any existing migration. Helper bodies, owners, security modes,
effective permissions, complete policy definitions, tenant joins and relation
contracts remain checked. The additional staging variant describes only the
observed historical personnel policy and two extra customer-helper grants. Its
repair revokes those grants and removes that policy only when browser personnel
updates are already closed and the restricted server update path is available.
No provider-owned helper, role membership or application row is changed.

The normal migration runner recognizes this one SHA-256-pinned replacement. In
one transaction it executes the replacement prerequisite, executes any pending
historical reconciliation and tenant-scope migration without altering their SQL,
proves the target catalog and preserved access counts, then writes chronological
journal records. Only the superseded historical policy repair is explicitly
recorded as `baselined=true`; the executed replacement and historical pair have
`baselined=false`. The compatibility baseline is accepted only together with the
exact applied replacement hash and verified catalog. Unknown history, policy,
helper, role or relation drift remains a blocker. Later forward migrations can
still run and replay normally.

For staging, `fieldgrid-staging-catalog-normalization.yml` can diagnose or apply
the same bounded operation from the exact validated `main` SHA. It uses the
staging migration credential and pinned CA, and writes only boolean/count/hash
evidence. After it succeeds, rerun the normal Phase2E backup/restore preflight.
The restored migration history must pass the existing chronological manifest
check before promotion. Production uses the ordinary migration command with
its separately bound production credential.

All DDL and journal writes roll back together on a failed precondition,
postcondition or history write. After COMMIT, recovery uses a new forward change;
do not restore the broader grants or global management policies. Application
rollback must retain the compatible migrated schema and paired runtime
configuration. The local PostgreSQL gate proves clean hosted installation,
staging drift repair, unchanged provider helpers and application rows, blocked
unknown policies/grants, transaction rollback, migration-command replay and a
subsequent forward migration. Live Phase2E and deployment health evidence remain
required for the selected release SHA.
