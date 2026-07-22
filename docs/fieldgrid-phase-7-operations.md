# Fieldgrid fase 7 staging smoke en operationele acceptatie

Datum: 2026-07-04
Status: fase 7 uitgevoerd als read-only operationele basis; sprint 16 heeft final external tenant gate en post-launch accepted register toegevoegd.
Gerelateerd: `docs/fieldgrid-next-major-update-plan.md`, `docs/fieldgrid-staging-promotion-checklist.md`, `docs/fieldgrid-cross-tenant-testmatrix.md`, `docs/fieldgrid-backup-restore-rollback-playbook.md`, `docs/fieldgrid-first-external-tenant-checklist.md`, `docs/fieldgrid-sprint-16-final-gate.md`.

## Doel

Fase 7 maakt staging en de eerste externe tenant voorspelbaar controleerbaar zonder stagingdata te resetten of te muteren.

Deze fase levert:

- een read-only staging smoke dashboard voor platform-admins;
- een read-only smoke API voor ops/CI;
- run history voor dashboard-, staging-smoke- en migration-smoke artifacts;
- live Playwright-smoke targets voor host, modules, sectoren, regio's, storage, PDF, portalen en personeelsplanning;
- mutating checks met demo-tenant scope, confirm-env en cleanupselectors;
- finale externe tenant gate met post-launch accepted register;
- een plan-only smoke script voor contractvalidatie;
- een backup/restore/rollback playbook;
- een eerste externe tenant checklist;
- statische guardrails zodat deze operationele afspraken niet uit de canon verdwijnen.

## Scope

Gebouwd:

- `getPlatformStagingSmokeDashboard()` in `artifacts/backoffice/src/app/actions/platform-smoke.ts`.
- Platformpagina `/admin/platform/staging-smoke`.
- Publiek JSON endpoint `/api/platform/staging-smoke` via de API-runtime.
- `pnpm fieldgrid:phase7-smoke` als plan-only script.
- `pnpm fieldgrid:sprint15-staging-smoke:check` als sprint 15 dashboard/history/live-smoke contract.
- `pnpm fieldgrid:sprint16-final-gate:check` als sprint 16 final-gate contract.
- Operationele playbooks en checklistdocs.

Niet gebouwd in deze fase:

- Geen muterende smokechecks.
- Geen fysieke backup of restore vanuit de app.
- Geen nieuwe databasekolommen.
- Geen migraties.
- Geen wijzigingen aan bestaande tenantdata.

## Dashboardchecks

Het dashboard toont de status voor de vaste fase-7 oppervlakken:

| Smoke-id | Oppervlak | Gekoppelde testmatrix |
| --- | --- | --- |
| `FG-SMOKE-HOST` | host, platformhost, staginghost en verified tenant domains | `FG-HOST-001` t/m `FG-HOST-004` |
| `FG-SMOKE-LOGIN` | actieve platform- en tenantgebruikers | `FG-PLATFORM-001`, `FG-RBAC-001` |
| `FG-SMOKE-MODULES` | modulecatalogus en actieve tenantmodules | `FG-MODULE-001`, `FG-MODULE-003`, `FG-MODULE-005` |
| `FG-SMOKE-SECTORS` | tenantsectoren en tenant sector policy | `FG-SECTOR-001`, `FG-SECTOR-002`, `FG-SECTOR-006` |
| `FG-SMOKE-STORAGE` | tenant-prefixed document paths en legacy path signalering | `FG-STORAGE-001`, `FG-STORAGE-002`, `FG-STORAGE-007` |
| `FG-SMOKE-PDF-DOWNLOADS` | documenten, rapporten, offertes, facturen en download audit | `FG-DATA-004` t/m `FG-DATA-007`, `FG-AUDIT-001` |
| `FG-SMOKE-MIGRATIONS` | Drizzle en SQL migration history presence | `FG-MIG-001` t/m `FG-MIG-003` |
| `FG-SMOKE-SUPPORT` | actieve support grants en support audit | `FG-SUPPORT-001`, `FG-SUPPORT-002`, `FG-SUPPORT-005` |
| `FG-SMOKE-AUDIT` | tenant/platform audit en support audit | `FG-AUDIT-001` t/m `FG-AUDIT-004` |

Minimum green voor stagingpromotie:

- `FG-SMOKE-HOST`
- `FG-SMOKE-LOGIN`
- `FG-SMOKE-MODULES`
- `FG-SMOKE-SECTORS`
- `FG-SMOKE-STORAGE`
- `FG-SMOKE-MIGRATIONS`

`manual` betekent dat de code het oppervlak read-only heeft geinventariseerd, maar dat de live omgeving nog een handmatige of later geautomatiseerde actie nodig heeft. Bijvoorbeeld: er zijn nog geen documenten om storage te bewijzen, of er is geen actieve tijdelijke supportgrant.

## Smoke API

Endpoint:

- `GET /api/platform/staging-smoke`

Contract:

- vereist platform-admin toegang via dezelfde guard als het dashboard;
- retourneert hetzelfde object als `getPlatformStagingSmokeDashboard()`;
- is read-only;
- schrijft geen audit, geen smoke rows en geen demo-data;
- faalt veilig als platform-admin toegang ontbreekt.

Aanbevolen stagingcheck:

```bash
curl -f https://staging.fieldgrid.nl/api/platform/staging-smoke
```

Gebruik de JSON alleen als operationele samenvatting. Runtime securitybewijs blijft de testmatrix: Playwright, integration, DB/RLS, storage en migration smoke.

## Smoke script

Commando:

```bash
pnpm fieldgrid:phase7-smoke --check
pnpm fieldgrid:phase7-smoke --json
```

Eigenschappen:

- plan-only;
- destructief: nee;
- wijzigt bestaande tenants: nee;
- valideert of de fase-7 docs bestaan;
- beschrijft de verplichte hosts, demo-tenants en smokechecks.

Het script is geschikt als lichte CI-guardrail naast `pnpm test`.

## Staging-rollout

1. Merge fase 7 naar `main` na groene typecheck/test/build.
2. Sync `main` naar staging.
3. Open `/admin/platform/staging-smoke` als platform owner/admin.
4. Controleer minimum green.
5. Open `/admin/platform/security` voor download/support/auditcontext.
6. Draai `pnpm fieldgrid:phase7-smoke --check` in CI of releaseomgeving.
7. Leg handmatige bevindingen vast voordat een eerste externe tenant wordt geprovisioned.

## Staging-impact

- Geen migraties.
- Geen schemawijzigingen.
- Geen destructieve acties.
- Geen bestaande tenantdata gewijzigd.
- Dashboard en API zijn read-only.
- Muterende smokechecks blijven buiten deze fase en moeten later dedicated demo-tenants plus cleanup gebruiken.

## Acceptatie

Fase 7 is functioneel klaar wanneer:

- `/admin/platform/staging-smoke` opent voor platform-admins;
- `/api/platform/staging-smoke` dezelfde read-only status via de API-runtime kan leveren;
- `pnpm fieldgrid:phase7-smoke --check` slaagt;
- backup/restore/rollback playbook bestaat;
- eerste externe tenant checklist bestaat;
- statische fase-7 test bewaakt dashboard, endpoint, script en docs.

## Sprint 15 vervolgstatus

Sprint 15 levert:

- run history op `/admin/platform/staging-smoke`;
- JSON-artifact discovery voor `artifacts/staging-smoke` en `artifacts/migration-smoke`;
- read-only snapshot script `pnpm fieldgrid:sprint15-staging-smoke:run-read-only`;
- live Playwright-smoke targets;
- mutating cleanup-contracten.

## Sprint 16 final-gate status

Sprint 16 levert:

- `Finale externe tenant gate` in `/admin/platform/staging-smoke`;
- `post-launch-accepted` register met owner, bewijsdoel en go/no-go moment;
- performance review op tenantqueries als verplicht artifact;
- service-role security review;
- final staging-copy smoke als expliciet gatepunt;
- eerste externe tenant checklist als releaseformulier.

Post-launch accepted runtimebewijs:

- echte Playwright-runs tegen staging;
- echte storage policy/path guessing tests;
- echte DB/RLS validatie;
- echte mutating runner met cleanup.

## Open vervolgwerk

- Live Playwright-smoke koppelen aan staginghost.
- Migration smoke tegen lege database en staging-copy automatiseren in CI.
- Storage path guessing tests koppelen aan echte Supabase Storage policies.
- Muterende smokechecks alleen via `demo-a`, `demo-b` en `veele` met cleanup uitvoeren.
- Dashboard uitbreiden met laatste smoke-run timestamps zodra er een echte smoke-runner bestaat.
