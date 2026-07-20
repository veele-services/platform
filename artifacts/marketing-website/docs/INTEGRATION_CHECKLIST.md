# Integratiechecklist

Deze codebase verzint geen CRM-, e-mail- of analyticsleverancier. Formulieren staan daarom standaard op `FORM_DELIVERY_MODE=disabled` en geven dan eerlijk een `503` terug. Activeer aflevering pas nadat onderstaande punten aantoonbaar zijn afgerond.

## Formulieren

- [x] Gedeelde server-side Zod-validatie met lengtelimieten en onbekende velden geweigerd
- [x] Expliciete toestemming in de browser én op de server vereist
- [x] Honeypot aanwezig; botinzendingen worden niet afgeleverd
- [x] JSON- en bodylimiet, origincontrole, time-out en veilige foutstatussen
- [x] Proceslokale basis-rate-limit zonder opslag of logging van ruwe IP-adressen
- [x] Geen persoonsgegevens, payloads, secrets of afleverreacties in applicatielogs
- [ ] Eigenaar kiest en contracteert de definitieve CRM-/e-mailontvanger
- [ ] Veldmapping, ontvangers, foutafhandeling en dubbele inzendingen end-to-end valideren
- [ ] DPA/verwerkersovereenkomst, grondslag, bewaartermijn en verwijderproces vastleggen
- [ ] Privacyverklaring linken bij het toestemmingsveld zodra de definitieve URL bekend is
- [ ] Gedistribueerde rate limiting toevoegen vóór horizontaal/serverless schalen; de huidige geheugenlimiet geldt per proces
- [ ] Monitoring configureren op statuscodes, latency en request-id, zonder PII in logs of traces
- [ ] Spambeleid evalueren na echte verkeersdata; voeg geen trackingcaptcha toe zonder privacyreview

### Afleveradapter activeren

De provider-neutrale adapter verstuurt alleen naar een expliciet geconfigureerde HTTPS-URL. Redirects worden geweigerd en de aanvraag stopt na acht seconden.

1. Zet `FORM_ALLOWED_ORIGINS` op de komma-gescheiden productie- en preview-origins.
2. Zet `FORM_DELIVERY_MODE=webhook`.
3. Zet `FORM_DELIVERY_WEBHOOK_URL` op de goedgekeurde HTTPS-ontvanger.
4. Zet indien ondersteund `FORM_DELIVERY_WEBHOOK_SECRET`; dit wordt als bearer-token verzonden.
5. Controleer dat downstream request-id idempotent verwerkt, PII niet logt en alleen een 2xx-status teruggeeft na duurzame acceptatie.
6. Test geldige invoer, validatiefouten, honeypot, timeout, 429 en downstream 4xx/5xx.

`FORM_DELIVERY_MODE=stub` is uitsluitend lokale QA. In productie weigert deze modus aflevering met `503`, zodat aanvragen nooit stilzwijgend verloren gaan.

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
