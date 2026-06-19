export type MockNewsPost = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  date: string;
  readTime: string;
  image: string;
  body: string[];
};

export const MOCK_NEWS_POSTS: MockNewsPost[] = [
  {
    slug:     "nieuwe-werkinstructies-schoonmaak",
    title:    "Nieuwe werkinstructies voor schoonmaakrondes",
    excerpt:  "Vanaf deze week gebruiken we een kortere controlelijst voor entrees, liften en algemene ruimtes.",
    category: "Schoonmaak",
    date:     "19 juni 2026",
    readTime: "2 min",
    image:    "radial-gradient(circle at 18% 18%, rgba(255,255,255,0.82), transparent 25%), linear-gradient(135deg, #18BDB8 0%, #0F6B89 52%, #081D3A 100%)",
    body: [
      "Voor de schoonmaakrondes is een compacte controlelijst voorbereid. De focus ligt op zichtbare kwaliteit, bijzonderheden per locatie en snelle terugkoppeling bij afwijkingen.",
      "Gebruik bij iedere ronde de opmerkingenvelden voor zaken die de planning moet weten. Denk aan defecte verlichting, afgesloten ruimtes of extra vervuiling.",
      "De definitieve digitale checklist wordt later gekoppeld aan werkbonnen. Voor nu is dit bericht onderdeel van het PWA-prototype.",
    ],
  },
  {
    slug:     "veiligheidsupdate-avondsluitingen",
    title:    "Veiligheidsupdate voor avondsluitingen",
    excerpt:  "Let bij sluitrondes extra op toegangsdeuren, nooduitgangen en logboekmeldingen van de vorige dienst.",
    category: "Beveiliging",
    date:     "18 juni 2026",
    readTime: "3 min",
    image:    "radial-gradient(circle at 80% 20%, rgba(255,255,255,0.78), transparent 24%), linear-gradient(135deg, #193D6A 0%, #466AA3 48%, #0A1932 100%)",
    body: [
      "Voor avondsluitingen geldt tijdelijk extra aandacht voor deurcontrole en sleutelbeheer. Controleer altijd of bijzonderheden uit de vorige dienst zijn overgedragen.",
      "Wanneer een deur of nooduitgang niet correct sluit, meld dit direct via de werkbon en neem contact op met de planner.",
      "Deze placeholder wordt later vervangen door echte nieuwscontent vanuit het beheersysteem.",
    ],
  },
  {
    slug:     "facilitair-meldpunt-den-haag",
    title:    "Facilitair meldpunt Den Haag uitgebreid",
    excerpt:  "Voor objecten in Den Haag is een extra route toegevoegd voor kleine facilitaire meldingen.",
    category: "Facilitair",
    date:     "17 juni 2026",
    readTime: "2 min",
    image:    "radial-gradient(circle at 16% 70%, rgba(255,255,255,0.8), transparent 24%), linear-gradient(135deg, #F0B86B 0%, #A96645 46%, #0F2E5C 100%)",
    body: [
      "Kleine facilitaire meldingen kunnen straks direct vanuit de PWA worden doorgestuurd. Denk aan kapotte dispensers, lichte schade of meldingen over voorraad.",
      "De route wordt eerst getest op objecten in Den Haag Centrum en Scheveningen. Daarna volgt bredere uitrol.",
      "Voor nu toont deze pagina alleen prototype-inhoud.",
    ],
  },
  {
    slug:     "planning-realtime-indicator",
    title:    "Planning krijgt realtime statusindicator",
    excerpt:  "De planningpagina toont alvast een realtime-indicator voor toekomstige updates bij wijzigingen.",
    category: "Planning",
    date:     "16 juni 2026",
    readTime: "1 min",
    image:    "radial-gradient(circle at 72% 18%, rgba(255,255,255,0.75), transparent 22%), linear-gradient(135deg, #29C7BE 0%, #3378B7 50%, #071E41 100%)",
    body: [
      "De planningpagina is voorbereid op realtime updates. Later kunnen wijzigingen in diensten, vervallen werkbonnen en verplaatste tijden direct zichtbaar worden.",
      "De huidige indicator is alleen visueel. Websocket- of Supabase Realtime-koppeling volgt in een latere fase.",
    ],
  },
  {
    slug:     "urenregistratie-weekafsluiting",
    title:    "Controleer uren voor de weekafsluiting",
    excerpt:  "Diensten van deze week moeten uiterlijk zondagavond compleet zijn ingevuld.",
    category: "Uren",
    date:     "15 juni 2026",
    readTime: "2 min",
    image:    "radial-gradient(circle at 22% 26%, rgba(255,255,255,0.78), transparent 24%), linear-gradient(135deg, #7DD3FC 0%, #2563EB 52%, #081D3A 100%)",
    body: [
      "Controleer of alle uitgevoerde diensten compleet zijn afgerond en of uren correct zijn ingevuld.",
      "Bij ontbrekende informatie neemt de planning contact op voordat de week wordt afgesloten.",
    ],
  },
  {
    slug:     "nieuwe-objecten-scheveningen",
    title:    "Nieuwe objecten toegevoegd in Scheveningen",
    excerpt:  "Er zijn drie nieuwe locaties toegevoegd aan de planning voor schoonmaak en beveiliging.",
    category: "Objecten",
    date:     "14 juni 2026",
    readTime: "2 min",
    image:    "radial-gradient(circle at 68% 24%, rgba(255,255,255,0.78), transparent 23%), linear-gradient(135deg, #99F6E4 0%, #0F766E 48%, #0F2E5C 100%)",
    body: [
      "In Scheveningen zijn meerdere objecten toegevoegd aan de testplanning. De details verschijnen later in echte werkbonnen.",
      "Controleer bij nieuwe locaties altijd de adresgegevens en eventuele toegangsnotities.",
    ],
  },
  {
    slug:     "documenten-in-de-pwa",
    title:    "Documenten straks direct beschikbaar in de PWA",
    excerpt:  "Personeelsdocumenten, formulieren en locatiebestanden krijgen een eigen overzicht.",
    category: "Documenten",
    date:     "13 juni 2026",
    readTime: "2 min",
    image:    "radial-gradient(circle at 28% 20%, rgba(255,255,255,0.8), transparent 24%), linear-gradient(135deg, #C4B5FD 0%, #6366F1 48%, #081D3A 100%)",
    body: [
      "Documenten worden later gekoppeld aan personeel, objecten en werkbonnen. Daarmee zijn instructies en formulieren onderweg eenvoudiger terug te vinden.",
      "De eerste versie toont vooral algemene personeelsdocumenten.",
    ],
  },
  {
    slug:     "open-diensten-proces",
    title:    "Open diensten krijgen een duidelijker proces",
    excerpt:  "Medewerkers kunnen zich straks sneller aanmelden voor beschikbare diensten.",
    category: "Open diensten",
    date:     "12 juni 2026",
    readTime: "2 min",
    image:    "radial-gradient(circle at 70% 72%, rgba(255,255,255,0.75), transparent 23%), linear-gradient(135deg, #67E8F9 0%, #0E7490 48%, #081D3A 100%)",
    body: [
      "Open diensten worden straks gekoppeld aan beschikbaarheid en kwalificaties. Zo ziet een medewerker sneller welke diensten logisch passen.",
      "De planner houdt controle over definitieve toewijzing.",
    ],
  },
  {
    slug:     "rapportage-foto-upload",
    title:    "Rapportage wordt voorbereid op foto-upload",
    excerpt:  "Bij afronding van werkbonnen kunnen later foto's en bewijsstukken worden toegevoegd.",
    category: "Rapportage",
    date:     "11 juni 2026",
    readTime: "3 min",
    image:    "radial-gradient(circle at 18% 78%, rgba(255,255,255,0.78), transparent 24%), linear-gradient(135deg, #FDE68A 0%, #F59E0B 48%, #7C2D12 100%)",
    body: [
      "De rapportageflow wordt uitgebreid met fotobijlagen. Dit helpt bij oplevering, afwijkingen en meerwerk.",
      "Let op privacy en maak alleen foto's die relevant zijn voor de opdracht.",
    ],
  },
  {
    slug:     "proefperiode-mobile-pwa",
    title:    "Proefperiode voor de mobile PWA gestart",
    excerpt:  "De komende periode testen we navigatie, planning, uren en meldingen met prototypegegevens.",
    category: "PWA",
    date:     "10 juni 2026",
    readTime: "2 min",
    image:    "radial-gradient(circle at 78% 18%, rgba(255,255,255,0.8), transparent 23%), linear-gradient(135deg, #5EEAD4 0%, #14B8A6 46%, #081D3A 100%)",
    body: [
      "De mobile PWA wordt stap voor stap getest. Eerst ligt de nadruk op schermopbouw, navigatie en bruikbaarheid op telefoonformaat.",
      "Koppelingen met echte data volgen zodra de basis stabiel is.",
    ],
  },
  {
    slug:     "teamupdate-regio-den-haag",
    title:    "Teamupdate regio Den Haag",
    excerpt:  "Nieuwe testscenario's richten zich op diensten in Den Haag Centrum, Binckhorst en Scheveningen.",
    category: "Team",
    date:     "9 juni 2026",
    readTime: "1 min",
    image:    "radial-gradient(circle at 24% 18%, rgba(255,255,255,0.75), transparent 25%), linear-gradient(135deg, #FDBA74 0%, #FB7185 45%, #0F2E5C 100%)",
    body: [
      "De testdata bevat meerdere realistische locaties in de regio Den Haag. Daarmee kunnen planning en detailflows beter worden beoordeeld.",
    ],
  },
  {
    slug:     "meldingen-prototype",
    title:    "Meldingen blijven voorlopig prototype",
    excerpt:  "Pushmeldingen worden pas gekoppeld na de basisflows voor planning en nieuws.",
    category: "Meldingen",
    date:     "8 juni 2026",
    readTime: "1 min",
    image:    "radial-gradient(circle at 76% 76%, rgba(255,255,255,0.78), transparent 22%), linear-gradient(135deg, #93C5FD 0%, #3B82F6 48%, #081D3A 100%)",
    body: [
      "Meldingen zijn onderdeel van de mobile roadmap. Voor nu tonen we alleen visuele placeholders en navigatie.",
    ],
  },
];

export function getMockNewsPost(slug: string): MockNewsPost | undefined {
  return MOCK_NEWS_POSTS.find((post) => post.slug === slug);
}
