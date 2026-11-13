# Fieldgrid publieke blog en SocialHero

Bronrepository: `https://github.com/veele-services/platform`, basiscommit
`34d649e2d66e2dc2508289f25c846c26860c1447` op `main`. Implementatie op
`codex/fieldgrid-blog-socialhero`, Next.js **16.4.6**, React **19.2.6**,
TipTap **3.33.0**. Het ZIP-prototype is uitsluitend een ontwerp-/bronreferentie;
D1, Sites-identiteit, demoartikelen en prototypecredentials zijn niet overgenomen.

De bestaande marketingdispatch (`proxy.ts`, `/fieldgrid-site`), Signature Grid,
Poppins/Inter, platformshell, actuele platformadminregistratie en Supabase Auth
blijven de basis. `/app/nieuws` is tenantnieuws en gebruikt dit model niet.
Er bestond geen publieke artikelen-CMS of geschikte publicatie-API in Fieldgrid.
SocialHero heeft een geschikte generieke v1-client; onderstaande routes volgen
dat bestaande contract, met aanvullende origininformatie voor staging.

| Omgeving | Marketing/publicatiecontrole | SEO-canonical | Bestaand deploymentpad |
| --- | --- | --- | --- |
| lokaal, expliciet testdoel | `FIELDGRID_BLOG_LOCAL_ORIGIN`, uitsluitend HTTP loopback | `https://www.fieldgrid.nl` | lokale checkout |
| staging | `https://www.staging.fieldgrid.nl` | `https://www.fieldgrid.nl` | `/opt/fieldgrid/staging/releases`, atomair `current` |
| bestaande productiearchitectuur | `https://www.fieldgrid.nl` | `https://www.fieldgrid.nl` | `/opt/fieldgrid/production/releases`, atomair `current` |

Promotie en deployment volgen uitsluitend de bestaande releaseflow, inclusief
de verplichte CI-, backup-, migratie- en acceptatiecontroles. Er is geen nieuwe
DNS/TLS-, systemd- of VPS-inrichting nodig. Staging behoudt listener
`127.0.0.1:3301`, zijn eigen projectguards en `noindex, nofollow`. De marketinghost
was op 13 november 2026 bereikbaar; `/blog` gaf vóór deze wijziging HTTP 404.
De feitelijke rolloutstatus staat in het
[acceptatieverslag](../integration/fieldgrid-blog-acceptance.md).

## Redactie en model

`/platform/blog` en `/platform/blog/preview/{id}` eisen elke keer opnieuw een
actieve server-side Auth-sessie en een actueel `platform_admins`-record, op de
platformhost. Supportrechten, tenantrollen en zelf bewerkbare gebruikersmetadata
geven geen redactierecht. De SQL-grens controleert dit onafhankelijk van de UI.

Eén aggregate bewaart `draft`, `revision`, `live`, `live_revision`, de eerste
publicatiedatum en de wijzigingsdatum van de live revisie. Een conceptwijziging
verandert de bestaande live inhoud en live wijzigingsdatum niet. De server
controleert de verwachte revisie; publiceren wisselt de live snapshot atomair.

Artikelvelden: type `blog|article`, `locale=nl-NL`, titel, slug, `slugManual`,
samenvatting, TipTap-document, SEO-titel/-omschrijving, `authorId`, `categoryId`,
tags en twee optionele afbeeldingsvelden. Publiceren vereist inhoud,
samenvatting en een hero met alt-tekst. De auteur `fieldgrid-redactie` is een
werkelijk auteursrecord met naam **Fieldgrid**. Categorie-ID's zijn `planning`,
`werkbonnen`, `klantportaal`, `team-onboarding`; toonlabels staan in capabilities.

TipTap, Markdown-import, servervalidatie en React-renderer ondersteunen dezelfde
blokken en marks: H2–H4, alinea's, lijsten, takenlijsten, citaten, code,
scheidingslijnen, afbeeldingen, tabellen; vet, cursief, onderstrepen, doorhalen,
code, markeren en veilige links. Titel is de enige H1. HTML wordt geen uitvoerbare
inhoud. Documentgrootte, boomdiepte en aantallen zijn begrensd. Afbeeldingen mogen
uitsluitend eigen, geregistreerde assets uit dezelfde site/omgeving zijn.

De slug volgt de titel tot een bewuste slugkeuze; een gepubliceerde URL blijft
bij gewone titelwijzigingen staan. De database reserveert slugs in de werkelijke
scope `(site, environment, /blog)`, inclusief historische publieke slugs. Een
oude slug verwijst rechtstreeks naar de actuele live slug van hetzelfde artikel,
met HTTP 308, zodat geen redirectketens of -lussen ontstaan.

## API en mapping

Basis op de marketinghost: `/api/socialhero/v1`. Alleen de volgende methoden
zijn in de proxy toegestaan; onbekende API-paden en methoden blijven gesloten.
Tenant- en platformhosts geven deze dienst geen marketingrechten.

| Methode/pad | Scope | Verzoek/resultaat |
| --- | --- | --- |
| `GET /capabilities` | `read` | `siteId`, `environment`, `contractVersion='1'`, `blogPath`, typen/formats, locale, rechten, limieten, echte auteurs/categorieën, `publicOrigin`, `canonicalOrigin` |
| `POST /media` | `media:write` | multipart `file`; resultaat `assetId,width,height,type,src` |
| `PUT /posts/{externalId}` | `draft:write` | conceptvelden; bij update `If-Match: "{revision}"`; resultaat `id,externalId,revision,draftRevision,status` |
| `GET /posts/{externalId}` | `read` | dezelfde identiteit, afzonderlijke `draftRevision`/`liveRevision`/`publishedRevision`, status en eventuele publicatie-URLs/tijd |
| `POST /posts/{externalId}/publish` | `publish` | `{revision}`; resultaat `publishedRevision,publicUrl,canonicalUrl,publishedAt` zodra SQL-publicatie verwerkt is |

Elke aanvraag gebruikt `Authorization: Bearer <site-token>`. Elke write heeft
een afzonderlijke `Idempotency-Key` (1–240 ASCII-tekens); updates hebben een
verwachte revisie. Externe IDs zijn stabiel per SocialHero-artikel en bestemming
en uniek binnen site/omgeving. `GET` geeft ook `ETag: "{revision}"`.

Een conceptpayload volgt het bestaande SocialHero-contract:

```json
{
  "type": "blog",
  "locale": "nl-NL",
  "title": "Van planning naar complete werkbon",
  "slug": "planning-complete-werkbon",
  "excerpt": "Vijf concrete stappen voor een vaste overdracht.",
  "content": { "format": "markdown", "body": "## Leg de opdracht vast\nBeschrijf de locatie en het werk." },
  "seo": { "title": "Planning naar werkbon | Fieldgrid", "description": "Maak de overdracht tussen planning, uitvoering en administratie duidelijk." },
  "authorId": "fieldgrid-redactie",
  "categoryId": "planning",
  "tags": ["planning", "werkbonnen"],
  "hero": { "assetId": "<werkelijk-uploadresultaat>", "alt": "Een medewerker controleert een werkbon.", "focalPoint": { "x": 0.55, "y": 0.4 } },
  "ogImageAssetId": "<optioneel-werkelijk-uploadresultaat>"
}
```

`content.format=tiptap` accepteert in `content.body` hetzelfde gevalideerde
JSON-document als de editor. Focuspunten x/y lopen van 0 tot 1 vanaf linksboven.
`publicUrl` is de absolute URL op het geconfigureerde verificatiedoel;
`canonicalUrl` is de productiecanonical zonder meetparameters. Staging kan dus
zonder een productiepublicatie worden gecontroleerd. De oorspronkelijke HTML
bevat canonical, Open Graph, X-kaart en `socialhero:external-id` en
`socialhero:revision`; metadata wordt hiervoor niet naar de body gestreamd.
JSON-LD bevat de echte auteur en live publicatie-/wijzigingsdatums. Het brede
deelbeeld heeft voorrang; de hero is de terugval. Afbeeldings-URLs zijn absoluut.

| Code | HTTP | Correctie/herstel |
| --- | --- | --- |
| `PERMISSION_DENIED` | 401/403 | verbind opnieuw met een geldig credential en passende scopes |
| `SLUG_CONFLICT` | 409 | kies een andere slug, keur gewijzigde inhoud opnieuw goed |
| `REVISION_CONFLICT` | 409 | haal de actuele revisie op; overschrijf geen nieuwer concept |
| `IDEMPOTENCY_CONFLICT` | 409 | gewijzigde inhoud krijgt een nieuwe operatie/sleutel |
| `INVALID_MEDIA` | 422 | upload een geldig eigen beeld, controleer alt-tekst en focus |
| `VALIDATION_ERROR` | 400/422 | corrigeer de concrete artikelvelden of taxonomie |
| `PAYLOAD_TOO_LARGE` | 413 | verklein artikel of bestand |
| `RATE_LIMITED` | 429 | volg `Retry-After`, behoud de oorspronkelijke sleutel |
| `NOT_FOUND` | 404 | controleer artikelidentiteit en bestemming |
| `TEMPORARILY_UNAVAILABLE` | 503 | lees eerst de status; herhaal dezelfde operatie begrensd |

Foutresponses bevatten geen SQL, token, providercredential of verbindingsdetails.

## Media, credentials en herstel

De private Supabase-bucket `fieldgrid-blog-media` gebruikt eigen asset-IDs en
paden `fieldgrid/{environment}/{assetId}.{ext}`. Uploads zijn maximaal 10 MiB,
8192 pixels per zijde en 24 miljoen pixels. JPEG/PNG/WebP worden op signature,
werkelijk formaat, volledige decodering en dimensies gecontroleerd en opnieuw
gecodeerd zonder oorspronkelijke metadata. SVG/HTML, animaties, onleesbare
bestanden en een onjuist MIME-type worden afgewezen.

`/blog-media/{assetId}` levert uitsluitend media van een actuele, niet-test-live
revisie zonder login. Voor conceptmedia is actuele platformredactie vereist.
Supabase-objecten zijn zelf niet publiek. De respons bevat nosniff en een gesloten
content security policy. Alleen actuele publieke productiebeelden zijn indexeerbaar;
concept- en stagingbeelden behouden noindex. Geen willekeurige externe media-URL's of signed URLs
worden in de artikelinhoud opgeslagen.

Een deterministische asset-ID en onveranderlijk Storagepad maken herstel na een
afgebroken upload mogelijk. Pas na succesvolle opslag schrijft één SQL-transactie
assetmetadata en het duurzame idempotentieresultaat. Dezelfde bytes/sleutel
hergebruiken hetzelfde object; andere inhoud met dezelfde sleutel krijgt een
conflict. Een crash vóór SQL-registratie kan een niet-geregistreerd privaat object
achterlaten; dezelfde operatie hervat dit veilig. Verwijder zulke weesobjecten
alleen als bewuste onderhoudshandeling nadat actieve retries zijn uitgesloten.

Artikelmutatie, live wissel, slugreservering en resultaatregistratie zijn atomair.
Het receipt wordt vóór de actuele revisiecontrole gelezen: ook een antwoord dat
verloren ging kan later met dezelfde sleutel worden teruggelezen. Advisory locks
serialiseren gelijktijdige retries; gewijzigde payload of verwachte revisie met
dezelfde sleutel geeft een conflict. Dienstcredentials worden in de mutatie nog
eens gecontroleerd en gelockt tegen intrekken. Limiet: 60 aanvragen per minuut
per credential, met duurzaam bijgehouden venster en `Retry-After`.

Fieldgrid bewaart uitsluitend SHA-256-hashes, scopes, omgeving, label en
vervaltijd van sitecredentials. Een credential is intrekbaar; rotatie registreert
eerst een nieuw credential en trekt na reconnect het oude in. Tokens gaan nooit
naar een browserresponse, URL, log of repository. Elke website/omgeving gebruikt
een ander credential. De meetpixel blijft afzonderlijk geconfigureerd; de
OpenAI-sleutel hoort uitsluitend bij SocialHero's bestaande AI-configuratie.

## Configuratie en release

Er zijn geen nieuwe verplichte Fieldgrid-runtimevariabelen voor staging.
`DEPLOY_TARGET` bepaalt de scope; origins liggen vast in de architectuur.
`FIELDGRID_BLOG_LOCAL_ORIGIN` is een optionele lokale testvoorziening, genegeerd
buiten lokale ontwikkeling. Alleen de afzonderlijke lokale acceptatiescripts
vereisen `FIELDGRID_BLOG_TEST_DATABASE_URL` uit een server-side procesvariabele;
deze wordt strikt begrensd tot de eigen loopbackdatabase en nooit uit `.env`
geladen. Dit is geen staging- of productieruntimevariabele. De bestaande Supabase-URLs, serverkey en migration
projectguards blijven de releaseflow bepalen. Stagingconfiguratie komt uitsluitend
uit GitHub Environment `staging`, nooit uit lokale `.env`-bestanden of legacy.

Voeg als operator een afzonderlijk sitecredential aan de secretvoorziening voor
die omgeving toe. `scripts/blog-credential.ts register <label>` leest het token
uitsluitend van stdin en retourneert alleen credential-ID, handeling en omgeving.
Het verwacht `MIGRATION_DATABASE_URL`, bestaande projectguards,
`FIELDGRID_BLOG_TOKEN_EXPIRES_AT` en optioneel `FIELDGRID_BLOG_TOKEN_SCOPES`.
`revoke <credentialId>` trekt de hashregistratie in. Remote doelen gebruiken de
bestaande staging/productieprojectguards en geverifieerde TLS. Lokale uitvoering
vereist `FIELDGRID_BLOG_LOCAL_TEST=1` en een expliciete loopbackdatabase met prefix
`fieldgrid_blog_`. Deze scripts voeren geen automatische registraties uit.

Migratie: `supabase/migrations/20261113124643_fieldgrid_blog_socialhero.sql`,
opgenomen in het bestaande inhoudsmanifest en de gewone releasevolgorde.
Promoveer pas na review via `main`; staging ontvangt een expliciet gekozen SHA.
Controleer vóór promotie de migratie op representatieve bestaande data en na
release draft/live/revisie/redirect plus `/api/healthz` en exacte release-SHA.

Het overzicht, detail en sitemap lezen runtimecontent. Publicatie invalideert
`/fieldgrid-site/[[...path]]` en `/fieldgrid-site/sitemap.xml`, de daadwerkelijke
Next.js-rewritebestemmingen. Er is geen buildhook nodig. Concepten, previews en
expliciete testrecords staan niet in publieke lijst of sitemap. Buiten productie
zijn ook normale testpublicaties noindex. SocialHero behandelt een onbereikbare
of verouderde pagina als **wacht op website**; afhankelijke socialposts blijven
wachten tot canonical en revisiemarkers zonder auth kloppen. Herstel en fouten
staan bij SocialHero's artikel/publicatiedetail, met oorspronkelijke operatie,
volgende poging en actie voor de beheerder.

Feitelijke uitvoerresultaten en beperkingen staan in
[het acceptatieverslag](../integration/fieldgrid-blog-acceptance.md).

## Technische bronnen

- [Next.js 16: revalidatePath en rewritebestemmingen](https://nextjs.org/docs/app/api-reference/functions/revalidatePath)
- [Google: Article en indexeerbare afbeeldingen](https://developers.google.com/search/docs/appearance/structured-data/article)
- [Google: sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Supabase: RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase: private Storage](https://supabase.com/docs/guides/storage/security/access-control)
- [OWASP: REST Security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)
