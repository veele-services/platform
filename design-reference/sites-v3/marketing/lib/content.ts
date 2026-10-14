export interface Sector {
  slug: string;
  name: string;
  eyebrow: string;
  headline: string;
  intro: string;
  image: string;
  imageAlt: string;
  metaTitle: string;
  metaDescription: string;
  challenges: string[];
  benefits: { title: string; text: string }[];
  sections: { title: string; paragraphs: string[] }[];
  workflow: { title: string; text: string }[];
  faqs: { q: string; a: string }[];
  future?: string;
}

export interface Product {
  metaTitle?: string;
  metaDescription?: string;
  slug: string;
  name: string;
  eyebrow: string;
  headline: string;
  intro: string;
  features: { title: string; text: string }[];
  paragraphs: string[];
  faqs: { q: string; a: string }[];
}

export const sectors: Sector[] = [
  {
    "slug": "schoonmaak",
    "name": "Schoonmaak",
    "eyebrow": "Software voor schoonmaakbedrijven",
    "headline": "Goed werk begint met een heldere werkdag.",
    "intro": "Je medewerkers maken iedere dag het verschil op locatie. Geef hen duidelijke opdrachten en houd zelf overzicht op objecten, bezetting en afspraken. Fieldgrid verbindt schoonmaakplanning, uitvoering en klantcontact in één werkomgeving.",
    "image": "/images/schoonmaak.webp",
    "imageAlt": "Schoonmaakprofessional aan het werk in een lichte kantooromgeving",
    "metaTitle": "Software voor schoonmaakbedrijven | Fieldgrid",
    "metaDescription": "Verbind schoonmaakplanning, objecten, digitale werkbonnen en klantcontact. Ontdek hoe Fieldgrid kantoor, schoonmaakmedewerkers en opdrachtgevers samenbrengt.",
    "challenges": [
      "Vaste objecten, wisselende bezetting",
      "Instructies die met medewerkers meereizen",
      "Aantoonbaar uitgevoerd schoonmaakwerk"
    ],
    "benefits": [
      {
        "title": "Iedere locatie heeft een verhaal",
        "text": "Bewaar ruimtes, werkprogramma’s, contactpersonen en instructies bij het juiste object. Ook een vervanger kan zich voorbereiden op de afspraken die daar gelden."
      },
      {
        "title": "Een opdracht die duidelijk is",
        "text": "Medewerkers zien hun vrijgegeven werkbonnen, taken en bijzonderheden in de personeelsapp. Tijdens de uitvoering leggen zij tijd, foto’s en afwijkingen bij dezelfde opdracht vast."
      },
      {
        "title": "Een klant die kan meekijken",
        "text": "Geef opdrachtgevers een eigen portaal voor hun locaties, bezoeken en vrijgegeven rapporten. Een aanvullende vraag blijft verbonden aan de klant die je al kent."
      }
    ],
    "sections": [
      {
        "title": "Van schoonmaakprogramma naar dagelijkse uitvoering",
        "paragraphs": [
          "Een goed schoonmaakcontract wordt pas waardevol wanneer de afspraken op de werkvloer duidelijk zijn. In Fieldgrid verbind je de klant en het object met de werkzaamheden die daar terugkeren. Je legt frequenties en taken vast en maakt daar concrete werkbonnen van. De planner ziet wat ingepland is, welke medewerkers beschikbaar zijn en waar inzet nog aandacht vraagt.",
          "Verandert de bezetting, dan blijft de locatiekennis bij het object staan. De medewerker hoeft belangrijke bijzonderheden daardoor niet uit losse berichten te halen. Een vrijgegeven werkbon maakt duidelijk welke opdracht uitgevoerd moet worden. Dat helpt bij de overdracht tussen kantoor, vaste medewerkers en collega’s die invallen."
        ]
      },
      {
        "title": "Laat uitvoering, kwaliteit en administratie op elkaar aansluiten",
        "paragraphs": [
          "Tijdens het werk kunnen medewerkers taken afhandelen en bijzonderheden vastleggen. Denk aan een ruimte die niet toegankelijk was, aanvullend werk dat werd gevraagd of een foto bij een afwijking. Deze informatie gaat mee met het uitvoeringsrapport, zodat kantoor de situatie kan beoordelen voordat een rapport voor de klant wordt vrijgegeven.",
          "Ook de commerciële afspraken blijven in beeld. Een extra reiniging kan beginnen als aanvraag, worden uitgewerkt in een offerte en na akkoord een concrete opdracht worden. Rapportcontrole en factuurvoorbereiding sluiten vervolgens aan op dezelfde registratie. Zo bouw je een navolgbaar dossier op, van de eerste afspraak tot de uiteindelijke terugkoppeling."
        ]
      },
      {
        "title": "Een vaste werkwijze voor kantoor, school of bedrijfsruimte",
        "paragraphs": [
          "Stel: je team verzorgt een kantoor met algemene ruimtes, sanitair en vergaderzalen. De reguliere werkzaamheden krijgen een terugkerend programma. Voor de periodieke vloerreiniging maak je een afzonderlijke opdracht met eigen werkzaamheden en afspraken. Beide blijven verbonden aan hetzelfde object. Zo kun je de dagelijkse dienstverlening en het aanvullende werk naast elkaar organiseren, zonder opnieuw een klant of locatie aan te maken.",
          "Een ruimte die tijdens het bezoek bezet is, vraagt om een bruikbare terugkoppeling. De medewerker noteert bij de werkbon welke taak niet kon worden uitgevoerd en waarom. Kantoor ziet die informatie bij de rapportcontrole en kan bepalen of een vervolgafspraak nodig is. Bespreek vooraf welke foto’s en opmerkingen passend zijn voor de locatie en wie deze mag inzien. Een duidelijke werkwijze maakt de registratie bruikbaar voor zowel de medewerker als de opdrachtgever."
        ]
      }
    ],
    "workflow": [
      {
        "title": "Maak de afspraak",
        "text": "Leg het object, de ruimtes, werkzaamheden en bezoekfrequentie vast."
      },
      {
        "title": "Plan en geef vrij",
        "text": "Koppel medewerkers aan de werkbon en geef hun opdracht bewust vrij."
      },
      {
        "title": "Voer uit en leg vast",
        "text": "Registreer taken, tijd, foto’s en bijzonderheden in de personeelsapp."
      },
      {
        "title": "Controleer en deel",
        "text": "Beoordeel het rapport en geef de juiste informatie aan de opdrachtgever vrij."
      }
    ],
    "faqs": [
      {
        "q": "Ondersteunt Fieldgrid terugkerende schoonmaak?",
        "a": "Ja. Je kunt terugkerende werkzaamheden met een frequentie en uitzonderingen vastleggen. Daaruit ontstaan concrete werkbonnen die je plant en vrijgeeft. Tijdens de inrichting stemmen we deze werkwijze af op je objecten en schoonmaakprogramma’s."
      },
      {
        "q": "Kunnen meerdere medewerkers aan dezelfde opdracht werken?",
        "a": "Ja. Je kunt medewerkers samen inzetten op een werkbon. De uitvoering en rapportage blijven gekoppeld aan die opdracht, zodat de informatie niet over afzonderlijke klantdossiers wordt verspreid."
      },
      {
        "q": "Is Fieldgrid ook een salarisadministratie?",
        "a": "Fieldgrid ondersteunt personeelsgegevens, beschikbaarheid en urenregistratie binnen de werkstroom. Salarisberekening, cao-verloning en boekhouding vragen afzonderlijke voorzieningen. We bespreken tijdens een demo hoe Fieldgrid naast je bestaande administratie past."
      },
      {
        "q": "Kan ik dagelijkse schoonmaak en periodiek werk combineren?",
        "a": "Ja. Terugkerende afspraken en eenmalige opdrachten kunnen naast elkaar bij dezelfde klantlocatie worden georganiseerd. Je houdt per werkbon zicht op werkzaamheden, medewerkers en uitvoering. De frequentie van een periodieke behandeling bepaal je bij de inrichting."
      },
      {
        "q": "Hoe neem ik mijn schoonmaakteam mee in een nieuwe werkwijze?",
        "a": "Begin met een herkenbaar object en een beperkt aantal medewerkers. Laat zien waar zij hun opdracht vinden en hoe zij taken en bijzonderheden registreren. Breid daarna uit naar andere objecten. Plan een afspraak in om deze start samen voor te bereiden."
      }
    ]
  },
  {
    "slug": "glasbewassing",
    "name": "Glasbewassing",
    "eyebrow": "Software voor glazenwassers",
    "headline": "Elke beurt helder. Elke afspraak terug te vinden.",
    "intro": "Vaste klanten, verschillende frequenties en een planning die meebeweegt met de dag. Fieldgrid helpt je glasbewassing organiseren rond de locatie, de medewerker en de gemaakte afspraak. Van terugkerend bezoek tot rapport en factuur.",
    "image": "/images/glasbewassing.webp",
    "imageAlt": "Glazenwasser reinigt de glazen gevel van een modern bedrijfsgebouw",
    "metaTitle": "Software voor glasbewassing en glazenwassers | Fieldgrid",
    "metaDescription": "Organiseer klanten, bezoekfrequenties, planning en werkbonnen voor je glazenwassersbedrijf. Houd uitvoering, rapportage en facturatie verbonden in Fieldgrid.",
    "challenges": [
      "Terugkerende bezoeken met eigen frequenties",
      "Locatiekennis onderweg beschikbaar",
      "Meerwerk en uitgevoerde beurten vastleggen"
    ],
    "benefits": [
      {
        "title": "Een dossier per locatie",
        "text": "Verzamel adresgegevens, contactpersonen, werkafspraken en documenten op één plek. Maak zichtbaar welke werkzaamheden bij het bezoek horen en welke bijzonderheden je medewerker moet kennen."
      },
      {
        "title": "Grip op de komende bezoeken",
        "text": "Werk met terugkerende opdrachten en concrete werkbonnen. Verdeel het werk op het planbord met zicht op medewerkers, beschikbaarheid en mogelijke planningsconflicten."
      },
      {
        "title": "Van buitenwerk naar administratie",
        "text": "Leg uitgevoerde taken, tijd en afwijkingen direct bij de werkbon vast. Kantoor gebruikt het rapport voor controle en de verdere administratieve afhandeling."
      }
    ],
    "sections": [
      {
        "title": "De juiste informatie voordat iemand de ladder pakt",
        "paragraphs": [
          "Bij glasbewassing zijn de verschillen tussen locaties vaak klein maar belangrijk. Welke delen horen bij de opdracht? Is een contactpersoon aanwezig? Zijn er bijzonderheden bij toegang of uitvoering? In Fieldgrid krijgt die informatie een vaste plek in het objectdossier. Je bouwt kennis op die je kunt gebruiken bij volgende bezoeken en bij de overdracht naar een collega.",
          "Een terugkerende afspraak wordt vertaald naar een concrete werkbon. Daardoor kun je per bezoek bepalen wie het werk uitvoert en wanneer de opdracht wordt vrijgegeven. Je ziet het ingeplande werk en houdt ruimte om wijzigingen bewust te verwerken. Reistijdinformatie ondersteunt de afweging van de planner; de uiteindelijke planning blijft onder jouw regie."
        ]
      },
      {
        "title": "Maak ook het werk naast de vaste beurt zichtbaar",
        "paragraphs": [
          "Een klant die naast de gebruikelijke glasbewassing ook een extra reiniging aanvraagt, hoeft geen los administratief traject te worden. Leg de vraag vast bij de bestaande klant en werk een offerte uit met de passende taken en tarieven. De afgesproken prijsversie en de uiteindelijke werkbon blijven zo met elkaar verbonden.",
          "Na uitvoering kan de medewerker bijzonderheden en foto’s toevoegen. Kantoor controleert het rapport en bepaalt wat wordt vrijgegeven. De opdrachtgever krijgt via het eigen portaal toegang tot de informatie die voor hem bedoeld is. Ook facturen en betaalstatus kunnen daar onderdeel van zijn, afhankelijk van de ingerichte modules en betaalvoorzieningen."
        ]
      },
      {
        "title": "Van een vaste gevelronde naar een compleet bezoekdossier",
        "paragraphs": [
          "Bij een bedrijfsverzamelgebouw kunnen de buitengevel, entree en binnenbeglazing verschillende afspraken hebben. Leg vast welke delen bij de reguliere beurt horen en wanneer aanvullend werk aan de orde is. Koppel relevante documenten en toegangsinstructies aan het object. De medewerker vertrekt dan met informatie over de opdracht, terwijl kantoor later kan terugvinden welke werkzaamheden voor dat bezoek waren afgesproken.",
          "Komt de contactpersoon met een aanvullende vraag, dan registreer je die in de bestaande klantrelatie. Zo houd je regulier werk en meerwerk inhoudelijk uit elkaar, met behoud van het gezamenlijke dossier. Bij een verplaatst bezoek blijft de concrete werkbon het vertrekpunt voor de nieuwe planning. Dat helpt ook wanneer een collega de volgende beurt overneemt: eerdere bezoeken, opmerkingen en werkafspraken hoeven niet opnieuw uit een persoonlijke agenda te worden gehaald."
        ]
      }
    ],
    "workflow": [
      {
        "title": "Leg de locatie vast",
        "text": "Koppel klant, werkafspraken en bezoekfrequentie aan het object."
      },
      {
        "title": "Verdeel het werk",
        "text": "Plan concrete bezoeken met beschikbare medewerkers en duidelijke tijden."
      },
      {
        "title": "Registreer de beurt",
        "text": "Noteer uitgevoerd werk en leg een afwijking of aanvullende vraag vast."
      },
      {
        "title": "Rond het bezoek af",
        "text": "Controleer de rapportage en verwerk de opdracht richting klant en factuur."
      }
    ],
    "faqs": [
      {
        "q": "Kan ik verschillende bezoekfrequenties gebruiken?",
        "a": "Ja. Terugkerend werk ondersteunt verschillende frequenties en uitzonderingen. Bij de inrichting bekijken we hoe je bestaande afspraken het beste worden vertaald naar concrete bezoeken en werkbonnen."
      },
      {
        "q": "Berekent Fieldgrid automatisch de optimale route?",
        "a": "Het planbord ondersteunt de verdeling van werk en toont reistijdinformatie. Volautomatische routeoptimalisatie is geen huidige productbelofte. Je planner houdt de regie over volgorde en inzet."
      },
      {
        "q": "Kan ik een bezoek verplaatsen als de omstandigheden veranderen?",
        "a": "Je kunt de planning van een concrete werkbon aanpassen. Daarbij beoordeel je de inzet, tijden en communicatie over die wijziging. Automatische weersgestuurde herplanning is geen standaardfunctie."
      },
      {
        "q": "Is Fieldgrid bruikbaar voor particuliere en zakelijke klanten?",
        "a": "Het platform organiseert werk rondom klanten, locaties en opdrachten. Of het bij je particuliere of zakelijke klantenbestand past, hangt vooral af van je werkproces en gewenste administratie. Tijdens een afspraak bekijken we enkele herkenbare voorbeelden uit je eigen planning."
      },
      {
        "q": "Kan ik binnen- en buitenbewassing apart vastleggen?",
        "a": "Je kunt verschillende werkzaamheden opnemen in de afspraken en taken van een opdracht. Werk met aparte opdrachten wanneer frequentie, planning of prijsafspraken verschillen. Zo blijft duidelijk welk werk bij een specifieke beurt hoort en welk werk afzonderlijk wordt georganiseerd."
      }
    ]
  },
  {
    "slug": "facilitair",
    "name": "Facilitaire dienstverlening",
    "eyebrow": "Software voor facilitaire dienstverleners",
    "headline": "Meerdere diensten. Eén helder locatieverhaal.",
    "intro": "Schoonmaak, huismeesterwerk en dagelijkse service komen samen op dezelfde locatie. Fieldgrid verbindt de mensen die het werk organiseren, de medewerkers die het uitvoeren en de opdrachtgever die overzicht wil houden.",
    "image": "/images/facilitair.webp",
    "imageAlt": "Facilitaire professionals stemmen werkzaamheden af in een modern kantoor",
    "metaTitle": "Software voor facilitaire dienstverlening | Fieldgrid",
    "metaDescription": "Breng facilitaire planning, locaties, werkbonnen en klantvragen samen. Fieldgrid ondersteunt de dagelijkse samenwerking tussen kantoor, medewerkers en opdrachtgevers.",
    "challenges": [
      "Verschillende werkzaamheden op één locatie",
      "Overdracht tussen teams en contactpersonen",
      "Klantvragen verbinden met de uitvoering"
    ],
    "benefits": [
      {
        "title": "De locatie als vertrekpunt",
        "text": "Breng contactpersonen, instructies, documenten en bezoeken bij elkaar in Object 360. Iedere opdracht krijgt zo de context van de locatie waar het werk plaatsvindt."
      },
      {
        "title": "Duidelijkheid voor ieder team",
        "text": "Vertaal afspraken naar concrete werkbonnen met taken en medewerkers. De personeelsapp toont de vrijgegeven opdrachten die voor de medewerker relevant zijn."
      },
      {
        "title": "Een herkenbare klantomgeving",
        "text": "Geef klanten toegang tot hun eigen locaties, bezoeken, rapporten en vragen. Logo en kleuren kunnen aansluiten bij de huisstijl van jouw organisatie."
      }
    ],
    "sections": [
      {
        "title": "Organiseer de dienstverlening rondom het gebouw",
        "paragraphs": [
          "Een opdrachtgever denkt in een goed functionerende locatie. De werkzaamheden daarachter kunnen verdeeld zijn over verschillende medewerkers en afspraken. Fieldgrid geeft die dagelijkse dienstverlening een gezamenlijke basis. Je verbindt werkbonnen met het juiste object en houdt documenten, instructies en contactpersonen bij diezelfde locatie. Daardoor blijft de context beschikbaar als taken of medewerkers veranderen.",
          "Het planbord maakt van de afspraken concreet werk. Een planner ziet beschikbare medewerkers, geplande inzet en aandachtspunten bij overlap. De vrijgave bepaalt wanneer de opdracht bij het personeel terechtkomt. Dat geeft ruimte om de planning eerst zorgvuldig samen te stellen en vervolgens een duidelijke opdracht aan de uitvoering door te geven."
        ]
      },
      {
        "title": "Van een losse melding naar een navolgbare afhandeling",
        "paragraphs": [
          "Facilitaire service bestaat ook uit het werk dat tussendoor ontstaat. Een aanvullende aanvraag kan worden vastgelegd bij de bestaande klant en locatie. Werk je eerst met een offerte, dan blijven de gemaakte afspraken en de gekozen prijsversie bewaard. Na akkoord kan de uitvoering verdergaan binnen dezelfde verbonden werkstroom.",
          "De medewerker registreert wat is gedaan en welke bijzonderheden aandacht vragen. Kantoor controleert de rapportage voordat informatie met de klant wordt gedeeld. Servicemeldingen en tickets geven vragen een eigen opvolging. Zo wordt het gesprek met de opdrachtgever ondersteund door concrete bezoeken en vastgelegde resultaten, zonder dat ieder team zijn eigen losse overzicht hoeft bij te houden."
        ]
      },
      {
        "title": "Een gezamenlijk dossier voor dagelijkse service",
        "paragraphs": [
          "Denk aan een kantoorcampus waar je schoonmaak, huismeestertaken en extra servicebezoeken verzorgt. De contactpersonen en algemene locatie-instructies horen bij het object. Elke concrete opdracht krijgt vervolgens eigen werkzaamheden, tijden en medewerkers. Daardoor kan het ene team zich richten op het vaste programma, terwijl een ander team een aanvullende opdracht uitvoert. Kantoor houdt de samenhang tussen die werkzaamheden bij dezelfde opdrachtgever in beeld.",
          "Een bruikbare inrichting begint met heldere keuzes: wat leg je vast als locatie-instructie, wat hoort op de werkbon en wanneer maak je een nieuwe aanvraag? Door dat vooraf af te spreken, weten medewerkers waar zij informatie terugvinden en hoe zij bijzonderheden terugmelden. Het klantportaal sluit daarop aan met bezoeken en vrijgegeven rapporten. Zo krijgt de opdrachtgever één herkenbare route om de dienstverlening te volgen en vragen te stellen."
        ]
      }
    ],
    "workflow": [
      {
        "title": "Verbind de diensten",
        "text": "Leg klant, locatie, instructies en concrete werkafspraken vast."
      },
      {
        "title": "Organiseer de inzet",
        "text": "Kies medewerkers en plan werkzaamheden op het dagplanbord."
      },
      {
        "title": "Houd uitvoering bij",
        "text": "Laat teams hun taken, tijd en bevindingen bij de werkbon registreren."
      },
      {
        "title": "Geef inzicht terug",
        "text": "Deel gecontroleerde rapporten en behandel aanvullende klantvragen."
      }
    ],
    "faqs": [
      {
        "q": "Past Fieldgrid bij een bedrijf met meerdere soorten dienstverlening?",
        "a": "Ja, wanneer de diensten worden uitgevoerd als concrete werkzaamheden op klantlocaties. Taken, werkbonnen, personeel en objectdossiers vormen de gezamenlijke basis. De specifieke inrichting bepalen we aan de hand van je dienstverlening."
      },
      {
        "q": "Vervangt Fieldgrid een volledig FMIS?",
        "a": "Fieldgrid richt zich op de operationele dienstverlening. Uitgebreide gebouwexploitatie, reserveringsbeheer en specialistisch technisch assetbeheer vallen buiten deze kern. Tijdens een demo kijken we naar de processen die je wilt verbinden."
      },
      {
        "q": "Krijgt iedere medewerker hetzelfde overzicht?",
        "a": "Toegang hangt af van de werkruimte, actieve modules en rechten. Medewerkers werken met hun eigen opdrachten; klanten krijgen hun eigen portaal. Kantoor kan functies en bevoegdheden passend bij de organisatie verdelen."
      },
      {
        "q": "Kan ik huismeesterdiensten en schoonmaak samen organiseren?",
        "a": "Ja. Beide kunnen worden vastgelegd als concrete werkzaamheden op klantlocaties. Je kiest per opdracht de taken en medewerkers die nodig zijn. Daarmee behoud je één klantrelatie en locatiebasis, terwijl de uitvoering per dienst overzichtelijk blijft."
      },
      {
        "q": "Hoe voorkom ik dat interne notities bij een opdrachtgever terechtkomen?",
        "a": "Kantoor beoordeelt rapporten voordat deze voor de klant worden vrijgegeven. Ook de toegang tot informatie volgt de ingerichte rollen en klantbinding. Tijdens de inrichting spreek je af welke informatie voor de uitvoering, interne opvolging of klantcommunicatie bedoeld is."
      }
    ]
  },
  {
    "slug": "groenonderhoud",
    "name": "Groenonderhoud",
    "eyebrow": "Software voor groenonderhoud en terreinbeheer",
    "headline": "Goed buitenwerk. Van afspraak tot vastgelegd resultaat.",
    "intro": "Je ploeg werkt buiten. De planning, afspraken en terugkoppeling moeten daar helder op aansluiten. Fieldgrid brengt terugkerend groenonderhoud, locatie-informatie en mobiele werkbonnen bij elkaar, met ruimte om bijzonderheden per bezoek vast te leggen.",
    "image": "/images/groenonderhoud.webp",
    "imageAlt": "Groenmedewerker verzorgt beplanting op een professioneel onderhouden terrein",
    "metaTitle": "Software voor groenonderhoud en terreinbeheer | Fieldgrid",
    "metaDescription": "Organiseer terugkerend groenonderhoud met planning, locatie-instructies en digitale werkbonnen. Verbind je buitendienst met kantoor en de opdrachtgever.",
    "challenges": [
      "Terugkerend onderhoud op meerdere terreinen",
      "Duidelijke instructies voor de hele ploeg",
      "Afwijkingen en aanvullend werk zichtbaar maken"
    ],
    "benefits": [
      {
        "title": "De locatie reist mee",
        "text": "Geef medewerkers de afspraken, documenten en instructies mee die bij het terrein horen. Het objectdossier blijft beschikbaar voor de voorbereiding van volgende bezoeken."
      },
      {
        "title": "Samen aan één opdracht",
        "text": "Plan meerdere medewerkers op dezelfde werkbon. Taken, uitvoering en bevindingen blijven daardoor onderdeel van één opdracht die kantoor kan beoordelen."
      },
      {
        "title": "Laat zien wat is gedaan",
        "text": "Voeg foto’s, hoeveelheden, materialen en bijzonderheden toe aan het uitvoeringsrapport. Geef de opdrachtgever na controle toegang tot de relevante rapportage."
      }
    ],
    "sections": [
      {
        "title": "Geef onderhoudsafspraken een uitvoerbaar ritme",
        "paragraphs": [
          "Terugkerend groenonderhoud vraagt om herkenbare afspraken en voldoende aandacht voor iedere locatie. In Fieldgrid koppel je het werk aan de opdrachtgever en het terrein. Je legt werkzaamheden, frequenties en instructies vast en vertaalt die naar concrete bezoeken. Zo krijgt de planner zicht op het komende werk en weet de ploeg wat er voor die opdracht wordt verwacht.",
          "Het planbord ondersteunt de verdeling van medewerkers en werkzaamheden. Beschikbaarheid en overlapwaarschuwingen helpen bij het samenstellen van de inzet. Verandert een afspraak, dan pas je de concrete planning aan. Voor seizoensgebonden werkzaamheden bepaal je zelf welke taken en periodes in de inrichting passen; automatische seizoens- of weerssturing is geen onderdeel van deze basis."
        ]
      },
      {
        "title": "Maak de overdracht tussen terrein en kantoor concreet",
        "paragraphs": [
          "Op locatie ziet een medewerker zaken die vooraf nog niet bekend waren. Een beschadiging, extra onderhoudsvraag of niet uitgevoerde taak verdient een duidelijke plek in het dossier. Via de personeelsapp kan de ploeg informatie en foto’s aan de werkbon toevoegen. Daardoor kan kantoor de bevinding beoordelen in de context van het bezoek.",
          "Aanvullend werk kan vervolgens als aanvraag worden uitgewerkt en, waar nodig, eerst worden geoffreerd. De afgesproken werkzaamheden sluiten aan op uitvoering, rapportcontrole en factuurvoorbereiding. De opdrachtgever hoeft de voortgang niet uit losse berichten samen te stellen: vrijgegeven rapporten en eigen bezoeken zijn bereikbaar in het klantportaal. Dit past vooral bij terugkerend onderhoud en afgebakende serviceopdrachten."
        ]
      },
      {
        "title": "Eén terrein, verschillende onderhoudsbezoeken",
        "paragraphs": [
          "Op een bedrijventerrein kunnen maaien, onkruidbeheer en het verzorgen van beplanting elk een eigen ritme hebben. Leg per opdracht vast welke werkzaamheden bij het bezoek horen en welke aandachtspunten voor het terrein gelden. De ploeg ziet de vrijgegeven opdracht in de personeelsapp en kan na afloop registreren wat is uitgevoerd. Een foto maakt een specifieke bevinding begrijpelijk voor de collega die het rapport beoordeelt.",
          "Niet ieder vervolg is vooraf te plannen. Blijkt een beplantingsvak beschadigd of vraagt de opdrachtgever om aanvullend werk, dan kun je die vraag in de bestaande klantrelatie verder uitwerken. Een offerte maakt de nieuwe werkzaamheden en prijsafspraken concreet voordat je de uitvoering plant. Daardoor blijft het verschil tussen contractonderhoud en een extra opdracht terugvindbaar. Fieldgrid ondersteunt die organisatorische verbinding; de vakinhoudelijke beoordeling op het terrein blijft bij jouw medewerkers."
        ]
      }
    ],
    "workflow": [
      {
        "title": "Ken het terrein",
        "text": "Leg locatiegegevens, taken, documenten en aandachtspunten vast."
      },
      {
        "title": "Plan de ploeg",
        "text": "Verdeel medewerkers over concrete onderhoudsbezoeken en geef opdrachten vrij."
      },
      {
        "title": "Leg buitenwerk vast",
        "text": "Registreer de uitvoering met tijd, materiaalgebruik en passende foto’s."
      },
      {
        "title": "Bespreek het vervolg",
        "text": "Controleer het rapport en werk eventuele aanvullende aanvragen verder uit."
      }
    ],
    "faqs": [
      {
        "q": "Is Fieldgrid geschikt voor onderhoudsrondes?",
        "a": "De basis sluit aan op terugkerend werk op vaste klantlocaties. Je kunt bezoeken en medewerkers plannen, taken meegeven en de uitvoering vastleggen. We bekijken samen hoe de frequenties van je onderhoudscontracten worden ingericht."
      },
      {
        "q": "Kan ik ook machines reserveren?",
        "a": "Materiaalgebruik kan bij de uitvoering worden geregistreerd. Volwaardige reservering van machines, voertuigen en materieel is een mogelijke verdere uitbreiding en wordt hier niet als beschikbare planningsfunctie gepresenteerd."
      },
      {
        "q": "Past het ook bij grote aanlegprojecten?",
        "a": "Fieldgrid ondersteunt afgebakende opdrachten en terugkerende dienstverlening. Grote aanlegprojecten kunnen aanvullende projectcalculatie, inkoop en technische administratie vragen. Die behoeften brengen we eerst afzonderlijk in kaart."
      },
      {
        "q": "Kan ik foto’s van de situatie vóór en na een bezoek toevoegen?",
        "a": "Foto’s kunnen onderdeel zijn van de werkbon en rapportage. Je bepaalt zelf welke beelden nodig zijn om het werk begrijpelijk vast te leggen. Kantoor controleert de rapportage voordat deze wordt gedeeld met de opdrachtgever."
      },
      {
        "q": "Is Fieldgrid een geografisch beheersysteem voor bomen of plantvakken?",
        "a": "De huidige basis organiseert klantlocaties, werkzaamheden en uitvoeringsdossiers. Uitgebreide terreinkaarten, boomregistratie en specialistisch groenassetbeheer zijn afzonderlijke behoeften. Breng die mee naar het gesprek, zodat duidelijk wordt welke aanvullende voorziening nodig is."
      }
    ]
  },
  {
    "slug": "vastgoedservice",
    "name": "Vastgoedservice",
    "eyebrow": "Software voor vastgoedservice en klein onderhoud",
    "headline": "Van melding naar een duidelijk afgehandelde opdracht.",
    "intro": "Een goede reparatie begint met heldere informatie. Fieldgrid verbindt de aanvraag, het gebouw en de medewerker die op pad gaat. Houd afspraken, werkbonnen en terugkoppeling bij elkaar voor huismeesterdiensten, vastgoedservice en klein onderhoud.",
    "image": "/images/vastgoedservice.webp",
    "imageAlt": "Servicemedewerker voert onderhoud uit bij een modern woongebouw",
    "metaTitle": "Software voor vastgoedservice en klein onderhoud | Fieldgrid",
    "metaDescription": "Verbind meldingen, locaties, planning en digitale werkbonnen voor vastgoedservice. Houd uitvoering, rapportage en klantcontact bij dezelfde opdracht.",
    "challenges": [
      "Meldingen met voldoende locatiecontext",
      "Afspraken over toegang en uitvoering",
      "Terugkoppeling die bij de opdracht blijft"
    ],
    "benefits": [
      {
        "title": "Een gebouw met een dossier",
        "text": "Bewaar contactpersonen, instructies, documenten en uitgevoerde bezoeken bij de locatie. Nieuwe opdrachten beginnen daardoor met de informatie die al is vastgelegd."
      },
      {
        "title": "Gericht op pad",
        "text": "Geef de medewerker een werkbon met concrete taken en relevante bijzonderheden. Vrijgave maakt duidelijk welke opdracht klaarstaat voor de uitvoering."
      },
      {
        "title": "Afhandeling die je kunt volgen",
        "text": "Leg bevindingen, foto’s en gebruikte materialen vast. Kantoor controleert het rapport en deelt de passende terugkoppeling met de opdrachtgever."
      }
    ],
    "sections": [
      {
        "title": "Geef iedere servicevraag de juiste context",
        "paragraphs": [
          "Een korte melding vertelt vaak nog niet alles wat een medewerker nodig heeft. Bij welk gebouw hoort de vraag? Wie is het aanspreekpunt? Welke instructies gelden voor toegang en uitvoering? In Fieldgrid verbind je een aanvraag met de klant en het object. Daardoor kan kantoor de opdracht voorbereiden op basis van een bestaand dossier.",
          "Wanneer eerst prijsafspraken nodig zijn, werk je de aanvraag uit in een offerte. Na akkoord organiseer je het bezoek via een concrete werkbon en de planning. De medewerker ontvangt de vrijgegeven opdracht in de personeelsapp. Zo blijven de aanleiding, de afgesproken werkzaamheden en de uitvoering onderdeel van dezelfde werkstroom."
        ]
      },
      {
        "title": "Laat een afgerond bezoek meer opleveren dan een status",
        "paragraphs": [
          "Tijdens een bezoek kan blijken dat de situatie anders is dan verwacht. Een foto of gerichte toelichting maakt dan duidelijk wat is aangetroffen en welke vervolgstap nodig is. De medewerker legt dit vast bij de werkbon, samen met taken, tijd en eventueel materiaalgebruik. Kantoor kan het rapport beoordelen en een vervolgopdracht voorbereiden waar dat nodig is.",
          "De opdrachtgever krijgt toegang tot vrijgegeven informatie in het eigen klantportaal. Daarbij blijven bezoeken, rapporten, aanvragen en facturen verbonden aan de eigen klantomgeving. Fieldgrid ondersteunt zo de dagelijkse service rondom gebouwen. Uitgebreide vastgoedadministratie, huurprocessen en meerjarenonderhoudsplannen vragen een eigen inrichting of aanvullende systemen buiten deze operationele basis."
        ]
      },
      {
        "title": "Praktisch voorbeeld: een servicemelding in een bedrijfsgebouw",
        "paragraphs": [
          "Een opdrachtgever meldt dat een deur in een algemene ruimte niet goed sluit. Kantoor koppelt de aanvraag aan het juiste gebouw en verzamelt de benodigde informatie: waar bevindt de deur zich, wie regelt de toegang en wat is er gemeld? Wanneer eerst een prijsvoorstel nodig is, gaat een offerte aan de uitvoering vooraf. De uiteindelijke werkbon bevat de afgesproken werkzaamheden en de context voor de servicemedewerker.",
          "Op locatie registreert de medewerker het resultaat, de bestede tijd en eventueel gebruikt materiaal. Is een vervolg nodig, dan maakt een toelichting of foto duidelijk wat nog openstaat. Kantoor beoordeelt die informatie voordat het rapport wordt gedeeld en een volgende opdracht wordt voorbereid. Deze werkwijze past bij klein onderhoud en afgebakende servicebezoeken. Voor specialistische keuringen of installatieonderhoud bespreek je eerst welke aanvullende vakinhoudelijke registratie vereist is."
        ]
      }
    ],
    "workflow": [
      {
        "title": "Ontvang de vraag",
        "text": "Leg de aanvraag vast en koppel deze aan de juiste klant en locatie."
      },
      {
        "title": "Maak de afspraak",
        "text": "Bepaal werkzaamheden, eventuele offerte en het geplande bezoek."
      },
      {
        "title": "Voer de service uit",
        "text": "Gebruik de werkbon en registreer resultaat, tijd en bijzonderheden."
      },
      {
        "title": "Koppel terug",
        "text": "Controleer het rapport, deel informatie en organiseer eventueel vervolgwerk."
      }
    ],
    "faqs": [
      {
        "q": "Kan een opdrachtgever meerdere gebouwen volgen?",
        "a": "Een klantomgeving kan meerdere objecten bevatten. Contactpersonen krijgen toegang op basis van hun binding en rechten. Zo kan een opdrachtgever de eigen locaties volgen zonder toegang tot andere klanten te krijgen."
      },
      {
        "q": "Kunnen bewoners automatisch een eigen portaal krijgen?",
        "a": "Het huidige klantportaal werkt met expliciet uitgenodigde klantcontacten. Een afzonderlijke bewonersrol met eigen toestemming, rechten en meldprocessen vraagt aanvullende inrichting en wordt niet automatisch verondersteld."
      },
      {
        "q": "Ondersteunt Fieldgrid een MJOP?",
        "a": "Fieldgrid richt zich hier op planning, uitvoering en rapportage van servicewerk. Een volwaardig meerjarenonderhoudsplan met assetstructuren en langjarige begroting valt buiten die kern."
      },
      {
        "q": "Kan ik meerwerk eerst aan de opdrachtgever voorleggen?",
        "a": "Je kunt een aanvullende aanvraag uitwerken in een offerte. Daarmee leg je de nieuwe werkzaamheden en prijsafspraken vast voordat je ze als concrete opdracht organiseert. Houd bij onverwacht meerwerk bewust onderscheid tussen de oorspronkelijke opdracht en het aanvullende voorstel."
      },
      {
        "q": "Wat is het verschil tussen Fieldgrid en vastgoedbeheersoftware?",
        "a": "Fieldgrid richt zich op de uitvoering van dienstverlening rondom een locatie: aanvragen, planning, werkbonnen, rapportage en facturatie. Huurcontracten, vastgoedexploitatie en uitgebreide financiële objectadministratie zijn andere processen. Het gesprek begint daarom bij de dagelijkse service die je wilt organiseren."
      }
    ]
  },
  {
    "slug": "beveiliging",
    "name": "Beveiliging",
    "eyebrow": "Sectorrichting in ontwikkeling",
    "headline": "Een sterke operationele basis voor beveiligingsdiensten.",
    "intro": "Beveiligingswerk vraagt om duidelijke inzet, overdraagbare locatiekennis en zorgvuldige terugkoppeling. We onderzoeken hoe de bestaande basis van Fieldgrid kan worden verdiept voor beveiligingsbedrijven, samen met de mensen die de dagelijkse operatie kennen.",
    "image": "/images/beveiliging.webp",
    "imageAlt": "Beveiligingsprofessional bij de entree van een modern gebouw",
    "metaTitle": "Fieldgrid voor beveiliging | Sectorrichting in ontwikkeling",
    "metaDescription": "Ontdek de ontwikkelrichting van Fieldgrid voor beveiliging: personeel, locatie-instructies en rapportage als basis, met sectorspecifieke verdieping in onderzoek.",
    "challenges": [
      "Personeel, kwalificaties en locatiekennis verbinden",
      "Diensten met heldere overdracht voorbereiden",
      "Branchespecifieke roosterregels zorgvuldig uitwerken"
    ],
    "benefits": [
      {
        "title": "Personeel en inzet als basis",
        "text": "De bestaande personeelsdossiers, beschikbaarheid en kwalificatieregistratie bieden aanknopingspunten voor het voorbereiden van inzet. De precieze eisen van beveiligingswerk moeten daarop worden afgestemd."
      },
      {
        "title": "Instructies bij de locatie",
        "text": "Objectdossiers verbinden contactpersonen, documenten en instructies met een locatie. Dat geeft een bestaande structuur voor de informatie die een medewerker vóór een opdracht nodig heeft."
      },
      {
        "title": "Vastlegging rondom de opdracht",
        "text": "Werkbonnen en rapporten vormen een basis om uitvoering en bijzonderheden te registreren. Specialistische incidentafhandeling en patrouillefuncties zijn afzonderlijke ontwikkelonderwerpen."
      }
    ],
    "sections": [
      {
        "title": "Een nieuwe sector bouwen vanuit de werkvloer",
        "paragraphs": [
          "Bij een beveiligingsdienst telt de samenhang tussen de juiste medewerker, de locatie en de opdracht. Fieldgrid heeft daarvoor al een operationele basis: personeelsgegevens, kwalificaties, beschikbaarheid, objectinformatie en vrijgegeven werkbonnen. Die bestaande onderdelen maken het mogelijk om samen met beveiligingsbedrijven te onderzoeken welke dagelijkse processen logisch in het platform passen.",
          "Een bruikbare sectorspecifieke oplossing vraagt vervolgens om meer dan andere termen op een planbord. Diensten kunnen over middernacht lopen, inzet kan aan bijzondere voorwaarden zijn gebonden en de overdracht kan een eigen procedure hebben. We willen die praktijk eerst zorgvuldig vertalen naar concrete producteisen en toetsbare scenario’s."
        ]
      },
      {
        "title": "Duidelijk over de volgende stap",
        "paragraphs": [
          "Voor deze verticale dienstverlening onderzoeken we onder meer nachtdiensten, rusttijden, dienstacceptatie en de overdracht tussen medewerkers. Ook patrouillerondes, incidentregistratie en toeslaginformatie vragen een eigen ontwerp. Deze functies worden hier als ontwikkelrichting beschreven. Zij vormen geen belofte dat Fieldgrid al een complete 24/7-rooster- of beveiligingssuite is.",
          "In een verkennend gesprek beginnen we daarom bij een concrete werkdag en de informatie die daarbij tussen planner, medewerker en opdrachtgever beweegt. We bespreken welke bestaande functies aansluiten en welke aanvulling nodig is. Zo ontstaat een gedeeld beeld van de scope voordat afspraken worden gemaakt over een pilot, de inrichting of verdere ontwikkeling."
        ]
      },
      {
        "title": "Begin bij één herkenbaar beveiligingsproces",
        "paragraphs": [
          "Een receptiedienst in een kantoorgebouw is een bruikbaar vertrekpunt voor een verkenning. Welke informatie heeft de medewerker vooraf nodig? Wie is het aanspreekpunt op locatie? Welke terugkoppeling verwacht de opdrachtgever na de inzet? Door dit proces stap voor stap te bespreken, worden de verbindingen met personeels- en objectdossiers concreet.",
          "Daarna toetsen we de onderdelen die specifiek zijn voor jouw beveiligingsbedrijf, zoals een dienstwisseling, uitzonderlijke inzet of een incident. Per onderdeel leggen we vast of het bestaande platform aansluit, aanvullende inrichting nodig heeft of eerst ontwikkeld moet worden. Zo kun je de vervolgstap beoordelen op basis van een duidelijke scope."
        ]
      }
    ],
    "workflow": [
      {
        "title": "Verken de operatie",
        "text": "Breng locaties, soorten inzet en verantwoordelijke rollen in kaart."
      },
      {
        "title": "Toets de basis",
        "text": "Bekijk hoe personeel, objectdossiers en werkbonnen op het proces aansluiten."
      },
      {
        "title": "Verdiep de sector",
        "text": "Werk ontbrekende dienstregels, overdracht en registraties uit als ontwikkelscope."
      },
      {
        "title": "Beproef de werkwijze",
        "text": "Bespreek een afgebakende pilot met concrete verwachtingen en evaluatiemomenten."
      }
    ],
    "faqs": [
      {
        "q": "Is Fieldgrid al een volledig beveiligingspakket?",
        "a": "Nee. Deze pagina beschrijft een sectorrichting in ontwikkeling. De bestaande basis ondersteunt algemene personeels-, locatie- en werkprocessen; gespecialiseerde beveiligingsfuncties moeten afzonderlijk worden uitgewerkt en gevalideerd."
      },
      {
        "q": "Worden nachtdiensten en wettelijke roosterregels automatisch gecontroleerd?",
        "a": "Een complete engine voor nachtdiensten, rusttijden en branchespecifieke regels is geen huidige productbelofte. Deze onderwerpen staan centraal bij de verkenning van de beveiligingsvertical."
      },
      {
        "q": "Kunnen we meedenken vanuit ons beveiligingsbedrijf?",
        "a": "Ja. Een gesprek over je planning, overdracht en rapportage helpt om de benodigde verdieping concreet te maken. We bespreken daarna welke vervolgstap past; deelname geeft geen automatische beschikbaarheids- of oplevergarantie."
      },
      {
        "q": "Kan ik beginnen met een gesprek over mijn eigen beveiligingsproces?",
        "a": "Ja. Plan een afspraak in en neem een voorbeeldplanning, een geanonimiseerde instructie of een beschrijving van de overdracht mee. Daarmee kunnen we gericht bespreken welke basis aansluit en welke sectorspecifieke verdieping je nodig hebt."
      }
    ],
    "future": "In ontwikkeling: de bestaande platformbasis wordt verkend voor beveiliging. Nachtdiensten, rusttijdregels, patrouilles en specialistische incidentprocessen zijn nog geen standaardfuncties."
  },
  {
    "slug": "evenementen",
    "name": "Evenementen",
    "eyebrow": "Sectorrichting in ontwikkeling",
    "headline": "De mensen achter het evenement, helder georganiseerd.",
    "intro": "Van voorbereiding tot overdracht: een evenement vraagt om mensen die weten waar zij nodig zijn. Fieldgrid verkent een gerichte uitbreiding voor personeelsinzet en dienstverlening rondom evenementen, voortbouwend op planning, locatie-informatie en mobiele opdrachten.",
    "image": "/images/evenementen.webp",
    "imageAlt": "Evenementenmedewerkers bereiden een professionele publiekslocatie voor",
    "metaTitle": "Fieldgrid voor evenementen | Personeelsinzet in ontwikkeling",
    "metaDescription": "Verken Fieldgrid voor dienstverlening rondom evenementen. Een ontwikkelrichting voor personeelsinzet, locatie-informatie en overdracht, gebouwd op de bestaande basis.",
    "challenges": [
      "Verschillende teams rond dezelfde evenementlocatie",
      "Briefings en inzet met elkaar verbinden",
      "Zones, accreditatie en dienstacceptatie uitwerken"
    ],
    "benefits": [
      {
        "title": "De voorbereiding verbonden",
        "text": "De huidige basis brengt personeel, beschikbaarheid en opdrachten samen. Dat biedt een vertrekpunt voor de organisatie van dienstverlenende teams rond een evenement."
      },
      {
        "title": "Een gedeeld locatieverhaal",
        "text": "Documenten, instructies en contactpersonen kunnen bij een object worden vastgelegd. Een verdieping voor zones, posten en evenementbriefings vraagt aanvullende ontwikkeling."
      },
      {
        "title": "De uitvoering terugvindbaar",
        "text": "Mobiele werkbonnen en rapportage bieden een basis om taken en bijzonderheden te registreren. Operationele regie tijdens een evenement krijgt een eigen sectorspecifieke uitwerking."
      }
    ],
    "sections": [
      {
        "title": "Een evenement bestaat uit samenhangende diensten",
        "paragraphs": [
          "Achter een evenement werken verschillende mensen aan één ervaring. Schoonmaak, facilitaire ondersteuning en beveiliging hebben ieder hun eigen taken, terwijl zij dezelfde locatie en tijdlijn delen. Fieldgrid onderzoekt hoe deze dienstverlenende kant beter kan worden verbonden. Het uitgangspunt is een concrete opdracht: wie doet wat, op welke plek en met welke informatie?",
          "De bestaande platformbasis ondersteunt personeel, beschikbaarheid, locatiegegevens, documenten en uitvoering via werkbonnen. Daarmee kunnen we herkenbare processen verkennen zonder te doen alsof ieder evenement al in een standaardinrichting past. Juist de verschillen tussen opbouw, publieksmoment en afbouw moeten zichtbaar worden gemaakt voordat een sectorspecifieke werkwijze kan worden vastgesteld."
        ]
      },
      {
        "title": "Ontwikkelen voor de drukte van een echte evenementdag",
        "paragraphs": [
          "Voor een passende evenemententoepassing onderzoeken we onder meer zones en posten, het aanbieden en accepteren van diensten, briefings en de overdracht tussen teams. Ook inzet over middernacht en samenwerking met externe partijen verdienen afzonderlijke aandacht. Dit zijn ontwikkelonderwerpen; de pagina presenteert ze niet als reeds beschikbare evenementfuncties.",
          "De volgende stap begint bij een afgebakend voorbeeld uit de praktijk. We lopen samen de voorbereiding, personeelsinzet en terugkoppeling door. Zo wordt duidelijk wat de bestaande onderdelen al kunnen dragen en welke verdieping nodig is voor een bruikbare pilot. Het doel is een passende operationele werkwijze voor dienstverleners, met heldere verwachtingen over functies en verantwoordelijkheden."
        ]
      },
      {
        "title": "Van opbouw naar afbouw: dezelfde locatie, een andere opdracht",
        "paragraphs": [
          "Een evenementlocatie verandert gedurende de dag. Tijdens de opbouw draait de inzet om voorbereiding, tijdens publieksmomenten om dienstverlening en na afloop om overdracht en afronding. Als voorbeeldscenario onderzoeken we hoe schoonmaak en facilitaire ondersteuning rond die verschillende fases worden georganiseerd. Daarbij kijken we naar de informatie die teams vooraf nodig hebben en na afloop moeten teruggeven.",
          "De gewenste verdieping begint bij concrete vragen over rollen, locaties en verantwoordelijkheden. Wie bevestigt de inzet? Hoe wordt een wijziging gedeeld? Welke informatie mag een opdrachtgever zien? De antwoorden bepalen de ontwikkelscope. Een demonstratie van de bestaande basis helpt om dit gesprek tastbaar te maken, zonder een volledig evenementensysteem te veronderstellen."
        ]
      }
    ],
    "workflow": [
      {
        "title": "Breng de diensten in kaart",
        "text": "Beschrijf teams, werkzaamheden en verantwoordelijkheden rondom de locatie."
      },
      {
        "title": "Verbind de voorbereiding",
        "text": "Onderzoek hoe personeel, opdrachten en locatie-instructies samenkomen."
      },
      {
        "title": "Ontwerp de verdieping",
        "text": "Werk zones, dienstacceptatie en briefingprocessen uit als ontwikkelonderwerpen."
      },
      {
        "title": "Evalueer in de praktijk",
        "text": "Maak een eventuele pilot concreet met een begrensde scope en duidelijke doelen."
      }
    ],
    "faqs": [
      {
        "q": "Is dit een ticketplatform voor evenementen?",
        "a": "Nee. Deze richting gaat over personeelsinzet en dienstverlening rondom een evenement. Ticketverkoop, publieksregistratie en marketingcampagnes horen niet bij de hier beschreven productscope."
      },
      {
        "q": "Kan ik nu al zones en accreditaties beheren?",
        "a": "Specialistisch zone- en accreditatiebeheer is geen bestaande standaardfunctie die we hier aanbieden. We onderzoeken welke onderdelen nodig zijn voor de beoogde evenementendienstverlening en welke bestaande systemen daarbij een rol houden."
      },
      {
        "q": "Hoe sluit dit aan op beveiliging en facilitaire dienstverlening?",
        "a": "Die diensten kunnen rondom dezelfde locatie en opdracht plaatsvinden. De huidige basis biedt gedeelde dossiers en werkprocessen. De specifieke regels en verantwoordelijkheden van iedere dienst vragen daarbij een eigen inrichting en soms aanvullende ontwikkeling."
      },
      {
        "q": "Is deze richting ook relevant voor eventcatering of hospitality?",
        "a": "Personeel en dienstverlening op een evenementlocatie hebben raakvlakken met de bestaande basis. Cateringlogistiek, bestellingen en gespecialiseerde hospitalityprocessen vragen een afzonderlijke beoordeling. We bekijken daarom eerst de concrete werkzaamheden en personeelsinzet die je wilt organiseren."
      }
    ],
    "future": "In ontwikkeling: dienstverlening rondom evenementen. Zones, posten, dienstacceptatie, accreditatie en diensten over middernacht vragen gerichte verdere uitwerking."
  }
];

export const products: Product[] = [
  {
    "slug": "planning",
    "name": "Planning",
    "eyebrow": "Van werkvoorraad naar heldere inzet",
    "headline": "Maak een werkdag waar je team op kan bouwen.",
    "intro": "Breng werkbonnen, medewerkers en beschikbaarheid samen op het planbord. Zie welke opdrachten nog een plek nodig hebben en geef de uitvoering een duidelijke, bewust vrijgegeven planning.",
    "features": [
      {
        "title": "Werk dat nog aandacht vraagt",
        "text": "Gebruik de bonnenbak om werk te zien dat nog ingepland moet worden. De opdracht blijft verbonden aan klant, object en afgesproken werkzaamheden."
      },
      {
        "title": "Beschikbaarheid in context",
        "text": "Beoordeel de inzet met zicht op beschikbaarheid, geplande werkzaamheden, reistijdinformatie en signalen bij overlap. De planner houdt de regie over keuzes."
      },
      {
        "title": "Bewuste vrijgave",
        "text": "Bereid een opdracht eerst voor en geef deze daarna vrij aan medewerkers. Gepland werk is daarmee niet automatisch een definitieve personeelsopdracht."
      }
    ],
    "paragraphs": [
      "Een planning is meer dan een verzameling afspraken. De kwaliteit zit in de verbinding met het werk: waar moet iemand zijn, wat moet er gebeuren en welke informatie hoort daarbij? In Fieldgrid plan je concrete werkbonnen. Klantgegevens en objectinstructies blijven verbonden aan die opdracht, zodat de medewerker met dezelfde context aan de slag kan.",
      "Terugkerende werkzaamheden krijgen concrete bezoeken die je kunt inplannen. Daarbij kun je meerdere medewerkers aan dezelfde opdracht koppelen. Verandert de situatie, dan beoordeel je de inzet opnieuw en pas je de werkbon aan. Na uitvoering sluiten de geregistreerde tijden en het rapport aan op de verdere afhandeling door kantoor.",
      "Stel dat een medewerker onverwacht niet beschikbaar is. Vanuit het planbord beoordeel je welke werkbonnen aandacht nodig hebben en wie de werkzaamheden kan overnemen. De locatiegegevens en taakinhoud blijven bij de opdracht staan. Wanneer de aangepaste inzet gereed is, geef je de juiste opdracht aan de uitvoering door. Dat is ook waardevol bij groei: de planning blijft verbonden met de werkvoorraad en leunt minder op afzonderlijke notities of het geheugen van één planner.",
      "Begin met de manier waarop jouw bedrijf het werk vandaag organiseert. Tijdens een demo laten we zien hoe voorbereiding, planning, vrijgave en uitvoering op elkaar aansluiten. Zo kun je beoordelen welke inrichting past bij je team en de dienstverlening op je klantlocaties."
    ],
    "faqs": [
      {
        "q": "Kan ik vaste werkzaamheden laten terugkeren?",
        "a": "Ja. Je kunt werk met een terugkerende frequentie vastleggen. Daaruit volgen concrete werkbonnen die je met medewerkers inplant en vrijgeeft."
      },
      {
        "q": "Plant Fieldgrid alles automatisch?",
        "a": "Fieldgrid ondersteunt de planner met informatie en controles. Een autonome AI-planner of automatische optimale routeverdeling is geen huidige functie."
      },
      {
        "q": "Wat is het verschil tussen plannen en vrijgeven?",
        "a": "Bij het plannen bereid je de inzet en tijden voor. Vrijgave is het bewuste moment waarop de opdracht beschikbaar wordt voor de medewerker. Deze scheiding geeft kantoor ruimte om een werkdag samen te stellen voordat het team met de opdracht aan de slag gaat."
      },
      {
        "q": "Kan ik de planning met mijn eigen werkwijze beoordelen?",
        "a": "Ja. Plan een afspraak in en gebruik een herkenbaar voorbeeld, zoals een vaste schoonmaakronde of een dag met servicebezoeken. Daarmee bespreken we hoe werkvoorraad, medewerkers en terugkerende opdrachten op jouw organisatie aansluiten."
      }
    ],
    "metaTitle": "Personeelsplanning en werkbonnen plannen | Fieldgrid",
    "metaDescription": "Breng medewerkers, beschikbaarheid en werkbonnen samen op het Fieldgrid-planbord. Organiseer terugkerend werk en geef je team een duidelijke dagelijkse planning."
  },
  {
    "slug": "werkbonnen",
    "name": "Digitale werkbonnen",
    "eyebrow": "De opdracht als verbindende schakel",
    "headline": "Van afspraak naar aantoonbaar uitgevoerd werk.",
    "intro": "Geef iedere opdracht een duidelijk begin, een uitvoerbare takenlijst en een navolgbare afronding. Digitale werkbonnen verbinden wat je afspreekt met wat je team op locatie daadwerkelijk vastlegt.",
    "features": [
      {
        "title": "Duidelijk voorbereid",
        "text": "Breng klant, object, werkzaamheden en medewerkers bij elkaar. Een werkbon krijgt een concrete datum en wordt bewust vrijgegeven voor de uitvoering."
      },
      {
        "title": "Vastgelegd op locatie",
        "text": "Registreer taken, tijd, hoeveelheden, materialen, foto’s en afwijkingen bij de opdracht. Ondertekening kan onderdeel van de ingerichte werkwijze zijn."
      },
      {
        "title": "Gecontroleerd afgerond",
        "text": "Beoordeel de rapportage op kantoor en geef de juiste versie vrij. Uitvoering en factuurvoorbereiding blijven zo verbonden aan dezelfde opdracht."
      }
    ],
    "paragraphs": [
      "Een afspraak is pas uitvoerbaar als duidelijk is wat er moet gebeuren. Fieldgrid maakt van de klantvraag een concrete werkbon, gekoppeld aan de juiste locatie en de medewerkers die het werk uitvoeren. De instructies en taken reizen mee naar de personeelsapp. Ook bij gezamenlijke uitvoering blijft de informatie bij dezelfde opdracht.",
      "Tijdens het bezoek kan de medewerker meer vastleggen dan alleen een eindstatus. Een toelichting bij een afwijking, foto van de situatie of registratie van gebruikte materialen maakt het resultaat begrijpelijk voor kantoor. De rapportcontrole vormt vervolgens het moment om te beoordelen of de informatie compleet is en wat met de klant wordt gedeeld.",
      "Een goede digitale werkbon vertelt ook waarom iets anders is verlopen. Was een ruimte niet toegankelijk of bleek een aanvullende behandeling nodig? Leg de situatie vast in de context van het bezoek. De medewerker kan de uitvoering afronden met een toelichting, waarna kantoor het rapport beoordeelt en het vervolg bepaalt. Zo blijft een afwijking onderdeel van het dossier. Een volgende collega hoeft de oorspronkelijke aanleiding niet opnieuw bij de klant uit te vragen.",
      "De commerciële kant blijft aangesloten. Een aanvraag en offerte kunnen voorafgaan aan de werkbon; de afgesproken prijsversie vormt de context van het werk. Na de uitvoering ondersteunen rapportage en controle de voorbereiding van facturen. Zo blijft de geschiedenis van een opdracht terugvindbaar, ook wanneer later een vraag of vervolgbezoek ontstaat."
    ],
    "faqs": [
      {
        "q": "Kan ik foto’s aan de uitvoering toevoegen?",
        "a": "Ja. Foto’s en opmerkingen kunnen bij de werkbon worden vastgelegd en onderdeel van het uitvoeringsrapport worden."
      },
      {
        "q": "Ziet de klant ieder rapport direct?",
        "a": "De klant ziet de rapporten die passend zijn vrijgegeven voor het klantportaal. Kantoor houdt daarmee een controlemoment tussen uitvoering en publicatie."
      },
      {
        "q": "Kan een werkbon door meerdere medewerkers worden uitgevoerd?",
        "a": "Ja. De inzet kan uit meerdere medewerkers bestaan. De werkbon blijft het gezamenlijke dossier voor de werkzaamheden en uitvoering. Bij de inrichting bepaal je hoe je team de taken en registratie rondom een gezamenlijke opdracht organiseert."
      },
      {
        "q": "Zijn digitale werkbonnen geschikt voor zowel periodiek als eenmalig werk?",
        "a": "Ja. Een terugkerende afspraak levert concrete bezoeken op, terwijl je een losse klantvraag als eenmalige opdracht kunt organiseren. Beide krijgen een werkbon met de relevante locatie, werkzaamheden en uitvoeringsinformatie."
      }
    ],
    "metaTitle": "Digitale werkbonnen voor werk op locatie | Fieldgrid",
    "metaDescription": "Verbind opdrachten, taken, tijdregistratie en foto’s met digitale werkbonnen. Fieldgrid brengt uitvoering, rapportcontrole en klantterugkoppeling bij elkaar."
  },
  {
    "slug": "objecten",
    "name": "Klanten & Object 360",
    "eyebrow": "Het verhaal achter iedere locatie",
    "headline": "Alle locatiekennis bij het werk dat je doet.",
    "intro": "Maak van een adres een bruikbaar dossier. Object 360 brengt contactpersonen, instructies, documenten en bezoeken samen, zodat nieuwe opdrachten beginnen met de kennis die al in je organisatie aanwezig is.",
    "features": [
      {
        "title": "Context voor de uitvoering",
        "text": "Bewaar ruimtes, werkprogramma’s en bijzonderheden bij het object. De locatie-informatie helpt kantoor bij de voorbereiding en medewerkers bij de uitvoering."
      },
      {
        "title": "Geschiedenis die blijft",
        "text": "Houd bezoeken en relevante documentatie verbonden aan de locatie. Dat maakt terugzoeken mogelijk wanneer een opdrachtgever een vraag heeft over eerder werk."
      },
      {
        "title": "Klant en locaties verbonden",
        "text": "Beheer meerdere objecten bij dezelfde klant, met de bijbehorende contactpersonen. Werkbonnen en aanvragen krijgen steeds de passende locatiecontext."
      }
    ],
    "paragraphs": [
      "Veel waardevolle kennis over een locatie zit bij de collega die er het vaakst komt. Fieldgrid helpt die kennis onderdeel van de dagelijkse werkstroom te maken. Je legt relevante instructies en documenten vast in het objectdossier. Daardoor kan kantoor een nieuwe opdracht voorbereiden zonder opnieuw bij verschillende mensen naar dezelfde gegevens te vragen.",
      "Vanuit die vaste basis organiseer je terugkerende werkzaamheden en losse bezoeken. Een aanvraag, offerte en werkbon worden gekoppeld aan de klant en het object waar zij bij horen. De uitvoering voegt nieuwe informatie toe aan de geschiedenis. Zo groeit het dossier mee met het werk dat je daadwerkelijk op de locatie verricht.",
      "Bij een klant met meerdere gebouwen is het onderscheid tussen algemene klantafspraken en locatiegebonden instructies belangrijk. Een vaste contactpersoon kan overkoepelend betrokken zijn, terwijl toegang, ruimtes en werkprogramma per object verschillen. Met die structuur begint iedere werkbon bij de juiste context. Een vervangende medewerker kan zich voorbereiden met de vastgelegde informatie. Het dossier blijft daarmee een onderdeel van het dagelijkse werk, in plaats van een archief dat losstaat van planning en uitvoering.",
      "Ook de opdrachtgever krijgt een passend perspectief. In het klantportaal staan de eigen objecten, bezoeken en vrijgegeven rapporten centraal. Die verbonden registratie helpt bij gesprekken over uitgevoerd werk en aanvullende vragen. De precieze toegang volgt de inrichting en rechten van de betreffende klantcontacten."
    ],
    "faqs": [
      {
        "q": "Kan een klant meerdere locaties hebben?",
        "a": "Ja. Een klant kan meerdere objecten hebben met eigen gegevens, instructies en bezoeken. De relaties blijven binnen het klantdossier zichtbaar."
      },
      {
        "q": "Is Object 360 ook technisch assetbeheer?",
        "a": "Object 360 richt zich op locatiegebonden dienstverlening. Uitgebreid installatiebeheer, serienummers, onderhoudsmeters en een volledig MJOP vragen aanvullende specialistische functionaliteit."
      },
      {
        "q": "Kan ik per gebouw andere instructies en documenten vastleggen?",
        "a": "Ja. Ieder object heeft een eigen locatiecontext. Bewaar daar de documenten en instructies die voor dat gebouw of terrein relevant zijn. Zo blijft onderscheid mogelijk tussen algemene afspraken met de klant en informatie voor een specifiek bezoek."
      },
      {
        "q": "Waar begin ik met het opbouwen van mijn objectdossiers?",
        "a": "Begin bij de locaties waarop je regelmatig werkt. Leg eerst de juiste contactpersonen, toegangsinformatie en concrete werkzaamheden vast. Breid daarna de dossierinformatie uit op basis van wat planners en medewerkers daadwerkelijk nodig hebben."
      }
    ],
    "metaTitle": "Klanten en objectbeheer met Object 360 | Fieldgrid",
    "metaDescription": "Bewaar locaties, contactpersonen, instructies en bezoeken in één dossier. Object 360 verbindt je klantgegevens met planning en de dagelijkse uitvoering."
  },
  {
    "slug": "personeelsapp",
    "name": "Personeelsapp",
    "eyebrow": "Een duidelijke opdracht binnen handbereik",
    "headline": "Je team op locatie. De informatie bij de hand.",
    "intro": "Geef medewerkers een eigen werkruimte voor hun planning, vrijgegeven opdrachten en registratie. De Fieldgrid-personeelsapp brengt de informatie die bij het werk hoort naar de mensen die het uitvoeren.",
    "features": [
      {
        "title": "Vandaag aan het werk",
        "text": "Medewerkers zien hun eigen planning en vrijgegeven werkbonnen. Locatiegegevens, taken en instructies geven richting aan de uitvoering."
      },
      {
        "title": "Registreren bij de opdracht",
        "text": "Leg tijd, taken, foto’s en bijzonderheden vast op de plek waar het werk gebeurt. De informatie gaat mee naar de rapportcontrole op kantoor."
      },
      {
        "title": "Ook de medewerker centraal",
        "text": "Afhankelijk van de inrichting zijn beschikbaarheid, verlof, documenten, nieuws en profielgegevens bereikbaar in dezelfde personeelsomgeving."
      }
    ],
    "paragraphs": [
      "Een medewerker heeft onderweg andere vragen dan een planner op kantoor. Waar moet ik zijn? Wat moet ik doen? Welke bijzonderheden gelden hier? De personeelsapp geeft deze vragen een eigen plek. Een vrijgegeven opdracht is verbonden aan het object en de werkzaamheden, zodat de uitvoering niet uit losse berichten samengesteld hoeft te worden.",
      "De terugkoppeling loopt langs dezelfde verbinding. Tijdens de uitvoering kan de medewerker taken registreren en een foto of toelichting toevoegen als iets afwijkt. Kantoor ontvangt die informatie in de context van de werkbon en kan het rapport beoordelen. Bij werk dat samen wordt uitgevoerd blijft de opdracht het gezamenlijke vertrekpunt.",
      "Een herkenbare start helpt medewerkers om de app in hun dagelijkse routine op te nemen. Begin met het bekijken van de eigen planning en één vrijgegeven opdracht. Laat vervolgens zien hoe taken worden afgehandeld en hoe een bijzonderheid aan de werkbon wordt toegevoegd. Pas daarna komen aanvullende onderdelen aan bod. Bij deze stapsgewijze kennismaking kun je controleren of instructies duidelijk genoeg zijn en of de gekozen registratie aansluit bij het werk op locatie.",
      "De app is een installeerbare webapp, ook wel PWA genoemd. Op geschikte Android- en iPhone-browsers kan zij aan het startscherm worden toegevoegd. Logo en kleuren kunnen aansluiten op de organisatie. Bij de inrichting bepalen we welke onderdelen medewerkers nodig hebben en hoe zij met de werkwijze kennismaken."
    ],
    "faqs": [
      {
        "q": "Moet personeel een app uit de App Store downloaden?",
        "a": "De huidige personeelsapp is een PWA die via een ondersteunde browser kan worden geïnstalleerd. Installatiehulp is beschikbaar in de instellingen van de app."
      },
      {
        "q": "Kan de app volledig offline worden gebruikt?",
        "a": "Volledige offline uitvoering en synchronisatie van werkbonmutaties worden niet als huidige functie aangeboden. Voor de werkprocessen houd je rekening met een internetverbinding."
      },
      {
        "q": "Ziet een medewerker alleen de opdrachten die voor hem of haar bedoeld zijn?",
        "a": "De personeelsomgeving is gericht op de eigen planning en toegewezen, vrijgegeven werkzaamheden. Welke aanvullende onderdelen beschikbaar zijn, hangt af van de inrichting en toegangsrechten. Dat staat los van de bredere bedrijfsinformatie in de backoffice."
      },
      {
        "q": "Kan mijn team beschikbaarheid doorgeven?",
        "a": "De personeelsomgeving ondersteunt beschikbaarheid en verlof, afhankelijk van de ingeschakelde onderdelen. Tijdens de inrichting bepaal je hoe medewerkers deze informatie bijhouden en hoe kantoor die gegevens gebruikt bij het plannen."
      }
    ],
    "metaTitle": "Personeelsapp voor medewerkers op locatie | Fieldgrid",
    "metaDescription": "Geef je team een eigen app voor planning, werkbonnen, taken en terugkoppeling. Ontdek de Fieldgrid-personeelsapp voor dienstverlening op klantlocaties."
  },
  {
    "slug": "klantportaal",
    "name": "Klantportaal",
    "eyebrow": "Een eigen plek voor de opdrachtgever",
    "headline": "Houd je klant betrokken bij het werk.",
    "intro": "Geef opdrachtgevers toegang tot hun eigen locaties, bezoeken en vrijgegeven rapporten. Met het Fieldgrid-klantportaal blijft de terugkoppeling verbonden aan de dienstverlening die je voor hen organiseert.",
    "features": [
      {
        "title": "Overzicht op eigen locaties",
        "text": "Klanten vinden hun objecten, bezoeken en relevante informatie in een eigen omgeving. Toegang volgt de binding en rechten van de contactpersoon."
      },
      {
        "title": "Van vraag naar afspraak",
        "text": "Laat aanvragen, offertes en servicevragen aansluiten op bestaande klantgegevens. Een reactie of aanvullende vraag krijgt zo de juiste context."
      },
      {
        "title": "Rapporten en facturen bij elkaar",
        "text": "Maak vrijgegeven rapporten en facturen bereikbaar voor de klant. Online betaling is mogelijk wanneer de passende providerkoppeling correct is ingericht."
      }
    ],
    "paragraphs": [
      "Een opdrachtgever wil weten wanneer het werk plaatsvindt, wat er is uitgevoerd en waar een vraag terechtkan. Het klantportaal brengt die informatie samen in een eigen werkruimte. De klant krijgt toegang tot de eigen gegevens en de rapporten die kantoor heeft vrijgegeven. Dat maakt de overdracht naar de opdrachtgever onderdeel van dezelfde werkstroom.",
      "Ook nieuw werk kan vanuit die bestaande relatie worden georganiseerd. Een bezoekaanvraag of aanvullende vraag wordt gekoppeld aan de bekende klant. Offertes kunnen worden beoordeeld en de verdere uitvoering sluit aan op de concrete afspraken. Tickets geven servicevragen een eigen behandeling, met een passende scheiding tussen communicatie voor de klant en interne afstemming.",
      "Voor een opdrachtgever met verschillende locaties telt vooral of de informatie terug te vinden is. Welke afspraak hoort bij welk gebouw? Is het uitvoeringsrapport al vrijgegeven? Bij welk bezoek ontstond een aanvullende vraag? Het klantportaal sluit aan op de bestaande klant- en objectstructuur. Daardoor kan een contactpersoon de eigen dienstverlening volgen in een herkenbare omgeving. Tegelijk bepaalt jouw organisatie welke gecontroleerde informatie wordt gedeeld en welke werkzaamheden nog intern worden voorbereid.",
      "De financiële afhandeling blijft in hetzelfde perspectief zichtbaar. Klanten kunnen hun facturen en bijbehorende betaalstatus bekijken. Wanneer online betalingen zijn ingericht, volgt de status de actuele verwerking en providercontrole. Tijdens een demo bespreken we welke onderdelen je beschikbaar wilt maken en hoe de klantomgeving aansluit bij jouw huisstijl en dienstverlening."
    ],
    "faqs": [
      {
        "q": "Zien mijn klanten het volledige bedrijfsdashboard?",
        "a": "Nee. Het klantportaal is een eigen omgeving met expliciet gebonden klantgegevens en rechten. De backoffice en interne informatie blijven afgeschermd."
      },
      {
        "q": "Kan het portaal mijn eigen uitstraling krijgen?",
        "a": "Logo en kleuren kunnen worden ingesteld. Een eigen domein is een inrichtingsmogelijkheid met aanvullende technische voorwaarden. We bespreken de beschikbare opties tijdens de inrichting."
      },
      {
        "q": "Kan een klant een aanvullende opdracht aanvragen?",
        "a": "Het klantportaal ondersteunt aanvragen en servicevragen vanuit de bestaande klantrelatie. Kantoor beoordeelt de vraag en kan de verdere afspraken organiseren, bijvoorbeeld met een offerte voordat een nieuwe werkbon wordt ingepland."
      },
      {
        "q": "Welke informatie komt pas na controle in het portaal?",
        "a": "Uitvoeringsrapporten worden voor de klant vrijgegeven na de passende controle op kantoor. Dat geeft je team gelegenheid om de rapportage te beoordelen en ervoor te zorgen dat de gedeelde versie aansluit op de uitgevoerde opdracht."
      }
    ],
    "metaTitle": "Klantportaal voor locaties, rapporten en facturen | Fieldgrid",
    "metaDescription": "Laat opdrachtgevers hun eigen locaties, bezoeken, rapporten en facturen bekijken. Verbind klantvragen met je dienstverlening via het Fieldgrid-klantportaal."
  },
  {
    "slug": "onboarding",
    "name": "Personeel & onboarding",
    "eyebrow": "Een goede start voor iedere medewerker",
    "headline": "Nieuwe collega’s. Een duidelijke eerste werkdag.",
    "intro": "Breng personeelsgegevens, documenten en de kennismaking met Fieldgrid samen. Met een ingericht personeelsdossier en een stapsgewijze onboarding krijgt kantoor overzicht en weet de medewerker waar het dagelijkse werk begint.",
    "features": [
      {
        "title": "Een centraal personeelsdossier",
        "text": "Verbind contactgegevens, functies, kwalificaties en documenten aan de medewerker. De vastgelegde informatie ondersteunt de voorbereiding van inzet en de opvolging door kantoor."
      },
      {
        "title": "Begeleid kennismaken",
        "text": "Nodig medewerkers uit en laat hen de ingerichte onboarding doorlopen. Maak duidelijk welke gegevens en stappen nodig zijn voordat zij met de personeelsomgeving aan de slag gaan."
      },
      {
        "title": "Beschikbaarheid en opvolging",
        "text": "Houd beschikbaarheid, verlof en personeelsgebonden opvolging bij elkaar. Kies welke onderdelen actief zijn en hoe verantwoordelijkheden binnen je organisatie worden verdeeld."
      }
    ],
    "paragraphs": [
      "De eerste werkdag begint voor kantoor vaak ruim voor het eerste bezoek aan een klant. Gegevens moeten compleet zijn, verantwoordelijkheden duidelijk en de medewerker moet weten waar de planning te vinden is. Fieldgrid brengt die voorbereiding samen in het personeelsdossier. Je bouwt een herkenbare basis op voor de mensen die je later op klantlocaties inzet.",
      "De onboarding helpt bij de kennismaking met de personeelsomgeving. Een medewerker wordt uitgenodigd en doorloopt de ingerichte stappen. Daarna blijft het dossier verbonden met de dagelijkse werkstroom. De planner gebruikt de relevante informatie bij de inzet; de medewerker werkt vanuit de eigen app met planning en vrijgegeven opdrachten. Welke gegevens zichtbaar zijn en welke onderdelen beschikbaar worden, volgt de inrichting en rechten.",
      "Kwalificaties en documenten krijgen een plek bij de juiste persoon. Dat maakt het mogelijk om bij de voorbereiding van werk gerichter te beoordelen wie bij de opdracht past. Personeelsgebonden reminders en opvolgtaken ondersteunen kantoor bij het bijhouden van het dossier. Registratie is daarbij een hulpmiddel voor je organisatie; een compleet juridisch personeelsproces of salarisadministratie wordt daarmee niet automatisch overgenomen.",
      "Een rustige introductie werkt het beste met herkenbare taken. Begin bijvoorbeeld met het openen van de eerste werkbon, het terugvinden van een locatie-instructie en het registreren van een uitgevoerde taak. Breid de werkwijze vervolgens uit naar de aanvullende onderdelen die je team nodig heeft. Plan een afspraak in om het dossier en de onboarding op jouw organisatie af te stemmen."
    ],
    "faqs": [
      {
        "q": "Kan ik medewerkers stap voor stap laten kennismaken met Fieldgrid?",
        "a": "Ja. De onboarding en inrichting ondersteunen een begeleide start. Kies eerst de onderdelen die je team nodig heeft voor het dagelijkse werk en maak duidelijk wie op kantoor vragen beantwoordt. Daarna kun je de werkwijze verder introduceren."
      },
      {
        "q": "Kan ik kwalificaties bij een medewerker registreren?",
        "a": "Kwalificaties maken deel uit van het personeelsdossier. Je kunt die informatie gebruiken bij de voorbereiding van opdrachten met specifieke eisen. De inhoudelijke beoordeling van de geschiktheid en geldigheid blijft een verantwoordelijkheid van je organisatie."
      },
      {
        "q": "Regelt Fieldgrid ook de salarisverwerking?",
        "a": "Het personeelsdossier ondersteunt gegevens, beschikbaarheid en registratie binnen de werkstroom. Salarisberekening en cao-verloning vallen daarbuiten. Tijdens de inrichting brengen we in kaart hoe deze werkstroom aansluit op de administratie die je al gebruikt."
      },
      {
        "q": "Is onboarding alleen voor nieuwe medewerkers?",
        "a": "Ook een bestaand team kan een begeleide introductie nodig hebben wanneer je met Fieldgrid begint. Kies een kleine groep en herkenbare opdrachten om de werkwijze uit te leggen voordat je meer medewerkers uitnodigt."
      }
    ],
    "metaTitle": "Personeelsdossier en medewerkeronboarding | Fieldgrid",
    "metaDescription": "Organiseer personeelsgegevens, kwalificaties en documenten in Fieldgrid. Geef nieuwe en bestaande medewerkers een begeleide start met duidelijke onboarding."
  },
  {
    "slug": "offertes-facturatie",
    "name": "Offertes & facturatie",
    "eyebrow": "Van klantvraag tot financiële afronding",
    "headline": "Wat je afspreekt, werkt door tot de factuur.",
    "intro": "Houd aanvragen, prijsafspraken, uitvoering en facturatie bij elkaar. Fieldgrid verbindt de commerciële voorbereiding met het werk op locatie, zodat kantoor terug kan vinden wat is aangeboden, uitgevoerd en administratief afgehandeld.",
    "features": [
      {
        "title": "Een voorstel in de juiste context",
        "text": "Maak een offerte vanuit de klantvraag en verbind die aan de klant en locatie. Leg werkzaamheden, tariefafspraken en prijsversies vast voor eenmalig, terugkerend of aanvullend werk."
      },
      {
        "title": "Afspraken blijven verbonden",
        "text": "Laat de overeengekomen werkzaamheden aansluiten op de concrete werkbon. Medewerkers registreren de uitvoering, waarna kantoor het rapport en de verdere afhandeling beoordeelt."
      },
      {
        "title": "Facturen en betaalstatus",
        "text": "Werk met factuurconcepten, documenten en verzending. De klant kan facturen in het eigen portaal terugvinden. Online betaling is beschikbaar na correcte inrichting van de betaalvoorziening."
      }
    ],
    "paragraphs": [
      "Een aanvullende klantvraag begint vaak klein: een extra reiniging, een afzonderlijke onderhoudsbeurt of een servicebezoek op een nieuwe locatie. Door de aanvraag direct aan de bestaande klant en het juiste object te koppelen, blijft de context behouden. De offerte maakt vervolgens duidelijk welke werkzaamheden je aanbiedt en welke prijsafspraken daarbij horen.",
      "Fieldgrid ondersteunt verschillende manieren om dienstverlening te beschrijven, zoals een bedrag per bezoek, week, maand of uur. Je kiest de inrichting die bij de afspraak past en bewaart de bijbehorende prijsversie. Daarmee is later terug te vinden welk voorstel aan de uitvoering voorafging. De reactie op een offerte en de verdere opdrachtvoorbereiding sluiten aan op dezelfde klantrelatie.",
      "Na akkoord wordt de afspraak concreet in de uitvoering. De werkbon bevat de werkzaamheden en de medewerker legt het resultaat, tijd en bijzonderheden vast. Kantoor controleert de rapportage en kan de financiële afhandeling voorbereiden. Dat geeft ook onverwacht meerwerk een herkenbare plek: eerst vastleggen wat is gevraagd en afgesproken, daarna bepalen hoe het wordt uitgevoerd en gefactureerd.",
      "Factuurconcepten en documenten ondersteunen de administratieve afronding. Facturen en betaalstatus zijn bereikbaar voor de klant wanneer de betreffende onderdelen zijn ingericht. Voor online betalingen werkt Fieldgrid met een correct geconfigureerde en geverifieerde betaalprovider. Bespreek tijdens een afspraak hoe jouw tariefstructuur, contractafspraken en bestaande boekhouding op deze werkwijze aansluiten. Zo beoordeel je de hele keten aan de hand van een opdracht uit je eigen praktijk."
    ],
    "faqs": [
      {
        "q": "Kan ik terugkerend werk en losse opdrachten offreren?",
        "a": "Ja. De commerciële werkstroom ondersteunt eenmalige, terugkerende en aanvullende werkzaamheden. De offerte beschrijft de werkzaamheden en prijsafspraken; de uitvoering wordt vervolgens georganiseerd via concrete werkbonnen."
      },
      {
        "q": "Kan een opdrachtgever een offerte online beoordelen?",
        "a": "Offertebeoordeling maakt deel uit van de klantgerichte werkstroom. Een voorstel blijft gekoppeld aan de aanvraag en klantrelatie. Tijdens de inrichting bespreken we hoe je offertes deelt en welke vervolgstappen kantoor na de reactie uitvoert."
      },
      {
        "q": "Kunnen klanten via Mollie betalen?",
        "a": "Online betalingen kunnen via de ingerichte Mollie-betaalvoorziening worden aangeboden. Daarvoor moeten de benodigde tenant- en profielinstellingen correct zijn geconfigureerd en geverifieerd. De betaalstatus volgt de verwerking en controle bij de provider."
      },
      {
        "q": "Is Fieldgrid een volledig boekhoudpakket?",
        "a": "Fieldgrid verbindt de operationele opdracht met offertes, facturen en betaling. Een volledige grootboekadministratie, belastingaangifte en jaarrekening horen bij je boekhoudvoorziening. Welke overdracht of aanvullende koppeling nodig is, brengen we afzonderlijk in kaart."
      }
    ],
    "metaTitle": "Offertes en facturatie voor dienstverleners | Fieldgrid",
    "metaDescription": "Verbind aanvragen, offertes, prijsafspraken, werkbonnen en facturen in Fieldgrid. Houd de commerciële voorbereiding en uitvoering op klantlocaties bij elkaar."
  }
];
