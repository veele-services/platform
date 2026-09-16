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
- bewaart het secret-vrije artifact één dag.

## Selectie

De selectie gebruikt exact dezelfde legacy-signalen als de bestaande
policy-reconciliatiemigratie:

- `is_management(...)` in `qual` of `with_check`;
- een verwijzing naar `user_roles` in `qual` of `with_check`.

De drie eerder veronderstelde `public.user_roles` policies worden uit de
identiteitslijst gefilterd. Daarmee toont de evidence alleen de consumers die de
huidige fail-closed reconciliatie als onbekend behandelt.

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
