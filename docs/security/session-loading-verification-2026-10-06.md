# Sessielaadscherm en dubbele controles — 6 oktober 2026

Gerichte lokale review van `proxy.ts`, `browser-session.ts`, `session-key.ts`,
`login-brand.ts`, `app/layout.tsx` en de accountboundary. Geen stagingdeploy,
productiebuild of brede eindcontrole uitgevoerd.

## Vertrouwensgrens

De proxy controleert de gebruiker nog steeds live. Voor beschermde pagina's
en `/api/auth/session` koppelt hij geverifieerde claims aan dezelfde gebruiker
en maakt hij de bestaande presentatiehash voor gebruiker, sessie, hostname en
uitsluitend lokaal de tenantselectie. Alle aangeleverde exemplaren van de nieuwe
interne header worden verwijderd, ook op publieke routes en in de specifieke
workerroute. Alleen de proxy zet daarna het resultaat in upstream requestheaders.
De hash is geen credential en wordt niet gebruikt om datahandelingen toe te staan.

De rootlayout en sessieroute hergebruiken alleen deze verificatie binnen dezelfde
HTTP-aanvraag. Er is geen cache tussen aanvragen of tenants. Een ontbrekende
proxyheader behoudt de oorspronkelijke live fallback; een lege of ongeldige
geverifieerde header levert geen identiteit. Cookies die tijdens verificatie
vernieuwd worden, blijven op de uiteindelijke respons staan. Alle bestaande
resource-, rol- en tenantcontroles blijven zelfstandig gelden.

## Browser en publieke huisstijl

Beschermde inhoud blijft vanaf het serverdocument verborgen tot een actuele
sessiecontrole overeenkomt met de identiteit die het document heeft gerenderd.
Focus en visibility delen een nog lopende aanvraag. Navigatie, accountwissel,
uitloggen, tabbladsignalen en terugkeer vanuit browsergeschiedenis behouden hun
controle en afscherming. Een lopende logout kan ook door een geslaagde retry
niet ongedaan worden gemaakt. Netwerkfouten en een timeout houden inhoud verborgen
en bieden opnieuw proberen en inloggen aan.

De loader ontvangt uitsluitend publieke naam, kleuren en het gecontroleerde
huidige logo-URL van de gevalideerde hostname. De huisstijlquery selecteert alleen
een actieve tenant en diens eigen `tenant_branding`-relatie in één aanvraag.
Er zijn geen browsergestuurde tenant-, opslagpad- of URL-keuzes. Een mislukte
huisstijlweergave gebruikt een neutrale fallback; dat wijzigt geen toegangsbesluit.
De voortgangsbalk is onbepaald en respecteert verminderde beweging.

## Gericht bewijs

- 34 unittests in `session-key.test.ts`, `browser-session.test.ts`,
  `login-brand.test.ts` en `proxy-boundary.test.ts`: identiteit/session/hostbinding,
  één live lookup, headervervalsing, claimmismatch, lokaal versus staging,
  cookievernieuwing, publieke huisstijl en veilige fallback.
- Vier bestaande browserprivacytests: tabbladlogout, pending logout plus
  geschiedenis/retry, vertraagde hydration na accountwissel en twee accounts
  achtereenvolgens in zowel personeel als klantportaal.
- Twee browserproeven in `session-loading.spec.ts`: overlappende controles,
  navigatie, afgeschermde inhoud, mobiele breedtes 320/390 en desktop 1440,
  verbindingsfout en geslaagde retry met bruikbare knoppen.
- Aanvullende lokale brandingproef met de echte hostnameproxy, synthetische
  tenant en bestaand logo-endpoint, vóór hydration. Hiervoor gebruikte de
  tijdelijke devrunner `localhost` als platformhostname omdat een tenantnaam
  geen geldig subdomein van een IPv4-adres is. Logo geladen, inhoud verborgen,
  verminderde beweging gecontroleerd en screenshot visueel bekeken. De eerste
  poging met een ongeldig IPv4-subdomein werd correct geweigerd.
- Gerichte ESLint, TypeScript, CSS-parse en controle van de gewijzigde
  autorisatieoppervlakken/ledger. Geen testsuite of productiebuild herhaald.

Deze controle onderbouwt de codewijziging lokaal; zij geeft geen gemeten
percentage snelheidswinst of bewijs van een stagingrelease.
