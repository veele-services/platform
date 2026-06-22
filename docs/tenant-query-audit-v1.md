# Tenant-aware query audit v1

Datum: 23 juni 2026  
Scope: #TAAK-19

## Doel

Alle queries die bedrijfsdata lezen of wijzigen moeten tenant-aware zijn. De applicatie mag nooit vertrouwen op alleen een technische id zoals `customer.id`, `object.id`, `assignment.id` of `personnel.id` wanneer de data tenantgebonden is.

## Uitgevoerde controles

### Backoffice

Gecontroleerde modules:

- Klanten: `artifacts/backoffice/src/app/actions/customers.ts`
- Objecten: `artifacts/backoffice/src/app/actions/objects.ts`
- Personeel: `artifacts/backoffice/src/app/actions/personnel.ts`
- Opdrachten/werkbonnen: `artifacts/backoffice/src/app/actions/assignments.ts`
- Documenten/media: `artifacts/backoffice/src/app/actions/documents.ts`
- Dashboard: `artifacts/backoffice/src/app/actions/dashboard.ts`
- Layout/realtime context: `artifacts/backoffice/src/app/(dashboard)/layout.tsx`

Aanpassingen:

- Centrale backoffice helper toegevoegd: `requireCurrentTenantId()`.
- Klantlijsten en klantdetails filteren nu op `customers.tenant_id`.
- Klantmutaties zoals aanmaken, bijwerken, status wijzigen, uitnodigen en verwijderen zijn tenant-scoped.
- Objectlijsten, objectdetails, objectperformance en objecthistorie filteren nu op de actuele tenant.
- Objectmutaties valideren dat de klant bij dezelfde tenant hoort en schrijven `objects.tenant_id` expliciet bij insert.
- Personeelslijsten, personeelsdetails, statistieken, flexpool, capaciteit per rol en gekoppelde objecten filteren op tenant.
- Personeelsmutaties schrijven `personnel.tenant_id` expliciet bij insert en muteren alleen binnen de actuele tenant.
- Opdrachtlijsten en opdrachtdetails filteren op `assignments.tenant_id`.
- Opdrachtmutaties schrijven `assignments.tenant_id` expliciet bij insert en muteren alleen binnen de actuele tenant.
- Personeel koppelen aan een opdracht valideert zowel opdracht als medewerker binnen dezelfde tenant.
- Documenten hebben nog geen eigen `tenant_id`; daarom is server-side entity-scope toegevoegd via de gekoppelde entiteit: assignment, customer, personnel, object of general-upload door een tenantgebruiker.

### API-server

Gecontroleerde modules:

- API-auth middleware: `artifacts/api-server/src/middleware/auth.ts`
- Customer API: `artifacts/api-server/src/routes/customers.ts`

Aanpassingen:

- API middleware `requireTenantScope` toegevoegd.
- API-verzoeken krijgen `req.tenantId` vanuit `tenant_users`.
- Customer detail/update routes filteren op `customers.tenant_id`.
- Customer contact routes valideren dat de customer bij de actuele tenant hoort.
- Contact update/delete routes kunnen niet meer via alleen contact-id/customer-id buiten tenantcontext werken.

### Klantportaal

Gecontroleerde modules:

- `artifacts/klant-pwa/src/actions/customer.ts`
- `artifacts/klant-pwa/src/actions/objects.ts`
- `artifacts/klant-pwa/src/actions/assignments.ts`
- `artifacts/klant-pwa/src/actions/quotes.ts`
- `artifacts/klant-pwa/src/actions/reports.ts`
- `artifacts/klant-pwa/src/actions/invoices.ts`
- `artifacts/klant-pwa/src/actions/payments.ts`
- `artifacts/klant-pwa/src/actions/tickets.ts`
- `artifacts/klant-pwa/src/actions/documents.ts`
- `artifacts/klant-pwa/src/actions/notifications.ts`

Bevinding:

- Het klantportaal gebruikt grotendeels de identity-helper op basis van `customer_users` en `tenant_id`.
- PDF-routes uit de vorige taak zijn al via `customer_users + tenant_id` aangescherpt.
- Verdere customer-isolatie per scherm hoort bij #TAAK-20, waar niet alleen tenant-scope maar ook klant-toewijzing per `customer_users.customer_id` volledig wordt afgedwongen.

### Personeelsapp

Gecontroleerde modules:

- `artifacts/personeel-pwa/src/actions/personnel.ts`
- `artifacts/personeel-pwa/src/actions/assignments.ts`
- `artifacts/personeel-pwa/src/actions/open-assignments.ts`
- `artifacts/personeel-pwa/src/actions/reports.ts`
- `artifacts/personeel-pwa/src/actions/hours.ts`
- `artifacts/personeel-pwa/src/actions/documents.ts`
- `artifacts/personeel-pwa/src/actions/notifications.ts`
- `artifacts/personeel-pwa/src/actions/push.ts`

Bevinding:

- De personeelsapp gebruikt op veel plekken `personnel.user_id` om de medewerker te bepalen.
- Verdere personeelsisolatie per scherm hoort bij #TAAK-21, waar alle open diensten, media, documenten en uren strikt via `personnel.user_id` worden afgedwongen.

## Bewuste restpunten

Deze punten zijn niet genegeerd, maar horen technisch bij de opvolgtaken:

- `documents` heeft geen eigen `tenant_id`. De huidige fix werkt via entity-scope; structureel advies is een migratie met `documents.tenant_id` en storage-path conventies per tenant. Dit hoort bij #TAAK-23.
- `customer_types` is historisch deels globaal/niet-tenantgebonden. Bij volledige multi-tenant uitrol moet dit of tenant-scoped worden, of expliciet als globale referentietabel worden gedocumenteerd.
- RLS policies en storage policies moeten nog tegen de database zelf worden gevalideerd via Database Inspect/Supabase dashboard. Dit hoort bij #TAAK-23 en #TAAK-25.
- Klant- en personeelsportaal moeten nog apart worden afgehard op respectievelijk `customer_users` en `personnel.user_id`. Dit hoort bij #TAAK-20 en #TAAK-21.

## Verificatieadvies

1. Draai typecheck voor backoffice, klantportaal, personeelsapp en API-server.
2. Draai staging database inspect om RLS/storage policies te bevestigen.
3. Test met twee klanten binnen dezelfde tenant dat klant A geen data van klant B ziet.
4. Test met twee personeelsleden dat personeel A geen planning, documenten of media van personeel B ziet.
5. Test in backoffice dat klanten, objecten, opdrachten, personeel en documenten normaal blijven laden onder de managementtenant.

