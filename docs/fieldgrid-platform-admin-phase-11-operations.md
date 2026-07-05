# Fieldgrid platform admin fase 11 - Operations en staging smoke

Datum: 2026-07-05
Status: geleverd als platform operations hub bovenop de bestaande staging-smoke basis.

## Doel

Fase 11 maakt deployment, staging smoke en final gates zichtbaar zonder terminal. De bestaande `/platform/staging-smoke` detailpagina blijft bestaan; `/platform/operations` is de dagelijkse cockpit.

## Geleverd

- Nieuwe pagina `/platform/operations`.
- Nieuwe JSON endpoint `/api/platform/operations`.
- Integratie met `getPlatformStagingSmokeDashboard()`.
- Healthchecks voor:
  - backoffice;
  - API;
  - klant-PWA;
  - personeel-PWA;
  - database;
  - storage;
  - mail.
- Migration smoke status voor:
  - lege database;
  - staging-copy;
  - laatste run;
  - laatste fout via run summary/status.
- Final external tenant gate zichtbaar in de operations hub.
- Run history met staging-smoke en migration-smoke artifacts.
- Handmatige rerun-knop per run type.
- Rerun-aanvragen worden auditbaar vastgelegd als `platform_operations_rerun_requested`.
- Mutating smoke blijft gekoppeld aan een expliciet cleanup-contract en voert niet automatisch destructieve acties uit.

## Rerun-contract

De operations hub start geen destructieve runner direct vanuit de browser. De knop registreert:

- run id;
- opdracht;
- cleanup-contract;
- aanvrager;
- bronpagina.

De daadwerkelijke uitvoering blijft expliciet via runner, GitHub Actions of terminal, zodat staging-data niet per ongeluk wordt gewijzigd.

## Statusinterpretatie

- `Groen`: endpoint of contract is operationeel.
- `Aandacht`: basis is aanwezig, maar live bewijs of artifact is nog nodig.
- `Blokkerend`: endpoint, configuratie of minimum gate faalt.
- `Handmatig`: bewust handmatige releasecheck of niet geconfigureerde health target.

## Acceptatiebewijs

- `tests/fieldgrid-platform-admin-phase-11-operations.test.mjs`
- `pnpm run typecheck`

Lokale Windows full build kan blokkeren op native optional dependency overrides voor Rollup/LightningCSS. Linux CI blijft het doorslaggevende buildbewijs.
