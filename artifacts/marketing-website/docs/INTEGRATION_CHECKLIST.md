# Integratiechecklist

Deze custom website gebruikt uitsluitend Fieldgrids publieke, hostgebonden
formulierendpoint. De site bevat geen eigen webhookadapter, databasecredential
of service-role secret. Zonder een geldig gepubliceerd formulier-ID blijft het
formulier fail-closed.

## Formulieren

- [x] Platformvalidatie met veld- en bodylimieten en onbekende velden geweigerd
- [x] Expliciete toestemming in de browser vereist
- [x] Duurzame honeypot, throttling en idempotentie in Fieldgrid
- [x] Host, tenant, site en gepubliceerd formulier worden gezamenlijk opgelost
- [x] Geen ruwe netwerkidentifiers, secrets of payloads in applicatielogs
- [x] Notificatiefouten verliezen de opgeslagen inzending niet
- [ ] Exact gepubliceerd Veele-formulier-ID op staging configureren
- [ ] Ontvanger, veldmapping en dubbele inzendingen end-to-end valideren
- [ ] DPA/verwerkersovereenkomst, grondslag, bewaartermijn en verwijderproces vastleggen
- [ ] Privacyverklaring linken bij het toestemmingsveld zodra de definitieve URL bekend is
- [ ] Monitoring configureren op statuscodes, latency en request-id, zonder PII in logs of traces
- [ ] Spambeleid evalueren na echte verkeersdata; voeg geen trackingcaptcha toe zonder privacyreview

### Platformendpoint activeren

1. Publiceer het Veele-formulier in het exacte tenant/site-dossier.
2. Zet `FIELDGRID_WEBSITE_FORM_ID` op dat UUID.
3. Controleer dat de custom publieke host bij dezelfde tenant/site hoort.
4. Test geldige invoer, validatiefouten, honeypot, replay, 429 en notificatiefout.
5. Controleer de duurzame inzending en tijdlijn in de Fieldgrid-inbox.

## Security en privacy

- [x] Baseline CSP, HSTS (productie), clickjacking-, MIME-, referrer- en permissionsheaders
- [x] API-responses zijn `no-store`
- [ ] CSP na toevoeging van analytics, embeds of externe assets zo specifiek mogelijk uitbreiden
- [ ] Externe scripts uitsluitend na toestemming laden en in een periodiek bijgehouden register opnemen
- [ ] Securityheaders op de uiteindelijke CDN/proxy verifiëren; voorkom dubbele, conflicterende headers
- [ ] Pentest/lightweight DAST uitvoeren op formulieren en foutpaden
- [ ] Incidentrespons, secretrotatie en toegang tot formulierdata documenteren

## Marketing

- [ ] Publiek contactadres bevestigen en pas daarna `NEXT_PUBLIC_CONTACT_EMAIL` invullen
- [ ] Definitieve logo-assets (SVG, light/dark, favicon, maskable icon)
- [ ] Eigen/gelicenseerde fotografie met bron- en consentregistratie
- [ ] Gevalideerde klantlogo’s, cases en reviews
- [ ] Analytics, consent mode en tag governance
- [ ] Google Business Profile en Search Console

## Portaal

- [ ] Definitieve portal-URL
- [ ] SSO/auth flow uitsluitend in de portaalapp
- [ ] CSP, `frame-ancestors`, CORS en sessiecookiebeleid van de portaalapp afzonderlijk reviewen
- [ ] Marketingdemo bevat uitsluitend fictieve data

## QA- en releasegates

- [x] `pnpm lint`, `pnpm typecheck` en `pnpm build`
- [x] Route-inventory: exact 44 unieke marketingroutes en overeenkomstige SEO-records
- [x] Playwright-smoke op desktop en mobiel
- [x] axe-scan op home, diensten, offerte, contact en portaal
- [x] Visuele regressie op home, dienstpagina, locatiepagina en formulierpagina
- [x] Lighthouse/CWV-budgetten op de homepage; herhaal voor overige representatieve pagina’s vóór productiepromotie
- [ ] DNS, redirects oude site en canonical host
- [ ] Backup/rollback, uptime/synthetics en 404/500-monitoring
- [ ] Sitemap ingediend
