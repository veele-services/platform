# Kennisbank — oplevering 1.1.0-rc.2

De release voegt een ingelogde kennisbank toe aan platform, tenantbeheer,
personeel en klanten. 46 uitgebreide Nederlandse artikelen bevatten circa
15.700 woorden, concrete stappen, voorwaarden, FAQ en verwante links.
Platformadmins beheren concepten, publiceren, archiveren en herstellen versies.
Support en andere gebruikers hebben geen schrijfrecht.

Zoeken gebruikt Nederlandse full-textweging, trefwoorden, gedeeltelijke titels
en typefoutgelijkenis. Filters, tellingen, details en verwante artikelen respecteren
de actuele publicatie- en portaalgrens. Support leest en voegt passende
gepubliceerde links in vanuit bestaande tickets, zonder automatisch te verzenden.

## Naslag

- [Actuele gehele-codebaseanalyse](codebase-analyse-2026-10-10.md).
- [Uitgebreide productbrief voor de publieke website](../product/publieke-website-functioneel-overzicht.md).
- [Kennisbankarchitectuur en bediening](../architecture/knowledge-base.md).
- [Autorisatiereview](../security/knowledge-base-review-2026-10-10.md).
- [Beoordeelde startinhoud en onderhoud](../../content/knowledge/README.md).

## Acceptatieprocedure

1. Open `/platform/kennisbank` als platformadmin; controleer categorieën en zoek
   bijvoorbeeld op `bon vrijgeven`, `Samsung` of `Mollie`.
2. Maak een concept, kies de werkruimtes en open het inhoudsvoorbeeld. Opslaan
   geeft lezers nog geen nieuwe versie. Publiceer na de aparte bevestiging.
3. Open het passende tenant-, staff- of klantportaal en controleer artikel,
   inhoudsopgave, verwante links en de kopieerbare URL. Controleer ook mobiel.
4. Bewerk een gepubliceerd artikel als concept. Een lezer houdt de bestaande
   publicatie totdat opnieuw wordt gepubliceerd. Herstel een versie als concept.
5. Open een daadwerkelijk toegestaan medewerker-/klantticket als behandelaar.
   Kies Artikel uit kennisbank, zoek, lees en voeg de link in. Controleer het
   antwoord voordat je het expliciet verzendt. Herhaal aan Fieldgridzijde voor
   een eigen toegestaan ticket; interne notities houden hun eigen publiek.
6. Archiveer een artikel en controleer dat gewone lezers het niet meer openen.
   In eerdere berichten blijft de historische tekst staan. Controleer dat
   tenantrollen en supportprofielen nergens redactie krijgen.

De bibliotheek is algemene uitleg en kent geen nieuwe tenant-eigen private
handboeken, publieke anonieme artikelen of private offlinecache. Live redactie
wordt bij toekomstige deploys niet door de startseed overschreven.

## Verificatie en stagingpromotie

| Lokale controle | Resultaat |
| --- | --- |
| Unit-/componenttests | 1.880 geslaagd in 190 bestanden |
| pgTAP | 398 geslaagd |
| Aanvullende PostgreSQL-/JWT-/racechecks | 518 geslaagd, inclusief 14 kennisbankchecks |
| Echte Auth-/Data API-/Storage-/Realtime-HTTP-proeven | 10 geslaagd met de lokale ClamAV-scanner |
| Gerichte browserketen | Geslaagd; vier portalen, platformredactie en kennisartikellink in ticketantwoord |
| TypeScript en volledige ESLint | Geslaagd |
| Schone migratiereplay | 138 hashes; alle 136 historische entries onveranderd |
| Rechteninventaris | 1.192 oppervlakken; 31 wijzigingen gereviewd; geen verwijderd oppervlak |
| Database security advisor | Geen waarschuwingen of fouten |
| SQL-lint | Geen fouten; bestaande waarschuwingen in 27 functies, geen kennisbankwaarschuwing |
| Broncredentialscontrole | Geen herkende credentialformats in 1.405 tekstbestanden; geen historie-/onbekende-formaatsclaim |

De browserflow controleert daadwerkelijk platformredactie, concept/publicatie,
vier portalen, mobiel, archivering en lezen/invoegen/verzenden van een artikel
in een lokaal ticket. De eerste uitvoeringen vonden ontbrekende modules in de
testtenant en een verkeerde testselector voor Antwoord versturen. Fixtures
gebruiken nu expliciet tickets/klantportaal en herstellen de oorspronkelijke
modules. Audit-/integriteitsguards worden niet uitgeschakeld om testgesprekken
te verwijderen. De daadwerkelijke ticketbericht- en autorisatiecontracten bleven intact.
De extra lokale HTTP-aanroep is herhaald na correctie van de scanneromgevingsoptie;
met `CLAMAV_ENABLED` en de bestaande `CLAMAV_SOCKET` slaagden alle tien proeven.
Desktopplatform en mobiel klantportaal zijn bovendien visueel gecontroleerd.

Volledige main-CI blijft vóór exacte stagingpromotie verplicht. De stagingworkflow
herhaalt alle tests, maakt een backup, migreert, bouwt, installeert en controleert
een verse worker en publieke health met exact-SHA. De definitieve runlinks en
deploymentidentiteit horen bij de opleverrapportage, niet bij een vooraf beweerde
deployment. Deze kandidaat verplaatst de onveranderlijke productierelease `v1.0.0` niet.
