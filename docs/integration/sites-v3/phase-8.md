# Brongetrouwe klantenlijst en herbruikbaar relatievenster

Lokaal geïmplementeerd en getest; niet gedeployed of live geverifieerd. Dit is het klantgedeelte van T06. De object- en personeelslijsten moeten nog dezelfde presentatie krijgen; T06 blijft daarom uitdrukkelijk gedeeltelijk geïmplementeerd en niet als geheel geaccepteerd.

| Onderdeel | Keuze | Concrete aansluiting |
| --- | --- | --- |
| Klantenlijst | Overnemen | De zeven kolommen, primaire plusknop, filterdisclosure, rijacties, typografie, paginatie en responsive tabelscroll uit `ExistingDashboards.tsx` → `EntityPage`. |
| Klantselectie | Hergebruiken | De bestaande `customer_list` bepaalt filters, sortering, aantallen en revisies. Een invokeradapter voegt alleen geautoriseerde contact- en adresgegevens toe. |
| Dossier | Overnemen/uitbreiden | Bronvenster met Overzicht, Werkbonnen, Documenten en Opvolging; daadwerkelijke resource- en documentrechten. Dezelfde component ondersteunt ook object- en personeelsbronnen. |
| Aanmaken/bewerken | Hergebruiken | De volledige bestaande klantwizard met vijf stappen, adressen, contacten, facturatievoorkeuren, duplicaatcontrole, optimistische revisie en native servermutatie. |
| Lifecycle | Hergebruiken | Archiveren, ongebruikte klant verwijderen, contracten en facturen blijven via het dossier/actiemenu bereikbaar; geen lokale demonstratiemutaties. |
| Bestanden | Hergebruiken | Bestaande dossierregistratie, globale scanner, Storage en private download met herhaalde bronautorisatie. |

## Gegevens en toegang

Het relatievenster gebruikt een security-invokerprojectie. Native tabel- en kolomrechten blijven gelden; de interne guard controleert actuele sessie, tenant, module, paginarecht en expliciete functierechten. De klantenkaartadapter roept de bestaande klantenlijst aan en behoudt diens filters, sortering en bronrevisies. Een pagina buiten het daadwerkelijke bereik wordt teruggebracht naar de laatste geldige selectie, in plaats van een fictieve pagina 999 van 1 te tonen.

Werkbonnen worden gekoppeld via echte klant-, object- en personeelsrelaties, niet via een overeenkomst tussen voorbeeldnamen. De bestaande operationele projectie en het geautoriseerde werkbondossier leveren alleen de noodzakelijke gegevens voor de preview. Documenten tonen maximaal twintig actuele metadatarecords, met een expliciete verwijzing naar het volledige dossier voor meer gegevens. Er worden geen opslagpaden, documentbytes of fictieve voorvertoningen in het JSON-model opgenomen. Een documentlink gebruikt de bestaande private downloadroute.

Een planner behoudt het bestaande beperkte personeelsprofiel, zonder geboortedatum, huisadres, noodcontacten, privénotities of vertrouwelijke documenten. Het venster geeft die planner geen extra bewerk- of HR-rechten. Een echte personeelsdossierpreview met vertrouwelijke documentrechten houdt de bestaande view-audit; het beperkte profiel is geen volledige HR-dossierinzage. Personeelsdocumenten blijven daarnaast door hun oorspronkelijke RLS en downloadautorisatie beschermd. Ontbrekende rechten worden als afgeschermd getoond, niet als afwezige bedrijfsgegevens.

De browser houdt alleen invoer en selecties bij. Zoeken, sorteren en pagineren vragen de gehele toegestane serverselectie op; er wordt niet uitsluitend in de zichtbare pagina gezocht. Oudere verzoeken worden geannuleerd en mogen een nieuwere selectie niet overschrijven. Focus/verversen hercontroleert rechten en wist geopende privégegevens bij intrekking. Er is geen localStorage-bedrijfsdatabase, gekozen demorol of tweede lifecycle.

## Minimale integratieverschillen

- De bronvoetregel bevat de echte pakketversie. De detailvoetregel behoudt toegang tot het volledige bestaande dossier en het lifecycle-actiemenu; de twee tabeliconen en de compositie van het detailvenster blijven gelijk aan de bron.
- De uitgebreide bestaande filters en de paginagrootte staan achter Meer filters. De bronbediening voor direct zoeken, status en naamvolgorde blijft bestaan. De bestaande standaardpaginagrootte van 25 blijft behouden.
- De bron bevat een eenvoudige demonstratie-editor. De bestaande vijfstappenwizard blijft binnen hetzelfde gedeelde dialoogkader bestaan, zodat bestaande klant-, adres-, contact- en facturatievelden niet verdwijnen.
- Werkbonnen volgen echte foreign keys en personeelsinzet. Documenten openen echte beveiligde bestanden. Een getoonde profielnotitie is een bestaande zakelijke voorkeur; vertrouwelijke personeelsnotities blijven in het echte personeelsdossier.
- Escape en buitenklik sluiten het filter. De uitgebreide filters blijven binnen een kort mobiel scherm scrollbaar. Dit behoudt de bronstructuur en vult de toetsenbordbediening aan.

## Bekeken en getest

De lijst en het overzichtstabblad van het klantdetail zijn naast de ongewijzigde Sites-runtime vastgelegd op 1440, 768 en 390 px. Alle twaalf bron-/implementatiebeelden zijn bekeken. De compositie, afmetingen, fonts, kolommen, kaarten, tabs en mobiele tabel-/tabscroll sluiten aan; de hierboven beschreven voetregeluitbreidingen zijn zichtbaar vastgelegd. Ook de bestaande uitgebreide editor is op alle drie schermbreedtes bekeken. Document- en gekoppelde werkbondetails zijn daadwerkelijk geopend.

De browserketen gebruikt echte lokale Auth, SSR, API, native klantmutaties, herladen, zoeken/reset en actuele toegangsintrekking. Bewerken en een volledige nieuwe klant doorlopen de vijf bestaande stappen. Er ontstaat daadwerkelijk een contactpersoon; er wordt geen portaalaccount of opdracht verzonnen. Een echt PNG-bestand is door de bestaande upload/scanner/Storageketen geregistreerd en via de documentlink bytegelijk teruggelezen. Anonieme, vreemde en ingetrokken bronverzoeken krijgen geen toegang.

De databasecontrole vergelijkt klantenkaarten met de bestaande lijst voor meerdere filters en sorteringen, test de begrensde metadata, expliciete personeelsprivacy, huidige module-/functierechten en ongeldige/verlopen callers. De Supabase-beveiligingsadviseur geeft geen waarschuwingen. Migraties 163–164 zijn uitsluitend op de geïdentificeerde lokale stack vastgelegd/toegepast. Originele migraties en native bedrijfsfuncties zijn niet gewijzigd.

De definitieve replay/upgrade, koude productiebuild, volledige shellvergelijking en resterende matrixrijen blijven vereist vóór release. Een extra ontwikkelserverrun gaf een tijdelijke JSON-leesfout; de lokale server is herstart en de complete browserketen en extra modalvergelijkingen zijn daarna opnieuw geslaagd. Dit is geen bewijs van een reeds gedeployde productiebuild.

Zie `evidence/phase-8/` voor de daadwerkelijke resultaten en bekeken afbeeldingen. T06 als geheel, T17 en de overige scope worden hiermee niet stilzwijgend afgerond.
