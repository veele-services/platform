# 06 — Implementatierunbook

## 1. Branch- en baseregel

De pakketbasis `ba81cc18...` loopt achter op de geïnspecteerde `main` `f2483186...`. Start geen Fieldflow-implementatie vanaf een stale basis.

Veilige volgorde:

1. fetch remote refs;
2. maak een syncbranch vanaf actuele `codex/fieldgrid-uiux-master`;
3. integreer actuele `main`;
4. los conflicten op en voer volledige bestaande gates uit;
5. PR syncbranch → `codex/fieldgrid-uiux-master`;
6. laat CI/review afronden;
7. maak Fieldflow-workbranches pas vanaf de nieuwe exacte UIUX-master-HEAD.

Promotieketen:

```text
feature → codex/fieldgrid-uiux-master → main → staging
```

Nooit rechtstreeks committen op `main` of `staging`.

## 2. Implementatievorm

Fieldflow is één complete ervaring boven dezelfde serverdata:

```text
Server Component
├─ auth + host + tenant
├─ permissions + modules
├─ bestaande loaders
├─ experience resolver
├─ legacy view
└─ Fieldflow Calm view
     └─ dezelfde Server Actions/domain helpers
```

Niet:

- twee sets businesslogica;
- actionfork per design;
- clientquery om experience te kiezen;
- pagina-voor-paginavlag die een half legacy/half Calm-product toont;
- DB-kolom alleen voor designselectie.

## 3. Ervaringsselector

Aanbevolen serverconfig:

```dotenv
FIELDGRID_TENANT_BACKOFFICE_EXPERIENCE=legacy
FIELDGRID_FIELDFLOW_CALM_TENANT_ALLOWLIST=
```

Waarden:

- `legacy`;
- `fieldflow-calm`.

Resolver:

`artifacts/backoffice/src/lib/ui/tenant-backoffice-experience.ts`

Regels:

- tenant eerst betrouwbaar resolven;
- onbekende/malformed waarde → legacy;
- allowlist parse strikt, geen wildcard tenzij expliciet contract;
- alleen server-side;
- geen PII in logs;
- één keuze voor hele tenantrequest;
- legacy default tot W12/W13 klaar;
- allowlist pas na complete routepariteit;
- rollback door config + backoffice restart.

## 4. Werkpakketgrafiek

```text
W00 → W01 → W02 → W03 → W04
                         ├─ W05
                         ├─ W06
                         ├─ W07
                         ├─ W08
                         ├─ W09
                         └─ W10
                              ↓
                       W11 → W12 → W13 → W14
```

Alleen W01–W04 wijzigen normaal globale tokens, shell en shared composities. Een paginapakket meldt shared wijzigingen terug aan de integratie-eigenaar.

## 5. Werkpakketten

### W00 — Baseline, governance en functionele P0’s

Doel:

- branchsync;
- actuele route/action/permission/moduleinventaris;
- brontrace vanaf ieder exact page-exportsymbool naar de concrete UI-action owner en, voor mutaties, het exacte aangeroepen `async` Server Action-target op de vastgezette platformblob;
- legacy screenshots en testbaseline;
- trusted-base `.github/workflows/fieldflow-calm-visual-baseline.yml` met alleen `pull_request`, job `normalized-baseline`, read-only bronrechten en GitHub-API-reviewverificatie; de workflow wordt eerst afzonderlijk gereviewd en gemerged en mag zichzelf niet als bewijs vertrouwen;
- Fieldflowmanifestvalidator;
- beschermde contract-rootbootstrap: merge eerst het goedgekeurde pakket, registreer daarna `contract-root.json#rootSha256` als Environment-variable en maak de base-eigen `Fieldflow Calm contract root`-check verplicht; de implementerende PR kan deze waarde of workflow niet zelf vertrouwen/roteren;
- P0-veiligheidsbesluiten.

Verplicht in W00 brongetrouw beslissen en als expliciete dependency aan de
genoemde eigenaar overdragen; alleen echte W00-eigenaars worden hier al
gesloten:

- rollenbeheer gebruikt hetzelfde tenant-RBAC-model als runtime;
- granular delete/archive/manageguards zijn uitgelijnd;
- SettingsTabs/WebsiteTabs volgen routepermissions: contract en bronafwijking
  worden in W00 vastgezet, `R-005`, `R-006`, `FFC-SHELL-004` en
  `FFC-SHELL-005` hebben uitsluitend W03 als implementatie- en sluiteigenaar;
- planningbesluiten uit hoofdstuk 04 zijn geaccepteerd;
- actuele deploymentpolicies voor organization settings, tenant domains en brandingstorage zijn geverifieerd.

Schema:

- geen schemawijziging voor UI-versie;
- W01 heeft een afzonderlijke forward migration voor `logo_mode`,
  `favicon_mode`, `splash_mode`, monotone `theme_revision` en de
  document-appearance-snapshots uit `theme-derivation.json`; zij krijgt
  lege-DB-, upgrade-, rollback-, backfill- en tenantisolatietests;
- een bevestigde security-/datareconciliatiefout mag alleen via aparte forward migration met rollbackbewijs worden opgelost.

Exit:

- actuele basis;
- alle manifestchecks groen;
- de externe contract-rootregistratie en verplichte `pull_request_target`-statuscheck zijn actief voordat een lifecycleclaim boven `CONTRACTED`/`OPEN` wordt gemaakt;
- negatieve bronvervalsingstests bewijzen dat een ongebruikt symbool uit een bereikbare module, een verwisselde action owner, worktreedrift, een late `"use server"`-directive en een synchrone Server Action-export fail-closed zijn;
- geen `OPEN` risico met `ownerWorkPackage: W00`, plus geen `OPEN` dependency-risico dat W01 aantoonbaar blokkeert; P0/P1-risico's van latere eigenaarspakketten blijven zichtbaar en blokkeren pas hun eigen exit;
- legacybaseline vast;
- `evidence/visual/capture-contract.json` staat op `BASELINE_READY`, met gepinde runtime-image/font hashes en exact achttien volledig gereviewde scenario-evidencerecords: negen genormaliseerde desktop-pixelrecords en negen mobiele semantische productierecords voor dashboard, lijst, dossier, planbord, settings, formulier, wizard en Sheet;
- elk scenariorecord komt uit de vastgezette GitHub Actions-workflow, bindt contractroot, prototypecommit, run, PR, HEAD, driver en alle artefacthashes, en heeft twee live via de GitHub API opgeloste `APPROVED` reviews: één `product-design` en één `visual-a11y`, nooit de auteur en nooit dezelfde persoon;
- de handoffvalidator heeft per desktoprecord alle vijf JSON-artefacten en per mobiel record alle acht JSON-artefacten inhoudelijk geparseerd en accepteert geen setupafwijking, runtimefout, ontbrekende selector/regio, desktopgeometrydelta boven 1 px, target onder 44×44 px, onvoldoende mobiele spacing, horizontale overflow, Axe-fout, onjuist theme/font/portalbewijs, capture-CSS in productie, dragafhankelijkheid, zichtbare labchrome of een screenshotwissel zonder nieuwe capturebinding en reviews.

### W01 — Theme, white-label en tenantisolatie

Belangrijkste paden:

- `lib/db/src/tenant-branding.ts`;
- `lib/db/src/brand-color-contrast.ts`;
- dashboard/auth/portal rootlayouts;
- metadata/manifests;
- `BrandThemeForm`;
- personeels-PWA Capacitor StatusBar/safe-area runtimeadapter;
- e-mail/PDF brandingpaden.

Werk:

- effective appearance contract;
- brand versus semantic tokens;
- SSR root/portal scope;
- fonts/radius/density;
- dynamic metadata/favicon;
- assets, contrast, preview;
- merklekken;
- A→B tenant switch;
- host+tenant+themeRevision cache-isolatie, cold-start en corrupte/stale/hash-mismatch fallback;
- tri-state assetmodes en immutable document-appearance-snapshotmigration,
  inclusief deterministische legacybackfill en rollbackbewijs;
- atomaire Capacitor StatusBar-background, iconstyle en safe-area-overgang;
- Capacitor-pluginmocktests plus Android-emulatorbewijs voor light, dark en afgewezen low-contrast input;
- securityhardening uit risicoregister.

Exit:

- alle brandingfixtures en overlays;
- geen cross-tenant/stale theme;
- native runtime tuple uit pluginmock en emulator komt exact overeen en valt bij ieder integriteitsprobleem atomair terug op het gehashte veilige platformthema;
- W01 migration slaagt op lege DB, productie-upgradefixture, rollback/herstel en
  tenant A/B-isolatie; iedere uitgegeven PDF-route leest dezelfde immutable
  appearance-snapshot;
- geen ongewenste Fieldgridstring in whitelabel;
- geen `OPEN` risico met `ownerWorkPackage: W01`, plus geen `OPEN` dependency-risico dat W02 of een parallel startend pakket aantoonbaar blokkeert; de globale eis dat alle 50 risico's `CLOSED` zijn geldt uitsluitend bij W14/promotie.

### W02 — Fieldflow tokens en primitives

Werk:

- `fieldflow-tokens.json` naar code/CSS;
- class `.tenant-admin-compact` buiten Fieldflow;
- Button/Input/Select/Combobox/Badge/Form;
- Dialog/Sheet/AlertDialog/Dropdown/Popover/Tooltip/Tabs;
- skeleton/empty/error/forbidden;
- motion/focus/z-index;
- component Story/Test harness.

Exit:

- token snapshot;
- componentstates in default + adversarial themes;
- Radix portal computed styles;
- 44px.

### W03 — Shell, IA en navigation

Werk:

- experience resolver;
- sidebar/header/mobile nav;
- route registry uitbreiden voor subroutes/breadcrumbs;
- command palette/search;
- tenant switcher;
- notifications/profile/support/release;
- Settings/Website tab permissionfilter;
- `100dvh`, safe area en skiplink.

Exit:

- alle 79 routes vanuit een geldige context bereikbaar;
- geen orphan/forbidden zichtbaarheid;
- `R-005` en `R-006` zijn `CLOSED`; `FFC-SHELL-004` en `FFC-SHELL-005` hebben
  minimaal `VERIFIED_LOCAL`-bewijs op exact de W03-HEAD;
- mobile/desktop shell parity;
- legacy ongewijzigd bij flag uit.

### W04 — Shared pagecomposities

Werk:

- TenantPageShell/Header;
- CommandBar/FilterDrawer/ActiveFilters;
- FieldgridDataView desktop/mobile;
- SummaryStrip/BulkBar/ActionMenu;
- Dossier hero/status/nav/layout/action rail;
- FormSection/Actions/UnsavedGuard;
- permission capability model;
- states/skeletons.

Exit:

- pattern harness voor dashboard/list/dossier/form;
- geen derde componentlaag;
- default + theme + viewportbewijs.

### W05 — Kernoperatie, relaties en mensen

Routes:

- dashboard;
- assignments list/detail;
- customers list/detail;
- objects list/detail;
- personnel list/detail;
- leave/availability.

Werk:

- Calm dashboard;
- DataViews;
- dossiers;
- alle tabs/actions;
- specifieke permissions;
- side effects en deeplinks;
- false-empty errorafhandeling.

Exit:

- routes.json-parity voor deze routes;
- browserjourneys voor CRUD, bulk, portalinvite, status en related tabs.

### W06 — Planbord

Volg hoofdstuk 04.

Werk:

- één viewrouter;
- shared placement engine;
- Fieldflow board;
- echte week;
- day/month/map unificatie;
- queue↔board;
- mobile wizard;
- versioned optimistic mutations;
- realtime;
- volledige undo;
- actual/planned/Amsterdam;
- geen verborgen rebalancing.

Exit:

- alle kritieke scenario’s pointer/keyboard/touch;
- twee planners;
- teamopdracht;
- DST/midnight;
- production-scale performance.

### W07 — Middelen, kwaliteit en documenten

Routes:

- materials en dashboard/detail/personnel link;
- inventory en dashboard/detail/QR/issues/assignment link;
- checklists;
- documents.

Werk:

- raw tables naar DataView/cards;
- action-specifieke permissions;
- stock/transfer/issue/return;
- asset/QR/maintenance/issues;
- checklist versions/review/publish;
- document entitypicker/upload/download/delete.

Exit:

- alle actions en mobile flows;
- inventory/materials invarianten;
- file security.

### W08 — Finance en bewijs

Routes:

- quotes;
- reports;
- invoices.

Werk:

- lijst/dossierworkflow;
- send/approve/reject/finalize/payment/credit;
- collective wizard;
- PDF/export;
- signatures/snapshots;
- permission/status locks.

Exit:

- finance domain tests;
- juridisch snapshotgedrag;
- theme/white-label PDF bewijs.

### W09 — Communicatie, website en productondersteuning

Routes:

- tickets;
- news;
- alle website subroutes;
- help/beheer/feedback;
- roadmap;
- releases.

Werk:

- inbox/workbench;
- editors;
- audience/publish;
- responsive website studio;
- revision-safe publication;
- KB/search/feedback;
- support/product flows.

Exit:

- alle subpermissions;
- no inert tabs/actions;
- preview/publish concurrency;
- mobile editor flows.

### W10 — Settings, auth, first-run en profiel

Routes:

- settings/index en alle subroutes;
- login/profile setup/forgot/reset;
- first-run;
- profile.

Werk:

- complete permission-aware settings index;
- forms en editors;
- tenant-role model;
- users/invites;
- organization/mail/invoice/notifications/planning/taxonomy/audit;
- hostbranding op alle authflows;
- herstelbare onboarding.

Exit:

- settings route/action matrix;
- role change beïnvloedt runtime permission;
- auth/first-run default en whitelabel;
- geen platformroute uit tenantwizard.

### W11 — Integratie en legacypariteit

Werk:

- alle workpackages samen;
- query/deeplink/localStoragecompatibiliteit;
- API/PDF/payment URLs;
- cross-page navigation;
- realtime;
- loading/error boundaries;
- legacy flag-off regressie.

Exit:

- routes manifest 100%;
- action parity 100%;
- geen verborgen/dode functie;
- geen runtime errors.

### W12 — Strikte runtime/visual/a11y/security gate

Werk:

- Playwright fixtures;
- alle viewports;
- theme-/role-/statepairs;
- Axe, keyboard, touch, pointer;
- visual baselines;
- two-tenant/two-session;
- 200% zoom/reduced motion/forced colors;
- strict evidence validator.

Exit:

- geen `manual` of `NOT_RUN`;
- zero missing evidence;
- geen `OPEN` P0/P1-risico met `ownerWorkPackage: W12` en geen `OPEN` dependency-risico dat W13 aantoonbaar blokkeert; risico's met een latere eigenaar blijven zichtbaar en de globale eis dat alle 50 `CLOSED` zijn geldt bij W14/promotie.

### W13 — Onafhankelijke review en mainpromotie

Werk:

- self-review;
- functioneel/security agent;
- visual/a11y agent;
- product/design sign-off;
- exact-head PR;
- release notes/rollback SHA.

Exit:

- beide reviewers akkoord;
- CI groen;
- traceability `VERIFIED_LOCAL`;
- merge volgens beleid.

### W14 — Stagingpilot, release en cleanupbesluit

Werk:

- deploy flag legacy;
- legacy smoke;
- vaste Fieldflow testtenant;
- tweede Enterprise-whitelabeltenant;
- volledige matrix;
- allowlistpilot;
- observatie;
- globale flip;
- rollback drill;
- traceability `VERIFIED_STAGING`/`RELEASED`.

Legacyverwijdering is een latere, afzonderlijke cleanup-PR.

## 6. PR-opdeling

Branch:

`codex/fieldflow-calm-wNN-korte-scope`

Iedere PR:

- één werkpakket of aantoonbaar zelfstandig deel;
- target UIUX-master;
- exacte base/head;
- route-/acceptance-ID’s;
- geen unrelated wijzigingen;
- geen TODO/FIXME;
- tests + evidence;
- migratie-impact;
- rollback;
- onafhankelijke P0/P1-review.

## 7. Technische regels

- Node 24, pnpm 11.5.2;
- `pnpm install --frozen-lockfile`;
- Radix/shadcn-first;
- product UI via `@/components/ui`;
- geen nieuwe productieafhankelijkheid zonder expliciete ADR;
- servercomponenten blijven data/permissionautoriteit;
- Server Actions hercontroleren tenant/permission;
- geen secrets/forbidden records in clientpayload;
- dezelfde loaders/actions voor legacy en Fieldflow;
- existing domain/time/staffing helpers hergebruiken;
- geen brede search/replace van hexkleuren;
- elke hardcoded kleur classificeren als brand/surface/text/border/status/planning/dataviz;
- geen destructive shell/git/db action zonder exacte scope en rollback.

## 8. Starttests per PR

```bash
pnpm fieldgrid:fieldflow-calm-handoff:check
pnpm --filter @workspace/backoffice run typecheck
pnpm --filter @workspace/backoffice run build
pnpm fieldgrid:uiux-design-system:check
pnpm fieldgrid:uiux-responsive-forms:check
pnpm fieldgrid:uiux-browser-dialogs:check
pnpm fieldgrid:uiux-master-gate:check
```

Voeg domeingates toe volgens scope.

## 9. Stopvoorwaarden

Stop en los eerst op wanneer:

- integrationbase niet actueel is;
- route/action/permission uit manifest onduidelijk is;
- businesslogic moet worden geforkt;
- een visual change data-/securitysemantiek wijzigt;
- een P0/P1 ontstaat;
- schema/data/securitymigration onverwacht nodig is;
- test alleen `manual` bewijs levert;
- baseline moet worden bijgewerkt zonder designreview;
- stagingtenant/credentials/fixtures ontbreken voor required proof;
- een permission alleen client-side kan worden afgedwongen;
- tenanttheme een bodyportal niet bereikt;
- mobile core action alleen drag/hover kent.

Rapporteer exact blocker, bewijs, veiligste opties en benodigde eigenaar; markeer niets ten onrechte als gereed.
