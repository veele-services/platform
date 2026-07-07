# Fieldgrid eerste externe tenant checklist

Datum: 2026-07-07
Status: operationele acceptatiechecklist voor Sprint 16 final gate. Sprint 1 dry-run is ingevuld als `blocked-on-evidence`.
Gerelateerd: `docs/fieldgrid-phase-7-operations.md`, `docs/fieldgrid-cross-tenant-testmatrix.md`, `docs/fieldgrid-staging-promotion-checklist.md`, `docs/fieldgrid-sprint-16-final-gate.md`.

## Doel

Deze checklist bepaalt wanneer Fieldgrid klaar is om de eerste externe tenant gecontroleerd te onboarden. Veele blijft een gewone tenant en is geen platform-uitzondering.

## Sprint 1 dry-run status - 2026-07-07

Pilottenant dry-run zonder echte klantdruk is nog niet live uitgevoerd. De code/testbasis is wel opgeschoond en lokaal groen, maar staging-auth, portal storage-state en smoke database-URLs ontbreken in de huidige shell.

| Onderdeel | Status | Evidence | Owner / actie |
| --- | --- | --- | --- |
| Full suite | Groen | `node --test tests/*.test.mjs`: 505/505 pass | Geen open actie |
| Staging smoke contract | Groen | `node scripts/fieldgrid-sprint15-staging-smoke.mjs --check` | Geen open actie |
| Staging smoke live | Geblokkeerd | HTTP 401 op `https://staging.fieldgrid.nl/api/platform/staging-smoke` | Platform owner levert `FIELDGRID_STAGING_SMOKE_COOKIE` of bearer |
| Migration smoke contract | Groen | `node scripts/fieldgrid-sprint7-migration-smoke.mjs --check` | Geen open actie |
| Migration smoke live | Geblokkeerd | Empty/staging-copy targets `not-configured`, geen migraties uitgevoerd | Platform owner levert smoke DB URLs en confirms |
| Platform-admin strict evidence | Geblokkeerd | Mist `artifacts/platform-admin-final-gate` JSON en `phase13-visual-smoke.json` | Platform owner levert platform cookie en tenant detail path |
| Customer/personnel strict evidence | Geblokkeerd | Mist customer/personnel base URLs en auth cookies/storage-state | Platform owner levert portal sessies en concrete detailroutes |
| Placeholder/security-copy | Groen | MFA "later" copy verwijderd; push metadata neutraal | Geen open actie |
| Pilottenant dry-run | Gekozen, runtime evidence open | Slug `field-demo`, owner `services@fieldgrid.nl`, plan Enterprise, modules all; mutating confirm vereist | Draai pilot-smoke alleen met `FIELDGRID_MUTATING_SMOKE_CONFIRM=field-demo-only` |

## MVP Sprint 2 runtime proof status - 2026-07-08

Sprint 2 voegt de formele runtime gate `pnpm fieldgrid:mvp-sprint2-runtime-proof:check` toe. De strict variant blokkeert totdat alle live evidence echt groen is:

```bash
pnpm fieldgrid:mvp-sprint2-runtime-proof:strict
```

| Onderdeel | Status | Evidence | Owner / actie |
| --- | --- | --- | --- |
| `FG-MVP2-MIGRATIONS` | Groen gemeld | GitHub Actions run https://github.com/veele-services/platform/actions/runs/28902141188 voor empty DB en staging-copy | Artifact-URL bewaren bij releaseformulier |
| `FG-MVP2-STAGING-SMOKE` | Geblokkeerd | Nieuwe cookiepoging gaf HTTP 401 `Authenticatie vereist` | Verse platform-admin cookie/bearer leveren |
| `FG-MVP2-LOGIN-HOST` | Evidence open | Contracten groen; live dashboard mist auth | Playwright login/host smoke draaien |
| `FG-MVP2-TENANT-ISOLATION` | Evidence open | Sprint 5/6 contracten groen | Live wrong-host/direct-ID denial vastleggen |
| `FG-MVP2-STORAGE-DOWNLOAD` | Evidence open | Lokale guards groen | Live signed URL, denial en auditregel vastleggen |
| `FG-MVP2-PORTALS` | Evidence open | Customer/personnel final gate bestaat | Portal cookies/storage-state leveren en strict gate draaien |
| `FG-MVP2-NOTIFICATIONS-EMAIL` | Evidence open | Template/provider/dispatch tests groen | Interne field-demo sandbox dispatch draaien |
| `FG-MVP2-PLATFORM-ADMIN` | Evidence open | Platform-admin final gate contract groen | Owner/admin/support role smoke vastleggen |

## 1. Platform en staging readiness

- [ ] `main` is bron van waarheid.
- [ ] Staging draait op `staging.fieldgrid.nl`.
- [ ] Productieplatform draait op `platform.fieldgrid.nl`.
- [ ] `pnpm fieldgrid:mvp-sprint2-runtime-proof:strict` is groen of alle open `FG-MVP2-*` punten zijn expliciet geaccepteerd door de platform owner.
- [ ] `/platform/staging-smoke` is bereikbaar voor platform owner/admin.
- [ ] `/platform/staging-smoke` toont `Finale externe tenant gate`.
- [ ] `pnpm fieldgrid:sprint16-final-gate:check` is groen.
- [ ] `FG-SMOKE-HOST` is groen of heeft een expliciete owner.
- [ ] `FG-SMOKE-LOGIN` is groen.
- [ ] `FG-SMOKE-MIGRATIONS` is groen of staging-copy smoke is apart vastgelegd.
- [ ] Backupbewijs is vastgelegd volgens `docs/fieldgrid-backup-restore-rollback-playbook.md`.
- [ ] Alle `post-launch-accepted` punten hebben owner, bewijsdoel en go/no-go moment.

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
- [ ] `FG-POST-STORAGE-PROOF` heeft een owner en artifactplanning voordat documenten/media extern gebruikt worden.

## 5. Security en support

- [ ] Platform-admin routes zijn alleen bereikbaar voor actieve platform users.
- [ ] Gewone tenantgebruikers kunnen geen platformroutes openen.
- [ ] Support break-glass reden en TTL zijn getest.
- [ ] Support grant voor verkeerde tenant faalt.
- [ ] Verlopen support grant faalt.
- [ ] `/platform/security` toont support en auditcontext zonder tenantdata te lekken.
- [ ] Tenant-admin krijgt geen platform/support-only auditdata te zien.
- [ ] `FG-FINAL-SERVICE-ROLE` bevestigt dat `SUPABASE_SERVICE_ROLE_KEY` alleen server-side wordt gebruikt.

## 6. Branding en first-run

- [ ] Branding preview is gecontroleerd.
- [ ] Logo/kleur/e-mailtekst zijn bewust default of aangepast.
- [ ] Tenant first-run status is beoordeeld.
- [ ] Owner weet welke first-run stappen nog open staan.

## 7. Final gate en post-launch accepted

- [ ] `FG-FINAL-PERFORMANCE` heeft EXPLAIN-artifactplanning voor tenantquery hotspots.
- [ ] `FG-FINAL-STAGING-COPY` heeft empty-database en staging-copy migration smoke status.
- [ ] `FG-FINAL-RUNTIME-PROOF` heeft live Playwright/storage/DB bewijs of expliciete go/no-go owner.
- [ ] `FG-FINAL-EXTERNAL-TENANT` is door platform owner afgetekend.
- [ ] `FG-POST-RUNTIME-E2E`, `FG-POST-STORAGE-PROOF`, `FG-POST-PORTAL-ACCEPTANCE`, `FG-POST-MIGRATION-SMOKE` en `FG-POST-AUDIT-CENTRALIZATION` zijn niet ownerloos.

## 8. Go/no-go

Go wanneer:

- staging smoke minimum green is groen of alle `manual` checks hebben een eigenaar;
- platform owner login werkt;
- tenant owner login werkt;
- host-first routing werkt;
- module en sector denial werken voor ten minste een kritieke route;
- support access is tijdelijk, expliciet en geaudit;
- backup/rollback is klaar.
- post-launch accepted P0/P1 punten expliciet zijn geaccepteerd door de owner.

No-go wanneer:

- hostcontext kan worden overschreven door tenant switcher;
- data van Tenant A zichtbaar is via Tenant B;
- supportgrant zonder juiste tenant of tijdvenster werkt;
- storage signed URL cross-tenant werkt;
- migration state onduidelijk is;
- rollbackpad ontbreekt.
- een P0/P1 post-launch punt geen owner of go/no-go moment heeft.

## 9. Na onboarding

- [ ] Noteer tenant-id, slug en domein in operationele administratie.
- [ ] Noteer plan, modules en sectoren.
- [ ] Noteer owner en eerste supportcontact.
- [ ] Controleer usage dashboard na eerste data.
- [ ] Plan een eerste security smoke na livegebruik.
