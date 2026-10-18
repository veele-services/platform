# Handmatige reeksen en automatische contractconcepten

## Het onderscheid

Een handmatige werkbonreeks herhaalt een bestaande bon op verzoek. Een
contractgestuurde reeks is gekoppeld aan een concrete actieve contractregel en
kan via de worker toekomstige conceptbonnen voorbereiden. Zij plant geen
medewerkers, verzendt niets en maakt geen facturen.

Bestaande vrije contracttekst en oude reeksen blijven handmatig. De migratie
activeert geen oude registratie.

## Een contractreeks voorbereiden

1. Open de bronwerkbon en het onderdeel Terugkerend werk.
2. Kies frequentie, interval, startdatum, lokaal tijdvak en einddatum.
3. Koppel een actieve contractregel die bij een taak van de bronbon hoort.
4. Stel de generatiehorizon in; standaard zes en maximaal 26 weken.
5. Voeg desgewenst voorkeursmedewerkers toe. Dit zijn kandidaten, geen inzet.
6. Controleer de preview en sla de reeks als concept op.

Dagelijks, wekelijks, maandelijks en jaarlijks zijn expliciete patronen. Een
jaarpatroon op 29 februari gebruikt in een niet-schrikkeljaar de laatste geldige
februaridag. Nachtwerk bewaart start, einde, einddatum en tenanttijdzone.

## Automatisering activeren

Automatisering heeft twee schakelaars: één voor de tenant en één voor de reeks.
Beide staan standaard uit. Schakel eerst de tenantfunctie bewust in en activeer
daarna de gecontroleerde reeks. De worker verwerkt een begrensde batch met
locks, unieke occurrences en veilige retries.

Voor iedere uitvoeringsdatum wordt de op die datum geldige contractregel
bepaald. Over een indexatiedatum gebruikt een nieuwe bon de opvolgregel; oude
bonnen en prijzen blijven ongewijzigd. Een onduidelijke mapping maakt een
zichtbaar foutregister in plaats van een gegokte bron.

## Dagelijks beheer

- **Pauzeren:** stopt nieuwe generatie; bestaande bonnen blijven staan.
- **Hervatten:** gaat standaard vanaf vandaag vooruit.
- **Beëindigen:** stopt de reeks met reden.
- **Overslaan:** legt voor één datum een occurrence met reden vast; een retry
  maakt die datum niet alsnog aan.
- **Voorkeursmedewerker:** wordt per nieuwe bon opnieuw beoordeeld en alleen als
  geschikt, aandacht of niet inzetbaar getoond.

Het reeksregister toont horizon, laatste run, volgende occurrences en fouten.
Een fout in één occurrence wordt afzonderlijk opgeslagen en blokkeert andere
geldige reeksen niet.
