# Wat is geverifieerd bij overdracht

Oorspronkelijke audit: 14 oktober 2026. Actualiteitscontrole en volledige editie: 15 oktober 2026, Europe/Amsterdam. Historische testresultaten hieronder zijn niet opnieuw uitgevoerd bij het samenstellen van deze editie.

| Onderdeel | Bewijs / status |
| --- | --- |
| Targetrepo | GitHub defaultbranch `main` daadwerkelijk opgelost op `71df59ab0390ffeae482c7edbaf27efe3fa6546d`; volledige tree van 1.754 entries, niet afgekapt; 37 relevante volledige bestanden gelezen. |
| Verschil oude repo-baseline | GitHub compare: twee commits vooruit, acht gewijzigde/toegevoegde bestanden; exact resultaat meegeleverd. |
| Platformreferentie | Gepubliceerde Sites-versie 6, bron-SHA `3999c85b76aecf729f3b2bba86e1535255915848`; native deployment succesvol. Laatste wijziging: kop/filter weg en CRM boven Aandacht/Support. |
| Marketingreferentie | Gepubliceerde Sites-versie 4, bron-SHA `c78377808dc560f4b8c2288b69dfe504845d8c94`; gekoppelde conversieflow aanwezig. |
| Bronexports | Alleen Git-getrackte bestanden uit de vaste SHA's; bytes en Git-blobidentiteit in SOURCE-MANIFEST; Sites-hostingidentiteit uitgesloten. Geen lokale runtimegegevens of credentials. |
| Laatste platformwijziging | TypeScriptcontrole en productiebuild succesvol vóór de laatste Sites-publicatie. |
| Eerdere CRM-integratiecontrole | SQLite/backendtests geslaagd voor intake/idempotentie, slotconflict, globale mail/identiteit en legacy notificatieweergave; provider gemockt, geen echte mails. 29 SSR-scherm-/rolrenders en gedeelde invariantchecks geslaagd vóór de laatste layoutwijziging. |
| Eerdere live prototypecontrole | Website→CRM-opslag, herhaalde intake, beschikbaarheid, annulering en ICS gecontroleerd in voorgaande implementatiestap; geen bewijs voor echte productieomgeving. De testaanvraag is afgesloten, niet als echte klant over te dragen. |
| Mail in Sites | Productie-SendGrid niet aangesloten op de losse Site-runtime. CRM-notificatiestatus is eerlijk; dit pakket bevat geen API-key of werkelijk vastgesteld productiebeheeradres. |
| Visuele browseracceptatie | Niet opnieuw uitgevoerd bij deze overdracht. Er worden geen verzonnen screenshots of claims van pixelvergelijking meegeleverd. De ontvangende Codex moet dit op de echte integratie uitvoeren. |
| Targetrepo tests/runtime | Geen implementatie, CI-run, databasequery/migratie of targetdeployment uitgevoerd tijdens packaging. Broncode-audit bewijst geen actuele runtimeconfiguratie. |
| www | Gewenste bestemming expliciet vastgelegd; huidige hostclassificatie onderzocht. DNS, TLS en productie-www zijn niet gewijzigd of live bewezen. |
| Pakketcontrole | Zie `PACKAGE-VALIDATION.json`: bronexport, checksums, archiefintegriteit en gerichte uitsluitingen. |

## Actualiteitscontrole volledige editie

- De native Sites-versielijst geeft nog steeds platformversie 6 en marketingversie 4 met exact dezelfde bron-SHA’s als hierboven. De 279 meegeleverde bronbestanden zijn opnieuw gecontroleerd tegen hun Git-blobidentiteit en SHA256.
- GitHub `main` is opnieuw opgelost op dezelfde baseline. De vergelijking geeft 0 nieuwe commits en 0 gewijzigde bestanden. 17 integratierelevante bestanden zijn opnieuw inhoudelijk gecontroleerd; de bytegetrouwe set van 37 referentiebestanden blijft geldig.
- De route-, schermen- en actiematrix in `docs/09` is uit de meegeleverde bron opgesteld. Die matrix is een uitvoerings- en acceptatiechecklist, geen bewijs dat de integratie in de doelrepo al bestaat.
- Het oorspronkelijke en het opnieuw verpakte archief worden met `tools/verify-package.py` gecontroleerd. De SHA256-lijst dekt ook alle documenten en referenties.
- De concrete versie- en comparebewijzen staan in `reference/actualiteitscontrole/`. Dit verandert geen eerdere beperkingen over productie, browser-QA, mail of externe agenda’s.

## Bekende bronverschillen die geen redesign vragen

1. De platform-README noemt een achterhaalde volgorde en het verwijderde overzichtsfilter. De actuele `CRMOverview.tsx`/`ExistingDashboards.tsx` en dit contract gaan voor.
2. CRM-overview en CRM-topmetric gebruiken een verschillende tijdsgrens voor komende afspraken. Maak de definitie gedeeld in productie, met behoud van uiterlijk.
3. Marketing `siteOrigin` is nu de Sites-URL en robots/noindex blokkeren indexering. Productie-www vereist doelbewuste omzetting en sitemap; previews blijven geblokkeerd.
4. De targetrepo behandelt www nu als tenant. Voeg een marketinghostclassificatie toe; verander geen APP_URL/tenantadresbasis om dit te maskeren.
5. De bestaande centrale notificatieworker vraagt momenteel een UUID-tenant in zijn deliveryschema. Test/integreer nieuwe tenantloze platform-CRM-events expliciet in de bestaande keten.
6. Standaard demo-, betaling-, upload- en weekrapportacties zijn niet allemaal echte backendprocessen. Het persistente Sites-CRM vormt daarop een beperkte uitzondering; het is nog geen productierepo-integratie.

Geen van deze punten maakt de goedgekeurde UI vrijblijvend. Ze specificeren de noodzakelijke technische aansluiting en eerlijke functionele states.
