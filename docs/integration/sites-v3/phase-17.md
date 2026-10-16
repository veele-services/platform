# Gebruikers, rechten en organisatie-instellingen

T16 is lokaal geïmplementeerd en getest tegen de eigen verpakte runtime `c43cbfb1a99b19336bb7f8009ad7eea0e9f67585`. Niet gedeployed of live geverifieerd. De integrale matrixacceptatie, T17 en de andere open schermen blijven afzonderlijk open.

| Onderdeel | Keuze | Concrete aansluiting |
| --- | --- | --- |
| Rollenoverzicht | Overnemen | De vier bronkolommen, tabel, typografie en doorklik naar rechten; echte geregistreerde rollen en toegewezen rechten vervangen de demorollen. |
| Gebruikers en rolrechten | Hergebruiken | Native uitnodigingen, accounts, rechtenregister, afhankelijkheden, versiecontrole, idempotentiereceipts en eigendomsoverdracht. |
| Actuele gegevens | Uitbreiden | Gerichte authenticated/no-store-API voor de eigen organisatie; geen brede personeelsworkspace. Intrekking wist rijen en geopende formulieren. |
| Instellingen | Overnemen en uitbreiden | De compacte organisatie- en kleurvelden en aangehechte bronvormgeving; logo, afzender, voorbeeld, reizen, nummering en ondertekening blijven beschikbaar. |
| Huisstijl opslaan | Hergebruiken | Native CAS, bestaande afzendergegevens, volledige afbeeldingsdecodering, ClamAV, private opslag en oorspronkelijke portaalinvalidation. |
| Standaardrollen | Repareren | Eén ontbrekende leesafhankelijkheid bij nieuwe Planning- en Administratieprofielen. Bestaande aangepaste rollen worden niet opnieuw gevuld. |
| Fonts | Isoleren | De volledige font-facevolgorde uit de bron, met dezelfde meegeleverde bytes, onder afzonderlijke familienamen om botsingen met bestaande globale faces te voorkomen. |

## Noodzakelijke integratieverschillen

- De bron noemt vier demorollen. Productie behoudt Eigenaar, Management, Planning, Administratie en Support. De eerste kolom heet daarom Rol. De cellen tellen daadwerkelijk geconfigureerde rechten; zij suggereren geen toegang tot ieder financieel of vertrouwelijk dossier. Uitgeschakelde modules worden als zodanig aangeduid. De aantallen en andere rolnamen geven gegevensafhankelijke kolombreedten en een extra rij.
- De bestaande uitnodig- en overdrachtknop en de filterweergaven Gebruikers/Rechten blijven bereikbaar. Op smalle schermen neemt die noodzakelijke bediening een extra kopregel in. De volledige rechteneditor, gebruikerslijst, sortering en paginatie blijven behouden; de standaardweergave gebruikt de brontabel.
- De organisatie is, net als in de bron, alleen-lezen. Huisstijl bewaart de bestaande afzender en logo-instellingen ook wanneer alleen een kleur wordt gewijzigd. De aanvullende velden en het voorbeeld staan onder de uitklapbare opties. Opslaan is uitsluitend beschikbaar met actuele schrijfrechten en wordt zonder wijzigingen uitgeschakeld. De compacte bronknop blijft ook op mobiel compact.
- Prototype & bron is vervangen door feitelijke productinformatie. De bestaande tabbladen Reizen, Personeelsnummering en Ondertekening blijven aangehecht beschikbaar. De onderliggende native registratie- en beleidsfuncties zijn behouden.
- De familienamen van de bronfonts zijn technisch geïsoleerd. Assets, fontgewichten en cascade komen uit de bron, inclusief de basis-WOFF-faces en de latere portaal-TTF-faces. Chromium registreert tevens de werkelijk gerenderde PostScript-face; alleen gelijkluidende CSS-familienamen zijn geen visueel bewijs. Native integratie-CSS is apart gehouden van de reproduceerbaar gegenereerde bronregels.

## Beveiliging, herstel en database

Gebruikers- en rechtenmutaties blijven uitsluitend voor de eigenaar met een daadwerkelijke OTP-sessie van maximaal vijftien minuten. De browsertest vraagt de code aan via het echte Next-inlogformulier, ontvangt haar via de eigen lokale GoTrue/SMTP-keten en verifieert de bijbehorende OTP-AMR in Auth. Zij injecteert geen OTP-claim. De eerdere wachtwoordsessie uit de fixture wordt vóór deze login uit de browser verwijderd.

De API accepteert geen tenantselectie of andere queryvelden, gebruikt de huidige hostname/context en de native managementquery, en geeft uitsluitend de eigen geautoriseerde snapshot terug. Schrijfmogelijkheden worden opnieuw aan de actuele rechten getoetst. Oudere antwoorden kunnen een na intrekking gewiste weergave niet herstellen. Bij een bewerkte rol bewaart verversen alleen die rol en haar editorcatalogus; actuele gebruikers en toegangsflags blijven vernieuwen.

Een verloren antwoord na een daadwerkelijk opgeslagen rolwijziging behoudt de invoer en gebruikt bij opnieuw bewaren dezelfde aanvraag. Een gelijktijdig gewijzigde rol wordt geweigerd. Actuele rechten laden vereist expliciet verwerpen van het concept en vervangt de editor pas na een geslaagd actueel antwoord. Uitnodiging, roltoekenning en overdracht tonen evenmin een verzonnen succes bij een niet bevestigde netwerkuitkomst.

De geregistreerde afhankelijkheden zijn leidend in de editor; een modulegroepering wordt niet meer omgezet in een verzonnen recht zoals `backoffice.access.read`. Migratie `20261015152015_source_management_seed_entity_access.sql` corrigeert uitsluitend de native seedselectie voor nieuwe operationele rollen. Query-first toegepast, security-advisors zonder bevindingen en daarna door de CLI vastgelegd. Het bestaande private definer/search_path/ACL-contract blijft behouden. De regressie controleert tevens dat opnieuw seeden een door de eigenaar verwijderd recht niet terugplaatst. Eerdere migraties zijn niet gewijzigd.

## Bewijs en praktische grenzen

Zie `evidence/phase-17/verification.json` voor de exacte runtime-SHA's, testuitkomsten en bekeken bestanden. De browsercontrole bevat echte uitnodiging/accountregistratie, persoonlijke OTP-login, afhankelijke rechten, verloren antwoord, versieconflict, palet-CAS, afzenderbehoud, gescande logo-opslag en private bytes, nummering, reismarges, ondertekening, intrekking en geaccepteerde overdracht tussen twee accounts. Een managementgebruiker krijgt geen gebruikersbeheer; na overdracht verliest de voormalige eigenaar dat beheer onmiddellijk.

De nummeringscontrole bewaart het nummer van de bestaande medewerker. De instelling voor ondertekening wijzigt de bestaande vrijgegeven bon niet. Deze controles vervangen geen nieuwe personeels- of klantsignatuuracceptatie; die oorspronkelijke processen blijven afzonderlijk behouden en getest in de werkbonketen.

Uitnodigingsmail gebruikt de bestaande centrale dienst en registratie, met uitsluitend een expliciete lokale provider-capture voor fictieve `.invalid`-ontvangers. Dit bewijst geen nieuwe externe SendGrid-bezorging. Het lokale OTP-verkeer gebruikt de bestaande SMTP-template; de lokale template moest voor de eigen Kong-container leesbaar zijn. Er is geen remote Auth-, provider- of mailconfiguratie gewijzigd.

De nieuws-, kennisbank- en productketen is na de gedeelde fontisolatie opnieuw op een werkelijk verpakt artefact gecontroleerd. De 38 bijbehorende lijst-/vensterbeelden zijn opnieuw bekeken. Prototype-inhoud in deze vergelijkingsfixtures is uitsluitend synthetische lokale testinhoud en geen productie-import.

Lokale archiefstart, exacte SHA/HTTP-health en database/scannergereedheid zijn geen CI-attestation, stagingpromotie, productiepromotie of live gebruikersacceptatie. De eindvergelijking van de overige schermen, de buitenshell en de overige matrixrijen blijft nodig.
