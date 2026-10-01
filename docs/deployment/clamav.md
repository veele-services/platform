# ClamAV — staging-gebruikers, rechten en acceptatie

Actueel contract, 1 oktober 2026. De eigenaar heeft onderstaande VPS-controles
uitgevoerd; dit is operatorbewijs, geen scanneracceptatie vanuit de gedeployde
app. Dit document vervangt eerdere instructies die de runner toegang
tot de scanner gaven of `TICKET_CLAMAV_*` gebruikten.

## Bevestigde operatorstatus — 1 oktober 2026

- App `fieldgrid@staging.service`: actief, `fieldgrid` UID 995/GID 982;
  draaiend proces heeft groepen 108 (`clamav`) en 982 (`fieldgrid`).
- Runner `actions.runner.veele-services-platform.fieldgrid-staging-veele.service`:
  actief als `fieldgrid-runner` UID 994, procesgroep `fieldgrid` GID 982, zonder
  `clamav`. GitHub-connectiviteit bevestigd door operator én read-only API:
  `fieldgrid-staging-veele` online, label `fieldgrid-staging`.
- Bestaande runnerinstallatie `/home/fieldgrid/actions-runner` is eigendom van
  `fieldgrid-runner:fieldgrid`. ACL op `/home/fieldgrid`: **lees- en doorlooprecht
  (`r-x`)**, niet uitsluitend doorlooprecht.
- Staging/shared/releases hebben groep `fieldgrid`, modus `2770`; daadwerkelijke
  schrijf-/verwijderproef in shared als runner slaagde. `test -w` gaf afwijkende
  resultaten; de oorzaak is niet vastgesteld en die check alleen is geen bewijs.
- Socket `clamav:clamav`, `0660`, geen extra ACL; daemon en freshclam actief.
  Socketunit en clamd-config schrijven `0660` voor. Eerder geen TCP-listener;
  opnieuw controleren, ook na daemonherstart.
- Runner-drop-in `20-runner-user.conf`: `User=fieldgrid-runner`, `Group=fieldgrid`,
  lege `SupplementaryGroups=`. App-drop-in `30-clamav-group.conf`:
  `SupplementaryGroups=clamav`. Sudoers gevalideerd: uitsluitend
  `/usr/bin/systemctl restart fieldgrid@staging.service`.
- Operatorherstelgegevens: `/root/fieldgrid-runner-before-20261001-003652`.
- App en worker gebruiken **nog** `shared/fieldgrid.env`; `runtime.env` ontbreekt.
  Laatste worker `Result=success`/`ExecMainStatus=0`, timer actief. Unitovergang,
  actuele definities en scannerready/EICAR/PNG/PDF via de nieuwe app zijn nog open.

Deze host-/servicenamen zijn infrastructuuridentiteiten, geen tenantbranding.
Codex heeft de VPS niet gewijzigd. Volg voor de nog benodigde overgang de
releasevolgorde hieronder; maak geen runtimebestand met handmatig gekopieerde waarden.

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

## Operatorcontrole vóór wijzigingen

Voer op de **staging-VPS** uit, zonder Environment-waarden/secrets te printen:

```sh
systemctl show fieldgrid@staging.service --property=User --property=Group
systemctl list-units 'actions.runner.*.service' --all --no-pager
id fieldgrid
stat -c '%U %G %a %F' /run/clamav/clamd.ctl
systemctl is-active clamav-daemon.service clamav-freshclam.service
```

Lees vervolgens alleen `User` van de gevonden exacte runnerunit met
`systemctl show <exacte-runnerunit> --property=User`. Controleer die gebruiker
met `id <runnergebruiker>`. Als zowel de runtime als runner `fieldgrid` zijn,
**stop hier**: groepsrechten kunnen twee processen met dezelfde UID niet
scheiden. Verplaats de runner eerst naar een eigen account volgens de bestaande
runnerinstallatie. Geen tweede runner registreren of oude runner verwijderen
zonder die gecontroleerde overdracht. Geen brede sudo- of Docker-toegang geven.

Pas na bevestiging dat de identiteiten gescheiden zijn:

```sh
sudo usermod -aG clamav fieldgrid
```

Geef deze groep **niet** aan de runner. Nieuwe groepsrechten vereisen een
herstart van de betreffende runtime; bestaande processen veranderen niet
automatisch. Bij verwijderde runnergroepsrechten moet ook het oude runnerproces
worden herstart voordat de afscherming bewezen is.

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

De runner mag in de doelconfiguratie lid zijn van **noch `fieldgrid`, noch
`clamav`**. Hij houdt zijn eigen primaire groep en kan alleen naar
`/opt/fieldgrid/staging/incoming` schrijven. De hierboven beschreven huidige
groepsrechten (`Group=fieldgrid`, schrijfbaar `shared`) zijn uitsluitend een
waarneming van vóór de beveiligde overdracht en voldoen niet aan de releasegate.
Het gecombineerde root-broker-model scheidt de persistente runner van
runtimeconfiguratie, platte retentieback-ups en geïnstalleerde releases;
scannerrechten blijven uitsluitend bij de app-runtime. De runner heeft geen
directe restart-sudo en geen afzonderlijke plaintext runtime-/backupbroker.

Plan de unitverwijzing en eerste gegenereerde `runtime.env` in één gecontroleerd
releasevenster. Herstart web/worker niet naar een ontbrekend runtimebestand.
Laat de bestaande werkende service/config intact totdat het nieuwe bestand uit
de GitHub-releaseconfig is geschreven. De unprivileged runnergate weigert nog oude
unitverwijzingen. De afzonderlijke rootgate controleert uitsluitend beschermde
metadata zonder waarden te loggen. Daarvoor kan de operator de nieuwe templates installeren en
daemon-reload uitvoeren, maar de feitelijke herstart pas laten gebeuren na de
configuratieschrijfstap. Coördineer de timer tijdens dit overgangsvenster zodat
die niet naar een ontbrekend bestand start. De preflight accepteert een
gepauzeerde timer, maar vereist de geïnstalleerde unit met precies
`fieldgrid-worker@staging.service` als target. Na gezonde webactivatie hervat
de operator de timer; de eindcontrole wacht maximaal tien minuten op een actieve
timer én een geslaagde workeruitvoering die na die webactivatie is gestart.
Alleen een oude `Result=success` is onvoldoende. De runner start geen timer.
Geen secrets handmatig kopiëren en geen `Environment`-property/journal met
credentials in logs tonen.

Concreet tijdens het afgesproken releasevenster, niet vooraf op goed geluk:

1. Operator pauzeert `fieldgrid-worker@staging.timer` en wacht totdat de lopende
   worker gereed is. Installeert de beoordeelde web-/workertemplates en voert
   `daemon-reload` uit. Laat de bestaande web-runtime draaien; herstart nog niet.
2. De goedgekeurde stagingworkflow controleert, bouwt, maakt een backup en
   migreert op een verse hosted runner. Zij versleutelt runtime en backup,
   attesteert release plus beide enveloppen en geeft alleen deze bytes aan de
   persistente runner. De root-broker installeert daarna `shared/runtime.env`.
   Controleer desgewenst alleen bestandmetadata met `stat`, nooit de inhoud.
3. De workflow activeert de nieuwe webcode en controleert exacte SHA, database
   en echte scannerreadiness. Na de melding dat de release gezond is voert de
   operator `sudo systemctl start fieldgrid-worker@staging.timer` uit.
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
