# Research: knowledgebase, roadmapbord en releasebeheer

Datum: 2026-07-06

Dit document beschrijft hoe Fieldgrid drie vaste productonderdelen kan toevoegen:

- Handleidingen / knowledgebase
- Roadmapbord / featurewensen
- Releasebeheer / versienotes

Fieldgrid is multi-tenant. Alle voorstellen in dit document gebruiken generieke termen zoals tenant, platform admin, tenant admin, personnel portal, customer portal, knowledgebase, article, roadmap item, release note, audience en module. Er is geen tenant-specifieke hardcoding nodig.

## 1. Samenvatting

De beste aanpak is om knowledgebase, roadmap en releases als globale platformmodules te modelleren, met tenant-, module-, audience- en permissie-scopes als zichtbaarheidssysteem.

Platform admins beheren standaard de globale content. Tenant admins kunnen globale content bekijken als die relevant is voor hun tenantmodules en rol, en kunnen featurewensen indienen. Tenant-specifieke knowledgebase-artikelen kunnen later optioneel worden toegevoegd, maar horen niet in de MVP tenzij expliciet gewenst.

Aanbevolen MVP:

- Platform admin krijgt beheer voor knowledgebase-artikelen, categorieen, roadmapitems en releases.
- Tenant backoffice krijgt Help, Roadmap/Wensen en Release notes.
- Personnel PWA krijgt Help en Release notes die alleen voor personnel-audience en actieve modules gelden.
- Customer PWA krijgt Help en Release notes die alleen voor customer-audience en actieve modules gelden.
- Release highlights worden als audience-scoped gele balk getoond en per gebruiker dismissable gemaakt.
- Tooltips/help-iconen worden gekoppeld aan knowledgebase-artikelen en volgen dezelfde visibilityregels.
- TipTap wordt de editor voor knowledgebase-artikelen. De repo heeft al TipTap-dependencies en een nieuws-editor als bestaand patroon.

## 2. Analyse huidige codebase

### 2.1 Werkruimtes en applicaties

De relevante applicaties in de repo:

- `artifacts/backoffice`: Next.js backoffice voor platform admin en tenant admin.
- `artifacts/klant-pwa`: customer portal / customer PWA.
- `artifacts/personeel-pwa`: personnel portal / personnel PWA.
- `lib/db`: Drizzle schema, database helpers, tenant context, entitlements, storage helpers.

### 2.2 Platform admin routes

Platform admin zit onder `artifacts/backoffice/src/app/(platform)/platform`.

Bestaande platformroutes:

- `/platform`: dashboard.
- `/platform/onboarding`: tenant onboarding/provisioning.
- `/platform/tenants`: tenantlijst.
- `/platform/tenants/[tenantId]`: tenantdetails.
- `/platform/subscriptions`: subscriptions.
- `/platform/tickets`: support/tickets.
- `/platform/notifications`: platformnotificaties.
- `/platform/operations`: operations en staging smoke.
- `/platform/staging-smoke`: staging smoke detail.
- `/platform/users`: platformgebruikers.
- `/platform/settings`: platforminstellingen.
- `/platform/security`: security en audit.

Nieuwe platformroutes passen logisch naast deze routes:

- `/platform/knowledgebase`
- `/platform/knowledgebase/articles`
- `/platform/knowledgebase/articles/[articleId]`
- `/platform/knowledgebase/categories`
- `/platform/knowledgebase/tooltips`
- `/platform/roadmap`
- `/platform/roadmap/[itemId]`
- `/platform/releases`
- `/platform/releases/[releaseId]`

### 2.3 Tenant backoffice routes

Tenant backoffice gebruikt tenant host context en routes op rootniveau. De sidebar bevat onder andere:

- `/`
- `/planning`
- `/assignments`
- `/quotes`
- `/customers`
- `/objects`
- `/personnel`
- `/materials`
- `/inventory`
- `/personnel/verlof`
- `/reports`
- `/invoices`
- `/documents`
- `/tickets`
- `/news`
- `/settings`

Nieuwe tenant backoffice routes:

- `/help`
- `/help/[slug]`
- `/roadmap`
- `/roadmap/new`
- `/roadmap/[slug]`
- `/releases`
- `/releases/[slug]`

### 2.4 Customer portal routes

Customer PWA bevat routes voor opdrachten, objecten, offertes, facturen, documenten, rapporten, tickets, meldingen, profiel, instellingen en beveiliging. Extern worden deze onder tenantdomeinen via `/klant` aangeboden.

Nieuwe customer portal routes:

- `/help`
- `/help/[slug]`
- `/releases`
- `/releases/[slug]`

Extern verwacht:

- `https://{tenant-domain}/klant/help`
- `https://{tenant-domain}/klant/help/{slug}`
- `https://{tenant-domain}/klant/releases`

### 2.5 Personnel portal routes

Personnel PWA bevat routes voor planning, open diensten, uren, berichten, meldingen, beschikbaarheid, verlof, documenten, nieuws, profiel, instellingen, materiaal en inventaris. Extern worden deze onder tenantdomeinen via `/personeel` aangeboden.

Nieuwe personnel portal routes:

- `/help`
- `/help/[slug]`
- `/releases`
- `/releases/[slug]`

Extern verwacht:

- `https://{tenant-domain}/personeel/help`
- `https://{tenant-domain}/personeel/help/{slug}`
- `https://{tenant-domain}/personeel/releases`

### 2.6 Bestaande module-entitlements

Modules staan in `lib/db/src/schema/modules.ts`.

Huidige module keys:

- `customers`
- `objects`
- `personnel`
- `assignments`
- `planning`
- `reporting`
- `documents`
- `finance`
- `customer_portal`
- `personnel_portal`
- `notifications`
- `smart_planning`
- `materials`
- `inventory`

Tenantmodules worden opgeslagen in `tenant_modules`. `lib/db/src/tenant-entitlements.ts` bevat onder andere:

- `isTenantModuleEnabled(tenantId, moduleKey)`
- `requireTenantModule(tenantId, moduleKey)`
- plan fallback via subscriptions, tenant plan en default modules.

`artifacts/backoffice/src/lib/auth/permissions.ts` filtert runtime permissies op actieve modules via `moduleForPermissionResource`.

Conclusie: nieuwe zichtbaarheid moet dezelfde entitlements gebruiken. Knowledgebase- en releasecontent mag zelf globaal zijn, maar moet via join-tabellen aan target modules worden gekoppeld. Query's moeten alleen content tonen waarvoor de tenant de target modules actief heeft.

### 2.7 Bestaande permissies

Tenant permissies gebruiken het patroon `resource:action`. Server-side helpers gebruiken `hasPermission(resource, action)` en `requirePermission(resource, action)`.

`lib/db/src/module-permissions.ts` koppelt bestaande resources aan modules. Nieuwe resources moeten hier worden toegevoegd:

- `knowledgebase` of `kb`
- `roadmap`
- `releases`
- `help_tooltips`

Let op: deze resources geven toegang tot de feature zelf. De zichtbaarheid van individuele artikelen/releases blijft daarnaast afhankelijk van target modules, audiences en permissions.

### 2.8 Bestaande content/editor-patronen

Er is al een TipTap-gebaseerde nieuws-editor:

- `artifacts/backoffice/src/components/news/TipTapNewsEditor.tsx`
- dependencies in `artifacts/backoffice/package.json`:
  - `@tiptap/react`
  - `@tiptap/starter-kit`
  - `@tiptap/extension-link`
  - `@tiptap/extension-placeholder`

Nieuws ondersteunt:

- HTML en JSON content.
- Statussen draft/scheduled/published/archived.
- Audiences zoals personnel, customers, sectoren, customer types.
- Auditlog bij acties.
- Hero image upload.

Conclusie: TipTap is de logische editorbasis voor knowledgebase. De huidige nieuws-editor is te smal voor handleidingen, maar bruikbaar als startpunt.

### 2.9 Bestaande storage/media-aanpak

`lib/db/src/storage-paths.ts` heeft tenant-bound storagehelpers:

- `buildTenantStoragePath(tenantId, parts)`
- `getTenantBoundStoragePath(path, tenantId)`
- canonical path: `tenant/{tenantId}/...`

Documenten gebruiken signed URLs:

- `artifacts/backoffice/src/app/actions/documents.ts`
- bucket `documents`
- tenant-bound storage path
- entityvalidatie op tenant
- signed URL TTL van 1 uur

Nieuws gebruikt publieke hero image upload in bucket `news-hero`. Voor knowledgebase is tenant/global privacy belangrijker dan publieke hero images.

Aanbeveling: knowledgebase-media gebruikt een aparte bucket of `documents`-achtige private delivery met signed URLs, behalve expliciet publieke marketing/help-assets.

### 2.10 Tenant domains en platform hosts

`lib/db/src/tenant-context.ts` bevat:

- root domain `fieldgrid.nl`
- default platform hosts `admin.fieldgrid.nl`, `platform.fieldgrid.nl`, `staging.fieldgrid.nl`
- platformhost filtering
- herkenning van `{slug}.fieldgrid.nl`

`lib/db/src/schema/tenant-domains.ts` bevat tenant custom domains met verificatievelden en primary domain support.

Conclusie: help deep links moeten tenantcontext via host of shortcode oplossen en daarna dezelfde visibilityregels toepassen.

### 2.11 Notificaties

Er zijn twee relevante lagen:

- Platformnotificaties in `platform_notification_dispatches` en `platform_notification_recipients`.
- Tenant notificaties in `notification_event_settings`, `notification_dispatches`, `notification_delivery_queue`, push subscriptions en native push device tokens.

Platformnotificaties hebben audience types zoals:

- `platform_users`
- `tenant_owners`
- `tenants_by_plan`
- `tenants_by_module`
- `tenants_with_readiness_issue`

Conclusie: release-publicatie en belangrijke knowledgebase updates kunnen aansluiten op bestaande notification queue en platform notification dispatches.

### 2.12 Auditlog

`audit_log` is append-only en ondersteunt:

- `tenant_id` optioneel voor platform-only/global acties.
- `user_id`
- `action`
- `resource`
- `resource_id`
- `metadata`

Conclusie: knowledgebase, roadmap, releases, tooltips en media-acties kunnen zonder nieuw auditmechanisme worden gelogd.

## 3. Functionele requirements knowledgebase

### 3.1 Doel

De knowledgebase geeft duidelijke, professionele uitleg over Fieldgrid-functionaliteit voor:

- platform admins
- tenant admins
- tenant management
- tenant planning
- tenant administratie
- tenant personeel
- tenant klanten
- support

Een artikel legt uit:

- wat een functie doet;
- waar de functie staat;
- wanneer de functie gebruikt wordt;
- hoe de gebruiker stap voor stap werkt;
- welke rechten nodig zijn;
- welke modules nodig zijn;
- welke problemen vaak voorkomen;
- welke gerelateerde artikelen relevant zijn.

### 3.2 Artikelmodel

Minimale velden:

- `id`
- `tenant_id` nullable
- `scope`: `platform_global` of `tenant`
- `title`
- `slug`
- `summary`
- `content_json`
- `content_html`
- `content_text`
- `category_id`
- `status`: `draft`, `published`, `archived`
- `featured`
- `language`
- `sort_order`
- `published_at`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`
- `archived_at`

Via join-tabellen:

- audiences
- modules
- permissions
- media
- related articles
- search terms
- version history

### 3.3 Categories/modules

Categorieen worden beheerd door platform admins. Categorieen kunnen gekoppeld worden aan modules, maar hoeven niet altijd exact gelijk te zijn aan een module.

Voorbeelden:

- Platformbeheer
- Tenantbeheer
- Dashboard
- Klanten
- Objecten
- Werkbonnen / opdrachten
- Planning
- Personeel
- Personnel portal
- Customer portal
- Rapportages
- Facturen
- Betalingen
- Tickets
- Documenten
- Materiaalbeheer
- Inventarisbeheer
- Instellingen
- Rollen en permissies
- Releasebeheer
- Roadmap

Categorieen krijgen optioneel `module_key`. Als een categorie aan een module hangt en de tenant heeft die module niet actief, dan wordt de categorie niet getoond.

### 3.4 Audiences

Aanbevolen canonical audience keys:

- `platform_admin`
- `tenant_admin`
- `tenant_management`
- `tenant_planning`
- `tenant_administration`
- `tenant_personnel`
- `tenant_customer`
- `support`

Een artikel kan meerdere audiences hebben.

Voorbeelden:

- "Een nieuwe werkbon aanmaken": `tenant_admin`, `tenant_planning`
- "Mijn planning bekijken": `tenant_personnel`
- "Factuur betalen via iDEAL": `tenant_customer`
- "Tenantmodules beheren": `platform_admin`

### 3.5 Visibilityregels

Een artikel is zichtbaar als alle onderstaande regels kloppen:

1. De gebruiker is ingelogd, behalve als later expliciet publieke help wordt toegevoegd.
2. Scope klopt:
   - platform admins mogen global en tenant-specific previewen;
   - tenantgebruikers mogen alleen global tenant-visible of eigen tenantcontent zien.
3. Artikelstatus is `published`.
4. Artikel is niet gearchiveerd.
5. Audience matcht de gebruiker.
6. Tenant heeft minimaal de vereiste gekoppelde module(s) actief.
7. Gebruiker heeft gekoppelde permissies als het artikel permissies vereist.
8. Portal boundary klopt:
   - platform admin artikelen niet in tenantportalen;
   - personnel artikelen niet in customer portal;
   - customer artikelen niet in personnel portal.
9. Gerelateerde artikelen en tooltiplinks worden opnieuw door dezelfde visibilityfilter gehaald.

Platform admins kunnen alle artikelen beheren, inclusief concepten en gearchiveerde artikelen. Preview als doelgroep moet server-side dezelfde filterfunctie gebruiken met een gesimuleerde audience/context.

### 3.6 Inhoud en TipTap

Fieldgrid gebruikt TipTap als knowledgebase-editor.

De editor moet minimaal ondersteunen:

- headings
- paragrafen
- vet/cursief
- opsommingen
- genummerde lijsten
- links
- tabellen indien haalbaar
- callout-blokken: Tip, Let op, Voorbeeld
- afbeeldingen
- video-embeds of video-bijlagen
- codeblok optioneel
- horizontale lijn
- undo/redo
- preview
- veilige HTML-output

Aanbevolen opslag:

- Canonical: TipTap JSON in `content_json`.
- Render cache: sanitized HTML in `content_html`.
- Search text: platte tekst in `content_text` of generated tsvector.

Waarom:

- JSON bewaart semantiek voor latere editorwijzigingen.
- Sanitized HTML maakt rendering snel in PWA/backoffice.
- Losse tekst maakt Postgres full-text search betrouwbaar.

### 3.7 Media

Media-eisen:

- upload naar bestaande storage-aanpak;
- platform-global en tenant-bound scope correct;
- alt-tekst verplicht voor afbeeldingen;
- caption optioneel;
- video thumbnail optioneel;
- bestandstypevalidatie;
- maximale bestandsgrootte;
- private delivery via signed URLs waar nodig;
- geen cross-tenant datalekken.

Aanbevolen paden:

- Platform-global: `platform/knowledgebase/{articleId}/{mediaId}.{ext}`
- Tenant-specific: `tenant/{tenantId}/knowledgebase/{articleId}/{mediaId}.{ext}`

Gebruik voor tenantcontent `buildTenantStoragePath`. Voeg voor platform-global eventueel `buildPlatformStoragePath` toe, zodat global media ook een gecontroleerde prefix heeft.

### 3.8 Zoekwoorden en slimme zoekbalk

Zoeken moet werken op:

- titel
- samenvatting
- inhoud
- zoekwoorden
- slimme zoektermen/synoniemen
- categorie
- module
- audience

Aanbevolen technische aanpak:

- Postgres `tsvector` voor full-text search op `title`, `summary`, `content_text`, `keywords`.
- Optioneel `pg_trgm` voor typo-tolerante autocomplete.
- Server action/API `searchKnowledgebase(query, context)` die eerst visibilitycontext opbouwt en daarna alleen toegestane resultaten teruggeeft.
- Autocomplete op titel, categorie en zoektermen, nooit client-side over ongefilterde data.
- Optionele `kb_search_events` voor populaire zoekopdrachten en no-result analyses.

### 3.9 Gerelateerde artikelen

Gerelateerde artikelen moeten handmatig selecteerbaar zijn. Automatische suggesties kunnen later op basis van gedeelde categorie, module, audience en zoektermen.

Bij tonen:

- sorteer handmatige relaties op `sort_order`;
- filter elk gerelateerd artikel opnieuw op visibility;
- toon geen lege "gerelateerde artikelen" sectie;
- voorkom self-relations en duplicate relaties.

### 3.10 Platform admin beheerinterface

Platform admin moet kunnen:

- artikelen aanmaken;
- artikelen bewerken;
- artikelen archiveren;
- categorieen/modules beheren;
- audiences instellen;
- module-scope instellen;
- permissies koppelen;
- zoekwoorden toevoegen;
- media toevoegen;
- gerelateerde artikelen koppelen;
- publiceren;
- previewen als doelgroep;
- artikel dupliceren;
- wijzigingsgeschiedenis bekijken.

### 3.11 Tenant gebruikersinterface

Tenantgebruikers krijgen:

- Help / Handleidingen pagina;
- zoekbalk bovenaan;
- categoriekaarten;
- populaire artikelen;
- recente artikelen;
- artikel detailpagina;
- gerelateerde artikelen;
- optioneel "Was dit artikel nuttig?";
- optioneel "Vraag stellen" of ticket aanmaken vanuit artikel.

## 4. Functionele requirements roadmapbord

### 4.1 Doel

Het roadmapbord geeft platform admins overzicht over globale roadmap en tenant featurewensen. Tenant admins krijgen inzicht in relevante roadmapitems en kunnen wensen indienen.

### 4.2 Twee niveaus

Platform roadmap:

- globale Fieldgrid roadmap;
- beheerd door platform admins;
- tenant-visible als `public_visible = true`;
- kan gekoppeld worden aan releases.

Tenant roadmap / featurewensen:

- ingediend door tenant owners/admins/management;
- tenant-scoped;
- zichtbaar voor platform admins en de betreffende tenant;
- kan door platform admin worden omgezet naar globaal roadmapitem.

### 4.3 Wie mag wensen insturen?

MVP:

- `platform_admin`
- `tenant_owner`
- `tenant_admin`
- `tenant_management`

Personeel en klanten niet in MVP. Later kan een tenantinstelling "featurewensen door eindgebruikers" worden toegevoegd, maar dat verhoogt moderatie- en supportlast.

### 4.4 Roadmap item model

Minimale velden:

- `id`
- `tenant_id` nullable
- `scope`: `global` of `tenant`
- `title`
- `slug`
- `description`
- `status`: `new`, `considering`, `in_development`, `done`, `archived`
- `priority`: `low`, `normal`, `high`, `critical`
- `category_id` nullable
- `submitted_by`
- `created_at`
- `updated_at`
- `planned_version` nullable
- `expected_delivery` nullable
- `release_id` nullable
- `public_visible`
- `featured`
- `internal_note`
- `converted_from_item_id` nullable

Via join-tabellen:

- audiences
- modules
- tenant links
- tickets
- release links
- comments
- votes
- status history

### 4.5 Kanbanbord

Kolommen:

- Nieuw
- In overweging
- In ontwikkeling
- Afgerond

Kaart toont:

- titel;
- module;
- doelgroep;
- status;
- prioriteit;
- indiener;
- datum;
- gekoppelde release indien aanwezig;
- tenantnaam bij platformadminweergave.

Acties:

- nieuw item toevoegen;
- status wijzigen;
- item bekijken;
- item bewerken;
- item archiveren;
- item koppelen aan release;
- tenantwens omzetten naar globaal roadmapitem;
- markeren als uitgelicht;
- interne notitie toevoegen.

### 4.6 Zichtbaarheid roadmap

Platform admins:

- zien alle roadmapitems;
- zien globale items en tenant-specifieke wensen;
- kunnen alles beheren.

Tenant admins:

- zien globale roadmapitems die `public_visible = true` zijn en relevant zijn voor hun modules/audience;
- zien eigen tenantwensen;
- kunnen eigen wensen indienen;
- kunnen reageren of stemmen als permission actief is.

Personeel/klanten:

- geen roadmap in MVP;
- later eventueel publieke "nieuwe functies" of "idee indienen" flow.

### 4.7 Featurewens flow

Aanbevolen workflow:

1. Tenant admin dient wens in.
2. Wens krijgt status `new`.
3. Platform admin triaget.
4. Wens gaat naar `considering` of wordt afgewezen/gearchiveerd.
5. Wens kan gekoppeld of geconverteerd worden naar globaal roadmapitem.
6. Roadmapitem gaat naar `in_development`.
7. Oplevering wordt gekoppeld aan release note.
8. Status wordt `done`.
9. Tenant krijgt notificatie als status wijzigt of item afgerond is.

## 5. Functionele requirements releasebeheer

### 5.1 Doel

Release notes zijn globale platformcontent, maar module- en audience-scoped zichtbaar.

Voorbeelden:

- platform/database/security release: platform admin.
- personnel app update: personnel en tenant admins.
- customer portal update: customers en tenant admins.
- planning/backoffice update: tenant admins, planning, management.

### 5.2 Release note model

Minimale velden:

- `id`
- `version`
- `title`
- `slug`
- `published_at`
- `status`: `draft`, `published`, `archived`
- `summary`
- `content_json`
- `content_html`
- `category_id`
- `impact_level`: `low`, `medium`, `high`, `critical`
- `featured`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`
- `archived_at`

Via join-tabellen:

- audiences
- modules
- media
- highlights
- dismissals
- roadmap links
- ticket links

### 5.3 Release categorieen

Aanbevolen categorieen:

- Platform
- Backoffice
- Tenantbeheer
- Planning
- Werkbonnen
- Klanten
- Objecten
- Personeel
- Personnel app
- Customer portal
- Rapportages
- Facturatie
- Betalingen
- Tickets
- Documenten
- Security
- Performance
- Bugfixes
- UI/UX
- Database
- API
- Integraties

### 5.4 Audience regels

Platform admin ziet:

- alle release notes;
- platform admin backoffice;
- database;
- security;
- globale beheermodules;
- tenant modules;
- personnel app;
- customer portal;
- technische releases die platform relevant zijn.

Tenant admin ziet:

- tenant backoffice releases;
- release notes voor actieve tenantmodules;
- personnel app releases indien module actief;
- customer portal releases indien module actief;
- relevante planning/facturatie/rapportage releases;
- geen interne platform database/admin-only releases.

Personnel gebruiker ziet:

- alleen release notes met audience `tenant_personnel`;
- alleen voor actieve module `personnel_portal` en eventueel gekoppelde operationele modules.

Customer gebruiker ziet:

- alleen release notes met audience `tenant_customer`;
- alleen voor actieve module `customer_portal` en eventueel gekoppelde customer-facing modules.

### 5.5 Release highlight / gele balk

Highlights worden apart gemodelleerd zodat een release meerdere banners kan hebben voor verschillende audiences/surfaces.

Gedrag:

- Gele balk bovenaan app shell of dashboard.
- Alleen tonen als release published is.
- Alleen tonen als audience, module en permission filters matchen.
- Startdatum/einddatum optioneel.
- Per user dismissable.
- Bij meerdere highlights: toon hoogste prioriteit en bied eventueel "meer updates" link.

Surfaces:

- `platform_backoffice`
- `tenant_backoffice`
- `personnel_pwa`
- `customer_pwa`

Dismissed state:

- Platform/tenant auth users: per `user_id`.
- Personnel/customer portal identities: per `personnel_id` of `customer_id` plus tenant.

### 5.6 Dashboardcontainer laatste releaseinfo

Platform admin dashboard:

- laatste published release;
- datum;
- korte samenvatting;
- categorie/module;
- label "Uitgelicht" indien relevant;
- "Lees meer" naar release detail.

Tenant admin dashboard:

- alleen tenant-relevante releases;
- zelfde container, compact;
- optioneel onder secundaire widgets.

PWA dashboards:

- kleine updatekaart of banner;
- geen zware releasefeed op eerste scherm.

### 5.7 Platform admin releasebeheer

Platform admin moet kunnen:

- release aanmaken;
- release bewerken;
- release publiceren;
- release archiveren;
- doelgroep kiezen;
- categorie/module kiezen;
- release uitlichten;
- gele balk instellen;
- einddatum highlight instellen;
- gekoppelde roadmapitems selecteren;
- screenshots/video toevoegen;
- preview bekijken als audience.

Tenant admins mogen globale release notes niet aanpassen.

## 6. Datamodelvoorstel

### 6.1 Shared enums

Aanbevolen enums:

- `content_scope`: `platform_global`, `tenant`
- `content_status`: `draft`, `published`, `archived`
- `audience_key`: `platform_admin`, `tenant_admin`, `tenant_management`, `tenant_planning`, `tenant_administration`, `tenant_personnel`, `tenant_customer`, `support`
- `roadmap_status`: `new`, `considering`, `in_development`, `done`, `archived`
- `priority`: `low`, `normal`, `high`, `critical`
- `impact_level`: `low`, `medium`, `high`, `critical`

### 6.2 Knowledgebase tabellen

`kb_categories`

- Doel: categorieboom voor artikelen.
- Kolommen: `id`, `tenant_id` nullable, `scope`, `parent_id`, `name`, `slug`, `description`, `module_key`, `sort_order`, `is_active`, `created_by`, `updated_by`, timestamps.
- Indexes: `scope`, `tenant_id`, `module_key`, unieke slug per scope/tenant/parent/language.
- RLS: platform admin manage; tenant read alleen als zichtbaar en module actief.

`kb_articles`

- Doel: artikelmetadata en content.
- Kolommen: `id`, `tenant_id` nullable, `scope`, `category_id`, `title`, `slug`, `summary`, `content_json`, `content_html`, `content_text`, `status`, `featured`, `language`, `sort_order`, `published_at`, `created_by`, `updated_by`, `archived_at`, timestamps.
- Indexes: `status`, `scope`, `tenant_id`, `category_id`, `slug`, `published_at`, full-text index op `content_text`.
- Constraints: slug uniek per scope/tenant/language.
- RLS: manage alleen platform admin voor global; tenant read via visibility function.

`kb_article_audiences`

- Doel: many-to-many audiences.
- Kolommen: `article_id`, `audience_key`.
- Indexes: `audience_key`, unique `article_id/audience_key`.

`kb_article_modules`

- Doel: target modules voor visibility.
- Kolommen: `article_id`, `module_key`, `is_required` default false.
- Indexes: `module_key`, unique `article_id/module_key`.
- Interpretatie: als geen rows, artikel is module-agnostisch. Als rows bestaan, tenant moet minimaal een passende module actief hebben. Bij `is_required=true` moet die specifieke module actief zijn.

`kb_article_permissions`

- Doel: extra permission gates.
- Kolommen: `article_id`, `permission_key`.
- Indexes: `permission_key`, unique `article_id/permission_key`.

`kb_article_media`

- Doel: media bij artikelen.
- Kolommen: `id`, `article_id`, `tenant_id` nullable, `scope`, `media_type`, `storage_path`, `mime_type`, `size_bytes`, `alt_text`, `caption`, `sort_order`, `created_by`, timestamps.
- Indexes: `article_id`, `tenant_id`, `scope`.
- RLS: media visibility volgt artikel visibility.

`kb_article_related`

- Doel: gerelateerde artikelen.
- Kolommen: `article_id`, `related_article_id`, `relation_type`, `sort_order`.
- Constraints: geen self relation, unique pair.

`kb_article_versions`

- Doel: versiegeschiedenis.
- Kolommen: `id`, `article_id`, `version_no`, `title`, `summary`, `content_json`, `content_html`, `changed_by`, `change_note`, `created_at`.
- RLS: alleen beheerders.

`kb_article_feedback`

- Doel: "Was dit artikel nuttig?".
- Kolommen: `id`, `article_id`, `tenant_id`, `user_id` nullable, `personnel_id` nullable, `customer_id` nullable, `is_helpful`, `comment`, `created_at`.
- Indexes: `article_id`, `tenant_id`, identity.

`kb_search_terms`

- Doel: synoniemen/slimme zoektermen.
- Kolommen: `id`, `article_id`, `term`, `weight`, `language`, timestamps.
- Indexes: `term`, `article_id`.

`kb_search_events` optioneel

- Doel: no-result en populaire zoekopdrachten.
- Kolommen: `id`, `tenant_id`, `audience_key`, `query`, `result_count`, `created_at`.

### 6.3 Tooltip tabellen

`kb_tooltips`

- Doel: herbruikbare help-icon metadata bij functies/velden.
- Kolommen: `id`, `stable_key`, `title`, `description`, `article_id`, `module_key`, `permission_key`, `status`, `placement`, `icon_variant`, `open_in_drawer`, `created_by`, `updated_by`, timestamps.
- Indexes: unique `stable_key`, `article_id`, `module_key`, `permission_key`.

`kb_tooltip_audiences`

- Doel: audience-scope voor tooltips.
- Kolommen: `tooltip_id`, `audience_key`.

`kb_tooltip_related_articles`

- Doel: extra gerelateerde artikelen in popover/drawer.
- Kolommen: `tooltip_id`, `article_id`, `sort_order`.

Aanbeveling: tooltipteksten staan als aparte records, maar zijn gekoppeld aan een primair knowledgebase-artikel. Hierdoor kunnen korte inline teksten stabiel blijven terwijl het artikel evolueert.

### 6.4 Roadmap tabellen

`roadmap_items`

- Doel: globale roadmapitems en tenant featurewensen.
- Kolommen: `id`, `tenant_id` nullable, `scope`, `title`, `slug`, `description`, `status`, `priority`, `category_id`, `submitted_by`, `planned_version`, `expected_delivery`, `public_visible`, `featured`, `internal_note`, `converted_from_item_id`, `created_by`, `updated_by`, timestamps, `archived_at`.
- Indexes: `tenant_id`, `scope`, `status`, `priority`, `slug`, `public_visible`.

`roadmap_item_audiences`

- Doel: audience visibility.
- Kolommen: `roadmap_item_id`, `audience_key`.

`roadmap_item_modules`

- Doel: module visibility.
- Kolommen: `roadmap_item_id`, `module_key`.

`roadmap_item_tenant_links`

- Doel: globale items expliciet aan tenants koppelen of tenantwensen clusteren.
- Kolommen: `roadmap_item_id`, `tenant_id`, `relation_type`.

`roadmap_item_comments`

- Doel: discussie en platform feedback.
- Kolommen: `id`, `roadmap_item_id`, `tenant_id` nullable, `author_user_id`, `body`, `visibility`, timestamps.

`roadmap_item_votes`

- Doel: support/stemmen optioneel.
- Kolommen: `roadmap_item_id`, `tenant_id`, `user_id`, `created_at`.
- Constraint: unique per item/user.

`roadmap_item_status_history`

- Doel: auditbare statusflow.
- Kolommen: `id`, `roadmap_item_id`, `from_status`, `to_status`, `changed_by`, `note`, `created_at`.

`roadmap_item_ticket_links`

- Doel: koppeling naar supporttickets.
- Kolommen: `roadmap_item_id`, `ticket_id`, `tenant_id`.

### 6.5 Release tabellen

`release_categories`

- Doel: releasecategorieen.
- Kolommen: `id`, `name`, `slug`, `module_key`, `sort_order`, `is_active`, timestamps.

`releases`

- Doel: release note header en content.
- Kolommen: `id`, `version`, `title`, `slug`, `summary`, `content_json`, `content_html`, `content_text`, `status`, `impact_level`, `featured`, `published_at`, `created_by`, `updated_by`, timestamps, `archived_at`.
- Indexes: `status`, `version`, `slug`, `published_at`, `impact_level`.
- Constraint: unique `version` en unique `slug`.

`release_items`

- Doel: release kan meerdere wijzigingen bevatten.
- Kolommen: `id`, `release_id`, `category_id`, `title`, `description`, `module_key`, `impact_level`, `sort_order`.
- Indexes: `release_id`, `module_key`, `category_id`.

`release_audiences`

- Doel: release visibility.
- Kolommen: `release_id`, `audience_key`.

`release_modules`

- Doel: module visibility.
- Kolommen: `release_id`, `module_key`.

`release_media`

- Doel: screenshots/video.
- Kolommen: `id`, `release_id`, `media_type`, `storage_path`, `mime_type`, `size_bytes`, `alt_text`, `caption`, `sort_order`, timestamps.

`release_highlights`

- Doel: gele balken.
- Kolommen: `id`, `release_id`, `surface`, `audience_key`, `module_key` nullable, `title`, `message`, `priority`, `starts_at`, `ends_at`, `is_active`, `created_by`, timestamps.
- Indexes: `surface`, `audience_key`, `module_key`, `starts_at`, `ends_at`.

`release_dismissals`

- Doel: per gebruiker wegklikstatus.
- Kolommen: `id`, `highlight_id`, `tenant_id` nullable, `user_id` nullable, `personnel_id` nullable, `customer_id` nullable, `dismissed_at`.
- Indexes: identity en highlight.
- Constraint: unique per highlight + identity.

`release_roadmap_links`

- Doel: koppeling met roadmapitems.
- Kolommen: `release_id`, `roadmap_item_id`.

`release_ticket_links`

- Doel: koppeling met tickets/support.
- Kolommen: `release_id`, `ticket_id`, `tenant_id` nullable.

## 7. UI/UX voorstel platform admin

### 7.1 Knowledgebase beheer

Schermen:

- Artikeloverzicht met tabs: Published, Drafts, Archived.
- Filters: categorie, module, audience, status, taal, featured.
- Zoekbalk met autocomplete.
- Artikel editor met TipTap.
- Rechter zijpaneel voor publicatie, audience, modules, permissions, SEO/slug, gerelateerde artikelen.
- Media sheet voor uploads en alt-tekst.
- Preview menu: platform admin, tenant admin, planning, administratie, personnel, customer.
- Categoriebeheer met compacte tree/list.
- Tooltipbeheer met stable keys en gekoppelde artikelen.

### 7.2 Roadmap beheer

Schermen:

- Kanbanbord met kolommen Nieuw, In overweging, In ontwikkeling, Afgerond.
- List view voor bulkfilters.
- Detaildrawer voor item metadata, reacties, statusgeschiedenis en gekoppelde tickets/releases.
- Acties: status wijzigen, omzetten naar global, koppelen aan release, archiveren.
- Tenantwensen inbox voor triage.

### 7.3 Releasebeheer

Schermen:

- Releaseoverzicht met status/tijdlijn.
- Release editor met TipTap.
- Release items/cards per module of categorie.
- Highlight configuratie.
- Preview als audience.
- Dashboardcontainer "Laatste release".

## 8. UI/UX voorstel tenant admin

Nieuwe tenant backoffice onderdelen:

- Help / Handleidingen in sidebar of onder Support/Meer.
- Roadmap / Wensenbord, zichtbaar voor tenant owner/admin/management.
- Release notes, eventueel via dashboardwidget en settings/support.
- Dashboard release container met laatste relevante release.

Help UX:

- rustige pagina met zoekbalk bovenaan;
- categoriekaarten;
- populaire artikelen;
- recente artikelen;
- detailpagina met artikelinhoud, gerelateerde artikelen en ticketactie.

Roadmap UX:

- "Mijn wensen" en "Fieldgrid roadmap" tabs.
- Wens indienen via sheet.
- Statuslabels met duidelijke copy.
- Reacties optioneel in MVP.

Release UX:

- compacte lijst per datum;
- filters op module en categorie;
- detailpagina;
- gele highlight banner op dashboard/app shell.

## 9. UI/UX voorstel personnel PWA

Nieuwe onderdelen:

- Help in "Meer" of settings.
- Release notes in "Meer".
- Highlight banner bovenaan Home of op relevante featurepagina.
- Tooltips op belangrijke acties.

Belangrijke help-entrypoints:

- werkbonstatus;
- afmelden;
- gereedmelden;
- materiaal/verbruik;
- meerwerk;
- rapportage-notities;
- beschikbaarheid;
- verlof;
- ziekmelding;
- open opdrachten;
- inventaris scannen.

PWA gedrag:

- tap-friendly help iconen;
- geen hover-only interactie;
- drawer of full-screen sheet voor hulp;
- offline fallback kan later een cache van recent bekeken artikelen gebruiken.

## 10. UI/UX voorstel customer portal

Nieuwe onderdelen:

- Help in "Meer" en mogelijk op dashboard.
- Release notes in "Meer".
- Highlight banner voor customer-relevante updates.
- Tooltips op customer-facing acties.

Belangrijke help-entrypoints:

- nieuwe opdracht;
- prijsopgave;
- akkoord geven;
- rapportages;
- facturen;
- betalingen;
- tickets;
- objecten;
- documenten.

UX moet rustig blijven:

- korte helpkaart;
- zoekbalk;
- geen technische platformtermen;
- alleen artikelen voor customer-audience.

## 11. Slug- en URL-strategie

### 11.1 Knowledgebase routes

Platform beheer:

- `/platform/knowledgebase`
- `/platform/knowledgebase/articles`
- `/platform/knowledgebase/articles/[articleId]`
- `/platform/knowledgebase/categories`
- `/platform/knowledgebase/tooltips`

Tenant backoffice:

- `https://{tenant-domain}/help`
- `https://{tenant-domain}/help/{slug}`

Personnel portal:

- `https://{tenant-domain}/personeel/help`
- `https://{tenant-domain}/personeel/help/{slug}`

Customer portal:

- `https://{tenant-domain}/klant/help`
- `https://{tenant-domain}/klant/help/{slug}`

### 11.2 Supportlinks met shortcode

Aanbevolen supportlink:

- `https://help.fieldgrid.nl/t/{tenantCode}/{articleSlug}`

Alternatief:

- `https://fieldgrid.nl/h/{tenantCode}/{articleSlug}`

Voorkeur: dedicated `help.fieldgrid.nl`, omdat dit later publiek, cachebaar of SEO-vriendelijk kan worden zonder tenant app routing te belasten.

Eisen:

- tenantCode blijft stabiel als custom domain verandert;
- route resolveert tenant;
- gebruiker wordt naar juiste login gestuurd als sessie ontbreekt;
- na login redirect naar artikel;
- artikel wordt pas getoond na visibilitycheck;
- geen data in redirect querystring behalve slug/code.

### 11.3 Roadmap routes

Platform:

- `/platform/roadmap`
- `/platform/roadmap/[itemId]`

Tenant:

- `/roadmap`
- `/roadmap/new`
- `/roadmap/[slug]`

### 11.4 Release routes

Platform:

- `/platform/releases`
- `/platform/releases/[releaseId]`

Tenant:

- `/releases`
- `/releases/[slug]`

Personnel:

- `/personeel/releases`
- `/personeel/releases/{slug}`

Customer:

- `/klant/releases`
- `/klant/releases/{slug}`

## 12. Module-entitlements en zichtbaarheid

Module visibility gebruikt bestaande `isTenantModuleEnabled`.

Gedrag:

- Artikel zonder gekoppelde modules is alleen audience/permissie-scoped.
- Artikel met gekoppelde modules wordt alleen getoond als tenant de module actief heeft.
- Release note met gekoppelde modules idem.
- Roadmapitem met gekoppelde modules idem, tenzij platform admin het in platformcontext bekijkt.
- Tooltip met gekoppelde module wordt niet getoond als module niet actief is.

Voorbeelden:

- Tenant zonder `personnel_portal` ziet geen personnel PWA artikelen of releases.
- Customer zonder factuurrechten ziet geen factuur-betaal-artikelen.
- Personnel gebruiker ziet geen customer portal help.
- Platform admin artikelen hebben alleen audience `platform_admin`.

Aanbevolen helper:

`getVisibleKnowledgebaseArticles(context, filters)` en vergelijkbare helpers voor releases/roadmap. Deze helper bouwt een server-side query met:

- tenantId;
- portal surface;
- audience keys;
- active module keys;
- effective permission keys;
- status/scope.

## 13. Rollen en permissies

Gebruik repo-conventie `resource:action`.

Knowledgebase:

- `kb:view`
- `kb:manage`
- `kb:create`
- `kb:update`
- `kb:publish`
- `kb:archive`
- `kb:manage_categories`
- `kb:manage_media`
- `kb:preview_audience`
- `kb:manage_tooltips`

Roadmap:

- `roadmap:view`
- `roadmap:manage`
- `roadmap:create`
- `roadmap:update`
- `roadmap:submit_request`
- `roadmap:change_status`
- `roadmap:comment`
- `roadmap:vote`
- `roadmap:link_release`

Releases:

- `releases:view`
- `releases:manage`
- `releases:create`
- `releases:update`
- `releases:publish`
- `releases:archive`
- `releases:highlight`
- `releases:dismiss_highlight`
- `releases:preview_audience`

Platform admin:

- mag globale content beheren;
- mag tenantwensen beheren;
- mag releases publiceren;
- mag previews uitvoeren.

Tenant admin:

- mag relevante help/release content bekijken;
- mag featurewensen indienen;
- mag eigen featurewensen bekijken en eventueel bewerken zolang status `new` is;
- mag globale content niet aanpassen.

Personnel/customer:

- view-only voor relevante help/release content;
- geen roadmap in MVP.

## 14. RLS/security advies

Security uitgangspunten:

- Platform admins kunnen globale content beheren.
- Tenantgebruikers kunnen geen globale content wijzigen.
- Tenant ziet alleen relevante content.
- Personnel ziet alleen personnel-audience content.
- Customer ziet alleen customer-audience content.
- Module-entitlements worden server-side afgedwongen.
- Permission gates worden server-side afgedwongen.
- Release highlights worden role/audience/surface-scoped getoond.
- Media is niet ongecontroleerd publiek.
- Shortcode en tenant domain deeplinks lekken geen data.

Aanbevolen RLS:

- Beheeracties via service role/server actions met expliciete permission checks.
- Read policies voor tenant-facing tabellen kunnen defensief zijn, maar visibilitylogica blijft in server helpers om complexe joins correct te houden.
- Media delivery via signed URL endpoint dat artikel/release visibility checkt voordat URL wordt gemaakt.
- Geen direct public bucket voor tenant-scoped helpmedia.
- Auditlog op alle mutaties.
- Slugs mogen niet genoeg zijn om content te raden; detailroute moet altijd visibility controleren.

## 15. Auditlog advies

Log minimaal:

Knowledgebase:

- `kb_article_created`
- `kb_article_updated`
- `kb_article_published`
- `kb_article_archived`
- `kb_category_created`
- `kb_category_updated`
- `kb_media_added`
- `kb_media_removed`
- `kb_tooltip_created`
- `kb_tooltip_updated`

Roadmap:

- `roadmap_item_created`
- `roadmap_item_updated`
- `roadmap_status_changed`
- `roadmap_item_archived`
- `roadmap_item_linked_release`
- `roadmap_item_converted_global`
- `roadmap_comment_added`

Releases:

- `release_created`
- `release_updated`
- `release_published`
- `release_archived`
- `release_highlight_created`
- `release_highlight_updated`
- `release_highlight_dismissed`
- `release_linked_roadmap`

Audit metadata:

- old/new status;
- affected audiences;
- affected modules;
- tenant id indien tenant-scoped;
- release/article/item slug.

## 16. Notificaties

Knowledgebase:

- nieuw belangrijk artikel gepubliceerd;
- artikel bijgewerkt;
- belangrijk artikel uitgelicht;
- tooltip gekoppeld aan kritisch artikel optioneel niet notificeren.

Roadmap:

- featurewens ingediend;
- status gewijzigd;
- roadmapitem afgerond;
- reactie toegevoegd;
- tenantwens gekoppeld aan globale roadmap.

Releases:

- nieuwe release gepubliceerd;
- release uitgelicht;
- highlight banner zichtbaar;
- release gelezen/dismissed niet pushen, wel audit of analytics indien nodig.

Kanalen:

- in-app standaard;
- push alleen voor personnel/customer relevante updates met lage frequentie;
- email voor belangrijke releases en roadmapstatussen naar tenant admins/owners;
- platform notification dispatches voor platformbrede communicatie.

Belangrijk: notificatie-targeting moet dezelfde audience/module visibility gebruiken als de content zelf.

## 17. Retroactieve release notes strategie

Doel: een eerste set release notes maken op basis van bestaande features zonder handmatig alles opnieuw uit te zoeken.

Bronnen:

- routeboom in backoffice, customer PWA en personnel PWA;
- Drizzle migrations;
- schema modules;
- docs;
- commit history;
- UI labels;
- server actions;
- package/module structuur.

Aanpak:

1. Genereer feature-inventaris uit routes en navigatie.
2. Groepeer features per module en audience.
3. Lees recente commits en migrations voor technische mijlpalen.
4. Maak draft release notes met status `draft`.
5. Platform admin reviewt en publiceert.

Eerste draft release notes:

- Platformbasis ingericht.
- Tenant provisioning en onboarding.
- Platform admin: tenants, subscriptions, notifications, operations en settings.
- Tenant backoffice basis.
- Klantenbeheer.
- Objectbeheer.
- Opdrachten en werkbonnen.
- Planning en smart planning.
- Personnel portal en personnel PWA.
- Customer portal en customer PWA.
- Rapportage-notities.
- Facturatie, offertes, betalingen, PDF en CSV exports.
- Mollie/betaalflows.
- Tickets en conversaties.
- Documenten en tenant-bound storage.
- Rollen en permissies.
- Module-entitlements.
- Materiaalbeheer en inventarisbeheer.
- Notifications, push en native device tokens.
- Tenant domains en custom domains.
- Security/audit hardening.

Per release draft moeten audiences apart worden gekozen:

- platform admin;
- tenant admin;
- personnel app;
- customer portal.

## 18. Tooltip/help-icon functionaliteit

### 18.1 Gewenst gedrag

Bij functies, velden, knoppen, tabbladen en modules kan een klein help-icoon worden getoond, bijvoorbeeld Lucide `CircleHelp`.

Desktop:

- hover toont korte tooltip;
- click opent compacte popover of drawer.

Mobiel/PWA:

- geen hover afhankelijkheid;
- tap opent dezelfde popover/drawer;
- touch target minimaal 40x40 px.

Popover/drawer bevat:

- korte titel;
- korte uitleg;
- link naar volledig knowledgebase-artikel;
- gerelateerde artikelen;
- optionele veelgestelde vragen.

### 18.2 Tooltip-content

Minimaal:

- titel;
- korte beschrijving;
- gekoppeld knowledgebase-artikel;
- optionele gerelateerde artikelen;
- module;
- audience;
- permission scope;
- optioneel laatste wijzigingsdatum van gekoppeld artikel.

Voorbeeld:

- Titel: Nieuwe werkbon
- Beschrijving: Maak een nieuwe opdracht aan voor een klant, object en sector.
- Link: Lees volledige uitleg
- Gerelateerd: Werkbonnen beheren, Taken koppelen aan werkbon, Prijsopgave maken.

### 18.3 Tooltip visibility

Tooltips mogen alleen verwijzen naar artikelen die de gebruiker mag zien.

Regels:

- personnel gebruiker ziet geen platform admin-artikelen;
- customer ziet geen personnel handleidingen;
- tenant admin ziet alleen actieve modules;
- tenant zonder `personnel_portal` ziet geen personnel tooltiplinks;
- gebruiker zonder facturatierechten ziet geen facturatie-tooltip of krijgt geen artikel-link.

Alle tooltipqueries gebruiken dezelfde visibilityhelper als knowledgebase.

### 18.4 Componentvoorstel

Gedeeld component:

`FeatureHelp` of `HelpTooltip`.

Props:

- `stableKey`
- `title`
- `description`
- `articleSlug`
- `articleId`
- `moduleKey`
- `audience`
- `permissionKey`
- `relatedArticleIds`
- `placement`
- `iconVariant`
- `showRelatedArticles`
- `openInDrawer`

Gebruik bestaande UI:

- Tooltip
- Popover
- Dialog
- Sheet/Drawer
- Button
- Lucide `CircleHelp`

Aanbevolen gedrag:

- server laadt tooltip metadata en visible article links;
- client component rendert hover tooltip en tap/click popover;
- als geen zichtbaar artikel bestaat, toon alleen korte uitleg of verberg link.

### 18.5 Toepassing per omgeving

Backoffice:

- dashboard widgets;
- nieuwe klant;
- nieuw object;
- nieuwe werkbon;
- taakcodes;
- certificaatvereisten;
- planning/matchscore;
- interessepeilingen;
- factuurvoorstellen;
- verzamelfacturen;
- rapportagecontrole;
- interne notities;
- klantzichtbare informatie;
- rollen en permissies;
- release notes;
- roadmap;
- knowledgebasebeheer.

Personnel PWA:

- werkbonstatus;
- afmelden;
- gereedmelden;
- materiaal/verbruik;
- meerwerk;
- rapportage-notities;
- beschikbaarheid;
- verlof;
- ziekmelding;
- open opdrachten.

Customer portal:

- nieuwe opdracht;
- prijsopgave;
- akkoord geven;
- rapportages;
- facturen;
- betalingen;
- tickets;
- objecten.

## 19. TipTap editor strategie

### 19.1 Integratie

De bestaande `TipTapNewsEditor` bewijst dat TipTap werkt in backoffice. Maak voor knowledgebase een nieuwe `KnowledgebaseEditor` zodat nieuws niet onbedoeld gedrag wijzigt.

Start met:

- StarterKit
- Link
- Placeholder
- Heading
- Lists
- Blockquote
- HorizontalRule

Breid uit met:

- Image extension;
- Table extensions;
- custom Callout node;
- optional video embed node;
- optional code block.

### 19.2 Opslagvorm

Aanbevolen:

- TipTap JSON als bron van waarheid.
- Sanitized HTML als render-cache.
- Plain text/tsvector als zoekindex.

Niet alleen Markdown:

- Markdown is prettig voor tekst, maar mist rijke blocks, callouts, media metadata en consistente editor-state.

Niet alleen HTML:

- HTML is gevoelig voor editor-migraties en sanitization-drift.

### 19.3 Sanitization

De news action bevat eenvoudige sanitization. Voor knowledgebase moet dit sterker:

- server-side allowlist sanitizer;
- scripts, event handlers en inline gevaarlijke attributen verwijderen;
- linkprotocols beperken tot `http`, `https`, `mailto`, interne routes;
- media alleen via gecontroleerde storage URLs.

Aanbevolen dependency als die nog niet direct beschikbaar is in workspace package:

- `isomorphic-dompurify` of server-safe DOMPurify integratie.

### 19.4 Media in TipTap

Media flow:

1. Platform admin uploadt bestand in editor.
2. Server action valideert permissie en bestand.
3. File gaat naar gecontroleerde storage prefix.
4. `kb_article_media` record wordt aangemaakt.
5. Editor krijgt media id en preview/signed URL terug.
6. Render endpoint maakt signed URL of proxied media URL op basis van visibility.

Bestandsregels:

- afbeeldingen: jpg, png, webp, gif.
- video: mp4/webm of externe embed allowlist.
- max image size bijvoorbeeld 5 MB.
- max video size bijvoorbeeld 100 MB, bij voorkeur later via dedicated video handling.
- alt-tekst verplicht voor images.

### 19.5 Editorrechten

Alleen platform admins beheren global content in MVP.

Permissions:

- `kb:manage`
- `kb:create`
- `kb:update`
- `kb:publish`
- `kb:archive`
- `kb:manage_media`
- `kb:preview_audience`
- `kb:manage_tooltips`

Tenant-specific articles zijn optioneel later:

- alleen als tenant feature expliciet aan staat;
- tenant admin mag alleen eigen tenantcontent beheren;
- global artikelen blijven read-only.

## 20. Implementatiefases

### Fase 1 - Datamodel en visibility foundation

- Voeg schema's toe voor KB, tooltips, roadmap en releases.
- Voeg permissions toe.
- Voeg module-permission mappings toe.
- Voeg visibility helper design toe.
- Voeg migraties en seed data voor categorieen/modules toe.

### Fase 2 - Knowledgebase basis

- Platform admin artikeloverzicht.
- Artikel editor met TipTap.
- Categoriebeheer.
- Audience/module/permission scopes.
- Publiceren/archiveren.
- Tenant backoffice Help pagina.
- Personnel/customer Help pagina.

### Fase 3 - Slim zoeken, gerelateerd en tooltips

- Full-text search.
- Autocomplete.
- Gerelateerde artikelen.
- Feedback op artikelen.
- `FeatureHelp` component.
- Tooltipbeheer in platform admin.

### Fase 4 - Roadmapbord

- Roadmap Kanban.
- Featurewens indienen.
- Tenant/admin zichtbaarheid.
- Statusgeschiedenis.
- Comments/votes optioneel.
- Koppeling met releases.

### Fase 5 - Releasebeheer

- Release model.
- Platform admin release editor.
- Release notes per audience.
- Dashboard release container.
- Highlights/gele balk.
- Dismiss state.

### Fase 6 - Retroactieve release notes

- Feature-inventaris uit routes, migrations, docs en git.
- Draft release notes genereren.
- Indelen per categorie/audience/module.
- Platform admin review/publicatie.

### Fase 7 - Polish, security en acceptatietests

- RLS review.
- Media policies.
- Module-entitlement tests.
- Deeplink tests.
- Auditlog tests.
- PWA mobile QA.
- Smoke tests voor platform, tenant, personnel en customer.

## 21. MVP-afbakening

In MVP wel:

- Global knowledgebase beheerd door platform admin.
- Module/audience/permissie visibility.
- TipTap artikel editor.
- Help pagina in tenant backoffice, personnel PWA en customer PWA.
- Roadmap Kanban voor platform admin.
- Tenant admins kunnen featurewensen indienen.
- Release notes beheer voor platform admin.
- Audience-scoped release views.
- Highlight banner met dismiss.
- Tooltips gekoppeld aan KB-artikelen.

In MVP niet:

- Tenant admins die eigen artikelen beheren.
- Personnel/customer roadmapwensen.
- Complex voting systeem.
- Publieke SEO knowledgebase zonder login.
- Video transcoding.
- AI-suggesties voor artikelen.
- Volledige analytics dashboards voor zoekgedrag.

## 22. Risico's en open vragen

Risico's:

- Visibilityqueries kunnen complex worden. Maak centrale helpers en test deze goed.
- Media kan data lekken als signed URL endpoint geen artikel visibility checkt.
- Release highlights kunnen irritant worden als dismiss/priority niet goed werkt.
- Retroactieve release notes kunnen onvolledig zijn zonder review.
- TipTap HTML moet streng gesanitized worden.
- Tenant custom domains en shortcode redirects moeten loginredirects correct bewaren.

Open vragen:

- Moet global KB later deels publiek toegankelijk worden?
- Moet tenant-specific KB in eerste release of later?
- Moeten release notes semver volgen of datumversies?
- Moeten roadmapvotes per tenant of per gebruiker tellen?
- Moet support intern conceptartikelen kunnen delen met platform admins?
- Welke modules krijgen als eerste seed-artikelen?

## 23. Acceptatiecriteria voor implementatie

Algemeen:

- Geen tenant-specifieke hardcoding.
- Alle data is tenant-aware of platform-global.
- Platform admin beheert globale content.
- Tenant admins kunnen globale content niet wijzigen.
- Module-entitlements worden afgedwongen.
- Audience en permission scopes worden server-side afgedwongen.
- Auditlog op mutaties.

Knowledgebase:

- Artikelen hebben status, slug, TipTap JSON, sanitized HTML, audiences, modules en permissions.
- Help pagina toont alleen zichtbare artikelen.
- Search/autocomplete toont alleen zichtbare artikelen.
- Gerelateerde artikelen worden opnieuw gefilterd.
- Media wordt veilig geladen.

Roadmap:

- Kanban heeft Nieuw, In overweging, In ontwikkeling, Afgerond.
- Tenant admin kan wens indienen.
- Platform admin kan wensen triagen en koppelen aan releases.
- Tenant ziet alleen relevante/global public items en eigen wensen.

Releases:

- Release notes zijn globaal maar audience/module scoped.
- Highlight banner is audience/surface scoped.
- Dismiss state wordt per gebruiker opgeslagen.
- Platform dashboard toont laatste releaseinfo.

Tooltips:

- Desktop hover toont korte uitleg.
- Click/tap opent popover/drawer.
- Link naar volledige KB volgt visibilityregels.
- Werkt in backoffice en PWA's.

TipTap:

- Editor ondersteunt rich content, callouts en media.
- Opslag als JSON plus sanitized HTML.
- Media heeft alt-tekst en veilige delivery.

## 24. Concrete vervolgtaken/prompts voor implementatie

### Prompt 1 - Datamodel en migraties

Maak de databasefoundation voor knowledgebase, tooltips, roadmap en releases. Voeg Drizzle schema's en SQL migraties toe voor `kb_categories`, `kb_articles`, `kb_article_audiences`, `kb_article_modules`, `kb_article_permissions`, `kb_article_media`, `kb_article_related`, `kb_article_versions`, `kb_article_feedback`, `kb_search_terms`, `kb_tooltips`, `roadmap_items`, roadmap join/history tabellen, `release_categories`, `releases`, `release_items`, release join/highlight/dismissal tabellen. Voeg indexes, unieke constraints, timestamps en auditvriendelijke kolommen toe. Gebruik geen tenant-specifieke hardcoding.

### Prompt 2 - Permissions en visibility helpers

Voeg permissions toe voor `kb`, `roadmap` en `releases` volgens repo-conventie `resource:action`. Voeg module-permission mappings toe. Bouw server-side visibility helpers voor knowledgebase, tooltips, roadmap en releases op basis van tenant, audience, actieve modules en effective permissions. Voeg tests toe voor platform admin, tenant admin, personnel en customer contexts.

### Prompt 3 - Platform knowledgebase beheer

Bouw `/platform/knowledgebase` met artikeloverzicht, filters, categoriebeheer, TipTap editor, audience/module/permissie selectie, media upload, related articles, preview als audience, publiceren en archiveren. Gebruik bestaande platform admin shell en styling.

### Prompt 4 - Tenant/PWA help views

Bouw help pagina's voor tenant backoffice, personnel PWA en customer PWA. Voeg zoekbalk, categoriekaarten, populaire/recente artikelen, artikel detail en gerelateerde artikelen toe. Zorg dat alle queries dezelfde visibilityhelper gebruiken.

### Prompt 5 - Tooltips/help-iconen

Bouw een gedeeld `FeatureHelp` component met desktop hover tooltip en click/tap popover/drawer. Voeg platform admin tooltipbeheer toe. Integreer de eerste tooltips op laag-risico plekken: nieuwe werkbon, factuurvoorstel, beschikbaarheid en customer ticket aanmaken.

### Prompt 6 - Roadmapbord

Bouw `/platform/roadmap` als Kanbanbord met tenant featurewensen inbox, statusgeschiedenis, comments en koppeling met releases. Bouw `/roadmap` en `/roadmap/new` voor tenant admins. Behoud visibilityregels en auditlog.

### Prompt 7 - Releasebeheer en highlights

Bouw `/platform/releases` met release editor, release items, audience/module scopes, publish flow, highlights en preview als audience. Bouw release views in tenant backoffice, personnel PWA en customer PWA. Voeg gele highlight banner met dismiss state toe.

### Prompt 8 - Retroactieve release notes

Analyseer routes, migrations, docs en git history. Genereer draft release notes per module/audience voor bestaande Fieldgrid-features. Laat ze als concepten aanmaken zodat platform admin ze kan reviewen en publiceren.

### Prompt 9 - Security en QA

Voer RLS/security review uit op alle nieuwe tabellen en media endpoints. Test module-entitlements, audience filters, permission gates, deeplinks, shortcode routes, dismiss state, PWA mobile layout en auditlog. Los leaks en polish issues op.
