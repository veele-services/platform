# Fieldgrid RBAC permission matrix

Datum: 2026-07-03  
Status: canon voor Sprint 4 - RBAC en support runtime-prioriteit.  
Gerelateerd: `docs/fieldgrid-saas-masterplan.md`, `docs/fieldgrid-cross-tenant-testmatrix.md`, `docs/fieldgrid-data-classification.md`.

## Vaste regels

Runtime-autorisatie gebruikt deze prioriteit:

1. `platform-admin` voor platformroutes.
2. `active-support-grant` voor expliciete supportmodus op de platformhost.
3. `tenant-role` voor normale tenantwerking.

Belangrijk:

- Globale `roles` en `role_permissions` zijn templates voor seed/backfill en nieuwe tenants.
- Globale roles geven geen runtime-rechten.
- Runtime tenantrechten komen uit `tenant_user_roles` en `tenant_role_permissions`.
- Support access is geen tenantrol en schrijft auditregels met grant, tenant, reden en permissioncontext.
- Supportmodus is expliciet, tijdelijk en tenant-bound.
- Supportmodus mag de host-first tenantresolver niet overrulen op tenanthosts.
- Module-entitlements blijven na RBAC/support gelden; een permissie is nooit genoeg als de module uit staat.

## Productrollen

| Rol | Scope | Runtimebron | Doel |
| --- | --- | --- | --- |
| Platform owner | platform | `platform_users.role = owner` | Platformbeheer en recovery-noodbeheer. |
| Platform admin | platform | `platform_users.role = admin` | Platformbeheer zonder owner-only toekomstige acties. |
| Platform support | platform/support | `platform_users.role = support` + actieve grant | Tijdelijke supportmodus voor een tenant. |
| Tenant owner | tenant | `tenant_roles` | Tenantbeheer, rollen, instellingen, volledige operatie. |
| Tenant admin | tenant | `tenant_roles` | Beheer en operatie zonder platformrechten. |
| Planner | tenant | `tenant_roles` | Planning, opdrachten en operationele context. |
| Employee | tenant | `tenant_roles` | Beperkte backoffice acties. |
| Customer user | tenant/customer | `customer_users` + portal guards | Klantportaal, eigen klantcontext. |
| Personnel user | tenant/personnel | `personnel.user_id` + portal guards | Personeelsapp, eigen personeelscontext. |

## Tenantrollen matrix

Dit is de productmatrix voor de eerste SaaS-hardeningfase. Concrete tenants kunnen custom rollen hebben, maar custom rollen moeten dezelfde runtimebron gebruiken.

| Resource | Owner | Admin | Planner | Employee | Supportmodus |
| --- | --- | --- | --- | --- | --- |
| `dashboard` | read | read | read | read | read |
| `customers` | read/create/update/delete | read/create/update | read | read | read |
| `objects` | read/create/update/delete | read/create/update | read | read | read |
| `personnel` | read/create/update/delete | read/create/update | read | read | read |
| `assignments` | read/create/update/delete | read/create/update/delete | read/create/update | read | read |
| `planning` | read/create/update | read/create/update | read/create/update | read | read |
| `reports` | read/create/update/delete | read/create/update | read/update | read | read |
| `documents` | read/create/update/delete | read/create/update/delete | read | read | read |
| `invoices` | read/create/update/delete | read/create/update | read | none | read |
| `quotes` | read/create/update/delete | read/create/update | read | none | read |
| `payments` | read/update | read/update | none | none | read |
| `tickets` | read/create/update/delete | read/create/update | read/update | read | read |
| `news` | read/create/update/delete | read/create/update | read | read | read |
| `settings` | read/update | read/update | none | none | read |
| `task_codes` | read/create/update/delete | read/create/update | read | none | read |

Supportmodus is bewust read-first. Schrijfacties via support blijven uit scope tot het platform-admin/supportbeheer in Sprint 5 expliciet productrechten en auditflows krijgt. Supportacties schrijven naar `support_access_audit_log`, zodat elke supportovername, permissiecontrole en beëindiging tenantgebonden bewijs houdt.

## Supportmodus contract

Een supportgebruiker krijgt tenantcontext alleen als alle voorwaarden kloppen:

- de gebruiker is een actieve `platform_users` rij met role `owner`, `admin` of `support`;
- er bestaat een actieve `support_access_grants` rij voor exact die tenant en platformgebruiker;
- `starts_at <= now < expires_at`;
- `revoked_at IS NULL`;
- de supportmodus is gestart vanaf de platformhost;
- de support cookie `fieldgrid_support_tenant_id` wijst naar dezelfde tenant;
- de gevraagde permission staat in `FIELDGRID_SUPPORT_RUNTIME_PERMISSION_KEYS`;
- de module bij de permission staat aan voor de tenant.

De auditregel bevat minimaal:

- `tenant_id`;
- `platform_user_id`;
- `grant_id` waar bekend;
- `action` zoals `support_mode_entered`, `backoffice_permission_allowed` of `api_permission_allowed`;
- `resource` en optioneel `resource_id`;
- metadata met permission, prioriteit, reden en eindtijd.

## Testkoppeling

| Test-id | Bewijs |
| --- | --- |
| `FG-RBAC-001` | Tenant A admin krijgt rechten via tenantrol. |
| `FG-RBAC-002` | Dezelfde gebruiker kan in Tenant B minder rechten hebben. |
| `FG-RBAC-003` | Globale role templates geven geen runtime-rechten. |
| `FG-RBAC-004` | Custom roles blijven Professional+. |
| `FG-RBAC-005` | Tenantroltoewijzing wijzigt alleen de gekozen tenant. |
| `FG-SUPPORT-001` | Support zonder grant krijgt geen tenantcontext. |
| `FG-SUPPORT-002` | Actieve grant opent supportmodus en audit. |
| `FG-SUPPORT-003` | Verlopen grant werkt niet. |
| `FG-SUPPORT-004` | Grant voor Tenant A werkt niet op Tenant B. |
| `FG-SUPPORT-005` | Supporttoegang schrijft auditcontext. |
| `FG-SUPPORT-006` | Support grant werkt zonder gewone tenantrol, maar alleen via supportpad. |

## Nog te bewijzen met echte integration tests

Deze sprint legt de runtimepaden en statische bewaking neer. Voor SaaS-acceptatie blijven echte integration/Playwright/DB-tests verplicht voor:

- dezelfde user met verschillende tenantrollen in `demo-a` en `demo-b`;
- support user zonder tenantrol maar met actieve grant;
- verlopen en verkeerde-tenant grants;
- globale role template zonder tenantrol;
- support auditregels in de database;
- host-first denial op tenanthosts.
