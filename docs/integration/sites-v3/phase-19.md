# Platformtenantbeheer

Deze fase behandelt P01 en P02. Het bestaande platformbeheer blijft de autorisatie- en gegevensbron. De presentatie sluit aan op `ExistingDashboards.tsx`; provisioning, templates, support, team en de overige rijen worden afzonderlijk afgevinkt. Dit document is tussentijds en verklaart geen deployment of liveacceptatie.

| Onderdeel | Keuze | Uitwerking |
| --- | --- | --- |
| Platformshell | Uitbreiden | Bronklassen, iconen en geïsoleerde bronfonts over de bestaande Next-navigatie en actuele platformrechten. Account- en notificatievensters delen de bronframe. |
| Tenantlijst | Hergebruiken | Echte organisaties, beheerder, status, modules, medewerkers en aanmaakdatum; zeven bronkolommen, bestaande sortering en paginatie. Zoeken omvat ook de weergegeven beheerder en diens e-mailadres. |
| Tenantdetail | Hergebruiken | Stabiele tenant-ID en vijf bestaande tabbladen; een onbekende expliciete ID valt niet terug op een andere tenant. |
| Huisstijl | Uitbreiden | Bronindeling met twee kleurvelden, whitelabel en preview. Bestaande hexinvoer, logo-upload, afgeleide kleuren en afzonderlijke app-/factuurvoorbeelden blijven bereikbaar. |
| Modules | Uitbreiden | Selecteerbare bronkaarten en automatische opname van afhankelijkheden; bestaande servercontrole en operationele uitschakelbeperkingen blijven gelden. |
| Communicatie | Hergebruiken | Werkelijke afzenderinstellingen en centrale SendGrid-fallback; opslaan verstuurt geen testmail. |
| Domein | Uitbreiden | Bronoverzicht met de bestaande DNS-/activeringsbediening in een gedeeld venster. Registreren of activeren volgt de bestaande omgevingsgrens. |
| Tenantstatus | Nieuw | Echte pauze-/activeringsmutatie met bestaande tenantversie, transactie, audit en private herhaalregistratie. Geen nieuwe rol of tweede tenantstatusregistratie. |

## Noodzakelijke integratieverschillen

De getoonde namen, adressen, aantallen, statussen en uitnodigingen zijn actueel. Een demotekst die zegt dat een beheerder actief is, vervangt geen uitnodigingsstatus. Een fictief domein is geen geverifieerde koppeling. Er wordt geen tenantworkspace geopend doordat iemand platformbeheerder is.

De bron heeft vijf voorbeeldmodules. De bestaande productiecatalogus houdt zijn zes beschikbare modules en de herkenbaar uitgeschakelde toekomstige websiteoptie. Rapportage vereist planning; facturatie vereist beide. De bronkaart neemt deze afhankelijkheden bij inschakelen mee; de server blijft zelfstandig valideren.

De eerdere, expliciet gevraagde paginagrootte- en paginakeuze blijven naast de bronpaginering beschikbaar. Sortering blijft toegankelijk aangekondigd. De hoofdletters, veld- en rijtypografie volgen de bron. Het previewgetal is uitsluitend onderdeel van de inert weergegeven huisstijlvoorvertoning.

De volledige native huisstijlvoorbeelden en logo-/paletbediening staan onder hun eigen inklapbare onderdelen. De kleurcode blijft direct bewerkbaar naast de kleurkiezer. De domeindialoog behoudt TXT/CNAME-instructies, verificatie en expliciete activering na Caddy-inrichting. De lokale browsertest verandert geen DNS, proxy of externe omgeving.

De bewerkbare kleurcode behoudt op mobiel de native invoergrootte van 16 px om onbedoeld zoomen bij invoer te voorkomen; de bron toont daar een niet-bewerkbaar code-element. De uitgebreidere paginering behoudt eveneens haar mobiele bediening. Deze extra bediening kan de hoogte ten opzichte van het prototype vergroten. De lokale canonieke host is werkelijk `127.0.0.1`; de vergelijking vervangt die niet door een fictief geverifieerd productieadres.

## Mutatie- en conceptgrenzen

Tenantstatus gebruikt het bestaande `tenants.version` en de bestaande versie-/workspacetriggers. Een verloren antwoord kan met dezelfde invoer en sleutel worden herhaald zonder tweede overgang of audit. Verouderde versies, gewijzigd sleutelgebruik en een gearchiveerde tenant worden geweigerd. Een platformrol is vereist; een supportprofiel voldoet niet. Een nieuwe statusovergang vereist een recente sessie met echte OTP-registratie. De rol en sessie worden na de rij- en herhaallocks opnieuw gecontroleerd.

Gedeelde conceptbescherming bewaart kleur-, module- en afzenderinvoer bij geannuleerde navigatie en tabwissels. Een niet-bevestigde opslag houdt de invoer vast. Een vernieuwde serverprojectie overschrijft geen bestaand concept. Vergelijking van kleurcodes negeert uitsluitend hexletterkast, zodat normalisering door de server geen vals onbewaard concept veroorzaakt.

## Bewijsstatus

De native status- en concurrentiesuite slaagt voor elf controles, waaronder daadwerkelijk wachtende gelijktijdige transacties en intrekking tijdens een tenantlock. De bestaande provisioning- en domeinregressie slaagt voor 21 controles. De beveiligingsadviseur meldt geen nieuwe databaseproblemen. De globale autorisatie-inventaris moet vóór release opnieuw worden gereconcilieerd met de routegroepverplaatsing en de overige integratiefasen; alleen de oude reviewledger controleren is daarvoor onvoldoende.

De definitieve lokale run gebruikt de werkelijk verpakte runtime `4413214760f56c174d5903cc10bd453c79e08624`. Acht browserketens, 32 native databasecontroles en de koude build met 108 gegenereerde pagina's slagen. Er zijn 46 beelden bekeken, waaronder achttien bron/doelparen op 1440, 768 en 390 px. De volledige suite van 1942 tests in 202 bestanden slaagt op de direct voorafgaande runtime; de daaropvolgende knopklasse en Nederlandse uitnodigingslabels zijn door TypeScript, ESLint, de build en de browserrun gecontroleerd. Zie [verification.json](evidence/phase-19/verification.json).

P01/P02 hebben nu lokaal testbewijs. De module-icoon-/naamtoewijzing en niet-technische introductietekst worden nog met de gedeelde onboardingkaarten afgewerkt. De communicatiekaart naar berichttemplates wordt met P04 gelijkgetrokken. De platformbel wordt bij P09 vergeleken. Deze concrete presentatiepunten blijven expliciet open en vormen geen impliciete visuele eindacceptatie. De globale autorisatie-inventaris blijft vóór release een afzonderlijke gate. Er is nog niets gepusht of gedeployed.
