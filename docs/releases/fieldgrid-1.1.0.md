# Fieldgrid 1.1.0 — Productbeheer en kennisbank

Releasedatum: 14 oktober 2026. Deze MINOR-release brengt de twee eerder op
staging gecontroleerde kandidaten samen. De bestaande V1-portalen, dossiers,
planning, uitvoering, facturatie en ticketketen blijven de basis.

## Productbeheer voor Fieldgrid

Op `/platform/productbeheer` beheren platformadmins ideeën, roadmapitems en
releases. Een tenantidee kan worden beoordeeld, van toelichting voorzien,
gekoppeld aan een ontwikkeling of afgesloten. Interne notities en het gesprek
met de tenant hebben afzonderlijke publieken. Algemene roadmapinhoud wordt
bewust geschreven; gegevens uit een tenantidee worden niet automatisch gedeeld.

Releases hebben een introductie en geordende onderdelen met eigen uitleg,
categorie en type: nieuw, verbeterd of opgelost. De doelgroep wordt bepaald
door de combinatie van organisatie en portaal. Een onderdeel kan die doelgroep
verder beperken. Het ontvangersvoorbeeld toont wat een concrete doelgroep krijgt.

Concepten, publicatie, ontwikkelvoortgang en geregistreerde beschikbaarheid zijn
afzonderlijk. Een roadmapstatus of publicatie installeert geen software en
verandert geen tenantmodule. Beschikbaarheid in staging en productie wordt
apart geregistreerd. Publiceren vereist de bestaande expliciete inhouds- en
uitrolbevestiging. Een aankondiging is een aparte, optionele in-apphandeling.

## Updates voor tenants, personeel en klanten

Tenantmanagement vindt op `/app/updates` **Roadmap & updates**, inclusief
**Onze ideeën**. Bevoegde medewerkers kunnen ideeën indienen en het gesprek
met Fieldgrid vervolgen. De rechten om ontwikkelingen te lezen en ideeën in
te dienen zijn afzonderlijk instelbaar in de managementrollen.

Personeel en klanten vinden **Wat is er nieuw?** op respectievelijk
`/staff/updates` en `/klant/updates`. Zij zien uitsluitend gepubliceerde,
toegestane onderdelen. Private tenantideeën en platformnotities zijn niet
onderdeel van die feeds. Bijlagen volgen de bestaande private opslag en scanner.

## Uitgebreide kennisbank in vier portalen

De bibliotheek bevat 46 Nederlandstalige artikelen met circa 15.700 woorden.
De handleidingen beschrijven voorwaarden, stappen, verwachte resultaten en
veelgestelde vragen. Onderwerpen zijn onder meer accounttoegang, rollen,
klanten en objecten, planning en werkbonvrijgave, uitvoering en rapporten,
facturen en betalingen, PWA-installatie en ondersteuning.

Iedere werkruimte krijgt passende artikelen:

| Portaal | Route | Bediening |
| --- | --- | --- |
| Platformadmin | `/platform/kennisbank` | Lezen en centrale redactie door platformadmins |
| Tenantbackoffice | `/app/kennisbank` | Gepubliceerde handleidingen lezen |
| Personeel | `/staff/kennisbank` | Gepubliceerde personeelsuitleg lezen |
| Klant | `/klant/kennisbank` | Gepubliceerde klantinstructies lezen |

Zoeken gebruikt Nederlandse woordvormen, titel- en trefwoordweging,
gedeeltelijke tekst en typefoutgelijkenis. Categorieën en paginatie helpen bij
navigeren. Artikelen hebben een inhoudsopgave, vaste kopieerbare links en
verwante artikelen die dezelfde toegangsgrenzen volgen.

Alleen platformadmins schrijven en publiceren. Opslaan maakt een concept;
lezers behouden de laatste gepubliceerde versie tot de aparte publicatieactie.
Archivering sluit nieuwe leesaanvragen. Versiegeschiedenis en herstel helpen
bij correcties. Onopgeslagen tekst blijft behouden bij live verversing; een
concurrerende opslag wordt door revisiecontrole geweigerd.

## Kennisartikelen delen vanuit tickets

Een behandelaar kiest **Artikel uit kennisbank** in het antwoordformulier.
Het daadwerkelijke ticket en het berichtpubliek bepalen welke gepubliceerde
artikelen voor de ontvanger passen. De behandelaar zoekt, leest een voorbeeld
en voegt de artikellink toe aan het antwoordconcept. Het antwoord wordt daarna
expliciet verzonden via de bestaande ticketbediening.

Dit werkt binnen de bestaande gescheiden ticketketen van personeel of klant
naar tenant en van tenant naar Fieldgrid. Een artikellink verleent geen nieuwe
rechten. Het openen controleert de actuele toegang. Archivering herschrijft
geen historische berichttekst. Supportaccounts krijgen door deze functie geen
kennisbankredactie of extra toegang tot brondossiers.

## Release en verificatie

De functionele bronbasis is de geaccepteerde stagingcommit
`9630c8f74a02cef98a12d213ec2ed87f8365afd4`. De definitieve 1.1.0-commit past
versiemetadata en release-informatie aan; historische migraties, applicatiecode,
dependencies, rollen en runtimecontracten blijven gelijk aan die bronbasis.

De definitieve SHA moet opnieuw de volledige main-CI en stagingacceptatie
doorlopen. Daarna wordt de expliciet geaccepteerde SHA via de bestaande
productiebranch gepromoveerd. Productie bouwt met eigen configuratie, maakt een
premigratiebackup, past de bestaande voorwaartse migraties toe en installeert
via de vaste releasebroker. Acceptatie vereist de exacte publieke SHA,
database en scanner gereed, een verse succesvolle worker en de publieke
portaalcontroles. Deze procedure wordt niet vervangen door een versienummer.

Na succesvolle productieacceptatie wordt de onveranderlijke tag `v1.1.0`
gemaakt. De [GitHub-release](https://github.com/veele-services/platform/releases/tag/v1.1.0)
bevat de definitieve commit en de werkelijke CI- en deploymentlinks.
Eerdere analyses blijven gedateerd bewijs van hun toenmalige releasefase.

De huidige opdracht actualiseert de repository-changelog en GitHub-releasenotes.
Publicaties in Productbeheer houden de bestaande afzonderlijke beheeractie,
doelgroepcontrole en bevestiging; deployment maakt geen productaankondiging aan.

## Naslag

- [Changelog](../../CHANGELOG.md).
- [Gehele-codebaseanalyse](codebase-analyse-2026-10-10.md).
- [Uitgebreide productbrief voor de publieke website](../product/publieke-website-functioneel-overzicht.md).
- [Productbeheercontract](../architecture/product-management.md).
- [Kennisbankcontract](../architecture/knowledge-base.md).
- [Versiebeleid](versioning.md).
