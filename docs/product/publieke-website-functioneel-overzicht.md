# Fieldgrid — productbrief voor de publieke website

Stand: 10 oktober 2026. Dit document vertaalt de actuele codebase naar een
bruikbare inhoudsstructuur, productuitleg en concrete websitevoorbeelden.
[De bronanalyse](../releases/codebase-analyse-2026-10-10.md) onderbouwt de functies.
De kennisbank en Productbeheer behoren tot 1.1.0-kandidaten op staging; de
vrijgegeven productiebaseline is 1.0.0. Publiceer nieuwe productbeloften pas
wanneer de bijbehorende versie voor klanten daadwerkelijk beschikbaar is.

## Kern van het product

Fieldgrid verbindt het werk van dienstverlenende bedrijven: klanten en locaties,
aanvragen en offertes, personeel en planning, uitvoering en rapporten, facturen
en ondersteuning. Iedere groep krijgt een eigen werkruimte rond dezelfde
gekoppelde registraties. De planner hoeft een uitgevoerde werkbon niet opnieuw
over te typen voor rapportcontrole; de klant hoeft geen algemeen bedrijfsdossier
te openen om zijn eigen bezoek of rapport te bekijken.

Een bruikbare kernbelofte is: **Van aanvraag tot afgeronde werkbon, met iedereen
in de juiste werkruimte.** Benoem concreet wat verbonden is. Claims over
bespaarde uren, tevredenheid, beschikbaarheid of omzet vragen eigen klantbewijs
en mogen niet uit broncode worden afgeleid.

Voorbeeld voor de hero:

> Houd planning, uitvoering en klantcontact bij elkaar.
>
> Fieldgrid brengt klanten, objecten, personeel en werkbonnen samen. Plan het werk,
> geef medewerkers duidelijke opdrachten en houd rapporten, facturen en vragen
> verbonden aan het juiste dossier.

Primaire actie: **Plan een demo**. Secundaire actie: **Bekijk hoe het werkt**.
Een demoformulier en publieke leadverwerking moeten nog worden gebouwd en
ingericht; presenteer de bestaande tenantmarketingadapter niet als een algemeen
Fieldgrid-website-CMS.

## Voor wie en wat zij ermee doen

| Doelgroep | Dagelijkse vraag | Wat Fieldgrid nu ondersteunt |
| --- | --- | --- |
| Eigenaar/management | Wie doet wat en waar is aandacht nodig? | Dossiers, opvolging, managementrollen, rechten en verbonden operationele overzichten |
| Planner | Welk werk past bij welke medewerker? | Dagplanbord, bonnenbak, beschikbaarheid, conflicten, reistijd en expliciete vrijgave |
| Administratie | Wat is uitgevoerd en wat kan worden gefactureerd? | Rapportcontrole, bronversies, factuurconcepten, documenten en betaalstatus |
| Medewerker | Wat moet ik uitvoeren en hoe leg ik het vast? | Eigen planning, vrijgegeven bonnen, taken/checklists, hoeveelheden, foto's en rapportage |
| Klant/contactpersoon | Wanneer is het bezoek en wat is het resultaat? | Eigen locaties, bezoeken, vrijgegeven rapporten, offertes, facturen en meldingen |
| Support | Hoe behandel ik de vraag zonder alles door te sturen? | Afzonderlijke ticketpublieken, interne notities, gecontroleerde escalatie en kennisartikelen |

Dienstverlening en werk op klantlocaties zijn herkenbare toepassingen. Gebruik
schoonmaak, onderhoud of andere branches als voorbeelden wanneer de getoonde
workflow daadwerkelijk past. Vermijd specifieke certificerings-, salaris- of
branchespecifieke planningsclaims die het product niet ondersteunt.

## De volledige werkstroom uitleggen

1. **Leg de vraag vast.** Een aanvraag wordt gekoppeld aan prospect/klant en
   locatie. Beheer contactpersonen en concrete bezoekafspraken in hetzelfde dossier.
2. **Maak afspraken over het werk.** Taken, tarieven, duur en templates vormen
   de offerte. Een vastgelegde prijsversie en beveiligde reactie maken de keuze
   terugvindbaar. De PDF en verzending horen bij die offerte.
3. **Maak en plan de werkbon.** Kies datum, taken, object en medewerkers. Het
   dagplanbord helpt met beschikbaarheid, conflicten, bonnenbak en reistijd.
   Een concept of geplande bon is nog geen vrijgegeven personeelsopdracht.
4. **Geef bewust vrij.** Dezelfde vrijgavefunctie werkt vanuit dossier, lijst
   en planbord. Rechten, medewerkerstatus, datum, taken en revisie worden gecontroleerd.
5. **Voer uit en rapporteer.** Medewerkers zien eigen vrijgegeven opdrachten,
   registreren bijdragen, aantallen, materialen, foto's en afwijkingen. Meerwerk
   volgt de vastgelegde afspraken; extra tijd is niet vanzelf extra facturatie.
6. **Controleer het resultaat.** De backoffice beoordeelt gezamenlijke rapporten,
   vraagt waar nodig een correctie en verwerkt de ingestelde ondertekening.
   Vrijgegeven rapportversies kunnen beschikbaar worden voor de gebonden klant.
7. **Factureer en volg op.** Maak factuurconcepten en documenten, verstuur een
   beschikbaar betaalverzoek en volg daadwerkelijke betaling. Online betalen
   vereist een geverifieerde providerkoppeling voor die tenant.
8. **Behandel vragen in context.** Klant of medewerker opent een ticket. De
   tenant antwoordt of escaleert een gecontroleerde technische omschrijving.
   Support voegt een passende kennisartikellink toe en verzendt een bewust antwoord.

Deze reeks leent zich voor een interactieve, compacte website-sectie met acht
stappen en echte productbeelden. Maak geen fictieve automatisering zichtbaar:
controle, vrijgave, escalatie en publicatie zijn bewuste handelingen.

## Functies die een eigen pagina verdienen

### Planning en werkbonnen

Toon het dagplanbord met medewerkers, bonnenbak en reistijd. Leg uit dat werkbonnen
kunnen worden gepland, aangepast, vrijgegeven, gekopieerd en gesplitst. Conflicten,
beschikbaarheid en huidige gegevens helpen de planner keuzes maken. Reistijd heeft
een berekende bron en een handmatige afwijkingsmogelijkheid. Dezelfde opdracht
blijft herkenbaar wanneer de medewerker uitvoert en de administratie controleert.

Screenshot: een fictieve tenant met twee medewerkers, een geplande en een
vrijgegeven bon, plus een zichtbaar reistijdvlak. Vermijd de belofte van live
GPS, actuele files, automatische optimale routeplanning of voorspellende AI.

### Klanten en Object 360

Een klantdossier brengt contacten, afspraken, documenten, financiële context en
gekoppelde werkzaamheden bijeen. Het objectdossier gaat over de locatie: ruimtes,
programma's, instructies, kwaliteit, documenten en bezoeken. Bevoegd gebonden
gebruikers kunnen expliciet toegestane informatie openen. Vertrouwelijke
toegangsgegevens volgen extra rechten en gebruiksvensters.

Websitevoorbeeld: “De locatiegegevens en uitvoeringsafspraken staan bij het
object waarvoor je werkt.” Toon instructie, bezoek en rapport als verbonden
onderdelen. Noem dit geen universele documentkluis voor ieder bestand of iedere rol.

### Personeel en de mobiele app

Eigen planning, werkbonuitvoering, rapportage, uren, beschikbaarheid/verlof,
documenten, nieuws en meldingen zijn aanwezig. Onboarding en uitnodiging begeleiden
de start; nummering, functies, kwalificaties en personeelsdossiers ondersteunen
beheer. De installeerbare personeelsapp is een PWA voor geschikte browsers op
Android en iPhone, met platformafhankelijke installatiebediening.

Toon onboarding, eigen dagplanning en een taakregistratie. Benoem de mogelijkheid
om op het startscherm te installeren. Zeg niet dat de app in de App Store of
Play Store staat, volledig offline werkt, loonverwerking doet of alle mobiele
browsers exact hetzelfde ondersteunen. Fysieke apparaatacceptatie blijft nodig.

### Aanvragen, offertes en finance

Aanvraag, offerte, taken/tarieven, bronversie en beveiligde reactie maken
commerciële afspraken terugvindbaar. Uitvoering en rapportcontrole verbinden die
afspraken met factureerbaar werk. Factuurconcepten, definitieve documenten,
bundeling, verzending, betaalverzoeken en gedeeltelijke betaling zijn aanwezig.

Gebruik een voorbeeld met vaste taken, gecontroleerd meerwerk en een factureerbaar
rapport. Online betaling is optioneel en afhankelijk van de geverifieerde Mollie-
koppeling. Geen claim over automatische boekhoudsynchronisatie, fiscale advisering,
Mollie Connect voor iedere merchant of Fieldgrid-abonnementsbilling.

### Het klantenportaal

De klant ziet eigen objecten, bezoeken, vrijgegeven rapporten, aanvragen/offertes,
facturen/betaalverzoeken, nieuws, profiel en tickets. Account-, klant- en
objectbindingen bepalen de toegang. Een aangeboden offerte kan worden beoordeeld;
een concreet bezoek kan worden aangevraagd. Dit geeft transparantie rondom het
eigen werk zonder het bedrijfsdashboard beschikbaar te maken.

Toon een eigen object met afspraak, rapport en factuur. Voorwaarden: de tenant
heeft de module en de klant is expliciet uitgenodigd/gebonden. “Iedere klant kan
direct alles zien” is geen juiste productbelofte.

### Tickets, support en kennisbank

Personeel en klanten kunnen de tenant een vraag stellen. Behandelaren gebruiken
status, prioriteit, toewijzing en termijnen volgens openingstijden. Interne
notities zijn apart. Een technische escalatie naar Fieldgrid deelt bewust gekozen
informatie en schone bijlagen. Het oorspronkelijke en geëscaleerde gesprek houden
hun eigen publiek en status.

De 1.1.0-kandidaat voegt 46 uitgebreide handleidingen toe voor vier portalen,
met slim Nederlands zoeken, verwante artikelen en linkinvoeging vanuit tickets.
Alleen platformadmins redigeren. Support kan passende gepubliceerde uitleg lezen
en delen. De ingelogde bibliotheek is geen publiek supportarchief; een openbare
selectie zou een eigen beoordeelde publicatiegrens krijgen.

### Huisstijl, rollen en doorontwikkeling

Tenantlogo en kleuren volgen de organisatie. Logo en tenantnaam zijn alternatieven
in de merkpositie. White-label beïnvloedt onder meer installatiebranding; een
eigen appdomein is mogelijk na registratie en daadwerkelijke DNS-/TLS-/Auth-inrichting.
Managementrollen kunnen pagina-/functierechten krijgen. Eigendomsoverdracht is
een gecontroleerde actie, geen vrijblijvende rolwijziging.

Roadmap & updates en tenantideeën behoren tot 1.1.0. Ze geven gerichte informatie
over voortgang en releases en een private manier om ideeën in te dienen. Planning
blijft indicatief; publicatie verandert geen deployment of modulebeschikbaarheid.

## Voorgestelde sitestructuur en inhoud

| Pagina | Inhoud | Bewijs/actie |
| --- | --- | --- |
| Home | Kernbelofte, volledige keten, vier werkruimtes, drie productbeelden | Demo en producttour |
| Hoe het werkt | Acht stappen van aanvraag naar opvolging | Verbonden fictieve voorbeeldcase |
| Planning & werkbonnen | Planbord, beschikbaarheid, reistijd, vrijgave | Planbord en uitvoeringsbeeld |
| Klanten & objecten | Dossiers, locaties, instructies en rapporten | Object 360-voorbeeld |
| Personeelsapp | Eigen werk, registratie en installatie | Android-/iPhone-uitleg en echte apparaatbeelden |
| Klantenportaal | Eigen afspraken, documenten en servicevragen | Gebonden klantvoorbeeld |
| Offertes & facturen | Afspraken, rapportcontrole en betaling | Voorbeeld met optionele providerkoppeling |
| Support | Ticketketen, kennisbank en duidelijke contactroute | Geen fictieve 24/7-belofte |
| Veiligheid | Toegangsgrenzen, private bestanden en tenantbindingen | Controleerbare uitleg, geen verzonnen certificering |
| Over Fieldgrid | Aanpak, doelgroep en productprincipes | Echte bedrijfsgegevens en contact |
| Demo/contact | Behoefte, bedrijf, contact en opvolging | Nog te bouwen formulier/leadworkflow |

Prijzen, pakketten, SLA, proefperiode, privacyverklaring en voorwaarden vragen
concrete bedrijfsmatige keuzes. De codebase biedt daar geen geldige tarieven of
juridische teksten voor. Een publieke loginactie kan verwijzen naar de juiste
tenantomgeving; zij mag geen onbekende tenant kiezen of toegang creëren.

## Veelgestelde vragen voor een toekomstige website

**Is Fieldgrid alleen voor planners?** Nee. Management, planning, administratie,
medewerkers, klanten en support hebben verschillende werkruimtes en bevoegdheden.
Welke onderdelen iemand kan gebruiken hangt af van actieve modules en rechten.

**Kan personeel de app installeren?** De personeelsapp is een PWA. Ondersteunde
Androidbrowsers kunnen een installatieprompt bieden; op iPhone loopt installatie
via Safari. De instellingen bevatten installatiehulp. Volledige offline uitvoering
is nog geen huidige functie.

**Krijgt een klant het bedrijfsdashboard?** De klant krijgt een eigen portaal
met expliciet gebonden gegevens. Rapporten worden pas zichtbaar na de passende
vrijgave. De tenant beheert uitnodiging en toegang.

**Kan ik mijn eigen logo en domein gebruiken?** Logo en kleuren zijn instelbaar.
White-label en een eigen appdomein zijn ondersteunde inrichtingsmogelijkheden,
met afzonderlijke technische voorwaarden. Alleen een domein invullen maakt DNS
en TLS niet automatisch gereed.

**Hoe loopt ondersteuning?** Een servicemelding wordt door de tenant behandeld.
Fieldgrid kan een apart technisch ticket ontvangen met geselecteerde informatie.
Bevoegde supportmedewerkers kunnen antwoorden en passende handleidingen delen.
Reactietermijnen volgen de daadwerkelijk afgesproken ondersteuning.

**Zijn online betalingen mogelijk?** Ja, via een correct geverifieerde tenant-
providerkoppeling. Factuur-/betaalstatus volgt actuele gegevens en providercontrole.
Het is geen algemene bank- of boekhoudintegratie.

## Productclaims en vervolgstappen

Gebruik fictieve gegevens en echte schermen voor productbewijs. Laat geen
OTP-codes, klantnamen, toegangsinstructies, privéberichten of providercredentials
in screenshots zien. De bestaande Fieldgrid-SVG's en gedeelde UI vormen de basis
voor logo, kleuren, typografie en iconen. De Veele-marketingadapter is een aparte
tenantwebsite en moet niet als Fieldgrid-merkwebsite worden hergebruikt zonder
een expliciete ontwerpkeuze.

Meetbare klantresultaten, uptime, certificeringen, volledig offline werken,
AI-planning, externe boekhoudkoppelingen, GPS-tracking, openbare roadmap en
zelfbedienbare abonnementen zijn geen aangetoonde huidige beloften. Mogelijke
vervolgfuncties zijn provider-/queuecockpit, SLA-rapportage, kennisfeedback,
tenantlifecycle, commerciële abonnementen en externe koppelingen. Beschrijf ze
als plannen wanneer ze worden besproken, met afzonderlijke beschikbaarheid.

Een praktische bouwvolgorde is eerst Home, Hoe het werkt, productpagina's en
Demo/contact; daarna echte klantcases en een geselecteerde publieke hulplaag.
Werkelijke formulieren, leadrouting, consent, analytics en contentbeheer horen
bij die toekomstige websiteopdracht. Dit document levert de uitgebreide
inhoudelijke basis, geen alvast gepubliceerde website.
