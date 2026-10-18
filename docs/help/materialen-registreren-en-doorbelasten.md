# Materiaal registreren en gecontroleerd doorbelasten

## Twee verschillende handelingen

Een medewerker registreert wat werkelijk is gebruikt. Finance bepaalt apart of
dit materiaal intern blijft, in de afspraak is inbegrepen of met een
gecontroleerde prijs en btw wordt doorbelast. Een ingevulde of voorgestelde
prijs is daarom nog geen factureerbare bron.

## Registreren tijdens het werk

1. Open de werkbon in de personeelsapp of backoffice.
2. Kies een actief catalogusartikel of voer een incidentele omschrijving in.
3. Vul hoeveelheid, eenheid en een korte toelichting in.
4. Geef alleen aan of het gebruik in het klantrapport zichtbaar mag zijn.
5. Sla op en controleer de vastgelegde hoeveelheid.

Bij een catalogusartikel bewaart de gebruiksregel een snapshot van code, naam,
eenheid, versie en prijsvoorstel. Een latere cataloguswijziging herschrijft die
snapshot niet. De interne kostprijs blijft buiten de personeels- en
klantpayload en buiten de rapport-PDF.

## Commercieel beoordelen

Finance opent de materiaalbeoordeling bij de werkbon:

1. Controleer werkelijk aantal en eenheid tegen rapport en bewijs.
2. Kies **Inbegrepen**, **Doorbelasten** of **Afgewezen**.
3. Bij doorbelasten vul je verkoopprijs exclusief btw en het btw-percentage in.
4. Leg een concrete afspraakbron of reden vast, bijvoorbeeld contractregel,
   geaccepteerde offerte of expliciet klantakkoord.
5. Sla de beoordeling op. Gelijktijdige wijzigingen worden met de versieguard
   geweigerd.

**Prijs nog niet bepaald** betekent dat finance nog moet beslissen.
**Inbegrepen** verschijnt alleen na een bewust besluit. Alleen **Doorbelasten**
met volledige goedkeuring wordt een factuurbron.

## Facturatie en correctie

Goedgekeurd materiaal verschijnt naast taken en goedgekeurd meerwerk in het
factureerbare werk. De factuurregel verwijst naar de echte materiaalgebruik-ID,
de commerciële versie en een onveranderlijke bronsnapshot. Deelfacturatie is
mogelijk; de som kan de goedgekeurde hoeveelheid niet overschrijden.

Na facturatie kan de commerciële bron niet worden herschreven of verwijderd.
Een inhoudelijke fout vraagt de bestaande rapportcorrectie en financiële
opvolging. Fieldgrid maakt niet stil een nieuwe prijs van dezelfde verbruik-ID.

## Controlepunten

- Controleer `2,500` als 2,500 eenheden, niet als een geldbedrag.
- Keur geen prijs goed zonder afspraakbewijs.
- Gebruik geen kunstmatige taak om materiaal factureerbaar te maken.
- Controleer voor finaliseren de btw-groepen en resterende hoeveelheden in de
  gezamenlijke preview.
