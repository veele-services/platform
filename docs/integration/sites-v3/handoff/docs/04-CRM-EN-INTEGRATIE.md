# CRM, website-intake, afspraken en centrale mail

## Scope en bron

Dit is een **platformbrede Fieldgrid-salespipeline** voor organisaties die interesse hebben in Fieldgrid. De bestaande tenantklanten, commerciële tenantaanvragen, personeelsafspraken en supporttickets blijven hun eigen domein. Modelleer een expliciete conversie wanneer een gewonnen lead later een tenant wordt; een proefaanvraag of fasewisseling mag niet ongemerkt een actief betaald account aanmaken.

Functionele referentie: `source/platform/src/CRM.tsx`, `CRMOverview.tsx`, `crm-types.ts`, `lib/crm-server.ts`, `lib/crm-availability.ts`, `db/schema.ts` en `tests/crm-backend.test.ts`. Formulierbron: `source/marketing/components/conversion-pages.tsx` en `lib/crm-proxy.ts`.

De Sites-implementatie werkt met SQLite/D1 en een owner-private toegangsgrens. Vertaal het contract naar de bestaande Next/Supabase-/workerarchitectuur. Gebruik de SQL niet als productie-migratie. Neem nooit de native Sites-ownerheaders of het Sites-servicetoken als autorisatie over.

## Gebruikersflow

1. Bezoeker op **www.fieldgrid.nl** kiest proefaanvraag, telefonische kennismaking of telefonische productdemo.
2. Validatie vindt zowel aan de voorkant als server-side plaats. Afspraak/demo vraagt telefoon, datum en een werkelijk vrij slot. Een trial vraagt geen slot en activeert nog geen account.
3. Eén geslaagde transactie registreert of herkent de lead, bewaart de afzonderlijke aanvraagsnapshot, maakt opvolging en een outboxevent, en reserveert bij een afspraak het slot.
4. De bezoeker ziet pas ontvangstbevestiging na bevestigde serveropslag. Time-out/onzekere response kan met dezelfde idempotentiesleutel worden herhaald.
5. De vier overzichtskaarten en de volledige CRM-weergave tonen dezelfde nieuwe registratie. Een kaart opent het juiste dossier of tabblad.
6. De bestaande centrale notificatieketen biedt de beheerdersmelding aan via SendGrid. Ontbrekende configuratie, policyblokkade, retry, fout of onzekere uitkomst blijven zichtbaar; sla een providerfout niet op als een mislukte intake wanneer de registratie wel is voltooid.
7. Beheerder plant/bevestigt/verplaatst/annuleert, maakt notities en taken en werkt fase, eigenaar, opvolgdatum en potentiële maandwaarde bij.

## Datacontract — begrippen, geen voorgeschreven productietabelnamen

| Begrip | Inhoud en invariant |
| --- | --- |
| Lead | Contact, bedrijf, e-mail, telefoon, sector, teamgrootte, eigenaar, bron, fase, opvolgdatum, potentiële maandwaarde. In Sites ontdubbeld op genormaliseerd e-mailadres + organisatie. Bewaar server-side een stabiele identiteit. |
| Aanvraag | Eigen ID, type (`appointment`, `demo`, `trial`), contact-/bedrijfssnapshot, doel, bericht, voorkeurdatum/-tijd en ontvangstmoment. Meerdere aanvragen bij dezelfde lead blijven afzonderlijk terugvindbaar. Een latere wijziging aan een lead herschrijft eerdere snapshots niet. |
| Activiteit | Intake, fasewijziging, notitie en afspraak-/opvolggebeurtenissen met actor en tijd. Productieaudit is servergebaseerd; verzin geen actoren uit formulierdata. |
| Taak | Optionele lead, titel, vervaldatum, verantwoordelijke en voltooiing. Aanmaken/bewerken/afronden/heropenen; één automatische opvolgtaak per intake. |
| Afspraak | Lead, optionele aanvraag, lokale datum/tijd, UTC-start/-einde, status aangevraagd/bevestigd/geannuleerd. Vorm is `telephone`, duur is in de referentie 30 minuten. |
| Reservering | Transactionele bescherming tegen overlap, inclusief buffer. Eén platformagenda in huidige scope; uitbreiding naar meerdere agenda-eigenaren alleen met expliciete sleutels. |
| Beschikbaarheid | Weekdagen, start/einde, duur, buffer, minimale voorbereiding, boekingshorizon, geblokkeerde datums en `Europe/Amsterdam`. Dit zijn agenda-instellingen, geen externe kalenderkoppeling. |
| Notificatie | Koppeling naar aanvraag/lead en bestaande delivery/outbox; huidige ontvanger voor nog te verzenden melding, historische ontvanger en provideruitkomst voor verzonden pogingen. |
| Idempotentie | Stabiele sleutel + payloadhash. Zelfde sleutel/zelfde inhoud geeft dezelfde uitkomst. Zelfde sleutel/andere inhoud geeft conflict; geen stil hergebruik. |

Fasen: **Nieuw → In contact → Afspraak gepland → Voorstel → Proefperiode → Gewonnen / Verloren**. `value` is potentiële **maandwaarde**, geen ontvangen omzet. Laat totalen en detailgegevens dezelfde definitie gebruiken.

Bronlabels en voorbeeldlabels blijven duidelijk. Gebruik in productie standaard echte gegevens; voorbeelden uitsluitend als gecontroleerde testfixtures/demomodus. Kopieer de live Sites-D1-records niet naar productie. Voorbeeldintakes versturen nooit echte e-mail.

## API- en actiemapping

Onderstaande paden beschrijven de Sites-referentie. De targetrepo mag serveracties/RPC's of andere passende routes gebruiken, mits het volledige gedrag gelijk blijft en deep links geldig worden vertaald.

| Referentie | Resultaat |
| --- | --- |
| `GET /api/crm` | Leads, aanvragen, taken, activiteiten, afspraken, instellingen en globale notificatiecontext. Splits dit in productie in gerichte geautoriseerde projecties/paginatie. |
| `POST /api/crm/intake` | Publieke intake, idempotent en transactioneel. Alleen deze beperkte schrijfactie mag publiek bereikbaar zijn. |
| `GET /api/crm/availability?date=YYYY-MM-DD` | Alleen vrije tijdstippen; geen namen, bedrijven of private afspraakdetails. |
| `POST /api/crm/leads` | Handmatige nieuwe lead. |
| `PATCH /api/crm/leads/:id` | Fase, eigenaar, opvolgdatum, potentiële maandwaarde. |
| `POST /api/crm/leads/:id/activity` | Notitie/tijdlijn. |
| `POST /api/crm/tasks`, `PATCH /api/crm/tasks/:id` | Taak aanmaken/bewerken/afronden/heropenen. |
| `POST /api/crm/appointments` | Handmatig plannen voor bestaande lead. |
| `PATCH /api/crm/appointments/:id` | Bevestigen, annuleren, verplaatsen. |
| `GET /api/crm/appointments/:id/ics` | Geautoriseerde agenda-export. Dit is geen realtime Google-/Outlook-sync. |
| `PATCH /api/crm/settings` | Beschikbaarheid en CRM-meldingsvoorkeur; geen ontvanger-/providersecretvelden. |
| `POST /api/crm/notifications/:id/retry` | Via bestaande centrale delivery/workerprocedure; geen directe omzeiling van policy of transportclaims. |
| `POST/DELETE /api/crm/demo-data` | Uitsluitend prototypehelper; geen algemene productieactie. |

De publiek gebruikte Sites-proxy geeft alleen intake en availability door. Bouw bij integratie een beperkt echt publiek contract op www; expose geen volledige CRM-API door de bestaande proxy generiek te maken. Hergebruik begrensde invoer, host/originvalidatie en passende misbruikbeperking uit de bestaande publieke intakepatronen. Een CORS- of Origin-check alleen is geen CRM-autorisatie.

## Agenda- en concurrentievoorwaarden

- Beschikbaarheid aan de voorkant is informatief. De server controleert hetzelfde slot opnieuw in de reserveringstransactie.
- Twee gelijktijdige aanvragen kunnen één slot niet beide claimen. Gebruik een passende Postgresconstraint/lockstrategie; valideer ook overlappingen en buffers, niet alleen gelijke starttijden.
- Als planning-instellingen wijzigen tussen availability en submit, wordt een ongeldige boeking geweigerd. Geef een bruikbaar conflict en laat een nieuw slot kiezen.
- Verplaatsen claimt het nieuwe slot en geeft het oude vrij in één transactie; bij conflict blijft de oorspronkelijke afspraak intact.
- Annuleren maakt het slot weer beschikbaar; herhaling veroorzaakt geen dubbele activiteit/taak/mail.
- Tijdzone is Amsterdam, opslag gebruikt ondubbelzinnige instants. Test beide zomertijdwisselingen, datumgrenzen, voorlooptijd en buffer op het einde van de werkdag.
- De overzichtskaart gebruikt niet-geannuleerde afspraken met `endsAt >= nu`. De huidige CRM-topmetric gebruikt nog `date >= vandaag`; maak dit één gedeelde productiedefinitie zonder de presentatie te wijzigen.
- ICS bevat juiste tijden, UID, escaping en beveiligde download. Voeg geen fictieve videoverbinding toe.

## Globale SendGrid en primaire beheerder

De repo heeft reeds `lib/providers/sendgrid.ts`, `lib/notifications/worker.ts`, providerpolicy en transportregistratie. **Gebruik deze bestaande keten.** `source/platform/lib/platform-mail.ts` illustreert alleen het prototypecontract en wordt geen tweede productiemailer.

Globale configuratienamen: `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `SENDGRID_FROM_NAME`, `SENDGRID_API_BASE`. De base is een origin zoals `https://api.sendgrid.com/`; de bestaande provider maakt `new URL('v3/mail/send', base)`. Geen nieuw CRM-afzenderadres, nieuw API-keyveld of hardcoded e-mailadres.

De bestaande bootstrap registreert de Auth-user uit `FIELDGRID_ADMIN_EMAIL` als platformbeheerder in `platform_admins`. Zoek de bestaande primaire beheeridentiteit op via servercontext en lees het actuele geldige e-mailadres. Bij meerdere beheerders is de keuze expliciet en deterministisch. Verwijderde of onbevoegde accounts zijn geen geldige ontvangers. Neem geen demo-adres, formulieradres of eerste willekeurige Auth-user over.

Het CRM toont die bestaande ontvanger alleen-lezen. De CRM-meldingsvoorkeur mag worden aan/uitgezet zonder globale e-mailinstellingen te dupliceren. Bewaar een bestaande expliciete opt-out bij migratie. Accepteer `adminEmail` uit een clientbody niet als maildoel.

**Concrete huidige repo-grens:** `lib/notifications/worker.ts` vereist in `deliverySchema` momenteel `tenantId: z.uuid()`, terwijl providerpolicy een nullable tenantcontext kent. Een platformbrede CRM-aanvraag heeft geen klanttenant. Breid de bestaande catalogus/projectie/worker waar nodig gericht uit en test platformcontext zonder tenant. Maak geen fictieve tenant en sla geen policygate over om de mailer passend te krijgen.

Providerstatus is eerlijk: pending/blocked/deferred, in behandeling, accepted, failed of uncertain volgens bestaande domeintermen. HTTP 202 betekent aangeboden/geaccepteerd, niet bezorgd. Gebruik bestaande eventwebhook-/transportuitkomsten wanneer beschikbaar. Herhaal een onzekere verzending niet blind met een nieuwe sleutel. Succesvolle intake met tijdelijke mailstoring blijft geregistreerd en zichtbaar.

## Prototypegrenzen die Codex expliciet moet afhandelen

- Geen automatische trialprovisioning of abonnement in de huidige formulierflow. Behoud de bevestiging als aanvraag totdat echte provisioning onderdeel van de implementatie is.
- Geen Google Calendar-/Microsoft 365-synchronisatie; interne beschikbaarheid en ICS zijn aanwezig. Voeg geen schijnverbonden status toe.
- Bestaande CRM-aanvragen zijn snapshotdata; laat zoeken in productie ook de relevante snapshotvelden doorzoeken, niet uitsluitend de laatst gewijzigde lead.
- Bestaande Siteprivacytekst gaat over het prototype. Productiecopy moet passen bij de werkelijke registratie en dienstverlening.
- De huidige Site is privé; de publieke website op www vereist de expliciete host-/endpointgrens uit `docs/05`.
