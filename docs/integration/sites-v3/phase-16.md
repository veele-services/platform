# Nieuws, kennisbank en updates met werkelijke inhoud

T15 is lokaal geïmplementeerd en getest tegen het eigen `server.js` uit de verpakte productiebuild van runtimecommit `d4278440a9adc477ee35e32f595696bb2a13d9e6`. Niet gedeployed of live geverifieerd. De andere open matrixrijen en integrale releaseacceptatie blijven open.

| Onderdeel | Keuze | Concrete aansluiting |
| --- | --- | --- |
| Informatiepagina's | Overnemen | ORGANISATIE, de drie bronkolommen Bericht/Categorie/Bekijken, rijlinks, pijlactie en compacte artikelvensters. |
| Nieuws | Hergebruiken | Native nieuwsopslag, publiceren, pushkeuze, persoonlijke leesregistratie en intrekken met behoud van historie. |
| Nieuwsgegevens | Uitbreiden | Gericht authenticated RLS-readmodel en private/no-store-API, zonder brede HR-workspace of lezeridentiteiten. |
| Kennisbank | Behouden | De bestaande uitgebreide redactionele bibliotheek, doelgroep/publicatie, zoekindex, stabiele links, verwante artikelen, volledige tekst en uitsluitend platformredactie. |
| Productinformatie | Behouden | Native releases/wijzigingen, doelgroep, geregistreerde beschikbaarheid, roadmap, eigen tenantideeën en servermutaties. |
| Vensters en filters | Uitbreiden | Dezelfde bronframes; volledige informatie uitklapbaar, oorspronkelijke formulieren en controle op onopgeslagen invoer. |

Er zijn in deze fase geen schemawijzigingen of nieuwe mailinstellingen. De prototypesamenvattingen worden niet als productie-nieuws, releases of een volledige kennisbank geïmporteerd. De runtime toont echte geautoriseerde database-inhoud. Vergelijkingsfixtures zijn fictief en na de controle gearchiveerd; hun accounts en sessies zijn ingetrokken.

## Afzonderlijk gemotiveerde integratieverschillen

- De broninformatiepagina's hebben geen schrijf- of zoekbediening. De bestaande publiceerknop, zoeken, categorieën, filter, roadmap, ideeën en paginatie blijven bereikbaar via compacte aanvullende bediening met de gedeelde elementen. Op mobiel vraagt die noodzakelijke bediening een extra regel in de kop. Nieuws behoudt een driepuntsactie voor intrekken. Dit is geen vervanging van de tabel door kaarten of een nieuw dashboard.
- Nieuws gebruikt Teamnieuws, Concept of Ingetrokken als werkelijke aanduiding. Een tenantbericht krijgt geen fictieve Fieldgrid-afzender. Het venster toont de publicatietijd in de tenanttijdzone en de eigen leesstatus. De native leesregistratie is persoonlijk; er wordt geen generieke medewerkers-leestelling gesuggereerd of lezeridentiteit doorgegeven.
- Nieuws publiceren en intrekken hergebruiken de bestaande serveracties, module/rol/canonieke schrijfrechten, RLS en publicatie/pushfunctie. Deze fase vervangt de native publiceerketen niet door een nieuwe transactie of mailer en claimt daarvoor geen nieuwe idempotentiegarantie. Bij een niet bevestigde netwerkuitkomst blijft de invoer behouden met de instructie eerst de lijst te controleren. Er wordt geen fictief succes getoond.
- De kennisbank houdt de bestaande zoekrangschikking en alfabetische volgorde; de volgorde van drie demonstratieartikelen bepaalt geen productiedatabasevolgorde. Het vergelijkingsbeeld gebruikt een werkelijk geselecteerde categorie. De samenvatting opent in het bronvenster; de uitgebreide tekst, inhoudsopgave en verwante informatie blijven uitklapbaar. De stabiele artikelpagina blijft rechtstreeks te openen en te delen. De volledige redactie-, publicatie- en versiegeschiedenis voor platformbeheerders is niet verwijderd.
- Releases en roadmap behouden de compacte bronsamenvatting. De bestaande versie, wijzigingen en afzonderlijke staging-/productiebeschikbaarheid staan onder Volledige informatie en wijzigingen. Niet geregistreerde beschikbaarheid verschijnt ook werkelijk als niet geregistreerd. De beperkte bronpreview vervangt geen native productinformatie of tenantideeënbeheer. Ideeën gebruiken het volledige oorspronkelijke formulier binnen het bronframe; annuleren en verlaten waarschuwen bij onopgeslagen invoer.
- Bij intrekking van toegang verdwijnen geopende informatie en oude lijsten. Het kennisbankverzoekbeheer negeert oudere antwoorden na een nieuw verzoek of een definitieve weigering; dit geldt ook voor de bestaande portaalweergaven. De nieuwe nieuwsadapter bewaart expliciet de personeelsgrens: personeelsaccounts krijgen geen backoffice-API en de backofficepagina verwijst naar `/staff`. De personeelsnieuwsfunctie zelf blijft native.
- Extra filtervelden hebben expliciete toegankelijke namen. Een actie die een formulier opent sluit het filter via zijn gecontroleerde state; rechtstreeks verwijderen van het HTML-attribuut wordt niet gebruikt. De bestaande herstelregels voor focus, cursor en cosmetische filtervoorkeur blijven intact. Er wordt geen bedrijfsdata in browseropslag toegevoegd.

## Geteste ketens en bekeken beelden

De 53 native kennisbank-, productbeheer- en notification-deliverycontroles slagen. Zij omvatten publicatie versus concept, uitgebreide bibliotheek, zoekwoorden/synoniemen, versies, scopes, actuele sessie/intrekking, tenantideeën, private bestanden en outbox-/inboxgrenzen. Dit is geen bewijs van nieuwe externe mailbezorging.

De geauthenticeerde browserketen slaagt tegen het daadwerkelijke standalone-archief met echte lokale Auth, PostgreSQL en Next-serveracties:

- Twee nieuwsberichten werkelijk publiceren, de native personeelsleesregistratie opslaan, alleen de eigen leesstatus teruggeven, de volledige tekst openen en één bericht daadwerkelijk intrekken. Een afzonderlijk echt ingelogd personeelsaccount krijgt 403 op de nieuwe API en een 307-verwijzing naar `/staff` bij de backofficepagina.
- Werkelijk gepubliceerde artikelen ophalen, categorie selecteren, meer dan 300 woorden in het volledige artikel openen en de stabiele artikelpagina volgen. De tenantlezer heeft geen redactiebesturing; een directe archiveeropdracht wordt op de server geweigerd.
- Een echte, voor deze tenant geselecteerde release met een echte gepubliceerde wijziging lezen. De volledige informatie blijft bereikbaar. Een nieuw tenantidee wordt via het oorspronkelijke formulier precies één keer ingediend; annuleren van de weggooien-vraag behoudt de ingevoerde titel.
- Intrekking van kennisbanktoegang terwijl een eerder geautoriseerd lijstantwoord wordt vastgehouden: geopend artikel en rijen verdwijnen en het oude antwoord herstelt niets. Vervolgens actuele nieuwsleesrechten intrekken en de geopende nieuwsinhoud wissen. Ook private/no-store, strikte query en anonieme weigering zijn gecontroleerd. Geen browserfouten.

De bestaande commerciële filterketen slaagt opnieuw tegen hetzelfde archief: echte RSC-verversing én documentreload behouden filter, focus en invoer; nieuwe intake verschijnt; wissen, Escape en buitenklik blijven gesloten na verversen.

Alle 36 bron-/doelbeelden van de drie lijsten en drie compacte vensters zijn bekeken op 1440, 768 en 390 px. Ook het uitgebreide artikel en de uitgeklapte release op mobiel zijn bekeken. Na het verbeteren van de synthetische artikelinhoud zijn de resterende identieke beelden via SHA256 gecontroleerd en de drie gewijzigde nieuws-tijdstempelbeelden opnieuw bekeken. De vergelijkingsgrens is hoofdinhoud/venster; de buitenshell blijft T17. Native aanvullingen en de gegevensvolgorde hierboven zijn zichtbare, afzonderlijk gemotiveerde verschillen.

De volledige unitset slaagt: 1.938 tests in 200 bestanden. Gerichte ESLint zonder waarschuwingen, de TypeScript-controle van de koude productiebuild, 106 gegenereerde pagina's, het verpakken van uitsluitend de getraceerde runtime, de archiefstart en de lokale healthcheck met exacte SHA en gereedstaande database/scanner slagen. Deze lokale build is geen CI-deploymentattestation, stagingpromotie, productiepromotie of live gebruikersacceptatie. Zie `evidence/phase-16/verification.json`.
