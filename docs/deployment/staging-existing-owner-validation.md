# Staging: bestaande field-demo-owner behouden

Datum: 14 september 2026. Bron: `main` op
`72342890e5b221376eb9b6dcc1e5d1282ea3b2b0`; aparte herstelbranch.

## Besluit en afbakening

De staging-diagnose toont één actieve owner van `field-demo`, terwijl het vaste
herstelaccount bij een andere tenant hoort. De deployvoorbereiding gebruikt
daarom de bestaande tenantkoppeling. Zij verplaatst geen account en wijzigt geen
Auth-gebruiker, platformrol, lidmaatschap of tenantrol. Onveilige toestanden
blijven geblokkeerd; er is geen automatische herstel- of bootstrapfallback.

Dezelfde read-only SQL-controle wordt gebruikt bij domeindiagnose,
domeinherstel, de bestaande websitefixture en de uiteindelijke principalfixture.
Alleen een werkelijk ontbrekende tenant gebruikt nog het vaste bootstrapaccount.
Na provisioning blijft de exacte owner-ID verplicht, naast de bestaande
uitnodigingsreservering en provisioningbewijzen.

## Testbewijs

Node `24.18.0`, pnpm `11.5.2`, lokale wegwerpdatabase PostgreSQL 17.
Geen featuretest heeft staging benaderd. Testdata en tijdelijke uitbreiding van
de lokale Auth-stub worden altijd teruggedraaid.

- Typecheck van de hele workspace en de afzonderlijke workflow-ingangen: geslaagd.
- `pnpm -r --if-present run build` op `18963ecc`: alle zeven applicatiebuilds geslaagd met
  dezelfde niet-geheime lokale buildconfiguratie als
  `main-exact-head-validation.yml`; PDF-bundle/runtimecontrole ook geslaagd.
- Drie relevante TypeScript-domeinsuites: **50 geslaagd**, geen skips.
- Drie relevante security/source-suites: **22 geslaagd**, geen skips.
- `node --test tests/fieldgrid-realtime-projection-migration.test.mjs`:
  **60 geslaagd**, geen skips; inclusief echte SQL voor de gewijzigde controles
  en de aanvullende e-mailadrescontrole uit de GitHub-review.
- Beide staging-scriptcontracten met `--check`: geslaagd.
- Runtime-entrypointinventaris, testlagen en migratievolgorde: geslaagd.
- Dashboardaudit: statische controles geslaagd.
- Visual-regressioncontract: geen fouten, maar expliciet `manual` wegens
  ontbrekende ingelogde staging-URL's/storage states. Er is geen UI gewijzigd;
  dit is geen claim dat ingelogde screenshots zijn gemaakt.

De databasegevallen bewijzen behoud van het bestaande account terwijl het
bootstrapaccount een buitenlandse tenant- en platformkoppeling heeft. Ze testen
ook herhaalde uitvoering, ontbrekende/dubbele/inactieve owners, buitenlandse
lidmaatschappen en rollen, platformrechten, oude globale rollen, ongeldige Auth,
en ontbrekende of extra Managementrechten. De uiteindelijke bootstrapquery
accepteert een passende owner-ID en weigert een andere, ook als die bestaande
owner verder geldig is. Een aparte orchestratietest bewijst de exacte rollback
bij een afgewezen eindbinding.

Bewijsbestanden van deze lokale werkrun staan in `/tmp/` met prefix
`fieldgrid-existing-owner-`: `unit.log`, `static.log`, `pg17.log`,
`typecheck-final.log`, `build-ci-env.log` en `review.md`. De tests hierboven zijn reproduceerbaar
via de bestaande workflow-ingangen en de gekoppelde migratie-smoketest.

De eerste buildpogingen liepen tegen een volle schijf en daarna de ontbrekende
lokale `DATABASE_URL`-buildinstelling aan. Alleen nieuw aangemaakte buildcache
is opgeruimd/verplaatst naar tijdelijke geheugenopslag; vervolgens is het
volledige oorspronkelijke buildcommando opnieuw uitgevoerd met de CI-instellingen.
Er is geen broncode aangepast om buildcontroles over te slaan.

## Review

Zelfreview en een afzonderlijke, read-only Codex-review vonden geen onopgeloste
P0/P1. De reviewer kon zijn commandosandbox niet starten en kreeg daarom de
volledige relevante bronbestanden en diff als invoer; dit was een statische
review, geen tweede testrun. Zijn P2 over ontbrekend gedragstestbewijs voor de
bootstrap-owner-ID is opgelost met de matching/mismatching PostgreSQL-controle
en de exacte rollbacktest. Daarna zijn de relevante suites opnieuw uitgevoerd.

### Aanvullende GitHub-review: bruikbaar e-mailadres

De daaropvolgende GitHub-review vond nog een terechte P1: een leeg of ongeldig
Auth-e-mailadres kon slagen als de emailidentiteit hetzelfde bevatte. Dat is
gereproduceerd met 18 falende PostgreSQL-regressies vóór de fix. De gedeelde
read-only controle vereist nu de e-mailsyntaxis van de reeds aanwezige
`z.string().email()`-validator; opgeslagen adressen worden niet getrimd of
gerepareerd. Vier geldige varianten beschermen onder meer hoofdletters,
subdomeinen, plustags en apostrofs. Alle 60 PostgreSQL-tests slagen na de fix;
de snapshots controleren nu ook dat `auth.identities` ongewijzigd blijft.

Een aparte gerichte bronreview bevestigt dat de P1 is opgelost, zonder
onopgeloste P0/P1. De P3 over identiteitssnapshots is eveneens verwerkt en
opnieuw getest. Logs: `/tmp/fieldgrid-owner-email-before.log` (bewust rood vóór
de fix), `fieldgrid-owner-email-pg17.log`, `fieldgrid-owner-email-unit.log`,
`fieldgrid-owner-email-static.log`, `fieldgrid-owner-email-typecheck.log` en
`fieldgrid-owner-email-review.md`.

De lokale volledige build van deze kleine vervolgpatch stuitte ondanks
verplaatste buildcache opnieuw op `ENOSPC`; andere gebruikersbestanden zijn
niet verwijderd. De productbuildbronnen zijn niet gewijzigd. De volledige
build op de nieuwe exacte PR-head blijft verplicht via **Main Exact Head
Validation / Runtime Safety / build**, naast de lokale SQL-, domein-, source-
en typechecks. Het definitieve runbewijs staat bij de PR-checks; een eerdere
groene build is geen vervanging voor die verplichte nieuwe CI-gate.

## Stagingbewijs en herstel

Dit document verklaart de deploy niet voltooid. Na menselijke PR-review en
exact-head CI moeten de stappen uit
[de activation-runbook](../website-module-enterprise-activation.md#guarded-staging-sequence)
nog worden uitgevoerd: domeindiagnose op exact `main`, uitsluitend het toegestane
legacy-domeinherstel indien nodig, daarna `prepare-managed` met geslaagd
reserveringsmigratiebewijs en twee verschillende W00-tenantprincipals. Pas daarna
volgen de bestaande preflight-, promotie-, deploy- en websiteacceptatiegates.
Ingelogde visuele acceptatie blijft onderdeel van de bestaande staginggate met
de vereiste persona's en viewports; lokale statische checks vervangen die niet.

Er zijn geen migraties, schemawijzigingen, dependencies of product-UI gewijzigd.
Rollback van deze code gebeurt via een nieuwe gereviewde commit vanaf `main` en
herpromotie. Er zijn geen accountmutaties terug te draaien. Een al uitgevoerd
domeinherstel wordt nooit blind teruggedraaid: eerst de actuele websitebindings
en afhankelijkheden controleren volgens het bestaande domeincontract.
