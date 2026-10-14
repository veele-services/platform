# Integratiematrix en uitvoering

## 1. Eerst vaststellen

Open de bedoelde bestaande repository. Lees actuele `AGENTS.md`, branchconventies, route-/permissioncatalogus en releasegates. Noteer branch, HEAD en werkstatus; behoud later of ongecommit werk. De auditbaseline is `71df59ab0390ffeae482c7edbaf27efe3fa6546d`, niet noodzakelijk de HEAD op de uitvoeringsdag.

Verifieer `CHECKSUMS.sha256` met de meegeleverde controletool. Houd `source/` als onveranderde referentie buiten de productieruntime. De bron is geen rootdirectory die over de doelrepo moet worden gekopieerd. De auditbestanden onder `reference/repo-baseline-files/` zijn een selectie op een vaste SHA, geen volledige targetcheckout.

Vul in de targetrepo een kort integratieregister aan met: bestaand bestand/gedrag, Sites-bron, hergebruik/uitbreiding/nieuw, datacontract, permissions, tests, voortgang en eventuele afwijking. Gebruik deze startmatrix:

| Onderdeel | Sites-bron | Bestaand aansluitpunt | Werk |
| --- | --- | --- | --- |
| www-host | marketingroute/copy onder `source/marketing/` | `lib/tenancy/hostname.ts`, `proxy.ts`, runtimeguards | Nieuwe marketinghost vóór tenantresolutie; scheiding www-productuitleg versus private `/platform`. |
| Homepage/chrome | `components/homes/Signature.*`, `site-chrome.tsx`, `app/globals.css` | `app/page.tsx`, bestaande hostafhandeling | Nieuwe marketingpresentatie op www; bestaande platform-/tenantlanding behouden. |
| Detailpagina's/SEO | `lib/content.ts`, `lib/seo.ts`, `detail-pages.tsx`, `standard-pages.tsx` | App Router en bestaande CSP/metadata | 23 routes, canonicals op www, sitemap, productie-indexering en veilige staging. |
| Conversies | `conversion-pages.tsx`, `conversion-pages.module.css` | Publieke intakepatronen, eigen platform-leaddomein | Formuliergedrag behouden; echte serveractie/route, validatie, misbruikbeperking, idempotentie. |
| Platformoverzicht | `src/ExistingDashboards.tsx`, `CRMOverview.tsx`, `crm-overview.css` | `app/platform/platform-console.tsx`, platform-CSS | Nieuwe volgorde, vier kaarten zonder groepskop, acht acties. |
| Volledig CRM | `src/CRM.tsx`, `crm.css`, `crm-types.ts` | Platformshell, `requirePlatformAdmin`, echte routes | Nieuwe geautoriseerde CRM-route(s), dossiers, agenda, taken en instellingen. |
| Intake/opslag | `lib/crm-server.ts`, `db/schema.ts` | Supabase/Postgres, bestaande RPC-/migratiepatronen | Nieuwe platformbegrippen en serverprojecties; geen D1- of tenantdatamisbruik. |
| Agenda | `lib/crm-availability.ts`, CRM-dialogen | Bestaande tijd-/validatieconventies | Transactionele reservering, buffers, Amsterdamtijd, ICS en conflictstates. |
| Mail | `lib/platform-mail.ts` als gedragsreferentie | `lib/providers/sendgrid.ts`, notifications, providerpolicy, mailtransport | CRM-adapter in bestaande keten, platformcontext, primaire beheeridentiteit. |
| Management | `Management.tsx`, `FinanceSLA.tsx`, `Governance.tsx` | Bestaande bronnen/werkbonnen/tickets/facturen/documenten | Behoud presentatie en bestaande domeineisen; vervang demoacties door echte bronmutaties. |
| Portalen/thema | `Portals.tsx`, `ui.tsx`, `src/components/fieldgrid/`, palet-/portal-CSS | Bestaande portalbinding en tenantthema | Brongetrouwe presentatie zonder verlies van bestaande dossiers/rollen. |

Bestandsnamen in de doelrepo mogen logisch worden uitgebreid. Een splitsing in nieuwe componenten is toegestaan; verlies van goedgekeurde vormgeving of interactie is dat niet.

## 2. Bouwvolgorde

1. **Host- en contractbasis.** Leg de www-routegrens, CRM-platformscope, intakecontract, beheeridentiteit en datamigratie vast. Maak gerichte tests voor hostclassificatie en afgeschermde routes voordat de nieuwe marketinghost publiek iets kan tonen.
2. **Presentatieovername.** Integreer gedeelde kleuren/fonts/assets, Signature Grid en de laatste platformindeling. Houd bestaande functionaliteit en routes bereikbaar. Er blijft één marketingdesign.
3. **CRM-domein.** Bouw reads, writes, snapshots, historie, taken, idempotentie en agenda met serverautorisatie/transacties. Verbind iedere zichtbare actie met de juiste werkelijke command.
4. **Websiteketen.** Sluit alle drie aanvraagtaken aan: trial, telefonische kennismaking en telefonische demo. Bewaar invoer bij fouten en geef serverbevestigde successen. Test terugkeer via directe links.
5. **Centrale mail.** Voeg bronadapter/template/ontvangerresolutie toe aan de bestaande notificatieketen. Test platformcontext zonder kunstmatige tenant, policyblokkades en provideronzekerheid. Gebruik geen echte derde ontvanger voor tests.
6. **Management-/portaalbehoud.** Integreer de goedgekeurde bestaande uitbreiding waar nog nodig; controleer dezelfde metrieken, bronrechten en operationele diepte. De historische verdieping staat in `reference/historisch-v2/`.
7. **Visuele en functionele acceptatie.** Vergelijk de uiteindelijke Next-app met de twee Sites-bronnen, met dezelfde fictieve teststate. Los concrete afwijkingen op. Controleer de route-/actiematrix en servergrenzen.
8. **Releasevoorbereiding en oplevering.** Bestaande repo-gates, migratie-upgrade/replay en geautoriseerde stagingprocedure. Leg exacte commit en bewijs vast. Het definitieve websiteadres is www; dit is geen opdracht om alle root-/tenantverkeer om te leiden.

## 3. Wat niet overnemen

| Referentieonderdeel | Waarom / vervanging |
| --- | --- |
| `.openai/hosting.json` | Uit export uitgesloten. Sites-projectidentiteit is geen doel voor Fieldgrid-release. |
| `build/sites-*`, `scripts/sites-*`, connectorhulpcode, Vinext-config | Sites-infrastructuur; behoud Next/repo-build en bestaande worker. |
| `app/chatgpt-auth.ts`, native ownerheader-fallback | Private Sitesgrens; vervang met actuele Supabase/Auth-/platformrechten. |
| `FIELDGRID_CRM_SERVICE_TOKEN`, Sites-origin in proxy | Alleen prototypevervoer; gebruik het passende servercontract, geen browserbeheercredential. |
| D1 `drizzle/*`, SQLite `db/*` | Functionele referentie; vertaal naar Postgres en bestaande migratiegeschiedenis. |
| Demo seeds, rolwisselaar, reset, localStorage-bedrijfsdata | Demonstratie; echte serverdata en rechten gebruiken. |
| Hashrouter | Vervang door echte Next-routes en queryparameters. Bewaar deep-linkintentie. |
| Prototype-noindex en privacycopy | Preview blijft privé/noindex; productie-www krijgt juiste indexering en feitelijke privacy-informatie. |
| Sites-package.json/lockfile | Niet over target root kopiëren; alleen noodzakelijke compatibele dependencies gericht toevoegen. |

Alle overige referentiecode is evenmin een opdracht om blind te kopiëren. Behoud de presentatie; integreer bewust in bestaande componenten/domeinen.

## 4. Referentie lokaal bekijken

De live Sites zijn de eerste visuele referentie en kunnen toegang vereisen. Lever geen beheertoken in de bron of publieke URL mee. De volledige bron en assets in dit pakket maken onafhankelijke vergelijking mogelijk.

De twee snapshots gebruiken de Sites-Vinext-runtime. De Sites-hostingidentiteit is bewust uitgesloten; een lokale referentieomgeving kan daarom een aparte lokale adapter/configuratie nodig hebben. Kopieer die infrastructuur niet in de doelapp en maak geen nieuw Site om de productietaak uit te voeren. Laat Codex de referentie in een geïsoleerde werkmap lokaal draaien of met de bestaande testtools renderen, met lokaal gemockte CRM-data. De SQLite-testadapter in `tests/crm-cloudflare-loader.mjs` toont hoe de backendtest zonder Cloudflare draait. Browservergelijking blijft nodig voor visuele acceptatie; SSR-render alleen is geen beeldbewijs.

## 5. Releasegrens

Het pakket verandert geen GitHubbranch, stagingdatabase, live host of DNS. De uitvoerende sessie gebruikt de bestaande goedgekeurde releaseprocedure. Verifieer het bedoelde target, nieuwste gates en feitelijke runtimeconfiguratie. Geen remote database-reset, wijziging van historische migraties of uitschakeling van auth/CSP/policy om een deploy te laten slagen.

Bij www-oplevering controleer je hostrouting, certificaat, DNS, canonical, redirects en bereikbaarheid als afzonderlijke feiten. Een Caddyvoorbeeld of branch-SHA bewijst niet de huidige live toestand. Behoud bestaande platformroot `fieldgrid.nl`, tenantdomeinen, webhooks en login. Documenteer wat technisch voorbereid, op staging bewezen en werkelijk op www gepubliceerd is.
