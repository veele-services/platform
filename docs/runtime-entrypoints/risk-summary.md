# Fieldgrid runtime entrypoint risk summary

Full inventory is uploaded as CI artifact `fieldgrid-runtime-entrypoint-inventory-full`.

- Runtime entrypoints and callsites: 957
- External entrypoints: 113
- Internal DB callsites: 736
- Review required: 20
- High: 4
- Medium: 437
- Low: 411
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
- route-handler: 68
- middleware: 4
- webhook-handler: 1
- worker-entrypoint: 3
- scheduled-entrypoint: 0
- database-callsite: 7
- rpc-callsite: 0
- raw-sql-callsite: 729
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
