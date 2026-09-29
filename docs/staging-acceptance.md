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
  database-lint, build en alle vier Playwright-flows.
- De stagingdeploy gebruikt exact dezelfde SHA als de geslaagde CI-run.
- De migratiedoelcontrole accepteert alleen nul of de exacte vijf V1-migraties.
- De premigratiebackup bestaat en `pg_restore --list` kan hem lezen.
- `/api/healthz?release=<sha>` retourneert `status=ok`,
  `environment=staging`, `database=ready` en de verwachte release-SHA.
- De worker-timer draait en een handmatige worker-call levert geen autorisatiefout op.

## Eerste platformbeheerder en tenant

- Voer de handmatige workflow **Bootstrap staging platform administrator** eenmaal uit.
- Log in als platformbeheerder en maak de eerste tenant via **Eerste tenant** aan.
- Controleer dat er geen voorbeeldtenant, voorbeeldklant of hardcoded merkdata bestaat.
- Upload in **Instellingen** het goedgekeurde tenantlogo en stel kleuren,
  afzendernaam en afzendermail in.
- Verifieer dat `/app`, `/staff`, offerte-, boekings- en betaalpagina het
  echte tenantlogo en de ingestelde kleuren tonen. Een zichtbare `LOGO`-placeholder
  betekent dat de visuele acceptatie niet is geslaagd.

## Functionele acceptatie

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
