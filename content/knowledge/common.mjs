export const commonArticles = [
{
 slug: 'inloggen-met-een-eenmalige-code', title: 'Inloggen met een eenmalige code en problemen met ontvangst oplossen', category: 'Account en toegang', audiences: ['backoffice','staff','customer'], tags: ['inloggen','OTP','login','e-mail','code','geen mail'],
 summary: 'Gebruik je eigen organisatieadres en account, vraag een code aan en herken het verschil tussen een aanvraagbevestiging, een bezorgde mail en een geslaagde login.',
 body: `## Wanneer gebruik je deze uitleg?
Fieldgrid gebruikt een eenmalige inlogcode via e-mail. Je account en toegang moeten al zijn ingericht. Een code aanvragen maakt geen nieuw personeels-, management- of klantaccount aan. Open de omgeving van jouw organisatie: op staging eindigt die op .staging.fieldgrid.nl. Een productieaccount en een stagingaccount zijn afzonderlijke accounts; een code van de ene omgeving werkt niet vanzelf in de andere.

## Voor je begint
Gebruik het e-mailadres waarop je bent uitgenodigd. Controleer de domeinnaam in de adresbalk en open bij voorkeur de link uit de uitnodiging. Je kunt meer dan één rol hebben, maar de gekozen omgeving en het portaal bepalen welke gegevens je ziet. Een andere tenantnaam of een onbekend adres is aanleiding om eerst de link te controleren.

## Stap voor stap inloggen
1. Open de loginpagina van je eigen organisatie en vul je e-mailadres in.
2. Vraag de inlogcode aan. De bevestiging op het scherm is bewust algemeen: zij bewijst niet dat het account bestaat of dat de mail al is bezorgd.
3. Open de nieuwste ontvangen mail. Controleer spam, ongewenste mail en eventuele quarantaine van je organisatie.
4. Vul de volledige code in op hetzelfde inlogscherm. Deel de code met niemand, ook niet met een supportmedewerker.
5. Controleer na het inloggen of je de juiste organisatie en werkruimte ziet.

## Er komt geen nieuwe mail
Blijf niet snel achter elkaar op aanvragen drukken. De mailprovider kan aanvragen begrenzen; de afhandeling kan daardoor mislukken terwijl het scherm de algemene bevestiging toont. Een bezorglog van vanochtend bewijst niet dat jouw aanvraag van vanavond is verstuurd. Noteer de omgeving, het tijdstip met tijdzone, je accountadres en de melding op het scherm. Geef die gegevens via een veilige supportvraag door. Voeg geen codes, cookies of toegangstokens toe.

## Veelgestelde vragen
### Waarom kan support geen code voor mij invullen?
Een code bewijst dat jij toegang hebt tot jouw mailbox. Support onderzoekt accountstatus, lidmaatschap en afleverproblemen, maar hoort jouw inlogcode niet te gebruiken.

### Ik kan inloggen maar mis een pagina. Moet ik opnieuw een code aanvragen?
Meestal niet. Ontbrekende pagina's hangen vaak samen met rollen, modules of een objectbinding. Vraag de beheerder je toegang te controleren. Een nieuwe code geeft geen aanvullende rechten.

### Kan ik een oude code gebruiken?
Gebruik de nieuwste ontvangen code en volg de aanwijzingen van het scherm. Een verlopen of vervangen code geeft geen toegang. Als je een nieuwe aanvraag doet, wacht op de nieuwe mail voordat je opnieuw probeert.`,
 related: ['rollen-en-zichtbaarheid','een-goede-supportvraag-stellen']
},
{
 slug:'rollen-en-zichtbaarheid',title:'Waarom gegevens en functies per rol en portaal verschillen',category:'Account en toegang',audiences:['platform','backoffice','staff','customer'],tags:['rechten','rollen','toegang','pagina ontbreekt','module','organisatie'],
 summary:'Begrijp hoe organisaties, modules, rollen en concrete dossierkoppelingen samen bepalen wat je mag bekijken en wijzigen.',
 body:`## Eén product, verschillende werkruimtes
Fieldgrid kent platformbeheer voor Fieldgrid, tenantbeheer voor jouw organisatie, een personeelsapp en een klantenportaal. Die schermen gebruiken gedeelde gegevensbronnen, maar leveren verschillende selecties aan de gebruiker. Een medewerker krijgt zijn eigen inzet en personeelsgegevens. Een klant krijgt de objecten en bezoeken waarvoor zijn account expliciet is gekoppeld. Het platformdashboard is geen algemene ingang naar alle dossiers van tenants.

## Hoe toegang wordt bepaald
Een actieve identiteit en een geldige sessie zijn het begin. Daarbovenop controleert Fieldgrid de organisatie, de ingeschakelde modules en de toegewezen rechten. Bij klantgegevens telt een concrete klant- of objectbinding mee. Bij vertrouwelijke tickets en objectgegevens zijn extra rechten nodig. Alleen een e-mailadres kennen of een andere gebruiker op dezelfde werkbon zien geeft geen toegang tot diens dossier.

## Een ontbrekende functie onderzoeken
1. Controleer de organisatie in de adresbalk en welk portaal je hebt geopend.
2. Zoek dezelfde functie in de navigatie van dat portaal. Niet iedere backofficefunctie bestaat ook in personeel of klanten.
3. Vraag je organisatiebeheerder of de betreffende module is ingeschakeld.
4. Laat de beheerder je rol en de afzonderlijke lees- of bewerkrechten controleren.
5. Bij klanten: laat de account- en objectbinding controleren. Bij personeel: laat controleren of het medewerkerprofiel actief is.
6. Vernieuw de pagina nadat toegang is aangepast. Bewaarde tabbladen blijven onder actuele toegangscontrole vallen.

## Wat een recht niet doet
Toewijzen aan een ticket maakt iemand niet automatisch bevoegd voor dat gesprek. Een managementrol geeft niet automatisch toegang tot vertrouwelijke HR-notities. Een vrijgegeven rapport voor de klant is geen toegang tot alle interne personeelsbijdragen. De kennisbank legt functies uit; een artikel lezen schakelt de functie niet in.

## Veelgestelde vragen
### Waarom ziet mijn collega meer knoppen?
Zijn rol, gegevensbereik of moduletoegang kan verschillen. Vergelijk de benodigde taak en vraag om het kleinste passende recht, in plaats van een volledige beheerdersrol te kopiëren.

### Ik ben eigenaar. Moet ik overal bij kunnen?
Eigenaarschap omvat organisatiebeheer, maar vertrouwelijke gesprekken en beschermde objectgegevens hebben aparte grenzen. Laat zulke toegang bewust toekennen en controleren.

### Kan ik een ontbrekende pagina via een directe link openen?
Een link verleent geen rechten. Ook directe pagina's, bestanden en mutaties controleren de actuele toegang. Vraag om correcte inrichting wanneer een noodzakelijke taak ontbreekt.`,related:['inloggen-met-een-eenmalige-code','management-uitnodigen-en-rechten','klant-objecten-en-toegang']
},
{
 slug:'een-goede-supportvraag-stellen',title:'Een supportvraag stellen die snel onderzocht kan worden',category:'Tickets en ondersteuning',audiences:['backoffice','staff','customer'],tags:['support','ticket','storing','hulp','vraag','screenshot'],
 summary:'Kies het juiste gesprek, beschrijf verwacht en werkelijk gedrag en deel alleen noodzakelijke informatie. Volg daarna reacties en de voorgestelde oplossing.',
 body:`## Kies eerst de juiste ontvanger
Vragen over een dienst, afspraak, factuur of personeelszaak horen meestal bij jouw organisatie. Een klant kan daarnaast een technische portaalvraag aan Fieldgrid starten als die categorie beschikbaar is. Tenantbeheerders hebben een aparte Fieldgrid-supportwerkruimte. Wanneer een medewerkers- of klantmelding naar Fieldgrid wordt geëscaleerd, blijven het oorspronkelijke gesprek en het technische supportgesprek afzonderlijk.

## Bereid je vraag voor
Beschrijf wat je wilde doen, wat er gebeurde en wanneer je het zag. Noem de werkbon-, ticket- of factuurnummering die relevant is. Voeg je browser, apparaat, omgeving en concrete pagina toe bij een technische storing. Vertel of het probleem steeds optreedt of alleen na een bepaalde handeling. Vermeld wat je al hebt geprobeerd; zo hoeft de behandelaar niet dezelfde stappen terug te vragen.

## Een melding indienen
1. Open Tickets of Meldingen in jouw portaal, of Fieldgrid-support in tenantbeheer.
2. Maak een nieuw ticket en kies de best passende categorie.
3. Gebruik een duidelijk onderwerp, bijvoorbeeld 'Werkbon WB-102 blijft op laden na vrijgeven'.
4. Beschrijf de stappen en het verwachte resultaat. Zet een dringend gevolg erbij als dat relevant is.
5. Koppel de toegestane werkbon of objectcontext wanneer het formulier die optie aanbiedt.
6. Kies alleen noodzakelijke bijlagen en wacht op de bestandscontrole.
7. Verstuur en bewaar het ticketnummer. Reageer verder in hetzelfde gesprek.

## Bijlagen veilig en bruikbaar maken
Een schermafbeelding helpt wanneer de fout zichtbaar is. Verwijder onnodige persoonsgegevens, toegangscodes en informatie van andere klanten. Voeg nooit een inlogcode, API-sleutel, sessiecookie of export van je hele dossier toe. Bijlagen worden gecontroleerd voordat ze beschikbaar komen; een upload is niet hetzelfde als een vrijgegeven bestand.

## Reacties en afronding
Nieuwe reacties staan in het gesprek. Je kunt ook een notificatie ontvangen volgens je voorkeuren en organisatiebeleid. Als de behandelaar een oplossing voorstelt, controleer je eerst of jouw oorspronkelijke probleem is opgelost. Bevestig daarna de oplossing of beschrijf wat nog niet werkt. Bij aanvullende informatie blijft een antwoord in hetzelfde ticket beter te volgen dan meerdere nieuwe tickets.

## Veelgestelde vragen
### Waarom is mijn ticket aan iemand toegewezen maar is er nog geen antwoord?
Toewijzing organiseert het werk. Reactietermijnen kunnen openingstijden volgen en een ticket kan op jouw reactie of een externe partij wachten.

### Waarom zie ik het Fieldgrid-gesprek van mijn organisatie niet?
Een escalatie deelt geselecteerde technische informatie. De tenant controleert het antwoord voordat zij het aan jou doorgeeft. Interne notities worden niet automatisch doorgestuurd.`,related:['rollen-en-zichtbaarheid','notificaties-en-browsertoestemming','tenant-ticket-behandelen']
},
{
 slug:'notificaties-en-browsertoestemming',title:'Notificaties, e-mail en push goed instellen',category:'Communicatie',audiences:['backoffice','staff','customer'],tags:['meldingen','notificaties','push','e-mail','stille uren','bel'],
 summary:'Lees berichten in de app, stel persoonlijke voorkeuren in en controleer browsertoestemming zonder een voorkeur te verwarren met gegarandeerde bezorging.',
 body:`## Verschillende soorten meldingen
Een ticket is een gesprek met een eigen status. Een notificatie is een seintje over een gebeurtenis, met een link naar de bron. De notificatiebel toont jouw meldingen; de pagina Notificaties biedt het uitgebreidere overzicht. Een gelezen of gearchiveerde notificatie sluit geen ticket en verandert geen werkbon, afspraak of factuur.

## Persoonlijke voorkeuren kiezen
Open Mijn voorkeuren of de notificatie-instellingen van je portaal. Kies de onderwerpen en kanalen die voor jouw werk nuttig zijn. In de personeelsapp kun je ook de aangeboden pushinstellingen en stille uren bekijken. Het organisatiebeleid kan bepaalde account- of veiligheidsmeldingen verplicht houden. Je voorkeuren zijn daarom geen garantie dat ieder soort bericht volledig kan worden uitgezet.

## Push op dit apparaat activeren
1. Open de personeelsapp op het apparaat waarop je meldingen wilt ontvangen.
2. Ga naar Instellingen en kies de pushinstellingen.
3. Geef de browser of geïnstalleerde app toestemming als je daarom wordt gevraagd.
4. Controleer ook de meldingsinstellingen van Android of iOS.
5. Bij iOS gebruik je de geïnstalleerde webapp wanneer je browser dat voor webpush vereist.
6. Controleer bij een nieuw apparaat opnieuw de toestemming; toestemming verhuist niet automatisch mee.

## Een melding gebruiken
Open het bericht en bekijk de actuele bron via de aangeboden actie. Een melding kan ouder zijn dan de huidige status. Als jouw toegang tot de bron is ingetrokken, geeft de oude melding geen nieuwe toegang. Het bell-overzicht en de volledige inbox volgen dezelfde toegangsgrenzen. Je kunt gelezen markeren of archiveren zonder de onderliggende registratie te wijzigen.

## Er komt geen seintje
Controleer eerst of de gebeurtenis zelf bestaat en of jouw account de bron mag bekijken. Controleer vervolgens de persoonlijke voorkeur, browsertoestemming, stille uren en het organisatiebeleid. Bezorging kan ook door de provider of een tijdelijke storing worden vertraagd. Meld het tijdstip, de bron en het gekozen kanaal aan support; vraag niet om herhaaldelijk dezelfde gebeurtenis te veroorzaken.

## Veelgestelde vragen
### Moet ik overal e-mail én push aanzetten?
Nee. Kies een combinatie die bij jouw werkzaamheden past. De app blijft de plek om de actuele bron te controleren.

### Staat een gearchiveerd bericht nog in het dossier?
Archiveren wijzigt jouw inbox. De gebeurtenis en het dossier hebben hun eigen bewaargedrag.

### Kan een notificatie een betaling bevestigen?
De actuele factuur- of betaalstatus blijft leidend. Een losse browsermelding of terugkeerpagina is geen zelfstandig bewijs van ontvangst.`,related:['personeelsapp-installeren','een-goede-supportvraag-stellen','klant-facturen-en-betalen']
},
{
 slug:'kennisbank-zoeken-en-artikelen-delen',title:'De kennisbank doorzoeken en een artikel delen',category:'Aan de slag',audiences:['platform','backoffice','staff','customer'],tags:['kennisbank','zoeken','handleiding','artikel','FAQ','hulp'],
 summary:'Zoek op je taak of probleem, filter op categorie, volg verwante artikelen en deel een vaste artikellink. Alleen platformbeheerders kunnen inhoud aanpassen.',
 body:`## Begin bij je eigen werkruimte
De kennisbank heeft praktische uitleg voor platformbeheer, tenantbeheer, medewerkers en klanten. Je ziet artikelen die voor jouw portaal zijn gepubliceerd. Dezelfde functie kan per rol een andere handleiding hebben: een planner maakt een werkbon beschikbaar, terwijl een medewerker de vrijgegeven werkbon uitvoert. Kies daarom woorden die jouw taak beschrijven.

## Slim zoeken
Typ bijvoorbeeld 'bon vrijgeven', 'geen code', 'verlof aanvragen' of 'rapport bekijken'. De zoekfunctie weegt titels en trefwoorden zwaarder dan losse woorden midden in een artikel, gebruikt Nederlandse woordvormen en kan herkenbare typefouten opvangen. Gebruik een categorie om de resultaten te verfijnen. Een lange volledige foutmelding werkt niet altijd beter dan twee duidelijke kernwoorden. Probeer bij een leeg resultaat de functie of het gevolg van de fout te benoemen.

## Een artikel lezen
1. Open een resultaat en lees eerst het doel en de voorwaarden.
2. Gebruik de inhoudsopgave om direct naar de stappen of vragen te gaan.
3. Voer de stappen uit in de genoemde werkruimte. Een uitleg schakelt geen module of recht in.
4. Controleer het beschreven resultaat voordat je doorgaat naar de volgende fase.
5. Bekijk Verwante artikelen als een stap verwijst naar een ander werkproces.
6. Gebruik Link kopiëren om het artikel aan een bevoegde collega of behandelaar door te geven.

## Links en toegang
Een artikel heeft een vaste route. De ontvanger moet nog steeds inloggen en toegang hebben tot het bedoelde portaal. Gebruik een staginglink voor staging en een productielink voor productie. Een gearchiveerd artikel is niet meer beschikbaar voor gewone lezers; support kan dan een actueel alternatief geven. Het kopiëren van een link kopieert geen dossiergegevens of extra rechten.

## Artikelen in een ticket
Bevoegde behandelaars kunnen in het antwoordformulier artikelen zoeken voor het publiek van hun bericht. Zij kunnen een artikel eerst lezen en daarna een link in hun concept opnemen. Het concept wordt niet automatisch verzonden. Interne platformuitleg hoort niet in een antwoord aan een klant of medewerker. Controleer zichtbaarheid en ontvanger voor je verstuurt.

## Veelgestelde vragen
### Kan ik een fout in een artikel zelf aanpassen?
Alleen platformbeheerders beheren de inhoud. Geef het artikeladres en de onjuiste stap via support door, met een beschrijving van het werkelijke gedrag.

### Waarom is een artikel uit een ander portaal niet zichtbaar?
Een titel of directe link verruimt je toegang niet. Zoek de uitleg voor jouw werkruimte of vraag je behandelaar om de juiste link.`,related:['een-goede-supportvraag-stellen','rollen-en-zichtbaarheid']
}
];
