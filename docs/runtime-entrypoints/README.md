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

## Inventory surfaces

The scanner records server actions, route handlers, middleware, RPC callsites,
Supabase table calls, raw SQL entrypoints, provider webhooks, Storage signed URL
issuance, auth/reset handlers, background workers, and cron/scheduled handlers.
Each entry includes source location, a stable id, and risk signals for tenant
source, auth source, host binding, permission check, module gate, parent-row
binding, audit, idempotency, provider boundary, and evidence layer.
