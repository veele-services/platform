# Autorisatiereview SocialHero-koppelcodes

26 november 2026, uitbreiding op de
[bestaande blogreview](fieldgrid-blog-review.md).

- Iedere beheerroute en pagina vereist de bestaande actuele Auth-sessie plus
  platformadminregistratie. Mutaties controleren exact dezelfde origin. De
  browser bepaalt nooit site-ID, omgeving, providerorigin of server-attempt-ID.
- De HTTPS-client gebruikt uitsluitend vaste claim/verify-paden, begrensde
  bodies/tijdslimieten, gecontroleerde publieke DNS-antwoorden en een gepinde
  socketbestemming met correcte TLS-hostcontrole. Redirects en proxyconfiguratie
  uit de procesomgeving worden niet gevolgd. Lokale HTTP-testtoegang is expliciet
  geïsoleerd en kan niet door staging- of productieconfiguratie worden aangezet.
- Code en bearer worden uitsluitend tijdelijk versleuteld bewaard. GCM, random
  nonce, HKDF en deployment-/attempt-binding verhinderen onopgemerkte wijzigingen
  of hergebruik op een andere installatie. Na activatie blijft alleen de hash.
  Bestaande worker en RPCs ruimen verlopen provisioning op.
- Statusprojecties bevatten uitsluitend benoemde, niet-geheime velden. Responses,
  fouten en logs bevatten geen code, bearer, ciphertext, tokenhash, SQL of ruwe
  providerbody. Browsercodes hebben geen URL-/storagepad en verlopen na twee minuten.
- Nieuwe private tabellen hebben RLS/forced RLS en geen directe grants aan
  anon, authenticated of service_role. Gesloten search_path en expliciete grants
  beperken admin-RPCs tot actuele beheerders en server-RPCs tot service_role.
  Ciphertext-RPCs zijn nooit beschikbaar via de authenticated Data API.
- Claim/pending-opslag wordt gecommit vóór de capabilities-callback. Pending
  credentials kunnen geen blogdata lezen of muteren. Activatie, supersede,
  intrekken en beleid gebruiken locks/CAS; een late oude respons activeert geen
  nieuwe bestemming en trekt geen nieuwere credential in.
- Bestemmingsscope wordt uitsluitend uit de geauthenticeerde credential
  afgeleid. Artikelen, media en idempotentieresultaten van een andere bestemming
  zijn niet toegankelijk. Reconnect behoudt mappings, externe IDs en receipts;
  alleen de nieuwe token vervangt de oude. Slugs blijven sitebreed gereserveerd.
- Bij een eerste bestemming bevestigt de bevoegde beheerder vóór koppelen de
  standaard aangevinkte concept- en publicatierechten. Een opgeslagen opt-out
  blijft uitgeschakeld bij reconnect. Keuze, beslisser en datum staan duurzaam
  per bestemming/omgeving in een private audit. De server en
  SQL-transactie controleren het actuele beleid, ook bij retries en verouderde
  capabilities. Intrekking en beleid wachten op eerdere lopende transacties;
  daarna kunnen nieuwe writes niet meer door. Menselijke redactie houdt haar
  bestaande afzonderlijke platformrechten.
- Revisies en publicatiegebeurtenissen bewaren de actorcontext en kunnen niet
  rechtstreeks worden gewijzigd. Taxonomiebeheer vereist dezelfde actuele
  platformrechten; archiveren behoudt historische verwijzingen. Openbare queries
  zijn begrensd en selecteren uitsluitend live inhoud. Een geslaagde SQL-write
  geldt pas als bevestigde publicatie na de juiste artikel-/revisiemarkers in
  de oorspronkelijke publieke HTML-head; redirects, verkeerde inhoud en
  onbereikbaarheid behouden de uitleesbare tussenstatus.
- De legacycompatibiliteitslaag accepteert geen paired credential. Bestaande
  fingerprints veranderen niet door het toegevoegde interne scopeveld. Er is
  geen omzetting van oude publieke inhoud, destructieve migratie of inhoudsverlies.

Bewijs: gerichte transport-/cryptografie-/pairing-/wiretests,
`scripts/test-blog-connector-db.mjs`, de bestaande blogregressies, een echte
pre-/post-upgradeproef en de security advisors. De exacte aantallen en
HTTP-/browserresultaten staan in het
[acceptatieverslag](../integration/fieldgrid-blog-acceptance.md). Lokale
Auth/Storage- en SocialHero-contractadapters worden niet als hosted acceptatie
gepresenteerd. De afzonderlijke stagingorigin en productiecanonical staan in
[de installatiehandleiding](../integration/socialhero-connector.md).
