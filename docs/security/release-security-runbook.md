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
  GitHub-verbinding is geverifieerd; dit onderdeel is uitgevoerd. Geen tweede
  runner nodig en geen oude runner als fallback gebruiken.
  De eigenaar bevestigt UID-/groepsscheiding en socketrechten; zie de gedateerde
  operatorstatus in `docs/deployment/clamav.md`. De unitovergang is nog niet gedaan.
- Controleer de gescheiden runtime-/runner-UIDs, actieve ClamAV/freshclam,
  Unix-socket 0660/clamav:clamav, geen TCP-listener en positieve/negatieve
  sockettoegang volgens `docs/deployment/clamav.md`. Geen Environment-dump.
- Vergelijk de werkelijk geïnstalleerde web/workerunits met de repository-
  templates en plan de overgang naar `shared/runtime.env` zoals dat runbook
  beschrijft. Pauzeer de timer gedurende de overgang; de preflight controleert
  zijn installatie en exacte target. Niet herstarten naar een nog ontbrekend
  runtimebestand. Hervat de timer na runtimegeneratie en gezonde webactivatie;
  de eindcontrole wacht maximaal tien minuten en vereist een verse succesvolle
  uitvoering. Maak daarnaast de root-only handoff-key/certificate en zet alleen
  het publieke certificaat als Environment-variable
  `STAGING_HANDOFF_ENCRYPTION_CERT_B64`. Installeer de gecombineerde broker en
  vervang de huidige restart-sudo door uitsluitend die vaste no-argument broker.
- Houd de Supabase Auth-hook met tijdelijke URL uitgeschakeld. Na de goedgekeurde
  uitrol is het endpoint `https://staging.fieldgrid.nl/api/email/auth`;
  SendGrid gebruikt `https://staging.fieldgrid.nl/api/email/events`.
  Activering en echte testlevering volgen `docs/deployment/mail-hooks.md`.

Alle eerder vereiste GitHub Environment-namen zijn aanwezig. De nieuwe
publieke handoffvariable `STAGING_HANDOFF_ENCRYPTION_CERT_B64` ontbreekt nog en
kan pas na operatorgeneratie van het VPS-sleutelpaar worden gezet. Er worden
geen secretwaarden opgevraagd, geraden of lokaal gekopieerd. De names-only
controle bewijst niet hun geldigheid of de werkelijke serviceconfiguratie.

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
