# SLA-bewaking en oorspronkelijke ticketklok

Deze fase is lokaal geïmplementeerd en getest; niet gedeployed of live geverifieerd. De volledige schermenmatrix blijft de releasegrens.

## Werkelijke bron en autorisatie

`/app/sla` behoudt de Sites-compositie: drie metrics, gekoppelde tabcontainer, zoeken/filteren, normen, meetdefinities, detail en meetgeschiedenis. De server levert actuele, begrensde en geautoriseerde projecties. Financiële contractdetails blijven achter hun bestaande strengere dossiergrens; het SLA-register gebruikt een prijsvrije contract/objectbinding.

Een serviceafspraak heeft een vaste identiteit (klant, object, soort en waar van toepassing meldingscategorie) met onveranderlijke normversies. De server leidt minuten of aantallen uit de norm af. Alleen een werkelijke contractversie met een regel voor het gekozen object wordt aanvaard. Reactie- en oplosnormen zijn expliciet verbonden aan een klantgerichte, niet-vertrouwelijke categorie. Ze vervangen geen intern of HR-beleid.

Er is één ticketklok: de bestaande deadlines, werkuren, pauzes, hervattingen en native ticketmutaties. Bij nieuwe tickets worden de gebruikte normversie, configuratie en de daarvan afgeleide native deadlines in dezelfde hook vastgelegd, met een uitgestelde bron-FK. Een latere normwijziging start een bestaande klok niet opnieuw. Reacties worden echte berichten aan de melder; oplossen, pauzeren en hervatten volgen de bestaande categorie- en behandelaarsrechten. Een gepauzeerde of afgeronde bron wist een eerder overschreden deadline niet uit de meting.

Bezoeken worden op de oorspronkelijke bezoekidentiteit geteld, onafhankelijk van het aantal medewerkers en gesplitste bonnen. Inspecties blijven een afzonderlijke meting. Rapportage gebruikt de werkelijke afronding en indiening van bronrapportversies, niet een los goedkeuringsvinkje. Meetvenster en klokconfiguratie worden bij de normversie bewaard. Begrensde bronlijsten geven hun volledige telling; een te diepe bronketen wordt als niet volledig meetbaar gemarkeerd.

De bestaande worker verwerkt ticketklokken in begrensde, eerlijk geroteerde batches. Automatische opvolging blijft eigendom van het bronticket. Een native pauze stelt de actie uit zonder verzonnen hervatdatum of onterechte afronding. Toewijzing en afronding gebeuren in het ticket. Dezelfde bronrechten gelden voor de actie, de tellingen, het geopende detail en de bronlink; ingetrokken rechten sluiten het privévenster bij de volgende actuele controle.

Private tabellen hebben geforceerde RLS en geen directe grants. Publieke RPC's controleren actuele sessie, tenant, module, pagina-, functie- en bronrechten, ook na lockwachten en vóór een idempotent herhaalantwoord. Normupdates gebruiken revisies, actor-/verzoeksleutels en een unieke beleididentiteit. Service-only onderhoud neemt geen gebruikersidentiteit aan.

## Bewijs en afbakening

Zie `evidence/phase-3/`. De SLA-databasesuite slaagt met 10 checks; de afzonderlijke concurrentiesuite met 10, inclusief hun bovenliggende testcase. De regressie van opvolging en governance plus SLA slaagt met 42 checks. De gerichte unitselectie slaagt met 18 checks; TypeScript, gerichte ESLint en de lokale security-advisorcontrole zijn groen.

De browser gebruikt echte lokale Supabase Auth en API/RPC's. Norm aanmaken, norm reviseren, herladen, reporterreactie, pauze, hervatten, oplossen, native bronlink en het intrekken van toegang zijn daadwerkelijk uitgevoerd. Fictieve contracten zijn voorbereid als databasegrensfixtures: zij zijn geen bewijs van echte klantacceptatie of externe mailbezorging. Provideruitvoering en live domeinen zijn afzonderlijke releasecontroles.

## Minimale integratieverschillen

- Vrije demo-object- en contractteksten zijn echte, servergebonden selectors. Een klantgerichte categorie en een concreet meetvenster zijn nodig om een norm ondubbelzinnig en controleerbaar toe te passen. Bij revisie blijft de identiteit vast; eerdere versies en meetmomenten blijven behouden.
- De vaste demo-uitkomst “3u 20m” en het demopeilmoment zijn vervangen door de bestaande bronklok, actuele gebeurtenissen en aantoonbare historie. Onherleidbare historische actieve tijd toont geen verzonnen waarde.
- Lees-, behandel- en financiële rechten worden onafhankelijk toegepast. Een zichtbare prijsvrije norm geeft geen financiële dossiertoegang. Native fouten en conflicten blijven zichtbaar in de aangeleverde dialogstructuur; succes volgt alleen na een commit.

Migraties 149–150 zijn uitsluitend op de geïdentificeerde lokale replaystack toegepast en zijn daarna onveranderlijk. De 138 baselinemigraties en de eerder toegepaste uitbreidingen blijven intact. Volledige replay/upgrade, beveiligingsreview, build en de overige schermen blijven vereist vóór promotie.

De zes bron/implementatieparen en beide echte invoer-/ticketvensters zijn bekeken. De inhoudsmetingen op 1440, 768 en 390 px komen overeen; de gemiddelde afwijking blijft onder 0,00012 per kleurkanaal (0–255). De registercapture op desktop is expliciet na het terugwisselen van beide tabbladen gemaakt. Bij koude Next-devcaptures tekende Chromium soms tijdelijk fallbackglyphs ondanks dezelfde berekende CSS; het bewijs wacht daarom expliciet op alle gebruikte fonts, bewaart de ruwe pagina-/shellcaptures en gebruikt een directe viewportcapture zonder tekst-, DOM- of layoutnormalisatie. Alleen shell-/prototype-/devchrome wordt met `visibility:hidden` buiten de inhoudsvergelijking gehouden. Een nieuwe controle van de volledige shell en koude productiebuild blijft onderdeel van de eindregressie.
