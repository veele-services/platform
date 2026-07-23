# Fieldgrid runtime entrypoint risk summary

Full inventory is uploaded as CI artifact `fieldgrid-runtime-entrypoint-inventory-full`.

- Runtime entrypoints and callsites: 820
- External entrypoints: 104
- Internal DB callsites: 619
- Review required: 20
- High: 4
- Medium: 364
- Low: 358
- Informational: 74

## Runtime roots
- artifacts/backoffice/src
- artifacts/personeel-pwa/src
- artifacts/klant-pwa/src
- artifacts/website-runtime/src
- artifacts/api-server/src
- lib/db/src

## Excluded roots
- .generated
- .next
- __tests__
- build
- coverage
- dist
- docs
- e2e
- fixtures
- generated
- migrations
- native
- node_modules
- out
- out-tsc
- playwright-report
- scripts
- test
- tests
- www

## Counts by kind
- server-action: 38
- route-handler: 61
- middleware: 4
- webhook-handler: 1
- worker-entrypoint: 3
- scheduled-entrypoint: 0
- database-callsite: 7
- rpc-callsite: 0
- raw-sql-callsite: 612
- provider-boundary: 74
- storage-signed-url-issuance: 20

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
- providerAuthentication
- visibilityBinding
- mutationIntent
