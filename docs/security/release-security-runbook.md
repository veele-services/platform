# Vrijgaveprocedure

1. Sluit bevestigde releaseblokkers met herhaalbare negatieve tests; leg
   geaccepteerde expliciete samenwerkingsprojecties vast.
2. Controleer alle migraties op schone en bestaande V1-testdatabase. Behoud
   bestaande gegevens en idempotentie; reset geen remote database.
3. Verifieer de verplichte CI, scanner, mail/providerconfiguratie en aparte
   runtime-/runnerrechten. Gebruik alleen configuratienamen, nooit secretwaarden.
4. Leg GO vast op de uiteindelijke diff/SHA en noteer bewijs en restbeperkingen.
5. Commit en push main; controleer CI. Promoveer dezelfde beoordeelde SHA bewust
   naar de bestaande stagingbranch volgens AGENTS.md en stagingarchitectuur.
6. Controleer deployment, migrations, runtimehealth, exacte SHA en afgesproken
   stagingacceptatie. Activeer externe hooks uitsluitend volgens hun runbook.

Geen productiebranch, productieverbinding of productie-write. Geen GO op basis
van alleen een geslaagde oude testset of broninspectie. Bij een ontbrekende
externe voorwaarde: benoem het exacte bewijs dat de operator moet leveren;
verzin geen configuratie en zwak geen gate af.

## Nu nog nodig van de stagingoperator

- De bestaande runner met label `fieldgrid-staging` is online en de
  GitHub-verbinding is geverifieerd. De eenmalige beveiligde hosthandoff is
  uitgevoerd: runner en runtime hebben gescheiden UID/groepen, de runner heeft
  geen aanvullende groepen of toegang tot beschermde releasepaden, de vaste
  no-argument rootbroker en staging-specifieke units zijn geïnstalleerd. De
  historische metadata-rootcontrole en de huidige runnercontrole zijn geslaagd;
  de nieuwe uitgebreide scanner-host-rootcontrole is nog niet geïnstalleerd of
  uitgevoerd. Herhaal die handoff niet
  en gebruik geen oude runner als fallback. Het bewijs staat in
  `docs/deployment/staging-handoff-evidence-2026-10-01.md`.
- De beoordeelde forward-fix voor het staging-specifieke instancebestand,
  broker en de runnercheck is geïnstalleerd en matcht de gepubliceerde hashes.
  De toen uitgevoerde rootcheck was de metadata-only `c3dd469…`-versie. De
  uitgebreidere lokale rootcheck voor VERSION, socketunit en live ClamAV
  TCP-listeners is nog niet op de host geïnstalleerd of uitgevoerd; herhaal de
  eenmalige handoff niet en wijzig unit-, sudo- of
  runnerrechten niet op goed geluk. Exacte release
  `d9084380f8278e634cb6ee372d2cc4ebe5e9b11e` is geactiveerd en antwoordt met de
  juiste SHA en een gereed databasepad, maar de volledige scanner-readiness
  retourneert nog `unavailable`. Begrensde runtime-evidence bewijst dat `PING`,
  runtime-UID/groepen, socket `clamav:clamav` `0660`, actieve services en
  actuele definities in orde zijn en dat EICAR wordt geweigerd terwijl PNG/PDF
  worden geaccepteerd. clamd `VERSION` is echter uitgeschakeld; zonder die
  engine/database-timestamp faalt Fieldgrids definitie-ouderdomscontrole
  gesloten. De geactiveerde SHA mag niet opnieuw via de broker worden
  afgespeeld; voer eerst een beoordeelde remedie uit en bewijs daarna gezonde
  app-readiness.
- De worker-timer blijft bewust `inactive/dead` totdat een nieuwe gepromoveerde
  release via de broker is geactiveerd en publieke web-health tegelijk
  `status=ok`, `database=ready`, `scanner=ready` en de exacte SHA meldt. Voer
  pas daarna uitsluitend het door de workflow gevraagde hervattingscommando
  uit; de eindcontrole vereist vervolgens een verse succesvolle
  workeruitvoering. `shared/runtime.env` is door de broker gegenereerd en
  geïnstalleerd en mag niet handmatig worden aangemaakt, gevuld of aangepast.
- `PING`, runtime-identiteit/groepen, actieve ClamAV/freshclam met actuele
  definities, Unix-socket `0660`/`clamav:clamav`, EICAR-weigering en acceptatie
  van de gecontroleerde PNG/PDF zijn bewezen. Herstel nu gecontroleerd de
  ontbrekende clamd-`VERSION`-metadata. Installeer eerst de checksummed nieuwe
  rootchecker, pas veilig exact één actieve `EnableVersionCommand yes` toe,
  herstart clamd en vereis de melding
  `Root-only staging key, trust, protected runtime and scanner host contract verified.`
  Controleer daarna gezonde
  scannerreadiness via de gedeployde app, duurzame socketrechten en afwezigheid
  van een TCP-listener na daemonherstart. `test -w` is geen geldig positief
  bewijs voor Unix-socketconnectiviteit. De runnergate verbindt niet, maar
  vereist exacte runnergroepen, een niet-schrijfbare root/clamav-map en exact
  sockettype, eigenaar/groep, modus, hardlinkaantal en afwezigheid van
  extended-access-indicators. Geen Environment-dump.
- Houd de Supabase Auth-hook met tijdelijke URL uitgeschakeld. Na de goedgekeurde
  uitrol is het endpoint `https://staging.fieldgrid.nl/api/email/auth`;
  SendGrid gebruikt `https://staging.fieldgrid.nl/api/email/events`.
  Activering en echte testlevering volgen `docs/deployment/mail-hooks.md`.

Alle vereiste GitHub Environment-namen zijn aanwezig, inclusief de publieke
handoffvariable `STAGING_HANDOFF_ENCRYPTION_CERT_B64`. Alleen namen/status en
het geslaagde operatorcontract zijn gecontroleerd; er zijn geen secretwaarden
opgevraagd, geraden of lokaal gekopieerd. De names-only controle bewijst niet
de providerwerking of de werkelijke inhoud van runtimeconfiguratie.

## Migreervolgorde en herstel

De security- en scangatewaymigraties zijn additief en bewaren bestaande
rapporten, handtekeningen, tijdregistraties, documentbytes en mailevents.
De huidige lokale set bevat 55 migraties. De aanvullende lifecyclemigraties
bewaren ook oorspronkelijke uitnodigingsbindingen en definitieve factuurregels.
Een object met toegangskoppelingen/historie kan niet naar een andere klant
worden verplaatst; een privédagadres kan niet naar een ander personeelsnummer
worden verplaatst. Kies geen permissie-uitbreiding als herstel voor zo'n weigering.
Nieuwe klantauditregels bevatten minimale metadata, geen hele dossierkopieën.
Historische auditpayloads blijven intact; bepaal bewaartermijn/redactie apart
met de eigenaar voordat eventuele historische gegevens worden aangepast.
Historisch onveilige bestandsreferenties worden niet automatisch gerepareerd;
readguards weigeren ze, NOT VALID constraints blokkeren nieuwe onveilige writes.
Een bevoegd beheerder moet zulke historie afzonderlijk onderzoeken.

Maak vóór de migratie een nieuwe beveiligde backup; retries bewaren eerdere
pre-releasebestanden. `pg_restore --list` controleert leesbaarheid, niet een
volledige restore: bewijs herstelbaarheid in een geïsoleerde toegestane
testomgeving, nooit door staging of productie te resetten. Gebruik de vaste
projectguards ook als scripts handmatig worden aangeroepen.

De scangateway sluit directe uploads van de oude runtime af. Stem daarom
migratie en activatie af in één releasevenster. Als de nieuwe app niet gezond
wordt, herstel geen lekke policies, verwijder geen scanbewijzen en draai geen
schema-reset: onderhoud/gerichte functieblokkade plus forward-fix. Een eerdere
private signed URL kan tot zijn eigen eindtijd blijven werken; toon afloop/
intrekking operationeel aan vóór gevoelige gegevens worden vrijgegeven.

De bestaande configureerbare rollenproef in `scripts/sql/authorization-roles.sql`
is geen migratie en blijft uit. De release gebruikt de bestaande expliciete
rollen, zoals de releaseopdracht toestaat; de nieuwe rollen-UI is niet af.
