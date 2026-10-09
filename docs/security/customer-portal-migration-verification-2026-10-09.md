# Populated customer-portal migration verification — 2026-10-09

The staging release of `6be38bbd30b56c15c9deef55f65e961afa4ceb83` stopped
before runtime activation. Its backup succeeded and migration
`20261008173000` committed, but the subsequent workspace-domain migration
failed with SQLSTATE `42501` while enabling the customer portal for the
explicitly requested existing tenant. Clean CI replay had no matching tenant,
so the backfill had updated no rows and missed the entitlement trigger.

The pending `20261008174000` migration now saves the legacy JWT role setting,
uses a transaction-local service context for that single audited backfill, and
restores the previous setting immediately afterward. It does not change JSON
JWT claims, the entitlement trigger, grants, RLS, or any callable RPC. The
existing active-tenant and missing-module predicates still limit the update;
the audit is inserted only for rows actually changed.

A missing custom role setting restores to its empty default. The entitlement
trigger treats that as absent and retains its original JSON-claims fallback.
A nonempty prior setting is restored exactly. An exception aborts the block and
rolls back the temporary context, entitlement change, and audit together.

`scripts/test-workspace-domains.mjs` exercises the actual migration backfill
against populated, rollback-only fixtures rather than a copied implementation.
The correction requires a new reviewed release. The already applied 132
migration hashes, including `20261008173000`, must remain unchanged. The failed
release produced no deployment handoff; promotion uses a fresh release.

## Executed evidence

The focused database suite passed all 12 checks, including the original
`42501` failure, absent/empty/nonempty legacy role settings, unchanged JSON
claims, idempotence, an unrelated tenant, forced audit failure, and denial of an
ordinary authenticated owner's entitlement write. Independent source review
found no concrete outstanding issue in the correction or its tests.

A populated full Supabase-CLI upgrade reproduced the original migration's
`42501` failure. The pending migration rolled back entirely: history remained
at 132 entries and the new domain table did not exist. Replacing only the
pending migration with the correction then completed both remaining migrations,
enabled the target's portal exactly once, inserted one audit event, and left
the unrelated tenant unchanged.

A fresh chronological replay completed all 134 migrations. Only the pending
`20261008174000` statement hash changed; all 133 other hashes match the preceding
manifest, including the 132 entries already applied in staging. The source
inventory changes only the migration-manifest operational fingerprint. The
1,109 other authorization review entries and their fingerprints are preserved.
Lint, TypeScript, provider branding and recognized source credential checks
passed.

Exact-head CI, staging acceptance, and production acceptance remain separate
deployment gates.
