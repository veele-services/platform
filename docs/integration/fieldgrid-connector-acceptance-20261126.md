# Fieldgrid blog en SocialHero: verificatie 26 november 2026

Deze uitbreiding van [PR 605](https://github.com/veele-services/platform/pull/605)
bouwt voort op blogcommit `b68d3f406243def2dcd132d010ba883ba1f6dbb1`.
Het leidende contract en de beheer-/installatiestappen staan in
[socialhero-connector.md](socialhero-connector.md). De feitelijke uitrolstatus
staat hieronder afzonderlijk; lokale testresultaten zijn geen hosted acceptatie.

## Opgeleverde wijzigingen

- Eén blogservice voor handmatige en SocialHero-artikelen, met TipTap,
  gevalideerde media, afzonderlijke live/conceptrevisies en atomaire publicatie.
- Koppelwizard op `/platform/blog/socialhero`: zichtbaar bevestigde concept-
  en publicatierechten, standaard beide aan bij de eerste bestemming. Een
  expliciete uitschakeling blijft bij reconnect behouden. Beleid, actor en
  datum worden per bestemming/omgeving vastgelegd en bij iedere write getoetst.
- Duurzame claim/pending/verify/active-flow, tijdelijk versleutelde provisioning,
  server-side HTTPS/DNS-controles en uitsluitend gehashte actieve credentials.
  Nieuwe verbindingen behouden de artikelmapping en idempotentiegeschiedenis.
- Onveranderlijke revisies en publicatiegebeurtenissen met werkelijke actorcontext;
  bestaande records met onbekende oorspronkelijke actor blijven als backfill herkenbaar.
- Auteurs en categorieën beheren, archiveren en herstellen op
  `/platform/blog/instellingen`; zoeken en status-/categoriefilters in de redactie.
- Publiek `/blog` met twaalf live artikelen per pagina, filters en begrensde
  home-/gerelateerde queries. Buiten bereik gevraagde pagina's verwijzen naar
  de daadwerkelijke laatste pagina. Concepten en previews blijven privé.
- Publieke HTML-bevestiging van het exacte artikel en de revisie vóór de API
  `published` meldt. Tijdelijke onbereikbaarheid geeft `publishing`; status lezen
  of dezelfde publicatie herhalen kan de bevestiging afronden.
- Staging behoudt noindex en de productiecanonical. Capabilities verklaren die
  canonical afzonderlijk; `publicUrl` blijft de werkelijke stagingartikelroute.

De forward migrations zijn
`20261126110835_fieldgrid_blog_connector.sql` en
`20261126113033_fieldgrid_blog_editorial_history.sql`. De eerdere blogmigratie
blijft ongewijzigd. Het inhoudsmanifest bevat beide nieuwe migraties.

## Omgeving en grenzen van de proeven

De proeven gebruiken een echte verpakte Next.js 16.4.6-productieruntime op
`http://127.0.0.1:3307` en platformbeheer op `http://localhost:3307`, met een eigen
Postgres 17-snapshot en echte PostgREST. De oorspronkelijke lokale database is
uitsluitend gelezen; de testdatabase en haar verbindingen zijn gescheiden.
Auth-identiteit en Storage-transport gebruiken expliciete lokale adapters.
Sessies, platformrechten, RLS, transacties, CAS, historie en contentvalidatie
worden door de echte database gecontroleerd.

De moderne HTTP-keten gebruikt een expliciete lokale SocialHero-claim/verify-
adapter met echte callbacks naar Fieldgrid. Dat bewijst de website-implementatie,
maar vervangt geen pairing met een hosted SocialHero-project, hosted Auth/Storage,
TLS/Caddy of een echte campagneworker. Er zijn geen AI-aanroepen of socialposts
verzonden en geen bestaande hosted websiteverbindingen aangemaakt of gewijzigd.

Een herstart van de werkhost onderbrak een eerdere build en tests. De teststack
is daarna geïsoleerd hersteld en de uiteindelijke proeven zijn opnieuw uitgevoerd.
De aanvankelijke timeout van een bestaande reistest kwam op de herhaling niet
terug; de volledige suite slaagt. Tussen de definitieve HTTP-/browserproeven
zijn de fixture-identiteit en keys niet geroteerd.

## Geautomatiseerde resultaten

| Controle | Resultaat |
| --- | --- |
| Volledige unit-/regressiesuite | 221 bestanden, 2.142 tests geslaagd |
| Volledige lintcontrole | 0 fouten; 49 bestaande waarschuwingen |
| TypeScript | `pnpm typecheck` en de TypeScript-stap van `pnpm build` geslaagd |
| Productiebuild | Next.js 16.4.6 Turbopack geslaagd |
| Verpakte standalone-release | 13 runtime-moduleverwijzingen gematerialiseerd; linkvrij artifact, echte serverboot en statische HTTP geslaagd |
| Database | 20 nieuwe connector-/redactiescenario's en 11 bestaande blogscenario's geslaagd |
| Officiële migratie-CLI | Beide nieuwe migraties opnieuw toegepast: 42 en 27 statements; security advisors 0 bevindingen |
| Upgrade | Bestaande Auth-, tenant-, werkorder- en bloggegevens behouden hun aantallen en hashes; eerdere manifestentries identiek |
| Dependency-audit | 0 high/critical; 3 moderate meldingen |
| Brongeheimencontrole | Geen herkende credentialformaten gevonden; geen uitspraak over onbekende formats of volledige Git-historie |
| Moderne connector-HTTP-keten | 446 controles geslaagd: echte pairingcallback, verloren antwoord, media, concept, lokale redactie, automatische publicatie, opt-outs en onafhankelijke rechten |
| Browser | Echte taxonomie/historie/filters en beveiligde pagina’s geslaagd; aparte expliciete mocks voor herstelstates en 202/200-feedback; 0 browserfouten |
| Publieke browser | Overzicht en detail op desktop/mobiel, oorspronkelijke HTML, H1/H2, media, JSON-LD, Open Graph, X-kaart en sitemap geslaagd; 0 browserfouten |
| Autorisatiereview | 1.566 geïnventariseerde grenzen met afgeronde review en bewijs; uitsluitend taakwijzigingen bijgewerkt |
| Browserbundels | 181 tekstbestanden gecontroleerd; geen herkende credentialformaten |
| Bestaande HTTP-API | Alle 6 groepen geslaagd, inclusief live/concept, media, oude receipts, slugredirect en sitemap |
| Paginering en homepage | 308 bij pagina buiten bereik, noindex bij zoeken en begrensde homepagequery geslaagd |

De databaseproeven omvatten actuele platformautorisatie, voorlopige credentials,
reconnect en oude tokenintrekking, onafhankelijke rechten en opt-outs, auditactor,
bestemmings-/omgevingsisolatie, conflicterende gelijktijdige writes, lockraces,
revisiehistorie, openbare bevestiging, taxonomiearchivering en lege capabilities-
arrays. Ook een handmatige upload voor een SocialHero-artikel wordt aan de
juiste bestemming gebonden, waarna dezelfde machinecredential kan publiceren.

De afzonderlijke SocialHero-correctie in
[PR 4](https://github.com/socialherodgweb/platform/pull/4) laat een actieve koppeling
met uitsluitend `read` of `read,publish` toe. Concept-/mediarechten blijven apart
gecontroleerd. Op de actuele bronbasis slagen 354 tests en TypeScript; vijf
nieuwe tests dekken juist die onafhankelijke rechten en het campagnebeleid.

SocialHero is daarna via het bestaande releaseproces op staging en productie
uitgerold met exact `6697a9b3b72ac55bdb87caef26cf9152cdd07c70`.
Beide readinessroutes geven HTTP 200, de exacte SHA en een actieve worker.
De publieke HTTPS-/browseracceptatie slaagt met 28 controles per omgeving.
Staging: [build 45848780106](https://github.com/socialherodgweb/platform/actions/runs/45848780106),
[activatie 45849059372](https://github.com/socialherodgweb/platform/actions/runs/45849059372).
Productie: [build 45849907212](https://github.com/socialherodgweb/platform/actions/runs/45849907212),
[activatie 45850131630](https://github.com/socialherodgweb/platform/actions/runs/45850131630).
Een eerdere productiebouw stopte gecontroleerd met exit 75 vanwege een tijdelijke
gedeelde buildlock. Na read-only vaststelling dat die vrij was, slaagde dezelfde
workflow voor dezelfde bron-SHA; de lock is niet gewist of omzeild.
Deze applicatie-uitrol heeft geen hosted Fieldgrid-koppeling aangemaakt.

Bewijs: [database](fieldgrid-connector-evidence-20261126/database.json),
[upgrade](fieldgrid-connector-evidence-20261126/upgrade.json),
[moderne HTTP-keten](fieldgrid-connector-evidence-20261126/connector-http.json),
[bestaande HTTP-API](fieldgrid-connector-evidence-20261126/legacy-http.json),
[echte beheerbrowser](fieldgrid-connector-evidence-20261126/management-browser.json)
en [afzonderlijke connector-UI-proeven](fieldgrid-connector-evidence-20261126/connector-browser.json).
De [echte publicatietijdlijn](fieldgrid-connector-evidence-20261126/published-history-browser.json)
en [publieke browser](fieldgrid-connector-evidence-20261126/public-browser.json)
gebruiken geen gemockte API-responses. Beelden:
[connector](fieldgrid-connector-evidence-20261126/connector-desktop.png),
[mobiele connector](fieldgrid-connector-evidence-20261126/connector-mobile.png),
[mobiele instellingen](fieldgrid-connector-evidence-20261126/settings-mobile.png),
[revisietijdlijn](fieldgrid-connector-evidence-20261126/published-history-desktop.png)
en [mobiel artikel](fieldgrid-connector-evidence-20261126/article-mobile.png).

## Configuratie en uitrol

De niet-geheime GitHub Environment-variabele `SOCIALHERO_URL` is ingesteld op
`https://socialhero-staging.dgwebservices.nl` voor staging en
`https://socialhero.dgwebservices.nl` voor productie. Workflows, runtime-writers,
preflight en broker-allowlists geven uitsluitend deze vaste omgevingsconfiguratie
door. De connector gebruikt de bestaande server-encryptiesleutel; er is geen
nieuwe API-key nodig. Geheime configuratiewaarden zijn niet opgevraagd of gelogd.

De implementatie is gepusht als broncommit
`eb1e278353a1f38234e48b14d6aedba8f8bbc894` in PR 605, gevolgd door een gerichte
controle van de HTTP-202-herstelroute en uitsluitend Markdown voor het nieuwe
machinecontract. De verplichte
[CI-run 45849339108](https://github.com/veele-services/platform/actions/runs/45849339108)
werd opnieuw geweigerd voordat stappen konden starten: “The job was not started
because your account is locked due to a billing issue.” GitGuardian heeft beide
featurecommits wel succesvol op geheimen gecontroleerd.

Fieldgrid is daarom niet naar main, staging of productie gepromoveerd.
Op 26 november gaven beide bestaande healthroutes HTTP 200 met de ongewijzigde
staging-SHA `34d649e2d66e2dc2508289f25c846c26860c1447` en productie-SHA
`7398d6cb7f2a2cf75eb22a8b33aa7726fa827eb6`. Beide publieke `/blog`-routes geven
nog HTTP 404; staging behoudt `X-Robots-Tag: noindex, nofollow`.
Na herstel van billing moeten de vereiste PR-/mainchecks slagen, vervolgens
staging met hosted acceptatie en daarna dezelfde SHA naar productie. Er worden
geen verplichte controles overgeslagen. Een hosted Fieldgrid↔SocialHero-koppeling
is nog niet gemaakt of getest.

Herhaal de lokale proeven met `scripts/test-blog-connector-db.mjs`,
`scripts/blog-test-runtime.mjs`, `scripts/test-blog-connector-http.mjs`,
`scripts/test-blog-connector-browser.mjs` en
`scripts/test-blog-management-browser.mjs`. Alleen de guarded geïsoleerde
databaseconfiguratie en private fixturebestanden worden geaccepteerd. Neem die
bestanden nooit op in een PR of publiek artifact.
