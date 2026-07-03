# Fieldgrid sprint 3: sectorbeleid productklaar maken

Datum: 2026-07-03
Status: uitgevoerd op `codex/sprint-3-sector-policy`
Gerelateerd: `docs/fieldgrid-saas-masterplan.md`, `docs/fieldgrid-data-classification.md`, `docs/fieldgrid-cross-tenant-testmatrix.md`

## Doel

Sprint 3 maakt sectoren meer dan een losse tenant-sector koppeling. Tenants krijgen expliciet sectorbeleid met single/multi mode, defaultsector, optionele max-sector limiet en een enforcement-vlag. Server-side writes blijven leidend; UI en actions mogen alleen tenant-enabled sectoren aanbieden of opslaan.

## Geleverde wijzigingen

- Nieuwe tabel `tenant_sector_settings` met:
  - `mode`: `multi` of `single`;
  - `max_sectors`;
  - `default_sector_id`;
  - `enforce_sector_scope`;
  - auditvelden via timestamps.
- Staging-safe migratie `061_tenant_sector_policy.sql`:
  - maakt settings idempotent aan;
  - seedt bestaande tenants zonder bestaande sectorlinks te verwijderen;
  - zet tenants met exact een enabled sector automatisch op single-sector default;
  - voegt een `tenant_sectors` limiettrigger toe;
  - vervangt de oude enabled-sector triggers door policy-aware triggers op `customers`, `objects`, `personnel` en `task_codes`.
- Gedeelde helperlaag in `artifacts/backoffice/src/lib/tenant-sectors.ts`:
  - `getTenantSectorPolicy()`;
  - `listEnabledTenantSectorOptions()`;
  - `resolveTenantSectorForWrite()`;
  - enforcement-aware `assertTenantSectorAllowed()` en `assertTenantSectorsAllowed()`.
- Tenant-sector settings actions:
  - settings lezen en bijwerken;
  - single-sector mode blokkeren zolang meer dan een sector actief is;
  - defaultsector valideren tegen enabled tenantsectoren;
  - sector uitschakelen blokkeren als die nog gebruikt wordt door klanten, objecten, personeel of taakcodes.
- Task-code actions zijn tenant-scoped gemaakt:
  - reads filteren op huidige tenant;
  - creates zetten `tenantId` expliciet;
  - updates/status/delete filteren op huidige tenant;
  - sectoropties komen uit enabled tenantsectoren;
  - sector writes gebruiken de default/policy resolver.

## Runtime contract

Voor sectorgevoelige writes geldt vanaf deze sprint:

1. bepaal huidige tenant;
2. lees `tenant_sector_settings`;
3. als `enforce_sector_scope=false`, laat legacy/null gedrag toe;
4. als `mode=single` en sector ontbreekt, vul defaultsector server-side in;
5. controleer dat de sector enabled is voor de tenant en globaal actief is;
6. blokkeer uitschakelen van sectoren die nog in tenantdata gebruikt worden.

De database blijft de harde grens via policy-aware triggers. Actions geven daarboven betere foutmeldingen en voorkomen dat de UI ongeldige keuzes aanbiedt.

## Canonieke acceptatie-items

Deze sprint dekt de eerste implementatie voor:

- `FG-SECTOR-001`: geldige tenantsector werkt;
- `FG-SECTOR-002`: sector buiten tenant faalt;
- `FG-SECTOR-003`: disabled sector faalt;
- `FG-SECTOR-004`: disable sector met bestaande data faalt;
- `FG-SECTOR-005`: single-sector defaultgedrag;
- `FG-SECTOR-006`: assignment sector consistency blijft expliciet vervolgwerk.

## Bewust buiten scope

- Geen tenant task-code prijsmodel; dat blijft Sprint 9.
- Geen volledige visuele sectorbeleid-editor; server actions en schema zijn klaar, UI-polish volgt in platform-admin/settings werk.
- Geen echte DB/RLS/integration tests in deze sessie, omdat er geen lokale database beschikbaar is.
- Geen assignment sectorkolom; assignment policy blijft voorlopig afgeleid uit customer/object/task context.

## Volgende stap

De volgende sectorstap is runtimebewijs met Tenant A/B/Veele fixtures: sector A enabled, sector B disabled/outside tenant, single-sector defaulttenant en disable-pogingen met bestaande customers/objects/personnel/task_codes. Daarna kan assignment sector consistency (`FG-SECTOR-006`) expliciet worden ontworpen.
