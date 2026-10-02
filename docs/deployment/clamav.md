# ClamAV — staging-gebruikers, rechten en acceptatie

Actueel contract, 2 oktober 2026. De eigenaar heeft onderstaande VPS-controles,
de beveiligde hosthandoff en de checksummed forward-fix operatorupdate
uitgevoerd. De afzonderlijke hostcontroles zijn operatorbewijs; de huidige
gedeployde app meldt de scanner nog niet gereed. Dit document vervangt eerdere
instructies die de runner toegang tot de scanner gaven of `TICKET_CLAMAV_*`
gebruikten.

## Bevestigde operatorstatus — 2 oktober 2026

- De checksummed forward-fix installeerde de bijgewerkte webunit op het
  daadwerkelijk geladen staging-instancepad, de vaste broker en de huidige
  runnercontrole; hun gepubliceerde hashes komen overeen met de geïnstalleerde
  bestanden. De toen uitgevoerde rootcontrole was de metadata-only
  `c3dd469…`-versie. Die historische rootcontrole en de huidige onprivileged
  runnercontrole slaagden; alleen de runner werd daarna hervat. De uitgebreidere
  kandidaat-rootcontrole voor clamd VERSION, socketunit en live TCP-listeners is
  nog niet geïnstalleerd of op de VPS uitgevoerd.
- Exacte release `d9084380f8278e634cb6ee372d2cc4ebe5e9b11e` doorliep volledige
  `main` CI en vervolgens de staging verify-, host-preflight- en prepare-jobs.
  De broker installeerde en selecteerde die release. De app is actief en meldt
  de database gereed, maar publieke health retourneert HTTP 503 met
  `scanner=unavailable`; acceptance is daarom overgeslagen. Staging blijft
  fail-closed NO-GO. De daaropvolgende operatorproef heeft de oorzaak bewezen:
  clamd heeft het `VERSION`-commando uitgeschakeld en antwoordt daarop
  `COMMAND UNAVAILABLE`. Fieldgrid eist vóór de scan geldige engine- en
  databaseversie/timestamp om de maximale definitie-ouderdom af te dwingen;
  daardoor faalt de volledige readiness terecht gesloten.
- Runtime-identiteit `fieldgrid` heeft UID 995/GID 982 en de aanvullende groep
  108 (`clamav`). De socket is `clamav:clamav`, `0660`; `test -S` slaagt en
  beide ClamAV-services zijn actief. Op deze host retourneert `test -w` onder
  de runtime-identiteit desondanks status 1. Dat is geen geldig positief bewijs
  voor bruikbaarheid van deze Unix-socket.
- Runner `actions.runner.veele-services-platform.fieldgrid-staging-veele.service`:
  actief als `fieldgrid-runner` UID 994, met primaire groep `fieldgrid-runner`
  en zonder aanvullende groepen. GitHub-connectiviteit bevestigd door operator
  én read-only API: `fieldgrid-staging-veele` online, label
  `fieldgrid-staging`. De runner heeft geen toegang tot beschermde shared-,
  release- of backuppaden en schrijft uitsluitend naar zijn eigen `incoming`.
- Socket `clamav:clamav`, `0660`, geen extra ACL; daemon en freshclam actief.
  Socketunit en clamd-config schrijven `0660` voor. De runtimeproef onder
  `fieldgrid` bewees `PING`, EICAR-weigering en acceptatie van de gecontroleerde
  PNG/PDF. `clamdscan --version` bevestigde ClamAV 1.5.4 en waarschuwde expliciet
  dat het `VERSION`-commando in clamd is uitgeschakeld. Freshclam meldde actuele
  definities: daily 28141, main 63 en bytecode 339 waren up-to-date. Eerder geen
  TCP-listener; opnieuw controleren, ook na daemonherstart.
- De staging-specifieke systemd-instantieconfiguratie en vaste no-argument
  rootbroker zijn geïnstalleerd. De historische metadata-rootcontrole en de
  huidige onprivileged runnercontrole zijn geslaagd; dit is nog geen geslaagde
  uitvoering van de nieuwe uitgebreide rootcontrole. Oude staging-drop-ins, waaronder
  de workerverwijzing naar `shared/fieldgrid.env`, staan in operatorbackup
  `/var/backups/fieldgrid-staging-handoff.ze5Pmkdk`.
- GitHub Environment `staging` bevat de publieke handoffvariable
  `STAGING_HANDOFF_ENCRYPTION_CERT_B64`; de private sleutel blijft root-only op
  de VPS. `fieldgrid-worker@staging.timer` blijft bewust `inactive/dead`.
- `pg_restore 18.6` is bevestigd en kan het door PostgreSQL 17 gemaakte
  pre-migratiearchief valideren.
- De eerdere kandidaat `bd7f69f6233cd7066e3f042a718b1d9f629ee86a` liep vóór Node
  vast op `test -w` in de oude unit. Dat incident is met de nieuwe unit en de
  verpakte begrensde clamd-`PING`/`PONG`-preflight afgehandeld. De nieuwe
  runtime-evidence bewijst dat dit niet de huidige oorzaak is; de blokkade zit
  in het uitgeschakelde clamd-`VERSION`-commando en de daardoor ontbrekende
  metadata voor Fieldgrids definitie-ouderdomscontrole.
- De broker weigert een reeds geïnstalleerd releasepad; speel de handoff voor
  `d9084380` niet opnieuw af. Open blijven: beoordeelde remedie voor de
  ontbrekende `VERSION`-metadata, gezonde scannerreadiness via de app, duurzame
  socketrechten en TCP-afwezigheid na daemonherstart, en daarna een verse
  workeruitvoering en de overgeslagen acceptance. De directe EICAR/PNG/PDF-
  socketproef is bewezen, maar is nog geen gezonde app-readiness. De Supabase
  Send Email Hook blijft uit en productie blijft onaangeraakt.

Deze host-/servicenamen zijn infrastructuuridentiteiten, geen tenantbranding.
Codex heeft de VPS niet gewijzigd. De eenmalige overgang is door de operator
uitgevoerd; volg nu uitsluitend de releasevolgorde hieronder en maak geen
runtimebestand met handmatig gekopieerde waarden.

## Twee verschillende soorten rechten

De hieronder beschreven Unix-rechten maken scannen mogelijk. Hiervoor hoef je
geen Fieldgrid-applicatierol aan te maken of iemand Tenantbeheerder te maken.
Het nieuwe **Gebruikers / Rollen / Rechten** in Fieldgrid is een afzonderlijke,
nog niet volledig afgeronde implementatie. ClamAV-installatie voltooit die
applicatierechten niet. Geef geen brede HR-/beheerrechten om uploads te laten
werken; ticket-, document- en tenantautorisatie blijft apart afgedwongen.

## Vast contract

| Onderdeel | Waarde |
|---|---|
| Appconfig | `CLAMAV_ENABLED=true` |
| Socketconfig | `CLAMAV_SOCKET=/run/clamav/clamd.ctl` |
| Daemon | `clamav-daemon.service` |
| Definitie-updater | `clamav-freshclam.service` |
| Socket | Unix only; eigenaar `clamav`, groep `clamav`, modus `0660` |
| Runtime | `fieldgrid`, lid van `clamav`; webunit heeft aanvullend `SupplementaryGroups=clamav` |
| Stagingrunner | Andere, niet-root UID; geen lidmaatschap/ACL/sudo-route naar de scannersocket |
| TCP | Geen listener; ook niet op localhost |
| Gegenereerde runtimeconfig | `/opt/fieldgrid/staging/shared/runtime.env` |

GitHub Environment `staging` blijft de enige configuratiebron. De namen van de
gewone variables `CLAMAV_ENABLED` en `CLAMAV_SOCKET` zijn inmiddels via een
names-only inventaris bevestigd; hun verwachte waarden staan hierboven. Er
hoeven geen waarden in code of `.env` te worden gekopieerd. Optioneel: `CLAMAV_TIMEOUT_MS=30000` en
`CLAMAV_MAX_DATABASE_AGE_HOURS=72`. Geen nieuwe secret nodig. De oude
`TICKET_CLAMAV_*`-namen zijn geen fallback. Zet niets handmatig in `.env` of Git.

## Operatorhercontrole tijdens acceptatie

Voer op de **staging-VPS** uit, zonder Environment-waarden/secrets te printen:

```sh
systemctl show fieldgrid@staging.service --property=User --property=Group
systemctl list-units 'actions.runner.*.service' --all --no-pager
id fieldgrid
LC_ALL=C stat -c '%F:%U:%G:%a' -- /run/clamav
LC_ALL=C ls -ld -- /run/clamav
LC_ALL=C stat -c '%F:%U:%G:%a:%h' -- /run/clamav/clamd.ctl
LC_ALL=C ls -ld -- /run/clamav/clamd.ctl
systemctl is-active clamav-daemon.service clamav-freshclam.service
```

De map moet een echte directory zijn, met eigenaar én groep uit `root`/`clamav`,
zonder group/world-write en zonder extended-access-indicator. De `stat`-uitvoer
voor de socket moet exact `socket:clamav:clamav:660:1` zijn en het eerste veld
van de tweede socket-`ls -ld` exact `srw-rw----`. Een `+` of andere indicator op
map of socket faalt de runnergate; gebruik `getfacl` daarna alleen voor diagnose.
Er is geen extra `acl`-pakket nodig voor de contractcontrole.

Lees vervolgens alleen `User`, `Group` en `SupplementaryGroups` van de gevonden
exacte runnerunit en controleer die gebruiker met `id <runnergebruiker>`. De
runtime en runner moeten gescheiden blijven; de handoff mag niet worden
teruggedraaid en de runner krijgt geen brede sudo- of Docker-toegang. Het
lidmaatschap van runtimegebruiker `fieldgrid` in `clamav` is al uitgevoerd.

Gebruik `test -w` niet als positieve runtimecontrole voor een Unix-socket. Het
bevestigde incident liet precies de onjuiste uitkomst zien: de runtime had de
juiste aanvullende groep en de socket had groep-write, maar `test -w` gaf
status 1 en blokkeerde de webstart. Controleer eventuele ACLs met
`getfacl /run/clamav/clamd.ctl`; modus `0660` alleen bewijst niet dat er geen
extra ACL is. De lokaal voorbereide, nog niet op staging geïnstalleerde rootgate
attesteert daarnaast de effectieve listener van de
canonieke `clamav-daemon.socket`, bindt de daemon-`MainPID` en luisterende
Unix-socket aan dezelfde servicestructuur en leest de IPv4/IPv6-TCP-tabellen
van die structuur en andere `clamd*`-processen fail-closed. Een clamd-owned TCP-
listener of gemaskeerde maar nog actieve socketunit faalt gesloten. Controleer
`sudo ss -ltnp` tijdens acceptatie nog als
onafhankelijke defense-in-depth-proef; publiceer geen onnodige volledige
hostinventaris.

De bijgewerkte webunit houdt de structurele `test -S`-controle en voert daarna
vanuit de release een echte clamd-protocolcontrole uit. Na installatie van een
release die `clamav-preflight.mjs` bevat kan de operator dezelfde verbinding
zonder runtimeconfig of geheimen te tonen afzonderlijk controleren met:

```sh
sudo -u fieldgrid /usr/bin/env -i \
  PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  DEPLOY_TARGET=staging \
  CLAMAV_ENABLED=true \
  CLAMAV_SOCKET=/run/clamav/clamd.ctl \
  /usr/bin/env node /opt/fieldgrid/staging/current/clamav-preflight.mjs
```

De opdracht moet exact een geslaagde preflight melden. Zij stuurt uitsluitend
`PING` en accepteert uitsluitend het clamd-antwoord `PONG` binnen de begrensde
timeout. Dit bewijst bereikbaarheid, niet scanacceptatie: actuele proces-UID/
groepen, socketmode/eigenaar/ACL en de echte EICAR-/PNG-/PDF-controle vanuit de
app horen nog steeds samen bij acceptatie. Laat de runner geen echte scan of
deze positieve socketcontrole uitvoeren als vervangende proef; zijn gescheiden
runnercontract bewijst uitsluitend dat toegang wordt geweigerd. Dat contract
gebruikt daarvoor geen `test -r`/`test -w`: het vereist exact de afzonderlijke
runnergroepen, een door root/clamav gecontroleerde bovenliggende map zonder
group/world-write of extended access, en attesteert zonder socketverbinding dat
het pad een `clamav:clamav`-socket met modus `0660`, één hardlink en zonder
`ls`-ACL/securitycontext-indicator is. Een afwijking faalt gesloten. De
disposable Linux-contracttest bindt een echte Unix-socket en bewijst met
gescheiden UIDs dat de canonieke toestand een runnerverbinding weigert, dat
permissieve socketmodus een verbinding mogelijk maakt maar faalt, en dat een
schrijfbare bovenliggende map vervanging mogelijk maakt maar eveneens faalt.

## Duurzame socket- en unitconfiguratie

Vergelijk de geïnstalleerde ClamAV-config met
`deploy/clamd-ticket.conf.example`: PDF-scanning, versleutelde-documentdetectie,
`AlertExceedsMax yes`, begrensde resources en verse definities zijn nodig.
Een eenmalige chmod/chown is niet duurzaam: de daemon of socketunit maakt de
socket bij een herstart opnieuw aan.

Als de distributie `clamav-daemon.socket` gebruikt, controleer ook die unit.
`deploy/clamav-daemon.socket.d/fieldgrid.conf.example` is een operatorreferentie
voor `SocketUser`, `SocketGroup`, `SocketMode` en uitsluitend de Unix-listener.
Installeer niet blind beide socketbeheerders; volg de aangetroffen systemd-
constructie. Freshclam moet nieuwe definities aan de actieve daemon doorgeven.

De nieuwe kandidaat-rootgate accepteert voor een geladen
`clamav-daemon.socket` exact één
`Listen`-waarde: `/run/clamav/clamd.ctl (Stream)`. Een TCP-, Datagram-, extra of
afwijkende listener faalt. Een afwezige of gemaskeerde socketunit moet aantoonbaar
inactief zijn. In die toestand beheert clamd het canonieke Unix-pad zelf; de
gate vereist dat de canonieke servicestructuur die luisterende Unix-socket bezit
en controleert de daemon en alle andere `clamd*`-processen op IPv4- en
IPv6-TCP-listeners. Onleesbare TCP-status faalt gesloten. Deze
controle draait uitsluitend als root en geeft geen hostinventaris of
configuratiewaarden weer.

De webtemplate `deploy/fieldgrid@.service` vereist de daemon, controleert eerst
dat het canonieke pad een socket is en voert vervolgens vanuit de verpakte
release een begrensde clamd-`PING`/`PONG`-controle uit. Zij gebruikt bewust geen
`test -w` meer. `PrivateTmp`/`ProtectHome` blijven intact: `/run/clamav` is
bereikbaar zonder de sandbox te verruimen. Er wordt geen hostunit door de
workflow geïnstalleerd of gewijzigd. Op deze host meldt systemd het geladen
bestand als `/etc/systemd/system/fieldgrid@staging.service`. De beoordeelde
forward-fix is daar op 2 oktober 2026 al exact geïnstalleerd en geverifieerd;
installeer hem niet opnieuw als onderdeel van de VERSION-correctie. De
repositorytemplate blijft de canonieke bron voor een toekomstige bewuste
operatorupdate. Alleen het generieke `/etc/systemd/system/fieldgrid@.service`
wijzigen zou de geladen staging-instance nog steeds niet veranderen.

## Overgang naar runtime.env

De web- en worker-trigger-template verwijzen nu naar `shared/runtime.env`.
Een verse GitHub-hosted prepare-job maakt de inhoud uit GitHub Environment in
een tijdelijk bestand en versleutelt dit direct met het publieke staging-
handoffcertificaat. De persistente VPS-runner ontvangt uitsluitend de CMS-
envelop en bijbehorende GitHub-attestatie, nooit de platte inhoud. De vaste
root-broker verifieert de attestatie, ontsleutelt met de uitsluitend op de VPS
aanwezige root-key en installeert het uiteindelijke bestand als
`root:fieldgrid` met modus `0640`. De directory `shared` is `root:fieldgrid` met
modus `0750`; de runner kan haar niet lezen, benaderen of wijzigen.

De runner is in de geïnstalleerde doelconfiguratie lid van **noch `fieldgrid`, noch
`clamav`**. Hij houdt zijn eigen primaire groep en kan alleen naar
`/opt/fieldgrid/staging/incoming` schrijven. Oude groepsrechten
(`Group=fieldgrid`, schrijfbaar `shared`) waren uitsluitend een waarneming van
vóór de beveiligde overdracht en zijn geen geldige fallback.
Het gecombineerde root-broker-model scheidt de persistente runner van
runtimeconfiguratie, platte retentieback-ups en geïnstalleerde releases;
scannerrechten blijven uitsluitend bij de app-runtime. De runner heeft geen
directe restart-sudo en geen afzonderlijke plaintext runtime-/backupbroker.

De broker heeft voor `d9084380` de gegenereerde `runtime.env`, backup en release
geïnstalleerd en de exacte release geactiveerd. De databasecheck is gereed, maar
publieke health blijft HTTP 503 met `scanner=unavailable`; acceptance is
overgeslagen. De unprivileged runnergate weigert oude unitverwijzingen. De
historisch uitgevoerde rootgate controleerde uitsluitend beschermde metadata;
de lokaal uitgebreide kandidaat controleert daarnaast de root-only
ClamAV-configuratie en live listenerstatus zonder waarden te loggen, maar is nog
niet geïnstalleerd of uitgevoerd. De
timerpreflight accepteert de bewust gepauzeerde timer,
maar vereist de geïnstalleerde unit met precies
`fieldgrid-worker@staging.service` als target. De broker weigert replay van het
al geïnstalleerde releasepad, dus roep dezelfde `d9084380`-handoff niet opnieuw
aan. Geen secrets handmatig kopiëren en geen `Environment`-property of journal
met credentials in logs tonen.

Concreet voor de huidige scannerblokkade:

1. Houd `fieldgrid-worker@staging.timer` uit. Verander geen runnergroepen,
   socketmode, socketeigenaar, ACL, sudo-regel, beschermd pad of runtimebestand
   om de 503 te omzeilen.
2. De begrensde runtimeproef heeft `PING`, UID/groepen, socketmetadata,
   actieve daemon/freshclam, actuele definities, EICAR-weigering en PNG/PDF-
   acceptatie bewezen. Zij heeft ook de oorzaak aangetoond: clamd `VERSION` is
   uitgeschakeld, zodat Fieldgrid de vereiste engine/databaseversie en
   definitie-ouderdom niet kan valideren. Log geen configuratiewaarden of
   bestandsinhoud bij vervolgcontroles.
3. Installeer eerst de checksummed uitgebreide rootchecker, pas daarna veilig
   exact één actieve `EnableVersionCommand yes` toe en herstart clamd. De nieuwe
   rootcontrole moet vervolgens slagen met de melding
   `Root-only staging key, trust, protected runtime and scanner host contract verified.`
   Dit vereist geen herhaling van de eenmalige handoff en geen herinstallatie
   van webunit, runnerchecker of broker. Claim de blokkade niet als opgelost
   vóór deze hostcontrole én een echte app-readinessproef. Vereist het herstel andere releasebytes of
   code, maak dan een nieuwe commit en laat die de volledige `main`-CI en
   stagingworkflow doorlopen; de huidige SHA is niet replaybaar.
4. Hervat de timer pas wanneer publieke health de exacte actieve SHA, database
   en scanner als gereed valideert. De eindcontrole wacht daarna maximaal tien
   minuten op een actieve timer én een geslaagde workeruitvoering die na die
   webactivatie is gestart. Alleen een oude `Result=success` is onvoldoende; de
   runner start geen timer.

## Wat de applicatie en workflow bewijzen

1. De nieuwe root-only operatorcontrole valideert key-, trust- en
   runtimebestandsmetadata, het VERSION-contract, de canonieke socketunit en de
   afwezigheid van live clamd-owned TCP-listeners. Dit is de vereiste controle,
   maar zij is op staging nog niet geïnstalleerd of uitgevoerd. De afzonderlijke
   runnerpreflight valideert
   gescheiden UID/groepen, actieve daemons, echte weigering van beschermde
   paden, een begrensde schrijfactie in `incoming` en geïnstalleerde publieke
   unitverwijzingen; hij opent geen scannersocket.
2. Na activatie voert de **web-runtime** een echte EICAR-/PNG-/PDF-controle uit.
   Staging controleert ook werkelijke socketmodus/eigenaar/groep en proces-UID/
   groepen. `/api/healthz` geeft alleen `scanner: ready/unavailable`, geen
   paden, accountgegevens, gescande inhoud of secrets.
3. SHA-healthacceptatie vereist `scanner=ready`. Succes wordt maximaal 60 sec
   gedeeld tussen healthverzoeken; fouten maximaal 5 sec. Iedere echte upload
   heeft daarnaast een eigen scan en controle op definitie-ouderdom.
4. Uitgeschakeld/onbereikbaar/verouderd/fout betekent **geen vrijgave**.
   Quarantaine en private Storage-toegangscontroles blijven actief.
5. De bestaande worker moet na releaseactivatie aantoonbaar succesvol draaien.

Lokaal/hosted CI gebruikt een eigen geïsoleerde testscanner. Die testvoorziening
geeft de self-hosted stagingrunner geen toegang tot de VPS-scanner. Geen lokale
test bewijst dat de hostrechten op staging correct staan.

## Alle aangetroffen bestandspaden

Naast de bestaande ticketquarantaine gebruiken klant-, object-, personeels- en
commerciële documenten, rapportfoto's, handtekeningen, factuur-PDF's en logo's
nu één serverzijdige scangateway. Rechtstreekse Storage uploads/overschrijvingen/
verwijderingen door gebruikers worden voor die buckets geweigerd. Een scanbewijs
is gebonden aan de werkelijke Storage-objectversie, MIME, lengte en SHA-256;
nieuwe of gewijzigde bytes krijgen niet automatisch een bestaand bewijs.

Historische bestanden worden niet verwijderd, herschreven of zonder scan
goedgekeurd. Bij een geautoriseerde download wordt ontbrekend bewijs alsnog
verkregen via een echte scan; bij fout blijft het bestand niet beschikbaar.
De gateway accepteert PDF, PNG, JPEG en WebP tot 10 MB. Oude personeelsbestanden
van 10–20 MB blijven bewaard maar vereisen een gecontroleerde vervolgactie;
er is geen bypass of automatische verkleining. De upload-MIME en bestandssignatuur
moeten overeenkomen. Een antivirusuitslag bewijst niet dat elke mogelijke
schadelijke inhoud wordt herkend.

Lokaal bewezen: veilige PNG/PDF, EICAR-bestand in een PDF-bijlage geweigerd,
scanner uit/onbereikbaar faalt gesloten, forged scanbewijs geweigerd, gewijzigde
objectversie ongeldig, metadata/bytes/bronautorisatie en intrekking herbeoordeeld.
De volledige browserflow gebruikt een echte lokale scanner; geen VPS-bewijs.

Het nieuwe scancontract vereist app en forward-migratie in hetzelfde
releasevenster. De oude app kan na de migratie niet meer rechtstreeks uploaden.
Bij mislukte activatie geen oude brede Storagepolicies herstellen: houd de
betrokken functie dicht en voer een forward-fix uit. De bredere releaseaudit is
nog niet compleet; zie het actuele releasebewijs voordat je uitrolt.

Primaire referenties: [ClamAV scanner en Unix-streamprotocol](https://docs.clamav.net/manual/Usage/Scanning.html),
[systemd service-executie](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html).
