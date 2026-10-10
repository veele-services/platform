# Autorisatiereview kennisbank — 10 oktober 2026

Reviewbasis: main `6658383ba86d737b7fcba7d0ba8bf725e2bc3d92`, toevoeging 1.1.0-rc.2.
Geen wijzigingen aan bestaande databasehelpers, runtimecredentials, hostcontracten
of historische migraties. De nieuwe pg_trgm-extension wordt alleen als zoekhulpmiddel
gebruikt; extensiefuncties leveren geen Fieldgridgegevens.

## Beoordeelde grenzen

- Vier nieuwe routes en detailroutes gebruiken actuele auth, hostname en de juiste
  bestaande portaal-shell. Customer actor faalt gesloten bij ontbrekende binding.
  Een platformacteur op een tenanthost kan geen platformredactie aanroepen.
- Drie nieuwe private tabellen hebben FORCE RLS en expliciet ingetrokken directe
  rechten, ook voor service_role. Geen publiek Storage-object of uploadroute.
- Alle nieuwe private functies hebben expliciet ingetrokken EXECUTE. Alleen drie
  publieke RPC's zijn authenticated uitvoerbaar. Functies hebben vaste lege
  search_path en volledig gekwalificeerde bronnen; geen dynamische SQL.
- Leesrechten volgen actuele sessie, userstatus, tenantstatus, management-/staff-/
  klantgrenzen en module. Supporttoegang gebruikt het bestaande actuele
  platform-workspacecontract, inclusief ingetrokken supportprofielen.
- Adminschrijven vereist platform_admins én actuele sessie/account. Tenantrollen,
  supportgrants en browserbooleans worden geen redactierecht.
- Zoektotalen, categorieën, verwante links en details worden na publicatie/doelgroep
  berekend. Lezers krijgen geen draft, beheerhistorie, versiepayload of receipt.
- Opdrachtbewijzen zijn actor-, request- en payloadgebonden; actuele autorisatie
  komt vóór replay. Revisies en rowlocks voorkomen overwriting en races.
- Concept en published snapshot zijn onafhankelijk; archivering sluit directe
  lezerslinks. Herstel verandert de publicatie niet automatisch.
- Ticketsearch leest het ticket opnieuw, eist lees- en antwoord/notitierecht en
  controleert tenant/context/publiek. Doelportaal komt uit de echte reporterbinding,
  route en audience, niet uit een clientparameter. Geen HR- of bron­dossierexport.
- Cross-origin artikelhrefs worden op de server opgebouwd met de bestaande
  originhelper. Alleen kennisbankpaden worden in ticketberichten linkified;
  React escaped ordinary text. Geen executable HTML of URL-schema.
- Browserpicker bindt responses aan workspace/ticket/audience/search; ingevoegde
  links voorkomen ongemerkte doelgroepwissel. Verzenden blijft de bestaande
  bewuste ticketactie, zonder nieuwe provider- of berichtrechten.
- API no-store, live browserhercontrole, clear op ingetrokken read/account, geen
  kennisinhoud in de private offlinecache. Tijdelijke netwerkfouten behouden een
  zichtbare fout en retry; ze maken geen nieuwe rechten.
- Startinhoud bevat geen echte tenantrecords, secrets of accountcodes. Runtime
  bundelt redactiebronnen niet in een clientlibrary. Eenmalige seed overschrijft
  geen live beheerwijzigingen.

## Expliciete productgrenzen

De bibliotheek bevat algemene Fieldgrid-uitleg per portaal, geen tenant-eigen
vertrouwelijke handboeken of publiek marketing-CMS. Platformbeheerders kunnen
alle inhoud redigeren. Support mag gepubliceerd platformmateriaal lezen en
passende artikelen delen, maar heeft geen contentbeheer.

Titels/links in eerder verzonden antwoorden zijn historische tekst. Archivering
wijzigt de bestemmingstoegang, niet die al verzonden tekst. Personeel- of klant-
links horen op de tenantorigin; Fieldgrid-links op de platformorigin. Dat maakt
geen automatisch doorgestuurd antwoord tussen twee gescheiden supportgesprekken.

## Bewijs

- `lib/knowledge/model.test.ts`: schemas, unsafe hrefs, HTML-escaping en seedbeleid.
- `scripts/test-knowledge-base.mjs`: echte SQL/JWT-roles met rollback-only fictieve
  fixtures, writer denial, current sessions, RLS/grants, publication/versions,
  query scope, Dutch/synonym/typo search en ticket audience.
- `tests/e2e/knowledge-base.spec.ts`: gebouwde app, echte lokale Auth, vier
  portalen, editor/publicatie, mobiele viewport en ticketartikelinsertie.
- `docs/architecture/knowledge-base.md`: exact contract en datagrenzen.

De surface-inventaris krijgt uitsluitend nieuwe/gewijzigde fingerprints nadat
source-, DB- en workflowreview en checks zijn afgerond. Een capture is geen approval.
Oude ledgerentries behouden hun bewijs; ongewijzigde migratiehashes blijven identiek.

De schone lokale replay omvat 138 migraties; alle 136 eerdere manifestregels
zijn inhoudelijk identiek. De inventaris bevat nu 1.192 oppervlakken. De 31
afzonderlijk beoordeelde wijzigingen betreffen negen API-/pagina-ingangen,
de gedeelde routewrapper, vier bestaande shell-/gegevensmodules, twee
kennisbankgegevens-/actiemodules, drie private tabellen, tien SQL-functies en
twee operationele bestanden (package en manifest). Er is geen verwijderd oppervlak.
De 1.161 ongewijzigde ledgerentries zijn exact behouden. De ticketcomposer,
linkrenderer, editor, live clientstate en CSS zijn daarnaast inhoudelijk
beoordeeld, ook wanneer de structurele detector ze niet als data-entrypoint telt.
