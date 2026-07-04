# Fieldgrid Sprint 10 - Audit en security dashboard 2.0

Datum: 2026-07-04
Status: `geleverd` voor centraal auditcontract, security dashboard 2.0, support break-glass controls, audit-export en gecombineerde support/tenant/platform auditfeed. Echte Tenant A/B/Veele integration- en Playwright-smokes blijven promotiebewijs.

Gerelateerd: `docs/fieldgrid-saas-proof-sprint-plan.md`, `docs/fieldgrid-data-classification.md`, `docs/fieldgrid-cross-tenant-testmatrix.md`, `docs/fieldgrid-phase-5-support-security.md`.

## Doel

Sprint 10 maakt gevoelige security-events centraal zichtbaar zonder stagingdata te wijzigen. Het dashboard combineert `support_access_audit_log` en `audit_log`, zodat support access, downloads, PDF's, denials en platform-admin acties op een plek gefilterd kunnen worden.

## Geleverd

- `lib/db/src/platform-access.ts` bevat het canonical security-auditcontract:
  - `support_access`;
  - `download`;
  - `pdf`;
  - `direct_id_denial`;
  - `module_denial`;
  - `storage_denial`;
  - `platform_admin`.
- `listPlatformSecurityDashboard()` normaliseert events uit:
  - `support_access_audit_log` voor support scope;
  - `audit_log` voor tenant en platform scope.
- Het securitydashboard ondersteunt filters voor:
  - tenant;
  - actor;
  - eventtype;
  - resource;
  - datum;
  - severity;
  - support grant;
  - platform/support/tenant scope.
- Security dashboard 2.0 toont mobiel bruikbare eventcards, denial-breakdown, actieve support grants en support access-log.
- Audit-export is beschikbaar als CSV op basis van dezelfde filters.
- Support break-glass vereist reden, tenant-scope en geldige expiry, schrijft denied grantpogingen naar audit en toont revoke-acties centraal.
- Platform-only audit blijft zichtbaar via platform scope en vereist platform-admin toegang.
- Tenant-audit blijft tenant-scoped via `audit_log.tenant_id`.
- Support break-glass max TTL en verplichte reden blijven afgedwongen via de fase-5 policy.

## Auditcontract

Nieuwe of aangepaste gevoelige acties moeten auditdata schrijven volgens dit contract:

| Eventtype | Bron | Minimale context |
| --- | --- | --- |
| `support_access` | `support_access_audit_log` | tenant, platform user, grant, reden |
| `download` | `audit_log` | tenant, actor, resource, resource-id |
| `pdf` | `audit_log` | tenant, actor, resource, resource-id |
| `direct_id_denial` | `audit_log` | tenant waar bekend, actor, resource, resource-id |
| `module_denial` | `audit_log` | tenant, actor, module/resource |
| `storage_denial` | `audit_log` | tenant, actor, storage/resource context |
| `tenant_mismatch` | `audit_log` | tenant waar bekend, actor, resource, resource-id |
| `platform_access_denial` | `audit_log` | actor, platform resource, platform-only `tenant_id = NULL` |
| `platform_admin` | `audit_log` | actor, platform resource, platform-only `tenant_id = NULL` waar geen tenantcontext bestaat |

## Securitygrenzen

- Te lange break-glass TTL faalt via `validateSupportBreakGlassGrant()`.
- Break-glass zonder reden, expiry of tenant-scope faalt en wordt als `grant_create_denied` geaudit waar tenant en platformgebruiker bekend zijn.
- Verlopen of ingetrokken support grants vallen buiten runtime-access via `expires_at > now` en `revoked_at IS NULL`.
- Downloads en denials zijn dashboardbaar zodra ze in `audit_log` of `support_access_audit_log` staan.
- Tenant-admin ziet geen platform-only audit omdat `/platform/security` alleen via `requirePlatformAdmin()` loopt.
- Platform-admin kan filteren op tenant, actor, eventtype, resource, datum, severity, support grant en scope.

## Test-id koppeling

- `FG-SUPPORT-001`
- `FG-SUPPORT-002`
- `FG-SUPPORT-003`
- `FG-SUPPORT-004`
- `FG-SUPPORT-005`
- `FG-SUPPORT-006`
- `FG-AUDIT-001`
- `FG-AUDIT-002`
- `FG-AUDIT-003`
- `FG-AUDIT-004`
- `FG-AUDIT-005`
- `FG-OPS-005`

## Niet in deze sprint

- Geen nieuwe auditkolommen of migratie.
- Geen mutating dashboardchecks.
- Geen volledige tenant-admin auditviewer.
- Geen echte storage/path-guessing provider-test.
- Geen Playwright test; dat blijft acceptatiebewijs voor latere runtime-proof/promotie.
