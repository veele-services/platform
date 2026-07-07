# Fieldgrid Fase 4 - Ops, CI en teststructuur

Datum: 2026-07-07
Status: geleverd als read-only releasegate, CI-guardrails en docs-inventaris.

## Doel

Fase 4 maakt de release naar staging reproduceerbaar. De release hangt niet meer alleen aan handmatige checklistregels, maar aan automatische signalen die dezelfde bronnen gebruiken als het platform smoke dashboard.

## Definition of done

- Migratievolgorde en migratienaming worden bewaakt met `pnpm fieldgrid:migration-order-check:check`.
- De testsuite is ingedeeld in lagen: security guards, UI contracttests, DB/migration smoke en live E2E.
- De staging promotion gate bundelt migration order, testlagen, smoke-contracten, run history en final gates.
- De promotion-guard workflow laat alleen `main -> staging` en `staging -> production` toe.
- De deploy workflow draait dezelfde statische release-signalen voor build en migratie.
- `/platform/staging-smoke` toont run history, evidence directories en de staging promotion gate.
- `/docs` heeft een onderhoudsinventaris met samenvoeg-, archiveer- en verwijderkandidaten.

## Automatische signalen

| Signaal                    | Command                                                                                         | Owner                | Blokkeert             |
| -------------------------- | ----------------------------------------------------------------------------------------------- | -------------------- | --------------------- |
| Migratievolgorde en naming | `pnpm fieldgrid:migration-order-check:check`                                                    | Platform engineering | Ja                    |
| Testlagenmanifest          | `pnpm fieldgrid:test-layers:check`                                                              | Platform engineering | Ja                    |
| Smoke-contracten           | `pnpm fieldgrid:sprint7-migration-smoke:check` en `pnpm fieldgrid:sprint15-staging-smoke:check` | Platform operations  | Ja                    |
| Run history evidence       | `pnpm fieldgrid:sprint15-staging-smoke:run-read-only` en migration smoke workflow               | Platform operations  | Ja in strict mode     |
| Final gates                | `pnpm fieldgrid:sprint16-final-gate:check` en `pnpm fieldgrid:platform-admin-final-gate:check`  | Platform engineering | Ja bij blocked status |

## Testlagen

### security guards

Doel: tenantgrenzen, sessie-scope, RBAC, storage/download guards en auditdenials.

Command:

```bash
pnpm fieldgrid:test:security
```

### UI contracttests

Doel: backoffice, portalen, platform-admin en tenant-ready copy blijven zichtbaar consistent.

Command:

```bash
pnpm fieldgrid:test:ui-contracts
```

### DB/migration smoke

Doel: migratievolgorde, DB runtime-env en migration smoke contracten.

Command:

```bash
pnpm fieldgrid:test:db-migration
```

### live E2E

Doel: echte staging hosts, run history, storage/download evidence en promotion evidence.

Command:

```bash
pnpm fieldgrid:test:live-e2e
```

Deze laag verwacht runtime credentials en smoke artifacts. Gebruik `pnpm fieldgrid:test-layers:check` voor CI-contractvalidatie zonder staging-secrets.

## Migratiebeleid

De migratierunner sorteert SQL-bestanden lexicografisch. Omdat er na `101_fieldgrid_notification_content_v1.sql` al een timestamp-migratie bestaat, blokkeert Fase 4 nieuwe numerieke migraties boven `101`.

Nieuwe migraties moeten daarom een timestamp-prefix gebruiken die na `20260618201212` sorteert. Dit voorkomt order drift tussen een verse database en een stagingdatabase waarop de bestaande timestamp-migratie al is toegepast.

## Promotion flow

1. Merge naar `main`.
2. Open PR `main -> staging`.
3. `Promotion Guard` controleert branchroute en draait:
   - `pnpm fieldgrid:migration-order-check:check`
   - `pnpm fieldgrid:test-layers:check`
   - `pnpm fieldgrid:staging-promotion-gate:check`
4. Draai live evidence:
   - migration smoke op lege database en staging-copy;
   - staging smoke read-only;
   - platform-admin/final gate evidence waar nodig.
5. Controleer `/platform/staging-smoke` en koppel artifact-links aan het releaseformulier.
6. Deploy naar staging draait opnieuw de statische release-signalen voordat build/migrations starten.

## Evidence

Runtime evidence blijft buiten git en wordt gelezen uit:

- `artifacts/staging-smoke`
- `artifacts/migration-smoke`
- `artifacts/platform-admin-final-gate`
- `artifacts/final-gate`
- `artifacts/staging-promotion-gate`

Deze mappen zijn genegeerd door git. Het dashboard gebruikt de JSON-bestanden als lokale/CI evidence, maar de codecommit bevat alleen de gatecontracten.
