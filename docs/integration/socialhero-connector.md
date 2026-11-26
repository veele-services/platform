# SocialHero koppelen aan Fieldgrid

De ontvangende website is Fieldgrid (`veele-services/platform`), Next.js 16.4.6.
De bestaande blogservice, TipTap-redactie, private Storage, publicatie/revisies,
metadata, sitemap en redirects blijven de CMS-adapter. Dit document beschrijft
het gedeelde koppelcodecontract v1 van 26 november 2026. DartFlow is geen
onderdeel van deze implementatie.

## Websitebeheer en toestemming

Een actuele platformbeheerder opent **Platform → Blogredactie → SocialHero**,
op `/platform/blog/socialhero`. De pagina en iedere beheer-API-aanroep controleren
de bestaande Auth-sessie en platformadminregistratie opnieuw. Tenantrollen of
supporttoegang geven geen toegang.

1. Maak in SocialHero bij het juiste project een koppelcode voor de betreffende
   Fieldgrid-marketingorigin en omgeving.
2. Plak die code in het wachtwoordveld. Controleer vóór **Verbinden** de opties
   **SocialHero mag concepten aanleveren** en **SocialHero mag automatisch
   publiceren**. Bij een eerste bestemming staan beide aan. De uitleg luidt:
   ‘SocialHero mag artikelen zelfstandig live zetten volgens de campagneplanning
   en de ingestelde goedkeuringsmodus.’ Zet een recht desgewenst uit en kies
   **Verbinden** om deze zichtbare keuze te bevestigen. De website bepaalt
   zelf identiteit, omgeving en serveradres. De code blijft hooguit twee minuten
   in het invoerveld en komt niet in een URL, browseropslag of response.
3. Na verificatie staat de koppeling actief met de bevestigde rechten. Er volgt
   geen extra handmatige publicatiebevestiging op Fieldgrid. Bij een
   onderbroken installatie kan **Verificatie hervatten** dezelfde poging afmaken.
4. Pas de twee rechten later desgewenst aan en sla de toestemmingen op.
   Zonder publicatietoestemming weigert Fieldgrid iedere expliciete
   SocialHero-publicatie. Zonder conceptrecht weigert de server nieuwe media
   en concepten. De keuze, beslisser en datum worden per bestemming en omgeving
   bewaard. Uitzetten wordt bij de
   volgende schrijftransactie afgedwongen, ook wanneer een worker oudere
   capabilities heeft onthouden.
5. **Verbinding controleren** controleert de lokale credential en het actuele
   beleid. SocialHero voert vanuit zijn eigen beheer de controle van de website
   uit. Fieldgrid bewaart na activatie uitsluitend een tokenhash en kan daarom
   geen bearer namens de website naar SocialHero terugsturen.
6. **Ontkoppelen** trekt de lokale toegang direct in en wist voorlopige geheimen.
   Artikelen, publieke URLs, externe mappings en idempotentieresultaten blijven
   behouden. Opnieuw koppelen met dezelfde bestemming gebruikt die geschiedenis.
   Een eerder uitgeschakeld recht blijft bij opnieuw koppelen uitgeschakeld;
   alleen een bewuste wijziging van het opgeslagen beleid kan het weer aanzetten.

De website accepteert één actieve verbinding per site/omgeving. Bij opnieuw
koppelen blijft de bestaande actieve verbinding geldig totdat de nieuwe
verificatie is bevestigd; daarna wordt precies de voorgaande credential
ingetrokken. Een onvoltooide oude aanvraag kan geen nieuwere koppeling activeren.

## Serverconfiguratie en release

| Instelling | Staging | Productie |
| --- | --- | --- |
| Bestaande `APP_URL` (platformbeheer) | `https://staging.fieldgrid.nl` | `https://fieldgrid.nl` |
| Vaste site-ID | `fieldgrid` | `fieldgrid` |
| Website-origin voor het contract | `https://www.staging.fieldgrid.nl` | `https://www.fieldgrid.nl` |
| Nieuwe variabele `SOCIALHERO_URL` | `https://socialhero-staging.dgwebservices.nl` | `https://socialhero.dgwebservices.nl` |
| SEO-canonical | `https://www.fieldgrid.nl` | `https://www.fieldgrid.nl` |
| Runtime/deploypad | `/opt/fieldgrid/staging` | `/opt/fieldgrid/production` |

`SOCIALHERO_URL` komt uitsluitend uit de betreffende GitHub Environment.
De bestaande workflows, runtime-writers en broker-allowlists geven die variabele
door. Bij ontbreken blijft de connector ongeconfigureerd; een verkeerd adres
geeft geen netwerktoegang. Lokale intrekking blijft ook bij foutieve configuratie
beschikbaar. Er is geen fallback naar een andere omgeving of naar een `.env`.

Tijdelijke provisioninggegevens gebruiken AES-256-GCM met een willekeurige nonce
en een via HKDF afgeleide sleutel uit de bestaande
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`. Website, omgeving, beide origins en
serverpoging zijn cryptografisch gebonden. Er is geen extra langlevend geheim
nodig. Sleutelrotatie tijdens een voorlopige poging kan opnieuw koppelen vereisen.
De bestaande worker ruimt verlopen voorlopige kopieën op; iedere connector-RPC
voert dezelfde opruiming uit. Na activatie, intrekking of definitieve afwijzing
blijft geen ontsleutelbare bearer of code opgeslagen.

De forward migrations zijn
`supabase/migrations/20261126110835_fieldgrid_blog_connector.sql` en
`supabase/migrations/20261126113033_fieldgrid_blog_editorial_history.sql`, na de
bestaande blogmigratie `20261113124643_fieldgrid_blog_socialhero.sql`. Ze voegen private
bestemmingen, koppelpogingen en installaties toe en voegt een bestemmingsscope toe
aan artikelen, assets, credentials en receipts, plus toestemmingaudits,
onveranderlijke revisies, publicatiegebeurtenissen en openbare bevestigingen.
Bestaande records behouden een
gereserveerde legacyscope. De eerdere migratie en bestaande history worden niet
herschreven. Deployen volgt de bestaande backup-, migratie-, CI- en acceptatiegates.

## Wirecontract en bestaande API

De server claimt een code met exact
`{code, attemptId, siteId, origin, environment, contractVersion: 1}` via
`POST /api/integrations/blog/v1/pairings/claim` op de vaste SocialHero-server.
Het geheime antwoord wordt eerst duurzaam als voorlopige koppeling opgeslagen.
Pas daarna begint
`POST /api/integrations/blog/v1/pairings/{connectionId}/verify`. SocialHero leest
met dezelfde bearer de website-capabilities. Alleen een passende
`{connectionId, status: "verified"}` activeert de lokale credential.

Verloren claimantwoorden gebruiken dezelfde server-side `attemptId`; verloren
verificatieantwoorden gebruiken de opgeslagen voorlopige credential. De client
hoeft daarbij geen geheime serverrespons te bewaren. Een `pending` credential
kan uitsluitend capabilities lezen; andere blogroutes geven
`PAIRING_IN_PROGRESS` met `Retry-After`.

De marketingproxy laat uitsluitend deze methoden toe:

| Methode | Pad | Beleid voor een gekoppelde credential |
| --- | --- | --- |
| GET | `/api/socialhero/v1/capabilities` | `read`; pending toegestaan |
| POST | `/api/socialhero/v1/media` | actieve `draft` |
| PUT | `/api/socialhero/v1/posts/{externalId}` | actieve `draft`, verplichte `baseRevision` |
| GET | `/api/socialhero/v1/posts/{externalId}` | actieve `read` |
| POST | `/api/socialhero/v1/posts/{externalId}/publish` | actieve `publish` én actuele lokale toestemming |
| DELETE | `/api/socialhero/v1/connection` | trekt uitsluitend deze actieve credential in |

Capabilities gebruiken numerieke versie `1`, `connectionId`, `destinationId`,
`credentialState`, vaste site/origin/omgeving, `scopes`, echte auteurs/categorieën
en `media.mimeTypes/maxBytes`. Bij conceptaanmaak is `baseRevision: null`
verplicht; daarna de actuele numerieke revisie. Type, taal, titel en Markdown
zijn verplicht. Een ingestelde hero vereist een eigen asset en alt-tekst.
Fieldgrid gebruikt standaard auteur `fieldgrid-redactie` en categorie `planning`.

Antwoorden gebruiken `postId`, `externalId`, `slug`, `state`, `revision`,
`draftRevision`, `publishedRevision`, `previewUrl`, `publicUrl`, `publishedAt`.
Ontbrekende optionele waarden zijn `null`. De afgeschermde editorpreview staat
op een andere origin en wordt daarom niet als machine-URL meegestuurd:
`previewUrl` is `null`; redacteuren gebruiken de bestaande platformpreview.
Publiceren wordt pas als `published` bevestigd wanneer een anonieme GET op de
werkelijke omgeving de exacte externe artikel-ID en revisie in de oorspronkelijke
HTML-head toont. Alleen HTTP 200 is onvoldoende. Tot die bevestiging geeft de
publicatieroute HTTP 202, `state: "publishing"` en `Retry-After: 5`; een volgende
statusaanvraag of dezelfde publicatie kan de duurzame bevestiging afronden.
De SEO-canonical bepaalt deze verificatiebestemming niet.

Een live artikel kan een nieuwere conceptrevisie bevatten zonder de publieke
versie te wijzigen. Media antwoorden met `assetId`, `mimeType`, `width`, `height`.

De bestaande operatorcredentials blijven een afzonderlijke compatibiliteitslaag
met het eerdere `If-Match`-, `id/status`- en `media:write/draft:write`-contract.
Gekoppelde credentials worden daar niet geaccepteerd en kunnen zo het nieuwe
beleid niet omzeilen. Nieuwe operatorregistratie geeft standaard geen
publicatierecht. Gebruik de koppelcode-UI voor nieuwe SocialHero-verbindingen.

Fouten gebruiken gecontroleerde `code`, `message`, `requestId` en `no-store`.
De aanvullende `error`-tekst blijft behouden voor eerdere clients. Codes of
tokens en ruwe provider-/databasefouten worden niet teruggestuurd of gelogd.
429 bevat `Retry-After`. Alle machinewrites vereisen een eigen
`Idempotency-Key`, duurzaam gescheiden per bestemming en operatie. Gewijzigde
inhoud met dezelfde sleutel conflicteert; een nieuwe verbinding met dezelfde
bestemming behoudt eerdere resultaten. Slugs blijven uniek in de publieke
site/omgeving, ook tussen verschillende bestemmingen.

## Stagingcanonical en openbare controle

De eigenaar heeft expliciet gekozen om de productiecanonical ook op staging te
behouden. Staging blijft `noindex`. Capabilities geven daarom het afzonderlijke
`canonicalOrigin: "https://www.fieldgrid.nl"` terug; het geregistreerde `origin`
en `publicUrl` blijven de stagingmarketinghost. SocialHero ondersteunt deze
expliciete scheiding vanaf de gecontroleerde versie
`7358b38e1d2e21b97d233ba8833d673520a4a50c`.
De verifier haalt de stagingpagina op en vergelijkt haar canonical met de
opgegeven productiecanonical. Hij gebruikt nooit de productiepagina voor een
stagingpublicatietest. Eerdere versies die beide origins gelijk eisen kunnen
blijven wachten; afhankelijke socialposts mogen dan niet worden vrijgegeven.
Deze broncontrole en lokale proeven zijn geen hosted stagingacceptatie.

## Dagelijkse redactie

Open **Blogredactie** op `/platform/blog`, kies **Nieuw artikel**, vul auteur,
categorie en SEO in en bewerk de inhoud met TipTap. Upload de hero, vul alt-tekst
in en kies het focuspunt. **Opslaan** bewaart een aparte conceptrevisie;
**Voorbeeld** opent de afgeschermde werkelijke artikelweergave. Publiceren wisselt
de live revisie atomair. Bij een vertraagde openbare bevestiging toont de editor
**Publicatie controleren**; dezelfde knop controleert opnieuw zonder een nieuwe
conceptrevisie te maken.

De tijdlijn toont onveranderlijke revisies en publicatiegebeurtenissen met
beslisser, tijdstip en bron. Oude records waarvan geen oorspronkelijke beslisser
bekend is, zijn herkenbaar als migratiehistorie. Onder **Instellingen** op
`/platform/blog/instellingen` beheert de redacteur auteurs en categorieën.
Archiveren verwijdert geen bestaande artikelverwijzingen. De lijst ondersteunt
zoeken, status en categorie; het publieke overzicht laadt twaalf live artikelen
per pagina.

Laat SocialHero na koppelen eerst capabilities ophalen, een afbeelding uploaden
en een concept met `baseRevision: null` aanleveren. Dat verschijnt direct in
dezelfde bloglijst. SocialHero gebruikt de ontvangen revisie bij bewerken en
publiceren; een lokale wijziging veroorzaakt bij een oude job
`REVISION_CONFLICT`. Bij een mislukte publicatie staan status en foutcode in
SocialHero; Fieldgrid toont de live/conceptrevisies en de openbare bevestiging
in de tijdlijn. Gebruik dezelfde operatie en idempotentiesleutel om na een
tijdelijke fout veilig te hervatten.

## Installatie bij een volgende Next.js-website

De lokale module `lib/socialhero-connector` bevat uitsluitend contractvalidatie,
HTTPS-transport, versleuteling en de hervatbare pairingflow. Er is geen bestaand
privaat pakketbeheer in deze repository dat hiervoor moet worden uitgebreid.
De module gebruikt Node en het al aanwezige gepinde Zod; publiceren naar een
pakketregistry is niet nodig.

1. Neem de module over in de volgende workspace en lever vaste
   `PairingConfiguration` uit haar deploymentconfiguratie.
2. Implementeer `PairingPersistence.write` en `.secret` met het bestaande
   databasebeveiligingsmodel. De write moet status en hash vóór verify committen;
   encrypted secrets blijven uitsluitend server-side. Behoud CAS/locking en
   opruiming bij afloop. Gebruik voor AES een bestaande geschikte serverkey en
   een binding met site/omgeving/origins/poging.
3. Verbind de beveiligde beheerpagina met die flow en implementeer de vaste
   capabilities/publicatieroutes via de bestaande CMS-service. Map auteur,
   categorie, hero, concept/live-revisies, slugs, previews en cachehooks.
4. Scope de CMS-mappings, media en receipts tot de server-geauthenticeerde
   `destinationId`; controleer lokale publicatietoestemming bij iedere transactie.

De concrete Fieldgrid-adapter is `lib/blog/connector-{config,data,admin}.ts`,
`service-api.ts`, `auth.ts`, `media.ts` en de genoemde migratie. De editor en de
machine-adapter gebruiken dezelfde gevalideerde blogaggregate; de nieuwe module
is geen tweede CMS.

## Verificatie

De feitelijke testresultaten worden vastgelegd in het
[acceptatieverslag](fieldgrid-blog-acceptance.md). Bronreview van het actuele
SocialHero-protocol is gedaan op de basis met runtimecommit
`7358b38e1d2e21b97d233ba8833d673520a4a50c` en de correctie voor onafhankelijke
rechten in `6697a9b3b72ac55bdb87caef26cf9152cdd07c70`; claim/verify-routes bestaan op beide
vaste origins. Een read-only bereikbaarheidsproef is geen echte koppeling met
een hosted project. Lokale contractfixtures, echte databaseproeven en eventuele
hosted resultaten worden afzonderlijk gerapporteerd.
