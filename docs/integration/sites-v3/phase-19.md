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

## Mutatie- en conceptgrenzen

Tenantstatus gebruikt het bestaande `tenants.version` en de bestaande versie-/workspacetriggers. Een verloren antwoord kan met dezelfde invoer en sleutel worden herhaald zonder tweede overgang of audit. Verouderde versies, gewijzigd sleutelgebruik en een gearchiveerde tenant worden geweigerd. Een platformrol is vereist; een supportprofiel voldoet niet. Een nieuwe statusovergang vereist een recente sessie met echte OTP-registratie. De rol en sessie worden na de rij- en herhaallocks opnieuw gecontroleerd.

Gedeelde conceptbescherming bewaart kleur-, module- en afzenderinvoer bij geannuleerde navigatie en tabwissels. Een niet-bevestigde opslag houdt de invoer vast. Een vernieuwde serverprojectie overschrijft geen bestaand concept. Vergelijking van kleurcodes negeert uitsluitend hexletterkast, zodat normalisering door de server geen vals onbewaard concept veroorzaakt.

## Bewijsstatus

De native status- en concurrentiesuite slaagt voor elf controles, waaronder daadwerkelijk wachtende gelijktijdige transacties en intrekking tijdens een tenantlock. De bestaande provisioning- en domeinregressie slaagt voor 21 controles. De beveiligingsadviseur meldt geen nieuwe databaseproblemen. De globale autorisatie-inventaris moet vóór release opnieuw worden gereconcilieerd met de routegroepverplaatsing en de overige integratiefasen; alleen de oude reviewledger controleren is daarvoor onvoldoende.

Definitief runtime-SHA, verpakking, browserresultaten en bekeken beelden worden na de acceptatierun afzonderlijk vastgelegd. P01/P02 blijven tot dat moment open in het schermregister. Er is nog niets gepusht of gedeployed.
