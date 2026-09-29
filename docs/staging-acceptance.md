# Stagingacceptatie Fieldgrid V1

Deze checklist wordt uitgevoerd op de bestaande staging-VPS, met een nieuw leeg
staging-Supabaseproject en afzonderlijke stagingcredentials. Geen enkele stap mag
naar het productieproject of de productie-VPS wijzen.

## Voor de eerste deploy

- GitHub Environment `staging` bevat alle waarden uit de inventaris in de README.
- De stagingrunner is online met het exclusieve label `fieldgrid-staging`.
- DNS en TLS voor de staging-URL wijzen naar de staging-VPS.
- Caddy routeert de staginghost uitsluitend naar de gekozen stagingpoort.
- `fieldgrid@staging.service` en `fieldgrid-worker@staging.timer` zijn geïnstalleerd.
- Het nieuwe staging-Supabaseproject is leeg en heeft nog geen applicatietabellen.
- Supabase Auth heeft de staging Site URL en uitsluitend toegestane staging-redirects.
- De SendGrid-afzender of het afzenderdomein is geverifieerd.
- Mollie gebruikt een `test_`-key; Google Routes is expliciet uitgeschakeld of gebruikt
  een tot staging beperkte serverkey.

## Deploybewijs

- De verplichte CI-run voor de actuele `main`-SHA is volledig groen, inclusief pgTAP,
  database-lint, build en alle verplichte Playwright-flows.
- De stagingdeploy gebruikt exact dezelfde SHA als de geslaagde CI-run.
- De migratiedoelcontrole accepteert alleen een leeg schema of de exacte
  migratiegeschiedenis van de repository.
- De premigratiebackup bestaat en `pg_restore --list` kan hem lezen.
- `/api/healthz?release=<sha>` retourneert `status=ok`,
  `environment=staging`, `database=ready` en de verwachte release-SHA.
- De worker-timer draait en een handmatige worker-call levert geen autorisatiefout op.

## Eerste platformbeheerder en tenant

- Voer de handmatige workflow **Bootstrap staging platform administrator** eenmaal uit.
- Log in als platformbeheerder, open `/platform` en maak de eerste tenant via
  **Nieuwe tenant** aan. Controleer dat platformbeheer niet stilzwijgend
  tenantlid wordt en dat de gekozen beheerder een uitnodiging ontvangt.
- Controleer dat er geen voorbeeldtenant, voorbeeldklant of hardcoded merkdata bestaat.
- Upload in de platform-backoffice het goedgekeurde tenantlogo en stel kleuren,
  modules, afzendernaam, afzendermail en de vier berichttemplates in.
- Verifieer dat `/app`, `/staff`, offerte-, boekings- en betaalpagina het
  echte tenantlogo en de ingestelde kleuren tonen. Een zichtbare `LOGO`-placeholder
  betekent dat de visuele acceptatie niet is geslaagd.
- Controleer dat een tenantlogo zonder dubbele titel/subtitel wordt getoond, dat
  alle tenantpagina's de ingestelde kleuren gebruiken en dat `Powered by Fieldgrid`
  uitsluitend zichtbaar is zolang **Volledig whitelabel** uitstaat.
- Controleer in de factuur- en offertemail dat de header alleen het logo (of zonder
  logo de tenantnaam) toont en dat de tenantwebsite onderin als HTTPS-link staat.

## Functionele acceptatie

- Open **Klanten → Bekijk** en controleer de tabbladen **Overzicht**, **Contactpersonen**,
  **Objecten**, **Notities** en **Documenten**, ook op mobiel en met het toetsenbord.
  Voeg een contact, interne notitie en een PDF/JPG/PNG-document (maximaal 10 MB) toe;
  controleer na herladen dat alles blijft staan en dat de download werkt.
  Klantdossiers gebruiken de migratie `20260929214421_customer_dossier.sql` en de private
  bucket `customer-documents`; geen handmatige bucketconfiguratie of extra secrets nodig.
  Notities/documenten zijn alleen beschikbaar voor tenantbeheer, management, planning
  en finance met de planningmodule actief. Controleer dat medewerkers en andere
  tenants geen toegang hebben. Bestaande notities/documenten zijn niet overschrijfbaar.
- Maak een aanvraag en offerte, verstuur de SendGrid-testmail en accepteer de offerte
  via de externe link.
- Boek een tijdslot en controleer capaciteit, tijdzone en eenmaligheid van de link.
- Plan en dispatch een werkbon; doorloop op mobiel gezien, onderweg, aanwezig,
  taken, meerwerk, foto, rapport en handtekening.
- Controleer rapport, corrigeer waar toegestaan en finaliseer de factuur.
- Start een Mollie-testbetaling, laat de webhook verwerken en controleer de
  idempotente betaalallocatie.
- Test Web Push op ten minste één echt mobiel apparaat en controleer een retry en
  dead-letterstatus zonder dubbele notificatie.
- Controleer tenantisolatie met twee testgebruikers met verschillende rollen.
- Vergelijk de relevante desktop- en mobiele schermen op inhoud, hiërarchie,
  spacing, kleuren, logo en toestanden met het goedgekeurde V1-prototype.

## Promotiebesluit

Leg de geaccepteerde `main`-SHA, datum, uitvoerder, afwijkingen en herstelproef vast.
Maak en vul GitHub Environment en branch `production` pas nadat alle blokkerende
punten hierboven zijn geaccepteerd. Promoveer daarna uitsluitend die geaccepteerde
SHA; de productie-workflow vereist opnieuw een geslaagde CI-run voor exact die
production-SHA.
