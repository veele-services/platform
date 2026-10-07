# Publieke website: gerichte autorisatiereview

Scope: de nieuwe publieke marketingresponse, de nieuwe intake-adapter en de
bestaande intakefuncties die hiervoor zijn uitgebreid. Geen wijziging van
portaalrollen, RLS-policies, opslagrechten, providercredentials of host-runtime.

## Grenzen

- Proxy resolveert de tenant uitsluitend uit de gevalideerde hostname. Voor
  deze pagina’s wordt de actuele actieve tenant via een servercredential
  gecontroleerd. Onbekend/inactief krijgt geen marketingresponse; de standaard
  platform- en andere tenantroutes blijven bestaan.
- Alleen publiek GET/HEAD wordt HTML. Beveiligde werkspaces, alle API’s en
  bestaande quote/booking/pay/auth-routes zijn uitgesloten. Canonicals gebruiken
  de vertrouwde APP_URL-scheme/port en de gevalideerde tenant-hostname. Slashes
  worden in Proxy geregeld; redirects bewaren de juiste tenant-origin.
- De adapter vereist juiste hostname, door Proxy afgeleide tenantheader,
  same-origin Origin en JSON. Volledige servervalidatie, gekozen taakbranches en
  maximaal 65.536 bytes vóór storage. Geen browsergekozen tenant/actor/status.
  Foutantwoorden bevatten geen invoer, databasefouten, credentials of maildetails.
- De nieuwe databasefunctie is alleen voor service_role uitvoerbaar en
  controleert JWT-role, exacte actieve tenant, module, hash/envelop en notities.
  `security definer` gebruikt een lege search_path. Private helpers blijven
  onbereikbaar voor anon/authenticated/service_role directe callers.
- De bestaande intake en rate limits blijven autoriteit. Gewone lead/contact
  is de bestaande intakeprocedure. Phone-only gebruikt een eigen contact-rate
  key; verschillende telefoonnummers delen niet één lege-email bucket.
- Tenant/inquiry/content-HMAC en een transactionele advisory lock beschermen
  retries. Bestaande referentie wordt alleen na hercontrole van tenant, bron en
  inhoud teruggegeven. Managementwijzigingen en notities worden niet overschreven.
- Unicode-overflow blijft in bestaande interne notities onder hetzelfde
  dossier. Geen nieuwe publieke notitie-RPC of verruimde klantenrechten.
- Reviewprovider-sources worden alleen in de publieke marketing-CSP toegestaan.
  Iedere eigen script-tag krijgt een nonce; gewone portal-CSP blijft gesloten.

## Release-operaties

De bouwgenerator verwerkt uitsluitend lokale onderhouden bronbestanden en
bijgeleverde assets. Geen extern package, command uit formulierinvoer of Sites
deploy. De beperkte CI-naminguitzondering geldt alleen deze tenantwebsite,
adapter en de operationele inventaris; globale productbranding blijft Fieldgrid
en de mailprovider SendGrid.

De nieuwe staging-acceptatiestap gebruikt `workOrderTestDatabase`, bestaande
project/ref/branch/workflow/TLS-guards en rollback-only query-wrapper. De fixture
maakt nooit een commit en ziet uitsluitend eigen synthetische aanvraaggegevens;
de worker ziet geen testmail. De publieke rooktest doet alleen GET’s.
Migratiemanifest: bestaande hashes onveranderd, één hash toegevoegd uit een
schone geïsoleerde replay van de volledige migratieketen.

## Bewijs

- `lib/marketing/veele/submission.test.ts`: alle zeven combinaties, false,
  branches, contact, schema, nachttijden, inhoud- en tenantidentiteit, Unicode.
- `lib/marketing/veele/render.test.ts`: 28 canonicals, nonce, staging noindex,
  widgets, application exclusions en lokale hostname-isolatie.
- `app/api/veele-website/requests/route.test.ts`: Origin, host/header, begrensde
  JSON, veldfouten, module/tenant, veilige foutpaden en commit vóór mail.
- `scripts/test-veele-marketing.mjs`: teruggelezen native velden, one lead,
  niet-geboekte locatie, telefoon-only, volledige lange tekst, idempotentie,
  managementnotitiebehoud, rollen, verkeerde/inactieve tenant en rate limits.
- `tests/e2e/veele-marketing.spec.ts`: echte browserintake en verloren
  ontvangstbevestiging na opslag, 28 routes, portals, mobiel/tablet/desktop,
  200% tekst en reduced motion.
- Bestaande regressies `test-commercial.mjs`, `test-release-security.mjs` en
  `test-security-catalog.mjs`: 50 assertions geslaagd op de replaydatabase.
- Meegeleverde `reference/map-inquiry.test.mjs`: acht verliesvrije
  referentietests opnieuw uitgevoerd en geslaagd.

Dit document is de gerichte review voor gewijzigde surfaces. De volledige
repository-verificatie en exact-SHA deployment blijven afzonderlijke gates.
