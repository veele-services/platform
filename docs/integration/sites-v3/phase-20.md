# Platformonboarding en berichttemplates

P03 en P04 gebruiken de zesstapswizard en template-indeling uit `ExistingDashboards.tsx`. De bron is de presentatiereferentie; de bestaande Supabase-, account-, template- en verzendprocessen blijven leidend voor opslag. Deze fase is lokaal getest en is niet gedeployed.

| Onderdeel | Keuze | Uitwerking |
| --- | --- | --- |
| Onboardingwizard | Uitbreiden | Bronstappen, velden, voortgang, modulekeuze en controle. Bestaande optionele domein- en afzenderadresvelden blijven afzonderlijk bereikbaar. |
| Tenantprovisioning | Hergebruiken | De bestaande transactie initialiseert tenant, lege werkruimte, nummering, templates en oorspronkelijke beheerdersuitnodiging. |
| Afzendernaam | Nieuw in wizard | De gekozen naam wordt in dezelfde transactie opgeslagen; zij krijgt een eigen blijvende herhaalfingerprint. |
| Accountuitnodiging | Hergebruiken | Bestaande Auth-/globale mailroute en eenmalige binding. Een onzekere of mislukte verzending blijft herstelbaar. Geen tweede mailprovider. |
| Template-editor | Uitbreiden | Bronindeling met tenantkeuze, lijst, tekst, tokens en preview. Native onderwerp/titel, huidige revisie, herstel, expliciet herladen en volledige HTML blijven behouden. |
| Templateversies | Hergebruiken | Bestaande revisietabel, audit en bridge naar actieve centrale notificatietemplates blijven één transactie. |
| Opslaggrens | Uitbreiden | Bestaande serverclient met onafhankelijk geverifieerde gebruiker/sessie; de database controleert die actuele bevoegdheid voor en na blokkerende locks. |

## Native beveiligingsgrenzen

De bestaande template-initialisatie en bridge zijn voor vertrouwde serveraanroepen bedoeld. De nieuwe adapters veranderen die guard niet en vervalsen geen JWT-context. Browseraccounts kunnen de nieuwe provisioning- en templatecommando's niet rechtstreeks uitvoeren. Alleen de serverclient heeft EXECUTE; de opdracht krijgt de werkelijk geverifieerde account- en sessie-ID en controleert beide in PostgreSQL, inclusief huidige platformrol en accountstatus.

Een identieke herhaling maakt geen tweede tenant, uitnodigingsbinding of templateversie. Een gewijzigde oorspronkelijke afzender of ontvanger wordt niet onder dezelfde aanmaakcode aangenomen. Voor oude aanmaakcodes zonder oorspronkelijke afzendernaam wordt geen ontbrekende snapshot verzonnen. Templateopslag gebruikt de werkelijk getoonde native revisie en weigert gelijktijdige overschrijvingen. Een conflict bewaart de invoer; de gebruiker kan expliciet de actuele versie laden.

## Noodzakelijke bronadaptaties

De demo-aanmaak en lokale succesmelding zijn vervangen door echte provisioning en uitnodiging. De wizard start zoals de bron met planning en personeel; facturatie neemt planning en rapportage mee. De twee extra native modules en de uitgeschakelde toekomstige websiteoptie blijven beschikbaar. Het reviewadres komt uit de bestaande omgevingsgebonden URL-generator; staging krijgt geen hardgecodeerd productieadres.

De vier bestaande tenanttemplates en hun werkelijke kanalen, titels, toegestane tokens en revisies blijven behouden. Prijsopgaven verdwijnen niet uit het proces. De bronnaam Werkbon beschikbaar vormt de presentatie van het bestaande werkbontemplate. De bronrij Uitnodiging medewerker verwijst naar het bestaande centrale templatebeheer, uitsluitend wanneer die tab volgens de actuele native toegang beschikbaar is; uitnodigingstekst wordt niet als fictief vijfde legacy-template opgeslagen. Native onderwerp/titel en volledige HTML zijn behouden omdat zij deel uitmaken van echte verzending. Opslaan verzendt geen testmail.

De P02-modulekaarten gebruiken nu de broniconen en -namen voor planning, rapportage en klantportaal. De technische introductietekst is vervangen door de brontekst; de communicatiekaart sluit weer op de bron aan. De extra native uitschakelbeperkingen en verzendverificatie blijven wel zichtbaar waar zij de beheerbeslissing beïnvloeden.

## Bewijsstatus

De eerste verpakte browsercontroles maakten daadwerkelijk één tenant en uitnodiging aan, maar de daaropvolgende lezing werd onderbroken door een verbroken lokale Supabase-gatewayverbinding (`UND_ERR_SOCKET`). De serverclient herhaalt daarom alleen GET/HEAD bij expliciet herkende transportfouten, maximaal tweemaal. HTTP-weigeringen, mutaties, RPC's, verzending en afgebroken verzoeken worden niet herhaald. Negen gerichte controles verifiëren die grens, inclusief onzekere schrijfuitkomsten en annulering tijdens het wachten. Dit verandert geen autorisatie of transacties.

De vervolgcontrole vond een bestaande API-limiet in de onbegrensde platformcollecties: boven duizend templaterijen verdween de werkbontemplate uit de DTO en bleef de editor leeg. Alle platformcollecties worden nu in pagina's van vijfhonderd uitgelezen met een vaste volgorde die eindigt in de unieke sleutel. Een mislukte vervolgpagina breekt het overzicht af; zij wordt niet stilzwijgend weggelaten. Drie controles verifiëren de grensovergang, een kleinere gatewaylimiet en die foutafhandeling. Auth-opvragingen zijn bovendien tot acht gelijktijdige lezingen begrensd. De verpakte browseracceptatie op deze correctie slaagt.

Provisioning en templates slagen afzonderlijk voor elf native database-/concurrentiecontroles; samen met de bestaande platformgrenzen zijn dat 31 controles. Beide beveiligingsadviseurs melden geen nieuwe problemen. De werkelijk verpakte runtime `969822c53de24b999c8221d792b186c88541fb68` slaagt voor vijf browserketens: de zes stappen, verloren aanmaakantwoord met precies één tenant/binding/mail, echte templateopslag, een revisieconflict met behouden concept en herstel, en bevestiging van de uitnodiging gevolgd door echte OTP-login op de nieuwe tenanthost. Er zijn 57 beelden bekeken, waaronder 27 bron/doelparen op 1440, 768 en 390 px. De volledige suite slaagt voor 1957 tests in 204 bestanden; de koude build genereert 108 pagina's en het pakket start zonder herinstallatie. Zie [verification.json](evidence/phase-20/verification.json).

De module-/communicatiekaarten zijn opnieuw vergeleken. Werkelijke moduleaantallen, kanalen, titels, tokens en lokale domeinen vervangen uitsluitend demodata; aanvullende native mogelijkheden blijven expliciet bereikbaar. De nog kleine, eerdere native adviesbalken onder modules/afzendergegevens worden in fase 22 naar de bronparagraafstijl gebracht. P03/P04 hebben lokaal testbewijs; de globale autorisatie-inventaris blijft vóór promotie een afzonderlijke gate. Er is geen deployment- of liveacceptatieclaim.
