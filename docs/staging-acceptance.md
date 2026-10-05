# Stagingacceptatie Fieldgrid V1

Deze checklist wordt uitgevoerd op de bestaande staging-VPS, met een nieuw leeg
staging-Supabaseproject en afzonderlijke stagingcredentials. Geen enkele stap mag
naar het productieproject of de productie-VPS wijzen.

## Voor de eerste deploy

- GitHub Environment `staging` bevat alle waarden uit de inventaris in de README.
- De stagingrunner is online met het exclusieve label `fieldgrid-staging`.
- DNS en TLS voor de staging-URL wijzen naar de staging-VPS.
- Caddy routeert de staginghost uitsluitend naar de gekozen stagingpoort.
- `fieldgrid@staging.service` en `fieldgrid-worker@staging.timer` zijn geïnstalleerd.
- Het nieuwe staging-Supabaseproject is leeg en heeft nog geen applicatietabellen.
- Supabase Auth heeft de staging Site URL en uitsluitend toegestane staging-redirects.
- Supabase Auth heeft voor alle vier werkruimtes (`/platform`, `/app`, `/staff`
  en `/klant`) Email OTP length `6`, expiry `3600`
  seconden en een provider-side resend-interval van minimaal `60` seconden.
  Het hosted **Magic Link**-sjabloon toont `{{ .Token }}` en bevat geen
  `ConfirmationURL` of zelfgebouwde tokenlink; zie
  [Staging mail hooks](deployment/mail-hooks.md#universele-otp-login-exacte-staging-auth-instelling).
- De eigenaar bevestigde op 5 oktober 2026 dat de Send Email Hook nog **uit** staat.
  Hosted Auth-instellingen en hookactivatie blijven operatorhandelingen; activeer
  de hook pas na geslaagde healthcontrole voor de exacte universele-OTP-release,
  volgens het mail-hookrunbook. Een geslaagde deploy bewijst geen echte mailbezorging.
- De SendGrid-afzender of het afzenderdomein is geverifieerd.
- Mollie gebruikt een `test_`-key; Google Routes is expliciet uitgeschakeld of gebruikt
  een tot staging beperkte serverkey.

## Deploybewijs

- De verplichte CI-run voor de actuele `main`-SHA is volledig groen, inclusief pgTAP,
  database-lint, build en alle verplichte Playwright-flows.
- De stagingdeploy gebruikt exact dezelfde SHA als de geslaagde CI-run.
- De migratiedoelcontrole accepteert alleen een leeg schema of de exacte
  migratiegeschiedenis van de repository.
- De premigratiebackup bestaat en `pg_restore --list` kan hem lezen.
- `/api/healthz?release=<sha>` retourneert `status=ok`,
  `environment=staging`, `database=ready` en de verwachte release-SHA.
- De worker-timer draait en de aparte `worker-acceptance`-job bewijst een geslaagde
  workeruitvoering die na de actuele webactivatie is gestart. Een herhaling van
  deze acceptatiejob voert de releasebroker niet opnieuw uit.

## Eerste platformbeheerder en tenant

- Voer de handmatige workflow **Bootstrap staging platform administrator** eenmaal uit.
- Log in als platformbeheerder, open `/platform` en maak de eerste tenant via
  **Nieuwe tenant** aan. Controleer dat platformbeheer niet stilzwijgend
  tenantlid wordt en dat de gekozen beheerder een uitnodiging ontvangt.
- Controleer dat er geen voorbeeldtenant, voorbeeldklant of hardcoded merkdata bestaat.
- Upload in de platform-backoffice het goedgekeurde tenantlogo en stel kleuren,
  modules, afzendernaam, afzendermail en de vier berichttemplates in.
- Verifieer dat `/app`, `/staff`, offerte-, boekings- en betaalpagina het
  echte tenantlogo en de ingestelde kleuren tonen. Een zichtbare `LOGO`-placeholder
  betekent dat de visuele acceptatie niet is geslaagd.
- Controleer dat een tenantlogo zonder dubbele titel/subtitel wordt getoond, dat
  alle tenantpagina's de ingestelde kleuren gebruiken en dat `Powered by Fieldgrid`
  uitsluitend zichtbaar is zolang **Volledig whitelabel** uitstaat.
- Controleer in de factuur- en offertemail dat de header alleen het logo (of zonder
  logo de tenantnaam) toont en dat de tenantwebsite onderin als HTTPS-link staat.

## Functionele acceptatie

- Open **Personeel → Bekijk**: controleer twaalf dossieronderdelen, URL-tabbladen,
  terugnavigatie en mobiel. Gebruik fictieve testdata voor contract/concept,
  verlenging/addendum, certificaatverificatie/vernieuwing, kwalificatie-eisen over
  de volledige uitvoeringsperiode, documentversies, gesprek/opvolgtaak,
  middelenretour en herhaald aanmaken van dezelfde in-/uitdienstchecklist.
  Controleer **Actie nodig → Opvolgen** en afronden met bewijs.
  Verifieer een in-app reminder en huisstijlmail naar een eigen testmailbox na
  workerverwerking. Lezen/verzenden mag de taak niet afronden. Een personeels-
  portalsessie en andere tenant mogen dossier, versies en private downloads niet
  lezen. Zie het [Personeelsdossier 360-contract](architecture/personnel-dossier-360.md)
  voor autorisatie en ontbrekende integraties. Geen extra GitHub-secret,
  HR-demoseed of handmatige bucketconfiguratie nodig.

- Maak via **Personeel → Nieuwe medewerker** een testmedewerker aan met een eigen
  testmailbox. De wizard legt de uitnodiging uit zonder technische providertermen.
  Controleer dat één uitnodigingsmail via SendGrid aankomt, met tenantlogo (of
  tenantnaam als er geen logo is), kleuren, personeelsnummer en een duidelijke
  uitnodiging voor het **personeelsportaal**. Open de link en accepteer de uitnodiging
  zonder een wachtwoord te kiezen. Controleer dat acceptatie geen browsersessie
  aanmaakt. Vraag daarna een verse OTP aan en controleer dat je na codeverificatie
  op de juiste tenanthost in `/staff` komt. Ook een bestaand account krijgt toegang
  via OTP; de uitnodiging of portaallink logt het account niet in.
  Test **Meer → Uitnodiging opnieuw versturen**; er mag geen tweede medewerker of
  personeelsnummer worden aangemaakt. Een gebruikte link of ingetrokken toegang
  mag geen nieuwe portalsessie opleveren.
  Personeelsuitnodigingen gebruiken de bestaande `SENDGRID_API_KEY` en
  `SENDGRID_FROM_EMAIL`, de ingestelde tenant-afzendernaam en het gedeelde
  huisstijlsjabloon; voor de **uitnodigingsmail zelf** is geen nieuwe secret,
  migratie of Supabase-uitnodigingssjabloon nodig. Dit staat los van het hosted
  Magic Link/OTP-sjabloon dat de universele login hierboven vereist.
  Klik-/open-tracking staat voor deze mails uit. Activatietokens staan niet in
  verzendlogs en worden pas verbruikt bij bevestiging, niet door een GET van een
  mailscanner. Echte inboxbezorging blijft een stagingacceptatiepunt: de lokale
  browsertests gebruiken uitsluitend een in-memory SendGrid-testontvanger.
- Open `/platform` op de platformhost en `/app`, `/staff` en `/klant` op de juiste
  tenanthost. Gebruik voor iedere werkruimte een eigen testaccount van de operator
  met de vereiste actuele toegang. Controleer dat alleen een e-mailadres wordt
  gevraagd, zonder wachtwoord- of magic-link-login, en dat de response voor een
  onbekend adres niet verraadt of het account bestaat. Na hookactivatie ontvangt
  ieder account één mail met de juiste Fieldgrid- of tenantbranding en een
  zescijferige code zonder credentialdragende loginlink. Voer de code in, controleer
  dat alleen de toegestane werkruimte opent en dat dezelfde code niet opnieuw
  bruikbaar is. Controleer dat een verkeerde tenant of ingetrokken klantbinding
  geen toegang oplevert. Deze provider- en inboxacceptatie blijft een
  operatorhandeling en is niet bewezen door lokale tests of een groene deploy.
  Schakel bij terugval naar Auth-SMTP pas over nadat het hosted Magic Link-sjabloon
  opnieuw op `{{ .Token }}` is gecontroleerd. Die terugval mist tenantbranding en
  centrale mail-stopdekking voor Auth en geldt niet als volledige acceptatie.
- Open **Klanten → Bekijk** en controleer de tabbladen **Overzicht**, **Contactpersonen**,
  **Objecten**, **Notities** en **Documenten**, ook op mobiel en met het toetsenbord.
  Voeg een contact, interne notitie en een PDF/JPG/PNG-document (maximaal 10 MB) toe;
  controleer na herladen dat alles blijft staan en dat de download werkt.
  Klantdossiers gebruiken de migratie `20260929214421_customer_dossier.sql` en de private
  bucket `customer-documents`; geen handmatige bucketconfiguratie of extra secrets nodig.
  Notities/documenten zijn alleen beschikbaar voor tenantbeheer, management, planning
  en finance met de planningmodule actief. Controleer dat medewerkers en andere
  tenants geen toegang hebben. Bestaande notities/documenten zijn niet overschrijfbaar.
- Maak een aanvraag en offerte, verstuur de SendGrid-testmail en accepteer de offerte
  via de externe link.
- Boek een tijdslot en controleer capaciteit, tijdzone en eenmaligheid van de link.
- Plan en dispatch een werkbon; doorloop op mobiel gezien, onderweg, aanwezig,
  taken, meerwerk, foto, rapport en handtekening.
- Controleer rapport, corrigeer waar toegestaan en finaliseer de factuur.
- Start een Mollie-testbetaling, laat de webhook verwerken en controleer de
  idempotente betaalallocatie.
- Test Web Push op ten minste één echt mobiel apparaat en controleer een retry en
  dead-letterstatus zonder dubbele notificatie.
- Controleer tenantisolatie met twee testgebruikers met verschillende rollen.
- Vergelijk de relevante desktop- en mobiele schermen op inhoud, hiërarchie,
  spacing, kleuren, logo en toestanden met het goedgekeurde V1-prototype.

## Promotiebesluit

Leg de geaccepteerde `main`-SHA, datum, uitvoerder, afwijkingen en herstelproef vast.
Maak en vul GitHub Environment en branch `production` pas nadat alle blokkerende
punten hierboven zijn geaccepteerd. Promoveer daarna uitsluitend die geaccepteerde
SHA; de productie-workflow vereist opnieuw een geslaagde CI-run voor exact die
production-SHA.
