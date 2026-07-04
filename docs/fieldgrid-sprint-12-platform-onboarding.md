# Fieldgrid sprint 12 - platform onboarding wizard

Status: geimplementeerd als platform-admin wizard met save/resume, review, provisioning runstatus, retry en rollbackpad. Runtimebewijs blijft `runtime-proof-open`.

## Doel

Sprint 12 maakt tenantaanmaak een begeleide platformflow in plaats van een los formulier of SQL-handeling. Een platform-admin kan tenantgegevens, domein, plan, modules, sectoren, regio's, owner invite en branding in een wizard invullen, als concept bewaren en later hervatten.

## Geleverd

- `/platform` toont de Tenant onboarding wizard als eerste platform-admin actie.
- De wizard bevat stappen voor:
  - tenantgegevens;
  - domein en plan;
  - modules, sectoren en regio's;
  - owner invite en branding;
  - review, runstatus en rollback.
- `savePlatformOnboardingDraft` bewaart concepten in `tenant_provisioning_runs` met `status = draft`, `current_step = draft` en wizardmetadata.
- `getPlatformOnboardingDraft` laadt een concept via `/platform?onboardingDraft=<runId>`.
- `createPlatformTenant` provisiont vanuit de wizard en geeft alle gekozen modules, sectoren, regio's en branding door aan de transactionele provisioningservice.
- `retryPlatformTenantProvisioning` kan mislukte of teruggedraaide runs opnieuw uitvoeren vanuit dezelfde wizardmetadata.
- De runhistorie toont status, owner invite status, module/sector/regio scope, foutmelding, hervatten, retry en rollbackpad.

## Provisioningservice

`lib/db/src/tenant-provisioning.ts` is uitgebreid zonder nieuwe migratie:

- `moduleKeys` blijven de bron voor tenantmodules.
- `sectorIds`, `defaultSectorId` en `sectorMode` richten tenantsectoren en sectorbeleid in.
- `regionNames` seedt `tenant_regions` als tenant-brede catalogus.
- `branding` seedt `organization_settings` met displaynaam, kleuren en e-mailhandtekening.
- Fieldgrid-subdomeinen gebruiken `fieldgrid_subdomain`; custom domeinen gebruiken `custom_domain`, zodat provisioning aansluit op de bestaande databasecheck.
- Rollback bewaart de oorspronkelijke wizardmetadata en schrijft een expliciet rollbackobject.

## Save/resume contract

Concepten zijn gewone provisioning runs:

- `status`: `draft`;
- `current_step`: `draft`;
- `metadata.onboardingWizard.saveResume`: `true`;
- `metadata.onboardingWizard.reviewStatus`: `draft` of `approved`;
- `metadata.onboardingWizard` bevat de invulvelden die nodig zijn voor hervatten en retry.

Wanneer een concept succesvol is geprovisioned, blijft het concept zichtbaar met `current_step = provisioned` en verwijzingen naar `provisionedTenantId` en `provisionedRunId`.

## Rollback en retry

Bij owner-invite failure wordt de net aangemaakte tenant via `rollbackProvisionedTenant` verwijderd. De run krijgt:

- `status = rolled_back`;
- `current_step = rolled_back`;
- `owner_invite_status = rolled_back`;
- `metadata.rollback` met tenant-id, reden, actor en timestamp.

Daarmee heeft de platform-admin een zichtbaar rollbackpad en kan de run opnieuw worden hervat of geretryd.

## Testmatrix

Deze sprint raakt minimaal:

| Test-id | Status na sprint 12 | Reden |
| --- | --- | --- |
| `FG-OPS-001` | `runtime-proof-open` | Wizardflow is gebouwd; Playwright/integration bewijs blijft open. |
| `FG-PLATFORM-001` | `runtime-proof-open` | Platform-admin route blijft vereist. |
| `FG-PLATFORM-005` | `runtime-proof-open` | Plan/modules worden bij provisioning ingericht. |
| `FG-HOST-006` | `runtime-proof-open` | Domein wordt bij provisioning gekoppeld; host E2E bewijs blijft nodig. |
| `FG-REGION-001` | `partial` | Tenant-regio catalogus kan worden gezaaid; volledige regio runtime blijft elders. |
| `FG-MIG-001` / `FG-MIG-002` | `partial` | Geen nieuwe migratie; bestaande migration smoke blijft gate. |

## Open runtimebewijs

- Playwright happy path voor draft -> resume -> provision.
- Integration test voor provisioning success met modules, sectoren, regio's en branding.
- Integration test voor owner-invite failure rollback en retry.
- Duplicate slug/domain acceptance met duidelijke foutstatus.
- Staging smoke met echte `DATABASE_URL` en Supabase owner invite.
