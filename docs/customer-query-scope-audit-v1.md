# Customer Query Scope Audit v1

Datum: 2026-06-23
Scope: #TAAK-20 - Klantquery-scope via `customer_users`

## Uitgangspunt

Een klantgebruiker krijgt alleen toegang via een actieve rij in `customer_users`.
Alle klantgerichte data wordt daarna beperkt met:

- `customer_users.user_id = auth.user.id`, of een eenmalige claim van `customer_users.email` wanneer `user_id` nog leeg is;
- `customer_users.customer_id`;
- `customer_users.tenant_id`;
- een tenantrelatie via `customers.tenant_id` of `assignments.tenant_id` wanneer de brontabel zelf geen `tenant_id` heeft.

De oude fallback via `customers.contact_email` is verwijderd uit de autorisatiehelper. Dat veld mag nog als contactgegeven bestaan, maar is geen autorisatiebasis meer.

## Gecontroleerde modules

- Klantdashboard: gebruikt dezelfde actions als opdrachten, offertes, rapporten, facturen, betalingen, tickets en meldingen.
- Mijn objecten: objectqueries filteren op `objects.customer_id` en `objects.tenant_id`.
- Object aanmaken/bewerken: tenant en customer worden altijd uit `customer_users` gezet, nooit uit clientinput.
- Mijn opdrachten/werkbonnen: assignmentqueries filteren op `assignments.customer_id` en `assignments.tenant_id`.
- Opdracht aanvragen: object, sector en klant worden binnen dezelfde tenant gevalideerd voordat een opdracht ontstaat.
- Prijsopgaven: offertes worden via de gekoppelde opdracht gevalideerd op customer en tenant.
- Rapportages: alleen goedgekeurde rapporten van opdrachten binnen customer en tenant worden getoond.
- Facturen: facturen worden via `customers.tenant_id` en `invoices.customer_id` gevalideerd.
- Betalingen en verzamelfacturen: betalingsoverzichten, Mollie-starts en batchitems controleren customer en tenant.
- Tickets: threadlijsten, details, replies en statuswijzigingen filteren op `customer_id` en `tenant_id`.
- Documenten: customerdocumenten controleren `documents.entity_id -> customers.id -> customers.tenant_id`.
- Meldingen: inbox-acties filteren op `customer_notifications.customer_id` en `tenant_id`.
- Pushabonnementen: nieuwe klantabonnementen worden met tenant en customer opgeslagen.
- PDF-downloads: factuur- en verzamelfactuur-PDF routes controleren customer, tenant en gekoppelde opdracht.

## Handmatige testinstructies staging

1. Maak twee klanten aan binnen dezelfde tenant, bijvoorbeeld `Klant A` en `Klant B`.
2. Koppel twee verschillende auth-users via `customer_users`, ieder aan een eigen klant.
3. Maak voor beide klanten minimaal een object, opdracht, offerte, rapport, factuur, ticket, document en melding.
4. Log in als klantgebruiker A.
5. Controleer normale navigatie:
   - dashboard toont alleen data van klant A;
   - objecten/opdrachten/offertes/rapporten/facturen/betalingen/tickets/documenten/meldingen tonen alleen klant A.
6. Probeer directe URL/API-ID's van klant B:
   - `/objecten/<id-van-klant-b>`;
   - `/opdrachten/<id-van-klant-b>`;
   - `/facturen/<id-van-klant-b>`;
   - `/api/factuur/<id-van-klant-b>/pdf`;
   - `/api/verzamelfactuur/<id-van-klant-b>/pdf`;
   - `/meldingen/tickets/<id-van-klant-b>`.
7. Verwacht resultaat: niet zichtbaar, 404 of geen data. Nooit gedeeltelijke klant-B-data.
8. Herhaal omgekeerd als klantgebruiker B.

## Aandachtspunt

Tabellen zonder eigen `tenant_id`, zoals `invoices`, `customer_payment_batches`,
`customer_portal_preferences` en `documents`, blijven afhankelijk van veilige joins
naar `customers` of `assignments`. Bij toekomstige uitbreidingen moet deze lijn
worden vastgehouden of moet alsnog een expliciete `tenant_id` op die tabellen worden toegevoegd.
