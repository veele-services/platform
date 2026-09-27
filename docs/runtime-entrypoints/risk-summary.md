# Fieldgrid runtime entrypoint risk summary

Full inventory is uploaded as CI artifact `fieldgrid-runtime-entrypoint-inventory-full`.

- Runtime entrypoints and callsites: 1001
- External entrypoints: 114
- Internal DB callsites: 779
- Review required: 20
- High: 4
- Medium: 472
- Low: 420
- Informational: 85

## Runtime roots
- artifacts/backoffice/src
- artifacts/personeel-pwa/src
- artifacts/klant-pwa/src
- artifacts/website-runtime/src
- artifacts/marketing-website
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
- server-action: 40
- route-handler: 69
- middleware: 4
- webhook-handler: 1
- worker-entrypoint: 3
- scheduled-entrypoint: 0
- database-callsite: 7
- rpc-callsite: 0
- raw-sql-callsite: 772
- provider-boundary: 85
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
