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
  no-argument rootbroker en staging-specifieke units zijn geïnstalleerd en de
  afzonderlijke root- en runnercontroles zijn geslaagd. Herhaal die handoff niet
  en gebruik geen oude runner als fallback. Het bewijs staat in
  `docs/deployment/staging-handoff-evidence-2026-10-01.md`.
- Stop de web-restart-loop en houd runner en worker-timer gestopt tijdens de
  eenmalige forward-fix-installatie. De host heeft blijkens `systemctl status`
  een **staging-specifiek instancebestand**
  `/etc/systemd/system/fieldgrid@staging.service` geladen. Installeer de
  beoordeelde `deploy/fieldgrid@.service` daarom uit het nieuwe checksummed
  operatorpakket exact op dat instancepad, samen met de bijgewerkte publieke
  runnercontractcontrole, en voer `daemon-reload` plus beide gescheiden
  contractcontroles uit. Alleen de generieke
  `/etc/systemd/system/fieldgrid@.service` vervangen corrigeert deze host niet.
  Start de reeds geïnstalleerde kandidaat `bd7f69f6` daarna niet handmatig: die
  release bevat de verpakte preflight nog niet. Hervat alleen de runner voor de
  promotie van de nieuwe volledig geteste SHA.
- De worker-timer blijft bewust `inactive/dead` totdat de workflow de nieuwe
  gepromoveerde release via de broker heeft geactiveerd en web-health plus de
  exacte SHA groen zijn. Voer dan uitsluitend het in de workflow getoonde
  hervattingscommando uit; de eindcontrole vereist daarna een verse succesvolle
  workeruitvoering. `shared/runtime.env` is door de tweede poging via de broker
  gegenereerd en geïnstalleerd en mag niet handmatig worden aangemaakt, gevuld
  of aangepast.
- Controleer na activatie actieve ClamAV/freshclam, duurzame Unix-socket
  `0660`/`clamav:clamav`, afwezigheid van een TCP-listener en
  eerst de werkelijke clamd-`PING`/`PONG`-preflight onder `fieldgrid`, daarna
  scannerready/EICAR/PNG/PDF via de gedeployde app. `test -w` is geen geldig
  positief bewijs voor Unix-socketconnectiviteit. De runnergate verbindt niet,
  maar vereist exacte runnergroepen, een niet-schrijfbare root/clamav-map en
  exact sockettype, eigenaar/groep, modus, hardlinkaantal en afwezigheid van
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
