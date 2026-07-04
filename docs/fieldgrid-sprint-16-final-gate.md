# Fieldgrid Sprint 16 - Final hardening en externe tenant gate

Datum: 2026-07-04
Status: geimplementeerd als final-gate contract met `post-launch-accepted` register.
Scope: performance review, service-role security review, final staging-copy smoke, eerste externe tenant checklist en expliciete post-launch beslissingen.

## Doel

Sprint 16 sluit de SaaS-proof reeks af zonder staging te resetten of tenantdata te muteren. De sprint maakt zichtbaar wat direct klaar is, wat nog runtimebewijs nodig heeft en welke punten alleen met expliciete go/no-go naar post-launch mogen.

## Geleverd

- `scripts/fieldgrid-sprint16-final-gate.mjs` valideert het final-gate contract.
- `pnpm fieldgrid:sprint16-final-gate:check` controleert de post-launch status, service-role scan en gate-eisen.
- `/platform/staging-smoke` toont een read-only sectie `Finale externe tenant gate`.
- Canonbronnen gebruiken nu `post-launch-accepted` voor bewust geaccepteerde restpunten.
- De eerste externe tenant checklist is bijgewerkt met final-gate en post-launch owner-besluiten.

## Veiligheidscontract

- Geen migratie.
- Geen databasewrites.
- Geen tenantmutaties.
- Geen drop, reset of rebuild van stagingdata.
- Staging-copy smoke draait uitsluitend tegen een herstelde copy of lege smoke database.
- Mutating checks blijven beperkt tot dedicated demo-tenants met marker-scoped cleanup.

## Gate-eisen

| Gate | Command of bewijs | Status |
| --- | --- | --- |
| Performance review op tenantqueries | EXPLAIN ANALYZE voor tenantlijst, direct-ID, dashboardstatistieken, planning en storage/download queries | `post-launch-accepted` met verplicht artifact |
| Security review op service-role gebruik | `pnpm fieldgrid:sprint16-final-gate:check` scant `SUPABASE_SERVICE_ROLE_KEY` gebruik | `post-launch-accepted` met server-only eis |
| Final staging-copy smoke | `pnpm fieldgrid:sprint7-migration-smoke --run --target all` | `post-launch-accepted` tot artifact bestaat |
| Runtime proof, storage proof en portal acceptance | Sprint 5, 6, 7 en 15 checks plus live artifacts | `post-launch-accepted` |
| Eerste externe tenant checklist | `docs/fieldgrid-first-external-tenant-checklist.md` | verplicht go/no-go formulier |

## Post-launch accepted register

Alle open P0/P1 punten hebben een eigenaar, test-id's en een bewijsdoel:

- `FG-POST-RUNTIME-E2E`: host/RBAC/lifecycle runtime E2E bewijs.
- `FG-POST-STORAGE-PROOF`: Supabase Storage policy en fysieke backfill proof.
- `FG-POST-PORTAL-ACCEPTANCE`: klantportaal en personeelsapp live acceptance.
- `FG-POST-MIGRATION-SMOKE`: lege database en staging-copy migration smoke artifacts.
- `FG-POST-AUDIT-CENTRALIZATION`: security/audit centralisatie en denial events.
- `FG-POST-MATERIAL-INVENTORY`: materialen en inventaris als aparte roadmap na SaaS proof.

`P0` en `P1` uitzonderingen vereisen expliciete go/no-go approval voordat ze externe tenantdata mogen raken.

## Supabase changelog

Supabase changelog gecontroleerd op 2026-07-04 via `https://supabase.com/changelog.md`.

Relevante conclusies:

- Postgres 14 support eindigde op 2026-07-01; staging/productie major versie blijft final-gate check.
- Nieuwe public tabellen worden niet automatisch blootgesteld aan Data/GraphQL API; Sprint 16 voegt geen tabellen toe, maar toekomstige SQL moet grants plus RLS expliciet maken.
- `pg_graphql` introspection en self-hosted wijzigingen hebben geen directe Sprint 16 code-impact zolang Fieldgrid niet op publieke GraphQL introspection of self-hosted auth URL wijzigingen leunt.
- `log_connections` wordt niet langer standaard aangezet; operationeel bewijs mag daar niet als enige observabilitybron op vertrouwen.

## Runtimebewijs dat nog artifact nodig heeft

- Live Playwright host/portal smoke tegen staging.
- Supabase Storage path-guessing en policy/RLS proof.
- DB/RLS tenantdenials met Tenant A/B/Veele fixtures.
- Final empty-database en staging-copy migration smoke JSON.
- Performance EXPLAIN artifacts voor tenantquery hotspots.

Deze punten zijn niet meer ongestructureerd open; ze staan in het `post-launch-accepted` register met owner en bewijsdoel.

## Rollback

Deze sprint is read-only. Rollback:

- verwijder het sprint 16 script en package scripts;
- verwijder de final-gate dashboardsectie;
- verwijder deze sprintdoc en de canonverwijzingen.

Er is geen database rollback nodig.
