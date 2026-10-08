# Fieldgrid V1 productie-inrichting

V1 is geaccepteerd. De eigenaar koos dezelfde VPS en de origins
`https://fieldgrid.nl` en `https://veele-services.fieldgrid.nl`.
De [productiearchitectuur](../architecture/production.md) is het vaste contract.
Dit runbook beschrijft concrete operatorstappen; een commit installeert geen
accounts, systemd, Caddy of Supabase-instellingen.

## 1. GitHub Environment production

Gebruik uitsluitend Environment `production` van `veele-services/platform`.
Gebruik een nieuw Supabaseproject, eigen providercredentials en nieuwe
crypto-/workersleutels. Plaats geen waarden in chat, Git, lokale .env-files,
Actions-logs of de blijvende VPS-runner. Controleer inventaris met namen alleen:

```sh
gh variable list --env production --json name --jq '.[].name'
gh secret list --env production --json name --jq '.[].name'
```

| Vereiste variable | Invulling |
| --- | --- |
| `APP_URL` | `https://fieldgrid.nl` |
| `DEPLOY_ROOT` | `/opt/fieldgrid/production` |
| `SERVICE_NAME` | `fieldgrid@production.service` |
| `HEALTHCHECK_URL` | `https://fieldgrid.nl/api/healthz` |
| `PORT` | `3302` |
| `EXPECTED_SUPABASE_PROJECT_REF` | `tqqknlrggmpslttisrck` (door de eigenaar bevestigd) |
| `STAGING_SUPABASE_PROJECT_REF` | Ref van het bestaande V1-stagingproject; alleen de ref, geen credentials |
| `FORBIDDEN_SUPABASE_PROJECT_REF` | `ckdtiuemeygrnujjibnw` (legacyproject, blijft verboden) |
| `ACCEPTED_RELEASE_SHA` | Exacte gereviewde `main`-SHA met geslaagde CI én stagingdeploy; na infrastructuurreview invullen |
| `CLAMAV_ENABLED` | `true` |
| `CLAMAV_SOCKET` | `/run/clamav/clamd.ctl` |
| `GOOGLE_ROUTES_ENABLED` | `false` |
| `MAIL_MARKETING_ENABLED` | `false` |
| `LOG_LEVEL` | `info` |
| `SENDGRID_FROM_EMAIL` | Geverifieerd productie-afzenderadres |
| `SENDGRID_FROM_NAME` | `Fieldgrid` (tenantnaam komt uit tenantinstellingen) |
| `SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY` | Eigen publieke ECDSA-verificatiesleutel, base64 SPKI DER op één regel |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Nieuw productie VAPID-public key; gekoppeld aan private secret |
| `VAPID_SUBJECT` | Beheerd `mailto:`-adres of HTTPS-contactadres |
| `PRODUCTION_HANDOFF_ENCRYPTION_CERT_B64` | Base64 van het publieke productiecertificaat uit stap 3 |

| Vereiste secret | Gebruik |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<NEW_PRODUCTION_PROJECT_REF>.supabase.co` van het nieuwe project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publieke anon-key van dat project |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role-key van dat project; uitsluitend server |
| `DATABASE_URL` | Verbinding naar dat project; direct/session 5432 of runtime transaction-pool 6543 |
| `MIGRATION_DATABASE_URL` | Direct of session-pool 5432, database `postgres`, hetzelfde project |
| `BACKUP_DATABASE_URL` | Direct of session-pool 5432, database `postgres`, hetzelfde project |
| `FIELDGRID_ADMIN_EMAIL` | E-mailadres van de eerste OTP-platformbeheerder; geen wachtwoordsecret |
| `MOLLIE_API_KEY` | Eigen `live_`-key voor de gecontroleerde productie-integratie |
| `SENDGRID_API_KEY` | Eigen beperkte productiesleutel (`SG.`), ten minste Mail Send |
| `SUPABASE_SEND_EMAIL_HOOK_SECRET` | Signed-hooksecret van dit productieproject (`v1,whsec_…`) |
| `OPENROUTESERVICE_API_KEY` | Eigen productiekey met de gebruikte routingprofielen en quota |
| `VAPID_PRIVATE_KEY` | Private helft van het nieuwe productie VAPID-paar |
| `ADMIN_API_SECRET` | Nieuwe willekeurige worker-secret van minstens 32 tekens |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Nieuwe base64 AES-key van 16, 24 of 32 bytes |

Niet nodig: deploy-PAT, SSH-keysecret, `FIELDGRID_ADMIN_PASSWORD`, stagingkeys,
Google Maps-key of marketing-unsubscribe-key voor deze configuratie. De workflow
gebruikt de tijdelijke `GITHUB_TOKEN` voor promotiebewijs en GitHub-attestaties.
Een operator gebruikt zijn eigen GitHub-toegang om de aparte runner te registreren;
dat registratiecredential is geen applicatie- of deploymentsecret.

Optioneel hebben scanner/routingvariables dezelfde gedocumenteerde defaults als
staging: scanner 30.000 ms/72 uur; routingprovider openrouteservice, HTTPS-base
`https://api.heigit.org/openrouteservice/v2`, cache 30 dagen, matrixlimiet 35/min
en 450/dag, directions 35/min en 1.900/dag. Een extra optionele Google-key wordt
niet gebruikt zolang Google Routes false is.

Beperk Environment `production` tot de **branch** `production`; geen tagregel,
wildcard of allebranchesbeleid. De workflow verifieert bovendien de exacte
geaccepteerde SHA en dezelfde geslaagde main- en stagingruns. `main` blijft zonder
automatische deployment. Een nog niet ingestelde `ACCEPTED_RELEASE_SHA` blokkeert
de productieworkflow vóór productiecredentials worden gebruikt.

## 2. Nieuw Supabaseproject

Maak het project leeg aan en noteer uitsluitend de ref voor configuratie.
De projectguard weigert de stagingref en het legacyproject. Gebruik verbindingen
uit dit project, met URL-encoded wachtwoord, database `postgres` en geverifieerde
TLS. Session-pool op 5432 werkt ook vanaf een IPv4 hosted runner; de transaction-
pool op 6543 is ongeschikt voor migratie en backup.

Stel Auth Site URL in op `https://fieldgrid.nl`, met alleen de benodigde
productieplatform-/tenantredirects. Neem geen staging- of localhostredirect over.
Email OTP: 8 cijfers, expiry 3.600 seconden, resend minimaal 60 seconden. Het
Magic Link-template toont `{{ .Token }}` zonder ConfirmationURL of tokenlink.
Na gezonde webactivatie: zet de signed **Send Email Hook** op
`https://fieldgrid.nl/api/email/auth`; kopieer het hooksecret rechtstreeks
naar de gelijknamige GitHub-secret. Schakel de legacy JWT-hook niet in.
Controleer de precieze operatorinstellingen ook in het
[mail-hookrunbook](mail-hooks.md); pas de productieorigins en eigen keys toe.

Laat de deployment alle 131 gecontroleerde V1-migraties toepassen. Geen SQL uit
een oud project, geen seed, geen handmatige buckets of gekopieerde Auth-users.
De migratieguard accepteert alleen een leeg schema of de exacte inhoudelijke
prefix van het repositorymanifest; na migratie moet het gehele manifest kloppen.

## 3. Afzonderlijke productievoorzieningen op dezelfde VPS

Controleer eerst beschikbare RAM, schijf, CPU en bestaande poortbezetting.
Er draaien straks twee Next.js-runtimes plus één gedeelde ClamAV-daemon. Houd
3301 en 3302 uitsluitend op loopback en behoud bestaande stagingroutes en units.

Voer onderstaande stappen als operator/root uit vanaf de gereviewde source-SHA.
Installeer voor productie eigen web-, worker- en timer-instancebestanden vanuit
de V1-templates in die SHA. Neem bestaande hosttemplates niet over: tijdens de
eerste hostcontrole verwees de geïnstalleerde worker-template naar `fieldgrid.env`
en ontbrak zijn werkmap. V1 vereist `shared/runtime.env` en `current`. De eigen
productiebestanden vervangen geen gedeelde template of staging-instance.

```sh
useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin fieldgrid-production
usermod -aG clamav fieldgrid-production
useradd --system --user-group --create-home --home-dir /var/lib/fieldgrid-production-runner --shell /bin/bash fieldgrid-production-runner
install -d -o root -g root -m 0711 /opt/fieldgrid/production
install -d -o fieldgrid-production-runner -g fieldgrid-production-runner -m 0700 /opt/fieldgrid/production/incoming
install -d -o root -g fieldgrid-production -m 0750 /opt/fieldgrid/production/releases /opt/fieldgrid/production/shared
install -d -o root -g root -m 0700 /opt/fieldgrid/production/backups
install -o root -g fieldgrid-production -m 0640 /dev/null /opt/fieldgrid/production/shared/runtime.env
install -o root -g root -m 0755 deploy/fieldgrid-install-production-release /usr/local/sbin/fieldgrid-install-production-release
install -o root -g root -m 0755 deploy/fieldgrid-install-staging-release /usr/local/sbin/fieldgrid-install-staging-release
install -o root -g root -m 0440 deploy/fieldgrid-production-runner.sudoers /etc/sudoers.d/fieldgrid-production-runner
visudo -cf /etc/sudoers.d/fieldgrid-production-runner
install -o root -g root -m 0644 deploy/fieldgrid@.service /etc/systemd/system/fieldgrid@production.service
install -o root -g root -m 0644 deploy/fieldgrid-worker@.service /etc/systemd/system/fieldgrid-worker@production.service
install -o root -g root -m 0644 deploy/fieldgrid-worker@.timer /etc/systemd/system/fieldgrid-worker@production.timer
install -d -o root -g root -m 0755 /etc/systemd/system/fieldgrid@production.service.d /etc/systemd/system/fieldgrid-worker@production.service.d
install -o root -g root -m 0644 deploy/fieldgrid@production.service.d/identity.conf /etc/systemd/system/fieldgrid@production.service.d/identity.conf
install -o root -g root -m 0644 deploy/fieldgrid-worker@production.service.d/identity.conf /etc/systemd/system/fieldgrid-worker@production.service.d/identity.conf
systemctl daemon-reload
```

Dit is eenmalige inrichting: voer `useradd` en de lege runtime-placeholder niet
opnieuw uit op een bestaande productie-installatie. De placeholder maakt de
root-contractcontrole vóór de eerste release mogelijk; de broker vervangt hem
met de geattesteerde runtime. Start web/worker pas na de eerste gezonde activatie.
De runtimegebruiker heeft uitsluitend de eigen groep en `clamav`; de runner
uitsluitend zijn eigen groep. Geen Docker-, sudo-, runtime- of scannergroep
toevoegen. Een aparte runnerinstallatie krijgt alleen label `fieldgrid-production`;
zijn systemd-userdrop-in gebruikt `deploy/fieldgrid-production-runner-user.conf`.
Bind hem aan alleen dit repository/deploymentpad en geef nooit staginglabels mee.
De gereviewde stagingbroker krijgt uitsluitend de extra weigering van het nieuwe
productieproject; stagingpaden, service, providercredentials en runtime blijven
gelijk. Installeer deze guard vóór de eerste productieactivatie.

Gebruik de bestaande root-only `/etc/fieldgrid` en gecontroleerde GitHub trustroot;
maak een **nieuw** productie-encryptiepaar, zonder stagingcert/key te wijzigen:

```sh
umask 077
openssl req -x509 -newkey rsa:3072 -nodes -sha256 -days 365 \
  -subj '/CN=Fieldgrid V1 production handoff' \
  -keyout /etc/fieldgrid/production-handoff.key \
  -out /etc/fieldgrid/production-handoff.crt
chmod 0600 /etc/fieldgrid/production-handoff.key
chmod 0644 /etc/fieldgrid/production-handoff.crt
```

Voeg uitsluitend base64 van het **publieke** certificaat rechtstreeks toe als
`PRODUCTION_HANDOFF_ENCRYPTION_CERT_B64`. De private key blijft root-only op de
VPS. Controleer expiratie en regel rotatie vóór het jaarlijkse verlopen.
De gedeelde GitHub-trustroot blijft root:root 0644, parent root:root 0700.
VPS heeft PostgreSQL `pg_restore` 17+, Node 24.7+, recente `gh` met attestation
verification, Python, OpenSSL, tar, flock en de reeds geaccepteerde ClamAV nodig.

Voer `bash scripts/check-production-root-contract.sh` als root uit. Deze controle
toont geen secrets, controleert de scanner en bewijst dat beide runtimeaccounts
en beide runners elkaars beschermde directories niet kunnen benaderen. Voer
`check-production-runner-contract.sh` daarna als de nieuwe runner uit met de vaste
DEPLOY_TARGET/root/service/scannerwaarden. Dit is ook de workflow-preflight.
De hierboven geïnstalleerde `fieldgrid-worker@production.timer` moet geladen
zijn, maar wacht met starten tot runtime en health van de eerste release
gecontroleerd zijn. Controleer met `systemctl show` uitsluitend de unitmetadata,
niet de inhoud van `runtime.env`; beide productie-services moeten verwijzen naar
`/opt/fieldgrid/production/shared/runtime.env` en als werkmap
`/opt/fieldgrid/production/current` gebruiken.

## 4. DNS, TLS en providers

Laat `fieldgrid.nl` en `*.fieldgrid.nl` naar de gekozen VPS wijzen. Controleer
eventuele AAAA-records en bestaande sites vóór wijziging. Vervang de bestaande
productieblokken voor de basis- en wildcardhost door de routing uit
`deploy/Caddyfile.production.example`: één proxy naar `127.0.0.1:3302` voor alle
paden. Verwijder hun oude redirects, matchers en conditionele legacyhandlers;
alleen een extra proxy toevoegen laat eerdere handlers actief. Maak geen
dubbele siteadressen aan.

Behoud de bestaande TLS-/DNS-directives, TLS-snippets en door de operator
beheerde DNS-providerkey voor wildcardcertificaten. Behoud ook overige sites en
alle specifieke stagingblokken en imports die naar 3301 wijzen. Voeg geen tweede
stagingwildcard toe wanneer die al via een import bestaat. Valideer de volledige
Caddyconfiguratie met de serviceomgeving, zonder providerwaarden te tonen, en
reload via de bestaande service. Bewijs daarna beide productieorigins en beide
staginghealthchecks zonder redirects, met de exacte verwachte SHA.

Gebruik de uitgestelde `>Referrer-Policy "no-referrer"` uit het voorbeeld om de
header na de upstreamresponse te overschrijven. Een onmiddellijke proxyheader
kan samen met de applicatieheader twee waarden opleveren; de controle van de
authenticatieredirect vereist precies één `no-referrer`.

Verifieer SendGrid-productieafzender, SPF/DKIM en gewenste DMARC-policy, gebruik
een eigen Mail Send-key. Stel signed Event Webhook in op
`https://fieldgrid.nl/api/email/events` en de bijbehorende publieke key in
Environment production. Templates en afzenderbranding blijven tenantinstellingen.
Stel de productie-Mollie-integratie in en verifieer de tenant-merchantkoppeling;
de webhook is `https://fieldgrid.nl/api/mollie/webhook`. Livebetalingstest alleen
bewust met de echte eigenaar en echte factuur, met bedragcontrole vooraf.
Een browserreturn markeert nooit zelf een factuur betaald.

Na gezonde activatie en tenantaanmaak: voer **Inspect or bind an explicit
production Mollie merchant** handmatig uit op branch `production`. Geef de
actieve tenant-slug en het door de Mollie-eigenaar gecontroleerde live-profiel-ID
(`pfl_…`) op. Begin met `inspect`; kies vervolgens bewust `bind` voor precies
deze tenant en ontvanger. De workflow vergelijkt het opgegeven ID met het
geauthenticeerde Mollie-profiel vóór databasebinding en weigert een afwijkende
bestaande koppeling. Zij verstuurt geen mail en maakt geen betaling of testfactuur.
Er is geen algemene backofficeknop die een globale key automatisch aan tenants
koppelt. Bestaande klant-/factuurrechten en betaalverwerking blijven leidend.

## 5. Promotie en eerste ingebruikname

1. Merge de gereviewde productie-infrastructuurwijziging naar `main`; wacht op
   de volledige groene CI. Promoveer diezelfde SHA naar staging en wacht op alle
   checks. De geaccepteerde functionaliteit blijft de V1-basis; infrastructuur-
   ondersteuning vereist haar eigen exacte geteste release-SHA.
2. Vul `ACCEPTED_RELEASE_SHA` met die SHA en promoveer expliciet naar de nieuwe
   branch `production`. De workflow controleert het branch-tip, main-ancestry,
   main-CI en geslaagde stagingworkflow voor dezelfde SHA. Gebruik geen forcepush.
3. Hosted prepare controleert config/history, bouwt, maakt en valideert een backup,
   past voorwaartse migraties toe en versleutelt/attesteert de handoff. Geen
   productiecredentials op de VPS-runner. Brokerverificatie vindt root-only plaats.
4. Controleer de exacte productiehealth na activatie. Maak daarna de webservice
   rebootbestendig met `systemctl enable fieldgrid@production.service` en start
   de worker als operator met `systemctl enable --now fieldgrid-worker@production.timer`.
   Controleer voor beide units `systemctl is-enabled` en `systemctl is-active`.
   De workeracceptatie observeert een verse
   succesvolle batch ná webactivatie; zij installeert/start geen hostservices.
5. Voer **Bootstrap production platform administrator** op branch `production`
   uit. De workflow vereist eerst de gezonde exacte release, maakt één
   emailconfirmed account en platformbinding en stelt geen wachtwoord in.
   Activeer de Auth-emailhook en log daarna via verse OTP in op `/platform`.
6. Maak de echte Veele-tenant (`veele-services`) actief aan met echte branding,
   afzender, modules, management- en portaaltoegangen. Er wordt geen stagingtenant
   automatisch gekopieerd. Controleer de marketingroot en drie portal-logins.
7. De finale read-only websiteacceptatie vereist die actieve Veele-tenant. Bij de
   eerste lege database kan die job vóór tenantaanmaak falen. Rond bootstrap en
   tenantconfiguratie af en herhaal uitsluitend de gefaalde acceptatiejob;
   heractiveer nooit dezelfde brokerhandoff. Elke volgende deploy vereist dezelfde
   publieke checks. Gezonde webactivatie alleen is nog geen operationele vrijgave.

Controleer op desktop en mobiel: publieke 28 marketingroutes, OTP-branding/mail,
management-/personeels-/klanttoegang, accountgebonden uitleg, objectloos intake,
adres/coördinaten, planningsdag, dossieracties, factuur-PDF en tenantbetaalinstellingen.
Een geslaagde workflow bewijst geen inboxbezorging of fysieke mobiele push.

## 6. Herstel en operationele vrijgave

Bij de eerste productieactivatie op 8 oktober 2026 was release
`2c58f6f7ff8874dea526a18be90bd80161a93e86` al door de broker geactiveerd toen de
publieke controle op oude Caddyrouting vastliep. Bij zo'n proxyfout: herstel alleen
de operatorconfiguratie en verifieer de actieve exacte publieke health en de
read-only authenticatie- en workercontroles. Herhaal geen handoff of brokerjob
voor een al geactiveerde release. Rond daarna bootstrap en de echte tenantaanmaak
af; de read-only websitecontrole kan pas met die actieve tenant slagen. Hervat
deze controles afzonderlijk, zonder de deployjob opnieuw te activeren.

Root-only premigratiebackups blijven per SHA onder `backups`; de tijdelijke
GitHub-handoff bevat uitsluitend versleutelde dumps en verloopt na één dag.
Leg een afzonderlijke versleutelde offsitebackup, retentie, verantwoordelijk
operator en hersteldoelen vast. Voer een restoreoefening uit naar een afzonderlijk
herstelproject en controleer migratiegeschiedenis en dataconsistentie. Test deze
zonder productie te overschrijven of uitgaande mail/betalingen te activeren.
Dit runbook heeft geen restore uitgevoerd en claimt geen RPO/RTO-bewijs.

Bij gefaalde activatie blijft de nieuwe kandidaat beschikbaar voor diagnose.
Na forward-only migraties wordt oudere code niet automatisch teruggezet. Een
correctie is een nieuwe gereviewde release, of een expliciete operatorrestore
na compatibiliteitsbeoordeling. Monitor beide exacte health-SHAs, workerfalen,
scannerdefinities, providerfouten, schijf/RAM en backup-/certificaatverval.
