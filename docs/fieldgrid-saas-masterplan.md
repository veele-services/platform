# Fieldgrid SaaS masterplan canon

Datum: 2026-07-02
Status: canon voor vervolgwerk vanaf de recovery-builds
Bronnen: oorspronkelijke Fieldgrid/Veele SaaS-masterplanbijlage, huidige `main` codebase en recovery-werk t/m groene staging-builds.

## 1. Doel en vaste besluiten

Fieldgrid is het SaaS-platform. Veele Services is geen platform-uitzondering meer, maar een gewone tenant binnen Fieldgrid.

Vaste besluiten:

- Productdoel: extern multi-tenant SaaS-platform.
- Databasekeuze: een gedeelde database met sterke tenant-isolatie.
- Isolatie-eis: applicatiechecks, RLS/storage policies en cross-tenant tests.
- Tenantselectie: host/subdomain is leidend; tenant switcher mag hostcontext niet overschrijven.
- Platformdomeinen nu: `platform.fieldgrid.nl` voor productie en `staging.fieldgrid.nl` voor staging.
- Doeldomeinmodel: `fieldgrid.nl` als hoofd/platformmerk, `platform.fieldgrid.nl` als platform-admin, tenant-subdomains zoals `veele.fieldgrid.nl`.
- Platform-admin is gescheiden van tenant-admin.
- Fieldgrid support werkt alleen via expliciete support grants en audit logging.
- Globale `roles` blijven templates; runtime-RBAC komt uit `tenant_roles`.
- Modules worden tenant-specifiek aan/uit gezet en server-side afgedwongen.
- Sectoren blijven een globale catalogus met tenant-toewijzing.
- Starter, Professional en Enterprise zijn de eerste pakketten.
- Geen harde aantallimieten in de recovery-MVP, behalve: custom role management is Professional+.
- Facturatie van Fieldgrid-abonnementen is eerst handmatig; automatische payment-provider komt later.

## 2. Huidige codebase-status

### 2.1 Klaar of grotendeels klaar

Recovery foundation:

- `docs/fieldgrid-recovery-execution-plan.md` bestaat en legt recovery-guardrails vast.
- Migratierunner ondersteunt compatibility skips voor legacy RBAC-migraties.
- Staging-data is behouden; de migraties zijn meerdere keren staging-safe gemaakt.
- `tests/fieldgrid-recovery.test.mjs` bewaakt een deel van de recovery-invarianten.

Tenant resolver en tenant switcher:

- `tenant_domains` bestaat in schema en migraties.
- Backoffice heeft host-first resolver in `artifacts/backoffice/src/lib/auth/tenant-resolver.ts`.
- Backoffice helper `getCurrentTenantId()` gebruikt hostcontext eerst, daarna tenant switcher cookie.
- Default tenant fallback is beperkt tot non-production met `ALLOW_DEFAULT_TENANT_FALLBACK=true`.
- Tenant switcher bestaat via `switchBackofficeTenant()` en checkt actieve membership.

Tenant-scoped RBAC:

- Canonieke runtime-tabellen bestaan: `tenant_roles`, `tenant_role_permissions`, `tenant_user_roles`.
- `roles` en `role_permissions` blijven globale templates.
- Backoffice permission helper gebruikt `getUserPermissions(userId, tenantId)`.
- API permission middleware gebruikt tenant role ids in plaats van globale role ids.
- Rollenbeheer-actions bestaan voor tenantrollen, permissies, gebruikersrollen en uitnodigingen.
- Custom rollen worden centraal geblokkeerd voor niet-Pro/Enterprise, maar de planbron is nog een env-placeholder.

Platform-admin en support foundation:

- `platform_users`, `support_access_grants` en `support_access_audit_log` bestaan.
- `requirePlatformAdmin()` en `requirePlatformSupportUser()` bestaan.
- Platform layout blokkeert gewone tenant-users via platform guard.
- `/platform` toont minimale tenant-, platform-user- en supporttoegangsoverzichten.
- Support grants hebben tenant scope, tijdvenster, reden, revoke en auditlog.

Tenantsector foundation:

- `tenant_sectors` bestaat.
- `task_codes` heeft nu `tenant_id`.
- Er zijn DB constraints/triggers voor tenant-sector membership/enabled checks op klanten, objecten, personeel en taakcodes.
- Backoffice heeft helpers `assertTenantSectorAllowed()` en `assertTenantSectorsAllowed()`.
- Sectoren zijn nog globale catalogus, zoals gewenst.

Tenant-aware kernentiteiten:

- `customers`, `objects`, `personnel`, `assignments`, `customer_users`, notificaties en domain events hebben expliciete `tenant_id`.
- Klantportaal gebruikt `customer_users` met `tenant_id + customer_id` als autorisatiebasis.
- Backoffice tenant audit is aanwezig in `docs/tenant-query-audit-v1.md`.
- Security/privacy audit is aanwezig in `docs/security-final-audit-v1.md`.

### 2.2 Gedeeltelijk klaar

Platform-admin:

- Er is een technische shell en guard.
- Nog geen echte CRUD voor tenants, domeinen, modules, plannen, limieten, sectorbeleid, task-code overrides of onboarding.
- Tenant lifecycle is nog `is_active`; er is nog geen statusmodel zoals provisioning/trial/active/suspended/archived.

Support access:

- Grants en audit bestaan.
- Support access is nog geen volledige runtime-prioriteit in alle permission checks: platform-admin -> active support grant -> tenantrol moet nog consequent worden geintegreerd in workflows.
- Tenant-admin zicht op support access status moet nog worden gebouwd.

Tenant sectors:

- Membership/enabled foundation bestaat.
- Er is nog geen `tenant_sector_settings` of policy voor single/multiple/max/default sector.
- Single-sector UI is nog niet gebouwd.
- `assertTenantSectorCanBeDisabled()` blokkeert nog niet op bestaande data; het is op dit moment permissief.
- Assignments hebben geen eigen sectorkolom; sectorcontrole loopt indirect via customer/object/task context en moet expliciet worden ontworpen.

RBAC:

- Runtime-RBAC is tenant-scoped.
- Standaardrollen zijn er via backfill/seeds, maar de uiteindelijke permissiematrix per rol moet als productmatrix worden vastgelegd en getest.
- Plan-gating voor custom roles is nog env-based via `TENANT_PLAN`, niet database-backed.

Tenant domains:

- Backoffice hostresolver bestaat.
- API-server gebruikt nog geen host-first tenant resolver; `requireTenantScope` kiest de eerste actieve tenantmembership.
- Klantportaal en personeelsapp hebben nog geen uniforme host-first tenant resolver.

Branding:

- `organization_settings` is tenant-aware en bevat logo, SMTP, e-mailkleuren en templates.
- Defaults bevatten nog Veele Services tekst. Dat moet worden gescheiden in Fieldgrid platform defaults en tenantbranding.
- Package-gated branding bestaat nog niet.

### 2.3 Nog niet gebouwd

Modules en entitlements:

- Er is geen `modules` tabel.
- Er is geen `tenant_modules` tabel.
- Er is geen `module_dependencies` model.
- Er is geen `requireTenantModule()` guard.
- Routes, server actions, API routes, background jobs en portalen hebben nog geen module-off server-side afdwinging.

Plannen, subscriptions en limieten:

- Er zijn geen `plans`, `plan_modules`, `plan_limits`, `tenant_subscriptions` of tenant overrides.
- Limieten zijn niet configureerbaar in platform-admin.
- Handmatige Fieldgrid-facturatie is nog niet gemodelleerd.

Tenant lifecycle en provisioning:

- Geen transactionele tenant provisioning service.
- Geen onboarding wizard.
- Geen tenant first-run wizard.
- Geen provisioning audit/status/logs.
- Geen tenant create/suspend/archive flow in platform-admin.

Tenant task codes en prijzen:

- `task_codes` is nu tenant-aware, maar nog niet gemodelleerd als globale template + tenant override.
- Geen `tenant_task_codes`.
- Geen `tenant_task_code_prices`.
- `task_codes.code` is nog globaal unique, wat voor SaaS mogelijk te strak is.

Data-normalisatie op gevoelige child-tabellen:

- `documents` heeft nog geen `tenant_id`.
- `invoices` heeft nog geen `tenant_id`.
- `quotes` heeft nog geen `tenant_id`.
- `reports` heeft nog geen `tenant_id`.
- `payments` en `customer_payment_batches/items` hebben nog geen directe `tenant_id`.
- `audit_log` heeft nog geen `tenant_id` en is nog niet gesplitst in platform/tenant audit.
- Assignment child/media tabellen moeten nog systematisch worden geclassificeerd.

Storage hardening:

- Storage policies zijn eerder aangescherpt, maar tenant-prefixed paths zoals `tenant/{tenant_id}/...` zijn nog niet canoniek afgedwongen.
- Signed URL helpers moeten tenant-aware worden gehard.
- Cross-tenant storage tests ontbreken nog als structurele suite.

Portalen:

- Klantportaal is tenant-aware via `customer_users`, maar niet host-first tenant-bound. Een user met dezelfde login over meerdere tenants kan zonder hostbinding ambigu worden.
- Personeelsapp gebruikt vooral `personnel.user_id`; tenant-hostcontext en module/sector guards moeten nog worden toegevoegd.
- Portalen hebben nog geen tenant module guards en branding resolver.

## 3. Nieuwe canonieke runtime-volgorde

Elke server-side entrypoint moet uiteindelijk deze volgorde volgen:

1. `requireAuth()`
2. `resolveTenantFromHostOrSession()`
3. `requireActiveTenant()`
4. `requireTenantMembership()` of `requireActiveSupportGrant()`
5. `requireTenantModule()`
6. `requirePermission()` via tenantrol
7. `requireAllowedSector()` waar sector relevant is
8. `requireEntityInTenant()`
9. actie uitvoeren
10. audit schrijven waar nodig

Voor platformroutes geldt:

1. `requireAuth()`
2. `requirePlatformUser()`
3. `requirePlatformRole()` waar nodig
4. platformactie uitvoeren
5. platform audit schrijven

Supporttoegang is geen gewone tenantrol. De prioriteit wordt:

1. platform-admin voor platformroutes
2. actieve support grant voor support entrypoints
3. tenantrol voor normale tenantwerking

## 4. Dataclassificatie - huidige prioriteiten

| Domein | Voorbeelden | Huidige status | Doelstrategie | Prioriteit |
| --- | --- | --- | --- | --- |
| Tenant core | tenants, tenant_users, tenant_domains | bestaat, lifecycle beperkt | status/plan/provisioning toevoegen | P0 |
| RBAC | tenant_roles, tenant_user_roles | runtime tenant-scoped | permissiematrix/tests afronden | P0 |
| Modules | modules, tenant_modules | ontbreekt | eerste-klas entitlements | P0 |
| Sectoren | sectors, tenant_sectors | foundation bestaat | policy/default/single-sector/guards | P0 |
| Klanten/objecten/personeel/opdrachten | customers, objects, personnel, assignments | tenant_id aanwezig | module/sector guards afronden | P0 |
| Documenten | documents, storage paths | geen tenant_id | directe tenant_id + tenant storage prefix | P1 |
| Financieel | invoices, quotes, payments, payment batches | indirect tenant-scoped | directe tenant_id + RLS/indexen | P1 |
| Rapportages/media | reports, assignment photos, report attachments | deels indirect | directe tenant_id waar gevoelig | P1 |
| Audit | audit_log, support_access_audit_log | support audit tenant-aware, audit_log niet | platform/tenant audit splitsen | P1 |
| Branding | organization_settings | tenant-aware, Veele defaults | Fieldgrid/tenant split + plan gating | P2 |
| Portalen | klant-pwa, personeel-pwa | deels tenant-aware | host resolver + module/branding/sector guards | P2 |
| Billing | plans/subscriptions/limits | ontbreekt | handmatige SaaS-billing model | P2 |

## 5. Uitvoerbare roadmap vanaf nu

### Fase 0 - Canon, audit en testbasis

Doel: de recovery afsluiten en de SaaS-route bestuurbaar maken.

Parallelle tracks:

- Track 0A: Werk dit masterplan bij als canon en verwijs vanuit recovery-docs hiernaar.
- Track 0B: Beheer `docs/fieldgrid-data-classification.md` als verplichte tenantstrategie en dataclassificatie voor vervolg-PR's.
- Track 0C: Beheer `docs/fieldgrid-cross-tenant-testmatrix.md` als verplichte test-id bron met Tenant Veele, Tenant Demo A en Tenant Demo B.
- Track 0D: Maak een VPS/domein/deployplan voor `fieldgrid.nl`, `platform.fieldgrid.nl`, `staging.fieldgrid.nl` en tenant-subdomains.
- Track 0E: Inventariseer hardcoded Veele-teksten en classificeer ze als platform, tenant, historische content of seed/default.

Acceptatiecriteria:

- Er is een canoniek masterplan.
- Elke tabel heeft een doelstrategie.
- Er is een testmatrix voor tenant-, module-, sector- en storage-isolatie.
- `tests/fieldgrid-canon.test.mjs` bewaakt dat de canon-docs blijven bestaan en naar elkaar verwijzen.
- De domein- en rollbackroute is beschreven.

### Fase 1 - Tenant lifecycle en resolver uniform maken

Doel: alle entrypoints gebruiken dezelfde tenantcontext.

Parallelle tracks:

- Track 1A: Breid `tenants` uit met `status`, `plan_key`, `created_by`, `suspended_at`, `archived_at` en lifecycle checks.
- Track 1B: Maak een gedeelde tenant resolver package/helper die backoffice, API, klantportaal en personeelsapp kunnen gebruiken.
- Track 1C: Pas API `requireTenantScope` aan: host/subdomain eerst, geen eerste-actieve-tenant fallback als host tenant bepaalt.
- Track 1D: Maak tenant switcher UI af voor backoffice users met meerdere tenants; host blijft leidend.
- Track 1E: Voeg tests toe voor platformhost, tenanthost, onbekend Fieldgrid-subdomain, custom domain en tenant switcher override-pogingen.

Acceptatiecriteria:

- Productie valt nooit stilzwijgend terug op default tenant.
- API, backoffice en portalen gebruiken hetzelfde tenantmodel.
- Onbekende tenant-host faalt veilig.
- Suspended/archived tenants kunnen niet muteren.

### Fase 2 - RBAC afronden en bewijzen

Doel: tenantrollen zijn aantoonbaar de enige runtime-bron.

Parallelle tracks:

- Track 2A: Leg de definitieve permissiematrix vast voor Eigenaar, Management, Administratie, Planning, Teamlead, Medewerker, Alleen-lezen, Klantgebruiker en Personeelsgebruiker.
- Track 2B: Maak database-backed plan capabilities zodat custom roles niet meer op `TENANT_PLAN` env leunen.
- Track 2C: Voeg permission tests toe: dezelfde user heeft andere rollen in tenant A en tenant B.
- Track 2D: Maak platform-admin herstelactie voor tenantrollen: reseed/reset vanuit templates.
- Track 2E: Ruim legacy global-role runtimepaden op zodra tests bewijzen dat ze niet meer gebruikt worden.

Acceptatiecriteria:

- Globale rollen geven geen runtime-rechten.
- Tenantrol-permissies bepalen toegang.
- Custom roles werken alleen Professional+.
- Tenant A rollen werken niet in tenant B.

### Fase 3 - Modules, plannen en limieten

Doel: SaaS-entitlements worden eerste-klas domeinobjecten.

Parallelle tracks:

- Track 3A: Voeg `modules` en `module_dependencies` toe met seed voor tenant_core, auth, settings, users, customers, objects, assignments, planning, personnel, reports, quotes, invoices, documents, tickets, news, task_codes, customer_portal, personnel_pwa, notifications, email_notifications, push_notifications, payment_reminders, smart_planning, availability, hours en qualifications.
- Track 3B: Voeg `tenant_modules` toe met `is_enabled`, `visibility_when_disabled`, `config`, `enabled_at`, `disabled_at`.
- Track 3C: Voeg `plans`, `plan_modules`, `plan_limits`, `tenant_subscriptions` en tenant overrides toe.
- Track 3D: Bouw `requireTenantModule(tenantId, moduleKey)` en integreer eerst in backoffice pages/actions voor facturen, planning, rapporten, offertes, documenten, tickets en nieuws.
- Track 3E: Bouw platform-admin UI voor tenant modules, module dependencies, plan modules en limieten.

Acceptatiecriteria:

- Module uit is server-side uit.
- Directe URL/API/action naar uitgeschakelde module faalt.
- Dependencies voorkomen kapotte configuratie.
- Starter/Professional/Enterprise bestaan in database.
- Limieten zijn configureerbaar maar hoeven nog niet allemaal hard afgedwongen te worden.

### Fase 4 - Sectorbeleid en tenant task codes

Doel: single-sector en multi-sector tenants werken end-to-end.

Parallelle tracks:

- Track 4A: Voeg `tenant_sector_settings` toe met mode, max_sectors, default_sector_id en enforce_sector_scope.
- Track 4B: Maak single-sector UI: sectorveld verborgen en automatisch ingevuld.
- Track 4C: Integreer sector guards in customers, objects, personnel, assignments, task codes, imports en planning intelligence.
- Track 4D: Ontwerp `tenant_task_codes` als template/override laag boven globale task code templates.
- Track 4E: Voeg `tenant_task_code_prices` toe met prijs per tenant en optioneel sector, inclusief valid_from/valid_until.

Acceptatiecriteria:

- Starter kan exact een sector gebruiken als plan dat bepaalt.
- Sector buiten tenantconfiguratie faalt server-side en database-side waar mogelijk.
- Task codes volgen tenant-sectoren.
- Prijzen kunnen per tenant en sector verschillen.
- Historische facturen behouden hun prijscontext.

### Fase 5 - Data-normalisatie en storage hardening

Doel: gevoelige data direct tenant-scoped maken.

Parallelle tracks:

- Track 5A: Voeg `tenant_id` toe aan `documents`; backfill via gekoppelde entity; pas documentqueries en signed URL helpers aan.
- Track 5B: Voeg `tenant_id` toe aan `invoices`, `quotes`, `payments`, `customer_payment_batches` en batch items; backfill via customer/assignment/invoice.
- Track 5C: Voeg `tenant_id` toe aan `reports`, assignment media, report attachments en assignment notes waar nodig.
- Track 5D: Splits audit in platform audit en tenant audit; voeg tenant_id toe aan tenantacties en gevoelige downloads.
- Track 5E: Maak storage paths canoniek: `tenant/{tenant_id}/...`; voeg storage/RLS tests toe.

Acceptatiecriteria:

- Geen gevoelige tabel vertrouwt alleen op indirecte joins.
- Direct-ID toegang cross-tenant faalt.
- Storage path guessing werkt niet.
- Signed URLs worden alleen na tenant/entity-check uitgegeven.
- Tenant-admin ziet alleen tenant-audit; platform-admin ziet platformbreed.

### Fase 6 - Platform-admin productiseren

Doel: Fieldgrid kan zonder SQL tenants beheren.

Parallelle tracks:

- Track 6A: Bouw platform-admin navigatie en routes: tenants, tenant detail, modules, sectors, task codes, plans, support, audit.
- Track 6B: Bouw tenantbeheer: aanmaken, activeren, suspenden, archiveren, domeinen beheren, plan wijzigen.
- Track 6C: Bouw module/sector beheer per tenant met dependency validatie.
- Track 6D: Bouw support grants UI inclusief actieve grants per tenant en revoke/audit.
- Track 6E: Bouw plan/limietbeheer en usage-overzicht.

Acceptatiecriteria:

- Alleen platform_users kunnen platform-admin bereiken.
- Tenant-users krijgen nooit platformroutes.
- Veele is zichtbaar als tenant.
- Platform-admin kan tenant volledig configureren.
- Wijzigingen worden geaudit.

### Fase 7 - Provisioning en onboarding

Doel: nieuwe tenants reproduceerbaar aanmaken.

Parallelle tracks:

- Track 7A: Bouw transactionele provisioning service voor tenant, domein, owner, standaardrollen, settings, modules, sectoren en task codes.
- Track 7B: Bouw onboarding wizard in platform-admin: bedrijfsgegevens, domein, pakket, sectoren, modules, branding, owner invite, task-code templates, controle.
- Track 7C: Bouw tenant first-run wizard voor eigenaar: bedrijfsgegevens, logo, gebruikers, eerste klant/object/opdracht.
- Track 7D: Bouw invite owner flow met correcte tenantcontext en rollback bij fouten.
- Track 7E: Voeg provisioning tests toe voor succes, rollback, duplicate slug/domain en plan/module/sector combinaties.

Acceptatiecriteria:

- Platform-admin kan tenant zonder SQL aanmaken.
- Geen half aangemaakte tenant bij fout.
- Nieuwe tenant is na wizard bruikbaar.
- Provisioning log is zichtbaar.

### Fase 8 - Portalen en branding

Doel: klantportaal en personeelsapp zijn volledig tenant-aware en brandbaar.

Parallelle tracks:

- Track 8A: Bouw branding resolver per tenant met package-gating: Starter logo/naam; Pro/Enterprise kleuren, e-mailtemplate, favicon, login background en custom domain.
- Track 8B: Maak klantportaal host-first tenant-aware; klant krijgt geen tenantkeuze; customer_users blijft binnen tenant leidend.
- Track 8C: Maak personeelsapp host-first tenant-aware; personeel krijgt alleen eigen tenantcontext.
- Track 8D: Pas e-mails en PDF's aan op tenantbranding; verwijder Veele-defaults uit platform defaults.
- Track 8E: Voeg module guards toe aan klantportaal en personeelsapp.

Acceptatiecriteria:

- Klant van tenant A kan tenant B nooit zien.
- Personeel ziet alleen eigen tenant/opdrachten.
- Portaalmodule uit is onbereikbaar.
- Branding volgt tenant en pakket.

### Fase 9 - Fieldgrid deployment en operatie

Doel: same-VPS Fieldgrid deployment is herhaalbaar en terugrolbaar.

Parallelle tracks:

- Track 9A: DNS en reverse proxy voor `fieldgrid.nl`, `platform.fieldgrid.nl`, `staging.fieldgrid.nl`, wildcard `*.fieldgrid.nl` en custom domain voorbereiding.
- Track 9B: Supabase redirect URLs, mail domains, app names en environment variables naar Fieldgrid-context.
- Track 9C: Backup/restore flow voor staging en productie voor iedere migratiefase.
- Track 9D: Smoke tests voor platformhost, tenanthost, login, migraties, module-off, sector-off en storage.
- Track 9E: Monitoring/error logging/audit review voor supportproces.

Acceptatiecriteria:

- Fieldgrid-hosts werken op dezelfde VPS.
- Login redirects werken per host.
- Rollback is beschreven en getest.
- Database backup is verplicht voor risicomigraties.

### Fase 10 - Security acceptance en eerste externe tenant

Doel: Fieldgrid kan veilig extern worden gebruikt.

Parallelle tracks:

- Track 10A: Cross-tenant test suite: backoffice, klantportaal, personeelsapp, API, PDF routes, storage.
- Track 10B: Module acceptance: module uit, read-only history, dependency blocks, background jobs.
- Track 10C: Sector acceptance: single-sector Starter, multi-sector Professional, sector mismatch create/update.
- Track 10D: Platform-admin acceptance: tenant lifecycle, modules, sectors, plans, support grants, audit.
- Track 10E: Operational readiness: backups, monitoring, incident rollback, mail deliverability, docs.

Acceptatiecriteria:

- Tenant A kan tenant B niet lezen of muteren.
- Direct ID guessing faalt.
- Storage leak tests slagen.
- Platform-admin kan zonder developer nieuwe tenant onboarden.
- Eerste externe tenant kan live.

## 6. Eerstvolgende concrete PR-volgorde

1. Docs canon en dataclassificatie
   - Update dit document.
   - Voeg of beheer `docs/fieldgrid-data-classification.md`.
   - Voeg of beheer `docs/fieldgrid-cross-tenant-testmatrix.md`.
   - Bewaak de docs met `tests/fieldgrid-canon.test.mjs`.

2. Tenant lifecycle en shared resolver
   - `tenants.status` en lifecycle helpers.
   - Shared host resolver voor backoffice, API en portalen.
   - API `requireTenantScope` host-first maken.

3. Modules/plannen foundation
   - `modules`, `tenant_modules`, `plans`, `plan_modules`, `plan_limits`, `tenant_subscriptions`.
   - `requireTenantModule`.
   - Seed Starter/Professional/Enterprise.

4. Module guard eerste integratie
   - Backoffice routes/actions voor planning, facturen, offertes, rapporten, documenten, tickets, nieuws.
   - Navigatie filteren op moduleconfig.
   - Tests voor direct URL/action/API.

5. Sector policy en single-sector UX
   - `tenant_sector_settings`.
   - Default sector resolver.
   - Single-sector form behavior.
   - Sector tests voor customer/object/personnel/task code/assignment flows.

6. Sensitive tenant_id wave 1
   - `documents`, storage paths en signed URL guards.
   - `invoices`, `quotes`, `reports`.
   - Cross-tenant direct-ID tests.

7. Platform-admin productization
   - Tenant detail.
   - Module/sector/plan management.
   - Support access status and audit.

8. Provisioning wizard
   - Tenant creation service.
   - Owner invite.
   - Default modules/sectors/roles/settings.

9. Portals and branding
   - Host-first portal tenant resolution.
   - Tenant branding resolver.
   - Module guards for portal/PWA.

10. Fieldgrid deployment hardening
    - DNS/reverse proxy/TLS.
    - Supabase redirect URLs.
    - Smoke tests and rollback playbook.

## 7. Hard rules voor alle vervolgtaken

- Nooit tenantdata lezen of schrijven op alleen technische id.
- Host/subdomain-context wint van tenant switcher.
- Geen runtime fallback naar DEFAULT_TENANT_ID in productie.
- Module uit betekent server-side uit.
- Sectorbeperking is een harde businessregel, geen UI-filter.
- Veele is tenant; Fieldgrid is platform.
- Support access is expliciet, tijdelijk, tenant-scoped en geaudit.
- Nieuwe migraties moeten staging-data behouden en rollbackbaar zijn.
- Oude globale RBAC-tabellen mogen alleen templates/backfill zijn, niet runtime-autorisatie.
- Elke risicofase krijgt cross-tenant tests voordat staging wordt gepromoveerd.

## 8. MVP definitie

Fieldgrid SaaS MVP is klaar wanneer:

- Platform-admin tenants kan aanmaken en configureren zonder SQL.
- Tenant heeft domein/subdomain, plan, modules, sectoren en owner.
- Tenant kan active/suspended/archived worden.
- Modules zijn per tenant server-side afgedwongen.
- Sectoren zijn per tenant server-side en database-side afgedwongen waar mogelijk.
- Runtime RBAC gebruikt alleen tenantrollen.
- Klantportaal en personeelsapp zijn host-first tenant-aware.
- Gevoelige data heeft expliciete tenant_id of een bewust gedocumenteerde uitzondering.
- Storage is tenant-prefixed en getest.
- Support grants werken en worden geaudit.
- Starter/Professional/Enterprise bestaan in database en platform-admin.
- Fieldgrid draait op de beoogde VPS-domeinen met backup/rollbackproces.
- Cross-tenant security suite is groen.

## 9. Verplichte uitvoeringsbronnen

Vanaf de volgende technische PR zijn deze bronnen verplicht:

- `docs/fieldgrid-data-classification.md`: bepaalt tenantstrategie, prioriteit, migratienoodzaak en gevoelige restpunten.
- `docs/fieldgrid-cross-tenant-testmatrix.md`: bepaalt de test-id's die in PR-bodies, acceptatiecriteria en staging-promotie moeten worden genoemd.
- `docs/fieldgrid-recovery-execution-plan.md`: bewaart de recovery-guardrails die blijven gelden, vooral staging-data behoud en migratieveiligheid.

Elke vervolg-PR met tenant lifecycle, modules, sectoren, storage, finance, documenten, audit of portalen moet expliciet noemen welke classificatieregels en test-id's worden geraakt.
