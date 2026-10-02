# ClamAV — staging-gebruikers, rechten en acceptatie

Actueel contract, 2 oktober 2026. De eigenaar heeft onderstaande VPS-controles
en de beveiligde hosthandoff uitgevoerd; dit is operatorbewijs, geen
scanneracceptatie vanuit de gedeployde app. Dit document vervangt eerdere
instructies die de runner toegang
tot de scanner gaven of `TICKET_CLAMAV_*` gebruikten.

## Bevestigde operatorstatus — 2 oktober 2026

- App `fieldgrid@staging.service`: actief, `fieldgrid` UID 995/GID 982;
  draaiend proces heeft groepen 108 (`clamav`) en 982 (`fieldgrid`).
- Runner `actions.runner.veele-services-platform.fieldgrid-staging-veele.service`:
  actief als `fieldgrid-runner` UID 994, met primaire groep `fieldgrid-runner`
  en zonder aanvullende groepen. GitHub-connectiviteit bevestigd door operator
  én read-only API: `fieldgrid-staging-veele` online, label
  `fieldgrid-staging`. De runner heeft geen toegang tot beschermde shared-,
  release- of backuppaden en schrijft uitsluitend naar zijn eigen `incoming`.
- Socket `clamav:clamav`, `0660`, geen extra ACL; daemon en freshclam actief.
  Socketunit en clamd-config schrijven `0660` voor. Eerder geen TCP-listener;
  opnieuw controleren, ook na daemonherstart.
- De staging-specifieke systemd-instantieconfiguratie en vaste no-argument
  rootbroker zijn geïnstalleerd. De afzonderlijke root-only controle en
  onprivileged runnercontrole zijn geslaagd. Oude staging-drop-ins, waaronder
  de workerverwijzing naar `shared/fieldgrid.env`, staan in operatorbackup
  `/var/backups/fieldgrid-staging-handoff.ze5Pmkdk`.
- GitHub Environment `staging` bevat de publieke handoffvariable
  `STAGING_HANDOFF_ENCRYPTION_CERT_B64`; de private sleutel blijft root-only op
  de VPS. `shared/runtime.env` ontbreekt vóór de eerste deployment bewust en
  `fieldgrid-worker@staging.timer` is `inactive/dead`.
- `pg_restore 18.6` is bevestigd en kan het door PostgreSQL 17 gemaakte
  pre-migratiearchief valideren.
- Actuele definities, duurzame socketrechten/TCP-afwezigheid na daemonherstart,
  scannerready/EICAR/PNG/PDF via de nieuwe app en een verse workeruitvoering
  zijn nog open stagingacceptatiepunten.

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
stat -c '%U %G %a %F' /run/clamav/clamd.ctl
systemctl is-active clamav-daemon.service clamav-freshclam.service
```

Lees vervolgens alleen `User`, `Group` en `SupplementaryGroups` van de gevonden
exacte runnerunit en controleer die gebruiker met `id <runnergebruiker>`. De
runtime en runner moeten gescheiden blijven; de handoff mag niet worden
teruggedraaid en de runner krijgt geen brede sudo- of Docker-toegang. Het
lidmaatschap van runtimegebruiker `fieldgrid` in `clamav` is al uitgevoerd.

Verifieer als operator de positieve en negatieve toegangscontrole met de
werkelijke runnernaam (plaats geen geheimen op de commandoregel):

```sh
sudo -u fieldgrid test -w /run/clamav/clamd.ctl
sudo -u <runnergebruiker> test -w /run/clamav/clamd.ctl
```

De eerste opdracht moet slagen, de tweede moet falen. Controleer eventuele ACLs
met `getfacl /run/clamav/clamd.ctl`; modus `0660` alleen bewijst niet dat er geen
extra ACL is. Controleer als operator `sudo ss -ltnp`: `clamd` mag geen TCP-
listener hebben. Publiceer geen onnodige volledige hostinventaris.

De operator rapporteerde afwijkende resultaten van `test -w` bij onderzoek
naar de deploydirectory. Gebruik deze predicate daarom niet als zelfstandig
bewijs: actuele proces-UID/groepen, socketmode/eigenaar/ACL en de echte controle
vanuit de app horen samen bij de acceptatie. Laat de runner geen echte scan
uitvoeren als vervangende proef.

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

De webtemplate `deploy/fieldgrid@.service` vereist de daemon en controleert de
socket vóór starten. `PrivateTmp`/`ProtectHome` blijven intact: `/run/clamav`
is bereikbaar zonder de sandbox te verruimen. Er wordt geen hostunit door de
workflow geïnstalleerd of gewijzigd.

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

De unitverwijzingen en broker zijn al geïnstalleerd; de eerste gegenereerde
`runtime.env` volgt in hetzelfde gecontroleerde releasevenster via de workflow.
Herstart web/worker niet handmatig naar een ontbrekend runtimebestand. De
unprivileged runnergate weigert oude unitverwijzingen; de afzonderlijke rootgate
controleert uitsluitend beschermde metadata zonder waarden te loggen. De
preflight accepteert de bewust gepauzeerde timer, maar vereist de geïnstalleerde
unit met precies
`fieldgrid-worker@staging.service` als target. Na gezonde webactivatie hervat
de operator de timer; de eindcontrole wacht maximaal tien minuten op een actieve
timer én een geslaagde workeruitvoering die na die webactivatie is gestart.
Alleen een oude `Result=success` is onvoldoende. De runner start geen timer.
Geen secrets handmatig kopiëren en geen `Environment`-property/journal met
credentials in logs tonen.

Concreet tijdens het afgesproken releasevenster:

1. De reeds gepauzeerde timer, geïnstalleerde templates, broker en gescheiden
   runner blijven ongewijzigd; herhaal de handoff niet.
2. De goedgekeurde stagingworkflow controleert, bouwt, maakt een backup en
   migreert op een verse hosted runner. Zij versleutelt runtime en backup,
   attesteert release plus beide enveloppen en geeft alleen deze bytes aan de
   persistente runner. De root-broker installeert daarna `shared/runtime.env`.
   Controleer desgewenst alleen bestandmetadata met `stat`, nooit de inhoud.
3. De workflow activeert de nieuwe webcode en controleert exacte SHA, database
   en echte scannerreadiness. Pas nadat de brokeractivatie en web-health/SHA
   groen zijn hervat de operator de timer volgens het stagingrunbook.
4. De workflow bewijst vervolgens een verse geslaagde workeruitvoering. Bij
   een mislukte workflow vóór activatie: eerst status/omgeving onderzoeken en
   gecontroleerd de passende timer herstellen; geen oude brede policies terugzetten.

## Wat de applicatie en workflow bewijzen

1. De root-only operatorcontrole valideert key-, trust- en runtimebestandsmetadata.
   De afzonderlijke runnerpreflight valideert gescheiden UID/groepen, actieve
   daemons, echte weigering van beschermde paden, een begrensde schrijfactie in
   `incoming` en geïnstalleerde publieke unitverwijzingen; hij opent geen scannersocket.
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
