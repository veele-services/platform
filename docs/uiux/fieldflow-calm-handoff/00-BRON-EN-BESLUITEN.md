# 00 — Bron, scope en onomkeerbare ontwerpbesluiten

## Vastgezette bron

| Onderdeel                      | Waarde                                                      |
| ------------------------------ | ----------------------------------------------------------- |
| Zelfstandige prototypebron     | `evidence/prototype/*.tar.gz` + `source-manifest.json`      |
| Lokale bouwkopie               | `/workspace/sites/fieldgrid-backoffice-lab`                 |
| Prototypecommit                | `098d3ce41da66851675fe467eb9747ebff5bd4ae`                  |
| Hoofdcomponent                 | `app/fieldgrid-design-lab.tsx`                              |
| Hoofdstylesheet                | `app/globals.css`                                           |
| Variant                        | `fieldflow` / Fieldflow Calm                                |
| Live hulpmiddel                | https://fieldgrid-backoffice-lab.famgoldenbelt.chatgpt.site |
| Platformbasis bij pakketopbouw | `ba81cc18aaf8aa2d93d292c0def49d5c997307dc`                  |

De lokale referentiebeelden staan in `evidence/visual`. Hun afmetingen en SHA-256 staan in `evidence/visual/manifest.json`. Een gewijzigde hash blokkeert de overdrachtscheck. De volledige buildbare prototypesource staat als 258.513-byte git-archive in `evidence/prototype`; de validator controleert archivehash, formaat, omvang, commit/tree-identiteit en canonieke bronpaden. De externe prototypeworkspace en remote zijn dus geen beschikbaarheidsvoorwaarde.

De productie-inventaris is afzonderlijk gebonden aan de platformbasis. De validator verzamelt exact alle bronnen uit globale capabilities/acties, routerecords, routecapabilities/-acties en beide sourceCoverage-classificaties. De 231 unieke paden moeten als blob bestaan op `ba81cc18aaf8aa2d93d292c0def49d5c997307dc`; gesorteerde regels `pad:gitBlobSha` zonder afsluitende newline leveren SHA-256 `1776750679e7cc921359ba67797e5c64fa7226137c52f0b4a132529870900090`. Daarnaast is de volledige geparseerde `production-inventory.json` semantisch gehasht als `65332d30e50f3359303f50fdff5aa26d72f2555aad645508afabc55077bf4c90`, zodat ook label-, gate-, voorwaarde-, effect- of bronkoppelingsdrift met gelijkblijvende aantallen faalt. `*.source-precondition` is daarbij uitsluitend een actiegebonden menselijke index; het volledige bronpredicaat blijft exact het gekoppelde `path#symbol` op die blob. De validator leest productie-AST daarom uitsluitend met `git show` uit die vastgezette commit, nooit uit de actuele worktree. Vanaf het exacte page-exportsymbool volgt de statische graaf alleen daadwerkelijk gebruikte imports en lokale declaratieclosures. Een geïmporteerde module maakt dus niet al haar exports bereikbaar. Een UI-actie vereist bovendien een concrete handler-, navigatie- of state-witness van de gekoppelde action owner; een mutatie vereist het exacte Server Action-call- of `formAction`-target (of een expliciete server-render lifecyclecall). Een Server Action telt alleen als top-level geëxporteerde `async` callable in een echte directive-proloog met `"use server"`; een directive na imports of uitvoerbare statements is ongeldig. W00 regenereert en reviewt beide digests bewust na de verplichte basissynchronisatie; een automatische digestupdate geldt nooit als review.

De afzonderlijke digests staan niet op zichzelf. `manifests/contract-root.json` legt één digestvector vast over alle normatieve JSON-contracten, de lifecycle-onafhankelijke acceptance-/risicocontracten, de capturecontractroot, alle raw anchors, prototypearchive, normatieve Markdown, themereferentie, validator, hoofdtests, packagecommand, de Playwright-journeyhelper en de drie workflows voor contract-root, evidence en visuele baseline. Ook de volledige installatieclosure is onderdeel van die vector: alle getrackte `package.json`-bestanden, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, alle `.npmrc`-bestanden, aanwezige pnpmfile-/installhooks en `patches/**`, inclusief de expliciete afwezigheid van optionele root-hooks. Een wijziging aan dependencies, workspaces, registry-/scriptconfiguratie, patches of tooling kan de verifier dus niet stil vervangen.

Na merge registreert uitsluitend een repositorybeheerder `rootSha256` als `FIELDFLOW_CALM_TRUSTED_ROOT_SHA256` in de beschermde Environment `fieldflow-calm-contract` en maakt uitsluitend de stabiele eindjob `Fieldflow Calm contract root` verplicht. Die Environment laat alleen `main` toe. De drie `pull_request_target`-workflows draaien op pull requests naar exact `codex/fieldgrid-uiux-master`, maar GitHub laadt hun workflowdefinitie en eventref uit default branch `main`; daarom moeten `github.ref == refs/heads/main`, `github.workflow_ref == veele-services/platform/<workflow>@refs/heads/main` en de exacte `github.workflow_sha` kloppen. Iedere workflow checkt die main-executor, de protected base en de kandidaat afzonderlijk uit en vereist één byte-identieke workflowblob op alle drie. `pull_request_review` is verboden omdat dat event de kandidaat-beïnvloede merge-ref kan uitvoeren. Alle gebruikte Actions zijn op een volledige commit-SHA vastgezet. Alleen vertrouwde, vooraf aan base gebonden dependency-inputs mogen vóór `pnpm install --frozen-lockfile --ignore-scripts` worden gebruikt. Read-only API-stappen krijgen uitsluitend de noodzakelijke `actions`, `attestations`, `checks`, `contents` en `pull-requests` scopes. Een afzonderlijke `always()`-eindjob wordt alleen groen als de beschermde verificatiejob werkelijk `success` is; skipped, cancelled, ontbrekende Environmenttoegang en iedere andere uitkomst falen gesloten.

De kandidaat kan uit een aanvallergestuurde fork komen en is daarom uitsluitend inert Git-data. Geen kandidaatbestand wordt uitgevoerd, geïmporteerd, `source`d of als workflow-, package-, lifecycle-, configuratie- of buildscript geladen. Vóór inhoudelijke validatie worden checkoutroot, exacte HEAD, schone status en de volledige Git-tree gecontroleerd. Alleen modes `100644 blob` en `100755 blob` zijn toegestaan; symlinks (`120000`), submodules (`160000`) en iedere andere niet-reguliere entry zijn rood. De trusted-basevalidator leest en hasht kandidaatinhoud op de opgegeven kandidaat-SHA als exacte Git-blobs en volgt nooit filesystemsymlinks of een pad buiten die objectgrens. Ook archiefinspectie mag alleen data lezen en nooit kandidaatcode activeren.

Lifecyclevelden vallen bewust buiten de inhoudsroot, maar zijn niet vrij wijzigbaar. De validator vergelijkt vertrouwde base met kandidaat en staat per record alleen gelijkblijven of exact één voorwaartse stap toe: acceptance `CONTRACTED → IMPLEMENTED → VERIFIED_LOCAL → VERIFIED_STAGING → RELEASED`, risico `OPEN → MITIGATED → VERIFIED_LOCAL → VERIFIED_STAGING → CLOSED` en capture `CONTRACTED → REFERENCE_READY → BASELINE_READY`. Overslaan, terugzetten, een onbekende state, bewijs verwijderen bij een gevorderde state of state/runtime/font/scenario-evidence vervangen bij gelijkblijvende state faalt.

Bewijspromotie gebruikt twee commits en veroorzaakt daardoor geen onmogelijke commit-self-reference. Fase 1 levert en test de implementatie of capture op historische HEAD **C**; trusted CI, artefactattestaties, reviews en eventuele deployment binden exact **C** en de oorspronkelijke PR. Evidenceproductie zelf heeft drie wegwerpzones. Job A is een non-OIDC producer en is na de eerste kandidaatcommand volledig onbetrouwbaar: ook zijn raw artifact, receipt, nonce, `PATH` en file-commanduitvoer bewijzen niets. Job B start op een schone runner zonder OIDC, leidt PR-, event-, run-, attempt-, HEAD-, job- en artifactbinding zelfstandig af, accepteert alleen de exacte verwachte closure van reguliere bestanden zonder symlinks of hardlinks en voert uitsluitend byte-identieke base-owned validatorcode en dependencies uit. Job B maakt een eigen run-/attempt-uniek validated artifact. Alleen job C krijgt OIDC en attesteert uitsluitend dat gevalideerde pakket; de signerbundle wordt daar uit `RUNNER_TEMP` gekopieerd, gehasht en offline geverifieerd. Het finale artifact bevat de volledige promotion-ready closure. Alle transportnamen binden exact `runAttempt`, zodat een rerun nooit een immutable artifactnaam uit een eerdere poging hergebruikt. Fase 2 is een latere promotion-PR met kandidaat-HEAD **D** die die bewijsclosure inclusief HEAD-unieke bundle en lifecycleclaim toevoegt en daarin **C** als historisch bewijssubject vastlegt. Remote artifactbeschikbaarheid of retention is geen trustvoorwaarde nadat de bundle is ingecheckt. **C** moet ancestor van **D** zijn, maar **D** mag nooit als vervanging voor de geteste implementation/capture HEAD worden opgegeven. De beschermde baseworkflow valideert in **D** alle historische GitHub-provenance live, de lokale bundle en precies één toegestane stateovergang. Dit proces geldt afzonderlijk voor `CONTRACTED → REFERENCE_READY` en voor `REFERENCE_READY → BASELINE_READY`; beide capturestappen samenvoegen is een verboden skip. Zolang de initiële rootbootstrap niet is voltooid, mag geen acceptance-, risico- of capturestatus boven de initiële state komen. Een rootwijziging is altijd een afzonderlijke contract-PR en vereist drie verschillende beoordelingsdisciplines; code in die PR mag de externe root niet zelf roteren.

Een v2-rootrotatie wordt pas opnieuw gecontroleerd nadat de drie exacte HEAD-reviews bestaan. De auteur of een live write/maintain/admin collaborator voegt daarna via een echte body-edit exact één `FIELDFLOW-ROOT-RECHECK`-regel toe. Het `pull_request_target: edited`-event moet bewijzen dat `changes.body.from` nog nul exacte markers bevatte, de actuele live body er precies één bevat, de eventtimestamp gelijk is aan `pull_request.updated_at` en later is dan alle drie reviews. Een al aanwezige marker, title-only edit of onbevoegde sender faalt gesloten. De eenmalige bootstrap kopieert contract-root-, evidence- én visual-baselineworkflow byte-identiek naar `main` en bevestigt vóór activering dat de Environment main-only blijft.

### Normalisatie van de labreferenties

De vastgezette PNG's zijn auditbeelden van het complete prototype en bevatten daarom ook herkenbare labchrome. Die chrome is nadrukkelijk geen productieontwerp. Voor de pixelbaseline rendert W00 dezelfde prototypecommit opnieuw met een vast normalisatieprofiel:

- verwijder de prototype-only `.lab-bar` vóór capture (64 px desktop, 52 px op `<=860`) en laat `.fg-app` het volledige viewport vullen;
- verwijder `.concept-caption`, de ontwerpnummering en uitleg over de gekozen conceptrichting;
- verwijder alleen de knop `Herstel demo`; undo, feedbacktoasts en echte planbordstates blijven juist onderdeel van het contract;
- injecteer daarna uitsluitend tijdens prototypecapture de gehashte defaultfixture via `evidence/visual/canonical-theme.css` met SHA-256 `0888d74c18068753d8ecced2caf2af3b8e97b97d615bed1eb27f2af2e5f8c2d4`, semantic-outputhash `5ef0276d8b38db6a1d7e47404f8b37562ad06e410d54f345f0819c43a6493b84` en resolutionhash `9254176dabd3bdbcca404f3927cd69339713c40ed2e31de4e2476ee5f6dab729`; deze capture-only bridge bewaart de afzonderlijke authored waarden voor `foreground/text`, `mutedSurface/secondarySoft` en `line/borderSubtle` en veroorzaakt zelf geen visuele delta;
- injecteer uitsluitend tijdens deze prototypecapture `evidence/visual/reference-normalization.css` met SHA-256 `1c2b732877b821616826dcb5a2720a5a0e318cdcbfc30912c0d6db3e6a7feb9d`; de scope `body[data-concept="fieldflow"]` omvat ook body-level Radix-portals;
- sta daarin exact drie soorten toegankelijkheidsnormalisatie toe: `wcag-color-pair-correction`, `minimum-interactive-target-44px` en `minimum-legible-component-type`; productie moet deze correcte waarden rechtstreeks implementeren en mag het normalisatieblad nooit laden;
- gebruik Playwright 1.55.1, Chromium revision 1193 / versie 140.0.7339.186, de vastgezette klok `2026-09-02T09:42:00+02:00`, locale `nl-NL`, tijdzone `Europe/Amsterdam` en de exacte fixture-/scrollstate uit `capture-contract.json`;
- leg de genormaliseerde PNG plus de vijf getypeerde JSON-artefacten voor DOM, geometry, computed styles, setupstappen en runtimefouten samen vast; alleen pad en SHA-256 zijn uitdrukkelijk onvoldoende.

Dit is preprocessing van aantoonbaar prototype-only UI en drie begrensde toegankelijkheidscorrecties, geen vrij beeldmasker. `reference-normalization.css` is na de canonieke themefixture de enige laag die een raw-prototypekleur, target of componenttypegrootte mag corrigeren. Productie mag geen prototype-only elementen of één van beide capture-only stylesheets renderen. De capture gebruikt exact de vastgezette `light`-kleurmodus, netwerkpolicy, `.fg-app` op `100vw × 100vh`, hide-selectors en alleen de controlenaam `Herstel demo`; alle andere waarden falen gesloten. Scenario-opbouw voert uitsluitend de getypeerde `assert/navigate/click/focus/press/waitFor`-opcodes en locatorobjecten uit, nooit vrije stappen. De onveranderde beelden in dit pakket blijven uitsluitend menselijke auditankers en worden nooit als pixelbaseline gebruikt.

In `CONTRACTED` zijn `runtimeImageDigest.value`, `fonts.resolvedFiles` en `scenarioEvidence` exact `null`; vooruitgevuld bewijs is ongeldig. W00 produceert eerst de runtime-image digest, alle fontfilehashes en exact negen volledig gehashte desktoprecords in de volgorde van `desktopCanonicalPixel.scenarioIds`. Een afzonderlijke tweefasenpromotie zet het contract daarna precies één stap op `REFERENCE_READY`. Elk desktoprecord draagt `authorId`, GitHub Actions-run/PR/head-provenance, de contractroot en één `product-design`- plus één `visual-a11y`-goedkeuring van verschillende GitHub-identiteiten; self-review, dubbele rollen of een review op een andere HEAD falen.

W12 mag later van `REFERENCE_READY` naar `BASELINE_READY` promoveren door exact negen mobiele productierecords in de volgorde van `mobileResponsiveContract.scenarioIds` achter de bestaande desktoprecords toe te voegen. De runtime-/fontpayload, de negen desktoprecords en hun volgorde blijven daarbij byte-identiek; wijzigen, verwijderen, vervangen of herschikken is geen promotie. De reviewerattestatie bindt bij desktop de PNG en vijf JSON-artefacten, en bij mobiel de productiescreenshot en acht JSON-artefacten. De validator parseert de inhoud: setupstappen, productieacties en sentinels zijn exact en geslaagd; alle foutkanalen zijn leeg; desktopselectors vallen binnen 1 px; mobiele regio's, spacing, overflow, Axe, toetsenbord en non-drag touch voldoen exact; alle geïnventariseerde interactieve doelen zijn minimaal 44×44 px; theme-, stylesheet-, font- en body-portalwaarden kloppen; capture-CSS en prototypechrome ontbreken in productie. Een lege `{}`, een willekeurige screenshot met dezelfde afmetingen of alleen twee namen kan dus nooit baselinebewijs zijn. Alleen deze aantoonbaar toegankelijke desktop- en mobiele outputs worden uitvoerbaar bewijs.

## Wat “exact” betekent

### Exact visueel bij de canonieke desktopfixture

Op een genormaliseerd applicatieviewport van 1440×1000, in de vastgezette Chromium-CI-omgeving, met de gehashte `fieldflow-calm-ci-v1`-fixture (expliciet niet `FIELDGRID_DEFAULT_BRAND_THEME`) en deterministische fixturedata:

- shellbreedte, page gutter, panelen, raster, typografie, controlhoogte, radius, border, shadow en spacing volgen exact de tokenmanifestatie;
- betekenisvolle component-bounding-boxes wijken maximaal 1 px af;
- font, iconen en assets zijn deterministisch geladen;
- Playwright `toHaveScreenshot` gebruikt voor de negen genormaliseerde desktopscenario's `threshold: 0.1`, `maxDiffPixelRatio: 0.001` en maximaal 1440 afwijkende pixels; de negen mobiele productiescenario's gebruiken geen prototypepixelvergelijking maar het afzonderlijke semantische responsive-bewijscontract;
- iedere betekenisvolle geometry-afwijking groter dan 1 px in absolute x-, y-, breedte- of hoogtewaarde faalt onafhankelijk van de pixelratio;
- geen van de huidige achttien scenario's gebruikt maskers: de klok en fixturedata zijn deterministisch. Alleen een toekomstig, expliciet gecontracteerd kaartscenario mag uitsluitend de echte third-party tilelaag maskeren;
- een masker mag nooit controls, formulieren, navigatie, containers, eigen kaartoverlays of teksthiërarchie bedekken.

### Exact responsief

Het mobiele ontwerp is geen verkleinde desktop. De referentie bepaalt componenttaal en taakhiërarchie; dit pakket bepaalt de responsive transformatie:

- desktop-first als primaire informatiearchitectuur, met volledige sidebarcompositie vanaf 1181 px;
- compacte desktop/tabletlandscape met sidebar op 861–1180 px;
- mobiele/tabletshell op 320–860 px, inclusief de verplichte 768 px portraitfixture;
- geen documentbrede horizontale overflow;
- mobiel eigen lijstkaarten, action sheets, formulierstapeling en non-drag planning;
- dezelfde functies, states en rechten op elk formaat.

### Exact functioneel

Productie is leidend voor echte gegevens, rechten en invarianten. Prototypegedrag is alleen functioneel bindend wanneer dit pakket het bevestigt. Niet overnemen:

- lokale mockstate;
- hardcoded 09:42 of september 2026;
- vaste demo-medewerkers, klanten of opdrachten;
- een statische “kaart”;
- touchdoelen onder 44 px;
- lokale undo zonder serverversies;
- hardcoded 08:00–19:00 wanneer tenantinstellingen een ander venster vereisen;
- conflictafhandeling die productiegegevens kan beschadigen.

## Hoofdbesluiten

| ID     | Besluit                                                                                                                                                                                                                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DEC-01 | Fieldflow Calm is de enige nieuwe productievariant.                                                                                                                                                                                                                                                                            |
| DEC-02 | De lab-switcher en vier afgewezen ontwerpen worden niet geporteerd.                                                                                                                                                                                                                                                            |
| DEC-03 | De bestaande loaders, Server Actions en domeinhelpers worden gedeeld met legacy; geen businesslogicafsplitsing.                                                                                                                                                                                                                |
| DEC-04 | Fieldflow krijgt één server-side ervaringsselector na tenantresolutie.                                                                                                                                                                                                                                                         |
| DEC-05 | Legacy blijft beschikbaar tot de volledige pilot en dient als configuratie-rollback.                                                                                                                                                                                                                                           |
| DEC-06 | Er komt geen schemawaarde voor UI-versieselectie en geen duplicatie van kleur/font/radius/density/e-mailvelden. W01 levert wel de noodzakelijke forward migration voor expliciete assetmodes, monotone `theme_revision` en immutable document-appearance-snapshots, met lege-DB-, upgrade-, rollback- en tenantisolatiebewijs. |
| DEC-07 | Tenantkleuren stylen merkinteractie; semantische status- en planbordkleuren blijven stabiel.                                                                                                                                                                                                                                   |
| DEC-08 | `.tenant-admin-compact` en brede class-name overrides zijn geen onderdeel van Fieldflow.                                                                                                                                                                                                                                       |
| DEC-09 | Radix-portals erven altijd het effectieve tenantthema.                                                                                                                                                                                                                                                                         |
| DEC-10 | Het planbord gebruikt één gedeelde plaatsingsengine en verandert bij een gewone drop exact één intentie.                                                                                                                                                                                                                       |
| DEC-11 | Automatische herschikking is alleen een expliciete, vooraf bekeken en volledig undoable actie.                                                                                                                                                                                                                                 |
| DEC-12 | Een mobiele non-drag planner is functioneel gelijkwaardig aan drag-and-drop.                                                                                                                                                                                                                                                   |
| DEC-13 | Alle 79 routes worden afgedekt; support-, website-, settings- en authsubroutes vallen niet buiten scope.                                                                                                                                                                                                                       |
| DEC-14 | Permissioncontrols zijn per actie, nooit één brede `canWrite` voor create/edit/archive/delete.                                                                                                                                                                                                                                 |
| DEC-15 | Volledige whitelabeling vervangt tenant-facing naam, logo, favicon, metadata, e-mail en PDF-identiteit waar entitlement dit toestaat.                                                                                                                                                                                          |

## Relatie tot bestaande documentatie

De implementerende agent leest daarnaast:

- `docs/uiux/fieldgrid-codex-cloud-masterplan.md`;
- `docs/uiux/design-decisions.md`;
- `docs/uiux/component-registry.md`;
- `docs/uiux/radix-shadcn-architecture.md`;
- `docs/research-tenant-backoffice-ui-cleanup.md`;
- `docs/theming-branding-system.md`;
- `docs/theming-branding-audit.md`;
- `docs/fieldgrid-branding-inventory.md`;
- `docs/fieldgrid-cross-tenant-testmatrix.md`;
- `docs/fieldgrid-backup-restore-rollback-playbook.md`;
- `.github/pull_request_template.md`.

Bestaande W01–W15-statussen of een `manual` visual-resultaat bewijzen geen Fieldflow-acceptatie. Fieldflow heeft een eigen traceability- en strikte runtimebewijslaag.

## Bewijsreferenties

| Patroon      | Desktop                         | Mobiel                               |
| ------------ | ------------------------------- | ------------------------------------ |
| Dashboard    | `01-dashboard-desktop-1440.png` | `02-dashboard-mobile-390.png`        |
| Planbord     | `03-planboard-desktop-1440.png` | `04-planboard-mobile-390.png`        |
| Lijst        | `05-list-desktop-1440.png`      | `06-list-mobile-390.png`             |
| Dossier      | `07-dossier-desktop-1440.png`   | `08-dossier-mobile-390.png`          |
| Instellingen | `09-settings-desktop-1440.png`  | responsive contract uit hoofdstuk 05 |

De live URL is handig om interacties te voelen, maar kan veranderen. Commit, bron en hashes zijn de waarheid.
