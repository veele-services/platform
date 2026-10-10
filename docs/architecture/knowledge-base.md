# Kennisbank voor de vier Fieldgrid-werkruimtes

Releasekandidaat 1.1.0-rc.2, 10 oktober 2026. Deze uitbreiding verandert geen
runtimepoorten, hostresolutie, providercredentials of promotiecontracten.

## Bediening en inhoud

| Werkruimte | Route | Lezen | Bewerken |
| --- | --- | --- | --- |
| Platform | `/platform/kennisbank` | Actuele platformbeheer- of support/notificatie-identiteit | Alleen actieve platformbeheerders |
| Tenantbeheer | `/app/kennisbank` | Actief backofficeaccount met `backoffice.access` | Nee |
| Personeel | `/staff/kennisbank` | Actieve medewerker, lidmaatschap en personeelsmodule | Nee |
| Klant | `/klant/kennisbank` | Actuele klant-/objectbinding en klantportaalmodule | Nee |

De bibliotheek bevat **46 unieke Nederlandstalige artikelen, circa 15.700 woorden**.
Ieder startartikel heeft minimaal 300 woorden, voorwaarden, concrete stappen,
resultaatcontrole en vragen of probleemoplossing. Gedeelde artikelen kunnen bij
meer dan één portaal horen: platform heeft 12, tenantbeheer 20, personeel 13 en
klanten 13 toegestane startartikelen. Die aantallen zijn geen 58 verschillende
artikelen; gedeelde uitleg wordt centraal onderhouden.

Onderwerpen omvatten OTP, rollen, zoeken, notificaties, supportvragen, tenantinrichting,
modules, domeinen, supportteams, releases, planning, vrijgave, reistijd, taken,
meerwerk, templates, dossiers, rapportcontrole, finance, management, personeel,
branding, PWA, eigen uitvoering, uren/verlof, objectkluis, klantbezoeken en offertes.
De inhoud is afgeleid van daadwerkelijke bronpaden en de bijbehorende architectuur,
geen lijst van toekomstige beloften. Zie [de actuele analyse](../releases/codebase-analyse-2026-10-10.md).

## Publicatie en versies

Artikelen hebben een vaste slug, een bewerkbaar concept en een afzonderlijke
gepubliceerde snapshot. **Opslaan wijzigt alleen het concept.** Publiceren kopieert
inhoud en doelgroep naar de lezersversie. De beheerder bevestigt die actie apart.
Archiveren maakt de inhoud voor gewone lezers onbeschikbaar. Er is geen definitieve
verwijderactie die gedeelde links ongemerkt weggooit.

Iedere beheeractie schrijft een versie met actor, tijd en handeling. Herstellen
maakt de oude inhoud het actuele concept; de bestaande publicatie verandert pas
na expliciet opnieuw publiceren. Revisies voorkomen stilzwijgend overschrijven
van een collega. Payloadgebonden aanvraagbewijzen dedupliceren een herhaalde
beheeropdracht en weigeren hergebruik van een sleutel met andere inhoud.
Toegang wordt ook vóór een herhaalde opdracht opnieuw gecontroleerd.

`content/knowledge/*.mjs` zijn de beoordeelde initiële redactiebronnen.
`scripts/generate-knowledge-seed.mjs` maakt de eenmalige seedmigratie. De runtime
importeert deze bestanden niet: zij leest uitsluitend de actuele database.
De seed voegt alleen ontbrekende slugs toe en overschrijft geen latere beheerwijziging.
Verander na release nooit de historische seedmigratie; nieuwe initiële inhoud
krijgt een nieuwe beoordeelde migratie of een gewone platformbeheeractie.

## Zoeken en lezen

Nederlandse full-textzoekopdrachten doorzoeken titel, trefwoorden, samenvatting
én inhoud. Titel en trefwoorden krijgen de hoogste weging, samenvatting een
lagere en gewone inhoud de laagste. Herkenbare typefouten gebruiken trigram-
woordgelijkenis. Letterlijke gedeeltelijke titels en synoniemen in trefwoorden
helpen korte praktische vragen. Er is een GIN-index voor gepubliceerde zoekinhoud;
deze release claimt geen gemeten P95-budget voor een zeer grote bibliotheek.

Categorieën, aantallen, resultaten en paginatie volgen eerst de publicatie- en
portaalgrens. Een zoekterm voor een verborgen concept levert geen verklappende
categorie of telling op. Verwante artikelen volgen expliciete slugs, gedeelde
categorie en trefwoorden en worden opnieuw op publicatie/doelgroep gefilterd.
Een artikel bevat een inhoudsopgave, leesduur en vaste kopieerbare route.

De renderer ondersteunt secties, vragen, stappen, opsommingen, vet, code en veilige
links. Hij gebruikt Reacttekst, geen raw HTML. Executable URL-schema's en onbeperkte
interne paden worden niet als artikelhyperlink gerenderd. De editor heeft een
inhoudsvoorbeeld. Deze beperkte Markdowneditor is geen algemene HTML-/mediabouwer.

## Ticketintegratie

Het antwoordformulier van tenantbehandelaars, tenant-support en Fieldgrid-support
biedt Artikel uit kennisbank. De database controleert de actuele sessie,
tickettoegang, lees-/antwoord- of notitierecht, tenant en gekozen berichtpubliek.
Zij leidt het **doelportaal uit het echte ticket** af:

- Antwoord aan een medewerker: personeel.
- Antwoord aan een klant, ook directe technische klantintake: klanten.
- Fieldgrid-antwoord aan tenantcontact: tenantbeheer.
- Tenantantwoord aan Fieldgrid of interne platformnotitie: platform.
- Interne tenantnotitie: tenantbeheer.

De picker geeft uitsluitend gepubliceerde artikelen voor dat doelportaal, met
leesvoorbeeld en invoegen van een link in het concept. Invoegen verzendt niets.
Cross-origin-links worden servermatig gemaakt uit de bestaande tenant-/platform-
originhelper; browserinput bepaalt geen tenantdomein. Op dezelfde tenantorigin
blijven links relatief, wat ook eigen appdomeinen ondersteunt.

Een gekozen kennislink blokkeert een onbedoelde ontvangerwissel in het formulier
zolang die ingevoegde tekst aanwezig is. Oude zoekresponses voor een ander ticket,
publiek of zoekwoord worden niet gerenderd. Bijlagen, OTP voor delegatie, ticket-
statussen, scans, interne notities en gecontroleerde escalatie houden hun bestaande
contract. Beide ticketweergaven, inclusief de klantenmodal, maken kennislinks klikbaar.

Een verzonden titel en link zijn gewone historische berichttekst. Archivering
redigeert die tekst niet achteraf; het openen van de bestemming controleert wel
opnieuw publicatie en portaaltoegang. Een supportantwoord aan een tenant gaat
niet automatisch naar de oorspronkelijke medewerker of klant. De bestaande
voorbereid-/controle-/verzendstap blijft nodig.

## Database en requestgrenzen

Voorwaartse migraties `20261010100000_knowledge_base.sql` en
`20261010100100_knowledge_base_articles.sql` voegen private artikelen, versies en
opdrachtbewijzen toe, plus drie authenticated RPC's. Alle tabellen hebben
geforceerde RLS en geen directe rechten voor anon, authenticated of service_role.
Private helperfuncties hebben geen publieke EXECUTE-toegang. Ook de publieke RPC's
zijn niet uitvoerbaar door anon of service_role.

`knowledge_query` controleert sessie, account, tenant, portaal en huidige
lidmaatschappen/bindingen. `knowledge_command` vereist een echte platformadmin;
een supportaccount, tenantbeheerder of vervalste directe RPC-aanroep kan niet schrijven.
`knowledge_ticket_search` verleent geen nieuwe ticketinzage en accepteert geen
willekeurig gekozen doelpubliek. Onbekende/null-contexten en een verkeerde tenant
falen gesloten. Bestaande management-, ticket- en productrechten worden niet verruimd.

De server bepaalt de tenant uit de gecontroleerde hostname/authcontext. Platform-
kennisbank op een tenanthost is geweigerd. API-antwoorden zijn private/no-store;
er zijn geen gedeelde artikelcaches of nieuwe serviceworker-caches. De browser
hercontroleert elke 30 seconden en bij focus, en wist gegevens bij een geweigerde
read of accountclear. Concepten en versiepayloads worden nooit in lezers-DTO's gezet.

## Validatie

Gerichte unitchecks testen schema's, veilige links, HTML-escaping, ankers en
seedbehoud. Echte lokale databasechecks testen admin-only editing, private grants,
publicatiesnapshots, revision conflicts, restore, idempotency, intrekking, scope,
zoekrelevantie, verwante artikelen en ticketpublieken. De browserflow test de
editor, vier werkruimtes, mobiel artikel, zichtbaarheid, archivering en een
kennisartikellink in een daadwerkelijk lokaal gesprek. Definitieve resultaten
staan in het releaseverslag; geplande checks zijn geen bewijs van een deployment.
