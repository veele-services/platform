# Personnel Availability Atomicity

## Scope

This implementation hardens the personnel PWA availability actions in `artifacts/personeel-pwa/src/actions/availability.ts`.

It covers:

- weekly availability windows;
- date-specific availability entries;
- deletes of date-specific entries;
- tenant-bound active personnel validation;
- optimistic stale-edit detection where `updatedAt` is already available;
- tenant audit logging;
- post-commit cache revalidation for personnel and planning views.

No migration is required. Existing schema already provides:

- `availability_windows` uniqueness on `(personnel_id, day_of_week)`;
- `availability_day_entries` uniqueness on `(personnel_id, date)`;
- `availability_day_entries.updated_at`;
- `personnel.updated_at`;
- `audit_log`.

## Atomicity

Weekly availability saves no longer delete all rows before inserts. The save now:

1. validates and normalizes every submitted window;
2. rejects duplicate day windows as overlap;
3. resolves the authenticated active personnel row inside the current personnel portal tenant;
4. compares `personnel.updated_at` when the caller supplied `expectedPersonnelUpdatedAt`;
5. opens one database transaction;
6. inserts new day rows, updates changed rows, and deletes removed rows;
7. updates the personnel `updated_at` value;
8. writes one tenant audit row;
9. revalidates affected pages only after the transaction resolves.

If any insert, update, delete, or audit write fails, the transaction rolls back and the prior availability state remains committed.

## Idempotency

Date-specific availability already used an upsert on `(personnel_id, date)`. The action now keeps that upsert inside a transaction with audit and personnel version updates.

Repeated identical saves produce the same target rows. The only intentional change is a fresh `updated_at`, which is the existing optimistic concurrency token for future edits.

Weekly saves use a diff against current rows:

- identical windows are left unchanged;
- changed windows are updated;
- new windows are inserted;
- removed windows are deleted inside the same transaction.

## Validation

The action validates:

- real `YYYY-MM-DD` calendar dates;
- supported repeat types;
- `HH:MM` time format;
- start time before end time;
- weekly day in `0..6`;
- duplicate weekly day windows;
- past dates;
- dates beyond the tenant's `availability_advance_days`;
- active personnel in the current portal tenant.

Wrong-tenant and inactive personnel requests return `Personeelsprofiel niet gevonden` before persistence.

## Audit And Revalidation

Successful mutations write tenant-aware audit rows:

- `availability_windows_saved`;
- `availability_day_saved`;
- `availability_day_deleted`.

Revalidation runs after commit for:

- `/`;
- `/beschikbaarheid`;
- `/opdrachten`;
- `/openstaand`.
- `/planning`;
- `/personnel`.

These are the personnel views most directly affected by availability and planning eligibility.

## Tests

Focused source-contract coverage is in `tests/fieldgrid-personnel-availability-atomic.test.mjs`.

The tests assert:

- tenant-bound active personnel lookup;
- weekly save transaction and diff behavior;
- absence of the old Supabase delete-then-insert path;
- date-specific upsert idempotency;
- stale edit conflict checks;
- audit writes inside the transaction;
- delete conflict checks;
- UI propagation of `updatedAt`;
- revalidation after transaction completion.

## Migration Notes

No migration was created.

A future migration is only needed if the product requires DB-enforced overlap constraints, direct `tenant_id` columns on availability tables, or a dedicated integer version column.

## Rollback Notes

Rollback is a code revert only. No database rollback is required because this change does not alter schema or migrate data.
