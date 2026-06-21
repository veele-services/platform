# Supabase Hardening Audit

Datum: 2026-06-21  
Scope: tenant/customer-user model, RLS, storage policies en centrale event-dispatch.

## Uitgevoerd in deze sprint

- `tenants` en `tenant_users` toegevoegd als basis voor multi-tenant isolatie.
- `customer_users` toegevoegd zodat klantportaaltoegang niet langer uitsluitend aan `customers.contact_email` hangt.
- `domain_events` toegevoegd als centrale eventstream voor auditbare workflow-events.
- `tenant_id` gebackfilled op kernrecords: organisatie-instellingen, klanten, personeel, objecten, opdrachten en notificatie/dispatch-tabellen.
- Klantportaal lookup aangepast: eerst `customer_users.user_id`/e-mail, daarna legacy fallback via `customers.contact_email`.
- Centrale event-service toegevoegd voor domain events, in-app notificaties en e-mail/push queue entries.
- API-route toegevoegd voor queued e-mail delivery: `POST /api/admin/email-notifications`.
- Storage buckets expliciet gehard:
  - `documents`: private, management-only.
  - `org-assets`: public read, management write.
  - `assignment-photos`: private, management-all en assigned-personnel scoped upload/read/delete.
  - bestaande `news-hero` en `personnel-avatars` policies blijven intact.

## Huidige garanties

- Nieuwe tenant-gevoelige rootrecords krijgen standaard tenant `veele-services`.
- Klantgebruikers kunnen meerdere accounts per klant ondersteunen via `customer_users`.
- Klantaccounts kunnen bestaande legacy accounts automatisch claimen wanneer het auth e-mailadres overeenkomt.
- Kritieke workflow-events rond aanvragen/offertes worden centraal geregistreerd in `domain_events`.
- Offerte-verzending naar klanten loopt via centrale event-service naar `notification_delivery_queue`.
- Push en e-mail kunnen nu beide via API-server workers verwerkt worden.

## RLS aandachtspunten

- `customer_users`, `tenant_users`, `tenants` en `domain_events` hebben expliciete RLS policies.
- Bestaande tabellen zoals `customers`, `objects`, `assignments`, `documents`, `reports`, `invoices` hebben al deels bestaande RLS of server-action scoping, maar zijn nog niet overal volledig tenant-aware in iedere query.
- Volgende hardeningstap: per module alle backoffice/customer/personnel queries controleren op:
  - `tenant_id` filtering,
  - klant-scope via `customer_users`,
  - personeels-scope via `personnel.user_id`,
  - management-only velden zoals interne notities.

## Storage aandachtspunten

- Browser-side upload naar `assignment-photos` is gekoppeld aan `assignment_personnel` via het eerste pathsegment: `{assignmentId}/...`.
- Backoffice-documenten blijven management-only in storage. Klant- en personeelsweergave moet via server action of signed URL lopen.
- `personnel-avatars` is publiek leesbaar; upload/delete verloopt via server action met service role. Dat is acceptabel zolang uploads server-side gevalideerd blijven.
- `news-hero` is publiek leesbaar en management-only write; dit past bij nieuws hero-afbeeldingen.

## Event service aandachtspunten

- `emitDomainEvent` ondersteunt:
  - domain event logging,
  - optionele audit-log insert,
  - personeel- en klant-inbox notificaties,
  - e-mail queue,
  - push queue,
  - shortcodes via `{{key}}` en `{{nested.key}}`.
- Management-brede notificatie-dispatch is nog niet volledig uitgewerkt omdat managementgebruikers nu nog via RBAC/Supabase users lopen zonder aparte notification owner table.
- Volgende stap: backoffice notification center laten lezen uit `domain_events` en optioneel management recipients expliciet modelleren.

## Aanbevolen volgende controles

1. Draai `pnpm run db:migrate` op staging en controleer:
   - `tenants`
   - `customer_users`
   - `domain_events`
   - `tenant_id` op kernrecords
   - storage policies in Supabase dashboard.
2. Draai `Database Inspect` en bevestig dat RLS policies bestaan voor:
   - `customer_users`
   - `tenant_users`
   - `domain_events`
   - `storage.objects` policies voor `documents`, `org-assets`, `assignment-photos`.
3. Test klantportaal met bestaand klantaccount:
   - login moet klantprofiel vinden,
   - `customer_users` krijgt `user_id` gevuld,
   - aanvragen/offerte-acceptatie schrijven `domain_events`.
4. Test offerte verzenden:
   - `customer_notifications` krijgt een rij,
   - `notification_delivery_queue` krijgt e-mail/push waar geconfigureerd,
   - `POST /api/admin/email-notifications` verwerkt queued e-mails.

## Bekende restpunten

- Niet iedere bestaande query is al tenant-filtered. De databasebasis is klaar, maar applicatiebrede query-hardening moet per module gebeuren.
- Management recipients voor centrale events verdienen een eigen model of koppeling met `tenant_users`.
- E-mail queue-worker moet nog als systemd timer in staging/production worden toegevoegd.
- Supabase Data API exposure moet in de Supabase dashboard/API-instellingen expliciet worden nagekeken voor nieuwe tabellen, omdat nieuwe tabellen niet automatisch publiek/API-exposed mogen worden verondersteld.
