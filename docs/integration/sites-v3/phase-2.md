# Beslisnotities en documenten/compliance

Deze fase is geïmplementeerd en lokaal getest. Niet gepusht, gedeployed of live geverifieerd. De overige schermen uit de volledige matrix blijven open; dit document vervangt geen releaseacceptatie.

## Werkelijke gegevens en acties

`/app/besluiten` en `/app/compliance` gebruiken de aangeleverde Governance-presentatie met de bestaande tenantcontext, dossierbronnen en huidige managementrechten. Besluiten bewaren vastgestelde versies; een revisie openen/annuleren schrijft niets. Opslaan en vaststellen van een revisie is één transactie, met revisiecontrole, herhaalsleutel en maximaal één gekoppelde actie. Opvolging gebruikt het bestaande Control Center. Een gewijzigde bron/classificatie werkt door in die actie; oude notities en versies behouden hun oorspronkelijke toegangsgrens.

Compliance-eisen verwijzen naar echte dossierdocumenten. Uploads lopen via de bestaande dossierfuncties, Storage-buckets en ClamAV-keten. Bestandsnaam of vervalste document-ID geldt niet als bewijs. Goedkeuring is een afzonderlijke serveractie en geldt voor de gecontroleerde bestandsversie; gewijzigde of verlopen bewijsvoering vraagt opnieuw aandacht. De bestaande worker controleert eisen in begrensde batches, zonder een gebruikerssessie na te bootsen. Verantwoordelijkheid in het Control Center en in de eis blijft gelijk, ook bij concurrerende wijzigingen.

Private tabellen hebben geforceerde RLS en geen directe grants aan anon, authenticated of service_role. Alleen gecontroleerde RPC's geven de juiste projectie of begrensde workeropdracht. Huidige sessie-, module-, bron-, HR- en documentrechten worden opnieuw beoordeeld na lockwachten en vóór het teruggeven van herhaalde antwoorden. Een ingetrokken recht verwijdert geopende privévensters in de browser bij de volgende actuele controle.

## Lokaal bewijs

Zie `evidence/phase-2/`. De databasecontrole bevat 13 geslaagde checks, de afzonderlijke concurrentiesuite 7; deze aantallen omvatten hun bovenliggende testcase. De bestaande opvolgingssuite blijft groen (12). Daarnaast slagen 44 gerichte unitchecks, TypeScript en de gerichte ESLint-controle.

De browserketen gebruikt echte Supabase Auth, RPC, Storage en een geïsoleerde ClamAV 1.5.4 met actuele definities 28153. Vaststellen, revisie, annuleren zonder mutatie, opvolging afronden/herladen, uploaden, afzonderlijke beoordeling en private download zijn gecontroleerd. Het gedownloade PNG-bestand is bytegelijk aan de upload. Een identieke herhaling publiceert één document; een echte EICAR-test in een PDF wordt geweigerd zonder documentregistratie. Dit zijn lokale fixtures; geen externe mail of live tenantmutaties.

Alle zes inhoudsvergelijkingen zijn bekeken: beslisnotities en compliance op 1440, 768 en 390 px. De bron gebruikt gelijke fictieve tenant/rol en lege registers. Prototypebalk, sticky shell en Next-devindicator worden tijdens de elementcapture met `visibility:hidden` buiten de inhoudsvergelijking gehouden, zonder layout-, DOM- of tekstwijziging. De originele volledige screenshots blijven lokaal bewaard. De productiedatum blijft actueel; de bron toont 14 oktober. De beslisnotities hebben op tablet/mobiel identieke inhoudspixels; de desktopafwijking is minder dan 0,0001 per kleurkanaal. Compliance verschilt hoofdzakelijk in de peildatum. De echte ingevulde besluit- en bewijsvensters zijn eveneens bekeken; de eindcontrole van alle shells en portalen volgt in de volledige regressieronde.

## Minimale integratieverschillen

- Werkelijke dossiers, beheerders en gecontroleerde documenten worden gekozen via hun servergebonden ID's. Vrije demo-identifiers, een losse bestandsnaam en lokaal opgeslagen voorbeeldbewijs zijn vervangen door echte selectors, upload en private download. HR-upload vraagt expliciete bevestiging van de bestaande dossiervoorwaarden.
- De bestaande scanner-, fout-, conflict- en autorisatiestates zijn zichtbaar in dezelfde aangeleverde dialogstructuur. Er is geen gesimuleerde goedkeuring of opslagmelding.
- Historische actiecontext wordt bij het schrijven vastgelegd. Oude gekoppelde historie zonder aantoonbare context wordt intern behouden en niet door een later, ruimer dossierrecht ontsloten. De nieuwe governance-tabellen waren vóór deze integratie niet aanwezig in de baseline.
- De gedeelde tabcontainer, inclusief buitenrand, komt reproduceerbaar uit de bron. Gedeelde CSS-imports zijn gecentraliseerd in de workspace-root om late clientimports te voorkomen. Ook de font-face-cascade uit de bronportalen wordt behouden: uitsluitend WOFF laden bleek onvoldoende voor dezelfde uiteindelijke glyphs. TTF- en WOFF-bestanden zijn bytegelijk aan de bron. De eerdere visuele fase-1-controles krijgen vóór release een hercontrole met deze definitieve cascade.

De oorspronkelijke migraties zijn niet aangepast. De nieuwe migraties 145–148 zijn lokaal toegepast en blijven vanaf toepassing onveranderlijk; correcties volgen uitsluitend vooruit. Volledige replay/upgrade, beveiligingsreview, build en releasegates blijven vereist vóór promotie.
