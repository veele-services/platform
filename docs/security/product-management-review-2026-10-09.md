# Productbeheer V1 — beoordeling van toegangsgrenzen

Deze beoordeling betreft de nieuwe productmodule en de bestaande oppervlakken
die daarvoor wijzigen. Bestaande migraties en onveranderde reviewregels blijven
behouden. De autorisatie-inventaris wordt pas bijgewerkt na broncontrole en
tests op de eigen lokale ontwikkelomgeving; een inventarisfingerprint op zichzelf
is geen beveiligingsbewijs.

## Broncontrole

- Vier portaalroutes en gedeelde servercomponenten: ingelogde, actuele identiteit;
  hostnamegebonden tenant; onafhankelijk geverifieerde klantbinding;
  platformbeheer uitsluitend op het platformhostname. Initiële parallelle reads
  hebben een tweede actuele toegangscontrole voordat data naar de browser gaan.
- Queries en serveractions: gevalideerde invoer, JWT van de gebruiker en
  serverbepaalde tenant/actor. De browser kan geen indiener, tenant of bevoegdheid
  toewijzen. Managed rollen vereisen de nieuwe lees-/indienrechten en vallen niet
  terug op een oude, ruimere managementrol.
  Directe RPC-aanvragen met een ontbrekende, lege of onbekende portaalcontext
  worden expliciet geweigerd, inclusief SQL NULL.
- Private tabellen: echte foreign keys, geforceerde RLS en geen directe grants
  voor anon, authenticated of service_role. Private helpers zijn niet executeerbaar
  door die rollen; alleen product_query/product_command hebben de bedoelde
  authenticated-grant. SECURITY DEFINER-functies gebruiken een leeg search_path.
- Doelgroep en projectie: tenant én groep moeten overeenkomen. Concept, archief,
  lege selecties en uitbreidende child-doelgroepen zijn geweigerd. Releaseonderdelen
  worden vóór zoeken, categorieën, totalen, metadata en paginatie gefilterd.
  Koppelingen voegen geen leesrechten toe. Preview is alleen voor platformbeheer
  en hergebruikt de echte projectie met een werkelijk bevoegde ontvanger.
- Notities en gesprekken: gescheiden opslag; interne notities/audit/prioriteiten
  komen niet in tenant-DTO's, zoeken of notificatiepayloads. Omzetten maakt een
  nieuw, bewust geschreven intern concept zonder oorspronkelijke bedrijfsinhoud.
- Publiceren en aankondigen: actor/contextgebonden idempotencybewijzen,
  inhoudshash, rijvergrendeling en revisies. Zowel publicatie als een nieuwe
  aankondiging verhogen de revisie. Een concurrente aanvraag met een nieuw ID
  en oude revisie faalt; een retry met hetzelfde ID geeft hetzelfde resultaat.
- Notificaties: transactionele gebeurtenis en deduplicatie per event/tenant/user;
  één portaal per ontvanger. Bestaande queue en outbox controleren de bron opnieuw.
  Verborgen productmeldingen ontbreken ook in previews en unread/zoektotalen.
  De bestaande bron- en inboxfuncties behouden hun overige branches en grants.
- Bijlagen: private bucket, beperkte namespace en formaat/grootte; ClamAV controleert
  de echte bytes. Definitieve koppeling vereist scanbewijs voor de actuele object-
  versie/hash/MIME/grootte. Download en upload controleren toegang vóór en na I/O;
  responses zijn private/no-store. Browserhashes geven geen scan- of leesrechten.
- Clientverversing: geverifieerde actor/tenant/portaal in de sleutel, geen gedeelde
  private cache; zichtbare polling/focusverversing. Late responses worden na sluiten,
  formulierwissel of intrekking genegeerd. Intrekking verwijdert detail en lijst.
- Operationele wijzigingen: packageversie en testlijst uitgebreid; migratiemanifest
  uitsluitend met de nieuwe, schoon gereplayde migratie uitgebreid. Geen nieuwe
  secret, deploymentkoppeling, provider of productionconfiguratie.
- CI-fixturedownloads: de verification-job draait uitsluitend op een wegwerpbare
  `ubuntu-24.04` runner. De Linuxfixtures gebruiken de officiële Debian-repository
  op ECR Public met de bestaande digest. De scannerfixture weigert andere targets
  dan local en kan na een mislukte Docker Hub-pull uitsluitend dezelfde immutable
  ClamAV-digest uit de publieke cache halen. Geen vrij instelbare image/tag, daemon-
  configuratie, nieuwe registrycredentials of wijzigingen aan runtime/scanner-
  isolatie. De echte imagepulls en Linuxcontroles zijn lokaal opnieuw uitgevoerd;
  de scannerfixture is tevens toegevoegd aan de operationele broninventaris.

## Uitvoerbaar bewijs

- `scripts/test-product-management.mjs`: alle 18 gevraagde scenario's en aanvullende
  controle van managed rollen, live inboxaantallen en eventverwerking. Scenario 15
  controleert ook concurrerend opnieuw aankondigen naast identieke retries.
- `lib/product/model.test.ts`, `data.test.ts`, `actions.test.ts`: invoergrenzen,
  geverifieerde context en opnieuw autoriseren na reads/scannen.
- `tests/e2e/product-management.spec.ts`: echte formulieren, gescande upload/download,
  omzetting, doelgroep-preview, publicatie, vier portalen, modal/focus/viewport op
  desktop/tablet/mobiel en live intrekking van een klantbinding.
- De bestaande database-, pgTAP- en HTTP-suite controleren de overige RPC's,
  notificaties, opslag en role-/tenantgrenzen. Het volledige browserpakket controleert
  de bestaande portalen naast de nieuwe workflow. Exacte uitslagen worden in de
  opleverrapportage geregistreerd; een niet uitgevoerde controle wordt niet als
  geslaagd aangemerkt.

## Grenzen

Beschikbaarheid is handmatige communicatie, geen bewijs van een deployment.
Verversing kan maximaal 20 seconden duren in een zichtbaar venster; een nieuwe
serveraanvraag gebruikt onmiddellijk de actuele rechten. De module vereist de
bestaande werkende scanner en notificatieworker. Productie-uitrol en
productiedatabasemigraties vallen buiten deze opdracht.
