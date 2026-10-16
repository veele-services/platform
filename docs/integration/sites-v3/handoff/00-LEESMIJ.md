# Fieldgrid — overdracht aan Codex v3.0

Volledige editie, opnieuw gecontroleerd op 15 oktober 2026 · Europe/Amsterdam · doelrepository: `veele-services/platform`.

**De goedgekeurde UI/UX uit Sites is leidend. Integreer de meegeleverde presentatie in de bestaande Fieldgrid-applicatie; ontwerp de schermen niet opnieuw. De Signature Grid-website hoort op https://www.fieldgrid.nl.**

Dit pakket bevat de actuele bron van beide Sites, een vergelijking met de huidige GitHub-repository, integratievoorwaarden, concrete acceptatiegevallen en een direct te gebruiken Codex-opdracht. Er is tijdens deze overdracht niets gewijzigd aan de doelrepository, DNS, productie, staging of databases.

## Starten

1. Pak de ZIP uit naast de bestaande Fieldgrid-checkout. Kopieer `source/` niet over die checkout heen.
2. Open de doelrepository in Codex en geef het uitgepakte pakketpad mee.
3. Plak `STARTPROMPT.txt` als opdracht. Codex leest eerst `01-CODEX-OPDRACHT.md` en `docs/02` tot en met `docs/09`. De schermen- en actiematrix is de volledigheidscheck voor website én platform.
4. Controleer de pakketintegriteit eventueel met `python3 tools/verify-package.py` vanuit deze map.

## Vastgezette referenties

| Bron | Exacte versie | Betekenis |
| --- | --- | --- |
| Huidige GitHub `main` | `71df59ab0390ffeae482c7edbaf27efe3fa6546d` | Gecontroleerde implementatiebaseline; controleer bij uitvoering opnieuw op wijzigingen. |
| Platform-Site | versie 6 · `3999c85b76aecf729f3b2bba86e1535255915848` | Goedgekeurde platform-, management- en portaalpresentatie, inclusief CRM. |
| Signature Grid-Site | versie 4 · `c78377808dc560f4b8c2288b69dfe504845d8c94` | Goedgekeurde website, copy, beelden, navigatie en formulieren. |

Ontwerpreferenties:

- https://fieldgrid-platform.dgwebserv.chatgpt.site/#/platform
- https://fieldgrid-premium-concepts.dgwebserv.chatgpt.site
- Doelrepository: https://github.com/veele-services/platform
- **Definitieve website: https://www.fieldgrid.nl**. Sites blijft alleen de referentie.

Een Site-SHA en een GitHub-SHA horen bij verschillende repositories. Dit pakket is geen direct toepasbare patch op `veele-services/platform`.

De actuele controle bevestigt dezelfde twee Sites-bronversies en dezelfde GitHub-HEAD: 0 nieuwe commits en 0 gewijzigde repobestanden sinds de eerdere v3.0-controle. Het pakket bevat **279 ongewijzigde Sites-bronbestanden**, inclusief componenten, styling, afbeeldingen, lettertypen, content, API-referentie en tests. De volledige website, CRM en overige meegeleverde platformomgevingen horen bij de opdracht.

## Belangrijkste verschillen

- Eén overgebleven premium marketingontwerp: Signature Grid, met blauwe accenten, subtiele schaduwen, echte paginaroutes, uitgebreide teksten, beelden en duidelijke conversieknoppen.
- Websiteformulieren voor kennismaking/demo/proefaanvraag gekoppeld aan één platformbrede CRM-pipeline; een kennismaking of demo is telefonisch. Geen optie voor een videogesprek.
- CRM met leads, aanvragen, dossierhistorie, taken, afspraakbeheer, beschikbaarheid, ICS en controleerbare mailstatus.
- Op het platformoverzicht: statistieken → vier CRM-containers → Aandacht nodig en Supportcockpit → Tenantoverzicht en Platformacties.
- De extra CRM-kopregel met ‘Van interesse naar klant’, ‘Relaties & groei’, toelichting, ‘Alle gegevens’ en vernieuwknop is verwijderd. Dit is de laatste goedgekeurde versie.
- Geen tweede mailconfiguratie of apart CRM-mailadres. Gebruik de bestaande globale SendGrid-service en de geregistreerde primaire platformbeheerder.
- De bestaande managementuitbreiding en vier omgevingen blijven inbegrepen; de nieuwste platformbron vervangt de oude UI-export uit v2.0.

## Inhoud

| Onderdeel | Locatie |
| --- | --- |
| Directe opdracht en harde randvoorwaarden | `STARTPROMPT.txt`, `01-CODEX-OPDRACHT.md` |
| Actuele repo versus Sites | `docs/02-DELTA-TEN-OPZICHTE-VAN-REPO.md` |
| Bindend presentatiecontract | `docs/03-UI-UX-CONTRACT.md` |
| CRM, agenda, mail en API-overname | `docs/04-CRM-EN-INTEGRATIE.md` |
| www-domein, website en SEO | `docs/05-WEBSITE-DOMEIN-SEO.md` |
| Bestandsmapping en uitvoering | `docs/06-UITVOERINGSPLAN.md` |
| Acceptatie en opleveringsbewijs | `docs/07-ACCEPTATIE.md`, `docs/08-VERIFICATIESTATUS.md` |
| Alle pagina’s, schermen, formulieren en acties | `docs/09-SCHERMEN-EN-ACTIEMATRIX.md` |
| Hercontrole van actuele Sites- en repoversies | `reference/actualiteitscontrole/` |
| Exacte Sitebronnen, inclusief assets | `source/platform/`, `source/marketing/` |
| Inspectie van huidige repo, historische functionele verdieping | `reference/` |
| Platformverschillen sinds vorig pakket | `deltas/` — uitsluitend Sitehistorie, niet toepassen op de doelrepo |
| Herkomst en checksums | `PROVENANCE.json`, `SOURCE-MANIFEST.json`, `CHECKSUMS.sha256`, `tools/verify-package.py` |

## Wat bewust niet als productiebewijs geldt

De operationele platformdemo gebruikt voorbeeldgegevens en lokale state; het CRM gebruikt in Sites wel serveropslag. De Sites-maildienst heeft geen productie-SendGrid-configuratie en de demo-agenda synchroniseert niet met Google of Outlook. Een proefaanvraag activeert nog geen account. De huidige marketingrobots blokkeren indexering omdat het een ontwerpreferentie is. Deze grenzen moeten bij integratie worden opgelost of eerlijk in de flow blijven staan; doe geen onterechte succesclaims.

De bronexport is bytegetrouw, behalve de uitgesloten Sites-hostingidentiteit. Daardoor blijven ook historische README-teksten aanwezig. De platform-README noemt nog de oude kaartvolgorde en een overzichtsfilter. De actuele componentcode en dit v3.0-contract zijn op die punten leidend.

`reference/historisch-v2/` bevat oudere functionele verdieping. Bestaande feiten daarin zijn gedateerd; gebruik de nieuwe repo-audit. Oudere bron-SHA's, Vite-startcommando's, routekeuzes en releaseinstructies daarin vervangen dit pakket niet.
