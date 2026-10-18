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

De referentielocaties sloten stationsnapping uit, maar `foot-walking` bleef als
enige Matrix-profiel tweemaal exact op de twintigsecondenlimiet hangen. HeiGIT
registreerde op 13 oktober 2026 zelf een `Foot Walking`-storing; hun historische
supportmeldingen beschrijven hetzelfde profielgebonden Matrix-patroon. Runtime en
preflight gebruiken daarom voor dit ene profiel de geometry-vrije Directions-
samenvatting. Die aanvraag gebruikt het bestaande afzonderlijke Directions-budget.
De overige drie profielen blijven via Matrix lopen.

## Vereiste kernprofielen en begrensde degradatie

Een netwerkfout of timeout krijgt maximaal één extra poging op een tweede vast
openbaar traject. Zo blokkeert een lokale graph- of snapstoring niet alsof de
hele provider onbereikbaar is. Iedere poging is afzonderlijk begrensd op twintig
seconden. Een ontbrekende sleutel, ongeldige providerbasis of storing in een van
de drie Matrix-kernprofielen blokkeert de deployment nog steeds vóór backup en
migraties. HTTP-fouten, ongeldige JSON, niet-numerieke waarden en een ontbrekend
traject worden daarbij nooit als geldig resultaat geaccepteerd.

De publieke ORS-dienst liet op 18 oktober 2026 echter zowel Matrix als Directions
voor alleen `foot-walking` tweemaal exact time-outen, terwijl de drie
kernprofielen direct bruikbare antwoorden gaven. Daarom is lopen expliciet een
optioneel profiel: na twee mislukte pogingen logt de preflight een duidelijke
degradatie en mag de release doorgaan. Runtime behoudt hetzelfde fail-closed
datagedrag (`provider_unavailable`), handmatige reistijd blijft bruikbaar en er
wordt geen nulwaarde of ander fictief resultaat opgeslagen. Een totale
providerstoring of storing van auto/fiets blijft de release blokkeren.

## Bewijs

- `lib/travel/provider-smoke.test.ts` controleert alle vier profielen, de
  canonieke omgevingsgrenzen, geheimhouding van providerfouten, twee mislukte
  netwerkpogingen, de wissel naar het tweede openbare traject, de Directions-
  samenvatting voor lopen, herstel na precies één tijdelijke netwerkfout,
  geregistreerde loopdegradatie en blijvende blokkade bij een vereist profiel.
- `lib/travel/provider.test.ts` controleert dat looptrajecten afzonderlijk via
  Directions lopen, het Directions-budget claimen en nooit fictieve waarden
  krijgen bij een ongeldig antwoord.
- `pnpm exec vitest run lib/travel/provider.test.ts lib/travel/provider-smoke.test.ts`:
  21 tests geslaagd.
- `pnpm test`: 2.005 tests geslaagd.
- `pnpm lint`: geslaagd zonder fouten; bestaande marketingwaarschuwingen blijven
  zichtbaar.
- `pnpm typecheck`: geslaagd.
- De mislukte stagingruns stopten vóór backup, migratie, handoff en
  activatie; er is geen gedeeltelijke stagingmutatie ontstaan.

