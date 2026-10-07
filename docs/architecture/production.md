# Fieldgrid V1 productie

Deze specificatie volgt op de expliciete V1-acceptatie van 7 oktober 2026.
De eigenaar bevestigde `fieldgrid.nl` en `veele-services.fieldgrid.nl`, dezelfde
VPS als staging en een nieuw, afzonderlijk Supabaseproject dat wordt aangemaakt.
De [stagingarchitectuur](staging.md) blijft ongewijzigd voor staging.

## Vast contract

| Onderdeel | Productie |
| --- | --- |
| Platform | `https://fieldgrid.nl` |
| Tenant | `https://{slug}.fieldgrid.nl` |
| Veele publieke website | `https://veele-services.fieldgrid.nl/` |
| Werkruimtes | `/platform` op platformhost; `/app`, `/staff`, `/klant` op tenanthost |
| Proces | `127.0.0.1:3302`, nooit een publieke Node-poort |
| Releases en configuratie | `/opt/fieldgrid/production/{releases,shared,incoming,backups}` en atomair `current` |
| Webservice | `fieldgrid@production.service` |
| Worker | `fieldgrid-worker@production.service` en `fieldgrid-worker@production.timer` |
| Runtimegebruiker/groep | `fieldgrid-production` |
| Runnergebruiker/groep | `fieldgrid-production-runner`, exclusief label `fieldgrid-production` |
| Configuratiebron | GitHub Environment `production` |
| Promotiebranch | `production`; uitsluitend een expliciet gepromoveerde, gecontroleerde `main`-SHA |
| Applicatie-identiteit | `APP_ENV=production`, `DEPLOY_TARGET=production`, `NODE_ENV=production` |

Tenantselectie gebeurt uitsluitend via de hostname. Een onbekende, inactieve of
ongeldige tenant faalt gesloten; er is geen fallbacktenant. De Veele-root toont
de geaccepteerde marketingwebsite. Portalen behouden dezelfde oorsprong en routes.
Productiepagina's mogen worden geïndexeerd; staging behoudt zijn noindexbeleid.

## Isolatie op dezelfde VPS

Staging behoudt poort 3301, zijn runtimegebruiker `fieldgrid`, runner
`fieldgrid-runner`, deployroot en sleutels. Productie gebruikt eigen accounts,
releases, environmentbestand, encryptiecertificaat en privésleutel. Geen van de
runners is lid van een runtimegroep of `clamav`; geen runner kan plaintext
runtimeconfiguratie, backups of de scanner benaderen. De runtimeaccounts kunnen
elkaars configuratie niet lezen. De productiedrop-ins vervangen expliciet User en
Group van de gedeelde systemdtemplates; staging wordt hierdoor niet aangepast.

De bestaande root-beheerde ClamAV-daemon en definities mogen worden gedeeld.
Alleen web-runtimeaccounts krijgen de aanvullende groep `clamav`. De scanner
bevat geen tenant-, provider- of databasecredentials. Zijn socket blijft
`/run/clamav/clamd.ctl`, met de reeds vastgelegde scannerpermissies.
Een gedeelde VPS geeft geen beschikbaarheidsisolatie: capaciteit, monitoring en
beveiligingsupdates gelden voor beide omgevingen.

De deployroot is root:root 0711; incoming is production-runner:production-runner
0700; shared/releases zijn root:fieldgrid-production 0750; runtime.env is
root:fieldgrid-production 0640; backups zijn uitsluitend root toegankelijk.
Operatorinstallatie van accounts, runner, Caddy en systemd blijft een bewuste
hosthandeling volgens het productierunbook.

## Supabase en providers

Productie start met een nieuw leeg V1-Supabaseproject. De verwachte ref moet
expliciet zijn ingevuld en overeenkomen met zowel publieke/server-API-URL als
alle databaseverbindingen. De stagingref (`STAGING_SUPABASE_PROJECT_REF`) en de
legacyref `ckdtiuemeygrnujjibnw` zijn verboden productiedoelen. Migratie en backup
gebruiken direct/session-poort 5432; transactiemodus 6543 is alleen toegestaan
voor de afzonderlijke runtimeverbinding. Queryparameters mogen de identiteit van
een verbinding niet vervangen. TLS controleert CA en hostname.

Geen stagingdata, Auth-accounts, uitnodigingen of betalingen worden overgenomen.
De operator bootstrapt één OTP-platformbeheerder en maakt daarna de echte Veele
tenant, branding en toegangen aan. Marketingpublicatie vereist een actieve Veele
tenant; de hostname alleen maakt deze niet aan.

Productie krijgt eigen SendGrid-credentials en webhookverificatie, Auth Send
Email Hook-secret, VAPID-paar, server-action AES-key en worker-secret. Mollie
gebruikt een `live_`-key plus een door de tenantbeheerder gecontroleerde
merchantkoppeling. Activatie van livebetalingen is een afzonderlijke provider-
en tenantconfiguratiestap; een omgevingskey verleent geen klanttoegang en bewijst
geen webhookbetaling. Onlinebetalingen blijven afhangen van de bestaande
tenantinstellingen en providerbevestiging. Google Routes en marketingmail blijven
uitgeschakeld in de eerste productiefase; openrouteservice gebruikt een eigen key.

## Releasecontract

`main` deployt nooit automatisch. Na review en volledige CI wordt een SHA eerst
op staging gecontroleerd. De eigenaar/operator legt die exacte SHA als
`ACCEPTED_RELEASE_SHA` in Environment `production` vast en promoveert hem expliciet
naar `production`. De productiebranch is de enige toegestane deploymentbranch.
De productieworkflow verifieert deze acceptatie, main-ancestry en een geslaagde
stagingdeploy voor dezelfde SHA voordat productiecredentials worden gebruikt.

Alle checks draaien opnieuw met geïsoleerde CI-fixtures. De productiebuild wordt
gemaakt van dezelfde source-SHA, met eigen publieke Supabaseconfiguratie: Next.js
bakt deze waarden in, dus het stagingartefact mag niet worden hergebruikt.
Vóór migraties worden hostcontract, databasegeschiedenis, build en backup
gecontroleerd. Alleen voorwaartse, inhoudelijk gecontroleerde V1-migraties mogen
worden toegepast. Geen demoseed of testfixtures in de productiedatabase.

De hosted builder versleutelt runtime en premigratiebackup met het eigen publieke
productiecertificaat en attesteert deze bestanden plus de release. De vaste,
root-beheerde productiebroker vertrouwt uitsluitend hosted GitHub-attestaties
van dit repository, de productieworkflow, `refs/heads/production`, exacte SHA en
recente handoff. Hij ontsleutelt root-only, valideert de vaste identiteit,
weigert replay en activeert de release atomair. De runner krijgt uitsluitend
sudo voor die ene broker zonder argumenten.

Acceptatie vereist HTTP 200, `environment=production`, `status=ok`, exacte SHA,
database/scanner ready en een succesvolle workeruitvoering gestart na de actuele
webactivatie. Publieke verificatie gebruikt alleen leesacties. Provider-OTP en
livebetalingen blijven concrete operatorchecks met echte accounts; er wordt
geen livebetaling automatisch gestart door deployment.

Na voorwaartse migratie is een automatische code- of databaserollback verboden.
Een herstelbesluit vereist compatibiliteitscontrole en een geteste restore naar
een afzonderlijk project; geef voorkeur aan een gereviewde voorwaartse reparatie.
Backupretentie buiten de VPS en een restoreoefening worden vóór operationele
vrijgave vastgelegd. Een groen deployment bewijst geen herstelbaarheid.
