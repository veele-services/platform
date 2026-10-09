# Productbeheer, Roadmap & updates — V1

Deze module vormt releasekandidaat `1.1.0-rc.1`. De productiebaseline blijft
`1.0.0`. Productbeheer beheert communicatie; het voert geen deployments uit,
verandert geen abonnementen of featureflags en verstuurt geen e-mail of push.

## Schermen en rollen

| Werkruimte | Route | Onderdeel | Toegang |
| --- | --- | --- | --- |
| Platform | `/platform/productbeheer` | Ideeën, Roadmap, Releases | Actieve platformbeheerder, op het platformhostname |
| Tenantbeheer | `/app/updates` | Nieuw, In ontwikkeling, Gepland, Onze ideeën | Actief management met `backoffice.access` en `backoffice.product.read` |
| Personeel | `/staff/updates` | Updates, vrijgegeven roadmap | Actieve personeelsidentiteit en personeelsmodule |
| Klant | `/klant/updates` | Updates, vrijgegeven roadmap | Actieve klantbinding en klantenportaalmodule |

`backoffice.product.submit` verleent management het recht ideeën in te dienen
en aan te vullen. Lezen en indienen zijn afzonderlijke rechten in de bestaande
rechtenpagina. Eigenaar en Management krijgen beide rechten; andere beheerde
rollen uitsluitend na expliciete toekenning. De bestaande, nog niet omgezette
managementlidmaatschappen behouden hun eerder beoordeelde toegang. Een beheerd
profiel valt nooit terug op de oude managementrol om ontbrekende rechten te omzeilen.
Supportmedewerkers van Fieldgrid krijgen door deze module geen productbeheerrecht.

Tenantbeheer ziet inzendingen van de eigen organisatie, ook van collega's.
Personeel en klanten kunnen geen ideeën bekijken of indienen. Klantidentiteit
blijft gebaseerd op de bestaande klantbinding, onafhankelijk van personeels- en
managementlidmaatschappen.

## Drie onafhankelijke gegevens

- **Voortgang:** onderzoek, gepland, ontwikkeling, test, uitgebracht, gepauzeerd.
- **Publicatie:** concept, gepubliceerd, gearchiveerd. Nieuwe items beginnen intern.
- **Beschikbaarheid:** handmatig vastgelegde staging- en productieomvang, met
  afzonderlijke tenantselectie en eventuele gefaseerde uitrol.

Een statuswijziging op een gepubliceerd roadmapitem wordt zichtbaar voor de
bestaande doelgroep. Opslaan publiceert niets en verstuurt geen aankondiging.
Een deelrelease verandert de roadmapvoortgang niet. Publiceren vereist een
afzonderlijke beheeractie; een release vereist minimaal één onderdeel en de
expliciete bevestiging dat de beheerder inhoud, doelgroep, beschikbaarheid en de
relevante productie-uitrol heeft gecontroleerd. Die controle is een menselijke
bevestiging, geen automatische koppeling met CI of runtimehealth.

Beschikbaarheidslabels worden afgeleid van de handmatige registratie, niet van
een versienummer of publicatiedatum. Stagingbeschikbaarheid wordt nooit als
productiebeschikbaarheid getoond. De editor vermeldt expliciet dat registratie
geen softwarefunctie inschakelt. Planning is een indicatie, geen toezegging.

## Data en toegangsgrenzen

De voorwaartse migratie `20261009220000_product_management.sql` voegt private
tabellen toe voor roadmapitems, releases, onderdelen, ideeën, gesprekken,
notities, behandelgeschiedenis, audit, aanvraagbewijzen, bestanden, gebeurtenissen
en ontvangers. Foreign keys verbinden de echte ouders, indieners en ontvangers.
Polymorfe notities, bestanden, audit en gebeurtenissen hebben nullable, gegenereerde
ouderreferenties met echte foreign keys. Indexen ondersteunen tenantlijsten,
voortgang, publicatie, releasevolgorde, koppelingen en geschiedenis.

Alle tabellen hebben geforceerde RLS en geen directe toegang voor `anon`,
`authenticated` of `service_role`. Alleen de twee publieke RPC's
`product_query` en `product_command` zijn uitvoerbaar door `authenticated`.
Private functies zijn niet publiek uitvoerbaar. RPC's controleren de actuele
authsessie, accountstatus, tenantstatus en rechten voordat zij informatie
projecteren of mutaties uitvoeren.

De server bepaalt tenant en identiteit uit de bestaande, geverifieerde
hostname-/authcontext. Een browser kan geen tenant of indiener toewijzen.
Platformbeheer op een tenanthostname is geweigerd. In lokale tests geldt alleen
de bestaande expliciete lokale context; die fallback geldt niet op staging.

De leesprojectie vereist gezamenlijk:

1. Een actuele identiteit met toegang in deze tenant en dit portaal.
2. Publicatiestatus `published`.
3. Een overeenkomend tenantbereik.
4. De toegestane groep management, personeel of klant.

Een leeg geselecteerd tenantbereik of een lege externe groepselectie is ongeldig.
Categorieën verlenen geen rechten. Rechten uit verschillende tenants worden
niet samengevoegd. Een releaseonderdeel erft expliciet met `audience = null`,
beperkt verder met een eigen doelgroep, of blijft intern. Een eigen doelgroep
mag nooit buiten de tenant- of groepgrens van de release vallen. Ook het wijzigen
van de bovenliggende doelgroep controleert alle bestaande beperkingen opnieuw.

Releaseprojecties filteren eerst onderdelen. Pas daarna worden zoekresultaten,
categorieën, totalen en paginatie berekend. Een release zonder toegestane
onderdelen ontbreekt volledig. Bijlagen, metadata en roadmaplinks volgen dezelfde
grens. Concepten en archieven zijn ook via directe tenantaanvragen niet leesbaar.

## Ideeën, gesprekken en interne informatie

Een inzending wordt op basis van de geverifieerde context vastgelegd als platform-
concept. De tenant ziet Ontvangen. Aanvullende informatie en reacties worden in
een tenantgesprek opgeslagen. Interne notities staan in een afzonderlijke tabel
en worden uitsluitend aan platformbeheer teruggegeven. De tenant krijgt geen
interne prioriteit, verantwoordelijke, auditpayloads, indiener-ID's of andere
tenantnamen mee.

Platformbeheer kan beoordelen, vragen stellen, reageren, parkeren, afwijzen,
afsluiten, koppelen of een algemene ontwikkeling maken. Vraag, parkeren en
afwijzen vereisen toelichting. De eigen behandelgeschiedenis blijft bestaan;
interne afwijzing wordt voor de tenant als Afgesloten weergegeven.

Omzetten naar een roadmapitem vereist nieuwe, bewust geschreven algemene inhoud.
Het formulier begint leeg en intern. Originele inzendingen, bedrijfsgegevens,
bijlagen en notities worden niet overgenomen. Meerdere ideeën kunnen aan dezelfde
ontwikkeling hangen. Een koppeling verleent geen leesrecht: een verborgen
roadmapitem wordt voor de tenant `null`, zonder titel, ID of link. Zichtbare
roadmapitems onthullen geen andere inzenders of aantallen gekoppelde ideeën.
Platformbeheer ziet de gekoppelde ideeën en releaseonderdelen wel.

## Publicatie, notificaties en retries

Mutaties gebruiken een actor- en contextgebonden aanvraag-ID met inhoudshash.
Dezelfde aanvraag geeft hetzelfde minimale resultaat terug; een andere inhoud
onder hetzelfde ID wordt geweigerd. Optimistische revisies en rijvergrendelingen
voorkomen overschrijven en concurrerende publicatie. De client blokkeert dubbel
klikken en behoudt de aanvraag-ID wanneer de uitkomst nog onzeker is.

Publicatie, audit, notificatiegebeurtenis en queueverzoeken worden transactioneel
vastgelegd. Een unieke ontvangergrens `(event, tenant, user)` voorkomt dat meerdere
rollen binnen dezelfde organisatie meerdere meldingen voor hetzelfde kanaal
opleveren. Bij meerdere portalen heeft management voorrang, daarna personeel,
daarna klant. Een nieuwe aankondiging vereist een nieuwe expliciete handeling;
opnieuw aankondigen verhoogt de revisie zodat een oude aanvraag niet nogmaals kan
publiceren. Opslaan, notities en doelgroepcorrecties starten geen meldingsronde.

Deze vijf typen gebruiken uitsluitend het bestaande `in_app`-kanaal:

- `product.idea_received`: ontvangst van een inzending.
- `product.idea_reply`: inhoudelijke platformreactie.
- `product.idea_decision`: vraag of besluit met tenantterugkoppeling.
- `product.release`: opt-in bij publiceren of expliciet opnieuw aankondigen.
- `product.available`: expliciete terugkoppeling naar bevoegd management van
  gekoppelde ideeën, uitsluitend als de roadmap zichtbaar en als beschikbaar in
  productie geregistreerd is.

De bestaande worker, templates, voorkeuren, queue en outbox blijven verantwoordelijk
voor aflevering. Er komt geen nieuwe provider. Rechten worden opnieuw gecontroleerd
bij voorbereiding, verwerking, inbox, preview en openen. Productmeldingen met een
inmiddels verborgen bron ontbreken ook in totalen, categorieën en unread-aantallen.
De broncontrole is toegevoegd aan de bestaande notificatiefuncties met behoud van
de overige notificatietypen en functiegrants.

## Bijlagen en verversing

Bijlagen staan in de private bucket `product-documents`. De opslagnamespace is
`{idea|change}/{resource-id}/{file-id}/bestand`. Maximaal vijf bestanden per onderdeel,
elk maximaal 10 MB: PDF, PNG, JPEG of WebP. De bestaande scanner valideert de echte
bytes en het formaat. De server controleert brontoegang vóór en na opslag-I/O;
zichtbaar maken vereist een scanbewijs voor de huidige storage-objectversie,
hash, MIME en grootte. Een door de browser opgegeven hash is geen bewijs.

Downloads lopen via `/api/product/files/[id]?workspace=...`, met actuele
bronautorisatie vóór en na lezen. Storagepaden en gevoelige IDs zijn geen openbare
downloadrechten. Alle responses zijn `private, no-store`, met `nosniff` en de
bestaande private-downloadheaders. Er worden geen signed URLs in lijsten gecachet.

De module gebruikt de bestaande shells, thema's, tabs, paginaheaders, filters,
actieknoppen, lege toestanden, paginatie en dialogprimitieven. De modulecomponenten
zijn gedeeld door de vier portalen. Lange formulieren scrollen binnen de modal,
met bereikbare footer, labels en toetsenbordbediening. Volgorde aanpassen werkt
met omhoog/omlaagknoppen en vereist geen slepen.

Er is geen nieuwe brede realtimepublicatie. De begrensde fallback ververst elke
20 seconden wanneer zichtbaar, en bij focus, online komen en zichtbaarheid.
Querysleutels bevatten de geverifieerde actor, tenant en werkruimte. De server
controleert toegang na de parallelle initiële reads. Late detailresponses worden
ongeldig na sluiten, een ander formulier openen, unmount of intrekking; ze kunnen
een nieuw formulier niet vervangen. Bij verdwenen broninhoud sluit het detail;
bij ingetrokken toegang worden lijsten en detail weggehaald. Er is geen gedeelde
private clientcache.

## Migratie en configuratie

Er zijn geen nieuwe secrets, providers, GitHub-integraties of runtimepoorten nodig.
De bestaande Supabase- en scannerconfiguratie is vereist voor opslag. De bestaande
notificatieworker moet draaien om de queue af te leveren. De migratie maakt de
private bucket, rechten, in-appcatalogus en templates aan; voor nieuwe en bestaande
Owner/Management-profielen worden de productrechten opgenomen.

Oude migraties blijven onveranderd. Het migratiemanifest wordt uitsluitend uitgebreid
met de hash van de nieuwe migratie na een schone lokale replay. Tijdens deze opdracht
worden migraties uitsluitend in ontwikkel- en testomgevingen uitgevoerd. Een eventuele
stagingpromotie volgt de bestaande gereviewde main → staging-route. Productie-uitrol,
production-SHA-vrijgave en productiedatabasemigraties vallen buiten deze opdracht.

## Zelf doorlopen

1. Open als management **Roadmap & updates → Onze ideeën → Idee indienen**.
   Vul titel, categorie en probleem in, eventueel met screenshot. Na indienen
   verschijnt Ontvangen; een collega met productleesrecht kan de inzending volgen.
2. Open als platformbeheerder **Productbeheer → Ideeën**. Gebruik desgewenst het
   statusfilter Nieuwe inzendingen (Concept). Voeg een interne notitie en een
   afzonderlijke tenantreactie toe, of vraag aanvulling met toelichting.
3. Kies **Nieuw roadmapitem maken**. Schrijf een algemene titel en omschrijving,
   kies voortgang, eventuele interne prioriteit/verantwoordelijke en indicatie.
   Het nieuwe item blijft een intern concept. De tenant ziet alleen In opvolging.
4. Bewerk de doelgroep. Kies tenantbereik én groepen; registreer staging en productie
   los van elkaar. Gebruik **Voorbeeld als ontvanger** voor een actieve tenant en
   portaal. Een concept wordt alleen in deze beheerderspreview gesimuleerd; een
   echte tenant kan het nog niet openen. Publiceer vervolgens bewust.
5. Maak bij **Releases** een releasenaam, algemene titel, introductie en doelgroep.
   Voeg onderdelen toe, met type, categorie, eigen uitleg en beschikbaarheid. Laat
   een onderdeel erven en beperk een ander tot personeel. Controleer de volgorde
   en de ontvangersvoorbeelden.
6. Controleer de relevante productie-uitrol buiten Productbeheer. Gebruik
   **Publiceren**, bevestig de controle en kies eventueel **Doelgroep informeren**.
   Dit bevestigingsscherm voert zelf geen deployment uit.
7. Open de tenant-, personeels- en klantportalen. Iedere ontvanger ziet uitsluitend
   diens onderdelen. De in-appmeldingen verschijnen na een workeruitvoering en
   leiden naar het juiste detail. Controleer de afzonderlijke staging- en
   productielabels. De roadmap blijft zijn eigen voortgang behouden.
8. Bij daadwerkelijke productieavailability van een gekoppelde ontwikkeling kan
   platformbeheer die registratie vastleggen en expliciet opnieuw aankondigen.
   Alleen de actuele, toegestane gekoppelde organisaties worden geïnformeerd.
9. Archiveer een publicatie of trek rechten in. Geopende schermen passen zich bij
   de volgende verversing aan; nieuwe detail- en bestandsaanvragen worden direct
   geweigerd. Verborgen productmeldingen tellen niet langer mee in de inbox.

## Verificatie en grenzen

Gerichte tests: `scripts/test-product-management.mjs` controleert de databaseketen,
tenant- en groepsgrenzen, concepten, gekoppelde gegevens, gemengde releases,
previewselectie, beschikbaarheid, revisies, retries, afleverqueue, inboxaantallen,
beheerde rollen en live intrekking. `lib/product/*.test.ts` controleert de
invoergrenzen, servercontext, re-autorisatie na reads en scannertoegang.
`tests/e2e/product-management.spec.ts` doorloopt echte formulieren en gescande
opslag in de vier portalen, inclusief 1440, 768 en 390 pixels, modalgrenzen,
focus en intrekking tijdens een geopende sessie.

De uiteindelijke uitgevoerde controles en aantallen staan in de opleverrapportage
bij de pull request. Acceptatie op een echte tenant is aanvullend op lokale
fixturetests. Deze V1 heeft geen openbare roadmap, stemmen, discussies tussen
tenants, automatische GitHub/deploy-koppelingen, featureflags of mailcampagnes.
Beschikbaarheid blijft handmatig; verversing is begrensd tot 20 seconden; previews
vereisen een werkelijk actieve, toegestane ontvanger in het gekozen portaal.
