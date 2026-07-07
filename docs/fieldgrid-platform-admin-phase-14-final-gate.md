# Fieldgrid platform-admin fase 14 - Acceptatie en release gate

Datum: 2026-07-05
Branch: `codex/platform-admin-final-gate-v1`
Status: uitvoerbaar release-gate contract

## Doel

Fase 14 verklaart platform-admin pas releasewaardig wanneer alle P0/P1 platformbeheerpunten done zijn of expliciet als `post-launch accepted` zijn vastgelegd met owner, bewijsdoel en go/no-go moment.

Deze fase voegt geen migratie en geen tenantmutaties toe. Het contract is read-only en bundelt de bestaande platform-admin smokes, runtimebewijzen en UI-screenshots in een vaste go/no-go checklist.

## Uitvoerbare commands

```text
pnpm fieldgrid:platform-admin-final-gate:check
pnpm fieldgrid:platform-admin-final-gate --json
pnpm fieldgrid:platform-admin-final-gate:strict
```

Minimum releasecommands:

```text
pnpm run typecheck && pnpm -r --if-present run build
pnpm fieldgrid:platform-phase13-visual-smoke
pnpm fieldgrid:sprint15-staging-smoke:run-read-only
pnpm fieldgrid:sprint7-migration-smoke --run --target all
```

`fieldgrid:platform-admin-final-gate:check` valideert het contract en de bronkoppelingen. `fieldgrid:platform-admin-final-gate:strict` verwacht echte JSON-artifacts in:

```text
artifacts/platform-admin-final-gate
artifacts/platform-mobile-polish
artifacts/staging-smoke
artifacts/migration-smoke
```

## Go/no-go checklist

| ID | Gate | Owner | Host/route | Bewijs | Releasecriterium |
| --- | --- | --- | --- | --- | --- |
| `FG-PA-GATE-ROLES` | Runtime tests voor platform owner/admin/support | Platform engineering | `admin.fieldgrid.nl` `/platform`, `/platform/security`, `/platform/users` | Playwright screenshots/traces per rol | Owner/admin hebben platformrechten; support ziet alleen toegestane delen; tenant user blijft geweigerd. |
| `FG-PA-GATE-HOST-FIRST` | field-demo pilot host-first checks | Platform engineering | `field-demo.fieldgrid.nl` met `/`, `/klant`, `/personeel` | Browser traces en wrong-host denial artifact | Host bepaalt tenantcontext en directe tenant-id routes lekken niet. |
| `FG-PA-GATE-ENTERPRISE-CUSTOM-DOMAIN` | Enterprise custom-domain staging test | Platform engineering | Enterprise custom domain `/admin` | DNS/TLS check artifact en screenshot | Verified/active Enterprise domein routeert naar juiste tenant. |
| `FG-PA-GATE-NON-ENTERPRISE-DENIAL` | Non-Enterprise custom-domain denial | Platform engineering | `/platform/tenants/:tenantId?tab=domains` | Denial screenshot en audit-event | Starter/Professional custom-domain mutatie faalt server-side. |
| `FG-PA-GATE-CADDY-ASK` | Caddy ask endpoint staging test | Platform engineering | `/internal/caddy/ask-domain` | Statusmatrix | Alleen verified/active Enterprise custom domains krijgen `200`; pending, disabled, non-Enterprise en onbekend krijgen `403`. |
| `FG-PA-GATE-LIFECYCLE` | Tenant lifecycle smoke | Platform engineering | `/platform/tenants/:tenantId` | Mutating smoke met cleanup en audit | Suspend/reactivate/archive/retry werkt op `field-demo` en wordt teruggedraaid. |
| `FG-PA-GATE-SUBSCRIPTION-DOWNGRADE` | Subscription downgrade smoke | Platform engineering | `/platform/subscriptions` | Subscription artifact en audit | Downgrade schakelt Enterprise-only custom domains naar `disabled_plan` en herstel is mogelijk. |
| `FG-PA-GATE-TICKETS` | Ticket lifecycle smoke | Support operations | `/platform/tickets` | Ticketdetail screenshot en audit | Create, note, status/SLA update en close werken met platform scope. |
| `FG-PA-GATE-NOTIFICATIONS` | Meldingen smoke | Support operations | `/platform/notifications` | Recipient preview, dispatch history en audit | Ontvangers komen uit platformdata en er is geen cross-tenant lek. |
| `FG-PA-GATE-AUDIT-EXPORT` | Audit export smoke | Platform engineering | `/api/platform/security/export` | CSV artifact | Export respecteert filters en bevat expected headers zonder cross-tenant data. |
| `FG-PA-GATE-MOBILE-SCREENSHOTS` | Mobile screenshots | Platform engineering | kernroutes platform-admin | `phase13-visual-smoke.json` en screenshots | 390px, 768px en 1440px zijn zonder horizontale overflow of overlap. |
| `FG-PA-GATE-BUILD-TYPECHECK` | Build en typecheck volledig groen | Platform engineering | CI workspace | CI logs | Typecheck en build draaien groen op Node 24 met schone install. |

## Open uitzonderingen

Deze uitzonderingen mogen alleen als `post-launch accepted` blijven bestaan met expliciete go/no-go approval.

| ID | Severity | Owner | Geaccepteerd tot | Doelbewijs |
| --- | --- | --- | --- | --- |
| `FG-PA-EXCEPTION-RUNTIME-ARTIFACTS` | P0 | Platform engineering | Voor promotie van `main` naar staging en voor eerste productie-tenant | `artifacts/platform-admin-final-gate` met role, host-first, lifecycle, subscription en domain smoke JSON. |
| `FG-PA-EXCEPTION-MOBILE-ARTIFACTS` | P1 | Platform engineering | Voor releasecandidate markering | `artifacts/platform-mobile-polish/phase13-visual-smoke.json` plus screenshots. |

## Platform-admin dashboard

`/platform/staging-smoke` toont nu naast de bestaande externe tenant gate ook de Fase 14 platform-admin release gate:

- alle twaalf gatepunten;
- status en eigenaar per punt;
- required commands;
- open uitzonderingen;
- rapportmap `artifacts/platform-admin-final-gate`.

De JSON API `/api/platform/staging-smoke` bevat hetzelfde veld als `platformAdminReleaseGate`, zodat release automation en UI dezelfde bron gebruiken.

## Releasebeslissing

Een release is `ready` wanneer alle gatepunten groen zijn.

Een release is `conditional-go` wanneer er geen blokkerende punten zijn, maar handmatig stagingbewijs nog aan het releaseformulier moet worden gekoppeld.

Een release is `blocked` wanneer een blokkerend gatepunt faalt of wanneer strict evidence ontbreekt vlak voor promotie.

## Rollback

Deze fase heeft geen databasewijzigingen en geen runtime-mutaties. Rollback bestaat uit het verwijderen van:

- `scripts/fieldgrid-platform-admin-final-gate.mjs`;
- `docs/fieldgrid-platform-admin-phase-14-final-gate.md`;
- de `platformAdminReleaseGate` UI/data-uitbreiding;
- de package scripts;
- de fase-14 test.
