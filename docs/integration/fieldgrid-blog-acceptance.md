# Fieldgrid en SocialHero: feitelijke acceptatie

Uitgevoerd op 13 november 2026. Fieldgrid-bronbasis
`34d649e2d66e2dc2508289f25c846c26860c1447`, branch
`codex/fieldgrid-blog-socialhero`. SocialHero-bronbasis
`083b0d8`, implementatiecommit `40d35820215ecdee9b3ddd937d3bd25fb757e09a`,
aangescherpt verificatiebewijs `be6e19d621edcde07c556bbf2555847c5cd424d9`,
branch `codex/fieldgrid-socialhero-isolated`.

De oorspronkelijke checkouts zijn behouden; beide wijzigingen zijn in eigen
worktrees ontwikkeld. De onderstaande ketenproeven waren lokaal. De later
geautoriseerde rollout staat afzonderlijk onderaan dit verslag. Er zijn geen
bestaande externe websiteverbindingen gewijzigd en geen AI-aanroepen of
socialposts verzonden.

## Geteste omgeving

- Echte lokale Fieldgrid Next.js 16.4.6 HTTP-server, publieke testorigin
  `http://127.0.0.1:3307`, platformorigin `http://localhost:3307`.
- Echte geïsoleerde Postgres 17 en PostgREST, alleen loopbackpoorten. De bron voor
  het schema/de bestaande data is een uitsluitend read-only gekopieerde lokale
  Fieldgrid-snapshot. Geen staging- of productiecredential is gebruikt.
- Auth-identiteit en Storage-transport gebruiken expliciete lokale fixtureadapters.
  De daadwerkelijke Fieldgrid-sessie-, admin-, RLS-, scope- en contentcontroles
  draaien op de echte database. Dit is geen test van hosted Auth of Storage.
- SocialHero gebruikt zijn werkelijke approval-, SQLite-, secretvault- en
  workerlogica. De klok is gecontroleerd om planning en retries te testen.
  Antwoordverlies wordt geïnjecteerd ná een geslaagde echte HTTP-write.
- De afzonderlijke SocialHero-wizardbrowserdemo gebruikt een API-fixture en is
  als browserdemo gerapporteerd. De Fieldgrid-browserproeven gebruiken de echte
  lokale website en database, met bovengenoemde Auth/Storage-adapters.
- De echte stagingmarketinghost gaf vóór promotie op `/blog` HTTP 404 en
  `X-Robots-Tag: noindex, nofollow`. Bereikbaarheid is gecontroleerd; de nieuwe
  code is daar niet uitgerold.

## Resultaten

| Controle | Feitelijk resultaat |
| --- | --- |
| Hele Fieldgrid-unit-/regressiesuite | 213 testbestanden, 2031 tests geslaagd na de releasevoorbereiding |
| Fieldgrid-lint en TypeScript | geslaagd; lint heeft 0 fouten en 49 bestaande waarschuwingen |
| Next.js-productiebuild | `next build --webpack` geslaagd; standalone-runtime opnieuw via HTTP en desktop/mobiele browser gecontroleerd |
| Aanvullende blogregressies na review | acht gerichte tests geslaagd, inclusief indexeerbaarheid van productiebeelden |
| Echte Postgres-suite | 11 scenario's geslaagd: actuele sessie/admin, RLS, scopes, expiry/revocation, eigen omgeving, rate limit, concurrency, revisions, slugredirects en test-only media |
| Officiële CLI-upgrade en security advisors | migratie toegepast; geen securityproblemen gerapporteerd; inhoudsmanifest bijgewerkt |
| Upgrade met bestaande gegevens | acht bestaande tabellen houden exact dezelfde aantallen en SHA256-hashes; bestaande buckets blijven identiek, één private blogbucket toegevoegd |
| Echte Fieldgrid-HTTP-proef | zes groepen geslaagd: tokens, media, concept/concurrency, live versus draft, title/slug/redirect/sitemap en beveiligde ingangen |
| Echte Fieldgrid-browserproeven | desktop 1440 en mobiel 390: index, detail, editor, mediafocus, private preview; geen overflow of uncaught browserfouten |
| Handmatige editorflow | Markdownimport naar TipTap, inert HTML, echte auteur/categorie, automatische en handmatige slug, upload/alt/focus, save/reload, publiceren, nieuwe revisie en HTTP 308 geslaagd |
| Herhaalde handmatige create | twee gelijktijdige authenticated requests met dezelfde sleutel leveren hetzelfde artikel en revisie 1 |
| SocialHero-domeintests/TypeScript | 211 tests en TypeScript geslaagd; 44 gerichte blogchecks eveneens geslaagd |
| SocialHero-browserdemo | vier desktop/mobielchecks geslaagd, uitsluitend gemockte demo-API |
| Echte SocialHero→Fieldgrid-keten | zes checks geslaagd: capabilities, pause/resume, media, privéconcept, herstart, exact UTC-schema, verloren antwoorden, statusreconciliatie, canonical/revisie en vrijgave van afhankelijke link |
| Dependency-audit voor release | Next.js, @next/env en eslint-config-next 16.4.6; Zod 4.6.6 inclusief transitive override; audit geslaagd met 0 high/critical |
| Expliciete testdatabaseconfiguratie | 10 guardtests geslaagd; geen ingebouwde fixturewachtwoorden, lokale database/upgrade/runtime opnieuw geslaagd |
| Standalone-releaseverpakking | productiebuild, vier materialisatietests en link-vrij ingepakt artifact met echte serverboot/static-HTTP geslaagd |
| Herhaling op Next.js 16.4.6-releasepakket | volledige handmatige editorflow en publieke desktop-/mobielproeven geslaagd, 0 browserfouten; alle 16 health-/host-/methodencontroles geslaagd |

De sitemap bevat uitsluitend productiecanonicals. De lokale en staging-URL's
blijven aparte verificatiebestemmingen en behouden noindex. De publieke HTML
bevat precies de verwachte canonical en SocialHero-identiteit/revisie in de
oorspronkelijke head, plus SEO, Open Graph, X-kaart en Article/BlogPosting-JSON-LD.
Concepten zijn voordien niet publiek of in de sitemap aanwezig.

De SocialHero-keten bevestigt twee logische assets en één logisch artikel ondanks
herhaalde requests. Een herstart bewaart bestemming, revisie en oorspronkelijke
keys. Een gepauzeerde verbinding houdt de afhankelijke link tegen. Pas na de
anonieme check van de juiste revisie komt de link met eigen meetparameters vrij;
de canonical blijft zonder parameters. Geen echte socialreceipt is aangemaakt.

Een eerste runnerpoging hield geen rekening met de bestaande 60-secondenlease
na pauzeren en bleef als afzonderlijk concept staan. De proefklok is gecorrigeerd;
de volledige herhaling en aangescherpte sitemapcontrole slaagden. Dit betrof
verschillende proefcampagnes, niet dubbele resultaten voor dezelfde operatie.
De eerste Fieldgrid-buildpoging liep op de volle gedeelde schijf vast. Na het
verplaatsen en opruimen van uitsluitend de gegenereerde buildcache slaagde
dezelfde productiebuild; de standalone-versie slaagde daarna voor HTTP en browser.
Een eerdere brede SocialHero-run had een hostbelasting-timeout; de complete
suite is daarna opnieuw uitgevoerd met 211/211 geslaagde tests.

## Bewijs en herhalen

- [Fieldgrid HTTP-resultaten](fieldgrid-blog-evidence/fieldgrid-http.json)
- [SocialHero HTTP-resultaten](fieldgrid-blog-evidence/socialhero-http.json)
- [Upgrade met bestaande data](fieldgrid-blog-evidence/upgrade.json)
- [Desktopartikel](fieldgrid-blog-evidence/article-desktop.png) en
  [mobiel artikel](fieldgrid-blog-evidence/article-mobile.png)
- [Desktopeditor](fieldgrid-blog-evidence/editor-desktop.png) en
  [mobiele editor](fieldgrid-blog-evidence/editor-mobile.png)

Reproduceerbare Fieldgrid-scripts: `scripts/test-blog-db.mjs`,
`scripts/test-blog-upgrade.mjs`, `scripts/blog-test-runtime.mjs`,
`scripts/test-blog-http.mjs`, `scripts/test-blog-browser.mjs` en
`scripts/test-blog-editor-browser.mjs`. De databaseproef draait in CI via de
bestaande guarded lokale targethelper; de expliciete isolatiemodus gebruikt
`FIELDGRID_BLOG_ISOLATED_TEST=1` en `fieldgrid_blog_isolated` op loopbackpoort 59423.
De expliciete isolatiemodus, upgradeproef en runtimeharness vereisen bovendien
`FIELDGRID_BLOG_TEST_DATABASE_URL` als server-side procesvariabele uit de eigen
lokale secretvoorziening. Alleen een PostgreSQL-URL met credentials voor
`127.0.0.1:59423/fieldgrid_blog_isolated` wordt geaccepteerd, zonder queryparameters
of fragment. De scripts laden geen `.env` en kennen geen standaardwachtwoord.
De upgrade kiest daaruit uitsluitend een nieuwe database met de eigen
`fieldgrid_blog_`-prefix. De runtime stelt pas na databasecontrole een uniek,
tijdelijk PostgREST-credential in op de taakcontainer; de private env-file bevat
het credential en SQL ontvangt uitsluitend een SCRAM-verifier. Geef de URL niet
mee als CLI-argument en neem hem niet op in logs of artefacten. De gewone
CI-modus blijft de bestaande guarded Supabase-helper gebruiken en vereist deze
extra testvariabele niet.

De HTTP-/browserfixtures accepteren uitsluitend hun expliciete lokale origin.
Tijdelijke credential-/browserstatebestanden staan buiten de repository met
beperkte bestandsrechten en worden niet als artifact opgenomen.

SocialHero heeft `scripts/verify-local-fieldgrid-blog.mjs` voor de werkelijke
keten en `scripts/qa-fieldgrid-blog.mjs` voor de afzonderlijke browserdemo.
De Fieldgrid-bestemming staat als niet-geheim manifest in
`config/blog-destinations/fieldgrid-staging.json`. De generieke configuratiehelper
controleert read-only capabilities en echte taxonomie vóór het opslaan van een
credential uit stdin. Deze helper is niet op een bestaande stagingverbinding
uitgevoerd.

## Publicatievertraging en operatorstappen

Publiceren wisselt de live revisie atomair; runtimepagina's hebben geen buildhook
nodig. SocialHero bewaart iedere poging, foutcode, externe ID en revisie in het
publicatiedetail. Bij een timeout leest de worker eerst de externe status. Zolang
de publieke HTML niet de verwachte revisie/canonical bevestigt, blijft het artikel
op **wacht op website** en blijven afhankelijke socialposts geblokkeerd. Na herstel
kan dezelfde operatie met dezelfde keys verdergaan. Gewijzigde inhoud of
bestemming vereist de bestaande nieuwe goedkeuring.

Een bewuste stagingpromotie moet nog de exacte release-SHA/healthcheck, hosted
Storage en Auth, TLS/Caddy, credentialregistratie uit GitHub Environment staging,
publieke verificatie vanaf SocialHero's echte server en externe crawlers toetsen.
Dit volgt de bestaande releaseflow en vereist geen nieuwe runtime. De lokale
webserver/testcredential is een proefvoorziening, geen gedeeld stagingcredential.

Contract, configuratievelden zonder geheimen, migraties en beheerinstructies:
[Fieldgrid-blogarchitectuur](../architecture/fieldgrid-blog.md).
De afzonderlijke [beveiligingsreview](../security/fieldgrid-blog-review.md) vermeldt
de beoordeelde grenzen en de praktische beperkingen van de adapters.

## Geautoriseerde rollout op 13 november 2026

SocialHero is uitgerold op staging en productie met exact runtimecommit
`c23901c30e13ac8c19de9142c8cd8ff653273303`, via
[PR 2](https://github.com/socialherodgweb/platform/pull/2) en de
[compatibiliteitscorrectie in PR 3](https://github.com/socialherodgweb/platform/pull/3).
De bestaande configuratie v2 en build-/activatieworkflows zijn gebruikt:

| Omgeving | Build | Activatie | Resultaat |
| --- | --- | --- | --- |
| SocialHero staging | [43456863527](https://github.com/socialherodgweb/platform/actions/runs/43456863527) | [43457081308](https://github.com/socialherodgweb/platform/actions/runs/43457081308) | geslaagd, exacte SHA, health/ready HTTP 200 |
| SocialHero productie | [43457489505](https://github.com/socialherodgweb/platform/actions/runs/43457489505) | [43457734431](https://github.com/socialherodgweb/platform/actions/runs/43457734431) | geslaagd, exacte SHA, health/ready HTTP 200 |

De worker is op beide omgevingen actief en SQLite is integer, duurzaam en
gescheiden. Per omgeving zijn 10 aanvullende SHA/asset/auth/opslagcontroles en
24 publieke browser-/HTTP-controles geslaagd. De live Fieldgridverbinding is
niet aangemaakt, omdat de nieuwe Fieldgrid-API nog niet is uitgerold.

Fieldgrid staat in [PR 605](https://github.com/veele-services/platform/pull/605).
GitHub weigerde de verplichte CI-job in
[run 43455768058](https://github.com/veele-services/platform/actions/runs/43455768058)
voordat stappen konden starten: “The job was not started because your account
is locked due to a billing issue.” Daarom zijn Fieldgrid main, staging en
productie niet gepromoveerd. De bestaande stagingrelease is
`34d649e2d66e2dc2508289f25c846c26860c1447`; de bestaande productierelease is
`7398d6cb7f2a2cf75eb22a8b33aa7726fa827eb6`.
Na herstel van de accountblokkade moeten eerst de verplichte PR-/mainchecks
slagen, daarna staging met hosted acceptatie, en vervolgens dezelfde SHA naar
productie via de bestaande promotion gate. De lokale resultaten hierboven
vervangen deze releasechecks niet.
