# Staging tenant-management policy identity diagnostic

## Doel

De bestaande secret-vrije tenant-management SQL-diagnose kan vaststellen dat
onbekende legacy RLS-policy-consumers aanwezig zijn, maar exporteert bewust geen
policy-identiteiten. Deze aanvullende diagnose maakt uitsluitend de minimale
PostgreSQL-catalogusidentiteit zichtbaar die nodig is om een gerichte,
forward-only reparatie te ontwerpen:

- schema;
- tabel;
- policynaam.

De diagnose exporteert nooit `qual`, `with_check`, policy-SQL, rijen uit
applicatietabellen, UUID's, e-mailadressen, gebruikersnamen, tokens,
wachtwoorden of verbindingsgegevens.

## Grenzen

Workflow:
`.github/workflows/fieldgrid-staging-tenant-management-policy-identity-diagnostic.yml`.

Script:
`scripts/fieldgrid-staging-tenant-management-policy-identity-diagnostic.mts`.

De operatie:

- is uitsluitend via `workflow_dispatch` op exact `main` beschikbaar;
- vereist een exacte main-SHA en een vaste bevestiging;
- vereist een geslaagde Main Exact Head Validation op die SHA;
- gebruikt de staging-migratieverbinding met gepinde TLS-controle;
- opent uitsluitend `REPEATABLE READ READ ONLY`;
- leest alleen `pg_policies`;
- eindigt altijd met `ROLLBACK`;
- heeft geen mutation/apply-modus;
- rapporteert maximaal tien onbekende consumers en faalt dicht als er meer zijn;
- accepteert alleen begrensde PostgreSQL-identifiers voor schema, tabel en policy;
- behandelt workflow-input als data via een step-scoped omgevingsvariabele,
  nooit als geïnterpoleerde shellcode;
- verwerpt een resultaat wanneer rollback of connection/pool-cleanup faalt;
- bewaart het secret-vrije artifact één dag.

## Selectie

De selectie gebruikt exact dezelfde legacy-signalen als de bestaande
policy-reconciliatiemigratie:

- `is_management(...)` in `qual` of `with_check`;
- een verwijzing naar `user_roles` in `qual` of `with_check`.

Alleen de drie door de huidige migratie herkende identities op
`public.user_roles` worden uit de identiteitslijst gefilterd. Dezelfde policynaam
op een ander schema of andere tabel blijft onbekend. Dit bewijst geen definitie
van een herkende of onbekende policy: het volgt uitsluitend de bestaande scanner.

## Gecontroleerd hervattingspunt

De inspectie van 17 september 2026 vond PR #506 nog als draft zonder reviews.
De bescherming van `main` vereist één goedkeurende review, goedkeuring na de
laatste push en een geslaagde `Main exact-head gate`; dit geldt ook voor admins.
Een subagentreview vervangt deze menselijke review niet. De deployworkflow op
de toen gecontroleerde main heeft uitsluitend `workflow_dispatch`; merge van
de diagnostic deployt de applicatie niet automatisch. Controleer dit opnieuw
als de workflow ondertussen is gewijzigd.

Na review en normale merge:

1. Lees de **nieuwe** remote main-SHA. Wacht op succesvolle Main Exact Head
   Validation voor die mergecommit; de groene PR-run is hiervoor geen bewijs.
2. Dispatch `.github/workflows/fieldgrid-staging-tenant-management-policy-identity-diagnostic.yml`
   op `main`, met `expected_main_sha` gelijk aan die nieuwe SHA en
   `confirmation=fieldgrid-staging-tenant-management-policy-identity-diagnostic-v1`.
   Er bestaat geen operation/apply-input.
3. Download het artifact
   `tenant-management-policy-identity-diagnostic-<run-id>-<attempt>` binnen één
   dag. Vereis `status=passed`, `errorCode=null` en maximaal tien geldige unieke
   identities. Een ontbrekend, verlopen of mislukt artifact is geen bewijs.
4. Bewijs daarna intern de volledige brongebonden legacy- en einddefinities,
   inclusief command, rollen, permissiveness, alle overlappende policies en
   helperafhankelijkheden. Identiteiten alleen autoriseren geen reparatie.

## Verse evidence en grenzen van de conclusie

De alleen-lezen authorization-run
[`35267327375`](https://github.com/veele-services/platform/actions/runs/35267327375)
op main `3c01ed8fd497d44359b05f7b43f0ca5d8ba8dcf8` van 17 september 2026
bevestigde `legacy_pairs=2`, `preserved_pairs=2`, `missing_pairs=0`,
`scoped_pairs=9`, drie policy-consumers waarvan nul herkend,
`unknown_policy_consumer`, `readyForApply=false`, `migrationRecorded=false`
en `contractVerified=false`. Dit zijn tijdgebonden waarnemingen, geen toekomstige
invarianten. De artifacts van de eerdere run `35037730502` zijn verlopen.

De live identities en definities zijn hiermee nog **niet** bewezen. Historische
bronbestanden bevatten ook directe `user_roles`-consumers buiten die drie
herkende identities. Leid de reparatie nooit alleen uit deze telling of de
historische naam af. De staging-Gitref was
`024c6160872dd85b19f011db1957005b625e8362`; dit is geen bewijs voor de actieve
release-marker. Deze diagnostic meet geen actieve applicatierelease.

De runner accepteert uitsluitend het exact gehashte opeenvolgende paar
`20260914125400` en `20260914125503`. Een nieuwe later gesorteerde SQL-file kan
de eerdere blokkade niet passeren. Het herstel heeft dus een afzonderlijk
gereviewd, brongebonden prerequisite-/journalcontract nodig, met één atomaire
overgang en echte PostgreSQL-tests voor de ondersteunde histories. Historische
migraties en hashes blijven ongewijzigd. De private canonical helper mag niet
vóór de afwezigheidsguard van de scope-migratie worden aangemaakt.

Het huidige canonical contract verifieert helpers, ACLs, scope-journal en de
afwezigheid van legacy consumers. Het bewijst geen exacte definities van nog te
repareren policies. Voeg dat bewijs aan het herstel toe. Het diagnosticveld
`platform_permission_helper_exact` bewijst evenmin de volledige helperbody of
alle effectieve ACLs. Ook de huidige workflow draait na canonical `diagnose`
nog legacy-preconditions; gebruik die uitkomst niet als canonical postcheck.
Deze punten blijven releasevoorwaarden voor de reparatie, geen aanleiding om
nu `apply` te starten of bestaande controles te versoepelen.

## Fouten, tests en herstel

Veilige foutcategorieën zijn `configuration_invalid`, `main_validation_failed`,
`diagnostic_failed`, `too_many_consumers`, `cleanup_failed` en `operation_failed`.
Een cleanupfout verhindert succes, de pool wordt ook na een releasefout gesloten
en het resultaat wordt niet als geslaagd geregistreerd. Bij een onschrijfbaar
artifact faalt de operatie; ontbrekende evidence mag niet worden goedgekeurd.
Geen driverdetails, policyexpressies of verbindingsgegevens worden geëxporteerd.

De domain- en security/source-tests worden door de bestaande exact-head CI-globs
uitgevoerd. Echte PostgreSQL-transactietests zijn geregistreerd via
`tests/fieldgrid-realtime-projection-migration.test.mjs` in
`pnpm fieldgrid:test:postgres17-migration-smoke`. Ze gebruiken uitsluitend lokale
synthetische fixtures; DDL/DML worden binnen de diagnostictransactie door
PostgreSQL geweigerd. De shellregressie faalt op de oorspronkelijke PR-head en
controleert dat command substitution in input nooit uitgevoerd wordt.

Deze wijziging heeft geen SQL-migratie of accountmutaties. Terugnemen gebeurt
met een gereviewde codecommit. Na een diagnosticfout: evidence onderzoeken en
alleen dezelfde toegestane read-only route opnieuw gebruiken wanneer de oorzaak
is verholpen. Geen apply-retry, baseline of journalrepair als fallback.

## Gebruik na run

De uitkomst is uitsluitend diagnostisch. Policy-identiteiten vormen geen
machtiging om policies generiek te herschrijven.

Voor elke gevonden policy moet vóór een reparatie afzonderlijk worden bepaald:

1. wat de bedoelde resource- en tenantscope is;
2. welke bestaande actuele autorisatiehelper daarvoor canoniek is;
3. of de huidige policydefinitie exact overeenkomt met de historische drift;
4. of de reparatie met een smalle allowlist en catalogus-postconditie kan worden
   uitgevoerd;
5. of account-, rol-, membership- en applicatiedata volledig onaangeroerd blijven.

Daarna volgt een aparte reviewed forward-only migratie. Geen bestaande migratie
wordt achteraf gewijzigd en de fail-closed onbekende-consumercontrole wordt niet
versoepeld.
