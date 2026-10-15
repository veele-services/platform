# Gedeelde shell en bronvensters

T17 sluit de Sites-header, zijbalk en gedeelde vensters aan op de bestaande sessie, zoekscope, persoonlijke inbox en dossierregistraties. De lokale acceptatie en de bekeken vergelijkingen worden apart vastgelegd in `evidence/phase-18/verification.json`. Dit document is geen deployment- of liveacceptatieverklaring. De overige open rijen van het integratieregister blijven open.

Getest op de daadwerkelijk verpakte runtime `b1b8c1838986f1f6a97318543fef931bb1dd0d22`: 17 browserketens, 36 native databasecontroles en de volledige suite van 1942 tests in 202 bestanden slagen. De koude productiebuild genereert 108 pagina's; de zelfstandige verpakking slaagt voor de rooktest. Er zijn 38 beelden bekeken, met 15 vergelijkingsparen op desktop, tablet en mobiel. De functionele instellingenregressie van 29 controles draait op de afzonderlijk vermelde eerdere runtime; zij is geen nieuwe visuele acceptatie. Alle precieze bewijsgrenzen staan in [verification.json](evidence/phase-18/verification.json).

| Onderdeel | Keuze | Aansluiting |
| --- | --- | --- |
| Header en navigatie | Overnemen | Bronklassen, iconen, ronde accountknoppen, menu, zoekvenster en responsive declaraties. De mobiele bronweergave verbergt het zoekveld. |
| Zoekresultaten | Uitbreiden | Bestaande zoek-API met actuele hostname, sessie, modules, functiegrenzen en RLS; resultaat opent eerst het bronvenster. |
| Accountmenu | Hergebruiken | Eigen profiel, toegestane instellingen en voorkeuren, echte afmelding en bescherming van concepten; geen demoherstel. |
| Notificaties | Hergebruiken | Eigen native inbox, geautoriseerde volledige inhoud en afzonderlijke lees-, bevestig- en archiefmutaties in het bronvenster. |
| Brongegevens | Uitbreiden | Kleine projecties van klant, object, personeel, aanvraag, offerte, overeenkomst, bon, ticket en factuur. Volledige dossiers blijven bij hun eigen autorisatie. |
| Terugkoppeling | Hergebruiken | Native opvolgcommando, actuele revisie, onderbouwde notitie en stabiele herhaalsleutel. Automatische signalen worden bij hun bronproces verwerkt. |
| Gemeenschappelijke formulieren | Uitbreiden | Dezelfde bronframe voor ticket- en notificatieformulieren; de oorspronkelijke velden, bijlagen, doelgroepselectie, controles en servermutaties blijven behouden. |
| Zijbalkteller | Uitbreiden | Alleen het geautoriseerde aantal open en uitgestelde acties; geen dossierverzameling naar de browser, geen verzonnen nul bij ontbrekende toegang. |

## Noodzakelijke integratie- en toegankelijkheidsverschillen

De bron toont demoacties bij de notificatiebel. Productie toont de daadwerkelijke persoonlijke inbox. Lezen, ontvangst bevestigen en archiveren blijven afzonderlijke handelingen. De extra links naar de volledige inbox en voorkeuren behouden het bestaande werkproces. Afgeschermde of ingetrokken bronnen blijven volgens de native notificatieprojectie afgeschermd. Een oude aanvraag kan na het wissen van het account geen inhoud terugplaatsen.

De zoekfunctie houdt de bestaande ondergrens van drie tekens en gegroepeerde resultaten aan, zoals eerder door de eigenaar gevraagd. Zij vervangt de lokale prototypezoeklijst door sessiegebonden resultaten. Enter opent ook zonder voorafgaande pijltoets het eerste resultaat. Escape volgt de bronweergave. Een bronvenster blijft zichtbaar wanneer het zoekveld bij het mobiele breakpoint verdwijnt. De echte categorieën kunnen samen meer resultaten bevatten dan de zeven lokale demoregels; het bronkader krijgt daarom een begrensde interne scroll. De toetsenbordselectie brengt ook het laatste resultaat in beeld. Categorisering en extra toetsenbordbediening geven geen aanvullende dossierbevoegdheid.

Het accountmenu behoudt profiel, voorkeuren en afmelding. De instellingenlink volgt het geregistreerde instellingenrecht. Persoonlijke notificatievoorkeuren blijven volgens de native policy voor ieder actief workspaceaccount bereikbaar, onafhankelijk van een inboxgrant. Er wordt daarvoor geen fictief rolrecht geïntroduceerd. Radix behoudt de bestaande menu- en focuseigenschappen; de portal krijgt de bronselectoren en geïsoleerde fontfamilies mee. Padding, radius, schaduw en icoonafmetingen volgen de bron. De bronknop Demo herstellen is uitsluitend onderdeel van de inert bewaarde ontwerpreferentie.

Het bronvenster gebruikt echte referenties, statussen, datums, deadlines en auditgebeurtenissen. De prototypecontractperiode, verzenddatum en standaardverantwoordelijke zijn geen productiegegevens. Ticketinhoud wordt eerst door de native detailautorisatie/projectie gehaald; het venster ontvangt alleen de benodigde klok- en historieregels, zonder berichtinhoud. Contract- en offertemetadata bevatten geen prijslijnen of volledige klantcorrespondentie.

Een basale personeelsweergave geeft geen toegang tot het volledige HR-dossier. De doorklik ontbreekt wanneer de native document-/dossiergrens dat niet toestaat. De financiële controle en SLA-doorklik volgen eveneens hun eigen geregistreerde functie- en paginarechten. De minimale brongegevens kunnen beschikbaar zijn terwijl het afzonderlijke opvolgingsregister is afgeschermd; de adapter maakt ontbrekende bronrechten in dat register niet zelf aan.

De native link naar de opvolgingshistorie en het volledige brondossier blijft beschikbaar. Hierdoor zijn sommige vensters hoger dan de demo. Bij meerdere bewerkbare handmatige acties wordt expliciet gekozen welke actie wordt afgerond. Het prototype sloot lokale acties gezamenlijk; productie houdt de bestaande revisiecontrole, audit en afzonderlijke transacties aan. Afgeleide signalen zijn geen handmatig af te sluiten taken.

De actieknop in het globale prototypebronvenster gebruikt buiten de workspace een vaste groene kleur. Productie behoudt de bestaande leesbare tenantactiekleur en bijbehorende schaduw binnen de workspace. De brongeometrie, volle knopbreedte en veldtypografie blijven behouden. Deze beperkte huisstijl-/contrastafwijking voorkomt dat een globale prototypekleur de ingestelde tenantkleur vervangt.

## Concepten, onzeker antwoord en actuele rechten

Kleurinstellingen, rechten en terugkoppeling gebruiken dezelfde navigatiegrens. Een geannuleerde navigatie behoudt het concept. Aangehechte tabbladen houden hun panelen en invoer gemonteerd. Een profiel- of bronvenster openen verwerpt het onderliggende concept niet. Een doorklik naar een ander dossier of afmelden vraagt wel om bevestiging. Het wissen van een account blijft een verplichte beveiligingsgrens en wordt niet door een concept geblokkeerd.

Na een verloren antwoord gebruikt opnieuw bewaren dezelfde aanvraag, zolang invoer en revisie gelijk blijven. Een gelijktijdig gewijzigde actie overschrijft het concept niet. De gebruiker kan de actuele actie expliciet overnemen en de eigen terugkoppeling behouden. Tijdens een mutatie blijven sluiten en navigerende bronacties geblokkeerd. Notificatiebediening blijft ook tijdens het vernieuwen na een mutatie vergrendeld, zodat een volgende klik geen oude revisie gebruikt.

Er zijn in deze fase geen nieuwe migraties, mailproviders, globale rollen of databasebevoegdheden toegevoegd. De nieuwe tellervariant van de bestaande private API accepteert uitsluitend zijn eigen strikte query en geeft één huidig geautoriseerd aantal terug. Eerdere migraties blijven ongewijzigd.

## Bewijsgrenzen

De tests gebruiken uitsluitend herkenbare lokale fixtures, de eigen lokale Auth/database/scanner en een werkelijk verpakte Next-runtime. Het supportticket en notificatieconcept worden daadwerkelijk opgeslagen. Inboxfixtures verwijzen naar een echte native ticketgebeurtenis; dit is geen bewijs van externe mailbezorging. De uitnodigingsregressie gebruikt de bestaande centrale transport-capture uitsluitend voor `.invalid`-ontvangers en echte lokale SMTP voor OTP.

De volledige vergelijking behoudt de echte header en zijbalk. Alleen de expliciete prototype-omgevingsbalk en ontwikkelindicator worden uitgesloten. Bron en doel worden op 1440, 768 en 390 pixels vastgelegd; de gebruikte fontface, headergeometrie, veldafmetingen en bekeken beelden staan in het bewijs. Verschillen in accountnaam, teller en peildatum komen uit actuele geautoriseerde fixturegegevens.
