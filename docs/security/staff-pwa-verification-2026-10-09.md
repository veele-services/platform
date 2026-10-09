# Personeelsapp als PWA — 9 oktober 2026

## Publieke presentatie, huidige host en bestanden

`/staff/manifest.webmanifest` is dynamisch en krijgt alleen een presentatie-identiteit
van de host die de bestaande proxy heeft gevalideerd. De proxy overschrijft
inkomende tenant-, host- en paginasignalen. Canonieke wildcardhosts en daadwerkelijk
actieve custom werkruimtedomeinen behouden dezelfde resolver; onbekende, inactieve,
misvormde en nog niet geactiveerde domeinen geven geen andere tenant terug.

De manifest- en beeldroutes staan exact op de publieke presentatie-allowlist.
Andere `/staff`-routes blijven een live gebruiker en hun bestaande personeelsbinding
vereisen. `tenantId`, URL, Storage-pad of afmetingen zijn geen browsergestuurde
selector. De manifeste JSON bevat geen accounts, rollen, instellingen, interne
tenant-ID of Storage-pad.

Zonder actuele `white_label_enabled=true` blijven naam, iconen, achtergrond en
splash van Fieldgrid, onafhankelijk van het ingestelde tenantlogo. Met de actuele
entitlement gebruikt de app de tenantnaam en het huidige logo. Geen logo betekent
een gegenereerd tenantinitiaal als bruikbare fallback. Alleen een intern pad onder
dezelfde tenant wordt geaccepteerd. Bestaande `readScannedFile` controleert actuele
bestandsstaat, MIME, byte-aantal, scanreceipt en de werkelijke SHA; historische
bestanden hebben geen vrijstelling. PNG/JPEG/WebP, maximaal 2 MB, 4096 pixels per
zijde en 16 miljoen pixels, een stilstaand beeld en een correcte decoder worden
opnieuw getoetst voordat een PNG wordt geproduceerd.

De twee bestaande directe logo-uploadacties in de tenant- en platformbackoffice
gebruiken nu dezelfde gedeelde beeldgrenzen als de actuele huisstijlactie en PWA.
Echte Sharp-metadata, containercontrole op animatie en volledige pixeldecodering
via `stats()` vinden plaats vóór scanner, Storage of koppeling van het logo.
Ook een sterk gecomprimeerde 4097×1-afbeelding, meer dan 16 miljoen pixels,
afgebroken beelddata of een vervalst MIME wordt zo geweigerd vóór bijwerkingen.
De bestaande toegangscontrole, actuele platformidentiteit na upload,
tenantgebonden onveranderlijk pad en scannerpublicatie blijven gelijk.
`uploadScannedFile` controleert de actuele uploadbevoegdheid vóór en na scannen
en na Storage-I/O; de werkelijke opgeslagen bytes en versiegebonden scanreceipt
blijven leidend. De afzonderlijke moderne huisstijlactie behoudt haar bestaande
versiecontrole/CAS; deze aansluiting wijzigt geen DB-, RLS- of Storagegrant.

Na Storage-, scan- en decoder-I/O wordt opnieuw dezelfde actieve hosttenant,
white-label-entitlement, logo-pad en identiteit geladen. Wijziging of intrekking
geeft geen bytes terug. Fieldgrid-afbeeldingen komen uitsluitend uit vaste
repositorybestanden; er is geen externe fetch of SSRF-pad. Zowel manifest als
dynamische PNG gebruiken `private, no-store` en `nosniff`. De image-route kent
alleen vier iconformaten, de Apple180 en vast opgesomde startupformaten. Het
grootste formaat is 2732×2048. Maximaal vier renderverzoeken tegelijk per
applicatieproces begrenzen geheugen-/decoderwerk; daarboven volgt 429 met
`Retry-After: 2`, ook na fouten wordt capaciteit vrijgegeven.

## Installatie en splash

De stabiele manifest-ID en start-URL zijn `/staff`; de standaardweergave is
`standalone`. De scope is bewust `/`: de bestaande gedeelde `/login` en
`/auth/verify` blijven zo in het geïnstalleerde venster bij herauthenticatie.
Scope verleent geen toegang en verandert geen data-, rol- of sessiegrens.
Android krijgt echte PNG192/512 en afzonderlijke maskable iconen. Dynamische
tenanticonen blijven met hun volledige logo in de centrale veilige cirkel en
worden niet afgesneden. De Apple metadata verwijzen naar PNG180 en vaste
portrait-/landscape-startupbeelden voor de opgenomen iPhone-/iPad-schermformaten.
Android genereert zijn opstartscherm uit manifestidentiteit, icoon en achtergrond.

De personeelslogin (`next=/staff` of een geldig personeels-subpad) krijgt dezelfde
manifest-, Apple- en theme-metadata; gewone platform-/tenantlogin behoudt de eigen
presentatie. De geïnstalleerde Next 16-renderer geeft via `appleWebApp.capable`
het moderne `mobile-web-app-capable` weer; voor oudere Apple-versies wordt
tegelijk expliciet `apple-mobile-web-app-capable=yes` toegevoegd, naast de
Apple-titel, touchiconen en startupbeelden. Dit wijzigt geen tenant- of sessieguard.
De personeelsvenstertitel en personeelslogin gebruiken een absolute titel met
dezelfde hostnamegebonden PWA-identiteit. Zo krijgt white-label geen geërfde
Fieldgrid-titel; de titel is normale ge-escapete metadata, geen HTML of
tenantselector. De gewone login houdt zijn bestaande titel.
Metadata kan door een reeds geïnstalleerde browser/OS tijdelijk
worden bewaard; icon-/brandingwijziging kan daarom een herinstallatie vergen.
Safari biedt geen `beforeinstallprompt` zoals Chromium: installatie loopt daar
via Delen → Zet op beginscherm. De begeleide clientflow maakt dit verschil zichtbaar.
Fysieke Samsung-/iPhone-installatie en OS-splash zijn een aparte apparaatcontrole,
geen uitkomst van gesimuleerde browser- of servertests.

## Service worker

De bestaande globale pushworker en veilige same-origin notificatiedoelen blijven
bestaan. Het nieuwe shellcache bevat uitsluitend generiek offline HTML en vaste
Fieldgrid-merkbestanden. Geen tenantmanifest, huidig tenantlogo, API, sessie,
OTP-pagina, RSC of beveiligde werkruimte wordt opgeslagen. Alleen dezelfde vier
vaste shellbestanden op de eigen origin worden uit het shellcache gelezen, zodat
het offline-logo ook zonder netwerk zichtbaar blijft. Navigaties gebruiken het
netwerk; alleen een echte netwerkfout geeft de generieke offlinepagina. Deze geeft
geen oude planning of accountinhoud terug. Activatie verwijdert alleen oudere
Fieldgrid-shellcaches en laat ongerelateerde applicatiecaches staan. Workerupdates
gebruiken een `no-cache, no-store, must-revalidate` HTTP-contract.
De offlineherhaalactie gebruikt een native GET-formulier naar de huidige
same-origin pagina. Er is geen inline onclick of script nodig: de bestaande
Content Security Policy blijft intact en wordt niet verruimd om offline retry
te laten werken. De actie maakt geen statusmutatie en leest geen lokaal
bewaarde privégegevens.

## Gerichte regressies en bronreview

### Installatiekeuzes en accountbinding

De server leidt de sleutel voor de installatievoorkeur af uit de actuele
tenant/gebruiker-combinatie met SHA-256. De herinneringsmarker is de bestaande
geverifieerde, opaque browsersessiehash: een reload of tokenrefresh is geen
nieuwe login. De voorkeur bevat alleen presentatiestatus, geen token,
e-mailadres, adres, personeelsinhoud, rol of serverautorisatie. Voltooien van de
onboarding opent het aanbod uitsluitend na een werkelijk geslaagde, versiegebonden
serveropslag. De eerste volgende afzonderlijke login verbruikt de herinnering
vóór weergave; latere sessies openen geen automatisch aanbod meer.

Web Locks serialiseren lezen/verbruiken van de herinnering tussen gelijktijdige
tabbladen. Een storage-event sluit een elders verbruikte herinnering ook zonder
Web Locks. De bestaande accountsessiefence en actuele RPC-controles blijven
leidend bij uitloggen, accountwisseling of intrekking. Installatie blijft via
instellingen beschikbaar. Beperkte opslag gebruikt een documentgebonden
geheugenfallback; gewiste/geweigerde browseropslag kan geen blijvende voorkeur
over nieuwe documenten garanderen.

De rootclient vangt het eenmalige native browserevent ook tijdens de
personeels-OTP-login op, maar opent nooit zelfstandig een native prompt. De
installatieknop roept dit event synchronisch vanuit de klik aan; voor iOS en
andere browsers zonder event wordt een echte browsermenustap uitgelegd.
De loginquery gebruikt dezelfde `isStaffLoginDestination`-normalisatie als de
servermetadata; padtraversal/backslashes kunnen geen andere login als
personeelspresentatie classificeren. Standalone/appinstalled verbruiken volgende
automatische aanbiedingen.

De aanvullende logo's op geen-toegang-, fout- en 404-schermen verwijzen alleen
naar hetzelfde vaste Fieldgrid-asset. Ze lezen geen tenant-/accountbron, voegen
geen fallbacktenant toe en tonen geen ruwe errorinhoud. De no-access-context
blijft de bestaande servercontext; uitloggen behoudt zijn bestaande route.

Bronreview: `app/layout.tsx`, `app/staff/page.tsx`,
`components/fieldgrid/staff/pwa-browser-events.tsx`,
`components/fieldgrid/staff/pwa-install.tsx`, `lib/pwa/install-model.ts`,
`lib/auth/browser-session.ts`,
`components/fieldgrid/notifications/account-boundary.tsx`.

### Persoonlijke voorkeuren zonder inboxrecht

De voorkeurenpagina vereist een actuele workspace-actor, onafhankelijk van een
inboxgrant `read_own`. Dit volgt het bestaande databasecontract: voorkeuren lezen
en bewaren controleren vóór hun branch een actuele Auth-sessie, actieve account,
tenant en exacte personeels-/klant-/platformrelatie. De rijen zijn uitsluitend
van `auth.uid()` binnen die tenant en context. Bewaren behoudt versiecontrole,
CAS en bestaande kanaal-/beleidssuppressie. Inbox-, detail-, lezen- en archiefacties
vereisen hun afzonderlijke grant. De interfacewijziging maakt geen grant aan en
herstelt geen ingetrokken inboxtoegang. Er wijzigt geen SQL, RLS, Auth,
entitlement of directe Storagegrant.

Bronreview: `components/fieldgrid/notifications/routes.tsx`,
`lib/notifications/auth.ts`, `lib/notifications/data.ts`,
`supabase/migrations/20260930212610_central_notifications.sql`,
`supabase/migrations/20261001082702_release_notification_boundaries.sql`,
`supabase/migrations/20261005059100_customer_notification_verified_identity.sql`.

### Gerichte controles

`lib/pwa/staff.test.ts` toetst identiteit zonder/met actuele entitlement,
platform zonder tenantquery, ontbrekende/onjuiste proxy-signalen, ontbrekende
tenant of instellingen, queryoutage zonder fallback, vreemd logopad zonder
Storage-read, werkelijk gerenderde PNGpixels en dimensies, scanner/MIME/bytegrenzen,
intrekking/logo-wisseling tijdens I/O, ontoelaatbare assetnamen vóór lookup,
behoud van auth voor niet-toegestane routes en gelijktijdige renderbegrenzing.
`lib/tenancy/proxy-boundary.test.ts` toetst de live hostnamecontrole en
overschreven signalen juist voor de publieke PWA-routes. De marketingroutingtest
voorkomt dat PWA- of `/branding`-bestanden als marketing HTML worden behandeld.
`lib/notifications/service-worker.test.ts` toetst offlinecache-allowlist,
network-only beschermde navigaties, ongemoeid gelaten API/RSC/assets,
veilige notificatieiconen en de bestaande push-/click-doelgrenzen.
`lib/pwa/install-model.test.ts` toetst onboarding, een nieuwe echte sessie,
geen herhaling bij reload/latere login, standalone en ongeldige opslagvormen.
`tests/e2e/staff-settings.spec.ts` toetst bereikbaar/bewaarbaar blijven van eigen
voorkeuren zonder inboxgrant, behoud van de personeelschil en daadwerkelijk
gesloten inbox, zonder herstelde grant.

De definitieve lokale gerichte batch slaagde met 103 unitcontroles over zeven
bestanden: PWA server/beelden, installatievoorkeuren, hostnameproxy,
serviceworker, marketingrouting, veilige personeelsloginbestemming en het
gedeelde merkcomponent. De geïsoleerde database-notificatietests
slaagden met alle 12 controles, waaronder actuele
sessie, intrekking, eigen voorkeuren en geweigerde raw mutatie. Aanvullende
definitieve unit/browserchecks en exacte deployacceptatie worden afzonderlijk
door de release-integrator vastgelegd. Dit bronreviewbewijs is geen claim van
fysieke Samsung-/iPhone-installatie of hosted-provideracceptatie.

De volledige lokale broncontrole slaagde: lint, TypeScript, 1.843 unitcontroles
over 184 bestanden en de productiebuild. Twaalf gerichte Chromium-browsergevallen
toetsen de opgeslagen onboarding vóór de installatievraag, overslaan en precies
één volgende loginherinnering, stille herlaad-/realtimebezoeken, latere installatie
via instellingen, native click-activatie en annuleren, iOS-instructies,
standalone-detectie, accountisolatie, persoonlijke voorkeuren zonder inboxgrant
en daadwerkelijk via de tenant-host opgehaalde manifest-/PNG-/Apple-assets.
De echte serviceworker is ook offline gecontroleerd: uitsluitend openbare
bestanden in de cache, geladen logo, geen oude werkgegevens en herstel via de
native GET-knop zodra het netwerk terug is. Vier aanvullende controles met de
werkelijke WebKit 26.6-engine slaagden voor de loginherinnering, iOS-instructies,
standalone-detectie en manifest-/Apple-assets; dit is geen fysieke iOS-installatie.
De white-labelfixture gebruikt echte actuele ClamAV-definities en controleert
de resulterende scanreceipt; de veiligheidsgrens wordt niet omzeild.

De aanvullende logo-uploadbatch slaagde met 101 controles over vijf bestanden.
`lib/branding/logo-upload-actions.test.ts` gebruikt werkelijk gedecodeerde
PNG/JPEG/WebP voor beide bestaande acties en toetst afmetingen, pixels, animatie,
truncatie, MIME, bytegrens, bevoegdheid, scannerfout en intrekking van de
platformidentiteit vóór de uiteindelijke koppeling. De echte decoder wordt
niet vervangen; bestaande huisstijl-, PWA- en scannerpublicatietests blijven
onderdeel van deze gerichte batch.

Na bronreview zijn de metadata en fingerprintgebonden authorization ledger
bijgewerkt voor exact veertien veranderde oppervlakken, waaronder vier nieuwe
server-entrypoints. De 1100 ongewijzigde reviews behouden hun fingerprint en
bewijs; alle 1114 oppervlakken hebben een afgeronde status. De reproduceerbare
metadata- en ledgercheck slaagden lokaal. Alle bestaande DB/RLS/RPC-grants,
scanner- en sessiegrenzen blijven gelijk; deze wijziging voegt geen migratie of
credential toe.

Primaire documentatie: [Next geïnstalleerde PWA-handleiding](../../../node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md),
[Apple icon-/launchscreenmetadata](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html),
[Chromium manifestvereisten](https://developer.chrome.com/docs/lighthouse/pwa/installable-manifest),
[manifest scope](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/scope).
