# Fieldgrid Sprint 6 - Documenten en storage wave 1

Datum: 2026-07-03  
Status: uitgevoerd op branch `codex/sprint-6-documents-storage-20260703`.  
Gerelateerd: `docs/fieldgrid-saas-masterplan.md`, `docs/fieldgrid-data-classification.md`, `docs/fieldgrid-cross-tenant-testmatrix.md`.

## Doel

De eerste gevoelige data-normalisatie uitvoeren met documenten als basispatroon voor latere finance/report/media golven.

Sprint 6 volgt deze vaste besluiten:

- `documents` krijgt een eigen tenantgrens via `documents.tenant_id`.
- Nieuwe document-storage gebruikt het canonieke pad `tenant/{tenant_id}/...`.
- Bestaande staging-data en bestaande storageobjecten worden niet destructief herschreven.
- Oude legacy-paden blijven alleen tijdelijk leesbaar via een expliciete legacy-optie in de validator.
- Nieuwe tenant-scoped documentrijen moeten via een `NOT VALID` databaseconstraint een canoniek tenantpad gebruiken.

## Scope uitgevoerd

- `documents.tenant_id` toegevoegd in schema-export.
- Staging-safe migratie `061_documents_tenant_storage.sql` toegevoegd.
- Backfillvolgorde voor bestaande documenten toegevoegd:
  - assignment parent;
  - customer parent;
  - personnel parent;
  - object parent;
  - unambiguous active uploader membership;
  - unambiguous uploader membership;
  - bestaande storage path prefix.
- Indexen toegevoegd voor tenant en tenant/entity reads.
- `documents_storage_canonical_tenant_path_check` toegevoegd als `NOT VALID` constraint:
  - bestaande legacy-rijen worden niet geblokkeerd;
  - nieuwe of gewijzigde tenant-scoped rijen moeten `tenant/{tenant_id}/...` gebruiken.
- Gedeelde storage helper toegevoegd in `@workspace/db`:
  - `normalizeStoragePath`;
  - `buildTenantStoragePath`;
  - `getTenantBoundStoragePath`;
  - `isCanonicalTenantStoragePath`.
- Backoffice documentactions aangepast:
  - lijst gebruikt eerst `documents.tenant_id`;
  - upload schrijft `tenant_id` en canoniek storagepad;
  - download zoekt document op `id + tenant_id`;
  - delete zoekt en verwijdert document op `id + tenant_id`;
  - signed URL/delete gebruiken de gedeelde tenant-bound storage validator.

## Bewuste grenzen

- Geen fysieke Supabase Storage object move in SQL. De database kan storageobjecten niet veilig verplaatsen.
- Legacy documentpaden met `{tenant_id}/...` blijven tijdelijk toegestaan voor download/delete zolang de storagebackfill niet is uitgevoerd.
- `documents.tenant_id` wordt alleen `NOT NULL` als de migratie alle bestaande rijen kan backfillen. Onopgeloste legacy-rijen blijven inspecteerbaar en blokkeren de deploy niet.
- Assignment media, reports, invoices, quotes en payments blijven voor volgende sprints.
- Storage policies/RLS zijn niet volledig bewezen in deze PR; dit sprintresultaat legt de applicatiegrens en migratiebasis.

## Storage backfillplan voor staging

Voor bestaande storageobjecten moet de backfill buiten SQL gebeuren, met Supabase Storage API of een gecontroleerde beheerjob.

Aanpak:

1. Draai migratie `061_documents_tenant_storage.sql` op staging-copy.
2. Rapporteer documenten met `tenant_id IS NULL` en los die handmatig of via aanvullende mapping op.
3. Rapporteer documenten met legacy pad:
   - `storage_path LIKE tenant_id::text || '/%'`.
4. Voor elke legacy rij:
   - bereken doelpad als `tenant/{tenant_id}/documents/...`;
   - kopieer object van oud pad naar doelpad;
   - verifieer size/hash waar beschikbaar;
   - update `documents.storage_path` naar doelpad;
   - behoud oud object tot downloads rooktest groen is.
5. Draai storage tests voor download, path guessing en delete.
6. Valideer daarna pas de constraint met `ALTER TABLE documents VALIDATE CONSTRAINT documents_storage_canonical_tenant_path_check`.
7. Maak daarna een vervolg-PR om legacy-padacceptatie in de validator uit te zetten.

## Acceptatie en test-id's

Sprint 6 raakt deze canonieke test-id's:

- `FG-DATA-004`
- `FG-STORAGE-001`
- `FG-STORAGE-002`
- `FG-STORAGE-006`
- `FG-STORAGE-007`
- `FG-AUDIT-001`
- `FG-MIG-001`
- `FG-MIG-002`

Statische bewaking: `tests/fieldgrid-sprint-6-documents-storage.test.mjs`.

Echte runtime-bewijsvoering blijft verplicht voor SaaS-acceptatie:

- Tenant B kan Tenant A document-id niet downloaden.
- Tenant B kan Tenant A storage path niet gebruiken voor signed URL.
- Tenant B kan Tenant A document niet deleten.
- Migratie slaagt op lege database en staging-copy.
- Legacy storagebackfill is idempotent en behoudt bestaande stagingdata.

## Implementatiecontract

- Nieuwe document-storagepaden beginnen met `tenant/{tenant_id}/`.
- Documentqueries gebruiken `documents.tenant_id` als eerste filter.
- Parent/entity checks blijven bestaan als extra bescherming.
- Storagepaden worden nooit direct vertrouwd; ze gaan door `getTenantBoundStoragePath()`.
- Legacy `{tenant_id}/...` paden zijn tijdelijk en expliciet via `allowLegacyTenantRoot`.
- Onbekende, absolute, backslash- of traversal-paden falen altijd.

## Volgende sprint

Sprint 7 bouwt finance en reports wave 2:

- `reports.tenant_id`;
- `quotes.tenant_id`;
- `invoices.tenant_id`;
- uniforme PDF/download audit;
- direct-ID tests voor report, quote en invoice.
