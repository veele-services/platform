# Fieldgrid docs maintenance

Datum: 2026-07-07
Status: inventaris voor opschonen; geen historische docs verwijderd in Fase 4.

## Doel

De docs-map is nu deels canon, deels sprintlog en deels historisch migratiebewijs. Dit document maakt expliciet welke documenten canoniek blijven, welke later samengevoegd kunnen worden en welke pas na go/no-go mogen verdwijnen.

## Canonical docs

Deze documenten blijven primaire bron voor release- en tenantveiligheid:

- `docs/fieldgrid-saas-proof-sprint-plan.md`
- `docs/fieldgrid-cross-tenant-testmatrix.md`
- `docs/fieldgrid-data-classification.md`
- `docs/fieldgrid-staging-promotion-checklist.md`
- `docs/fieldgrid-first-external-tenant-checklist.md`
- `docs/fieldgrid-backup-restore-rollback-playbook.md`
- `docs/fieldgrid-phase-4-ops-ci-teststructure.md`

## Samenvoegen

Kandidaten om later tot een compact operations-runbook samen te voegen:

- `docs/fieldgrid-sprint-15-staging-smoke.md`
- `docs/fieldgrid-sprint-16-final-gate.md`
- `docs/fieldgrid-platform-admin-phase-14-final-gate.md`
- `docs/fieldgrid-phase-4-ops-ci-teststructure.md`

Advies: pas samenvoegen nadat de eerste volledige `main -> staging` promotion met artifacts is afgerond. Tot die tijd verwijzen tests en gates nog bewust naar de afzonderlijke sprintdocs.

## Archiveren

Kandidaten voor `docs/archive/` zodra alle white-label checks groen blijven:

- `docs/handleiding-veele-platform-v1.0.md`
- `docs/klanthandleiding-veele-platform-v1.0.md`
- `docs/veele-services-gebruikershandleiding.md`
- oudere sprint-/faseverslagen die alleen historische besluitvorming beschrijven.

Advies: archiveer in een aparte docs-only PR, zodat canon- en testwijzigingen niet vermengen met inhoudelijke productwijzigingen.

## Verwijderen

Nog niets direct verwijderen in Fase 4. Verwijderen is pas veilig wanneer:

- het document geen link meer heeft vanuit tests, scripts, workflows of PR-template;
- er een actueler canoniek document is;
- de historische beslissing niet meer nodig is voor audit of releasecontext.

Gebruik voor verwijderkandidaten:

```bash
rg "bestandsnaam-zonder-pad" docs tests scripts .github artifacts
```

## Onderhoudsregels

- Nieuwe releasegates krijgen een script, een test en een korte canonieke doc.
- Sprintlogs blijven kort en verwijzen naar het canonieke runbook zodra de feature stabiel is.
- Runtime evidence gaat naar `artifacts/*` en blijft buiten git.
- PR's die docs wijzigen noemen of ze canon, runbook, sprintlog of historisch archief raken.
