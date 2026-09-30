# Aanvragen & Offertes — V1

De commerciële werkvoorraad gebruikt de bestaande `requests`, `quotes`, klanten,
objecten, taakversies, werkbonnen, afspraakvensters en facturen. Klant 360 en
Object 360 lezen dezelfde registraties via dezelfde lijst- en detailfuncties.
Bezoekinstructies en hun meerwerkvoorstellen zijn projecties van
`object_visit_requests` en `object_request_proposals`, geen gekopieerde aanvragen.

## Werkstroom

1. `/app/aanvragen` bevat twee servergepagineerde tabellen. Zoeken, filters,
   sortering, pagina en de geopende registratie staan in de URL. `source` is het
   bronfilter; `recordKind` bepaalt welk soort dossier openstaat.
2. Een aanvraag mag zonder object worden opgeslagen, ook samen met een nieuwe
   prospect. Een later gekozen object wordt aan gekoppelde concepten gekoppeld.
   Een aangeboden versie kan niet stilzwijgend van klant of object veranderen.
3. Een offerte kan rechtstreeks of vanuit een aanvraag ontstaan. Catalogusregels
   zijn een bron, geen gedeelde bewerkbare prijsregels. Bedragen worden op de
   server berekend: aantal met maximaal drie decimalen, regelkorting in centen,
   btw afgerond per tariefgroep. De preview volgt dezelfde rekenregel.
4. Aanbieden bevriest klant/contact, factuuradres, objectadres, regels, bedragen,
   voorwaarden, geldigheid, openbare bijlagen en huisstijl. PDF en logo worden
   onveranderlijk opgeslagen in de private bucket `commercial-documents`.
5. De beveiligde link is versie- en ontvangergebonden; alleen de hash staat in de
   tokentabel. Openen beslist niets. Klantbesluiten vereisen een bewuste actie;
   handmatig akkoord vereist kanaal, beslisser, ontvangstmoment en bewijs.
   Intern ingevoerd bewijs verschijnt niet in de klanttijdlijn.
6. Een vervangende aanbieding trekt eerdere open akkoordmogelijkheden in.
   Eerder akkoord en de bijbehorende opdracht blijven behouden. Twee gelijktijdige
   omzettingen maken één werkbon/opdracht met de geaccepteerde uitvoeringsregels.
7. Planning blijft het bestaande planbord. Opname, directe opdracht met bestaande
   prijsafspraak en uitvoering na akkoord zijn afzonderlijk herkenbaar.
   Boekingslinks reserveren een aankomstvenster, geen personeel of betaalakkoord.
   Capaciteit en herhaling worden transactioneel gecontroleerd. Een planner kan
   een nog niet personeelsgeplande boeking/link annuleren met reden; capaciteit
   wordt slechts eenmaal vrijgegeven. Geplande bezoeken wijzigen via het planbord.
8. Terugkerend werk bewaart frequentie én prijsbasis. Concrete vervolgbezoeken
   worden bewust klaargezet en daarna gepland. Week-/maandprijzen worden niet
   per bezoek gefactureerd. Een afzonderlijke periodefactuur vereist een volledig
   verstreken contractperiode, gecontroleerde uitvoering en expliciete bevestiging.
   Gedeeltelijke periodes vragen een afzonderlijke prijsafspraak.

## Toegang en communicatie

- De bestaande rollen en tenantdiensten bepalen backofficetoegang. Er is geen
  nieuwe rechtenmatrix. Iedere mutatie controleert de live sessie en relaties.
- `/aanvraag` is uitsluitend beschikbaar op een actieve tenanthost. Publieke
  intake maakt een gewone prospect; een bestaand e-mailadres onthult of koppelt
  geen bestaande relatie. Limieten gebruiken gehashte netwerk-/e-mailkenmerken.
- `/klant/aanvragen` gebruikt expliciete bestaande object-klantbindingsrechten.
  Ontvanger van een e-mail zijn is niet hetzelfde als portaaltoegang. De externe
  offertelink blijft bruikbaar zonder portaalaccount.
- Geen codes, interne toegangsnotities of personeelsdossiers in snapshots/PDF's.
  Bestandsroutes controleren backoffice-, portaal- of beperkte tokenrechten.
- SendGrid gebruikt bestaande afzenderconfiguratie, templates en tenantbranding.
  Aanbieden, provideracceptatie en klantakkoord zijn verschillende gebeurtenissen.
  Een expliciete providerweigering kan veilig opnieuw worden geprobeerd; een
  onzekere ontvangst wordt niet automatisch herhaald. Controleer dan SendGrid
  voordat een beheerder de verzendregistratie herstelt.
- Gebeurtenisberichten worden na de databasetransactie aangeboden. Fouten blijven
  zichtbaar bij Communicatie. Handmatige opvolging en herinneringen zijn bruikbaar;
  er is geen nieuwe automatische herinneringsscheduler ingeschakeld.
- Een aanvraag met een verzendpoging behoudt haar communicatiehistorie en kan
  alleen worden gearchiveerd. Verwijderen is uitsluitend voor ongebruikte intake.
- Handmatige mailherhaling doorloopt ook oudere dossierhistorie in pagina's.
  Aangenomen en onzekere verzendingen worden niet opnieuw aangeboden.

## Configuratie en migratie

Geen nieuwe secrets nodig. Bestaande `ADMIN_API_SECRET`, Supabaseconfiguratie,
`APP_URL`, `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` en `SENDGRID_FROM_NAME` blijven
serverconfiguratie vanuit GitHub Environment `staging`. De bestaande projectref-
guards, backup en migratieprocedure blijven ongewijzigd.

De commerciële migraties voegen velden, relaties, RLS/RPC's en een private bucket
toe. Bestaande oorspronkelijke vragen, bedragen, snapshots, akkoordbewijzen en
operationele historie worden niet herschreven. Bestaande werkbonkoppelingen
worden overgenomen. Oude prijsopgaven zonder vastgelegde regel/snapshotstructuur
blijven historische registraties; voor een nieuwe aanbieding is een gecontroleerde
revisie nodig. Voor bestaand akkoord zonder regels is een directe opdracht met
verwijzing naar het oorspronkelijke akkoord mogelijk. Er worden geen historische
offertedocumenten of instemmingen achteraf verzonnen.

Uploads volgen bestaande bestandstype-, inhoud- en omvangcontroles (10 MB).
Een malwarescanner is niet aangesloten; dit wordt in de uploadinterface vermeld.

## Controles

`pnpm test:db` bevat persistente commerciële integratiecontroles, inclusief races,
CAS, scopes, objectloze intake, versiebehoud, btw/korting, boekingscapaciteit,
annulering, uitvoeringfacturatie en periodefacturatie. `pnpm test:e2e` doorloopt
de wizard, PDF-testmail met weigering/retry, extern akkoord, opdracht, 360-koppeling
en tabellen op 1440/768/390 px. De testmailbox verzendt nooit externe e-mail.
De bestaande suite blijft verplicht vóór expliciete staging-promotie.
