# Autorisatiereview publieke blog en SocialHero

Bronbasis `34d649e2d66e2dc2508289f25c846c26860c1447`, 13 november 2026.
Deze review betreft de nieuwe blogingangen en gewijzigde marketingdispatch.
Bestaande autorisaties en eerder vastgelegde bevindingen blijven afzonderlijk
in de releaseledger staan. Er is geen hosted database of runtime gemuteerd.

## Concrete grenzen

- De marketingproxy laat uitsluitend de benoemde SocialHero v1-methoden en
  GET/HEAD van een concrete blogasset door. Private admin-API's, interne
  rewritepaden en onbekende schrijfmethoden blijven gesloten. Tenantheaders
  kunnen marketing of platform niet kiezen.
- Elke serviceaanvraag vereist een site/environment-hashregistratie met actuele
  vervaltijd, scopes en intrekstatus. Mutaties controleren en locken die registratie
  opnieuw. `read`, `media:write`, `draft:write` en `publish` zijn afzonderlijk.
  Voor elke credential geldt een duurzaam gelimiteerd requestvenster.
- Redactie en preview controleren op iedere serveraanvraag de platformhost,
  echte Auth-gebruiker, actieve database-sessie en actuele platformadminregistratie.
  Geen tenant-, support- of bewerkbare metadatarol verleent toegang. SQL controleert
  deze voorwaarden onafhankelijk van de client en de herbruikbare layout.
- Alle acht nieuwe private tabellen hebben RLS en forced RLS. Geen directe
  lees-/schrijfrechten voor anon, authenticated of service_role. Alle nieuwe
  functies hebben een gesloten search_path en expliciete EXECUTE-grants; anon
  kan geen nieuwe RPC aanroepen. Alleen de service mag de beperkte publieke
  liveprojectie lezen. Authenticated kan uitsluitend de gecontroleerde admin-RPC's
  gebruiken. Security-definer toegang blijft achter de expliciete RPC-controles.
- Publieke projecties vervangen draftinhoud/revisie/tijdstempels door de live
  snapshot en sluiten expliciete testrecords uit. Slugredirects gebruiken de
  actuele live slug van hetzelfde scoped artikel, nooit een ingestuurde URL.
- Media worden volledig gedecodeerd en opnieuw gecodeerd; typen, bytes,
  afmetingen en aantallen zijn begrensd. De database verifieert iedere verwijzing
  tegen eigen scoped assetmetadata. De private bucket wordt uitsluitend via
  de gecontroleerde route ontsloten. Ongepubliceerde media vereisen redactie.
- Linkprotocollen, editorstructuur, taxonomie en publiceerbaarheid worden ook
  server-side getoetst. De titel is de enige H1. React rendert tekst zonder
  uitvoerbare HTML; JSON-LD escapt `<`. SEO gebruikt alleen gepubliceerde gegevens.
- De preview is noindex. Alle stagingmarketing blijft noindex. Het lokale
  originmechanisme accepteert uitsluitend een expliciete HTTP-loopbackorigin
  en wordt buiten lokale ontwikkeling genegeerd.
- Bewerkingen, revision-check, live wissel, slugreservering en idempotentieresultaat
  zijn één SQL-transactie. Storage is onveranderlijk en deterministisch hervatbaar;
  uitsluitend private weesobjecten kunnen na een crash achterblijven. Herhaling
  kan geen bestaande blob overschrijven. Conflicterende inhoud geeft een conflict.
- Credentialregistratie is een expliciete operatorhandeling via stdin. Tokens
  worden niet weergegeven, gelogd, in een URL geplaatst of naar een browser
  geretourneerd. Staging- en productiedoelen gebruiken de bestaande projectguards
  en TLS-controle. Er is geen configuratiefallback uit lokale env of legacy.

## Bewijs en praktische grenzen

`scripts/test-blog-db.mjs` gebruikt echte Postgres-transacties: directe
tabeldenials, alle RLS/search_path/grants, actuele admin/sessie, cross-environment
media, intrekken/verlopen/scopes, rate limit, concurrente retries, inhoudsconflicten,
oude revisies, live snapshots, slughistorie en test-only assets. De migratie is ook
met de officiële Supabase CLI op een verse geïsoleerde upgrade toegepast; de
security advisors rapporteerden geen problemen.

`lib/blog/validation.test.ts` en `lib/blog/media.test.ts` toetsen Markdown,
onveilige protocollen, nesting, mediareferenties, bestandssignatuur, MIME mismatch,
volledige decodering en payloadlimieten. De bestaande hostname-/securitytests
blijven groen.

Voor de releasevoorbereiding zijn Next.js, @next/env en eslint-config-next naar
16.4.6 en Zod naar 4.6.6 bijgewerkt, inclusief de oude transitieve Zod-kopie.
De dependency-audit heeft 0 high/critical bevindingen. De volledige suite van
2031 tests, TypeScript, lint en de standalone-productiebuild zijn opnieuw geslaagd.
De expliciete lokale fixturetools hebben geen ingebouwde databasewachtwoorden:
`scripts/blog-test-database.mjs` accepteert alleen de ingestelde geïsoleerde
loopbackdatabase, controleert de echte database vóór mutaties en genereert een
uniek tijdelijk PostgREST-credential. Tien guardtests en de echte database-,
upgrade- en runtimeproeven bevestigen deze grens; de verbindingswaarde wordt
niet gelogd en blijft buiten repository en artefacten.

`scripts/test-blog-http.mjs` oefent de echte Next.js-handlers en geïsoleerde
PostgREST/Postgres uit: ontbrekende/verkeerde tokens, private concepten en media,
gelijktijdige retries, stale jobs, oude live revisie, titelwijziging, bewuste
slugwijziging met HTTP 308, sitemap, payloadfouten en host-/methodengrenzen.
Auth en Storage zijn voor deze lokale proef expliciete fixtureadapters.

De SocialHero-proef gebruikt de echte goedkeurings-/werkvoorraadcode en duurzame
SQLite-opslag tegen deze lokale HTTP-server. Responseverlies wordt pas ná een
geslaagde echte write geïnjecteerd; de oorspronkelijke operatiesleutel blijft
bewaard. Socialverzending en AI-aanroepen zijn niet uitgevoerd.

De browsercontrole gebruikt de echte Fieldgrid-componenten en handlers op
desktop en mobiel. De identiteit komt uit de lokale Auth-fixture; het product
controleert de echte database-sessie en adminregistratie. Externe identity-provider,
Supabase Storage-hosting, Caddy, echte stagingpublicatie en externe socialcrawlers
blijven releasecontroles voor een bewuste stagingpromotie. Een lokale adaptersuite
wordt niet als live infrastructuuracceptatie gepresenteerd.

Zie [het feitelijke acceptatieverslag](../integration/fieldgrid-blog-acceptance.md)
voor resultaten, artefacten en resterende operatorcontroles.
