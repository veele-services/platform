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

## Migratie en veiligheidsgrenzen

Nieuwe forward-only reparatiemigratie:
`20260914125400_reconcile_legacy_global_rbac_policies.sql`, gevolgd door de
ongewijzigde scope-migratie `20260914125503_scope_tenant_management_authorization.sql`.
Geen bestaande migratie is gewijzigd. Geen productieafhankelijkheid toegevoegd.

- De eerste migratie herstelt uitsluitend de drie bekende oude globale
  `user_roles`-policy-consumers naar de bestaande platformbevoegdheid
  `global.rbac.manage`. Onbekende consumers blokkeren; accounts, rollen,
  lidmaatschappen en toepassingsdata worden niet gewijzigd.

- Publieke helpersignatuur blijft gelijk. De functie gebruikt uitsluitend
  `auth.uid()` en de opgegeven tenant.
- De nieuwe private, alleen door de vertrouwde eigenaar bereikbare predicate
  vereist een actief lidmaatschap, een ingeschakelde tenant met ondersteunde
  status en een canonieke Managementrol met exacte, niet-lege templaterechten.
  Een gelijknamige aangepaste rol, vreemd-tenantrol of globale rol is geen bewijs.
- Platformidentiteiten zijn geen tenant-managementprincipal. De bestaande
  afzonderlijke platformautorisatie wordt niet veranderd.
- Alleen de publieke wrapper heeft `SECURITY DEFINER`; beide functies hebben een
  vast `search_path`. De private functie krijgt geen uitvoerrecht voor PUBLIC,
  anon, authenticated of service_role. De wrapper blijft authenticated-only.
- Schrijfbarrières op alle negen betrokken autorisatietabellen voorkomen dat
  de behoudcontrole op tussentijds veranderende rechten berust. De operatie
  gebruikt READ COMMITTED en beoordeelt de gegevens ná het verkrijgen van locks.
  De migratie zelf weigert andere isolatieniveaus vóór het verkrijgen van locks,
  ook als de gewone migratierunner een afwijkende sessiestandaard heeft.
- Elk bestaand actief legacy-beheerpaar moet al een geldige tenantgebonden
  Managementrol hebben. Ontbreekt er één, dan wordt de hele migratietransactie
  afgebroken. Er worden geen rollen automatisch toegevoegd of verwijderd.
- Geldige scoped-only managers worden voortaan ook op databaseniveau toegelaten;
  dat is de bedoelde correctie. Een gewoon lid krijgt geen beheerrechten door
  de achtergebleven globale rol.
- De oude helper zonder tenantparameter blijft bestaan, maar mag geen policy-,
  view/rule- of functieconsumer hebben. Onverwachte globale consumers blokkeren.

Auth, sessies, uitnodigingen, lidmaatschappen, rolkoppelingen, rechtenrecords,
domeinen, websitebindings en bedrijfsgegevens blijven ongewijzigd. Geen UI-impact.

## Uitvoeren via de begrensde stagingworkflow

Workflow: `.github/workflows/fieldgrid-staging-tenant-management-authorization.yml`.
Geen rechtstreekse stagingdatabaseverbinding vanuit featurewerk. Geen Supabase
Auth API of service-role key nodig. De workflow gebruikt de bestaande staging-
migratieverbinding, projectbinding en gepinde TLS-controle.

1. Laat de volledige wijziging beoordelen en alle checks op de exacte PR-head
   slagen. Merge via de normale bescherming, niet rechtstreeks op main/staging.
2. Voer op exact main `diagnose` uit met bevestiging
   `fieldgrid-staging-tenant-management-authorization-v1`.
3. Controleer de geheime-vrije tellingen: `legacy_pairs`, `preserved_pairs`,
   `missing_pairs`, `scoped_pairs`. `missing_pairs = 0` en
   `preserved_pairs = legacy_pairs` zijn noodzakelijk maar niet voldoende:
   vereis daarnaast echte policy-/history-readiness. Bij
   `unknown_policy_consumer` of `readyForApply=false` blijft apply geblokkeerd;
   volg eerst [de policy-identiteitsroute](staging-tenant-management-policy-identity-diagnostic.md).
   Bij ontbrekende dekking: geen automatische beheertoekenning; eerst
   de bedoelde rolverdeling bepalen. De aantallen zijn geen toestemming voor
   het uitbreiden van rollen van andere accounts.
4. `apply` verifieert exact main en succesvolle Main Exact Head Validation,
   gebruikt de gedeelde migratielock en accepteert alleen deze twee direct
   opeenvolgende, exact gehashte migraties. Alle voorgangers moeten al exact en
   in volgorde zijn geregistreerd. Geen historische hashreconciliatie of
   ongerelateerde migratie wordt uitgevoerd.
5. SQL en journalrecord worden samen gecommit, na behoudcontrole en exacte
   cataloguscontrole. Herhaling wijzigt niets en controleert het geïnstalleerde
   contract opnieuw. Legitieme latere intrekking van een tenantrol is geen reden
   om de oude globale bevoegdheid terug te brengen.
6. Controleer een nieuwe read-only diagnose en de bestaande owner-/domeingate.
   Daarna pas domeinherstel, managed proof, backup/restore-preflight, promotie
   en deploy volgens de bestaande enterprise-activation-runbook.

Bewijs bevat uitsluitend SHA, migratienaam, operatie/status en tellingen; geen
account-ID's, e-mails, tokens of databaseverbindingsgegevens. GitHub-artifacts
hebben een bewaartermijn van één dag.

## Verificatie en resterende releasegates

De eerste lokale PostgreSQL 17-proef heeft de volledige scope-migratie uitgevoerd,
het exacte journal plus geïnstalleerde cataloguscontract bevestigd en alles
teruggedraaid. Runtime-regressies bewijzen behoud in twee tenants, tenantisolatie,
weigering van onjuiste rollen, ongewijzigde gegevens en transactionele rollback.
De nieuwe policy-reconciliatie is afzonderlijk tegen een lokale reconstructie van
de drie oude policies uitgevoerd; alleen policy metadata veranderde en de proef
werd teruggedraaid.
De afzonderlijke operationele tests toetsen bron/history-drift, lockfouten,
ontbrekende dekking, idempotentie en geheime-vrije foutafhandeling.

Definitieve lokale resultaten op de beoordeelde migratie, SHA-256
`23b1aa33b626a114694a748e3e2d391ea02460071c865d2b20df2ec582df9902`:

- Twee opeenvolgende runs van 142 PostgreSQL-regressies geslaagd, zonder skips.
  Inclusief echte secundaire verbindingen voor isolatie- en write-locktests.
- 232 TypeScript-domeintests, waaronder 12 runner-/workflowtests, geslaagd.
- 330 security/source-tests, workspace-typecheck en afzonderlijke strikte
  script-typechecks geslaagd.
- Negen database-integratiecontroles en vijftien authenticated-RLS-controles
  geslaagd. De definitieve RLS-proef draaide op een verse lokale database.
- De echte begrensde runner is lokaal door diagnose → apply → already-applied →
  diagnose gegaan. Twee legacy-beheerrelaties bleven twee geldige scoped
  relaties; geen ontbrekende dekking en identieke account-/rolgegevens voor/na.
- Migratievolgorde, runtime-inventaris, fixturecontract, testlagen, dashboardaudit
  en visuele statische contractcheck geslaagd. Geen UI-wijzigingen.

De bredere RLS-harness speelde historische migraties opnieuw af en liet daarmee
de oude Managementfunctie achter. Die historische ACL-proef draait nu volledig
binnen een teruggedraaide transactie; de oude drift- en herstelasserties blijven
intact. Exacte cataloguscontroles vóór en na de proef bewaken dat de overige
vijftien RLS-controles het huidige contract toetsen. Dit is ook onafhankelijk
beoordeeld, zonder open P0/P1.

Bewijspaden: `/tmp/fieldgrid-tenant-management-reviewed-pg17-{1,2}.log`,
`/tmp/fieldgrid-tenant-management-runner-rehearsal.log`,
`/tmp/fieldgrid-tenant-management-final-domain.log`,
`/tmp/fieldgrid-tenant-management-corrected-security.log`, en
`artifacts/runtime-safety-harness/reports/{db-harness,rls-harness}.json`.
Een eerste lokale poging trof ontbrekende `auth.uid()`-rechten in de al gebruikte
shimdatabase; de bestaande historische helper had daar dezelfde fout. De nieuwe
autorisatietest corrigeert uitsluitend die lokale shim binnen haar rollback-
transactie. Een verse setup heeft het verwachte providerrecht al. Er is geen
productie-Auth-grant gewijzigd. Een hergebruikte RLS-fixture gaf daarnaast een
duplicaattoewijzing; de definitieve proef gebruikt daarom een verse database,
zoals de geïsoleerde CI-job.

Supabase `db advisors` is uitgevoerd op de lokale wegwerpdatabase, nooit staging.
De nulmeting bevat 34 bestaande meldingen: één `security_definer_view`-melding
voor `public.customer_assignment_projection`, 32 mutable-search-path-waarschuwingen
en één extension-in-public-waarschuwing. De voor/na-vergelijking en gerichte
catalogus-/ACL-tests moeten aantonen dat deze correctie niets toevoegt. Die
historische meldingen worden niet als nieuwe bevinding of opgelost gepresenteerd.
De vergelijking bevestigt exact dezelfde 34 meldingen vóór en na de wijziging.

De lokale schijf heeft minder dan 200 MiB vrij. De volledige build wordt daarom
door de bestaande schone GitHub-CI op de nieuwe exacte head bewezen. Vereist:
workspace-typecheck, volledige build, PostgreSQL-migraties, authenticated RLS,
Tenant A/B-integratie, vorige-releasecompatibiliteit en de overige exact-head-
checks. Dashboard- en visuele contractchecks blijven vereist; geen UI-wijziging
betekent niet dat ingelogde stagingacceptatie mag worden overgeslagen.

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
