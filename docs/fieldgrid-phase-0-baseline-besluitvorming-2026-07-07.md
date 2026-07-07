# Fieldgrid fase 0 baseline en besluitvorming

Datum: 2026-07-07
Status: afgeronde baseline voor P0 security en tenant-isolatie vervolgwerk.
Scope: staging-status na merge, testtriage, migratievolgorde en P0/P1/P2 vervolgtickets.

## Samenvatting

Fase 0 heeft geen productcode gewijzigd. Het doel was om de rode status exact te maken voordat Fase 1 begint. De huidige teststatus is helder: 31 falende tests op 489 totaal. De failures vallen uiteen in echte P0 hardening, verouderde storage guardrail-tests, UI-contractdrift en docs/canon drift.

Belangrijkste conclusie:

- P0 codefixes: tenant-role permission lookup expliciet tenant-filteren en MFA-productiecopy/feature-flag afronden.
- P0/P1 testactualisatie: document-storage tests moeten worden bijgewerkt naar de huidige centrale tenant-storage helpers en audit-eventnamen.
- P1 product/code-contract: klant-finance hub mist nog contractueel verwachte invoice summary en pending quote count.
- P1/P2 canon/UI-contract: meerdere tests verwachten oude tekst, oude Tailwind-layoutmarkers, oude functienamen of oude migratiebestandsnamen.
- Migraties werken lexicografisch op bestandsnaam; de timestamp-migratie wordt wel meegenomen, maar dubbele prefixgroepen en de mix `001..101` plus `202606...` moeten bewaakt worden.

## Stagingstatus

Laatste gecontroleerde status:

- Lokale branch: `main`
- Werkboom: schoon
- `main` / `origin/main`: `bb5fd89 Improve Fieldgrid notification and email copy`
- `staging` / `origin/staging`: `e94f5dc Merge branch 'main' into staging`
- `staging` bevat daarmee de actuele `main` via mergecommit `e94f5dc`.

Controlecommando's:

```text
git status --short --branch
git fetch origin main staging
git log --oneline -5 --decorate main
git log --oneline -5 --decorate staging
```

## Testbaseline

Actuele brede test-run:

```text
node --test tests/*.test.mjs
# tests 489
# pass 458
# fail 31
# duration_ms 3201.3055
```

### Categorieen

| Categorie | Aantal | Betekenis |
| --- | ---: | --- |
| Security/auth | 3 | Echte P0 hardening of productiecopy die externe tenants niet mogen zien. |
| Storage/download guards | 8 | Meestal verouderde guardrail-tests rond nieuwe centrale tenant-storage helpers; auditcontracten moeten expliciet worden herijkt. |
| Product/UI-contract | 13 | Tests verwachten oude labels, oude component signatures, oude layoutmarkers of contractueel ontbrekende UI-informatie. |
| Docs/canon | 6 | Documentatie of sprintcanon mist termen/test-ID's die de test verwacht. |
| Migratiecontract | 1 | Test wijst naar oud migratiebestand of migratienummer; echte runner gebruikt actuele lexicografische volgorde. |

## Triage per falende test

| Nr | Test | Categorie | Signaal | Besluit | Prioriteit |
| ---: | --- | --- | --- | --- | --- |
| 65 | `phase 13 makes personnel messages read as an inbox` | UI-contract | Mist exacte grid marker `md:grid-cols-[minmax(0,1fr)_22rem]`. | Test actualiseren naar gedrags-/structuurcontract of UI bewust terugzetten na visuele check. | P2 |
| 84 | `phase 3 gates personnel MFA behind an explicit production feature flag` | Security/auth | `MfaSettings` bevat nog "nog niet beschikbaar" productiecopy. | Codefix: MFA-copy afronden of feature-flagged UI volledig verbergen voor productie/externe tenants. | P0 |
| 90 | `phase 4 adds a finance hub for invoices payments and quotes` | Product/UI-contract | Finance page mist `getMyInvoiceSummary` en `getMyPendingQuoteCount`, terwijl actions bestaan. | Codefix: finance hub aanvullen met invoice summary en quote count, of contract bewust herdefinieren. | P1 |
| 98 | `phase 6 migrates documents as low-risk reference page without changing data flow` | UI-contract | Test verwacht oude call `filterDocuments(documents, query, selectedType)`; code gebruikt object-parameter. | Test actualiseren naar huidige signature; geen security-regressie zichtbaar. | P2 |
| 122 | `document storage helper requires tenant-prefixed safe paths` | Storage/download guards | Test verwacht inline normalisatie; code gebruikt `getTenantBoundStoragePath`. | Test actualiseren naar centrale helpercontracten. | P0 |
| 123 | `document downloads sign only tenant-validated storage paths` | Storage/download guards | Test verwacht audit action `"download"`; code gebruikt `document_signed_url_issued`. | Test actualiseren of audit-event naming standaardiseren; inhoudelijk storagePath wordt gevalideerd. | P0 |
| 124 | `document deletes remove only tenant-validated storage paths` | Storage/download guards | Test verwacht audit action `"delete"`; code gebruikt `document_deleted`. | Test actualiseren of audit-event naming standaardiseren. | P0 |
| 125 | `document upload audit includes tenant context` | Storage/download guards | Test verwacht oude `buildStoragePath` en metadata-tenant; code gebruikt `buildDocumentStoragePath`, tenantId staat top-level op auditrow. | Test actualiseren naar huidige helper en top-level tenant-auditcontract. | P0 |
| 126 | `new document storage paths are prefixed by current tenant` | Storage/download guards | Test zoekt oude `buildStoragePath`; code gebruikt `buildDocumentStoragePath` + `buildTenantStoragePath`. | Test actualiseren naar centrale tenant-storage helper. | P0 |
| 128 | `document delete checks tenant membership before storage removal` | Storage/download guards | Test verwacht `hasUnsafeStoragePath(doc.storagePath)` en removal van `doc.storagePath`; code verwijdert gevalideerde `storagePath`. | Test actualiseren; huidige patroon is sterker mits centrale helper bewezen blijft. | P0 |
| 129 | `document download checks tenant membership before creating signed URL` | Storage/download guards | Zelfde drift als delete: test zoekt oude unsafe-path helper. | Test actualiseren naar `getSafeDocumentStoragePath`/`getTenantBoundStoragePath`. | P0 |
| 130 | `document download writes an audit log after signed URL creation` | Storage/download guards | Test verwacht audit action `"download"` en oude signed URL call. | Test actualiseren of audit-event naming standaardiseren; volgorde blijft belangrijk. | P0 |
| 154 | `phase 10 migration adds dashboard performance indexes only` | Migratiecontract | Test zoekt `065_material_inventory_dashboard_indexes.sql`; huidig bestand is `069_material_inventory_dashboard_indexes.sql`. | Test actualiseren naar actuele bestandsnaam; daarnaast migratienaming-guard toevoegen. | P1 |
| 160 | `phase 12 readiness plan is non-destructive and depends on phase 11` | Docs/canon | Validator faalt alleen op ontbrekende docterm `no staging reset`. | Docs aanvullen; geen codefix nodig. | P2 |
| 163 | `phase 12 documentation covers legacy, nullable columns, monitoring and rollout` | Docs/canon | Zelfde ontbrekende term `no staging reset`. | Docs aanvullen. | P2 |
| 180 | `phase 5 inventory routes and UI are wired` | UI-contract | Detail view mist label `Locatiegeschiedenis`; huidige UI toont locatie/status zonder die exacte kop. | UI-label herstellen of test actualiseren na productbesluit. | P2 |
| 191 | `phase 8 backoffice exposes issue status and maintenance followup` | UI-contract | Issue overview mist exact label `Open meldingen`; huidige UI gebruikt korter `Open`. | UI-label herstellen of test actualiseren naar huidige compacte copy. | P2 |
| 202 | `module entitlement docs are kept in the SaaS canon` | Docs/canon | SaaS canon mist exacte zin over `modules`, `tenant_modules` en `module_dependencies`. | Docs aanvullen zodat module-entitlement canon expliciet blijft. | P1 |
| 251 | `platform security dashboard is read-only and categorized` | UI-contract | Security page mist exacte labels `Support access events`, `Platform changes`, `Read-only overzicht`, `break-glass risk label`. | UI-copy/test contract herijken; security dashboard bestaat maar contracttaal is verschoven. | P1 |
| 277 | `phase 12 adds platform settings dashboard and audit requests` | UI-contract | Action mist exacte tekst `default branding`; code gebruikt `Default branding`. | Test case-insensitive maken of copy normaliseren. | P2 |
| 320 | `platform tenant actions support tenant admin CRUD and owner invite resend` | Product/UI-contract | Test verwacht `inviteUserByEmail`; code gebruikt eigen `inviteOwnerByEmail`/mailflow. | Besluiten of owner/admin invite via Supabase admin invite moet of huidige mailflow contract wordt. | P1 |
| 369 | `sprint 11 platform flow requires owner invite and exposes run status` | Product/UI-contract | Zelfde `inviteUserByEmail`-contractdrift in provisioning. | Zelfde besluit als test 320; owner invite contract centraliseren. | P1 |
| 380 | `sprint 14 tenant detail renders readiness, channel previews and limits` | UI-contract | Test verwacht helper `readinessStatusClass`; page rendert readiness direct met andere code. | Test actualiseren naar huidige readiness rendering of helper terugbrengen voor leesbaarheid. | P2 |
| 402 | `object form uses tenant region links` | UI-contract | Test verwacht verplichte prop `regionOptions: RegionOption[]`; code heeft optionele `regionOptions?: RegionOption[]`. | Test actualiseren of prop verplicht maken als productcontract. | P2 |
| 403 | `assignment form uses multi-region UI while preserving requiredRegion` | UI-contract | Zelfde optionele `regionOptions` signature drift. | Test actualiseren of prop verplicht maken. | P2 |
| 416 | `Sprint 4 docs bind RBAC and support work to canonical test IDs` | Docs/canon | RBAC matrix mist `support_access_audit_log`. | Docs aanvullen; security-audit canon expliciet houden. | P1 |
| 422 | `Sprint 5 platform tenant actions cover lifecycle, domains, plans, modules and sectors` | Product/UI-contract | Test verwacht `type: "subdomain"`; codecontract gebruikt huidige tenant-domain flow. | Controleren of subdomain type nog canon is; codefix als domeintype ontbreekt, anders test actualiseren. | P1 |
| 425 | `tenant detail page exposes the platform-admin MVP sections` | UI-contract | Test verwacht `listSupportAccessAuditLog`; tenantdetail gebruikt andere audit/readiness structuur. | Test actualiseren of auditlog-call expliciet terugbrengen als tenantdetail contract. | P1 |
| 447 | `Sprint 7 contract maps finance/report work to canonical test IDs` | Docs/canon | Sprint 7 doc mist `write-time tenant consistency triggers`. | Docs aanvullen. | P1 |
| 486 | `backoffice permissions resolves permissions by user and tenant` | Security/auth | Permission query filtert op tenant_user_roles tenant, maar niet expliciet op tenant_role_permissions tenant. | Codefix: `eq(tenantRolePermissionsTable.tenantId, tenantId)` toevoegen. | P0 |
| 487 | `api auth middleware resolves permissions by user and tenant` | Security/auth | Zelfde ontbrekende expliciete tenant-filter in API middleware. | Codefix: `eq(tenantRolePermissionsTable.tenantId, tenantId)` toevoegen. | P0 |

## Vervolgtickets

### P0

1. Tenant-permission hardening
   - Voeg expliciete `tenantRolePermissionsTable.tenantId = tenantId` toe in backoffice permissions en API auth middleware.
   - Verifieer met `node --test tests/tenant-permissions.test.mjs`.

2. MFA productiegedrag
   - Verwijder onafgemaakte MFA-copy uit productiepad of verberg MFA volledig achter `NEXT_PUBLIC_ENABLE_PERSONNEL_MFA === "true"`.
   - Verifieer met `node --test tests/fieldgrid-customer-personnel-phase3-security.test.mjs`.

3. Document-storage guardrails herijken
   - Actualiseer tests naar `buildDocumentStoragePath`, `buildTenantStoragePath` en `getTenantBoundStoragePath`.
   - Beslis audit-event naming: huidige specifieke events (`document_uploaded`, `document_signed_url_issued`, `document_deleted`) behouden of generieke action labels herstellen.
   - Verifieer met document-storage suites en daarna storage/download staging smoke.

### P1

1. Klant-finance hub contract
   - Voeg invoice summary en pending quote count toe aan de finance hub of pas het contract bewust aan.

2. Platform owner/admin invite contract
   - Centraliseer de invite-keuze: Supabase `inviteUserByEmail` of eigen mailflow.
   - Werk provisioning- en tenant-admin tests daarna consistent bij.

3. Platform tenant/detail/security contracten
   - Herijk labels en calls rond securitydashboard, tenantdetail audit/readiness en domeintype `subdomain`.

4. Docs/canon herstel
   - Vul module-entitlement canon, RBAC support auditlog en Sprint 7 finance trigger-documentatie aan.

5. Migratienaming guard
   - Voeg een check toe die dubbele prefixen en mixed timestamp/numeric naming expliciet rapporteert.

### P2

1. UI-contract drift
   - Personnel messages grid marker, inventory labels, region form prop signatures en readiness helper herijken.

2. Material readiness docs
   - Voeg ontbrekende `no staging reset` term toe aan productie-readiness doc.

3. Test-suite onderhoud
   - Splits statische tests in duidelijke lagen: security guards, storage guards, UI contract, docs/canon en migration contract.

## Migratievolgorde-analyse

De SQL-runner leest `lib/db/migrations` met:

```text
/^\d+.*\.sql$/u
.sort((left, right) => left.name.localeCompare(right.name))
```

Gevolgen:

- `20260618201212_assignment_monthly_codes.sql` wordt meegenomen, omdat de naam met cijfers begint.
- De timestamp-migratie draait lexicografisch na `101_fieldgrid_notification_content_v1.sql`.
- De runner bewaart toegepaste handgeschreven SQL in `drizzle.veele_sql_migrations` met naam en hash.
- Hash mismatch op een eerder toegepaste migratie faalt hard.

Actuele telling:

- SQL-migraties die matchen: 95
- Eerste SQL-migratie: `001_rbac_rls.sql`
- Laatste SQL-migratie: `20260618201212_assignment_monthly_codes.sql`

Dubbele prefixgroepen:

- `055`: `055_tenant_domains.sql`, `055_tenant_rbac_backfill.sql`, `055_tenant_roles.sql`, `055_tenant_scoped_rbac.sql`
- `061`: `061_documents_tenant_storage.sql`, `061_plan_entitlements.sql`, `061_tenant_sector_policy.sql`
- `062`: `062_finance_reports_tenant_scope.sql`, `062_post_migration_tenant_hardening.sql`
- `063`: `063_assignment_media_news_storage.sql`, `063_payments_batches_audit_tenant_scope.sql`
- `064`: `064_assignment_storage_policy_guards.sql`, `064_material_inventory_document_notifications.sql`, `064_tenant_regions.sql`, `064_tenant_task_codes_prices.sql`
- `065`: `065_enable_all_tenant_modules_by_default.sql`, `065_portal_branding_defaults.sql`
- `066`: `066_material_inventory_foundation.sql`, `066_tenant_provisioning_onboarding.sql`

Besluit:

- Geen bestaande migratie hernoemen zonder expliciete staging/production history-strategie, omdat de runner op naam en hash registreert.
- Wel een nieuwe guardrail toevoegen die duplicate prefixes en mixed naming rapporteert voordat nieuwe migraties worden toegevoegd.
- Nieuwe handgeschreven migraties vanaf nu bij voorkeur numeriek vervolgen (`102_...`) of eerst een formeel migratienaming-besluit nemen.

## Definition of done fase 0

- Stagingstatus is vastgelegd.
- De 31 rode tests zijn per test gecategoriseerd.
- Per rode test is gekozen tussen codefix, testactualisatie of docs/canon actualisatie.
- P0/P1/P2 vervolgtickets zijn expliciet.
- Migratievolgorde en naming-risico's zijn gedocumenteerd.
