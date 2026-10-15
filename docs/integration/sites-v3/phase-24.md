# Klantportaal: bronpresentatie en native klantbinding

Deze fase behandelt K01 t/m K08. De implementatie en browseracceptatie zijn in uitvoering. Gebouwd, getest, gedeployed en live gecontroleerd blijven afzonderlijke statussen.

| Scope | Keuze | Native basis en bronadapter |
| --- | --- | --- |
| K01 cockpit | Uitbreiden | Bestaande accountgebonden samenvatting, echte afspraken, activiteiten, eigen objecten en acties; bronframe, kaarten en navigatie. |
| K02 objecten | Hergebruiken/uitbreiden | Expliciete account-/objectbinding, actuele contact- en objectversies, aanmaken/wijzigen en vaste instructies blijven native. Bronkaarten en het gedeelde bronvenster tonen de werkelijke gegevens. |
| K03 afspraken | Uitbreiden | Compacte bronregels en tabs Gepland/Uitgevoerd. Detail, verzoeken, voorstellen, bijlagen en instructies blijven aan de concrete eigen afspraak gekoppeld. |
| K04 rapporten | Hergebruiken/uitbreiden | Alleen vrijgegeven native versies, originele beveiligde PDF/download en gedeelde documenten. Geen gegenereerde demobijlage. |
| K05 facturen | Uitbreiden | Drie bronstatistieken, selecteerbare bronregels en detail. Alleen werkelijk betaalbare facturen gaan naar de bestaande checkout; betaalstatus komt van de provider. Filters en overige echte statussen blijven bereikbaar. |
| K06 diensten | Hergebruiken/uitbreiden | De bestaande tenantaanvraag, frequentie, objectselectie, voorkeursdatum, toelichting, dossier en offerteketen blijven gescheiden van het platform-CRM. |
| K07 tickets/nieuws | Hergebruiken/uitbreiden | Eigen native gesprek, categorie, bijlagen, reageren en oplossing bevestigen. Werkelijke doelgroep/leesregistratie voor nieuws. Beide gebruiken het gedeelde bronvenster. |
| K08 account/informatie | Uitbreiden | Eén `CustomerShell` voor het portaal, kennisbank en updates. Eigen profiel en versies, e-mailvoorkeuren, accountmenu, mobiele navigatie en eigen notificatievenster blijven native. |
| Gedeelde presentatie | Hergebruiken | De eerder geïsoleerde originele portalstyles, fonts, componentframe en tokens. Geen Sites-hashrouter, businessdata in localStorage of demorecht. |

## Noodzakelijke integratieverschillen

De betaalillustratie uit de bron kan geen betaling registreren. De derde statistiek heet daarom ‘Betaald’ en telt echte betaalde facturen. Lopende providerbevestiging, credits en ontbrekende betaalconfiguratie blijven zichtbaar. De Source-knop opent de bestaande servergestuurde betaalroute; er is geen lokale betaaldstatus of tweede betaalregistratie.

Vaste instructies en bezoekverzoeken blijven geversioneerde auditregels. De interface mag geen bronhistorie overschrijven als een lokale prototypewaarde. Contact-, factuur- en adresvelden behouden de bestaande validatie, rechten, controle op wijzigingen en adrescomponent. Alleen straatnaam en postcode hebben de bestaande adreszoekfunctie.

De bron bevat vereenvoudigde object- en bezoekvensters. De bestaande aanvullende object-, verzoek-, voorstel-, rapport-, betaal- en gesprekbediening blijft bereikbaar in het bronframe. Leesrechten worden niet omgezet in schrijfrechten omdat de demo een bewerkbaar veld toont. Kennisbank en updates gebruiken echte route-links binnen dezelfde shell; ze vereisen dezelfde actuele native klantidentiteit en publicatiedoelgroep.

Bij meerdere gekoppelde klanten blijft het expliciet gekozen account via de queryparameter behouden in kennisbank-/updatelinks, deelbare artikellinks, verwante artikelen en terugnavigatie. De server valideert de UUID en laat `getCustomerPortal(account)` de actuele binding controleren. De contextprovider is uitsluitend presentatie; een URL of lokale keuze verleent geen accounttoegang. Andere werkruimten, externe links, bestandsroutes en ankers worden niet herschreven.

## Bewijsstatus

Lint en TypeScript zijn tijdens implementatie gecontroleerd. Echte klantketens, bekeken vergelijkingsbeelden, native regressies en releasegates zijn nog niet afgerond. Er is nog geen deployment of liveacceptatie voor deze fase.

Op het verpakte lokale artifact `ad4f36bb29fc647812fce236b13ec1ccaf394740` slagen veertien echte klantketens: modulecommando, geautoriseerde factuurfinalisatie en afgeschermde PDF, SMTP/OTP, object-/afspraakbinding, vrijgegeven rapport, factuurselectie, tenantaanvraag, profielopslag, gepubliceerde kennisbank/updates, object aanmaken/wijzigen met expliciete binding en instructiehistorie, concreet bezoekverzoek, beoordeelde supportescalatie met bewuste terugkoppeling, centraal nieuws met lezen/bevestigen en afzonderlijke accounts met intrekking. De beeldacceptatie is nog in uitvoering.

De extra personeelsinzage bij het bezoekverzoek is apart begrensd: zonder de bestaande dossierverificatie wordt de native projectie geweigerd. Een eigen fictieve, daadwerkelijk toegewezen en vrijgegeven afspraak ligt binnen het ongewijzigde toegangstijdvenster. De lokale test doorloopt de native challenge-/delivery-/verify-functies met een synthetische code voordat die personeelsprojectie wordt gecontroleerd. Dit is geen bewijs van externe bezorging van die dossiercode. De primaire klantlogin gebruikt wel de daadwerkelijke lokale SMTP-bezorging en OTP-verificatie. Er worden geen rollen, tijdvensters of verificatiefuncties versoepeld.

Voor de vergelijking vult uitsluitend de afzonderlijke onveranderde Sites-referentieruntime zijn bestaande demo-opslag met dezelfde fictieve klantprojectie. De geïntegreerde omgeving gebruikt uitsluitend de echte servergegevens. De bronbestanden worden hiervoor niet aangepast; prototypebetaling, gegenereerde demonstratie-PDF's en demo-opslag worden niet als werkelijke ketens aangemerkt.

De echte klantbrowserketen vond een bestaande opslagfout bij een leeg optioneel KvK-nummer: `customer_portal_profile_save` schreef `NULL` naar `customers.company_number`, terwijl dit veld een verplichte tekstkolom is met lege tekst als standaard. Een regressie reproduceerde SQLSTATE `23502` vóór het herstel. Voorwaartse migratie `20261015220720_customer_profile_optional_company_number.sql` bewaart de lege tekst; de overige functie-inhoud en bestaande bevoegdheden blijven gelijk. De 30 native klantportaalcontroles slagen daarna, inclusief eigen account, versies, idempotentie en ongewijzigd inlogadres. Query-first lokaal toegepast, security-advisor zonder meldingen en met de CLI in de lokale migratiehistorie vastgelegd. Dit is nog geen gehoste migratie of deployment.

Echte navigatielinks krijgen de oorspronkelijke brondeclaraties van de navigatieknoppen. Alleen de selector is uitgebreid; kleur, afmetingen, typografie en responsive regels blijven uit de bron komen. Voorkeurenschakelaars gebruiken hun eigen bronstijl, zonder de breedteregel voor gewone formulierinvoer. De mobiele Meer-pagina behoudt eveneens het expliciet geselecteerde klantaccount in kennisbank- en updatelinks.
