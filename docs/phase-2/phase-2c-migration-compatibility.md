# Phase 2C migration compatibility report

## Reviewed dependency chain

The runner deterministically applies 3 generated migrations and 122 hand-written migrations in lexical order at starting main. Thirty-one files are direct Phase 2 or security/runtime dependencies, ending in the forward-only Phase 2C fixup:

```text
generated core/audit/assignment schema
  -> 001/002 legacy RBAC
  -> 029 timing -> 031 availability
  -> 034 customer -> 037 tenancy/events
  -> 040 interest -> 041 realtime -> 044 offline sidecars -> 047 reminders
  -> 051 RLS -> 056 recovery -> 062/063 tenancy/audit/media
  -> 066 material/inventory
  -> 20260712/13/14 assignment-personnel invariant/ACL closure
  -> 202607161200 timing
  -> 202607161210 availability
  -> 202607161230 recovery base
  -> 202607161430 participant execution
  -> 202607161600 realtime metadata
  -> 202607181200 durable staffing
  -> 202607181800 recovery completion
  -> 202607181900 Phase 2C fixup
```

No input-name replacement error, return-type drift, undeclared dependency drop, `DROP ... CASCADE`, destructive history deletion or duplicate runtime schema concept was found. The duplicate human prefix `063` is harmless because full filenames are unique and lexically ordered.

## Compatibility evidence

- Fresh PostgreSQL 17: all migrations apply through `20260718190000`.
- Populated exact-previous-release upgrade: a disposable PostgreSQL 17 database is migrated only through `20260718180000_complete_credential_recovery.sql`, populated with two tenants, staffing, participant execution actuals, reports, realtime rows and recovery state, then migrated forward through the Phase 2C fixup without reset, history edits, row loss or cross-tenant visibility.
- Function signatures: existing realtime, staffing, participant and cleanup signatures are preserved.
- Existing approved reports/photos are backfilled to the canonical `customer_approved` scope before reads require it.
- Indexes exist for assignment/personnel links, availability day/window uniqueness, interest responses, recovery active challenge/grant and tenant audit lookup.
- Constraints remain aligned with lifecycle, staffing, offline receipt, payment allocation and credential recovery services.
- Fresh and populated-upgrade SECURITY DEFINER identities, search paths, PUBLIC execute posture and runtime-role ACLs match exactly.

## Compatibility boundary

The populated lane is synthetic and sanitized, but it is an actual previous-release schema migrated forward rather than current-schema fixtures relabeled as compatibility proof. Its cutoff is explicit in `FIELDGRID_SQL_MIGRATION_MAX_NAME`; CI fails if setup accidentally crosses the previous-release boundary.

Live or production database access is deliberately excluded. Historical data outside the represented tenant, staffing, execution, report, realtime and recovery shapes must still be assessed in the eventual staging/go-no-go packet; that operational evidence is FG-HARD-024, not a Phase 2C feature-freeze blocker.
