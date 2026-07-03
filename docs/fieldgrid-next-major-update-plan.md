# Fieldgrid volgende grote update plan

Datum: 2026-07-03  
Status: uitvoeringscanon voor de volgende grote update na groene staging-builds t/m PR #148.  
Doel: alle resterende SaaS-hardening, bewijsvoering, productisering en nice-to-have restpunten bundelen in duidelijke fases zonder staging onnodig onbereikbaar te maken.

## 1. Uitgangspunt

De recovery en sprints 1 t/m 11 hebben de belangrijkste SaaS-fundamenten gebouwd:

- host-first tenantcontext;
- tenant lifecycle status;
- tenantrollen als runtime-RBAC;
- module- en planfoundation;
- tenant-sector policy;
- support grants en supportmodus;
- platform-admin MVP;
- documenten, finance, payments en audit met tenant-aware schemafundament;
- tenant task-code overrides en prijssnapshots;
- portal branding/module guardrails;
- provisioning en tenant first-run foundation.

De volgende grote update is geen nieuwe recovery. Het is een hardening- en productiseringsronde: canon bijwerken, echte runtime-isolatie bewijzen, migraties afronden, media/news/storage sluiten en de beheerervaring verbeteren.

## 2. Randvoorwaarden voor staging-bereikbaarheid

Tijdens deze update moet staging zoveel mogelijk bereikbaar blijven.

Harde regels:

1. Geen drop, reset of rebuild van stagingdata.
2. Elke risicomigratie is additive-first: kolommen toevoegen, backfillen, rapporteren, pas later afdwingen.
3. `NOT VALID` constraints eerst toevoegen, later valideren na staging-copy smoke.
4. Legacy reads blijven tijdelijk werken tijdens storage- en tenant_id-backfills.
5. Fysieke storage-backfill gebeurt copy-first, verify-second, switch-third, cleanup-last.
6. Nieuwe UI-flows worden naast bestaande flows gezet totdat ze bewezen werken.
7. Elke fase krijgt een rollbackpad of een duidelijke no-op/feature-flag fallback.
8. `main` blijft bron van waarheid; staging-sync pas na groene checks en migratiesmoke.
9. Migratie-PR's moeten minimaal lege database en staging-copy smoke beschrijven.
10. Geen grote fase mag meerdere onafhankelijke datarisco's tegelijk promoten.

Staging-promotiebeleid:

- Docs/test-only fases mogen direct na groene CI naar staging.
- Runtimefases mogen naar staging na typecheck, build, relevante tests en handmatige smokecheck.
- Migratiefases mogen naar staging na staging-copy migratietest of een expliciet goedgekeurde, staging-veilige fallback.
- Als een migration op staging faalt, wordt alleen die fase gerepareerd; geen reset.

## 3. Werkpakketten die in deze update vallen

### 3.1 Ontbreekt of moet gewijzigd worden

#### Canon refresh

Probleem:

- `docs/fieldgrid-saas-masterplan.md`, `docs/fieldgrid-data-classification.md` en `docs/fieldgrid-cross-tenant-testmatrix.md` zeggen nog dat de stand ongeveer t/m PR #125 is.
- Ze noemen onderdelen als ontbrekend die inmiddels door sprints 3 t/m 11 zijn gebouwd: `documents`, `invoices`, `quotes`, `reports`, `payments`, `audit_log`, `tenant_sector_settings`, platform-admin en provisioning.

Doel:

- Canon bijwerken naar de actuele stand t/m PR #148.
- Onderscheiden tussen gebouwd, gedeeltelijk gebouwd, bewezen, nog niet bewezen en nog ontbrekend.
- Alle vervolg-PR's laten verwijzen naar dit updateplan of naar de bijgewerkte canonbronnen.

Benodigd:

- Masterplan statusregel updaten.
- Data-classificatie herclassificeren voor tenant-aware finance/documents/payments/audit.
- Testmatrix markeren welke test-id's nog statisch zijn en welke runtimebewijs nodig hebben.
- Oude backlog-items die inmiddels klaar zijn verplaatsen naar status "gebouwd, bewijs ontbreekt".

#### Tests zijn nog te statisch

Probleem:

- Veel sprinttests lezen bestanden en zoeken termen.
- Dat voorkomt regressies in documentatie/codepatronen, maar bewijst geen runtime-isolatie.

Doel:

- Tenant A/B/Veele integration tests.
- Playwright host-first tests.
- DB/RLS tests.
- Storage signed-url/path guessing tests.
- Migratie-smokes op lege database en staging-copy.

Benodigd:

- Reproduceerbare testfixtures voor `demo-a`, `demo-b` en `veele`.
- Minimale seeded records per tenant: customer, object, personnel, assignment, document, report, quote, invoice, payment, audit row en storage path.
- Testhelpers om hostheaders, tenantcookies, supportmodus en platformhost te simuleren.
- CI-job of script voor migratie-smoke.

#### Directe tenant_id is vaak nog nullable

Probleem:

- `documents`, `reports`, `quotes`, `invoices`, `payments`, `customer_payment_batches`, batch items en `audit_log` hebben nu `tenant_id`, maar vaak nullable.
- Voor `audit_log` is nullable deels bewust voor platform/global audit.
- Voor gevoelige tenantdata moet nullable uiteindelijk verdwijnen zodra backfill schoon is.

Doel:

- Onresolved legacy rows rapporteren.
- Constraints valideren.
- Waar veilig: `tenant_id SET NOT NULL`.
- Waar nullable bewust blijft: documenteer waarom en voeg queryguards/tests toe.

Benodigd:

- Backfill-report scripts.
- Constraint-validation migraties.
- Per tabel beslissing: `NOT NULL`, bewust nullable, of vervolgbackfill nodig.

#### Assignment media blijft P1

Probleem:

- `assignment_photos` en `assignment_report_note_attachments` hebben nog geen directe `tenant_id`.
- Ze zijn parent-scoped via assignment en runtime guards, maar downloadbaar materiaal hoort canoniek direct tenant-aware te worden.

Doel:

- `tenant_id` toevoegen aan assignment media.
- Backfill via assignment.
- Nieuwe uploads schrijven tenant-prefixed storage path.
- Signed URL helpers gebruiken directe tenant_id plus parentcheck.

Benodigd:

- Staging-safe migration.
- Runtime update voor upload/download/delete.
- Storage tests voor path guessing.

#### News scope is nog open

Probleem:

- `news_posts` heeft geen `tenant_id`.
- Het model is nog niet expliciet platform-only of tenant-scoped.

Doel:

- Beslissen: platform-only news of tenant-scoped news.
- Als tenant-scoped: `tenant_id`, target scoping en storagepad hard maken.
- Als platform-only: guardrails toevoegen zodat tenantdata niet in news terechtkomt.

Benodigd:

- Productbesluit.
- Schema/runtime update afhankelijk van gekozen model.
- Portal/backoffice visibility tests.

#### Backoffice module mapping is smaller dan API

Probleem:

- API `requirePermission()` heeft brede modulemapping voor customers, objects, personnel, assignments, planning, reporting, documents, finance, notifications en smart planning.
- Backoffice permission mapping lijkt vooral documents, finance en reporting te dekken.

Doel:

- Backoffice module enforcement harmoniseren met API, of bewust per resource documenteren waarom het verschilt.
- Module-off gedrag overal server-side afdwingen.

Benodigd:

- Backoffice permission mapping uitbreiden.
- Direct URL/server action tests per module.
- UI-navigatie consistent maken met server enforcement.

#### `assignments.tenant_id` heeft nog DEFAULT_TENANT_ID

Probleem:

- Runtime is host-first en tenant-aware, maar database-defaults naar `DEFAULT_TENANT_ID` blijven riskant.
- Als een write tenantId vergeet, kan data stil in de default tenant landen.

Doel:

- DB-defaults naar `DEFAULT_TENANT_ID` uit tenantdata verwijderen.
- Writes verplicht expliciet tenantId laten zetten.
- Tests toevoegen die ontbrekende tenantId-write blokkeren.

Benodigd:

- Inventarisatie van alle tenantdata-tabellen met default tenant.
- Additive migration om defaults te droppen.
- Runtime write tests.

#### Support break-glass TTL

Probleem:

- Support grants hebben reden en expiry.
- Er is nog geen harde maximale TTL zichtbaar.

Doel:

- Break-glass flow met verplichte reden, korte maximale TTL en auditcontext.
- Bijvoorbeeld max 1 tot 4 uur voor break-glass grants.
- Langere supporttoegang alleen via expliciet ander granttype of platform owner override.

Benodigd:

- Grant-type of max-TTL validatie.
- UI-copy en foutmelding.
- Tests voor te lange TTL, verlopen grant en revoked grant.

#### Usage dashboard is incompleet

Probleem:

- Tenant usage toont basisstats zoals users, customers, objects, personnel, assignments, modules, sectors en support grants.
- Documenten en storagegebruik ontbreken nog.

Doel:

- Usage dashboard uitbreiden met documenten, storage, downloads, actieve modules en relevante limieten.

Benodigd:

- Document count per tenant.
- Storage usage estimate per tenant, eerst uit DB metadata waar mogelijk.
- Later echte Supabase Storage usage als operationele integratie.

#### Storage is applicatie-hard, maar nog niet volledig bewezen

Probleem:

- Centrale tenant storage helper bestaat.
- Runtime guards bestaan op meerdere paden.
- Fysieke storage-backfill, Supabase Storage policies/RLS en path guessing tests ontbreken nog.

Doel:

- Storage-hardening platformbreed bewijzen.
- Legacy paden gecontroleerd migreren.
- Path guessing en signed URL denial automatiseren.

Benodigd:

- Storage backfill job of script.
- Storage policy review.
- Storage integration tests.
- Legacy mode uitfaseren na backfill.

### 3.2 Echte verbeteringen met waarde

Deze taken verlagen direct risico of verhogen beheerbaarheid:

1. Post-migration hardening sprint: validate constraints, rapporteer unresolved rows en zet `tenant_id` waar mogelijk `NOT NULL`.
2. Echte integration fixtures voor `demo-a`, `demo-b` en `veele`.
3. Migration smoke workflow op lege database en staging-copy.
4. Centraal audit/download/security dashboard.
5. Module enforcement harmoniseren tussen API, backoffice, portalen en jobs.
6. DB-defaults naar `DEFAULT_TENANT_ID` verwijderen uit tenantdata.
7. `audit_log` typecontract tenant-aware maken waar tenant-audit bedoeld is.
8. Support TTL max afdwingen, bijvoorbeeld 1-4 uur, met expliciete break-glass reason.

### 3.3 Nice-to-have status

| Nice-to-have | Huidige status | Opnemen in update? | Doelfase |
| --- | --- | --- | --- |
| Platform-admin onboarding wizard | Gedeeltelijk: provisioning form + runstatus, geen wizard | Ja, als productiseringsfase | Fase 6 |
| Tenant first-run wizard | Gedeeltelijk: checklist bestaat, geen echte wizard/validatie | Ja | Fase 6 |
| Usage dashboard per tenant | Gedeeltelijk: basisstats, geen documenten/storage | Ja | Fase 6 |
| Branding preview per tenant | Niet meegenomen | Ja, maar na branding resolver stabilisatie | Fase 6 |
| Support break-glass flow | Gedeeltelijk: reden + grant + audit, geen korte TTL/max-flow | Ja, securitywaarde | Fase 5 |
| Security dashboard | Niet meegenomen, alleen losse support/auditbasis | Ja, hoge beheerwaarde | Fase 5 |
| Module dependency visualisatie | Gedeeltelijk: dependency keys zichtbaar, geen visualisatie | Ja, nice-to-have na enforcement | Fase 4 of 6 |
| Demo-data generator | Niet meegenomen; wel statische Tenant A/B/Veele fixtures | Ja, nodig voor echte tests | Fase 1 |
| Staging smoke dashboard | Niet meegenomen | Ja, operatie/acceptatie | Fase 7 |

## 4. Faseplanning

### Fase 0 - Canon en updatecontract vastzetten

Doel:

- De actuele waarheid vastleggen voordat runtimewerk start.
- Alle verouderde canon-items corrigeren.

Taken:

1. Werk `docs/fieldgrid-saas-masterplan.md` bij naar stand t/m PR #148.
2. Werk `docs/fieldgrid-data-classification.md` bij:
   - `documents` van ontbrekend naar gebouwd maar hardening/bewijs open;
   - finance/report/payment/audit van ontbrekend naar tenant-aware foundation;
   - assignment media blijft P1;
   - news blijft open besluit;
   - storage blijft bewijs/backfill open.
3. Werk `docs/fieldgrid-cross-tenant-testmatrix.md` bij met teststatus per test-id:
   - static guard aanwezig;
   - unit nodig;
   - integration nodig;
   - Playwright nodig;
   - DB/RLS nodig;
   - storage nodig.
4. Voeg PR-regel toe: elke fase-PR noemt dit updateplan, data-classificatie-items en test-id's.
5. Maak een checklist voor staging-promotie per fase.

Staging-impact:

- Geen runtime-impact.
- Geen migraties.
- Staging blijft volledig bereikbaar.

Acceptatie:

- Docs en canon-tests groen.
- Oude "t/m PR #125" status is vervangen of expliciet als historisch gemarkeerd.

### Fase 1 - Echte testbasis en demo-data

Doel:

- Van statische guardrails naar echte SaaS-bewijsvoering.

Taken:

1. Bouw Tenant A/B/Veele integration fixtures.
2. Voeg demo-data generator toe voor `demo-a`, `demo-b` en `veele`:
   - tenants;
   - domains;
   - users/rollen;
   - customers;
   - objects;
   - personnel;
   - assignments;
   - documents;
   - reports;
   - quotes;
   - invoices;
   - payments;
   - audit rows;
   - storage paths.
3. Voeg host-first Playwright tests toe:
   - platformhost;
   - staginghost;
   - tenanthost;
   - unknown subdomain;
   - switcher override denial;
   - custom domain waar mogelijk.
4. Voeg DB/RLS testbasis toe voor tenantgrenzen.
5. Voeg storage signed-url testbasis toe.
6. Bouw migration smoke workflow:
   - lege database;
   - staging-copy.

Staging-impact:

- Test-only of isolated seed-data.
- Demo-data mag staging niet vervuilen zonder expliciete namespace/slug en cleanup.
- Geen bestaande tenantdata wijzigen.

Acceptatie:

- Minimaal eerste echte integration tests voor host, membership, RBAC, direct-ID en support.
- Migration smoke kan lokaal/CI draaien of is operationeel gedocumenteerd.

### Fase 2 - Post-migration hardening en tenant_id afdwingen

Doel:

- De nullable tenant-aware foundation omzetten naar harde datagrenzen waar stagingdata schoon genoeg is.

Taken:

1. Maak unresolved-row rapportages per tabel:
   - `documents`;
   - `reports`;
   - `quotes`;
   - `invoices`;
   - `payments`;
   - `customer_payment_batches`;
   - `customer_payment_batch_items`;
   - `audit_log`.
2. Valideer bestaande `NOT VALID` foreign keys en check constraints waar mogelijk.
3. Zet `tenant_id NOT NULL` waar geen unresolved legacy rows bestaan.
4. Documenteer uitzonderingen:
   - `audit_log.tenant_id` mag nullable blijven voor platform/global audit;
   - overige nullable tenantdata krijgt opvolgactie.
5. Maak `audit_log` typecontract tenant-aware waar tenant-audit bedoeld is.
6. Verwijder DB-defaults naar `DEFAULT_TENANT_ID` uit tenantdata, te beginnen met `assignments.tenant_id`.

Staging-impact:

- Eerst rapportage-only PR.
- Daarna constraint validation in kleine batches.
- Geen `NOT NULL` afdwingen voordat staging-copy schoon is.
- Rollback: constraints kunnen apart worden teruggedraaid zonder dataverlies.

Acceptatie:

- Staging-copy migration smoke groen.
- Geen nieuwe tenantdata kan zonder tenantcontext ontstaan.
- Bewust nullable audit is gedocumenteerd en getest.

### Fase 3 - Assignment media, news en storage bewijs

Doel:

- Downloadbare media en news/storage definitief onder tenantcontrole brengen.

Taken:

1. Voeg `tenant_id` toe aan `assignment_photos`.
2. Voeg `tenant_id` toe aan `assignment_report_note_attachments`.
3. Backfill beide via assignment.
4. Maak upload/download/delete direct tenant-aware.
5. Beslis news model:
   - optie A: platform-only news;
   - optie B: tenant-scoped news.
6. Voer gekozen news model uit met schema/runtime/tests.
7. Voer fysieke storage-backfill uit voor documenten en media:
   - copy legacy object;
   - verify;
   - update DB path;
   - behoud oud object tot smoke groen is;
   - cleanup later.
8. Voeg Supabase Storage policy/RLS bewijs toe.
9. Voeg path guessing tests toe voor documenten, assignment photos en report attachments.

Staging-impact:

- Dual-read legacy/canonical tijdens transitie.
- Copy-first storagebackfill, geen direct move/delete.
- News beslissing apart houden van media-migratie als risico te groot wordt.

Acceptatie:

- Tenant B kan geen Tenant A media signed URL krijgen.
- Storage paths zijn canoniek tenant-prefixed voor nieuwe objecten.
- Legacy backfill is idempotent en data blijft bereikbaar.

### Fase 4 - Module enforcement harmoniseren

Doel:

- Module uit betekent overal server-side uit.

Taken:

1. Backoffice permission modulemapping gelijk trekken met API of bewust documenteren.
2. Directe server actions nalopen en module-aware maken.
3. Portal module guards uitbreiden naar alle relevante portalfeatures.
4. Background jobs/workers nalopen.
5. Module dependency visualisatie toevoegen of minimaal een dependency-inspectie in platform-admin.
6. Module-off tests automatiseren:
   - UI;
   - directe URL;
   - server action;
   - API;
   - background job.

Staging-impact:

- Geen schema nodig.
- Feature flags mogelijk voor nieuwe visualisatie.
- Module-off wijzigingen per module promoten om regressies klein te houden.

Acceptatie:

- RBAC-permissie is nooit genoeg als module uit staat.
- Backoffice/API/portalen/jobs hanteren dezelfde modulewaarheid.

### Fase 5 - Support break-glass en security dashboard

Doel:

- Supporttoegang en security-audit zichtbaar, tijdelijk en toetsbaar maken.

Taken:

1. Support break-glass flow expliciet maken:
   - verplichte reden;
   - korte maximale TTL;
   - zichtbaar granttype of risk label;
   - audit bij enter/exit/access/denial.
2. Bestaande support grants migreren of alleen nieuwe grants aan max TTL onderwerpen.
3. Security dashboard bouwen:
   - laatste downloads;
   - support access events;
   - platform changes;
   - cross-tenant denial events waar gelogd;
   - filter per tenant en platform-only view.
4. Denial audit uitbreiden waar nuttig:
   - storage path guessing;
   - direct-ID denial;
   - expired/wrong support grant.
5. Tenant-admin zicht op eigen audit scheiden van platform/support audit.

Staging-impact:

- Begin read-only dashboard.
- Nieuwe max TTL eerst op nieuwe grants toepassen om bestaande staging-support niet te breken.
- Geen bestaande auditdata verwijderen.

Acceptatie:

- Te lange break-glass TTL faalt.
- Actieve/verlopen/verkeerde tenant grant is getest.
- Dashboard toont geen cross-tenant of platform-only data aan tenant-admin.

### Fase 6 - Productisering: onboarding, first-run, usage en branding

Doel:

- De platform- en tenantbeheerervaring naar productniveau brengen.

Taken:

1. Platform-admin onboarding wizard bouwen bovenop provisioning service:
   - tenantgegevens;
   - domein;
   - plan;
   - modules;
   - sectoren;
   - owner invite;
   - review/confirm;
   - rollback/status.
2. Tenant first-run wizard uitbreiden:
   - echte stapvalidatie;
   - branding;
   - gebruikers;
   - sectoren;
   - modules;
   - eerste klant/object/opdracht optioneel.
3. Usage dashboard uitbreiden:
   - users;
   - documenten;
   - opdrachten;
   - storage estimate;
   - actieve modules;
   - support grants;
   - relevante limits.
4. Branding preview per tenant toevoegen:
   - kleuren;
   - logo;
   - e-mail/PDF preview waar mogelijk.
5. Bestaande eenvoudige forms behouden totdat wizard stabiel is.

Staging-impact:

- UI additive naast bestaande platformformulier/checklist.
- Geen bestaande tenant hoeft wizard opnieuw te doorlopen.
- Wizard kan achter feature flag tot smoke groen is.

Acceptatie:

- Nieuwe tenant kan via wizard worden ingericht zonder SQL.
- First-run wizard kan worden doorlopen en slaat echte status op.
- Usage toont documenten/storage naast bestaande basisstats.

### Fase 7 - Staging smoke dashboard en operationele acceptatie

Doel:

- Staging en eerste externe tenant voorspelbaar kunnen valideren.

Taken:

1. Staging smoke dashboard bouwen met status voor:
   - host;
   - login;
   - modules;
   - sectoren;
   - storage;
   - PDF/downloads;
   - migraties;
   - support grants;
   - audit.
2. Smoke API of script toevoegen voor CI/ops.
3. Demo-data generator verbinden aan smokechecks.
4. Staging-copy migration smoke formaliseren.
5. Backup/restore en rollback playbook actualiseren.
6. Eerste externe tenant checklist toevoegen.

Staging-impact:

- Dashboard is read-only.
- Smokechecks mogen geen destructieve data wijzigen.
- Muterende smokechecks gebruiken dedicated demo tenants en cleanup.

Acceptatie:

- Staging smoke dashboard groen voor kernpaden.
- Migration smoke workflow is reproduceerbaar.
- Eerste externe tenant kan op basis van checklist worden voorbereid.

## 5. Aanbevolen PR-volgorde

1. PR A: Canon refresh t/m PR #148.
2. PR B: Testfixtures en demo-data generator skeleton.
3. PR C: Host-first Playwright/integration basis.
4. PR D: Migration smoke workflow.
5. PR E: Tenant_id unresolved reports en constraint inventory.
6. PR F: Remove `DEFAULT_TENANT_ID` DB defaults from tenantdata.
7. PR G: Validate constraints en `tenant_id NOT NULL` waar schoon.
8. PR H: Assignment media tenant_id wave.
9. PR I: News scope decision en implementation.
10. PR J: Storage backfill job plus storage tests.
11. PR K: Module enforcement harmonisatie.
12. PR L: Support break-glass TTL en audit events.
13. PR M: Security dashboard read-only.
14. PR N: Platform onboarding wizard.
15. PR O: Tenant first-run wizard validation.
16. PR P: Usage dashboard documents/storage.
17. PR Q: Branding preview.
18. PR R: Staging smoke dashboard.
19. PR S: Final operational checklist and first external tenant readiness.

## 6. Definitie van klaar

Deze grote update is klaar wanneer:

- canonbronnen actueel zijn en geen PR #125-reststatus meer als actuele waarheid tonen;
- Tenant A/B/Veele integration fixtures bestaan en draaien;
- host-first, RBAC, module, sector, support, direct-ID en storage grenzen runtime getest zijn;
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
- staging bereikbaar is gebleven zonder drop/reset/rebuild.
