# Fieldgrid staging-promotie checklist

Datum: 2026-07-07
Status: verplicht releasecontract; Fase 4 voegt automatische CI-signalen en staging promotion gate toe.
Gerelateerd: `docs/fieldgrid-next-major-update-plan.md`, `docs/fieldgrid-saas-masterplan.md`, `docs/fieldgrid-data-classification.md`, `docs/fieldgrid-cross-tenant-testmatrix.md`, `docs/fieldgrid-phase-4-ops-ci-teststructure.md`.

## Doel

Deze checklist houdt staging zoveel mogelijk bereikbaar tijdens de volgende grote update. Elke fase-PR moet expliciet aangeven welke checklistregels gelden en welke test-id's uit de cross-tenant testmatrix geraakt worden.

## Automatische signalen

Voor `main -> staging` moeten deze statische signalen groen zijn:

```bash
pnpm fieldgrid:migration-order-check:check
pnpm fieldgrid:test-layers:check
pnpm fieldgrid:staging-promotion-gate:check
```

Runtime evidence blijft verplicht voor releases die tenantgrenzen, storage/downloads, migraties of platform-admin raken:

```bash
pnpm fieldgrid:sprint15-staging-smoke:run-read-only
pnpm fieldgrid:sprint7-migration-smoke --run --target all
```

## Altijd geldig

- [ ] Geen drop, reset of rebuild van stagingdata.
- [ ] `main` blijft de bron van waarheid.
- [ ] Staging-promotie gebeurt pas na groene relevante checks.
- [ ] Elke PR noemt de geraakte data-classificatie-items.
- [ ] Elke PR noemt de geraakte test-id's.
- [ ] Elke runtime-, schema- of migratie-PR noemt een rollbackpad of veilige fallback.
- [ ] Migratie-PR's beschrijven lege database smoke en staging-copy smoke.
- [ ] Statische tests tellen alleen als guardrail, niet als bewijs voor runtime-isolatie.

## Fase 0 - Canon en updatecontract

- [ ] Alleen docs, PR-template of canon-tests gewijzigd.
- [ ] Geen runtime-code gewijzigd.
- [ ] Geen schema of migraties gewijzigd.
- [ ] Geen databasegedrag gewijzigd.
- [ ] Oude PR #125-status is niet meer de actuele waarheid.
- [ ] `docs/fieldgrid-next-major-update-plan.md` is gekoppeld vanuit de canonbronnen.
- [ ] `pnpm test` of CI-canoncheck groen.

Staging-impact: geen runtime-impact; staging blijft bereikbaar.

## Fase 1 - Echte testbasis en demo-data

- [ ] Demo-data gebruikt `demo-a`, `demo-b` en `veele` als gewone tenants.
- [ ] Testdata is reproduceerbaar en opruimbaar.
- [ ] Muterende smoke- of seed-acties raken geen bestaande staging-tenants.
- [ ] Host-first, membership, RBAC, direct-ID en support hebben minimaal eerste integrationdekking.
- [ ] Migration smoke is beschikbaar of operationeel vastgelegd.

Staging-impact: alleen testbasis of afgeschermde demo-data.

## Fase 2 - Post-migration hardening en tenant_id afdwingen

- [ ] Eerst unresolved-row rapportage, daarna pas constraint enforcement.
- [ ] `tenant_id NOT NULL` alleen waar staging-copy schoon is.
- [ ] Bewust nullable uitzonderingen, zoals platform/global audit, zijn gedocumenteerd.
- [ ] `DEFAULT_TENANT_ID` defaults worden in kleine, herstelbare stappen verwijderd.
- [ ] Lege database smoke en staging-copy smoke zijn groen voor elke migratie.

Staging-impact: additive-first; geen dataverlies; constraints in kleine batches.

## Fase 3 - Assignment media, news en storage bewijs

- [ ] Assignment media krijgt eerst additive `tenant_id` en backfill.
- [ ] Storage-backfill is copy-first, verify-second, switch-third, cleanup-last.
- [ ] Legacy reads blijven tijdelijk werken zolang backfill loopt.
- [ ] News scope is expliciet gekozen voordat schema/runtime wordt aangepast.
- [ ] Signed URL en path guessing tests zijn gekoppeld aan de PR.

Staging-impact: dual-read waar nodig; geen directe verwijdering van legacy storageobjecten.

## Fase 4 - Module enforcement harmoniseren

- [ ] API, backoffice, portalen en jobs verwijzen naar dezelfde modulewaarheid of documenteren bewust verschil.
- [ ] Module-off faalt server-side, ook bij directe URL, server action en API.
- [ ] UI-wijzigingen zijn additive of achter feature flag waar nodig.
- [ ] Dependencygedrag is getest of handmatig geverifieerd.

Staging-impact: geen schema nodig; per module promoten om regressies klein te houden.

## Fase 5 - Support break-glass en security dashboard

- [ ] Break-glass reden is verplicht.
- [ ] Korte maximale TTL is afgedwongen voor nieuwe break-glass grants.
- [ ] Bestaande supporttoegang wordt niet stil gebroken zonder migratiebesluit.
- [ ] Dashboard start read-only.
- [ ] Tenant-admin krijgt geen platform/support-only auditdata te zien.

Staging-impact: begin read-only; nieuwe TTL-regels eerst op nieuwe grants.

## Fase 6 - Productisering

- [ ] Nieuwe wizards staan naast bestaande beheerflows totdat ze bewezen werken.
- [ ] Geen bestaande tenant hoeft first-run opnieuw verplicht te doorlopen.
- [ ] Usage dashboard toont geen cross-tenant data.
- [ ] Branding preview lekt geen assets of instellingen tussen tenants.
- [ ] Feature flag of fallback blijft beschikbaar voor nieuwe wizardflows.

Staging-impact: additive UI; bestaande routes blijven bruikbaar.

## Fase 7 - Staging smoke dashboard en operatie

- [ ] Smoke dashboard is read-only of gebruikt dedicated demo-tenants.
- [ ] Smoke dashboard toont run history en laatste JSON-artifacts waar beschikbaar.
- [ ] Live Playwright-smoke targets zijn zichtbaar voor host, portalen, storage/PDF en personeelsplanning.
- [ ] Migration-smoke status verwijst naar lege database en staging-copy targets.
- [ ] Muterende smokechecks hebben cleanup.
- [ ] Final external tenant gate toont performance review, service-role review, staging-copy smoke en post-launch accepted register.
- [ ] Backup/restore en rollback playbook zijn actueel.
- [ ] Staging smoke toont host, login, modules, sectoren, storage, PDF/downloads, migraties, support grants en audit.
- [ ] Eerste externe tenant checklist is bijgewerkt.
- [ ] `pnpm fieldgrid:sprint16-final-gate:check` is groen.

Staging-impact: operationele validatie zonder destructieve acties.

## Fase 8 - Sprint 16 final gate

- [ ] Geen migratie of tenantmutatie.
- [ ] `post-launch-accepted` punten hebben owner, bewijsdoel en go/no-go moment.
- [ ] `FG-FINAL-PERFORMANCE` is gepland of voorzien van EXPLAIN artifacts.
- [ ] `FG-FINAL-SERVICE-ROLE` bevestigt server-only service-role gebruik.
- [ ] `FG-FINAL-STAGING-COPY` verwijst naar empty-database en staging-copy smoke artifacts.
- [ ] `FG-FINAL-EXTERNAL-TENANT` is gekoppeld aan `docs/fieldgrid-first-external-tenant-checklist.md`.

Staging-impact: read-only releasebesluit; staging blijft bereikbaar.

## Fase 9 - Ops, CI en teststructuur

- [ ] `pnpm fieldgrid:migration-order-check:check` is groen.
- [ ] `pnpm fieldgrid:test-layers:check` is groen.
- [ ] `pnpm fieldgrid:staging-promotion-gate:check` is groen.
- [ ] Promotion Guard workflow is groen voor `main -> staging`.
- [ ] Deploy workflow draait release-signalen voordat build en migraties starten.
- [ ] `/platform/staging-smoke` toont run history, migration smoke, platform-admin gate en staging promotion gate.
- [ ] Live staging-smoke en migration-smoke artifacts zijn gekoppeld aan het releaseformulier.
- [ ] Docs-maintenance inventaris is bekeken voor samenvoeg-, archiveer- en verwijderkandidaten.

Staging-impact: read-only guardrails; live evidence draait alleen tegen staging of staging-copy volgens de bestaande smoke-contracten.
