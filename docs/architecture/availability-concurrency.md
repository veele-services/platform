# Availability concurrency contract

Date-specific personnel availability is mutated only through the canonical database service in
`lib/db/src/personnel-availability.ts`. Both save and delete resolve the active personnel identity
from the exact tenant and authenticated user before locking the personnel and availability rows.

Delete requests must carry the `updated_at` value that the user saw. The service compares that
revision while holding the row lock. A newer revision returns a recoverable `conflict` and leaves
the row unchanged. A replay after the same row was already deleted returns deterministic success
with `replayed: true`.

Save returns the database `RETURNING updated_at` value after the PostgreSQL trigger has run, not a
locally guessed timestamp. An immediate save-to-delete sequence therefore uses the exact stored
revision even before the UI refresh completes.

The actual delete and its `availability.exception.delete` audit record commit in one transaction.
If audit insertion fails, the delete rolls back. Cache revalidation happens only after that
transaction has returned successfully. Tenant mismatches and inactive personnel fail closed.

The disposable PostgreSQL runtime proof is `pnpm fieldgrid:test:availability-delete-runtime`.
