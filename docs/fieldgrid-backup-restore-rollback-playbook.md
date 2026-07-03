# Fieldgrid backup, restore en rollback playbook

Datum: 2026-07-03  
Status: operationeel playbook voor fase 7 en staging-promotie.  
Gerelateerd: `docs/fieldgrid-phase-7-operations.md`, `docs/fieldgrid-staging-promotion-checklist.md`.

## Doel

Dit playbook beschrijft hoe staging en productie veilig worden beschermd tijdens Fieldgrid SaaS-updates. Het is bewust procedureel en niet destructief: de app voert geen backup of restore uit.

Principes:

- staging-data blijft behouden;
- geen drop, reset of rebuild als standaardoplossing;
- elke migratiefase heeft een backup vooraf en een rollbackpad;
- storagebackfills zijn copy-first, verify-second, switch-third, cleanup-last;
- alleen de kleinste falende fase wordt gerepareerd.

## Voor elke staging-promotie

1. Noteer commit SHA van `main` en de doelbranch naar staging.
2. Noteer release-id en deploytijd.
3. Maak databasebackup of bevestig meest recente automatische backup.
4. Leg migration state vast:
   - Drizzle migration history;
   - SQL migration history;
   - laatst toegepaste handmatige migratie;
   - pending migrations.
5. Leg storage state vast als storage geraakt wordt:
   - buckets;
   - prefixconventie;
   - aantal legacy paths;
   - aantal tenant-prefixed paths.
6. Draai relevante preflightchecks:
   - `pnpm test`;
   - `pnpm run typecheck`;
   - `pnpm fieldgrid:phase7-smoke --check`;
   - lege database migration smoke voor migratie-PR's;
   - staging-copy migration smoke voor migratie-PR's.

## Backupbewijs

Minimaal vastleggen in release-notities of deploylog:

- backupnaam of snapshot-id;
- omgeving: staging of productie;
- databasehost of projectnaam zonder secrets;
- starttijd en eindtijd;
- restore-teststatus als beschikbaar;
- commit SHA waarop backup is gemaakt;
- operator.

Geen secrets of connection strings in PR's, docs of logs opnemen.

## Restoreprocedure

Gebruik restore alleen als data-integriteit in gevaar is of een rollback zonder restore onvoldoende is.

1. Stop muterende deploy- of workerprocessen waar nodig.
2. Bevestig welke omgeving wordt hersteld.
3. Bevestig backup-id en commit SHA.
4. Herstel eerst naar een tijdelijke restore database of staging-copy wanneer mogelijk.
5. Draai integrity checks:
   - tenant count;
   - tenant domains;
   - support grants;
   - migration history;
   - document/storage metadata;
   - smoke dashboard.
6. Schakel pas om naar de herstelde database na go/no-go.
7. Laat storageobjecten staan tenzij het incident expliciet storage corruptie betreft.

## Rollback zonder restore

Voorkeur bij runtime- of UI-regressies:

1. Zet de vorige release terug via deployment tooling.
2. Laat database ongewijzigd als de falende fase additive was.
3. Laat nieuwe nullable kolommen of NOT VALID constraints staan als ze geen runtimebreuk veroorzaken.
4. Schakel feature flag of nieuwe UI-route uit als beschikbaar.
5. Repareer de fase op `main`; geen staging reset.

## Migratierollback

Voor migratiefases:

- Gebruik additive-first migraties.
- Voeg constraints eerst `NOT VALID` toe waar mogelijk.
- Forceer `NOT NULL` pas na staging-copy bewijs.
- Verwijder geen legacy kolommen in dezelfde fase waarin nieuwe paden live gaan.
- Maak backfills idempotent.

Als een migration faalt:

1. Stop de deploy.
2. Noteer exacte migration file en foutmelding.
3. Bevestig of de transaction is teruggerold.
4. Maak een reparatie-PR voor alleen die migration/fase.
5. Draai lege database smoke en staging-copy smoke opnieuw.
6. Promoot pas opnieuw na groene checks.

## Storagebackfill rollback

Storagebackfills volgen altijd:

1. Copy legacy object naar tenant-prefixed target.
2. Verify size/hash of ten minste bestaan + metadata.
3. Update DB path pas na verify.
4. Houd legacy object tijdelijk beschikbaar.
5. Cleanup pas in een latere fase na smokebewijs.

Rollback:

- Als copy faalt: laat legacy path staan.
- Als verify faalt: verwijder alleen de nieuwe kopie als dat veilig is.
- Als DB path switch faalt: laat legacy reads aan.
- Als signed URL smoke faalt: herstel DB path naar legacy of dual-read fallback.

## Go/no-go na deploy

Go:

- `main` build groen;
- staging deploy klaar;
- `/platform/staging-smoke` bereikbaar;
- minimum green smokechecks groen of bewust `manual` met eigenaar;
- securitydashboard toont geen onverwachte cross-tenant events;
- kritieke tenantlogin werkt voor `demo-a`, `demo-b` en `veele` waar ingericht.

No-go:

- staging onbereikbaar;
- login werkt niet voor platform owner;
- migration history inconsistent;
- tenantdomain resolver valt terug naar default tenant;
- supportgrant of auditroute lekt tenantdata;
- storage signed URL geeft cross-tenant toegang.

## Incidentnotitie

Leg bij elk rollback- of restore-incident vast:

- datum en tijd;
- omgeving;
- commit SHA;
- deploy-id;
- getroffen fase;
- symptomen;
- genomen actie;
- dataverlies ja/nee;
- follow-up PR of issue.
