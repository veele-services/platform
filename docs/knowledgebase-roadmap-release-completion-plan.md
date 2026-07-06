# Knowledgebase, Roadmap En Releasebeheer Completion Plan

Dit document is de vaste checklist voor de resterende afronding van knowledgebase, roadmap, releasebeheer, tooltips, security en QA. Elke fase is pas klaar als de acceptatiecriteria in deze checklist aantoonbaar groen zijn.

## Baseline

Huidige basis die al bestaat:

- Databasefoundation voor `kb_*`, `roadmap_*` en `release_*` tabellen in `lib/db/migrations/081_knowledgebase_roadmap_releases_foundation.sql`.
- Knowledgebase media bucket en privacy hardening in `082_knowledgebase_media_storage.sql` en `086_knowledgebase_media_privacy_hardening.sql`.
- Server-side visibility helpers in `lib/db/src/content-visibility.ts`, `lib/db/src/knowledgebase-content.ts` en `lib/db/src/release-content.ts`.
- Platform admin beheer voor knowledgebase, roadmap en releases onder `artifacts/backoffice/src/app/(platform)/platform`.
- Tenant backoffice routes voor `/help`, `/roadmap` en `/releases`.
- Klant- en personeels-PWA routes voor `/help` en `/releases`.
- Fase-7 security/QA gate in `scripts/fieldgrid-kb-roadmap-release-phase7.mjs`.

Baseline checks:

- `pnpm run typecheck`
- `pnpm -r --if-present run build`
- `pnpm run fieldgrid:kb-roadmap-release-phase7:check`
- `pnpm run fieldgrid:kb-roadmap-release-phase1-security:check`

## Fase 0 - Completion Checklist En Baseline

Doel: voorkomen dat punten half afgerond blijven.

Geraakte onderdelen:

- Documentatie: `docs/knowledgebase-roadmap-release-completion-plan.md`.
- Fase-1 evidence: `docs/knowledgebase-roadmap-release-phase1-security.md`.
- Scripts: bestaande fase-7 gate en fase-1 security gate.
- CI/build: workspace typecheck en build.

Taken:

- Leg alle fases vast met acceptatiecriteria.
- Leg per fase vast welke routes, actions, tabellen en UI's geraakt worden.
- Draai baseline checks.
- Noteer expliciet welke onderdelen al bestaan en welke nog aangepast worden.

Klaar wanneer:

- Dit document bestaat en bevat alle fases.
- De bestaande implementatiestatus is zichtbaar.
- Baseline checks zijn uitgevoerd.
- De worktree is schoon na commit/push.

## Fase 1 - RLS, Grants En Security Hardening

Doel: directe Supabase/Data API-toegang mag geen KB-, roadmap- of release-data lekken.

Geraakte tabellen:

- Knowledgebase: `kb_categories`, `kb_articles`, `kb_article_audiences`, `kb_article_modules`, `kb_article_permissions`, `kb_article_media`, `kb_article_related`, `kb_article_versions`, `kb_article_feedback`, `kb_search_terms`, `kb_search_events`, `kb_tooltips`, `kb_tooltip_audiences`, `kb_tooltip_related_articles`.
- Roadmap: `roadmap_items`, `roadmap_item_audiences`, `roadmap_item_modules`, `roadmap_item_tenant_links`, `roadmap_item_comments`, `roadmap_item_votes`, `roadmap_item_status_history`, `roadmap_item_ticket_links`.
- Releases: `release_categories`, `releases`, `release_items`, `release_audiences`, `release_modules`, `release_media`, `release_highlights`, `release_dismissals`, `release_roadmap_links`, `release_ticket_links`.

Geraakte routes/actions:

- Platform actions: `artifacts/backoffice/src/app/actions/knowledgebase.ts`, `roadmap.ts`, `releases.ts`.
- Tenant/PWA read actions: `knowledgebase-help.ts`, `releases.ts`, klant/personeel actions.
- Protected media routes: `/platform/knowledgebase/media/[mediaId]`, `/help/media/[mediaId]`.

Taken:

- RLS coverage controleren op alle tabellen.
- Directe `anon` en `authenticated` grants expliciet intrekken voor de nieuwe contenttabellen.
- Management-only policies behouden als defense-in-depth als privileges later bewust opnieuw worden toegekend.
- Geen directe publieke storage policy voor `knowledgebase-media`.
- Media alleen via signed URL routes tonen nadat article visibility is gecontroleerd.
- Security gate toevoegen die RLS, anti-patterns, grants, media privacy en visibility helpers controleert.
- Cross-tenant regressiematrix en service-role/client-boundary documenteren in `docs/knowledgebase-roadmap-release-phase1-security.md`.

Klaar wanneer:

- Tenant A kan nooit direct tenant B content lezen via Data API.
- Klant/personeel ziet geen admin-only content.
- Platform admin beheer blijft via server-side platform routes werken.
- Directe Supabase/Data API toegang is expliciet afgesloten voor deze tabellen.
- Service-role blijft server-only en wordt niet door publieke clients gebruikt.
- `pnpm run fieldgrid:kb-roadmap-release-phase1-security:check` slaagt.

## Fase 2 - Help Shortcode En Deeplink Routes

Doel: supportlinks blijven stabiel als tenantdomeinen wijzigen.

Geraakte routes:

- `fieldgrid.nl/h/{tenant-code}/{article-slug}`.
- Optioneel `help.fieldgrid.nl/{tenant-code}/{article-slug}`.
- Loginredirects vanuit backoffice, klantportaal en personeelsapp.
- Protected media: `/h/{tenant-code}/{article-slug}/media/{media-id}`.

Geraakte data:

- Tenant shortcode/slug/hostcontext.
- Knowledgebase article slug.
- Tenant module-entitlements en `kb:view` permissie.

Taken:

- Tenant resolver voor shortcode bouwen.
- Article resolver met dezelfde visibilityregels gebruiken.
- Loginredirect bewaren.
- Geen toegang/niet gevonden/module uit states bouwen.
- Copy-link actie toevoegen voor support en platform admin.
- Statische fase-2 gate toevoegen voor deeplink regressies.

Klaar wanneer:

- Een supportlink opent het juiste artikel na login.
- Onbevoegde gebruikers zien geen inhoud.
- Tenantdomeinwijzigingen breken supportlinks niet.
- `pnpm run fieldgrid:kb-roadmap-release-phase2-deeplinks:check` slaagt.

Implementatiepunten:

- Shortcode route: `artifacts/backoffice/src/app/h/[tenantCode]/[slug]/page.tsx`.
- Shortcode media route: `artifacts/backoffice/src/app/h/[tenantCode]/[slug]/media/[mediaId]/route.ts`.
- Resolver/actions: `artifacts/backoffice/src/app/actions/knowledgebase-help.ts`.
- Supportlink helper: `artifacts/backoffice/src/lib/knowledgebase-support-links.ts`.
- Copy UI: `artifacts/backoffice/src/components/knowledgebase/CopySupportLinkButton.tsx`.
- Login-next behoud: `artifacts/backoffice/src/middleware.ts`.
- Gate: `scripts/fieldgrid-kb-roadmap-release-phase2-deeplinks.mjs`.

## Fase 3 - Notificatie-Events Voor KB, Roadmap En Releases

Doel: nieuwe content en statuswijzigingen worden via het bestaande notificatiesysteem verstuurd.

Geraakte acties:

- Knowledgebase create/update/publish/highlight.
- Roadmap submit/status/comment/done.
- Release publish/highlight.

Geraakte tabellen:

- Bestaande notification/event/queue tabellen.
- `kb_articles`, `roadmap_items`, `roadmap_item_comments`, `releases`, `release_highlights`.

Taken:

- Event types definieren.
- Recipients bepalen op tenant, module, audience en permissies.
- Templates/copy toevoegen.
- In-app/push/mail waar passend aansluiten.
- Auditlog behouden.
- Aansluiten op bestaande `notification_event_settings`, `domain_events` en `notification_delivery_queue`.
- Management recipients filteren op actieve tenantgebruikers en effectieve permissies.
- Personeel/klanten alleen targeten als de content-audience dit toestaat.

Klaar wanneer:

- Elke relevante actie maakt exact de juiste notificatie-events.
- Verkeerde audiences ontvangen niets.
- Events zijn idempotent waar nodig.
- Tenant zonder actieve contentmodule of notificatiemodule krijgt geen event.
- Bestaande notificatie-instellingenpagina kan e-mail/push/in-app toggles beheren.
- `pnpm run fieldgrid:kb-roadmap-release-phase3-notifications:check` slaagt.

Implementatiepunten:

- Emitter: `artifacts/backoffice/src/lib/content-notification-events.ts`.
- KB hooks: `artifacts/backoffice/src/app/actions/knowledgebase.ts`.
- Roadmap hooks: `artifacts/backoffice/src/app/actions/roadmap.ts`.
- Release hooks: `artifacts/backoffice/src/app/actions/releases.ts`.
- Templates/backfill: `lib/db/migrations/088_kb_roadmap_release_notification_events.sql`.
- Gate: `scripts/fieldgrid-kb-roadmap-release-phase3-notifications.mjs`.

## Fase 4 - Tooltips Uitrollen Op Kernflows

Doel: `FeatureHelp` wordt zichtbaar gebruikt in de belangrijkste workflows.

Geraakte UI's:

- Platform admin: tenants, onboarding, releases, roadmap, knowledgebase, instellingen.
- Tenant backoffice: dashboard, klanten, objecten, opdrachten, planning, personeel, facturen, tickets, documenten, materiaal/inventaris, rollen.
- Klantportaal: opdrachten, tickets, facturen, objecten, documenten.
- Personeelsapp: planning, opdrachtstatus, rapportage, materiaal/verbruik, beschikbaarheid.

Taken:

- Tooltip resolver op `stableKey`, `moduleKey`, `audience` toevoegen.
- Component in kernflows plaatsen.
- Hover, click en tap gedrag controleren.
- Tooltiplinks via article visibility filteren.

Klaar wanneer:

- Kernacties hebben help-iconen.
- Desktop hover en mobile tap werken.
- Er is geen layout shift of tekstoverlap.
- Links verwijzen alleen naar zichtbare artikelen.

## Fase 5 - Slim Zoeken En Autocomplete

Doel: Help krijgt een echte zoekervaring.

Geraakte UI's:

- Tenant backoffice `/help`.
- Klant-PWA `/help`.
- Personeel-PWA `/help`.

Geraakte helpers:

- `listKnowledgebaseSearchSuggestionsForContext`.
- Search event logging.
- Suggestion API-routes per surface:
  - `artifacts/backoffice/src/app/api/help/search-suggestions/route.ts`.
  - `artifacts/klant-pwa/src/app/api/help/search-suggestions/route.ts`.
  - `artifacts/personeel-pwa/src/app/api/help/search-suggestions/route.ts`.
- Autocomplete components:
  - `artifacts/backoffice/src/components/knowledgebase/KnowledgebaseAutocompleteSearch.tsx`.
  - `artifacts/klant-pwa/src/components/KnowledgebaseAutocompleteSearch.tsx`.
  - `artifacts/personeel-pwa/src/components/KnowledgebaseAutocompleteSearch.tsx`.

Taken:

- Autocomplete component bouwen.
- Suggesties op titel, inhoud, categorie, module, keyword en smart term tonen.
- Geen-resultaten state toevoegen.
- Search analytics netjes registreren.
- Mobile-safe gedrag controleren.
- Gate toevoegen: `scripts/fieldgrid-kb-roadmap-release-phase5-autocomplete.mjs`.

Klaar wanneer:

- Autocomplete werkt in alle Help-surfaces.
- Resultaten zijn visibility-filtered.
- Geen-resultaten flow is duidelijk.
- `fieldgrid:kb-roadmap-release-phase5-autocomplete:check` slaagt.

## Fase 6 - Platform Preview Als Audience/Tenant/Rol

Doel: platform admin kan vooraf zien wat een doelgroep ziet.

Geraakte UI's:

- Platform KB-artikelen: `/platform/knowledgebase`.
- Platform releasebeheer: `/platform/releases`.
- Platform tooltipbeheer: `/platform/knowledgebase/tooltips`.
- Gedeeld previewpaneel: `PlatformContentPreviewPanel`.

Taken:

- Preview selector voor tenant, role/audience en modules.
- Preview gebruikt dezelfde runtime visibility helpers:
  `explainPublishedContentVisibility`, `explainReleaseVisibility` en
  `explainKnowledgebaseFeatureHelpVisibility`.
- Toon runtime context, actieve modules, permissies, zichtbaarheidsoordeel en blokkaderedenen.
- Gate: `fieldgrid:kb-roadmap-release-phase6-preview:check`.

Klaar wanneer:

- Preview komt overeen met runtime portalweergave.
- Platform admin kan zichtbaarheid debuggen zonder handmatig in te loggen als testgebruiker.
- KB-artikelen, releases en tooltips tonen hetzelfde previewpaneel.
- Tenant/module/role selectors zijn via queryparameters deelbaar.

## Fase 7 - TipTap Editor Volledig Maken

Doel: knowledgebase-artikelen professioneel en veilig opmaken.

Geraakte componenten:

- `TipTapKnowledgebaseEditor`.
- Article renderers in backoffice, klant-PWA en personeel-PWA.
- Media picker/upload.

Taken:

- Tabellen toevoegen.
- Callouts toevoegen: Tip, Let op, Voorbeeld.
- Inline afbeeldingen en video embeds/bijlagen toevoegen.
- Previewmodus toevoegen.
- Link validation en sanitizing aanscherpen.
- JSON als bron van waarheid en sanitized HTML als render-cache behouden.

Klaar wanneer:

- Artikelen kunnen rijk worden opgemaakt zonder raw HTML.
- Output is veilig en consistent per portal.
- Media blijft private en visibility-aware.

Implementatiestatus:

- Editor ondersteunt lokale TipTap-nodes voor tabellen, callouts, inline media, video embeds, preview, undo/redo en gevalideerde links.
- Backoffice, klant-PWA en personeel-PWA gebruiken een gedeelde renderstijl voor KB-content met veilige media-url herschrijving per surface.
- Upload vereist alt-tekst; captions blijven optioneel maar worden inline weergegeven.
- Server-action sanitizing verwijdert scripts, inline event handlers, inline styling en onveilige URL-protocollen voordat HTML wordt opgeslagen.

## Fase 8 - Release Media En Category Management

Doel: releasebeheer krijgt dezelfde volwassenheid als knowledgebasebeheer.

Geraakte UI's:

- `/platform/releases`.
- `/platform/releases/new`.
- `/platform/releases/[slug]`.
- Nieuwe of uitgebreide release category beheerpagina.

Geraakte tabellen:

- `release_categories`.
- `release_media`.

Taken:

- Release category create/edit/archive toevoegen.
- Release media upload en sortering toevoegen.
- Screenshots/video preview toevoegen.
- Media privacy en audience visibility behouden.

Klaar wanneer:

- Platform admin kan releasecategorieen volledig beheren.
- Releases kunnen media tonen zonder publieke storagelekken.

## Fase 9 - Roadmap Kanban Polish En Snelle Triage

Doel: roadmap wordt een werkbaar productboard.

Geraakte UI's:

- `/platform/roadmap`.
- `/platform/roadmap/[itemId]`.
- `/roadmap`.

Geraakte acties:

- Status wijzigen.
- Prioriteit wijzigen.
- Release koppelen.
- Global maken.
- Archiveren.
- Comment toevoegen.

Taken:

- Drag/drop of snelle statusknoppen toevoegen.
- Detaildrawer of side panel toevoegen.
- Quick actions op cards toevoegen.
- Statushistory zichtbaar maken.
- Notificatie-events koppelen.

Klaar wanneer:

- Platform admin kan triage doen vanaf het board.
- Statuswijzigingen schrijven auditlog en notificaties.
- Tenant admins zien alleen toegestane items.

## Fase 10 - Tenant KB, Feature Requests, Feedback En Analytics

Doel: P2 functionaliteit toevoegen zonder multi-tenant risico.

Geraakte onderdelen:

- Tenant-specific KB authoring.
- Personeel/klant featurewensen optioneel.
- Feedbackdashboard.
- Search analytics.
- Release read receipts.

Klaar wanneer:

- Tenant content blijft strikt tenant-scoped.
- Feedback en search analytics zijn bruikbaar voor platformbeheer.
- Feature request indiening is tenant-configureerbaar.

## Fase 11 - Offline/PWA Help Caching

Doel: Help blijft bruikbaar bij beperkte verbinding.

Geraakte UI's:

- Klant-PWA Help/Releases.
- Personeel-PWA Help/Releases.

Taken:

- Cache alleen toegestane content.
- Cache invalidatie bij update.
- Offline states tonen.
- Private media niet onbeperkt lokaal opslaan.

Klaar wanneer:

- Laatst bekeken toegestane helpartikelen zijn offline beschikbaar.
- Nieuwe versies verversen correct.
- Geen gevoelige media lekt via cache.

## Fase 12 - Echte Playwright QA En Acceptatie

Doel: aantoonbaar bewijs dat alles werkt op desktop, tablet en mobiel.

Geraakte flows:

- Platform admin.
- Tenant admin.
- Klant-PWA.
- Personeel-PWA.

Taken:

- Ingelogde Playwright sessies gebruiken.
- Screenshots maken voor desktop/tablet/mobile.
- Deeplinks, search, autocomplete, tooltips, TipTap, releases, roadmap, notifications en media access testen.
- Typecheck/build/gates draaien.

Klaar wanneer:

- Screenshots en testoutput zijn beschikbaar.
- Geen horizontale scroll, overlap of kapotte dialogs.
- Alle gates slagen.
