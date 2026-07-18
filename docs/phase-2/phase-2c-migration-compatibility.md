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
- Upgrade: a current-main database with Tenant A/B fixtures upgrades through the fixup without history edits or data loss.
- Function signatures: existing realtime, staffing, participant and cleanup signatures are preserved.
- Existing approved reports/photos are backfilled to the canonical `customer_approved` scope before reads require it.
- Indexes exist for assignment/personnel links, availability day/window uniqueness, interest responses, recovery active challenge/grant and tenant audit lookup.
- Constraints remain aligned with direct lifecycle and credential recovery services.

## Compatibility limits

The repository’s previous-release lane resets and migrates a current schema, then checks previous call shapes. It is useful API compatibility evidence, but it is not a populated previous-release database upgrade. Historical malformed timing values, inconsistent staffing reasons/versions, orphan recovery references and duplicate NULL-tenant recovery challenges therefore still require a sanitized previous-release fixture and preflight count/repair path (FG-HARD-032).

Canonical staffing also does not yet lock and re-evaluate availability/leave/overlap/qualification state, and participant/offline actions lack a durable operation ledger. These are runtime contract blockers, not migration-order or signature failures.
