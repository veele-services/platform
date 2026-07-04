# Fieldgrid fase 5 support break-glass en security dashboard

Datum: 3 juli 2026  
Status: uitgevoerd op branch `codex/phase-5-support-security-20260703`  
Scope: runtime-hardening, read-only platformdashboard en statische canonbewaking, zonder database- of migratiewijzigingen.

## Doel

Fase 5 maakt supporttoegang tijdelijker, beter toetsbaar en zichtbaarder. Nieuwe support grants worden behandeld als break-glass toegang: expliciet, tenant-scoped, kortdurend, voorzien van reden en auditcontext.

Daarnaast introduceert deze fase een eerste read-only platform securitydashboard voor platform-admins. Het dashboard gebruikt bestaande auditdata en verandert geen audit- of tenantdata.

## Uitgevoerd

- Centrale break-glass policy toegevoegd in `lib/db/src/platform-access.ts`:
  - `FIELDGRID_SUPPORT_BREAK_GLASS_GRANT_TYPE`;
  - `FIELDGRID_SUPPORT_BREAK_GLASS_MAX_TTL_MINUTES`;
  - `FIELDGRID_SUPPORT_BREAK_GLASS_MIN_REASON_LENGTH`;
  - `validateSupportBreakGlassGrant()`.
- Nieuwe support grants worden server-side gevalideerd:
  - tenant en platformgebruiker verplicht;
  - reden verplicht en minimaal betekenisvol;
  - start/einddatum geldig;
  - einddatum in de toekomst;
  - start voor eind;
  - maximaal 240 minuten TTL.
- Nieuwe support-grant auditmetadata bevat:
  - `grantType: break_glass`;
  - `ttlMinutes`;
  - `maxTtlMinutes`;
  - start/einddatum;
  - reden;
  - platformgebruiker.
- Support mode enter-audit bevat nu ook break-glass metadata en resterende TTL.
- Revoke-audit bevat het break-glass label.
- Read-only platform securitydashboard toegevoegd op `/platform/security`.
- Dashboardcategorieen:
  - support access events;
  - downloads/PDF/signed URL events waar gelogd;
  - denials zoals denied/expired/direct-ID/path guessing waar gelogd;
  - platform changes waar gelogd.
- Geen bestaande support grants aangepast; de max TTL geldt voor nieuwe grants.
- Geen schema, migratie, DDL, reset of stagingdatawijziging.

## Runtime-regel

Nieuwe supporttoegang volgt vanaf deze fase deze volgorde:

1. Platform-admin maakt een grant voor exact een tenant en platformgebruiker.
2. De server valideert reden, tijdvenster en maximale TTL.
3. De grant wordt geschreven.
4. De grant-aanmaak wordt geaudit met break-glass metadata.
5. Supportmodus mag alleen worden geopend met een actieve, niet-verlopen, niet-ingetrokken grant.
6. Enter, exit, access en denial-events blijven auditbaar via de bestaande support auditbasis.

## Securitygrenzen

Deze fase raakt de volgende testmatrix-items:

- `FG-SUPPORT-001`: actieve support grant werkt binnen tenant en tijdvenster.
- `FG-SUPPORT-002`: verlopen support grant faalt.
- `FG-SUPPORT-003`: verkeerde tenant faalt.
- `FG-SUPPORT-004`: supporttoegang wordt geaudit.
- `FG-SUPPORT-005`: te lange break-glass TTL faalt.
- `FG-SUPPORT-006`: reden is verplicht en voldoende specifiek.
- `FG-AUDIT-001`: platform-admin ziet support/security audit centraal.
- `FG-AUDIT-002`: tenant-admin krijgt geen platform-only securitydashboard.
- `FG-STORAGE-006`: download/signed URL events worden zichtbaar zodra ze auditregels schrijven.
- `FG-DIRECT-ID-002`: denial events worden zichtbaar zodra ze auditregels schrijven.

## Staging-impact

Deze fase is staging-veilig:

- geen migraties;
- geen data-backfill;
- geen bestaande support grants ingekort;
- geen auditdata verwijderd;
- alleen nieuwe grants worden strenger gevalideerd;
- securitydashboard is read-only.

Voor promotie naar staging:

- `pnpm test`;
- `pnpm run typecheck`;
- bestaande buildworkflow;
- handmatige smoke:
  - grant van maximaal 4 uur maken;
  - grant langer dan 4 uur moet falen;
  - supportmodus openen;
  - `/platform/security` openen als platform-admin;
  - normale tenantgebruiker mag platform/security niet openen.

## Niet in deze fase

- Nieuwe databasekolommen voor granttype of risk label.
- Migratie van bestaande grants naar nieuw granttype.
- Volledige tenant-admin auditview.
- Nieuwe audit-instrumentatie voor alle download/direct-ID/storage denials.
- Echte Playwright/integrationtests voor het dashboard.

Deze restpunten blijven gekoppeld aan latere test-, storage- en productiseringsfases.
