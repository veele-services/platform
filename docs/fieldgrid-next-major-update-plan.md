# Fieldgrid volgende grote update plan

Datum: 2026-07-03
Status: sprint 0 canon refresh 2.0. De actuele uitvoeringscanon staat in `docs/fieldgrid-saas-proof-sprint-plan.md`.

## 1. Doel

Dit document blijft bestaan als historische en operationele ingang, maar de oude fase 0-7 planning is vervangen door de sprints 0-16 in `docs/fieldgrid-saas-proof-sprint-plan.md`.

De grote update is klaar wanneer alle P0/P1 SaaS-hardening, runtime-bewijsvoering, tenant-regio's, storage, audit, onboarding, smoke en externe tenant readiness volledig zijn afgerond.

## 2. Nieuwe statusvelden

Alle canonbronnen gebruiken vanaf sprint 0:

- `done`
- `partial`
- `runtime-proof-open`
- `hardening-open`
- `nice-to-have`

Deze statusvelden staan in:

- `docs/fieldgrid-saas-masterplan.md`
- `docs/fieldgrid-data-classification.md`
- `docs/fieldgrid-cross-tenant-testmatrix.md`
- `docs/fieldgrid-saas-proof-sprint-plan.md`

## 3. Randvoorwaarden voor staging-bereikbaarheid

Tijdens deze update moet staging zoveel mogelijk bereikbaar blijven.

Harde regels:

1. Geen drop, reset of rebuild van stagingdata.
2. Elke risicomigratie is additive-first: kolommen toevoegen, backfillen, rapporteren, pas later afdwingen.
3. `NOT VALID` constraints eerst toevoegen, later valideren na staging-copy smoke.
4. Legacy reads blijven tijdelijk werken tijdens storage-, regio- en tenant_id-backfills.
5. Fysieke storage-backfill gebeurt copy-first, verify-second, switch-third, cleanup-last.
6. Nieuwe UI-flows worden naast bestaande flows gezet totdat ze bewezen werken.
7. Elke sprint krijgt een rollbackpad of een duidelijke no-op/feature-flag fallback.
8. `main` blijft bron van waarheid; staging-sync pas na groene checks en migratiesmoke.
9. Migratie-PR's moeten minimaal lege database en staging-copy smoke beschrijven.
10. Geen sprint mag meerdere onafhankelijke datarisco's tegelijk promoten.

## 4. Taken die volledig in deze update vallen

### Canon refresh

Status: `done` na sprint 0 zodra deze PR is gemerged.

Werk:

- Oude PR-/faseverwijzingen zijn niet langer leidend.
- Statusvelden zijn toegevoegd.
- Data-classificatie heeft per domein status en sprint-eigenaar.
- Testmatrix heeft regio-tests en status per grens.
- Sprintplan 0-16 is de nieuwe uitvoeringsbron.

### Tests zijn nog te statisch

Status: `runtime-proof-open`.

Werk:

- Tenant A/B/Veele integration tests.
- Playwright host-first tests.
- DB/RLS tests.
- Storage signed-url/path guessing tests.
- Migratie-smokes op lege database en staging-copy.

Eigenaar: sprint 1, 5, 6, 7, 9.

### Tenant-id hardening is nog niet definitief

Status: `hardening-open`.

Werk:

- DB-defaults naar `DEFAULT_TENANT_ID` zijn in sprint 8 uit tenantdata verwijderd met `070_sprint8_tenant_id_default_hardening.sql`; staging-copy rapportage moet dit nog bevestigen.
- Staging-copy rapporten.
- Backfills.
- Constraint validation.
- Waar mogelijk `tenant_id NOT NULL`.
- Bewuste nullable uitzonderingen voor platform/global audit documenteren.

Eigenaar: sprint 8.

### Storage is nog niet volledig bewezen

Status: `hardening-open`.

Werk:

- Fysieke storage-migratie uitvoeren volgens Sprint 9 copy-first cleanup-plan.
- Legacy-path opruiming na rapportage en verify.
- Supabase Storage policy/RLS bewijs met echte provider-smoke.
- Signed-url/path-guessing integrationtests.
- Assignment media direct tenant-aware is in runtime geleverd; staging-proof blijft nodig.

Eigenaar: sprint 9.

### Veele Portaal is functioneel nog niet canon-compleet bewezen

Status: `runtime-proof-open`.

Werk:

- Klantportaal host-bound login.
- Klantportaal documenten, facturen, tickets, rapportage en module-denials.
- Personeelsapp opdrachten, planning/home, media, notificaties, module-denials en verkeerde-host scenario's.
- Personeelsplanning realtime/minuut-refresh acceptatie.

Eigenaar: sprint 6.

### Audit moet scherper worden

Status: `partial`.

Werk:

- Support access.
- Downloads.
- PDF's.
- Direct-ID denials.
- Module-denials.
- Storage-denials.
- Een centraal security/audit model en dashboard.

Eigenaar: sprint 10.

### Platform onboarding is nog geen echte wizard

Status: `partial`.

Werk:

- Save/resume.
- Review.
- Runstatus.
- Retry.
- Rollback.
- Domein, plan, modules, sectoren, regio's, owner invite en branding in een flow.

Eigenaar: sprint 12.

### Tenant first-run is nog beperkt

Status: `partial`.

Werk:

- Owner first-run wizard.
- Actieve configuratie van bedrijfsgegevens, branding, sectoren, regio's, gebruikers, modules en basisinstellingen.
- Readiness-score vullen.

Eigenaar: sprint 13.

### Staging smoke is nog vooral read-only

Status: `partial`.

Werk:

- Run history.
- Live Playwright-smokes.
- Migratie-smokes.
- Gecontroleerde mutating checks met cleanup.

Eigenaar: sprint 15.

### Regio's in backoffice

Status: `partial`.

Werk:

- Tenant-regio datamodel.
- Backfill uit legacy `personnel.region`, `personnel.preferred_regions` en `assignments.required_region`.
- Multiselect/autocomplete op personeel, objecten, opdrachten en relevante filters.
- Create-on-type voor nieuwe regio's.
- Planning overlaplogica en server-side cross-tenant regio-denials.

Eigenaar: sprint 2, 3 en 4.

## 5. Echte verbeteringen met waarde

Deze investeringen verlagen direct risico of verhogen beheerbaarheid:

1. Runtime security proof suite met Tenant A/B/Veele fixtures.
2. Migration smoke workflow op lege database en staging-copy.
3. Post-migration hardening wave voor tenant_id en constraints.
4. Storage hardening met backfill, signed-url tests en path guessing tests.
5. Portal acceptance suite voor Veele Portaal klant en personeel.
6. Security dashboard 2.0 voor support, downloads, PDF's, direct-ID denials, module-denials en storage-denials.
7. Operational readiness score voor externe tenant livegang.
8. Regio tenant-config met multiselect/autocomplete en planningproof.

## 6. Nice-to-have status

| Nice-to-have | Status | Sprint |
| --- | --- | --- |
| Platform-admin onboarding wizard | `partial` | 12 |
| Tenant first-run wizard | `partial` | 13 |
| Usage dashboard per tenant | `partial` | 14 |
| Branding preview per tenant | `nice-to-have` | 14 |
| Support break-glass flow | `partial` | 10 |
| Security dashboard | `partial` | 10 |
| Module dependency visualisatie | `nice-to-have` | 11 |
| Demo-data generator | `partial` | 1 |
| Staging smoke dashboard | `partial` | 15 |

## 7. Sprintvolgorde

| Sprint | Doel |
| --- | --- |
| 0 | Canon refresh 2.0. |
| 1 | Tenant A/B/Veele runtime fixtures. |
| 2 | Regio datamodel en backfill. |
| 3 | Regio UI backoffice breed. |
| 4 | Regio runtime en planninglogica. |
| 5 | Runtime security proof suite. |
| 6 | Playwright host en portal acceptance. |
| 7 | Migration smoke workflow. |
| 8 | Tenant-id hardening wave. |
| 9 | Storage hardening. |
| 10 | Audit en security dashboard 2.0. |
| 11 | Module enforcement harmonisatie. |
| 12 | Platform onboarding wizard. |
| 13 | Tenant first-run wizard. |
| 14 | Usage, branding en operational readiness. |
| 15 | Staging smoke dashboard. |
| 16 | Final hardening en externe tenant gate. |

## 8. Definitie van klaar

Deze grote update is klaar wanneer:

- canonbronnen actueel zijn en statusvelden gebruiken;
- Tenant A/B/Veele integration fixtures bestaan en draaien;
- host-first, RBAC, module, sector, regio, support, direct-ID en storage grenzen runtime getest zijn;
- migratiesmoke draait op lege DB en staging-copy;
- gevoelige tenantdata waar mogelijk `tenant_id NOT NULL` heeft;
- bewuste nullable uitzonderingen expliciet zijn gedocumenteerd en getest;
- assignment media direct tenant-aware is;
- news scope is gekozen en afgedwongen;
- backoffice/API/portalen/jobs module enforcement consistent is;
- DB-defaults naar `DEFAULT_TENANT_ID` uit tenantdata zijn verwijderd;
- break-glass support korte TTL afdwingt;
- usage dashboard documenten en storage toont;
- storage backfill en policytests groen zijn;
- platform onboarding, tenant first-run en smoke dashboard bruikbaar zijn;
- regio's in backoffice overal multiselect/autocomplete hebben en runtime tenant-safe zijn;
- staging bereikbaar is gebleven zonder drop/reset/rebuild.
