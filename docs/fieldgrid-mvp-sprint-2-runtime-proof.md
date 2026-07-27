# Fieldgrid MVP Sprint 2 - Runtime Proof

Datum: 2026-07-08
Status: runtime gate geleverd; strict live evidence nog niet volledig groen.
Gerelateerd: `docs/fieldgrid-sprint-1-geen-ruis-meer-evidence-2026-07-07.md`, `docs/fieldgrid-sprint-15-staging-smoke.md`, `docs/fieldgrid-sprint-7-migration-smoke.md`, `docs/fieldgrid-first-external-tenant-checklist.md`.

## Doel

MVP Sprint 2 bewijst dat Fieldgrid niet alleen statisch groen is, maar dat staging als multi-tenant runtime aantoonbaar werkt. De pilottenant is:

| Veld             | Waarde                                             |
| ---------------- | -------------------------------------------------- |
| Slug             | `field-demo`                                       |
| Host             | `field-demo.staging.fieldgrid.nl`                  |
| Owner e-mail     | `services@fieldgrid.nl`                            |
| Plan             | Enterprise                                         |
| Modules          | all                                                |
| Mutating confirm | `FIELDGRID_MUTATING_SMOKE_CONFIRM=field-demo-only` |

## Definition of done

- Staging smoke-resultaten zijn vastgelegd of blokkeren met owner en command.
- Migration smoke is bewezen voor `empty-database` en `staging-copy`.
- Login, host-first routing, tenant-isolatie, storage/downloads, platform-admin en portals hebben live evidence of een expliciete no-go eigenaar.
- Notificatie/e-mail end-to-end is per tenant bewezen met template, override, dispatch en logging, of blokkeert met owner.
- Geen runtimepunt blijft vaag rood: ieder open punt heeft een `FG-MVP2-*` gate-id.

## Uitgevoerd

| Onderdeel                    | Status        | Evidence                                                                                  | Owner / actie                                                                 |
| ---------------------------- | ------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Migration smoke empty DB     | Groen gemeld  | GitHub Actions run: https://github.com/veele-services/platform/actions/runs/28902141188   | Bewaar artifact bij releaseformulier.                                         |
| Migration smoke staging-copy | Groen gemeld  | Zelfde run; staging-copy was groen na herstel van `set_updated_at()` compatibility        | Bewaar artifact bij releaseformulier.                                         |
| Read-only staging smoke API  | Geblokkeerd   | Nieuwe lokale poging met aangeleverde cookie gaf opnieuw HTTP 401 `Authenticatie vereist` | Platform operations levert verse `FIELDGRID_STAGING_SMOKE_COOKIE` of bearer.  |
| Login en host-first routing  | Evidence open | Contracten groen; live API-snapshot mist auth                                             | Platform engineering draait Playwright/API smoke met platform-owner.          |
| Tenant-isolatie              | Evidence open | Sprint 5/6 contracten groen; live direct-ID/wrong-host artifact ontbreekt                 | Platform engineering koppelt live denial evidence.                            |
| Storage/download audit       | Evidence open | Lokale storage/download guards groen; live signed URL + audit artifact ontbreekt          | Platform engineering draait document/PDF download smoke.                      |
| Customer/personnel portals   | Evidence open | Customer/personnel releasegate bestaat; portal cookies/storage-state ontbreken            | Portal engineering draait strict final gate.                                  |
| Notificatie/e-mail sandbox   | Evidence open | Template, override, provider en dispatch tests groen; live sandbox dispatch ontbreekt     | Support operations / Platform engineering draait interne field-demo dispatch. |
| Platform-admin               | Evidence open | Final gate contract groen; live owner/admin/support artifact ontbreekt                    | Platform engineering draait platform-admin final gate strict.                 |

## Nieuwe gate

Sprint 2 voegt een read-only gate toe:

```bash
pnpm fieldgrid:mvp-sprint2-runtime-proof:check
```

Strict runtime evidence:

```bash
pnpm fieldgrid:mvp-sprint2-runtime-proof:strict
```

De gewone check valideert het contract, de owners, de commands en de koppeling naar bestaande runtime runners. De strict mode blokkeert totdat alle `FG-MVP2-*` punten `ok` zijn.

Handmatige evidence kan tijdelijk aan de gate worden gekoppeld met status- en URL-variabelen, bijvoorbeeld:

```bash
FIELDGRID_MVP_SPRINT2_MIGRATION_SMOKE_STATUS=pass
FIELDGRID_MVP_SPRINT2_MIGRATION_SMOKE_URL=https://github.com/veele-services/platform/actions/runs/28902141188
```

## Gate ids

| Gate-id                       | Betekenis                                | Command / evidence                                                                         |
| ----------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| `FG-MVP2-MIGRATIONS`          | Empty DB en staging-copy migration smoke | `pnpm fieldgrid:sprint7-migration-smoke --run --target all`                                |
| `FG-MVP2-STAGING-SMOKE`       | Read-only staging smoke dashboard        | `pnpm fieldgrid:sprint15-staging-smoke:run-read-only`                                      |
| `FG-MVP2-LOGIN-HOST`          | Login en host-first routing              | Playwright smoke voor `staging.fieldgrid.nl/platform` en `field-demo.staging.fieldgrid.nl` |
| `FG-MVP2-TENANT-ISOLATION`    | Tenant isolatie en direct-ID denial      | Sprint 5 contract plus live wrong-host/direct-ID proof                                     |
| `FG-MVP2-STORAGE-DOWNLOAD`    | Document-storage/download audit          | Live signed URL success, denial en auditregel                                              |
| `FG-MVP2-PORTALS`             | Customer/personnel portal acceptance     | `pnpm fieldgrid:customer-personnel-final-gate:strict`                                      |
| `FG-MVP2-NOTIFICATIONS-EMAIL` | Notificatie/e-mail end-to-end sandbox    | Template render, tenant override, dispatch history, delivery log en audit                  |
| `FG-MVP2-PLATFORM-ADMIN`      | Platform-admin owner/admin/support smoke | `pnpm fieldgrid:platform-admin-final-gate:strict`                                          |

## Go/no-go

No-go voor een externe tenant zolang strict Sprint 2 niet groen is of de platform owner het restpunt expliciet accepteert in het eerste-tenant formulier.

Voor de volgende poging zijn minimaal nodig:

1. Verse platform-admin staging auth voor `FIELDGRID_STAGING_SMOKE_COOKIE` of bearer.
2. Customer/personnel portal cookies of storage-state voor `field-demo`.
3. Notification/e-mail sandbox afspraak: alleen interne ontvangers en herstel van tijdelijke overrides.
4. Runtime artifact-URL's koppelen aan de gate of JSON artifacts bewaren onder de bestaande artifactdirectories.
