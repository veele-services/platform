export const platformArticles = [
{slug:'platform-cockpit-gebruiken',title:'Dagelijks werken vanuit de platformcockpit',category:'Platformbeheer',audiences:['platform'],tags:['cockpit','dashboard','tenant','overzicht','support'],summary:'Gebruik het platformoverzicht om tenantinrichting en supportwerkvoorraad te controleren, en onderscheid configuratiesignalen van operationele storingsbewijzen.',body:`## Doel van de cockpit
De platformcockpit verzamelt de inrichting van organisaties en een samenvatting van de supportwerkvoorraad. Je kunt zien hoeveel tenants actief zijn, welke uitnodigingen aandacht vragen, waar het klantenportaal aanstaat en welke berichttemplates zijn aangepast. Supportsignalen tonen open, onbeantwoorde, niet toegewezen en verlopen tickets. De cockpit is een startpunt voor beheer; zij geeft niet automatisch toegang tot personeels-, klant- of objectdossiers.

## Een dagelijkse controle uitvoeren
1. Open Platformoverzicht op het platformadres en controleer je accountrol.
2. Bekijk de tenantstatussen en uitnodigingen. Onderzoek een mislukte uitnodiging voordat je opnieuw uitnodigt.
3. Bekijk de supportwerkvoorraad. Begin met tickets waarvoor een reactie nodig is of een termijn is verstreken.
4. Open Supportdesk en filter de lijst verder op organisatie, categorie, behandelaar of status.
5. Open een tenantdetail als een melding gaat over module-inrichting, branding of een appdomein.
6. Controleer na een aanpassing de specifieke instelling en de oorspronkelijke supportvraag.

## Wat de cijfers betekenen
Een actieve tenant is een organisatie die in de configuratie actief is. Dat is geen bewijs dat al haar gebruikers die dag hebben ingelogd. Een ingeschakeld klantenportaal betekent dat de module beschikbaar is; concrete klantaccounts en objectbindingen blijven nodig. Een open ticket is geen storingsteller: ook gewone vragen en wachtende gesprekken blijven open. Gebruik de filters en het gesprek om de betekenis vast te stellen.

## Operationele problemen onderzoeken
De cockpit bevat nog geen volledig centraal overzicht van laatste workeruitvoeringen, providerlimieten, scannerstoringen en herstelacties voor alle onzekere mails. Gebruik bij een vermoede storing de vastgelegde beheer- en deploymentprocedure en read-only diagnostiek. Een groene configuratieteller vervangt geen controle van runtimehealth en afleverstatus. Zet een technisch onderzoek in een ticket zodat tijdstip, omgeving en bevindingen traceerbaar blijven.

## Veelgestelde vragen
### Kan een supportmedewerker deze hele cockpit gebruiken?
Ondersteuning werkt met expliciete supportrechten. Tenantinrichting en brede platformbeheerfuncties blijven bij platformbeheerders. De navigatie verschilt daarom per account.

### Moet een te late reactie meteen de hoogste prioriteit krijgen?
Controleer impact, openingstijden en wat de volgende stap is. Een verstreken termijn en een urgente bedrijfskritische storing zijn verschillende signalen.`,related:['platform-tenant-aanmaken','platform-support-behandelen']},
{slug:'platform-tenant-aanmaken',title:'Een tenant inrichten en de eigenaar uitnodigen',category:'Platformbeheer',audiences:['platform'],tags:['tenant','organisatie','onboarding','eigenaar','uitnodiging'],summary:'Maak een organisatie met een geldige slug en passende modules aan, controleer de eigenaaruitnodiging en draag de dagelijkse inrichting aan de tenant over.',body:`## Wat je aanmaakt
Een tenant is de afgeschermde organisatie waar backoffice, personeelsapp en klantenportaal bij horen. De slug bepaalt het standaard tenantadres. Een account kan meerdere rollen hebben, maar een tenantadres valt nooit terug op een willekeurige andere organisatie. Kies de juiste omgeving voordat je begint: staging en productie hebben eigen gegevens en credentials.

## Benodigde gegevens
Verzamel de organisatienaam, een passende unieke slug, het eigenaaradres, tijdzone en de afgesproken modules. Controleer het e-mailadres met de contactpersoon. Een typefout kan een uitnodiging naar de verkeerde mailbox sturen. Voeg geen echte klant- of personeelsgegevens toe als je een testtenant in staging maakt.

## Stappenplan
1. Open Nieuwe tenant in platformbeheer.
2. Vul de organisatie en slug in volgens de validatie van het formulier.
3. Kies alleen de modules die voor deze organisatie moeten werken.
4. Controleer eigenaaradres, branding en overige getoonde instellingen.
5. Rond de aanmaak af en controleer het tenantdetail en de uitnodigingsstatus.
6. Laat de eigenaar via de uitnodiging en de eigen mailbox inloggen.
7. Laat de eigenaar de huisstijl, managementrollen, personeelsinrichting en eventuele klantbindingen verder instellen.

## Controle na de inrichting
Open het standaard tenantadres en controleer dat de juiste organisatie verschijnt. Een logo alleen bewijst niet dat alle modules werken. Laat een bevoegde gebruiker de afgesproken werkruimte openen en één echte taak uitvoeren. Bij een klantenportaal zijn account- en objectbindingen nodig voordat de klant gegevens ziet. Bij personeel zijn het medewerkerprofiel, de uitnodiging en het actieve lidmaatschap onderdeel van de controle.

## Een uitnodiging is onzeker of mislukt
Controleer de geregistreerde uitkomst en het tijdstip. Verstuur niet automatisch nieuwe uitnodigingen zolang onduidelijk is of de vorige aanvraag is verwerkt. De veilige afhandeling bewaart een onzekere uitkomst; er is nog geen algemene knop die ieder providerprobleem herstelt. Leg het onderzoek vast en gebruik de bestaande maildiagnostiek.

## Veelgestelde vragen
### Kan ik dezelfde tenant gewoon in staging en productie gebruiken?
De naam kan overeenkomen, maar de omgevingen blijven afzonderlijk. Een staginguitnodiging of account is geen productie-inrichting.

### Kan de slug ook meteen een eigen domein zijn?
Nee. Een eigen appdomein heeft aparte registratie, DNS, TLS en Auth-inrichting nodig.`,related:['platform-modules-beheren','platform-eigen-appdomein','platform-loginmail-onderzoeken']},
{slug:'platform-modules-beheren',title:'Modules en het klantenportaal van een tenant beheren',category:'Platformbeheer',audiences:['platform'],tags:['module','klantportaal','personeel','planning','activeren','instellingen'],summary:'Controleer welke diensten een tenant gebruikt, pas modules bewust aan en test daarna met een account dat echt aan de juiste werkruimte is gekoppeld.',body:`## Modules bepalen beschikbaarheid
Fieldgrid kent onder meer planning, personeel, rapportage, finance, tickets en het klantenportaal. De module-inrichting is een organisatiekeuze. Daarbinnen bepalen accountrechten wat een gebruiker mag doen. Een module activeren geeft dus niet automatisch iedere medewerker of klant toegang tot alle gegevens van die module.

## Een wijziging voorbereiden
Vraag welke functie ontbreekt en bij welke gebruiker. Controleer of het probleem werkelijk een uitgeschakelde module is. Een klant zonder objectbinding ziet ook na activering geen andere klantgegevens. Een manager zonder bewerkrecht krijgt door een modulewijziging geen extra beheerrecht. Noteer de omgeving en de tenant zodat je niet dezelfde instelling in de verkeerde omgeving aanpast.

## Stappenplan voor activeren
1. Open Tenants en selecteer de bedoelde organisatie.
2. Bekijk de huidige modules in het tenantdetail.
3. Schakel de afgesproken dienst in en sla de wijziging op.
4. Vernieuw de tenantwerkruimte met een bevoegd account.
5. Controleer de navigatie én de concrete functie, bijvoorbeeld het openen van de klantenomgeving.
6. Controleer indien nodig de accountbinding, rol, uitnodiging of objecttoegang.

## Het klantenportaal controleren
Voor een bruikbaar klantenportaal moeten de module, de klantaccountkoppeling en concrete objectbindingen samen kloppen. Het portaal toont eigen objecten, bezoeken en vrijgegeven informatie; het is geen algemene klantenadministratie. Vraag de tenant om één concrete klantuitnodiging en objectkoppeling te controleren. Gebruik geen platformaccount als vervanging voor de echte klantcontrole.

## Gevolgen van uitschakelen
Bestaande links en sessies blijven aan actuele moduletoegang gebonden. Een oud tabblad of bestandadres omzeilt een uitgeschakelde module niet. Bespreek vooraf welk werk hierdoor stopt en welke gebruikers nog een open taak hebben. Uitschakelen is geen archivering van dossiers en sluit niet automatisch alle open tickets of facturen.

## Veelgestelde vragen
### De module staat aan maar de gebruiker ziet niets. Wat nu?
Controleer de rol en actieve account- of objectbinding. Laat de gebruiker opnieuw de juiste tenantwerkruimte openen en noteer de concrete fout.

### Kan support modules zelf wijzigen?
Alleen wanneer het account daarvoor een echte platformbeheerbevoegdheid heeft. Supportinzage op zichzelf is geen configuratierecht.`,related:['rollen-en-zichtbaarheid','platform-tenant-aanmaken','klant-objecten-en-toegang']},
{slug:'platform-eigen-appdomein',title:'Een eigen appdomein koppelen aan een tenant',category:'Platformbeheer',audiences:['platform'],tags:['domein','DNS','Caddy','TLS','white label','appdomein'],summary:'Registreer het gewenste tenantdomein, bereid DNS en TLS gecontroleerd voor en controleer de juiste tenantresolutie voordat je het adres aan gebruikers doorgeeft.',body:`## Wat deze instelling doet
Een tenant kan een eigen adres voor de applicatie krijgen, bijvoorbeeld app.voorbeeld.nl. Dat adres is een ingang naar de tenantwerkruimtes en vervangt niet automatisch een publieke marketingwebsite. Het opslaan van een domein in platformbeheer maakt DNS, HTTPS en toegestane Auth-redirects niet vanzelf operationeel. Gebruik de repositoryprocedure voor tenant-appdomeinen voor de daadwerkelijke operatorinrichting.

## Voorwaarden
Controleer dat de organisatie het domein beheert, dat het exact bedoelde subdomein vrij is en dat het geen domein van een andere tenant betreft. Bepaal in welke omgeving het adres hoort. Een stagingadres mag geen productiegegevens of productieproviderconfiguratie gebruiken. Houd het bestaande standaard tenantadres beschikbaar tijdens de voorbereiding.

## Stappenplan
1. Open het tenantdetail en registreer het gewenste appdomein.
2. Controleer de validatie en de geregistreerde koppeling; wijs hetzelfde domein nooit aan twee organisaties toe.
3. Laat de verantwoordelijke operator de DNS-records instellen volgens het domeinrunbook.
4. Laat HTTPS/Caddy en de toegestane Auth-redirects voor dat specifieke adres controleren.
5. Controleer dat het adres de juiste actieve tenant resolveert en geen andere tenantinhoud toont.
6. Test login, backoffice, personeel, klanttoegang en een beveiligde bestandslink met passende accounts.
7. Geef het nieuwe adres pas door wanneer alle controles slagen.

## Fouten herkennen
Een DNS-fout, ontbrekend certificaat en geweigerde tenantresolutie zijn verschillende problemen. Noteer de precieze host, tijd en HTTP-uitkomst. Een fout adres moet gesloten blijven; maak geen algemene fallback naar de eerste tenant. Pas geen globale proxyroute aan op basis van een losse schermafbeelding. Behoud de gedocumenteerde omgevingisolatie en controleer de actuele configuratie voordat de operator iets wijzigt.

## Veelgestelde vragen
### Is een eigen domein hetzelfde als white-label?
Nee. Het appadres en de brandingkeuze zijn afzonderlijke instellingen. White-label bepaalt onder andere de naam en iconen van de personeels-PWA.

### Werkt het meteen nadat ik het veld heb opgeslagen?
Nee. Registratie is een noodzakelijke stap, maar DNS, certificaten en Auth-inrichting moeten afzonderlijk worden afgerond en getest.

### Welke handleiding is leidend voor de operator?
Het actuele tenant-workspace-domain-runbook in de repository. Dit artikel beschrijft het beheerproces en vervangt geen concrete hostcontrole.`,related:['platform-tenant-aanmaken','huisstijl-en-white-label','platform-release-controle']},
{slug:'platform-supportteam-inrichten',title:'Supportmedewerkers uitnodigen en hun bereik begrenzen',category:'Tickets en ondersteuning',audiences:['platform'],tags:['supportmedewerker','supportteam','uitnodigen','rechten','intrekken'],summary:'Nodig een supportaccount uit, geef expliciete ticketrechten met een passend tenantbereik en controleer dat intrekking ook voor bestaande sessies geldt.',body:`## Support is een eigen bevoegdheid
Een supportmedewerker heeft geen volledig platformbeheer nodig om technische tickets af te handelen. Het platformdashboard geeft ondersteuning een eigen navigatie en gecontroleerde toegang tot gedeelde supportgesprekken. Dat opent geen originele HR-notities, klantdossiers of alle backofficegegevens. Toewijzing van een ticket blijft afhankelijk van de echte lees- en antwoordrechten van de medewerker.

## Bereid de toegang voor
Bepaal het e-mailadres, de naam, de taken en de organisaties waarvoor de medewerker mag werken. Kies of hij gesprekken moet lezen, antwoorden, beheren of intern noteren. Configuratie en delegatie zijn aparte gevoelige taken. Gebruik geen gedeeld mailboxaccount wanneer individuele opvolging nodig is; individuele accounts maken intrekking en audit duidelijker.

## Uitnodigen en controleren
1. Open Supportteam met een platformbeheeraccount.
2. Maak de uitnodiging met het juiste e-mailadres en controleer de gegevens.
3. Ken de noodzakelijke supportrechten en het afgesproken bereik toe.
4. Volg de verificatiestappen die bij gevoelige wijzigingen worden gevraagd.
5. Laat de medewerker de uitnodiging accepteren en daarna via OTP inloggen.
6. Controleer met het nieuwe account één toegestaan ticket en één ticket buiten het bereik.
7. Controleer dat tenantbeheer en andere platformbeheerpagina's niet door de supportrol beschikbaar zijn geworden.

## Wijzigen en intrekken
Verander rechten wanneer de werkzaamheden veranderen. Intrekking moet ook bestaande sessies raken; vraag niet alleen om uitloggen als beveiligingsmaatregel. Controleer na intrekking de supportwerkruimte met het betreffende account of een gecontroleerde testidentiteit. Bestaande antwoorden en historie blijven onderdeel van het gesprek, maar geven geen blijvende toegang tot nieuwe inhoud.

## Veelgestelde vragen
### Kan een supportmedewerker zichzelf meer rechten geven?
Een supportrol is geen vrijbrief voor delegatie. Gevoelige rechtenwijzigingen hebben eigen bevoegdheid en verificatie, en zelfuitbreiding wordt beperkt.

### Waarom ziet een medewerker een toegewezen ticket niet?
Controleer eerst het tenant- en categoriebereik. Toewijzing kan het vereiste leesrecht niet vervangen.

### Moet iedere supportmedewerker alle tenants krijgen?
Nee. Geef het kleinste bereik dat nodig is voor de werkzaamheden. Een incidentele escalatie rechtvaardigt niet automatisch algemene toegang.`,related:['platform-support-behandelen','rollen-en-zichtbaarheid']},
{slug:'platform-support-behandelen',title:'Een Fieldgrid-supportticket behandelen en kennisartikelen gebruiken',category:'Tickets en ondersteuning',audiences:['platform'],tags:['supportdesk','ticket','antwoord','escalatie','kennisbank','oplossing'],summary:'Behandel gedeelde technische vragen, gebruik interne notities correct en stuur een onderbouwd antwoord met een passend kennisartikel naar de tenant of klant.',body:`## Het gesprek dat je ontvangt
Een tenant kan een technische vraag rechtstreeks stellen of een oorspronkelijke melding gecontroleerd escaleren. Het Fieldgrid-ticket bevat alleen de gedeelde informatie en geselecteerde bijlagen. Het oorspronkelijke gesprek blijft apart. Een directe technische klantmelding kan ook in de supportdesk terechtkomen wanneer de intake daarvoor is ingericht. Controleer daarom steeds wie de daadwerkelijke ontvanger van jouw antwoord is.

## Van intake naar oplossing
1. Open Supportdesk en kies een ticket binnen jouw rechtenbereik.
2. Lees onderwerp, context, laatste reactie, status en eventuele reactietermijn.
3. Neem het ticket in behandeling en wijs het toe volgens de werkafspraken.
4. Vraag ontbrekende reproduceerstappen gericht op. Gebruik geen inlogcodes of volledige gevoelige dossiers.
5. Leg onderzoek dat niet naar de melder hoort in een interne Fieldgrid-notitie vast.
6. Beschrijf het resultaat en de concrete volgende stap in het antwoord aan de ontvanger.
7. Stel een oplossing voor wanneer de vraag is beantwoord. Volg eventuele bevestiging of heropening.

## Een kennisartikel in het antwoord
Kies Artikel uit kennisbank in het antwoordformulier. De zoekfunctie stemt artikelen af op het publiek van het bericht. Lees het artikel via Artikel lezen en voeg daarna de link aan je concept toe. Controleer de tekst en klik pas vervolgens op verzenden. Een intern platformartikel mag niet in een antwoord voor personeel of klanten worden voorgesteld. Een artikel aanpassen is uitsluitend beschikbaar voor platformbeheerders.

## Escalatie correct afronden
Jouw openbare antwoord aan een tenant wordt niet automatisch naar de oorspronkelijke medewerker of klant gekopieerd. De tenant kan het antwoord voorbereiden, aanpassen en expliciet versturen. Het oplossen of sluiten van het Fieldgrid-ticket wijzigt niet stilzwijgend de status van de oorspronkelijke melding. Vermeld dus duidelijk wat de tenant moet controleren of uitvoeren.

## Veelgestelde vragen
### Mag ik de bronwerkbon aanpassen vanuit het ticket?
Een ticket verandert geen planning, uren, rapport of factuur. Laat een bevoegde gebruiker de correctie bij de bron uitvoeren en controleer daarna het gevolg.

### Waarom is een bestand nog niet beschikbaar?
Het kan nog wachten op scan of gecontroleerde kopie. Wacht op de getoonde uitkomst; omzeil de bestandscontrole niet met een externe openbare upload.

### Kan ik mijn notitie later openbaar maken?
Schrijf een gecontroleerd nieuw antwoord met uitsluitend informatie die de ontvanger mag zien. De gekozen berichtzichtbaarheid is een echte gegevensgrens.`,related:['platform-supportteam-inrichten','tenant-ticket-escaleren','kennisbank-zoeken-en-artikelen-delen']},
{slug:'platform-loginmail-onderzoeken',title:'Een ontbrekende OTP-mail onderzoeken zonder accountcodes te delen',category:'Account en toegang',audiences:['platform'],tags:['OTP','mail','429','rate limit','bezorging','login','diagnostiek'],summary:'Controleer account, omgeving, aanvraagmoment en provideruitkomst afzonderlijk. Gebruik actuele aflevergegevens en veilige diagnostiek voordat je een conclusie trekt.',body:`## Een schermbevestiging is geen bezorgbewijs
De loginpagina gebruikt een algemene bevestiging om accountenumeratie te beperken. Zij kan daarom niet bewijzen dat een account bestaat, dat een nieuwe mail is aangemaakt of dat de provider de aanvraag heeft geaccepteerd. Onderzoek altijd het concrete aanvraagmoment. Een delivered-record van eerder op de dag zegt niets over een latere aanvraag die door een limiet is geweigerd.

## Verzamel bruikbare feiten
Vraag het volledige tenantadres, staging of productie, het e-mailadres, het exacte tijdstip met tijdzone en de browsermelding. Vraag nooit de OTP zelf, een sessiecookie of een token. Laat de gebruiker niet voortdurend nieuwe aanvragen doen; dat kan de begrenzing verder belasten. Controleer of hij werkelijk op de tenantlogin zit en niet op het algemene platformadres.

## Onderzoeksvolgorde
1. Controleer dat het account bestaat, bruikbaar en bevestigd is in de juiste omgeving.
2. Controleer de actieve tenant en het passende lidmaatschap of de klantbinding.
3. Controleer of voor het genoemde moment een nieuwe aanvraag of mailrecord is vastgelegd.
4. Bekijk de provideruitkomst voor die specifieke aanvraag, bijvoorbeeld geaccepteerd, bezorgd, fout of 429.
5. Vergelijk aanmaaktijd en bezorgtijd. Een oude succesvolle mail is geen bewijs van de huidige aanvraag.
6. Geef de gebruiker een concrete vervolgstap: wachten op de begrenzing, mailboxcontrole of herstel van de juiste accountinrichting.
7. Leg bevindingen met tijd en omgeving in het ticket vast.

## Veilig gebruik van diagnostiek
Gebruik de gedocumenteerde read-only maildiagnostiek en laat geheimen buiten logs en supportantwoorden. Maak geen alternatieve mailroute met oude productiecredentials of lokale env-bestanden. Staging heeft eigen provider- en databaseconfiguratie. Een providerfout mag niet leiden tot het uitschakelen van account- of tenantcontrole.

## Veelgestelde vragen
### Het account is actief. Moet de mail dan wel verstuurd zijn?
Nee. Actieve toegang is een voorwaarde voor login, geen garantie dat de provider een aanvraag kan verwerken.

### Is 429 hetzelfde als spam?
Nee. 429 duidt op een begrenzing van aanvragen. Spam of quarantaine gaat over een mail die al bij een ontvangstsysteem is aangekomen.

### Kan ik alvast een code aan de gebruiker doorgeven?
Nee. De verificatie hoort via de eigen mailbox te lopen. Onderzoek het afleverprobleem zonder de identiteitcontrole te omzeilen.`,related:['inloggen-met-een-eenmalige-code','platform-support-behandelen']},
{slug:'platform-productbeheer-en-publicatie',title:'Roadmap, releases en tenantideeën beheren',category:'Product en kennis',audiences:['platform'],tags:['productbeheer','roadmap','release','idee','publiceren','staging'],summary:'Beoordeel tenantideeën en publiceer begrijpelijke productinformatie met een bewuste doelgroep. Houd voortgang, publicatie en beschikbaarheid uit elkaar.',body:`## Drie verschillende beslissingen
Productbeheer beheert communicatie over het product. Voortgang beschrijft onderzoek, planning, ontwikkeling, test of uitbrengen. Publicatie bepaalt of lezers een item mogen zien. Beschikbaarheid legt handmatig vast waar een functie is uitgerold. Een release publiceren voert geen deployment uit en activeert geen module. Stagingbeschikbaarheid mag daarom niet als productiebeschikbaarheid worden aangekondigd.

## Een tenantidee behandelen
1. Open Productbeheer en het onderdeel Ideeën.
2. Lees het probleem, de suggestie en het beoogde voordeel.
3. Vraag aanvullende informatie in het tenantgesprek als de vraag niet concreet genoeg is.
4. Leg interne afwegingen in een interne notitie vast; de tenant krijgt die niet mee.
5. Geef het idee de passende beoordelingsstatus en motiveer de beslissing.
6. Koppel het aan een bestaande ontwikkeling of maak een algemene ontwikkeling.

## Roadmap en release publiceren
Schrijf een titel en samenvatting die het effect voor de gebruiker benoemen. Kies de doelgroep en eventuele tenantselectie. Voeg aan een release afzonderlijke wijzigingen toe als Nieuw, Verbeterd of Opgelost. Controleer dat beperkingen van onderdelen binnen de release blijven. Bekijk het voorbeeld voor de bedoelde werkruimte. Publiceer pas nadat inhoud, doelgroep en geregistreerde beschikbaarheid kloppen.

## Aankondigen en versiebeheer
Een aankondiging is een afzonderlijke beheeractie. Deze module levert in-app communicatie; zij is geen automatische algemene e-mail- of pushcampagne. Een versienummer vertelt niet zelfstandig op welke omgeving alle onderdelen beschikbaar zijn. De repositoryprocedure bepaalt de gecontroleerde softwarepromotie. De productiebaseline en stagingrelease kunnen tijdelijk verschillen.

## Veelgestelde vragen
### Krijgt een klant alle tenantideeën te zien?
Nee. Tenantideeën zijn een beheerproces van de eigen organisatie. Personeel en klanten zien alleen voor hun doelgroep vrijgegeven productinformatie.

### Is een geplande datum een toezegging?
Planning is indicatief. Benoem onzekerheid in de tekst en gebruik het beschikbaarheidsveld om werkelijke uitrol te onderscheiden.

### Kan ik een interne ontwikkeling publiceren door alleen de status te veranderen?
Publicatie en doelgroep zijn aparte grenzen. Controleer beide bewust voordat je het item zichtbaar maakt.`,related:['platform-release-controle','kennisbank-beheer-en-versieherstel']},
{slug:'kennisbank-beheer-en-versieherstel',title:'Kennisartikelen schrijven, publiceren en een eerdere versie herstellen',category:'Product en kennis',audiences:['platform'],tags:['kennisbank','editor','concept','publicatie','versie','archiveren'],summary:'Beheer alle kennisbankteksten centraal, controleer voorbeelden en doelgroep en herstel eerdere inhoud zonder de publicatie stilzwijgend te veranderen.',body:`## Alleen platformbeheer bewerkt
De kennisbank gebruikt één centrale redactie. Platformbeheerders maken en wijzigen artikelen voor alle werkruimtes. Supportmedewerkers en tenantgebruikers kunnen artikelen raadplegen en delen binnen hun toegang, maar krijgen geen bewerkfunctie. Bestaande startartikelen zijn gewone bewerkbare databaseartikelen; een volgende softwaredeploy overschrijft jouw wijzigingen niet.

## Een nuttig artikel maken
1. Open Kennisbank en kies Nieuw artikel.
2. Kies een duidelijke titel en een vaste artikelcode. De code wordt de link en blijft na aanmaak vast.
3. Schrijf een samenvatting die het doel en de belangrijkste voorwaarden benoemt.
4. Kies categorie, trefwoorden en synoniemen. Die helpen bij zoeken en verwante artikelen.
5. Selecteer de portalen waarvoor de uitleg bedoeld is. Intern platformbeheer hoort alleen bij Platformbeheer.
6. Schrijf uitgebreide uitleg met secties, concrete stappen, resultaatcontrole en veelgestelde vragen.
7. Bekijk het voorbeeld, controleer de daadwerkelijke schermnamen en sla het concept op.

## Concept en publicatie
Opslaan wijzigt het concept. Lezers blijven de laatst gepubliceerde inhoud zien totdat je apart publiceert. Controleer daarom ook bij een bestaande publicatie de nieuwe doelgroep voordat je Publiceren bevestigt. Archiveren haalt het artikel uit de gewone kennisbank en maakt de gedeelde link onbeschikbaar voor lezers. Je kunt de inhoud later aanpassen en opnieuw publiceren.

## Versieherstel
De versiegeschiedenis toont opgeslagen, gepubliceerde, gearchiveerde en herstelde versies. Kies Herstellen bij de gewenste eerdere inhoud. De inhoud wordt teruggezet als het actuele bewerkbare concept; zij vervangt niet zonder aparte publicatie de uitleg voor lezers. Controleer de herstelde stappen en doelgroep voordat je opnieuw publiceert. Wanneer een collega het artikel intussen wijzigt, moet je vernieuwen in plaats van de wijziging stilzwijgend te overschrijven.

## Redactionele controle
Beschrijf wat nu werkt en vermeld voorwaarden zoals rechten, modules en providerinrichting. Zet geen wachtwoorden, OTP's, sleutels of echte dossiergegevens in artikelen. Gebruik herkenbare voorbeelden met fictieve nummers. Verwijs naar bestaande artikelcodes; verwante links worden voor de lezer opnieuw op toegang gefilterd.

## Veelgestelde vragen
### Kan ik een artikelcode wijzigen?
De editor houdt die vast om links in tickets en gedeelde instructies bruikbaar te houden. Maak voor een nieuw onderwerp een nieuw artikel.

### Wordt herstellen meteen openbaar?
Nee. Herstellen wijzigt het concept; publiceren is een bewuste afzonderlijke actie.`,related:['kennisbank-zoeken-en-artikelen-delen','platform-productbeheer-en-publicatie']},
{slug:'platform-release-controle',title:'Een release controleren en omgevingen uit elkaar houden',category:'Platformbeheer',audiences:['platform'],tags:['release','staging','productie','versie','health','deploy'],summary:'Controleer softwareversie, omgeving en exacte release-identiteit. Gebruik de bewuste promotieprocedure en onderscheid publicatiecommunicatie van een geslaagde deployment.',body:`## Waarom omgeving en versie apart tellen
Staging dient voor gecontroleerde acceptatie. Productie bedient echte gebruikers met afzonderlijke configuratie, database en providers. Een release kan op staging klaarstaan terwijl productie nog de vorige versie gebruikt. De packageversie of een roadmaptekst alleen bewijst niet wat een omgeving daadwerkelijk draait. Fieldgrid controleert daarom de exacte Git-SHA van de runtime.

## Een release beoordelen
1. Controleer de wijziging en de bijbehorende opleveringsrapportage.
2. Controleer dat de volledige CI van de bedoelde maincommit is geslaagd.
3. Promoveer de beoordeelde commit bewust naar staging volgens het runbook.
4. Controleer alle deploymentstappen, inclusief voorbereiding, migratie, runtime, worker en acceptatie.
5. Controleer de healthrespons: juiste omgeving, status en exacte Git-SHA, met database en scanner gereed.
6. Test relevante werkprocessen met de juiste testaccounts en noteer afwijkingen.
7. Publiceer productcommunicatie pas met de werkelijk gecontroleerde beschikbaarheid.

## Wat niet voldoende is
Een groene build zonder database- of browsertests is geen volledige releasecontrole. Een draaiende systemdservice bewijst niet dat het publieke adres de bedoelde release levert. Een succesvolle back-upopdracht bewijst nog geen volledig herstel van database en private bestanden. Een gewijzigde status in Productbeheer is geen uitvoering van deze stappen.

## Grenzen tijdens beheer
Gebruik geen legacy-configuratie, oude credentials of handmatig samengestelde env-bestanden als fallback. De stagingconfiguratie komt uit de GitHub Environment. Schemawijzigingen zijn voorwaarts en de bestaande migratiehashes blijven onveranderd. Bewaar de vaste loopbackpoorten, releasepaden en brokerprocedure. Host-, Caddy- en databasewijzigingen vereisen de gedocumenteerde operatoractie.

## Veelgestelde vragen
### Kan main direct deployen?
Main is de ontwikkelbron en deployt niet automatisch. Staging is de expliciete promotiebranch.

### Mag een gepubliceerde release meteen als productie klaar worden beschouwd?
Nee. Controleer de productiepromotie en exacte runtime-identiteit afzonderlijk. Vermeld stagingbeschikbaarheid duidelijk wanneer productie nog niet is bijgewerkt.

### Wat doe ik bij een mislukte acceptatie?
Onderzoek de concrete mislukte stap en behoud de gesloten veiligheidsgrens. Forceer geen groen resultaat door controles uit te schakelen.`,related:['platform-productbeheer-en-publicatie','platform-loginmail-onderzoeken']}
];
