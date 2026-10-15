# Eén operationeel en managementoverzicht

Lokaal geïmplementeerd en getest; niet gedeployed of live geverifieerd. T01 gebruikt de bestaande canonieke `/app`-route. `/app/overzicht` verwijst met behoud van de selectie hiernaar. De oude zelfstandige overzichtsbranch is verwijderd: beide ingangen gebruiken dezelfde geautoriseerde bronprojectie.

| Onderdeel | Hergebruik / uitbreiding | Aansluiting |
| --- | --- | --- |
| Presentatie | Overnemen | `Management.tsx` → `Overview` en `ExistingDashboards.tsx` → `OperationalOverview`, met de overgenomen tokens, DOM-klassen, grafiek, zes kerncijfers, actiekaart, drie verdiepingstabbladen en bezoekmeting. |
| Operationele tellingen | Uitbreiden | Dezelfde huidige native operationele werkbonrechten; splitsingen behouden de oorspronkelijke bezoekidentiteit. Geen join op personeelsinzetten en geen financiële/HR-payload voor een grafiek. |
| Modulecijfers | Hergebruiken | Opvolging, canonieke financiële bronnen, SLA-klokken en compliance worden door hun bestaande invokerfuncties binnen één stabiele databaseprojectie gelezen. |
| Werkbonbronvenster | Uitbreiden | Bestaand werkbondossier, actuele dossierrechten, oorspronkelijke uitvoering en canonieke financiële bronregels; volledige native werkbon blijft bereikbaar. |
| Navigatie | Uitbreiden | Zowel het bestaande paginarecht als het benodigde adapterrecht bepalen zichtbaarheid; serverautorisatie blijft afzonderlijk verplicht. |
| Meldingen | Voorwaarts herstellen | Markeren-als-gelezen behoudt ook bestaande meldingen zonder getypeerde bron. De beperkingen voor CRM- en rapportmeldingen blijven bestaan. |

## Werkelijke brondefinities en rechten

Het overzicht telt uitsluitend geautoriseerde werkbonnen. Alleen een native splitsingsrelatie verenigt onderdelen tot één bezoek; vervolgwerk of een afzonderlijke opdracht blijft afzonderlijk. Cyclische of onvolledige ketens geven een fout in plaats van een onbetrouwbare telling. Het tenanttijdvak bepaalt de week/maand en de grafiekgroepen. Een afgerond bezoek vereist werkelijke uitvoering; geplande en uitgevoerde balken worden niet opgeteld.

Financiële categorieën blijven gescheiden: nog te factureren en te controleren uitvoering exclusief btw, resterende definitieve facturen inclusief btw. Factuurouderdom gebruikt echte vervaldata en deelbetalingen. Conceptfacturen worden geen schuld. Een werkbonbronvenster gebruikt dezelfde canonieke bronhelpers. Een gedeelde factuur wordt door een bestaanstoets gekoppeld, niet door een vermenigvuldigende join op regels; het volledige resterende factuurbedrag wordt expliciet als zodanig benoemd. Het venster begrenst de bronpreview en biedt het volledige dossier.

De publieke samengestelde leesfuncties blijven security invoker; bestaande invokerprojecties worden niet onder een definer uitgevoerd. De kleine interne operationele aggregatie controleert zelf de actuele sessie, tenant, rol, capabilities en oorspronkelijke native werkbonautoriteit. Er zijn geen nieuwe rechtstreeks leesbare tabellen. Een ontbrekend modulerecht betekent afgeschermde gegevens, geen verzonnen nul. Bij intrekken van rechten worden geopende details en privégegevens bij focus/verversen verwijderd. Een vreemde bron-ID, andere tenant, anonieme of verlopen sessie geeft geen toegang.

De terugkoppeling uit het bronvenster blijft voorlopig via het echte Control Center beschikbaar. De verdere integratie van inline bronacties en de niet-werkbongebonden bronpanels valt onder de nog openstaande T17-acceptatie; dit document verklaart die rij niet voltooid.

## Noodzakelijke minimale integratieverschillen

- Actuele tenantgegevens, tijdzone, peildatum, record-ID's en modulecijfers vervangen vaste demonstratiegegevens. De financiële formatter behoudt echte centen; gehele bedragen behouden de bronnotatie.
- Zonder SLA-metingen verschijnt een streep in plaats van het prototype-resultaat `NaN%`. Afgeschermde gegevens krijgen een streep of uitleg.
- De twee statische percentages van de factuurouderdom zijn werkelijke aandelen; bij nul euro worden geen geldbedragen gesuggereerd door een zichtbare balk.
- Lege kwaliteitspanels tonen de bestaande broncomponent voor een lege toestand. De demo had hier alleen een lege kaart; dit sluit aan op de expliciete eerdere opdracht voor consistente lege toestanden.
- De prototypevoetregel is vervangen door de werkelijke pakketversie en tenant/whitelabelcontext. Bezoekmetingen krijgen alleen waar nodig serverpaginatie; bronlinks openen echte dossiers.

## Controle en bewijs

`scripts/test-management-overview.mjs` controleert native modulepariteit, echte tweepersoonsplanning, een echte native splitsing, unieke bezoeken, tijdvakken, begrensde detailselecties en actuele toegang. `scripts/test-management-overview-source.mjs` doorloopt de werkelijke rapportcontrole → factureerbaar werk → definitieve factuur → deelbetaling, en vergelijkt zowel het overzicht als het werkbonbronvenster. De bestaande opvolgings- en rapporttests zijn opnieuw uitgevoerd, inclusief een regressie-orakel voor de oude markeer-alles-functie bij bronloze meldingen.

De echte browserketen gebruikt lokale Auth, SSR, API en databaseopslag: één overzicht, servermatig gemaakte opvolgactie, meetgegevens, oorspronkelijk werkbondossier, klantcontext, maandkeuze, herladen, canonieke redirect en intrekking van bron-, module- en functierechten. De drie verdiepingstabbladen zijn tegenover de ongewijzigde Sites-runtime vastgelegd op 1440, 768 en 390 px. Alle achttien inhoudsopnamen en de vier aanvullende functionele opnamen zijn bekeken. Bron/implementatie behouden dezelfde opbouw en responsive geometrie; de hierboven benoemde gegevens- en lege-toestandverschillen zijn zichtbaar vastgelegd. Definitieve vergelijking van de volledige shell en een koude productiebuild blijven een afzonderlijke releasecontrole.

De Supabase-beveiligingsadviseur geeft geen waarschuwingen. De performanceadviseur geeft bestaande adviezen voor auth-initplans en permissieve policies op bestaande tabellen; deze fase voegt geen tabellen of policies toe. Die adviezen zijn geen reden om native toegangsregels zonder afzonderlijke analyse te wijzigen. De oorspronkelijke 138 baselinemigraties zijn ongewijzigd. Migraties 161–162 zijn op de geïdentificeerde lokale stack vastgelegd/toegepast; volledige replay/upgrade en de overige scope-rijen blijven releasevoorwaarden.

Zie `evidence/phase-7/` voor testuitvoer, bekeken bronparen, functionele vensters en de afzonderlijke implementatie-/deploymentstatus.
