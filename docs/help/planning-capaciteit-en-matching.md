# Handmatig plannen, capaciteit en matching

## Wanneer gebruik je welk onderdeel?

Het planbord blijft de plek waar een planner een concrete werkbon op een datum
en tijd zet en medewerkers toewijst. De capaciteitsweergave is een controlelaag:
zij vergelijkt de benodigde personeelsminuten met de werkelijk toegewezen
deelintervallen en toont hoeveel bekende, onbekende en aandacht vragende
kandidaten er zijn. Een capaciteitsuitkomst reserveert niemand.

De kandidatenlijst gebruikt dezelfde serverbeoordeling als de uiteindelijke
planningsmutatie. Daardoor kan een kandidaat die na het openen van het paneel
verlof krijgt of een kwalificatie verliest bij opslaan alsnog worden geweigerd.

## Beschikbaarheid begrijpen

Fieldgrid beoordeelt een concreet tijdvak in deze volgorde:

1. Een harde afwezigheid, ziekteblokkade of overlappende inzet blokkeert.
2. Een expliciet beschikbaarheidsblok kan de vaste weekvoorkeur vervangen.
3. Daarna geldt de bevestigde vaste weekbeschikbaarheid uit de personeelsapp.
4. Zonder bevestigde bron is de beschikbaarheid onbekend.

Onbekend telt niet als zekere vrije capaciteit. Het is wel mogelijk een
medewerker eenmalig te plannen als alle harde voorwaarden slagen. Bevestig dan
de waarschuwing en leg bij die medewerker een zakelijke reden vast. Die reden
geldt alleen voor deze inzet. Medische opmerkingen worden niet aan het planbord
doorgegeven.

## Een werkbon plannen

1. Open **Planning** en kies dag of week.
2. Open de werkbon en controleer het volledige uitvoeringsvenster.
3. Bekijk kandidaten. Lees naast de geschiktheid ook de concrete blokkades en
   ontbrekende gegevens.
4. Wijs medewerkers met hun eigen begin- en eindtijd toe.
5. Bevestig zachte waarschuwingen en vul per afwijkende medewerker een reden in.
6. Sla op. De server controleert overlap, afwezigheid, functie en kwalificaties
   opnieuw onder dezelfde planningslock.
7. Controleer in Capaciteit of elk deelinterval voldoende mensen bevat.

Twee medewerkers die ieder één helft uitvoeren, leveren tijdens geen enkel
moment twee gelijktijdige medewerkers. Fieldgrid toont daarom bezoekduur,
personeelsminuten en ontbrekende minuten afzonderlijk.

## Vrijgeven

Vrijgeven maakt de bon beschikbaar in de personeelsapp. De server controleert
op dat moment opnieuw de actuele harde inzetvoorwaarden en de dekking gedurende
het hele venster. Een planner kan een onderbezette bon niet vrijgeven. Eigenaar
of management kan een aantoonbare onderbezetting bewust accepteren met een
reden; die afwijking wordt afzonderlijk geaudit. Harde afwezigheid, overlap of
een ontbrekende verplichte kwalificatie kan niet zo worden omzeild.

## Veelvoorkomende meldingen

- **Beschikbaarheid onbekend:** vraag de medewerker of planning om een rooster
  vast te leggen, of bevestig alleen deze inzet met een reden.
- **Buiten vaste beschikbaarheid:** controleer datum, lokale tijd en nachtwerk;
  bevestig uitsluitend een afgesproken afwijking.
- **Medewerker niet inzetbaar:** open de genoemde harde reden. Pas de bron aan,
  selecteer een andere medewerker of wijzig het tijdvak.
- **Onvoldoende dekking:** verleng de inzetten of voeg personeel toe. Management
  gebruikt de afwijkingsreden alleen wanneer onderbezet vrijgeven bewust is.
