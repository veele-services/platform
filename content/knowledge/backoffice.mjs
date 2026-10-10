export const backofficeArticles = [
{slug:'tenant-werkproces-van-aanvraag-tot-factuur',title:'Van aanvraag naar uitvoering, rapport en factuur',category:'Aan de slag',audiences:['backoffice'],tags:['aanvraag','offerte','werkbon','rapport','factuur','proces'],summary:'Volg de samenhang tussen de commerciële afspraak, de geplande werkbon, de uitvoering en financiële afhandeling zonder statussen door elkaar te halen.',body:`## Het volledige werkproces
Een aanvraag legt de klantvraag vast. Een offerte beschrijft het aanbod en akkoord. De werkbon organiseert de concrete uitvoering. Personeel voert de vrijgegeven bon uit en levert verslaglegging. Rapportcontrole beoordeelt die uitvoering. Finance handelt de factureerbare gegevens af. Deze onderdelen hangen samen, maar hebben ieder hun eigen status en bevoegdheid.

## Voor je begint
Richt de klant en het object in en controleer dat de noodzakelijke modules actief zijn. Gebruik de taakcatalogus voor herbruikbare werkzaamheden en tarieven. Zorg dat medewerkers actief en inzetbaar zijn. Het bestaan van een offerte betekent niet automatisch dat er al een vrijgegeven werkbon of betaalde factuur bestaat.

## Een registratie door de keten volgen
1. Open Aanvragen & offertes en leg de vraag met klant- en objectcontext vast.
2. Werk het aanbod uit en volg de aangeboden akkoordroute.
3. Controleer welke concrete werkbon uit de afspraken voortkomt.
4. Plan tijd, object, werkzaamheden en medewerkers. Controleer reistijd en capaciteit.
5. Geef de bon bewust vrij zodra de uitvoering klopt.
6. Laat personeel de uitvoering, hoeveelheden en verslaglegging bij de eigen bon registreren.
7. Controleer het rapport en vraag correctie wanneer informatie ontbreekt.
8. Controleer de financiële vervolgstatus en maak de factuur via het daarvoor bedoelde proces.

## De juiste bron aanpassen
Een ticket, notificatie of klantbericht wijzigt de bronregistratie niet. Een correctie op de afspraak voer je bij de afspraak of bon uit, een uitvoeringscorrectie bij het rapport en een financiële correctie bij de financiële registratie. Zo blijft duidelijk waarom een bedrag, datum of rapportstatus is veranderd. Gebruik de dossierkoppelingen om de samenhang te bekijken.

## Veelgestelde vragen
### Is een afgeronde werkbon meteen een goedgekeurd rapport?
Nee. Uitvoering en rapportcontrole zijn afzonderlijke stappen. Bekijk beide statussen voordat je een klantkopie of financiële vervolgstap verwacht.

### Is een geaccepteerde offerte hetzelfde als een betaling?
Nee. Akkoord en betaling zijn aparte processen. De factuur- en providerstatus bepalen de financiële ontvangst.

### Waarom kan ik niet iedere stap uitvoeren?
Rollen en functies kunnen lezen, plannen, beoordelen en factureren afzonderlijk toewijzen. Vraag om het recht dat bij jouw taak hoort.`,related:['werkbon-maken-plannen-en-vrijgeven','rapportcontrole-en-correcties','facturen-en-betaalstatus']},
{slug:'klanten-en-objecten-inrichten',title:'Klanten en objecten inrichten als basis voor de dienstverlening',category:'Klanten en objecten',audiences:['backoffice'],tags:['klant','object','adres','contactpersoon','360','postcode'],summary:'Leg de klantrelatie, contactpersonen en concrete objecten vast. Gebruik adresaanvulling alleen bij straatnaam of postcode en controleer de gekozen locatie.',body:`## Klant en object zijn verschillende registraties
De klant vertegenwoordigt de relatie en administratieve afspraken. Het object is de concrete locatie waarop werkzaamheden, bezoeken en instructies betrekking hebben. Eén klant kan meerdere objecten hebben. Werkbonnen, documenten en afspraken verwijzen naar deze bronnen; losse namen in een omschrijving vervangen de koppeling niet.

## Een klant aanmaken
1. Open Klanten en maak een nieuwe relatie aan.
2. Vul de basisgegevens en relevante contactpersonen in.
3. Controleer administratieve gegevens, status en verantwoordelijkheid.
4. Sla de relatie op en open het klantdossier om het resultaat te controleren.
5. Maak daarna een object aan dat bij deze klant hoort.

## Een object zorgvuldig vastleggen
Geef het object een herkenbare naam en controleer het bijbehorende klantrecord. Vul adres en locatie in. Bij straatnaam en postcode kan Fieldgrid adresvoorstellen aanbieden. Huisnummer, huisletter en toevoeging zijn gewone invoervelden; zij horen niet zelfstandig zoekverzoeken te starten. Controleer het volledige gekozen adres en de plaats voordat je het gebruikt voor planning of reistijd. Een suggestie is geen bewijs dat een gebouwtoegang of specifieke ingang klopt.

## Het dossier gebruiken
Open Klant 360 of Object 360 om gekoppelde afspraken, werkzaamheden, documenten en opvolging te bekijken. Houd instructies bij de bron zodat toekomstige bezoeken dezelfde informatie gebruiken. Gevoelige sleutel- en toegangsgegevens vallen onder aparte beveiliging en horen niet in een algemene omschrijving, ticket of kennisartikel.

## Veelgestelde vragen
### Waarom kan ik nog geen object toevoegen?
Controleer of er een klantrelatie bestaat, of je de juiste module en bewerkrechten hebt en of de geselecteerde klant bruikbaar is.

### Moet elk adres een kaartresultaat hebben?
Niet iedere locatie is exact vindbaar. Controleer de gegevens handmatig en leg de juiste context vast; gebruik geen willekeurige eerste suggestie.

### Kan een klant al deze objecten zien?
Alleen wanneer zijn account en de concrete objecten expliciet zijn gekoppeld. Een gedeeld bedrijfsadres of contactmail geeft geen algemene dossierinzage.

## Resultaatcontrole
Open het object opnieuw, controleer klant, adres en status en bekijk een gekoppelde bon. Zo voorkom je dat een fout adres pas bij de uitvoering wordt ontdekt.`,related:['werkbon-maken-plannen-en-vrijgeven','klantportaal-uitnodigen-en-controleren','objectdossier-en-beschermde-gegevens']},
{slug:'werkbon-maken-plannen-en-vrijgeven',title:'Een werkbon maken, plannen en vrijgeven aan personeel',category:'Planning en werkbonnen',audiences:['backoffice'],tags:['werkbon','bon','vrijgeven','release','planbord','toewijzen'],summary:'Controleer object, werkzaamheden, tijd en medewerkers en geef de werkbon pas vrij wanneer de uitvoeringsinformatie klopt. Gebruik de vrijgaveactie ook vanuit het planbord.',body:`## Plannen is niet hetzelfde als vrijgeven
Een werkbon beschrijft een concrete opdracht. Planning bepaalt wanneer en door wie deze wordt uitgevoerd. Vrijgeven is de bewuste stap waarmee de opdracht beschikbaar wordt voor de uitvoering. Een bon kan dus al op het planbord staan terwijl personeel haar nog niet mag uitvoeren. Controleer de afzonderlijke uitvoerings- en rapportstatus in plaats van alleen de kleur te volgen.

## De bon voorbereiden
1. Maak een werkbon via Werkbonnen of de passende vervolgactie uit een aanvraag of afspraak.
2. Kies de juiste klant en het juiste object.
3. Controleer titel, taken, hoeveelheden, instructies en relevante afspraken.
4. Plan het tijdvenster en de benodigde medewerkers.
5. Controleer of de planning past bij beschikbaarheid, reistijd en andere opdrachten.
6. Controleer de ondertekenafspraak die voor deze bon geldt.

## Vrijgeven vanuit meerdere plekken
Open de werkbon en gebruik de beschikbare vrijgaveactie. Op het planbord kan de actie ook in het werkbonmenu verschijnen wanneer je bevoegd bent en de bon ervoor geschikt is. De verschillende ingangen gebruiken dezelfde operationele controle. Een menu dat de knop niet toont kan betekenen dat de status, toegang of bronvoorwaarden niet passen.

## Controle na vrijgave
Bekijk de nieuwe status en laat een toegewezen medewerker de eigen planning vernieuwen. De medewerker hoort de relevante boninformatie en eigen uitvoeringsacties te zien, zonder het volledige backofficedossier. Als de medewerker niets ziet, controleer vrijgave, concrete toewijzing, actieve medewerkerstatus en de datum waarop de personeelsplanning staat.

## Veelgestelde vragen
### Kan ik een bon vrijgeven zonder medewerkers?
Volg de voorwaarden die de vrijgaveactie voor de betreffende bon controleert. Los ontbrekende uitvoeringsinrichting op in de bon; omzeil de controle niet via een andere knop.

### Waarom is de bon zichtbaar maar nog niet uitvoerbaar?
Gepland en vrijgegeven zijn verschillende toestanden. Controleer ook de eigen toewijzing en het actuele uitvoeringsvenster van de medewerker.

### Kan een ticket de bon vrijgeven?
Nee. Een ticket is communicatie. Gebruik een daadwerkelijke vrijgaveactie bij de bron.

## Bij wijzigingen
Controleer gevolgen voor reeds begonnen uitvoering en rapporten voordat je tijd, personeel of instructies wijzigt. Historische registraties moeten herkenbaar blijven.`,related:['planbord-en-bonnenbak','rapportcontrole-en-correcties','personeel-werkbon-uitvoeren']},
{slug:'planbord-en-bonnenbak',title:'Planbord, bonnenbak en gekoppelde reistijd gebruiken',category:'Planning en werkbonnen',audiences:['backoffice'],tags:['planbord','bonnenbak','drag','reistijd','planning','dag'],summary:'Kies de juiste planningsdag, deel bonnen in, gebruik het werkbonmenu en controleer de gekoppelde reistijd en eventuele capaciteitsproblemen.',body:`## Overzicht van de werkdag
Het planbord combineert medewerkers, tijdvakken en werkbonnen. Onderaan staat de bonnenbak voor de geselecteerde werkvoorraad. De bak heeft een kolomkop die tijdens het scrollen bovenin blijft. Bij een lege bak is een extra verticale scrollbalk niet nodig. De reistijdweergave is aan de bijbehorende bon gekoppeld en hoort bij dezelfde hoogte en rij.

## Een dag plannen
1. Kies de planningsdag en controleer de tijdzone van de organisatie.
2. Stel het zichtbare tijdvenster en de zoom in voor de benodigde details.
3. Kies de selectie in de bonnenbak en bekijk welke bonnen nog moeten worden ingedeeld.
4. Open een bon om inhoud en voorwaarden te controleren.
5. Deel de bon via de aangeboden planactie of sleepactie in bij de juiste medewerker en tijd.
6. Controleer de uitkomst, capaciteit en eventuele reistijdwaarschuwing.

## Het werkbonmenu gebruiken
Het menu biedt afhankelijk van de bon en jouw rechten acties zoals bekijken, reistijd bekijken, route bekijken, handmatige reistijd, aanpassen van tijd en medewerkers, dossier openen en uit de planning halen. De vrijgaveactie is eveneens beschikbaar wanneer de bon ervoor geschikt is. Een andere ingang gebruikt dezelfde bron en rechten; kies de actie op basis van het gewenste gevolg.

## Reistijd beoordelen
De routeberekening helpt bij de planning, maar is geen live verkeersgarantie. Controleer de juiste locaties en vervoersinstelling. Een tekort aan beschikbare reistijd moet je oplossen door planning of brongegevens aan te passen; een korter getekend vlak maakt de reis niet werkelijk korter. Gebruik handmatige reistijd alleen met een concrete reden en controleer daarna het gevolg voor de dag.

## Veelgestelde vragen
### Er staan geen bonnen. Waarom zie ik geen medewerkers?
Controleer de actieve personeelsinrichting en geselecteerde dag. Een leeg planbord kan een correcte uitkomst zijn.

### Verdwijnt een bon als ik haar uit de planning haal?
Uitplannen is een wijziging van de inzet. Het is geen stilzwijgende verwijdering van de oorspronkelijke werkbon of historie.

### Kan ik een waarschuwing negeren omdat het kaartje past?
De tijdschaal is een presentatie. Controleer de daadwerkelijke duur en reistijd en pas de planning bewust aan.

## Vernieuwen
Na wijzigingen door collega's hercontroleert de werkruimte de bron. Bij een verbindingsprobleem moet je de nieuwe uitkomst bevestigen voordat je verder plant.`,related:['werkbon-maken-plannen-en-vrijgeven','taken-tarieven-meerwerk-en-templates']},
{slug:'taken-tarieven-meerwerk-en-templates',title:'Taken, tarieven, meerwerk en templates consequent gebruiken',category:'Planning en werkbonnen',audiences:['backoffice'],tags:['taak','tarief','meerwerk','template','categorie','hoeveelheid'],summary:'Beheer herbruikbare werkzaamheden en afspraken en onderscheid extra uitvoering, extra werktijd en daadwerkelijk berekend meerwerk.',body:`## De catalogus als basis
Taken & tarieven brengt taken, categorieën, meerwerk en templates bij elkaar. De tabbladen horen bij dezelfde container. Een taak beschrijft het werk en bijbehorende afspraken; een template helpt terugkerende opdrachten voorbereiden. Hergebruik voorkomt dat dezelfde dienstverlening telkens anders wordt beschreven. Bestaande gepubliceerde afspraken en historische rapporten moeten herkenbaar blijven wanneer de catalogus later verandert.

## Een taak of categorie beheren
1. Open Taken & tarieven en kies het juiste tabblad.
2. Gebruik de zoekbalk om een code, naam of discipline te vinden.
3. Maak een taak of categorie met een herkenbare naam en code.
4. Controleer duur, tarief, eenheid en status waar die worden aangeboden.
5. Leg de afgesproken werkzaamheden vast en controleer het resultaat in een concrete bon.

## Meerwerk beoordelen
Open het Meerwerk-tabblad en selecteer de betreffende werkbon. Bekijk wat daadwerkelijk is uitgevoerd en welke afspraak daarvoor geldt. Extra werktijd is niet automatisch extra kosten. Maak onderscheid tussen afwijkende hoeveelheid, een aanvullende opdracht en een langer uitgevoerde bestaande taak. De registratie moet herleidbaar blijven tot de bon en het toepasselijke akkoordproces.

## Templates gebruiken
Gebruik templates voor herhaalbare werkbon- en checklistopbouw. Controleer object, planning, medewerkers en actuele instructies nadat je een template toepast. Een template neemt voorbereiding over, maar is geen bewijs dat de nieuwe bon al vrijgegeven of gecontroleerd is. Pas een template alleen aan als de wijziging voor toekomstige opdrachten bedoeld is.

## Veelgestelde vragen
### Waarom zie ik geen taak in een bestaande bon na een cataloguswijziging?
Een historische of gepubliceerde afspraak volgt niet noodzakelijk iedere latere cataloguswijziging. Controleer de concrete bon en de geldende versie van de afspraak.

### Moet meer tijd altijd als meerwerk worden gefactureerd?
Nee. De echte afspraak, hoeveelheid en goedgekeurde aanvullende opdracht zijn bepalend; extra duur alleen creëert geen extra kosten.

### Kan personeel tarieven vrij aanpassen?
De personeelsprojectie is gericht op de eigen uitvoering. Financiële beheertaken blijven aan de daarvoor toegewezen rechten gebonden.

## Resultaatcontrole
Open een representatieve bon en controleer of taaknaam, eenheid, duur en afspraken duidelijk zijn voor de uitvoerder.`,related:['tenant-werkproces-van-aanvraag-tot-factuur','werkbon-maken-plannen-en-vrijgeven','personeel-werkbon-uitvoeren']},
{slug:'rapportcontrole-en-correcties',title:'Werkrapporten controleren, corrigeren en vrijgeven',category:'Rapportage en finance',audiences:['backoffice'],tags:['rapport','controle','correctie','ondertekening','goedkeuren','klantkopie'],summary:'Beoordeel de uitvoering aan de hand van het rapport, vraag gerichte correcties en controleer welke informatie voor klanten en finance beschikbaar wordt.',body:`## Uitvoering en beoordeling
De medewerker rondt de uitvoering af met eigen registraties en verslaglegging. Rapportcontrole is de afzonderlijke beoordeling daarvan. Een afgeronde bon is daardoor niet automatisch een goedgekeurd rapport of een factureerbare opdracht. De statussen in het werkbonoverzicht helpen deze fases te onderscheiden. Beoordeel de daadwerkelijke broninhoud voordat je goedkeurt.

## Controleren in stappen
1. Open Rapportcontrole en selecteer het te beoordelen rapport.
2. Controleer bon, klant, object en uitvoeringsdatum.
3. Vergelijk taken, werkelijke hoeveelheden en toelichting met de afspraak.
4. Controleer benodigde bijlagen en ondertekening volgens de bonafspraak.
5. Vraag een gerichte correctie wanneer informatie ontbreekt of niet klopt.
6. Geef pas akkoord wanneer de relevante registratie volledig en begrijpelijk is.
7. Controleer de vervolgstatus, eventuele klantkopie en financiële vervolgstap.

## Een bruikbare correctievraag
Benoem de exacte taak of registratie en wat nog nodig is. 'Rapport onjuist' helpt minder dan 'Vul bij taak X de werkelijke hoeveelheid en de reden voor afwijking in'. Correctie hoort bij het bronrapport; een antwoord in een ticket vervangt de registratie niet. Laat de medewerker de eigen bijdrage herstellen via de aangeboden uitvoeringsroute.

## Ondertekening
De bon kan een andere ondertekenafspraak hebben dan het object of de standaardinstelling. Controleer de effectieve afspraak bij de concrete opdracht. Een historische gepubliceerde afspraak mag niet ongemerkt door een nieuwe standaard worden vervangen. Ondertekenen gebeurt via de personeelsuitvoering en is onderdeel van de verslaglegging, geen algemene toegang tot andere dossiers.

## Veelgestelde vragen
### Kan de klant het interne rapport zien?
Klanten zien alleen vrijgegeven klantinformatie binnen hun binding. De klantkopie is geen algemene toegang tot alle interne personeelsbijdragen.

### Is goedkeuren hetzelfde als factureren?
Nee. Rapportcontrole en finance hebben eigen stappen en rechten. Controleer de status die voor de financiële opvolging wordt aangeboden.

### Een bijlage is geweigerd. Mag ik toch goedkeuren?
Beoordeel of de noodzakelijke onderbouwing ontbreekt. Bestandscontrole hoort niet te worden omzeild; laat een geschikte schone bijlage toevoegen.

## Resultaatcontrole
Open het rapport na afhandeling opnieuw en controleer status, correctiehistorie en wat de volgende verantwoordelijke daadwerkelijk kan bekijken.`,related:['werkbon-maken-plannen-en-vrijgeven','facturen-en-betaalstatus','huisstijl-en-white-label']},
{slug:'facturen-en-betaalstatus',title:'Facturen en online betaalstatus zorgvuldig afhandelen',category:'Rapportage en finance',audiences:['backoffice'],tags:['factuur','betaling','Mollie','betaalverzoek','finance','ontvangst'],summary:'Controleer factureerbare bronnen, definitieve documenten en echte providerbevestiging. Houd concept, verzonden factuur en ontvangen betaling uit elkaar.',body:`## Financiële registraties hebben eigen fases
Concept, definitief, verzonden, deels betaald, betaald en vervallen beschrijven verschillende situaties. Een voltooide werkbon of geaccepteerde offerte is niet automatisch een ontvangen betaling. Werk vanuit de financiële bron en controleer de gekoppelde klant en opdracht. Alleen gebruikers met de betreffende financebevoegdheid krijgen de financiële bewerkacties.

## Van bron naar factuur
1. Open Facturen en controleer welke bronnen voor financiële opvolging beschikbaar zijn.
2. Bekijk klant, bedragen, regels en relevante rapport- of commerciële afspraken.
3. Maak of controleer het conceptdocument.
4. Gebruik de bedoelde actie voor definitief maken of verzenden.
5. Controleer de documentstatus en de aangeboden betaalmogelijkheid.
6. Volg de ontvangen of openstaande betaalstatus bij de oorspronkelijke registratie.

## Online betalen
Online betaling vereist een werkelijk geverifieerde Mollie-koppeling voor de tenant. Een zichtbaar portaal of betaalbutton is geen vervanging voor die koppeling. De huidige inrichting is geen volledige selfservice onboarding van vele onafhankelijke merchants. Laat een ontbrekende providerbinding via de beheerprocedure controleren.

## Bevestiging en uitzonderingen
Een browser die terugkeert van de betaalpagina boekt niet zelfstandig ontvangst. Fieldgrid controleert providerbewijs voordat de betaling als ontvangen wordt verwerkt. Bij vertraging controleer je de actuele status en transactiecontext in plaats van meteen opnieuw te laten betalen. Geef support het documentnummer, tijdstip en zichtbare status; stuur geen geheime providergegevens of volledige betaalcredentials.

## Veelgestelde vragen
### Waarom staat een betaling nog open na terugkeer in de browser?
De providerverwerking kan nog moeten worden bevestigd. Controleer de actuele bronstatus en laat een onduidelijke uitkomst onderzoeken voordat je een tweede betaling start.

### Kan een klant alle facturen van de organisatie zien?
Het klantenportaal toont alleen toegestane klantgebonden informatie. Het is geen algemene financiële administratie.

### Sluit een gelezen notificatie de factuur af?
Nee. De inbox en de financiële bron zijn afzonderlijk. Alleen de financiële registratie bepaalt de ontvangstatus.

## Resultaatcontrole
Controleer document, bedrag, status en gekoppelde bron opnieuw na elke financiële actie. Bij een afwijking is een broncorrectie nodig; een losse ticketreactie wijzigt het bedrag niet.`,related:['tenant-werkproces-van-aanvraag-tot-factuur','klant-facturen-en-betalen','een-goede-supportvraag-stellen']},
{slug:'management-uitnodigen-en-rechten',title:'Managementaccounts, rollen en eigenaarschap beheren',category:'Organisatie en personeel',audiences:['backoffice'],tags:['management','rol','eigenaar','planning','administratie','support','uitnodiging'],summary:'Nodig collega’s uit met een passende rol, wijs pagina- en functierechten toe en behandel eigendomsoverdracht als een afzonderlijke gecontroleerde handeling.',body:`## Rollen en functies
Fieldgrid ondersteunt managementrollen zoals Eigenaar, Management, Planning, Administratie en Support. De rechtenpagina maakt onderscheid tussen toegang tot de backoffice, lezen van onderdelen en afzonderlijke functies. Een rolnaam alleen vertelt dus niet alle details. Vertrouwelijke ticketrechten en beschermde objectgegevens blijven eigen grenzen hebben.

## Een collega uitnodigen
1. Open Gebruikers en rollen met de juiste beheerbevoegdheid.
2. Controleer het e-mailadres en de naam van de collega.
3. Kies een rol die bij zijn taken past.
4. Controleer de lees- en functierechten en volg de gevraagde verificatie.
5. Verstuur de uitnodiging en controleer de geregistreerde uitkomst.
6. Laat de collega via de eigen mailbox en OTP inloggen.
7. Controleer een toegestane taak en een functie die buiten de rol moet blijven.

## Rechten zorgvuldig aanpassen
Begin bij de concrete taak. Geef een planner niet automatisch financiële bewerkrechten en een administratief medewerker niet automatisch vertrouwelijke HR-inzage. De rechten moeten ook bij directe links en acties gelden; alleen een menu verbergen is onvoldoende. Controleer na een wijziging opnieuw de pagina en functie met de betrokken gebruiker.

## Eigenaarschap overdragen
Eigendomsoverdracht is geen gewone rolwissel. Gebruik de aangeboden overdrachtprocedure, controleer de ontvanger en volg de sessiegebonden verificatie. De overdracht heeft eigen voorwaarden en geldigheid. Leg intern vast wie na afronding de verantwoordelijke eigenaar is. Verwar een uitnodiging voor management niet met het aanvaarden van eigenaarschap.

## Veelgestelde vragen
### Kan ik een uitnodiging zomaar opnieuw versturen?
Controleer eerst of de eerdere uitkomst vaststaat. Bij een onzekere provideruitkomst moet je voorkomen dat je ongemerkt meerdere verzoeken start.

### Waarom krijgt iemand na een rolwijziging nog steeds geen vertrouwelijk ticket te zien?
Vertrouwelijke gesprekken vereisen extra expliciete toegang binnen het juiste bereik. Een brede managementrol vervangt dat niet.

### Waarom wordt een nieuwe verificatiecode gevraagd?
Gevoelige wijzigingen gebruiken een bevestiging die bij de concrete sessie en opdracht hoort. Een algemene logincode is niet automatisch een geldige beheerbevestiging.

## Resultaatcontrole
Controleer de actuele rollen en laat de collega de eigen navigatie vernieuwen. Bij intrekking horen oude sessies geen blijvende bewerktoegang te behouden.`,related:['rollen-en-zichtbaarheid','tenant-ticket-behandelen','inloggen-met-een-eenmalige-code']},
{slug:'personeel-inrichten-en-acties-opvolgen',title:'Personeel uitnodigen, nummeren en open acties opvolgen',category:'Organisatie en personeel',audiences:['backoffice'],tags:['personeel','medewerker','nummering','uitnodiging','verlof','actie nodig'],summary:'Richt actieve medewerkers in, controleer nummering en onboarding en volg personeelsacties bij de juiste bron op.',body:`## Een medewerkerprofiel als basis
De personeelsapp werkt met een concreet medewerkerprofiel en actief accountlidmaatschap. Alleen een e-mailadres in een contactveld maakt iemand niet uitvoerbaar op een bon. Controleer identiteit, status en de relevante gegevens voordat je gaat plannen. Personeelsdossiers bevatten eigen privacygrenzen; financiële of planningsrechten openen niet automatisch alle HR-inhoud.

## Inrichten en uitnodigen
1. Open Personeel en maak of controleer de medewerkerregistratie.
2. Controleer naam, e-mail, status en de aangeboden contract- of personeelsgegevens.
3. Stel bij Instellingen, Personeelsnummering de gewenste prefix en startwaarde voor nieuwe medewerkers in.
4. Nodig de medewerker via de bedoelde accountprocedure uit.
5. Laat hem de eigen onboarding afronden en profielgegevens controleren.
6. Controleer dat de medewerker in de planning beschikbaar komt en eigen toegewezen werk ziet.

## Nummering begrijpen
De standaardnummering geldt voor nieuwe medewerkers. Reeds gebruikte nummers blijven herkenbaar; het wijzigen van een startwaarde hernummerd de bestaande administratie niet zomaar. De reeks loopt verder zonder reeds gebruikte nummers te overschrijven. Controleer een nieuw profiel nadat je de standaard hebt aangepast.

## Actie nodig
De pagina Actie nodig verzamelt open personeelsacties. Het aantal staat onder het overzicht, met paginatie bij de lijst. Open de betreffende actie en bekijk de bron, bijvoorbeeld een verlofaanvraag, document of dossierverzoek. Een overzicht is geen zelfstandige bronmutatie: voer de afhandeling in de bijbehorende registratie uit.

## Veelgestelde vragen
### De medewerker ziet geen werkbon. Is de uitnodiging mislukt?
Niet noodzakelijk. Controleer het actieve account, de medewerkerstatus, concrete toewijzing, vrijgave van de bon en de gekozen dag.

### Verandert een nummeringsinstelling bestaande nummers?
De standaard is bedoeld voor nieuwe registraties. Controleer bestaande nummers afzonderlijk in het medewerkerprofiel.

### Kan een manager alle personeelsdocumenten downloaden?
Dossier- en documenttoegang blijft aan de toegewezen HR- en personeelsrechten gebonden. Een rol voor planning geeft niet vanzelf dossierinzage.

## Resultaatcontrole
Laat één medewerker de onboarding, de eigen planning en een notificatievoorkeur controleren. Vraag geen accountcode om dit namens hem te doen.`,related:['management-uitnodigen-en-rechten','personeel-onboarding-en-profiel','personeel-uren-verlof-en-beschikbaarheid']},
{slug:'tenant-ticket-behandelen',title:'Personeels- en klantmeldingen behandelen binnen de tenant',category:'Tickets en ondersteuning',audiences:['backoffice'],tags:['ticket','melding','HR','behandelaar','prioriteit','notitie'],summary:'Lees de toegestane werkvoorraad, antwoord aan de melder, gebruik interne notities bewust en stel een gecontroleerde oplossing voor.',body:`## Gesprek en bron
Een melding koppelt een vraag aan bijvoorbeeld een werkbon, object of personeelszaak. De melding verandert die bron niet automatisch. Jij behandelt het gesprek en laat eventuele broncorrecties door een bevoegd account uitvoeren. Vertrouwelijke categorieën hebben aparte intake- en leesrechten; eigenaar of behandelaar zijn opent niet zonder meer alle HR-gesprekken.

## Van intake naar afhandeling
1. Open Personeelsmeldingen of de passende ticketwerkruimte en filter de werkvoorraad.
2. Lees onderwerp, categorie, context en laatste zichtbare reactie.
3. Neem de melding in behandeling en wijs haar zo nodig toe binnen het toegestane bereik.
4. Vraag ontbrekende informatie in een antwoord aan de melder.
5. Leg interne afwegingen in een tenantnotitie vast en controleer de gekozen zichtbaarheid.
6. Beschrijf oplossing of volgende stap, met een gewenst reactiemoment waar dat nodig is.
7. Stel de oplossing voor en volg bevestiging, sluiting of heropening.

## Kennisartikelen gebruiken
Kies Artikel uit kennisbank in het antwoordformulier. Je krijgt gepubliceerde artikelen voor het publiek van jouw bericht: een medewerkersantwoord krijgt personeelsuitleg, een klantantwoord klantuitleg en een interne tenantnotitie beheeruitleg. Lees het voorbeeld, voeg de link aan het concept toe en controleer de ontvanger voor je verzendt. De selectie verstuurt niets vanzelf.

## Wachttijden en status
Wacht op melder en Wacht op externe partij maken de volgende verantwoordelijkheid zichtbaar. Termijnen kunnen openingstijden en instellingen volgen. Gebruik een concrete vervolgstap; een status alleen legt niet uit waarop je wacht. Een gelezen notificatie is geen afgeronde melding.

## Veelgestelde vragen
### Waarom kan mijn collega het toegewezen ticket niet openen?
Toewijzing verleent geen leesrecht. Controleer de categorie- en dossierscope en eventuele vertrouwelijke rechten.

### Is een interne notitie zichtbaar voor de melder?
Nee, zolang je daadwerkelijk de interne tenantzichtbaarheid kiest. Controleer de selector voordat je verstuurt; algemene tekst in een openbare reactie blijft openbaar voor het gesprekspubliek.

### Moet een technisch probleem meteen worden doorgestuurd?
Controleer eerst de broninrichting, rechten en reproduceerbaarheid. Escaleer daarna noodzakelijke informatie in een afzonderlijke Fieldgrid-vraag.`,related:['tenant-ticket-escaleren','een-goede-supportvraag-stellen','management-uitnodigen-en-rechten']},
{slug:'tenant-ticket-escaleren',title:'Een melding gecontroleerd escaleren naar Fieldgrid',category:'Tickets en ondersteuning',audiences:['backoffice'],tags:['escalatie','Fieldgrid','support','doorsturen','antwoord voorbereiden'],summary:'Maak van een tenantmelding een afzonderlijke technische supportvraag met alleen noodzakelijke informatie en stuur het antwoord daarna bewust terug naar de oorspronkelijke melder.',body:`## Twee gesprekken, twee publieken
Een personeels- of klantmelding is een gesprek met jouw organisatie. Het Fieldgrid-ticket is het technische gesprek tussen bevoegde tenantcontacten en support. De bronmelding wordt niet integraal overgedragen. Interne tenantnotities, vertrouwelijke HR-inhoud en het volledige bron­dossier blijven buiten de technische vraag. Elk gesprek behoudt zijn eigen status.

## Een goede escalatie voorbereiden
Controleer welke handeling fout gaat, op welke omgeving, bij welke registratie en op welk tijdstip. Kijk eerst of module, rol, vrijgave of klantbinding de oorzaak is. Beschrijf vervolgens het technische probleem zonder meer dossierinformatie te delen dan nodig is. Gebruik herkenbare registratie­nummers waar het deelproces die toestaat en verwijder codes of onnodige persoonsgegevens uit beelden.

## Stappenplan
1. Open de oorspronkelijke melding met jouw actuele behandelrechten.
2. Kies Doorsturen naar support wanneer die actie beschikbaar is.
3. Schrijf een duidelijke technische titel en probleemomschrijving.
4. Kies de passende categorie en module.
5. Selecteer alleen noodzakelijke schone bijlagen en controleer het deeloverzicht.
6. Verstuur de aparte supportvraag en bewaar het gekoppelde ticketnummer.
7. Volg de reacties in Fieldgrid-support; laat het oorspronkelijke gesprek afzonderlijk opvolgen.

## Het antwoord teruggeven
Een Fieldgrid-reactie verschijnt niet automatisch bij de oorspronkelijke melder. Gebruik Antwoord voorbereiden voor melder wanneer dat wordt aangeboden. Controleer en bewerk het concept, controleer of een kennisartikellink bij het portaal van de melder past en verstuur daarna expliciet. Een technische uitleg voor een beheerder kan extra vertaling naar een praktische personeels- of klantstap nodig hebben.

## Veelgestelde vragen
### Sluit Fieldgrid mijn oorspronkelijke ticket ook?
Nee. De oorspronkelijke melding en het supportticket hebben aparte afhandeling. Controleer zelf of de melder geholpen is.

### Kan ik alle bijlagen meesturen?
Deel uitsluitend wat noodzakelijk en toegestaan is. Bijlagen kunnen een aparte gecontroleerde kopie- en scanstatus hebben; pending betekent nog niet beschikbaar.

### Waarom ontbreekt de deelactie?
Controleer jouw deelrecht, categorie, broncontext en module. Een directe link of andere rolnaam vervangt het deelrecht niet.

## Resultaatcontrole
Controleer in beide gesprekken de juiste laatste reactie en status. De melder moet een bruikbaar antwoord krijgen, zonder interne afwegingen of informatie van andere dossiers.`,related:['tenant-ticket-behandelen','platform-support-behandelen','kennisbank-zoeken-en-artikelen-delen']},
{slug:'huisstijl-en-white-label',title:'Huisstijl, afzender, reizen en ondertekening instellen',category:'Organisatie en personeel',audiences:['backoffice'],tags:['logo','huisstijl','white label','ondertekening','reizen','instellingen'],summary:'Stel de tenantbranding en werkstandaarden in en controleer het gevolg in backoffice, personeelsapp, klantenportaal en nieuwe documenten.',body:`## De instellingen horen bij de organisatie
Instellingen bevat onder meer Huisstijl & afzender, Reizen, Personeelsnummering en Ondertekening. Elk tabblad gebruikt dezelfde container en duidelijke secties. De standaardinstellingen helpen nieuwe registraties voorbereiden. Zij mogen niet stilzwijgend reeds gepubliceerde afspraken of historische rapporten herschrijven.

## Logo en kleuren
1. Open Huisstijl & afzender met de benodigde beheerrechten.
2. Kies het tenantlogo en controleer het voorbeeld.
3. Stel primaire en accentkleur in en controleer leesbaarheid van tekst en knoppen.
4. Controleer afzendergegevens waar het formulier die aanbiedt.
5. Sla op en controleer login, sidebar en de personeels- en klantenomgeving.

## Logo of naam
Wanneer een bruikbaar tenantlogo is ingesteld, gebruikt de branding het logo. Zonder logo valt de weergave terug op de organisatienaam. Dat betekent niet dat je de naam uit alle contextzinnen hoeft te verwijderen; een instructie of e-mail kan de organisatie nog bij naam noemen. Het merkvlak zelf hoort niet onnodig logo én dezelfde grote naam te tonen.

## White-label en PWA
Zonder white-label krijgt de personeels-PWA Fieldgrid-iconen en installatiebranding; binnen de app kan de tenantbranding staan met Powered by Fieldgrid. Met white-label gebruikt de installatie de tenantnaam en het tenantlogo. Een reeds geïnstalleerde app kan browser- of apparaatgedrag nodig hebben om nieuwe installatiegegevens over te nemen. Controleer het daadwerkelijke apparaat na een brandingwijziging.

## Reizen en ondertekening
Controleer reisinstellingen met een concrete bon en de juiste objectlocaties. Voor ondertekening geldt de effectieve afspraak van bon, object, template en standaard. Kijk daarom bij een bestaande bon welke afspraak werkelijk geldt. Een nieuwe standaard is geen stilzwijgende wijziging van alle historische uitvoeringsbewijzen.

## Veelgestelde vragen
### Mijn logo verschijnt niet. Wat controleer ik?
Controleer of het bestand is opgeslagen, of het voorbeeld zichtbaar is en of je dezelfde tenant en omgeving bekijkt. Noteer de pagina en het apparaat bij een blijvende afwijking.

### Is white-label hetzelfde als een eigen domein?
Nee. Branding en appdomein hebben afzonderlijke instellingen en controles.

### Kan ik alleen met kleur een ontoegankelijk formulier oplossen?
Kleuren veranderen geen account- of functierechten. Controleer de rol wanneer een bewerkactie ontbreekt.`,related:['personeelsapp-installeren','platform-eigen-appdomein','rapportcontrole-en-correcties']},
{slug:'klantportaal-uitnodigen-en-controleren',title:'Een klant uitnodigen en de juiste objecttoegang controleren',category:'Klanten en objecten',audiences:['backoffice'],tags:['klantportaal','uitnodiging','binding','object','klantaccount'],summary:'Koppel de klantidentiteit bewust, nodig de juiste contactpersoon uit en controleer dat alleen de bedoelde objecten, bezoeken en vrijgegeven documenten zichtbaar zijn.',body:`## Klanttoegang is concreet
Het klantenportaal hoort bij een actieve klantidentiteit en expliciete objectbindingen. Een contactpersoon met hetzelfde e-mailadres als een andere klant krijgt daardoor niet automatisch toegang tot alle relaties. Het portaal is gericht op eigen objecten en concrete bezoeken. Personeels- of managementrechten van hetzelfde account mogen de klantprojectie niet verruimen.

## Voorwaarden controleren
Controleer dat de klantportaalmodule voor de tenant actief is. Richt de klant, objecten en contactpersoon zorgvuldig in. Bespreek welke locaties de klant moet kunnen bekijken en welke rapporten of documenten mogen worden vrijgegeven. Vermijd een algemene uitnodiging wanneer er nog geen duidelijke account- en objectkoppeling is.

## Stappenplan
1. Open het juiste klantdossier en controleer de identiteit van de contactpersoon.
2. Maak of controleer de portaalaccountkoppeling.
3. Koppel uitsluitend de bedoelde objecten en controleer hun status.
4. Verstuur de uitnodiging via de aangeboden procedure.
5. Laat de klant via de eigen mailbox inloggen en de onboarding afronden.
6. Controleer met de klant één bedoeld object en bezoek.
7. Controleer dat informatie van andere klanten en interne personeelsbijdragen ontbreekt.

## Na de uitnodiging
Een klant kan toegestane gegevens en instructies bijwerken en concrete bezoeken aanvragen. De organisatie blijft verantwoordelijk voor de dienstverlening, planning en vrijgave van klantinformatie. Een klantbericht wijzigt niet automatisch de planning of een factuur. Behandel aanvragen en tickets bij de juiste bron.

## Veelgestelde vragen
### De klant ziet geen object. Moet ik alle modules aanzetten?
Controleer eerst de concrete binding. Een module activeert functionaliteit, geen algemene dossierinzage.

### Kan één klant meerdere objecten hebben?
Ja, mits de objecten expliciet binnen de juiste klant- en tenantcontext zijn gekoppeld. Controleer per object de gewenste toegang.

### Waarom verdwijnen gegevens na intrekking?
Het portaal controleert actuele toegang en ruimt ingetrokken privé-inhoud op. Een bewaarde link of eerdere sessie geeft geen blijvende rechten.

## Resultaatcontrole
Laat de klant een afspraak, vrijgegeven rapport en eventuele factuur openen die bij zijn binding horen. Deze controle is sterker dan alleen vaststellen dat de login werkt.`,related:['klant-objecten-en-toegang','klanten-en-objecten-inrichten','platform-modules-beheren']},
{slug:'objectdossier-en-beschermde-gegevens',title:'Object 360 en beschermde toegangsgegevens gebruiken',category:'Klanten en objecten',audiences:['backoffice'],tags:['Object 360','sleutel','kluis','toegang','OTP','document'],summary:'Gebruik het objectdossier voor instructies, afspraken en documenten en behandel beveiligde sleutel- en toegangsgegevens via de afzonderlijke gecontroleerde toegang.',body:`## De functie van Object 360
Het objectdossier brengt objectinformatie, afspraken, werkzaamheden, documenten en opvolging bij elkaar. Het verwijst naar de echte bronnen en maakt zichtbaar wat bij deze locatie hoort. Het dossier is geen reden om alle informatie ook in algemene bonteksten, tickets of kennisartikelen te kopiëren. Beschermde sleutel- en toegangsgegevens hebben een eigen grens.

## Gewone objectinformatie beheren
1. Open het concrete object bij de juiste klant.
2. Controleer naam, adres, status en relevante contactpersonen.
3. Houd uitvoeringsinstructies actueel en begrijpelijk.
4. Bekijk gekoppelde afspraken, werkbonnen en documenten bij hun bron.
5. Gebruik opvolging om open acties bij het dossier af te handelen.

## Beschermde gegevens
Toegangs- en sleutelgegevens mogen alleen via de bedoelde beschermde voorziening worden geopend. De gebruiker moet passende bevoegdheid, concrete objectcontext en zo nodig een recente verificatie hebben. Voor personeel kan bovendien het uitvoeringsvenster relevant zijn. Een geopende algemene bon of een eigen tenantaccount is niet voldoende.

## Praktische werkwijze
Controleer eerst waarom de gegevens nodig zijn. Open daarna de beschermde actie en volg de verificatie voor die concrete sessie en context. Gebruik de informatie alleen voor de toegestane taak. De app kan gevoelige inhoud verbergen bij focusverlies of wanneer het gebruiksvenster eindigt. Deel de code, inhoud of een schermafbeelding niet in een gewone supportvraag.

## Veelgestelde vragen
### Waarom vraagt Fieldgrid opnieuw een verificatie?
De bescherming hoort bij een specifieke sessie, handeling en geldigheidsduur. Een eerdere algemene login bewijst niet dat deze gevoelige inzage nog toegestaan is.

### Kan ik de gegevens alvast naar een medewerker mailen?
Gebruik de beschermde werkroute met actuele toewijzing. Een losse kopie verliest de controle over bereik en intrekking.

### Is een document hetzelfde als een kluisgegeven?
Nee. Documenten hebben eigen upload- en downloadrechten en bestandscontrole; beschermde gegevens hebben aanvullende sessie- en contextvoorwaarden.

## Resultaatcontrole
Controleer dat de medewerker gewone instructies kan lezen en dat beschermde inhoud alleen binnen de bedoelde voorwaarden opent. Test geen gevoelige inhoud met echte productiecodes in staging.`,related:['klanten-en-objecten-inrichten','personeel-objectinformatie-en-kluis','rollen-en-zichtbaarheid']},
{slug:'nieuws-notificaties-en-opvolging',title:'Nieuws, notificaties en gezamenlijke opvolging gebruiken',category:'Communicatie',audiences:['backoffice'],tags:['nieuws','notificaties','opvolging','bericht','template','actie'],summary:'Publiceer teaminformatie, gebruik gerichte meldingen en handel gekoppelde dossieracties bij hun bron af. Houd nieuws, inbox en werkvoorraad uit elkaar.',body:`## Drie verschillende doelen
Nieuws is voor leesbare informatie aan de bedoelde doelgroep, bijvoorbeeld een teambericht. Notificaties geven gebruikers een seintje bij een gebeurtenis of bericht. Opvolging bundelt open acties uit gekoppelde dossiers. Een gelezen nieuwsbericht, een gelezen notificatie en een afgehandelde dossieractie zijn drie afzonderlijke registraties.

## Nieuws voorbereiden en publiceren
1. Open Nieuws en maak een bericht met een duidelijke titel.
2. Schrijf de uitleg, de concrete instructie en eventuele datum.
3. Controleer doelgroep en publicatievoorwaarden.
4. Publiceer via de aangeboden actie en controleer het zichtbare resultaat.
5. Gebruik de leesinformatie om opvolging te begrijpen, zonder aan te nemen dat lezen hetzelfde is als uitvoeren.

## Notificaties beheren
De notificatiewerkruimte heeft onderwerpen zoals ontvangen, verzonden, gepland, automatische meldingen, templates, aflevering en bevoegdheden. Alleen de onderdelen waarvoor je rechten hebt zijn beschikbaar. Controleer ontvanger, kanaal en inhoud voordat je verstuurt. Geplande berichten en automatische meldingen hebben eigen beleid; persoonlijke voorkeuren en verplichte meldingen kunnen de uiteindelijke levering beïnvloeden.

## Opvolging gebruiken
Open Opvolging en filter de open werkvoorraad. Een actie verwijst naar een klant, object, bon of ander dossier. Open de bron om de echte afhandeling uit te voeren. Het overzicht is geen tweede onafhankelijke administratie. Vernieuwen haalt actuele informatie op; de knop verandert zelf geen opdracht of deadline. Het aantal en paginatie staan onder de container.

## Veelgestelde vragen
### Waarom is een bericht verzonden maar niet zichtbaar bij iedere gebruiker?
Controleer doelgroep, rechten, bronzichtbaarheid, beleid en kanaalvoorkeur. Verzenden naar een doelgroep verruimt geen dossierinzage.

### Kan ik een automatische melding als gewone template behandelen?
Controleer welke instellingen en rechten voor het betreffende type beschikbaar zijn. Globaal beleid en tenantafwijkingen hebben verschillende grenzen.

### Verdwijnt een opvolgactie wanneer ik de notificatie archiveer?
Nee. Afhandelen gebeurt bij de bron. Archiveren wijzigt alleen jouw inbox.

## Resultaatcontrole
Bekijk na een wijziging het bericht of de actie met een account uit de bedoelde doelgroep. Gebruik een gecontroleerde testregistratie wanneer je aflevergedrag onderzoekt.`,related:['notificaties-en-browsertoestemming','tenant-ticket-behandelen','kennisbank-zoeken-en-artikelen-delen']}
];
