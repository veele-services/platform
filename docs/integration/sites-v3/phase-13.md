# Planbord: bronpresentatie boven de bestaande planning

Lokaal geïmplementeerd; het integrale release- en livebewijs blijft afzonderlijk vereist. Deze fase behandelt T03. De overige open matrixrijen blijven open.

| Onderdeel | Keuze | Aansluiting |
| --- | --- | --- |
| Kopregel, datum, filter en plus | Overnemen | Broncompositie, teksten, typografie, afmetingen en responsief gedrag. Plus gaat naar de bestaande werkbonwizard. |
| Planbord | Uitbreiden | Bronmaatvoering van 195 px personeelskolom, 103 px rij en 51 px tijdheader. Dezelfde waarden sturen ook hit-testing, virtualisatie en scrollen. |
| Operationele planning | Hergebruiken | Bestaande serveracties, versiecontrole, idempotentie, waarschuwingen, bezetting, individuele intervallen, undo en live updates. |
| Reistijd en vrijgave | Hergebruiken | Bestaande handmatige routecontrole met signatuur en bestaande versievaste publicatie met personeelsdispatches. Reistijdbalk en werkbon delen hoogte en verticale positie. |
| Formulieren | Uitbreiden | Het gedeelde bronvenster omkadert de volledige bestaande plannings-, keuze-, reis- en vrijgaveformulieren. Ook commerciële en werkbonformulieren gebruiken diezelfde optionele presentatie. |

## Afzonderlijk gemotiveerde integratieverschillen

- Het prototype tekent vier vaste namen en drie vaste situaties. Het operationele bord gebruikt uitsluitend werkelijk geautoriseerd personeel en daadwerkelijke toewijzingen, met bestaande sortering, beschikbaarheid, vervoer, meerdere medewerkers en individuele voortgang. De negen personeelsstatussen en hun onderscheid blijven behouden; zij worden niet onjuist tot drie werkbonstatussen teruggebracht. De legenda licht dat toe. Er worden geen demo-inzetten of voorbeeldfuncties toegevoegd.
- Het ingestelde tijdvenster blijft standaard 07:00–19:00 en kan met de bestaande tijd- en zoominstellingen worden aangepast. Het bronprototype heeft een vaste tijdas. Alleen de presentatie van de bestaande instellingen verhuist naar het bronfilter. De bestaande minuutnauwkeurigheid blijft intact.
- De bonnenbak behoudt de sleepgreep, eigen weergaveselectie, klantvenster, duur, bezettingscontrole, uitklappen en instelbare hoogte. Daarmee blijven de twee afzonderlijke scrollgebieden bruikbaar. De bronheader, typografie en rijbediening zijn toegepast; de aanvullende native kolommen vervangen geen bestaande gegevens. De header blijft sticky en een lege bak heeft geen nutteloze verticale scrollbar. Op mobiel kan de pagina als de bron doorlopen.
- Het compacte prototypevenster mag geen uitvoering, klantakkoord of personeelsvoortgang overschrijven. De volledige native formulieren en waarschuwingen blijven daarom beschikbaar in het bronvenster. Sluiten/Escape/buiten klikken en verlaten van de pagina behouden de bestaande bescherming van niet-opgeslagen wijzigingen. Sluiten is geblokkeerd tijdens bewaren.
- Bij intrekking van de actuele leesfunctie wordt een privaat plansnapshot direct verwijderd. Tijdelijke verbindingsproblemen behouden de bestaande retry en laatste geautoriseerde weergave. Pagina- en navigatieguards toetsen tevens de actuele functie. Dit versoepelt geen server- of databasebevoegdheid.

## Controle

De native databasecontroles voor planning, live updates en reistijd slagen: 37 tests. De gerichte planning-/navigatie-units slagen: 28 tests. De browserketen gebruikt echte lokale Auth, Next-serveracties en PostgreSQL. Zij controleert slepen en eindtijd aanpassen tegen werkelijk opgeslagen tijden, toevoegen van een tweede medewerker, verschuiven van het hele bezoek, wijzigen van één inzet met behoud van de andere inzet, handmatige reistijd, gelijke gekoppelde balken, undo, publicatie met precies één dispatch per medewerker, datumwissel, lege bonnenbak en intrekking bij een geopend privaat venster.

De definitieve browserketen draait tegen het werkelijk verpakte `server.js` van de koude productiebuild. De healthcontrole toetst lokaal de exacte runtimecommit en meldt zowel database als scanner gereed. Dit is een geïsoleerde lokale releasecontrole; de marker, verpakking en lokaal bootbewijs vormen geen staging-/productieattestation. De oorspronkelijke databasecontroles blijven ongewijzigd geldig: deze fase verandert geen schema.

De bron-/doelbeelden van de pagina op 1440, 768 en 390 px zijn bekeken en opgenomen in `evidence/phase-13/`. De hoofdinhoud is de vergelijkingsgrens; de buitenshell blijft onderdeel van T17. Ook het planningsformulier op drie breedtes, de inzetkeuze, handmatige reis, vrijgave en lege bak zijn bekeken. De prototypewerkuren en personeelsvolgorde zijn hardcoded; zij vervangen geen werkelijke tijden of sortering.

Bij de gedeelde modals is de volledige commerciële keten opnieuw uitgevoerd: werkelijke prijswijziging, verlies van een response na commit, private gescande bijlage/PDF, centrale transportregistratie, akkoord en omzetting naar opdracht. Ook de volledige taken-/templateketen slaagt opnieuw. Externe provideracceptatie wordt alleen bij `.invalid`-testontvangers lokaal afgevangen; geen echte bezorging wordt geclaimd.

Die hercontrole reproduceerde bovendien een afzonderlijke filterfout. Een volledige documentherlading bij dezelfde identiteit verloor de tijdelijke UI-status. Daarnaast verbergt de ongewijzigde accountgrens de pagina tijdens haar live controle, waardoor het invoerveld focus kan verliezen. Het filter bewaart daarom uitsluitend open stand, veldindex en cursorposities in begrensde tabopslag, per tenant en gebruiker. Een strikte projectie laat geen zoektekst, records, rechten of credentials toe. Accountovergang wist deze tijdelijke gegevens; gewone navigatie behoudt ze. Focus keert alleen terug nadat de bestaande accountgrens is vrijgegeven, en alleen als de gebruiker niet elders werkt. De server-/sessiecontrole is niet aangepast. De aparte browsertest bewijst echte RSC-verversing én documentherlading met behoud van invoer/focus, nieuwe serverregistratie, wissen, Escape en buiten klikken. De privacy-/sessie-/planning-/navigatie-units slagen: 38 tests.

Dit document verklaart geen staging-/productiedeployment en geen externe mailbezorging.
