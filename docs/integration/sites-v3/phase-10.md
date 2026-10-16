# Brongetrouwe personeelslijst met native HR- en uitnodigingsketen

Lokaal geïmplementeerd en getest; niet gedeployed of live geverifieerd. Samen met fase 8 en 9 zijn de drie lijsten en relatievensters uit T06 overgenomen. T17 en de overige matrixrijen blijven afzonderlijk open.

| Onderdeel | Keuze | Concrete aansluiting |
| --- | --- | --- |
| Personeelslijst | Overnemen | Zeven bronkolommen, filter, Actie nodig, plusknop, twee rijiconen, paginatie en responsive gedrag van `EntityPage`. |
| Dossierpreview | Hergebruiken/uitbreiden | Vier brontabs met echte identiteit, toegewezen werk, private documenten en opvolging; bestaande HR-view-audit blijft bestaan. |
| Directorygegevens | Hergebruiken/beperken | Bestaande veilige personeelskolommen, functies, kwalificaties en geautoriseerde samenvatting. De lijst laadt geen volledige klanten-, factuur-, documenten- of werkbonadministratie. |
| Bewerken en beheer | Hergebruiken | Native revisiecontrole, volledige editor, functies, kwalificaties, beschikbaarheid, uploads, deactivering en volledig dossier. |
| Uitnodigen | Hergebruiken | Driestappenwizard, nummerallocator, echte Auth-accountvoorbereiding, staffbinding en globale mailservice met actuele autorisatie, policy en transportregistratie. |

De privacyprojectie is uit de bestaande workspace-loader gehaald en gedeeld met de gerichte directory-loader. De geselecteerde kolommen en lege privévelden zijn inhoudelijk gelijk gebleven. Huisadres, geboortedatum, noodcontacten, mobiele privécontactgegevens en dossiernotities worden niet aan de lijst toegevoegd. Een planner krijgt het bestaande beperkte profiel, zonder HR-bestanden, bewerken of uitnodigen. Het detailvenster toont deze afscherming expliciet en biedt geen link naar een onbereikbaar volledig HR-dossier. Het directe bestandverzoek blijft volgens de native downloadroute met 404 afgeschermd.

## Minimale integratieverschillen

- De volledige bestaande editor en uitnodigingswizard blijven binnen het gedeelde bronvenster staan. De eenvoudigere demo-editor vervangt geen bedrijfsvelden of accountbindingen. Functies, kwalificaties, documenten en deactivering blijven via het gedeelde actiemenu bereikbaar.
- Actie nodig verwijst naar de echte personeelsacties, inclusief verlof- en urencorrecties. Een verwijzing naar uitsluitend algemene opvolging zou bestaande werkprocessen wegnemen.
- Een ontbrekende kwalificatie is niet automatisch Op orde. De badge toont de native controlesignalen of werkelijk vastgelegde kwalificatiecodes; zonder registratie staat er Niet vastgelegd. Vertrouwelijke notities blijven in het oorspronkelijke dossier.
- De echte route-link voor Actie nodig heeft op mobiel dezelfde flexbreedte als de bronknop. De extra lifecycle-/dossierlinks en echte versievoetregel zijn dezelfde behouden integraties als bij klanten en objecten.

## Bekeken en getest

Alle twaalf bron-/implementatiebeelden op 1440, 768 en 390 px zijn bekeken. Typografie, kolommen, afmetingen, spacing, tabs en mobiele actieknop sluiten aan. Ook de native editor op drie breedtes, het echte documenttabblad, de uitnodigingsbevestiging en de afgeschermde plannerpreview zijn bekeken. Functionele dialoogcaptures wachten expliciet op de gebruikte fonts; zij injecteren geen tijdelijke screenshotstijl.

De volledige browserketen gebruikt echte lokale Auth, SSR, API, native serveracties, herladen, Storage en ClamAV. Een personeelsdocument is gescand, geregistreerd en via de private downloadroute bytegelijk gelezen. Het volledige HR-dossier geeft de bevoegde eigenaar een echte 200-response. Bewerken bewaart daadwerkelijk de naam; een nieuw Auth-account krijgt een staffbinding en uniek personeelsnummer. De medewerker kan via het native menu gedeactiveerd worden. Zoeken/reset, plannerafscherming en intrekking tijdens een geopend dossier zijn gecontroleerd. Geen browserfouten.

De externe SendGrid-grens is uitsluitend in de expliciete lokale testserver afgevangen. De native globale service, policy, transport en mailregistratie worden daadwerkelijk doorlopen; de fixture accepteert alleen `.invalid`-ontvangers en registreert geen activatietokens of mailinhoud. De provider-202 is gesimuleerd. Dit bewijst geen externe mailbezorging en introduceert geen productie-mailconfiguratie of tweede transport.

De 15 native databasecontroles voor relatiebronnen, HR-privacy en concurrerende personeelsnummering slagen. Daarnaast slagen 26 units, TypeScript en gerichte ESLint. Deze fase bevat geen migraties; alle oorspronkelijke migraties blijven ongewijzigd.

Zie `evidence/phase-10/`. De definitieve koude productiebuild, volledige replay/upgrade, shellcontrole en resterende matrixrijen blijven vereist. Een afgebroken ontwikkelresponse tijdens navigatie is in de ontwikkellog zichtbaar; de volledige keten slaagt. Dit wordt niet als bewijs voor een gedeployde productiebuild gebruikt.
