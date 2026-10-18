# Opleverchecklist operationele ketens

## Management

- Controleer dat contractautomatisering voor de tenant standaard uit staat.
- Activeer alleen een reeks met een concrete actieve contractregel en bekijk de
  eerste occurrences, horizon en voorkeursmatch.
- Beoordeel kwalificatieacties in Opvolging en open altijd de bronwerkbon.
- Gebruik een reden bij onderbezet vrijgeven en controleer de auditregistratie.
- Controleer het foutregister na iedere eerste workeracceptatie.

## Planning

- Vergelijk dag-/weekcapaciteit met de concrete werkbonvensters.
- Bekijk geschikte, aandacht vragende en niet inzetbare kandidaten.
- Leg bij onbekende of afwijkende beschikbaarheid per medewerker een reden vast.
- Controleer dat twee halve inzetten niet als volledige gelijktijdige dekking
  worden gelezen.
- Geef pas vrij wanneer taken, tijdvak, functie, kwalificaties en dekking kloppen.

## Finance

- Scheid materiaalregistratie van commerciële goedkeuring.
- Leg bij inbegrepen en doorbelasten altijd afspraakbewijs vast.
- Controleer werkbonnummers, objecten, uitvoeringsdatums, regels en btw-groepen
  in de verzamelfactuurpreview.
- Gebruik een betaalbatch alleen voor definitieve facturen van één klant.
- Lees pogingstatus en betaaldatum; een reservering is nog geen betaling.
- Voer op staging BET-08 uit met Mollie-testmodus en verifieer merchantprofiel,
  centenallocatie, hervatten en dubbele webhook.

## Releasebeheer

- `pnpm test:db:operational-upgrade`
- `pnpm test:db`
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
- autorisatiereview en migratiemanifest/-targetcontrole
- desktop-, tablet- en mobiele kernflows met synthetische accounts
- bewuste promotie van gereviewde `main`-SHA naar `staging`
- health/SHA, worker en provideracceptatie afzonderlijk vastleggen
