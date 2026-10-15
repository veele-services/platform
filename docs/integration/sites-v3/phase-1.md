# Integratievoortgang — marketing, CRM en Control Center

Dit is tussentijds lokaal bewijs, geen oplevering of deploymentacceptatie. De volledige scope en open schermen blijven in `screen-register.json` staan. Deze fase is niet gepusht, gedeployed of live functioneel geverifieerd. Een volledige build, regressiesuite, migratiereplay, autorisatiereview en releasegates volgen vóór promotie.

## Geïmplementeerd en lokaal gecontroleerd

- Afzonderlijke Next-root voor de 23 Signature Grid-pagina's, met alle bronbeelden, lokale fonts, teksten, componenten en responsive interacties. De expliciete www-dispatch loopt vóór tenant- en platformautorisatie. `/fieldgrid-site` is geen publiek bypasspad. `APP_URL` blijft de applicatiebasis; www wordt nooit een tenant.
- Echte private CRM-registratie: lead, blijvende aanvraagsnapshot, historie, taak en eventuele telefonische reservering delen één transactie. Herhaalsleutels, revisies, overlapbescherming en Amsterdamtijd zijn aan databaseconcurrentie getoetst.
- Bestaande globale notificatiepolicy, outbox en worker verwerken de platformmelding zonder fictieve tenant. Er is geen nieuwe mailconfiguratie. De expliciete primaire platformbeheerderregistratie staat los van supportrollen en CRM-instellingen. Meerdere bestaande beheerders leiden niet tot een willekeurige ontvanger. De bestaande bootstrap registreert zijn geconfigureerde beheerder; wijzigen via Team vereist recente echte OTP.
- Control Center gebruikt de bestaande dossierbronnen en een private registratie voor managementopvolging. Verantwoordelijkheid wordt waar mogelijk in het brondossier bijgewerkt. Uitstellen bewaart de oorspronkelijke deadline. Uitvoering en klantverzoeken worden via hun eigen gecontroleerde werkproces afgerond. Notities en wijzigingen blijven herleidbaar; huidige bron-, functie- en sessierechten gelden ook voor de historie.

## Bewijs en praktische grenzen

Zie `evidence/phase-1/`: 68 gerichte unitchecks, 11 CRM-databasechecks, 7 CRM-concurrentiechecks, 7 opvolgingschecks, 5 opvolgingsconcurrentiechecks en 6 primaire-beheerderchecks. De cijfers omvatten waar van toepassing de bovenliggende Node-testcase. De browserketens gebruiken echte lokale Supabase Auth-sessies en opslag, geen gemockte bedrijfsdata of API-succesmeldingen. Uitsluitend fictieve lokale fixtures zijn vastgelegd; hun audit wordt behouden en accounts/tenants worden buiten gebruik gesteld.

De marketingcrawl bezocht 23 routes op 1440, 1024, 768, 390 en 320 px en maakte 115 vergelijkingsparen. Er waren geen browserfouten of pagina-overflows in de geslaagde run. De afzonderlijke interactierun controleert tien menu-, toetsenbord-, demo-, FAQ- en formulierinteracties. De CRM-browserflow registreert proefperiode, afspraak en demo bij één lead, opent de blijvende snapshots, slaat een notitie en fase op, exporteert ICS en weigert onbevoegde toegang. De opvolgingsflow maakt een brongebonden actie, rondt die aantoonbaar af, herlaadt de historie en verwijdert een open dossier na rechtintrekking.

Daadwerkelijk bekeken marketingvergelijkingen: home 1440 (bovenste 1200 px), home 1024 (1250 px), branches 768 (1250 px), planningproduct 390 (1600 px), proefwizard 320 (1800 px) en afspraak 390 (1500 px). Ook het CRM-aanvraagvenster en de opvolging op desktop/mobiel zijn bekeken. De volledige automatische screenshots blijven aanvullend lokaal beschikbaar; een gemaakte screenshot geldt niet automatisch als visueel bekeken. Opvolgingsheaders, lettertypen, padding en componentafmetingen komen na correctie overeen met de bron. De ontbrekende prototypevoetregel verklaart het hoogteverschil onderaan.

SendGrid-acceptatie, externe bezorging, publiek DNS/TLS, productie-indexering en live werkprocessen zijn met deze lokale tests niet bewezen.

## Minimale integratie- en toegankelijkheidsafwijkingen

- Werkelijke routes, UUID's, gebruikers, bedrijven, aantallen en actuele datums vervangen de previewrouter, vaste namen en vaste peildatum. Prototypebalk, rolwisselaar, reset en demodata verwijderen zijn geen productiefuncties.
- Prototypewaarschuwingen en fictieve succesbeloften in formulieren zijn vervangen door feitelijke registratie- en foutteksten. Een proefaanvraag activeert geen account. Beschikbaarheid en ontvangst verschijnen pas na bevestiging door de server.
- De bestaande uitgebreide operationele dossiers en goedkeuringen blijven behouden. Nieuwe beheerdialogs tonen conflicten, herladen, policy- en configuratiestatus waar echte opslag dat vereist.
- Dialogs hebben een gekoppelde toegankelijke naam; formuliervelden gekoppelde labels. Hulptips sluiten met Escape en verschuiven uitsluitend wanneer de bronpositie buiten het mobiele scherm zou vallen. De vormgeving blijft gelijk.
- CSS-selectors zijn van de marketing- of managementnamespace voorzien. Declaraties, volgorde en mediaqueries van de aangeleverde managementpresentatie worden reproduceerbaar overgenomen door `scripts/sync-sites-management-presentation.mjs`. De gedeelde kopregel/hulptip voorkomt verschillende uitvoeringen per pagina. Werkelijke fontebestanden zijn byte-identiek aan de bron.
- Root-routebestanden zijn onder `(workspace)` verplaatst voor CSS/providerisolatie; hun URL's en servergrenzen blijven gelijk. `global-error.tsx` blijft volgens Next 16.3 op de app-root en gebruikt de actuele `retry`-API.
