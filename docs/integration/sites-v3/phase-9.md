# Brongetrouwe objectenlijst en native objectketen

Lokaal geïmplementeerd en getest; niet gedeployed of live geverifieerd. Dit rondt het objectgedeelte van T06 af. De personeelsweergave en de volledige acceptatie van T06 blijven open.

| Onderdeel | Keuze | Concrete aansluiting |
| --- | --- | --- |
| Lijst en detail | Overnemen | Zeven bronkolommen, filterdisclosure, rijiconen, vier detailtabs en responsive tabel-/tabscroll uit `ExistingDashboards.tsx`. |
| Selectie en relaties | Hergebruiken | Native objecten, klantbindingen, objectrecords, bezoekverzoeken en geautoriseerde operationele werkbonnen. Alle pagina's worden opgehaald; geen stilzwijgende limiet van 1.000. |
| Nieuw en bewerken | Hergebruiken | Volledige achtstappenwizard voor nieuw en bestaande driestappeneditor, binnen het gedeelde bronvenster. Adres, ruimten, kluis- en dossiergedrag blijven bestaan. |
| Documenten | Hergebruiken | Bestaande scanner, Storage, metadata en private downloadautorisatie. |
| Lifecycle | Hergebruiken | Native revisiecontrole en archivering met behoud van ruimten, uitvoering en historie. Volledig dossier, afspraken en tijdlijn blijven bereikbaar. |

De oorspronkelijke geavanceerde filters blijven achter Meer filters beschikbaar. Werkbonnen tellen echte gekoppelde werkbonrecords, inclusief historie. Dit is geen unieke-bezoekstatistiek. Ontbrekend werkbonrecht wordt als afgeschermd weergegeven; er wordt geen onjuiste nul getoond. Ontbrekende adapterrechten leveren een expliciete toegangsweergave op voordat privégegevens geladen worden. Dit geldt nu ook voor de klantenlijst.

Het gedeelde actiemenu plaatst zijn overlay binnen het owning HTML-dialoogvenster. Een body-portal ligt anders achter de browser-toplaag en is niet bedienbaar. Dit is een noodzakelijke, minimale integratiecorrectie; de bronvormgeving en native menuacties blijven behouden. Hetzelfde menu wordt door klanten en objecten gebruikt.

## Bekeken en getest

Alle twaalf bron-/implementatiebeelden van lijst en detail op 1440, 768 en 390 px zijn bekeken. Fonts, kolommen, afmetingen, spacing en responsive gedrag sluiten aan. De echte versievoetregel en de behouden lifecycle-/dossierlinks zijn de vastgelegde integratieverschillen. Ook de native editor op drie breedtes en het echte documenttabblad zijn bekeken.

De browserketen gebruikt echte lokale Auth, SSR, database, serveracties en bestandsscanning. Een PNG is geregistreerd en via de private objectdocumentroute bytegelijk gedownload. Een bestaande locatie is gewijzigd en na herladen gecontroleerd. Een nieuw object is via alle acht stappen daadwerkelijk met een bestaande klant en twee native ruimten aangemaakt. Het zichtbare actiemenu archiveert het object met behoud van die ruimten. Zoeken/reset werkt; ingetrokken werkbonrechten schermen gekoppelde uitvoering af. Er waren geen browserfouten.

De native object-, klant- en relatiebronregressies slagen: 37 controles, waaronder objectkluis, sessiegebonden OTP, bezoekverzoeken, concurrerende acceptatie en personeelsprivacy. Navigatierechten blijven apart van canonieke paginarechten; de unitcontrole, TypeScript en gerichte ESLint slagen. Deze fase voegt geen migraties toe en wijzigt geen bestaande migraties.

Zie `evidence/phase-9/`. Definitieve replay/upgrade, koude productiebuild, volledige shellvergelijking en de overige matrixrijen blijven vereist vóór release.
