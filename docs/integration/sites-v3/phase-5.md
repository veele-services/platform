# Prijsindexatie via echte klantcontracten

Lokaal geïmplementeerd en getest; niet gedeployed of live geverifieerd. De volledige schermenmatrix blijft de releasegrens. `/app/indexatie` sluit de knop uit omzetbewaking aan op de native klantcontracten. De bestaande offertes, periodieke offertefacturatie, werkbonnen en overdrachten blijven hun eigen bronlogica gebruiken.

## Bron en verwerking

De Sites-compositie is overgenomen: voorstel/goedkeuring/verwerking, filter, tariefvergelijking, detail, conceptformulier en versiehistorie. Het oorspronkelijke tarief wordt op de server bepaald uit alle vastgelegde contractregels. Een browser levert geen basisbedrag, nieuw tarief, eigenaarsrol, contractregels of goedkeuringsstatus. Percentages zijn begrensd; de werkelijke afronding gebeurt per bronregel en blijft ook bij centbedragen zichtbaar. Grote contractregisters hebben een begrensde, letterlijke zoekselectie met onafhankelijk behoud van de gekozen contractbron.

Concepten, indiening, terugsturen, eigenaarsbesluit en verwerking hebben revisies, onveranderlijke versies, idempotente verzoeken en audit. Een gewijzigde contractbron blokkeert een oude goedkeuring. Bewust terugsturen en opnieuw beoordelen bewaart eerdere besluiten en vraagt daarna opnieuw eigenaarsgoedkeuring. Alleen de huidige eigenaar kan goedkeuren; een vrij gekozen gebruikers- of rolnaam geeft dat recht niet.

Indienen maakt één echte financiële opvolgactie. Het eigenaarsbesluit sluit die beoordeling, maar verandert nog geen klantprijs. Verwerken vraagt afzonderlijk het werkelijk ontvangen klantakkoord met akkoordgever, datum en een beschikbaar, gescand klantdocument. Een bestandsnaam, onbekende pointer, ongescand bestand of gearchiveerd document volstaat niet. De bestaande upload in het klantdossier verzorgt Storage, scanner en dossierregistratie; er is geen tweede bestandsdienst.

De adapter roept de oorspronkelijke `customer_command(..., 'agreement_save', ...)` aan. Die maakt een echte nieuwe contractversie met vorige versie en akkoordbewijs. Scope, uitsluitingen, eigenaar, btw, hoeveelheid, eenheid, frequentie, venster, duur, meerwerkkenmerken, limieten en overige contractafspraken blijven behouden. Alleen prijs en limiet worden volgens het vastgelegde voorstel geïndexeerd. Het resultaat wordt op alle regelattributen gekoppeld, ook bij dubbele catalogusregels; fysieke tuplevolgorde is geen bedrijfsidentiteit.

Nieuw automatisch programmawerk kiest vanaf de ingangsdatum de juiste vastgelegde tariefregel. Bestaande taken en commerciële snapshots worden niet herschreven. De native quote- en scopeoverdrachtstakken blijven intact. De huidige programmaregel blijft vóór de toekomstige ingangsdatum beschikbaar. Een beëindigde geïndexeerde opvolger activeert nooit stilzwijgend het oude tarief opnieuw: de native broncontrole weigert nieuwe uitvoering zonder geldige afspraak. De oorspronkelijke contractlink blijft bij de getoonde oorspronkelijke versie; het native klantdossier bevat de volledige versieketen.

## Autorisatie en transacties

Private tabellen hebben geforceerde RLS en geen directe grants voor anon, authenticated of service_role. De bestaande native klantlock gaat vóór de planningslock; daarna volgen voorstel en contractregels. Actuele sessie, tenant, financiële pagina-/functierechten, klantdossier en eigenaar worden opnieuw gecontroleerd na wachten. Native contractrechten en het gescande bewijs worden na native verwerking opnieuw gecontroleerd, zodat verlies daarvan de volledige transactie terugdraait. De UI wist geopende privégegevens na ingetrokken toegang.

## Bewijs en minimale integratieverschillen

Zie `evidence/phase-5/`. De gerichte native regressie slaagt met 89 checks, waaronder indexatie, onafhankelijke transacties, klant/objectdossiers, commerciële processen, bronafstemming, werkbonoverdracht en omzetbewaking. De afzonderlijke concurrentiesuite slaagt met 7 checks; gerichte units met 21. TypeScript, ESLint en de lokale security-advisorcontrole zijn groen.

De echte browser gebruikt lokale Supabase Auth, SSR, API, native klantdocumentupload, echte ClamAV-scan, Storage, byte-gelijke privédownload en native contractverwerking. Zij controleert afzonderlijk eigenaarsbesluit, klantakkoord, herladen, historie, oorspronkelijke bronlink en ingetrokken toegang. Alle zes bron/implementatieparen (leeg en gevuld op 1440/768/390 px) en vier functionele vensters zijn bekeken. De fictieve akkoordgever en testafbeelding bewijzen de technische keten, geen werkelijk extern klantakkoord.

- Vrije demotekst wordt een echte contractselector; het basisbedrag is uitsluitend leesbaar. Bij grote registers verschijnt bronzoeken. Een gewijzigde bron vereist herbeoordeling.
- De verwerkingsknop opent dezelfde dialogstijl met de noodzakelijke, afzonderlijke klantakkoordregistratie. Een intern eigenaarsbesluit wordt niet als klantacceptatie gekopieerd.
- Demo-uitkomsten en de tekst “verwerkt in dit prototype” zijn vervangen door de werkelijk vastgelegde contractversie en native historie. Toegang en foutmeldingen volgen de bestaande bedrijfsgrenzen.
- De browserrun bereidt de gekoppelde native pagina voor in Next dev; koude compilatie kan tijdens een geopende dialoog Fast Refresh veroorzaken. De ruwe ontwikkeluitvoer is behouden. Een koude productiebuild en volledige shellregressie blijven vereist vóór eindacceptatie.

De voor/na-regressie legt beide herstelde bronselectieproblemen vast. De SQL-kwalificatie van de native keuzelijst is vervolgens in een afzonderlijke voorwaartse correctie opgenomen. Migraties 153–156 zijn via de CLI vastgelegd/toegepast op de geïdentificeerde lokale stack en zijn daarna onveranderlijk. De CLI-schemacapture en de idempotente permissie-initialisatie blijven afzonderlijk; de 138 baselinemigraties zijn ongewijzigd. Volledige replay/upgrade, beveiligingsreview en de overige schermen blijven vereist vóór promotie.
