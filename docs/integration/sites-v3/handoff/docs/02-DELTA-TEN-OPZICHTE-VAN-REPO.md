# Repo-baselineaudit voor de Fieldgrid Sites-overdracht

Gecontroleerd op 14 oktober 2026 via de GitHub-connector; uitsluitend lezen. Repository: [veele-services/platform](https://github.com/veele-services/platform). Defaultbranch: `main`. De actuele branch is expliciet opgelost met `fetch_commit(main)`: **`71df59ab0390ffeae482c7edbaf27efe3fa6546d`**, commitdatum **2026-10-14T00:54:57Z**, “test: accept both closed article views after staff refresh”. Dit is een branchresolutie, geen zoekindexaanname.

De volledige git-tree bevat 1.754 entries en is niet afgekapt. De audit omvat 37 volledige bronbestanden op deze vaste SHA. Dit is een integratieaudit van broncode; geen audit van live productieconfiguratie, productiegegevens, DNS/TLS of beschikbare secrets. Het feit dat een integratie in de repo bestaat, bewijst niet dat de losse Sites-runtime erop is aangesloten.

## Wat bestaat en wat Codex moet toevoegen

| Onderdeel | Bestaand in de repo | Toe te voegen of aan te passen vanuit Sites |
|---|---|---|
| Runtime | `package.json`: Next.js 16.3.8, React 19.2.6, TypeScript 5.9.3, Tailwind 4.2.1, Supabase SSR 0.12.7 / JS 2.117.2, Node ≥24, pnpm 11.25.0. Next standalone output. | Port de Sites-componenten naar de bestaande Next App Router. Geen Vinext/Vite/Cloudflare-D1-runtime of tweede package/lockfile over de productieapp heen kopiëren. De UI/UX uit Sites blijft leidend; runtimecompatibiliteit rechtvaardigt geen visuele redesign. |
| Platformschil | `app/platform/layout.tsx`, `platform-shell.tsx`, `platform-console.tsx`, `platform.css`, `platform-consistency.css`. Bestaande tenantlijst, onboarding, huisstijl, templates, aandacht/support, supportteam, productbeheer en kennisbank. | Voeg CRM-navigatie/routes, CRM-schermen en overzichtskaarten toe. Pas de huidige overzichtsvolgorde aan volgens de definitieve Sites-bron: metrics → vier CRM-kaarten zonder groepskop/filterbalk → Aandacht/Support → Tenantoverzicht/Platformacties. Behoud de bestaande werkende tenantacties achter hun UI. |
| Huidige overzichtsvolgorde | `app/platform/platform-console.tsx` rendert nu metrics → Tenantoverzicht/Platformacties → Aandacht/Support → scheidingsregel. De drie bestaande acties zijn tenant onboarden, huisstijl en templates. | Dit is een concrete afwijking van de gewenste Sites-UI. Voeg CRM-snelacties toe naast de bestaande acties; gebruik echte Next-links en queryparameters, geen Sites-hashrouter in productie. |
| Marketing | `app/page.tsx` toont op de platformhost een eenvoudige loginlanding; op een tenant een tenantlanding. De aparte Veele Services-site draait via `lib/marketing/veele/*`, `websites/veele-services/*` en `proxy.ts`. | De Fieldgrid Signature marketingwebsite en sector-/feature-/conversiepagina's zijn nieuw ten opzichte van deze repo. Publiceer de gewenste marketingwebsite op `https://www.fieldgrid.nl`. Veele Services is een bestaande tenantsite en moet intact blijven. |
| Publieke intake | `app/aanvraag/actions.ts` bedient tenantwerkvragen via `commercial_public_intake`. `app/api/veele-website/requests/route.ts` bedient uitsluitend de tenant Veele Services via `commercial_website_intake`, met host/origincontrole, begrensde invoer en idempotentie. | Nieuwe platform-leadintake voor Fieldgrid trial/demo/afspraak. Geen omleiding naar een willekeurige tenantaanvraag. Hergebruik validatie-/idempotentie-/misbruikbeperkingspatronen, maar geef de nieuwe SaaS-leadstroom een eigen platformscope en contract. |
| CRM-domein | Geen `app/platform/crm`, `app/api/crm` of CRM-/pipelinebestanden in de volledige tree. Codezoekopdrachten “crm” en “pipeline” leverden bestaande klantdossier-/documentatie-/workerreferenties, geen Fieldgrid SaaS-leadpipeline. | Leads, intake-snapshots, fasen, activiteiten, taken, demoafspraken, platformbeschikbaarheid, reserveringen en dashboardaggregaten implementeren op Postgres. De Sites-implementatie is de functionele referentie, geen bestaande repo-feature. |
| Auth en scope | `lib/auth/context.ts` haalt een actuele Supabase-user op en bepaalt `isPlatformAdmin` uit `platform_admins`. `lib/platform/data.ts::requirePlatformAdmin` bestaat. Platformlayout laat ook specifiek bevoegde supportaccounts toe. | CRM-reads en -writes expliciet beschermen; toegang tot de platformschil alleen is geen CRM-recht. Tenantgebruikers, klanten, personeel en support-only accounts mogen niet ongemerkt de SaaS-pipeline zien. Browserrollen/ChatGPT-headers en ownerfallback uit Sites zijn geen productieautorisatie. |
| Platformbeheerder | `platform_admins` bevat `user_id`, `created_at`, `created_by`; de bootstrap registreert de Auth-user die bij `FIELDGRID_ADMIN_EMAIL` hoort. De runbook noemt dit de eerste OTP-platformbeheerder. | Koppel het CRM aan de reeds geregistreerde beheerder en lees het actuele e-mailadres uit Auth. Geen extra vrij invoerbaar CRM-mailadres. “Eerste gebruiker” betekent de bedoelde geregistreerde platformbeheerder, niet de eerste willekeurige Auth-user of het laatst ingelogde supportaccount. Bij meerdere beheerders de primaire ontvanger deterministisch vastleggen/afleiden; geen email gokken. |
| E-mail | `lib/env/server.ts` heeft globale SendGrid-instellingen. `lib/providers/sendgrid.ts` gebruikt `withNotificationProviderPermit` en `withMailTransport`. `lib/notifications/worker.ts` en `app/api/worker/route.ts` verzorgen verwerking. | Voeg CRM-bron-/ontvangeradapter, catalogustypen, template/context en brontransactie aan deze bestaande keten toe. Geen tweede directe SendGrid-client uit het prototype meenemen; geen tweede mailsecret of CRM-afzenderinstelling. Bewaar afleverhistorie en idempotente delivery keys. |
| Database | Supabase/Postgres met bestaande migratieketen onder `supabase/migrations`. `customers`, `requests` en `appointment_slots` zijn oorspronkelijk tenantgebonden; platformbeheer is afzonderlijk. | Nieuwe aanvullende migratie(s), beperkte RPC/projecties en passende RLS. D1-tabellen/SQL niet ongewijzigd uitvoeren. Platform-salesleads mogen niet kunstmatig aan tenantgegevens worden gekoppeld. Bestaande migraties, historie en tenantisolatie behouden. |

## Vereiste aansluiting voor www.fieldgrid.nl

De bestaande productiecontracten zijn concreet:

- `lib/env/production-runtime.ts` vereist **`APP_URL=https://fieldgrid.nl`** en poort 3302.
- `lib/tenancy/hostname.ts` classificeert de exacte APP_URL-host als platform en ieder geldig subdomein als tenant. **`www.fieldgrid.nl` wordt nu dus tenant `www`.**
- `proxy.ts` zoekt daarna een actieve tenant voor die slug en weigert onbekende tenants. De gewenste marketinghost kan momenteel daarom in de tenantcontrole stranden.
- `deploy/Caddyfile.production.example` stuurt `fieldgrid.nl, *.fieldgrid.nl` naar dezelfde app op `127.0.0.1:3302`. Dit is een repositoryvoorbeeld, geen bewijs dat de live DNS/TLS-configuratie al correct is.

**Aanbevolen integratie:** reserveer `www.fieldgrid.nl` expliciet als publieke marketinghost vóór tenantresolutie, met een afzonderlijke marketingroute-/hostclassificatie en een beperkte lijst publieke endpoints. Laat `APP_URL`, platformlogin, platform-API's, webhooks en tenant-URL-generatie op hun bestaande oorsprong staan. Maak geen tenant `www` aan. Een wijziging van APP_URL naar www zou onder meer tenantlinks en runtimeguard-contracten veranderen en is hiervoor niet nodig.

Render de Signature-pagina's op www met echte, indexeerbare paden, unieke metadata, canonicals op www, sitemap/robots en de bestaande CSP-benadering. Laat publieke formulieren op die host een begrensde serverroute gebruiken; deze schrijft server-side naar de platform-CRM-scope. Private CRM-API's blijven geauthenticeerd en leveren geen volledige pipeline via de marketinghost. Maak de knop Inloggen een expliciete link naar de bestaande platformlogin op `https://fieldgrid.nl/login`.

Behoud `staging.fieldgrid.nl` / `*.staging.fieldgrid.nl`, poort 3301, bestaande tenantresolutie en promotieketen. Test de nieuwe hostclassificatie in de lokale/integratietests met concrete Host-headers; kies een expliciet geconfigureerde stagingmarketinghost wanneer de stagingacceptatie wordt ingericht. Pas runbook/Caddyvoorbeelden uitsluitend gericht aan; DNS-, TLS- en productiehostingacties zijn geen onderdeel van deze overdracht.

## E-mailcontract dat niet verloren mag gaan

`SENDGRID_API_BASE` is een origin zoals `https://api.sendgrid.com/` of `https://api.eu.sendgrid.com/`; de provider bouwt `new URL("v3/mail/send", base)`. De huidige centrale code kent policyblokkades, rusttijden, blijvende verzendclaims, transportpogingen en onzekere uitkomsten. HTTP 202 is provideracceptatie, niet bewijs van bezorging of lezen. Een onzekere poging mag niet blind opnieuw verstuurd worden.

CRM is een nieuwe bronadapter. Controleer bij implementatie ook het platformcontextcontract: `NotificationProviderPolicy` ondersteunt een nullable tenant-ID, maar de actuele `lib/notifications/worker.ts` delivery-validatie gebruikt `tenantId: z.uuid()`. Valideer met een gerichte test hoe nieuwe platformbrede CRM-gebeurtenissen zonder tenant door de bestaande catalogus/projectie/worker gaan. Voeg hiervoor geen fictieve tenant toe en omzeil geen policygate.

De audit heeft geen echte sleutelwaarden, mailboxinhoud of productie-Authgebruikers opgehaald. De exacte primaire beheerder moet in de bestaande omgeving worden opgelost, niet uit een prototypevoorbeeldadres.

## Minimale integratieacceptatie

1. Pixel-/componentvergelijking met de definitieve Sites-UI op desktop en mobiel; de verwijderde “Relaties & groei”-kop/filterbalk komt niet terug.
2. Publieke demo/afspraak/trial levert één persistente platformlead + intake + passende opvolging; refresh/retry geeft geen duplicaten.
3. Gelijktijdig boeken kan hetzelfde slot niet dubbel reserveren; verplaatsen/annuleren herstelt beschikbaarheid correct; Amsterdam-tijd en zomertijd zijn expliciet getest.
4. Menu, kaartlinks, CRM-acties en dossierlinks werken na directe navigatie en refresh.
5. Gewone tenantgebruiker, support-only account en anonieme bezoeker krijgen geen CRM-gegevens of schrijfrecht; ingetrokken beheerder wordt opnieuw gecontroleerd.
6. Nieuwe aanvraag bereikt de bestaande centrale notificatieketen met het bestaande beheeraccount; blokkade, ontbrekende providerconfiguratie, retry en onzekere provideruitkomst zijn zichtbaar en correct.
7. Hostmatrix test www, platformroot, geldige tenant, onbekende tenant en Veele Services; www wordt nooit als tenant verwerkt. Bestaande login-/webhook-/support-/tenantflows blijven werken.
8. Repo-gates blijven gelden: `pnpm check`, gerichte RPC/RLS-/migratietests en relevante Playwrightflows. Deze audit heeft die repo-tests niet uitgevoerd.

## Bronverantwoording

Alle precieze bronverwijzingen, bestandblob-SHA's en controle-URLs staan in `reference/repo-audit-refs.json`. De volledige gecontroleerde bestanden staan in `reference/repo-baseline-files/` (37 bestanden). Gebruik dit als controlebasis; lees bij implementatie opnieuw de actuele branch en relevante `AGENTS.md`/runtime-documentatie.


## Verschil sinds het vorige overdrachtspakket

De oude repo-baseline `9630c8f74a02cef98a12d213ec2ed87f8365afd4` ligt twee commits achter de nu gecontroleerde main. GitHub compare toont wijzigingen in CHANGELOG, publieke-websitedocumentatie, release-/securitydocumenten, packageversie en een kennisbank-e2e-test. Geen functionele domeincode werd in deze twee commits gewijzigd. De bestaande managementaansluitpunten uit het vorige pakket blijven daarom relevante achtergrond; toets hun implementatie bij uitvoering opnieuw. Het exacte compare-resultaat staat in `reference/repo-compare-sinds-v2.json`.

De nieuwere Sites-platformbron voegt CRM, de websitekoppeling, serveropslag en de definitieve overzichtsvolgorde toe. Signature Grid is als afzonderlijke actuele bron volledig toegevoegd. De patches in `deltas/` vergelijken uitsluitend versies van de Sites-bron, niet van de doelrepository.
