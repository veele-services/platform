# Productbeheer V1 — oplevering

Deze uitbreiding is releasekandidaat **1.1.0-rc.1**, bedoeld voor ontwikkeling,
test en staging. De geaccepteerde productiebaseline **1.0.0** en haar Git-tag
blijven behouden. Deze opdracht bevat geen productie-uitrol of productiemigratie.

## Gebouwd

| Portaal | Onderdeel | Mogelijkheden |
| --- | --- | --- |
| Platform | Productbeheer | Ideeën behandelen, vragen/reacties, private notities, koppelen/omzetten, roadmapbord en lijst, releases met afzonderlijke wijzigingen, ontvangerspreview en expliciet publiceren/aankondigen/archiveren |
| Tenantmanagement | Roadmap & updates | Nieuw, In ontwikkeling, Gepland, Onze ideeën; organisatiebreed volgen, idee indienen en aanvullen |
| Personeel en klant | Wat is er nieuw? | Alleen voor de eigen actieve tenant en het gebruikte portaal vrijgegeven updates en roadmapinformatie |

Alle schermen gebruiken gedeelde modulecomponenten bovenop de bestaande Fieldgrid-
headers, tabs, filters, tabellen, badges, formulieren, dialogen, thema's en paginatie.
Details en formulieren werken op desktop, tablet en mobiel. Bijlagen worden echt
opgeslagen en gescand; er wordt geen demo-inhoud in de applicatie ingevoerd.

## Ontwerp en configuratie

Voortgang, publicatie en beschikbaarheid zijn onafhankelijke gegevens. Registratie
van beschikbaarheid activeert geen functie en voert geen deployment uit.
Doelgroepen combineren organisatie en portaal; onderdelen erven of beperken de
releasedoelgroep. Verborgen onderdelen ontbreken ook in totalen, zoeken, links,
bestanden en notificatiepreviews. Privéinzendingen en interne notities worden niet
automatisch naar algemene roadmapinhoud gekopieerd.

Nieuwe rechten zijn `backoffice.product.read` en `backoffice.product.submit`.
Eigenaar/Management krijgen beide; andere beheerde rollen kunnen ze via de bestaande
rechtenpagina toegewezen krijgen. Platform-supportrechten verlenen geen productbeheer.
In-appmeldingen gebruiken de bestaande queue/outbox, templates, voorkeuren en
actuele broncontrole. Gebeurtenis- en aanvraagdeduplicatie plus revisies voorkomen
dat retries of concurrerende publicaties extra meldingsrondes veroorzaken.

Er is één nieuwe voorwaartse migratie:
`20261009220000_product_management.sql`. Deze maakt de private gegevensstructuur,
doelgroepregels, RPC's, rechten, meldingscatalogus en private opslagbucket aan.
Alle 135 bestaande migratiehashes blijven ongewijzigd; het manifest bevat nu 136.
Geen nieuwe secrets, providers, poorten of externe koppelingen zijn nodig. De
bestaande scanner en notificatieworker moeten beschikbaar zijn.

De volledige architectuur en de stappen om zelf te testen staan in
[Productbeheer V1](../architecture/product-management.md). De bron- en
rechtenbeoordeling staat in de [beveiligingsreview](../security/product-management-review-2026-10-09.md).

## Uitgevoerde lokale controles

| Controle | Resultaat |
| --- | --- |
| Lint en TypeScript | Geslaagd |
| Unit/componenttests | 1.867 geslaagd, waaronder 11 gerichte producttests |
| Schone replay en migratiemanifest | Geslaagd; bestaande inhoudshashes behouden |
| pgTAP | 398 geslaagd |
| Database-integraties | 504 geslaagd; inclusief de volledige productketen, ontbrekende/ongeldige context, lege/ongeldige doelgroepen, actuele rechten en gelijktijdige aankondigingsaanvragen |
| Auth/Storage/Realtime via HTTP | 10 geslaagd, met de echte lokale scanner |
| Volledig browserpakket | 131 van 132 geslaagd bij de eerste uitvoering; één bestaande logouttest overschreed de totale 30 seconden |
| Gerichte browserherhaling | Logouttest geslaagd in 6 seconden; uitgebreide productketen geslaagd in 23,8 seconden, met echte releasebijlage vóór/na publicatie en na intrekking |
| Visuele controle | Ideeformulier en ontvangersdetail op 1.440, 768 en 390 pixels gecontroleerd; modalgrenzen/focus tevens geautomatiseerd |
| Autorisatie-inventaris | 1.166 oppervlakken bevestigd; 51 wijzigende/nieuwe oppervlakken beoordeeld, bestaande beoordelingen behouden |
| Database security advisor | Geen waarschuwingen of fouten |
| Database lint | Geen fouten; niet blokkerende waarschuwingen, onder meer ongebruikte variabelen |
| Dependency-audit | Geen nieuwe onverholpen high/critical melding; bestaande braces-patch met vastgelegde uitzondering behouden |
| Credentialformatscan | Geen matches in releasebronnen |
| Linux staging-/productioncontracten | Geslaagd in wegwerpcontainers; geen wijziging aan echte productionruntime |

Alle fixturemutaties en schone replays gebruiken uitsluitend de eigen lokale
ontwikkel/testdatabase. De volledige CI blijft een voorwaarde voor merge en
stagingpromotie; deploymentidentiteit wordt daarna via de exacte Git-SHA gecontroleerd.
De succesvolle gerichte herhaling verbergt de eerste browsertimeout niet.

De eerste twee CI-runners stopten vóór applicatietests op de anonieme Docker Hub-
pulllimiet. Alleen de wegwerprunner van de bestaande verification-workflow gebruikt
nu de [publieke Google-cache](https://docs.cloud.google.com/artifact-registry/docs/pull-cached-dockerhub-images).
De oorspronkelijke Debian- en ClamAV-referenties en hun immutable digests blijven
behouden. De cache gaf voor beide manifesten exact dezelfde content-digest terug.
Er zijn geen registrycredentials toegevoegd of echte runtime-daemons gewijzigd.

## Zelf de keten doorlopen

1. Dien als management bij **Roadmap & updates → Onze ideeën** een idee in,
   eventueel met screenshot. Een bevoegde collega ziet dezelfde inzending.
2. Behandel het bij **Productbeheer → Ideeën**. Voeg een interne notitie en een
   afzonderlijke tenantreactie toe; de tenant ziet uitsluitend de terugkoppeling.
3. Maak een algemene ontwikkeling vanuit het idee. Kies voortgang, planning,
   doelgroep en beschikbaarheid. Het nieuwe item begint als intern concept.
4. Controleer **Voorbeeld als ontvanger** en publiceer de roadmap bewust.
5. Maak een release met een algemeen onderdeel en een onderdeel beperkt tot
   bijvoorbeeld personeel. Controleer volgorde, bijlagen, beschikbaarheid en preview.
6. Controleer de relevante productie-uitrol buiten Productbeheer vóór normale
   releasecommunicatie. Bevestig de publicatie en kies eventueel **Doelgroep informeren**.
7. Bekijk de vier portalen en de in-appmeldingen. Iedere groep ziet alleen haar
   inhoud. De roadmap behoudt haar afzonderlijke voortgang.
8. Archiveer of trek toegang in. Nieuwe aanvragen worden onmiddellijk begrensd;
   geopende schermen passen zich bij de volgende verversing aan.

## Concrete grenzen

Beschikbaarheid blijft handmatig en planning indicatief. Geopende, zichtbare
overzichten verversen uiterlijk elke 20 seconden en bij focus/online komen.
Ontvangersvoorbeelden vereisen een werkelijk actieve ontvanger in het gekozen
portaal. Bijlagen zijn maximaal 10 MB, vijf per inzending/onderdeel, PDF/PNG/JPEG/WebP.
Er zijn geen openbare roadmap, stemmen, discussies tussen tenants, e-mailcampagnes,
loginpop-ups, automatische deploykoppelingen of featureflagmutaties toegevoegd.
Acceptatie door de eigenaar op een echte stagingtenant blijft aanvullend op de
geautomatiseerde fixturetests.
