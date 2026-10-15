# Platformonboarding en berichttemplates

P03 en P04 gebruiken de zesstapswizard en template-indeling uit `ExistingDashboards.tsx`. De bron is de presentatiereferentie; de bestaande Supabase-, account-, template- en verzendprocessen blijven leidend voor opslag. Deze fase is nog in uitvoering en is niet gedeployed.

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

Provisioning en templates slagen afzonderlijk voor elf native database-/concurrentiecontroles. De beveiligingsadviseur meldt geen nieuwe problemen. Echte browserketens, gepakte runtime, desktop-/tablet-/mobielvergelijkingen en hun precieze beperkingen worden na uitvoering afzonderlijk vastgelegd. Het schermregister blijft tot die tijd open voor P03/P04. De globale autorisatie-inventaris moet vóór promotie nog worden gereconcilieerd; er is geen deployment- of liveacceptatieclaim.
