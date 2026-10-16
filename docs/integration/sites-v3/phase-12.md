# Aanvragen en offertes op de bestaande commerciële autoriteit

Lokaal geïmplementeerd en getest; niet gedeployed of live geverifieerd. Dit levert T02. De overige matrixrijen en de definitieve acceptatie van de gehele release blijven open.

| Onderdeel | Keuze | Concrete aansluiting |
| --- | --- | --- |
| Lijst en samenvatting | Overnemen | Zes bronkolommen, drie aangesloten tabbladen, filter, plusknop, rijactie en de vijf detailvelden van `RequestsPage`. |
| Alle dossiers | Uitbreiden | Eén native serverquery voor aanvragen, offertes en bestaande bezoek-/voorstelbronnen. Globale sortering, filtering, totalen en paginatie; geen samenvoeging van twee afgekapt opgehaalde lijsten. |
| Opslaan | Hergebruiken | Bestaande commerciële serveracties, bronbindingen, actuele rechten, versiecontrole en idempotente commandoreceipts. |
| Uitgebreide processen | Behouden | Volledige intake/offertewizard, prijsregels, voorwaarden, bewijs van akkoord, historische versies, dossier, communicatie, bijlagen en omzetting naar opdracht. |
| Document en mail | Hergebruiken | Native PDF, private gescande opslag, vastgelegde documentversie, centrale mailpolicy en globale transportregistratie. |

De bestaande paginaroute blijft behouden en gebruikt dezelfde gerichte brandingloader. De canonical pagina- en functiebevoegdheden worden nu ook expliciet bij deze presentatie en navigatie gecontroleerd. De serverquery behoudt zijn oorspronkelijke guards, gesloten search path, privileges en oorspronkelijke standaardtab voor bestaande directe RPC-callers. De frontend kiest standaard Alle dossiers. Migratie 166 voegt uitsluitend die selectie en een stabiele bronsortering bij gelijke record-ID's toe. Zij is query-first toegepast, door de CLI vastgelegd en als toegepast gecontroleerd. De oorspronkelijke migraties zijn niet herschreven.

## Minimale integratieverschillen

- Het compacte bronvenster kan werkelijk het onderwerp en de omvang van een conceptofferte bewaren. De oorspronkelijke intakewoorden blijven onveranderlijk. Klant-/objectkoppelingen, prijzen en formele statussen worden via de volledige native wizard of lifecycle gewijzigd. Het prototypekeuzelijstje mag geen klantakkoord of berekende prijs vervangen. Het actiemenu opent daarom Dossier en historie of de volledige editor. De juiste huidige klant vervangt de drie hardcoded prototypenamen; een gekoppelde klant buiten de huidige zoekselectie wordt gericht opgehaald.
- Werkelijke bedragen behouden hun centen. Een aanvraag zonder prijs krijgt een streepje, geen verzonnen nulprijs. De native paginatie en aanvullende zoek-/filtermogelijkheden blijven beschikbaar. De prototypevoetregel wordt de echte applicatieversie.
- De volledige native formulieren staan in het gedeelde bronvenster en gebruiken de bronkleuren, veldafmetingen, spacing en mobiele besturingen. Hun extra bedrijfsvelden en stappen worden behouden. Expliciete toegankelijke veldnamen voorkomen dat opties onderdeel worden van de naam van een keuzelijst.
- Bediening blijft geblokkeerd tijdens de lopende lifecyclemutatie. De akkoordregistratie bewaart seconden en milliseconden: afronden op minuten kon een zojuist ontvangen akkoord vóór het aanbiedingsmoment plaatsen. De bestaande servercontrole blijft streng; de planning en haar minuut-/zomertijdcontract veranderen niet.

## Echte keten en bekeken beelden

Alle twaalf bron-/doelbeelden van lijst en samenvatting zijn bekeken op 1440, 768 en 390 px. Kopregel, kolommen, aangesloten tabbladen, typografie, ruimte en mobiel detailgedrag sluiten aan. De hierboven genoemde functionele verschillen zijn zichtbaar en bewust beperkt. Ook de volledige offerte-editor op drie breedtes, het akkoordformulier, de omgezette opdracht en het live filter zijn bekeken. Captures gebruiken CDP met geladen fonts en veranderen geen formulierinhoud om een vergelijking te forceren.

De volledige browserketen slaagt tegen het echte verpakte `server.js` van een koude productiebuild. De keten gebruikt echte lokale Auth, SSR, serveracties, PostgreSQL, ClamAV en private Storage. Een response wordt ná de succesvolle servermutatie bewust verloren: invoer blijft behouden en dezelfde herhaling maakt geen dubbele versie. De volledige prijseditor bewaart een nieuw offertetarief zonder de catalogusrevisie te wijzigen. Een echte bijlage wordt geüpload, bytegelijk teruggelezen en voor een anonieme bezoeker geweigerd. Publicatie maakt een echte gescande PDF en een centrale mailregistratie. Daarna worden een versiebonden telefonisch akkoord en een afzonderlijke, nog niet toegewezen opdracht opgeslagen. Er wordt geen factuur of betaling verzonnen. De gepubliceerde PDF blijft bytegelijk. De intakewizard bewaart tevens een aanvraag zonder object; bewerken laat de oorspronkelijke klantvraag intact. Zoeken, wissen en intrekking bij een geopend dossier slagen. Geen browserfouten.

Alleen de externe providergrens is in de expliciete lokale testserver afgevangen; zij accepteert uitsluitend `.invalid`-ontvangers. Native policy, documentopslag, mailservice en transportregistratie worden werkelijk uitgevoerd. Dit bewijst geen externe bezorging en introduceert geen tweede mailconfiguratie. De gemelde vroeg gesloten serverstream hoort bij de bewust afgebroken response.

Een afzonderlijke browsercontrole vernieuwt de echte RSC-route na een nieuwe serverregistratie. De nieuwe aanvraag verschijnt en het filter houdt zijn focus en invoer. Wissen, Escape en buiten klikken blijven correct, ook na opnieuw vernieuwen. Alleen tijdelijke open-/focus-/cursorposities worden in beperkt browsergeheugen bewaard, gescheiden per tenant en gebruiker. Er worden geen zoekwaarden, bedrijfsgegevens of rechten lokaal opgeslagen. De lange ontwikkelrun liet daarnaast een documentherlading zien; dit is in de verpakte productie-uitvoering niet gereproduceerd. Het actuele sessiesignaal kwam daar overeen. De bestaande accountbeveiliging is niet aangepast of uitgeschakeld.

De 30 native databasecontroles, 26 gerichte units, ESLint en de koude TypeScript-/productiebuild slagen. De security-advisor meldt geen problemen. De globale replay/upgrade, uiteindelijke exacte-SHA-releasecontrole, shell-/modalaudit van T17 en overige matrixrijen blijven vereist. Deze lokale kandidaatrelease bevatte de fase-12-werkboom boven `d8851f00`; de verpakking is geen releaseattestation. De uiteindelijke promotie wordt opnieuw voor haar eigen exacte commit gebouwd.

Zie `evidence/phase-12/`.

De uitgebreidere hercontrole in fase 13 reproduceerde een documentherlading bij dezelfde geverifieerde identiteit en focusverlies tijdens de bestaande accountcontrole. Het herstel bewaart nu uitsluitend begrensde UI-mechaniek in tabopslag en herstelt focus na het vrijgeven van de ongewijzigde accountgrens. Zoektekst, bedrijfsgegevens, rechten en credentials worden daarvoor niet opgeslagen. De echte RSC-/documentherladingscontrole en de volledige commerciële keten slagen opnieuw; zie `phase-13.md`.
