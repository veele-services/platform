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
