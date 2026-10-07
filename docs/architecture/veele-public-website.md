# Publieke Veele Services-website

De actieve tenant `veele-services` levert de aangeleverde Frame v5-website op
zijn bestaande staging-origin. De 28 pagina’s, foto’s, logo, fonts, CSS en
navigatie komen uit de gecontroleerde overdracht (99 oorspronkelijke
bestandshashes gecontroleerd). `websites/veele-services/SOURCE.json` beschrijft
die oorspronkelijke snapshot, niet de inmiddels aangepaste integratie.
Sites-metadata en de historische preview-origin zijn geen deploydoel.

## Bouw en routing

`scripts/build-veele-marketing.mjs` draait de meegeleverde Python-generator,
genereert `pages.generated.json` en kopieert de onderhouden assets naar
`public/veele-services/assets`. Python 3 is daarom nodig bij dev/build; er zijn
geen extra Python- of npm-packages. Bewerk `src/base`, `src/content.py`,
`assets` en `scripts/build-frame.py`, niet de gegenereerde pagina’s.

Proxy levert uitsluitend publieke GET/HEAD-pagina’s van de juiste actieve tenant
als HTML-response. De actieve tenant wordt via de bestaande servercontrole
opnieuw gecontroleerd, zonder publieke tenantkeuze of een interne render-URL. Andere
tenants en `/login`, `/app`, `/staff`, `/klant`, API’s en bestaande tokenroutes
houden hun eigen handlers. Publieke Frame-pagina’s hebben een afsluitende slash;
de bestaande applicatieroutes houden hun URL zonder afsluitende slash.

De huidige geverifieerde origin levert canonical, sitemap en structured data.
Staging heeft HTTP-noindex, meta-noindex en robots Disallow. Productie-origin,
oude domeinredirects en daadwerkelijke indexeerbaarheid horen bij de latere,
expliciet gestarte productiefase. Er is geen production branch of runtime gemaakt.

## Aanvraag en veldmapping

Het nieuwe serverendpoint `/api/veele-website/requests` is een adapter bovenop
de bestaande `commercial_public_intake` en `private.commercial_intake`.
`lib/marketing/veele/submission.ts` valideert het volledige versie-1-envelop,
de gekozen branches, contactgegevens, datums, tijdvensters en frequentie.
De volledig ingevulde mapping staat in
`websites/veele-services/reference/mapping-worksheet.csv`.

De bestaande intake maakt één aanvraag, een gewone klantlead en een primaire
contactpersoon. Organisatie en contactnaam zijn afzonderlijk opgeslagen.
Email is optioneel wanneer er een geldig telefoonnummer is. Er ontstaat geen
auth-account, portaaltoegang, object, geboekte afspraak, offerte of werkbon.
Meerdere diensten worden volledig bewaard in het vrije disciplineveld, zonder
een catalogustaak of een afgesproken uitvoering te suggereren.

Alle overige ingevulde waarden komen met Nederlandse labels bij de extra
opmerkingen (`requests.description`). Onbesliste inzet `discuss` blijft daar
expliciet In overleg; het bestaande technische work_kind-default is geen
native mapping van die wens. De lijst toont In overleg totdat het dossier wordt
beoordeeld. Tijdvensters, tijdzone, postcode, straat, plaats, aantallen,
oppervlakte-eenheid, volledige optielijsten en expliciete `false` blijven behouden.
Vrije opmerkingen worden toegevoegd; latere managementnotities worden niet
overschreven door een retry.

Meer dan 10.000 tekens opmerkingen worden atomair in bestaande interne
`commercial_events`-notities opgeslagen, in volgorde van stukken van 5.000
Unicode-codepunten. De detailweergave toont de volledige tekst ook in Overzicht.
Dit verandert de toegang tot notities niet. De maximale intake is 65.536 bytes
en 50.000 codepunten aanvullende tekst; te grote invoer wordt afgewezen, nooit
afgekapt of als ontvangen bevestigd.

De request-UUID is een server-HMAC over tenant, oorspronkelijke wizard-ID en
de hash van het gevalideerde volledige envelop. Dubbelklik, dezelfde retry en
een verloren HTTP-antwoord hergebruiken de opgeslagen referentie. Veranderde
inhoud krijgt een nieuwe identiteit. De database controleert ook inhoudhash,
tenant, websitebron, actieve status en planningmodule, vóór een retryantwoord.
De bestaande uurgrenzen per browser, contact en tenant blijven gelden.

De ontvangstbevestiging volgt na de databasecommit. Bestaande commerciële mail
wordt daarna verwerkt; tijdelijke mailuitval verandert een opgeslagen aanvraag
niet in een mislukte intake. Testberichten gebruiken uitsluitend de lokale
mockprovider; de staging-DB-proef draait volledig binnen een rollbacktransactie.

## Reviews en configuratie

Beide aangeleverde Trustindex-ID’s blijven behouden: footerbadge op alle
pagina’s en recensies op Home/Over ons. Reviewinhoud, scores, Google-attributie
en bronbediening blijven van de provider. Alleen publieke marketing krijgt de
benodigde `cdn.trustindex.io`, `de-proxy.trustindex.io` en Google-avatarbronnen
in CSP. Inline scripts krijgen de door Proxy gegenereerde nonce.
De websitepauzeknop en reduced-motion schakelen ook de daadwerkelijke
Trustindex-sliderinterval uit; handmatige providerbediening blijft beschikbaar.

Er zijn geen nieuwe secrets of environmentvariabelen nodig. Bestaande namen:
`APP_URL`, `APP_ENV`, `DEPLOY_TARGET`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`,
`ADMIN_API_SECRET`, `MIGRATION_DATABASE_URL` en bestaande SendGrid-configuratie.
Staging blijft zijn eigen GitHub Environment, projectguards en scanner gebruiken.

## Publicatie en verificatie

Gebruik de bestaande PR/main-review en bewuste staging-promotie. De bestaande
workflow maakt de backup, past de nieuwe migratie toe en activeert dezelfde
release. Geen extra poort, Caddy-route, service of handmatige runtimeconfiguratie.
De deployment controleert exact SHA, worker, alle 28 publieke routes, 404,
robots, sitemap, portaalingangen en rollback-only aanvraagread-back.

Gerichte tests staan in `lib/marketing/veele/*.test.ts`, het route-testbestand,
`scripts/test-veele-marketing.mjs` en `tests/e2e/veele-marketing.spec.ts`.
Deze controleren zeven dienstcombinaties, veldfouten, tenant/origin-grenzen,
phone-only, Unicode-overflow, idempotentie, rate limits en echte lokale
browserintake met teruggelezen native velden en opmerkingen. Schermformaten:
320, 390, 768, 1024 en 1440 pixels; daarnaast 200% tekst en reduced-motion.
Werkelijke reviewproviderweergave wordt ook na publicatie bekeken; de provider
blijft verantwoordelijk voor beschikbaarheid en eventuele gewijzigde bediening.
