# Dashboarddetails en factuurpreview — 7 oktober 2026

Bronreview ten opzichte van `636cf24de389c5d956890d16faa30fda18ed7a4b`, met een schone lokale replay van 126 migraties. De bestaande 125 statementhashes zijn ongewijzigd. Deze release blijft binnen de canonieke stagingarchitectuur.

## Factuurweergave en bewijs

De twee factuurbestandsroutes vereisen de actuele financiële tenanttoegang. Definitieve facturen worden opnieuw door `customer_file_access` en de tenantgebonden `invoices`-query gecontroleerd; concepten komen uitsluitend uit `execution_invoice_concepts`. Zowel vóór als na bestandsverwerking wordt de bron gecontroleerd. Het nieuwe managementvoorbeeld leest eerst het originele, scannergecontroleerde bestand en vergelijkt de opgeslagen SHA-256. Daarna rendert het uitsluitend de vastgelegde klant-, huisstijl- en regelsnapshots. Een gewijzigde bron of ingetrokken toegang wordt geweigerd. Financiële bedragen worden met de bevroren regels gecontroleerd.

`presentation=1` maakt een alleen-lezen weergavekopie. Het originele bestand, de opgeslagen bestandshash, factuurnummering en boekhouding worden niet gewijzigd. Zonder deze parameter blijft de bestandsroute het originele bewijsdocument leveren. Nieuwe facturen krijgen de nieuwe vormgeving bij hun eerste, bestaande gecontroleerde PDF-opslag.

Alleen deze geautoriseerde PDF-routes krijgen `X-Frame-Options: SAMEORIGIN` en `frame-ancestors 'self'`. De proxy overschrijft hun eigen gesloten PDF-policy niet meer met de pagina-policy. Alle reguliere pagina's behouden `DENY` en `frame-ancestors 'none'`; overige private bestanden behouden hun sandbox. Geen bearer-URL, externe frame-origin of nieuwe autorisatie wordt toegevoegd. Succesvolle factuurresponsen blijven `private, no-store`, `application/pdf` en `nosniff`. Foutieve UUID's en ongeautoriseerde verzoeken leveren geen bestand op.

Bewijs: `tests/e2e/dossier-alignment.spec.ts` doorloopt echte rapportgoedkeuring, het automatisch getoonde concept, de definitieve boeking en beide PDF-weergaven. De case controleert headers, de oorspronkelijke bestandshash, inline/attachment, anonieme weigering en het intact blijven van historische klantgegevens na een klantwijziging. `lib/pdf/invoice-snapshot.test.ts` controleert de ongewijzigde invoer, bedragen en lege historische velden. De bestaande live-session-, tenant-, module-, Storage-, scanner- en revocatieregressies blijven releasepoorten.

## Bedrijfsgegevens en concepten

De renderer toont vaste plaatsen voor naam, adres, KvK, btw, IBAN, e-mail en telefoon van afzender en klant. Ontbrekende gegevens blijven leeg: ze worden niet uit willekeurige footers, andere tenants of actuele klantrecords afgeleid. Het huidige tenantmodel bevat geen bedrijfsadres, KvK, btw of IBAN; daarvoor blijven de velden leeg. Beschikbare historische klantgegevens komen uit de bestaande factuursnapshot. De concept-RPC voegt alleen de eigen klantidentiteit toe aan zijn bestaande projectie; alle bron-, hoeveelheid-, akkoord-, sessie-, tenant-, rol- en modulevoorwaarden zijn bytegewijs behouden. Null-waarden worden als lege weergavevelden geaccepteerd.

Het tenantlogo wordt uitsluitend uit de bestaande gecontroleerde brandingnamespace gelezen; zonder bruikbaar logo volgt de Fieldgrid-huisstijl. Paginering bewaart alle regels en de vastgelegde totalen. De nieuwe standaardfactuur met bedrijfsblokken, referentie, drie regels, btw en betaalinformatie is met fictieve gegevens als PDF gerenderd en visueel gecontroleerd. De unitregressie controleert zowel deze compacte factuur als 100 regels over meerdere pagina's en een beschadigd historisch logo.

## Namen en portalen

`customer_owners` behoudt `private.customer_manage`, actieve tenantmembership en de bestaande accountverantwoordelijkerollen. De labelprojectie gebruikt uitsluitend de eigen tenantmedewerker, daarna de bestaande accountnaam, anders 'Naam niet vastgelegd'. Een e-mailmatch wordt alleen bij een bevestigd account voor het weergavelabel gebruikt; deze match verleent geen account-, dossier- of tenanttoegang. E-mailadressen worden niet als namen getoond. Authenticated/postgres behouden de bestaande uitvoerrechten; anon/service blijven uitgesloten, met lege search_path.

Bewijs: `scripts/test-customer360.mjs` controleert gekoppelde namen, bevestigde e-mailmatches, ontbrekende naam, metadatafallback, vreemde tenant, staffweigering en ingetrokken membership. De browseradrescase gebruikt één straatnaamveld en dezelfde postcode/huisnummervelden, controleert late antwoorden, exacte huisletters/toevoegingen, broninvalidatie, portalled suggesties en blijvende opslag. Er worden geen locatie- of eigendomsrechten uit adressuggesties afgeleid.

Klant-, Object- en Personeel 360 gebruiken gedeelde paginakoppen, sectiekoppen boven kaarten en dezelfde canonieke tablinks. De onderliggende loaders, dossieracties, OTP-kluis, privacygrenzen en resource-id's behouden hun bestaande controle. Banners krijgen ruimte zonder hun accountreceipts te wijzigen. Notificaties behouden hun eigen context, versiecontrole, lezen/archiveren/ontvangstbevestiging en bronstatus; gewone detailacties staan als iconen op één rij. De compacte dialoog sluit via een Nederlandse toegankelijke knop en behoudt de inboxcontext.

## Releasepoorten

Lint, TypeScript, 1.462 unitcases, 398 pgTAP-asserties, 426 Node-databasecases, 10 echte HTTP-securitycases, een productiebuild, migratiemanifest, database-advisors, credentialscan en alle browserflows zijn de verplichte controles. Gewijzigde security-oppervlakken krijgen ieder een actuele inhoudshash met concrete bewijsverwijzingen. PR-, main- en staging-CI herhalen de volledige verificatie. Stagingacceptatie vereist alle workflowjobs én HTTP 200 met exact de gepromoveerde SHA; lokale checks bewijzen geen uitrol.
