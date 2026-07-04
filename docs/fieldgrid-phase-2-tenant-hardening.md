# Fieldgrid fase 2 tenant hardening

Datum: 2026-07-03  
Status: fase 2 post-migration hardening.  
Gerelateerd: `docs/fieldgrid-next-major-update-plan.md`, `docs/fieldgrid-data-classification.md`, `docs/fieldgrid-cross-tenant-testmatrix.md`, `docs/fieldgrid-staging-promotion-checklist.md`.

## Doel

Fase 2 zet de tenant-aware foundation om naar harde, staging-veilige datagrenzen. Deze stap forceert nog geen `SET NOT NULL` op bestaande stagingdata. Eerst worden unresolved rows gerapporteerd, toekomstige null-writes geblokkeerd met `NOT VALID` checks en de bekende `DEFAULT_TENANT_ID` fallback op `assignments.tenant_id` verwijderd.

## Uitgevoerd

### Migratie

Bestand: `lib/db/migrations/062_post_migration_tenant_hardening.sql`

Doet staging-safe:

- voegt ontbrekende `tenant_id` kolommen idempotent toe voor finance/report/payment/audit-tabellen;
- backfillt `tenant_id` via sterke parentrelaties:
  - reports via assignments;
  - quotes via assignments/customers;
  - invoices via assignments/customers;
  - payments via invoices;
  - customer payment batches via customers;
  - batch items via batches/invoices;
  - audit log alleen via expliciete metadata tenant id waar geldig;
- dropt de database-default op `assignments.tenant_id`;
- voegt tenant-id indexes toe;
- voegt `CHECK (tenant_id IS NOT NULL) NOT VALID` toe voor gevoelige tenantdata;
- laat `audit_log.tenant_id` bewust nullable voor platform/global audit.

Aanvulling sprint 8:

- `lib/db/migrations/070_sprint8_tenant_id_default_hardening.sql` verwijdert resterende `tenant_id` database-defaults naar `DEFAULT_TENANT_ID` uit tenant-scoped runtime- en configuratietabellen;
- `emitDomainEvent` en bekende backoffice-writes moeten tenantcontext expliciet meesturen;
- Ontbrekende tenantcontext schrijft niet stil naar de default tenant.

Niet gedaan in deze fase:

- geen `ALTER COLUMN tenant_id SET NOT NULL` op gevoelige nullable tabellen;
- geen destructieve cleanup;
- geen storage backfill;
- geen assignment media tenant_id migratie.

### Schema

`lib/db/src/schema/assignments.ts` beschrijft geen default tenant fallback meer. Nieuwe assignment writes moeten expliciet tenantcontext zetten.

### Rapportage

Script:

```bash
pnpm fieldgrid:phase2-hardening-report
pnpm fieldgrid:phase2-hardening-report -- --json
pnpm fieldgrid:phase2-hardening-report -- --fail-on-unresolved
```

Het script is read-only en rapporteert:

- unresolved `tenant_id` rows per gevoelige tabel;
- of `assignments.tenant_id` nog een default heeft;
- of sprint 8 default-hardened tabellen nog een `tenant_id` default hebben;
- of de required-check bestaat en gevalideerd is;
- welke tabellen klaar zijn voor een latere `SET NOT NULL` wave;
- `audit_log` nullable rows per resource.

Voor productie-achtige targets weigert het script standaard. Voor expliciete read-only productiecontrole kan `PHASE2_REPORT_ALLOW_PRODUCTION=true` worden gezet.

## Staging-promotie

Fase 2 mag naar staging wanneer:

- `pnpm test` groen is;
- `pnpm run typecheck` groen is;
- `pnpm --filter @workspace/db run db:migrate` groen is op lege database;
- dezelfde migratie groen is op een staging-copy;
- `pnpm fieldgrid:phase2-hardening-report -- --json` is vastgelegd voor de staging-copy.

Als de migratie op staging faalt, herstel alleen deze fase. Geen reset, drop of rebuild.

## Vervolg

Volgende fase-2/hardening PR na staging-copy bewijs:

1. Draai `pnpm fieldgrid:phase2-hardening-report -- --fail-on-unresolved` op staging-copy.
2. Los unresolved rows per tabel op.
3. Valideer de `*_tenant_id_required_check` constraints.
4. Zet `tenant_id SET NOT NULL` alleen op tabellen met nul unresolved rows.
5. Documenteer audit-log uitzonderingen per resource.

## Test-id koppeling

- `FG-DATA-004` t/m `FG-DATA-009`
- `FG-AUDIT-001` t/m `FG-AUDIT-005`
- `FG-MIG-001`
- `FG-MIG-002`
- `FG-MIG-003`
