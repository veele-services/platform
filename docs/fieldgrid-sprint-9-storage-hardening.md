# Fieldgrid Sprint 9 - Storage hardening

Datum: 2026-07-04
Status: `geleverd` voor applicatie-hardening, tenant-prefixed nieuwe uploads en statisch signed-url bewijs. Fysieke Supabase Storage object-copy blijft een gecontroleerde staging/ops-stap volgens het copy-first cleanup-plan.

Gerelateerd: `docs/fieldgrid-saas-proof-sprint-plan.md`, `docs/fieldgrid-phase-3-storage-media-news.md`, `docs/fieldgrid-data-classification.md`, `docs/fieldgrid-cross-tenant-testmatrix.md`.

## Doel

Sprint 9 maakt assignment-media storage tenant-aware in runtimecode. Nieuwe uploadpaden volgen het canonieke contract `tenant/{tenant_id}/assignments/{assignment_id}/...`; bestaande legacy-objecten blijven tijdelijk bereikbaar zodat stagingdata niet wordt gebroken.

## Geleverd

- `lib/db/src/storage-paths.ts` bevat nu assignment-media helpers voor canonical path build, tenant-bound validation en canonical path detectie.
- Personeelsapp rapportbijlagen worden nieuw geupload naar `tenant/{tenant_id}/assignments/{assignment_id}/report-notes/...`.
- Personeelsapp meerwerkfoto's worden nieuw geupload naar `tenant/{tenant_id}/assignments/{assignment_id}/extra-work/{extra_work_id}/...`.
- Klantportaal approved-photo signed URLs gebruiken de gedeelde tenant/assignment-bound validator voor het storage path.
- Backoffice report timeline attachments worden pas ondertekend nadat het path aan de huidige tenant en assignment is gebonden.
- Legacy assignment-media paden blijven alleen via expliciete overgangsvlaggen leesbaar:
  - `{assignment_id}/...`;
  - `assignments/{assignment_id}/...`;
  - `{tenant_id}/assignments/{assignment_id}/...`;
  - `tenants/{tenant_id}/assignments/{assignment_id}/...`.

## Bewijs

- Tenant B krijgt geen Tenant A signed URL/path access via de applicatiehelpers: signed URL helpers tekenen alleen tenant-bound paths.
- Nieuwe uploads zijn tenant-prefixed doordat upload-token actions alleen canonical paden bouwen.
- Oude bestanden blijven bereikbaar tijdens transitie via expliciete legacy-read opties.
- Statische guardrails:
  - `tests/fieldgrid-sprint-9-storage-hardening.test.mjs`;
  - `tests/fieldgrid-customer-assignment-photo-storage.test.mjs`;
  - `tests/fieldgrid-report-tenant-scope.test.mjs`;
  - `tests/fieldgrid-phase-3.test.mjs`.

## Copy-first fysieke storagebackfill

Deze PR verplaatst geen objecten in Supabase Storage. De fysieke backfill moet per bucket op staging-copy en daarna staging worden uitgevoerd:

1. Maak voor elk legacy assignment-media object een canonical kopie onder `tenant/{tenant_id}/assignments/{assignment_id}/...`.
2. Verifieer objectgrootte, content-type en downloadbaarheid van de canonical kopie.
3. Update de database-`storage_path` pas na succesvolle verify.
4. Draai signed-url smokes voor personeel, klant en backoffice.
5. Houd legacy-read tijdelijk aan tot alle paden canonical rapporteren.
6. Verwijder legacy-objecten pas in een aparte cleanup-PR met rollbacklog.

## Legacy-path cleanup-plan

Dit is het legacy-path cleanup-plan voor Sprint 9.

Cleanup mag pas starten wanneer `pnpm fieldgrid:phase3-storage-report -- --fail-on-legacy` groen is op een staging-copy of bewust de resterende legacy-objecten rapporteert met eigenaar en deadline.

Voor cleanup:

- exporteer een lijst met oude en nieuwe paden;
- bewaar een restorelijst voor rollback;
- verwijder alleen objecten waarvan de database al naar canonical verwijst;
- herhaal signed-url/path guessing smokes na verwijdering.

## Nog open voor runtimebewijs

- Echte Supabase Storage policy/RLS integrationtest met Tenant A/B fixtures.
- Echte path-guessing test tegen de storage provider.
- Productiebesluit wanneer legacy-read vlaggen uit de applicatie mogen.
