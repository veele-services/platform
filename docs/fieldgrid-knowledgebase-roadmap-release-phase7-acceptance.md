# Fieldgrid knowledgebase, roadmap en releases - fase 7 acceptatie

Datum: 2026-07-06

## Scope

Fase 7 uit `docs/research-knowledgebase-roadmap-release-notes.md` dekt polish, security en acceptatietests voor:

- knowledgebase artikelen, media, search, feedback en tooltips;
- roadmapbord en tenant featurewensen;
- releasebeheer, release highlights en dismiss state;
- tenant, audience, module en permission visibility;
- PWA/mobile help- en releaseviews.

## Uitgevoerde hardening

- Knowledgebase-media is private-by-default gemaakt via `086_knowledgebase_media_privacy_hardening.sql`.
- De oude `knowledgebase_media_public_read` storage policy wordt verwijderd.
- Bestaande `kb_article_media.public_url` waarden worden leeggemaakt.
- Runtime helpers geven legacy `publicUrl` niet meer door.
- Media wordt alleen nog geladen via protected routes die eerst `getKnowledgebaseMediaByIdForContext` gebruiken en daarna een tijdelijke Supabase signed URL maken.

## Protected media routes

- Platform admin: `/platform/knowledgebase/media/[mediaId]`
- Tenant backoffice: `/help/media/[mediaId]`
- Klant-PWA: `/help/media/[mediaId]`
- Personeel-PWA: `/help/media/[mediaId]`

Elke route:

- gebruikt de surface-specifieke auth/identity;
- controleert module-entitlement `knowledgebase`;
- controleert audience, tenant en permission visibility via de centrale helper;
- retourneert alleen een korte signed URL;
- zet `Cache-Control: private, no-store`.

## Automatische fase-7 gate

Toegevoegd:

- `scripts/fieldgrid-kb-roadmap-release-phase7.mjs`
- `pnpm run fieldgrid:kb-roadmap-release-phase7:check`

De gate controleert:

- RLS coverage voor alle nieuwe KB/roadmap/release tabellen;
- afwezigheid van bekende Supabase RLS anti-patterns;
- private knowledgebase-media hardening;
- protected media routes;
- geen directe `publicUrl` links in helpviews;
- centrale visibility helpers;
- roadmap module/audience/tenant gating;
- release highlight dismiss state;
- auditlog coverage;
- deeplink routes;
- PWA/mobile helpstructuur;
- geen tenant-specifieke hardcoding.

## Verificatie

Uitgevoerd:

- `node scripts/fieldgrid-kb-roadmap-release-phase7.mjs --check`
- `node node_modules/typescript/bin/tsc --build`
- `node node_modules/typescript/bin/tsc -p artifacts/backoffice/tsconfig.json --noEmit`
- `node node_modules/typescript/bin/tsc -p artifacts/klant-pwa/tsconfig.json --noEmit`
- `node node_modules/typescript/bin/tsc -p artifacts/personeel-pwa/tsconfig.json --noEmit`

Opmerking: `pnpm run fieldgrid:kb-roadmap-release-phase7:check` is lokaal niet bruikbaar in deze Windows-shell omdat de root `preinstall` `sh` verwacht. Het onderliggende Node-script is direct uitgevoerd en geslaagd.

## Restscope buiten fase 7

Volledige browser/mobile screenshots met echte sessies blijven runtime acceptance, omdat daarvoor ingelogde tenant-, klant- en personeelssessies plus live URLs nodig zijn. De fase-7 gate borgt de statische regressiepunten in code.
