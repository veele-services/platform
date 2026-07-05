# Fieldgrid klantportaal en personeelsapp fase 0 baseline

Datum: 2026-07-05
Status: uitgevoerd
Scope: `artifacts/klant-pwa`, `artifacts/personeel-pwa`
Roadmap: `docs/fieldgrid-customer-personnel-portal-roadmap.md`

## 1. Doel

Fase 0 legt een reproduceerbare nulmeting vast voor het klantportaal en de personeelsapp. Deze fase wijzigt geen businesslogica. De output bestaat uit:

- route-inventaris per app;
- route, doelgroep, auth-status, moduleflag en verwachte navigatie-ingang;
- typecheckresultaten;
- lokale browserbaseline met screenshots op mobile, tablet en desktop;
- redirect- en foutbevindingen die naar fase 1 en later moeten.

## 2. Uitgevoerde checks

### 2.1 Runtime

Gebruikt voor checks:

- Node: `v24.14.0` via Codex bundled runtime.
- pnpm: `11.7.0` via Codex bundled runtime.
- Next devservers:
  - klantportaal: `http://127.0.0.1:4301/klant`
  - personeelsapp: `http://127.0.0.1:4302/personeel`

Lokale systeem-Node stond op `v22.18.0`; die is niet gebruikt voor de finale typechecks omdat de repo `>=24.0.0 <25` verwacht.

### 2.2 Typechecks

| App | Command | Resultaat |
| --- | --- | --- |
| Klantportaal | `pnpm --filter @workspace/klant-pwa run typecheck` | Geslaagd |
| Personeelsapp | `pnpm --filter @workspace/personeel-pwa run typecheck` | Geslaagd |

### 2.3 Browserbaseline

Artifacts:

- `outputs/customer-personnel-phase0-qa/browser-baseline.json`
- `outputs/customer-personnel-phase0-qa/route-redirect-check.json`
- `outputs/customer-personnel-phase0-qa/screenshots/*.png`

Viewports:

| Viewport | Afmeting |
| --- | --- |
| Mobile | `390x844` |
| Tablet | `768x1024` |
| Desktop | `1440x900` |

Screenshots gemaakt:

- klant login;
- klant wachtwoord vergeten;
- klant reset-wachtwoord direct zonder herstelcontext;
- klant private home zonder sessie;
- personeel login;
- personeel wachtwoord vergeten;
- personeel reset-wachtwoord direct zonder herstelcontext;
- personeel private home zonder sessie.

Resultaat:

- 24 screenshots gemaakt.
- Geen horizontale overflow gemeten op de publieke auth-schermen en redirect/error-baseline.
- Ingelogde dashboards en detailpagina's zijn in deze lokale baseline niet visueel gevalideerd, omdat er geen lokale `DATABASE_URL`, Supabase sessie en seeded tenantcontext beschikbaar waren.

## 3. Klantportaal route-matrix

Base path: `/klant`
Doelgroep: klantgebruikers van een tenant.

| Route | Type | Auth-status | Moduleflag | Verwachte navigatie |
| --- | --- | --- | --- | --- |
| `/klant/healthz` | Health route | Publiek | Geen | Healthcheck |
| `/klant/login` | Auth pagina | Publiek | Geen | Direct, middleware redirect |
| `/klant/wachtwoord-vergeten` | Auth pagina | Publiek | Geen | Login link |
| `/klant/reset-wachtwoord` | Auth/reset pagina | Reset-sessie of ingelogd vereist | Geen | Supabase recovery flow |
| `/klant/auth/confirm` | Auth callback | Publiek | Geen | Supabase mail link |
| `/klant` | Dashboard | Klantauth + tenantcontext vereist | Geen | Desktop Dashboard, mobile Home |
| `/klant/objecten` | Lijst | Klantauth vereist | Geen | Desktop Mijn objecten, mobile Objecten |
| `/klant/objecten/nieuw` | Create flow | Klantauth vereist | Geen | Objecten, aanvraagflow |
| `/klant/objecten/[id]` | Detail | Klantauth + objecttoegang vereist | Geen | Objectenlijst, dashboard |
| `/klant/opdrachten` | Lijst | Klantauth vereist | Geen | Desktop Afspraken, dashboard |
| `/klant/opdrachten/aanvragen` | Create flow | Klantauth vereist | Geen | Desktop Aanvragen, mobile Aanvragen |
| `/klant/opdrachten/[id]` | Detail | Klantauth + opdrachttoegang vereist | Geen | Opdrachtenlijst, dashboard |
| `/klant/facturen` | Finance lijst | Klantauth vereist | `finance` in desktopnav | Desktop Facturen, mobile Meer |
| `/klant/facturen/[id]` | Finance detail | Klantauth + factuurtoegang vereist | `finance` verwacht | Facturenlijst, betalingen |
| `/klant/betalingen` | Finance lijst | Klantauth vereist | `finance` in desktopnav | Desktop Betalingen, mobile Meer |
| `/klant/betalingen/succes` | Betaalresultaat | Klantauth vereist | `finance` verwacht | Payment provider redirect |
| `/klant/betalingen/mislukt` | Betaalresultaat | Klantauth vereist | `finance` verwacht | Payment provider redirect |
| `/klant/offertes` | Finance/offertes | Klantauth vereist | `finance` verwacht, niet in desktopnav | Dashboard, opdrachtdetail |
| `/klant/rapporten` | Rapportages | Klantauth vereist | `reporting` in desktopnav | Desktop Rapportages, mobile Meer |
| `/klant/documenten` | Documenten | Klantauth vereist | `documents` in desktopnav | Desktop Documenten, mobile Meer |
| `/klant/meldingen` | Notificaties | Klantauth vereist | Geen expliciete flag gevonden | Desktop Meldingen, mobile Meldingen |
| `/klant/meldingen/tickets` | Support inbox | Klantauth vereist | Geen expliciete flag gevonden | Meldingen, dashboard |
| `/klant/meldingen/tickets/[id]` | Support detail | Klantauth + tickettoegang vereist | Geen expliciete flag gevonden | Ticketlijst, notificaties |
| `/klant/profiel` | Profiel | Klantauth vereist | Geen | Mobile header, Meer |
| `/klant/beveiliging` | Security | Klantauth vereist | Geen | Mobile header, Meer |
| `/klant/instellingen` | Instellingen | Klantauth vereist | Geen | Desktop footer, mobile Meer |
| `/klant/meer` | Meer/help | Klantauth vereist | Geen | Desktop Hulp & contact, mobile Meer |
| `/klant/api/factuur/[id]/pdf` | API/download | Klantauth + factuurtoegang verwacht | `finance` verwacht | Facturen |
| `/klant/api/verzamelfactuur/[id]/pdf` | API/download | Klantauth + batchtoegang verwacht | `finance` verwacht | Betalingen |

## 4. Personeelsapp route-matrix

Base path: `/personeel`
Doelgroep: personeelsleden van een tenant.

| Route | Type | Auth-status | Moduleflag | Verwachte navigatie |
| --- | --- | --- | --- | --- |
| `/personeel/healthz` | Health route | Publiek | Geen | Healthcheck |
| `/personeel/login` | Auth pagina | Publiek | Geen | Direct, middleware redirect |
| `/personeel/wachtwoord-vergeten` | Auth pagina | Publiek | Geen | Login link |
| `/personeel/reset-wachtwoord` | Auth/reset pagina | Reset-sessie of ingelogd vereist | Geen | Supabase recovery flow |
| `/personeel/auth/confirm` | Auth callback | Publiek | Geen | Supabase mail link |
| `/personeel` | Dashboard | Personeelauth + tenantcontext vereist | Geen | Desktop Home, mobile Home |
| `/personeel/opdrachten` | Planning/lijst | Personeelauth vereist | Geen | Desktop Opdrachten, mobile Planning |
| `/personeel/opdrachten/[id]` | Werkbon detail | Personeelauth + opdrachtkoppeling vereist | Geen | Planning, dashboard |
| `/personeel/opdrachten/[id]/afronden` | Werkbon closeout | Personeelauth + opdrachtkoppeling vereist | Geen | Werkbon detail |
| `/personeel/opdrachten/[id]/materiaal` | Werkbon materiaal | Personeelauth + opdrachtkoppeling vereist | `materials` via actions | Werkbon detail |
| `/personeel/opdrachten/[id]/inventaris` | Werkbon inventaris | Personeelauth + opdrachtkoppeling vereist | `inventory` via actions | Werkbon detail |
| `/personeel/opdrachten/[id]/meerwerk` | Werkbon meerwerk | Personeelauth + opdrachtkoppeling vereist | Geen expliciete app-scan flag gevonden | Werkbon detail |
| `/personeel/openstaand` | Open diensten | Personeelauth vereist | Geen | Desktop Openstaand, mobile Planning |
| `/personeel/uren` | Uren | Personeelauth vereist | Geen | Desktop Uren, mobile Uren |
| `/personeel/beschikbaarheid` | Beschikbaarheid | Personeelauth vereist | Geen | Desktop Beschikbaar, mobile Meer |
| `/personeel/verlof` | Verlof | Personeelauth vereist | Geen | Desktop Verlof, mobile Meer |
| `/personeel/berichten` | Ticket inbox | Personeelauth vereist | Geen expliciete sidebar flag | Mobile header/Meer |
| `/personeel/berichten/[id]` | Ticket detail | Personeelauth + tickettoegang vereist | Geen expliciete sidebar flag | Berichten, werkbon |
| `/personeel/meldingen` | Notificaties | Personeelauth vereist | `notifications` wordt in layout opgehaald | Mobile header/Meer |
| `/personeel/instellingen` | Instellingen | Personeelauth vereist | Geen | Mobile Meer |
| `/personeel/instellingen/meldingen` | Notificatie-instellingen | Personeelauth vereist | `notifications` verwacht | Instellingen |
| `/personeel/beveiliging` | Security | Personeelauth vereist | Geen | Mobile Meer |
| `/personeel/documenten` | Documenten | Personeelauth vereist | `documents` in desktopnav | Desktop Documenten, mobile Meer |
| `/personeel/profiel` | Profiel | Personeelauth vereist | Geen | Desktop Mijn profiel, mobile Meer |
| `/personeel/nieuws` | Nieuws | Personeelauth vereist | Geen expliciete app-scan flag gevonden | Mobile Nieuws, dashboard |
| `/personeel/nieuws/[slug]` | Nieuws detail | Personeelauth vereist | Geen expliciete app-scan flag gevonden | Nieuws |
| `/personeel/meer` | Meer | Personeelauth vereist | Geen | Mobile Meer |
| `/personeel/scan/inventory` | Scan entry | Personeelauth + inventory toegang verwacht | `inventory` via actions | QR/deeplink |
| `/personeel/scan/inventory/[token]` | Scan detail | Personeelauth + token/inventory toegang verwacht | `inventory` via actions | QR/deeplink |
| `/personeel/i/[token]` | Deep link alias | Redirect naar scan detail | `inventory` verwacht | QR/deeplink |
| `/personeel/debug/native` | Debug route | Personeelauth vereist | Verborgen/debug | Interne troubleshooting |

## 5. Redirectbaseline zonder sessie

Bestand: `outputs/customer-personnel-phase0-qa/route-redirect-check.json`

Samenvatting:

- 58 routes gecontroleerd.
- Publieke `healthz`, `login` en `wachtwoord-vergeten` routes geven `200`.
- `auth/confirm` zonder token redirect naar login met foutmelding.
- `reset-wachtwoord` zonder resetcontext redirect naar login. Dat is verwacht zolang er geen Supabase recovery sessie is.
- Vrijwel alle private subroutes redirecten zonder sessie naar login.
- Twee lokale no-env rootroutes geven `500`:
  - `/klant`
  - `/personeel`

### Bevinding F0-01: basePath root zonder env geeft 500

Lokale dev zonder `DATABASE_URL` en zonder Supabase sessie:

- `GET /klant` compileert de app page en faalt op `DATABASE_URL must be set`.
- `GET /personeel` compileert de app page en faalt op `DATABASE_URL must be set`.
- Subroutes zoals `/klant/objecten` en `/personeel/opdrachten` redirecten wel naar login.

Impact:

- Dit is vooral zichtbaar in lokale no-env QA.
- In staging/production horen `DATABASE_URL` en Supabase env aanwezig te zijn.
- Toch is het ongewenst dat de rootroute lokaal niet dezelfde auth-redirectbaseline volgt als subroutes.

Aanbevolen vervolg:

- Fase 1 of fase 3: onderzoek basePath-root middlewaregedrag en zorg dat `/klant` en `/personeel` zonder sessie altijd naar login redirecten voordat server components database imports raken.

## 6. UI baseline screenshots

Screenshotmap: `outputs/customer-personnel-phase0-qa/screenshots`

Gemaakte bestanden:

- `klant-login-mobile.png`
- `klant-login-tablet.png`
- `klant-login-desktop.png`
- `klant-forgot-password-mobile.png`
- `klant-forgot-password-tablet.png`
- `klant-forgot-password-desktop.png`
- `klant-reset-password-mobile.png`
- `klant-reset-password-tablet.png`
- `klant-reset-password-desktop.png`
- `klant-private-home-redirect-mobile.png`
- `klant-private-home-redirect-tablet.png`
- `klant-private-home-redirect-desktop.png`
- `personeel-login-mobile.png`
- `personeel-login-tablet.png`
- `personeel-login-desktop.png`
- `personeel-forgot-password-mobile.png`
- `personeel-forgot-password-tablet.png`
- `personeel-forgot-password-desktop.png`
- `personeel-reset-password-mobile.png`
- `personeel-reset-password-tablet.png`
- `personeel-reset-password-desktop.png`
- `personeel-private-home-redirect-mobile.png`
- `personeel-private-home-redirect-tablet.png`
- `personeel-private-home-redirect-desktop.png`

Observaties:

- Geen horizontale overflow gemeten op deze 24 screenshots.
- Development-only `DevNav` en snel-inloggen accounts zijn zichtbaar omdat de devserver in development mode draaide. Dit is acceptabel voor lokale baseline, maar moet bij productiebuild afwezig blijven.
- De private root screenshots tonen de lokale no-env errorcontext uit F0-01.
- Auth-schermen zijn visueel bruikbaar op mobile, tablet en desktop.

## 7. Placeholder, mockdata en raw dialog baseline

### 7.1 Geen brede mockdata gevonden

Er is geen brede productie-mockdata of lorem/demo-content gevonden in de gescande appcode. De zichtbare dev accounts zitten in development-only login UI.

### 7.2 Echte placeholder of onafgemaakte functie

| Bevinding | Bestand | Vervolg |
| --- | --- | --- |
| MFA toont "2FA activeren is nog niet beschikbaar" | `artifacts/personeel-pwa/src/app/(app)/beveiliging/MfaSettings.tsx` | Fase 3 |

### 7.3 Raw browser dialogs

| Bevinding | Bestand | Vervolg |
| --- | --- | --- |
| `confirm()` voor interesse tonen | `artifacts/personeel-pwa/src/app/(app)/openstaand/ApplyButton.tsx` | Fase 2 |
| `confirm()` voor niet beschikbaar | `artifacts/personeel-pwa/src/app/(app)/openstaand/ApplyButton.tsx` | Fase 2 |
| `window.confirm()` voor werkzaamheden starten | `artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/WorkOrderStatusProgress.tsx` | Fase 2 |
| `window.alert()` bij betaalactie fout | `artifacts/klant-pwa/src/components/PaymentActionButton.tsx` | Fase 2 |

## 8. Navigatiebaseline

### 8.1 Klantportaal

Desktopnav:

- Dashboard
- Mijn objecten
- Aanvragen
- Rapportages, achter `reporting`
- Facturen, achter `finance`
- Betalingen, achter `finance`
- Afspraken
- Meldingen
- Documenten, achter `documents`
- Hulp & contact
- Instellingen

Mobiele bottom nav:

- Home
- Objecten
- Aanvragen
- Meldingen
- Meer

Baseline-opmerking:

- `Offertes`, `Facturen`, `Betalingen`, `Rapportages` en `Documenten` zitten mobiel onder `Meer`.
- `Afspraken` in desktopnav correspondeert functioneel met `Opdrachten`; terminologie moet in latere fases worden gelijkgetrokken.

### 8.2 Personeelsapp

Desktopnav:

- Home
- Opdrachten
- Openstaand
- Uren
- Beschikbaar
- Verlof
- Documenten, achter `documents`
- Mijn profiel

Mobiele bottom nav:

- Home
- Nieuws
- Planning
- Uren
- Meer

Baseline-opmerking:

- `Berichten`, `Meldingen`, `Nieuws`, `Instellingen` en `Beveiliging` zijn op desktop niet als primaire sidebar-items zichtbaar.
- Dat is een fase 11 taak.

## 9. Open vervolgpunten

Deze punten zijn bewust niet opgelost in fase 0 en moeten in latere fases worden opgepakt:

- CP-01: centrale routehelpers en notificatiehref normalisatie per doelgroep.
- CP-02: raw dialogs vervangen door app-dialogs, sheets of toasts.
- CP-03: MFA implementeren of featureflaggen.
- CP-04 tot CP-10: klantportaal informatiearchitectuur, dashboard en kernflows professionaliseren.
- CP-11 tot CP-14: personeelsapp desktop/tablet, werkbon workbench, berichten en offline coverage.
- CP-16: volledige ingelogde Playwright QA op staging of lokale seeded database.

## 10. Definition of Done fase 0

| Eis | Status |
| --- | --- |
| Klant routes geinventariseerd | Klaar |
| Personeel routes geinventariseerd | Klaar |
| Route/auth/module/navigatie-matrix vastgelegd | Klaar |
| Typecheck klantportaal groen | Klaar |
| Typecheck personeelsapp groen | Klaar |
| Mobile/tablet/desktop screenshots gemaakt | Klaar voor publieke auth en no-session baseline |
| 404/redirect/error baseline vastgelegd | Klaar |
| Beperkingen voor ingelogde QA expliciet gemaakt | Klaar |
