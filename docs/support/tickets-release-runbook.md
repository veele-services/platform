# Tickets — gecontroleerde vrijgave

Dit vult het [stagingrunbook](../deployment/staging-runbook.md) aan. De
[architectuur en rechtenmatrix](../architecture/tickets-support.md) en het
[verificatiebestand](tickets-verification.md) zijn leidend voor deze wijziging.
Een lokale test is geen stagingacceptatie. Productie blijft buiten scope.

## Voorwaarden vóór GO

| Configuratie | Plaats | Verplicht | Betekenis |
| --- | --- | --- | --- |
| `CLAMAV_ENABLED` | GitHub Environment `staging`, variable | Ja | Exact `true`. Uitschakelen betekent nooit bestanden ongecontroleerd vrijgeven. |
| `CLAMAV_SOCKET` | GitHub Environment `staging`, variable | Ja | Exact `/run/clamav/clamd.ctl`; alleen de runtime krijgt toegang, niet de stagingrunner. Geen TCP-adres of secret. |
| `CLAMAV_TIMEOUT_MS` | Dezelfde Environment, variable | Nee, standaard `30000` | Maximale wachttijd; een timeout geeft nooit vrijgave. |
| `CLAMAV_MAX_DATABASE_AGE_HOURS` | Dezelfde Environment, variable | Nee, standaard `72`, maximaal `168` | Maximale ouderdom van malwaredefinities; Freshclam moet deze zelfstandig bijwerken. |

Bestaande staging-Supabase-, SendGrid-, VAPID- en workercredentials blijven
ongewijzigd uit GitHub Environment `staging` komen. Geen extra providerkey nodig.
Inventariseer alleen namen; lees geen secretwaarden. De scanner heeft geen
Supabase- of mailcredentials nodig. Installeer/configureer de VPS-scanner als
expliciete operatorhandeling, niet via een verruimde runnersudo-regel.

Gebruik `deploy/clamd-ticket.conf.example` als gecontroleerde referentie,
niet als bewijs dat de service bestaat. Bevestig socketrechten, resourcegrenzen,
PDF-/heuristische controle, overschrijdingsmeldingen en actuele definities.
De runtime-healthcheck moet echt EICAR weigeren en een geldig PNG/PDF accepteren.
De runner doet alleen configuratie-/identiteitscontrole, zonder socketverbinding.
Zie [het actuele ClamAV-operatorcontract](../deployment/clamav.md) voor de aparte
gebruikers, `runtime.env`-overgang en systemd-referenties.

## Schema en compatibiliteit

- `20260930192504_tickets_support.sql`: minimale centrale permissioncatalogus,
  begrensde grants, tickets/berichten/gebeurtenissen, beveiligde RPC-projecties,
  OTP-delegatie, business-time termijnen en idempotente seeds.
- `20260930192516_ticket_files_delivery.sql`: private bestandsquarantaine,
  scan-/kopieleases, privédeliveryledger, bestaande outbox/in-app/pushintegratie.
- Beide migraties zijn additief en transactioneel. Er bestond geen eerdere
  commerciële of personeelsregistratie die tot tickets wordt gekopieerd.
  Werkbonnen, rapporten, uren, offertes en dossiers blijven hun eigen bron.
- Bestaande tenant-/rolpresets worden eenmaal als expliciete beperkte grants
  vastgelegd. Herhaald seeden overschrijft geen maatwerk. HR-inzage en
  supportcontacten ontstaan niet door algemeen beheer of moduleactivatie.
- Nieuwe categorieën zijn beschikbaar, maar `tickets` wordt niet stilzwijgend
  aan iedere bestaande tenant toegevoegd. Activeer de module pas na gereedheid.
- Ruwe ticket-/bestands-/granttabellen zijn niet via gewone API-rollen te lezen
  of te wijzigen. JWT-RPCs controleren actuele sessie, actor, tenant en scope.
- `push_subscriptions.tenant_id` is voor expliciet platform-support optioneel;
  een platformdevice is geen kunstmatig tenantlidmaatschap. Bestaande
  tenantregistraties blijven tenantgebonden. Nieuwe platformregistratie loopt
  uitsluitend via de beperkte eigen-device-RPC.

## Uitrolvolgorde

1. Leg de werkelijke lokale controles en resterende prerequisites vast. Alleen
   een expliciete **GO** staat commit/push toe; een ontbrekende scanner is NO-GO.
2. Controleer diff, gegenereerde types, migraties en namen/secrets. Commit op
   `main`, push zonder force en wacht op geslaagde CI voor precies die SHA.
3. Promoveer bewust diezelfde SHA naar de bestaande `staging`-branch. Deze
   herhaalt CI en gebruikt uitsluitend de dedicated stagingrunner/Environment.
4. De workflow valideert projectrefs, scanner en actieve bestaande workertimer,
   bouwt, maakt een backup met `BACKUP_DATABASE_URL` en migreert uitsluitend met
   `MIGRATION_DATABASE_URL`. Geen remote reset of productiefallback.
5. Activeer de release en controleer health met exacte SHA. Rollback-only
   fixtures toetsen toegang en databasegedrag; fixtureclaims zijn begrensd zodat
   bestaande scan-/mailwachtrijen niet voor tests worden geclaimd.
6. De readonly workergate verlangt een geslaagde uitvoering die na de nieuwe
   webserviceactivatie is gestart. Een actieve timer alleen is onvoldoende.
7. Activeer `tickets` voor een gecontroleerde testtenant. Configureer categorieën,
   bevoegde intake/groepen, supportcontacten en platform-supportscopes via de
   instellingen. Management heeft geen impliciete HR-inzage. Een bevoegde andere
   beheerder kent gevoelige rechten toe met exacte scope en recente mail-OTP;
   zichzelf extra rechten geven is geblokkeerd.
8. Doorloop met testaccounts de eigen personeelsmelding, bestand, privénotitie,
   expliciete deelwizard, onafhankelijke supportafhandeling, antwoordconcept,
   heropening en bevestiging. Controleer 360-/werkbonlinks en verboden directe
   toegang. Controleer notificaties alleen met beheerde testontvangers/devices.

De lokale HTTP-mailbox en scannerfixtures bewijzen de applicatie-integratie,
niet de aflevering door een externe mail- of pushprovider. Controleer na uitrol
de ledger/provideracceptatie en de bedoelde testontvanger afzonderlijk.

De database-smoke en workergate draaien **na** releaseactivatie. Als een van
beide faalt, is de workflow mislukt en is acceptatie NO-GO, maar de nieuwe
release blijft actief of aangewezen voor diagnose. Ook een HTTP-/SHA-healthfout
zet na forward-only securitymigraties niet automatisch een oudere codeversie
terug. Beoordeel bewust onderhoud/forward-fix of uitsluitend een aantoonbaar
compatibele herstelrelease; een rode workflow is nooit bewijs dat de vorige
release weer draait.

## Herstel en bewaarbeleid

- Bij gezamenlijke uitrol met het centrale notificatiesysteem geldt daarnaast
  het [notificatie-versiecontract](../architecture/notifications.md#migratie-en-terugzetten):
  alleen een notificatiecompatibele web- én workerrelease is een veilige
  rollbackkandidaat. Een oude webrelease kan nog rechtstreeks verzenden en is
  dus niet veilig door alleen ticketclaims te blokkeren. Zonder compatibele
  release blijft verzending gepauzeerd tot een gecontroleerde voorwaartse fix.
- Bij runtimeproblemen: stop moduleacceptatie en voer een forward-fix uit, of
  gebruik uitsluitend een vooraf aantoonbaar compatibele herstelrelease. Laat
  de additieve schemawijzigingen en private Storage behouden; geen routinematige
  database-restore, downmigratie of automatische oude-code-rollback.
- Een oudere applicatie kent ticketoutboxevents niet. Zet bij rollback de
  ticketmodule uit via bevoegd platformbeheer, laat ticketdata behouden en
  beoordeel uitstaande events/scans vóór een nieuwe promotie. Claim geen
  ticketbezorging als geslaagd zolang de geschikte worker niet draait.
  `claim_outbox` sluit ticketevents standaard uit; alleen de nieuwe worker geeft
  `include_tickets: true` mee. Daardoor kan een oudere worker ze niet als
  onbekend event stilzwijgend als verzonden afboeken. De bestaande eventtypen
  blijven claimbaar voor hun bestaande verwerking, maar ook na rollback moet
  een verse succesvolle workeruitvoering worden aangetoond. De huidige
  baseline mist de nieuwe begrensde loopbackuitzondering in de proxy; terugrollen
  kan die hostnameblokkade opnieuw introduceren. Beoordeel dit met de operator
  voordat een rollback als operationeel gezond wordt beschouwd. Dit runbook
  machtigt geen automatische wijziging van de VPS-unit of diens credentials.
- Bestanden blijven ontoegankelijk bij scan-/kopiefouten; leases en beperkte
  retries herstellen onderbroken verwerking. Een geselecteerde supportkopie
  is pas beschikbaar na afzonderlijke publicatie en heeft daarna zelfstandig
  toegangsbeleid. Origineel en kopie worden niet via één publiek pad gedeeld.
- Een mail/push met onzekere provideracceptatie wordt niet automatisch opnieuw
  verstuurd. Controleer eerst de providerregistratie. Geen handmatige ruwe
  statuswijziging als generieke retryprocedure.
- Sluiten bewaart historie; archiveren voorkomt actieve werkvoorraad;
  gecontroleerde redactie schermt inhoud/bijlagen af zonder de oorspronkelijke
  audit stilzwijgend te herschrijven. Account-/membershipintrekking blokkeert
  volgende reads, downloads en deliverychecks; historische berichten blijven.
- Alleen ongebonden, verlopen of bewust verwijderde uploaddrafts worden
  opgeruimd, met bescherming tegen actieve scanleases. Voor definitieve
  gesprekken, vrijgegeven bestanden, kopieën en audit ontbreekt een vastgesteld
  ticketbewaarprofiel. Er is daarom geen destructieve automatische purge of
  verzonnen wettelijke termijn toegevoegd. De producteigenaar moet het
  bewaarbeleid vaststellen vóór automatische definitieve verwijdering.
