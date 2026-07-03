# Fieldgrid Sprint 4 - RBAC en support runtime-prioriteit

Datum: 2026-07-03  
Status: uitgevoerd op branch `codex/sprint-4-rbac-support-20260703`.  
Canon: `docs/fieldgrid-rbac-permission-matrix.md`.

## Doel

Tenantrollen, support grants en platformrollen vormen vanaf deze sprint een helder autorisatiemodel:

1. platform-admin voor platformroutes;
2. actieve support grant voor expliciete supportmodus;
3. tenantrol voor normale tenantwerking.

## Scope uitgevoerd

- Definitieve RBAC permissiematrix toegevoegd in `docs/fieldgrid-rbac-permission-matrix.md`.
- Gedeelde support access helper toegevoegd in `lib/db/src/platform-access.ts`.
- API tenantcontext accepteert supportmodus alleen via platformhost + expliciete tenant + actieve grant.
- API `requirePermission()` behandelt support grants voor de tenantrolcheck en audit supporttoegang.
- Backoffice tenantcontext leest expliciete supportmodus via `fieldgrid_support_tenant_id` op de platformhost.
- Backoffice `hasPermission()` en `requirePermission()` gebruiken supportmodus als aparte runtimebron.
- Support runtime permissions zijn read-first via `FIELDGRID_SUPPORT_RUNTIME_PERMISSION_KEYS`.
- Platformpagina toont voor support users alleen eigen grants en kan supportmodus openen.
- Dashboardlayout toont een supportbanner met tenant, TTL, reden, grant en prioriteit.
- Supportmodus kan expliciet worden gestopt.

## Bewuste grenzen

- Geen schema- of migratiewijzigingen.
- Geen volledige platform-admin support UI; dat blijft Sprint 5.
- Geen write-permissions voor supportmodus buiten toekomstige expliciete productkeuzes.
- Geen normale tenant-host override: supportmodus werkt via platformhost en actieve grant.
- Geen globale role runtimepad toegevoegd of hersteld.

## Acceptatie en test-id's

Sprint 4 raakt deze canonieke test-id's:

- `FG-RBAC-001`
- `FG-RBAC-002`
- `FG-RBAC-003`
- `FG-RBAC-004`
- `FG-RBAC-005`
- `FG-SUPPORT-001`
- `FG-SUPPORT-002`
- `FG-SUPPORT-003`
- `FG-SUPPORT-004`
- `FG-SUPPORT-005`
- `FG-SUPPORT-006`

Statische bewaking: `tests/fieldgrid-sprint-4-rbac-support.test.mjs`.

Echte runtime-bewijsvoering blijft verplicht voordat deze grenzen als SaaS-acceptatie mogen tellen:

- integration test met `MULTI-A-B` en verschillende tenantrollen;
- support user zonder tenantrol maar met actieve grant;
- support user zonder grant;
- verlopen support grant;
- verkeerde-tenant grant;
- auditregels in `support_access_audit_log`.

## Implementatiecontract

- `getUserPermissions(userId, tenantId)` blijft tenant-RBAC only en leest geen globale `roles`.
- `tenant_user_roles.tenant_role_id` en `tenant_role_permissions.tenant_role_id` blijven leidend.
- Support grants staan los van tenantrollen.
- Supportmodus is alleen actief als `getCurrentSupportMode()` een actieve grant vindt.
- Backoffice supportacties schrijven `support_access_audit_log`.
- API supporttoegang gebruikt `writeSupportAccessAuditLogForUser()`.
- Module-entitlements blijven na RBAC/support actief.

## Volgende sprint

Sprint 5 bouwt platform-admin MVP beheer:

- tenant detail;
- lifecycle-acties;
- domeinbeheer;
- module/plan/sector beheer;
- support grants UI met create/revoke/audit;
- basis usage-overzicht.
