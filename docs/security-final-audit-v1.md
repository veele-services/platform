# Veele Platform Security & Privacy Eindcontrole v1

Datum: 2026-06-23  
Taak: TAAK-25 - Eindcontrole security policies en privacygrenzen

## Samenvatting

Deze controle sluit de functionele hardening-sprint af. De belangrijkste open privacygrens was historisch: oudere RLS-policies gaven klanttoegang op basis van `customers.contact_email = auth.jwt()->email`. Dat is vervangen door expliciete `customer_users`-koppelingen. Daarmee wordt klanttoegang bepaald door: tenant, customer en gekoppelde gebruiker.

Daarnaast is defense-in-depth RLS toegevoegd voor de belangrijkste workflowtabellen, zodat Data API-toegang niet breder is dan de server actions. De applicatie blijft server-side autorisatie doen; RLS fungeert als extra vangnet.

## Wijzigingen In Deze Eindcontrole

Migration: `lib/db/migrations/051_final_security_boundaries.sql`

Toegevoegd:

- `public.customer_has_access(customer_id, tenant_id)`
  - Controleert actieve `customer_users.user_id = auth.uid()`.
  - Geen e-mail-only autorisatie meer.
- `public.personnel_assigned_to_assignment(assignment_id)`
  - Controleert actieve `personnel.user_id = auth.uid()` via `assignment_personnel`.
  - Gebruikt geen query terug naar `assignments` om RLS-recursie te vermijden.

Verwijderd/vervangen:

- Legacy klantpolicies op basis van `contact_email`.
- Legacy object/contact policies op basis van klant-email.
- Klant-notificatie en push policies op basis van klant-email.
- Klant-payment batch policies op basis van klant-email.

Toegevoegd/verhard:

- Klanten, objecten en objectcontacten via `customer_users`.
- Klantportaalvoorkeuren via `customer_users`.
- Klantnotificaties via `customer_users`.
- Customer push-subscriptions via `customer_users`.
- Payment batches en batch-items via `customer_users`.
- RLS op workflowtabellen:
  - `assignments`
  - `assignment_personnel`
  - `assignment_tasks`
  - `assignment_extra_work`
  - `assignment_photos`
  - `assignment_report_notes`
  - `assignment_report_note_attachments`
  - `reports`
  - `quotes`
  - `invoices`

## Controle Per Eis

### tenant_id overal aanwezig

Bevestigd voor primaire tenant-data:

- `customers`
- `personnel`
- `objects`
- `assignments`
- notificaties
- tickets
- planning intelligence tabellen
- tenant/customer-user koppelingen

Tabellen zoals `invoices`, `quotes`, `reports`, taakregels en mediaregels hebben niet overal een eigen `tenant_id`, maar worden via hun verplichte relatie naar `customers` of `assignments` tenant-scoped. Dat is acceptabel zolang queryfilters en RLS via die relatie lopen.

### customer_users correct gebruikt

Klantautorisatie is gehard naar `customer_users`.

Applicatiecode gebruikt al `getMyCustomerIdentity()` als basis voor klantportaal queries. De finale migration haalt de oudere e-mailgebaseerde RLS weg zodat ook Data API-toegang niet meer op e-mailmatch leunt.

### personnel.user_id correct gebruikt

Personeelsapp queries gebruiken `personnel.user_id` of leiden toegang af via `assignment_personnel`. Kerngebieden die gecontroleerd zijn:

- planning/werkbonnen
- open opdrachten
- beschikbaarheid
- rapportagenotities
- documenten
- notificaties
- berichten/tickets
- media-upload

### Interne notities niet klantzichtbaar

Klantportaal toont geen interne notitievelden zoals:

- `assignments.notes`
- `quotes.notes`
- `invoices.notes`
- management review notes

Rapporten voor klanten tonen alleen goedgekeurde rapportage-inhoud. Backoffice blijft de medewerker/auteur kunnen zien. Personeels- en klantgerichte rapportageweergaves tonen uitvoerder als `Veele Services`.

### Klant ziet geen personeelsnamen

Gecontroleerde klantoppervlakken tonen geen personeelsnamen in:

- klantopdrachten
- klantrapportages
- klantfacturen
- verzamelfacturen
- tickets vanuit Veele

Backoffice mag personeelsnamen tonen voor operationeel beheer.

### Storage policies bevestigd

Migration `050_storage_upload_hardening.sql` heeft storage policies aangescherpt:

- `documents`: private, management-only storage access; klant/personeel krijgt server-side signed URL na ownership-check.
- `assignment-photos`: private, management en toegewezen personeel.
- `personnel-avatars`: bewust public read, beperkt tot avatar-afbeeldingen.
- `news-hero-images` en `organization-assets`: bewust publiek leesbaar voor branding/nieuws.

Na deploy moet Database Inspect bevestigen:

```sql
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('documents', 'assignment-photos', 'personnel-avatars', 'news-hero-images', 'organization-assets')
order by id;

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
order by policyname;
```

### Server-side uploads gevalideerd

Gecontroleerd en aangescherpt:

- documentupload backoffice: tenant/entity-check vooraf, upload via admin client, MIME/size/path validatie.
- rapportage-notitie media: presigned upload plus server-side object-existence/MIME/size controle vóór koppeling.
- meerwerkfoto’s: server-side object-existence controle vóór koppeling.
- personeelsavatar: file type en grootte beperkt, pad aan eigen personeelsrecord gekoppeld.

### Audit logging actief

Audit logging is aanwezig voor gevoelige mutaties in:

- auth/login/logout
- klanten
- objecten
- opdrachten/werkbonnen
- planning/interessepeilingen
- personeel
- rapportages
- facturen
- documenten
- kwalificaties
- tickets

Niet elke leesactie wordt al als audit-event opgeslagen. Voor productieacceptatie is dat acceptabel zolang gevoelige downloads en documenten al worden gelogd of via server actions traceerbaar zijn.

### RLS policies consistent

De finale migration maakt RLS consistenter:

- management: `is_management()`
- klant: `customer_users`
- personeel: `personnel.user_id` of toegewezen werkbon

Historische e-mailgebaseerde klantpolicies zijn verwijderd.

### Gevoelige objectinformatie afgeschermd

Klant ziet objectinformatie alleen via eigen `customer_users` scope. Personeel ziet objectdetails alleen via toegewezen of passende opdrachten. Backoffice behoudt volledige toegang.

### PDF’s gecontroleerd op datalekken

Klant-PDF’s:

- factuur-PDF filtert op customer + tenant en toont financiële regels zonder personeelsnamen.
- verzamelfactuur-PDF filtert op customer + tenant en toont geen interne notities.

Backoffice rapport-PDF:

- vereist `reports.read`.
- toont medewerkers niet aan klanten; “ingediend door” en “goedgekeurd door” worden als `Veele Services` weergegeven.
- goedgekeurde foto’s worden via tijdelijke signed URL opgehaald.

## Database Inspect Checklist Na Deploy

Run na staging deploy:

```sql
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and policyname ilike '%email%'
order by tablename, policyname;
```

Verwachting: geen actieve klanttoegangspolicies meer op basis van e-mail.

```sql
select schemaname, tablename, policyname
from pg_policies
where schemaname = 'public'
  and (
    qual ilike '%contact_email%'
    or with_check ilike '%contact_email%'
    or qual ilike '%auth.jwt()%email%'
    or with_check ilike '%auth.jwt()%email%'
  )
order by tablename, policyname;
```

Verwachting: geen klantautorisatie op `contact_email`.

```sql
select table_name, row_security
from information_schema.tables t
join pg_class c on c.relname = t.table_name
where table_schema = 'public'
  and table_name in (
    'customers',
    'customer_users',
    'objects',
    'object_contacts',
    'assignments',
    'assignment_personnel',
    'assignment_tasks',
    'assignment_extra_work',
    'assignment_photos',
    'assignment_report_notes',
    'assignment_report_note_attachments',
    'reports',
    'quotes',
    'invoices',
    'documents'
  )
order by table_name;
```

Verwachting: `row_security = true`.

## Acceptatietest Voor Staging

1. Log in als klant A en controleer:
   - alleen eigen objecten;
   - alleen eigen opdrachten;
   - alleen eigen facturen;
   - alleen eigen tickets;
   - geen personeelsnamen in rapporten/facturen.

2. Log in als klant B en herhaal dezelfde checks.

3. Log in als personeelslid en controleer:
   - alleen eigen planning;
   - alleen eigen documenten;
   - alleen toegewezen werkbonnen;
   - open opdrachten alleen passend/in scope.

4. Log in als management en controleer:
   - backoffice blijft volledig bruikbaar;
   - auditlog zichtbaar;
   - documenten downloaden werkt via signed URL;
   - rapport/factuur PDF’s genereren.

## Restpunten Niet-Kritiek

- Niet iedere tabel heeft een fysieke `tenant_id`; sommige tabellen zijn veilig via relationele scope. Dit is bewust gedocumenteerd.
- Fijnmazige audit logging op alle leesacties kan later worden uitgebreid.
- Volledige live RLS-verificatie vereist Database Inspect op staging na deploy.

## Conclusie

Er zijn geen bekende kritieke privacy/security issues meer open in de gecontroleerde scope. Staging is klaar voor gecontroleerde acceptatietests, mits de Database Inspect checklist na deploy groen is.
