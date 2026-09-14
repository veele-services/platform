# Staging: toegang van de bestaande owner tot andere tenants behouden

Datum: 14 september 2026. Bron: `main` op
`244a342ab9bbaa89b26bf896e79114daf99f398e` (PR #502).

## Besluit en scope

De gebruiker heeft expliciet bevestigd dat de bestaande `field-demo`-owner
toegang tot de andere tenant moet behouden. De stagingdiagnose geeft twee
lidmaatschappen, één oude globale rol en drie tenantrolkoppelingen; Auth en de
canonieke Managementrol binnen `field-demo` voldoen, met 96 overeenkomende
rechten. Deze aantallen zijn diagnosebewijs, geen toestemming om rollen of
lidmaatschappen te verwijderen.

De gedeelde alleen-lezen deploycontrole accepteert geldige lidmaatschappen en
rollen in meerdere tenants. Elke rolkoppeling moet naar een bestaande rol én
lidmaatschap binnen dezelfde tenant verwijzen. De canonieke Managementrol blijft
verplicht en moet exact met haar template overeenkomen. Aanvullende rollen in
`field-demo` mogen samen geen rechten buiten dat template toevoegen. Rechten in
andere tenants blijven buiten die vergelijking en worden niet aangepast.

De ownercontrole zelf wijzigt geen Auth, sessies, lidmaatschappen, rollen, RLS,
schema, dependency of product-UI. Het vaste herstelaccount wordt niet
verplaatst. Bootstrap van een werkelijk ontbrekende fixture houdt de bestaande
exclusieve controles, naast de exacte owner-ID en reserveringsbewijzen.
Na bevestiging dat de bestaande globale rol `Management` is, heeft de gebruiker
ook de afzonderlijke autorisatiecorrectie toegestaan, inclusief live toepassing
na de vereiste gates. Die forward-only migratie en operationele begrenzing staan
in [het autorisatierunbook](staging-tenant-management-authorization.md).

## Oude globale rollen: afzonderlijke veiligheidsgrens

Oude `user_roles` zijn geen bewijs van tenantgebonden Management. Verweesde
koppelingen blijven geblokkeerd. De globale rolnaam `Management` blijft
geblokkeerd zolang het nieuwe tenantgebonden databasecontract niet exact is
bewezen, ook zonder systeemvlag of rechtenrecords.
Andere bestaande, correct gerefereerde legacykoppelingen blijven behouden.

Dit is bewust geen algemene versoepeling van de globale rollencontrole:

- `20260718190000_phase2_security_reconciliation.sql` definieert
  `is_management_for_tenant` op basis van globale Management plus een actief
  lidmaatschap, zonder controle van de onafhankelijk toegekende tenantrol.
- De oude direct op `user_roles` gebaseerde policy
  `assignment_material_usage_backoffice_all` uit
  `044_personnel_offline_queue.sql` werd expliciet verwijderd door
  `20260714120000_assignment_personnel_phase_b_direct_access_close.sql`.
  De lokale gemigreerde PostgreSQL-database bevestigt dat deze policy ontbreekt.
  De andere drie historische rolnamen zijn daarom geen actuele blokkade.
- De backoffice haalt rollen en rechten daarentegen per tenant op in
  `artifacts/backoffice/src/lib/auth/permissions.ts`.

De gebruiker heeft inmiddels één correct gerefereerde globale `Management`-rol
bevestigd. De deploy blijft geblokkeerd totdat het afzonderlijk beoordeelde
herstel de bedoelde toegang aantoonbaar behoudt en het nieuwe databasecontract
daadwerkelijk is geïnstalleerd.
Er wordt geen rol verwijderd of databasepolicy versoepeld als automatische
fallback. De bestaande vaste-account-repair blijft buiten deze scope.

## Verificatie en acceptatie

De echte PostgreSQL-regressies draaien via
`tests/fieldgrid-realtime-projection-migration.test.mjs` tegen de lokale,
wegwerpbare PostgreSQL 17-database. Geen featuretest benadert staging.
Ze bewijzen onder meer:

- behoud van twee lidmaatschappen, één niet-bevoorrechte legacyrol en drie
  tenantrollen bij herhaalde domein- en proof-controle;
- aanvullende rollen met overlappende of lege rechten, en onafhankelijke
  rechten in de andere tenant;
- weigering van verweesde of verkeerd gescopeerde rollen, extra effectieve
  rechten, verwisselde rechten bij gelijkblijvende aantallen en ontbrekende
  canonieke rechten die via een aanvullende rol worden aangevuld;
- weigering van globale Management vóór het nieuwe databasecontract en behoud van de bestaande
  Auth-, platform- en dubbele/inactieve-ownercontroles;
- strikte bootstrapweigering van elk toegelaten extra bestaand lidmaatschap,
  extra rol of legacykoppeling;
- ongewijzigde Auth-identiteiten, lidmaatschappen, legacyrollen, tenantrollen
  en hun rechten na de read-only controle.

De volledige build en exacte PR-headchecks blijven verplicht. De lokale schijf
heeft minder dan 400 MiB vrije ruimte; eerdere volledige builds strandden op
`ENOSPC`. Andere gebruikersbestanden worden niet verwijderd. Volledige builds
worden daarom door de bestaande schone GitHub-CI bewezen. Er zijn geen
UI-wijzigingen; dashboard- en visuele contractchecks vervangen geen ingelogde
stagingacceptatie.

Lokale resultaten: drie opeenvolgende volledige runs van elk 78 PostgreSQL-tests,
40 gerichte TypeScript-domeintests en 24 security/source-tests geslaagd, zonder
skips. Volledige workspace-typecheck,
de twee afzonderlijke staging-script-typechecks, scriptcontracten,
runtime-entrypointinventaris, testlagen en migratievolgorde zijn groen.
Dashboardaudit en visuele contractcheck hebben geen statische fouten; de
ingelogde screenshotacceptatie blijft expliciet stagingwerk.

Logs staan in `/tmp/fieldgrid-owner-multitenant-{unit,source,typecheck,dashboard,visual}.log`.
De drie geslaagde databaseruns staan in
`/tmp/fieldgrid-owner-multitenant-pg17-final-{1,2,3}.log`.
Een voorafgaande parallelle run had één fout in de bestaande
platform-owner-continuity-concurrencytest: verwachte serialisatieafwijzing
`40001` met te laat gekoppelde promise-afhandeling. De fout herhaalde zich ook
zonder gelijktijdige andere testcommando's. De test koppelt nu meteen een
afwijzingsobserver aan beide wachtende querypromises, vóór COMMIT de blokkade
opheft. De oorspronkelijke promises, `assert.rejects` op exact `40001`, de
databaseblokkadecontrole en alle invarianten blijven intact. Geen test is
uitgeschakeld of versoepeld; de drie volledige herhalingen slagen.
Het eerste foutbewijs blijft bewaard in
`/tmp/fieldgrid-owner-multitenant-pg17-concurrency-1235.log`.

Zelfreview en afzonderlijke read-only subagentreview van de oorspronkelijke
multi-tenantcontrole vonden geen open P0/P1. De autorisatie-uitbreiding krijgt
eigen verificatie en review, vastgelegd in het afzonderlijke runbook.
De aanvullende opmerkingen over snapshots van rolrechten en een ontbrekend
canoniek recht dat een extra rol probeert aan te vullen, zijn beide verwerkt.
De review toetste ook de volledige migratieketen: de historische viernamenpolicy
is verwijderd, terwijl de resterende globale Managementwerking met echte SQL
is bewezen. Alleen statische bronanalyse zou die afbakening onvoldoende staven.

Na review en merge: eerst de afzonderlijke autorisatiediagnose en -migratie,
dan domeindiagnose op exact main opnieuw uitvoeren. Alleen bij
een geldige eigenaar mogen de bestaande domeinherstel-, proof-, backup-,
promotie- en deploygates uit de activation-runbook volgen. Geen gate wordt
overgeslagen. Rollback van deze code is een nieuwe gereviewde commit vanaf main
en herpromotie; er zijn geen accountmutaties terug te draaien.
