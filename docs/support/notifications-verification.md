# Notificaties — verificatie en vrijgave

Status, 1 oktober 2026: lokale eindverificatie geslaagd. **NO-GO voor commit, push en stagingdeploy**
zolang de vereiste staging-scannerconfiguratie van de gezamenlijk gewijzigde
Tickets & Support-module ontbreekt. Geen remote migratie of productieactie
uitgevoerd; de basisrelease blijft `74966d8c250536466e6e1e988ef114ff6207a000`.

Het [implementatiecontract](../architecture/notifications.md) beschrijft
bronnen, eigenaarschap, privacy, beleid en compatibiliteit. De bestaande
[ticketvrijgavevoorwaarden](tickets-release-runbook.md) blijven gelden.

## Bewijsgrenzen

De databasecontroles gebruiken echte lokale PostgreSQL-, RLS- en RPC-opslag,
geen nagebootste autorisatie. De browsercontroles gebruiken de gebouwde
standalone-applicatie en herkenbare fictieve tenants/personen. Werkelijke
SendGrid-runtimecode stuurt uitsluitend naar een lokale HTTP-testmailbox.
Provideracceptatie is geen bewijs van aflevering aan een echte ontvanger.

De pushcontroles toetsen account, sessie, origin, context, bindinggeneratie,
intrekking, meerdere apparaten, TTL, retries en veilige inhoud. Ze bewijzen
geen zichtbare ontvangst op een fysiek Android-/desktop- of iOS-apparaat.
Die acceptatie is na uitrol nodig, met beheerde testaccounts.

## Concrete implementatiepunten

| Onderdeel | Bron in deze repository |
| --- | --- |
| Catalogus, beleid, campagne, inbox, autorisatie en bronadapters | `supabase/migrations/20260930212610_central_notifications.sql` |
| Aanvullende afleveruitkomsten zonder bestaande historie te wijzigen | `supabase/migrations/20260930212609_notification_delivery_states.sql` |
| Gewone providergrens en veilige ontvangstregistratie | `lib/notifications/provider-policy.ts`, `lib/providers/sendgrid.ts` |
| Centrale afleverworker en uitgestelde documentmails | `lib/notifications/worker.ts`, `lib/notifications/deferred-mail.ts`, `app/api/worker/route.ts` |
| Onveranderlijke mailinhoud, template- en logoversies | `lib/notifications/mail-snapshot.ts`, `mail-template.ts`, `brand-asset.ts` |
| Vier omgevingen, inbox, instellingen, campagnes en previews | `components/fieldgrid/notifications/`, `app/notifications/actions.ts` |
| Apparaat-/account-/contextlevenscyclus | `app/api/notifications/push/route.ts`, `lib/notifications/push-device.ts`, `public/sw.js`, `app/auth/signout/route.ts` |
| Bron- en autorisatieregressies | `scripts/test-notifications.mjs`, `test-notification-delivery.mjs`, `test-notification-mail.mjs`, `test-notification-operational.mjs`, `test-notification-permissions.mjs`, `test-notification-policy-ui.mjs` |
| Historische upgrade | `scripts/test-notifications-upgrade.mjs`, verplichte `.github/workflows/_verify.yml` |

Gewone factuur-, offerte-, commerciële en bestaande-accountuitnodigingsmails
passeren dezelfde policygrens. Accountactivatie, inloggen en expliciete
beveiligings-OTP's zijn benoemde uitzonderingen, geen algemene bypass voor
bedrijfsberichten. De oudere SQL-inserts en dossier-/ticketworkerpaden hebben
geen tweede centrale verzendeigenaar meer.

## Verplichte lokale controle

- Lint, gegenereerde TypeScript-types, typecheck, unit en productiebuild.
- Volledige SQL/RLS/RPC-regressies inclusief bestaande commerciële module,
  planning, reistijden, werkbonnen, 360-dossiers en tickets.
- Forward upgrade van de bestaande work-orderbaseline met historische
  handtekening, goedgekeurde uren en factuur-/taakgegevens.
- Forward notification-upgrade met bestaande inbox-ID's, leesmomenten,
  mailclaims, aangepaste templates en oude pushabonnementen; daarna een
  volledig schone lokale migratieketen.
- Beleidsblokkade bij bronregistratie én providergrens, OFF→ON zonder replay,
  rusttijden, bundeling, concurrency, onzekere uitkomsten en exacte retries.
- Vier gebruikersomgevingen, echte campagneopslag, afzonderlijke lees- en
  ontvangstbevestiging, templates, tenantuitzonderingen en payloadgebonden OTP
  voor delegatie. Desktop, tablet, 390 en 320 px met visuele controle.
- Volledige browsersuite; geen verruimde screenshottoleranties of nieuwe
  baselines om regressies te verbergen.

## Uitgevoerde controles — 1 oktober 2026

| Controle | Uitkomst |
| --- | --- |
| ESLint, TypeScript en gegenereerde databasetypes | Geslaagd; types opnieuw opgebouwd uit de schone lokale migratieketen. |
| Unit | 367/367 geslaagd, 50 bestanden. |
| SQL/pgTAP | 231/231 geslaagd, 9 bestanden. |
| Echte database-integratie | 208/208 geslaagd, inclusief alle bestaande module-regressies en de nieuwe notification-/configuratie-only-grensgevallen. |
| Forward work-orderupgrade | Geslaagd vanaf `20260930142326`; historische handtekening, goedgekeurde uren/review en taakprijs behouden. |
| Forward notificatie-upgrade | Geslaagd vanaf `20260930192516`; oorspronkelijke inbox-ID's/leesmomenten, mailsnapshots en tenanttemplates behouden; geen fictieve devicebinding of providerpoging. |
| Schone migratie | Alle migraties vanaf leeg lokaal schema geslaagd; geen remote reset. Tijdelijke SQL-werkbestanden daarna verwijderd, na exacte vergelijking met de canonieke migraties. |
| SQL-lint/advisors | Geen fouten. Twee ongebruikte compatibiliteitsparameters in notification-queryfuncties; bestaande `object_visit_context` STABLE/VOLATILE-waarschuwing. Zes bestaande Object 360-performanceadviezen, geen nieuwe notification-advisorwaarschuwing. |
| Antivirus | Echte lokale ClamAV 1.5.4, definities 28139 van 30 september: EICAR geweigerd, PNG en PDF geaccepteerd. |
| Shell/SW/diff | Shellsyntax, serviceworkersyntax en `git diff --check` geslaagd. Namencontrole voor uitgefaseerde branding/mailprovider schoon. Gerichte credential-markercontrole zonder geheime waarden in uitvoer: geen treffers. |
| Productiebuild en browser | Definitieve standalone-build en volledige suite: 42/42 geslaagd in 4,6 minuten. Inclusief echte lokale opslag, scanner, testmailbox, vier notificatiewerkruimten, campagnebereik, tenantbeleid en versie-/OTP-grenzen. |
| Visuele controle | Werkelijke desktop-, tablet-, 390- en 320-px-schermen gecontroleerd; de definitieve beleidsimpactweergave en mobiele inbox/wizard opnieuw bekeken. Scroll blijft binnen de dialoog of tabel; bediening is bereikbaar. |

De eerste volledige browserhercontrole had 39/40 succesvolle gevallen. De
dossierfixture zette alleen de oude bronklok vooruit en niet het centrale
verzendmoment; die fixture is aangepast. Daarbij is ook een echt productiedefect
hersteld: toekomstige herinneringen mogen niet vóór hun verzenddatum verlopen.
Een afzonderlijke database-regressie bewijst nu zowel de juiste geldigheid als
het ontbreken van een voortijdige providerpoging. Kanaalbereik, veilige
pushpreview, klant-herplanning zonder personeelstoewijzing en herladen van
tenantuitzonderingen hebben eveneens gerichte regressies gekregen.

Een latere parallelle databasehercontrole ontdekte twee onjuiste globale
tel-aannames in fixtures. De mailtest controleert nu beide exacte eigen
mailrecords; de tenantteller wordt alleen bij een onveranderde MVCC-snapshot
exact met de bevoegde RPC-uitkomst vergeleken. Er zijn geen productierechten
verruimd, toleranties toegevoegd of tests overgeslagen. De volledige suite is
daarna met 231 SQL- en 208 integratiecontroles opnieuw geslaagd.

Next.js logde bij enkele afgebroken navigatiestromen `The destination stream
closed early`; de server bleef draaien en alle controles slaagden. De
opzettelijke negatieve toegangsgevallen leverden de verwachte weigering op.
Dit document claimt geen volledig waarschuwingvrije serverlog.

De GitHub-inventaris is op 1 oktober uitsluitend op namen gecontroleerd.
De toen ontbrekende `TICKET_CLAMAV_SOCKET` is achterhaald door het contract van
1 oktober: `CLAMAV_ENABLED` en `CLAMAV_SOCKET` bestaan nu in GitHub Environment
(alleen namen gecontroleerd), en de operator meldt ClamAV geïnstalleerd.
Zie [het huidige scannercontract](../deployment/clamav.md); host-/runtimebewijs
en afronding van de overige releaseonderdelen ontbreken nog. Bestaande
geheimen zijn niet uitgelezen.
Er is geen commit-, push-, workflow- of deployment-SHA voor deze wijziging.

## Externe releasevoorwaarden en acceptatie

1. Operator bevestigt de werkende staging-ClamAV/Freshclam met actuele
   definities en socketrechten uitsluitend voor de runtime. De runner heeft
   een andere UID en geen scannertoegang. `CLAMAV_ENABLED` en `CLAMAV_SOCKET`
   bestaan al in GitHub Environment `staging`; zie het
   [actuele operatorcontract](../deployment/clamav.md). Geen credentials
   kopiëren naar code of lokale `.env`.
2. Na lokale GO: commit op `main`, push en CI voor die exacte SHA. Daarna
   bewuste promotie naar de bestaande `staging`-branch. Geen productionbranch.
3. De bestaande deploygate verifieert scanner, veilige projectrefs, backup,
   migraties, health-SHA en een verse succesvolle workeruitvoering. Een
   gestarte workflow of alleen HTTP 200 is geen geslaagde release.
4. Beheerde testtenant: controleer een gewone SendGrid-mail en vier inboxen;
   zet een kanaal uit, maak een nieuwe brongebeurtenis, zet weer aan en
   bevestig dat de onderdrukte melding niet alsnog wordt verstuurd.
5. Op fysieke testapparaten: expliciet aanmelden, één en meerdere devices,
   ontvangst met app open/gesloten, veilige lockscreeninhoud, deeplink,
   intrekken, uitloggen en accountwissel. Controleer daarnaast de werkelijk
   ondersteunde iOS-beginschermapp. Noteer OS/browser en iedere echte uitkomst;
   gebruik geen browsermock als ontvangstbewijs.
6. Controleer de actuele bevoegdheid na intrekken van medewerker-/klanttoegang.
   Een oude melding of deeplink mag geen dossier opnieuw toegankelijk maken.

Bestaande staging-SendGrid-, VAPID-, Supabase- en workerconfiguratie wordt
hergebruikt. Het notificatiesysteem vereist geen nieuwe providerkey. Deze
controle vraagt niet om bestaande geheimen opnieuw te verstrekken.
