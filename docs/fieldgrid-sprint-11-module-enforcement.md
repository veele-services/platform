# Fieldgrid sprint 11 - module enforcement harmonisatie

Datum: 2026-07-04
Status: geleverd als runtime-brede moduleguard harmonisatie, zonder schema- of migratiewijzigingen.

## Doel

Sprint 11 trekt modulegedrag gelijk tussen API, backoffice, portalen en achtergrondjobs. RBAC blijft noodzakelijk, maar kan een uitgeschakelde module niet overrulen. Een module-off tenant moet dus server-side worden geweigerd, ook wanneer iemand een directe URL, server action, API-route of jobpad raakt.

## Geleverde onderdelen

- Centrale permission-resource mapping blijft `FIELDGRID_PERMISSION_MODULES` in `lib/db/src/module-permissions.ts`.
- API `requirePermission` controleert na tenant-RBAC altijd `requireTenantModule` voor gemapte resources.
- Backoffice gebruikt `getCurrentEffectiveUserPermissions`, `hasPermission` en `requirePermission` zodat navigatie, directe URL-data en server actions dezelfde modulegrens volgen.
- Customer portal identity gebruikt `requireCurrentCustomerPortalTenantId` en blokkeert wanneer `customer_portal` uit staat.
- Personnel portal identity gebruikt `requireCurrentPersonnelPortalTenantId`; assignment actions krijgen alleen tenantcontext na de `personnel_portal` guard.
- Finance achtergrondjobs gebruiken `requireJobTenantModule`, tellen `moduleDisabled` en slaan tenants zonder `finance` over.
- Platform-admin tenantdetail toont module dependency inspectie:
  - `missingDependencyKeys` voor aanzetten;
  - `enabledDependentKeys` voor uitzetten;
  - toggles worden uitgeschakeld wanneer de dependency-status al blokkeert.

## Module-off contract

| Pad | Contract |
| --- | --- |
| UI | `getCurrentEffectiveUserPermissions` filtert permissions op actieve modules voordat providers en tellers renderen. |
| Directe URL | Server components/actions blijven op `hasPermission` of `requirePermission` leunen; die helpers controleren modules server-side. |
| Server action | Gevoelige backoffice acties gebruiken `requirePermission` of `requireCurrentTenantModule`. |
| API | `requirePermission(resource, action)` draait tenant-RBAC en daarna `requireTenantModule`. |
| Portalen | Portal tenant identity bestaat alleen als de portalmodule actief is. |
| Jobs | Admin jobs gebruiken `requireJobTenantModule` en verwerken geen tenant zonder benodigde module. |

## Test-id dekking

| Test-id | Betekenis | Sprint 11 status |
| --- | --- | --- |
| `FG-MODULE-001` | Module enabled happy path. | Mapping en guards laten enabled modules door na RBAC. |
| `FG-MODULE-002` | Module disabled UI. | Effectieve permissions filteren navigatie en tellers. |
| `FG-MODULE-003` | Module disabled direct URL. | Server-side permissionhelpers blokkeren los van UI. |
| `FG-MODULE-004` | Module disabled server action. | `requirePermission` en `requireCurrentTenantModule` blijven verplicht. |
| `FG-MODULE-005` | Backoffice/API gebruiken dezelfde mapping. | `FIELDGRID_PERMISSION_MODULES` is de gedeelde bron. |
| `FG-MODULE-006` | Module dependency. | Platform-admin toont dependency inspectie en disabled toggles. |
| `FG-MODULE-007` | Background job. | Finance jobs gebruiken `requireJobTenantModule`. |
| `FG-MODULE-008` | Plan module seed. | Bestaande plan/default/override bron blijft zichtbaar in modulekaart. |

## Staging-impact

Deze sprint is staging-veilig:

- geen DDL;
- geen nieuwe migratie;
- geen backfill;
- geen dataverwijdering;
- alleen guardgedrag, visualisatie en statische canonbewaking.

## Resterend

- Playwright module-off tests met echte sessies.
- Integration tests met Tenant A/B/Veele fixtures voor API, server actions en jobs.
- Auditregels voor elke module-denial op alle entrypoints.
