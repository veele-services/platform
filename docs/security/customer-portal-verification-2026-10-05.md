# Klantportaal: implementatie- en autorisatiecontrole, 5 oktober 2026

Deze controle betreft de lokale wijzigingsset op basis van
`1f47c7b8621c18cd2a70b570a2ea0cda275154ad`. Dit document bewijst geen hosted
deploy of provideracceptatie. De uiteindelijke commit, CI-, migratie-, browser-
en stagingstatus worden bij de release vastgelegd. De portal-agent controleerde
de eigen entrypoints en beoordeelde daarnaast onafhankelijk de betaalintegratie
van de integratie-agent. De integratie-agent vond en liet de hieronder genoemde
hybride rapportregressie herstellen.

## Gecontroleerde grenzen

| Grens | Concrete implementatie | Uitkomst van de controle |
| --- | --- | --- |
| Identiteit en selectie | `lib/objects/auth.ts`, `app/klant/page.tsx`, `app/klant/route-model.ts`, `lib/customer-portal/data.ts`; migraties 33500, 59000 | Tenant komt op staging uitsluitend uit de hostname. Een account is een selector binnen die tenant. Meerdere accounts vragen expliciete selectie. Actieve, bevestigde, niet-anonieme Auth-identiteit, sessie, tenant, klant en eventueel contact worden opnieuw gecontroleerd. Account- of resource-ID in een URL geeft geen recht. |
| Publieke projecties | `model.ts`, `snapshot-model.ts`, `presentation.ts`, `visit-model.ts`, `commercial-model.ts`, `ticket-model.ts`; alle routes onder `app/api/customer-portal` | Expliciete veldenlijsten en schema-validatie. Snapshot controleert na de parallelle reads de actuele workspace en de objectrelaties van facturen, rapporten en aanvragen. HTTP-responses zijn privé/no-store. Ongeldige of dubbele selectors worden geweigerd. |
| Zelfbediening en introductie | `profile-action.ts`, `object-action.ts`, `preferences-action.ts`, `onboarding-action.ts`, `instruction-action.ts`, `request-action.ts`; migraties 43500, 44500, 53100, 54100, 57000, 58200 | Strikte invoer zonder tenantoverride; expliciete mogelijkheden; actuele account-/objectrechten; versies en gebonden opdrachtontvangstbewijzen. Aanvraag blijft aanvraag. Loginadres en interne CRM-, planning- of rapportvelden zijn niet via deze invoer te wijzigen. |
| Offertes | `commercial-action.ts`, `app/api/customer-portal/request/route.ts`; migraties 65000, 65100 | Dezelfde klant, exact object, actuele versie, publicatie, vervaldatum, vervanging en expliciete besluitbevestiging worden gecontroleerd. Herhaling hergebruikt alleen een ontvangstbewijs van dezelfde actor/account/invoer. De bestaande commerciële engine blijft eigenaar van het besluit. |
| Concrete afspraak | `visit-command-action.ts`, `visit-command-model.ts`, `app/api/customer-portal/visit-files/[id]/route.ts`; migratie 72000 | Eigen verzoek bij exact die afspraak; actuele bezoek-/verzoekversie en toegestane toestand. Upload is gescand, inhoud en type begrensd, opnieuw geautoriseerd en gebonden aan tenant/object/verzoek. Download vereist het document in de veilige afspraakprojectie en controleert opnieuw na de bytes. |
| Tickets | `ticket-action.ts`, `tickets/route.ts`; migraties 71000–71200 | Vijfde context gebruikt dezelfde ticket-, nummer-, opdracht-, audit-, toewijzings- en bestandsengine. Alleen expliciet veilige categorieën en eigen melder/account. Exacte objectbinding blijft vereist. Projectie bevat alleen openbare berichten met eigen klant-, tenant- of Fieldgrid-auteurslabel. Intrekking wordt ook bij replay en het laatste DTO opnieuw getoetst. |
| Activiteit en nieuws | `activity-action.ts`, `news-action.ts`; migraties 64000, 64100, 75000, 75100 | Centrale notificaties, bronautorisatie en voorkeuren blijven leidend. Geen interne ticketinhoud of medewerkersidentiteiten. Doelpaden worden vanuit toegestane bron-ID's opgebouwd. Leesacties blijven account-/versiegebonden. Zie ook de afzonderlijke OTP/activiteitscontrole. |
| Rapport- en betaalmeldingen | Migratie 75300; bestaande `app/api/worker/route.ts` en `notification_outbox_prepare` | Rapportgoedkeuring en een geverifieerde betaalstatus leggen alleen het bron-event en de toen toegestane actor/accountselectie vast. De bestaande worker maakt later centrale afleveropdrachten. Zowel worker als inbox controleert de actuele account-, contact-, module- en volledige resourcescope. |
| Online betaling | `payment-action.ts`, `lib/payments/merchant.ts`, `lib/payments/provider-result.ts`; migraties 66000–66400, 75400 | Alle facturen moeten binnen hetzelfde actuele klantaccount en hun exacte objectscope vallen. Bedragen zijn resterende integer-centen. Alleen identieke open bundel mag worden hervat; overlap en gelijktijdige handmatige toewijzing worden geweigerd. Operatorbinding, actuele providerprofielidentiteit, mode, bedrag, valuta en servermetadata moeten overeenkomen. Browserreturn bevestigt niets. Alleen gecontroleerde HTTPS-Mollie-checkout wordt teruggegeven. Lijst, factuurdetail en betaalmodal volgen dezelfde actuele beschikbaarheid, zonder private providervelden aan de browser te geven. |
| Bestanden en hybride rollen | `files/[kind]/[id]/route.ts`, `report-download.ts`; migraties 70000, 70100, 71300, 71400 | Geselecteerd account wordt vóór en na asynchrone levering gecontroleerd. Bestandshash, scope en canonieke locator blijven leidend; browser-token/asset kiest geen alternatieve bron. Klantrapport gebruikt altijd `customer_copy`, ook als dezelfde gebruiker manager of medewerker is. Medewerkershandtekeningen/capturedBy komen niet in de klantkopie. |
| Live sessie en intrekking | `refresh.ts`, `controller.tsx`; migraties 60000, 61000, 62500 | Alleen een grove eigen-accountrevisie, geen rijke bronrecords. Focus, reconnect en 20-secondenfallback controleren onafhankelijk van Realtime. Geweigerde refresh verwijdert het private snapshot; later binnenkomende responses herstellen dit niet. Open invoer behoudt haar eigen basisversies. |

## Gevonden en herstelde regressies

1. De twee oudere rapportlijsten bleven na intrekking van klantidentiteit
   toegankelijk. Migratie 70000 voegt live identiteit van dezelfde klant toe,
   zonder document-/factuurrechten te verbreden. De echte rapportlevenscyclus
   controleert beide regressies.
2. De eerste ticketdispatcher was afgeleid van een oudere enginedefinitie en
   verloor twee latere filters op notificatiemodule/beheerrechten. Migratie
   71200 injecteert nu uitsluitend de nieuwe context in de definitief
   geïnstalleerde engines. De bestaande notificatierechtenregressie slaagt.
3. Een hybride manager/klant kon via delegatie aan de gewone rapportdownload
   de originele medewerkersprojectie krijgen. Migratie 71400 en
   `report-download.ts` forceren een veilige klantkopie en toetsen geneste
   snapshotvelden, klantondertekeningen en afbeeldingshashes. De originele
   beheerdersroute behoudt haar eigen rolgedrag.
4. Betalingsvoorbereiding controleerde aanvankelijk alleen vóór potentieel
   wachtende locks. De herziene 66000 controleert identiteit, finance-module,
   merchant en alle factuurscopes na de opdrachtlock en opnieuw na de
   factuurlocks. Een test met drie echte databasesessies bewijst afwijzing
   wanneer account, objectbinding of merchant tijdens het wachten wordt
   ingetrokken. Er ontstaan geen extra reserveringen.
5. Browserbetaling-return bevatte een queryparameter die het strikte routeschema
   afwees. `payment=return` is nu toegestaan en toont uitsluitend een
   onbevestigde terugkeer. Hervatten gebruikt de volledige bestaande bundel.

## Rapport- en betaaladapters

De aanvullende migratie 75300 sluit de eerder gereserveerde catalogustypen
`customer.report_available` en `customer.payment_received` aan. Een rapport moet
daadwerkelijk goedgekeurd zijn met een goedkeuringsdatum. Een betaalmelding
vereist een betaalde Mollie-poging met overeenkomende provider-ID, mode,
profiel indien vastgelegd, servermetadata, klant en alle onderliggende
factuur-/objectrelaties. Een browserreturn, open poging of handmatige
statuswijziging zonder geverifieerde providergegevens maakt geen betaalbericht.
Er worden geen bedragen, reportinhoud, medewerkersnamen of providerpayloads
overgenomen in de notificatie.

De brontriggers nemen geen notificatiebeleidslock terwijl rapport-, betaal- of
factuurrijen vergrendeld zijn. Ze bewaren een private domeingebeurtenis en een
outbox-ID. De centrale worker neemt eerst de bestaande beleidslock en maakt dan
de afleveropdrachten; hij neemt daarbij geen locks op betaal- of factuurrijen.
Oude workers zonder centrale notificatieondersteuning kunnen dit event niet
claimen. Bron-ID en centrale ontvangstbewijzen voorkomen dubbele meldingen.
Ontvangers die bij de overgang geen recht hadden, worden bij een retry niet
alsnog aan de oude gebeurtenis toegevoegd.

Onderdrukte kanalen en een vingerafdruk van de toepasselijke beleids- en eigen
voorkeurrevisies worden in dezelfde bronsnapshot bewaard. De worker vergelijkt
de revisies onder de beleidslock. Daardoor verstuurt een latere inschakeling
geen oud uitgeschakeld bericht; ook aan-uit-aan vóór de worker blijft
onderdrukt. Een relevante voorkeurwijziging kan conservatief ook het andere
kanaal van die ene uitgestelde melding onderdrukken. Wijzigingen voor andere
gebruikers of andere specifieke berichttypen doen dat niet. De oorspronkelijke
vervaltijd blijft gerekend vanaf de domeinovergang. Na enqueue blijft de
bestaande centrale afhandeling van beleid, voorkeuren, retries en intrekking
leidend. Dit gedrag is onafhankelijk van extern mailtransport.

## Uitgevoerde lokale controles

- `pnpm exec vitest run lib/customer-portal app/klant app/api/customer-portal`:
  **305 tests geslaagd**, 23 bestanden. Inclusief ongeldige invoer, verboden
  velden, versies, verouderde responses, intrekking tijdens bestand-I/O,
  geforceerde rapportprojectie, betaalproviders en herhaalde opdrachten.
- `pnpm exec tsc --noEmit`: geslaagd na regeneratie van de definitieve
  RPC-typen. Een optioneel rapportassetargument wordt weggelaten zodat de
  SQL-default geldt; er is geen type-omzeiling toegevoegd.
- Gerichte ESLint over `lib/customer-portal`, `app/api/customer-portal`,
  `components/fieldgrid/customer-portal`, `app/klant` en de betalingsconcurrencytest:
  geslaagd.
- `node --test scripts/test-work-order-reports.mjs scripts/test-customer-tickets.mjs`:
  **24 tests geslaagd**, inclusief echte rapportpublicatie, hybride rollen,
  intrekking en ticketbestandsrechten.
- `node --test scripts/test-customer-payment-concurrency.mjs`:
  **4 tests geslaagd** tegen de schone lokale migratieketen. De test observeert
  daadwerkelijk een PostgreSQL-lockwacht en gebruikt geen timingaanname voor
  de intrekking. Tijdelijk vastgelegde fictieve gegevens worden per tenant
  verwijderd. De verbindinghelper weigert hosted uitvoering.
- Na toevoeging van 75300:
  `node --test scripts/test-work-order-reports.mjs scripts/test-customer-payments.mjs`:
  **28 tests geslaagd**. Werkelijke goedkeuring/betaalafhandeling levert precies
  één private brongebeurtenis; de publieke service-role workerroute maakt en
  herhaalt veilige centrale afleveringen. De tests controleren de werkende
  inbox/deeplink, account-/bindingintrekking, uitsluiting van oude workers en
  beide voorkeurwisselingen vóór uitgestelde verwerking. De eerste uitvoering
  vond een SQL-parameter die met een kolomnaam samenviel; expliciete
  positieparameterkwalificatie herstelde dit. De integratierunner bevestigde
  daarna de schone replay van 109 migraties en de volledige databasegate:
  **383 tests geslaagd**.
- Eerdere gerichte rollbackruns: klantzelfbediening en rapporten **43**,
  commerciële beslissingen **5**, tickets plus notificatierechten **12**
  geslaagd. De definitieve volledige databasegate vervangt deze deelruns als
  releasebewijs.
- De laatste gerichte integratierun bevestigde
  `tests/e2e/customer-portal.spec.ts` opnieuw als geslaagd: alle navigaties,
  dialogen op 1440/1024/768/390/320px, geen horizontale overflow, zichtbaar
  eigen object op elke breedte, behoud van invoer bij refresh, echte PDF van
  drie pagina's met bytevergelijking op desktop en mobiel, ticket
  aanmaken/reageren/herladen, betalingsreturn en accountintrekking. De test
  controleert ook een echte eigen factuur zonder merchantconfiguratie:
  betaalacties blijven uitgeschakeld met uitleg. Intrekking van een fictieve
  merchantbinding terwijl de betaalmodal openstaat schakelt de provideractie
  eveneens uit na de live snapshotcontrole. Er wordt geen provideractie
  aangeroepen. De screenshots wachten op de zichtbare cockpit vóór de opname.
  Visuele inspectie bevestigde de desktopstructuur tegenover het aangeleverde
  klantprototype. De volledige browsergate blijft afzonderlijk releasebewijs;
  deze gerichte ronde had vijf geslaagde en twee overige mislukte cases.

## Resterende releasegrens

Binnen deze gerichte controle zijn geen onopgeloste bevindingen over
autorisatie/privégegevens achtergelaten. Dat is geen vervanging voor de volledige
autorisatie-inventaris, schone migratie-/upgradecontrole, volledige database- en
browsergate of een stagingacceptatie op de uiteindelijke SHA. Echte externe
OTP-bezorging en een tenantgebonden Mollie-checkout zijn afhankelijk van de
expliciete hosted configuratie; deze lokale tests claimen geen externe
bezorging of echte betaling. Er zijn geen echte betalingen uitgevoerd.
