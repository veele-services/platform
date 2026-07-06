# Knowledgebase, Roadmap En Releasebeheer - Fase 1 Security Evidence

Dit document legt vast hoe fase 1 is afgedekt voor RLS, grants, directe Supabase/Data API toegang, cross-tenant regressie en media delivery.

## Directe Data API Toegang

De KB-, roadmap-, release- en tooltip-tabellen worden niet rechtstreeks aan publieke Supabase clientrollen blootgesteld.

- `anon`: geen directe table privileges.
- `authenticated`: geen directe table privileges.
- `service_role`: niet ingetrokken; blijft alleen server-side beschikbaar en mag niet via `NEXT_PUBLIC_*` worden gepubliceerd.
- App/server runtime: gebruikt de server-side databaseverbinding en centrale visibility helpers.

De expliciete hardening staat in:

- `lib/db/migrations/087_kb_roadmap_release_direct_api_hardening.sql`

Daarin wordt voor alle contenttabellen:

- RLS opnieuw expliciet aangezet;
- `REVOKE ALL PRIVILEGES ... FROM anon, authenticated` toegepast;
- een table comment toegevoegd met het server-side access model.

## RLS Posture

RLS is enabled voor alle nieuwe contenttabellen uit:

- `kb_*`
- `roadmap_*`
- `release_*`

De bestaande management-only policies blijven bestaan als defense-in-depth als directe grants later bewust opnieuw worden toegevoegd. Zonder directe grants kunnen `anon` en `authenticated` de tabellen niet via Data API lezen of muteren.

## Server-Side Visibility

Runtime reads lopen via server-side helpers:

- `lib/db/src/content-visibility.ts`
- `lib/db/src/knowledgebase-content.ts`
- `lib/db/src/release-content.ts`
- `artifacts/backoffice/src/app/actions/roadmap.ts`

Deze helpers borgen:

- tenant-scope;
- audience-scope;
- module-entitlements;
- permission-scope;
- published/archived status;
- dismiss-state voor release highlights.

## Cross-Tenant Regression Matrix

De fase-1 gate documenteert en controleert de volgende regressie-eisen:

| Scenario | Verwacht resultaat |
| --- | --- |
| Tenant A vraagt tenant-specifiek KB-artikel van Tenant B op via server helper | Geen artikelresultaat |
| Tenant A vraagt roadmapitem van Tenant B op via tenant board | Geen itemresultaat |
| Tenant A vraagt release highlight buiten eigen module/audience op | Geen highlightresultaat |
| Klantgebruiker vraagt tenant-admin/platform-admin artikel op | Geen artikelresultaat |
| Personeelsgebruiker vraagt klantportaal-only artikel op | Geen artikelresultaat |
| Directe Supabase Data API call met `anon` naar contenttabellen | Geen privileges |
| Directe Supabase Data API call met `authenticated` naar contenttabellen | Geen privileges |
| Platform admin beheert content via server-side platform routes | Toegestaan |
| Service role/database owner voert server-side beheer uit | Toegestaan, alleen server-side |

## Media Bucket En Signed URL Flow

Knowledgebase media is private-by-default:

- bucket `knowledgebase-media` wordt private gezet;
- publieke read policy wordt verwijderd;
- legacy `public_url` waarden worden gewist;
- media routes maken pas een tijdelijke signed URL na article visibility check.

Beschermde routes:

- `artifacts/backoffice/src/app/(platform)/platform/knowledgebase/media/[mediaId]/route.ts`
- `artifacts/backoffice/src/app/(dashboard)/help/media/[mediaId]/route.ts`
- `artifacts/klant-pwa/src/app/(app)/help/media/[mediaId]/route.ts`
- `artifacts/personeel-pwa/src/app/(app)/help/media/[mediaId]/route.ts`

## Verification Commands

Gebruik:

```bash
pnpm run fieldgrid:kb-roadmap-release-phase1-security:check
pnpm run fieldgrid:kb-roadmap-release-phase7:check
```

Wanneer `pnpm` lokaal op Windows blokkeert door shell/native optional dependency setup, kan de gate direct worden gedraaid:

```bash
node scripts/fieldgrid-kb-roadmap-release-phase1-security.mjs --check
node scripts/fieldgrid-kb-roadmap-release-phase7.mjs --check
```

## Acceptatie

Fase 1 is compleet wanneer:

- alle contenttabellen in de gate zitten;
- RLS aan staat;
- directe `anon`/`authenticated` table privileges expliciet zijn ingetrokken;
- er geen nieuwe directe grants naar `anon` of `authenticated` bestaan;
- service-role/server boundary niet client-side lekt;
- media alleen via protected signed URL routes werkt;
- server-side visibility helpers tenant, audience, module en permission scope afdwingen;
- de fase-1 security gate groen is.
