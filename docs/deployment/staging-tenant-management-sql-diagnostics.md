# Staging tenant-management SQL diagnostics

## Doel

De begrensde stagingworkflow kan een `apply` veilig terugrollen met de categorie
`transaction_failed`. De ruwe PostgreSQL-fout wordt bewust niet in logs of
artifacts opgenomen. Deze aanvullende diagnose maakt daarom alleen de vaste,
reviewbare catalogusvoorwaarden zichtbaar die de twee tenant-managementmigraties
zelf afdwingen.

De diagnose wijzigt geen schema, policies, functies, rollen, lidmaatschappen of
applicatiedata. Zij draait in `REPEATABLE READ READ ONLY`, leest alleen PostgreSQL-
catalogi en rolt de transactie altijd terug.

## Veilige uitvoer

Het artifact bevat alleen booleans, kleine aantallen en vaste blocker-enums:

- aanwezigheid van `public.user_roles`;
- aantal legacy policy-consumers, het herkende deel en eventuele onbekende
  consumers;
- aanwezigheid van de drie verwachte `user_roles`-policies;
- exactheid van de bestaande platform-permission-helper;
- of de migratierol de `user_roles`-policies mag beheren;
- aanwezigheid van een onverwachte reeds aangemaakte private helper;
- exactheid van de legacy `is_management_for_tenant(uuid)`-helper;
- aanwezigheid van de expliciet verboden legacy material-usage-policy;
- aantallen legacy function- en rule/view-consumers;
- of de migratierol in `app_private` een helper kan aanmaken.

Er worden geen UUID's, e-mailadressen, namen, rolleninhoud, tokens,
verbindingsgegevens of ruwe databasefouten geëxporteerd.

## Workflowgedrag

`Staging Tenant Management Authorization` voert de aanvullende diagnose uit:

1. na een normale `diagnose`; en
2. na een mislukte `apply`, zodat een transactionele rollback een bruikbare maar
   secret-vrije foutcategorie oplevert.

Een succesvolle `apply` krijgt geen aanvullende precondition-diagnose, omdat de
oude preconditions na een succesvolle migratie bewust niet meer gelden.

## Interpretatie

`likelyFailurePhase` is uitsluitend een classificatie van de aangetroffen
catalogusvoorwaarden:

- `policy-reconciliation`: een blocker die de eerste policy-reconciliatiemigratie
  kan stoppen;
- `tenant-scope`: de policyvoorwaarden zijn bruikbaar, maar een voorwaarde van de
  tenant-scope-migratie blokkeert;
- `none`: geen van de gecategoriseerde preconditions blokkeert.

`readyForApply=true` betekent alleen dat deze catalogusdiagnose geen bekende
precondition-blocker ziet. De bestaande `missing_pairs=0`, exacte main-SHA,
Main Exact Head Validation, history/frontier, locks en alle overige workflowgates
blijven verplicht. De diagnose autoriseert nooit zelfstandig een deploy.

Bij `readyForApply=false`: geen retry van `apply` voordat de blocker is onderzocht.
Bij `readyForApply=true` na een eerdere `transaction_failed`: behandel een
transient lock/DDL-runtimeprobleem als aparte hypothese en verzamel nieuwe
read-only evidence voordat opnieuw wordt gemuteerd.
