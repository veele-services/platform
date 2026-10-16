# Brongetrouwe taken met native tarieven, meerwerk en templates

Lokaal geïmplementeerd en getest; niet gedeployed of live geverifieerd. Dit levert de takenpresentatie uit T05. De overige matrixrijen blijven afzonderlijk open.

| Onderdeel | Keuze | Concrete aansluiting |
| --- | --- | --- |
| Takenlijst en detail | Overnemen | De vier bronkolommen, recordknop, badge, oogicoon, titel en detailvelden van `OtherTenantPage`. |
| Taakmutaties | Hergebruiken | Bestaande serverautorisatie, versiecontrole, idempotentie en onveranderlijke tariefrevisies. |
| Volledig beheer | Behouden/uitbreiden | Native categorieën, nummering, uitvoeringsbewijzen, meerwerkregels en werkbonbinding via `/app/taken/beheer`. |
| Templates | Hergebruiken | Werkelijke concepten, publiceren en opvolgversies; gepubliceerde checklistvragen blijven bewaard. |
| Laden | Beperken | Gerichte catalogus/workspacegegevens; geen volledige klanten-, factuur-, bestanden- of handtekeningenadministratie nodig voor deze lijst. |

## Minimale integratieverschillen

De bronlijst heeft geen zoek-/paginatiebediening. De bestaande filter-, sorteer- en paginatiemogelijkheden blijven behouden via gedeelde broncomponenten. Het detailvenster krijgt een compact actiemenu voor de volledige native taakeditor en archiveren. Deze velden en processen kunnen niet door het eenvoudige prototypeformulier worden vervangen. `Bewaren in demo` wordt `Opslaan`; een geslaagde opslag blijft in hetzelfde venster zichtbaar. De echte versievoetregel vervangt de prototypeaanduiding.

Onbekende duur, prijs of btw wordt niet stilzwijgend nul. Een taak zonder volledige revisie toont dit expliciet; de volledige editor kan de eerste revisie vastleggen. Een verloren serverresponse houdt de invoer en mutatie-ID vast voor een veilige herhaling. Intrekking van de catalogusbevoegdheid sluit geopende details en wist eerder geladen gegevens, zonder een fictieve lege lijst te tonen.

De volledige native editor gebruikt het gedeelde bronvenster, inclusief dirty-/busycontrole en de bestaande twee stappen. De presentatiecontext voorkomt dubbele uitlegblokken binnen de Sites-omgeving. De standaardpresentatie van andere portalen blijft bestaan. De aanvullende native templatebeheerpagina behoudt zijn werkelijke checklist- en ondertekenfuncties.

## Bekeken en getest

Alle twaalf bron-/doelbeelden van lijst en detail zijn bekeken op 1440, 768 en 390 px. Kolommen, fonts, spacing, tabelframe en responsive detailgedrag sluiten aan. De extra filter/paginatie en het native actiemenu zijn hierboven verantwoord. Ook de volledige editor op drie breedtes, gekoppeld meerwerk en de echte gepubliceerde checklistpagina zijn bekeken. Captures gebruiken CDP zonder tijdelijke screenshotstijl en wachten op de gebruikte fonts.

De browserketen slaagt tegen het echte verpakte `server.js` van de koude productiebuild. Echte lokale Auth, SSR, serveracties, PostgreSQL en herladen zijn gebruikt. De test verliest bewust een response ná de succesvolle servermutatie: herhalen maakt geen derde tariefversie. Een latere volledige tarief-/bewijswijziging laat de oorspronkelijke werkbontaak en historische prijs intact. Categorie, uniek taaknummer, actieve meerwerkregel en binding aan een bestaande werkbon worden daadwerkelijk opgeslagen. Checklistconcept, publicatie en opvolgconcept behouden de gepubliceerde vraag. Archiveren bewaart revisies. Intrekking wordt ook servermatig afgewezen. Geen browserfouten.

De 15 native taak-/historiecontroles en twaalf navigatie-units slagen. Gerichte ESLint slaagt. De koude productiebuild controleert ook TypeScript inclusief de presentatiecontext. De eerdere afzonderlijke typecheck is ter herkomst opgenomen; de koude build is het recentere bewijs. Deze fase bevat geen migratie. Het afzonderlijke herstel van bestaande RLS-helperrechten staat in `rls-helper-repair.md`.

Zie `evidence/phase-11/` en `standalone-packaging.md`. Volledige replay/upgrade, definitieve releasecontroles en alle resterende matrixrijen blijven vereist.
