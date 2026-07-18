# Fieldgrid runtime entrypoint risk summary

Full inventory is uploaded as CI artifact `fieldgrid-runtime-entrypoint-inventory-full`.

- Runtime entrypoints and callsites: 749
- External entrypoints: 100
- Internal DB callsites: 552
- Review required: 20
- High: 5
- Medium: 342
- Low: 307
- Informational: 75

## Runtime roots
- artifacts/backoffice/src
- artifacts/personeel-pwa/src
- artifacts/klant-pwa/src
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
- server-action: 37
- route-handler: 59
- middleware: 3
- webhook-handler: 1
- worker-entrypoint: 3
- scheduled-entrypoint: 0
- database-callsite: 7
- rpc-callsite: 0
- raw-sql-callsite: 545
- provider-boundary: 75
- storage-signed-url-issuance: 19

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
