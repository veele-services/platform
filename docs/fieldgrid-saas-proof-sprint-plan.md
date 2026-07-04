# Fieldgrid SaaS proof sprintplan canon

Datum: 2026-07-04
Status: sprint 13 tenant first-run wizard geleverd; runtime proof voor `FG-OPS-002` blijft open; sprint 0 canon refresh 2.0 blijft de basis.
Scope: volledige afronding van SaaS-hardening, runtime-bewijs, tenant-regio's, storage, audit, onboarding, smoke en externe tenant readiness.

## Doel

Dit document vervangt de losse faseplanning als uitvoeringscanon. Het doel is niet gedeeltelijk afronden, maar alle resterende onderdelen naar een sluitende eindstaat brengen terwijl staging zoveel mogelijk bereikbaar blijft.

Elke volgende PR moet verwijzen naar:

- het sprintnummer uit dit document;
- de statusvelden uit dit document;
- de relevante data-classificatie-items;
- de relevante test-id's uit de cross-tenant testmatrix;
- de staging-promotieregels.

## Canonieke statusvelden

| Status | Betekenis | Wanneer gebruiken |
| --- | --- | --- |
| `done` | Functionaliteit is gebouwd, runtime gebruikt de juiste bron en er is passend bewijs. | Alleen als code, tests en docs overeenkomen. |
| `partial` | Basis bestaat, maar productflow, dekking of randgevallen zijn incompleet. | Voor features zoals usage, provisioning of first-run waar MVP-basis bestaat. |
| `runtime-proof-open` | Runtime lijkt aanwezig, maar echte integration/Playwright/DB/RLS/storage-bewijzen ontbreken. | Voor host, RBAC, module, portal, support, regio of direct-ID grenzen zonder echte runtime-test. |
| `hardening-open` | Schema/runtime is staging-veilig opgebouwd, maar constraint validation, NOT NULL, backfill of cleanup staat nog open. | Voor tenant_id, storage en migratie-hardening. |
| `nice-to-have` | Waardevol, maar niet vereist voor harde SaaS-isolatie. | Voor visualisaties, previews en polish na P0/P1. |

Geen canonitem mag nog als alleen "open" of "ontbreekt" blijven staan zonder een van deze statussen.

## Actuele status per domein

| Domein | Status | Sprint eigenaar | Opmerking |
| --- | --- | --- | --- |
| Host-first tenantcontext | `runtime-proof-open` | Sprint 5/6 | Runtime bestaat; echte Tenant A/B/Veele en Playwright hosttests ontbreken. |
| Tenant lifecycle | `runtime-proof-open` | Sprint 5 | Active/suspended/archived moeten runtime bewezen worden. |
| Tenant RBAC | `runtime-proof-open` | Sprint 5 | Tenantrollen zijn runtime-bron; echte multi-tenant roltests ontbreken. |
| Platform-admin guard | `runtime-proof-open` | Sprint 10/12 | Basis bestaat; inactive/admin/tenant-user denial moet bewezen en gedashboard worden. |
| Support grants | `partial` | Sprint 10 | Grant, reden en expiry bestaan; max TTL, break-glass UX en securitydashboard open. |
| Sector enforcement | `runtime-proof-open` | Sprint 5 | Runtimebasis bestaat; disable/default/single-sector bewijs uitbreiden. |
| Module enforcement | `runtime-proof-open` | Sprint 11 | Runtime-brede guards voor API, backoffice, portalen en jobs geleverd; Playwright/integration bewijs open. |
| Tenant-regio's | `partial` | Sprint 2/3/4 | Sprint 2 datamodel/backfill en Sprint 3 backoffice multiselect UI geleverd; runtime planningproof blijft Sprint 4. |
| Customers/objects/personnel/assignments | `runtime-proof-open` | Sprint 5/8 | Directe tenant_id bestaat, maar defaults/hardening en direct-ID bewijs moeten dicht. |
| Documents/reports/quotes/invoices/payments/batches | `hardening-open` | Sprint 8 | Tenant-aware foundation bestaat; nullable/backfill/constraint validation open. |
| Assignment media | `hardening-open` | Sprint 9 | Directe tenant_id en storageproof moeten afgerond worden. |
| Storage | `hardening-open` | Sprint 9 | Helpers/guards bestaan; fysieke backfill, policies en path-guessing tests open. |
| Audit/security events | `partial` | Sprint 10 | Centraal auditcontract en dashboardfilters geleverd; volledige runtime-instrumentatie en E2E bewijs blijven uitbreidbaar. |
| Veele Portaal klant/personeel | `runtime-proof-open` | Sprint 6 | Host-bound basis bestaat; documenten/facturen/tickets/opdrachten/media/notificaties/module-denials E2E open. |
| Migration smoke | `partial` | Sprint 7 | Runner bestaat; lege DB en staging-copy workflow moet formeel worden. |
| Platform onboarding wizard | `partial` | Sprint 12 | Provisioning/status bestaat; echte save/resume/review/rollback wizard open. |
| Tenant first-run wizard | `runtime-proof-open` | Sprint 13 | Owner wizard met save/resume en readiness bestaat; Playwright/integration bewijs open. |
| Usage dashboard | `partial` | Sprint 14 | Basisstats bestaan; documenten/storage/downloads/active modules uitbreiden. |
| Branding preview | `nice-to-have` | Sprint 14 | Basis branding bestaat; preview voor portal/email/PDF open. |
| Security dashboard | `partial` | Sprint 10 | Losse basis bestaat; centraal dashboard open. |
| Module dependency visualisatie | `done` | Sprint 11 | Platform-admin tenantdetail toont ontbrekende dependencies en actieve dependents. |
| Demo-data generator | `partial` | Sprint 1 | Canon/fixtures bestaan; one-click seed/cleanup open. |
| Staging smoke dashboard | `partial` | Sprint 15 | Dashboardbasis/read-only bestaat; run history, Playwright-smokes en mutating cleanup open. |
| Materialen en inventaris | `partial` | Latere productroadmap na Sprint 16 | Onderzoek/canon bestaat; volledige modulebouw volgt na SaaS proof tenzij apart gestart. |

## Staging-continuiteit

Deze regels gelden voor alle sprints:

1. Geen drop/reset/rebuild van stagingdata.
2. Migraties zijn additive-first.
3. `NOT VALID` constraints eerst, validatie later na staging-copy smoke.
4. Legacy reads blijven tijdelijk bestaan tijdens backfills.
5. Storagebackfill is copy-first, verify-second, switch-third, cleanup-last.
6. Nieuwe UI-flows worden naast bestaande flows geplaatst tot ze bewezen zijn.
7. Elke sprint heeft rollbackpad of no-op fallback.
8. `main` blijft bron van waarheid; staging-sync pas na groene checks.
9. Migratie-PR's noemen lege DB smoke en staging-copy smoke.
10. Geen sprint combineert meerdere onafhankelijke datarisco's in dezelfde promotie.

## Sprint 0 - Canon refresh 2.0

Doel:

- Canon gelijk trekken met huidige codebase.
- Statusvelden invoeren.
- Sprint 0-16 als nieuwe uitvoeringsbron vastleggen.
- Regio als tenant-config domein opnemen.

Taken:

- Masterplan bijwerken met statusvelden en sprintplanverwijzing.
- Data-classificatie bijwerken met `status` per domein.
- Testmatrix bijwerken met regio- en runtime-bewijsstatus.
- Next-major-update-plan vervangen door sprintplan-wrapper.
- Canon guardtest uitbreiden.

Definition of Done:

- Geen canon gebruikt oude fases als enige actuele uitvoeringslijn.
- `done`, `partial`, `runtime-proof-open`, `hardening-open`, `nice-to-have` staan in canon en test.
- Regio staat in masterplan, data-classificatie en testmatrix.
- Geen runtime-code of migratie gewijzigd.

## Sprint 1 - Tenant A/B/Veele runtime fixtures

Doel: echte testfixtures bouwen voor runtime SaaS-bewijs.

Taken:

- Idempotente seed/cleanup voor `demo-a`, `demo-b` en `veele`.
- Actors: platform owner, inactive platform admin, support zonder grant, support met actieve grant, support verlopen, owner/admin/planner/employee/customer/personnel per tenant.
- Records: customer, object, personnel, assignment, document, report, quote, invoice, payment, audit row, storage path.
- Helpers voor hostheaders, tenantcookies, supportmodus en platformhost.

Definition of Done:

- Fixtures kunnen herhaald draaien zonder stagingdata te vervuilen.
- Cleanup is scoped op demo tenants/test markers.
- Minimaal eerste echte host/membership/direct-ID denial test groen.

## Sprint 2 - Regio datamodel en backfill

Doel: regio's tenant-breed modelleren.

Opleverstatus:

- `lib/db/migrations/064_tenant_regions.sql` levert de additive migratie.
- `lib/db/src/schema/tenant-regions.ts` exporteert de Drizzle tabellen.
- `docs/fieldgrid-sprint-2-tenant-regions.md` beschrijft het compatibiliteits- en vervolgcontract.
- `tests/fieldgrid-sprint-2-tenant-regions.test.mjs` bewaakt de migratie, RLS, backfill en schema-export.

Taken:

- Nieuwe tenant-config tabellen: `tenant_regions`, `personnel_regions`, `object_regions`, `assignment_required_regions` en waar nuttig `customer_regions`.
- Backfill uit legacy `personnel.region`, `personnel.preferred_regions` en `assignments.required_region`.
- Tenant-unieke genormaliseerde regionaam.
- Oude velden tijdelijk behouden voor compatibiliteit.
- Server-side validatie dat regio-id's bij de huidige tenant horen.

Definition of Done:

- Meerdere regio's per personeelslid, object en opdracht mogelijk.
- Bestaande stagingdata blijft intact.
- Lege DB migration smoke groen.

## Sprint 3 - Regio UI backoffice breed

Doel: alle relevante backoffice-formulieren ondersteunen multiselect met autofill.

Opleverstatus:

- `artifacts/backoffice/src/components/regions/RegionMultiSelect.tsx` levert de herbruikbare selector met autocomplete en create-on-type.
- `artifacts/backoffice/src/app/actions/regions.ts` leest en synchroniseert tenant-regio's voor personeel, objecten en opdrachten.
- Personeelsformulier gebruikt meerdere regio's en vult legacy `personnel.region` en `preferred_regions`.
- Objectformulier gebruikt meerdere regio's via `object_regions`.
- Opdrachtformulier gebruikt meerdere regio's via `assignment_required_regions` en vult legacy `assignments.required_region` met de eerste regio.
- `docs/fieldgrid-sprint-3-region-ui.md` beschrijft het compatibiliteitscontract.
- `tests/fieldgrid-sprint-3-region-ui.test.mjs` bewaakt de UI- en action-wiring.

Taken:

- Herbruikbare `RegionMultiSelect` met autocomplete en create-on-type.
- Toepassen op personeelslid aanmaken/bewerken.
- Toepassen op object aanmaken/bewerken.
- Toepassen op opdracht aanmaken/bewerken.
- Toepassen op relevante customer/object/personnel/detailfilters waar regio zinvol is.
- Oude single-regio UI vervangen of markeren als legacy readonly.

Definition of Done:

- Bestaande tenant-regio's verschijnen in dropdown.
- Nieuwe regio wordt tenant-breed herbruikbaar.
- Meerdere keuzes worden opgeslagen en opnieuw geladen.

## Sprint 4 - Regio runtime en planninglogica

Doel: regio's runtime laten werken.

Taken:

- Planning eligibility: opdracht zonder regio is onbeperkt; opdracht met regio's vereist overlap met personeel.
- Objectregio's kunnen opdrachtregio's voorinvullen.
- Personeels-, object- en opdrachtfilters regio-aware maken.
- Smart planning en PWA-open werkbonnen regio-aware maken waar relevant.

Definition of Done:

- Multi-regio personeel matcht correct.
- Vreemde tenant-regio faalt server-side.
- Tenant A/B/Veele regio-denial tests groen.

## Sprint 5 - Runtime security proof suite

Doel: static guards aanvullen met echte runtime tests.

Taken:

- Integration tests voor host-first, membership, RBAC, support, modules, sectoren, regio, direct-ID.
- API en backoffice server actions meenemen.
- Veele als gewone tenant testen.

Definition of Done:

- Elke P0 securitygrens heeft happy path en denial path.
- Tenant A kan Tenant B-data niet lezen/schrijven.

## Sprint 6 - Playwright host en portal acceptance

Doel: originele Veele Portaal doelen E2E bewijzen.

Taken:

- Backoffice host-bound login.
- Klantportaal: documenten, facturen, tickets, rapporten, verkeerde host, module-denials.
- Personeelsapp: opdrachten, planning/home, media, notificaties, verkeerde host, module-denials.
- Realtime/minuut-refresh personeelsplanning meenemen.

Definition of Done:

- Klant ziet alleen eigen klantdata.
- Personeel ziet alleen eigen opdrachten/media.
- Verkeerde host faalt duidelijk.

## Sprint 7 - Migration smoke workflow

Doel: migraties formeel bewijzen voordat staging geraakt wordt.

Taken:

- Workflow/script voor lege database.
- Workflow/script voor staging-copy.
- Rapportage van toegepaste migraties, skipped migrations, unresolved rows, failed statements en readiness.
- PR-template/checklist uitbreiden met smoke-resultaat.

Definition of Done:

- Elke toekomstige migratie kan op leeg en staging-copy draaien.
- Smoke-output is leesbaar en CI/ops bruikbaar.

## Sprint 8 - Tenant-id hardening wave

Doel: gevoelige tenantdata definitief sluiten.

Opleverstatus:

- Payments, batches en audit wave 3/4 zijn geleverd met `063_payments_batches_audit_tenant_scope.sql`.
- Default-fallback hardening is geleverd met `070_sprint8_tenant_id_default_hardening.sql`.
- Staging-copy constraintvalidatie en `tenant_id SET NOT NULL` blijven `hardening-open` tot de rapportage schoon is.

Taken:

- Backfill reports voor documents, reports, quotes, invoices, payments, batches, audit.
- Constraints valideren.
- Waar schoon: `tenant_id NOT NULL`.
- Bewuste nullable uitzonderingen documenteren en testen.
- Defaults naar `DEFAULT_TENANT_ID` verwijderen uit tenantdata.

Definition of Done:

- Gevoelige tenantdata heeft verplichte tenant-scope of expliciet bewezen uitzondering.
- Ontbrekende tenant_id schrijft niet stil naar default tenant.

## Sprint 9 - Storage hardening

Doel: storage SaaS-proof maken.

Opleverstatus:

Status: `geleverd` voor applicatie-hardening in `docs/fieldgrid-sprint-9-storage-hardening.md`. Nieuwe assignment-media uploads gebruiken `tenant/{tenant_id}/assignments/{assignment_id}/...`; klant-, personeel- en backoffice signed URL helpers binden storage paths aan tenant en assignment voordat Supabase tekent. Fysieke objectcopy blijft copy-first stagingwerk en staat als cleanup-plan vast.

Taken:

- Assignment media direct tenant-aware maken: geleverd in upload- en signed-url runtimehelpers.
- Copy-first fysieke storagebackfill: gepland als staging/ops-stap zonder objectverplaatsing in deze PR.
- Canonieke paden `tenant/{tenant_id}/...`: geleverd voor assignment media als `tenant/{tenant_id}/assignments/{assignment_id}/...`.
- Supabase Storage policy/RLS bewijs: statische policybasis bestaat; echte provider-smoke blijft vereist.
- Signed URL en path guessing tests: statische signed-url guards geleverd; echte path-guessing integrationtest blijft vereist.
- Legacy-path cleanup-plan: geleverd in `docs/fieldgrid-sprint-9-storage-hardening.md`.

Definition of Done:

- Tenant B krijgt geen Tenant A signed URL/path access via applicatie-signed-url helpers.
- Nieuwe uploads zijn tenant-prefixed.
- Oude bestanden blijven bereikbaar tijdens transitie.

## Sprint 10 - Audit en security dashboard 2.0

Doel: alle gevoelige events centraal zichtbaar maken.

Opleverstatus:

Status: `geleverd` voor `docs/fieldgrid-sprint-10-audit-security.md`. Het dashboard combineert `support_access_audit_log` en `audit_log`, normaliseert events naar support/tenant/platform scope en ondersteunt filters per tenant, actor, eventtype en scope. Nieuwe auditinstrumentatie blijft het centrale contract volgen.

Taken:

- Auditcontract voor support access, downloads, PDF's, direct-ID denials, module-denials, storage-denials en platform-admin acties: geleverd in `lib/db/src/platform-access.ts`.
- Support break-glass max TTL afdwingen met verplichte reden: geleverd via `validateSupportBreakGlassGrant()`.
- Dashboard met filters per tenant, actor, eventtype en platform/support scope: geleverd op `/platform/security`.

Definition of Done:

- Te lange break-glass TTL faalt.
- Downloads en denials zijn auditbaar zodra hun runtimepad auditregels schrijft.
- Tenant-admin ziet geen platform-only audit via het platform-only securitydashboard.

## Sprint 11 - Module enforcement harmonisatie

Doel: API, backoffice, portalen en jobs hetzelfde modulegedrag geven.

Status: `geleverd` in `docs/fieldgrid-sprint-11-module-enforcement.md`. Geen schema- of migratiewijziging.

Taken:

- Centrale module-permission mapping: geleverd via `FIELDGRID_PERMISSION_MODULES`.
- Backoffice mapping gelijk trekken met API: geleverd via gedeelde mapping en effectieve permissions.
- Portalguards en jobguards uitbreiden: geleverd via portal identity helpers en `requireJobTenantModule`.
- Module dependency inspectie en visualisatie: geleverd op platform tenantdetail.
- Module-off tests voor UI, directe URL, server action, API en job: statisch geborgd; Playwright/integration blijft vervolg.

Definition of Done:

- Module uit betekent overal server-side uit.
- RBAC alleen kan module-off niet overrulen.

## Sprint 12 - Platform onboarding wizard

Doel: platform-admin kan tenants volledig begeleid aanmaken.

Status na sprint 12: `runtime-proof-open`.

Geleverd:

- `/platform` gebruikt een wizard voor tenantgegevens, domein, plan, modules, sectoren, regio's, owner invite, branding en review.
- Concepten worden in `tenant_provisioning_runs` opgeslagen met `status = draft` en kunnen via querystring worden hervat.
- Provisioning schrijft gekozen modules, sectorbeleid, tenant-regio's en branding door naar de transactionele provisioningservice.
- Runhistorie toont status, owner invite status, foutmelding, rollbackpad, hervatten en retry.
- Owner-invite failure gebruikt rollback en bewaart rollbackmetadata.

Taken:

- Wizard: tenantgegevens, domein, plan, modules, sectoren, regio's, owner invite, branding, review, runstatus, rollback. `geleverd`
- Save/resume. `geleverd`
- Provisioning run history en retry/foutafhandeling. `geleverd`
- Playwright/integration bewijs voor happy path, rollback en retry. `runtime-proof-open`

Definition of Done:

- Nieuwe tenant kan zonder SQL worden ingericht.
- Mislukte provisioning geeft duidelijke status en rollbackpad.

## Sprint 13 - Tenant first-run wizard

Doel: tenant-eigenaar rondt setup actief af.

Opleverstatus:

- `/first-run` is een tenant-owner wizard met save/resume op bestaande tenantconfiguratie.
- `tenant_first_run_state` bewaart required/completed wizardstappen.
- Readiness warnings en score worden gevuld uit bedrijfsgegevens, branding, sectoren, regio's, gebruikers, modules, basisinstellingen en optionele eerste data.
- `docs/fieldgrid-sprint-13-tenant-first-run.md` beschrijft de stagingveilige oplevering zonder nieuwe migratie.
- `tests/fieldgrid-sprint-13-tenant-first-run.test.mjs` bewaakt action-, pagina- en canon-wiring.

Taken:

- Wizard: bedrijfsgegevens, branding, sectoren, regio's, gebruikers, modules, basisinstellingen, eerste klant/object/opdracht optioneel.
- Checklist wordt echte wizardstatus.
- Readiness warnings voor incomplete setup.

Definition of Done:

- Owner kan save/resume gebruiken.
- Tenant readiness wordt meetbaar gevuld.

## Sprint 14 - Usage, branding en operational readiness

Doel: tenantbeheer productklaar maken.

Taken:

- Usage dashboard: users, documenten, opdrachten, storage, downloads, actieve modules, support grants, relevante limieten.
- Branding preview: backoffice, klantportaal, personeelsapp, email, PDF.
- Operational readiness score: host, login, modules, sectoren, regio's, storage, PDF, migraties, audit.

Definition of Done:

- Platform-admin ziet tenantgezondheid in een overzicht.
- Branding is controleerbaar voor livegang.

## Sprint 15 - Staging smoke dashboard

Doel: staging continu bewijsbaar maken.

Taken:

- Run history.
- Live Playwright-smokes.
- Migratie-smoke status.
- Gecontroleerde mutating checks met cleanup.
- Dashboard voor host, login, modules, sectoren, regio's, storage, PDF, portalen en personeelsplanning.

Definition of Done:

- Per run is zichtbaar wat groen/faalt.
- Mutating checks ruimen zichzelf op.

## Sprint 16 - Final hardening en externe tenant gate

Doel: alles afsluiten als productklaar.

Taken:

- Alle `partial`, `runtime-proof-open` en `hardening-open` sluiten of bewust naar post-launch verplaatsen.
- Performance review op tenantqueries.
- Security review op service-role gebruik.
- Final staging-copy smoke.
- Eerste externe tenant checklist.

Definition of Done:

- Geen P0/P1 SaaS-hardening restpunt open.
- Runtime proof, migration smoke, storage proof en portal acceptance groen.
- Regio-feature is overal multi-select, tenant-safe en bewezen.
- Staging bleef bereikbaar zonder drop/reset/rebuild.

## Volgordecontract

De aanbevolen volgorde is bindend tenzij expliciet in een PR-body gemotiveerd wordt waarom wordt afgeweken:

1. Sprint 0: canon refresh.
2. Sprint 1: testfixtures.
3. Sprint 2-4: regio volledig bouwen.
4. Sprint 5-7: runtime proof en migration smoke.
5. Sprint 8-9: tenant-id en storage hardening.
6. Sprint 10-11: audit/security/modules.
7. Sprint 12-15: wizards, dashboards en staging smoke.
8. Sprint 16: final gate.
