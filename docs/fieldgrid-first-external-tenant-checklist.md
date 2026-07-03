# Fieldgrid eerste externe tenant checklist

Datum: 2026-07-03  
Status: operationele acceptatiechecklist voor fase 7.  
Gerelateerd: `docs/fieldgrid-phase-7-operations.md`, `docs/fieldgrid-cross-tenant-testmatrix.md`, `docs/fieldgrid-staging-promotion-checklist.md`.

## Doel

Deze checklist bepaalt wanneer Fieldgrid klaar is om de eerste externe tenant gecontroleerd te onboarden. Veele blijft een gewone tenant en is geen platform-uitzondering.

## 1. Platform en staging readiness

- [ ] `main` is bron van waarheid.
- [ ] Staging draait op `staging.fieldgrid.nl`.
- [ ] Productieplatform draait op `platform.fieldgrid.nl`.
- [ ] `/platform/staging-smoke` is bereikbaar voor platform owner/admin.
- [ ] `FG-SMOKE-HOST` is groen of heeft een expliciete owner.
- [ ] `FG-SMOKE-LOGIN` is groen.
- [ ] `FG-SMOKE-MIGRATIONS` is groen of staging-copy smoke is apart vastgelegd.
- [ ] Backupbewijs is vastgelegd volgens `docs/fieldgrid-backup-restore-rollback-playbook.md`.

## 2. Tenant provisioning

- [ ] Tenantnaam, slug en primair domein zijn bekend.
- [ ] Plan is gekozen: Starter, Professional of Enterprise.
- [ ] Owner e-mail is bevestigd.
- [ ] Tenant wordt via platform-admin onboarding aangemaakt, niet via handmatige SQL.
- [ ] Owner-invite status is gecontroleerd.
- [ ] Tenantdetail toont first-run status.
- [ ] Tenant heeft minimaal een verified domain of expliciete DNS follow-up.

## 3. Modules en sectors

- [ ] Actieve modules zijn gekozen en zichtbaar op tenantdetail.
- [ ] Module dependencies zijn gecontroleerd.
- [ ] `FG-SMOKE-MODULES` is groen of heeft een expliciete owner.
- [ ] Tenantsectoren zijn gekozen.
- [ ] Tenant sector policy is gecontroleerd.
- [ ] `FG-SMOKE-SECTORS` is groen of heeft een expliciete owner.

## 4. Data en storage

- [ ] Eerste klant/object/personeel/opdracht is optioneel voorbereid of bewust leeg gelaten.
- [ ] Document upload/download smoke is uitgevoerd als documenten worden gebruikt.
- [ ] `FG-SMOKE-STORAGE` is groen, of legacy paths zijn gedocumenteerd.
- [ ] PDF/download audit is gecontroleerd als rapporten, offertes of facturen worden gebruikt.
- [ ] Tenant B kan geen Tenant A data of storagepath openen in de relevante smoke.

## 5. Security en support

- [ ] Platform-admin routes zijn alleen bereikbaar voor actieve platform users.
- [ ] Gewone tenantgebruikers kunnen geen platformroutes openen.
- [ ] Support break-glass reden en TTL zijn getest.
- [ ] Support grant voor verkeerde tenant faalt.
- [ ] Verlopen support grant faalt.
- [ ] `/platform/security` toont support en auditcontext zonder tenantdata te lekken.
- [ ] Tenant-admin krijgt geen platform/support-only auditdata te zien.

## 6. Branding en first-run

- [ ] Branding preview is gecontroleerd.
- [ ] Logo/kleur/e-mailtekst zijn bewust default of aangepast.
- [ ] Tenant first-run status is beoordeeld.
- [ ] Owner weet welke first-run stappen nog open staan.

## 7. Go/no-go

Go wanneer:

- staging smoke minimum green is groen of alle `manual` checks hebben een eigenaar;
- platform owner login werkt;
- tenant owner login werkt;
- host-first routing werkt;
- module en sector denial werken voor ten minste een kritieke route;
- support access is tijdelijk, expliciet en geaudit;
- backup/rollback is klaar.

No-go wanneer:

- hostcontext kan worden overschreven door tenant switcher;
- data van Tenant A zichtbaar is via Tenant B;
- supportgrant zonder juiste tenant of tijdvenster werkt;
- storage signed URL cross-tenant werkt;
- migration state onduidelijk is;
- rollbackpad ontbreekt.

## 8. Na onboarding

- [ ] Noteer tenant-id, slug en domein in operationele administratie.
- [ ] Noteer plan, modules en sectoren.
- [ ] Noteer owner en eerste supportcontact.
- [ ] Controleer usage dashboard na eerste data.
- [ ] Plan een eerste security smoke na livegebruik.
