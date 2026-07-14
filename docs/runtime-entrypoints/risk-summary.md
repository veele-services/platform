# Fieldgrid runtime entrypoint risk summary

Generated from the compact manifest. Full inventory is a CI artifact named `fieldgrid-runtime-entrypoint-inventory-full`.

- Entrypoints: 891
- High risk: 776

## Counts by kind
- auth-reset-handler: 40
- background-worker: 4
- cron-scheduled-handler: 2
- middleware: 3
- provider-webhook: 1
- raw-sql-entrypoint: 490
- route-handler: 114
- rpc-callsite: 0
- server-action: 94
- storage-signed-url-issuance: 82
- supabase-table-call: 61

## Risk dimensions
- tenantSource
- authSource
- hostBinding
- permissionCheck
- moduleGate
- parentRowBinding
- audit
- idempotency
- providerBoundary
- evidenceLayer
