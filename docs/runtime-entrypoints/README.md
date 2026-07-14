# Runtime entrypoint inventory

Fieldgrid keeps a compact, stable runtime entrypoint manifest in Git and writes
the full AST-backed inventory to a CI artifact. This avoids committing a large
generated JSON file while still making stale scanner output visible in CI.

## Commands

- `pnpm fieldgrid:runtime-entrypoints:write` regenerates the full local
  inventory artifact, `docs/runtime-entrypoints/manifest.json`, and
  `docs/runtime-entrypoints/risk-summary.md`.
- `pnpm fieldgrid:runtime-entrypoints:check` regenerates the same data and fails
  when the committed compact manifest or risk summary is stale.

The full generated file is written to
`artifacts/runtime-entrypoints/fieldgrid-runtime-entrypoint-inventory.full.json`.
That path is ignored by Git and uploaded by the Runtime Entrypoint Inventory CI
workflow as the `fieldgrid-runtime-entrypoint-inventory-full` artifact.

## Production runtime scope

The scanner only walks explicit production runtime roots: backoffice, personnel
PWA, customer PWA, API server source, and `lib/db/src`. It excludes tests, docs,
fixtures, E2E assets, developer tooling scripts, generated output, build output,
node_modules, and migrations from runtime-entrypoint counts. Migration SQL can be
classified elsewhere as schema-change evidence, but it does not inflate runtime
callsite risk totals here.

## Inventory concepts

The scanner separates externally invokable entrypoints, internal privileged
commands, database callsites, provider boundaries, storage signed URL issuance,
and worker/scheduled entrypoints. Raw SQL is recorded as a database callsite, not
as an externally invokable entrypoint.

## Risk model

Each kind has its own required controls. Webhooks require provider boundary,
provider authentication, and idempotency. Storage signed URL issuance requires
tenant, parent-row, and visibility binding. Read-only or internal database
callsites are not forced through irrelevant provider-boundary or idempotency
checks. Severity is reported as review-required, high, medium, low, or
informational.
