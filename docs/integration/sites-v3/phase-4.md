# Omzetbewaking met de bestaande facturatiebron

Lokaal geïmplementeerd en getest; niet gedeployed of live geverifieerd. De volledige schermenmatrix blijft de releasegrens. De knop Prijsindexatie wordt in de volgende integratiestap aangesloten en is nog geen geaccepteerde werkende route.

De Sites-compositie is overgenomen: drie afzonderlijke metrics, vier gekoppelde categorieën, zoeken, bronregels, berekening, financiële controle en historie. De bron is de bestaande rapport-, offerte-, allocatie- en factuurlogica. Eén private bronprojectie wordt zowel door de oorspronkelijke factuurconceptfunctie als door omzetbewaking gebruikt. Een regressie vergelijkt de volledige factuur-DTO met de ongewijzigde baselinefunctie in een tijdelijke, teruggedraaide testtransactie. Hoeveelheden, eerdere allocaties, geaccepteerde offertediscounts en btw-groepen blijven gelijk.

Een financiële bevestiging voert de oorspronkelijke goedkeuring van het volledige werkbonrapport uit. Ondertekening, levering, meerwerkakkoord, bronversie en rapportcontrolerechten blijven vereist. De adapter zet geen losse goedkeuringsvlag en past geen prijs of contractscope aan. Een vaste week-/maandprijs kan uitsluitend met echte commerciële bronbinding als inbegrepen worden afgehandeld. De oorspronkelijke hoeveelheid, prijs en onderbouwing worden onveranderlijk vastgelegd; native periodefacturatie blijft beschikbaar. Ongeprijsd materiaalgebruik levert geen verzonnen omzet op.

Openstaande facturen tonen het werkelijke resterende bedrag inclusief btw. Een echte deelbetaling verlaagt dit bedrag; een eerdere broncontrole bewaart haar oorspronkelijke bewijs. De native factuur- en werkbondossiers blijven bereikbaar achter hun eigen actuele rechten. De beperkte financiële bronlink gebruikt geen beheerdersclient.

Private financiële tabellen hebben geforceerde RLS en geen directe grants. Commando's gebruiken de bestaande planningslock, bronfingerprints, actuele sessies en functie-/modulerechten, revisieconflicten en idempotente verzoeken. Rechten worden na wachten en na native rapportcontrole opnieuw gecontroleerd. De bestaande worker verwerkt begrensde bronjobs zonder gebruikersimpersonatie. Exact geselecteerde queue-ID's worden verwijderd; een eerder toegewezen maar later gecommitteerde ID verdwijnt niet door een numerieke watergrens. Operationele voortgang krijgt geen omgekeerde lock op de native werkbon.

## Bewijs

Zie `evidence/phase-4/`. De financiële en bestaande commerciële, rapport-, klantofferte- en betaalregressies slagen met 67 checks. De onafhankelijke concurrentiesuite slaagt met 7 checks, inclusief de bovenliggende testcase: één resultaat bij dubbele verzoeken, één winnaar per bronfingerprint, ingetrokken opdracht-/rapportrechten, verlopen sessie tijdens locks en beide kanten van worker/rapportverwerking. Gerichte units, TypeScript, ESLint en de lokale security-advisorcontrole slagen.

De echte lokale browserketen gebruikt Supabase Auth, SSR, API en native rapportgoedkeuring. Zij voert herbeoordeling van een gewijzigde bron, bevestiging, herladen, historie en de native bronlink uit. Anonieme, verkeerde-origin- en ingetrokken toegang worden geweigerd; het geopende privévenster verdwijnt. De twaalf bron/implementatieparen (vier tabs op 1440/768/390 px) en de echte controle- en historievensters zijn bekeken. Alleen buitenliggende shell-/prototype-/devchrome is voor inhoudsvergelijking onzichtbaar gemaakt. De bron toont 14 oktober als demopeildatum; de implementatie toont de echte tenantdatum, zonder datum- of tekstnormalisatie. De bron wordt uitsluitend in zijn aparte lokale referentieruntime met fictieve data gevuld.

## Minimale integratieverschillen

- Vrije demo-vinkjes vervangen geen werkelijk ontbrekend klantakkoord of rapport. Een toelichting vermeldt expliciet dat bevestigen het volledige werkbonrapport beoordeelt. Niet toegestane uitkomsten zijn uitgeschakeld.
- Het btw-label volgt de categorie: openstaande facturen inclusief, uitvoeringsbronnen exclusief btw. Centbedragen en decimale hoeveelheden worden behouden.
- Begrensde serverlijsten hebben werkelijke tellingen en zo nodig paginatie. Een bron die tijdens een geopend formulier verandert vereist een bewuste nieuwe beoordeling; invoer wordt niet stilzwijgend toegepast op een nieuwe fingerprint.

Migratie 152 is na lokale toepassing onveranderlijk. Productiegegevens, externe betalingen en live domeinen zijn niet door deze lokale bewijsvoering geverifieerd. Hele-shellcontrole, productiebuild, replay/upgrade en de overige schermen blijven onderdeel van de eindacceptatie.
