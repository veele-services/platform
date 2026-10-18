# Routing-preflight: begrensde tijdelijke netwerkfouten

## Beoordeelde grens

`lib/travel/provider-smoke.ts` blijft een operationeel deployment-entrypoint. De
functie wordt uitsluitend door de bestaande staging- en productie-workflows
aangeroepen en behoudt de vaste omgevingsgrenzen: staging is toegestaan via
`DEPLOY_TARGET=staging`; productie uitsluitend via de canonieke combinatie
`DEPLOY_TARGET=production` en `APP_URL=https://fieldgrid.nl`.

De check gebruikt alleen de bestaande OpenRouteService-sleutel en twee vaste
trajecten met de openbare referentiecoördinaten uit de officiële Matrix-
documentatie. Daarmee controleert de preflight hetzelfde providercontract zonder
op stationsperrons te snappen: zulke perronsegmenten kunnen voor `foot-walking`
los liggen van de doorgaande voetgangersgraaf en daardoor een gezonde provider
ten onrechte als timeout laten eindigen. Providerheaders, antwoordlichamen,
sleutelwaarden en tenantgegevens worden niet gelogd. De wijziging voegt geen
nieuwe route, databasebron, rol, grant of browsertoegang toe.

## Fail-closed gedrag

Een netwerkfout of timeout krijgt maximaal één extra poging op een tweede vast
openbaar traject. Zo blokkeert een lokale graph- of snapstoring niet alsof de
hele provider onbereikbaar is. Iedere poging is afzonderlijk begrensd op twintig
seconden. Na twee mislukte pogingen stopt de deployment nog steeds. HTTP-fouten,
ongeldige JSON, niet-numerieke waarden en een ontbrekend traject blijven zonder
goedkeuring blokkeren. De extra poging kan dus alleen een tijdelijk
transportprobleem opvangen en kan geen inhoudelijk ongeldig providerantwoord
accepteren.

## Bewijs

- `lib/travel/provider-smoke.test.ts` controleert alle vier profielen, de
  canonieke omgevingsgrenzen, geheimhouding van providerfouten, twee mislukte
  netwerkpogingen, de wissel naar het tweede openbare traject en herstel na
  precies één tijdelijke netwerkfout.
- `pnpm exec vitest run lib/travel/provider-smoke.test.ts`: 9 tests geslaagd.
- `pnpm exec eslint lib/travel/provider-smoke.ts lib/travel/provider-smoke.test.ts`:
  geslaagd.
- `pnpm typecheck`: geslaagd.
- De mislukte stagingruns stopten vóór backup, migratie, handoff en
  activatie; er is geen gedeeltelijke stagingmutatie ontstaan.

