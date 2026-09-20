# Staging: tenantgebonden Management met behoud van toegang

## Aanleiding en goedgekeurde scope

Op 14 september 2026 bevestigde de gebruiker dat de bestaande `field-demo`-owner
twee tenantlidmaatschappen, drie tenantrolkoppelingen en één geldige globale
legacyrol `Management` heeft. Toegang tot de andere tenant moet behouden blijven.
De gebruiker heeft de gedeelde autorisatiecorrectie en live wijzigingen
toegestaan. Dat heft bronreview, CI, migratie- en staginggates niet op.

De oude `public.is_management_for_tenant(uuid)` gebruikt globale Management plus
een actief tenantlidmaatschap. Alleen de globale rol verwijderen kan daardoor
bestaande databasetoegang wegnemen. De backoffice bepaalt rechten al met rollen
binnen de gekozen tenant. Deze correctie brengt de databasecontrole daarmee in
lijn zonder account- of rolgegevens te wijzigen.

## Bewezen policy-identities en herstelcontract

De read-only stagingrun `35472119062` op main
`e048738e98f2c3fbdc6bf13d0fe7facd7c2b8025` bevestigde deze drie identities:

| Policy | Historische bron | Afgebakende wijziging |
| --- | --- | --- |
| `object_contacts_management_all` | `migrations/023_objects_extended.sql` | Verwijder het oude globale ALL-pad; behoud bestaande tenant-, klant- en runtimepolicies. |
| `object_personnel_management_all` | dezelfde bron | Verwijder het globale ALL-pad. Begrens ook de overlappende `object_personnel_management`: object én personeel moeten dezelfde tenant hebben. |
| `owner_or_staff_read_payments` | `migrations/013_sprint5_payments.sql` | Authenticated SELECT via de gekoppelde factuur binnen dezelfde tenant; behoud factuurmaker en canonieke tenantmanager. |

Identities bewijzen geen definities. Vóór apply vergelijkt de diagnose intern de
volledige brongebonden policysets, afhankelijkheden en helpercontracten. Alleen
booleans verlaten de database; live policy-SQL en rijen worden niet geëxporteerd.
De historische `service_role_all_payments` hoort verplicht bij de legacyset en
blijft daar ongewijzigd. Een schone installatie krijgt die policy niet alsnog.
Geen rechten, accounts, lidmaatschappen, rollen, permissions of bedrijfsrijen
worden toegevoegd of gewijzigd.

De volledige live diagnose `35477379077` op main
`2f8e316c47e97f9c1254cc4ab0d2c359a8b7aef1` gaf vervolgens `unknown-state`:
geen van de drie policysets paste, beide readinessvlaggen waren onwaar en
`legacy_pairs=preserved_pairs=2`, `missing_pairs=0`. Er is geen apply uitgevoerd.
`dependenciesValid=false` bewijst hier niet afzonderlijk een helperafwijking:
die vlag vereist ook een passende policyset. De samenvattende policyvergelijking
vereist bovendien PostgreSQL 17. Een groene diagnoseworkflow betekent daarom
niet dat reparatie is toegestaan.

Bij `unknown-state` voegt dezelfde diagnose nu `driftDiagnostic` toe, vóór
ROLLBACK en binnen dezelfde REPEATABLE READ READ ONLY-snapshot. Deze bevat
afzonderlijke context-, policy-, relatie/kolom- en helpervergelijkingen met de
gevalideerde bronmanifesten. Live expressies, function bodies, ACL-waarden en
bedrijfsrijen verlaten de database niet. Onverwachte policy-identities blijven
begrensd tot tien, met strikte identifiercontrole; overschrijding blokkeert de
diagnose in plaats van een afgekapt rapport op te leveren.

Ook wanneer het journal de scope- of repairmigratie al registreert, geeft een
geldige maar afwijkende catalogus bij `diagnose` een `unknown-state` met deze
details. `catalogChecks` toont afzonderlijk de bestaande scopecontract-,
scopecatalogus- en repaircataloguscontrole. De journalvlaggen behouden hun
werkelijke waarden; `contractVerified` en beide readinessvlaggen blijven
onwaar. `apply` weigert diezelfde afwijking nog steeds met `catalog_invalid`,
vóór migratie-SQL of journalwrites. Ongeldige history, niet-booleaanse of
tegenstrijdige vergelijkingsresultaten en databasefouten blijven harde fouten,
ook bij diagnose.

De historische bron `migrations/015_pwa_rls_policies.sql` bevat daarnaast
`personnel_update_own_phone`, die in de oorspronkelijke manifesten ontbreekt.
De detaildiagnose vergelijkt deze concrete brondefinitie en de volledige set
met die ene toevoeging afzonderlijk. Dit is uitsluitend een brongebonden
hypothesetoets, geen live bevestiging en geen nieuw toegestaan applyprofiel.
De bestaande migratiebestanden, readinessvoorwaarden en volledige
policysetvergelijking blijven ongewijzigd. Een afwijking vereist eerst bewezen
bronreconstructie en een afzonderlijke forward-only correctie.

De manifesten zijn gereconstrueerd uit vertrouwde SQL in een lokale PostgreSQL
17-database. Vergelijking gebruikt `pg_get_expr(..., false)` met `pg_catalog`
als search_path, exact commandtype, rollen, permissiviteit, NULL-semantiek en
alle policies op de betrokken tabellen. Afhankelijkheden omvatten kolomtypen,
RLS/FORCE RLS en helperbody, signature, eigenaar, security mode, search_path,
directe en effectieve EXECUTE-rechten. Geen whitespace-normalisatie van bodies
of expressies. Providerfuncties gebruiken een expliciet gepinde officiële bron;
de lokale Auth-shim is een afzonderlijk exact profiel.

## Migratievolgorde en ondersteunde toestanden

Nieuwe forward-only migratie:
`20260919220633_repair_tenant_management_policy_consumers.sql`.
De twee bestaande migraties blijven byte-inhoudelijk ongewijzigd:

- `20260914125400_reconcile_legacy_global_rbac_policies.sql`, SHA-256
  `421fde7810185af215b46b733bcf09878c78812a6a151850bb52536ddcc7ba5c`.
- `20260914125503_scope_tenant_management_authorization.sql`, SHA-256
  `23b1aa33b626a114694a748e3e2d391ea02460071c865d2b20df2ec582df9902`.

Een gewone schone migratie voert de chronologische volgorde uit. Op de bewezen
stagingfrontier voert de begrensde runner binnen één transactie eerst de nieuwe
prerequisite uit, daarna de oude reconciliatie, daarna tenant-scope. Iedere fase
moet opnieuw haar echte precondities bewijzen. Pas na de eindcontrole worden
alle drie journalrecords in chronologische volgorde geschreven en gecommit.
Dit is één expliciete suffix; geen algemene herordening of force-runner.

| Toestand | Toegestaan gedrag |
| --- | --- |
| `legacy-state` | Exacte volledige historische set, oude helper, beide oude migraties pending: prerequisite, reconciliatie en scope atomair. |
| `clean-state` | Schone bronset met beide oude migraties al exact geregistreerd: alleen nieuwe reparatie. Schone pre-scope is geen begrensd stagingpad. |
| `repaired-state` | Exacte doelpolicies, oude helper en beide oude migraties pending: verifieer idempotente prerequisite en voer beide fasen uit. |
| `canonical-state` | Doelpolicies, canonical helper en alle drie exacte journalrecords: read-only eindcontrole; geen herstel van later ingetrokken tenantrechten. |
| `unknown-state` | Afwijkende, gedeeltelijk ontbrekende of extra policies/helpers/history: blokkeren vóór mutatie. |

De gedeelde migration-advisory-lock, journallock en negen bestaande
autorisatielocks blijven verplicht. Daarna worden in vaste volgorde invoices,
object_contacts/object_personnel, objects, payments en personnel vergrendeld.
READ COMMITTED beoordeelt toegang ná de locks; iedere bestaande legacyrelatie
moet al onafhankelijk canonieke tenantrechten hebben (`missing_pairs = 0`,
`preserved_pairs = legacy_pairs`). Dit kopieert geen globale rechten naar tenants.
Lock- en statement-timeouts blijven actief. De private canonical helper ontstaat
pas in de ongewijzigde scope-migratie.

## Uitvoeren via de begrensde stagingworkflow

Workflow: `.github/workflows/fieldgrid-staging-tenant-management-authorization.yml`.
Gebruik uitsluitend de exacte gereviewde main-SHA met geslaagde Main Exact Head
Validation. De bestaande stagingomgeving, concurrencygroep `veele-staging`,
migratieverbinding, projectbinding en gepinde TLS blijven vereist.

1. Dispatch met `operation=diagnose`, `expected_main_sha=<exact-main-SHA>` en
   `confirmation=fieldgrid-staging-tenant-management-authorization-v1`.
2. Vereis bron/history-validatie en een exact ondersteunde toestand.
   `repairReadiness.dependenciesValid` moet waar zijn. Bij legacy moet
   `legacyDefinitionMatches` waar zijn en `readyForPrerequisiteRepair` waar.
   `readyForApply` blijft dan terecht onwaar: de tenant-scopefase is nog geblokkeerd.
3. Dispatch dezelfde workflow met `operation=apply` en dezelfde SHA/bevestiging.
   Deze samengestelde operatie voert uitsluitend de afgebakende prerequisite
   uit voordat de scopefase haar eigen readiness opnieuw beoordeelt. Een
   onwaar scope-resultaat wordt nooit geforceerd.
4. Dispatch opnieuw `diagnose`. Vereis `canonical-state`,
   `contractVerified=true`, beide migrationRecorded-vlaggen waar en exacte
   targetdefinitie. Oude legacy-precondities zijn na scope bewust onwaar en
   worden niet meer als postcheck gebruikt.
5. Controleer bestaande owner-/domeingates en behoud van beide tenants. Volg
   daarna managed proof, W00/ACL, backup/restore-preflight, promotie, deploy en
   ingelogde acceptatie uit `docs/website-module-enterprise-activation.md`.

De owner-, proof- en historische replaycontroles gebruiken hetzelfde volledige
canonical contract, inclusief nieuwe policies en journal; een functienaam of
scope-journalrecord alleen volstaat niet. Onbekende globale policy-, functie-
en view/rule-consumers blijven geblokkeerd, inclusief
`assignment_material_usage_backoffice_all`.

Bij een fout vóór COMMIT worden alle metadata en journalrecords teruggedraaid.
`commit_uncertain` of cleanupfouten worden nooit blind opnieuw toegepast. De
workflow voert na een mislukte apply een nieuwe, toestandbewuste read-only
controle uit via een nieuwe verbinding. Alleen bewezen canonical history én
catalogus bewijzen dat commit is gelukt; anders blijft verdere promotie gestopt.
Andere vaste foutcategorieën omvatten `source_invalid`, `history_invalid`,
`repair_not_ready`, `repair_failed`, `scope_not_ready`, `scope_failed`,
`access_preservation_failed`, `catalog_invalid` en `lock_unavailable`.

Artifacts bevatten alleen SHA, operatie, vaste statuscategorieën, booleans en
geaggregeerde tellingen. Geen ruwe driverdetails, definities of persoonsgegevens.
Bewaartermijn: één dag. Applicatierollback heropent geen globale autorisatie;
een noodzakelijke databasecorrectie vereist een nieuwe forward-only migratie.

## Verificatie en resterende releasegates

Reconstructie: `scripts/fieldgrid-reconstruct-tenant-management-policy-contract.mts`
verwerkt uitsluitend de lokale synthetische database op `127.0.0.1:55436`.
`--write` maakt de bronmanifestbundle; `--check` vereist identieke bytes.
Alle lokale DDL en providerprofielen worden teruggedraaid. De gepinde upstream
Auth-fixture behoudt bewust originele bytes, inclusief trailing spaces.

De nieuwe runtimesuite is geregistreerd in
`tests/fieldgrid-realtime-projection-migration.test.mjs` en draait daardoor echt
in de PostgreSQL 17-lane van Main Exact Head Validation. De 53 gerichte tests
zijn lokaal geslaagd, waaronder:

- Werkelijke historische blocker, schone installatie, repaired/canonical state,
  herhaling en ontbrekende/afwijkende policies, helpers en journalrecords.
- Volledige inhoudshashes vóór/na; behoud van accounts, rechten en bedrijfsdata.
- Authenticated contacts-CRUD binnen de juiste tenant; beide ownertenants,
  scoped-only manager, gewone leden, niet-leden, globale-rol-only, platform,
  NULL-identiteit en afwijkende/inactieve rechten.
- Afzonderlijke RLS-semantiekproef voor personnel/payment met uitsluitend
  lokale, teruggedraaide simulatietabelrechten. Dit bewijst de predicates;
  het is geen bewijs dat die browserrechten werkelijk in staging bestaan.
  De echte schone tabel-ACL-weigeringen blijven afzonderlijk getoetst.
- Echte tweede verbindingen voor policy-DDL, membership-/permissionwrites,
  locktimeouts en het lezen van intrekking ná verkrijging van de locks.
- Fouten na alle drie migratiefasen, vóór en na ieder journalrecord en vóór
  COMMIT; volledige rollback. Werkelijke commit met verloren bevestiging,
  gevolgd door canonical diagnose via een nieuwe verbinding, zonder retry.

Gerichte bewijslogs: `/tmp/fieldgrid-policy-repair-runtime.log`,
`/tmp/fieldgrid-policy-repair-full-smoke.log`,
`/tmp/fieldgrid-repair-{unit-domain,all-security,typecheck,build,contract-static,dashboard,visual}.log`.
De definitieve PR koppelt deze resultaten en de overige vereiste CI-lanes aan
haar exacte commit en workflow-run. Bron-/statische visualchecks vervangen geen
ingelogde stagingacceptatie. De uiteindelijke main-mergecommit moet opnieuw
alle authoritative gates doorlopen voordat live apply is toegestaan.

## Herstel en risico

Vóór COMMIT wordt elke fout volledig teruggedraaid, inclusief de private functie
en het journalrecord. Na COMMIT zijn er geen accountmutaties terug te draaien.
De publieke helpersignatuur blijft beschikbaar voor de vorige applicatierelease.
Bij een onverwachte runtime-regressie: promotie stoppen, bewijs bewaren en een
nieuwe beoordeelde forward-only correctie maken. Niet de bestaande migratie
wijzigen en niet stilzwijgend de globale bevoegdheid herstellen.

De wijziging raakt gedeelde databasebeveiliging. Vooral rolprovenance,
rechtenpariteit, uitsluiting van platformidentiteiten en concurrente wijzigingen
moeten onafhankelijk worden beoordeeld voordat live toepassing mag plaatsvinden.
