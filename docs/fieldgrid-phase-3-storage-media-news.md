# Fieldgrid fase 3 media, news en storage bewijs

Datum: 2026-07-03  
Status: fase 3 assignment media, news-scope en storagebewijs.  
Gerelateerd: `docs/fieldgrid-next-major-update-plan.md`, `docs/fieldgrid-data-classification.md`, `docs/fieldgrid-cross-tenant-testmatrix.md`, `docs/fieldgrid-staging-promotion-checklist.md`.

## Doel

Fase 3 sluit de P1-restpunten rond downloadbare assignment-media, open news-scope en storage-path bewijs zonder stagingdata te resetten of storage-objecten direct te verplaatsen.

## Uitgevoerd

### Assignment media tenant-aware

Migraties:

- `lib/db/migrations/063_assignment_media_news_storage.sql`
- `lib/db/migrations/064_assignment_storage_policy_guards.sql`

De migraties doen staging-safe:

- voegen `tenant_id` toe aan `assignment_photos`;
- voegen `tenant_id` toe aan `assignment_report_note_attachments`;
- backfillen beide via `assignments.tenant_id`;
- voegen `NOT VALID` required checks toe voor toekomstige writes;
- voegen triggers toe die `tenant_id` bij nieuwe of gewijzigde media automatisch afleiden uit `assignment_id`;
- blokkeren mismatch tussen media-tenant en assignment-tenant;
- blokkeren report-note attachments waarvan `note_id` niet bij dezelfde assignment hoort;
- voegen tenant/indexen toe voor directe media-tenantchecks.

### Storage-paden en policies

Deze fase verplaatst geen fysieke storage-objecten. Het storage-contract wordt wel expliciet:

- documenten: `tenant/{tenant_id}/...`;
- assignment media: `tenant/{tenant_id}/assignments/{assignment_id}/...`;
- news hero images: `platform/news-hero/...`.

De storage policies voor `assignment-photos` accepteren tijdelijk twee paden:

- legacy: `{assignment_id}/...`;
- canoniek: `tenant/{tenant_id}/assignments/{assignment_id}/...`.

Policy helperfuncties parsen legacy en canonieke paden zonder onveilige UUID-casts. Update-policy voor assignment-photo upserts is toegevoegd, zodat Supabase Storage upsert niet stil faalt door ontbrekende update-rechten.

### News scope

Productbesluit fase 3:

- News is voorlopig `platform_only`.
- `news_posts.scope` staat op `platform`.
- `news_posts.tenant_id` is gereserveerd voor een latere tenant-newsfase, maar moet nu `NULL` blijven.
- `news_post_targets` mag vanaf deze fase alleen platformbrede targets bevatten: `all_personnel` en `all_customers` zonder `target_id`.
- Tenant-scoped news wordt niet half ingevoerd; dat vereist later een apart schema/runtime/testontwerp.

### Rapportage

Script: `lib/db/scripts/storage-tenancy-report.mjs`

```bash
pnpm fieldgrid:phase3-storage-report
pnpm fieldgrid:phase3-storage-report -- --json
pnpm fieldgrid:phase3-storage-report -- --fail-on-legacy
```

Het script is read-only en rapporteert:

- unresolved `tenant_id` rows in assignment media;
- legacy versus canonieke storage paths voor documents en assignment media;
- legacy news hero image paths;
- non-platform news scope of invalid platform targets;
- ontbrekende Supabase Storage policies.

Voor productie-achtige targets weigert het script standaard. Voor expliciete read-only productiecontrole kan `PHASE3_STORAGE_REPORT_ALLOW_PRODUCTION=true` worden gezet.

## Niet gedaan in deze fase

- Geen fysieke storage move/delete.
- Geen cleanup van legacy objecten.
- Geen `ALTER COLUMN tenant_id SET NOT NULL` op bestaande media.
- Geen tenant-scoped news runtime.
- Geen volledige Playwright/storage integration suite; deze fase voegt wel het rapport en statische guardrails toe.

## Staging-promotie

Fase 3 mag naar staging wanneer:

- `pnpm test` groen is;
- `pnpm run typecheck` groen is;
- `pnpm --filter @workspace/db run db:migrate` groen is op lege database;
- dezelfde migratie groen is op een staging-copy;
- `pnpm fieldgrid:phase3-storage-report -- --json` is vastgelegd voor de staging-copy.

Als staging faalt, herstel alleen fase 3. Geen reset, drop of rebuild.

## Vervolg

1. Draai het fase-3 rapport op staging-copy.
2. Los unresolved media-tenant rows op.
3. Runtime helpers voor nieuwe canonical assignment media uploads zijn in Sprint 9 geleverd.
4. Voer fysieke storage-backfill copy-first uit:
   - copy legacy object;
   - verify canonical object;
   - update DB path;
   - smoke download;
   - cleanup pas in een aparte latere PR.
5. Bouw echte storage signed-url/path guessing integration tests bovenop de Sprint 9 signed-url guards.
6. Ontwerp tenant-scoped news alleen als er een productbesluit komt dat platform-only news niet genoeg is.

## Test-id koppeling

- `FG-DATA-010`
- `FG-STORAGE-001`
- `FG-STORAGE-002`
- `FG-STORAGE-003`
- `FG-STORAGE-004`
- `FG-STORAGE-006`
- `FG-STORAGE-007`
- `FG-PORTAL-P-003`
- `FG-MIG-001`
- `FG-MIG-002`
- `FG-MIG-003`
